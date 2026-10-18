import "server-only";
import postgres from "postgres";
import { getSemanticDocumentContext } from "@/data/semantic-retrieval";
import { expandedTerms, retrievalTerms, selectEvidence } from "@/domain/retrieval";
let client: ReturnType<typeof postgres> | undefined;
function database(){
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
  client??=postgres(process.env.DATABASE_URL,{max:5});return client;
}
export type ErnestContextPage = {
  documentId:string;documentTitle:string;pageNumber:number;text:string;relevance:number;
  visual?:boolean;
};
type ContextRow={document_id:string;document_title:string;page_number:number;text_content:string;relevance:number|string;visual:boolean};
export async function getErnestDocumentContext(assetId:string,ownerId:string,question:string):Promise<ErnestContextPage[]> {
  const normalized=question.trim().slice(0,800);if(!normalized)return [];
  const terms=retrievalTerms(normalized), expanded=expandedTerms(normalized);
  if(!expanded.length)return [];
  const retrievalQuery=expanded.map(t=>'"'+t.replace(/"/g,'')+'"').join(" OR ");
  const rows=await database()<ContextRow[]>`
    WITH query AS (SELECT websearch_to_tsquery('english',${retrievalQuery}) AS value),
    candidates AS (
      SELECT p.document_id,d.title AS document_title,p.page_number,
        p.text_content || COALESCE(E'\\nVISUAL INTERPRETATION (unverified): ' || v.interpretation,'') AS text_content,
        (v.document_id IS NOT NULL) AS visual,
        ts_rank(to_tsvector('english',p.text_content || ' ' || COALESCE(v.interpretation,'')),q.value)
        + 3*ts_rank(to_tsvector('simple',d.title || ' ' || d.original_filename),websearch_to_tsquery('simple',${retrievalQuery}))
        + (SELECT count(*)::float FROM unnest(${terms}::text[]) t WHERE
          CASE WHEN t ~ '[0-9]' THEN lower(p.text_content || ' ' || d.title || ' ' || COALESCE(v.interpretation,'')) ~ ('(^|[^a-z0-9_-])' || t || '([^a-z0-9_-]|$)') ELSE position(t in lower(p.text_content || ' ' || d.title || ' ' || COALESCE(v.interpretation,'')))>0 END) AS relevance
      FROM document_pages p
      INNER JOIN documents d ON d.id = p.document_id
      INNER JOIN assets a ON a.id = d.asset_id
      LEFT JOIN document_visual_pages v ON v.document_id=p.document_id AND v.page_number=p.page_number
      CROSS JOIN query q
      WHERE d.asset_id = ${assetId} AND d.owner_id = ${ownerId} AND a.owner_id = ${ownerId}
        AND (to_tsvector('english',p.text_content || ' ' || COALESCE(v.interpretation,'')) @@ q.value
          OR to_tsvector('simple',d.title || ' ' || d.original_filename) @@ websearch_to_tsquery('simple',${retrievalQuery})
          OR EXISTS (SELECT 1 FROM unnest(${terms}::text[]) t WHERE CASE WHEN t ~ '[0-9]' THEN lower(d.title || ' ' || d.original_filename || ' ' || p.text_content || ' ' || COALESCE(v.interpretation,'')) ~ ('(^|[^a-z0-9_-])' || t || '([^a-z0-9_-]|$)') ELSE position(t in lower(d.title || ' ' || d.original_filename || ' ' || p.text_content || ' ' || COALESCE(v.interpretation,'')))>0 END))
    ), ranked AS (
      SELECT *,ROW_NUMBER() OVER(PARTITION BY document_id ORDER BY relevance DESC,page_number) AS document_rank
      FROM candidates
    ) SELECT document_id,document_title,page_number,text_content,relevance,visual
      FROM ranked WHERE document_rank<=3 ORDER BY relevance DESC,page_number LIMIT 48`;
  let semantic:ErnestContextPage[]=[];
  try { semantic=await getSemanticDocumentContext(assetId,ownerId,normalized); } catch { console.warn("Semantic retrieval unavailable; using lexical evidence"); }
  const merged=new Map<string,ErnestContextPage>();
  for(const r of rows)merged.set(`${r.document_id}:${r.page_number}`,{documentId:r.document_id,documentTitle:r.document_title,pageNumber:r.page_number,text:r.text_content,relevance:Number(r.relevance),visual:r.visual});
  for(const page of semantic){const key=`${page.documentId}:${page.pageNumber}`,lexical=merged.get(key);merged.set(key,lexical?{...lexical,relevance:Math.max(lexical.relevance,page.relevance)}:page);}
  return selectEvidence(normalized,[...merged.values()]);
}
