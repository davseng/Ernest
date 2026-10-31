import { departureLabel } from "@/domain/sail";
import type { PublicVoyage } from "@/data/sail-store";
export function SailVoyageOverview({ voyage: v }: { voyage: PublicVoyage }) {
  return (
    <>
      <div className="sail-kicker">
        {v.assetName}{" "}
        <span className="sail-pill">
          {v.status === "ready" ? "Ready to go" : v.status}
        </span>
      </div>
      <h1>{v.title}</h1>
      <p className="sail-route">
        {v.departurePort || "Departure to be arranged"}{" "}
        <span aria-label="to">→</span>{" "}
        {v.arrivalPort || "Destination to be arranged"}
      </p>
      <div className="sail-timing">
        <strong>{departureLabel(v.departureFrom, v.departureTo)}</strong>
        {v.arrivalEstimate ? (
          <span>
            Estimated arrival: {departureLabel(v.arrivalEstimate, null)}
          </span>
        ) : null}
        {v.timingNote ? <p className="sail-prose">{v.timingNote}</p> : null}
        <small>Weather and vessel readiness may change the plan.</small>
      </div>
      {v.summary ? <p className="sail-prose">{v.summary}</p> : null}
    </>
  );
}
