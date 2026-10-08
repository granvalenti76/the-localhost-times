/**
 * L'edizione della sera: la giornata in una prima pagina.
 * Editoriale del direttore, le notizie del giorno (dalle edizioni orarie),
 * la giornata ora per ora, la Borsa di chiusura e la vignetta del giorno.
 */
import { connectLLM, chat, parseJson } from './llm.js';
import { getLine } from './line.js';
import { eveningPrompt } from './prompts.js';
import { fallbackEditorial } from './fallback.js';
import { cleanEvents, DeskError } from './edition.js';
import { siteOf } from './cluster.js';
import { ticker } from './market.js';
import { SECTION_ORDER } from './sections.js';
import { dayRange } from '../util.js';

const HOUR = 3600e3;
const cleanQuote = (s) => String(s).trim().replace(/^[«"“']+|[»"”']+$/g, '').trim();

/** Le notizie del giorno: gli articoli più pesanti, una sola volta per argomento. */
function topStories(editions, n = 6) {
  const byStory = new Map();
  for (const e of editions) {
    for (const a of e.articles) {
      const cur = byStory.get(a.id);
      const item = {
        editionId: e.id, articleId: a.id, hour: e.hour ?? e.start, section: a.section, slug: a.slug, source: a.source,
        kind: a.kind, kicker: a.kicker, headline: a.headline, dek: a.dek, image: a.image || null, weight: a.weight || 0,
        appearances: (cur?.appearances || 0) + 1,
      };
      if (!cur || item.weight > cur.weight) byStory.set(a.id, { ...item, image: item.image || cur?.image || null });
      else cur.appearances = item.appearances;
    }
  }
  return [...byStory.values()]
    .map((s) => ({ ...s, score: s.weight * (1 + Math.log2(s.appearances)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function dayStats(events, a) {
  const hours = Array(24).fill(0);
  const bySource = Object.fromEntries(SECTION_ORDER.map((s) => [s, 0]));
  for (const e of events) {
    hours[Math.min(23, Math.max(0, Math.floor((e.ts - a) / HOUR)))]++;
    bySource[e.source] = (bySource[e.source] || 0) + 1;
  }
  const busiest = hours.indexOf(Math.max(...hours));
  return {
    total: events.length,
    bySource,
    hours,
    busiestHour: busiest,
    searches: events.filter((e) => e.kind === 'search').length,
    commands: bySource.terminal || 0,
  };
}

/** Borsa di chiusura: visite del giorno per sito, confronto con ieri alla stessa ora. */
function dayMarket(store, config, a, end) {
  const isVisit = (e) => e.source === 'safari' && e.kind === 'visit';
  const today = cleanEvents(store.eventsBetween(a, end), config).filter(isVisit);
  if (!today.length) return null;
  const ya = a - 24 * HOUR;
  const yesterday = cleanEvents(store.eventsBetween(ya, end - 24 * HOUR), config).filter(isVisit);
  const tally = (evs, from) => {
    const m = new Map();
    for (const e of evs) {
      const site = siteOf(e.meta?.host || '');
      if (!site) continue;
      if (!m.has(site)) m.set(site, { n: 0, spark: Array(24).fill(0) });
      const r = m.get(site);
      r.n++;
      r.spark[Math.min(23, Math.max(0, Math.floor((e.ts - from) / HOUR)))]++;
    }
    return m;
  };
  const t = tally(today, a);
  const y = tally(yesterday, ya);
  const rows = [...t.entries()]
    .map(([site, r]) => {
      const prev = y.get(site)?.n || 0;
      return { site, ticker: ticker(site), close: r.n, prev, change: prev ? (r.n - prev) / prev : null, spark: r.spark };
    })
    .sort((p, q) => q.close - p.close)
    .slice(0, 10);
  const total = today.length;
  const prevTotal = yesterday.length;
  return {
    rows,
    index: { close: total, prev: prevTotal, change: prevTotal ? (total - prevTotal) / prevTotal : null },
    comment: null,
  };
}

export async function printEvening({ store, config, day, until = Date.now(), log = console.log }) {
  const [a, b] = dayRange(day);
  const end = Math.min(b, until);
  const editions = store.editionsForDay(day, { full: true });
  if (!editions.length) return null;
  const events = cleanEvents(store.eventsBetween(a, end), config);
  const line = getLine(store);

  const top = topStories(editions);
  const timeline = editions.map((e) => ({
    id: e.id,
    hour: e.hour ?? e.start,
    start: e.start,
    total: e.stats?.total ?? 0,
    lead: e.articles[0]?.headline ?? null,
    section: e.articles[0]?.section ?? null,
  }));
  const stats = dayStats(events, a);
  const market = dayMarket(store, config, a, end);

  const llm = await connectLLM(config);
  let written = null;
  if (llm) {
    try {
      const j = parseJson(await chat(llm, config, eveningPrompt({ top, timeline, stats, market, line }), 3000));
      if (Array.isArray(j.editorial) && j.editorial.length && typeof j.headline === 'string') {
        written = {
          headline: j.headline.trim().replace(/(?<!\.)\.$/, ''),
          oneliner: String(j.oneliner || '').trim(),
          body: j.editorial.map((p) => String(p).trim()).filter(Boolean),
          cartoon: j.cartoon ? cleanQuote(j.cartoon).slice(0, 160) : null,
          market: j.market ? String(j.market).trim() : null,
          writer: llm.model,
        };
      }
    } catch (e) {
      log(`[sera] editoriale: ${e.message}`);
    }
  }
  const fb = fallbackEditorial({ top, timeline, stats, market });
  const ed = written || fb;
  if (market) market.comment = written?.market || fb.market;

  const prev = store.getEvening(day);
  const evening = {
    id: `${day}-sera`,
    day,
    kind: 'evening',
    start: a,
    end,
    status: prev?.status === 'published' || line.autoPublish ? 'published' : 'draft',
    createdAt: Date.now(),
    writer: written ? llm.model : 'tipografia',
    tone: line.tone,
    editorial: { headline: ed.headline, oneliner: ed.oneliner, body: ed.body },
    cartoon: { caption: written?.cartoon || fb.cartoon, scene: 'desk' },
    top,
    timeline,
    stats,
    market,
    editions: editions.length,
  };
  store.saveEvening(evening);
  log(`[sera] edizione della sera ${day}: ${editions.length} edizioni, ${events.length} segnali, redattore ${evening.writer}`);
  return evening;
}

export async function rewriteEditorial(store, config, day, instruction, log = console.log) {
  const ev = store.getEvening(day);
  if (!ev) throw new DeskError('Edizione della sera non trovata', 404);
  const llm = await connectLLM(config);
  if (!llm) throw new DeskError('Il redattore non risponde: impossibile riscrivere ora.', 503);
  const msgs = eveningPrompt({ top: ev.top, timeline: ev.timeline, stats: ev.stats, market: ev.market, line: getLine(store) });
  msgs.push({ role: 'assistant', content: JSON.stringify({ headline: ev.editorial.headline, oneliner: ev.editorial.oneliner, editorial: ev.editorial.body }) });
  msgs.push({ role: 'user', content: `Il direttore chiede di riscrivere l'editoriale. Indicazione: «${instruction || 'una versione migliore'}». Stessi fatti, stesse regole, stesso formato JSON.` });
  let j;
  try {
    j = parseJson(await chat(llm, config, msgs, 3000));
  } catch (e) {
    throw new DeskError(`Il redattore ha risposto male: ${e.message}`, 502);
  }
  if (!Array.isArray(j.editorial) || !j.editorial.length) throw new DeskError('Il redattore non ha scritto l\'editoriale.', 502);
  ev.editorial = {
    headline: String(j.headline || ev.editorial.headline).trim().replace(/(?<!\.)\.$/, ''),
    oneliner: String(j.oneliner || ev.editorial.oneliner || '').trim(),
    body: j.editorial.map((p) => String(p).trim()).filter(Boolean),
  };
  if (j.cartoon) ev.cartoon = { ...ev.cartoon, caption: cleanQuote(j.cartoon).slice(0, 160) };
  ev.writer = llm.model;
  ev.edited = true;
  store.saveEvening(ev);
  return ev;
}

export function publishEvening(store, day) {
  const ev = store.getEvening(day);
  if (!ev) throw new DeskError('Edizione della sera non trovata', 404);
  ev.status = 'published';
  store.saveEvening(ev);
  return ev;
}

