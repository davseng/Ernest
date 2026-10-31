export class SailPhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SailPhotoValidationError";
  }
}
export const sailPhotoCategories = {
  exterior: "Exterior",
  sailing: "Sailing & sunrise",
  forward_berth: "Forward / Main Berth",
  aft_berth: "Aft Berth",
  salon: "Salon",
  cockpit: "Cockpit",
  galley: "Galley",
  forward_lav: "Forward Lav / Shower",
} as const;
export type SailPhotoCategory = keyof typeof sailPhotoCategories;
export const maxSailPhotoBytes = 10 * 1024 * 1024;
export type SailPhotoInput = {
  category: SailPhotoCategory;
  caption: string;
  altText: string;
  voyageId: string | null;
  published: boolean;
  homeCover: boolean;
  voyageCover: boolean;
  position: number;
};
import { sailText as baseText } from "@/domain/sail";
const sailText: typeof baseText = (...args) => {
  try {
    return baseText(...args);
  } catch {
    throw new SailPhotoValidationError(
      `${args[2]} is required and must be ${args[1]} characters or fewer.`,
    );
  }
};
export function parseSailPhoto(input: unknown): SailPhotoInput {
  if (!input || typeof input !== "object")
    throw new SailPhotoValidationError("Enter the photo details.");
  const r = input as Record<string, unknown>;
  if (
    typeof r.category !== "string" ||
    !Object.hasOwn(sailPhotoCategories, r.category)
  )
    throw new SailPhotoValidationError("Choose a photo category.");
  const caption = sailText(r.caption, 240, "Caption", true),
    altText = sailText(r.altText, 500, "Image description") || caption;
  const voyageId = sailText(r.voyageId, 80, "Voyage") || null;
  if (
    voyageId &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      voyageId,
    )
  )
    throw new SailPhotoValidationError("Choose a voyage from the list.");
  const position = r.position == null ? 0 : Number(r.position);
  if (!Number.isInteger(position) || position < 0 || position > 9999)
    throw new SailPhotoValidationError("Order must be between 0 and 9999.");
  const published = r.published === true,
    homeCover = published && r.homeCover === true,
    voyageCover = published && r.voyageCover === true;
  if (homeCover && voyageId)
    throw new SailPhotoValidationError(
      "A homepage cover must be in the boat gallery.",
    );
  if (voyageCover && !voyageId)
    throw new SailPhotoValidationError("Select a voyage for its cover photo.");
  return {
    category: r.category as SailPhotoCategory,
    caption,
    altText,
    voyageId,
    position,
    published,
    homeCover,
    voyageCover,
  };
}
export function validateSailPhotoUpload(type: unknown, size: unknown) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(String(type)))
    throw new SailPhotoValidationError("Choose a JPEG, PNG or WebP photo.");
  if (
    !Number.isInteger(size) ||
    Number(size) < 1 ||
    Number(size) > maxSailPhotoBytes
  )
    throw new SailPhotoValidationError("Choose a photo of 10 MB or smaller.");
}
