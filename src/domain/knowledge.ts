import { expandedTerms, evidenceContains } from "./retrieval";
export type KnowledgeInput = {
  subject: string; predicate: string; value: string;
  kind: "current_fact" | "observation" | "equipment_status";
  effectiveOn: string; provenance: string; supersedesId: string | null;
};
export type KnowledgeFact = KnowledgeInput & {
  id: string; verification: "owner_confirmed"; confidence: number;
  supersededBy: string | null; createdAt: string;
};
export function parseKnowledgeInput(input: unknown): KnowledgeInput | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Record<string, unknown>;
  const text = (key: string, max: number) => typeof p[key] === "string" ? (p[key] as string).trim().replace(/\u0000/g, "").slice(0,max) : "";
  const subject=text("subject",160), predicate=text("predicate",160), value=text("value",2000), kind=text("kind",30), effectiveOn=text("effectiveOn",10), provenance=text("provenance",2000), supersedesId=text("supersedesId",36)||null;
  if (!subject || !predicate || !value || !provenance || !["current_fact","observation","equipment_status"].includes(kind)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) || !Number.isFinite(Date.parse(effectiveOn)) || new Date(effectiveOn).toISOString().slice(0,10) !== effectiveOn) return null;
  if(effectiveOn>new Date().toISOString().slice(0,10))return null;
  if (supersedesId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supersedesId)) return null;
  return {subject,predicate,value,kind:kind as KnowledgeInput["kind"],effectiveOn,provenance,supersedesId};
}
export function formatKnowledge(facts: KnowledgeFact[], today = new Date().toISOString().slice(0,10)) {
  const current=facts.filter(f=>!f.supersededBy && f.effectiveOn<=today && f.kind!=="observation");
  const history=facts.filter(f=>f.supersededBy || f.kind==="observation" || f.effectiveOn>today);
  const line=(f:KnowledgeFact)=>`[${f.id}] ${f.subject} / ${f.predicate}: ${f.value} (effective ${f.effectiveOn}; ${f.verification}; provenance: ${f.provenance})`;
  return ["OWNER-CONFIRMED CURRENT KNOWLEDGE (takes precedence over older document evidence):",...current.map(line),"HISTORICAL / SUPERSEDED / FUTURE KNOWLEDGE (not current status):",...history.map(f=>`${line(f)}${f.supersededBy?` superseded by ${f.supersededBy}`:""}`)].join("\n");
}

export function selectKnowledge(question:string,facts:KnowledgeFact[]){
  const terms=expandedTerms(question);
  const ranked=facts.map(f=>({f,score:terms.filter(t=>evidenceContains(`${f.subject} ${f.predicate} ${f.value}`,t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || Number(!!a.f.supersededBy)-Number(!!b.f.supersededBy));
  const chosen=ranked.slice(0,12).map(x=>x.f);
  // Preserve the historical side of a correction when it is already available.
  for(const current of [...chosen]){const old=facts.find(f=>f.id===current.supersedesId);if(old&&!chosen.some(f=>f.id===old.id)&&chosen.length<16)chosen.push(old);}
  return chosen.map(f=>({...f,value:f.value.slice(0,1600),provenance:f.provenance.slice(0,400)}));
}
