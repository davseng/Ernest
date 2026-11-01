"use client";
import { useState } from "react";
import {
  exportSailContent,
  checkSailImportTarget,
  importSailContent,
} from "@/app/sail/transfer-actions";
import {
  startSailPhoto,
  finishSailPhoto,
  removeSailPhoto,
} from "@/app/sail/photo-actions";
import {
  maxTransferFileBytes,
  parseSailTransfer,
  type SailTransfer,
} from "@/domain/sail-transfer";
import { maxSailPhotoBytes } from "@/domain/sail-photos";
type ContentFile = {
  content: SailTransfer;
  images: { ref: string; base64: string }[];
};
const base64 = (bytes: Uint8Array) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
};
export function SailContentTransfer({
  assets,
}: {
  assets: { id: string; name: string }[];
}) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [file, setFile] = useState<ContentFile | null>(null),
    [confirmed, setConfirmed] = useState(false);
  async function download() {
    setBusy(true);
    setError("");
    setMessage("Preparing content…");
    try {
      const result = await exportSailContent(assetId);
      if (!result.ok) throw Error(result.error);
      const images: ContentFile["images"] = [];
      let size = 0;
      for (const [index, p] of result.content.photos.entries()) {
        setMessage(
          `Downloading photo ${index + 1} of ${result.content.photos.length}…`,
        );
        const response = await fetch(`/sail/manage/photos/${p.ref}/image`, {
          cache: "no-store",
        });
        if (!response.ok)
          throw Error(
            "A photo could not be downloaded. No export was saved; please try again.",
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > maxSailPhotoBytes)
          throw Error("A photo exceeds the transfer limit.");
        const encoded = base64(bytes);
        size += encoded.length;
        if (size > maxTransferFileBytes - 1024 * 1024)
          throw Error("Content is too large for one transfer file (80 MB).");
        images.push({ ref: p.ref, base64: encoded });
      }
      const blob = new Blob(
        [JSON.stringify({ content: result.content, images })],
        { type: "application/json" },
      );
      if (blob.size > maxTransferFileBytes)
        throw Error("Content is too large for one transfer file (80 MB).");
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "sail-content.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Export downloaded. Open Production’s Content transfer page and choose this file.",
      );
    } catch (e) {
      setMessage("");
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }
  async function importFile() {
    if (!file || !confirmed) return;
    setBusy(true);
    setError("");
    setMessage("Checking destination…");
    const staged: { ref: string; id: string }[] = [];
    let finalizing = false;
    try {
      const check = await checkSailImportTarget(assetId);
      if (!check.ok) throw Error(check.error);
      for (const [index, p] of file.content.photos.entries()) {
        setMessage(
          `Uploading photo ${index + 1} of ${file.content.photos.length}…`,
        );
        const image = file.images.find((i) => i.ref === p.ref)!;
        const decoded = atob(image.base64),
          bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
        const start = await startSailPhoto(
          assetId,
          {
            ...p,
            voyageId: null,
            published: false,
            homeCover: false,
            voyageCover: false,
          },
          "image/webp",
          bytes.length,
        );
        if (!start.ok) throw Error(start.error);
        staged.push({ ref: p.ref, id: start.id });
        const upload = await fetch(start.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/webp" },
          body: bytes,
        });
        if (!upload.ok) throw Error("Photo upload failed.");
        const finish = await finishSailPhoto(start.id);
        if (!finish.ok) throw Error(finish.error);
      }
      setMessage("Saving plans, photo choices and position…");
      finalizing = true;
      const result = await importSailContent(assetId, file.content, staged);
      if (!result.ok) throw Error(result.error);
      setFile(null);
      setConfirmed(false);
      setMessage(
        `Copied ${result.counts.voyages} voyages, ${result.counts.photos} photos${result.counts.position ? " and the position report" : ""}. Publication choices were preserved. No invitations were sent. Open the owner workspace to review.`,
      );
    } catch (e) {
      let cleaned = true;
      if (!finalizing)
        for (const p of staged) {
          try {
            const r = await removeSailPhoto(p.id, 1);
            if (!r.ok) cleaned = false;
          } catch {
            cleaned = false;
          }
        }
      setMessage("");
      setError(
        (e instanceof Error ? e.message : "Import was not confirmed.") +
          (finalizing || !cleaned
            ? " Check Website photos and voyages before retrying; uploaded copies may remain. No existing content was overwritten."
            : " Any temporary upload records were removed."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sail-form">
      <fieldset disabled={busy}>
        <label>
          Vessel
          <select
            value={assetId}
            onChange={(e) => {
              setAssetId(e.target.value);
              setConfirmed(false);
            }}
          >
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <h2>1. Download from Preview</h2>
        <p>
          Includes this vessel’s voyage plans, ready website photos, cover
          choices and position report. The file can contain private drafts and
          joining notes; keep it private.
        </p>
        <button type="button" onClick={download}>
          Download Sail content
        </button>
        <h2>2. Copy into Production</h2>
        <p>
          Open this page on the Production Ernest host and choose the downloaded
          file. The destination vessel must have no Sail content. Guest details,
          invitation links, enquiries and Ernest records are excluded.
        </p>
        <label>
          Sail content file
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              setError("");
              setFile(null);
              setConfirmed(false);
              const selected = e.target.files?.[0];
              e.target.value = "";
              if (!selected) return;
              try {
                if (selected.size > maxTransferFileBytes)
                  throw Error("Choose a content file of 80 MB or smaller.");
                const raw = JSON.parse(await selected.text()),
                  content = parseSailTransfer(raw.content);
                if (
                  !Array.isArray(raw.images) ||
                  raw.images.length !== content.photos.length ||
                  new Set(raw.images.map((i: { ref: string }) => i.ref))
                    .size !== raw.images.length
                )
                  throw Error("The photos do not match this file.");
                for (const p of content.photos) {
                  const i = raw.images.find(
                    (i: { ref: string }) => i.ref === p.ref,
                  );
                  if (
                    typeof i?.base64 !== "string" ||
                    i.base64.length > Math.ceil(maxSailPhotoBytes / 3) * 4 ||
                    !/^[A-Za-z0-9+/]*={0,2}$/.test(i.base64)
                  )
                    throw Error("A photo is missing or too large.");
                }
                setFile({ content, images: raw.images });
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Invalid content file.",
                );
              }
            }}
          />
        </label>
        {file ? (
          <div>
            <p>
              {file.content.voyages.length} voyages ·{" "}
              {file.content.photos.length} photos ·{" "}
              {file.content.position
                ? "1 position report"
                : "no position report"}
            </p>
            <ul>
              {file.content.voyages.map((v) => (
                <li key={v.ref}>
                  {v.title} — {v.published ? "public" : "private"}
                </li>
              ))}
            </ul>
            <label className="sail-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Copy into {assets.find((a) => a.id === assetId)?.name} on this
              website, preserving the file’s public/private choices.
            </label>
          </div>
        ) : null}
        <button
          type="button"
          className="sail-button"
          disabled={!file || !confirmed}
          onClick={importFile}
        >
          Copy Sail content
        </button>
      </fieldset>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
