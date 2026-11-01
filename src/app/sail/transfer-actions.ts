"use server";
import { auth } from "@/auth";
import { sail } from "@/data/sail";
import { sailPhotos } from "@/data/sail-photos";
import { sailPosition } from "@/data/sail-position";
import { sailTransfer } from "@/data/sail-transfer";
import { getAssets } from "@/data/assets";
import { parseSailTransfer, SailTransferError } from "@/domain/sail-transfer";
async function owner(assetId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new SailTransferError("Please sign in again.");
  if (!(await getAssets(session.user.id)).some((a) => a.id === assetId))
    throw new SailTransferError("Vessel not found.");
  return session.user.id;
}
const failure = (e: unknown) => ({
  ok: false as const,
  error:
    e instanceof Error && e.name === "SailTransferError"
      ? e.message
      : "The transfer could not be completed. Check the owner workspace before retrying.",
});
export async function exportSailContent(assetId: string) {
  try {
    const id = await owner(assetId);
    const voyages = (await sail().ownerList(id)).filter(
      (v) => v.assetId === assetId,
    );
    const photos = (await sailPhotos().list(id)).filter(
      (p) => p.assetId === assetId && p.ready,
    );
    const position =
      (await sailPosition().ownerList(id)).find((p) => p.assetId === assetId) ??
      null;
    const photo = photos.find((p) => p.id === position?.photoId);
    const positionPhotoVisible =
      photo?.published &&
      (!photo.voyageId ||
        voyages.some((v) => v.id === photo.voyageId && v.published));
    // Parsers project allowlisted fields: no owner IDs, keys, guests, tokens or old audit snapshots.
    return {
      ok: true as const,
      content: parseSailTransfer({
        format: "sail-content-v1",
        voyages: voyages.map((v) => ({ ...v, ref: v.id })),
        photos: photos.map((p) => ({ ...p, ref: p.id })),
        position: position
          ? { ...position, photoId: positionPhotoVisible ? photo!.id : null }
          : null,
      }),
    };
  } catch (e) {
    return failure(e);
  }
}
export async function checkSailImportTarget(assetId: string) {
  try {
    await sailTransfer().checkEmpty(await owner(assetId), assetId);
    return { ok: true as const };
  } catch (e) {
    return failure(e);
  }
}
export async function importSailContent(
  assetId: string,
  input: unknown,
  staged: { ref: string; id: string }[],
) {
  try {
    const counts = await sailTransfer().importContent(
      await owner(assetId),
      assetId,
      input,
      staged,
    );
    return { ok: true as const, counts };
  } catch (e) {
    return failure(e);
  }
}
