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

export async function confirmErnestWrite(assetId: string, proposal: ErnestWriteProposal): Promise<ErnestWriteResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, message: "Please sign in again." };

  const asset = await getAsset(assetId, session.user.id);
  if (!asset) return { ok: false, message: "I couldn’t find that asset." };

  if (proposal.kind === "log") {
    const occurredAt = new Date(`${proposal.log.occurredAt}T12:00:00`);
    if (Number.isNaN(occurredAt.getTime())) return { ok: false, message: "That log date is invalid." };
    const created = await createLogEntry(assetId, session.user.id, {
      occurredAt,
      entryType: proposal.log.entryType,
      title: proposal.log.title.trim().slice(0, 200),
      body: proposal.log.body.trim().slice(0, 2000),
    });
    if (!created) return { ok: false, message: "I couldn’t save that log entry." };
    revalidatePath("/");
    revalidatePath(`/assets/${assetId}`);
    return { ok: true, message: `Saved to the ${proposal.log.entryType} log.` };
  }

  if (proposal.kind === "component_fact") {
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
    if (field === "serialNumber") details.serialNumber = proposal.componentFact.value;
    else details[field] = proposal.componentFact.value;

    const updated = await updateComponent(assetId, system.id, component.id, session.user.id, details);
    if (!updated) return { ok: false, message: "I couldn’t save that component fact." };
    revalidatePath("/");
    revalidatePath(`/assets/${assetId}`);
    return { ok: true, message: `Saved ${component.name} ${field} as owner-provided information.` };
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
  if (field === "year") details.year = Number(proposal.assetFact.value);
  else if (field === "registrationNumber") details.registrationNumber = proposal.assetFact.value;
  else details[field] = proposal.assetFact.value;

  const updated = await updateAsset(assetId, session.user.id, details);
  if (!updated) return { ok: false, message: "I couldn’t save that asset fact." };
  revalidatePath("/");
  revalidatePath(`/assets/${assetId}`);
  return { ok: true, message: `Saved ${field} as owner-provided information.` };
}
