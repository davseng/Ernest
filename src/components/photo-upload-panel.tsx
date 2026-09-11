"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  completePhotoUpload,
  preparePhotoUpload,
} from "@/app/assets/[id]/photo-actions";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_FILES = 12;

type UploadStatus = {
  name: string;
  state: "waiting" | "uploading" | "done" | "error";
  message?: string;
};

export function PhotoUploadPanel({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const [summary, setSummary] = useState<string>();

  function patchStatus(index: number, patch: Partial<UploadStatus>) {
    setUploads((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(undefined);
    setSummary(undefined);
    const form = new FormData(formElement);
    const selected = form.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (selected.length === 0) {
      setError("Choose one or more photos to upload.");
      return;
    }
    if (selected.length > MAX_BATCH_FILES) {
      setError(`Upload up to ${MAX_BATCH_FILES} photos at a time.`);
      return;
    }
    const tooLarge = selected.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than 20 MB.`);
      return;
    }

    setBusy(true);
    setUploads(selected.map((file) => ({ name: file.name, state: "waiting" })));
    let completed = 0;

    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      try {
        patchStatus(index, { state: "uploading", message: "Preparing secure upload…" });
        const prepared = await preparePhotoUpload(assetId, {
          filename: file.name,
          contentType: file.type || "image/jpeg",
          sizeBytes: file.size,
        });

        patchStatus(index, { state: "uploading", message: "Uploading to private storage…" });
        let response: Response;
        try {
          response = await fetch(prepared.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": prepared.contentType },
            body: file,
          });
        } catch (networkError) {
          console.error(networkError);
          throw new Error("Browser could not reach private storage. Check the R2 CORS origin for this Preview.");
        }
        if (!response.ok) throw new Error(`Private storage rejected the upload (${response.status}).`);

        patchStatus(index, { state: "uploading", message: "Saving photo record…" });
        await completePhotoUpload(assetId, {
          storageKey: prepared.storageKey,
          title: prepared.title,
          filename: file.name,
          contentType: prepared.contentType,
          expectedSizeBytes: file.size,
        });
        completed += 1;
        patchStatus(index, { state: "done", message: `✓ Added as “${prepared.title}”` });
      } catch (uploadError) {
        console.error(uploadError);
        patchStatus(index, {
          state: "error",
          message: uploadError instanceof Error ? uploadError.message : "Upload failed.",
        });
      }
    }

    setBusy(false);
    if (completed > 0) {
      setSummary(`✓ ${completed} of ${selected.length} ${selected.length === 1 ? "photo" : "photos"} added as evidence.`);
      formElement.reset();
      router.refresh();
    } else {
      setError("No photos were added. Review the errors below and try again.");
    }
  }

  return (
    <details className="editor-card add-system" open>
      <summary>Add photo evidence</summary>
      <div className="document-ingest-grid">
        <form className="compact-form" onSubmit={upload}>
          <h3>Photograph it now. Identify it later.</h3>
          <label>Photos<input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple required /></label>
          <p>Select up to {MAX_BATCH_FILES} photos at once · 20 MB maximum per file. Originals stay private. You can add notes or associate a photo with installed equipment after upload.</p>
          {error ? <p className="error-notice">{error}</p> : null}
          {summary ? <p className="write-result success">{summary}</p> : null}
          {uploads.length ? <div className="vault-upload-list" aria-live="polite">{uploads.map((item, index) => (
            <div className={`vault-upload-item ${item.state}`} key={`${item.name}-${index}`}>
              <strong>{item.name}</strong>
              <span>{item.message ?? (item.state === "waiting" ? "Waiting…" : item.state)}</span>
            </div>
          ))}</div> : null}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Adding photos…" : "Add photos"}</button>
        </form>
      </div>
    </details>
  );
}
