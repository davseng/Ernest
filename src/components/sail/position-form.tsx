"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SailPositionMap } from "@/components/sail/position-map";
import { saveSailPosition } from "@/app/sail/position-actions";
import type { SailPosition } from "@/data/sail-position-store";
import type { SailPositionInput } from "@/domain/sail-position";
export function SailPositionForm({
  assetId,
  initial,
  photos,
}: {
  assetId: string;
  initial: SailPosition | null;
  photos: { id: string; caption: string }[];
}) {
  const router = useRouter(),
    [p, setP] = useState<SailPositionInput>(
      initial ?? {
        placeLabel: "",
        reportedOn: "",
        latitude: null,
        longitude: null,
        note: "",
        photoId: null,
        published: false,
      },
    ),
    [pin, setPin] = useState(initial?.latitude != null),
    [baseRevision, setBaseRevision] = useState(initial?.revision ?? 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const patch = (values: Partial<SailPositionInput>) => {
    setP((old) => ({ ...old, ...values }));
    setMessage("");
  };
  return (
    <form
      className="sail-form"
      aria-label="Position update"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const result = await saveSailPosition(
            assetId,
            {
              ...p,
              latitude: pin ? p.latitude : null,
              longitude: pin ? p.longitude : null,
            },
            baseRevision,
          );
          if (result.ok) {
            setBaseRevision(result.revision);
            setMessage(result.message);
            router.refresh();
          } else setError(result.error);
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
            Place
            <input
              aria-label="Place"
              value={p.placeLabel}
              maxLength={160}
              required
              onChange={(e) => patch({ placeLabel: e.target.value })}
            />
          </label>
          <label>
            Reported on
            <input
              aria-label="Reported on"
              type="date"
              required
              value={p.reportedOn}
              onChange={(e) => patch({ reportedOn: e.target.value })}
            />
          </label>
        </div>
        <label>
          My update
          <textarea
            aria-label="My update"
            rows={3}
            value={p.note}
            maxLength={1500}
            onChange={(e) => patch({ note: e.target.value })}
          />
        </label>
        <label className="sail-check">
          <input
            type="checkbox"
            checked={pin}
            onChange={(e) => {
              setPin(e.target.checked);
              patch(
                e.target.checked ? {} : { latitude: null, longitude: null },
              );
            }}
          />
          Include a map pin
        </label>
        {pin ? (
          <>
            <SailPositionMap
              latitude={p.latitude}
              longitude={p.longitude}
              placeLabel={p.placeLabel}
              onPick={(latitude, longitude) => patch({ latitude, longitude })}
            />
            <p className="sail-footnote">
              Move the map and tap to place the pin, or enter coordinates below.
            </p>
            <div className="sail-fields">
              <label>
                Latitude
                <input
                  aria-label="Latitude"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  required
                  value={p.latitude ?? ""}
                  onChange={(e) =>
                    patch({
                      latitude:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Longitude
                <input
                  aria-label="Longitude"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  required
                  value={p.longitude ?? ""}
                  onChange={(e) =>
                    patch({
                      longitude:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
          </>
        ) : null}
        <label>
          A photo from here
          <select
            aria-label="A photo from here"
            value={p.photoId ?? ""}
            onChange={(e) => patch({ photoId: e.target.value || null })}
          >
            <option value="">No photo</option>
            {p.photoId && !photos.some((photo) => photo.id === p.photoId) ? (
              <option value={p.photoId} disabled>
                Photo no longer public — choose another
              </option>
            ) : null}
            {photos.map((photo) => (
              <option key={photo.id} value={photo.id}>
                {photo.caption}
              </option>
            ))}
          </select>
        </label>
        <label className="sail-check">
          <input
            type="checkbox"
            checked={p.published}
            onChange={(e) => patch({ published: e.target.checked })}
          />
          Show this report on the public website
        </label>
        {error ? <p role="alert">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        <button className="sail-button">
          {busy ? "Saving…" : "Save report"}
        </button>
      </fieldset>
      <p className="sail-footnote">
        This is a report from you, not live tracking. Leave the pin off to share
        just the place name. This does not change trip plans or send guest
        invitations.
      </p>
    </form>
  );
}
