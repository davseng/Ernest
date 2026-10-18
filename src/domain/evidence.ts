export type EvidenceSource = {photoId?:string;documentId?:string;documentTitle:string;pageNumber:number};
/** Validate persisted/model-era evidence before rendering a link or list item. */
export function evidenceSources(input: unknown): EvidenceSource[] {
 if(!Array.isArray(input))return [];
 const seen=new Set<string>();
 return input.flatMap(value=>{
  if(!value||typeof value!=="object")return [];
  const s=value as Record<string,unknown>;
  const photoId=typeof s.photoId==="string"&&s.photoId.trim()?s.photoId:undefined;
  const documentId=typeof s.documentId==="string"&&s.documentId.trim()?s.documentId:undefined;
  if(!photoId&&!documentId)return [];
  const page=Number(s.pageNumber);
  if(!photoId&&(!Number.isInteger(page)||page<0))return [];
  const key=photoId?`photo:${photoId}`:`document:${documentId}:${page}`;
  if(seen.has(key))return [];seen.add(key);
  const title=typeof s.documentTitle==="string"?s.documentTitle.trim():"";
  return [{photoId,documentId,documentTitle:title||(photoId?"Equipment photo":"Document"),pageNumber:photoId?0:page}];
 });
}
