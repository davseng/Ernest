import sharp from "sharp";
import {
  maxSailPhotoBytes,
  SailPhotoValidationError,
} from "../domain/sail-photos";
export async function prepareSailWebPhoto(bytes: Uint8Array) {
  if (bytes.length < 12 || bytes.length > maxSailPhotoBytes)
    throw new SailPhotoValidationError("Choose a photo of 10 MB or smaller.");
  const b = Buffer.from(bytes);
  const supported =
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP");
  if (!supported)
    throw new SailPhotoValidationError(
      "Choose a genuine JPEG, PNG or WebP photo.",
    );
  try {
    const { data, info } = await sharp(b, {
      limitInputPixels: 40_000_000,
      animated: false,
      failOn: "warning",
    })
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height };
  } catch {
    throw new SailPhotoValidationError(
      "This photo could not be read. Export it as JPEG, PNG or WebP and try again.",
    );
  }
}
