/**
 * La Borsa dei siti: ogni sito è un titolo quotato, le visite sono il prezzo.
 * Variazione sull'ora precedente e andamento delle ultime 12 ore.
 */
import { siteOf, registrable } from './cluster.js';
import { isSelfUrl } from '../util.js';

const HOUR = 3600e3;
const SPAN = 12;

const VOWELS = /[aeiouy]/;

/** youtube → YTB, github → GTH, facebook → FCB, x → X */
export function ticker(site) {
  const brand = registrable(site).split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!brand) return site.slice(0, 3).toUpperCase();
  if (brand.length <= 3) return brand.toUpperCase();
  let t = brand[0];
  for (const c of brand.slice(1)) {
    if (t.length === 3) break;
    if (!VOWELS.test(c) && !t.includes(c) && !/\d/.test(c)) t += c;
  }
  if (t.length < 3) t = (t + brand.slice(1).replace(new RegExp(`[${t}]`, 'g'), '')).slice(0, 3);
  return t.toUpperCase();
}

export function computeMarket(store, start, { limit = 8, port = 4321 } = {}) {
  const from = start - (SPAN - 1) * HOUR;
  const visits = store.eventsBetween(from, start + HOUR)
    .filter((e) => e.source === 'safari' && e.kind === 'visit' && !isSelfUrl(e.url, port));
  if (!visits.length) return null;

  const series = new Map(); // site → [12 conteggi]
  const index = Array(SPAN).fill(0);
  for (const e of visits) {
    const h = Math.min(SPAN - 1, Math.max(0, Math.floor((e.ts - from) / HOUR)));
    const site = siteOf(e.meta?.host || '');
    if (!site) continue;
    if (!series.has(site)) series.set(site, Array(SPAN).fill(0));
    series.get(site)[h]++;
    index[h]++;
  }

  const change = (cur, prev) => (prev ? (cur - prev) / prev : null);
  const all = [...series.entries()].map(([site, s]) => ({
    site,
    ticker: ticker(site),
    close: s[SPAN - 1],
    prev: s[SPAN - 2],
    change: change(s[SPAN - 1], s[SPAN - 2]),
    spark: s,
    max: Math.max(...s),
  }));

  const listed = all.filter((r) => r.close > 0).sort((a, b) => b.close - a.close).slice(0, limit);
  // titoli in caduta libera: forti l'ora prima, assenti ora
  const fallen = all
    .filter((r) => r.close === 0 && r.prev >= 5)
    .sort((a, b) => b.prev - a.prev)
    .slice(0, 2)
    .map((r) => ({ ...r, change: -1 }));

  // ticker unici
  const seen = new Map();
  for (const r of [...listed, ...fallen]) {
    const n = seen.get(r.ticker) || 0;
    seen.set(r.ticker, n + 1);
    if (n) r.ticker = r.ticker.slice(0, 2) + (n + 1);
  }

  const idx = { close: index[SPAN - 1], prev: index[SPAN - 2], change: change(index[SPAN - 1], index[SPAN - 2]), spark: index };
  return { rows: [...listed, ...fallen], index: idx, from, comment: null };
}

const pct = (c) => `${c > 0 ? '+' : ''}${Math.round(c * 100)}%`;

export function fallbackMarketComment(m) {
  if (!m?.rows.length) return null;
  const up = m.rows.filter((r) => r.change != null && r.change > 0).sort((a, b) => b.change - a.change)[0];
  const down = m.rows.filter((r) => r.change != null && r.change < 0).sort((a, b) => a.change - b.change)[0];
  const fresh = m.rows.find((r) => r.change == null);
  const lead = m.rows[0];
  const parts = [`Seduta guidata da ${lead.ticker} con ${lead.close} scambi.`];
  if (up && up !== lead) parts.push(`Corre ${up.ticker} (${pct(up.change)}).`);
  if (down) parts.push(down.change === -1 ? `${down.ticker} sospeso: nessuno scambio.` : `Prese di beneficio su ${down.ticker} (${pct(down.change)}).`);
  else if (fresh && fresh !== lead) parts.push(`Debutto per ${fresh.ticker}.`);
  return parts.join(' ');
}
