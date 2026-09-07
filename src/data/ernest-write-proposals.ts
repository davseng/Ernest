import "server-only";
import OpenAI from "openai";
import type { Asset } from "@/domain/assets";
import type { LogEntryType } from "@/domain/log-entries";
import type { InventoryItem,InventoryLocation } from "@/data/inventory";

export type ErnestWriteProposal=
|{kind:"log";summary:string;log:{occurredAt:string;entryType:LogEntryType;title:string;body:string}}
|{kind:"component_fact";summary:string;componentFact:{systemId:string;componentId:string;componentName:string;field:"manufacturer"|"model"|"serialNumber"|"location"|"notes";value:string}}
|{kind:"asset_fact";summary:string;assetFact:{field:"name"|"make"|"model"|"year"|"summary"|"registrationNumber";value:string}}
|{kind:"inventory_add";summary:string;inventory:{name:string;quantity:string|null;details:string|null;locationCode:string|null}}
|{kind:"inventory_update";summary:string;inventory:{itemId:string;currentName:string;name:string|null;quantity:string|null;details:string|null;locationCode:string|null}};

let client:OpenAI|undefined; function openai(){const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)throw new Error("OPENAI_API_KEY is required");client??=new OpenAI({apiKey});return client;}
function clean(v:unknown,max=1000){return typeof v==="string"?v.trim().slice(0,max):"";}
function parse(text:string){try{const v=JSON.parse(text.trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim());return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;}catch{return null;}}
function candidates(asset:Asset,inventory:InventoryItem[],locations:InventoryLocation[]){const lines=[`ASSET id=${asset.id} name=${JSON.stringify(asset.name)}`];for(const s of asset.systems){for(const c of s.components)lines.push(`COMPONENT systemId=${s.id} id=${c.id} name=${JSON.stringify(c.name)}`);}for(const i of inventory)lines.push(`INVENTORY id=${i.id} name=${JSON.stringify(i.name)} quantity=${JSON.stringify(i.quantity)} details=${JSON.stringify(i.details)} locations=${JSON.stringify(i.locations)}`);for(const l of locations)lines.push(`LOCATION code=${JSON.stringify(l.code)} label=${JSON.stringify(l.label)} notes=${JSON.stringify(l.notes)}`);return lines.join("\n");}

export async function proposeErnestWrite(message:string,asset:Asset,inventory:InventoryItem[]=[],locations:InventoryLocation[]=[],conversation=""):Promise<ErnestWriteProposal|null>{
 const response=await openai().responses.create({model:process.env.OPENAI_MODEL||"gpt-5.6-luna",reasoning:{effort:"low"},instructions:[
 "Classify whether the asset owner clearly intends Ernest to save or change durable information. Use recent conversation to resolve references like it, that, there, yes, add it, or move it. Never invent missing values.",
 "Use inventory_add when the owner clearly asks to add a new onboard item. Use inventory_update only for an EXISTING inventory item that can be identified unambiguously. A locationCode must exactly match a listed LOCATION code; otherwise do not invent one.",
 "For inventory quantity, use only a numeric count when the owner actually states a count. Measurements such as '5 feet' belong in details, not numeric quantity.",
 "Use log for completed events/maintenance/passages/observations/incidents/owner notes. Use component_fact only for one durable fact about an existing listed component. Use asset_fact for the asset itself.",
 "A prior informational statement plus a current explicit instruction such as 'add it' counts as intent to save when the referent is clear from RECENT CONVERSATION.",
 "If the user merely supplies a new inventory fact without asking to save/add/update it, you MAY propose inventory_add when the intent to keep onboard inventory is clear; never silently save.",
 "Return ONLY compact JSON. kind is one of none,log,component_fact,asset_fact,inventory_add,inventory_update.",
 "inventory_add shape: {\"kind\":\"inventory_add\",\"summary\":\"...\",\"name\":\"...\",\"quantity\":null,\"details\":\"...\",\"locationCode\":\"D6\"}.",
 "inventory_update shape: {\"kind\":\"inventory_update\",\"summary\":\"...\",\"itemId\":\"...\",\"currentName\":\"...\",\"name\":null,\"quantity\":null,\"details\":null,\"locationCode\":\"D6\"}. Null means unchanged.",
 "log shape uses occurredAt YYYY-MM-DD, entryType one of note,maintenance,passage,observation,incident,title,body. component_fact fields manufacturer,model,serialNumber,location,notes. asset_fact fields name,make,model,year,summary,registrationNumber."
 ].join(" "),input:`CURRENT DATE: ${new Date().toISOString().slice(0,10)}\n\nRECENT CONVERSATION:\n${conversation||"(none)"}\n\nCURRENT OWNER MESSAGE:\n${message}\n\nCANDIDATE RECORDS:\n${candidates(asset,inventory,locations)}`});
 const p=parse(response.output_text);if(!p)return null;const kind=clean(p.kind,30);if(!kind||kind==="none")return null;
 if(kind==="inventory_add"){const name=clean(p.name,200),quantity=clean(p.quantity,40)||null,details=clean(p.details,1000)||null,locationCode=clean(p.locationCode,100)||null,summary=clean(p.summary,300)||`Add ${name} to inventory`;if(!name)return null;if(locationCode&&!locations.some(l=>l.code.toLowerCase()===locationCode.toLowerCase()))return null;return{kind,summary,inventory:{name,quantity,details,locationCode}};}
 if(kind==="inventory_update"){const itemId=clean(p.itemId,100),currentName=clean(p.currentName,200),name=clean(p.name,200)||null,quantity=clean(p.quantity,40)||null,details=clean(p.details,1000)||null,locationCode=clean(p.locationCode,100)||null,summary=clean(p.summary,300)||`Update ${currentName} in inventory`;const item=inventory.find(i=>i.id===itemId);if(!item||(!name&&!quantity&&!details&&!locationCode))return null;if(locationCode&&!locations.some(l=>l.code.toLowerCase()===locationCode.toLowerCase()))return null;return{kind,summary,inventory:{itemId,currentName:item.name,name,quantity,details,locationCode}};}
 if(kind==="log"){const occurredAt=clean(p.occurredAt,10),entryType=clean(p.entryType,20) as LogEntryType,title=clean(p.title,200),body=clean(p.body,2000),summary=clean(p.summary,300)||`Save ${title} to the operating log`;if(!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)||!["note","maintenance","passage","observation","incident"].includes(entryType)||!title||!body)return null;return{kind,summary,log:{occurredAt,entryType,title,body}};}
 if(kind==="component_fact"){const systemId=clean(p.systemId,100),componentId=clean(p.componentId,100),componentName=clean(p.componentName,100),field=clean(p.field,30) as "manufacturer"|"model"|"serialNumber"|"location"|"notes",value=clean(p.value,field==="notes"?1000:200),summary=clean(p.summary,300)||`Save ${componentName} ${field}`;const system=asset.systems.find(s=>s.id===systemId),component=system?.components.find(c=>c.id===componentId);if(!component||!["manufacturer","model","serialNumber","location","notes"].includes(field)||!value)return null;return{kind,summary,componentFact:{systemId,componentId,componentName:component.name||componentName,field,value}};}
 if(kind==="asset_fact"){const field=clean(p.field,30) as "name"|"make"|"model"|"year"|"summary"|"registrationNumber",value=clean(p.value,field==="summary"?1000:200),summary=clean(p.summary,300)||`Save ${field} for ${asset.name}`;if(!["name","make","model","year","summary","registrationNumber"].includes(field)||!value)return null;if(field==="year"&&!/^\d{4}$/.test(value))return null;return{kind,summary,assetFact:{field,value}};}
 return null;
}
