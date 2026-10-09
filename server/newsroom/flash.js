/**
 * Breaking news: when something exceptional happens in the middle of the hour (a record falling,
 * a site never seen before taking over), the paper doesn't wait for the edition. A one-line flash
 * goes out at once, with a notification, and stays at the top of the front page.
 */
import { tr } from '../i18n.js';
import { metrics, peekRecords } from './sport.js';
import { siteOf } from './cluster.js';
import { computeStats, cleanEvents, editionWindow } from './edition.js';
import { computeTime, isAmbient } from './time.js';
import { getLine, featureOn } from './line.js';
import { say } from './chatter.js';
import { hourStart, hhmm, dayKey } from '../util.js';

const KIND = 'flash';
const HOUR = 3600e3;
const DAY = 24 * HOUR;

const when = (ms) => (dayKey(ms) === dayKey(Date.now())
  ? tr({ en: `today at ${hhmm(ms)}`, it: `oggi alle ${hhmm(ms)}` })
  : new Intl.DateTimeFormat(tr({ en: 'en-US', it: 'it-IT' }), { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(ms));

export function flashText(r) {
  if (r.debut) {
    return {
      headline: tr({ en: `${r.site} bursts in: ${r.value} visits in an hour`, it: `Irrompe ${r.site}: ${r.value} visite in un'ora` }),
      text: tr({ en: `${r.site}, never seen in the last week, has taken over the hour: ${r.value} visits so far.`, it: `${r.site}, mai visto nell'ultima settimana, si è preso l'ora: ${r.value} visite finora.` }),
    };
  }
  return {
    headline: tr({ en: `Record: ${r.label.toLowerCase()}, ${r.value}`, it: `Primato: ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)}, ${r.value}` }),
    text: tr({ en: `${r.label}: ${r.value}, and the hour isn't over. The previous best was ${r.prev} (${when(r.prevAt)}).`, it: `${r.label}: ${r.value}, e l'ora non è finita. Il primato precedente era ${r.prev} (${when(r.prevAt)}).` }),
  };
}

/** Flashes of a window, oldest first (for the edition that covers it). */
export const flashesBetween = (store, from, to) => store.items(KIND, { after: from, before: to, limit: 5, oldest: true })
  .map(({ id, ts, headline, text, key }) => ({ id, ts, headline, text, key }));

export const latestFlashes = (store, since) => store.items(KIND, { after: since, limit: 3 })
  .map(({ id, ts, headline, text, key }) => ({ id, ts, headline, text, key }));

/** Mid-hour: is there something worth breaking? At most one flash an hour. */
export function flashRound(store, config, { now = Date.now(), notify = null, log = () => {} } = {}) {
  if (!featureOn(getLine(store), 'flash')) return null;
  const hour = hourStart(now);
  if (store.items(KIND, { after: hour, limit: 1 }).length) return null;
  const { id: editionId } = editionWindow(store, config, hour);
  const events = cleanEvents(store.eventsBetween(hour, now), config);
  const news = events.filter((e) => !isAmbient(e));
  if (news.length < 10) return null;
  const list = metrics({ news, stats: computeStats(news, hour), time: computeTime(events, hour, now) });
  let r = peekRecords(store, list, editionId)[0] || null;
  if (!r) {
    // a debut: a site with 40 visits this hour and none in the week before
    const top = list.filter((m) => m.kind === 'site' && m.value >= 40).sort((a, b) => b.value - a.value)[0];
    if (top) {
      const site = top.key.slice(5);
      const before = store.db.prepare(`SELECT meta FROM events WHERE source = 'safari' AND ts >= ? AND ts < ?`).all(hour - 7 * DAY, hour)
        .some((e) => siteOf(JSON.parse(e.meta || '{}').host || '') === site);
      if (!before) r = { key: top.key, debut: true, site, value: top.value };
    }
  }
  if (!r) return null;
  const f = store.saveItem({ kind: KIND, status: '', ts: now, ref: r.key, key: r.key, editionId, record: r, ...flashText(r) });
  log(tr({ en: `[newsroom] breaking news: ${f.headline}`, it: `[redazione] ultim'ora: ${f.headline}` }));
  say(store, 'desk', tr({ en: `Desk: stop the presses! ${f.headline}.`, it: `Desk: fermate le rotative! ${f.headline}.` }), now);
  notify?.flash?.(f);
  return f;
}
