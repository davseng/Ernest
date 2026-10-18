import "server-only";
import OpenAI from "openai";
import postgres from "postgres";
import { cosineSimilarity } from "@/domain/semantic";
import type { ErnestContextPage } from "@/data/document-context";
let client:ReturnType<typeof postgres>|undefined;
function db(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");return client??=postgres(process.env.DATABASE_URL,{max:5});}
function enabled(){return process.env.ERNEST_SEMANTIC_RETRIEVAL_ENABLED==="true";}
function model(){return process.env.OPENAI_EMBEDDING_MODEL||"text-embedding-3-small";}
function ai(){if(!process.env.OPENAI_API_KEY)throw new Error("OPENAI_API_KEY is required for semantic retrieval");return new OpenAI({apiKey:process.env.OPENAI_API_KEY});}
export async function indexSemanticPages(documentId:string,assetId:string,ownerId:string,pages:Array<{pageNumber:number;text:string}>){
 if(!enabled())return "not_requested";
 const visuals=await db()<Array<{page_number:number;interpretation:string}>>`SELECT v.page_number,v.interpretation FROM document_visual_pages v JOIN documents d ON d.id=v.document_id JOIN assets a ON a.id=d.asset_id WHERE d.id=${documentId} AND d.asset_id=${assetId} AND d.owner_id=${ownerId} AND a.owner_id=${ownerId}`;
 const visualByPage=new Map(visuals.map(v=>[v.page_number,v.interpretation]));
 const selected=pages.map(p=>({...p,text:[p.text,visualByPage.get(p.pageNumber)??""].join("\n")})).filter(p=>p.text.trim());
 // Bounded batches keep provider limits and memory predictable. Index all pages; no silent first-page-only coverage.
 const vectors:Array<{pageNumber:number;embedding:number[]}>=[];
 for(let start=0;start<selected.length;start+=64){
  const batch=selected.slice(start,start+64);
  const response=await ai().embeddings.create({model:model(),input:batch.map(p=>p.text.slice(0,6000))});
  if(response.data.length!==batch.length)throw new Error("Embedding response omitted pages");
  for(const item of response.data){if(!batch[item.index]||!item.embedding.length||!item.embedding.every(Number.isFinite))throw new Error("Invalid page embedding");vectors.push({pageNumber:batch[item.index].pageNumber,embedding:item.embedding});}
 }
 await db().begin(async tx=>{
  const owned=await tx`SELECT d.id FROM documents d JOIN assets a ON a.id=d.asset_id WHERE d.id=${documentId} AND d.asset_id=${assetId} AND d.owner_id=${ownerId} AND a.owner_id=${ownerId} FOR UPDATE`;
  if(owned.length!==1)throw new Error("Document not found");
  await tx`DELETE FROM document_page_embeddings WHERE document_id=${documentId}`;
  for(const v of vectors)await tx`INSERT INTO document_page_embeddings(document_id,page_number,model,embedding) VALUES(${documentId},${v.pageNumber},${model()},${JSON.stringify(v.embedding)}::jsonb)`;
 });
 return "complete";
}
export async function getSemanticDocumentContext(assetId:string,ownerId:string,question:string):Promise<ErnestContextPage[]>{
 if(!enabled())return [];
 const rows=await db()<Array<{document_id:string;title:string;page_number:number;text_content:string;embedding:number[]}>>`
 SELECT e.document_id,d.title,e.page_number,p.text_content,e.embedding FROM document_page_embeddings e
 JOIN documents d ON d.id=e.document_id JOIN assets a ON a.id=d.asset_id
 JOIN document_pages p ON p.document_id=e.document_id AND p.page_number=e.page_number
 WHERE d.asset_id=${assetId} AND d.owner_id=${ownerId} AND a.owner_id=${ownerId} AND e.model=${model()}
 ORDER BY e.document_id,e.page_number LIMIT 2000`;
 if(!rows.length)return [];
 const response=await ai().embeddings.create({model:model(),input:question.slice(0,800)});
 const query=response.data[0]?.embedding;if(!query)throw new Error("Missing query embedding");
 return rows.map(r=>({documentId:r.document_id,documentTitle:r.title,pageNumber:r.page_number,text:r.text_content,relevance:cosineSimilarity(query,r.embedding)*4})).filter(p=>p.relevance>=1.2).sort((a,b)=>b.relevance-a.relevance).slice(0,8);
}
