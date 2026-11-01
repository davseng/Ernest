import { parseVoyage, type VoyageInput } from "@/domain/sail";
import { parseSailPhoto, type SailPhotoInput } from "@/domain/sail-photos";
import {
  parseSailPosition,
  type SailPositionInput,
} from "@/domain/sail-position";
export const maxTransferFileBytes = 80 * 1024 * 1024;
export class SailTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SailTransferError";
  }
}
export type SailTransfer = {
  format: "sail-content-v1";
  voyages: (VoyageInput & { ref: string })[];
  photos: (SailPhotoInput & { ref: string })[];
  position: SailPositionInput | null;
};
const ref = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
  )
    throw new SailTransferError("Invalid content reference.");
  return value;
};
export function parseSailTransfer(input: unknown): SailTransfer {
  try {
    if (!input || typeof input !== "object")
      throw Error("Choose a Sail content file.");
    const r = input as Record<string, unknown>;
    if (
      r.format !== "sail-content-v1" ||
      !Array.isArray(r.voyages) ||
      !Array.isArray(r.photos) ||
      r.voyages.length > 20 ||
      r.photos.length > 50
    )
      throw Error(
        "Use a Sail content file with at most 20 voyages and 50 photos.",
      );
    const voyages = r.voyages.map((v) => ({
      ...parseVoyage(v),
      ref: ref(v?.ref),
    }));
    const photos = r.photos.map((p) => ({
      ...parseSailPhoto(p),
      ref: ref(p?.ref),
    }));
    const vids = new Set(voyages.map((v) => v.ref)),
      pids = new Set(photos.map((p) => p.ref));
    if (vids.size !== voyages.length || pids.size !== photos.length)
      throw Error("Duplicate content references.");
    const covers = new Set<string>();
    for (const p of photos) {
      if (p.voyageId && !vids.has(p.voyageId))
        throw Error("A photo refers to a missing voyage.");
      const key = p.homeCover ? "home" : p.voyageCover ? p.voyageId : null;
      if (key && covers.has(key))
        throw Error("Choose only one cover per voyage or homepage.");
      if (key) covers.add(key);
    }
    const position = r.position == null ? null : parseSailPosition(r.position);
    if (position?.photoId) {
      const p = photos.find((p) => p.ref === position.photoId);
      if (
        !p?.published ||
        (p.voyageId && !voyages.find((v) => v.ref === p.voyageId)?.published)
      )
        throw Error("The position photo must be included and public.");
    }
    return { format: "sail-content-v1", voyages, photos, position };
  } catch (e) {
    throw new SailTransferError(
      e instanceof Error ? e.message : "Invalid Sail content file.",
    );
  }
}
