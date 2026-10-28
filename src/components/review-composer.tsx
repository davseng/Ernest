"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { askErnest } from "@/app/assets/[id]/ask-actions";
export function ReviewComposer({
  assetId,
  initialRequest = "",
}: {
  assetId: string;
  initialRequest?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialRequest),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        try {
          const fd = new FormData();
          fd.set("question", text);
          const result = await askErnest(
            assetId,
            { question: "", answer: "", sources: [] },
            fd,
          );
          if (result.reviewId)
            router.push(`/assets/${assetId}/reviews/${result.reviewId}`);
          else setMessage(result.error || result.answer);
        } catch {
          setMessage("The form could not be prepared. No records changed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Describe the work or update
        <textarea
          maxLength={6000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={6}
        />
      </label>
      <p>
        Include what you know. Ernest can investigate the existing records and
        documents; unknown optional details can stay blank.
      </p>
      <button className="primary-button" disabled={busy}>
        {busy ? "Reading evidence and preparing…" : "Prepare editable review"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
