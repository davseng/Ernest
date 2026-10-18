"use server";

import { auth } from "@/auth";
import { answerThinErnestQuestion } from "@/data/ask-ernest";
import { getAsset } from "@/data/assets";
import { getErnestDocumentContext } from "@/data/document-context";
import { getAssetFindings } from "@/data/document-findings";
import { proposeErnestWrite, type ErnestWriteProposal } from "@/data/ernest-write-proposals";
import { getComponentLifecycles } from "@/data/equipment-knowledge";
import { getInventoryItems, getInventoryLocations } from "@/data/inventory";
import { getLogEntries } from "@/data/log-entries";
import { getPhotoEvidence } from "@/data/photo-evidence";
import { getVisualSourceFiles } from "@/data/visual-sources";
import { getOwnerKnowledge } from "@/data/knowledge";
import { formatKnowledge, selectKnowledge } from "@/domain/knowledge";
import { selectEvidence, expandedTerms, evidenceContains } from "@/domain/retrieval";
import { evidenceSources } from "@/domain/evidence";
import { requestsWrite, readOnlyAnswer } from "@/domain/write-safety";
import { inventoryContext } from "@/domain/inventory-context";
import { getProcedures } from "@/data/procedures";

export type AskErnestState = {
  question: string;
  answer: string;
  sources: { photoId?:string; documentId?: string; documentTitle: string; pageNumber: number }[];
  proposal?: ErnestWriteProposal;
  error?: string;
  comparison?: { current: string; thin: string; context: string };
};

const empty = (): AskErnestState => ({ question: "", answer: "", sources: [] });

function looksLikeFollowUp(question: string) {
  if (question.length > 180) return false;
  return /\b(it|that|this|those|these|them|there|they|he|she|more|detail|details|earlier|above)\b/i.test(question)
    || /^(and|but|so|why|how|what about|how about|what else|then)\b/i.test(question);
}

function retrievalQuestion(question: string, conversation: string) {
  if (!conversation || !looksLikeFollowUp(question)) return question;
  const ownerTurns = [...conversation.matchAll(/Owner:\s*([^\n]+)/gi)]
    .map((match) => match[1]?.trim() || "")
    .filter(Boolean);
  const priorOwnerQuestion = ownerTurns.slice(-3).join(" ");
  return [question, priorOwnerQuestion].filter(Boolean).join(" ").slice(0, 800);
}

function ernestTurns(conversation: string) {
  return [...conversation.matchAll(/Ernest:\s*([^]*?)(?=\nOwner:|$)/gi)]
    .map((match) => match[1]?.trim() || "")
    .filter(Boolean);
}

function clarificationQuestion(turn: string) {
  if (!turn) return null;
  const paragraphs = turn.split(new RegExp("\\n\\s*\\n")).map((value) => value.trim()).filter(Boolean);
  for (const paragraph of paragraphs.slice(-2).reverse()) {
    if (paragraph.includes("?")) return paragraph;
  }
  return null;
}

function referencesEarlierQuestion(question: string) {
  return /\b(previous|earlier)\s+question\b|\bas to (?:your )?(?:previous|earlier)?\s*question\b|\b(?:to answer|answering) (?:your )?(?:previous|earlier)?\s*question\b|\byou asked\b/i.test(question);
}

function clarificationContext(question: string, conversation: string) {
  if (!conversation || question.length > 500) return null;
  const turns = ernestTurns(conversation);
  const direct = clarificationQuestion(turns.at(-1) || "");
  if (direct) return direct;
  if (!referencesEarlierQuestion(question)) return null;
  for (const turn of turns.slice(-3).reverse()) {
    const earlier = clarificationQuestion(turn);
    if (earlier) return earlier;
  }
  return null;
}

function learningProposalMessage(question: string, conversation: string) {
  const clarification = clarificationContext(question, conversation);
  if (!clarification) return question;
  return [
    "LEARNING FOLLOW-UP: The owner is answering a recent Ernest clarification question.",
    "The owner answering a clarification question is explicit intent to let Ernest remember a concrete durable asset fact when the answer is sufficiently definite.",
    "Return a confirmation proposal whenever the answer supplies a concrete durable fact that can be represented safely. Prefer a structured equipment, inventory, lifecycle, asset, or procedure field when there is an exact fit. Otherwise use an observation log as the durable fallback; a current meter reading, which meter is authoritative, an observed condition, a location, or another owner-observed operating fact belongs in an observation log rather than being discarded merely because there is no dedicated field.",
    "For an observation learned now, use today's date, a concise factual title, and a body containing only what the owner actually established plus enough subject context from Ernest's question to make the fact understandable later.",
    "Do not propose a write for opinions, plans, guesses, uncertain answers, ordinary discussion, or anything that cannot be mapped without invention. Never infer more than the owner's actual answer. The proposal still requires owner confirmation before anything is written or verified.",
    `ERNEST CLARIFICATION: ${clarification}`,
    `OWNER ANSWER: ${question}`,
  ].join("\n");
}



function relevantTerms(question:string){return expandedTerms(question);}

type RetrievalIntent = "fact" | "procedure" | "troubleshooting" | "maintenance" | "judgment" | "evidence";

function retrievalIntent(question: string): RetrievalIntent {
  const q = question.toLowerCase();
  if (/\b(show|cite|source|evidence|survey|document|manual|report|records?|according to)\b/.test(q)) return "evidence";
  if (/\b(troubleshoot|diagnos|not working|failed|failure|problem|issue|leak|noise|overheat|charging)\b/.test(q)) return "troubleshooting";
  if (/\b(maintenance|service|replace|change|interval|hours|impeller|oil|filter|inspect)\b/.test(q)) return "maintenance";
  if (/\b(ready|should i|would you|recommend|safe|risk|captain|professional|offshore|passage|bahamas|weather window|decision|choose)\b/.test(q)) return "judgment";
  if (/\b(procedure|steps|checklist|how do i|how should i|operate|shutdown|shut down|start up)\b/.test(q)) return "procedure";
  return "fact";
}

function focusedVerified(
  question: string,
  asset: NonNullable<Awaited<ReturnType<typeof getAsset>>>,
  logs: Awaited<ReturnType<typeof getLogEntries>>,
  lifecycles: Awaited<ReturnType<typeof getComponentLifecycles>>,
  procedures: Awaited<ReturnType<typeof getProcedures>>,
) {
  const terms = relevantTerms(question);
  const score = (text: string) => terms.reduce((n,t) => n + (evidenceContains(text,t) ? 1 : 0), 0);
  const lines = ["ASSET RECORD:", `Name: ${asset.name}`];
  const lifecycleByComponent = new Map(lifecycles.map((item) => [item.componentId, item]));
  const components = asset.systems.flatMap(system => system.components.map(component => ({system,component,score:score([system.name,component.name,component.manufacturer,component.model,component.location].filter(Boolean).join(" "))}))).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
  for (const {system,component} of components) {
    const lifecycle=lifecycleByComponent.get(component.id);
    lines.push(`SYSTEM: ${system.name}`);
    lines.push(`Component: ${component.name} · Manufacturer: ${component.manufacturer || ""} · Model: ${component.model || ""} · Location: ${component.location || ""}${lifecycle ? ` · Status: ${lifecycle.status}${lifecycle.changedOn ? ` since ${lifecycle.changedOn}` : ""}${lifecycle.notes ? ` · Lifecycle note: ${lifecycle.notes}` : ""}` : ""}`);
  }
  const procedureIntent=/\b(procedure|steps|checklist|how do i|how should i|operate|shutdown|shut down|start up)\b/i.test(question);
  if(procedureIntent){const hits=procedures.map(p=>({p,score:score([p.title,p.notes||"",...p.steps.map(x=>x.instruction)].join(" "))})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,2);if(hits.length){lines.push("VERIFIED PROCEDURES:");for(const {p} of hits){lines.push(`PROCEDURE: ${p.title} · type ${p.procedureType}`);for(const step of p.steps.slice(0,40))lines.push(`${step.position+1}. ${step.instruction}`);}}}
  const logHits=logs.map(log=>({log,score:score(`${log.title} ${log.body} ${log.entryType}`)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
  if(logHits.length){lines.push("RELEVANT OPERATING / MAINTENANCE HISTORY:");for(const {log} of logHits)lines.push(`[${log.occurredAt.toISOString().slice(0,10)}] ${log.entryType}: ${log.title} — ${log.body}`);}
  return lines.join("\n");
}

function focusedDocuments(question: string, context: Awaited<ReturnType<typeof getErnestDocumentContext>>) {
  return selectEvidence(question, context, retrievalIntent(question) === "evidence" ? 18000 : 14000);
}

function termMatches(value: string, term: string) {
  const v=value.toLowerCase();
  if(evidenceContains(v,term))return true;
  const aliases:Record<string,string[]>={ais:["ais700","ais 700","automatic identification"],gps:["gnss"],cooler:["oil cooler","gear cooler"],windlass:["anchor windlass"]};
  return (aliases[term]||[]).some(alias=>v.includes(alias));
}

function relevantHistoricalEvidence(question: string, findings: Awaited<ReturnType<typeof getAssetFindings>>) {
  const terms = relevantTerms(question);
  const score = (value: string) => terms.reduce((n, term) => n + (termMatches(value,term) ? 1 : 0), 0);
  const hits = findings.map((finding) => ({ finding, score: score([finding.findingType, finding.statement, finding.documentTitle].join(" ")) })).filter((item) => item.score > 0).sort((a,b) => b.score - a.score).slice(0,8);
  if (!hits.length) return "";
  return ["HISTORICAL DOCUMENT EVIDENCE (dated evidence, not automatically a current asset fact):", ...hits.map(({finding}) => `- ${finding.observedAt ? `[${finding.observedAt}] ` : ""}${finding.statement} · source ${finding.documentTitle}${finding.pageNumber ? `, p. ${finding.pageNumber}` : ""} · lifecycle status ${finding.status}`)].join("\n");
}

function proposalAnswer(proposal: ErnestWriteProposal) {
  if (proposal.kind === "knowledge_fact") return "I can remember this as owner-confirmed knowledge. Review the fact, effective date, and any superseded record below before saving.";
  if (proposal.kind === "component_add") return `I can add ${proposal.component.name} to the ${proposal.component.systemName} equipment list. Review the proposed equipment entry below before I write anything.`;
  if (proposal.kind === "log") return `That's useful to remember. I can save it to ${proposal.log.entryType} history; review the proposed record below first.`;
  if (proposal.kind === "component_fact") return `That's useful to pin down. I can update ${proposal.componentFact.componentName}; review the proposed fact below first.`;
  if (proposal.kind === "component_lifecycle") return `I can change the lifecycle status for ${proposal.lifecycle.componentName}. Review the proposed change below first.`;
  if (proposal.kind === "inventory_add") return `I can add ${proposal.inventory.name} to onboard inventory. Review it below first.`;
  if (proposal.kind === "inventory_update") return `I can update ${proposal.inventory.currentName}. Review it below first.`;
  if (proposal.kind === "procedure_add") return `I can add ${proposal.procedure.title}. Review every proposed step below first.`;
  if (proposal.kind === "procedure_update") return `I can update ${proposal.procedure.currentTitle}. Review the complete procedure below first.`;
  return "That's useful to remember. I can save it as owner-provided information; review the proposed fact below first.";
}

export async function askErnest(assetId: string, _previous: AskErnestState, formData: FormData): Promise<AskErnestState> {
  const session = await auth();
  if (!session?.user?.id) return { ...empty(), error: "Please sign in again." };

  const question = String(formData.get("question") ?? "").trim().slice(0, 500);
  if (!question) return { ...empty(), error: "Enter a question." };

  const conversation = String(formData.get("conversation") ?? "").trim().slice(-6000);
  const thinkHarder = String(formData.get("thinkHarder") ?? "") === "true";

  try {
    const [asset, logs, inventory, locations, lifecycles, procedures, context, findings, knowledge] = await Promise.all([
      getAsset(assetId, session.user.id),
      getLogEntries(assetId, session.user.id),
      getInventoryItems(assetId, session.user.id),
      getInventoryLocations(assetId, session.user.id),
      getComponentLifecycles(assetId, session.user.id),
      getProcedures(assetId, session.user.id),
      getErnestDocumentContext(assetId, session.user.id, retrievalQuestion(question, conversation)),
      getAssetFindings(assetId, session.user.id),
      getOwnerKnowledge(assetId, session.user.id),
    ]);

    if (!asset) return { ...empty(), question, error: "I couldn’t find that asset." };

    const learningMessage = learningProposalMessage(question, conversation);
    const classifiedProposal = await proposeErnestWrite(learningMessage, asset, inventory, locations, conversation, lifecycles, procedures, knowledge);
    const proposal = classifiedProposal;
    if (proposal) return { question, answer: proposalAnswer(proposal), sources: [], proposal };
    if (requestsWrite(question)) return {
      question, sources: [],
      answer: "That change has not been saved. Please specify the exact inventory item or fact and its new value; if there are similar items, include its storage code. I will show a real confirmation card before writing anything.",
    };

    const contextual = conversation
      ? `Recent conversation (context only, not verified evidence):
${conversation}

Current question:
${question}`
      : question;
    const subjectQuestion = retrievalQuestion(question, conversation);
    const focusedContext = focusedDocuments(subjectQuestion, context);
    const historicalEvidence = relevantHistoricalEvidence(subjectQuestion, findings);
    const focusedKnowledge = [formatKnowledge(selectKnowledge(subjectQuestion,knowledge)), focusedVerified(subjectQuestion, asset, logs, lifecycles, procedures), inventoryContext(subjectQuestion, inventory, locations, knowledge), historicalEvidence].filter(Boolean).join("\n\n");
    const visuals = await getVisualSourceFiles(assetId,session.user.id,subjectQuestion,focusedContext);
    const photoEvidence = await getPhotoEvidence(assetId,session.user.id,subjectQuestion);
    const focused = await answerThinErnestQuestion(contextual, focusedContext, [focusedKnowledge,...visuals.warnings,...photoEvidence.warnings].join("\n"), thinkHarder, visuals.files, photoEvidence.files);
    const answer = readOnlyAnswer(focused.answer);

    const seen = new Set<string>();
    const sources = focusedContext
      .filter((page) => {
        const key = `${page.documentId}:${page.pageNumber}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((page) => ({ documentId: page.documentId, documentTitle: page.documentTitle, pageNumber: page.pageNumber }));

    return { question, answer, sources:evidenceSources([...sources,...visuals.files.filter(f=>f.documentId).map(f=>({documentId:f.documentId,documentTitle:f.documentTitle,pageNumber:0})),...photoEvidence.files.map(p=>({photoId:p.photoId,documentTitle:p.title,pageNumber:0}))]) };
  } catch (error) {
    console.error("Ask Ernest failure", error);
    return { question, answer: "", sources: [], error: "Ernest couldn’t answer that right now. Please try again." };
  }
}
