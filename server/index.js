import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { loadConfig, ROOT } from './config.js';
import { Store } from './db.js';
import { createNewsroom } from './newsroom/scheduler.js';
import { sourceStatus } from './collect.js';
import { llmStatus, connectLLM } from './newsroom/llm.js';
import { SOURCES } from './sources/index.js';
import { seedDemo } from './demo.js';
import { dayKey } from './util.js';

const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`The Daily Mac richiede Node 22.13 o superiore (hai ${process.versions.node}). Aggiorna con: brew install node`);
  process.exit(1);
}

const config = loadConfig();
const store = new Store(config.dbFile);
const log = (...a) => console.log(new Date().toLocaleTimeString('it-IT'), ...a);
const newsroom = createNewsroom({ store, config, log });

if (config.demo) {
  const n = seedDemo(store);
  if (n) log(`[demo] ${n} eventi dimostrativi inseriti`);
  for (const s of SOURCES) sourceStatus[s.id] = { id: s.id, label: s.label, state: 'demo' };
}

const app = express();
app.use(express.json());

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    log('[api]', e);
    res.status(500).json({ error: e.message });
  });

app.get('/api/status', wrap(async (req, res) => {
  if (req.query.check === '1' || llmStatus.state === 'unknown') await connectLLM(config);
  res.json({
    demo: config.demo,
    llm: { ...llmStatus, baseUrl: config.llm.baseUrl },
    sources: SOURCES.map((s) => sourceStatus[s.id] || { id: s.id, label: s.label, state: 'pending' }),
    newsroom: newsroom.state,
    counts: store.countEvents(),
  });
}));

app.get('/api/days', (req, res) => res.json(store.days()));

app.get('/api/editions', (req, res) => {
  const day = req.query.day || dayKey(Date.now());
  res.json(store.editionsForDay(day, req.query.full === '1'));
});

app.get('/api/editions/latest', (req, res) => {
  const e = store.latestEdition();
  if (!e) return res.status(404).json({ error: 'Nessuna edizione' });
  res.json(e);
});

app.get('/api/editions/:id', (req, res) => {
  const e = store.getEdition(req.params.id);
  if (!e) return res.status(404).json({ error: 'Edizione non trovata' });
  res.json(e);
});

app.post('/api/print', wrap(async (req, res) => {
  const ed = await newsroom.printNow();
  if (!ed) return res.status(204).end();
  res.json(ed);
}));

app.post('/api/collect', wrap(async (req, res) => {
  const n = await newsroom.collect();
  res.json({ added: n });
}));

// Frontend compilato
const dist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) return res.sendFile(path.join(dist, 'index.html'));
    next();
  });
}

app.listen(config.port, () => {
  log(`The Daily Mac è in edicola su http://localhost:${config.port}${config.demo ? '  (modalità demo)' : ''}`);
  log(`Redattore: ${config.llm.baseUrl || 'nessuno'}`);
  newsroom.start().catch((e) => log('[avvio]', e));
});
