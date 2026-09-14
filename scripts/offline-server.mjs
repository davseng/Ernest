import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createJsonKnowledgeStore } from './offline-runtime/knowledge-store.mjs';
import { createOllamaAdapter } from './offline-runtime/model-adapter.mjs';
import { retrieve, tokenize, toPublicEvidence } from './offline-runtime/retrieval.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'runtime-data');
const packagePath = path.join(dataDir, 'offline-package.json');
const statePath = path.join(dataDir, 'local-state.json');
const uiPath = path.join(rootDir, 'public', 'offline-local.html');
const port = Number(process.env.ERNEST_OFFLINE_PORT || 3210);
const host = process.env.ERNEST_OFFLINE_HOST || '0.0.0.0';
const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const MAX_BODY = 50 * 1024 * 1024;

const knowledge = createJsonKnowledgeStore({ dataDir, packagePath, statePath, tokenize });
const modelAdapter = createOllamaAdapter({ baseUrl: ollamaBase });

const text = (value) => value == null ? '' : String(value);

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
    const summary = knowledge.summary();
    sendJson(res, 200, {
      mode: 'local',
      package: summary,
      storage: summary?.storage || 'json-package',
      sync: knowledge.getSyncState(),
      modelAdapter: modelAdapter.id,
      ollamaBase,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/package') {
    const pkg = await readJsonBody(req);
    try {
      await knowledge.importPackage(pkg);
      sendJson(res, 200, { ok: true, package: knowledge.summary(), sync: knowledge.getSyncState() });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/models') {
    try {
      const models = await modelAdapter.listModels();
      sendJson(res, 200, { ok: true, adapter: modelAdapter.id, models });
    } catch (error) {
      sendJson(res, 503, { ok: false, adapter: modelAdapter.id, error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/ask') {
    if (!knowledge.hasPackage()) {
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

    const hits = retrieve(knowledge.getRecords(), question);
    const evidence = hits.map(toPublicEvidence);
    if (!evidence.length) {
      sendJson(res, 200, { answer: 'I do not have enough local evidence to answer that.', evidence });
      return;
    }

    try {
      const answer = await modelAdapter.answer({ model, question, evidence });
      sendJson(res, 200, { answer, evidence, adapter: modelAdapter.id });
    } catch (error) {
      sendJson(res, 502, { error: `Local model call failed: ${error.message}`, evidence, adapter: modelAdapter.id });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
}

try {
  await knowledge.load();
} catch (error) {
  console.warn(`Could not load saved offline package: ${error.message}`);
}

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
  console.log(`Knowledge store: ${knowledge.getPackagePath()}`);
  console.log(`Local state: ${knowledge.getStatePath()}`);
  console.log(`Model adapter: ${modelAdapter.label}`);
  console.log(knowledge.hasPackage() ? `Loaded ${knowledge.summary().assetName} from runtime-data.` : 'No offline package loaded yet.');
});
