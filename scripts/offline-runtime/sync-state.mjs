import { promises as fs } from 'node:fs';

function text(value) {
  return value == null ? '' : String(value);
}

export function buildImportedSyncState(pkg, previous = null) {
  const now = new Date().toISOString();
  const sync = pkg?.sync || {};
  return {
    schemaVersion: 1,
    assetId: text(sync.assetId || pkg?.snapshot?.asset?.id) || null,
    packageVersion: Number(pkg?.version || 1),
    protocolVersion: Number(sync.protocolVersion || 1),
    packageId: text(sync.packageId) || null,
    packageRevision: text(sync.packageRevision) || null,
    packageCreatedAt: pkg?.createdAt || null,
    importedAt: now,
    lastCloudImportAt: now,
    lastCloudPackageRevision: text(sync.packageRevision) || null,
    cloudToBoatMode: sync.fullSnapshot === false ? 'incremental' : 'full-snapshot',
    boatToCloudMode: 'disabled',
    pendingLocalWrites: Number(previous?.pendingLocalWrites || 0),
    lastBoatUploadAt: previous?.lastBoatUploadAt || null,
  };
}

export async function loadSyncState(statePath) {
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveSyncState(statePath, state) {
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}
