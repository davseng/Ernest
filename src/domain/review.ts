export type Evidence = {
  documentId: string;
  pageNumber: number;
  quote: string;
};
export const surveyStatuses = [
  "open",
  "repair_documented",
  "partially_addressed",
  "owner_confirmed_resolved",
  "no_subsequent_evidence",
  "needs_review",
] as const;
export type SurveyStatus = (typeof surveyStatuses)[number];
type Base = {
  id: string;
  include: boolean;
  evidence: Evidence[];
  reason: string;
};
export type ReviewRow =
  | (Base & {
      kind: "maintenance";
      eventId: string | null;
      expectedRevision: number | null;
      title: string;
      description: string;
      date: string | null;
      componentId: string | null;
      engineHours: string | null;
      spareItemId: string | null;
      spareUsed: string | null;
      deductSpare: boolean;
      expectedQuantity: string | null;
      allowDuplicate: boolean;
    })
  | (Base & {
      kind: "inventory";
      itemId: string;
      quantity: string | null;
      details: string | null;
      expectedQuantity: string | null;
    })
  | (Base & {
      kind: "knowledge";
      subject: string;
      predicate: string;
      value: string;
      date: string | null;
      supersedesId: string | null;
    })
  | (Base & {
      kind: "survey";
      documentId: string;
      identifier: string;
      priority: "A" | "B";
      wording: string;
      pageNumber: number;
      status: SurveyStatus;
      notes: string;
      expectedRevision: number | null;
    });
export type ReviewDraft = {
  title: string;
  summary: string;
  missing: string[];
  coverage: string;
  rows: ReviewRow[];
};
export type Receipt = {
  coverage?: {
    confirmed: boolean;
    items: Array<{ documentId: string; identifier: string }>;
  };
  reviewId: string;
  message: string;
  changes: Array<{ kind: string; recordId: string; description: string }>;
};
const text = (v: unknown, max = 2000) => {
  const value = typeof v === "string" ? v.replace(/\u0000/g, "").trim() : "";
  if (value.length > max)
    throw Error(
      `A field exceeds ${max} characters. Shorten it explicitly; no text was saved or silently truncated.`,
    );
  return value;
};
export function calendarDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = text(v, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
    !Number.isFinite(Date.parse(d)) ||
    new Date(d).toISOString().slice(0, 10) !== d
  )
    throw Error("Use a real calendar date or leave it unknown.");
  return d;
}
export function amount(v: unknown, positive = false): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = typeof v === "number" ? String(v) : text(v, 40);
  if (
    !/^\d+(?:\.\d+)?$/.test(s) ||
    !Number.isFinite(Number(s)) ||
    (positive && Number(s) <= 0)
  )
    throw Error(
      "Use a non-negative number; consumption must be greater than zero.",
    );
  return s;
}
export function parseDraft(input: unknown): ReviewDraft {
  if (!input || typeof input !== "object")
    throw Error("The update form is invalid.");
  const d = input as Record<string, unknown>;
  if (!Array.isArray(d.rows) || d.rows.length > 120)
    throw Error("The update must contain at most 120 changes.");
  const ids = new Set<string>();
  const rows = d.rows.map((value, index): ReviewRow => {
    if (!value || typeof value !== "object") throw Error("Invalid update row.");
    const r = value as Record<string, unknown>;
    const id = text(r.id, 80) || `row-${index}`;
    if (ids.has(id)) throw Error("Duplicate update row.");
    ids.add(id);
    const evidence: Evidence[] = Array.isArray(r.evidence)
      ? r.evidence.slice(0, 20).map((e) => {
          if (!e || typeof e !== "object") throw Error("Invalid evidence.");
          const x = e as Record<string, unknown>;
          if (
            !text(x.documentId, 80) ||
            !Number.isInteger(x.pageNumber) ||
            Number(x.pageNumber) < 1
          )
            throw Error("Evidence needs a document and PDF page.");
          return {
            documentId: text(x.documentId, 80),
            pageNumber: Number(x.pageNumber),
            quote: text(x.quote, 1200),
          };
        })
      : [];
    const base = {
      id,
      include: r.include !== false,
      evidence,
      reason: text(r.reason, 1000),
    };
    const revision =
      r.expectedRevision == null ? null : Number(r.expectedRevision);
    if (revision !== null && (!Number.isInteger(revision) || revision < 1))
      throw Error("Invalid record revision.");
    if (r.kind === "maintenance")
      return {
        ...base,
        kind: r.kind,
        eventId: text(r.eventId, 80) || null,
        expectedRevision: revision,
        title: text(r.title, 200),
        description: text(r.description),
        date: calendarDate(r.date),
        componentId: text(r.componentId, 100) || null,
        engineHours: amount(r.engineHours),
        spareItemId: text(r.spareItemId, 80) || null,
        spareUsed: amount(r.spareUsed, true),
        deductSpare: r.deductSpare === true,
        expectedQuantity: amount(r.expectedQuantity),
        allowDuplicate: r.allowDuplicate === true,
      };
    if (r.kind === "inventory")
      return {
        ...base,
        kind: r.kind,
        itemId: text(r.itemId, 80),
        quantity: amount(r.quantity),
        details: r.details == null ? null : text(r.details),
        expectedQuantity: amount(r.expectedQuantity),
      };
    if (r.kind === "knowledge")
      return {
        ...base,
        kind: r.kind,
        subject: text(r.subject, 160),
        predicate: text(r.predicate, 160),
        value: text(r.value),
        date: calendarDate(r.date),
        supersedesId: text(r.supersedesId, 80) || null,
      };
    if (r.kind === "survey") {
      if (
        !["A", "B"].includes(String(r.priority)) ||
        !surveyStatuses.includes(r.status as SurveyStatus) ||
        !Number.isInteger(r.pageNumber) ||
        Number(r.pageNumber) < 1
      )
        throw Error(
          "Survey items need their original A/B priority, PDF page and a valid status.",
        );
      return {
        ...base,
        kind: r.kind,
        documentId: text(r.documentId, 80),
        identifier: text(r.identifier, 160),
        priority: r.priority as "A" | "B",
        wording: text(r.wording, 4000),
        pageNumber: Number(r.pageNumber),
        status: r.status as SurveyStatus,
        notes: text(r.notes),
        expectedRevision: revision,
      };
    }
    throw Error("This form contains an unsupported record type.");
  });
  return {
    title: text(d.title, 200) || "Review proposed update",
    summary: text(d.summary, 4000),
    missing: Array.isArray(d.missing)
      ? d.missing
          .map((x) => text(x, 500))
          .filter(Boolean)
          .slice(0, 20)
      : [],
    coverage: text(d.coverage, 2000),
    rows,
  };
}
