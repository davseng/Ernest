import { sailText } from "@/domain/sail";
export type SailAvailability = {
  voyageId: string;
  crewNeeded: number | null;
  passengerPlaces: number | null;
  note: string;
  revision: number;
};
export function parseSailAvailability(input: unknown) {
  if (!input || typeof input !== "object")
    throw Error("Enter the availability details.");
  const r = input as Record<string, unknown>;
  const count = (value: unknown) => {
    if (value == null || value === "") return null;
    if (typeof value !== "number" && typeof value !== "string")
      throw Error("Use a whole number from 0 to 100, or leave it open.");
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 100)
      throw Error("Use a whole number from 0 to 100, or leave it open.");
    return n;
  };
  return {
    crewNeeded: count(r.crewNeeded),
    passengerPlaces: count(r.passengerPlaces),
    note: sailText(r.note, 400, "Availability note"),
  };
}
export function availabilityLabel(
  n: number | null | undefined,
  role: "crew" | "passenger",
) {
  return n == null
    ? role === "crew"
      ? "Ask me about crew"
      : "Ask me about passenger space"
    : n === 0
      ? role === "crew"
        ? "Crew covered"
        : "No passenger spots open"
      : role === "crew"
        ? `Looking for ${n} more crew member${n === 1 ? "" : "s"}`
        : `Room for ${n} passenger${n === 1 ? "" : "s"}`;
}
