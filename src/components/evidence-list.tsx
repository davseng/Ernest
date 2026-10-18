import {evidenceSources} from "@/domain/evidence";
export function EvidenceList({assetId,sources}:{assetId:string;sources:unknown}) {
 const entries=evidenceSources(sources);
 if(!entries.length)return null;
 const base=`/assets/${encodeURIComponent(assetId)}`;
 return <details className="chat-evidence"><summary>Retrieved evidence</summary><ul>{entries.map((s,i)=><li key={i}><a href={s.photoId?`${base}/photos/${encodeURIComponent(s.photoId)}/original`:s.pageNumber===0?`${base}/documents/${encodeURIComponent(s.documentId!)}/original`:`${base}/documents/${encodeURIComponent(s.documentId!)}#page-${s.pageNumber}`}>{s.documentTitle}{s.photoId?" (photo)":s.pageNumber===0?" (original PDF)":`, p. ${s.pageNumber}`}</a></li>)}</ul></details>;
}
