"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getAsset, updateAsset, updateComponent } from "@/data/assets";
import { createLogEntry } from "@/data/log-entries";
import type { ErnestWriteProposal } from "@/data/ernest-write-proposals";

export type ErnestWriteResult = {
  ok: boolean;
  message: string;
};

const logTypes = new Set(["note", "maintenance", "passage", "observation", "incident"]);
const componentFields = new Set(["manufacturer", "model", "serialNumber", "location", "notes"]);
const assetFields = new Set(["name", "make", "model", "year", "summary", "registrationNumber"]);

export async function confirmErnestWrite(assetId: string, proposal: ErnestWriteProposal): Promise<ErnestWriteResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, message: "Please sign in again." };

  const asset = await getAsset(assetId, session.user.id);
  if (!asset) return { ok: false, message: "I couldn’t find that asset." };

  if (proposal.kind === "log") {
    if (!logTypes.has(proposal.log.entryType)) return { ok: false, message: "That log type is invalid." };
    const title = proposal.log.title.trim().slice(0, 200);
    const body = proposal.log.body.trim().slice(0, 2000);
    if (!title || !body || !/^\d{4}-\d{2}-\d{2}$/.test(proposal.log.occurredAt)) {
      return { ok: false, message: "That log entry is incomplete." };
    }
    const occurredAt = new Date(`${proposal.log.occurredAt}T12:00:00`);
    if (Number.isNaN(occurredAt.getTime())) return { ok: false, message: "That log date is invalid." };
    const created = await createLogEntry(assetId, session.user.id, {
      occurredAt,
      entryType: proposal.log.entryType,
      title,
      body,
    });
    if (!created) return { ok: false, message: "I couldn’t save that log entry." };
    revalidatePath("/");
    revalidatePath(`/assets/${assetId}`);
    return { ok: true, message: `Saved to the ${proposal.log.entryType} log.` };
  }

  if (proposal.kind === "component_fact") {
    if (!componentFields.has(proposal.componentFact.field) || !proposal.componentFact.value.trim()) {
      return { ok: false, message: "That component fact is invalid." };
    }
    const system = asset.systems.find((candidate) => candidate.id === proposal.componentFact.systemId);
    const component = system?.components.find((candidate) => candidate.id === proposal.componentFact.componentId);
    if (!system || !component) return { ok: false, message: "That component is no longer available." };

    const details = {
      name: component.name,
      manufacturer: component.manufacturer,
      model: component.model,
      serialNumber: component.serialNumber,
      location: component.location,
      notes: component.notes,
    };
    const field = proposal.componentFact.field;
    const value = proposal.componentFact.value.trim().slice(0, field === "notes" ? 1000 : 200);
    if (field === "serialNumber") details.serialNumber = value;
    else details[field] = value;

    const updated = await updateComponent(assetId, system.id, component.id, session.user.id, details);
    if (!updated) return { ok: false, message: "I couldn’t save that component fact." };
    revalidatePath("/");
    revalidatePath(`/assets/${assetId}`);
    return { ok: true, message: `Saved ${component.name} ${field} as owner-provided information.` };
  }

  if (!assetFields.has(proposal.assetFact.field) || !proposal.assetFact.value.trim()) {
    return { ok: false, message: "That asset fact is invalid." };
  }
  const details = {
    name: asset.name,
    type: asset.type,
    make: asset.make,
    model: asset.model,
    year: asset.year,
    summary: asset.summary,
    registrationNumber: asset.registrationNumber,
  };
  const field = proposal.assetFact.field;
  const value = proposal.assetFact.value.trim();
  if (field === "year") {
    const year = Number(value);
    if (!Number.isInteger(year) || year < 1800 || year > 3000) return { ok: false, message: "That year is invalid." };
    details.year = year;
  } else if (field === "registrationNumber") details.registrationNumber = value.slice(0, 100);
  else if (field === "summary") details.summary = value.slice(0, 1000);
  else details[field] = value.slice(0, 100);

  const updated = await updateAsset(assetId, session.user.id, details);
  if (!updated) return { ok: false, message: "I couldn’t save that asset fact." };
  revalidatePath("/");
  revalidatePath(`/assets/${assetId}`);
  return { ok: true, message: `Saved ${field} as owner-provided information.` };
}
