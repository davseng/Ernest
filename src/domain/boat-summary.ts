import type { ReviewContext } from "@/data/review-context";
export function boatSummary(context: ReviewContext) {
  const a = context.asset,
    today = new Date().toISOString().slice(0, 10);
  const current = context.knowledge.filter(
    (k) =>
      !k.supersededBy && k.kind !== "observation" && k.effectiveOn <= today,
  );
  const lines = [
    `# ${a.name}`,
    "",
    "Generated from approved/current records. This readable view is not a separate editable store.",
    "",
    "## Boat and equipment",
    `${a.make} ${a.model} (${a.year})`,
    a.summary,
    "",
  ];
  for (const s of a.systems) {
    lines.push(`### ${s.name}`);
    for (const c of s.components)
      lines.push(
        `- ${c.name}: manufacturer ${c.manufacturer || "unknown"}; model ${c.model || "unknown"}; serial ${c.serialNumber || "unknown"}; location ${c.location || "unknown"}; lifecycle ${(context.lifecycles ?? []).find((l) => l.componentId === c.id)?.status ?? "unknown"} (not a claim of operational condition)`,
      );
  }
  lines.push("", "## Owner-confirmed knowledge");
  for (const k of current)
    lines.push(
      `- ${k.subject} / ${k.predicate}: ${k.value} (effective ${k.effectiveOn})`,
    );
  if (!current.length) lines.push("No current owner-confirmed facts recorded.");
  lines.push(
    "",
    "## Recorded inventory",
    "This is not proof of a complete aboard census.",
  );
  for (const i of context.inventory)
    lines.push(
      `- ${i.name}: quantity ${i.quantity ?? "unknown"}; locations ${i.locations.join(", ") || "unknown"}${i.details ? `; ${i.details}` : ""}`,
    );
  lines.push("", "## Storage definitions");
  for (const l of context.locations)
    lines.push(`- ${l.code}: ${l.label ?? "name not recorded"}`);
  lines.push("", "## Approved maintenance events");
  for (const e of context.maintenance)
    lines.push(
      `- ${e.occurred_on ?? "Work date unknown"}: ${e.title}. ${e.description} (revision ${e.revision})`,
    );
  lines.push("", "## Earlier maintenance logs");
  for (const e of context.logs.filter((l) => l.entryType === "maintenance"))
    lines.push(
      `- ${new Date(e.occurredAt).toISOString().slice(0, 10)}: ${e.title}. ${e.body}`,
    );
  lines.push(
    "",
    "## Latest dated maintenance by equipment",
    "These are recorded events, not inferred service intervals or proof of current condition.",
  );
  for (const c of a.systems.flatMap((s) => s.components)) {
    const event = context.maintenance
      .filter((e) => e.component_id === c.id && e.occurred_on)
      .sort((x, y) => y.occurred_on!.localeCompare(x.occurred_on!))[0];
    if (event) lines.push(`- ${c.name}: ${event.title}, ${event.occurred_on}`);
  }
  lines.push(
    "",
    "## Approved survey statuses",
    "This lists approved items only; completeness is shown separately on the Survey page.",
  );
  for (const s of context.survey)
    lines.push(
      `- ${s.priority} ${s.identifier}: ${s.status.replaceAll("_", " ")} — ${s.wording}${s.notes ? ` (${s.notes})` : ""}`,
    );
  lines.push(
    "",
    "## Evidence index",
    "Source documents and extracted interpretations are evidence; they are not automatically approved current facts.",
  );
  for (const d of context.documents)
    lines.push(`- ${d.title} (${d.documentDate ?? "document date unknown"})`);
  return lines.filter((x) => x !== undefined).join("\n");
}
