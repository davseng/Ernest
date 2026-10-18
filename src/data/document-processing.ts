import "server-only";
import postgres from "postgres";
let client: ReturnType<typeof postgres>|undefined;
function db(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");return client??=postgres(process.env.DATABASE_URL,{max:5});}
export async function setProcessingStatus(documentId:string,assetId:string,ownerId:string,stage:string,visualStatus:string,error:string|null=null){
 await db()`INSERT INTO document_processing_status(document_id,stage,visual_status,error)
 SELECT d.id,${stage},${visualStatus},${error?.replace(/\u0000/g,"").slice(0,500)??null} FROM documents d JOIN assets a ON a.id=d.asset_id
 WHERE d.id=${documentId} AND d.asset_id=${assetId} AND d.owner_id=${ownerId} AND a.owner_id=${ownerId}
 ON CONFLICT(document_id) DO UPDATE SET stage=EXCLUDED.stage,visual_status=EXCLUDED.visual_status,error=EXCLUDED.error,updated_at=now()`;
}
export async function getProcessingStatus(documentId:string,assetId:string,ownerId:string){
 const rows=await db()<Array<{stage:string;visual_status:string;semantic_status:string;error:string|null;indexed_pages:number;visual_pages:number}>>`
 SELECT s.stage,s.visual_status,s.semantic_status,s.error,
 (SELECT count(*)::int FROM document_pages p WHERE p.document_id=d.id) AS indexed_pages,
 (SELECT count(*)::int FROM document_visual_pages v WHERE v.document_id=d.id) AS visual_pages
 FROM documents d JOIN assets a ON a.id=d.asset_id LEFT JOIN document_processing_status s ON s.document_id=d.id
 WHERE d.id=${documentId} AND d.asset_id=${assetId} AND d.owner_id=${ownerId} AND a.owner_id=${ownerId}`;
 return rows[0];
}
export async function replaceVisualPages(documentId:string,assetId:string,ownerId:string,pages:Array<{pageNumber:number;text:string}>){
 return db().begin(async tx=>{
 const owned=await tx`SELECT d.id FROM documents d JOIN assets a ON a.id=d.asset_id WHERE d.id=${documentId} AND d.asset_id=${assetId} AND d.owner_id=${ownerId} AND a.owner_id=${ownerId} FOR UPDATE`;
 if(owned.length!==1)return false;
 for(const p of pages)await tx`INSERT INTO document_visual_pages(document_id,page_number,interpretation,model) VALUES(${documentId},${p.pageNumber},${p.text},${process.env.OPENAI_OCR_MODEL||"gpt-5.6-terra"}) ON CONFLICT(document_id,page_number) DO UPDATE SET interpretation=EXCLUDED.interpretation,model=EXCLUDED.model,created_at=now()`;
 return true;
 });
}

export async function setSemanticStatus(documentId:string,assetId:string,ownerId:string,status:string){
 await db()`UPDATE document_processing_status s SET semantic_status=${status},updated_at=now() FROM documents d JOIN assets a ON a.id=d.asset_id WHERE s.document_id=d.id AND d.id=${documentId} AND d.asset_id=${assetId} AND d.owner_id=${ownerId} AND a.owner_id=${ownerId}`;
}

export async function visualCoverage(documentId:string,assetId:string,ownerId:string,pageNumbers:number[]){
 const rows=await db()<Array<{count:number}>>`SELECT count(v.page_number)::int AS count FROM documents d JOIN assets a ON a.id=d.asset_id JOIN document_visual_pages v ON v.document_id=d.id WHERE d.id=${documentId} AND d.asset_id=${assetId} AND d.owner_id=${ownerId} AND a.owner_id=${ownerId} AND v.page_number=ANY(${pageNumbers}::int[])`;
 return rows[0]?.count??0;
}
