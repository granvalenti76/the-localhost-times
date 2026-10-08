/**
 * Continuing stories: a topic that already appeared in recent editions (same site,
 * same conversation, same note, same book…) becomes a serialised story.
 */
import { hhmm, dayKey } from '../util.js';
import { tr, locale } from '../i18n.js';

const DAY = 24 * 3600e3;
// topics too generic to make a series of
const NOT_SERIAL = new Set(['roundup', 'searches', 'inbox', 'session', 'webmail', 'folders', 'downloads']);

/** Previous instalments of stories, looked up in the editions of the last `days` days. */
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
    previous: previous.slice(-4).reverse(), // most recent first
  };
}

const when = (ms, now) => {
  const d = dayKey(ms);
  const at = tr({ en: 'at', it: 'alle' });
  if (d === dayKey(now)) return `${tr({ en: 'today', it: 'oggi' })} ${at} ${hhmm(ms)}`;
  if (d === dayKey(now - DAY)) return `${tr({ en: 'yesterday', it: 'ieri' })} ${at} ${hhmm(ms)}`;
  return `${new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(ms)} ${at} ${hhmm(ms)}`;
};

/** Lines to add to the facts for the writer. */
export function seriesFacts(series, now) {
  if (!series) return '';
  const en = tr({ en: true, it: false });
  const lines = series.previous.map((p) => `- ${when(p.hour, now)}: ${en ? `“${p.headline}”` : `«${p.headline}»`}${p.dek ? ` — ${p.dek}` : ''}`);
  return en
    ? `\nCONTINUING STORY: this is instalment no. ${series.episode}${series.days > 1 ? `, over ${series.days} different days` : ''}. Previous instalments:\n${lines.join('\n')}`
    : `\nSTORIA CHE CONTINUA: è la ${series.episode}ª puntata${series.days > 1 ? `, in ${series.days} giorni diversi` : ''}. Puntate precedenti:\n${lines.join('\n')}`;
}
