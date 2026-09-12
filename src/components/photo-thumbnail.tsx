"use client";

import { useEffect, useRef, useState } from "react";

import { preparePhotoThumbnail } from "@/app/assets/[id]/photo-actions";

let thumbnailQueue: Promise<void> = Promise.resolve();

async function jpegThumbnail(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const maxEdge = 480;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Thumbnail encoding failed")), "image/jpeg", .72));
}

export function PhotoThumbnail({assetId,photoId,title,contentType}:{assetId:string;photoId:string;title:string;contentType:string}){
  const thumbnailUrl=`/assets/${assetId}/photos/${photoId}/thumbnail`;
  const sourceUrl=`/assets/${assetId}/photos/${photoId}/source`;
  const [src,setSrc]=useState(thumbnailUrl);
  const [building,setBuilding]=useState(false);
  const tried=useRef(false);
  const unsupported=contentType==="image/heic"||contentType==="image/heif";

  useEffect(()=>{setSrc(thumbnailUrl);tried.current=false;},[thumbnailUrl]);

  function backfill(){
    if(tried.current||unsupported)return;
    tried.current=true;
    setBuilding(true);
    thumbnailQueue=thumbnailQueue.then(async()=>{
      const source=await fetch(sourceUrl,{cache:"no-store"});
      if(!source.ok)throw new Error("Could not load original");
      const thumb=await jpegThumbnail(await source.blob());
      const prepared=await preparePhotoThumbnail(assetId,photoId);
      const uploaded=await fetch(prepared.uploadUrl,{method:"PUT",headers:{"Content-Type":"image/jpeg"},body:thumb});
      if(!uploaded.ok)throw new Error("Thumbnail upload failed");
      setSrc(`${thumbnailUrl}?v=${Date.now()}`);
    }).catch(()=>undefined).finally(()=>setBuilding(false));
  }

  if(unsupported)return <div className="photo-format-placeholder">HEIC<br/><small>Open original</small></div>;
  return <div className="photo-thumbnail-shell">
    <img src={src} alt={title} loading="lazy" decoding="async" onError={backfill}/>
    {building?<span className="photo-thumbnail-status">Preparing preview…</span>:null}
  </div>;
}
