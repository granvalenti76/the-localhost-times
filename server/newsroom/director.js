/**
 * The Editor's career: copies earned on the desk (the paper's points), a rank that grows with them,
 * the day's missions and the run of days with at least one piece passed for press. All local, all
 * in one setting. Some copies are earned on the server (a pass, a note, a ♥, a story rescued from
 * the meeting), some in the proof round on the page (a mark found, a hint, a fix): those come with
 * a reference, and each reference pays once.
 */
import { tr, L } from '../i18n.js';
import { dayKey } from '../util.js';

const KEY = 'director';
const DAY = 24 * 3600e3;
const KEEP_DAYS = 21;

/** What each move is worth. */
export const AWARDS = {
  found: 10,     // a proofreader's mark found with the red pencil
  hint: -5,      // a mark shown by a hint
  fixed: 5,      // a mark fixed
  clean: 30,     // every mark of a draft found and fixed
  visto: 20,     // a piece passed for press
  headline: 5,   // an alternative headline chosen
  heart: 10,     // a paragraph marked as good or bad
  note: 10,      // a piece sent back with a note
  rescue: 10,    // a story left out by the meeting brought into the paper
  early: 40,     // every draft on the desk passed before the closing
};

/** Moves the page may report (the others happen on the server). */
export const PAGE_AWARDS = ['found', 'hint', 'fixed', 'clean', 'headline'];

const RANKS = {
  en: ['Cub reporter', 'Reporter', 'Sub-editor', 'Section editor', 'Night editor', 'Managing editor', 'Deputy editor', 'Editor', 'Editor of record', 'Legend of the press'],
  it: ['Praticante', 'Cronista', 'Redattore', 'Caposervizio', 'Capo della notte', 'Caporedattore', 'Vicedirettore', 'Direttore', 'Direttore storico', 'Leggenda della carta stampata'],
};
const STEPS = [0, 100, 250, 500, 850, 1300, 1900, 2700, 3700, 5000];

/** The missions a day can draw: four a day, the same all day. */
const MISSIONS = [
  { id: 'rescue', reason: 'rescue', n: 1, copies: 15, en: 'Bring a story left out by the meeting into the paper', it: 'Ripesca una notizia scartata dalla riunione' },
  { id: 'clean', reason: 'clean', n: 1, copies: 30, en: 'Find every mark of the proofreader in a draft', it: 'Trova tutti i segni del correttore in una bozza' },
  { id: 'early', reason: 'early', n: 1, copies: 40, en: 'Pass every draft before the closing', it: 'Passa tutte le bozze prima della chiusura' },
  { id: 'heart', reason: 'heart', n: 1, copies: 10, en: 'Mark a paragraph you liked', it: 'Dai un ♥ a un paragrafo' },
  { id: 'note', reason: 'note', n: 1, copies: 10, en: 'Send a piece back with a note', it: 'Rimanda un pezzo con un biglietto' },
  { id: 'headline', reason: 'headline', n: 1, copies: 10, en: 'Pick another headline for a piece', it: 'Scegli un titolo diverso per un pezzo' },
  { id: 'three', reason: 'visto', n: 3, copies: 20, en: 'Pass three drafts for press', it: 'Dai il visto a tre bozze' },
  { id: 'sharp', reason: 'found', n: 5, copies: 20, en: 'Find five marks with the red pencil', it: 'Trova cinque segni con la matita rossa' },
];

const seedOf = (day) => [...day].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** The day's four missions (drawn from the date: the same all day, different tomorrow). */
export function missionsOf(day) {
  const pool = [...MISSIONS];
  let h = seedOf(day);
  const out = [];
  while (out.length < 4) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

const empty = () => ({ copies: 0, log: [], best: 0 });

export function getDirector(store) {
  return { ...empty(), ...store.getSetting(KEY, {}) };
}

/** The rank for a number of copies: its name, and how far to the next one. */
export function rankOf(copies) {
  let i = 0;
  while (i + 1 < STEPS.length && copies >= STEPS[i + 1]) i++;
  const next = STEPS[i + 1] ?? null;
  return { level: i + 1, title: L(RANKS)[i], from: STEPS[i], next, toNext: next == null ? 0 : next - copies };
}

/** Consecutive days, up to today (or yesterday, if today has none yet), with a piece passed for press. */
export function streakOf(log, now = Date.now()) {
  const days = new Set(log.filter((x) => x.reason === 'visto').map((x) => x.day));
  let d = days.has(dayKey(now)) ? now : now - DAY;
  let n = 0;
  while (days.has(dayKey(d))) { n++; d -= DAY; }
  return n;
}

/**
 * Copies for a move. `ref` makes it pay once (a mark, a piece). Returns what was gained (with any
 * mission completed by it), or null if this reference was already paid.
 */
export function award(store, reason, ref = null, now = Date.now()) {
  if (!(reason in AWARDS)) return null;
  const d = getDirector(store);
  const day = dayKey(now);
  if (ref && d.log.some((x) => x.reason === reason && x.ref === ref)) return null;
  const before = missionsState(d.log, day);
  let gained = AWARDS[reason];
  d.log.push({ at: now, day, reason, ref, n: gained });
  // a mission completed by this move pays its prize too
  const done = missionsState(d.log, day).filter((m) => m.done && !before.find((b) => b.id === m.id)?.done);
  for (const m of done) {
    d.log.push({ at: now, day, reason: 'mission', ref: `${day}:${m.id}`, n: m.copies });
    gained += m.copies;
  }
  d.copies = Math.max(0, d.copies + gained);
  d.best = Math.max(d.best || 0, streakOf(d.log, now));
  d.log = d.log.filter((x) => now - x.at < KEEP_DAYS * DAY);
  store.setSetting(KEY, d);
  return { reason, gained, copies: d.copies, missions: done.map((m) => m.id) };
}

function missionsState(log, day) {
  const today = log.filter((x) => x.day === day);
  return missionsOf(day).map((m) => {
    const n = today.filter((x) => x.reason === m.reason).length;
    return { id: m.id, text: tr({ en: m.en, it: m.it }), copies: m.copies, n: Math.min(n, m.n), of: m.n, done: n >= m.n };
  });
}

/** The Editor's card, as the desk shows it. */
export function directorView(store, now = Date.now()) {
  const d = getDirector(store);
  const day = dayKey(now);
  const today = d.log.filter((x) => x.day === day);
  return {
    copies: d.copies,
    rank: rankOf(d.copies),
    today: today.reduce((t, x) => t + x.n, 0),
    missions: missionsState(d.log, day),
    streak: streakOf(d.log, now),
    best: Math.max(d.best || 0, streakOf(d.log, now)),
    // the last fourteen days: did a piece pass for press?
    week: Array.from({ length: 14 }, (_, i) => d.log.some((x) => x.reason === 'visto' && x.day === dayKey(now - (13 - i) * DAY))),
    recent: d.log.slice(-6).reverse(),
  };
}
