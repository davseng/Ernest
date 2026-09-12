"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getAsset, updateAsset, updateComponent } from "@/data/assets";
import { updateComponentLifecycle } from "@/data/equipment-knowledge";
import { addInventoryItem, updateInventoryItem } from "@/data/inventory";
import { createLogEntry } from "@/data/log-entries";
import { createProcedure, getProcedure, updateProcedure } from "@/data/procedures";
import type { ErnestWriteProposal } from "@/data/ernest-write-proposals";

export type ErnestWriteResult={ok:boolean;message:string};
const logTypes=new Set(["note","maintenance","passage","observation","incident"]);
const componentFields=new Set(["name","manufacturer","model","serialNumber","location","notes"]);
const assetFields=new Set(["name","make","model","year","summary","registrationNumber"]);

function revalidateAsset(assetId:string){
  revalidatePath("/");
  revalidatePath(`/assets/${assetId}`);
  revalidatePath(`/assets/${assetId}/knowledge`);
  revalidatePath(`/assets/${assetId}/inventory`);
  revalidatePath(`/assets/${assetId}/procedures`);
}

export async function confirmErnestWrite(assetId:string,proposal:ErnestWriteProposal):Promise<ErnestWriteResult>{
  const session=await auth();
  if(!session?.user?.id)return{ok:false,message:"Please sign in again."};
  const asset=await getAsset(assetId,session.user.id);
  if(!asset)return{ok:false,message:"I couldn’t find that asset."};

  if(proposal.kind==="inventory_add"){
    const name=proposal.inventory.name.trim().slice(0,200);
    if(!name)return{ok:false,message:"That inventory item needs a name."};
    const created=await addInventoryItem(assetId,session.user.id,{name,quantity:proposal.inventory.quantity,details:proposal.inventory.details?.slice(0,1000),locationCode:proposal.inventory.locationCode});
    if(!created)return{ok:false,message:"I couldn’t add that item. Check that the storage location exists."};
    revalidateAsset(assetId); return{ok:true,message:`Added ${name} to onboard inventory.`};
  }

  if(proposal.kind==="inventory_update"){
    const ok=await updateInventoryItem(assetId,session.user.id,proposal.inventory.itemId,{name:proposal.inventory.name,quantity:proposal.inventory.quantity,details:proposal.inventory.details,locationCode:proposal.inventory.locationCode});
    if(!ok)return{ok:false,message:"I couldn’t update that inventory item. It may have changed or the storage location may not exist."};
    revalidateAsset(assetId); return{ok:true,message:`Updated ${proposal.inventory.currentName} in onboard inventory.`};
  }

  if(proposal.kind==="log"){
    if(!logTypes.has(proposal.log.entryType))return{ok:false,message:"That log type is invalid."};
    const title=proposal.log.title.trim().slice(0,200),body=proposal.log.body.trim().slice(0,2000);
    if(!title||!body||!/^\d{4}-\d{2}-\d{2}$/.test(proposal.log.occurredAt))return{ok:false,message:"That log entry is incomplete."};
    const occurredAt=new Date(`${proposal.log.occurredAt}T12:00:00`);
    if(Number.isNaN(occurredAt.getTime()))return{ok:false,message:"That log date is invalid."};
    const created=await createLogEntry(assetId,session.user.id,{occurredAt,entryType:proposal.log.entryType,title,body});
    if(!created)return{ok:false,message:"I couldn’t save that log entry."};
    revalidateAsset(assetId); return{ok:true,message:`Saved to the ${proposal.log.entryType} log.`};
  }

  if(proposal.kind==="component_fact"){
    if(!componentFields.has(proposal.componentFact.field)||!proposal.componentFact.value.trim())return{ok:false,message:"That equipment change is invalid."};
    const system=asset.systems.find(s=>s.id===proposal.componentFact.systemId);
    const component=system?.components.find(c=>c.id===proposal.componentFact.componentId);
    if(!system||!component)return{ok:false,message:"That equipment record is no longer available."};
    const details={name:component.name,manufacturer:component.manufacturer,model:component.model,serialNumber:component.serialNumber,location:component.location,notes:component.notes};
    const field=proposal.componentFact.field,value=proposal.componentFact.value.trim().slice(0,field==="notes"?1000:200);
    if(field==="serialNumber")details.serialNumber=value;
    else details[field]=value;
    const updated=await updateComponent(assetId,system.id,component.id,session.user.id,details);
    if(!updated)return{ok:false,message:"I couldn’t save that equipment change."};
    revalidateAsset(assetId); return{ok:true,message:`Updated ${component.name} ${field} as owner-provided information.`};
  }

  if(proposal.kind==="component_lifecycle"){
    const current=asset.systems.flatMap(s=>s.components).find(c=>c.id===proposal.lifecycle.componentId);
    if(!current)return{ok:false,message:"That equipment record is no longer available."};
    if(!["installed","removed_replaced","unknown"].includes(proposal.lifecycle.status))return{ok:false,message:"That lifecycle status is invalid."};
    if(proposal.lifecycle.changedOn&&!/^\d{4}-\d{2}-\d{2}$/.test(proposal.lifecycle.changedOn))return{ok:false,message:"That lifecycle date is invalid."};
    const updated=await updateComponentLifecycle(assetId,session.user.id,current.id,proposal.lifecycle.status,proposal.lifecycle.changedOn,proposal.lifecycle.notes);
    if(!updated)return{ok:false,message:"I couldn’t save that lifecycle change."};
    revalidateAsset(assetId);
    const label=proposal.lifecycle.status==="removed_replaced"?"Removed / Replaced":proposal.lifecycle.status==="unknown"?"Unknown":"Installed";
    return{ok:true,message:`Marked ${current.name} as ${label}. Historical evidence remains attached.`};
  }

  if(proposal.kind==="procedure_add"){
    const p=proposal.procedure;
    if(!p.title.trim()||p.steps.length===0)return{ok:false,message:"That procedure needs a title and at least one step."};
    const ok=await createProcedure(assetId,session.user.id,{title:p.title,procedureType:p.procedureType,notes:p.notes,steps:p.steps});
    if(!ok)return{ok:false,message:"I couldn’t add that procedure."};
    revalidateAsset(assetId); return{ok:true,message:`Added ${p.title} as owner-provided procedure knowledge.`};
  }

  if(proposal.kind==="procedure_update"){
    const p=proposal.procedure;
    const existing=await getProcedure(p.procedureId,assetId,session.user.id);
    if(!existing)return{ok:false,message:"That procedure is no longer available."};
    if(!p.title.trim()||p.steps.length===0)return{ok:false,message:"The resulting procedure needs a title and at least one step."};
    const ok=await updateProcedure(p.procedureId,assetId,session.user.id,{title:p.title,procedureType:p.procedureType,notes:p.notes,steps:p.steps});
    if(!ok)return{ok:false,message:"I couldn’t update that procedure."};
    revalidateAsset(assetId); return{ok:true,message:`Updated ${existing.title}. The reviewed step list is now the trusted owner-provided version.`};
  }

  if(proposal.kind==="asset_fact"){
    if(!assetFields.has(proposal.assetFact.field)||!proposal.assetFact.value.trim())return{ok:false,message:"That asset fact is invalid."};
    const details={name:asset.name,type:asset.type,make:asset.make,model:asset.model,year:asset.year,summary:asset.summary,registrationNumber:asset.registrationNumber};
    const field=proposal.assetFact.field,value=proposal.assetFact.value.trim();
    if(field==="year"){
      const year=Number(value); if(!Number.isInteger(year)||year<1800||year>3000)return{ok:false,message:"That year is invalid."}; details.year=year;
    } else if(field==="registrationNumber") details.registrationNumber=value.slice(0,100);
    else if(field==="summary") details.summary=value.slice(0,1000);
    else details[field]=value.slice(0,100);
    const updated=await updateAsset(assetId,session.user.id,details);
    if(!updated)return{ok:false,message:"I couldn’t save that asset fact."};
    revalidateAsset(assetId); return{ok:true,message:`Saved ${field} as owner-provided information.`};
  }

  return{ok:false,message:"That proposed change is not supported."};
}
