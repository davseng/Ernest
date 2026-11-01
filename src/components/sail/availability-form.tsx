"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSailAvailability } from "@/app/sail/timeline-actions";
import type { SailAvailability } from "@/domain/sail-timeline";
export function SailAvailabilityForm({
  voyageId,
  initial,
}: {
  voyageId: string;
  initial?: SailAvailability | null;
}) {
  const [crew, setCrew] = useState(initial?.crewNeeded?.toString() ?? ""),
    [passengers, setPassengers] = useState(
      initial?.passengerPlaces?.toString() ?? "",
    ),
    [note, setNote] = useState(initial?.note ?? ""),
    [revision, setRevision] = useState(initial?.revision ?? 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <section className="sail-section">
      <h2>Who can join?</h2>
      <p>
        Enter how many more people you’re looking for. These are remaining
        places, not total berths. Leave a number blank to say “Ask me”; use 0
        when no places are open.
      </p>
      <form
        className="sail-form"
        aria-label="Trip availability"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          setMessage("");
          try {
            const r = await saveSailAvailability(
              voyageId,
              { crewNeeded: crew, passengerPlaces: passengers, note },
              revision,
            );
            if (r.ok) {
              setRevision(r.revision);
              setMessage(
                "Availability saved. Existing guest responses are unchanged.",
              );
              router.refresh();
            } else setError(r.error);
          } catch {
            setError("The save was not confirmed. Reload before retrying.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <div className="sail-fields">
            <label>
              More crew needed
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={crew}
                onChange={(e) => setCrew(e.target.value)}
              />
            </label>
            <label>
              Passenger places open
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={passengers}
                onChange={(e) => setPassengers(e.target.value)}
              />
            </label>
          </div>
          <label>
            A note about space
            <textarea
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="sail-footnote">
            Shown on published trips. Update these numbers as plans change;
            invitations and acceptances don’t adjust them automatically.
          </p>
          <button className="sail-button">Save availability</button>
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
      </form>
    </section>
  );
}
