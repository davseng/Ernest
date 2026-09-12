import "server-only";
import OpenAI from "openai";
import type { Asset } from "@/domain/assets";
import type { LogEntryType } from "@/domain/log-entries";
import type { InventoryItem, InventoryLocation } from "@/data/inventory";
import type { ComponentLifecycle, EquipmentLifecycleStatus } from "@/data/equipment-knowledge";
import type { ProcedureRecord, ProcedureType } from "@/data/procedures";

export type ErnestWriteProposal =
  | { kind:"log"; summary:string; log:{ occurredAt:string; entryType:LogEntryType; title:string; body:string } }
  | { kind:"component_fact"; summary:string; componentFact:{ systemId:string; componentId:string; componentName:string; field:"name"|"manufacturer"|"model"|"serialNumber"|"location"|"notes"; value:string } }
  | { kind:"component_lifecycle"; summary:string; lifecycle:{ componentId:string; componentName:string; status:EquipmentLifecycleStatus; changedOn:string|null; notes:string|null } }
  | { kind:"asset_fact"; summary:string; assetFact:{ field:"name"|"make"|"model"|"year"|"summary"|"registrationNumber"; value:string } }
  | { kind:"inventory_add"; summary:string; inventory:{ name:string; quantity:string|null; details:string|null; locationCode:string|null } }
  | { kind:"inventory_update"; summary:string; inventory:{ itemId:string; currentName:string; name:string|null; quantity:string|null; details:string|null; locationCode:string|null } }
  | { kind:"procedure_add"; summary:string; procedure:{ title:string; procedureType:ProcedureType; notes:string; steps:Array<{instruction:string;note:string|null}> } }
  | { kind:"procedure_update"; summary:string; procedure:{ procedureId:string; currentTitle:string; title:string; procedureType:ProcedureType; notes:string; steps:Array<{instruction:string;note:string|null}> } };

let client: OpenAI | undefined;
function openai(){ const apiKey=process.env.OPENAI_API_KEY; if(!apiKey) throw new Error("OPENAI_API_KEY is required"); client??=new OpenAI({apiKey}); return client; }
function clean(v:unknown,max=1000){ return typeof v==="string" ? v.trim().slice(0,max) : ""; }
function parse(text:string){ try{ const v=JSON.parse(text.trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim()); return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null; }catch{return null;} }
function cleanSteps(v:unknown){
  if(!Array.isArray(v)) return [];
  return v.flatMap((item)=>{ if(!item||typeof item!=="object") return []; const row=item as Record<string,unknown>; const instruction=clean(row.instruction,500); if(!instruction) return []; return [{instruction,note:clean(row.note,500)||null}]; });
}
function candidateText(asset:Asset,inventory:InventoryItem[],locations:InventoryLocation[],lifecycles:ComponentLifecycle[],procedures:ProcedureRecord[]){
  const life=new Map(lifecycles.map((x)=>[x.componentId,x]));
  const lines=[`ASSET id=${asset.id} name=${JSON.stringify(asset.name)}`];
  for(const s of asset.systems){ for(const c of s.components){ const lc=life.get(c.id); lines.push(`COMPONENT systemId=${s.id} id=${c.id} name=${JSON.stringify(c.name)} manufacturer=${JSON.stringify(c.manufacturer)} model=${JSON.stringify(c.model)} serial=${JSON.stringify(c.serialNumber)} location=${JSON.stringify(c.location)} lifecycle=${lc?.status??"installed"} lifecycleDate=${JSON.stringify(lc?.changedOn??null)} lifecycleNotes=${JSON.stringify(lc?.notes??null)}`); } }
  for(const i of inventory) lines.push(`INVENTORY id=${i.id} name=${JSON.stringify(i.name)} quantity=${JSON.stringify(i.quantity)} details=${JSON.stringify(i.details)} locations=${JSON.stringify(i.locations)}`);
  for(const l of locations) lines.push(`LOCATION code=${JSON.stringify(l.code)} label=${JSON.stringify(l.label)} notes=${JSON.stringify(l.notes)}`);
  for(const p of procedures) lines.push(`PROCEDURE id=${p.id} title=${JSON.stringify(p.title)} type=${p.procedureType} notes=${JSON.stringify(p.notes)} steps=${JSON.stringify(p.steps.map(s=>({instruction:s.instruction,note:s.note})))}`);
  return lines.join("\n");
}

export async function proposeErnestWrite(
  message:string,
  asset:Asset,
  inventory:InventoryItem[]=[],
  locations:InventoryLocation[]=[],
  conversation="",
  lifecycles:ComponentLifecycle[]=[],
  procedures:ProcedureRecord[]=[],
):Promise<ErnestWriteProposal|null>{
  const response=await openai().responses.create({
    model:process.env.OPENAI_MODEL||"gpt-5.6-luna", reasoning:{effort:"low"},
    instructions:[
      "Classify whether the asset owner clearly intends Ernest to save or change durable information. Recent conversation may resolve references, but it is NOT verified evidence. Never invent missing values.",
      "Use component_fact for one explicit correction/detail on an existing COMPONENT, including its name. Use component_lifecycle when the owner explicitly says installed, removed, replaced, or installation status is unknown. Do not infer lifecycle from old documents or conversation.",
      "Use procedure_add only when the owner explicitly provides the checklist/procedure steps to save. Use procedure_update only for an EXISTING PROCEDURE that is unambiguous. Return the COMPLETE resulting procedure, preserving every existing step not explicitly changed and applying only the owner's requested edit. Never add safety steps, warnings, or best practices the owner did not provide.",
      "Use inventory_add/update only for onboard inventory. locationCode must exactly match a listed LOCATION. Numeric quantity is only a count; measurements belong in details.",
      "Use log for completed events/maintenance/passages/observations/incidents. Use asset_fact only for the asset itself.",
      "Nothing is written now; this output is only a proposal that the owner must confirm.",
      "Return ONLY compact JSON. kind is one of none,log,component_fact,component_lifecycle,asset_fact,inventory_add,inventory_update,procedure_add,procedure_update.",
      "component_lifecycle: {\"kind\":\"component_lifecycle\",\"summary\":\"...\",\"componentId\":\"...\",\"componentName\":\"...\",\"status\":\"installed|removed_replaced|unknown\",\"changedOn\":\"YYYY-MM-DD or null\",\"notes\":\"explicit owner note or null\"}.",
      "procedure_add: {\"kind\":\"procedure_add\",\"summary\":\"...\",\"title\":\"...\",\"procedureType\":\"checklist|routine|emergency\",\"notes\":\"\",\"steps\":[{\"instruction\":\"...\",\"note\":null}]}.",
      "procedure_update is the same plus procedureId and currentTitle, and steps MUST be the complete resulting list.",
      "inventory_add/update and log/component_fact/asset_fact use their existing obvious fields. log occurredAt must be YYYY-MM-DD."
    ].join(" "),
    input:`CURRENT DATE: ${new Date().toISOString().slice(0,10)}\n\nRECENT CONVERSATION (UNVERIFIED CONTEXT):\n${conversation||"(none)"}\n\nCURRENT OWNER MESSAGE:\n${message}\n\nCURRENT VERIFIED/OWNER-CONTROLLED RECORDS:\n${candidateText(asset,inventory,locations,lifecycles,procedures)}`,
  });
  const p=parse(response.output_text); if(!p) return null; const kind=clean(p.kind,30); if(!kind||kind==="none") return null;
  if(kind==="inventory_add"){const name=clean(p.name,200),quantity=clean(p.quantity,40)||null,details=clean(p.details,1000)||null,locationCode=clean(p.locationCode,100)||null,summary=clean(p.summary,300)||`Add ${name} to inventory`;if(!name)return null;if(locationCode&&!locations.some(l=>l.code.toLowerCase()===locationCode.toLowerCase()))return null;return{kind,summary,inventory:{name,quantity,details,locationCode}};}
  if(kind==="inventory_update"){const itemId=clean(p.itemId,100),currentName=clean(p.currentName,200),name=clean(p.name,200)||null,quantity=clean(p.quantity,40)||null,details=clean(p.details,1000)||null,locationCode=clean(p.locationCode,100)||null,summary=clean(p.summary,300)||`Update ${currentName} in inventory`;const item=inventory.find(i=>i.id===itemId);if(!item||(!name&&!quantity&&!details&&!locationCode))return null;if(locationCode&&!locations.some(l=>l.code.toLowerCase()===locationCode.toLowerCase()))return null;return{kind,summary,inventory:{itemId,currentName:item.name,name,quantity,details,locationCode}};}
  if(kind==="log"){const occurredAt=clean(p.occurredAt,10),entryType=clean(p.entryType,20) as LogEntryType,title=clean(p.title,200),body=clean(p.body,2000),summary=clean(p.summary,300)||`Save ${title} to the operating log`;if(!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)||!["note","maintenance","passage","observation","incident"].includes(entryType)||!title||!body)return null;return{kind,summary,log:{occurredAt,entryType,title,body}};}
  if(kind==="component_fact"){const systemId=clean(p.systemId,100),componentId=clean(p.componentId,100),componentName=clean(p.componentName,100),field=clean(p.field,30) as "name"|"manufacturer"|"model"|"serialNumber"|"location"|"notes",value=clean(p.value,field==="notes"?1000:200),summary=clean(p.summary,300)||`Save ${componentName} ${field}`;const system=asset.systems.find(s=>s.id===systemId),component=system?.components.find(c=>c.id===componentId);if(!component||!["name","manufacturer","model","serialNumber","location","notes"].includes(field)||!value)return null;return{kind,summary,componentFact:{systemId,componentId,componentName:component.name||componentName,field,value}};}
  if(kind==="component_lifecycle"){const componentId=clean(p.componentId,100),componentName=clean(p.componentName,200),status=clean(p.status,30) as EquipmentLifecycleStatus,changedOn=clean(p.changedOn,10)||null,notes=clean(p.notes,1000)||null,summary=clean(p.summary,300)||`Change ${componentName} lifecycle`;const component=asset.systems.flatMap(s=>s.components).find(c=>c.id===componentId);if(!component||!["installed","removed_replaced","unknown"].includes(status))return null;if(changedOn&&!/^\d{4}-\d{2}-\d{2}$/.test(changedOn))return null;return{kind,summary,lifecycle:{componentId,componentName:component.name,status,changedOn,notes}};}
  if(kind==="procedure_add"||kind==="procedure_update"){const title=clean(p.title,200),procedureType=clean(p.procedureType,30) as ProcedureType,notes=clean(p.notes,1000),steps=cleanSteps(p.steps),summary=clean(p.summary,300)||`${kind==="procedure_add"?"Add":"Update"} ${title}`;if(!title||!["checklist","routine","emergency"].includes(procedureType)||steps.length===0)return null;if(kind==="procedure_add")return{kind,summary,procedure:{title,procedureType,notes,steps}};const procedureId=clean(p.procedureId,100);const current=procedures.find(x=>x.id===procedureId);if(!current)return null;return{kind,summary,procedure:{procedureId,currentTitle:current.title,title,procedureType,notes,steps}};}
  if(kind==="asset_fact"){const field=clean(p.field,30) as "name"|"make"|"model"|"year"|"summary"|"registrationNumber",value=clean(p.value,field==="summary"?1000:200),summary=clean(p.summary,300)||`Save ${field} for ${asset.name}`;if(!["name","make","model","year","summary","registrationNumber"].includes(field)||!value)return null;if(field==="year"&&!/^\d{4}$/.test(value))return null;return{kind,summary,assetFact:{field,value}};}
  return null;
}
