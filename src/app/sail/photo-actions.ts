"use server";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { sailPhotos } from "@/data/sail-photos";
import {
  createDocumentUploadUrl,
  inspectDocument,
  readStoredUpload,
  storeDocumentBytes,
  deleteStoredDocument,
} from "@/data/document-storage";
import { prepareSailWebPhoto } from "@/data/sail-photo-image";
import {
  validateSailPhotoUpload,
  SailPhotoValidationError,
  maxSailPhotoBytes,
} from "@/domain/sail-photos";
async function owner() {
  const s = await auth();
  if (!s?.user?.id) throw new SailPhotoValidationError("Please sign in again.");
  return s.user.id;
}
function failure(e: unknown) {
  return {
    ok: false as const,
    error:
      e instanceof Error && e.name === "SailPhotoValidationError"
        ? e.message
        : "The photo action could not be completed. Reload and try again.",
  };
}
function refresh() {
  for (const path of [
    "/sail",
    "/sail/boat",
    "/sail/manage/photos",
    "/sail/voyages",
  ])
    revalidatePath(path, "layout");
}
export async function startSailPhoto(
  assetId: string,
  input: unknown,
  type: string,
  size: number,
) {
  try {
    const id = await owner();
    validateSailPhotoUpload(type, size);
    const p = await sailPhotos().prepare(id, assetId, input);
    const uploadUrl = await createDocumentUploadUrl(p.uploadKey, type);
    return { ok: true as const, id: p.id, uploadUrl };
  } catch (e) {
    return failure(e);
  }
}
export async function finishSailPhoto(photoId: string) {
  try {
    const id = await owner();
    let temporaryKey: string | undefined;
    await sailPhotos().finalize(photoId, id, async (p) => {
      const inspected = await inspectDocument(p.uploadKey);
      if (inspected.sizeBytes < 1 || inspected.sizeBytes > maxSailPhotoBytes)
        throw new SailPhotoValidationError(
          "Choose a photo of 10 MB or smaller.",
        );
      const web = await prepareSailWebPhoto(
        await readStoredUpload(p.uploadKey, maxSailPhotoBytes),
      );
      await storeDocumentBytes(p.storageKey, web.bytes, "image/webp");
      temporaryKey = p.uploadKey;
      return { width: web.width, height: web.height };
    });
    if (temporaryKey) {
      try {
        await deleteStoredDocument(temporaryKey);
      } catch {
        /* Private temporary copies never become public. */
      }
    }
    refresh();
    return {
      ok: true as const,
      message: "Photo uploaded. It is private until you publish it.",
    };
  } catch (e) {
    return failure(e);
  }
}
export async function updateSailPhoto(
  photoId: string,
  input: unknown,
  revision: number,
) {
  try {
    await sailPhotos().update(photoId, await owner(), input, revision);
    refresh();
    return { ok: true as const, message: "Photo saved." };
  } catch (e) {
    return failure(e);
  }
}
export async function removeSailPhoto(photoId: string, revision: number) {
  try {
    const keys = await sailPhotos().remove(photoId, await owner(), revision);
    refresh();
    let cleaned = true;
    for (const key of [keys.uploadKey, keys.storageKey]) {
      try {
        await deleteStoredDocument(key);
      } catch {
        cleaned = false;
      }
    }
    return {
      ok: true as const,
      message: cleaned
        ? "Photo removed."
        : "Photo removed from the site. A private storage copy may remain for cleanup.",
    };
  } catch (e) {
    return failure(e);
  }
}
