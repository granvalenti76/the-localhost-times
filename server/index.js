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
import { getLine, saveLine, LENGTHS, WEIGHTS } from './newsroom/line.js';
import {
  DeskError, editArticle, spikeArticle, restoreArticle, moveArticle, publishEdition, rewriteArticle, rewriteSummary,
  editCartoon, factCheckEdition,
} from './newsroom/edition.js';
import { publishEvening, editEveningCartoon } from './newsroom/evening.js';
import { SCENES } from './newsroom/scenes.js';
import { createNotifier } from './notify.js';
import { staff } from './newsroom/writers.js';
import { menubarText } from './menubar.js';
import { radioFeed, radioDir } from './newsroom/radio.js';
import { tr, lang, locale } from './i18n.js';
import { rssFeed } from './feed.js';
import { search, ask } from './newsroom/archive.js';
import { preview, steer } from './newsroom/next.js';
import { workbenchView } from './newsroom/workbench.js';
import { staffView, wiresView, trialRun } from './newsroom/house.js';
import { addLesson, removeLesson } from './newsroom/people.js';
import { chiefView } from './newsroom/chief.js';
import { nextEditionId } from './newsroom/next.js';
import { createInvestigation, suggestions, interruptedInvestigations } from './newsroom/investigations.js';
import { board, leadAction, teaser, recoverLeads, leadFromTip } from './newsroom/spotlight/desk.js';
import { submitLetter, answerNow } from './newsroom/letters.js';
import { say } from './newsroom/chatter.js';
import { tips, addTip, archiveTip } from './newsroom/tips.js';
import { paragraphAction, headlineOptions } from './newsroom/bench.js';
import { computeReview, typesetReview, latestReview, printReview } from './newsroom/review.js';
import { recall } from './newsroom/recall.js';
import { standup, polishStandup } from './newsroom/standup.js';
import { getInterni, saveInterni, interniStatus, interniRepos, repoStatus, repoWork, commitsPerDay } from './newsroom/interni.js';

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
if (store.needsReindex()) {
  // first start after the archive was added: index what is already there
  store.reindex();
}
const log = (...a) => console.log(new Date().toLocaleTimeString(locale()), ...a);
const notify = createNotifier(config, log);
// the projects' folder chosen in the Settings: the git source looks there
config.interni = getInterni(store);
const newsroom = createNewsroom({ store, config, log, notify });

if (config.demo) {
  const n = seedDemo(store);
  if (n) log(tr({ en: `[demo] ${n} demo events inserted`, it: `[demo] ${n} eventi dimostrativi inseriti` }));
  for (const s of SOURCES) sourceStatus[s.id] = { id: s.id, label: s.label, state: 'demo' };
  seedDemoDesk(store).catch((e) => log(`[demo] ${e.message}`));
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
    cadence: getLine(store).cadence,
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
app.get('/api/line', (req, res) => { const line = getLine(store); res.json({ line, lengths: LENGTHS, weights: WEIGHTS, staff: staff(line) }); });
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

// ── One paragraph (♥ ✕ ✂ ↻), one headline ──
app.post(`${A}/paragraph`, wrap(async (req, res) => res.json(await paragraphAction(store, config, req.params.id, req.params.aid, req.body || {}, log))));
app.post(`${A}/headlines`, wrap(async (req, res) => res.json(await headlineOptions(store, config, req.params.id, req.params.aid))));

// ── The tip box ──
app.get('/api/tips', (req, res) => res.json(tips(store, { status: req.query.status || null, limit: 100 })));
app.post('/api/tips', wrap((req, res) => res.json(addTip(store, { text: req.body?.text, via: req.body?.via === 'cli' ? 'cli' : 'web' }))));
app.post('/api/tips/:id/archive', wrap((req, res) => res.json(archiveTip(store, req.params.id))));

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
app.get('/api/letters', (req, res) => res.json(store.letters({ limit: 100 }).filter((l) => !l.reader || ['published', 'pending', 'answered'].includes(l.status))));
app.post('/api/letters', wrap((req, res) => res.json(submitLetter(store, req.body || {}))));
app.post('/api/letters/:id/answer', wrap(async (req, res) => res.json(await answerNow(store, config, req.params.id, log))));

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
    self: typeof req.query.self === 'string' ? req.query.self.slice(0, 500) : null,
    max: Math.min(80, Number(req.query.max) || 42),
  }));
});

// ── The next edition: preview and steering ──
app.get('/api/next', (req, res) => res.json(preview(store, config, { lastCollect: newsroom.state.lastCollect, nextPress: newsroom.state.nextEdition })));
app.post('/api/next/steer', wrap((req, res) => {
  const b = req.body || {};
  steer(store, config, b);
  res.json(preview(store, config, { lastCollect: newsroom.state.lastCollect, nextPress: newsroom.state.nextEdition }));
}));

// ── The next edition in the works: the hour's drafts and the Editor's hand on them ──
const bench = () => workbenchView(store, config, { nextPress: newsroom.state.nextEdition });
app.get('/api/workbench', (req, res) => res.json(bench()));
app.post('/api/workbench/round', wrap((req, res) => {
  newsroom.draftNow().catch((e) => log(`[drafts] ${e.message}`));
  res.json({ ...bench(), running: Date.now() });
}));
// ── The managing editor ──
app.get('/api/chief', (req, res) => res.json(chiefView(store)));

// ── The Publishing House: the staff, the wires, the style manual ──
app.get('/api/staff', (req, res) => res.json(staffView(store)));
// the Editor teaches a writer in their own words, or takes a lesson back
app.post('/api/staff/:id/lessons', wrap((req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: tr({ en: 'Write the lesson.', it: 'Scrivi la lezione.' }) });
  addLesson(store, req.params.id, { text });
  res.json(staffView(store));
}));
app.delete('/api/staff/:id/lessons', wrap((req, res) => { removeLesson(store, req.params.id, String(req.body?.key || '')); res.json(staffView(store)); }));
app.get('/api/wires', (req, res) => res.json(wiresView(store, config)));
app.post('/api/manual/trial', wrap(async (req, res) => {
  res.json(await newsroom.queue(() => trialRun(store, config, { manual: req.body?.manual || null, writer: req.body?.writer || null }, log)));
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
// "what was that thing I read on Tuesday?": the archive as a memory
app.post('/api/recall', wrap(async (req, res) => res.json(await recall(store, config, req.body?.question, { log }))));

// ── The past: the history the Mac keeps, the Year in Review ──
app.get('/api/history', (req, res) => res.json(config.demo ? { demo: true } : store.getSetting('history', null)));
// reads the past and prints the last days in the background: the page polls /api/history
app.post('/api/history', wrap(async (req, res) => {
  if (config.demo) return res.status(400).json({ error: tr({ en: 'The demo has no past to read.', it: 'La demo non ha un passato da leggere.' }) });
  newsroom.readPast().then(() => newsroom.catchUp()).catch((e) => log(`[history] ${e.message}`));
  res.json({ started: true });
}));
app.get('/api/review', (req, res) => {
  const saved = latestReview(store);
  if (saved) return res.json(saved);
  // none written yet: the typesetting's, from the archive as it is
  const r = computeReview(store);
  res.json(r ? { ...r, ...typesetReview(r), draft: true } : null);
});
app.post('/api/review', wrap(async (req, res) => res.json(await newsroom.queue(() => printReview(store, config, { log })))));

// ── Interni: the projects ──
app.get('/api/interni', wrap(async (req, res) => {
  const prefs = getInterni(store);
  res.json({ folder: prefs.folder || null, repos: config.demo ? [] : await interniStatus(store, config) });
}));
app.post('/api/interni', wrap(async (req, res) => {
  const b = req.body || {};
  saveInterni(store, config, { folder: b.folder, repo: b.repo, on: b.on, title: b.title });
  res.json({ folder: getInterni(store).folder || null, repos: await interniStatus(store, config) });
}));
// the Mac's own folder picker: the page can't open one that returns a path
app.post('/api/interni/choose', wrap(async (req, res) => {
  if (process.platform !== 'darwin') return res.status(400).json({ error: tr({ en: 'Type the folder\'s path instead.', it: 'Scrivi invece il percorso della cartella.' }) });
  const { execFile } = await import('node:child_process');
  const prompt = tr({ en: 'The folder of your projects', it: 'La cartella dei tuoi progetti' });
  execFile('/usr/bin/osascript', ['-e', `POSIX path of (choose folder with prompt "${prompt}")`], { timeout: 120000 }, async (err, stdout) => {
    if (err) return res.json({ cancelled: true });
    const folder = stdout.trim().replace(/\/$/, '');
    saveInterni(store, config, { folder });
    res.json({ folder, repos: await interniStatus(store, config) });
  });
}));
// a project's own page: how it stands, what it is, thirty days of commits, the week's work, its chronicle
app.get('/api/interni/:name', wrap(async (req, res) => {
  const name = req.params.name;
  const r = config.demo ? null : interniRepos(store, config).find((x) => x.name === name);
  // the pieces the paper wrote about it: the project's own, or the older project stories of the same name
  const ids = new Set([`interni:${name}`.replace(/[^\w:.-]+/g, '-'), `git:project:${name.toLowerCase()}`, `git:commits:git-${name}`, `terminal:project:${name.toLowerCase()}`]);
  const chronicle = store.db.prepare(`SELECT id, payload FROM editions WHERE payload LIKE ? ORDER BY start_ts DESC LIMIT 60`).all(`%${name}%`)
    .map((row) => {
      const ed = JSON.parse(row.payload);
      const a = ed.articles.find((x) => ids.has(x.id));
      return a && { editionId: ed.id, day: ed.end - 1, articleId: a.id, headline: a.headline, dek: a.dek, body: a.body.slice(0, 2), first: a.first, last: a.last };
    }).filter(Boolean).slice(0, 40);
  if (!r) {
    // a project the paper knows only from its archive (the demo's, or one moved away): what the reflog saw
    const evs = store.db.prepare(`SELECT ts FROM events WHERE source = 'git' AND kind IN ('commit', 'merge', 'amend') AND json_extract(meta, '$.repo') = ? AND ts >= ?`).all(name, Date.now() - 30 * 864e5);
    if (!evs.length && !chronicle.length) return res.status(404).json({ error: tr({ en: 'Project not found', it: 'Progetto non trovato' }) });
    const start = new Date(Date.now() - 29 * 864e5).setHours(0, 0, 0, 0);
    const bins = Array(30).fill(0);
    for (const e of evs) { const i = Math.floor((e.ts - start) / 864e5); if (i >= 0 && i < 30) bins[i]++; }
    return res.json({
      name, title: chronicle[0]?.headline ? name : name, path: '—', branch: null, branches: 0, dirty: 0, ahead: null, commits: evs.length, description: null,
      perDay: { start, bins }, week: { commits: 0, added: 0, removed: 0, areas: [], born: 0, gone: 0, deps: { arrived: [], left: [], updated: [] }, tags: [] },
      chronicle, others: [],
    });
  }
  const status = await repoStatus(r.path);
  const week = await repoWork(r.path, Date.now() - 7 * 864e5, Date.now(), { me: status.me });
  res.json({
    name: r.name, title: r.title, path: r.path.replace(process.env.HOME || '', '~'), ...status,
    perDay: await commitsPerDay(r.path),
    week: { commits: week.commits.length, added: week.added, removed: week.removed, areas: week.areas, born: week.born.length, gone: week.gone.length, deps: week.deps, tags: week.tags },
    chronicle,
    others: interniRepos(store, config).filter((x) => x.on && x.name !== r.name).map((x) => x.name),
  });
}));

// ── The standup, written by itself ──
const standupOpts = (q) => ({ span: q.span === 'week' ? 'week' : 'day', format: ['markdown', 'slack', 'plain'].includes(q.format) ? q.format : 'markdown' });
app.get('/api/standup', (req, res) => res.json(standup(store, config, standupOpts(req.query))));
app.get('/api/standup.txt', (req, res) => res.type('text/plain; charset=utf-8').send(standup(store, config, standupOpts(req.query)).text));
app.post('/api/standup/polish', wrap(async (req, res) => res.json(await polishStandup(store, config, standupOpts(req.body || {}), log))));

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
  // the Editor's moves that change a lead's file: the desk looks again at the next round, now
  if (['push', 'tip', 'widen', 'cross'].includes(req.body?.action)) newsroom.spotlight(false);
  res.json(board(store, config));
}));
// a tip handed straight to Spotlight: a lead of its own
app.post('/api/spotlight/leads', wrap((req, res) => {
  leadFromTip(store, config, { text: req.body?.text, keywords: req.body?.keywords });
  newsroom.spotlight(false);
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
