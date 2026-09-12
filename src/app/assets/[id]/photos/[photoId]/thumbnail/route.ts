import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createDocumentReadUrl, inspectDocument } from "@/data/document-storage";
import { getPhoto } from "@/data/photos";
import { photoThumbnailKey } from "../../../photo-actions";

export const dynamic = "force-dynamic";

export async function GET(request:Request,{params}:{params:Promise<{id:string;photoId:string}>}){
  const{id,photoId}=await params;
  const session=await auth();
  if(!session?.user?.id)return NextResponse.redirect(new URL("/sign-in",request.url));
  const photo=await getPhoto(photoId,id,session.user.id);
  if(!photo)return new NextResponse("Not found",{status:404});
  const key=photoThumbnailKey(photo.storageKey);
  try{await inspectDocument(key);}catch{return new NextResponse("Thumbnail not generated",{status:404,headers:{"Cache-Control":"no-store"}});}
  const readUrl=await createDocumentReadUrl(key,`${photo.title}.jpg`);
  return NextResponse.redirect(readUrl,{headers:{"Cache-Control":"private, max-age=300"}});
}
