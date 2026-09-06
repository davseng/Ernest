"use client";

import { useActionState } from "react";

import { uploadDocumentFromUrl } from "@/app/assets/[id]/document-actions";

const initialState = { error: null as string | null };

export function DocumentUrlImportForm({ assetId }: { assetId: string }) {
  const [state, action, pending] = useActionState(uploadDocumentFromUrl.bind(null, assetId), initialState);

  return (
    <details className="editor-card add-system" open={Boolean(state.error)}>
      <summary>Add from URL</summary>
      <form className="compact-form" action={action}>
        <label>Title<input name="title" maxLength={200} required /></label>
        <label>Public PDF URL<input name="url" type="url" placeholder="https://manufacturer.com/manual.pdf" required /></label>
        <p>Ernest downloads the PDF server-to-server into the same private R2 library. HTTPS only · maximum 20 MB.</p>
        {state.error ? <p role="alert"><strong>Couldn’t add PDF:</strong> {state.error}</p> : null}
        <button className="primary-button" type="submit" disabled={pending}>{pending ? "Adding…" : "Add from URL"}</button>
      </form>
    </details>
  );
}
