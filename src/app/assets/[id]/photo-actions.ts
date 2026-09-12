"use server";

import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getAsset } from "@/data/assets";
import { createPhoto, deletePhotoRecord, getPhoto, updatePhoto } from "@/data/photos";
import {
  createDocumentUploadUrl,
  deleteStoredDocument,
  inspectDocument,
} from "@/data/document-storage";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);
function safeFilename(name:string){return name.replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"photo";}
function titleFromFilename(filename:string){const base=filename.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();return(base||"Untitled photo").slice(0,200);}
export function photoThumbnailKey(storageKey:string){return `${storageKey}.thumb.jpg`;}
async function ownedAsset(assetId:string){const session=await auth();if(!session?.user?.id)redirect("/sign-in");const asset=await getAsset(assetId,session.user.id);if(!asset)notFound();return{asset,ownerId:session.user.id};}
function validateImage(filename:string,contentType:string,sizeBytes:number){if(!ALLOWED_TYPES.has(contentType))throw new Error(`${filename} is not a supported photo. Use JPEG, PNG, WebP, HEIC, or HEIF.`);if(!Number.isFinite(sizeBytes)||sizeBytes<=0)throw new Error("Choose a photo to upload.");if(sizeBytes>MAX_FILE_BYTES)throw new Error(`${filename} is larger than 20 MB.`);}

export async function preparePhotoUpload(assetId:string,input:{filename:string;contentType:string;sizeBytes:number}){await ownedAsset(assetId);const contentType=input.contentType||"image/jpeg";validateImage(input.filename,contentType,input.sizeBytes);const storageKey=`assets/${assetId}/photos/${randomUUID()}-${safeFilename(input.filename)}`;const uploadUrl=await createDocumentUploadUrl(storageKey,contentType);const thumbnailUploadUrl=await createDocumentUploadUrl(photoThumbnailKey(storageKey),"image/jpeg");return{uploadUrl,thumbnailUploadUrl,storageKey,title:titleFromFilename(input.filename),contentType};}

export async function preparePhotoThumbnail(assetId:string,photoId:string){const{ownerId}=await ownedAsset(assetId);const photo=await getPhoto(photoId,assetId,ownerId);if(!photo)notFound();return{uploadUrl:await createDocumentUploadUrl(photoThumbnailKey(photo.storageKey),"image/jpeg")};}

export async function completePhotoUpload(assetId:string,input:{storageKey:string;title:string;filename:string;contentType:string;expectedSizeBytes:number}){const{ownerId}=await ownedAsset(assetId);const expectedPrefix=`assets/${assetId}/photos/`;if(!input.storageKey.startsWith(expectedPrefix))throw new Error("Invalid photo upload target.");const stored=await inspectDocument(input.storageKey);const contentType=stored.contentType||input.contentType;validateImage(input.filename,contentType,stored.sizeBytes);if(stored.sizeBytes!==input.expectedSizeBytes){await deleteStoredDocument(input.storageKey).catch(()=>undefined);await deleteStoredDocument(photoThumbnailKey(input.storageKey)).catch(()=>undefined);throw new Error("Uploaded photo size did not match the selected file. Please try again.");}const photoId=await createPhoto(assetId,ownerId,{title:input.title.trim().slice(0,200)||titleFromFilename(input.filename),originalFilename:input.filename,contentType,sizeBytes:stored.sizeBytes,storageKey:input.storageKey});if(!photoId){await deleteStoredDocument(input.storageKey).catch(()=>undefined);await deleteStoredDocument(photoThumbnailKey(input.storageKey)).catch(()=>undefined);throw new Error("Ernest could not save the photo record.");}revalidatePath(`/assets/${assetId}/photos`);return{photoId};}

export async function updatePhotoAction(assetId:string,photoId:string,formData:FormData){const{ownerId}=await ownedAsset(assetId);const title=String(formData.get("title")??"").trim();const componentId=String(formData.get("componentId")??"").trim()||undefined;const notes=String(formData.get("notes")??"").trim()||undefined;if(!title||title.length>200)throw new Error("Enter a photo title of 200 characters or fewer.");const updated=await updatePhoto(photoId,assetId,ownerId,{title,componentId,notes});if(!updated)notFound();revalidatePath(`/assets/${assetId}/photos`);redirect(`/assets/${encodeURIComponent(assetId)}/photos?saved=updated`);}

export async function deletePhotoAction(assetId:string,photoId:string){const{ownerId}=await ownedAsset(assetId);const photo=await getPhoto(photoId,assetId,ownerId);if(!photo)notFound();await deleteStoredDocument(photo.storageKey);await deleteStoredDocument(photoThumbnailKey(photo.storageKey)).catch(()=>undefined);const deleted=await deletePhotoRecord(photoId,assetId,ownerId);if(!deleted)notFound();revalidatePath(`/assets/${assetId}/photos`);redirect(`/assets/${encodeURIComponent(assetId)}/photos?saved=deleted`);}
