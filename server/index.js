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
import { getLine, saveLine, TONES, LENGTHS, WEIGHTS } from './newsroom/line.js';
import {
  DeskError, editArticle, spikeArticle, restoreArticle, moveArticle, publishEdition, rewriteArticle, rewriteSummary,
  editCartoon,
} from './newsroom/edition.js';
import { publishEvening, editEveningCartoon } from './newsroom/evening.js';
import { SCENES } from './newsroom/scenes.js';
import { createNotifier } from './notify.js';
import { tr, lang, locale } from './i18n.js';
import { rssFeed } from './feed.js';
import { discuss, applyAction, getThreadRepaired } from './newsroom/meeting.js';
import { submitLetter, answerNow } from './newsroom/letters.js';

const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`The Localhost Times richiede Node 22.13 o superiore (hai ${process.versions.node}). Aggiorna con: brew install node`);
  process.exit(1);
}

const config = loadConfig();
// as a service, launchd appends to one log file: keep it small
if (process.env.LOCALHOST_TIMES_SERVICE === '1') {
  const f = path.join(config.dataDir, 'logs', 'server.log');
  try { if (fs.statSync(f).size > 5e6) fs.renameSync(f, `${f}.1`); } catch { /* no log yet */ }
}
const store = new Store(config.dbFile);
const log = (...a) => console.log(new Date().toLocaleTimeString(locale()), ...a);
const notify = createNotifier(config, log);
const newsroom = createNewsroom({ store, config, log, notify });

if (config.demo) {
  const n = seedDemo(store);
  if (n) log(`[demo] ${n} eventi dimostrativi inseriti`);
  for (const s of SOURCES) sourceStatus[s.id] = { id: s.id, label: s.label, state: 'demo' };
}

const app = express();
app.use(express.json());

const wrap = (fn) => (req, res) =>
  Promise.resolve().then(() => fn(req, res)).catch((e) => {
    if (e instanceof DeskError) return res.status(e.status).json({ error: e.message });
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
    drafts: store.drafts().length,
  });
}));

app.get('/api/days', (req, res) => res.json(store.days()));

app.get('/api/editions', (req, res) => {
  const day = req.query.day || dayKey(Date.now());
  res.json(store.editionsForDay(day, { full: req.query.full === '1', drafts: req.query.drafts === '1' }));
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

// ── La Redazione ──
app.get('/api/line', (req, res) => res.json({ line: getLine(store), tones: TONES, lengths: LENGTHS, weights: WEIGHTS }));
app.put('/api/line', (req, res) => res.json({ line: saveLine(store, req.body || {}) }));
app.get('/api/drafts', (req, res) => res.json(store.drafts()));

const A = '/api/editions/:id/articles/:aid';
app.patch(A, wrap((req, res) => res.json(editArticle(store, req.params.id, req.params.aid, req.body || {}))));
app.post(`${A}/spike`, wrap((req, res) => res.json(spikeArticle(store, req.params.id, req.params.aid))));
app.post(`${A}/restore`, wrap((req, res) => res.json(restoreArticle(store, req.params.id, req.params.aid))));
app.post(`${A}/move`, wrap((req, res) => res.json(moveArticle(store, req.params.id, req.params.aid, req.body?.to))));
app.post(`${A}/rewrite`, wrap(async (req, res) =>
  res.json(await rewriteArticle(store, config, req.params.id, req.params.aid, String(req.body?.instruction || '').slice(0, 300), log))));
app.post('/api/editions/:id/summary', wrap(async (req, res) => res.json(await rewriteSummary(store, config, req.params.id, log))));
app.patch('/api/editions/:id/cartoon', wrap((req, res) => res.json(editCartoon(store, req.params.id, req.body || {}))));
app.get('/api/scenes', (req, res) => res.json(Object.entries(SCENES).map(([id, s]) => ({ id, ...s }))));
app.post('/api/editions/:id/publish', wrap((req, res) => res.json(publishEdition(store, req.params.id))));
app.post('/api/editions/:id/reprint', wrap(async (req, res) => {
  const ed = store.getEdition(req.params.id);
  if (!ed) return res.status(404).json({ error: 'Edizione non trovata' });
  res.json(await newsroom.printHour(ed.hour ?? ed.start, ed.final, true));
}));

// ── Edizione della sera ──
app.get('/api/evening/:day', (req, res) => {
  const ev = store.getEvening(req.params.day);
  if (!ev) return res.status(404).json({ error: 'Nessuna edizione della sera' });
  res.json(ev);
});
app.post('/api/evening/:day/print', wrap(async (req, res) => {
  const ev = await newsroom.printEveningFor(req.params.day);
  if (!ev) return res.status(409).json({ error: 'Nessuna edizione oraria da riassumere in questo giorno.' });
  res.json(ev);
}));
app.patch('/api/evening/:day/cartoon', wrap((req, res) => res.json(editEveningCartoon(store, req.params.day, req.body || {}))));
app.post('/api/evening/:day/publish', wrap((req, res) => res.json(publishEvening(store, req.params.day))));

// ── Lettere al direttore ──
app.get('/api/letters', (req, res) => res.json(store.letters({ limit: 100 })));
app.post('/api/letters', wrap((req, res) => res.json(submitLetter(store, req.body || {}))));
app.post('/api/letters/:id/answer', wrap(async (req, res) => res.json(await answerNow(store, config, req.params.id, log))));

// ── Riunione di redazione ──
app.get('/api/threads/:id', wrap((req, res) => res.json(getThreadRepaired(store, config, req.params.id))));
app.post('/api/threads/:id', wrap(async (req, res) =>
  res.json(await discuss({ store, config, threadId: req.params.id, text: req.body?.text, articleId: req.body?.articleId, session: req.body?.session, log }))));
app.post('/api/threads/:id/apply', wrap(async (req, res) =>
  res.json(await applyAction({ store, config, threadId: req.params.id, msgIndex: Number(req.body?.msg), actionIndex: Number(req.body?.action), log }))));

app.post('/api/collect', wrap(async (req, res) => {
  const n = await newsroom.collect();
  res.json({ added: n });
}));

// Foto scaricate dalla redazione
app.use('/media', express.static(path.join(config.dataDir, 'media'), { maxAge: '30d', immutable: true }));

// ── Feeds ──
app.get(['/feed.xml', '/feed/:section.xml'], (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const xml = rssFeed(store, { base, section: req.params.section });
  if (!xml) return res.status(404).type('text').send('Unknown section');
  res.type('application/rss+xml; charset=utf-8').send(xml);
});

// Built frontend: index.html carries the paper's language
const dist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(dist)) {
  const page = () => fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
    .replace('<html lang="it">', `<html lang="${lang()}">`)
    .replace('<html lang="en">', `<html lang="${lang()}">`)
    .replace('</head>', `<script>window.__LT__=${JSON.stringify({ lang: lang() })}</script></head>`);
  app.use(express.static(dist, { index: false }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/media')) return res.type('html').send(page());
    next();
  });
}

const server = app.listen(config.port, () => {
  log(`The Localhost Times è in edicola su http://localhost:${config.port}${config.demo ? '  (modalità demo)' : ''}`);
  log(`Redattore: ${config.llm.baseUrl || 'nessuno'}`);
  newsroom.start().catch((e) => log('[avvio]', e));
});
server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(tr({
    en: `Port ${config.port} is already in use: the paper is probably already running (as a service? npm run service:status).`,
    it: `La porta ${config.port} è già occupata: il giornale è probabilmente già in edicola (come servizio? npm run service:status).`,
  }));
  process.exit(1);
});
