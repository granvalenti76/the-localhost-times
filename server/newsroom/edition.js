import { buildStories, factSheet, crossFacts } from './cluster.js';
import { subjectPast } from './subjects.js';
import { yearAgo } from './review.js';
import { deskChain, chainFor, phrasingDesk, triageFlags, rulesDesk } from './chain.js';
import { SECTIONS, SECTION_ORDER } from './sections.js';
import { fallbackArticle, fallbackBrief, fallbackSummary } from './fallback.js';
import { autoScene, validScene, sceneCaption } from './scenes.js';
import { factCheck, numbersCheck } from './factcheck.js';
import { getSteer, applySteer, steerLine, clearSteer, carrySteer } from './next.js';
import { getWorkbench, carryWorkbench } from './workbench.js';
import { writerFor, columnist, cartoonist, byline } from './writers.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { articlePrompt, rewritePrompt, expandPrompt, ownWordsPrompt, summaryPrompt, marketPrompt, sizeOf, widen, wordCount } from './prompts.js';
import { copiedFromExamples } from './voice.js';
import { getLine } from './line.js';
import { computeMarket, fallbackMarketComment } from './market.js';
import { illustrate } from './photos.js';
import { findSeries, seriesInfo, seriesFacts } from './series.js';
import { lettersForEdition } from './letters.js';
import { pendingScoop } from './spotlight/desk.js';
import { computeTime, computeMac, isAmbient } from './time.js';
import { tipsForEdition, tipFolders, isTipNote } from './tips.js';
import { metrics, checkRecords, recordFact } from './records.js';
import { featureOn } from './line.js';
import { lint, similes } from './lint.js';
import { say } from './chatter.js';
import { editionId, hhmm, mapLimit, isSelfUrl, hourStart } from '../util.js';
import { cadenceOf, spanHours, maxArticlesFor } from './cadence.js';
import { liveStart, liveEnd, liveHooks, factLines } from './live.js';
import { can } from './people.js';
import { tr, lang } from '../i18n.js';

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

export const sameText = (a, b) => a.headline === b.headline && (a.dek || '') === (b.dek || '') && a.body.join('\n') === b.body.join('\n');

/**
 * The Editor's hand on a printed piece: the text before it is kept as the draft (if none was), and
 * the step joins the piece's passages, so the desk shows who changed what.
 */
export function byHand(a, step) {
  if (!a.draft) a.draft = { headline: a.headline, dek: a.dek || '', body: [...a.body] };
  a.chain = [...(a.chain || []), { who: 'chief', at: Date.now(), ...step }];
  a.writer = /\+ (editor|direttore)$/.test(a.writer || '') ? a.writer : `${a.writer || 'typesetting'} + editor`;
}

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
 * Local models tend to write well under the length they are asked for. A piece under 60% of its
 * minimum goes back to the writer once, to use what the facts still hold; the longer version is
 * kept only if valid. Never a note: when the facts run out, the piece ends.
 */
async function ensureLength(text, msgs, story, size, ctx) {
  if (size.id === 'brief' || wordCount(text) >= size.min * 0.6) return text;
  try {
    const raw = await ctx.chat(ctx.llm, ctx.config, expandPrompt(msgs, text, size), maxTokensFor(size), { onText: ctx.onText });
    const longer = fromLLM(parseJson(raw), story, ctx.llm.model);
    if (wordCount(longer) > wordCount(text)) return { ...longer, expanded: true };
  } catch (e) {
    ctx.log(tr({ en: `[newsroom] ${story.id}: could not expand the draft (${e.message})`, it: `[redazione] ${story.id}: non sono riuscito ad allungare la bozza (${e.message})` }));
  }
  return text;
}

/** A draft that copied the style guide's examples goes back once; the new one is kept if it copies less. */
async function ensureOwnWords(text, msgs, story, size, ctx) {
  const copied = copiedFromExamples(text);
  if (!copied.length) return text;
  try {
    const raw = await ctx.chat(ctx.llm, ctx.config, ownWordsPrompt(msgs, text, copied), maxTokensFor(size), { onText: ctx.onText });
    const own = fromLLM(parseJson(raw), story, ctx.llm.model);
    if (copiedFromExamples(own).length < copied.length) return { ...own, expanded: text.expanded };
  } catch (e) {
    ctx.log(tr({ en: `[newsroom] ${story.id}: could not rewrite the copied draft (${e.message})`, it: `[redazione] ${story.id}: non sono riuscito a far riscrivere la bozza copiata (${e.message})` }));
  }
  return text;
}

/** The format of a piece: its place on the page, the line, a lead from the Editor that gives it room. */
export const sizeFor = (story, rank, line) => {
  const w = writerFor(line, story.source);
  // a writer with "the long lead" gets more room when they open the paper
  return widen(sizeOf(story, rank, line, w), (story.leads?.length || 0) + (rank === 0 && can(w, 'long-lead') ? 1 : 0));
};
const factsOf = (story) => factSheet(story) + seriesFacts(story.series, Date.now()) + (story.extra || '');

/**
 * A piece written and read by the desk: the reporter's draft (or a new version of `prev` following
 * `instruction`), then the rules, the managing editor when needed, the copy desk and the phrasing
 * desk. Used at the press and, during the hour, for the drafts of the next edition. Throws when
 * the writer fails.
 */
export async function composeText(story, rank, ctx, { prev = null, instruction = '', byEditor = false } = {}) {
  const { llm, config, hourLabel, line } = ctx;
  const writer = writerFor(line, story.source); // the byline of the section
  const size = sizeFor(story, rank, line);
  const facts = factsOf(story);
  const msgs = prev ? rewritePrompt(story, facts, hourLabel, size, line, prev, instruction, writer) : articlePrompt(story, facts, hourLabel, size, line, writer);
  const progress = ctx.progress || (() => {});
  progress('reporter');
  const raw = await chat(llm, config, msgs, maxTokensFor(size), { onText: ctx.onText });
  let text = fromLLM(parseJson(raw), story, llm.model);
  // a new version (a note, new facts) keeps the length it is given: padding it would undo a cut
  if (!prev) text = await ensureLength(text, msgs, story, size, { ...ctx, chat });
  text = await ensureOwnWords(text, msgs, story, size, { ...ctx, chat });
  const first = { headline: text.headline, dek: text.dek, body: [...text.body] };
  // every piece crosses the desk. The managing editor reads the front page and whatever the
  // rules flag; the reporter rewrites if sent back; the copy desk checks the figures
  const flags = triageFlags(text, facts, ctx.similes || []);
  // who reads it: the Editor, for a rewrite they asked for and for everything the intern writes;
  // nobody but the copy desk, for a trusted byline away from the lead; the managing editor otherwise
  const skip = byEditor ? 'chief' : writer?.kind === 'intern' ? 'intern' : rank > 0 && can(writer, 'trusted') ? 'trusted' : null;
  if (skip) {
    text = await rulesDesk(text, facts, { writer, flags });
    const triage = text.chain.find((x) => x.who === 'triage');
    if (triage) triage.why = skip;
  } else if (chainFor(config, rank, flags)) {
    text = await deskChain(text, { facts, msgs, size, ctx, chat, maxTokens: maxTokensFor(size), fromLLM, story, writer, triage: { why: rank < 3 ? 'front' : 'flags', flags } });
  } else if ((config.desk?.chain ?? 'triage') !== 'off') text = await rulesDesk(text, facts, { writer, flags });
  // the phrasing desk: "it's not X, it's Y" and dashboard talk, fixed sentence by sentence
  const phrased = [];
  progress('copy');
  text.body = await phrasingDesk(text.body, { llm, config, chat, report: phrased });
  if (phrased.length && text.chain) {
    const copy = text.chain.findLast((x) => x.who === 'copy');
    if (copy) copy.phrasing = phrased;
  }
  // the first draft is kept whenever the desk changed anything: the Editor can see the stitching
  if (!text.draft && !sameText(first, text)) text.draft = first;
  text.check = numbersCheck(text, facts); // figures the facts don't contain
  text.byline = byline(writer);
  return text;
}

export const UPDATE = () => tr({
  en: 'New facts have come in since this draft: bring it up to date with the ones that matter, keep its shape and what works.',
  it: 'Da questa bozza sono arrivati fatti nuovi: aggiorna il pezzo con quelli che contano, tieni l\'impianto e ciò che funziona.',
});

const KEEP_HAND = () => tr({
  en: 'The Editor has already corrected this version by hand (headline and words): keep those corrections as they are, change only what is asked.',
  it: 'Il direttore ha già corretto a mano questa versione (titolo e parole): tieni quelle correzioni così come sono, cambia solo ciò che è chiesto.',
});

/** An instruction for a new version of a draft the Editor corrected by hand: their corrections stay. */
export function keepHand(piece, instruction) {
  const chain = piece?.chain || [];
  const since = chain.findLastIndex((x) => x.who === 'reporter');
  const corrected = chain.slice(since + 1).some((x) => x.who === 'chief' && (x.kind === 'edit' || x.kind === 'headline'));
  return corrected ? `${instruction} ${KEEP_HAND()}` : instruction;
}

/**
 * A draft of the hour at the press: as it is when the Editor approved it or nothing new came in;
 * otherwise the reporter brings it up to date with the facts that arrived since.
 */
async function fromWorkbench(story, rank, ctx, piece) {
  const kept = { ...piece.text, chain: piece.chain, draft: piece.draft || undefined };
  const approved = piece.status === 'approved';
  if (approved || story.events.length <= (piece.signals || 0)) {
    return { ...kept, chain: [...(piece.chain || []), { who: 'press', kind: approved ? 'approved' : 'as-is' }], check: numbersCheck(kept, factsOf(story)) };
  }
  const text = await composeText(story, rank, ctx, { prev: piece.text, instruction: keepHand(piece, UPDATE()) });
  return {
    ...text,
    chain: [...(piece.chain || []), { who: 'update', signals: [piece.signals || 0, story.events.length] }, ...(text.chain || [])],
    draft: piece.draft || { headline: piece.text.headline, dek: piece.text.dek || '', body: [...piece.text.body] },
  };
}

async function writeArticle(story, rank, ctx) {
  const { llm, log, line } = ctx;
  let text = null;
  const size = sizeFor(story, rank, line);
  const piece = ctx.workbench?.pieces?.[story.id];
  if (llm) {
    // the writing room shows the pieces written at the press too
    const writer = writerFor(line, story.source);
    const facts = factLines(factSheet(story));
    liveStart(story.id, { editionId: ctx.editionId, writer: writer ? { id: writer.id, name: writer.name, role: writer.role } : null, topic: story.topic, section: story.section, facts: facts.lines, known: facts.known, size, press: true });
    try {
      const live = liveHooks(story.id);
      text = piece?.text ? await fromWorkbench(story, rank, { ...ctx, ...live }, piece) : await composeText(story, rank, { ...ctx, ...live });
    } catch (e) {
      log(tr({ en: `[newsroom] ${story.id}: the writer failed (${e.message}), automatic typesetting takes over`, it: `[redazione] ${story.id}: il redattore ha fallito (${e.message}), passa la tipografia` }));
    } finally {
      liveEnd(story.id);
    }
  }
  text ||= fallbackArticle(story);
  text.lint = lint(text.body, { seen: ctx.similes || [] });
  // what this piece compared things to: the next pieces of the edition look for another image
  ctx.similes?.push(...similes(text.body));
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
    leads: story.leads?.length ? story.leads : undefined,
    record: story.records?.length ? story.records : undefined,
    tipped: story.tipped || undefined,
    dispatches: story.dispatches?.length ? story.dispatches.map((e) => e.id) : undefined,
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

/** How much a section counts: its weight in the line, nothing if its wire is switched off. */
export const sectionWeight = (line, source) => (line?.wires?.[source] === 'off' ? 0 : line?.sectionWeights?.[source] ?? 1);

/** The hour's stories, weighted by the editorial line (hidden sections excluded). */
export function weightedStories(events, line) {
  return buildStories(events)
    // the Editor's own dispatches always reach the meeting, whatever the section's weight
    .map((s) => ({ ...s, weight: s.kind === 'dispatch' ? s.weight : s.weight * sectionWeight(line, s.source) }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/** Browsing that makes a page, not a piece: a few visits in a few minutes. */
const BROWSING = new Set(['site', 'searches', 'roundup']);
/** Below this share of the lead's weight a story is a brief, never a piece. */
const TAIL = 0.3;

/**
 * Is a story worth a piece? Not a handful of visits over a few minutes ("a minute on a streaming
 * site"), and not far below the lead. The Editor's choices and own dispatches always are.
 */
export function newsworthy(s, top, cad) {
  if (s.boosted || s.kind === 'dispatch') return true;
  const minutes = ((s.last ?? 0) - (s.first ?? 0)) / 60e3;
  if (BROWSING.has(s.kind) && s.events.length < 8 && minutes < (cad.kind === 'hourly' ? 5 : 10)) return false;
  return s.weight >= Math.max(2, top * TAIL);
}

/** The stories that make pieces (at most `max`, the lead always among them) and the briefs. */
export function pickNews(stories, max, cad) {
  const top = stories[0]?.weight || 0;
  const main = [];
  const rest = [];
  for (const [i, s] of stories.entries()) (main.length < max && (i === 0 || newsworthy(s, top, cad)) ? main : rest).push(s);
  return { main, rest };
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
      const j = parseJson(await chat(llm, config, summaryPrompt(articles, total, hourLabel, line, columnist(line), cartoonist(line)), 1800));
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
    cartoon: { caption: caption || sceneCaption(scene, `${articles[0]?.id}${stats?.total || 0}`), scene, by: caption ? 'writer' : 'typesetting', signed: caption && cartoonist(line) ? cartoonist(line).name : undefined },
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

// what a wire set to "titles" keeps out of the newsroom: the contents, never the titles
const CONTENTS = ['summary', 'snippet', 'text', 'note', 'excerpt'];
const titlesOnly = (e) => ({ ...e, detail: null, meta: Object.fromEntries(Object.entries(e.meta || {}).filter(([k]) => !CONTENTS.includes(k))) });

export const cleanEvents = (events, config, line = null) => {
  // visits to the paper itself are not news (also cleans up events collected earlier),
  // and neither are the notes left in the tip box
  const folders = tipFolders(config);
  const wires = line?.wires || {};
  return events.filter((e) => !(e.source === 'safari' && isSelfUrl(e.url, config.port)) && !isTipNote(e, folders) && wires[e.source] !== 'off')
    .map((e) => (wires[e.source] === 'titles' ? titlesOnly(e) : e));
};

/** "Wednesday 14 October": how a daily or weekly paper names its edition. */
export const dayLabel = (ms) => new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(ms);

/**
 * The time window an edition covers: from the end of the previous edition (quiet hours merge in),
 * at most `maxMergeHours` back; a reprint keeps the coverage it had.
 */
export function editionWindow(store, config, hour) {
  const end = hour + HOUR;
  const id = editionId(hour);
  // an hourly paper reaches back over its quiet hours; a daily or weekly one over its day or week
  const maxMerge = spanHours(cadenceOf(getLine(store)), config);
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
  const base = getLine(store);
  const cad = cadenceOf(base);
  const events = cleanEvents(store.eventsBetween(windowStart, end), config, base);
  const news = events.filter((e) => !isAmbient(e));
  if (!news.length && !(force && events.length)) return null;
  // coverage starts from the first hour with signals (no "since 01:00" if everything before was empty)
  if (!existing && news.length) windowStart = Math.max(windowStart, hourStart(news[0].ts));
  const hoursCovered = Math.round((end - windowStart) / HOUR);
  if (cad.kind === 'hourly' && !force && !existing && news.length < (config.edition.minEvents || 0) && hoursCovered < maxMerge) {
    log(tr({ en: `[newsroom] ${id}: only ${news.length} signals, merged into the next edition`, it: `[redazione] ${id}: solo ${news.length} segnali, confluiscono nella prossima edizione` }));
    carrySteer(store, id, editionId(hour + HOUR)); // the editor's steering follows the news
    carryWorkbench(store, id, editionId(hour + HOUR)); // and so do the drafts
    return null;
  }

  // the editor's steering for this edition: lead with, leave out, one-off instructions
  const steer = getSteer(store, id);
  const line = steerLine(base, steer);
  const stories = applySteer(weightedStories(events, line), steer);
  const max = maxArticlesFor(cad, config, line.strictness);
  const { main, rest } = pickNews(stories, max, cad);
  // continuing stories: previous instalments in the last 7 days
  const series = findSeries(store, main, { before: windowStart, excludeId: id });
  for (const s of main) s.series = seriesInfo(series.get(s.id));
  const hourLabel = cad.kind !== 'hourly' ? dayLabel(end - 1) : windowStart < hour ? `${hhmm(windowStart)}–${hhmm(end)}` : hhmm(hour);

  // what the Editor and the paper add to the facts: tips, records
  const stats = computeStats(news, windowStart, end);
  const time = computeTime(events, windowStart, end);
  // an hourly edition that merged quiet hours can't be compared with a single hour; a day is a day
  const single = cad.kind !== 'hourly' || windowStart === hour;
  const records = safely(() => checkRecords(store, metrics({ news, stats, time, cadence: cad.kind }), { editionId: id, at: hour, single }), [], log);
  const tipped = featureOn(line, 'tips') ? safely(() => tipsForEdition(store, main, { end, editionId: id }), { facts: new Map(), box: [] }, log) : { facts: new Map(), box: [] };
  const metricList = records.length ? metrics({ news, stats, time, cadence: cad.kind }) : [];
  for (const s of main) {
    s.records = records.filter((r) => metricList.find((m) => m.key === r.key)?.story(s));
    s.tipped = tipped.facts.has(s.id);
    s.extra = (tipped.facts.get(s.id) || '') + s.records.map(recordFact).join('') + safely(() => crossFacts(s, events), '', log)
      + (s.kind === 'subject' ? safely(() => subjectPast(store, s, { before: windowStart, lang: lang() }), '', log) : '');
  }

  const llm = await connectLLM(config);
  // the drafts written during the hour, read by the desk and by the Editor
  const ctx = { llm, config, hourLabel, log, line, store, hour: windowStart, editionId: id, workbench: getWorkbench(store, id), similes: [] };
  log(tr({
    en: `[newsroom] edition ${id}${windowStart < hour ? ` (since ${hhmm(windowStart)})` : ''}: ${news.length} events, ${stories.length} stories, writer ${llm ? llm.model : 'offline → automatic typesetting'}`,
    it: `[redazione] edizione ${id}${windowStart < hour ? ` (dalle ${hhmm(windowStart)})` : ''}: ${news.length} eventi, ${stories.length} storie, redattore ${llm ? llm.model : 'offline → tipografia'}`,
  }));

  const articles = await mapLimit(main, llm ? config.llm.concurrency : 8, (s, i) => writeArticle(s, i, ctx));
  const written = articles.slice(); // the photos follow the stories, whatever comes in front of them
  const briefs = rest.map((s) => ({ section: s.section, slug: SECTIONS[s.source].slug, ts: s.last, text: fallbackBrief(s) }));

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

  if (records.length) say(store, 'sport', tr({ en: `Record! ${records[0].label}: ${records[0].value}.`, it: `Primato! ${records[0].label}: ${records[0].value}.` }));

  const edition = {
    id,
    start: windowStart,
    hour,
    end,
    final,
    cadence: cad.kind,
    status: line.autoPublish ? 'published' : 'draft',
    edited: false,
    number: existing?.number ?? store.editionNumber(windowStart),
    createdAt: Date.now(),
    writer: llm ? llm.model : 'typesetting',
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
    records: records.length ? records : undefined,
    yearAgo: safely(() => yearAgo(store, end - 1), null, log) || undefined,
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
  const before = { headline: a.headline, dek: a.dek || '', body: [...a.body] };
  const next = {
    headline: typeof patch.headline === 'string' ? cleanHeadline(patch.headline) : a.headline,
    dek: typeof patch.dek === 'string' ? patch.dek.trim() : a.dek || '',
    body: Array.isArray(patch.body) ? patch.body.map((p) => String(p).trim()).filter(Boolean) : a.body,
  };
  if (!sameText(before, next)) byHand(a, { kind: before.body.join('\n') === next.body.join('\n') && before.dek === next.dek ? 'headline' : 'edit' });
  else a.writer = /\+ (editor|direttore)$/.test(a.writer || '') ? a.writer : `${a.writer || 'typesetting'} + editor`;
  Object.assign(a, next);
  if (typeof patch.kicker === 'string') a.kicker = patch.kicker.trim().slice(0, 40);
  if (patch.removeImage) a.image = null;
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
  const line = getLine(store);
  return { llm, config, hourLabel: ed.cadence && ed.cadence !== 'hourly' ? dayLabel(ed.end - 1) : hhmm(ed.hour ?? ed.start), log, line, store };
}

/**
 * The article written again from its facts, with the editor's instruction. `extra` adds facts (the
 * Editor's statements and leads), `leads` widens the format as at print.
 */
export async function rewriteArticle(store, config, id, aid, instruction, log = console.log, { extra = '', leads = 0 } = {}) {
  const ed = load(store, id);
  const i = findArticle(ed, aid);
  const prev = ed.articles[i];
  const ctx = await ctxFor(store, config, ed, log);
  if (prev.kind === 'commissioned') throw new DeskError(tr({ en: 'A commissioned piece is rewritten from its own page (Newsroom → New article).', it: 'Un pezzo su commissione si riscrive dalla sua pagina (Redazione → Nuovo articolo).' }), 409);
  const story = buildStories(cleanEvents(store.eventsBetween(ed.start, ed.end), config, ctx.line)).find((s) => s.id === aid);
  if (!story) throw new DeskError(tr({ en: 'The facts behind this article are no longer available.', it: 'Non trovo più i fatti di questo articolo.' }), 409);
  story.series = prev.series || null;
  const writer = writerFor(ctx.line, story.source);
  const size = widen(sizeOf(story, i, ctx.line, writer), leads);
  const facts = factSheet(story) + seriesFacts(story.series, Date.now()) + extra;
  const msgs = rewritePrompt(story, facts, ctx.hourLabel, size, ctx.line, prev, instruction, writer);
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
  text.check = numbersCheck(text, facts);
  text.byline = byline(writer);
  const cur = fresh.articles[k];
  byHand(cur, { kind: 'rewrite', instruction: instruction || null });
  fresh.articles[k] = { ...cur, ...text, chain: cur.chain, draft: cur.draft, size: size.id, rewrittenWith: instruction || null };
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
