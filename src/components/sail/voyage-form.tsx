"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { blankVoyage, voyageStatuses, type VoyageInput } from "@/domain/sail";
import { saveSailVoyage } from "@/app/sail/actions";
export function SailVoyageForm({
  assets,
  initial,
  id,
  assetId,
  revision,
  onSaved,
  onDirty,
}: {
  assets: { id: string; name: string }[];
  initial?: VoyageInput;
  id?: string;
  assetId?: string;
  revision?: number;
  onSaved?: () => void;
  onDirty?: () => void;
}) {
  const router = useRouter(),
    [v, setV] = useState(initial ?? blankVoyage()),
    [asset, setAsset] = useState(assetId ?? assets[0]?.id ?? ""),
    [window, setWindow] = useState(!!initial?.departureTo),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const patch = (values: Partial<VoyageInput>) => {
    setV((p) => ({ ...p, ...values }));
    setMessage("");
    onDirty?.();
  };
  const text = (key: keyof VoyageInput, label: string, required = false) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={String(v[key] ?? "")}
        required={required}
        onChange={(e) => patch({ [key]: e.target.value })}
      />
    </label>
  );
  const area = (key: keyof VoyageInput, label: string, rows = 3) => (
    <label>
      {label}
      <textarea
        aria-label={label}
        rows={rows}
        value={String(v[key] ?? "")}
        onChange={(e) => patch({ [key]: e.target.value })}
      />
    </label>
  );
  return (
    <form
      className="sail-form"
      aria-label="Voyage editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const result = await saveSailVoyage(
            asset,
            id ?? null,
            { ...v, departureTo: window ? v.departureTo : null },
            revision,
          );
          if (!result.ok) setError(result.error);
          else {
            if (onSaved) onSaved();
            else setMessage(result.message);
            if (!id) router.push(`/sail/manage/${result.id}`);
            else router.refresh();
          }
        } catch {
          setError("No save was confirmed. Reload before retrying.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {!id ? (
          <label>
            Vessel
            <select
              aria-label="Vessel"
              value={asset}
              onChange={(e) => {
                setAsset(e.target.value);
                onDirty?.();
              }}
            >
              {assets.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {text("title", "Voyage name", true)}
        <div className="sail-fields">
          {text("departurePort", "From")}
          {text("arrivalPort", "To")}
        </div>
        {area("summary", "About this voyage")}
        <section className="sail-inset">
          <h2>Timing</h2>
          <div className="sail-fields">
            <label>
              {window ? "Earliest departure" : "Target departure"}
              <input
                aria-label={window ? "Earliest departure" : "Target departure"}
                type="date"
                value={v.departureFrom ?? ""}
                onChange={(e) =>
                  patch({ departureFrom: e.target.value || null })
                }
              />
            </label>
            {window ? (
              <label>
                Latest departure
                <input
                  aria-label="Latest departure"
                  type="date"
                  value={v.departureTo ?? ""}
                  onChange={(e) =>
                    patch({ departureTo: e.target.value || null })
                  }
                />
              </label>
            ) : null}
            <label>
              Estimated arrival
              <input
                aria-label="Estimated arrival"
                type="date"
                value={v.arrivalEstimate ?? ""}
                onChange={(e) =>
                  patch({ arrivalEstimate: e.target.value || null })
                }
              />
            </label>
          </div>
          <label className="sail-check">
            <input
              type="checkbox"
              checked={window}
              onChange={(e) => {
                setWindow(e.target.checked);
                onDirty?.();
              }}
            />
            Use a departure window
          </label>
          {area("timingNote", "Timing note", 2)}
          <small>
            Dates can stay open. Share weather or readiness changes here.
          </small>
        </section>
        <label>
          Status
          <select
            aria-label="Status"
            value={v.status}
            onChange={(e) =>
              patch({ status: e.target.value as VoyageInput["status"] })
            }
          >
            {voyageStatuses.map((s) => (
              <option key={s} value={s}>
                {s === "ready"
                  ? "Ready to go"
                  : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <details className="sail-details">
          <summary>What to expect · crew and passengers</summary>
          {area("crewExpectations", "Crew guidance", 5)}
          {area("passengerExpectations", "Passenger guidance", 5)}
          <p>Each invitation shows only the guidance for that person’s role.</p>
        </details>
        <details className="sail-details">
          <summary>Private joining details</summary>
          {area("boardingNotes", "Joining details", 4)}
          <p>Shared with invitees, never on the public voyage page.</p>
        </details>
        <label className="sail-check">
          <input
            type="checkbox"
            checked={v.published}
            onChange={(e) => patch({ published: e.target.checked })}
          />
          Show this voyage on the public website
        </label>
        {error ? <p role="alert">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        <button className="sail-button" disabled={!asset}>
          {busy ? "Saving…" : "Save voyage"}
        </button>
      </fieldset>
      <p className="sail-footnote">
        Saving does not send emails. Invitees always see the latest plan, and
        accepted invitations show when a plan needs another review.
      </p>
    </form>
  );
}
