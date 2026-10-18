import "server-only";
import { getDocumentForAsset, getDocumentsForAsset } from "@/data/documents";
import { readDocument } from "@/data/document-storage";
import type { ErnestContextPage } from "@/data/document-context";
export type VisualSourceFile={filename:string;fileData:string;pages:number[];documentId?:string;documentTitle?:string};
export async function getVisualSourceFiles(assetId:string,ownerId:string,question:string,context:ErnestContextPage[]){
 const files:VisualSourceFile[]=[],warnings:string[]=[];
 if(!/interpret|detail|exact wording|source page|diagram|schematic|circuit|stowage|compartment|where|location|settee|section|connected|wiring|left|right|above|below|image|photo/i.test(question))return{files,warnings};
 const detailed=/interpret|detail|exact wording|read.*original|source page/i.test(question);
 // A diagram page may have no extracted text and therefore no lexical hit.
 // Look for an owner-scoped original by title as well, including inventory maps.
 const originals = await getDocumentsForAsset(assetId,ownerId);
 const named = originals.filter(d=>/diagram|schematic|layout|stowage|storage|inventory|deck plan/i.test(d.title+" "+d.originalFilename));
 const ids=[...new Set([...context.filter(p=>detailed||p.visual||/diagram|schematic|stowage|wiring|compartment/i.test(p.documentTitle+" "+p.text)).map(p=>p.documentId),...named.map(d=>d.id)])].slice(0,2);
 for(const id of ids){
  const document=await getDocumentForAsset(id,assetId,ownerId);
  if(!document)continue;
  if(document.contentType!=="application/pdf"||document.sizeBytes>12*1024*1024){warnings.push(`Original ${document.title} was not attached (type or size limit). Do not claim visual verification.`);continue;}
  try{
   const bytes=await readDocument(document.storageKey);
   warnings.push(`Attached original PDF: ${document.title}. Inspect the original for diagram labels; do not infer compartment names from inventory contents. Cite actual original page numbers.`);
   files.push({documentId:id,documentTitle:document.title,filename:document.originalFilename,fileData:`data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,pages:context.filter(p=>p.documentId===id).map(p=>p.pageNumber)});
  }catch{warnings.push(`Original ${document.title} could not be loaded. Retrieved text is available but spatial interpretations are unverified.`);}
 }
 return{files,warnings};
}
