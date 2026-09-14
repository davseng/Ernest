import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'runtime-data');
const packagePath = path.join(dataDir, 'offline-package.json');
const uiPath = path.join(rootDir, 'public', 'offline-local.html');
const port = Number(process.env.ERNEST_OFFLINE_PORT || 3210);
const host = process.env.ERNEST_OFFLINE_HOST || '0.0.0.0';
const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const MAX_BODY = 50 * 1024 * 1024;

const STOP = new Set('a an and are as at be by can could did do does for from had has have how i in into is it me my of on or our should that the their there these they this those to was we what when where which who why will with would you your'.split(' '));

let activePackage = null;
let records = [];

function text(value) {
  return value == null ? '' : String(value);
}

function tokens(value) {
  return text(value)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]*/g)
    ?.filter((token) => token.length > 1 && !STOP.has(token)) || [];
}

function lines(entries) {
  return entries.filter((entry) => entry?.value !== undefined && entry?.value !== null && text(entry.value).trim() !== '')
    .map((entry) => `${entry.label}: ${text(entry.value).trim()}`)
    .join('\n');
}

function addRecord(target, kind, label, body, extra = {}) {
  const cleaned = text(body).trim();
  if (!cleaned) return;
  target.push({
    kind,
    label,
    body: cleaned,
    ...extra,
    tokenSet: new Set(tokens(`${label} ${cleaned}`)),
  });
}

function buildRecords(pkg) {
  const target = [];
  const snapshot = pkg.snapshot || {};
  const asset = snapshot.asset || {};

  addRecord(target, 'asset', 'Asset identity', lines([
    { label: 'Name', value: asset.name },
    { label: 'Year', value: asset.year },
    { label: 'Make', value: asset.make },
    { label: 'Model', value: asset.model },
    { label: 'Type', value: asset.type },
    { label: 'Registration', value: asset.registration_number },
    { label: 'Summary', value: asset.summary },
  ]));

  for (const item of snapshot.systems || []) {
    addRecord(target, 'system', `System: ${item.name}`, lines([
      { label: 'Name', value: item.name },
      { label: 'Description', value: item.description },
    ]));
  }

  for (const item of snapshot.components || []) {
    addRecord(target, 'equipment', `Equipment: ${item.name}`, lines([
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
    addRecord(target, 'inventory', `Inventory: ${item.name}`, lines([
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
    addRecord(target, 'procedure', `Procedure: ${item.title}`, lines([
      { label: 'Title', value: item.title },
      { label: 'Type', value: item.procedure_type },
      { label: 'Notes', value: item.notes },
      { label: 'Steps', value: steps },
    ]), { page: item.source_page });
  }

  for (const item of snapshot.operatingLog || []) {
    addRecord(target, 'log', `Operating log: ${item.title || item.entry_type || 'entry'}`, lines([
      { label: 'Occurred at', value: item.occurred_at },
      { label: 'Title', value: item.title },
      { label: 'Type', value: item.entry_type },
      { label: 'Entry', value: item.body },
      { label: 'Source', value: item.source },
    ]));
  }

  for (const item of snapshot.maintenanceCandidates || []) {
    if (item.status && item.status !== 'approved') continue;
    addRecord(target, 'maintenance', `Maintenance: ${item.action || 'record'}`, lines([
      { label: 'Action', value: item.action },
      { label: 'Date text', value: item.date_text },
      { label: 'Occurred on', value: item.occurred_on },
      { label: 'Engine hours', value: item.engine_hours },
      { label: 'Parts/consumables', value: item.parts_consumables },
      { label: 'Notes', value: item.notes },
    ]), { page: item.page_number });
  }

  for (const item of pkg.localEvidence?.documentChunks || []) {
    addRecord(target, 'document', item.document_title || 'Document', item.text_content, {
      page: item.page_number,
      source: item.document_title,
    });
  }

  return target;
}

function scoreRecord(questionTokens, record) {
  let score = 0;
  const label = record.label.toLowerCase();
  const body = record.body.toLowerCase();
  for (const token of questionTokens) {
    if (record.tokenSet.has(token)) score += 3;
    if (label.includes(token)) score += 3;
    if (body.includes(token)) score += 1;
  }
  const phrase = questionTokens.join(' ');
  if (phrase.length > 3 && body.includes(phrase)) score += 8;
  if (record.kind !== 'document') score += 0.5;
  return score;
}

function retrieve(question, limit = 8) {
  const questionTokens = [...new Set(tokens(question))];
  return records
    .map((record) => ({ record, score: scoreRecord(questionTokens, record) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function publicEvidence(hit, index) {
  return {
    id: `S${index + 1}`,
    kind: hit.record.kind,
    label: hit.record.label,
    body: hit.record.body,
    page: hit.record.page || null,
    source: hit.record.source || null,
    score: hit.score,
  };
}

async function listOllamaModels() {
  const response = await fetch(`${ollamaBase}/api/tags`);
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.models || []).map((model) => model.name);
}

async function answerWithOllama({ model, question, evidence }) {
  const context = evidence.map((item) => {
    const page = item.page ? ` — page ${item.page}` : '';
    return `[${item.id}] ${item.kind.toUpperCase()} — ${item.label}${page}\n${item.body.slice(0, 1800)}`;
  }).join('\n\n');

  const system = 'You are Ernest, a cautious offline asset assistant. Answer ONLY from the supplied local evidence. Never use background knowledge to invent an asset fact. If evidence is insufficient or conflicting, say so plainly. Cite factual claims using [S1], [S2], etc. Conversation history is not evidence. For structured records, treat explicitly labeled fields such as Location, Quantity, Model, and Source literally and do not infer a value from nearby labels. Keep the answer concise and useful.';

  const response = await fetch(`${ollamaBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Question: ${question}\n\nLOCAL EVIDENCE:\n${context}` },
      ],
      options: { temperature: 0.1, num_ctx: 8192 },
    }),
  });

  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const payload = await response.json();
  return payload.message?.content?.trim() || 'The local model returned no answer.';
}

async function loadSavedPackage() {
  try {
    const raw = await fs.readFile(packagePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.offlineFormat !== 'ernest-offline-package') throw new Error('Saved file is not an Ernest offline package.');
    activePackage = parsed;
    records = buildRecords(parsed);
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`Could not load saved offline package: ${error.message}`);
  }
}

function packageSummary() {
  if (!activePackage) return null;
  return {
    assetName: activePackage.snapshot?.asset?.name || 'Asset',
    searchableRecords: records.length,
    documentChunks: activePackage.localEvidence?.documentChunks?.length || 0,
    generatedAt: activePackage.generatedAt || activePackage.exportedAt || null,
  };
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request body exceeds 50 MB limit.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/offline')) {
    const html = await fs.readFile(uiPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    sendJson(res, 200, {
      mode: 'local',
      package: packageSummary(),
      ollamaBase,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/package') {
    const pkg = await readJsonBody(req);
    if (pkg.offlineFormat !== 'ernest-offline-package') {
      sendJson(res, 400, { error: 'Not an Ernest offline package.' });
      return;
    }
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(packagePath, JSON.stringify(pkg), 'utf8');
    activePackage = pkg;
    records = buildRecords(pkg);
    sendJson(res, 200, { ok: true, package: packageSummary() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/models') {
    try {
      const models = await listOllamaModels();
      sendJson(res, 200, { ok: true, models });
    } catch (error) {
      sendJson(res, 503, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/ask') {
    if (!activePackage) {
      sendJson(res, 409, { error: 'No Ernest offline package is loaded.' });
      return;
    }
    const body = await readJsonBody(req);
    const question = text(body.question).trim();
    const model = text(body.model).trim();
    if (!question || !model) {
      sendJson(res, 400, { error: 'Question and model are required.' });
      return;
    }
    const hits = retrieve(question);
    const evidence = hits.map(publicEvidence);
    if (!evidence.length) {
      sendJson(res, 200, { answer: 'I do not have enough local evidence to answer that.', evidence });
      return;
    }
    try {
      const answer = await answerWithOllama({ model, question, evidence });
      sendJson(res, 200, { answer, evidence });
    } catch (error) {
      sendJson(res, 502, { error: `Local model call failed: ${error.message}`, evidence });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
}

await loadSavedPackage();

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: error.message || 'Local Ernest server error.' });
    else res.end();
  });
});

server.listen(port, host, () => {
  console.log(`Ernest local runtime listening on http://localhost:${port}`);
  console.log(`LAN binding: http://${host}:${port}`);
  console.log(activePackage ? `Loaded ${packageSummary().assetName} from runtime-data.` : 'No offline package loaded yet.');
});
