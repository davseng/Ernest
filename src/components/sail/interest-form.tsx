"use client";
import { useState } from "react";
import { submitSailInterest } from "@/app/sail/actions";
export function SailInterestForm({ voyageId }: { voyageId: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  if (message) return <p role="status">{message}</p>;
  return (
    <form
      className="sail-form"
      aria-label="Voyage enquiry"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const d = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          const r = await submitSailInterest(voyageId, Object.fromEntries(d));
          if (r.ok) setMessage(r.message);
          else setError(r.error);
        } catch {
          setError("Your enquiry was not confirmed. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <div className="sail-fields">
          <label>
            Your name
            <input name="fullName" maxLength={160} required />
          </label>
          <label>
            Email
            <input type="email" name="email" maxLength={254} required />
          </label>
          <label>
            Interested in joining as
            <select name="role">
              <option value="crew">Crew</option>
              <option value="passenger">Passenger</option>
            </select>
          </label>
        </div>
        <label>
          What would you like us to know?
          <textarea name="message" maxLength={2000} rows={3} />
        </label>
        <div className="sail-honeypot" aria-hidden="true">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        <button className="sail-button">
          {busy ? "Sending…" : "Send enquiry"}
        </button>
      </fieldset>
    </form>
  );
}
