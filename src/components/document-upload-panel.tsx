"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  completeDirectUpload,
  prepareDirectUpload,
} from "@/app/assets/[id]/document-actions";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_FILES = 12;

type UploadStatus = {
  name: string;
  state: "waiting" | "uploading" | "done" | "error";
  message?: string;
};

export function DocumentUploadPanel({ assetId }: { assetId: string }) {
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
    const selected = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (selected.length === 0) {
      setError("Choose one or more PDFs to upload.");
      return;
    }
    if (selected.length > MAX_BATCH_FILES) {
      setError(`Upload up to ${MAX_BATCH_FILES} PDFs at a time.`);
      return;
    }

    const invalid = selected.find((file) => file.size > MAX_FILE_BYTES || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf"));
    if (invalid) {
      setError(invalid.size > MAX_FILE_BYTES ? `${invalid.name} is larger than 20 MB.` : `${invalid.name} is not a PDF.`);
      return;
    }

    setBusy(true);
    setUploads(selected.map((file) => ({ name: file.name, state: "waiting" })));
    let completed = 0;

    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      try {
        patchStatus(index, { state: "uploading", message: "Preparing secure upload…" });
        const prepared = await prepareDirectUpload(assetId, {
          filename: file.name,
          contentType: file.type || "application/pdf",
          sizeBytes: file.size,
        });

        patchStatus(index, { state: "uploading", message: "Uploading to private storage…" });
        const response = await fetch(prepared.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": prepared.contentType },
          body: file,
        });
        if (!response.ok) throw new Error(`Storage upload failed (${response.status}).`);

        patchStatus(index, { state: "uploading", message: "Saving document record…" });
        await completeDirectUpload(assetId, {
          storageKey: prepared.storageKey,
          title: prepared.title,
          filename: file.name,
          contentType: prepared.contentType,
          expectedSizeBytes: file.size,
        });
        completed += 1;
        patchStatus(index, { state: "done", message: `✓ Added as “${prepared.title}” · needs processing` });
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
      setSummary(`✓ ${completed} of ${selected.length} ${selected.length === 1 ? "document" : "documents"} added to the vault.`);
      formElement.reset();
      router.refresh();
    } else {
      setError("No documents were added. Review the errors below and try again.");
    }
  }

  return (
    <details className="editor-card add-system" open>
      <summary>Add documents to the vault</summary>
      <div className="document-ingest-grid">
        <form className="compact-form" onSubmit={upload}>
          <h3>Drop in PDFs now. Organize later.</h3>
          <label>PDFs<input name="files" type="file" accept="application/pdf,.pdf" multiple required /></label>
          <p>Select up to {MAX_BATCH_FILES} PDFs at once · 20 MB maximum per file. Ernest uses each filename as the starting title, preserves the original privately, and puts new files into the processing inbox.</p>
          {error ? <p className="error-notice">{error}</p> : null}
          {summary ? <p className="write-result success">{summary}</p> : null}
          {uploads.length ? <div className="vault-upload-list" aria-live="polite">{uploads.map((item, index) => (
            <div className={`vault-upload-item ${item.state}`} key={`${item.name}-${index}`}>
              <strong>{item.name}</strong>
              <span>{item.message ?? (item.state === "waiting" ? "Waiting…" : item.state)}</span>
            </div>
          ))}</div> : null}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Adding documents…" : "Add PDFs to vault"}</button>
        </form>
      </div>
    </details>
  );
}
