"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addSailPerson,
  updateSailPerson,
  sendSailPerson,
  cancelSailPerson,
  reviewSailEnquiry,
  type SailResult,
} from "@/app/sail/actions";
import type { Participant } from "@/data/sail-store";
export function SailPeople({
  voyageId,
  people,
  voyageRevision,
  enquiries,
}: {
  voyageId: string;
  people: Participant[];
  voyageRevision: number;
  enquiries: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    message: string;
    reviewed: boolean;
  }[];
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function run(work: () => Promise<SailResult>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await work();
      if (r.ok) {
        setMessage(r.message);
        router.refresh();
      } else setError(r.error);
      return r;
    } catch {
      setError("The action could not be confirmed. Reload before retrying.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sail-section">
      <h2>People</h2>
      <form
        className="sail-form"
        aria-label="Add a person"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            d = new FormData(form);
          const result = await run(() =>
            addSailPerson(voyageId, {
              fullName: d.get("fullName"),
              email: d.get("email"),
              role: d.get("role"),
            }),
          );
          if (result?.ok) form.reset();
        }}
      >
        <fieldset disabled={busy}>
          <div className="sail-fields">
            <label>
              Name
              <input name="fullName" maxLength={160} required />
            </label>
            <label>
              Email
              <input name="email" type="email" maxLength={254} required />
            </label>
            <label>
              Joining as
              <select name="role">
                <option value="crew">Crew</option>
                <option value="passenger">Passenger</option>
              </select>
            </label>
          </div>
          <button className="sail-button" type="submit">
            Add person
          </button>
        </fieldset>
      </form>
      {people.length ? (
        <ul className="sail-people">
          {people.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.fullName}</strong>
                <span>
                  {p.role === "crew" ? "Crew" : "Passenger"} · {p.status}
                  {p.status === "accepted" &&
                  p.acceptedRevision !== voyageRevision
                    ? " · plan changed; review needed"
                    : ""}
                </span>
                <span>{p.email}</span>
                <small>
                  Email:{" "}
                  {p.deliveryStatus === "sent"
                    ? "accepted for delivery"
                    : p.deliveryStatus.replaceAll("_", " ")}
                </small>
                <details className="sail-person-edit">
                  <summary>
                    Edit person
                    {p.status === "cancelled" ? " or invite again" : ""}
                  </summary>
                  <form
                    className="sail-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      await run(() =>
                        updateSailPerson(
                          voyageId,
                          p.id,
                          {
                            fullName: d.get("fullName"),
                            email: d.get("email"),
                            role: d.get("role"),
                          },
                          p.revision,
                        ),
                      );
                    }}
                  >
                    <fieldset disabled={busy}>
                      <label>
                        Name
                        <input
                          name="fullName"
                          defaultValue={p.fullName}
                          maxLength={160}
                          required
                        />
                      </label>
                      <label>
                        Email
                        <input
                          name="email"
                          type="email"
                          defaultValue={p.email}
                          maxLength={254}
                          required
                        />
                      </label>
                      <label>
                        Joining as
                        <select name="role" defaultValue={p.role}>
                          <option value="crew">Crew</option>
                          <option value="passenger">Passenger</option>
                        </select>
                      </label>
                      <button>Save person and reset invitation</button>
                    </fieldset>
                  </form>
                </details>
              </div>
              <div className="sail-actions">
                {p.status !== "cancelled" ? (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() => sendSailPerson(voyageId, p.id))
                      }
                    >
                      {p.deliveryStatus === "sent"
                        ? "Send fresh invitation"
                        : "Send invitation"}
                    </button>
                    <details>
                      <summary>Cancel invitation</summary>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            cancelSailPerson(voyageId, p.id, p.revision),
                          )
                        }
                      >
                        Confirm cancellation
                      </button>
                    </details>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No one added yet. Add a person, then send their invitation.</p>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <details className="sail-details">
        <summary>
          Enquiries ({enquiries.filter((e) => !e.reviewed).length} new)
        </summary>
        {enquiries.length ? (
          enquiries.map((e) => (
            <article key={e.id} className="sail-inset">
              <h3>
                {e.full_name} · {e.role}
              </h3>
              <p>{e.email}</p>
              <p className="sail-prose">{e.message}</p>
              {e.reviewed ? (
                <small>Reviewed</small>
              ) : (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() => reviewSailEnquiry(voyageId, e.id))
                  }
                >
                  Mark reviewed
                </button>
              )}
            </article>
          ))
        ) : (
          <p>No enquiries yet.</p>
        )}
      </details>
      <p className="sail-footnote">
        Invitation links are personal, expire after 30 days, and give no access
        to Ernest. Sending a fresh invitation replaces the previous link.
      </p>
    </section>
  );
}
