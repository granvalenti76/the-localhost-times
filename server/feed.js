/**
 * RSS 2.0 feeds: the whole paper (/feed.xml) or one section (/feed/<section>.xml).
 * Only published editions; each article is an item, plus the evening editorial.
 */
import { tr, lang } from './i18n.js';
import { SECTIONS, sectionBySlug } from './newsroom/sections.js';

const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cdata = (s) => `<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const rfc822 = (ms) => new Date(ms).toUTCString();

function articleHtml(a) {
  const parts = [];
  if (a.dek) parts.push(`<p><em>${x(a.dek)}</em></p>`);
  for (const p of a.body || []) parts.push(`<p>${x(p)}</p>`);
  return parts.join('\n');
}

export function rssFeed(store, { base, section = null, limit = 60 }) {
  const source = section ? sectionBySlug(section) : null;
  if (section && !source) return null;

  const rows = store.db
    .prepare(`SELECT payload FROM editions WHERE status = 'published' ORDER BY start_ts DESC LIMIT 72`)
    .all()
    .map((r) => JSON.parse(r.payload));

  const items = [];
  for (const ed of rows) {
    for (const a of ed.articles || []) {
      if (source && a.source !== source) continue;
      items.push({
        title: a.headline,
        link: `${base}/#/e/${encodeURIComponent(ed.id)}/a/${encodeURIComponent(a.id)}`,
        guid: `${ed.id}/${a.id}`,
        date: a.last || ed.createdAt,
        category: a.section,
        html: articleHtml(a),
      });
    }
  }
  if (!source) {
    const evenings = store.db.prepare(`SELECT payload FROM evenings WHERE status = 'published' ORDER BY day DESC LIMIT 7`).all();
    for (const r of evenings) {
      const ev = JSON.parse(r.payload);
      items.push({
        title: ev.editorial.headline,
        link: `${base}/#/evening/${ev.day}`,
        guid: ev.id,
        date: ev.createdAt,
        category: tr({ en: 'Evening edition', it: 'Edizione della sera' }),
        html: [ev.editorial.oneliner && `<p><em>${x(ev.editorial.oneliner)}</em></p>`, ...ev.editorial.body.map((p) => `<p>${x(p)}</p>`)].filter(Boolean).join('\n'),
      });
    }
  }
  items.sort((a, b) => b.date - a.date);

  const title = `The Localhost Times${source ? ` — ${SECTIONS[source].name}` : ''}`;
  const self = `${base}/feed${section ? `/${section}` : ''}.xml`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${x(title)}</title>
  <link>${x(base)}/</link>
  <atom:link href="${x(self)}" rel="self" type="application/rss+xml"/>
  <description>${x(tr({ en: 'All the news that never left the machine.', it: 'Tutte le notizie che non hanno mai lasciato il computer.' }))}</description>
  <language>${lang()}</language>
  <generator>The Localhost Times</generator>
${items.slice(0, limit).map((i) => `  <item>
    <title>${x(i.title)}</title>
    <link>${x(i.link)}</link>
    <guid isPermaLink="false">${x(i.guid)}</guid>
    <pubDate>${rfc822(i.date)}</pubDate>
    <category>${x(i.category)}</category>
    <description>${cdata(i.html)}</description>
    <content:encoded>${cdata(i.html)}</content:encoded>
  </item>`).join('\n')}
</channel>
</rss>
`;
}
