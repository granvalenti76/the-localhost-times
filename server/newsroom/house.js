/**
 * The settings, away from the desk: the staff's record cards, the wires (where the news comes
 * from), and a trial run of a writer's new character on a real piece.
 */
import { tr } from '../i18n.js';
import { getLine, TRAITS } from './line.js';
import { staff, writerFor, DEFAULT_DESKS } from './writers.js';
import { bylines, recordOf, lessonsOf } from './people.js';
import { articlePrompt } from './prompts.js';
import { factSheet } from './cluster.js';
import { sizeFor, DeskError, dayLabel } from './edition.js';
import { seriesFacts } from './series.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { cadenceOf } from './cadence.js';
import { hhmm } from '../util.js';

const DAY = 24 * 3600e3;

// ───────────────────────── The staff ─────────────────────────

/** The staff's record cards: who they are, their character, beats, lessons and numbers. */
export function staffView(store) {
  const line = getLine(store);
  const people = staff(line);
  const all = bylines(store);
  const month = bylines(store, Date.now() - 30 * DAY);
  const desks = { ...DEFAULT_DESKS, ...(line.desks || {}) };
  const list = Object.values(people).map((w) => {
    const r = recordOf(store, w.id, all);
    const s = { ...r.stats, month: month[w.id] || { pieces: 0, loose: 0 } };
    s.checked = s.month.pieces ? Math.round(100 * (1 - s.month.loose / s.month.pieces)) : null;
    return {
      ...w,
      traits: Object.fromEntries(TRAITS.map((k) => [k, w.traits?.[k] ?? 2])),
      beats: Object.entries(desks).filter(([, v]) => v === w.id).map(([k]) => k),
      stats: s,
      lessons: lessonsOf(store, w.id),
    };
  });
  return { staff: list };
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
