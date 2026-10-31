"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToSailInvitation } from "@/app/sail/actions";
export function SailGuestResponse({
  token,
  voyageRevision,
  participantRevision,
  closed,
}: {
  token: string;
  voyageRevision: number;
  participantRevision: number;
  closed: boolean;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
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
      <div className="sail-actions">
        <button
          className="sail-button"
          disabled={busy}
          onClick={() => void respond("accepted")}
        >
          Accept current plan
        </button>
        <button disabled={busy} onClick={() => void respond("declined")}>
          Decline
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <p className="sail-footnote">
        You can return to this link to review the latest plan or change your
        response.
      </p>
    </div>
  );
}
