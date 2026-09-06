"use server";

import { auth } from "@/auth";
import { answerErnestQuestion } from "@/data/ask-ernest";
import { getAsset } from "@/data/assets";
import { getErnestDocumentContext } from "@/data/document-context";
import { proposeErnestWrite, type ErnestWriteProposal } from "@/data/ernest-write-proposals";
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

function verifiedAssetContext(
  asset: NonNullable<Awaited<ReturnType<typeof getAsset>>>,
  logs: Awaited<ReturnType<typeof getLogEntries>>,
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
    const [asset, logs, context] = await Promise.all([
      getAsset(assetId, session.user.id),
      getLogEntries(assetId, session.user.id),
      getErnestDocumentContext(assetId, session.user.id, question),
    ]);

    if (!asset) {
      return { ...emptyAskErnestState(), question, error: "I couldn’t find that asset." };
    }

    const proposal = await proposeErnestWrite(question, asset);
    if (proposal) {
      return { question, answer: proposalAnswer(proposal), sources: [], proposal };
    }

    const answer = await answerErnestQuestion(question, context, verifiedAssetContext(asset, logs));
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
