/**
 * The archive: full-text search over everything the paper printed and every raw signal it read,
 * and "Ask the archive", where the managing editor answers a question citing the facts.
 */
import { tr, lang } from '../i18n.js';
import { SECTIONS } from './sections.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { linePrompt, getLine } from './line.js';
import { dayKey, hhmm } from '../util.js';

const DAY = 24 * 3600e3;

const STOP = new Set(`
the a an of to in on at for and or is are was were did do does how many much what when where which who whom why
time times i me my mine you your it its this that these those with from by about after before than then there here
have has had am be been being can could should would will just only more most some any all each every no not
over under into out up down again ever never also very so too please tell show find look see did ago lately
il lo la i gli le un uno una di a da in con su per tra fra e o ma che chi cosa come quando dove quanto quante quanti quanta
perché perche ho hai ha abbiamo avete hanno sono sei è e' era erano sia del dello della dei degli delle al allo alla ai agli alle
dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle mi ti si ci vi me te lui lei
noi voi loro mio mia miei mie tuo tua questo questa questi queste quello quella quelli quelle volte volta fatto fare faccio
stato stata più piu meno molto poco dopo prima sempre mai già gia ancora anche solo non mostrami dimmi trova cerca ultimo ultima
`.split(/\s+/).filter(Boolean));

const TIME_WORDS = /\b(today|oggi|yesterday|ieri|week|settimana|month|mese|days?|giorni|giorno|last|scors[oa]|ultim[ie]|this|questo|questa|morning|mattina|afternoon|pomeriggio|evening|sera|night|notte|lunch|pranzo)\b/gi;

/** Words of a query, without punctuation. */
const words = (q) => (String(q).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_'-]*/gu) || [])
  .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
  .filter((w) => w.length > 1);

/**
 * A safe FTS5 query from what the reader typed: "quoted phrases" stay phrases, every other
 * word matches as a prefix. `any` joins with OR (for questions), otherwise all words must match.
 */
export function ftsQuery(q, { any = false, dropStopwords = any } = {}) {
  const parts = [];
  const rest = String(q || '').replace(/"([^"]+)"/g, (_, p) => {
    const ph = words(p).join(' ');
    if (ph) parts.push(`"${ph}"`);
    return ' ';
  });
  for (const w of words(rest)) {
    if (dropStopwords && STOP.has(w)) continue;
    parts.push(`"${w.replace(/"/g, '')}"*`);
  }
  return parts.length ? [...new Set(parts)].join(any ? ' OR ' : ' AND ') : null;
}

function where({ kind, source, from, to }) {
  const sql = [];
  const args = [];
  if (kind) { sql.push('kind = ?'); args.push(kind); }
  if (source) { sql.push('source = ?'); args.push(source); }
  if (from) { sql.push('ts >= ?'); args.push(from); }
  if (to) { sql.push('ts < ?'); args.push(to); }
  return { sql: sql.length ? ` AND ${sql.join(' AND ')}` : '', args };
}

/** Rows of the index, enriched with what the page needs to link them. */
function enrich(store, rows) {
  const ev = store.db.prepare(`SELECT kind, detail, url, meta FROM events WHERE id = ?`);
  return rows.map((r) => {
    const base = { kind: r.kind, ts: r.ts, source: r.source || null, title: r.title, snippet: r.snip || '' };
    if (r.kind === 'article') {
      const [editionId, ...rest] = r.ref.split('/');
      return { ...base, editionId, articleId: rest.join('/'), section: SECTIONS[r.source]?.name || r.source };
    }
    if (r.kind === 'evening') return { ...base, day: r.ref };
    const e = ev.get(r.ref);
    const meta = e ? JSON.parse(e.meta || '{}') : {};
    return {
      ...base,
      eventKind: e?.kind || null,
      section: SECTIONS[r.source]?.name || r.source,
      host: meta.host || meta.site || null,
      detail: e?.detail || null,
      url: r.source === 'safari' && /^https?:/.test(e?.url || '') ? e.url : null,
      editionId: store.editionAt(r.ts),
    };
  });
}

/**
 * Search the archive.
 * @returns {{ query, total, counts: {article, event, evening}, byDay: number[], results }}
 */
export function search(store, { q, kind = null, source = null, from = null, to = null, sort = 'relevance', limit = 40, offset = 0, any = false }) {
  const match = ftsQuery(q, { any });
  if (!match) return { query: null, total: 0, counts: {}, byDay: [], results: [] };
  const w = where({ kind, source, from, to });
  const order = sort === 'recent' ? 'ts DESC' : 'bm25(search, 0, 0, 0, 0, 4, 1)';
  let rows;
  try {
    rows = store.db.prepare(
      `SELECT kind, ref, ts, source, title, snippet(search, 5, '[[', ']]', '…', 14) AS snip
       FROM search WHERE search MATCH ?${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ).all(match, ...w.args, Math.min(200, limit), offset);
  } catch {
    return { query: match, total: 0, counts: {}, byDay: [], results: [] }; // a query FTS5 could not parse
  }
  const all = where({ source, from, to });
  const counts = Object.fromEntries(store.db.prepare(
    `SELECT kind, COUNT(*) AS n FROM search WHERE search MATCH ?${all.sql} GROUP BY kind`,
  ).all(match, ...all.args).map((r) => [r.kind, r.n]));
  // matching signals per day, over the last 30 days (a small chart on the page)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 29 * DAY;
  const byDay = Array(30).fill(0);
  for (const r of store.db.prepare(`SELECT ts FROM search WHERE search MATCH ? AND kind = 'event' AND ts >= ?${where({ source }).sql}`).all(match, start, ...where({ source }).args)) {
    const i = Math.floor((r.ts - start) / DAY);
    if (i >= 0 && i < 30) byDay[i]++;
  }
  return {
    query: match,
    total: kind ? counts[kind] || 0 : Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    byDay,
    byDayFrom: start,
    results: enrich(store, rows),
  };
}

// ───────────────────────── Ask the archive ─────────────────────────

/** "this week", "ieri", "last 3 days"… → a time range; null = the whole archive. */
export function timeRange(question, now = Date.now()) {
  const q = String(question).toLowerCase();
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const today = d0.getTime();
  const n = /(?:last|ultimi|past)\s+(\d{1,3})\s+(?:days|giorni)/.exec(q);
  if (n) return { from: today - (Number(n[1]) - 1) * DAY, to: now };
  if (/\b(today|oggi|stamattina|this morning|stasera|tonight)\b/.test(q)) return { from: today, to: now };
  if (/\b(yesterday|ieri)\b/.test(q)) return { from: today - DAY, to: today };
  if (/\b(last week|settimana scorsa)\b/.test(q)) return { from: today - 13 * DAY, to: today - 6 * DAY };
  if (/\b(this week|questa settimana|week|settimana)\b/.test(q)) return { from: today - 6 * DAY, to: now };
  if (/\b(this month|questo mese|month|mese)\b/.test(q)) return { from: today - 29 * DAY, to: now };
  return null;
}

const when = (ms) => `${dayKey(ms)} ${hhmm(ms)}`;

function askPrompt({ question, items, stats, range, line }) {
  const en = lang() === 'en';
  const list = items.map((it, i) => `[${i + 1}] ${when(it.ts)} · ${it.section || it.kind}${it.host ? ` · ${it.host}` : ''} · ${it.title}${it.snippet ? ` — ${it.snippet.replace(/\[\[|\]\]/g, '')}` : ''}`).join('\n');
  const span = range ? `${dayKey(range.from)} → ${dayKey(range.to - 1)}` : (en ? 'the whole archive' : 'tutto l\'archivio');
  const sys = en
    ? `You are the archivist of The Localhost Times, the paper about what happens on its owner's Mac. The owner asks you a question about their own activity. Answer from the archive records below ONLY: they are numbered matches from the paper's index, with date and time. Count carefully when asked "how many", and use the totals given. Cite records like [3]. If the records don't answer the question, say so plainly and suggest a better search. English, dry and precise, 120 words at most.${line ? '\n' + linePrompt(line) : ''}
Reply ONLY with JSON: {"answer": "...", "cited": [numbers of the records you used]}`
    : `Sei l'archivista del «The Localhost Times», il giornale di ciò che succede sul Mac del suo proprietario. Il proprietario ti fa una domanda sulla sua attività. Rispondi SOLO in base ai documenti d'archivio qui sotto: sono risultati numerati dell'indice del giornale, con data e ora. Conta con attenzione quando ti chiedono «quante volte», e usa i totali forniti. Cita i documenti così: [3]. Se i documenti non rispondono alla domanda, dillo chiaramente e suggerisci una ricerca migliore. Italiano, asciutto e preciso, massimo 120 parole.${line ? '\n' + linePrompt(line) : ''}
Rispondi SOLO con JSON: {"answer": "...", "cited": [numeri dei documenti usati]}`;
  const user = en
    ? `QUESTION: ${question}\nPERIOD: ${span}\nTOTAL MATCHES: ${stats.total} (${Object.entries(stats.bySource).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})\nMATCHES PER DAY: ${stats.perDay || 'none'}\n\nRECORDS:\n${list || '(none)'}`
    : `DOMANDA: ${question}\nPERIODO: ${span}\nRISULTATI IN TUTTO: ${stats.total} (${Object.entries(stats.bySource).map(([k, v]) => `${k} ${v}`).join(', ') || 'nessuno'})\nRISULTATI PER GIORNO: ${stats.perDay || 'nessuno'}\n\nDOCUMENTI:\n${list || '(nessuno)'}`;
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

/** Totals of all matches in the period (not only the records shown to the model). */
function matchStats(store, match, range) {
  const w = where({ kind: 'event', ...(range || {}) });
  const bySource = {};
  const perDay = {};
  for (const r of store.db.prepare(`SELECT source, ts FROM search WHERE search MATCH ?${w.sql}`).all(match, ...w.args)) {
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    const d = dayKey(r.ts);
    perDay[d] = (perDay[d] || 0) + 1;
  }
  return {
    total: Object.values(bySource).reduce((a, b) => a + b, 0),
    bySource,
    perDay: Object.entries(perDay).sort().slice(-14).map(([d, n]) => `${d}: ${n}`).join(', '),
  };
}

export async function ask(store, config, question, log = console.log) {
  const q = String(question || '').trim().slice(0, 300);
  if (!q) return { answer: null, items: [] };
  const range = timeRange(q);
  const keywords = q.replace(TIME_WORDS, ' ');
  let match = ftsQuery(keywords, { any: true });
  let items = [];
  if (match) {
    const events = search(store, { q: keywords, any: true, kind: 'event', ...(range || {}), limit: 30 }).results;
    const articles = search(store, { q: keywords, any: true, kind: 'article', ...(range || {}), limit: 8 }).results;
    items = [...articles, ...events].sort((a, b) => a.ts - b.ts);
  }
  if (!items.length && range) {
    // no keywords ("what did I do yesterday?"): the headlines of the period
    match = null;
    items = store.db.prepare(`SELECT kind, ref, ts, source, title, '' AS snip FROM search WHERE kind = 'article' AND ts >= ? AND ts < ? ORDER BY ts LIMIT 30`)
      .all(range.from, range.to);
    items = enrich(store, items);
  }
  const stats = match ? matchStats(store, match, range) : { total: items.length, bySource: {}, perDay: '' };
  const llm = await connectLLM(config);
  if (!llm) {
    return {
      answer: null,
      offline: true,
      note: tr({ en: 'The writer is offline: here are the matching records.', it: 'Il redattore è spento: ecco i documenti trovati.' }),
      items, range, stats,
    };
  }
  try {
    const j = parseJson(await chat(llm, config, askPrompt({ question: q, items, stats, range, line: getLine(store) }), 1500));
    const cited = Array.isArray(j.cited) ? j.cited.map(Number).filter((n) => n >= 1 && n <= items.length) : [];
    return { answer: String(j.answer || '').trim(), cited, items, range, stats, writer: llm.model };
  } catch (e) {
    log(`[${tr({ en: 'archive', it: 'archivio' })}] ${e.message}`);
    return { answer: null, error: e.message, items, range, stats };
  }
}
