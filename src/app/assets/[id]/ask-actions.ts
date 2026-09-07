"use server";

import { auth } from "@/auth";
import { answerErnestQuestion } from "@/data/ask-ernest";
import { getAsset } from "@/data/assets";
import { getErnestDocumentContext } from "@/data/document-context";
import { proposeErnestWrite, type ErnestWriteProposal } from "@/data/ernest-write-proposals";
import { getInventoryItems } from "@/data/inventory";
import { getLogEntries } from "@/data/log-entries";

export type AskErnestState = {
  question: string;
  answer: string;
  sources: { documentTitle: string; pageNumber: number }[];
  proposal?: ErnestWriteProposal;
  error?: string;
};

function emptyAskErnestState(): AskErnestState {
  return {
    question: "",
    answer: "",
    sources: [],
  };
}

function inventorySearchTokens(question: string) {
  const stopWords = new Set([
    "a", "an", "and", "are", "do", "does", "for", "have", "i", "in", "is", "it", "me", "my", "of", "on", "the", "to", "what", "where", "which", "with",
  ]);

  return Array.from(new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 2 && !stopWords.has(token)),
  ));
}

function relevantInventory(
  question: string,
  inventory: Awaited<ReturnType<typeof getInventoryItems>>,
) {
  const tokens = inventorySearchTokens(question);
  if (tokens.length === 0) return [];

  return inventory
    .map((item) => {
      const name = item.name.toLowerCase();
      const details = (item.details ?? "").toLowerCase();
      const locations = item.locations.join(" ").toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (name.includes(token)) score += 4;
        if (details.includes(token)) score += 2;
        if (locations.split(/\s+/).includes(token)) score += 3;
      }
      if (tokens.every((token) => name.includes(token))) score += 8;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, 12)
    .map(({ item }) => item);
}

function inventoryLine(item: Awaited<ReturnType<typeof getInventoryItems>>[number]) {
  const parts = [
    item.name,
    item.locations.length ? `storage location code ${item.locations.join(", ")}` : "storage location not recorded",
    item.quantity ? `quantity ${item.quantity}` : "",
    item.details ? `details: ${item.details}` : "",
  ].filter(Boolean);
  return `- ${parts.join(" · ")}`;
}

function verifiedAssetContext(
  asset: NonNullable<Awaited<ReturnType<typeof getAsset>>>,
  logs: Awaited<ReturnType<typeof getLogEntries>>,
  inventory: Awaited<ReturnType<typeof getInventoryItems>>,
  question: string,
) {
  const lines = [
    "ASSET RECORD:",
    `Name: ${asset.name}`,
    `Type: ${asset.type}`,
    asset.make ? `Make: ${asset.make}` : "",
    asset.model ? `Model: ${asset.model}` : "",
    asset.year ? `Year: ${asset.year}` : "",
    asset.registrationNumber ? `Registration / VIN: ${asset.registrationNumber}` : "",
    asset.summary ? `Summary: ${asset.summary}` : "",
  ].filter(Boolean);

  for (const system of asset.systems) {
    lines.push(`\nSYSTEM: ${system.name}`);
    if (system.description) lines.push(`Description: ${system.description}`);
    for (const component of system.components) {
      lines.push(`Component: ${component.name}`);
      if (component.manufacturer) lines.push(`Manufacturer: ${component.manufacturer}`);
      if (component.model) lines.push(`Model: ${component.model}`);
      if (component.serialNumber) lines.push(`Serial number: ${component.serialNumber}`);
      if (component.location) lines.push(`Location: ${component.location}`);
      if (component.notes) lines.push(`Notes: ${component.notes}`);
    }
  }

  if (inventory.length > 0) {
    const matches = relevantInventory(question, inventory);
    if (matches.length > 0) {
      lines.push("\nRELEVANT VERIFIED INVENTORY MATCHES:");
      lines.push("Location codes below are the owner's exact storage-location codes. When asked where an item is, report the recorded code exactly and do not say the location is unknown if a code is present.");
      for (const item of matches) lines.push(inventoryLine(item));
    }

    lines.push("\nVERIFIED INVENTORY:");
    for (const item of inventory) lines.push(inventoryLine(item));
  }

  const recentLogs = logs.slice(0, 20);
  if (recentLogs.length > 0) {
    lines.push("\nRECENT OPERATING LOG:");
    for (const log of recentLogs) {
      lines.push(
        `[${log.occurredAt.toISOString().slice(0, 10)}] ${log.entryType}: ${log.title} — ${log.body}`,
      );
    }
  }

  return lines.join("\n");
}

function proposalAnswer(proposal: ErnestWriteProposal) {
  if (proposal.kind === "log") {
    return `I can save that to ${proposal.log.entryType} history for ${proposal.log.occurredAt}. Review it below before I write anything.`;
  }
  if (proposal.kind === "component_fact") {
    return `I can save that as owner-provided information for ${proposal.componentFact.componentName}. Review the change below first.`;
  }
  return "I can save that as owner-provided information for this asset. Review the change below first.";
}

export async function askErnest(
  assetId: string,
  _previousState: AskErnestState,
  formData: FormData,
): Promise<AskErnestState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ...emptyAskErnestState(), error: "Please sign in again." };
  }

  const question = String(formData.get("question") ?? "").trim().slice(0, 500);
  if (!question) {
    return { ...emptyAskErnestState(), error: "Enter a question." };
  }

  try {
    const [asset, logs, inventory, context] = await Promise.all([
      getAsset(assetId, session.user.id),
      getLogEntries(assetId, session.user.id),
      getInventoryItems(assetId, session.user.id),
      getErnestDocumentContext(assetId, session.user.id, question),
    ]);

    if (!asset) {
      return { ...emptyAskErnestState(), question, error: "I couldn’t find that asset." };
    }

    const proposal = await proposeErnestWrite(question, asset);
    if (proposal) {
      return { question, answer: proposalAnswer(proposal), sources: [], proposal };
    }

    const answer = await answerErnestQuestion(question, context, verifiedAssetContext(asset, logs, inventory, question));
    const seen = new Set<string>();
    const sources = context
      .filter((page) => {
        const key = `${page.documentId}:${page.pageNumber}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((page) => ({ documentTitle: page.documentTitle, pageNumber: page.pageNumber }));

    return { question, answer, sources };
  } catch (error) {
    console.error("Ask Ernest failure", error);
    return {
      question,
      answer: "",
      sources: [],
      error: "Ernest couldn’t answer that right now. Please try again.",
    };
  }
}
