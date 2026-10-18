import type { InventoryItem, InventoryLocation } from "@/data/inventory";
import type { KnowledgeFact } from "./knowledge";
import { retrievalTerms } from "./retrieval";

const words = (text: string) => retrievalTerms(text).map(t => t.replace(/s$/, ""));
export function inventoryContext(question: string, items: InventoryItem[], locations: InventoryLocation[], facts: KnowledgeFact[] = []) {
  const terms = words(question);
  const today = new Date().toISOString().slice(0, 10);
  const active = facts.filter(f => !f.supersededBy && f.kind !== "observation" && f.effectiveOn <= today);
  const mapped = locations.map(location => {
    // Only an explicit saved definition can give a code an additional name.
    const definitions = active.filter(f => f.subject.toLowerCase() === location.code.toLowerCase()
      && /^(name|label|location|description|means|location name)$/i.test(f.predicate));
    const labels = [location.label, ...definitions.map(f => f.value)].filter(Boolean).join(" / ");
    return { ...location, labels };
  });
  const matches = (text: string) => terms.filter(t => words(text).includes(t)).length;
  const normalizedQuestion = words(question).join(" ");
  const resolved = mapped.filter(l => terms.includes(l.code.toLowerCase()) || l.labels.split(" / ").some(label => {
    const name = words(label).join(" ");
    return name.length > 0 && (` ${normalizedQuestion} `).includes(` ${name} `);
  }));
  const codes = new Set(resolved.map(l => l.code.toLowerCase()));
  const ranked = items.map(item => ({ item, score: matches(`${item.name} ${item.details ?? ""} ${item.locations.join(" ")}`)
    + (item.locations.some(l => codes.has(l.toLowerCase())) ? 10 : 0) }));
  const hits = ranked.filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  // Small inventories are cheap enough to expose on every question: no keyword gate.
  const selected = items.length <= 40 ? items : hits.slice(0, 40).map(x => x.item);
  const selectedLocations = mapped.length <= 60 ? mapped : mapped.filter(l => codes.has(l.code.toLowerCase()) || selected.some(i => i.locations.includes(l.code))).slice(0, 60);
  return [
    "VERIFIED INVENTORY (owner-controlled records; not proof of a complete aboard census):",
    `Inventory was checked: ${items.length} recorded items; ${selected.length} supplied here. Missing entries mean not recorded, NOT confirmed absent aboard.`,
    ...selected.map(i => `- ${i.name.slice(0,200)} · locations ${i.locations.join(", ") || "not recorded"} · quantity ${i.quantity ?? "not recorded"}${i.details ? ` · details ${i.details.slice(0,500)}` : ""}`),
    "SAVED STORAGE DEFINITIONS (do not expand an undefined code by guessing):",
    ...selectedLocations.map(l => `- ${l.code}: ${l.labels || "name not recorded"}${l.notes ? ` · ${l.notes.slice(0,300)}` : ""}`),
    resolved.length ? `Resolved location codes for this question: ${resolved.map(l => l.code).join(", ")}. Use linked inventory items, not a similarly named location in historical documents.` : "No saved location-name match was established for this question.",
  ].join("\n");
}
