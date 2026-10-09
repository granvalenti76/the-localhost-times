import { buildStories, factSheet, crossFacts } from './cluster.js';
import { deskChain, chainFor } from './chain.js';
import { SECTIONS, SECTION_ORDER } from './sections.js';
import { fallbackArticle, fallbackBrief, fallbackSummary } from './fallback.js';
import { autoScene, validScene, sceneCaption } from './scenes.js';
import { factCheck, numbersCheck } from './factcheck.js';
import { getSteer, applySteer, steerLine, clearSteer, carrySteer } from './next.js';
import { writerFor, columnist, byline } from './writers.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { articlePrompt, rewritePrompt, expandPrompt, summaryPrompt, marketPrompt, sizeOf, wordCount } from './prompts.js';
import { getLine } from './line.js';
import { computeMarket, fallbackMarketComment } from './market.js';
import { illustrate } from './photos.js';
import { findSeries, seriesInfo, seriesFacts } from './series.js';
import { lettersForEdition } from './letters.js';
import { pendingScoop } from './spotlight/desk.js';
import { computeTime, computeMac, isAmbient } from './time.js';
import { interviewFacts, quoteParagraph, closingOf } from './calls.js';
import { tipsForEdition, tipFolders, isTipNote } from './tips.js';
import { metrics, checkRecords, recordFact, reportCards, matchesFrom } from './sport.js';
import { oracleRound } from './oracle.js';
import { flashesBetween } from './flash.js';
import { featureOn } from './line.js';
import { lint } from './lint.js';
import { say } from './chatter.js';
import { commissionedFor } from './features.js';
import { editionId, hhmm, mapLimit, isSelfUrl, hourStart } from '../util.js';
import { tr } from '../i18n.js';

const HOUR = 3600e3;
const PHOTO_SLOTS = 6;

/** The extras never stop the presses: if one fails, the edition goes out without it. */
function safely(fn, fallback, log = () => {}) {
  try { return fn(); } catch (e) { log(`[newsroom] ${e.message}`); return fallback; }
}

function sourcesOf(story) {
  return story.events.slice(0, 40).map((e) => ({
    ts: e.ts,
    kind: e.kind,
    title: e.title,
    detail: e.detail,
    host: e.meta?.host ?? null,
    url: e.source === 'safari' && /^https?:/.test(e.url || '') ? e.url : null,
  }));
}

function validArticle(a) {
  return a && typeof a.headline === 'string' && a.headline.trim()
    && Array.isArray(a.body) && a.body.length && a.body.every((p) => typeof p === 'string');
}

// Headlines without a final full stop (papers don't use one), but keep ? ! and …
/** The automatic typesetting writes with this name (older editions say 'tipografia'). */
export const isTypeset = (w) => !w || w === 'typesetting' || w === 'tipografia';

export const cleanHeadline = (h) => String(h).trim().replace(/(?<!\.)\.$/, '').trim();

function fromLLM(j, story, model) {
  if (!validArticle(j)) throw new Error(tr({ en: 'incomplete JSON', it: 'JSON incompleto' }));
  return {
    kicker: String(j.kicker || story.section).slice(0, 40),
    headline: cleanHeadline(j.headline),
    dek: String(j.dek || '').trim(),
    body: j.body.map((p) => p.trim()).filter(Boolean),
    writer: model,
  };
}

// Generous: local models sometimes reason before answering, and a truncated answer is lost
const maxTokensFor = (size) => (size.id === 'brief' ? 1800 : size.id === 'article' ? 2600 : 3600);

/**
 * Local models tend to write well under the length they are asked for. A draft under 80% of the
 * minimum goes back to the writer once to be expanded; the longer version is kept only if valid.
 */
async function ensureLength(text, msgs, story, size, ctx) {
  if (wordCount(text) >= size.min * 0.8) return text;
  try {
    const raw = await ctx.chat(ctx.llm, ctx.config, expandPrompt(msgs, text, size), maxTokensFor(size));
    const longer = fromLLM(parseJson(raw), story, ctx.llm.model);
    if (wordCount(longer) > wordCount(text)) return { ...longer, expanded: true };
  } catch (e) {
    ctx.log(tr({ en: `[newsroom] ${story.id}: could not expand the draft (${e.message})`, it: `[redazione] ${story.id}: non sono riuscito ad allungare la bozza (${e.message})` }));
  }
  return text;
}

async function writeArticle(story, rank, ctx) {
  const { llm, config, hourLabel, log, line } = ctx;
  let text = null;
  const writer = writerFor(line, story.source); // the byline of the section
  const size = sizeOf(story, rank, line, writer);
  if (llm) {
    try {
      const facts = factSheet(story) + seriesFacts(story.series, Date.now()) + (story.extra || '');
      const msgs = articlePrompt(story, facts, hourLabel, size, line, writer);
      const raw = await chat(llm, config, msgs, maxTokensFor(size));
      text = fromLLM(parseJson(raw), story, llm.model);
      text = await ensureLength(text, msgs, story, size, { ...ctx, chat });
      // the managing editor reads it, the reporter rewrites if sent back, the copy desk checks the figures
      if (chainFor(config, rank)) text = await deskChain(text, { facts, msgs, size, ctx, chat, maxTokens: maxTokensFor(size), fromLLM, story, writer });
      text.check = numbersCheck(text, facts); // figures the facts don't contain
      text.byline = byline(writer);
    } catch (e) {
      log(tr({ en: `[newsroom] ${story.id}: the writer failed (${e.message}), automatic typesetting takes over`, it: `[redazione] ${story.id}: il redattore ha fallito (${e.message}), passa la tipografia` }));
    }
  }
  text ||= fallbackArticle(story);
  // the Editor's statements always reach the page: the typesetting adds them if the writer didn't
  for (const qt of story.quotes || []) {
    const said = qt.answer && text.body.some((p) => p.includes(qt.answer.slice(0, 40)));
    if (said) continue;
    if (qt.answer || isTypeset(text.writer)) text.body = [...text.body, quoteParagraph(qt)];
  }
  text.lint = lint(text.body);
  return {
    id: story.id,
    series: story.series || null,
    source: story.source,
    section: story.section,
    slug: SECTIONS[story.source].slug,
    kind: story.kind,
    weight: Math.round(story.weight * 100) / 100,
    size: size.id,
    first: story.first,
    last: story.last,
    ...text,
    image: null,
    sources: sourcesOf(story),
    quotes: story.quotes?.length ? story.quotes : undefined,
    record: story.records?.length ? story.records : undefined,
    tipped: story.tipped || undefined,
  };
}

export function computeStats(events, start, end = start + HOUR) {
  const bySource = {};
  for (const id of SECTION_ORDER) bySource[id] = 0;
  const bins = Array.from({ length: 12 }, () => 0);
  const binMs = Math.max(1, (end - start) / 12);
  for (const e of events) {
    bySource[e.source] = (bySource[e.source] || 0) + 1;
    const b = Math.min(11, Math.max(0, Math.floor((e.ts - start) / binMs)));
    bins[b]++;
  }
  return {
    total: events.length,
    bySource,
    bins,
    searches: events.filter((e) => e.kind === 'search').length,
    mailsIn: events.filter((e) => e.source === 'mail' && e.kind === 'received').length,
    mailsOut: events.filter((e) => e.source === 'mail' && e.kind === 'sent').length,
    commands: bySource.terminal || 0,
  };
}

/** The hour's stories, weighted by the editorial line (hidden sections excluded). */
function weightedStories(events, line) {
  return buildStories(events)
    .map((s) => ({ ...s, weight: s.weight * (line.sectionWeights[s.source] ?? 1) }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

const cleanQuote = (s) => String(s).trim().replace(/^[«"“']+|[»"”']+$/g, '').trim();

/** The front-page Punto and the cartoon: caption and drawing, chosen together. */
async function writeSummary(articles, total, ctx, stats) {
  const { llm, config, hourLabel, log, line, hour } = ctx;
  let summary = null;
  let caption = null;
  let scene = null;
  let summaryBy = null;
  if (llm && articles.some((a) => !isTypeset(a.writer))) {
    try {
      const j = parseJson(await chat(llm, config, summaryPrompt(articles, total, hourLabel, line, columnist(line)), 1800));
      if (typeof j.summary === 'string' && j.summary.trim()) { summary = j.summary.trim(); summaryBy = byline(columnist(line)); }
      if (typeof j.cartoon === 'string' && j.cartoon.trim()) caption = cleanQuote(j.cartoon).slice(0, 160);
      scene = validScene(j.scene);
      if (j.scene && !scene) log(tr({ en: `[newsroom] cartoon: scene “${j.scene}” is not in the catalogue, automatic typesetting picks one`, it: `[redazione] vignetta: scena «${j.scene}» non in catalogo, decide la tipografia` }));
    } catch (e) {
      log(tr({ en: `[newsroom] front-page brief: ${e.message}`, it: `[redazione] punto di prima pagina: ${e.message}` }));
    }
  }
  // with no caption from the writer, the typesetting picks drawing and caption (consistent with each other)
  if (!caption) scene = null;
  scene ||= autoScene(articles, stats, { hour });
  return {
    summary: summary || fallbackSummary(articles, total),
    summaryBy,
    cartoon: { caption: caption || sceneCaption(scene, `${articles[0]?.id}${stats?.total || 0}`), scene, by: caption ? 'writer' : 'typesetting' },
  };
}

async function writeMarketComment(market, ctx) {
  const { llm, config, hourLabel, log, line } = ctx;
  if (!market?.rows.length) return null;
  if (llm) {
    try {
      const j = parseJson(await chat(llm, config, marketPrompt(market, hourLabel, line), 1500));
      if (typeof j.comment === 'string' && j.comment.trim()) return j.comment.trim();
    } catch (e) {
      log(tr({ en: `[newsroom] market comment: ${e.message}`, it: `[redazione] commento di borsa: ${e.message}` }));
    }
  }
  return fallbackMarketComment(market);
}

export const cleanEvents = (events, config) => {
  // visits to the paper itself are not news (also cleans up events collected earlier),
  // and neither are the notes left in the tip box
  const folders = tipFolders(config);
  return events.filter((e) => !(e.source === 'safari' && isSelfUrl(e.url, config.port)) && !isTipNote(e, folders));
};

/**
 * The time window an edition covers: from the end of the previous edition (quiet hours merge in),
 * at most `maxMergeHours` back; a reprint keeps the coverage it had.
 */
export function editionWindow(store, config, hour) {
  const end = hour + HOUR;
  const id = editionId(hour);
  const maxMerge = Math.max(1, config.edition.maxMergeHours || 1);
  const existing = store.getEdition(id);
  let windowStart = hour;
  if (existing?.start) {
    windowStart = existing.start; // reprint: same coverage as before
  } else {
    const prevEnd = store.lastEditionEnd(end, id);
    const earliest = hour - (maxMerge - 1) * HOUR;
    windowStart = Math.min(hour, prevEnd != null && prevEnd > earliest ? prevEnd : earliest);
  }
  return { id, end, maxMerge, existing, windowStart };
}

/**
 * Prints the edition for the hour starting at `start`.
 * Preceding hours that were too quiet (below `minEvents`) are merged into this one, up to
 * `maxMergeHours` hours in total. Returns null if there is not (yet) enough to report;
 * with `force` it prints anyway (the "Print now" button).
 */
export async function printEdition({ store, config, start, final = true, force = false, log = console.log }) {
  const hour = start;
  const { id, end, maxMerge, existing, windowStart: from } = editionWindow(store, config, hour);
  let windowStart = from;
  // everything in the window; the "signals" are what happened, not the time and power measurements
  const events = cleanEvents(store.eventsBetween(windowStart, end), config);
  const news = events.filter((e) => !isAmbient(e));
  if (!news.length && !(force && events.length)) return null;
  // coverage starts from the first hour with signals (no "since 01:00" if everything before was empty)
  if (!existing && news.length) windowStart = Math.max(windowStart, hourStart(news[0].ts));
  const hoursCovered = Math.round((end - windowStart) / HOUR);
  if (!force && !existing && news.length < (config.edition.minEvents || 0) && hoursCovered < maxMerge) {
    log(tr({ en: `[newsroom] ${id}: only ${news.length} signals, merged into the next edition`, it: `[redazione] ${id}: solo ${news.length} segnali, confluiscono nella prossima edizione` }));
    carrySteer(store, id, editionId(hour + HOUR)); // the editor's steering follows the news
    return null;
  }

  // the editor's steering for this edition: lead with, leave out, one-off instructions
  const steer = getSteer(store, id);
  const line = steerLine(getLine(store), steer);
  const stories = applySteer(weightedStories(events, line), steer);
  const max = config.edition.maxArticles;
  const main = stories.slice(0, max);
  const rest = stories.slice(max);
  // continuing stories: previous instalments in the last 7 days
  const series = findSeries(store, main, { before: windowStart, excludeId: id });
  for (const s of main) s.series = seriesInfo(series.get(s.id));
  const hourLabel = windowStart < hour ? `${hhmm(windowStart)}–${hhmm(end)}` : hhmm(hour);

  // what the Editor and the paper's games add to the facts: statements, tips, records
  const stats = computeStats(news, windowStart, end);
  const time = computeTime(events, windowStart, end);
  const single = windowStart === hour;
  const records = featureOn(line, 'sport') ? safely(() => checkRecords(store, metrics({ news, stats, time }), { editionId: id, at: hour, single }), [], log) : [];
  const tipped = featureOn(line, 'tips') ? safely(() => tipsForEdition(store, main, { end, editionId: id }), { facts: new Map(), box: [] }, log) : { facts: new Map(), box: [] };
  const metricList = records.length ? metrics({ news, stats, time }) : [];
  for (const s of main) {
    const iv = featureOn(line, 'interview') ? safely(() => interviewFacts(store, s, { windowStart, end, editionId: id }), { facts: '', quotes: [] }, log) : { facts: '', quotes: [] };
    s.quotes = iv.quotes;
    s.records = records.filter((r) => metricList.find((m) => m.key === r.key)?.story(s));
    s.tipped = tipped.facts.has(s.id);
    s.extra = iv.facts + (tipped.facts.get(s.id) || '') + s.records.map(recordFact).join('') + safely(() => crossFacts(s, events), '', log);
  }

  const llm = await connectLLM(config);
  const ctx = { llm, config, hourLabel, log, line, store, hour: windowStart };
  log(tr({
    en: `[newsroom] edition ${id}${windowStart < hour ? ` (since ${hhmm(windowStart)})` : ''}: ${news.length} events, ${stories.length} stories, writer ${llm ? llm.model : 'offline → automatic typesetting'}, tone ${line.tone}`,
    it: `[redazione] edizione ${id}${windowStart < hour ? ` (dalle ${hhmm(windowStart)})` : ''}: ${news.length} eventi, ${stories.length} storie, redattore ${llm ? llm.model : 'offline → tipografia'}, tono ${line.tone}`,
  }));

  const articles = await mapLimit(main, llm ? config.llm.concurrency : 8, (s, i) => writeArticle(s, i, ctx));
  const written = articles.slice(); // the photos follow the stories, whatever comes in front of them
  const briefs = rest.map((s) => ({ section: s.section, slug: SECTIONS[s.source].slug, ts: s.last, text: fallbackBrief(s) }));

  // the pieces the Editor commissioned and approved for this edition: at the top or right after it
  for (const c of safely(() => commissionedFor(store, id), [], log)) {
    if (articles.some((a) => a.id === c.article.id)) continue;
    if (c.placement === 'lead') articles.unshift(c.article);
    else articles.splice(Math.min(1, articles.length), 0, c.article);
  }

  // Photos: in parallel with the Punto and the Borsa
  const photosJob = line.photos && !config.demo
    ? mapLimit(main.slice(0, PHOTO_SLOTS), 3, async (s, i) => {
      try { written[i].image = await illustrate(s, { store, config }); } catch { /* no photo */ }
    })
    : Promise.resolve();

  const market = computeMarket(store, hour, { port: config.port });
  const mac = computeMac(store, windowStart, end);
  const prevLetters = existing?.letters || [];
  const [{ summary, summaryBy, cartoon }, comment, newLetters] = await Promise.all([
    writeSummary(articles, news.length, ctx, stats),
    writeMarketComment(market, ctx),
    // reprint: letters already published stay; otherwise answer the pending ones
    prevLetters.length || !llm ? Promise.resolve(prevLetters) : lettersForEdition(store, config, id, log),
    photosJob,
  ]);
  if (market) market.comment = comment;
  // the fact-check reads the finished edition: articles, Brief and the hour's data
  const factcheck = await factCheck({ articles, stories: main, summary, stats, market, hourLabel }, ctx);

  // the games: the sports page, the Oracle; the Editor's closing call; the breaking news of the hour
  const sport = featureOn(line, 'sport') ? safely(() => ({
    cards: reportCards({ stories: main, time, market, records }),
    records,
    matches: matchesFrom(main),
  }), null, log) : null;
  const recentTotals = safely(() => store.db.prepare(`SELECT payload FROM editions WHERE start_ts < ? ORDER BY start_ts DESC LIMIT 6`).all(windowStart)
    .map((r) => JSON.parse(r.payload).stats?.total || 0), [], log);
  const oracle = featureOn(line, 'oracle') ? safely(() => oracleRound(store, {
    editionId: id, events, end, recentTotals,
    eventsFor: (a, b) => cleanEvents(store.eventsBetween(a, b), config),
  }), null, log) : null;
  const closing = safely(() => closingOf(store, { windowStart, end }), null, log);
  const flashes = safely(() => flashesBetween(store, windowStart, end), [], log);
  if (records.length) say(store, 'sport', tr({ en: `Sports desk: record! ${records[0].label}: ${records[0].value}.`, it: `Redazione sportiva: primato! ${records[0].label}: ${records[0].value}.` }));

  const edition = {
    id,
    start: windowStart,
    hour,
    end,
    final,
    status: line.autoPublish ? 'published' : 'draft',
    edited: false,
    number: existing?.number ?? store.editionNumber(windowStart),
    createdAt: Date.now(),
    writer: llm ? llm.model : 'typesetting',
    tone: line.tone,
    steered: steer.boost.length || steer.bury.length || steer.notes.length ? { boost: steer.boost, bury: steer.bury, notes: steer.notes } : null,
    summary,
    summaryBy,
    cartoon,
    factcheck,
    articles,
    spiked: [],
    briefs,
    market,
    letters: newLetters,
    spotlight: existing?.spotlight || pendingScoop(store, id),
    sport,
    oracle,
    closing,
    flashes,
    rumours: tipped.box.length ? tipped.box : existing?.rumours || null,
    serial: existing?.serial || null,
    stats,
    time,
    mac,
    sections: SECTION_ORDER.filter((s) => articles.some((a) => a.source === s) || news.some((e) => e.source === s)).map((s) => SECTIONS[s]),
  };
  // a draft already published stays published when reprinted
  const prev = store.editionMeta(edition.id);
  if (prev?.status === 'published') edition.status = 'published';
  store.saveEdition(edition);
  if (final) clearSteer(store, id);
  return edition;
}

// ───────────────────────── The newsroom desk ─────────────────────────

export class DeskError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function load(store, id) {
  const ed = store.getEdition(id);
  if (!ed) throw new DeskError(tr({ en: 'Edition not found', it: 'Edizione non trovata' }), 404);
  ed.spiked ||= [];
  return ed;
}

export function findArticle(ed, aid) {
  const i = ed.articles.findIndex((a) => a.id === aid);
  if (i < 0) throw new DeskError(tr({ en: 'Article not found', it: 'Articolo non trovato' }), 404);
  return i;
}

export function touch(store, ed) {
  ed.edited = true;
  if (ed.factcheck) ed.factcheck.stale = true; // the page changed after it was checked
  ed.editedAt = Date.now();
  store.saveEdition(ed);
  return ed;
}

export function editArticle(store, id, aid, patch) {
  const ed = load(store, id);
  const a = ed.articles[findArticle(ed, aid)];
  if (typeof patch.headline === 'string') a.headline = cleanHeadline(patch.headline);
  if (typeof patch.kicker === 'string') a.kicker = patch.kicker.trim().slice(0, 40);
  if (typeof patch.dek === 'string') a.dek = patch.dek.trim();
  if (Array.isArray(patch.body)) a.body = patch.body.map((p) => String(p).trim()).filter(Boolean);
  if (patch.removeImage) a.image = null;
  a.writer = /\+ (editor|direttore)$/.test(a.writer || '') ? a.writer : `${a.writer || 'typesetting'} + editor`;
  return touch(store, ed);
}

/** The editor changes the cartoon's drawing or caption. */
export function editCartoon(store, id, patch = {}) {
  const ed = load(store, id);
  ed.cartoon = applyCartoon(ed.cartoon, patch);
  const stale = ed.factcheck?.stale;
  touch(store, ed);
  if (ed.factcheck) { ed.factcheck.stale = !!stale; store.saveEdition(ed); } // the cartoon isn't fact-checked
  return ed;
}

export function applyCartoon(cartoon, patch) {
  const next = { ...(cartoon || { caption: '', scene: 'desk' }) };
  if (patch.scene != null) {
    const scene = validScene(patch.scene);
    if (!scene) throw new DeskError(tr({ en: 'Drawing not in the catalogue', it: 'Disegno non in catalogo' }), 400);
    next.scene = scene;
  }
  if (typeof patch.caption === 'string') {
    const c = cleanQuote(patch.caption).slice(0, 160);
    if (!c) throw new DeskError(tr({ en: 'A cartoon needs a caption', it: 'La vignetta ha bisogno di una battuta' }), 400);
    next.caption = c;
  }
  next.by = 'editor';
  return next;
}

export function spikeArticle(store, id, aid) {
  const ed = load(store, id);
  const [a] = ed.articles.splice(findArticle(ed, aid), 1);
  ed.spiked.unshift(a);
  return touch(store, ed);
}

export function restoreArticle(store, id, aid) {
  const ed = load(store, id);
  const i = ed.spiked.findIndex((a) => a.id === aid);
  if (i < 0) throw new DeskError(tr({ en: 'Article not found in the spike', it: 'Articolo non trovato nel cestino' }), 404);
  const [a] = ed.spiked.splice(i, 1);
  ed.articles.push(a);
  return touch(store, ed);
}

export function moveArticle(store, id, aid, to) {
  const ed = load(store, id);
  const i = findArticle(ed, aid);
  const [a] = ed.articles.splice(i, 1);
  const j = to === 'top' ? 0 : to === 'up' ? Math.max(0, i - 1) : to === 'down' ? Math.min(ed.articles.length, i + 1) : Number(to);
  ed.articles.splice(Math.max(0, Math.min(ed.articles.length, j)), 0, a);
  return touch(store, ed);
}

export function publishEdition(store, id) {
  const ed = load(store, id);
  ed.status = 'published';
  ed.publishedAt = Date.now();
  store.saveEdition(ed);
  return ed;
}

async function ctxFor(store, config, ed, log) {
  const llm = await connectLLM(config);
  if (!llm) throw new DeskError(tr({ en: 'The writer is not answering: cannot rewrite now.', it: 'Il redattore non risponde: impossibile riscrivere ora.' }), 503);
  return { llm, config, hourLabel: hhmm(ed.hour ?? ed.start), log, line: getLine(store), store };
}

export async function rewriteArticle(store, config, id, aid, instruction, log = console.log) {
  const ed = load(store, id);
  const i = findArticle(ed, aid);
  const prev = ed.articles[i];
  const ctx = await ctxFor(store, config, ed, log);
  if (prev.kind === 'commissioned') throw new DeskError(tr({ en: 'A commissioned piece is rewritten from its own page (Newsroom → New article).', it: 'Un pezzo su commissione si riscrive dalla sua pagina (Redazione → Nuovo articolo).' }), 409);
  const story = buildStories(cleanEvents(store.eventsBetween(ed.start, ed.end), config)).find((s) => s.id === aid);
  if (!story) throw new DeskError(tr({ en: 'The facts behind this article are no longer available.', it: 'Non trovo più i fatti di questo articolo.' }), 409);
  story.series = prev.series || null;
  const writer = writerFor(ctx.line, story.source);
  const size = sizeOf(story, i, ctx.line, writer);
  const msgs = rewritePrompt(story, factSheet(story) + seriesFacts(story.series, Date.now()), ctx.hourLabel, size, ctx.line, prev, instruction, writer);
  const raw = await chat(ctx.llm, config, msgs, maxTokensFor(size));
  let text;
  try {
    text = fromLLM(parseJson(raw), story, ctx.llm.model);
    // an explicit "make it shorter" wins over the format
    if (!/cort|breve|short|brev|tagli|trim|cut/i.test(instruction || '')) text = await ensureLength(text, msgs, story, size, { ...ctx, config, chat });
  } catch (e) {
    throw new DeskError(tr({ en: `The writer gave a bad answer: ${e.message}`, it: `Il redattore ha risposto male: ${e.message}` }), 502);
  }
  // the edition may have changed in the meantime
  const fresh = load(store, id);
  const k = findArticle(fresh, aid);
  text.check = numbersCheck(text, factSheet(story) + seriesFacts(story.series, Date.now()));
  text.byline = byline(writer);
  fresh.articles[k] = { ...fresh.articles[k], ...text, size: size.id, rewrittenWith: instruction || null };
  return touch(store, fresh);
}

/** The desk's "Check again": a new fact-check of the edition as it is now. */
export async function factCheckEdition(store, config, id, log = console.log) {
  const ed = load(store, id);
  const ctx = await ctxFor(store, config, ed, log);
  const stories = buildStories(cleanEvents(store.eventsBetween(ed.start, ed.end), config));
  const fc = await factCheck({ articles: ed.articles, stories, summary: ed.summary, stats: ed.stats, market: ed.market, hourLabel: ctx.hourLabel }, ctx);
  if (!fc) throw new DeskError(tr({ en: 'The fact-checker gave no usable answer.', it: 'Il fact-checker non ha dato una risposta utilizzabile.' }), 502);
  const fresh = load(store, id);
  fresh.factcheck = fc;
  store.saveEdition(fresh);
  return fresh;
}

export async function rewriteSummary(store, config, id, log = console.log) {
  const ed = load(store, id);
  const llm = await connectLLM(config);
  const ctx = { llm, config, hourLabel: hhmm(ed.start), log, line: getLine(store), store, hour: ed.start };
  const { summary, summaryBy, cartoon } = await writeSummary(ed.articles, ed.stats.total, ctx, ed.stats);
  ed.summary = summary;
  ed.summaryBy = summaryBy;
  ed.cartoon = cartoon;
  return touch(store, ed);
}

export async function reprintEdition(store, config, id, log = console.log) {
  const ed = load(store, id);
  return printEdition({ store, config, start: ed.hour ?? ed.start, final: ed.final, force: true, log });
}
