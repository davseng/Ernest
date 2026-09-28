"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { importGoogleDriveInbox } from "@/app/assets/[id]/drive-actions";

const initialState = { ok: false, message: "" };

export function GoogleDriveInboxPanel({ assetId, configured }: { assetId: string; configured: boolean }) {
  const [state, action, pending] = useActionState(importGoogleDriveInbox.bind(null, assetId), initialState);
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [processMessage, setProcessMessage] = useState("");
  useEffect(() => {
    if (!state.ok || !state.message.match(/^[1-9]\\d* imported/)) return;
    let cancelled = false;
    async function run() {
      setProcessing(true); let good=0,bad=0;
      try { for (;;) { const response=await fetch(`/api/assets/${encodeURIComponent(assetId)}/documents/process-next`,{method:"POST"}); if(!response.ok) throw new Error(); const result=await response.json() as {done?:boolean;ok?:boolean;title?:string}; if(result.done) break; if(result.ok) good+=1; else bad+=1; if(!cancelled)setProcessMessage(`Understanding documents… ${good} complete${bad?` · ${bad} need attention`:""}`); } if(!cancelled)setProcessMessage(`Ready · ${good} processed${bad?` · ${bad} need attention`:""}`); }
      catch { if(!cancelled)setProcessMessage(`Processing paused after ${good} complete. Use Process document inbox to resume.`); }
      finally { if(!cancelled){setProcessing(false);router.refresh();} }
    }
    void run(); return()=>{cancelled=true;};
  },[state.ok,state.message,assetId,router]);
  return (
    <div className="compact-form">
      <h3>Google Drive inbox</h3>
      {configured ? <>
        <p>Connect your Google account once, then Ernest can read PDFs from <strong>Ernest Inbox</strong>. New imports are preserved, extracted, classified, and added to Ernest’s history automatically.</p>
        <div className="record-action-row">
          <a className="secondary-button" href={`/api/google-drive/connect?asset=${encodeURIComponent(assetId)}`}>Connect / reconnect Drive</a>
          <form action={`/api/google-drive/disconnect?asset=${encodeURIComponent(assetId)}`} method="post"><button className="secondary-button" type="submit">Disconnect Drive</button></form>
          <form action={action}><button className="primary-button" disabled={pending}>{pending ? "Checking Drive…" : "Import new documents"}</button></form>
        </div>
        {state.message ? <p className={state.ok ? "write-result success" : "error-notice"}>{state.message}</p> : null}
        {processing || processMessage ? <p className="write-result success">{processing ? processMessage || "Understanding imported documents…" : processMessage}</p> : null}
      </> : <>
        <p>Ernest’s Drive connector is built but needs its Google OAuth credentials before it can be activated.</p>
        <button className="primary-button" disabled>Connect Google Drive</button>
      </>}
    </div>
  );
}
