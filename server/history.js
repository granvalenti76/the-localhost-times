/**
 * The past, from the first day. The Mac already keeps a year of it: Safari's history, the mail,
 * the shell's history, Books, Podcasts, Notes, Photos, the git reflogs, the calendar. On the first
 * start (or with `npm run history`) the paper reads it once, so there is something to read at once:
 * the editions of the last days, "a year ago today", the year in review, an archive that remembers.
 *
 * What is older than a couple of days is kept lean: one event per page, search, book or message a
 * day (a feed reloaded forty times is one visit), and none of the moments (the app in front, the
 * Mac waking up), which only mean something on the day.
 */
import { tr } from './i18n.js';
import { SOURCES } from './sources/index.js';
import { PermissionError, dayKey } from './util.js';

const DAY = 24 * 3600e3;

// the sources whose past is worth reading: the moments (apps, power) and the files saved stay out
const PAST = new Set(['safari', 'mail', 'terminal', 'notes', 'journal', 'podcasts', 'books', 'photos', 'git', 'calendar', 'reminders']);

/** One event per thing a day, for the old days: the first visit to a page, the first time a book was opened. */
export function thin(events, { before }) {
  const seen = new Set();
  return events.filter((e) => {
    if (e.ts >= before) return true;
    const k = `${e.source}|${e.kind}|${e.url || e.title}|${dayKey(e.ts)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Read the past of every source (the last `days` days) into the archive. The cursors of the live
 * collection are left alone: this only adds what is older.
 */
export async function importHistory(store, config, { days = config.history?.days ?? 365, log = console.log, now = Date.now() } = {}) {
  const since = now - days * DAY;
  const counts = {};
  for (const src of SOURCES) {
    if (!PAST.has(src.id) || !config.sources[src.id]) continue;
    const loc = src.locate();
    if (loc.state !== 'ok') continue;
    try {
      const { events } = await src.collect({ since, cursor: undefined, config, store });
      const kept = thin(events.filter((e) => Number.isFinite(e.ts) && e.ts >= since && e.ts <= now + 60e3), { before: now - 2 * DAY });
      counts[src.id] = store.insertEvents(kept);
    } catch (e) {
      if (!(e instanceof PermissionError)) log(`[${tr({ en: 'history', it: 'storia' })}] ${src.id}: ${e.message}`);
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  store.setSetting('history', { at: now, days, counts });
  log(tr({
    en: `[history] ${total} events from the last ${days} days read into the archive (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing readable'})`,
    it: `[storia] ${total} eventi degli ultimi ${days} giorni letti nell'archivio (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'niente di leggibile'})`,
  }));
  return { total, counts };
}

/** Has the past been read already? */
export const historyRead = (store) => !!store.getSetting('history', null);
