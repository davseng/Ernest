import "server-only";

import OpenAI from "openai";
import postgres from "postgres";
import type { ExtractedDocumentPage } from "@/domain/documents";

let dbClient: ReturnType<typeof postgres> | undefined;
let aiClient: OpenAI | undefined;
function database(){const url=process.env.DATABASE_URL;if(!url)throw new Error("DATABASE_URL is required");dbClient??=postgres(url,{max:5});return dbClient;}
function openai(){const key=process.env.OPENAI_API_KEY;if(!key)throw new Error("OPENAI_API_KEY is required");aiClient??=new OpenAI({apiKey:key});return aiClient;}
function clean(v:unknown,max=1600){return typeof v==="string"&&v.trim()?v.trim().slice(0,max):null;}

export type DocumentFinding={id:string;pageNumber:number|null;findingType:string;statement:string;observedAt:string|null;status:"unknown"|"current"|"resolved"|"superseded";confidence:string|null};

export async function extractDocumentFindings(pages:ExtractedDocumentPage[],documentType?:string|null){
  const source=pages.slice(0,12).map(p=>`PAGE ${p.pageNumber}\\n${p.text.slice(0,6000)}`).join("\\n\\n---\\n\\n");
  if(!source.trim())return[];
  const response=await openai().responses.create({
    model:process.env.OPENAI_MODEL||"gpt-5.6-luna",reasoning:{effort:"low"},
    instructions:[
      "Extract durable asset-history findings from this document only.",
      "A finding is a useful historical observation such as work completed, inspection condition, installed/replaced equipment, damage, measurement, or explicitly stated recommendation.",
      "Do not turn estimates, proposals, quotes, planned work, generic manual instructions, or manufacturer specifications into claims that work occurred on this asset.",
      "A paid service invoice or receipt that states a repair/replacement scope, has a service date, and shows payment/labor is strong evidence the listed work was completed. Record that as maintenance_completed unless the document itself says the work was only proposed, incomplete, or cancelled.",
      "Do not add a generic caveat that an invoice cannot prove completion when the document contains those completion signals. Preserve any real ambiguity that is actually present.",
      "Use findingType from: maintenance_completed, inspection_observation, equipment_observation, damage_observation, recommendation, other.",
      "statement must preserve the source meaning and make uncertainty explicit.",
      "observedAt is YYYY-MM-DD only when a complete applicable date is explicit; otherwise null.",
      "status must always be unknown. A historical document alone cannot establish that a condition is currently true, resolved, or superseded.",
      "confidence is 0 to 1 based only on clarity of source evidence.",
      "Keep each finding tied to its supporting page.",
      "Return JSON only: {\"findings\":[{\"pageNumber\":1,\"findingType\":\"maintenance_completed\",\"statement\":\"...\",\"observedAt\":\"YYYY-MM-DD or null\",\"status\":\"unknown\",\"confidence\":0.95}]}."
    ].join(" "),
    input:`DOCUMENT TYPE: ${documentType||"unknown"}\\n\\nDOCUMENT TEXT:\\n${source}`
  });
  const raw=response.output_text.trim();const json=raw.startsWith("{")?raw:raw.slice(raw.indexOf("{"),raw.lastIndexOf("}")+1);const parsed=JSON.parse(json) as {findings?:unknown[]};
  if(!Array.isArray(parsed.findings))return[];
  return parsed.findings.flatMap(item=>{if(!item||typeof item!=="object")return[];const x=item as Record<string,unknown>;const pageNumber=Number(x.pageNumber);const statement=clean(x.statement);const findingType=clean(x.findingType,60);const date=clean(x.observedAt,10);const confidence=Number(x.confidence);if(!Number.isInteger(pageNumber)||pageNumber<1||!statement||!findingType)return[];return[{pageNumber,findingType,statement,observedAt:date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null,confidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):null}];});
}

export async function replaceDocumentFindings(documentId:string,assetId:string,ownerId:string,findings:Awaited<ReturnType<typeof extractDocumentFindings>>){
  const sql=database();await sql.begin(async tx=>{await tx`DELETE FROM document_findings WHERE document_id=${documentId} AND asset_id=${assetId} AND owner_id=${ownerId} AND status='unknown'`;for(const f of findings){await tx`INSERT INTO document_findings(asset_id,owner_id,document_id,page_number,finding_type,statement,observed_at,status,confidence) VALUES(${assetId},${ownerId},${documentId},${f.pageNumber},${f.findingType},${f.statement},${f.observedAt},'unknown',${f.confidence})`;}});}
export async function getDocumentFindings(documentId:string,assetId:string,ownerId:string){const rows=await database()<Array<{id:string;page_number:number|null;finding_type:string;statement:string;observed_at:string|null;status:DocumentFinding["status"];confidence:string|null}>>`SELECT id,page_number,finding_type,statement,observed_at::text,status,confidence::text FROM document_findings WHERE document_id=${documentId} AND asset_id=${assetId} AND owner_id=${ownerId} ORDER BY page_number,created_at`;return rows.map(r=>({id:r.id,pageNumber:r.page_number,findingType:r.finding_type,statement:r.statement,observedAt:r.observed_at,status:r.status,confidence:r.confidence}));}

export async function getAssetFindings(assetId:string,ownerId:string,limit=80){
  const rows=await database()<Array<{id:string;document_id:string;document_title:string;page_number:number|null;finding_type:string;statement:string;observed_at:string|null;status:DocumentFinding["status"];confidence:string|null}>>`
    SELECT f.id,f.document_id,d.title AS document_title,f.page_number,f.finding_type,f.statement,f.observed_at::text,f.status,f.confidence::text
    FROM document_findings f JOIN documents d ON d.id=f.document_id
    WHERE f.asset_id=${assetId} AND f.owner_id=${ownerId}
    ORDER BY f.observed_at DESC NULLS LAST,f.created_at DESC LIMIT ${limit}`;
  return rows.map(r=>({id:r.id,documentId:r.document_id,documentTitle:r.document_title,pageNumber:r.page_number,findingType:r.finding_type,statement:r.statement,observedAt:r.observed_at,status:r.status,confidence:r.confidence}));
}
