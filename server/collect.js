import { tr } from './i18n.js';
import { SOURCES } from './sources/index.js';
import { PermissionError, fingerprint } from './util.js';

const DAY = 24 * 3600e3;
export const sourceStatus = {};

// What each source looked like at the last collection, and when it last ran (in memory: after a
// restart everything is read once more, which is harmless)
const seen = new Map();
const lastRun = new Map();

export async function collectAll(store, config, log = console.log) {
  let total = 0;
  for (const src of SOURCES) {
    if (!config.sources[src.id]) {
      sourceStatus[src.id] = { id: src.id, label: src.label, state: 'disabled' };
      continue;
    }
    const loc = src.locate();
    const base = { id: src.id, label: src.label, file: loc.file, experimental: !!src.experimental, at: Date.now() };
    if (loc.state !== 'ok') {
      sourceStatus[src.id] = { ...base, state: loc.state };
      continue;
    }
    // some sources don't need reading every five minutes (src.everyMinutes)
    if (src.everyMinutes && Date.now() - (lastRun.get(src.id) || 0) < src.everyMinutes * 60e3 - 5e3) continue;
    // nothing changed on disk since last time: nothing to read (no copy, no query)
    const fp = src.fingerprint === false ? null : fingerprint([loc.file, loc.annotations].filter(Boolean));
    if (fp && seen.get(src.id) === fp) {
      sourceStatus[src.id] = { ...(sourceStatus[src.id] || base), ...base, state: 'ok', unchanged: true };
      continue;
    }
    const cur = store.getCursor(src.id) || {};
    const since = cur.ts ?? Date.now() - DAY;
    const t0 = Date.now();
    try {
      const { events, cursor } = await src.collect({ since: since - 1000, cursor: cur.extra, config, store });
      lastRun.set(src.id, Date.now());
      if (fp) seen.set(src.id, fp);
      const added = store.insertEvents(events);
      let maxTs = since;
      for (const e of events) if (Number.isFinite(e.ts) && e.ts > maxTs && e.ts <= Date.now() + 60e3) maxTs = e.ts;
      store.setCursor(src.id, { ts: maxTs, extra: cursor ?? cur.extra ?? null });
      total += added;
      sourceStatus[src.id] = { ...base, state: 'ok', found: events.length, added, ms: Date.now() - t0 };
    } catch (e) {
      const denied = e instanceof PermissionError;
      sourceStatus[src.id] = { ...base, state: denied ? 'denied' : 'error', error: e.message };
      if (!denied) log(`[${src.id}] ${tr({ en: 'error', it: 'errore' })}: ${e.message}`);
    }
  }
  return total;
}
