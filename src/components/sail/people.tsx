"use client";
import { useState } from "react";
import { sailStatusLabel } from "@/domain/sail";
import { useRouter } from "next/navigation";
import {
  addSailPerson,
  updateSailPerson,
  sendSailPerson,
  createSailPersonLink,
  cancelSailPerson,
  reviewSailEnquiry,
  inviteSailEnquiry,
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
    [preparedPersonId, setPreparedPersonId] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [link, setLink] = useState<{ id: string; url: string } | null>(null);
  async function run(work: () => Promise<SailResult>) {
    if (busy) return;
    setBusy(true);
    setPreparedPersonId(null);
    setLink(null);
    setMessage("");
    setError("");
    try {
      const r = await work();
      if (r.ok) {
        setMessage(r.message);
        if (r.id) setPreparedPersonId(r.id);
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
      <p>
        Adding a person doesn’t send them an invitation. When you’re ready,
        email their invitation or create a link to share yourself.
      </p>
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
              Email (optional)
              <input name="email" type="email" maxLength={254} />
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
            <li key={p.id} id={`sail-person-${p.id}`} tabIndex={-1}>
              <div>
                <strong>{p.fullName}</strong>
                <span>
                  {p.role === "crew" ? "Crew" : "Passenger"} ·{" "}
                  {sailStatusLabel(p.status)}
                  {p.status === "accepted" &&
                  p.acceptedRevision !== voyageRevision
                    ? " · plan changed; review needed"
                    : ""}
                </span>
                <span>{p.email || "No email — share a personal link"}</span>
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
                        Email (optional)
                        <input
                          name="email"
                          type="email"
                          defaultValue={p.email ?? ""}
                          maxLength={254}
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
                      disabled={busy || !p.email}
                      onClick={() =>
                        void run(() => sendSailPerson(voyageId, p.id))
                      }
                    >
                      {p.deliveryStatus === "sent"
                        ? "Send fresh invitation"
                        : "Send invitation"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const result = await run(() =>
                          createSailPersonLink(voyageId, p.id),
                        );
                        if (result?.ok && result.invitationUrl)
                          setLink({ id: p.id, url: result.invitationUrl });
                      }}
                    >
                      Create invitation link
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
              {link?.id === p.id ? (
                <div className="sail-form sail-person-link">
                  <label>
                    Personal invitation link
                    <input
                      aria-label="Personal invitation link"
                      readOnly
                      value={link.url}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link.url);
                        setMessage(
                          "Link copied. Send it directly to this person.",
                        );
                      } catch {
                        setMessage(
                          "Select the link above and copy it manually.",
                        );
                      }
                    }}
                  >
                    Copy link
                  </button>
                  <small>
                    This personal link is shown here only until you leave or
                    take another action. Keep it private.
                  </small>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No one added yet. Add a name, then email their invitation or create a
          link to share.
        </p>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {preparedPersonId ? (
        <a href={`#sail-person-${preparedPersonId}`}>View in People ↑</a>
      ) : null}
      <details className="sail-details">
        <summary>
          Inquiries ({enquiries.filter((e) => !e.reviewed).length} new)
        </summary>
        {enquiries.length ? (
          enquiries.map((e) => (
            <article key={e.id} className="sail-inset">
              <h3>
                {e.full_name} · {e.role}
              </h3>
              <p>{e.email}</p>
              <p className="sail-prose">{e.message}</p>
              <button
                disabled={busy}
                onClick={() =>
                  void run(() => inviteSailEnquiry(voyageId, e.id))
                }
              >
                Invite this person
              </button>
              <p className="sail-footnote">
                Adds them to People with their preferred role. You choose when
                to send their invitation.
              </p>
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
          <p>No inquiries yet.</p>
        )}
      </details>
      <p className="sail-footnote">
        Invitation links are personal, expire after 30 days, and give no access
        to Ernest. Creating a fresh link or sending a fresh email replaces the
        previous link.
      </p>
    </section>
  );
}
