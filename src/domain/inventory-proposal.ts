import type { InventoryItem } from "@/data/inventory";
import type { ErnestWriteProposal } from "@/data/ernest-write-proposals";

/** A narrow, deterministic path for explicit, unambiguous owner quantity updates. */
export function quantityProposal(message: string, inventory: InventoryItem[]): ErnestWriteProposal | null {
  const text = message.trim();
  if (/\b(if|maybe|might|perhaps|hypothetical|suppose|used to|had|not sure|don't|do not)\b/i.test(text)) return null;
  const possession = text.match(/^I\s+(?:now\s+)?(?:have|carry)\s+(\d+(?:\.\d+)?)\s+([^.!?\n]+)/i);
  const update = text.match(/^(?:please\s+)?(?:set|update|change|correct)\s+(?:the\s+)?(?:quantity|count)\s+(?:of\s+|for\s+)?(.+?)\s+to\s+(\d+(?:\.\d+)?)(?:\s*[.!?]|$)/i);
  if (!possession && !update) return null;
  const quantity = possession?.[1] ?? update![2];
  const subject = possession?.[2] ?? update![1];
  const tokens = subject.toLowerCase().match(/[a-z0-9]+/g)?.filter(t => !["the","in","at","on","board","aboard","now"].includes(t)).map(t => t.replace(/s$/, "")) ?? [];
  if (!tokens.length || !Number.isFinite(Number(quantity))) return null;
  const matches = inventory.filter(item => {
    const words = new Set(`${item.name} ${item.locations.join(" ")}`.toLowerCase().match(/[a-z0-9]+/g)?.map(t => t.replace(/s$/, "")));
    return tokens.every(t => words.has(t));
  });
  if (matches.length !== 1) return null;
  const item = matches[0];
  return { kind: "inventory_update", summary: `Set ${item.name} quantity to ${quantity}.`, inventory: {
    itemId: item.id, currentName: item.name, name: null, quantity, details: null,
    locationCode: null, expectedQuantity: item.quantity, currentLocations: item.locations,
  } };
}

/** Only explicit owner statements; never infer a location name or an absence. */
export function inventoryKnowledgeProposal(message: string, locations: import("@/data/inventory").InventoryLocation[], knowledge: import("./knowledge").KnowledgeFact[]): ErnestWriteProposal | null {
 const text=message.trim();
 if(/[?]|\b(if|maybe|might|perhaps|suppose|not sure|used to)\b/i.test(text))return null;
 const location=text.match(/^([a-z][a-z0-9_-]*)\s+(?:is|means)\s+(?:the\s+)?([^.!\n]+)[.!]?$/i);
 const absence=text.match(/^(?:there is (?:no|not (?:a|an))|we (?:do not|don't) have (?:a |an )?)\s*(.+?)\s+(?:aboard|on board)[.!]?$/i);
 let subject:string,predicate:string,value:string;
 if(location && locations.some(l=>l.code.toLowerCase()===location[1].toLowerCase())){
  subject=locations.find(l=>l.code.toLowerCase()===location[1].toLowerCase())!.code;
  predicate="location name";value=location[2].trim();
 }else if(absence){subject=absence[1].trim();predicate="presence aboard";value="not aboard";}
 else return null;
 if(!subject||subject.length>160||!value||value.length>2000)return null;
 const previous=knowledge.find(k=>!k.supersededBy&&k.kind!=="observation"&&k.subject.toLowerCase()===subject.toLowerCase()&&k.predicate.toLowerCase()===predicate);
 return{kind:"knowledge_fact",summary:`Remember ${subject}: ${value}.`,knowledge:{subject,predicate,value,kind:"current_fact",effectiveOn:new Date().toISOString().slice(0,10),provenance:`Owner statement: ${text}`,supersedesId:previous?.id??null},previousValue:previous?.value};
}
