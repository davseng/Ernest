const labels: Record<string, string> = {
  title: "Title",
  description: "Work",
  occurred_on: "Work date",
  date: "Date",
  quantity: "Quantity",
  subject: "Subject",
  predicate: "Field",
  value: "Value",
  status: "Status",
  notes: "Notes",
  wording: "Survey wording",
  engine_hours: "Engine hours",
  engineHours: "Engine hours",
  spare_used: "Spares used",
  spareUsed: "Spares used",
  details: "Details",
};
function Snapshot({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return <p>No previous record.</p>;
  const entries = Object.entries(value).filter(
    ([k, v]) =>
      labels[k] &&
      (v === null || typeof v === "string" || typeof v === "number"),
  );
  return (
    <dl>
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{labels[k]}</dt>
          <dd>{v === null ? "Unknown" : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function ReviewHistory({ changes }: { changes: unknown[] }) {
  return (
    <details>
      <summary>Previous and approved versions</summary>
      {changes.map((entry, i) => {
        if (!entry || typeof entry !== "object") return null;
        const c = entry as Record<string, unknown>;
        return (
          <section key={i}>
            <h3>{String(c.kind ?? "Record")}</h3>
            <h4>Before</h4>
            <Snapshot value={c.before} />
            <h4>Approved</h4>
            <Snapshot value={c.after} />
          </section>
        );
      })}
    </details>
  );
}
