import { tr } from '../i18n.js';
import { home, fileState, withSnapshot, columns, cdToMs, msToCd, hostOf, isBlockedHost, isSelfUrl } from '../util.js';

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

/**
 * Webmail in the browser (Gmail): the page title contains the subject of the open email
 * or the number of unread messages. They become news for the Correspondence section.
 *   "Oggetto - nome@gmail.com - Gmail"
 *   "Posta in arrivo (12.940) - nome@gmail.com - Gmail"
 */
const GMAIL_FOLDERS = /^(posta in arrivo|inbox|inviata|inviati|sent( mail)?|bozze|drafts|speciali|starred|importanti|important|tutti i messaggi|all mail|spam|cestino|trash|bin|posticipati|snoozed|programmati|scheduled|risultati di ricerca|search results|social|promozioni|promotions|aggiornamenti|updates|forum|forums|etichette|label|categorie)\b/i;

export function parseWebmail(host, title) {
  if (host !== 'mail.google.com') return null;
  const m = /^(.*) - (\S+@\S+) - Gmail$/.exec(title || '');
  if (!m) return { kind: 'skip' };
  const [, head, account] = m;
  const inbox = /^(posta in arrivo|inbox)\s*\(([\d.,\s]+)\)/i.exec(head);
  if (inbox) {
    return { kind: 'inbox', title: tr({ en: 'Inbox', it: 'Posta in arrivo' }), account, service: 'Gmail', unreadCount: Number(inbox[2].replace(/[^\d]/g, '')) };
  }
  if (GMAIL_FOLDERS.test(head)) return { kind: 'skip' };
  return { kind: 'read', title: head.trim(), account, service: 'Gmail' };
}

export default {
  id: 'safari',
  label: 'Safari',
  locate: () => ({ file: FILE, state: fileState(FILE) }),

  collect({ since, config }) {
    const blocked = config.privacy.blockedDomains;
    return withSnapshot(FILE, (db) => {
      const cols = columns(db, 'history_visits');
      // origin = 0 → visit made on THIS Mac (1 = synced via iCloud from other devices)
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
        if (!host || isBlockedHost(host, blocked) || isSelfUrl(r.url, config.port)) continue;
        const wm = parseWebmail(host, r.title);
        if (wm) {
          if (wm.kind !== 'skip') {
            events.push({
              id: `mail:web:${r.id}`,
              source: 'mail',
              kind: wm.kind,
              ts: cdToMs(r.t),
              title: wm.title,
              detail: wm.service,
              url: null,
              meta: { webmail: wm.service, account: wm.account, unreadCount: wm.unreadCount ?? null },
            });
          }
          continue;
        }
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
