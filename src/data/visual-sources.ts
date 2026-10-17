import "server-only";
import { getDocumentForAsset } from "@/data/documents";
import { readDocument } from "@/data/document-storage";
import type { ErnestContextPage } from "@/data/document-context";
export type VisualSourceFile={filename:string;fileData:string;pages:number[]};
export async function getVisualSourceFiles(assetId:string,ownerId:string,question:string,context:ErnestContextPage[]){
 const files:VisualSourceFile[]=[],warnings:string[]=[];
 if(!/interpret|detail|exact wording|source page|diagram|schematic|circuit|stowage|compartment|where|location|connected|wiring|left|right|above|below|image|photo/i.test(question))return{files,warnings};
 const detailed=/interpret|detail|exact wording|read.*original|source page/i.test(question);
 const ids=[...new Set(context.filter(p=>detailed||p.visual||/diagram|schematic|stowage|wiring|compartment/i.test(p.documentTitle+" "+p.text)).map(p=>p.documentId))].slice(0,2);
 for(const id of ids){
  const document=await getDocumentForAsset(id,assetId,ownerId);
  if(!document)continue;
  if(document.contentType!=="application/pdf"||document.sizeBytes>12*1024*1024){warnings.push(`Original ${document.title} was not attached (type or size limit). Do not claim visual verification.`);continue;}
  try{
   const bytes=await readDocument(document.storageKey);
   files.push({filename:document.originalFilename,fileData:`data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,pages:context.filter(p=>p.documentId===id).map(p=>p.pageNumber)});
  }catch{warnings.push(`Original ${document.title} could not be loaded. Retrieved text is available but spatial interpretations are unverified.`);}
 }
 return{files,warnings};
}
