/**
 * The next edition in the works. During the hour, at the drafting rounds (by default at :20 and
 * :40), the reporters draft the strongest stories forming so far, and every draft crosses the desk
 * (the rules, the managing editor when needed, the copy desk). The Editor finds them on the desk
 * and can approve one ("passed for press"), send it back with a note, retouch it, or leave it out.
 * At the next round a draft whose story has grown is brought up to date; at the press the approved
 * drafts are printed as they are, the others updated if new facts came in (edition.js).
 */
import { tr } from '../i18n.js';
import { hhmm } from '../util.js';
import { connectLLM } from './llm.js';
import { composeText, UPDATE, DeskError, cleanHeadline, sameText, sizeFor, dayLabel, keepHand } from './edition.js';
import { cadenceOf, nextPress, workHour, draftTimes, maxArticlesFor, lastPress } from './cadence.js';
import { getLine } from './line.js';
import { liveStart, liveEnd, liveHooks, factLines } from './live.js';
import { marksFor } from './marks.js';
import { nudge } from './people.js';
import { chiefReacts } from './chief.js';
import { formingStories } from './next.js';
import { getSteer, applySteer, steerLine, label, steer as steerEdition, nextEditionId, preview } from './next.js';
import { SECTIONS } from './sections.js';
import { writerFor } from './writers.js';
import { numbersCheck } from './factcheck.js';
import { factSheet } from './cluster.js';
import { say } from './chatter.js';

const HOUR = 3600e3;
const KEY = 'workbench';
const STALE = 15 * 60e3; // a piece "being written" for longer than this was lost (a restart, a crash)

const empty = (id) => ({ editionId: id, pieces: {}, rounds: [], running: null });

/** The drafts of an edition (empty if what is saved was meant for another edition). */
export function getWorkbench(store, id) {
  const w = store.getSetting(KEY, null);
  return w && w.editionId === id ? { ...empty(id), ...w } : empty(id);
}

const saveWorkbench = (store, w) => { store.setSetting(KEY, w); return w; };

/** A quiet hour merged into the next one: its drafts move with it. */
export function carryWorkbench(store, fromId, toId) {
  const w = store.getSetting(KEY, null);
  if (w?.editionId === fromId) store.setSetting(KEY, { ...w, editionId: toId, rounds: [] });
}

/** Read, change and save one piece: the Editor may act while a round is writing. */
function updatePiece(store, id, sid, fn) {
  const w = getWorkbench(store, id);
  const next = fn(w.pieces[sid] || null);
  if (next) w.pieces[sid] = next; else delete w.pieces[sid];
  saveWorkbench(store, w);
  return next;
}

/** The minutes of the hour when an hourly paper's reporters draft; how many stories they take. */
export const roundsOf = (config) => (config.desk?.rounds ?? [20, 40]).filter((m) => m > 0 && m < 60).sort((a, b) => a - b);
/** A daily or weekly paper drafts all of its pieces (it has the time); an hourly one its strongest. */
const draftTop = (config, cad = { kind: 'hourly' }, line = null) => (cad.kind === 'hourly' ? Math.max(1, config.desk?.draftTop ?? 5) : maxArticlesFor(cad, config, line?.strictness));

/** A story worth drafting again: a quarter more signals, and at least three. */
const grown = (before, now) => now >= before + Math.max(3, Math.ceil(before * 0.25));

/** The drafting rounds of the edition in the works: a key each, and when it runs. */
export const roundsFor = (config, cad, now = Date.now()) => draftTimes(cad, config, nextPress(cad, now));

/** The rounds due now that haven't run yet (their keys). */
export function dueRounds(config, w, now = Date.now(), cad = { kind: 'hourly' }) {
  return roundsFor(config, cad, now).filter((r) => r.at <= now && !w.rounds.includes(r.key)).map((r) => r.key);
}

/** The forming stories, ranked with the Editor's steering, and what the reporters need to write them. */
function scene(store, config, llm, log, now) {
  const { stories, windowStart, editionId: id, line: base } = formingStories(store, config, now);
  const steer = getSteer(store, id);
  const line = steerLine(base, steer);
  const cad = cadenceOf(base);
  const hour = workHour(cad, now);
  const hourLabel = cad.kind !== 'hourly' ? dayLabel(hour + HOUR - 1) : windowStart < hour ? `${hhmm(windowStart)}–${hhmm(hour + HOUR)}` : hhmm(hour);
  return { id, steer, cad, windowStart, ranked: applySteer(stories, steer), ctx: { llm, config, hourLabel, log, line, store, hour: windowStart } };
}

function meta(s, rank) {
  return { id: s.id, source: s.source, section: SECTIONS[s.source]?.name || s.source, kind: s.kind, topic: label(s), rank, dispatches: s.dispatches?.length ? s.dispatches.map((e) => e.id) : undefined };
}

/** What a draft keeps of a written text: the passages and the first draft apart. */
function keep(text) {
  const { chain, draft, ...rest } = text;
  return { text: rest, chain: chain || [], draft: draft || null };
}

async function write(store, id, s, rank, ctx, { prev = null, instruction = '', steps = [], log, byEditor = false }) {
  const writer = writerFor(ctx.line, s.source);
  updatePiece(store, id, s.id, (p) => ({ ...(p || {}), ...meta(s, rank), status: 'writing', step: 'reporter', since: Date.now() }));
  // the writing room shows the piece as it is typed
  const facts = factLines(factSheet(s));
  liveStart(s.id, { editionId: id, writer: writer ? { id: writer.id, name: writer.name, role: writer.role } : null, topic: label(s), section: SECTIONS[s.source]?.name || s.source, facts: facts.lines, known: facts.known, size: sizeFor(s, rank, ctx.line) });
  const live = liveHooks(s.id);
  // who has the piece in hand right now: the page shows it while the Editor waits
  const progress = (step) => { live.progress(step); updatePiece(store, id, s.id, (p) => (p ? { ...p, step } : p)); };
  try {
    const t = keep(await composeText(s, rank, { ...ctx, progress, onText: live.onText }, prev ? { prev: prev.text, instruction, byEditor } : {}));
    updatePiece(store, id, s.id, (p) => ({
      ...p,
      status: 'ready',
      step: null,
      text: t.text,
      // the version before, and why it changed: the page shows what moved
      prev: prev?.text ? { text: prev.text, why: steps[0] || null } : null,
      chain: [...(prev?.chain || []), ...steps, ...t.chain],
      draft: prev?.draft || t.draft || (prev ? { headline: prev.text.headline, dek: prev.text.dek || '', body: [...prev.text.body] } : null),
      signals: s.events.length,
      version: (prev?.version || 0) + 1,
      at: Date.now(),
      since: null,
    }));
    if (writer?.name) say(store, writer.id, tr({ en: `${writer.name}: draft on ${label(s)} on the desk.`, it: `${writer.name}: bozza su ${label(s)} sul tavolo.` }));
  } catch (e) {
    log(tr({ en: `[drafts] ${s.id}: the writer failed (${e.message})`, it: `[bozze] ${s.id}: il redattore non ce l'ha fatta (${e.message})` }));
    updatePiece(store, id, s.id, (p) => (p?.text ? { ...p, status: p.status === 'writing' ? 'ready' : p.status, since: null } : null));
  } finally {
    liveEnd(s.id);
  }
  // a note the Editor left while the piece was being typed: the reporter takes it now
  const p = getWorkbench(store, id).pieces[s.id];
  if (p?.queuedNote && p.text && p.status === 'ready') {
    const note = p.queuedNote;
    updatePiece(store, id, s.id, (x) => ({ ...x, queuedNote: null }));
    await write(store, id, s, rank, ctx, { prev: getWorkbench(store, id).pieces[s.id], instruction: note, steps: [{ who: 'chief', kind: 'note', instruction: note, at: Date.now() }], log, byEditor: true });
  }
}

/**
 * A drafting round: the strongest stories get a draft, the drafts whose story has grown are brought
 * up to date. Approved pieces and pieces left out are not touched. `force` runs it now (the
 * "Draft now" button); otherwise it runs only when a round is due.
 */
export async function draftRound(store, config, { now = Date.now(), log = console.log, force = false } = {}) {
  const id = nextEditionId(now, store);
  const line = getLine(store);
  const cad = cadenceOf(line);
  const due = dueRounds(config, getWorkbench(store, id), now, cad);
  if (!force && !due.length) return null;
  const llm = await connectLLM(config);
  if (!llm) return null;
  const { ranked, ctx } = scene(store, config, llm, log, now);
  const w = getWorkbench(store, id);
  w.rounds = [...new Set([...w.rounds, ...due])];
  w.running = Date.now();
  saveWorkbench(store, w);
  try {
    const top = ranked.slice(0, draftTop(config, cad, line));
    for (const [rank, s] of top.entries()) {
      const p = getWorkbench(store, id).pieces[s.id];
      if (p && (p.status === 'approved' || p.status === 'writing' || p.status === 'killed')) continue;
      if (p?.text && !grown(p.signals || 0, s.events.length)) continue;
      const steps = p?.text ? [{ who: 'update', signals: [p.signals || 0, s.events.length] }] : [];
      await write(store, id, s, rank, ctx, { prev: p?.text ? p : null, instruction: p?.text ? keepHand(p, UPDATE()) : UPDATE(), steps, log });
    }
  } finally {
    const end = getWorkbench(store, id);
    end.running = null;
    end.lastRound = Date.now();
    saveWorkbench(store, end);
  }
  return getWorkbench(store, id);
}

// ───────────────────────── The Editor's hand ─────────────────────────

function pieceOf(store, sid, now = Date.now()) {
  const id = nextEditionId(now, store);
  const p = getWorkbench(store, id).pieces[sid];
  if (!p?.text) throw new DeskError(tr({ en: 'That draft is not on the desk.', it: 'Questa bozza non è sul tavolo.' }), 404);
  return { id, p };
}

/** "Passed for press": the piece is printed as it is. */
export function approvePiece(store, sid, on = true) {
  const { id, p: piece } = pieceOf(store, sid);
  if (on && piece.status !== 'approved') { nudge(store, writerFor(getLine(store), piece.source), 'visto'); chiefReacts(store, piece, 'pass'); }
  return updatePiece(store, id, sid, (p) => ({
    ...p,
    status: on ? 'approved' : 'ready',
    chain: on ? [...p.chain, { who: 'chief', kind: 'approve', at: Date.now() }] : p.chain.filter((x, i) => !(i === p.chain.length - 1 && x.kind === 'approve')),
  }));
}

/** The Editor's own retouch of a draft. */
export function editPiece(store, sid, patch = {}) {
  const { id, p } = pieceOf(store, sid);
  const next = {
    ...p.text,
    headline: typeof patch.headline === 'string' && patch.headline.trim() ? cleanHeadline(patch.headline) : p.text.headline,
    dek: typeof patch.dek === 'string' ? patch.dek.trim() : p.text.dek || '',
    body: Array.isArray(patch.body) ? patch.body.map((x) => String(x).trim()).filter(Boolean) : p.text.body,
  };
  if (!next.body.length) throw new DeskError(tr({ en: 'A piece needs at least a paragraph.', it: 'Un pezzo ha bisogno di almeno un paragrafo.' }), 400);
  if (sameText(p.text, next)) return p;
  const kind = p.text.body.join('\n') === next.body.join('\n') && (p.text.dek || '') === next.dek ? 'headline' : 'edit';
  return updatePiece(store, id, sid, (x) => ({
    ...x,
    text: next,
    draft: x.draft || { headline: x.text.headline, dek: x.text.dek || '', body: [...x.text.body] },
    chain: [...x.chain, { who: 'chief', kind, at: Date.now() }],
  }));
}

/**
 * Sent back with the Editor's note: the reporter rewrites it, and the new version comes back to the
 * Editor, who reads it (the managing editor doesn't: only the copy desk checks the figures). Marks
 * the piece as being written and returns the job, which the caller queues.
 */
export function sendBack(store, config, sid, note, { log = console.log, now = Date.now() } = {}) {
  const text = String(note || '').trim().slice(0, 600); // room for the managing editor's three notes
  if (!text) throw new DeskError(tr({ en: 'Write the note for the reporter.', it: 'Scriva la nota per il cronista.' }), 400);
  const { id, p } = pieceOf(store, sid, now);
  if (p.status === 'writing') throw new DeskError(tr({ en: 'The reporter is already working on it.', it: 'Il cronista ci sta già lavorando.' }), 409);
  // the Editor already corrected this version by hand: the rewrite starts from it and keeps those corrections
  const instruction = keepHand(p, text);
  nudge(store, writerFor(getLine(store), p.source), 'note');
  chiefReacts(store, p, 'note');
  // in line behind whatever the press is doing (a drafting round, a print): the page says so
  updatePiece(store, id, sid, (x) => ({ ...x, status: 'writing', step: 'queued', since: Date.now() }));
  return async () => {
    const llm = await connectLLM(config);
    if (!llm) {
      updatePiece(store, id, sid, (x) => ({ ...x, status: 'ready', since: null }));
      throw new DeskError(tr({ en: 'The writer is not answering: cannot rewrite now.', it: 'Il redattore non risponde: impossibile riscrivere ora.' }), 503);
    }
    const { ranked, ctx } = scene(store, config, llm, log, Date.now());
    const rank = ranked.findIndex((s) => s.id === sid);
    if (rank < 0) {
      updatePiece(store, id, sid, (x) => ({ ...x, status: 'ready', since: null }));
      throw new DeskError(tr({ en: 'The story is no longer in the next edition.', it: 'La storia non è più nella prossima edizione.' }), 409);
    }
    const prev = getWorkbench(store, id).pieces[sid];
    await write(store, id, ranked[rank], rank, ctx, { prev, instruction, steps: [{ who: 'chief', kind: 'note', instruction: text, at: Date.now() }], log, byEditor: true });
    return getWorkbench(store, id).pieces[sid];
  };
}

/** Left out of the edition (or put back): the steering buries the story, the draft stays aside. */
export function killPiece(store, config, sid, on = true) {
  steerEdition(store, config, { op: on ? 'bury' : 'unbury', story: sid });
  const id = nextEditionId(Date.now(), store);
  const p0 = getWorkbench(store, id).pieces[sid];
  if (on && p0?.text && p0.status !== 'killed') nudge(store, writerFor(getLine(store), p0.source), 'kill');
  return updatePiece(store, id, sid, (p) => (p ? { ...p, status: on ? 'killed' : p.text ? 'ready' : p.status } : p));
}

/**
 * A note for a piece that is being typed right now: the reporter takes it as soon as the piece is
 * done (the writing room's buttons). For a piece on the desk, it is the same as sending it back.
 */
export function queueNote(store, sid, note, now = Date.now()) {
  const text = String(note || '').trim().slice(0, 600);
  if (!text) throw new DeskError(tr({ en: 'Write the note for the reporter.', it: 'Scriva la nota per il cronista.' }), 400);
  const id = nextEditionId(now, store);
  const p = getWorkbench(store, id).pieces[sid];
  if (!p) throw new DeskError(tr({ en: 'That draft is not on the desk.', it: 'Questa bozza non è sul tavolo.' }), 404);
  nudge(store, writerFor(getLine(store), p.source), 'note');
  return updatePiece(store, id, sid, (x) => ({ ...x, queuedNote: [x.queuedNote, text].filter(Boolean).join(' ') }));
}

// ───────────────────────── The view ─────────────────────────

/**
 * The next edition's desk as the page shows it: the hour's schedule, the drafts by state, the
 * stories still without a draft and those left out.
 */
export function workbenchView(store, config, { now = Date.now(), nextPress: press = null } = {}) {
  const { ranked, id, steer, cad, windowStart } = scene(store, config, null, () => {}, now);
  const line = getLine(store);
  const w = getWorkbench(store, id);
  const hour = workHour(cad, now);
  const printsAt = (cad.kind === 'hourly' && press) || nextPress(cad, now) + (cad.kind === 'hourly' ? 30e3 : 0);
  const max = maxArticlesFor(cad, config, line.strictness);
  const minute = new Date(now).getMinutes();
  const rounds = roundsFor(config, cad, now).map((r) => ({ ...r, done: w.rounds.includes(r.key) }));
  const facts = new Map(ranked.map((s) => [s.id, s]));
  const pieces = Object.values(w.pieces).map((p) => {
    const s = facts.get(p.id);
    const lost = p.status === 'writing' && p.since && now - p.since > STALE;
    const status = lost ? (p.text ? 'ready' : 'lost') : p.status;
    const sheet = s ? factSheet(s) : null;
    return {
      ...p,
      status,
      rank: s ? ranked.indexOf(s) + 1 : null,
      signalsNow: s?.events.length ?? p.signals,
      check: p.text && sheet ? numbersCheck(p.text, sheet) : p.text?.check,
      // the proofreader's marks, for the proof round (only on a piece waiting for the Editor)
      marks: p.text && sheet && status === 'ready' ? marksFor(p.text, sheet) : [],
      writer: writerFor(line, p.source) ? (({ id: wid, name, role }) => ({ id: wid, name, role }))(writerFor(line, p.source)) : null,
    };
  }).filter((p) => p.status !== 'lost');
  const drafted = new Set(pieces.map((p) => p.id));
  const buried = new Set(steer.bury);
  const forming = ranked.filter((s) => !drafted.has(s.id)).map((s) => ({
    ...meta(s, ranked.indexOf(s)), rank: ranked.indexOf(s) + 1, signals: s.events.length, inPaper: ranked.indexOf(s) < max, boosted: !!s.boosted,
    writer: writerFor(line, s.source) ? (({ id: wid, name }) => ({ id: wid, name }))(writerFor(line, s.source)) : null,
  }));
  const p = preview(store, config, { now, nextPress: press });
  const sources = Object.keys(p.bySource).filter((k) => p.bySource[k]).length;
  return {
    editionId: id,
    cadence: cad,
    now,
    signals: p.total,
    sources,
    stories: ranked.length,
    maxArticles: max,
    willMerge: p.willMerge ? p.minEvents : null, // too quiet: it would merge into the following edition
    hour,
    windowStart,
    lastPress: lastPress(cad, now),
    printsAt,
    minutesLeft: Math.max(0, Math.round((printsAt - now) / 60e3)),
    minute,
    rounds,
    nextRound: rounds.find((r) => !r.done && r.at > now) || null,
    running: w.running && now - w.running < STALE ? w.running : null,
    lastRound: w.lastRound || null,
    draftTop: draftTop(config, cad, line),
    pieces: pieces.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
    forming,
    buried: [...buried].map((sid) => w.pieces[sid] ? { id: sid, topic: w.pieces[sid].topic, section: w.pieces[sid].section } : { id: sid, topic: sid, section: '' }),
    steer,
  };
}
