"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DocumentInboxProcessor({ assetId, waiting }: { assetId: string; waiting: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [message, setMessage] = useState("");

  async function processInbox() {
    setRunning(true);
    setProcessed(0);
    setFailed(0);
    setMessage("Starting…");

    let good = 0;
    let bad = 0;
    try {
      // Each document gets its own request. Large scanned PDFs can use OCR,
      // so this avoids one long Vercel request for an entire box of documents.
      for (;;) {
        const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/documents/process-next`, {
          method: "POST",
        });
        if (!response.ok) throw new Error("Inbox processing request failed.");
        const result = await response.json() as {
          done?: boolean;
          ok?: boolean;
          title?: string;
          message?: string;
        };
        if (result.done) break;
        if (result.ok) {
          good += 1;
          setProcessed(good);
        } else {
          bad += 1;
          setFailed(bad);
        }
        setMessage(result.message ?? "Processing…");
      }
      setMessage(good || bad ? `Finished · ${good} processed${bad ? ` · ${bad} need attention` : ""}` : "Nothing is waiting.");
      router.refresh();
    } catch {
      setMessage(`Stopped after ${good} processed${bad ? ` · ${bad} need attention` : ""}. You can safely resume.`);
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="compact-form">
      <h3>Process document inbox</h3>
      <p>Extract and index every waiting PDF. Ernest handles them one at a time, so you can leave the batch running without opening each document.</p>
      <button className="primary-button" type="button" disabled={running || waiting === 0} onClick={processInbox}>
        {running ? `Processing… ${processed} complete` : waiting ? `Process ${waiting} waiting document${waiting === 1 ? "" : "s"}` : "Inbox is processed"}
      </button>
      {message ? <p className={failed ? "error-notice" : "write-result success"}>{message}</p> : null}
    </div>
  );
}
