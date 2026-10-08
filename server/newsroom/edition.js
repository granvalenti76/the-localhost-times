import { buildStories, factSheet } from './cluster.js';
import { SECTIONS, SECTION_ORDER } from './sections.js';
import { fallbackArticle, fallbackBrief, fallbackSummary } from './fallback.js';
import { autoScene, validScene, sceneCaption } from './scenes.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { articlePrompt, rewritePrompt, summaryPrompt, marketPrompt, sizeOf } from './prompts.js';
import { getLine } from './line.js';
import { computeMarket, fallbackMarketComment } from './market.js';
import { illustrate } from './photos.js';
import { findSeries, seriesInfo, seriesFacts } from './series.js';
import { lettersForEdition } from './letters.js';
import { editionId, hhmm, mapLimit, isSelfUrl, hourStart } from '../util.js';

const HOUR = 3600e3;
const PHOTO_SLOTS = 6;

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

// Titoli senza punto finale (i giornali non lo mettono), ma lasciamo ? ! e …
const cleanHeadline = (h) => String(h).trim().replace(/(?<!\.)\.$/, '').trim();

function fromLLM(j, story, model) {
  if (!validArticle(j)) throw new Error('JSON incompleto');
  return {
    kicker: String(j.kicker || story.section).slice(0, 40),
    headline: cleanHeadline(j.headline),
    dek: String(j.dek || '').trim(),
    body: j.body.map((p) => p.trim()).filter(Boolean),
    writer: model,
  };
}

// Generosi: i modelli locali a volte ragionano prima di rispondere, e una risposta troncata è persa
const maxTokensFor = (size) => (size.name === 'breve' ? 1800 : size.name === 'articolo' ? 2400 : 3200);

async function writeArticle(story, rank, ctx) {
  const { llm, config, hourLabel, log, line } = ctx;
  let text = null;
  const size = sizeOf(story, rank, line);
  if (llm) {
    try {
      const facts = factSheet(story) + seriesFacts(story.series, Date.now());
      const raw = await chat(llm, config, articlePrompt(story, facts, hourLabel, size, line), maxTokensFor(size));
      text = fromLLM(parseJson(raw), story, llm.model);
    } catch (e) {
      log(`[redazione] ${story.id}: il redattore ha fallito (${e.message}), passa la tipografia`);
    }
  }
  text ||= fallbackArticle(story);
  return {
    id: story.id,
    series: story.series || null,
    source: story.source,
    section: story.section,
    slug: SECTIONS[story.source].slug,
    kind: story.kind,
    weight: Math.round(story.weight * 100) / 100,
    size: size.name,
    first: story.first,
    last: story.last,
    ...text,
    image: null,
    sources: sourcesOf(story),
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

/** Le storie dell'ora, pesate secondo la linea editoriale (sezioni nascoste escluse). */
function weightedStories(events, line) {
  return buildStories(events)
    .map((s) => ({ ...s, weight: s.weight * (line.sectionWeights[s.source] ?? 1) }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

const cleanQuote = (s) => String(s).trim().replace(/^[«"“']+|[»"”']+$/g, '').trim();

/** Il Punto di prima pagina e la vignetta: battuta e disegno, scelti insieme. */
async function writeSummary(articles, total, ctx, stats) {
  const { llm, config, hourLabel, log, line, hour } = ctx;
  let summary = null;
  let caption = null;
  let scene = null;
  if (llm && articles.some((a) => a.writer !== 'tipografia')) {
    try {
      const j = parseJson(await chat(llm, config, summaryPrompt(articles, total, hourLabel, line), 1800));
      if (typeof j.summary === 'string' && j.summary.trim()) summary = j.summary.trim();
      if (typeof j.cartoon === 'string' && j.cartoon.trim()) caption = cleanQuote(j.cartoon).slice(0, 160);
      scene = validScene(j.scene);
      if (j.scene && !scene) log(`[redazione] vignetta: scena «${j.scene}» non in catalogo, decide la tipografia`);
    } catch (e) {
      log(`[redazione] punto di prima pagina: ${e.message}`);
    }
  }
  // senza battuta del redattore, disegno e battuta li sceglie la tipografia (coerenti tra loro)
  if (!caption) scene = null;
  scene ||= autoScene(articles, stats, { hour });
  return {
    summary: summary || fallbackSummary(articles, total),
    cartoon: { caption: caption || sceneCaption(scene, `${articles[0]?.id}${stats?.total || 0}`), scene, by: caption ? 'redattore' : 'tipografia' },
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
      log(`[redazione] commento di borsa: ${e.message}`);
    }
  }
  return fallbackMarketComment(market);
}

export const cleanEvents = (events, config) =>
  // le visite al giornale stesso non sono notizie (ripulisce anche gli eventi raccolti prima)
  events.filter((e) => !(e.source === 'safari' && isSelfUrl(e.url, config.port)));

/**
 * Stampa l'edizione dell'ora che comincia in `start`.
 * Le ore precedenti troppo tranquille (sotto `minEvents`) confluiscono in questa, fino a
 * `maxMergeHours` ore in tutto. Ritorna null se non c'è (ancora) abbastanza da raccontare;
 * con `force` stampa comunque (pulsante «Stampa ora»).
 */
export async function printEdition({ store, config, start, final = true, force = false, log = console.log }) {
  const hour = start;
  const end = hour + HOUR;
  const id = editionId(hour);
  const maxMerge = Math.max(1, config.edition.maxMergeHours || 1);
  const existing = store.getEdition(id);
  let windowStart = hour;
  if (existing?.start) {
    windowStart = existing.start; // ristampa: stessa copertura di prima
  } else {
    // si riparte dalla fine dell'edizione precedente, ma al massimo `maxMerge` ore indietro
    const prevEnd = store.lastEditionEnd(end, id);
    const earliest = hour - (maxMerge - 1) * HOUR;
    windowStart = Math.min(hour, prevEnd != null && prevEnd > earliest ? prevEnd : earliest);
  }
  const events = cleanEvents(store.eventsBetween(windowStart, end), config);
  if (!events.length) return null;
  // la copertura parte dalla prima ora con segnali (niente «dalle 01:00» se prima era tutto vuoto)
  if (!existing) windowStart = Math.max(windowStart, hourStart(events[0].ts));
  const hoursCovered = Math.round((end - windowStart) / HOUR);
  if (!force && !existing && events.length < (config.edition.minEvents || 0) && hoursCovered < maxMerge) {
    log(`[redazione] ${id}: solo ${events.length} segnali, confluiscono nella prossima edizione`);
    return null;
  }

  const line = getLine(store);
  const stories = weightedStories(events, line);
  const max = config.edition.maxArticles;
  const main = stories.slice(0, max);
  const rest = stories.slice(max);
  // le storie che continuano: puntate precedenti negli ultimi 7 giorni
  const series = findSeries(store, main, { before: windowStart, excludeId: id });
  for (const s of main) s.series = seriesInfo(series.get(s.id));
  const hourLabel = windowStart < hour ? `${hhmm(windowStart)}–${hhmm(end)}` : hhmm(hour);

  const llm = await connectLLM(config);
  const ctx = { llm, config, hourLabel, log, line, store, hour: windowStart };
  log(`[redazione] edizione ${id}${windowStart < hour ? ` (dalle ${hhmm(windowStart)})` : ''}: ${events.length} eventi, ${stories.length} storie, redattore ${llm ? llm.model : 'offline → tipografia'}, tono ${line.tone}`);

  const articles = await mapLimit(main, llm ? config.llm.concurrency : 8, (s, i) => writeArticle(s, i, ctx));
  const briefs = rest.map((s) => ({ section: s.section, slug: SECTIONS[s.source].slug, ts: s.last, text: fallbackBrief(s) }));

  // Foto: in parallelo con il Punto e la Borsa
  const photosJob = line.photos && !config.demo
    ? mapLimit(main.slice(0, PHOTO_SLOTS), 3, async (s, i) => {
      try { articles[i].image = await illustrate(s, { store, config }); } catch { /* niente foto */ }
    })
    : Promise.resolve();

  const market = computeMarket(store, hour, { port: config.port });
  const stats = computeStats(events, windowStart, end);
  const prevLetters = existing?.letters || [];
  const [{ summary, cartoon }, comment, newLetters] = await Promise.all([
    writeSummary(articles, events.length, ctx, stats),
    writeMarketComment(market, ctx),
    // ristampa: restano le lettere già uscite; altrimenti si risponde a quelle in attesa
    prevLetters.length || !llm ? Promise.resolve(prevLetters) : lettersForEdition(store, config, id, log),
    photosJob,
  ]);
  if (market) market.comment = comment;

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
    writer: llm ? llm.model : 'tipografia',
    tone: line.tone,
    summary,
    cartoon,
    articles,
    spiked: [],
    briefs,
    market,
    letters: newLetters,
    stats,
    sections: SECTION_ORDER.filter((s) => events.some((e) => e.source === s)).map((s) => SECTIONS[s]),
  };
  // una bozza già pubblicata resta pubblicata quando viene ristampata
  const prev = store.editionMeta(edition.id);
  if (prev?.status === 'published') edition.status = 'published';
  store.saveEdition(edition);
  return edition;
}

// ───────────────────────── Il tavolo della redazione ─────────────────────────

export class DeskError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function load(store, id) {
  const ed = store.getEdition(id);
  if (!ed) throw new DeskError('Edizione non trovata', 404);
  ed.spiked ||= [];
  return ed;
}

function findArticle(ed, aid) {
  const i = ed.articles.findIndex((a) => a.id === aid);
  if (i < 0) throw new DeskError('Articolo non trovato', 404);
  return i;
}

function touch(store, ed) {
  ed.edited = true;
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
  a.writer = a.writer?.endsWith('+ direttore') ? a.writer : `${a.writer || 'tipografia'} + direttore`;
  return touch(store, ed);
}

/** Il direttore cambia il disegno o la battuta della vignetta. */
export function editCartoon(store, id, patch = {}) {
  const ed = load(store, id);
  ed.cartoon = applyCartoon(ed.cartoon, patch);
  return touch(store, ed);
}

export function applyCartoon(cartoon, patch) {
  const next = { ...(cartoon || { caption: '', scene: 'desk' }) };
  if (patch.scene != null) {
    const scene = validScene(patch.scene);
    if (!scene) throw new DeskError('Disegno non in catalogo', 400);
    next.scene = scene;
  }
  if (typeof patch.caption === 'string') {
    const c = cleanQuote(patch.caption).slice(0, 160);
    if (!c) throw new DeskError('La vignetta ha bisogno di una battuta', 400);
    next.caption = c;
  }
  next.by = 'direttore';
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
  if (i < 0) throw new DeskError('Articolo non trovato nel cestino', 404);
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
  if (!llm) throw new DeskError('Il redattore non risponde: impossibile riscrivere ora.', 503);
  return { llm, config, hourLabel: hhmm(ed.hour ?? ed.start), log, line: getLine(store), store };
}

export async function rewriteArticle(store, config, id, aid, instruction, log = console.log) {
  const ed = load(store, id);
  const i = findArticle(ed, aid);
  const prev = ed.articles[i];
  const ctx = await ctxFor(store, config, ed, log);
  const story = buildStories(cleanEvents(store.eventsBetween(ed.start, ed.end), config)).find((s) => s.id === aid);
  if (!story) throw new DeskError('Non trovo più i fatti di questo articolo.', 409);
  const size = sizeOf(story, i, ctx.line);
  story.series = prev.series || null;
  const raw = await chat(ctx.llm, config, rewritePrompt(story, factSheet(story) + seriesFacts(story.series, Date.now()), ctx.hourLabel, size, ctx.line, prev, instruction), maxTokensFor(size));
  let text;
  try {
    text = fromLLM(parseJson(raw), story, ctx.llm.model);
  } catch (e) {
    throw new DeskError(`Il redattore ha risposto male: ${e.message}`, 502);
  }
  // l'edizione potrebbe essere cambiata nel frattempo
  const fresh = load(store, id);
  const k = findArticle(fresh, aid);
  fresh.articles[k] = { ...fresh.articles[k], ...text, rewrittenWith: instruction || null };
  return touch(store, fresh);
}

export async function rewriteSummary(store, config, id, log = console.log) {
  const ed = load(store, id);
  const llm = await connectLLM(config);
  const ctx = { llm, config, hourLabel: hhmm(ed.start), log, line: getLine(store), store, hour: ed.start };
  const { summary, cartoon } = await writeSummary(ed.articles, ed.stats.total, ctx, ed.stats);
  ed.summary = summary;
  ed.cartoon = cartoon;
  return touch(store, ed);
}

export async function reprintEdition(store, config, id, log = console.log) {
  const ed = load(store, id);
  return printEdition({ store, config, start: ed.hour ?? ed.start, final: ed.final, force: true, log });
}
