import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';

const LOG_TYPES = new Set(['note', 'maintenance', 'passage', 'observation', 'incident']);
const PENDING_STATUSES = new Set(['queued', 'failed']);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Latitude/longitude must be finite numbers.');
  return parsed;
}

function validateOccurredAt(value) {
  const candidate = text(value) || new Date().toISOString();
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) throw new Error('occurredAt must be a valid date/time.');
  return parsed.toISOString();
}

function validateDraft(draft, expectedAssetId) {
  const assetId = text(draft?.assetId || expectedAssetId);
  if (!assetId) throw new Error('assetId is required.');
  if (expectedAssetId && assetId !== expectedAssetId) throw new Error('Log entry belongs to a different asset.');

  const entryType = text(draft?.entryType || 'note').toLowerCase();
  if (!LOG_TYPES.has(entryType)) throw new Error(`Unsupported log entry type: ${entryType}.`);

  const title = text(draft?.title);
  const body = text(draft?.body);
  if (!title) throw new Error('title is required.');
  if (!body) throw new Error('body is required.');

  const latitude = numberOrNull(draft?.latitude);
  const longitude = numberOrNull(draft?.longitude);
  if (latitude !== null && (latitude < -90 || latitude > 90)) throw new Error('latitude must be between -90 and 90.');
  if (longitude !== null && (longitude < -180 || longitude > 180)) throw new Error('longitude must be between -180 and 180.');

  return {
    assetId,
    occurredAt: validateOccurredAt(draft?.occurredAt),
    entryType,
    title,
    body,
    latitude,
    longitude,
  };
}

function cloneEntry(entry) {
  return JSON.parse(JSON.stringify(entry));
}

function toKnowledgeRecord(entry, tokenize) {
  const payload = entry.payload || {};
  const body = [
    `Occurred at: ${payload.occurredAt || ''}`,
    `Title: ${payload.title || ''}`,
    `Type: ${payload.entryType || 'note'}`,
    `Entry: ${payload.body || ''}`,
    `Source: local operating log`,
    `Sync status: ${entry.status || 'queued'}`,
  ].filter((line) => !line.endsWith(': ')).join('\n');
  const label = `Local operating log: ${payload.title || payload.entryType || 'entry'}`;
  return {
    kind: 'log',
    label,
    body,
    source: 'local-outbox',
    clientMutationId: entry.clientMutationId,
    syncStatus: entry.status,
    tokenSet: new Set(tokenize(`${label} ${body}`)),
  };
}

export function createLocalOutbox({ outboxPath, expectedAssetId = null }) {
  let entries = [];

  async function persist() {
    const tempPath = `${outboxPath}.tmp`;
    const document = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      entries,
    };
    await fs.writeFile(tempPath, JSON.stringify(document, null, 2), 'utf8');
    await fs.rename(tempPath, outboxPath);
  }

  async function load() {
    try {
      const parsed = JSON.parse(await fs.readFile(outboxPath, 'utf8'));
      entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        entries = [];
        return false;
      }
      throw error;
    }
  }

  async function queueLogEntry(draft, assetIdOverride = null) {
    const payload = validateDraft(draft, assetIdOverride || expectedAssetId);
    const now = new Date().toISOString();
    const clientMutationId = randomUUID();
    const entry = {
      clientMutationId,
      kind: 'operating-log',
      status: 'queued',
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
      cloudId: null,
      payload: {
        ...payload,
        source: 'manual',
      },
    };
    entries.push(entry);
    await persist();
    return cloneEntry(entry);
  }

  async function markAttempt(clientMutationId) {
    const entry = entries.find((candidate) => candidate.clientMutationId === clientMutationId);
    if (!entry) throw new Error('Outbox entry not found.');
    entry.attempts = Number(entry.attempts || 0) + 1;
    entry.updatedAt = new Date().toISOString();
    await persist();
    return cloneEntry(entry);
  }

  async function markFailed(clientMutationId, errorMessage) {
    const entry = entries.find((candidate) => candidate.clientMutationId === clientMutationId);
    if (!entry) throw new Error('Outbox entry not found.');
    entry.status = 'failed';
    entry.lastError = text(errorMessage) || 'Upload failed.';
    entry.updatedAt = new Date().toISOString();
    await persist();
    return cloneEntry(entry);
  }

  async function markSynced(clientMutationId, cloudId = null) {
    const entry = entries.find((candidate) => candidate.clientMutationId === clientMutationId);
    if (!entry) throw new Error('Outbox entry not found.');
    entry.status = 'synced';
    entry.lastError = null;
    entry.cloudId = text(cloudId) || entry.cloudId || null;
    entry.syncedAt = new Date().toISOString();
    entry.updatedAt = entry.syncedAt;
    await persist();
    return cloneEntry(entry);
  }

  async function applyUploadResult(result) {
    if (result?.protocolVersion !== 1 || result?.kind !== 'operating-log-batch-result') {
      throw new Error('Unsupported upload result.');
    }
    if (!Array.isArray(result.results)) throw new Error('Upload result is missing results.');

    const changed = [];
    const now = new Date().toISOString();
    for (const item of result.results) {
      const id = text(item?.clientMutationId);
      const entry = entries.find((candidate) => candidate.clientMutationId === id);
      if (!entry) continue;
      if (item?.status !== 'created' && item?.status !== 'already-exists') continue;
      entry.status = 'synced';
      entry.lastError = null;
      entry.cloudId = text(item?.cloudId) || entry.cloudId || id;
      entry.syncedAt = now;
      entry.updatedAt = now;
      changed.push(cloneEntry(entry));
    }
    if (changed.length) await persist();
    return changed;
  }

  function pending() {
    return entries.filter((entry) => PENDING_STATUSES.has(entry.status));
  }

  function buildUploadBatch(assetIdOverride = null) {
    const pendingEntries = pending();
    const assetIds = [...new Set(pendingEntries.map((entry) => text(entry.payload?.assetId)).filter(Boolean))];
    const assetId = text(assetIdOverride || expectedAssetId || assetIds[0]);
    if (assetIds.length > 1) throw new Error('Outbox contains entries for multiple assets.');
    if (assetIds.length === 1 && assetId && assetIds[0] !== assetId) throw new Error('Outbox batch belongs to a different asset.');
    return {
      protocolVersion: 1,
      kind: 'operating-log-batch',
      direction: 'boat-to-cloud',
      generatedAt: new Date().toISOString(),
      assetId: assetId || null,
      uploadEnabled: false,
      entries: pendingEntries.map((entry) => ({
        clientMutationId: entry.clientMutationId,
        idempotencyKey: entry.clientMutationId,
        attempts: Number(entry.attempts || 0),
        payload: cloneEntry(entry.payload),
      })),
    };
  }

  function summary() {
    const queued = entries.filter((entry) => entry.status === 'queued').length;
    const failed = entries.filter((entry) => entry.status === 'failed').length;
    const synced = entries.filter((entry) => entry.status === 'synced').length;
    return {
      storage: 'json-outbox',
      total: entries.length,
      pending: queued + failed,
      queued,
      failed,
      synced,
      uploadEnabled: false,
    };
  }

  return {
    load,
    queueLogEntry,
    markAttempt,
    markFailed,
    markSynced,
    applyUploadResult,
    buildUploadBatch,
    list: () => entries.map(cloneEntry),
    pending: () => pending().map(cloneEntry),
    knowledgeRecords: (tokenize) => pending().map((entry) => toKnowledgeRecord(entry, tokenize)),
    summary,
  };
}
