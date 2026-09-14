import { promises as fs } from 'node:fs';
import path from 'node:path';

const text = (value) => value == null ? '' : String(value);

function lines(entries) {
  return entries
    .filter((entry) => entry?.value !== undefined && entry?.value !== null && text(entry.value).trim() !== '')
    .map((entry) => `${entry.label}: ${text(entry.value).trim()}`)
    .join('\n');
}

export function buildKnowledgeRecords(pkg, tokenize) {
  const target = [];
  const snapshot = pkg.snapshot || {};
  const asset = snapshot.asset || {};

  const add = (kind, label, body, extra = {}) => {
    const cleaned = text(body).trim();
    if (!cleaned) return;
    target.push({
      kind,
      label,
      body: cleaned,
      ...extra,
      tokenSet: new Set(tokenize(`${label} ${cleaned}`)),
    });
  };

  add('asset', 'Asset identity', lines([
    { label: 'Name', value: asset.name },
    { label: 'Year', value: asset.year },
    { label: 'Make', value: asset.make },
    { label: 'Model', value: asset.model },
    { label: 'Type', value: asset.type },
    { label: 'Registration', value: asset.registration_number },
    { label: 'Summary', value: asset.summary },
  ]));

  for (const item of snapshot.systems || []) {
    add('system', `System: ${item.name}`, lines([
      { label: 'Name', value: item.name },
      { label: 'Description', value: item.description },
    ]));
  }

  for (const item of snapshot.components || []) {
    add('equipment', `Equipment: ${item.name}`, lines([
      { label: 'Name', value: item.name },
      { label: 'Manufacturer', value: item.manufacturer },
      { label: 'Model', value: item.model },
      { label: 'Serial number', value: item.serial_number },
      { label: 'Location', value: item.location },
      { label: 'Notes', value: item.notes },
      { label: 'Lifecycle status', value: item.lifecycle_status },
      { label: 'Lifecycle changed on', value: item.lifecycle_changed_on },
      { label: 'Lifecycle notes', value: item.lifecycle_notes },
    ]));
  }

  for (const item of snapshot.inventory?.items || []) {
    add('inventory', `Inventory: ${item.name}`, lines([
      { label: 'Item', value: item.name },
      { label: 'Quantity', value: item.quantity },
      { label: 'Details', value: item.details },
      { label: 'Location', value: (item.locations || []).join(', ') },
      { label: 'Source', value: item.source_label },
      { label: 'Source page/row', value: item.source_page },
    ]), { page: item.source_page });
  }

  for (const item of snapshot.procedures || []) {
    const steps = (item.steps || [])
      .map((step) => `${step.position}. ${step.instruction}${step.note ? ` — ${step.note}` : ''}`)
      .join('\n');
    add('procedure', `Procedure: ${item.title}`, lines([
      { label: 'Title', value: item.title },
      { label: 'Type', value: item.procedure_type },
      { label: 'Notes', value: item.notes },
      { label: 'Steps', value: steps },
    ]), { page: item.source_page });
  }

  for (const item of snapshot.operatingLog || []) {
    add('log', `Operating log: ${item.title || item.entry_type || 'entry'}`, lines([
      { label: 'Occurred at', value: item.occurred_at },
      { label: 'Title', value: item.title },
      { label: 'Type', value: item.entry_type },
      { label: 'Entry', value: item.body },
      { label: 'Source', value: item.source },
    ]));
  }

  for (const item of snapshot.maintenanceCandidates || []) {
    if (item.status && item.status !== 'approved') continue;
    add('maintenance', `Maintenance: ${item.action || 'record'}`, lines([
      { label: 'Action', value: item.action },
      { label: 'Date text', value: item.date_text },
      { label: 'Occurred on', value: item.occurred_on },
      { label: 'Engine hours', value: item.engine_hours },
      { label: 'Parts/consumables', value: item.parts_consumables },
      { label: 'Notes', value: item.notes },
    ]), { page: item.page_number });
  }

  for (const item of pkg.localEvidence?.documentChunks || []) {
    add('document', item.document_title || 'Document', item.text_content, {
      page: item.page_number,
      source: item.document_title,
    });
  }

  return target;
}

export function createJsonKnowledgeStore({ dataDir, packagePath, tokenize }) {
  let activePackage = null;
  let records = [];

  function validatePackage(pkg) {
    if (pkg?.offlineFormat !== 'ernest-offline-package') {
      throw new Error('Not an Ernest offline package.');
    }
  }

  function setPackage(pkg) {
    validatePackage(pkg);
    activePackage = pkg;
    records = buildKnowledgeRecords(pkg, tokenize);
  }

  async function load() {
    try {
      const raw = await fs.readFile(packagePath, 'utf8');
      setPackage(JSON.parse(raw));
      return true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      return false;
    }
  }

  async function importPackage(pkg) {
    validatePackage(pkg);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(packagePath, JSON.stringify(pkg), 'utf8');
    setPackage(pkg);
  }

  function summary() {
    if (!activePackage) return null;
    return {
      assetName: activePackage.snapshot?.asset?.name || 'Asset',
      searchableRecords: records.length,
      documentChunks: activePackage.localEvidence?.documentChunks?.length || 0,
      generatedAt: activePackage.generatedAt || activePackage.exportedAt || null,
      storage: 'json-package',
    };
  }

  return {
    load,
    importPackage,
    summary,
    hasPackage: () => Boolean(activePackage),
    getRecords: () => records,
    getPackagePath: () => path.resolve(packagePath),
  };
}
