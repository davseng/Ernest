"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  sailPhotoCategories,
  maxSailPhotoBytes,
  type SailPhotoInput,
} from "@/domain/sail-photos";
import type { SailPhoto } from "@/data/sail-photo-store";
import {
  startSailPhoto,
  finishSailPhoto,
  updateSailPhoto,
  removeSailPhoto,
} from "@/app/sail/photo-actions";
type Choice = { id: string; name: string };
export function SailPhotoManager({
  assets,
  voyages,
  photos,
}: {
  assets: Choice[];
  voyages: { id: string; assetId: string; title: string }[];
  photos: SailPhoto[];
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [asset, setAsset] = useState(assets[0]?.id ?? "");
  const result = async (
    work: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await work();
      if (r.ok) {
        setMessage(r.message ?? "Saved.");
        router.refresh();
      } else {
        setError(r.error ?? "The photo could not be saved.");
        router.refresh();
      }
    } catch {
      setError("The photo action was not confirmed. Reload before retrying.");
    } finally {
      setBusy(false);
    }
  };
  async function upload(form: HTMLFormElement) {
    if (busy) return;
    const d = new FormData(form),
      file = d.get("photo");
    if (!(file instanceof File) || !file.size) {
      setError("Choose a photo.");
      return;
    }
    if (file.size > maxSailPhotoBytes) {
      setError("Choose a photo of 10 MB or smaller.");
      return;
    }
    await result(async () => {
      const prepared = await startSailPhoto(
        asset,
        {
          caption: d.get("caption"),
          altText: d.get("altText"),
          category: d.get("category"),
          voyageId: d.get("voyageId"),
        },
        file.type,
        file.size,
      );
      if (!prepared.ok) return prepared;
      const uploaded = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploaded.ok)
        return {
          ok: false,
          error:
            "The file did not upload. Check the storage CORS settings or try again. Remove the unfinished entry before retrying.",
        };
      const done = await finishSailPhoto(prepared.id);
      if (done.ok) form.reset();
      return done;
    });
  }
  return (
    <>
      <form
        className="sail-form sail-inset"
        aria-label="Upload website photo"
        onSubmit={(e) => {
          e.preventDefault();
          void upload(e.currentTarget);
        }}
      >
        <fieldset disabled={busy}>
          <h2>Add a photo</h2>
          <div className="sail-fields">
            <label>
              Vessel
              <select value={asset} onChange={(e) => setAsset(e.target.value)}>
                {assets.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Section
              <select aria-label="Section" name="category">
                {Object.entries(sailPhotoCategories).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Caption
            <input name="caption" maxLength={240} required />
          </label>
          <label>
            Image description
            <input
              name="altText"
              maxLength={500}
              placeholder="Optional; the caption is used if blank"
            />
          </label>
          <label>
            Photo for
            <select aria-label="Photo for" name="voyageId" key={asset}>
              <option value="">The Boat / homepage</option>
              {voyages
                .filter((v) => v.assetId === asset)
                .map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Photo file
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </label>
          <button className="sail-button">
            {busy ? "Working…" : "Upload private photo"}
          </button>
          <small>
            JPEG, PNG or WebP, up to 10 MB. Uploads stay private until you
            publish them.
          </small>
        </fieldset>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <section>
        <h2>Your photos</h2>
        {!photos.length ? (
          <p>No website photos uploaded yet.</p>
        ) : (
          <div className="sail-photo-admin">
            {photos.map((p) => (
              <PhotoEditor
                key={p.id + ":" + p.revision + ":" + p.ready}
                photo={p}
                voyages={voyages.filter((v) => v.assetId === p.assetId)}
                busy={busy}
                run={result}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
function PhotoEditor({
  photo: p,
  voyages,
  busy,
  run,
}: {
  photo: SailPhoto;
  voyages: { id: string; title: string }[];
  busy: boolean;
  run: (
    work: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) => Promise<void>;
}) {
  const [v, setV] = useState<SailPhotoInput>(p),
    patch = (values: Partial<SailPhotoInput>) =>
      setV((old) => ({ ...old, ...values }));
  return (
    <article className="sail-card">
      {p.ready ? (
        <Image
          unoptimized
          src={`/sail/manage/photos/${p.id}/image`}
          alt={p.altText}
          width={p.width ?? 1200}
          height={p.height ?? 800}
        />
      ) : (
        <p className="sail-notice">
          Upload unfinished. Remove this entry and upload again.
        </p>
      )}
      <p className="sail-kicker">
        {p.assetName} · {p.published ? "Public" : "Private"}
      </p>
      <form
        className="sail-form"
        aria-label={`Edit photo: ${p.caption}`}
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => updateSailPhoto(p.id, v, p.revision));
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Caption
            <input
              value={v.caption}
              maxLength={240}
              required
              onChange={(e) => patch({ caption: e.target.value })}
            />
          </label>
          <label>
            Image description
            <input
              value={v.altText}
              maxLength={500}
              required
              onChange={(e) => patch({ altText: e.target.value })}
            />
          </label>
          <label>
            Section
            <select
              value={v.category}
              onChange={(e) =>
                patch({
                  category: e.target.value as SailPhotoInput["category"],
                })
              }
            >
              {Object.entries(sailPhotoCategories).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Photo for
            <select
              value={v.voyageId ?? ""}
              onChange={(e) =>
                patch({
                  voyageId: e.target.value || null,
                  homeCover: false,
                  voyageCover: false,
                })
              }
            >
              <option value="">The Boat / homepage</option>
              {voyages.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Order
            <input
              type="number"
              min={0}
              max={9999}
              value={v.position}
              onChange={(e) => patch({ position: Number(e.target.value) })}
            />
          </label>
          <label className="sail-check">
            <input
              type="checkbox"
              disabled={!p.ready}
              checked={v.published}
              onChange={(e) =>
                patch({
                  published: e.target.checked,
                  homeCover: false,
                  voyageCover: false,
                })
              }
            />
            Publish this photo
          </label>
          {v.published ? (
            <label className="sail-check">
              <input
                type="checkbox"
                checked={v.voyageId ? v.voyageCover : v.homeCover}
                onChange={(e) =>
                  patch(
                    v.voyageId
                      ? { voyageCover: e.target.checked }
                      : { homeCover: e.target.checked },
                  )
                }
              />
              {v.voyageId ? "Use as voyage cover" : "Use as homepage cover"}
            </label>
          ) : null}
          <button className="sail-button">Save photo</button>
        </fieldset>
      </form>
      <details>
        <summary>Remove photo</summary>
        <p>
          This removes the website copy. Private Ernest evidence is unaffected.
        </p>
        <button
          disabled={busy}
          onClick={() => void run(() => removeSailPhoto(p.id, p.revision))}
        >
          Confirm removal
        </button>
      </details>
    </article>
  );
}
