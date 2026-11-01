"use client";
import { useState, useEffect, useRef } from "react";
import { submitSailInterest } from "@/app/sail/actions";
export function SailInterestForm({
  voyageId,
  preferredRole = "crew",
}: {
  voyageId: string;
  preferredRole?: "crew" | "passenger";
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [sent, setSent] = useState<{
      name: string;
      email: string;
      role: string;
      note: string;
    } | null>(null);
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) receiptHeading.current?.focus();
  }, [sent]);
  if (message && sent)
    return (
      <section className="sail-inset" aria-labelledby="sail-note-sent">
        <h3 id="sail-note-sent" ref={receiptHeading} tabIndex={-1}>
          Your note is with me.
        </h3>
        <p role="status">{message}</p>
        <dl className="sail-receipt">
          <dt>Name</dt>
          <dd>{sent.name}</dd>
          <dt>Reply to</dt>
          <dd>{sent.email}</dd>
          <dt>Interested in joining as</dt>
          <dd>{sent.role}</dd>
          {sent.note ? (
            <>
              <dt>Your note</dt>
              <dd className="sail-prose">{sent.note}</dd>
            </>
          ) : null}
        </dl>
        <p>
          Next, we’ll talk about the trip. If we work out a plan together, I’ll
          send you a personal invitation to respond to. There’s no account to
          create.
        </p>
      </section>
    );
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
          if (r.ok) {
            setSent({
              name: String(d.get("fullName") ?? ""),
              email: String(d.get("email") ?? ""),
              role: String(d.get("role") ?? ""),
              note: String(d.get("message") ?? ""),
            });
            setMessage(r.message);
          } else setError(r.error);
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
            <input
              name="fullName"
              maxLength={160}
              autoComplete="name"
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              maxLength={254}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Interested in joining as
            <select name="role" defaultValue={preferredRole}>
              <option value="crew">Crew</option>
              <option value="passenger">Passenger</option>
            </select>
          </label>
        </div>
        <label>
          Anything you’d like to ask or tell me?
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
          {busy ? "Sending…" : "Send note"}
        </button>
      </fieldset>
    </form>
  );
}
