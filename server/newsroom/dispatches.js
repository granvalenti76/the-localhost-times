/**
 * The Editor's dispatches: a fact the Mac can't record, written by the Editor as a trace for the
 * newsroom. It is a signal like the others (an event, source 'editor'), only structured: the
 * section it belongs to, optionally the story in the works it adds to, a subject, the note, when it
 * happened, how the paper may attribute it, and how much room it deserves. The section's writer
 * makes a piece of it (cluster.js), at the next drafting round or at once.
 */
import { tr } from '../i18n.js';
import { hash } from '../util.js';
import { DeskError } from './edition.js';
import { SECTION_ORDER, SECTIONS } from './sections.js';

export const SOURCE = 'editor';
export const ATTRIBUTIONS = ['fact', 'editor', 'source'];
export const SIZES = ['brief', 'article', 'lead'];

/** A new dispatch from the Editor: stored as a signal, picked up by the next edition. */
export function addDispatch(store, { section, storyId = null, title, text, at = null, attribution = 'fact', size = 'article' } = {}, now = Date.now()) {
  const sec = SECTION_ORDER.includes(section) ? section : null;
  if (!sec) throw new DeskError(tr({ en: 'Choose the section.', it: 'Scegli la sezione.' }), 400);
  const subject = String(title || '').trim().slice(0, 140);
  const note = String(text || '').trim().slice(0, 3000);
  if (!subject) throw new DeskError(tr({ en: 'Give it a subject.', it: 'Dagli un argomento.' }), 400);
  if (note.length < 10) throw new DeskError(tr({ en: 'Write the note: what happened, in a few lines.', it: 'Scrivi l\'appunto: cosa è successo, in poche righe.' }), 400);
  // when it happened: in the past, never in the future, at most a week ago
  const ts = Math.min(now, Math.max(now - 7 * 24 * 3600e3, Number(at) || now));
  const id = `editor:${hash(`${now}:${subject}`)}`;
  store.insertEvents([{
    id,
    source: SOURCE,
    kind: 'dispatch',
    ts,
    title: subject,
    detail: note,
    url: null,
    meta: {
      section: sec,
      storyId: storyId ? String(storyId).slice(0, 160) : null,
      attribution: ATTRIBUTIONS.includes(attribution) ? attribution : 'fact',
      size: SIZES.includes(size) ? size : 'article',
      writtenAt: now,
    },
  }]);
  return id;
}

/** Where a dispatch is: waiting, being written, on the page (and in which edition). */
function statusOf(store, e, bench) {
  const row = store.db.prepare(`SELECT id FROM editions WHERE end_ts >= ? AND payload LIKE ? ORDER BY start_ts LIMIT 1`).get(e.ts, `%${e.id}%`);
  if (row) return { status: 'printed', editionId: row.id };
  const piece = (bench?.pieces || []).find((p) => (p.text?.dispatches || p.dispatches || []).includes(e.id) || p.id === storyIdOf(e));
  if (piece) return { status: piece.status === 'writing' ? 'writing' : 'drafted', storyId: piece.id };
  return { status: 'waiting' };
}

/** The story a standalone dispatch becomes. */
export const storyIdOf = (e) => `${e.meta.section}:dispatch:${e.id.split(':')[1]}`;

/** The Editor's dispatches of the last month, newest first, with where each one is. */
export function dispatches(store, bench = null, now = Date.now()) {
  return store.db.prepare(`SELECT * FROM events WHERE source = ? AND ts >= ? ORDER BY ts DESC LIMIT 60`).all(SOURCE, now - 30 * 24 * 3600e3)
    .map((r) => ({ ...r, meta: JSON.parse(r.meta || '{}') }))
    .map((e) => ({
      id: e.id, ts: e.ts, title: e.title, text: e.detail, ...e.meta, tiedTo: e.meta.storyId || null,
      sectionName: SECTIONS[e.meta.section]?.name || e.meta.section,
      ...statusOf(store, e, bench),
    }));
}

/** A dispatch withdrawn before it reached the page. */
export function withdrawDispatch(store, id) {
  const e = store.db.prepare(`SELECT * FROM events WHERE id = ? AND source = ?`).get(String(id), SOURCE);
  if (!e) throw new DeskError(tr({ en: 'Dispatch not found.', it: 'Traccia non trovata.' }), 404);
  const printed = store.db.prepare(`SELECT id FROM editions WHERE end_ts >= ? AND payload LIKE ? LIMIT 1`).get(e.ts, `%${e.id}%`);
  if (printed) throw new DeskError(tr({ en: 'It is already on the page: it can no longer be withdrawn.', it: 'È già in pagina: non si può più ritirare.' }), 409);
  store.deleteEvent(e.id);
}
