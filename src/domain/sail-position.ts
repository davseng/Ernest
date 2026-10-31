import { sailText, sailDate } from "@/domain/sail";
export type SailPositionInput = {
  placeLabel: string;
  reportedOn: string;
  latitude: number | null;
  longitude: number | null;
  note: string;
  photoId: string | null;
  published: boolean;
};
export class SailPositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SailPositionError";
  }
}
export function parseSailPosition(input: unknown): SailPositionInput {
  if (!input || typeof input !== "object")
    throw new SailPositionError("Enter the position report.");
  const r = input as Record<string, unknown>;
  try {
    const placeLabel = sailText(r.placeLabel, 160, "Place", true),
      reportedOn = sailDate(r.reportedOn);
    if (!reportedOn)
      throw new SailPositionError(
        "Choose the date this position was reported.",
      );
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const datePart = (name: string) =>
      parts.find((p) => p.type === name)!.value;
    if (
      reportedOn > `${datePart("year")}-${datePart("month")}-${datePart("day")}`
    )
      throw new SailPositionError(
        "A position report cannot have a future date.",
      );
    const coordinate = (v: unknown, max: number) => {
      if (v == null || v === "") return null;
      if (typeof v !== "number" && typeof v !== "string")
        throw new SailPositionError("Use valid map coordinates.");
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) > max)
        throw new SailPositionError("Use valid map coordinates.");
      return n;
    };
    const latitude = coordinate(r.latitude, 90),
      longitude = coordinate(r.longitude, 180);
    if ((latitude === null) !== (longitude === null))
      throw new SailPositionError(
        "Set both coordinates, or share the place name only.",
      );
    const photoId = sailText(r.photoId, 80, "Photo") || null;
    if (
      photoId &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        photoId,
      )
    )
      throw new SailPositionError("Choose a published photo from the list.");
    return {
      placeLabel,
      reportedOn,
      latitude,
      longitude,
      note: sailText(r.note, 1500, "Update"),
      photoId,
      published: r.published === true,
    };
  } catch (e) {
    if (e instanceof Error) throw new SailPositionError(e.message);
    throw new SailPositionError("Check the position details.");
  }
}
export function positionDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
