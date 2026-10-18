import "server-only";
import { listPhotos } from "@/data/photos";
import { readDocument } from "@/data/document-storage";
import { expandedTerms, evidenceContains } from "@/domain/retrieval";
export type PhotoSourceFile={photoId:string;title:string;imageUrl:string};
/** Inspect preserved originals on demand; model interpretation never becomes a verified equipment fact. */
export async function getPhotoEvidence(assetId:string,ownerId:string,question:string){
 const terms=expandedTerms(question),files:PhotoSourceFile[]=[],warnings:string[]=[];
 if(!terms.length)return{files,warnings};
 const photos=await listPhotos(assetId,ownerId);
 const ranked=photos.map(p=>({p,score:terms.filter(t=>evidenceContains(`${p.title} ${p.componentName??""} ${p.notes??""} ${p.originalFilename}`,t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,2);
 for(const {p} of ranked){
  if(!["image/jpeg","image/png","image/webp"].includes(p.contentType)||p.sizeBytes>8*1024*1024){warnings.push(`Photo ${p.title} requires conversion or exceeds the vision size limit. Do not claim to have inspected it.`);continue;}
  try{const bytes=await readDocument(p.storageKey);files.push({photoId:p.id,title:p.title,imageUrl:`data:${p.contentType};base64,${Buffer.from(bytes).toString("base64")}`});}
  catch{warnings.push(`Photo ${p.title} could not be loaded. Do not infer its visible contents.`);}
 }
 return{files,warnings};
}
