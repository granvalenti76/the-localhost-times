import { SOURCES } from './sources/index.js';
import { PermissionError } from './util.js';

const DAY = 24 * 3600e3;
export const sourceStatus = {};

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
    const cur = store.getCursor(src.id) || {};
    const since = cur.ts ?? Date.now() - DAY;
    try {
      const { events, cursor } = await src.collect({ since: since - 1000, cursor: cur.extra, config });
      const added = store.insertEvents(events);
      let maxTs = since;
      for (const e of events) if (Number.isFinite(e.ts) && e.ts > maxTs && e.ts <= Date.now() + 60e3) maxTs = e.ts;
      store.setCursor(src.id, { ts: maxTs, extra: cursor ?? cur.extra ?? null });
      total += added;
      sourceStatus[src.id] = { ...base, state: 'ok', found: events.length, added };
    } catch (e) {
      const denied = e instanceof PermissionError;
      sourceStatus[src.id] = { ...base, state: denied ? 'denied' : 'error', error: e.message };
      if (!denied) log(`[${src.id}] errore: ${e.message}`);
    }
  }
  return total;
}
