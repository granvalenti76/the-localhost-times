/**
 * The Publishing House: what the Editor decides about the paper, away from the desk. The staff's
 * record cards, the wires (where the news comes from) and the style manual, the writers'
 * instructions layer by layer, with a trial run of the Editor's own version on a real piece.
 */
import { tr } from '../i18n.js';
import { getLine, saveLine, TRAITS } from './line.js';
import { staff, writerFor, DEFAULT_DESKS, HIRE_KINDS, hireDefaults, rosterIds, firedIds, isHire } from './writers.js';
import { bylines, recordOf, lessonsOf, ABILITIES, can, forgetLevels } from './people.js';
import { getDirector, rankOf } from './director.js';
import { say } from './chatter.js';
import { systemLayers, articlePrompt } from './prompts.js';
import { buildStories, factSheet } from './cluster.js';
import { cleanEvents, sizeFor, DeskError, dayLabel, isTypeset } from './edition.js';
import { seriesFacts } from './series.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { cadenceOf } from './cadence.js';
import { hhmm } from '../util.js';

const DAY = 24 * 3600e3;

// ───────────────────────── The staff ─────────────────────────

const MEDALS = [
  { id: 'hundred', en: 'A hundred pieces', it: 'Cento pezzi', need: (s) => [s.pieces, 100] },
  { id: 'leads', en: 'Ten leads', it: 'Dieci aperture', need: (s) => [s.leads, 10] },
  { id: 'liked', en: 'The Editor\'s favourite paragraph', it: 'Il paragrafo preferito', need: (s) => [s.liked, 1] },
  { id: 'clean', en: 'A month without a figure out of place', it: 'Un mese senza numeri fuori posto', need: (s) => [s.month.pieces >= 20 && !s.month.loose ? 1 : 0, 1] },
];

/** Who the Editor can hire, from which rank, and how many people the newsroom can hold. */
export const HIRE_RANKS = { intern: 2, cartoonist: 4, correspondent: 5 };
const MAX_STAFF = 9;
const PROMOTE_LEVEL = 3;

/** The staff's record cards: who they are, their character, mood, lessons, beats, numbers, abilities. */
export function staffView(store) {
  const line = getLine(store);
  const people = staff(line, { all: true });
  const all = bylines(store);
  const month = bylines(store, Date.now() - 30 * DAY);
  const desks = { ...DEFAULT_DESKS, ...(line.desks || {}) };
  const rank = rankOf(getDirector(store).copies).level;
  const onStaff = rosterIds(line);
  const list = Object.values(people).map((w) => {
    const r = recordOf(store, w.id, all);
    const s = { ...r.stats, month: month[w.id] || { pieces: 0, loose: 0 } };
    s.checked = s.month.pieces ? Math.round(100 * (1 - s.month.loose / s.month.pieces)) : null;
    return {
      ...w,
      fired: !onStaff.includes(w.id),
      traits: Object.fromEntries(TRAITS.map((k) => [k, w.traits?.[k] ?? 2])),
      beats: Object.entries(desks).filter(([, v]) => v === w.id).map(([k]) => k),
      stats: s,
      level: r.level,
      progress: r.progress,
      mood: w.mood || 'fine',
      lessons: lessonsOf(store, w.id),
      abilities: ABILITIES.map((x) => ({ id: x.id, name: tr({ en: x.en[0], it: x.it[0] }), what: tr({ en: x.en[1], it: x.it[1] }), level: x.level, have: r.level >= x.level })),
      promotable: w.kind === 'intern' && r.level >= PROMOTE_LEVEL,
      medals: MEDALS.map((m) => { const [have, need] = m.need(s); return { id: m.id, name: tr({ en: m.en, it: m.it }), have: Math.min(have, need), need, won: have >= need }; }),
    };
  });
  const hires = HIRE_KINDS.map((kind) => ({
    kind, ...hireDefaults(kind), rank: HIRE_RANKS[kind],
    open: rank >= HIRE_RANKS[kind] && !list.some((w) => w.kind === kind && !w.fired) && onStaff.length < MAX_STAFF,
    taken: list.some((w) => w.kind === kind && !w.fired),
  }));
  return { staff: list, hires, rank, full: onStaff.length >= MAX_STAFF, promoteLevel: PROMOTE_LEVEL };
}

const who = (line, id) => staff(line, { all: true })[id] || null;

/** A new person in the newsroom: an intern to train, a cartoonist, a special correspondent. */
export function hire(store, { kind, name = '', role = '', beat = '' } = {}) {
  const v = staffView(store);
  const h = v.hires.find((x) => x.kind === kind);
  if (!h) throw new DeskError(tr({ en: 'Nobody to hire for that.', it: 'Nessuno da assumere per questo.' }), 400);
  if (!h.open) throw new DeskError(h.taken ? tr({ en: 'That job is already taken.', it: 'Quel posto è già occupato.' }) : v.full ? tr({ en: 'The newsroom is full: let someone go first.', it: 'La redazione è piena: prima lascia andare qualcuno.' }) : tr({ en: `You need to reach level ${h.rank}.`, it: `Devi arrivare al livello ${h.rank}.` }), 409);
  const id = `h-${kind}-${Date.now().toString(36)}`;
  const w = { kind, hiredAt: Date.now(), name: String(name || h.name).trim().slice(0, 60), role: String(role || h.role).trim().slice(0, 60) };
  // the intern starts on a section of their own (taken from whoever had it)
  saveLine(store, { staff: { [id]: w }, ...(beat && kind !== 'cartoonist' ? { desks: { [beat]: id } } : {}) });
  say(store, id, tr({ en: `${w.name}, ${w.role}: first day in the newsroom. Where do I sit?`, it: `${w.name}, ${w.role}: primo giorno in redazione. Dove mi siedo?` }));
  forgetLevels();
  return id;
}

/** Someone leaves the newsroom; their sections go to `heir` (or are unsigned). A founding writer can be taken back. */
export function fire(store, id, heir = '') {
  const line = getLine(store);
  const w = who(line, id);
  if (!w || !rosterIds(line).includes(id)) throw new DeskError(tr({ en: 'Not on the staff.', it: 'Non è in redazione.' }), 404);
  if (rosterIds(line).length <= 1) throw new DeskError(tr({ en: 'Somebody has to write the paper.', it: 'Qualcuno deve pur scrivere il giornale.' }), 409);
  const to = heir && heir !== id && rosterIds(line).includes(heir) ? heir : '';
  const desks = Object.fromEntries(Object.entries({ ...DEFAULT_DESKS, ...line.desks }).filter(([, v]) => v === id).map(([k]) => [k, to]));
  saveLine(store, { desks, staff: { [id]: isHire(id) ? null : { fired: true } } });
  say(store, 'desk', tr({ en: `${w.name} has cleared their desk.`, it: `${w.name} ha svuotato la scrivania.` }));
  forgetLevels();
}

/** A founding writer taken back. */
export function rehire(store, id) {
  const line = getLine(store);
  if (!firedIds(line).includes(id)) throw new DeskError(tr({ en: 'Not someone you let go.', it: 'Non è qualcuno che hai lasciato andare.' }), 404);
  if (rosterIds(line).length >= MAX_STAFF) throw new DeskError(tr({ en: 'The newsroom is full: let someone go first.', it: 'La redazione è piena: prima lascia andare qualcuno.' }), 409);
  const cur = { ...(line.staff[id] || {}) };
  delete cur.fired;
  const s = store.getSetting('line', {});
  s.staff = { ...(s.staff || {}), [id]: cur };
  store.setSetting('line', s);
  const w = who(getLine(store), id);
  say(store, id, tr({ en: `${w.name}: I'm back. Same desk?`, it: `${w.name}: sono tornato. Stessa scrivania?` }));
  forgetLevels();
}

/** The intern, trained, becomes a writer of the paper. */
export function promote(store, id, role = '') {
  const v = staffView(store);
  const w = v.staff.find((x) => x.id === id);
  if (!w || w.kind !== 'intern') throw new DeskError(tr({ en: 'Only the intern can be promoted.', it: 'Si può promuovere solo lo stagista.' }), 400);
  if (!w.promotable) throw new DeskError(tr({ en: `Not ready yet: level ${v.promoteLevel} first.`, it: `Non è ancora pronto: prima il livello ${v.promoteLevel}.` }), 409);
  const s = store.getSetting('line', {});
  // the same person, now a reporter: the id stays (the record goes with them), the kind changes
  s.staff = { ...(s.staff || {}), [id]: { ...(s.staff?.[id] || {}), kind: 'reporter', role: String(role || tr({ en: 'reporter', it: 'cronista' })).slice(0, 60) } };
  store.setSetting('line', s);
  say(store, id, tr({ en: `${w.name}: they've made me a reporter. Drinks are on me.`, it: `${w.name}: mi hanno fatto cronista. Offro io.` }));
  forgetLevels();
}

// ───────────────────────── The wires ─────────────────────────

/** Signals per source, day by day, over the last week (today last). */
export function wiresView(store, config, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const from = d.getTime() - 6 * DAY;
  const rows = store.db.prepare(`SELECT source, CAST((ts - ?) / ? AS INTEGER) AS d, COUNT(*) AS n FROM events WHERE ts >= ? GROUP BY source, d`).all(from, DAY, from);
  const week = {};
  for (const r of rows) {
    week[r.source] ||= Array(7).fill(0);
    if (r.d >= 0 && r.d < 7) week[r.source][r.d] = Number(r.n);
  }
  return { week, collecting: { ...config.sources } };
}

// ───────────────────────── The style manual ─────────────────────────

const LAYERS = {
  en: {
    how: ['How to write', 'The house\'s rules of thumb'],
    facts: ['The rules about facts', 'Locked: they come before everything'],
    voice: ['The house voice', 'With the Editor\'s notes'],
    headlines: ['How headlines are made', ''],
    persona: ['The byline and the character', 'Changes with each writer'],
    taste: ['The Editor\'s taste', 'From your ♥ and ✕'],
    examples: ['Example pieces', ''],
    reply: ['The reply format', 'Locked: the program reads it'],
  },
  it: {
    how: ['Come si scrive', 'Le regole pratiche della casa'],
    facts: ['Le regole sui fatti', 'Bloccate: vengono prima di tutto'],
    voice: ['La voce della casa', 'Con le note del Direttore'],
    headlines: ['Come si fanno i titoli', ''],
    persona: ['La firma e il carattere', 'Cambia per ogni redattore'],
    taste: ['Il gusto del Direttore', 'Dai tuoi ♥ e ✕'],
    examples: ['Gli esempi di pezzi', ''],
    reply: ['Il formato della risposta', 'Bloccato: lo legge il programma'],
  },
};

const tokens = (s) => Math.round(String(s || '').length / 4);

/** The writers' instructions layer by layer, for one writer (or the staff in general). */
export function manualView(store, writerId = null) {
  const line = getLine(store);
  const people = staff(line);
  const writer = (writerId && people[writerId]) || people.local || Object.values(people)[0];
  const names = tr(LAYERS);
  const layers = systemLayers(line, writer).map((x) => ({
    id: x.id,
    title: names[x.id][0],
    sub: names[x.id][1],
    locked: !!x.locked,
    auto: !!x.auto,
    own: x.own || null,
    base: x.base ?? null,
    text: x.text.trim(),
    tokens: tokens(x.text),
  }));
  return { writer: { id: writer.id, name: writer.name }, layers, total: layers.reduce((t, x) => t + x.tokens, 0), notes: line.notes || '' };
}

/** The piece a trial is run on: the lead of the latest edition written by a writer (not the typesetting). */
function trialPiece(store, config, line, wanted = null) {
  const recent = store.db.prepare(`SELECT id FROM editions ORDER BY start_ts DESC LIMIT 30`).all();
  for (const { id } of recent) {
    const ed = store.getEdition(id);
    for (const a of ed?.articles || []) {
      if (isTypeset(a.writer) || a.kind === 'commissioned') continue;
      if (wanted && writerFor(line, a.source)?.id !== wanted) continue;
      const story = buildStories(cleanEvents(store.eventsBetween(ed.start, ed.end), config, line)).find((s) => s.id === a.id);
      if (story) return { ed, a, story };
    }
  }
  return null;
}

/**
 * A trial run: a recent piece written again with the Editor's draft of the manual (`manual`) or of
 * a writer's character (`writer`: { id, traits, deviation }), nothing saved. The printed piece is
 * the "before".
 */
export async function trialRun(store, config, { manual = null, writer = null } = {}, log = () => {}) {
  const llm = await connectLLM(config);
  if (!llm) throw new DeskError(tr({ en: 'The writer is not answering: no trial now.', it: 'Il redattore non risponde: niente prova, per ora.' }), 503);
  const base = getLine(store);
  const line = {
    ...base,
    manual: { ...base.manual, ...(manual || {}) },
    staff: writer?.id ? { ...base.staff, [writer.id]: { ...(base.staff[writer.id] || {}), ...writer } } : base.staff,
  };
  const found = trialPiece(store, config, line, writer?.id || null);
  if (!found) throw new DeskError(tr({ en: 'No recent piece to try it on.', it: 'Non trovo un pezzo recente su cui provare.' }), 404);
  const { ed, a, story } = found;
  story.series = a.series || null;
  const w = writerFor(line, story.source);
  const rank = Math.max(0, ed.articles.indexOf(a));
  const size = sizeFor(story, rank, line);
  const facts = factSheet(story) + seriesFacts(story.series, Date.now());
  const label = cadenceOf(line).kind !== 'hourly' ? dayLabel(ed.end - 1) : hhmm(ed.hour ?? ed.start);
  const raw = await chat(llm, config, articlePrompt(story, facts, label, size, line, w), 2600);
  let j;
  try { j = parseJson(raw); } catch (e) { throw new DeskError(tr({ en: `The writer gave a bad answer: ${e.message}`, it: `Il redattore ha risposto male: ${e.message}` }), 502); }
  log(tr({ en: `[house] trial on “${a.headline}”`, it: `[casa editrice] prova su «${a.headline}»` }));
  const pick = (x) => ({ headline: String(x.headline || ''), dek: String(x.dek || ''), body: (x.body || []).map(String) });
  return { editionId: ed.id, articleId: a.id, writer: w ? { id: w.id, name: w.name } : null, before: pick(a), after: pick(j) };
}
