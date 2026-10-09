import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { loadConfig, ROOT } from './config.js';
import { Store } from './db.js';
import { createNewsroom } from './newsroom/scheduler.js';
import { sourceStatus } from './collect.js';
import { llmStatus, connectLLM } from './newsroom/llm.js';
import { SOURCES } from './sources/index.js';
import { startSampler } from './sources/apps.js';
import { seedDemo, seedDemoDesk } from './demo.js';
import { dayKey } from './util.js';
import { getLine, saveLine, TONES, LENGTHS, WEIGHTS } from './newsroom/line.js';
import {
  DeskError, editArticle, spikeArticle, restoreArticle, moveArticle, publishEdition, rewriteArticle, rewriteSummary,
  editCartoon, factCheckEdition,
} from './newsroom/edition.js';
import { publishEvening, editEveningCartoon } from './newsroom/evening.js';
import { SCENES } from './newsroom/scenes.js';
import { createNotifier } from './notify.js';
import { staff } from './newsroom/writers.js';
import { styleList } from './newsroom/styles.js';
import { menubarText } from './menubar.js';
import { radioFeed, radioDir } from './newsroom/radio.js';
import { tr, lang, locale } from './i18n.js';
import { rssFeed } from './feed.js';
import { search, ask } from './newsroom/archive.js';
import { preview, steer } from './newsroom/next.js';
import { createInvestigation, suggestions, interruptedInvestigations } from './newsroom/investigations.js';
import { board, leadAction, teaser, recoverLeads } from './newsroom/spotlight/desk.js';
import { discuss, applyAction, getThreadRepaired } from './newsroom/meeting.js';
import { submitLetter, answerNow } from './newsroom/letters.js';
import { openCalls, callView, answerCall } from './newsroom/calls.js';
import { chatter } from './newsroom/chatter.js';
import { tips, addTip, archiveTip } from './newsroom/tips.js';
import { oracleBoard, bet } from './newsroom/oracle.js';
import { recordBook } from './newsroom/sport.js';
import { latestFlashes } from './newsroom/flash.js';
import { episodes } from './newsroom/serial.js';
import {
  features, createFeature, getFeature, briefFeature, approveOutline, continueFeature, blockAction, editFeature,
  reviewFeature, publishFeature, unpublishFeature, deleteFeature, stopFeature, interruptedFeatures,
} from './newsroom/features.js';
import { paragraphAction, headlineOptions, verdict, scoreboard, getTaste, forgetExample } from './newsroom/bench.js';

const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`The Localhost Times needs Node 22.13 or later (you have ${process.versions.node}). Upgrade with: brew install node`);
  process.exit(1);
}

const config = loadConfig();
// As a service, launchd appends our output to one log file that it keeps open:
// once an hour, if it got big, copy it aside and empty it in place.
if (process.env.LOCALHOST_TIMES_SERVICE === '1') {
  const f = path.join(config.dataDir, 'logs', 'server.log');
  setInterval(() => {
    try {
      if (fs.statSync(f).size > 5e6) {
        fs.copyFileSync(f, `${f}.1`);
        fs.truncateSync(f, 0);
      }
    } catch { /* no log yet */ }
  }, 3600e3).unref();
}
const store = new Store(config.dbFile);
interruptedInvestigations(store);
recoverLeads(store);
interruptedFeatures(store);
if (store.needsReindex()) {
  // first start after the archive was added: index what is already there
  store.reindex();
}
const log = (...a) => console.log(new Date().toLocaleTimeString(locale()), ...a);
const notify = createNotifier(config, log);
const newsroom = createNewsroom({ store, config, log, notify });

if (config.demo) {
  const n = seedDemo(store);
  if (n) log(tr({ en: `[demo] ${n} demo events inserted`, it: `[demo] ${n} eventi dimostrativi inseriti` }));
  for (const s of SOURCES) sourceStatus[s.id] = { id: s.id, label: s.label, state: 'demo' };
  seedDemoDesk(store, config).catch((e) => log(`[demo] ${e.message}`));
}

const app = express();

// DNS-rebinding guard: when the paper is only served to this Mac, accept only requests addressed to it,
// so a web page can't point its own domain at 127.0.0.1 and read the paper.
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const loopbackOnly = ['127.0.0.1', 'localhost', '::1'].includes(config.host);
app.use((req, res, next) => {
  if (loopbackOnly && !LOOPBACK_HOST.test(req.headers.host || '')) return res.status(403).type('text').send('Forbidden: unexpected Host header');
  next();
});

// Cross-site guard: API calls that change something must carry a custom header,
// which a page on another site can't add to a request without the browser asking us first.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('x-localhost-times') === '1') return next();
  res.status(403).json({ error: 'Missing X-Localhost-Times header' });
});

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
  if (!e) return res.status(404).json({ error: tr({ en: 'No editions', it: 'Nessuna edizione' }) });
  res.json(e);
});

app.get('/api/editions/:id', (req, res) => {
  const e = store.getEdition(req.params.id);
  if (!e) return res.status(404).json({ error: tr({ en: 'Edition not found', it: 'Edizione non trovata' }) });
  res.json(e);
});

app.post('/api/print', wrap(async (req, res) => {
  const ed = await newsroom.printNow();
  if (!ed) return res.status(204).end();
  res.json(ed);
}));

// ── The Newsroom ──
app.get('/api/line', (req, res) => { const line = getLine(store); res.json({ line, tones: TONES, lengths: LENGTHS, weights: WEIGHTS, staff: staff(line), styles: styleList() }); });
app.put('/api/line', (req, res) => { const line = saveLine(store, req.body || {}); res.json({ line, staff: staff(line) }); });
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
app.post('/api/editions/:id/factcheck', wrap(async (req, res) => res.json(await factCheckEdition(store, config, req.params.id, log))));
app.post('/api/editions/:id/publish', wrap((req, res) => res.json(publishEdition(store, req.params.id))));
app.post('/api/editions/:id/reprint', wrap(async (req, res) => {
  const ed = store.getEdition(req.params.id);
  if (!ed) return res.status(404).json({ error: tr({ en: 'Edition not found', it: 'Edizione non trovata' }) });
  res.json(await newsroom.printHour(ed.hour ?? ed.start, ed.final, true));
}));

// ── The editor's bench: one paragraph, one headline, keep or cut ──
app.post(`${A}/paragraph`, wrap(async (req, res) => res.json(await paragraphAction(store, config, req.params.id, req.params.aid, req.body || {}, log))));
app.post(`${A}/headlines`, wrap(async (req, res) => res.json(await headlineOptions(store, config, req.params.id, req.params.aid))));
app.post(`${A}/verdict`, wrap((req, res) => res.json(verdict(store, req.params.id, req.params.aid, req.body?.verdict))));
app.get('/api/taste', (req, res) => { const t = getTaste(store); res.json({ ...scoreboard(store), examples: { liked: t.liked, disliked: t.disliked } }); });
app.delete('/api/taste', wrap((req, res) => { forgetExample(store, String(req.body?.text || '')); res.json({ ...scoreboard(store), examples: (({ liked, disliked }) => ({ liked, disliked }))(getTaste(store)) }); }));

// ── The newsroom calls the Editor (interviews, the closing at :55, the serial's fork) ──
app.get('/api/calls', (req, res) => res.json(openCalls(store).map((c) => callView(c))));
app.post('/api/calls/:id/answer', wrap((req, res) => res.json(answerCall(store, config, req.params.id, {
  text: req.body?.text, option: req.body?.option ?? req.query.option, decline: !!(req.body?.decline ?? req.query.decline),
}))));
// everything the pages poll in one call: open calls, breaking news, the newsroom chatter
app.get('/api/live', (req, res) => res.json({
  calls: openCalls(store).map((c) => callView(c)),
  flashes: latestFlashes(store, Date.now() - 2 * 3600e3),
  chatter: chatter(store, { limit: Math.min(50, num(req.query.chatter) || 6) }),
}));
app.get('/api/chatter', (req, res) => res.json(chatter(store, { limit: Math.min(200, num(req.query.limit) || 60) })));

// ── The tip box ──
app.get('/api/tips', (req, res) => res.json(tips(store, { status: req.query.status || null, limit: 100 })));
app.post('/api/tips', wrap((req, res) => res.json(addTip(store, { text: req.body?.text, via: req.body?.via === 'cli' ? 'cli' : 'web' }))));
app.post('/api/tips/:id/archive', wrap((req, res) => res.json(archiveTip(store, req.params.id))));

// ── The games: the Oracle, the records, the serial ──
app.get('/api/oracle', (req, res) => res.json(oracleBoard(store)));
app.post('/api/oracle/bet', wrap((req, res) => res.json(bet(store, String(req.body?.id || ''), req.body?.yes))));
app.get('/api/records', (req, res) => res.json(recordBook(store)));
app.get('/api/serial', (req, res) => res.json(episodes(store)));

// ── Long pieces (Approfondisci) ──
const F = '/api/features/:id';
app.get('/api/features', (req, res) => res.json(features(store, { status: req.query.status ? String(req.query.status).split(',') : null, limit: Math.min(100, num(req.query.limit) || 30) })));
app.post('/api/features', wrap(async (req, res) => res.json(await createFeature(store, config, {
  editionId: req.body?.editionId, articleId: req.body?.articleId, topic: req.body?.topic, days: req.body?.days,
}, log))));
app.get(F, wrap((req, res) => res.json(getFeature(store, req.params.id))));
app.patch(F, wrap((req, res) => res.json(editFeature(store, req.params.id, req.body || {}))));
app.delete(F, wrap((req, res) => { deleteFeature(store, req.params.id); res.status(204).end(); }));
app.post(`${F}/brief`, wrap((req, res) => res.json(briefFeature(store, config, req.params.id, req.body || {}, log))));
app.post(`${F}/outline`, wrap((req, res) => res.json(approveOutline(store, config, req.params.id, req.body?.outline, log))));
app.post(`${F}/continue`, wrap((req, res) => res.json(continueFeature(store, config, req.params.id, log))));
app.post(`${F}/stop`, wrap((req, res) => res.json(stopFeature(store, req.params.id))));
app.post(`${F}/blocks/:i`, wrap((req, res) => res.json(blockAction(store, config, req.params.id, req.params.i, req.body || {}, log))));
app.post(`${F}/review`, wrap((req, res) => res.json(reviewFeature(store, config, req.params.id, log))));
app.post(`${F}/publish`, wrap((req, res) => res.json(publishFeature(store, req.params.id))));
app.post(`${F}/unpublish`, wrap((req, res) => res.json(unpublishFeature(store, req.params.id))));

// ── Evening edition ──
app.get('/api/evening/:day', (req, res) => {
  const ev = store.getEvening(req.params.day);
  if (!ev) return res.status(404).json({ error: tr({ en: 'No evening edition', it: 'Nessuna edizione della sera' }) });
  res.json(ev);
});
app.post('/api/evening/:day/print', wrap(async (req, res) => {
  const ev = await newsroom.printEveningFor(req.params.day);
  if (!ev) return res.status(409).json({ error: tr({ en: 'No hourly editions to sum up on this day.', it: 'Nessuna edizione oraria da riassumere in questo giorno.' }) });
  res.json(ev);
}));
app.patch('/api/evening/:day/cartoon', wrap((req, res) => res.json(editEveningCartoon(store, req.params.day, req.body || {}))));
app.post('/api/evening/:day/publish', wrap((req, res) => res.json(publishEvening(store, req.params.day))));

// ── Letters to the editor ──
app.get('/api/letters', (req, res) => res.json(store.letters({ limit: 100 })));
app.post('/api/letters', wrap((req, res) => res.json(submitLetter(store, req.body || {}))));
app.post('/api/letters/:id/answer', wrap(async (req, res) => res.json(await answerNow(store, config, req.params.id, log))));

// ── Editorial meeting ──
app.get('/api/threads/:id', wrap((req, res) => res.json(getThreadRepaired(store, config, req.params.id))));
app.post('/api/threads/:id', wrap(async (req, res) =>
  res.json(await discuss({ store, config, threadId: req.params.id, text: req.body?.text, articleId: req.body?.articleId, session: req.body?.session, runtime: newsroom.state, log }))));
app.post('/api/threads/:id/apply', wrap(async (req, res) =>
  res.json(await applyAction({ store, config, threadId: req.params.id, msgIndex: Number(req.body?.msg), actionIndex: Number(req.body?.action), printNow: () => newsroom.printNow(), log }))));

app.post('/api/collect', wrap(async (req, res) => {
  const n = await newsroom.collect();
  res.json({ added: n });
}));

// The radio bulletins
app.use('/radio', express.static(radioDir(config), { maxAge: '1h' }));
app.get('/radio.xml', (req, res) => res.type('application/rss+xml; charset=utf-8').send(radioFeed(store, { base: `${req.protocol}://${req.get('host')}` })));

// Photos downloaded by the newsroom
app.use('/media', express.static(path.join(config.dataDir, 'media'), { maxAge: '30d', immutable: true }));

// ── The menu bar (SwiftBar / xbar plugin) ──
app.get('/api/menubar', (req, res) => {
  const evening = store.getEvening(dayKey(Date.now()));
  res.type('text/plain; charset=utf-8').send(menubarText({
    edition: store.latestEdition(),
    next: preview(store, config, { lastCollect: newsroom.state.lastCollect, nextPress: newsroom.state.nextEdition }),
    evening: evening?.status === 'published' ? evening : null,
    spotlight: config.spotlight?.enabled === false ? null : {
      waiting: store.leads({ status: ['reply'] }),
      open: store.leads({ status: ['open', 'review', 'writing'] }).length,
      scoop: store.scoops({ after: new Date().setHours(0, 0, 0, 0), limit: 1 })[0] || null,
    },
    base: `http://localhost:${config.port}`,
    port: config.port,
    calls: openCalls(store).map((c) => callView(c)),
    flash: latestFlashes(store, Date.now() - 3600e3)[0] || null,
    max: Math.min(80, Number(req.query.max) || 42),
  }));
});

// ── The next edition: preview and steering ──
app.get('/api/next', (req, res) => res.json(preview(store, config, { lastCollect: newsroom.state.lastCollect, nextPress: newsroom.state.nextEdition })));
app.post('/api/next/steer', wrap((req, res) => {
  steer(store, config, req.body || {});
  res.json(preview(store, config, { lastCollect: newsroom.state.lastCollect, nextPress: newsroom.state.nextEdition }));
}));

// ── The archive ──
const num = (v) => (v == null || v === '' ? null : Number(v));
app.get('/api/search', (req, res) => res.json(search(store, {
  q: String(req.query.q || '').slice(0, 200),
  kind: ['article', 'event', 'evening'].includes(req.query.kind) ? req.query.kind : null,
  source: req.query.source || null,
  from: num(req.query.from),
  to: num(req.query.to),
  sort: req.query.sort === 'recent' ? 'recent' : 'relevance',
  limit: Math.min(100, num(req.query.limit) || 40),
  offset: num(req.query.offset) || 0,
})));
app.post('/api/ask', wrap(async (req, res) => res.json(await ask(store, config, req.body?.question, log))));

// ── Investigations ──
app.get('/api/investigations', (req, res) => res.json(store.investigations(Math.min(100, num(req.query.limit) || 50))));
app.get('/api/investigations/suggestions', (req, res) => res.json(suggestions(store)));
app.get('/api/investigations/:id', (req, res) => {
  const inv = store.getInvestigation(Number(req.params.id));
  if (!inv) return res.status(404).json({ error: tr({ en: 'Investigation not found', it: 'Inchiesta non trovata' }) });
  res.json(inv);
});
// returns at once (status 'working'); the page polls until the piece is written
app.post('/api/investigations', wrap(async (req, res) => res.json(await createInvestigation(store, config, {
  topic: req.body?.topic, keywords: req.body?.keywords, days: req.body?.days,
}, log, { background: true }))));
app.delete('/api/investigations/:id', (req, res) => {
  store.deleteInvestigation(Number(req.params.id));
  res.status(204).end();
});

// ── Spotlight ──
app.get('/api/spotlight', (req, res) => res.json(store.scoops({ before: num(req.query.before) || null, after: num(req.query.after) || null, limit: Math.min(100, num(req.query.limit) || 30) }).map(teaser)));
app.get('/api/spotlight/desk', (req, res) => res.json(board(store, config)));
app.get('/api/spotlight/:id', (req, res) => {
  const s = store.getScoop(Number(req.params.id));
  if (!s) return res.status(404).json({ error: tr({ en: 'Scoop not found', it: 'Esclusiva non trovata' }) });
  res.json(s);
});
// kill, push, reply, publish: the desk acts on the next round (right away for replies)
app.post('/api/spotlight/leads/:id', wrap((req, res) => {
  const lead = leadAction(store, req.params.id, req.body || {});
  if (req.body?.action === 'reply' || req.body?.action === 'publish') newsroom.spotlight(true);
  if (req.body?.action === 'push') newsroom.spotlight(false);
  res.json(board(store, config));
}));

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
  app.get('/index.html', (req, res) => res.type('html').send(page()));
  app.use(express.static(dist, { index: false }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/media') && !req.path.startsWith('/radio')) return res.type('html').send(page());
    next();
  });
}

function listenFailed(e) {
  if (e.code === 'EADDRINUSE') {
    console.error(tr({
      en: `Port ${config.port} is already in use: the paper is probably already running as a service (npm run service:status; stop it with npm run service:stop). Or choose another "port" in config.json.`,
      it: `La porta ${config.port} è già occupata: il giornale è probabilmente già in edicola come servizio (npm run service:status; fermalo con npm run service:stop). Oppure scegli un'altra "port" in config.json.`,
    }));
  } else {
    console.error(e);
  }
  process.exit(1);
}

// Only this Mac can read the paper: it is served on the loopback interface (config.host to change it).
const server = app.listen(config.port, config.host, (err) => {
  if (err) return listenFailed(err); // Express 5 reports listen errors here
  log(tr({
    en: `The Localhost Times is on the newsstand at http://localhost:${config.port}${config.demo ? '  (demo mode)' : ''}`,
    it: `The Localhost Times è in edicola su http://localhost:${config.port}${config.demo ? '  (modalità demo)' : ''}`,
  }));
  log(`${tr({ en: 'Writer', it: 'Redattore' })}: ${config.llm.baseUrl === 'auto' ? tr({ en: 'looking for a local model (Ollama, LM Studio, llama.cpp…)', it: 'cerco un modello locale (Ollama, LM Studio, llama.cpp…)' }) : config.llm.baseUrl || tr({ en: 'none', it: 'nessuno' })}`);
  startSampler(config, log); // the app in front, every minute (macOS only)
  newsroom.start().catch((e) => log('[start]', e));
});
server.on('error', listenFailed);
