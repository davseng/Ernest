"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToSailInvitation } from "@/app/sail/actions";
export function SailGuestResponse({
  token,
  voyageRevision,
  participantRevision,
  closed,
  initialStatus = "invited",
  needsReconfirmation = false,
}: {
  token: string;
  voyageRevision: number;
  participantRevision: number;
  closed: boolean;
  initialStatus?: "invited" | "accepted" | "declined" | "cancelled";
  needsReconfirmation?: boolean;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [response, setResponse] = useState(initialStatus),
    [reconfirm, setReconfirm] = useState(needsReconfirmation);
  async function respond(status: "accepted" | "declined") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await respondToSailInvitation(
        token,
        status,
        voyageRevision,
        participantRevision,
      );
      if (r.ok) {
        setResponse(status);
        setReconfirm(false);
        setMessage(r.message);
        router.refresh();
      } else setError(r.error);
    } catch {
      setError("Your response was not confirmed. Reload before trying again.");
    } finally {
      setBusy(false);
    }
  }
  if (closed)
    return <p className="sail-notice">This voyage is closed to responses.</p>;
  return (
    <div>
      <p role="status">
        {response === "accepted" && !reconfirm
          ? "You’re on board — your acceptance is saved."
          : response === "declined"
            ? "You’ve let me know you can’t make this one."
            : reconfirm
              ? "The plan changed. Please confirm whether the updated plan works for you."
              : "I haven’t received your answer yet. Choose below when you’re ready."}
      </p>
      <div className="sail-actions">
        <button
          className="sail-button"
          disabled={busy || (response === "accepted" && !reconfirm)}
          onClick={() => void respond("accepted")}
        >
          {reconfirm
            ? "Yes, the updated plan works"
            : response === "accepted"
              ? "You’re on board"
              : "Count me in"}
        </button>
        <button
          disabled={busy || response === "declined"}
          onClick={() => void respond("declined")}
        >
          I can’t make this one
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p>{message}</p> : null}
      <p className="sail-footnote">
        You can return to this link to review the latest plan or change your
        response.
      </p>
    </div>
  );
}
