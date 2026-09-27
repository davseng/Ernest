"use client";

import { useActionState } from "react";

import { importGoogleDriveInbox } from "@/app/assets/[id]/drive-actions";

const initialState = { ok: false, message: "" };

export function GoogleDriveInboxPanel({ assetId, configured }: { assetId: string; configured: boolean }) {
  const [state, action, pending] = useActionState(importGoogleDriveInbox.bind(null, assetId), initialState);
  return (
    <div className="compact-form">
      <h3>Google Drive inbox</h3>
      {configured ? <>
        <p>Connect your Google account once, then Ernest can read PDFs from <strong>Ernest Inbox</strong>. Imports are manual for now.</p>
        <div className="record-action-row">
          <a className="secondary-button" href={`/api/google-drive/connect?asset=${encodeURIComponent(assetId)}`}>Connect / reconnect Drive</a>
          <form action={action}><button className="primary-button" disabled={pending}>{pending ? "Checking Drive…" : "Import new documents"}</button></form>
        </div>
        {state.message ? <p className={state.ok ? "write-result success" : "error-notice"}>{state.message}</p> : null}
      </> : <>
        <p>Ernest’s Drive connector is built but needs its Google OAuth credentials before it can be activated.</p>
        <button className="primary-button" disabled>Connect Google Drive</button>
      </>}
    </div>
  );
}
