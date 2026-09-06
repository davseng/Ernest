"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  completeDirectUpload,
  prepareDirectUpload,
} from "@/app/assets/[id]/document-actions";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function DocumentUploadPanel({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<string>();

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setProgress(undefined);
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a PDF to upload.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("PDF must be 20 MB or smaller.");
      return;
    }

    setBusy(true);
    try {
      setProgress("Preparing secure upload…");
      const prepared = await prepareDirectUpload(assetId, {
        title,
        filename: file.name,
        contentType: file.type || "application/pdf",
        sizeBytes: file.size,
      });

      setProgress("Uploading directly to private storage…");
      const response = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": prepared.contentType },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Storage upload failed (${response.status}).`);
      }

      setProgress("Finishing document record…");
      await completeDirectUpload(assetId, {
        storageKey: prepared.storageKey,
        title: prepared.title,
        filename: file.name,
        contentType: prepared.contentType,
        expectedSizeBytes: file.size,
      });
      event.currentTarget.reset();
      setProgress("Uploaded. Ready for text extraction.");
      router.refresh();
    } catch (uploadError) {
      console.error(uploadError);
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="editor-card add-system" open>
      <summary>Add a document</summary>
      <div className="document-ingest-grid">
        <form className="compact-form" onSubmit={upload}>
          <h3>Upload PDF</h3>
          <label>Title<input name="title" maxLength={200} required /></label>
          <label>PDF<input name="file" type="file" accept="application/pdf,.pdf" required /></label>
          <p>PDF only · maximum 20 MB. The browser sends the file directly to private R2 storage.</p>
          {error ? <p className="error-notice">{error}</p> : null}
          {progress ? <p>{progress}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload PDF"}</button>
        </form>
      </div>
    </details>
  );
}
