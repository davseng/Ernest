import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createModelRouter } from '../scripts/offline-runtime/model-router.mjs';
import { planCloudToBoatSync } from '../scripts/offline-runtime/sync-planner.mjs';
import { createLocalOutbox } from '../scripts/offline-runtime/outbox.mjs';

const adapter=(id,answer='ok')=>({id,async listModels(){return[id]},async answer(){return answer}});
test('model router stays local in auto mode',async()=>{const router=createModelRouter({localAdapter:adapter('local')});const r=await router.answer({model:'m',question:'q',evidence:[]});assert.equal(r.route,'local');assert.equal(router.status().cloudFallbackEnabled,false)});
test('cloud route is unavailable unless configured',async()=>{const router=createModelRouter({localAdapter:adapter('local')});await assert.rejects(()=>router.answer({model:'m',question:'q',evidence:[],route:'cloud'}),/Cloud model adapter is not configured/)});
test('auto cloud fallback requires explicit enablement',async()=>{const failing={id:'local',async answer(){throw new Error('offline')}};const cloud=adapter('cloud','cloud answer');const disabled=createModelRouter({localAdapter:failing,cloudAdapter:cloud});await assert.rejects(()=>disabled.answer({model:'m',question:'q',evidence:[]}),/offline/);const enabled=createModelRouter({localAdapter:failing,cloudAdapter:cloud,allowCloudFallback:true});assert.equal((await enabled.answer({model:'m',question:'q',evidence:[]})).route,'cloud')});
test('sync planner recognizes current revision',()=>{const p=planCloudToBoatSync({localState:{assetId:'a',lastCloudPackageRevision:'r1'},remote:{protocolVersion:1,assetId:'a',packageRevision:'r1'}});assert.equal(p.action,'none')});
test('sync planner rejects another asset',()=>{const p=planCloudToBoatSync({localState:{assetId:'a'},remote:{protocolVersion:1,assetId:'b',packageRevision:'r2'}});assert.equal(p.action,'reject')});
test('outbox reconciliation validates asset and result identity',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'ernest-outbox-'));try{const outbox=createLocalOutbox({outboxPath:path.join(dir,'outbox.json')});await outbox.load();const entry=await outbox.queueLogEntry({title:'Test',body:'Body'},'asset-a');await assert.rejects(()=>outbox.applyUploadResult({protocolVersion:1,kind:'operating-log-batch-result',assetId:'asset-b',results:[]},'asset-a'),/different asset/);await assert.rejects(()=>outbox.applyUploadResult({protocolVersion:1,kind:'operating-log-batch-result',assetId:'asset-a',results:[{clientMutationId:'unknown',status:'created'}]},'asset-a'),/unknown outbox entry/);const changed=await outbox.applyUploadResult({protocolVersion:1,kind:'operating-log-batch-result',assetId:'asset-a',results:[{clientMutationId:entry.clientMutationId,cloudId:entry.clientMutationId,status:'created'}]},'asset-a');assert.equal(changed.length,1);assert.equal(outbox.summary().synced,1)}finally{await rm(dir,{recursive:true,force:true})}});
