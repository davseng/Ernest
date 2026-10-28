"use client";
import { useState } from "react";
import { saveReview, cancelReview } from "@/app/assets/[id]/review-actions";
import {
  surveyStatuses,
  type ReviewDraft,
  type ReviewRow,
  type Receipt,
} from "@/domain/review";
export type ReviewChoices = {
  inventory: Array<{ id: string; name: string; quantity: string | null }>;
  equipment: Array<{ id: string; name: string }>;
  documents: Array<{ id: string; title: string }>;
};
export function ReviewForm({
  assetId,
  reviewId,
  initial,
  choices,
  status = "pending",
  savedReceipt,
}: {
  assetId: string;
  reviewId: string;
  initial: ReviewDraft;
  choices: ReviewChoices;
  status?: string;
  savedReceipt?: Receipt | null;
}) {
  const [draft, setDraft] = useState(initial),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<Receipt | null>(savedReceipt ?? null),
    [cancelled, setCancelled] = useState(status === "cancelled"),
    [coverage, setCoverage] = useState(false);
  const patch = (id: string, values: Partial<ReviewRow>) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r) =>
        r.id === id ? ({ ...r, ...values } as ReviewRow) : r,
      ),
    }));
  const field = (
    row: ReviewRow,
    key: string,
    label: string,
    value: string | null,
    extra: { type?: string; required?: boolean; hint?: string } = {},
  ) => (
    <label>
      {label}
      <input
        aria-label={`${row.id}: ${label}`}
        type={extra.type ?? "text"}
        value={value ?? ""}
        required={extra.required && row.include}
        onChange={(e) =>
          patch(row.id, {
            [key]:
              key === "pageNumber"
                ? Number(e.target.value)
                : e.target.value || null,
          } as Partial<ReviewRow>)
        }
      />
      {extra.hint ? <small>{extra.hint}</small> : null}
    </label>
  );
  const long = (row: ReviewRow, key: string, label: string, value: string) => (
    <label>
      {label}
      <textarea
        aria-label={`${row.id}: ${label}`}
        rows={3}
        value={value}
        onChange={(e) =>
          patch(row.id, { [key]: e.target.value } as Partial<ReviewRow>)
        }
      />
    </label>
  );
  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await saveReview(assetId, reviewId, draft, coverage);
      if (result.ok) setReceipt(result.receipt);
      else setError(result.error);
    } catch {
      setError(
        "No save was confirmed. Reopen this review before retrying; the same review cannot be applied twice.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function cancel() {
    if (saving) return;
    const result = await cancelReview(assetId, reviewId);
    if (result.ok) setCancelled(true);
    else setError("The review could not be cancelled.");
  }
  if (receipt)
    return (
      <section aria-label="Save receipt">
        <h2>Saved</h2>
        <p role="status">{receipt.message}</p>
        <ul>
          {receipt.changes.map((c, i) => (
            <li key={i}>{c.description}</li>
          ))}
        </ul>
        <p>
          <a href={`/assets/${assetId}/history`}>Open maintenance history</a> ·{" "}
          <a href={`/assets/${assetId}/survey`}>Open survey status report</a> ·{" "}
          <a href={`/assets/${assetId}/inventory`}>Open Inventory</a>
        </p>
        <p>Sources and previous versions are retained in the review trail.</p>
      </section>
    );
  if (cancelled)
    return <p role="status">Cancelled. No definitive records changed.</p>;
  return (
    <form
      className="review-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      aria-label="Editable update review"
    >
      <h1>{draft.title}</h1>
      <p>{draft.summary}</p>
      <p>
        <strong>
          These are proposed changes. You decide which become definitive.
        </strong>{" "}
        Edit any field, exclude rows you do not approve, then save once.
      </p>
      {draft.missing.length ? (
        <aside>
          <h2>Information to check or add</h2>
          <ul>
            {draft.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <p>
            Unknown optional fields can stay blank. Required fields are
            identified below.
          </p>
        </aside>
      ) : null}
      {draft.coverage ? (
        <aside>
          <h2>Evidence coverage</h2>
          <p>{draft.coverage}</p>
        </aside>
      ) : null}
      {draft.rows.map((row) => (
        <fieldset
          key={row.id}
          disabled={saving}
          className="review-row systems-section"
        >
          <legend>
            {row.kind === "maintenance"
              ? "Maintenance event"
              : row.kind === "inventory"
                ? "Inventory adjustment"
                : row.kind === "knowledge"
                  ? "Current knowledge"
                  : "Survey item"}
          </legend>
          <label>
            <input
              type="checkbox"
              checked={row.include}
              onChange={(e) => patch(row.id, { include: e.target.checked })}
            />{" "}
            Include this change
          </label>
          {row.reason ? <p>{row.reason}</p> : null}
          {row.kind === "maintenance" ? (
            <>
              {row.eventId ? (
                <p>
                  Correction to an existing event. Previous versions are
                  retained; spares are not consumed again.
                </p>
              ) : null}
              {field(row, "title", "Title (required)", row.title, {
                required: true,
              })}
              {long(
                row,
                "description",
                "Work performed (required)",
                row.description,
              )}
              {field(row, "date", "Work date", row.date, {
                type: "date",
                hint: "Blank means the work date is unknown; it is not replaced by the invoice or upload date.",
              })}
              <label>
                Equipment
                <select
                  aria-label={`${row.id}: Equipment`}
                  value={row.componentId ?? ""}
                  onChange={(e) =>
                    patch(row.id, { componentId: e.target.value || null })
                  }
                >
                  <option value="">Unassigned / unknown</option>
                  {choices.equipment.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {field(row, "engineHours", "Engine hours", row.engineHours, {
                hint: "Leave blank if not known.",
              })}
              <label>
                Spare used
                <select
                  aria-label={`${row.id}: Spare used`}
                  value={row.spareItemId ?? ""}
                  onChange={(e) =>
                    patch(row.id, {
                      spareItemId: e.target.value || null,
                      deductSpare: false,
                      spareUsed: e.target.value ? (row.spareUsed ?? "1") : null,
                    })
                  }
                >
                  <option value="">No linked spare / unknown</option>
                  {choices.inventory.map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.name} — balance {i.quantity ?? "unknown"}
                    </option>
                  ))}
                </select>
              </label>
              {row.spareItemId ? (
                <>
                  {field(row, "spareUsed", "Number used", row.spareUsed, {
                    hint: "Leave blank if unknown; stock cannot be deducted without a quantity.",
                  })}
                  <label>
                    <input
                      type="checkbox"
                      checked={row.deductSpare}
                      disabled={
                        !!row.eventId ||
                        choices.inventory.find((i) => i.id === row.spareItemId)
                          ?.quantity == null
                      }
                      onChange={(e) =>
                        patch(row.id, { deductSpare: e.target.checked })
                      }
                    />{" "}
                    Deduct from the recorded balance
                  </label>
                  <p>
                    With deduction off, consumption is recorded and the balance
                    remains unchanged. Unknown balance is never guessed.
                  </p>
                </>
              ) : null}
              {!row.eventId ? (
                <label>
                  <input
                    type="checkbox"
                    checked={row.allowDuplicate}
                    onChange={(e) =>
                      patch(row.id, { allowDuplicate: e.target.checked })
                    }
                  />{" "}
                  If a matching event exists, I confirm this is separate
                  work—not a duplicate.
                </label>
              ) : null}
            </>
          ) : row.kind === "inventory" ? (
            <>
              <label>
                Inventory item
                <select
                  value={row.itemId}
                  onChange={(e) => patch(row.id, { itemId: e.target.value })}
                >
                  <option value="">Choose recorded item</option>
                  {choices.inventory.map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
              {field(row, "quantity", "New absolute quantity", row.quantity, {
                hint: "Blank leaves the balance unchanged.",
              })}
              {long(row, "details", "Details", row.details ?? "")}
            </>
          ) : row.kind === "knowledge" ? (
            <>
              {field(row, "subject", "Subject (required)", row.subject, {
                required: true,
              })}
              {field(row, "predicate", "Field (required)", row.predicate, {
                required: true,
              })}
              {long(row, "value", "Value (required)", row.value)}
              {field(row, "date", "Effective date", row.date, {
                type: "date",
                hint: "Blank means this current fact takes effect on the date you approve it.",
              })}
            </>
          ) : (
            <>
              <label>
                Survey source
                <select
                  value={row.documentId}
                  onChange={(e) =>
                    patch(row.id, { documentId: e.target.value })
                  }
                >
                  <option value="">Choose source</option>
                  {choices.documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
              {field(
                row,
                "identifier",
                "Original identifier (required)",
                row.identifier,
                { required: true },
              )}
              <label>
                Survey priority
                <select
                  value={row.priority}
                  onChange={(e) =>
                    patch(row.id, { priority: e.target.value as "A" | "B" })
                  }
                >
                  <option>A</option>
                  <option>B</option>
                </select>
              </label>
              {field(
                row,
                "pageNumber",
                "Original PDF page",
                String(row.pageNumber),
                { type: "number" },
              )}
              {long(row, "wording", "Original wording (required)", row.wording)}
              <label>
                Proposed status
                <select
                  aria-label={`${row.id}: Proposed status`}
                  value={row.status}
                  onChange={(e) =>
                    patch(row.id, {
                      status: e.target.value as (typeof surveyStatuses)[number],
                    })
                  }
                >
                  {surveyStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              {long(row, "notes", "Reason / remaining uncertainty", row.notes)}
            </>
          )}
          <div>
            <h3>Supporting evidence</h3>
            {row.evidence.length ? (
              row.evidence.map((e, i) => (
                <div key={i}>
                  <label>
                    Source document
                    <select
                      value={e.documentId}
                      onChange={(event) =>
                        patch(row.id, {
                          evidence: row.evidence.map((x, j) =>
                            j === i
                              ? { ...x, documentId: event.target.value }
                              : x,
                          ),
                        })
                      }
                    >
                      {choices.documents.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    PDF page
                    <input
                      type="number"
                      min={1}
                      value={e.pageNumber}
                      onChange={(event) =>
                        patch(row.id, {
                          evidence: row.evidence.map((x, j) =>
                            j === i
                              ? { ...x, pageNumber: Number(event.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Supporting quote
                    <textarea
                      value={e.quote}
                      onChange={(event) =>
                        patch(row.id, {
                          evidence: row.evidence.map((x, j) =>
                            j === i ? { ...x, quote: event.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <a
                    href={`/assets/${assetId}/documents/${e.documentId}/original#page=${e.pageNumber}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Check original source page
                  </a>{" "}
                  <button
                    type="button"
                    onClick={() =>
                      patch(row.id, {
                        evidence: row.evidence.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove evidence
                  </button>
                </div>
              ))
            ) : (
              <p>Source: your statement / review. No document page supplied.</p>
            )}
            {choices.documents.length ? (
              <button
                type="button"
                onClick={() =>
                  patch(row.id, {
                    evidence: [
                      ...row.evidence,
                      {
                        documentId: choices.documents[0].id,
                        pageNumber: 1,
                        quote: "",
                      },
                    ],
                  })
                }
              >
                Add source evidence
              </button>
            ) : null}
          </div>
        </fieldset>
      ))}
      {draft.rows.some((r) => r.kind === "survey") ? (
        <label>
          <input
            type="checkbox"
            checked={coverage}
            onChange={(e) => setCoverage(e.target.checked)}
          />{" "}
          I checked this list against the original survey and confirm it
          includes every A and B item. Leave unchecked for a partial review.
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="error-notice">
          {error}
        </p>
      ) : null}
      <p>
        All selected changes save together. “Confirmed” means approved by you,
        not independently proven by Ernest.
      </p>
      <button
        className="primary-button"
        disabled={saving || !draft.rows.some((r) => r.include)}
      >
        {saving ? "Saving…" : "Save selected changes"}
      </button>{" "}
      <button type="button" disabled={saving} onClick={() => void cancel()}>
        Cancel without saving
      </button>
    </form>
  );
}
