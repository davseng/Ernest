import Link from "next/link";
import type { Voyage } from "@/data/sail-store";
import { departureLabel, sailStatusLabel } from "@/domain/sail";
import {
  availabilityLabel,
  type SailAvailability,
} from "@/domain/sail-timeline";
export type SailRosterPerson = {
  voyageId: string;
  fullName: string;
  role: "crew" | "passenger";
  status: string;
  acceptedRevision: number | null;
  invited: boolean;
};
export function SailCrewTable({
  voyages,
  availability,
  people,
}: {
  voyages: Voyage[];
  availability: SailAvailability[];
  people: SailRosterPerson[];
}) {
  const active = voyages
    .filter((v) => !["completed", "cancelled"].includes(v.status))
    .sort(
      (a, b) =>
        (a.departureFrom ?? "9999").localeCompare(b.departureFrom ?? "9999") ||
        a.title.localeCompare(b.title),
    );
  if (!active.length)
    return (
      <p className="sail-empty">
        No upcoming trips yet. Add a trip and the people you’d like to have
        aboard.
      </p>
    );
  return (
    <div
      className="sail-crew-scroll"
      role="region"
      aria-label="Crew and passenger planning table"
      tabIndex={0}
    >
      <table className="sail-crew-table">
        <caption>Upcoming trips, confirmed guests and remaining places</caption>
        <thead>
          <tr>
            <th scope="col">Trip</th>
            <th scope="col">Confirmed crew</th>
            <th scope="col">Still need crew</th>
            <th scope="col">Confirmed passengers</th>
            <th scope="col">Passenger space</th>
            <th scope="col">Replies & follow-up</th>
          </tr>
        </thead>
        <tbody>
          {active.map((v) => {
            const a = availability.find((a) => a.voyageId === v.id),
              roster = people.filter((p) => p.voyageId === v.id),
              confirmed = (role: "crew" | "passenger") =>
                roster.filter(
                  (p) =>
                    p.role === role &&
                    p.status === "accepted" &&
                    p.acceptedRevision === v.revision,
                );
            const waiting = roster.filter(
                (p) => p.status === "invited" && p.invited,
              ),
              drafts = roster.filter(
                (p) => p.status === "invited" && !p.invited,
              ),
              reconfirm = roster.filter(
                (p) =>
                  p.status === "accepted" && p.acceptedRevision !== v.revision,
              ),
              declined = roster.filter((p) => p.status === "declined");
            const names = (list: SailRosterPerson[]) =>
              list.length ? (
                <ul>
                  {list.map((p, i) => (
                    <li key={i}>
                      {p.fullName}
                      {p.role === "crew" ? " · crew" : " · passenger"}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="sail-footnote">None confirmed yet</span>
              );
            return (
              <tr key={v.id}>
                <th scope="row">
                  <Link href={`/sail/manage/${v.id}`}>{v.title}</Link>
                  <p>
                    {v.departurePort || "Departure open"} →{" "}
                    {v.arrivalPort || "Destination open"}
                  </p>
                  <p>{departureLabel(v.departureFrom, v.departureTo)}</p>
                  <small>
                    {v.published ? "Public" : "Private draft"} ·{" "}
                    {sailStatusLabel(v.status)}
                  </small>
                  {a?.note ? <p className="sail-prose">{a.note}</p> : null}
                  <p>
                    <Link href={`/sail/manage/${v.id}`}>
                      Manage people & spaces →
                    </Link>
                  </p>
                </th>
                <td>{names(confirmed("crew"))}</td>
                <td>
                  <strong>{availabilityLabel(a?.crewNeeded, "crew")}</strong>
                </td>
                <td>{names(confirmed("passenger"))}</td>
                <td>
                  <strong>
                    {availabilityLabel(a?.passengerPlaces, "passenger")}
                  </strong>
                </td>
                <td>
                  {reconfirm.length ? (
                    <div>
                      <strong>Need to reconfirm</strong>
                      {names(reconfirm)}
                    </div>
                  ) : null}
                  {waiting.length ? (
                    <div>
                      <strong>Awaiting a reply</strong>
                      {names(waiting)}
                    </div>
                  ) : null}
                  {drafts.length ? (
                    <div>
                      <strong>Need an invitation</strong>
                      {names(drafts)}
                    </div>
                  ) : null}
                  {declined.length ? (
                    <details>
                      <summary>{declined.length} can’t make it</summary>
                      {names(declined)}
                    </details>
                  ) : null}
                  {!reconfirm.length &&
                  !waiting.length &&
                  !drafts.length &&
                  !declined.length ? (
                    <span className="sail-footnote">
                      No outstanding replies
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
