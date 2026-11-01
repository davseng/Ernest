export const voyageStatuses = [
  "planning",
  "ready",
  "underway",
  "completed",
  "cancelled",
] as const;
export type VoyageStatus = (typeof voyageStatuses)[number];
export type ParticipationRole = "crew" | "passenger";
export type VoyageInput = {
  title: string;
  summary: string;
  departurePort: string;
  arrivalPort: string;
  departureFrom: string | null;
  departureTo: string | null;
  arrivalEstimate: string | null;
  timingNote: string;
  status: VoyageStatus;
  published: boolean;
  crewExpectations: string;
  passengerExpectations: string;
  boardingNotes: string;
};
export const expectationTemplates = {
  crew: "Let’s talk through your sailing experience, the jobs you’re comfortable with and what you’d like to try. We’ll agree watches, safety preparation and what to bring before the trip.",
  passenger:
    "Let’s talk about life aboard, the route, and anything you’d like me to know about your needs. We’ll work through sleeping arrangements, the safety briefing and what to bring before you come.",
};
export function sailText(
  value: unknown,
  max: number,
  label: string,
  required = false,
) {
  const s =
    typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
  if (s.length > max || (required && !s))
    throw Error(
      `${label}${!s ? " is required" : ` must be ${max} characters or fewer`}.`,
    );
  return s;
}
export function sailDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw Error("Use a valid date or leave it open.");
  return value;
}
export function parseVoyage(input: unknown): VoyageInput {
  if (!input || typeof input !== "object")
    throw Error("Enter the voyage details.");
  const r = input as Record<string, unknown>;
  const departureFrom = sailDate(r.departureFrom),
    departureTo = sailDate(r.departureTo),
    arrivalEstimate = sailDate(r.arrivalEstimate);
  if (departureTo && (!departureFrom || departureTo < departureFrom))
    throw Error("The departure window must end on or after its start.");
  if (
    arrivalEstimate &&
    (departureTo ?? departureFrom) &&
    arrivalEstimate < (departureTo ?? departureFrom)!
  )
    throw Error(
      "Estimated arrival cannot precede the departure date or window.",
    );
  if (!voyageStatuses.includes(r.status as VoyageStatus))
    throw Error("Choose a voyage status.");
  const v = {
    title: sailText(r.title, 160, "Voyage title", true),
    summary: sailText(r.summary, 3000, "Description"),
    departurePort: sailText(r.departurePort, 200, "Departure"),
    arrivalPort: sailText(r.arrivalPort, 200, "Destination"),
    departureFrom,
    departureTo,
    arrivalEstimate,
    timingNote: sailText(r.timingNote, 1200, "Timing note"),
    status: r.status as VoyageStatus,
    published: r.published === true,
    crewExpectations: sailText(r.crewExpectations, 5000, "Crew guidance"),
    passengerExpectations: sailText(
      r.passengerExpectations,
      5000,
      "Passenger guidance",
    ),
    boardingNotes: sailText(r.boardingNotes, 3000, "Joining details"),
  };
  if (v.published && (!v.summary || !v.departurePort || !v.arrivalPort))
    throw Error(
      "Add a description, departure and destination before publishing.",
    );
  return v;
}
export function parsePerson(input: unknown, emailOptional = false) {
  if (!input || typeof input !== "object")
    throw Error("Enter the person’s details.");
  const r = input as Record<string, unknown>;
  const email =
    sailText(r.email, 254, "Email", !emailOptional).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error("Enter a valid email address.");
  if (r.role !== "crew" && r.role !== "passenger")
    throw Error("Choose crew or passenger.");
  return {
    fullName: sailText(r.fullName, 160, "Name", true),
    email,
    role: r.role as ParticipationRole,
  };
}
export function departureLabel(from: string | null, to: string | null) {
  const f = (d: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(d + "T12:00:00Z"));
  return !from
    ? "Departure date open"
    : to && to !== from
      ? `${f(from)} – ${f(to)}`
      : f(from);
}
export function blankVoyage(): VoyageInput {
  return {
    title: "",
    summary: "",
    departurePort: "",
    arrivalPort: "",
    departureFrom: null,
    departureTo: null,
    arrivalEstimate: null,
    timingNote: "",
    status: "planning",
    published: false,
    crewExpectations: expectationTemplates.crew,
    passengerExpectations: expectationTemplates.passenger,
    boardingNotes: "",
  };
}
