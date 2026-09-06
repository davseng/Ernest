import "server-only";

import OpenAI from "openai";

import type { Asset } from "@/domain/assets";
import type { LogEntryType } from "@/domain/log-entries";

export type ErnestWriteProposal =
  | {
      kind: "log";
      summary: string;
      log: {
        occurredAt: string;
        entryType: LogEntryType;
        title: string;
        body: string;
      };
    }
  | {
      kind: "component_fact";
      summary: string;
      componentFact: {
        systemId: string;
        componentId: string;
        componentName: string;
        field: "manufacturer" | "model" | "serialNumber" | "location" | "notes";
        value: string;
      };
    }
  | {
      kind: "asset_fact";
      summary: string;
      assetFact: {
        field: "name" | "make" | "model" | "year" | "summary" | "registrationNumber";
        value: string;
      };
    };

let client: OpenAI | undefined;

function openai() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  client ??= new OpenAI({ apiKey });
  return client;
}

function assetCandidates(asset: Asset) {
  const lines = [
    `ASSET id=${asset.id} name=${JSON.stringify(asset.name)} make=${JSON.stringify(asset.make)} model=${JSON.stringify(asset.model)} year=${asset.year}`,
  ];
  for (const system of asset.systems) {
    lines.push(`SYSTEM id=${system.id} name=${JSON.stringify(system.name)}`);
    for (const component of system.components) {
      lines.push(
        `COMPONENT systemId=${system.id} id=${component.id} name=${JSON.stringify(component.name)} manufacturer=${JSON.stringify(component.manufacturer)} model=${JSON.stringify(component.model)} serialNumber=${JSON.stringify(component.serialNumber ?? "")} location=${JSON.stringify(component.location)} notes=${JSON.stringify(component.notes)}`,
      );
    }
  }
  return lines.join("\n");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    const value = JSON.parse(trimmed);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function proposeErnestWrite(message: string, asset: Asset): Promise<ErnestWriteProposal | null> {
  const response = await openai().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    reasoning: { effort: "low" },
    instructions: [
      "You classify whether an asset owner is clearly providing information they intend Ernest to save.",
      "Never invent missing values. If the message is a question, hypothetical, uncertain statement, or merely discusses a fact without clearly asserting it, return kind none.",
      "Use log for completed events, maintenance, passages, observations, incidents, and owner notes that belong in the operating log.",
      "Use component_fact only when the owner clearly supplies one durable fact about an EXISTING listed component and you can identify that component unambiguously from the candidate list.",
      "Use asset_fact only for a durable fact about the asset itself.",
      "Do not propose creating new systems or components in this version.",
      "For relative dates such as today, use the supplied CURRENT DATE. If no date is stated for a completed event, use CURRENT DATE.",
      "For a log, entryType must be exactly one of note, maintenance, passage, observation, incident.",
      "For component_fact, field must be exactly one of manufacturer, model, serialNumber, location, notes.",
      "For asset_fact, field must be exactly one of name, make, model, year, summary, registrationNumber.",
      "Return ONLY compact JSON. Shapes: {\"kind\":\"none\"}; {\"kind\":\"log\",\"summary\":\"...\",\"occurredAt\":\"YYYY-MM-DD\",\"entryType\":\"maintenance\",\"title\":\"...\",\"body\":\"...\"}; {\"kind\":\"component_fact\",\"summary\":\"...\",\"systemId\":\"...\",\"componentId\":\"...\",\"componentName\":\"...\",\"field\":\"model\",\"value\":\"...\"}; {\"kind\":\"asset_fact\",\"summary\":\"...\",\"field\":\"registrationNumber\",\"value\":\"...\"}.",
    ].join(" "),
    input: `CURRENT DATE: ${new Date().toISOString().slice(0, 10)}\n\nOWNER MESSAGE:\n${message}\n\nCANDIDATE RECORDS:\n${assetCandidates(asset)}`,
  });

  const parsed = parseJsonObject(response.output_text);
  if (!parsed) return null;
  const kind = clean(parsed.kind, 30);
  if (kind === "none" || !kind) return null;

  if (kind === "log") {
    const occurredAt = clean(parsed.occurredAt, 10);
    const entryType = clean(parsed.entryType, 20) as LogEntryType;
    const title = clean(parsed.title, 200);
    const body = clean(parsed.body, 2000);
    const summary = clean(parsed.summary, 300) || `Save ${title} to the operating log`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) return null;
    if (!(["note", "maintenance", "passage", "observation", "incident"] as string[]).includes(entryType)) return null;
    if (!title || !body) return null;
    return { kind: "log", summary, log: { occurredAt, entryType, title, body } };
  }

  if (kind === "component_fact") {
    const systemId = clean(parsed.systemId, 100);
    const componentId = clean(parsed.componentId, 100);
    const componentName = clean(parsed.componentName, 100);
    const field = clean(parsed.field, 30) as "manufacturer" | "model" | "serialNumber" | "location" | "notes";
    const value = clean(parsed.value, field === "notes" ? 1000 : 200);
    const summary = clean(parsed.summary, 300) || `Save ${componentName} ${field}`;
    const system = asset.systems.find((candidate) => candidate.id === systemId);
    const component = system?.components.find((candidate) => candidate.id === componentId);
    if (!component || !(["manufacturer", "model", "serialNumber", "location", "notes"] as string[]).includes(field) || !value) return null;
    return {
      kind: "component_fact",
      summary,
      componentFact: { systemId, componentId, componentName: component.name || componentName, field, value },
    };
  }

  if (kind === "asset_fact") {
    const field = clean(parsed.field, 30) as "name" | "make" | "model" | "year" | "summary" | "registrationNumber";
    const value = clean(parsed.value, field === "summary" ? 1000 : 200);
    const summary = clean(parsed.summary, 300) || `Save ${field} for ${asset.name}`;
    if (!(["name", "make", "model", "year", "summary", "registrationNumber"] as string[]).includes(field) || !value) return null;
    if (field === "year" && (!/^\d{4}$/.test(value) || Number(value) < 1800 || Number(value) > 3000)) return null;
    return { kind: "asset_fact", summary, assetFact: { field, value } };
  }

  return null;
}
