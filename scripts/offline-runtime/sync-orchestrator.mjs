import { createCloudSnapshotClient } from './cloud-sync-client.mjs';
import { planCloudToBoatSync } from './sync-planner.mjs';

export function createCloudToBoatSync({ endpoint, authorization = null, fetchImpl = fetch, knowledge }) {
  const client = endpoint ? createCloudSnapshotClient({ endpoint, authorization, fetchImpl }) : null;
  function configured(){ return Boolean(client); }
  async function checkAndApply(){
    if(!client) return { ok:false, status:'not-configured', applied:false };
    const state=knowledge.getSyncState();
    const revision=state?.lastCloudPackageRevision||state?.packageRevision||null;
    const remote=await client.check({ revision });
    if(remote.status==='offline'||remote.status==='authentication-required'||remote.status==='error') return { ok:false, ...remote, applied:false };
    if(remote.status==='current') return { ok:true, status:'current', applied:false, sync:remote.sync||null };
    const plan=planCloudToBoatSync({ localState:state, remote:remote.sync||remote.package?.sync });
    if(['reject','unsupported'].includes(plan.action)) return { ok:false, status:plan.action, applied:false, plan };
    if(plan.action==='none') return { ok:true, status:'current', applied:false, plan };
    const imported=await knowledge.importPackage(remote.package);
    return { ok:true, status:'updated', applied:true, plan, imported, package:knowledge.summary(), sync:knowledge.getSyncState() };
  }
  return { configured, checkAndApply };
}
