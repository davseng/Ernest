"use server";

import { auth } from "@/auth";
import { answerErnestQuestion } from "@/data/ask-ernest";
import { getAsset } from "@/data/assets";
import { getErnestDocumentContext } from "@/data/document-context";
import { proposeErnestWrite, type ErnestWriteProposal } from "@/data/ernest-write-proposals";
import { getComponentLifecycles } from "@/data/equipment-knowledge";
import { getInventoryItems, getInventoryLocations } from "@/data/inventory";
import { getLogEntries } from "@/data/log-entries";
import { getProcedures } from "@/data/procedures";

export type AskErnestState = {
  question: string;
  answer: string;
  sources: { documentTitle: string; pageNumber: number }[];
  proposal?: ErnestWriteProposal;
  error?: string;
};

const empty = (): AskErnestState => ({ question: "", answer: "", sources: [] });

function looksLikeFollowUp(question: string) {
  if (question.length > 180) return false;
  return /\b(it|that|this|those|these|them|there|they|he|she|more|detail|details|earlier|above)\b/i.test(question)
    || /^(and|but|so|why|how|what about|how about|what else|then)\b/i.test(question);
}

function retrievalQuestion(question: string, conversation: string) {
  if (!conversation || !looksLikeFollowUp(question)) return question;
  // A short follow-up often has no useful search nouns of its own. Give retrieval a small
  // tail of the conversation so "what about that?" can find the subject without making
  // conversation itself verified evidence.
  return `${question}\n${conversation.slice(-1200)}`.slice(0, 1600);
}

function verified(
  asset: NonNullable<Awaited<ReturnType<typeof getAsset>>>,
  logs: Awaited<ReturnType<typeof getLogEntries>>,
  inventory: Awaited<ReturnType<typeof getInventoryItems>>,
  lifecycles: Awaited<ReturnType<typeof getComponentLifecycles>>,
  procedures: Awaited<ReturnType<typeof getProcedures>>,
) {
  const lines = ["ASSET RECORD:", `Name: ${asset.name}`];
  const lifecycleByComponent = new Map(lifecycles.map((item) => [item.componentId, item]));

  for (const system of asset.systems) {
    lines.push(`SYSTEM: ${system.name}`);
    for (const component of system.components) {
      const lifecycle = lifecycleByComponent.get(component.id);
      const lifecycleText = lifecycle
        ? ` · Status: ${lifecycle.status}${lifecycle.changedOn ? ` since ${lifecycle.changedOn}` : ""}${lifecycle.notes ? ` · Lifecycle note: ${lifecycle.notes}` : ""}`
        : "";
      lines.push(`Component: ${component.name} · Manufacturer: ${component.manufacturer || ""} · Model: ${component.model || ""} · Location: ${component.location || ""}${lifecycleText}`);
    }
  }

  if (inventory.length) {
    lines.push("VERIFIED INVENTORY:");
    for (const item of inventory) {
      lines.push(`- ${item.name} · locations ${item.locations.join(", ") || "not recorded"} · quantity ${item.quantity || "not recorded"}`);
    }
  }

  if (procedures.length) {
    lines.push("VERIFIED PROCEDURES:");
    for (const procedure of procedures.slice(0, 12)) {
      lines.push(`PROCEDURE: ${procedure.title} · type ${procedure.procedureType}`);
      if (procedure.notes) lines.push(`Notes: ${procedure.notes}`);
      for (const step of procedure.steps.slice(0, 12)) {
        lines.push(`${step.position + 1}. ${step.instruction}${step.note ? ` — ${step.note}` : ""}`);
      }
    }
  }

  if (logs.length) lines.push("OPERATING / MAINTENANCE HISTORY:");
  for (const log of logs.slice(0, 20)) {
    lines.push(`[${log.occurredAt.toISOString().slice(0, 10)}] ${log.entryType}: ${log.title} — ${log.body}`);
  }

  return lines.join("\n");
}

function proposalAnswer(proposal: ErnestWriteProposal) {
  if (proposal.kind === "component_add") return `I can add ${proposal.component.name} to the ${proposal.component.systemName} equipment list. Review the proposed equipment entry below before I write anything.`;
  if (proposal.kind === "log") return `I can save that to ${proposal.log.entryType} history. Review it below first.`;
  if (proposal.kind === "component_fact") return `I can update ${proposal.componentFact.componentName}. Review the proposed change below first.`;
  if (proposal.kind === "component_lifecycle") return `I can change the lifecycle status for ${proposal.lifecycle.componentName}. Review the proposed change below first.`;
  if (proposal.kind === "inventory_add") return `I can add ${proposal.inventory.name} to onboard inventory. Review it below first.`;
  if (proposal.kind === "inventory_update") return `I can update ${proposal.inventory.currentName}. Review it below first.`;
  if (proposal.kind === "procedure_add") return `I can add ${proposal.procedure.title}. Review every proposed step below first.`;
  if (proposal.kind === "procedure_update") return `I can update ${proposal.procedure.currentTitle}. Review the complete procedure below first.`;
  return "I can save that as owner-provided information. Review the change below first.";
}

export async function askErnest(assetId: string, _previous: AskErnestState, formData: FormData): Promise<AskErnestState> {
  const session = await auth();
  if (!session?.user?.id) return { ...empty(), error: "Please sign in again." };

  const question = String(formData.get("question") ?? "").trim().slice(0, 500);
  if (!question) return { ...empty(), error: "Enter a question." };

  const conversation = String(formData.get("conversation") ?? "").trim().slice(-6000);
  const thinkHarder = String(formData.get("thinkHarder") ?? "") === "true";

  try {
    const [asset, logs, inventory, locations, lifecycles, procedures, context] = await Promise.all([
      getAsset(assetId, session.user.id),
      getLogEntries(assetId, session.user.id),
      getInventoryItems(assetId, session.user.id),
      getInventoryLocations(assetId, session.user.id),
      getComponentLifecycles(assetId, session.user.id),
      getProcedures(assetId, session.user.id),
      getErnestDocumentContext(assetId, session.user.id, retrievalQuestion(question, conversation)),
    ]);

    if (!asset) return { ...empty(), question, error: "I couldn’t find that asset." };

    const proposal = await proposeErnestWrite(question, asset, inventory, locations, conversation, lifecycles, procedures);
    if (proposal) return { question, answer: proposalAnswer(proposal), sources: [], proposal };

    const contextual = conversation
      ? `Recent conversation (context only, not verified evidence):\n${conversation}\n\nCurrent question:\n${question}`
      : question;
    const answer = await answerErnestQuestion(contextual, context, verified(asset, logs, inventory, lifecycles, procedures), thinkHarder);

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
    return { question, answer: "", sources: [], error: "Ernest couldn’t answer that right now. Please try again." };
  }
}
