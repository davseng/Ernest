import { promises as fs } from 'node:fs';
import path from 'node:path';

import { validatePackageIntegrity } from './package-integrity.mjs';
import { buildImportedSyncState, loadSyncState, saveSyncState } from './sync-state.mjs';

const text = (value) => value == null ? '' : String(value);
function lines(entries) { return entries.filter((e)=>e?.value!==undefined&&e?.value!==null&&text(e.value).trim()!=='').map((e)=>`${e.label}: ${text(e.value).trim()}`).join('\n'); }

export function buildKnowledgeRecords(pkg, tokenize) {
  const target=[],snapshot=pkg.snapshot||{},asset=snapshot.asset||{};
  const add=(kind,label,body,extra={})=>{const cleaned=text(body).trim();if(cleaned)target.push({kind,label,body:cleaned,...extra,tokenSet:new Set(tokenize(`${label} ${cleaned}`))});};
  add('asset','Asset identity',lines([{label:'Name',value:asset.name},{label:'Year',value:asset.year},{label:'Make',value:asset.make},{label:'Model',value:asset.model},{label:'Type',value:asset.type},{label:'Registration',value:asset.registration_number},{label:'Summary',value:asset.summary}]));
  for(const item of snapshot.systems||[])add('system',`System: ${item.name}`,lines([{label:'Name',value:item.name},{label:'Description',value:item.description}]));
  for(const item of snapshot.components||[])add('equipment',`Equipment: ${item.name}`,lines([{label:'Name',value:item.name},{label:'Manufacturer',value:item.manufacturer},{label:'Model',value:item.model},{label:'Serial number',value:item.serial_number},{label:'Location',value:item.location},{label:'Notes',value:item.notes},{label:'Lifecycle status',value:item.lifecycle_status},{label:'Lifecycle changed on',value:item.lifecycle_changed_on},{label:'Lifecycle notes',value:item.lifecycle_notes}]));
  for(const item of snapshot.inventory?.items||[])add('inventory',`Inventory: ${item.name}`,lines([{label:'Item',value:item.name},{label:'Quantity',value:item.quantity},{label:'Details',value:item.details},{label:'Location',value:(item.locations||[]).join(', ')},{label:'Source',value:item.source_label},{label:'Source page/row',value:item.source_page}]),{page:item.source_page});
  for(const item of snapshot.procedures||[]){const steps=(item.steps||[]).map((s)=>`${s.position}. ${s.instruction}${s.note?` — ${s.note}`:''}`).join('\n');add('procedure',`Procedure: ${item.title}`,lines([{label:'Title',value:item.title},{label:'Type',value:item.procedure_type},{label:'Notes',value:item.notes},{label:'Steps',value:steps}]),{page:item.source_page});}
  for(const item of snapshot.operatingLog||[])add('log',`Operating log: ${item.title||item.entry_type||'entry'}`,lines([{label:'Occurred at',value:item.occurred_at},{label:'Title',value:item.title},{label:'Type',value:item.entry_type},{label:'Entry',value:item.body},{label:'Source',value:item.source}]));
  for(const item of snapshot.maintenanceCandidates||[]){if(item.status&&item.status!=='approved')continue;add('maintenance',`Maintenance: ${item.action||'record'}`,lines([{label:'Action',value:item.action},{label:'Date text',value:item.date_text},{label:'Occurred on',value:item.occurred_on},{label:'Engine hours',value:item.engine_hours},{label:'Parts/consumables',value:item.parts_consumables},{label:'Notes',value:item.notes}]),{page:item.page_number});}
  for(const item of pkg.localEvidence?.documentChunks||[])add('document',item.document_title||'Document',item.text_content,{page:item.page_number,source:item.document_title});
  return target;
}

export function createJsonKnowledgeStore({dataDir,packagePath,statePath,tokenize}) {
  let activePackage=null,records=[],syncState=null;
  const validatePackage=(pkg)=>validatePackageIntegrity(pkg);
  function setPackage(pkg){validatePackage(pkg);activePackage=pkg;records=buildKnowledgeRecords(pkg,tokenize);}
  function stateRevision(state){return state?.lastCloudPackageRevision||state?.packageRevision||null;}
  async function reconcileStateFromPackage(previous){
    if(!statePath||!activePackage)return previous||null;
    const packageRevision=activePackage.sync?.packageRevision||null;
    if(previous&&(!packageRevision||stateRevision(previous)===packageRevision))return previous;
    const next=buildImportedSyncState(activePackage,previous);
    await saveSyncState(statePath,next);
    return next;
  }
  async function load(){
    try{const raw=await fs.readFile(packagePath,'utf8');setPackage(JSON.parse(raw));const loaded=statePath?await loadSyncState(statePath):null;syncState=await reconcileStateFromPackage(loaded);return true;}
    catch(error){if(error?.code!=='ENOENT')throw error;return false;}
  }
  async function importPackage(pkg){
    const integrity=validatePackage(pkg),serialized=JSON.stringify(pkg),tempPath=`${packagePath}.tmp`;await fs.mkdir(dataDir,{recursive:true});await fs.writeFile(tempPath,serialized,'utf8');
    const staged=JSON.parse(await fs.readFile(tempPath,'utf8'));validatePackage(staged);await fs.rename(tempPath,packagePath);const committed=JSON.parse(await fs.readFile(packagePath,'utf8'));validatePackage(committed);setPackage(committed);
    if(statePath){const nextState=buildImportedSyncState(committed,syncState);await saveSyncState(statePath,nextState);syncState=nextState;}
    return{integrity,packageRevision:committed.sync?.packageRevision||null};
  }
  async function setPendingLocalWrites(count){if(!statePath||!syncState)return null;const nextState={...syncState,pendingLocalWrites:Math.max(0,Number(count||0)),boatToCloudMode:'outbox-disabled-upload'};await saveSyncState(statePath,nextState);syncState=nextState;return syncState;}
  function summary(){if(!activePackage)return null;return{assetId:activePackage.sync?.assetId||activePackage.snapshot?.asset?.id||null,assetName:activePackage.snapshot?.asset?.name||'Asset',searchableRecords:records.length,documentChunks:activePackage.localEvidence?.documentChunks?.length||0,generatedAt:activePackage.createdAt||activePackage.generatedAt||activePackage.exportedAt||null,packageVersion:activePackage.version||1,packageRevision:activePackage.sync?.packageRevision||null,storage:'json-package',sync:syncState};}
  return{load,importPackage,setPendingLocalWrites,summary,hasPackage:()=>Boolean(activePackage),getRecords:()=>records,getSyncState:()=>syncState,getPackagePath:()=>path.resolve(packagePath),getStatePath:()=>statePath?path.resolve(statePath):null};
}
