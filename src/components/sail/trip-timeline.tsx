import Link from "next/link";
import Image from "next/image";
import { departureLabel } from "@/domain/sail";
import {
  availabilityLabel,
  type SailAvailability,
} from "@/domain/sail-timeline";
import type { PublicVoyage, Voyage } from "@/data/sail-store";
import type { PublicSailPhoto } from "@/data/sail-photo-store";
export type SailTripSummary = {
  voyageId: string;
  acceptedCrew: number;
  acceptedPassengers: number;
  waiting: number;
  drafts: number;
  reconfirm: number;
  enquiries: number;
};
export function SailTripTimeline({
  voyages,
  availability = [],
  summaries = [],
  covers = [],
  owner = false,
  role,
}: {
  voyages: (PublicVoyage | Voyage)[];
  availability?: SailAvailability[];
  summaries?: SailTripSummary[];
  covers?: PublicSailPhoto[];
  owner?: boolean;
  role?: "crew" | "passenger";
}) {
  const active = voyages
    .filter((v) => !["cancelled", "completed"].includes(v.status))
    .filter((v) => {
      const a = availability.find((a) => a.voyageId === v.id);
      return (
        owner ||
        !role ||
        (role === "crew" ? a?.crewNeeded : a?.passengerPlaces) !== 0
      );
    })
    .sort(
      (a, b) =>
        (a.departureFrom ?? "9999").localeCompare(b.departureFrom ?? "9999") ||
        a.title.localeCompare(b.title),
    );
  return (
    <>
      {active.length ? (
        <ol className="sail-trip-timeline">
          {active.map((v, index) => {
            const month = v.departureFrom
              ? new Intl.DateTimeFormat("en-US", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(v.departureFrom + "T12:00:00Z"))
              : "Dates to work out";
            const newMonth =
              index === 0 ||
              active[index - 1].departureFrom?.slice(0, 7) !==
                v.departureFrom?.slice(0, 7);
            const a = availability.find((a) => a.voyageId === v.id),
              s = summaries.find((s) => s.voyageId === v.id),
              photo = covers.find((p) => p.voyageId === v.id),
              href = owner
                ? `/sail/manage/${v.id}`
                : `/sail/voyages/${v.id}${role ? `?as=${role}#enquiry` : ""}`;
            return (
              <li key={v.id}>
                <div className="sail-timeline-date">
                  {newMonth ? (
                    <h3>{month}</h3>
                  ) : (
                    <span className="sail-footnote">Same month</span>
                  )}
                  <p>{departureLabel(v.departureFrom, v.departureTo)}</p>
                  {v.departureTo && v.departureTo !== v.departureFrom ? (
                    <small>Departure window</small>
                  ) : null}
                </div>
                <article className="sail-card sail-timeline-trip">
                  {photo ? (
                    <Image
                      unoptimized
                      className="sail-timeline-photo"
                      src={`/sail/media/${photo.id}`}
                      alt={photo.altText}
                      width={photo.width ?? 900}
                      height={photo.height ?? 550}
                    />
                  ) : null}
                  <p className="sail-kicker">
                    {v.assetName} ·{" "}
                    {v.status === "ready" ? "Ready to go" : v.status}
                    {owner && "published" in v
                      ? ` · ${v.published ? "Public" : "Private draft"}`
                      : ""}
                  </p>
                  <h3>
                    <Link href={href}>{v.title}</Link>
                  </h3>
                  <p className="sail-route">
                    {v.departurePort || "Departure open"} →{" "}
                    {v.arrivalPort || "Destination open"}
                  </p>
                  {v.timingNote ? <p>{v.timingNote}</p> : null}
                  {v.arrivalEstimate ? (
                    <p className="sail-footnote">
                      Estimated arrival{" "}
                      {departureLabel(v.arrivalEstimate, null)}
                    </p>
                  ) : null}
                  <div className="sail-availability">
                    <span>{availabilityLabel(a?.crewNeeded, "crew")}</span>
                    <span>
                      {availabilityLabel(a?.passengerPlaces, "passenger")}
                    </span>
                  </div>
                  {a?.note ? <p className="sail-prose">{a.note}</p> : null}
                  {owner && s ? (
                    <div className="sail-owner-summary">
                      <p>
                        {s.acceptedCrew} crew · {s.acceptedPassengers}{" "}
                        passengers confirmed on this plan
                      </p>
                      <p>
                        {s.drafts} need an invitation · {s.waiting} awaiting a
                        reply · {s.reconfirm} need to reconfirm · {s.enquiries}{" "}
                        new enquiries
                      </p>
                    </div>
                  ) : null}
                  <Link href={href} className="sail-text-link">
                    {owner ? "Manage this trip →" : "Have a look →"}
                  </Link>
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="sail-empty">
          {role
            ? "No trips match this choice yet. Try all trips, or have a chat with me."
            : "I’ll put the next trips here as the plans take shape."}
        </p>
      )}
      {owner &&
      voyages.some((v) => ["completed", "cancelled"].includes(v.status)) ? (
        <details className="sail-details">
          <summary>Completed and cancelled trips</summary>
          {voyages
            .filter((v) => ["completed", "cancelled"].includes(v.status))
            .map((v) => (
              <p key={v.id}>
                <Link href={`/sail/manage/${v.id}`}>{v.title}</Link> ·{" "}
                {v.status}
              </p>
            ))}
        </details>
      ) : null}
    </>
  );
}
