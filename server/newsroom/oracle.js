/**
 * The Oracle: every edition bets on the next hour ("he'll be back on chess.com before 19:00"),
 * and the next edition checks. The Editor can bet against it. Both scores are kept.
 *
 * Predictions are checkable rules computed from the signals, never the model's guesses:
 *   visit   a site visited again in the next hour
 *   more    more signals than the usual edition
 *   commit  at least one git commit
 *   beats   site A gets more visits than site B
 *   quiet   fewer signals than the usual edition
 */
import { tr, lang } from '../i18n.js';
import { siteOf } from './cluster.js';
import { DeskError } from './edition.js';
import { say } from './chatter.js';
import { hhmm, hash } from '../util.js';

const KEY = 'oracle';
const HOUR = 3600e3;
/** Bets close half an hour into the hour being predicted: after that it's not a bet, it's a look. */
const BETS_OPEN = 30 * 60e3;
const closes = (p) => p.from + BETS_OPEN;

const blank = () => ({ hits: 0, total: 0, streak: 0, best: 0, me: { hits: 0, total: 0 }, pending: [], recent: [] });
export const oracleState = (store) => ({ ...blank(), ...store.getSetting(KEY, {}) });

const visitsBySite = (events) => {
  const v = {};
  for (const e of events) if (e.source === 'safari' && e.kind === 'visit' && e.meta?.host) v[siteOf(e.meta.host)] = (v[siteOf(e.meta.host)] || 0) + 1;
  return v;
};
const isNews = (e) => !['apps', 'power'].includes(e.source);

/** How the rule went, over the events of the period it was about. */
export function judge(p, events) {
  const news = events.filter(isNews);
  const v = visitsBySite(news);
  switch (p.type) {
    case 'visit': return (v[p.site] || 0) > 0;
    case 'more': return news.length > p.n;
    case 'quiet': return news.length < p.n;
    case 'commit': return news.some((e) => e.source === 'terminal' && e.meta?.family === 'git commit');
    case 'beats': return (v[p.a] || 0) > (v[p.b] || 0);
    default: return false;
  }
}

/** The sentence of a prediction. */
export function phrase(p) {
  const en = lang() === 'en';
  const by = hhmm(p.due);
  switch (p.type) {
    case 'visit': return en ? `He'll be back on ${p.site} before ${by}.` : `Tornerà su ${p.site} entro le ${by}.`;
    case 'more': return en ? `The next edition will have more than ${p.n} signals.` : `La prossima edizione supererà i ${p.n} segnali.`;
    case 'quiet': return en ? `A quiet hour ahead: fewer than ${p.n} signals.` : `Ora tranquilla in arrivo: meno di ${p.n} segnali.`;
    case 'commit': return en ? `At least one commit before ${by}.` : `Almeno un commit entro le ${by}.`;
    case 'beats': return en ? `${p.a} will beat ${p.b} in the next hour.` : `Nella prossima ora ${p.a} batterà ${p.b}.`;
    default: return '';
  }
}

/** Candidate predictions for the hour after this edition, from this edition and the ones before. */
export function candidates({ events, recentTotals = [], end }) {
  const news = events.filter(isNews);
  const v = Object.entries(visitsBySite(news)).sort((a, b) => b[1] - a[1]);
  const due = end + HOUR;
  const out = [];
  if (v[0] && v[0][1] >= 5) out.push({ type: 'visit', site: v[0][0] });
  if (v[1] && v[1][1] >= 3 && v[0][1] - v[1][1] < v[0][1] * 0.6) out.push({ type: 'beats', a: v[1][0], b: v[0][0] }); // the outsider
  if (v[1] && v[1][1] >= 3) out.push({ type: 'beats', a: v[0][0], b: v[1][0] });
  const totals = [...recentTotals, news.length].filter((n) => n > 0).sort((a, b) => a - b);
  const median = totals.length ? totals[Math.floor(totals.length / 2)] : 0;
  if (median >= 10) out.push({ type: news.length >= median ? 'more' : 'quiet', n: median });
  if (news.some((e) => e.source === 'terminal' && e.meta?.family === 'git commit')) out.push({ type: 'commit' });
  return out.map((p) => ({ ...p, from: end, due }));
}

/** Pick two, the same way for the same edition (a reprint doesn't change its mind). */
function pickTwo(list, seed) {
  const h = parseInt(hash(seed), 16);
  const a = list.length ? list[h % list.length] : null;
  const rest = list.filter((x) => x !== a && x.type !== a?.type);
  const b = rest.length ? rest[(h >> 3) % rest.length] : null;
  return [a, b].filter(Boolean);
}

/**
 * At print: check the predictions whose hour has passed (with the events since they were made),
 * then make new ones. Returns what the edition shows: { results, predictions, score }.
 */
export function oracleRound(store, { editionId, events, eventsFor, recentTotals, end, now = Date.now() }) {
  const st = oracleState(store);
  // a reprint of the same edition: show what it showed, don't count twice
  if (st.lastEd === editionId && st.lastShown) return st.lastShown;
  const results = [];
  const still = [];
  for (const p of st.pending) {
    if (p.due > end) { still.push(p); continue; }
    const ok = judge(p, eventsFor(p.from, p.due));
    st.total++;
    if (ok) { st.hits++; st.streak = Math.max(0, st.streak) + 1; } else st.streak = Math.min(0, st.streak) - 1;
    st.best = Math.max(st.best || 0, st.streak);
    let me = null;
    if (p.bet != null) {
      me = p.bet === ok;
      st.me.total++;
      if (me) st.me.hits++;
    }
    results.push({ id: p.id, text: p.text, ok, bet: p.bet ?? null, me });
  }
  const fresh = pickTwo(candidates({ events, recentTotals, end }), editionId)
    .map((p) => ({ ...p, id: `${editionId}:${p.type}:${p.site || p.a || p.n || ''}`, text: phrase(p), madeIn: editionId, bet: null }));
  st.pending = [...still, ...fresh].slice(-8);
  st.recent = [...results, ...st.recent].slice(0, 20);
  const shown = { results, predictions: fresh.map((p) => ({ id: p.id, text: p.text, due: p.due, closes: closes(p) })), score: score(st) };
  st.lastEd = editionId;
  st.lastShown = shown;
  store.setSetting(KEY, st);
  if (results.length) {
    const hits = results.filter((r) => r.ok).length;
    say(store, 'oracle', hits === results.length
      ? tr({ en: `The Oracle: ${hits} out of ${results.length}. As foreseen.`, it: `L'Oracolo: ${hits} su ${results.length}. Come previsto.` })
      : hits === 0
        ? tr({ en: 'The Oracle: missed them all. The signals were unclear.', it: 'L\'Oracolo: sbagliate tutte. I segnali erano confusi.' })
        : tr({ en: `The Oracle: ${hits} out of ${results.length}. Not bad.`, it: `L'Oracolo: ${hits} su ${results.length}. Non male.` }), now);
  }
  return shown;
}

const view = (p) => ({ id: p.id, text: p.text, due: p.due, closes: closes(p), bet: p.bet });

export const score = (st) => ({
  hits: st.hits, total: st.total, pct: st.total ? Math.round((st.hits / st.total) * 100) : null, streak: st.streak, best: st.best || 0,
  me: { hits: st.me.hits, total: st.me.total, pct: st.me.total ? Math.round((st.me.hits / st.me.total) * 100) : null },
});

/** The Editor bets on a prediction: yes (it will happen) or no. */
export function bet(store, id, yes, now = Date.now()) {
  const st = oracleState(store);
  const p = st.pending.find((x) => x.id === id);
  if (!p) throw new DeskError(tr({ en: 'This prediction has already been settled.', it: 'Questo pronostico è già stato verificato.' }), 409);
  if (now >= closes(p)) throw new DeskError(tr({ en: 'Bets are closed.', it: 'Le scommesse sono chiuse.' }), 409);
  p.bet = !!yes;
  if (st.lastShown) st.lastShown = { ...st.lastShown, predictions: st.lastShown.predictions.map((x) => (x.id === id ? { ...x, bet: p.bet } : x)) };
  store.setSetting(KEY, st);
  return { id, bet: p.bet, pending: st.pending.map(view), score: score(st) };
}

/** For the page: the open predictions with the Editor's bets, and the scores. */
export function oracleBoard(store) {
  const st = oracleState(store);
  return { pending: st.pending.map(view), recent: st.recent.slice(0, 10), score: score(st) };
}
