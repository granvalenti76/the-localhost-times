/**
 * Le storie che continuano: un tema già comparso nelle edizioni recenti (stesso sito,
 * stessa conversazione, stessa nota, stesso libro…) diventa una serie a puntate.
 */
import { hhmm, dayKey } from '../util.js';

const DAY = 24 * 3600e3;
// temi troppo generici per farne una serie
const NOT_SERIAL = new Set(['roundup', 'searches', 'inbox', 'session', 'webmail']);

/** Puntate precedenti delle storie, cercate nelle edizioni degli ultimi `days` giorni. */
export function findSeries(store, stories, { before, excludeId, days = 7 } = {}) {
  const wanted = new Set(stories.filter((s) => !NOT_SERIAL.has(s.kind)).map((s) => s.id));
  if (!wanted.size) return new Map();
  const rows = store.db
    .prepare(`SELECT id, payload FROM editions WHERE start_ts >= ? AND start_ts < ? AND id != ? ORDER BY start_ts`)
    .all(before - days * DAY, before, excludeId || '');
  const out = new Map();
  for (const r of rows) {
    const ed = JSON.parse(r.payload);
    for (const a of ed.articles || []) {
      if (!wanted.has(a.id)) continue;
      if (!out.has(a.id)) out.set(a.id, []);
      out.get(a.id).push({ editionId: ed.id, hour: ed.hour ?? ed.start, headline: a.headline, dek: a.dek || '' });
    }
  }
  return out;
}

export function seriesInfo(previous) {
  if (!previous?.length) return null;
  const days = new Set(previous.map((p) => dayKey(p.hour)));
  return {
    episode: previous.length + 1,
    days: days.size,
    since: previous[0].hour,
    previous: previous.slice(-4).reverse(), // le più recenti prima
  };
}

const when = (ms, now) => {
  const d = dayKey(ms);
  if (d === dayKey(now)) return `oggi alle ${hhmm(ms)}`;
  if (d === dayKey(now - DAY)) return `ieri alle ${hhmm(ms)}`;
  return `${new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(ms)} alle ${hhmm(ms)}`;
};

/** Righe da aggiungere ai fatti per il redattore. */
export function seriesFacts(series, now) {
  if (!series) return '';
  const lines = series.previous.map((p) => `- ${when(p.hour, now)}: «${p.headline}»${p.dek ? ` — ${p.dek}` : ''}`);
  return `\nSTORIA CHE CONTINUA: è la ${series.episode}ª puntata${series.days > 1 ? `, in ${series.days} giorni diversi` : ''}. Puntate precedenti:\n${lines.join('\n')}`;
}
