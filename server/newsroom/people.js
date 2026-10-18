/**
 * The staff as people: they have a mood, they learn, they grow. All of it comes from what the
 * Editor does: a ♥ or a pass cheers a writer up, a cut or a piece sent back puts them out; the
 * corrections of the proof round become lessons in their instructions; signed pieces, leads,
 * passes and ♥ make their level, and the level unlocks what they can do.
 */
import { tr } from '../i18n.js';
import { WRITER_IDS, isHire } from './writers.js';
import { getTaste } from './bench.js';
import { say } from './chatter.js';

const MOODS = 'moods';
const LESSONS = 'lessons';
const CAREER = 'career';
const DAY = 24 * 3600e3;
const MAX_LESSONS = 8;

// ───────────────────────── Mood ─────────────────────────

/** What a move does to a writer's mood. */
export const MOOD_MOVES = { like: 2, visto: 1, keep: 1, dislike: -1, note: -1, cut: -2, kill: -2 };

/** A mood from the last day's moves: inspired, fine, low, offended. */
export function moodOf(log, id, now = Date.now()) {
  const score = log.filter((x) => x.w === id && now - x.at < DAY).reduce((t, x) => t + x.d, 0);
  return score >= 3 ? 'inspired' : score <= -3 ? 'offended' : score <= -1 ? 'low' : 'fine';
}

const MOOD_LINES = {
  inspired: { en: (n) => `${n}: the Editor liked my work. I'm on a roll today.`, it: (n) => `${n}: al Direttore è piaciuto il mio lavoro. Oggi sono in vena.` },
  offended: { en: (n) => `${n}: another cut. Fine. I'll write short and dry, since that's what's wanted.`, it: (n) => `${n}: un altro taglio. Va bene. Scriverò corto e asciutto, visto che si vuole così.` },
  low: { en: (n) => `${n}: not my best day.`, it: (n) => `${n}: non è la mia giornata.` },
};

/** Something the Editor did to a writer's piece (`w`: the writer, { id, name }): the mood moves, and the writer may say so. */
export function nudge(store, w, move, now = Date.now()) {
  const d = MOOD_MOVES[move];
  if (!w?.id || !d) return null;
  try {
    const log = store.getSetting(MOODS, []).filter((x) => now - x.at < 3 * DAY);
    const before = moodOf(log, w.id, now);
    log.push({ w: w.id, d, m: move, at: now });
    store.setSetting(MOODS, log);
    bump(store, w.id, move);
    const after = moodOf(log, w.id, now);
    if (after !== before && MOOD_LINES[after] && w.name) say(store, w.id, tr(MOOD_LINES[after])(w.name), now);
    return after;
  } catch { return null; } // a mood never stops the desk
}

// ───────────────────────── Career ─────────────────────────

function bump(store, id, move) {
  const c = store.getSetting(CAREER, {});
  c[id] = { visti: 0, notes: 0, ...(c[id] || {}) };
  if (move === 'visto') c[id].visti++;
  if (move === 'note') c[id].notes++;
  store.setSetting(CAREER, c);
}

const STEPS = [0, 10, 30, 60, 100, 160, 240, 350, 500, 700];

/** Pieces each writer signed, how many opened the paper, how many had a figure out of place. */
export function bylines(store, since = 0) {
  try {
    return store.db.prepare(`SELECT json_extract(a.value, '$.byline.id') AS w, COUNT(*) AS n, SUM(CASE WHEN CAST(a.key AS INTEGER) = 0 THEN 1 ELSE 0 END) AS lead,
        SUM(CASE WHEN json_array_length(json_extract(a.value, '$.check.unverified')) > 0 THEN 1 ELSE 0 END) AS loose
      FROM editions e, json_each(e.payload, '$.articles') a WHERE e.start_ts >= ? GROUP BY w`).all(since)
      .reduce((m, r) => ({ ...m, [r.w || 'newsroom']: { pieces: Number(r.n), leads: Number(r.lead || 0), loose: Number(r.loose || 0) } }), {});
  } catch {
    return {};
  }
}

/** A writer's record: what the archive and the Editor's hand say. */
export function recordOf(store, id, all = null) {
  const b = (all || bylines(store))[id] || {};
  const t = getTaste(store).stats?.[id] || {};
  const c = store.getSetting(CAREER, {})[id] || {};
  const s = {
    pieces: b.pieces || 0, leads: b.leads || 0,
    liked: t.liked || 0, disliked: t.disliked || 0, kept: t.kept || 0, cut: t.cut || 0,
    visti: c.visti || 0, lessons: lessonsOf(store, id).length,
  };
  const points = s.pieces + 3 * s.leads + 5 * s.liked - 2 * s.disliked + s.kept - s.cut + 2 * s.visti + s.lessons;
  let level = 0;
  while (level + 1 < STEPS.length && points >= STEPS[level + 1]) level++;
  const next = STEPS[level + 1] ?? null;
  return { stats: s, level: level + 1, progress: next == null ? 1 : Math.max(0, (points - STEPS[level]) / (next - STEPS[level])) };
}

let cache = null; // the levels, recomputed at most once a minute (they read the whole archive)
function levels(store, now = Date.now()) {
  if (cache?.store === store && now - cache.at < 60e3) return cache.levels;
  const all = bylines(store);
  const ids = new Set([...WRITER_IDS, ...Object.keys(store.getSetting('line', {}).staff || {}).filter(isHire)]);
  cache = { store, at: now, levels: Object.fromEntries([...ids].map((id) => [id, recordOf(store, id, all).level])) };
  return cache.levels;
}
export const forgetLevels = () => { cache = null; };

/** What a level lets a writer do. */
export const ABILITIES = [
  { id: 'long-lead', level: 3, en: ['The long lead', 'When they open the paper, the piece gets more room'], it: ['L\'apertura lunga', 'Quando aprono il giornale, il pezzo ha più spazio'] },
  { id: 'nose', level: 5, en: ['A nose for stories', 'They propose a long read on their beat, on the desk'], it: ['Il fiuto', 'Propongono un approfondimento sul loro settore, alla scrivania'] },
  { id: 'trusted', level: 7, en: ['Trusted byline', 'The managing editor reads only their lead pieces'], it: ['Firma di fiducia', 'Il caporedattore legge solo le loro aperture'] },
];
// Every writer can do everything: the paper is always written at its best, whatever the record.
export const can = () => true;

// ───────────────────────── Lessons ─────────────────────────

export const lessonsOf = (store, id) => (store.getSetting(LESSONS, {})[id] || []);

/** A correction of the proof round, as a lesson for the writer who made the mistake. */
export function lessonFromMark(kind, word) {
  const w = String(word || '').trim().slice(0, 40);
  const q = (x) => tr({ en: `“${x}”`, it: `«${x}»` });
  switch (kind) {
    case 'inflated': return { key: `inflated:${w.toLowerCase()}`, text: tr({ en: `Don't write ${q(w)}: the Editor cuts it.`, it: `Non scrivere ${q(w)}: il Direttore lo taglia.` }) };
    case 'figure': return { key: 'figure', text: tr({ en: 'Use only the figures that are in the facts: the Editor checks every one.', it: 'Usa solo i numeri che sono nei fatti: il Direttore li controlla tutti.' }) };
    case 'interval': return { key: 'interval', text: tr({ en: `Don't work out intervals (${q(w)}): write the time as it is.`, it: `Non calcolare intervalli (${q(w)}): scrivi l'orario così com'è.` }) };
    case 'slop': return { key: `slop:${w.toLowerCase().slice(0, 24)}`, text: tr({ en: `Never phrasing like ${q(w)}: it reads like a machine.`, it: `Mai frasi come ${q(w)}: sanno di macchina.` }) };
    case 'dashboard': return { key: 'dashboard', text: tr({ en: `No dashboard words like ${q(w)}: tell what the person did.`, it: `Niente parole da cruscotto come ${q(w)}: racconta cosa ha fatto la persona.` }) };
    default: return null;
  }
}

/** A lesson for a writer (from a correction, or taught by the Editor in their own words). Newest first, no repeats. */
export function addLesson(store, id, lesson, now = Date.now()) {
  if (!id || !lesson?.text) return null;
  const all = store.getSetting(LESSONS, {});
  const key = lesson.key || `own:${lesson.text.toLowerCase().slice(0, 40)}`;
  const list = (all[id] || []).filter((x) => x.key !== key);
  const fresh = !(all[id] || []).some((x) => x.key === key);
  all[id] = [{ key, text: String(lesson.text).slice(0, 240), at: now, own: !lesson.key }, ...list].slice(0, MAX_LESSONS);
  store.setSetting(LESSONS, all);
  return fresh;
}

export function removeLesson(store, id, key) {
  const all = store.getSetting(LESSONS, {});
  all[id] = (all[id] || []).filter((x) => x.key !== key);
  store.setSetting(LESSONS, all);
  return all[id];
}

/** What the line carries about each writer at print time: mood, lessons, level. */
export function peopleOf(store, now = Date.now()) {
  const log = store.getSetting(MOODS, []);
  const lessons = store.getSetting(LESSONS, {});
  const lv = levels(store, now);
  const ids = new Set([...Object.keys(lv), ...Object.keys(lessons)]);
  return Object.fromEntries([...ids].map((id) => [id, { mood: moodOf(log, id, now), lessons: (lessons[id] || []).map((x) => x.text), level: lv[id] || 1 }]));
}
