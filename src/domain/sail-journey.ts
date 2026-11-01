import type { PublicVoyage } from "@/data/sail-store";
/** Labels only: audit snapshots and another role's guidance never reach guests. */
export function sailPlanChanges(
  previous: unknown,
  current: PublicVoyage,
  role: "crew" | "passenger",
  expectations: string,
  boardingNotes: string,
) {
  if (!previous || typeof previous !== "object") return [];
  const p = previous as Record<string, unknown>;
  const groups: [string, string[], Record<string, unknown>][] = [
    ["Trip name", ["title"], current],
    ["Route", ["departurePort", "arrivalPort"], current],
    [
      "Departure timing",
      ["departureFrom", "departureTo", "timingNote"],
      current,
    ],
    ["Estimated arrival", ["arrivalEstimate"], current],
    ["Trip description", ["summary"], current],
    ["Trip status", ["status"], current],
    [
      "What to expect",
      [role === "crew" ? "crewExpectations" : "passengerExpectations"],
      {
        [role === "crew" ? "crewExpectations" : "passengerExpectations"]:
          expectations,
      },
    ],
    ["Joining details", ["boardingNotes"], { boardingNotes }],
  ];
  return groups
    .filter(([, keys, now]) =>
      keys.some((k) => (p[k] ?? null) !== (now[k] ?? null)),
    )
    .map(([label]) => label);
}
export function sailContactHref(
  email: string | undefined,
  voyageTitle: string,
) {
  const clean = email?.trim();
  return clean && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)
    ? `mailto:${clean}?subject=${encodeURIComponent(`A question about ${voyageTitle}`)}`
    : null;
}
