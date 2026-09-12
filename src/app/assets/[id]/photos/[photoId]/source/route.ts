import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { readDocument } from "@/data/document-storage";
import { getPhoto } from "@/data/photos";

export const dynamic = "force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{id:string;photoId:string}>}){
  const{id,photoId}=await params;
  const session=await auth();
  if(!session?.user?.id)return new NextResponse("Unauthorized",{status:401});
  const photo=await getPhoto(photoId,id,session.user.id);
  if(!photo)return new NextResponse("Not found",{status:404});
  const bytes=await readDocument(photo.storageKey);
  const body=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  return new NextResponse(body,{headers:{"Content-Type":photo.contentType,"Cache-Control":"private, max-age=60"}});
}
