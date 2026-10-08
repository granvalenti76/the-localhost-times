import { home, fileState, withSnapshot, columns, cdToMs, msToCd, hostOf, isBlockedHost } from '../util.js';

const FILE = home('Library/Safari/History.db');

const ENGINES = [
  { host: /(^|\.)google\.[a-z.]+$/, path: /^\/search/, param: 'q', name: 'Google' },
  { host: /(^|\.)bing\.com$/, path: /^\/search/, param: 'q', name: 'Bing' },
  { host: /(^|\.)duckduckgo\.com$/, path: /^\/$/, param: 'q', name: 'DuckDuckGo' },
  { host: /(^|\.)ecosia\.org$/, path: /^\/search/, param: 'q', name: 'Ecosia' },
  { host: /(^|\.)search\.brave\.com$/, path: /^\/search/, param: 'q', name: 'Brave' },
  { host: /(^|\.)kagi\.com$/, path: /^\/search/, param: 'q', name: 'Kagi' },
  { host: /(^|\.)perplexity\.ai$/, path: /^\/search/, param: 'q', name: 'Perplexity' },
  { host: /(^|\.)youtube\.com$/, path: /^\/results/, param: 'search_query', name: 'YouTube' },
  { host: /(^|\.)wikipedia\.org$/, path: /^\/w\/index\.php/, param: 'search', name: 'Wikipedia' },
];

export function detectSearch(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  for (const e of ENGINES) {
    if (e.host.test(u.hostname) && e.path.test(u.pathname)) {
      const q = u.searchParams.get(e.param);
      if (q && q.trim()) return { engine: e.name, query: q.trim() };
    }
  }
  return null;
}

export default {
  id: 'safari',
  label: 'Safari',
  locate: () => ({ file: FILE, state: fileState(FILE) }),

  collect({ since, config }) {
    const blocked = config.privacy.blockedDomains;
    return withSnapshot(FILE, (db) => {
      const cols = columns(db, 'history_visits');
      // origin = 0 → visita fatta su QUESTO Mac (1 = sincronizzata da iCloud da altri dispositivi)
      const originFilter = cols.includes('origin') ? 'AND (v.origin IS NULL OR v.origin = 0)' : '';
      const redirectFilter = cols.includes('redirect_destination') ? 'AND v.redirect_destination IS NULL' : '';
      const rows = db
        .prepare(
          `SELECT v.id AS id, v.visit_time AS t, v.title AS title, i.url AS url
           FROM history_visits v JOIN history_items i ON i.id = v.history_item
           WHERE v.visit_time > ? ${originFilter} ${redirectFilter}
           ORDER BY v.visit_time`
        )
        .all(msToCd(since));

      const events = [];
      for (const r of rows) {
        if (!/^https?:/i.test(r.url || '')) continue;
        const host = hostOf(r.url);
        if (!host || isBlockedHost(host, blocked)) continue;
        const s = detectSearch(r.url);
        events.push({
          id: `safari:${r.id}`,
          source: 'safari',
          kind: s ? 'search' : 'visit',
          ts: cdToMs(r.t),
          title: s ? s.query : (r.title || host),
          detail: s ? s.engine : null,
          url: r.url,
          meta: { host, engine: s?.engine ?? null },
        });
      }
      return { events };
    });
  },
};
