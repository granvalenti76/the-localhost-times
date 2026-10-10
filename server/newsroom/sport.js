/**
 * The sports page: the hour as a match. Report cards (pagelle) for the apps and sites that played,
 * records broken ("most visits to chess.com in an hour"), and the games played on chess sites.
 * The marks and the records are computed here; the model only writes the one-line judgements.
 */
import { tr, lang } from '../i18n.js';
import { siteOf } from './cluster.js';
import { matchesOf } from './calls.js';
import { isGeneric, registrable } from './cluster.js';
import { hhmm, dayKey } from '../util.js';
import { columnVoice } from './voice.js';

const KEY = 'records';
/** A record counts only once the paper has seen enough editions, and the metric often enough. */
const MIN_EDITIONS = 12;
const MIN_OBS = 3;
const GAME_SITES = /(^|\.)(chess\.com|lichess\.org|chess24\.com)$/i;

const MIN = { site: 15, signals: 40, commands: 15, commits: 2, searches: 5, switches: 30, focus: 30, mailsOut: 3, photos: 10 };

/** The measurable things of an hour, each with the story it belongs to. */
export function metrics({ news, stats, time }) {
  const out = [];
  const visits = {};
  for (const e of news) if (e.source === 'safari' && e.kind === 'visit' && e.meta?.host) visits[siteOf(e.meta.host)] = (visits[siteOf(e.meta.host)] || 0) + 1;
  for (const [site, n] of Object.entries(visits)) {
    out.push({ key: `site:${site}`, kind: 'site', value: n, label: tr({ en: `Visits to ${site} in an hour`, it: `Visite a ${site} in un'ora` }), story: (s) => s.kind === 'site' && s.topic === site });
  }
  const commits = news.filter((e) => e.source === 'terminal' && e.meta?.family === 'git commit').length;
  const add = (key, kind, value, label, story) => { if (value) out.push({ key, kind, value, label, story }); };
  add('signals', 'signals', stats?.total || news.length, tr({ en: 'Signals in an hour', it: 'Segnali in un\'ora' }), () => false);
  add('commands', 'commands', stats?.commands || 0, tr({ en: 'Terminal commands in an hour', it: 'Comandi nel terminale in un\'ora' }), (s) => s.kind === 'session');
  add('commits', 'commits', commits, tr({ en: 'Commits in an hour', it: 'Commit in un\'ora' }), (s) => s.kind === 'session');
  add('searches', 'searches', stats?.searches || 0, tr({ en: 'Web searches in an hour', it: 'Ricerche sul web in un\'ora' }), (s) => s.kind === 'searches');
  add('mailsOut', 'mailsOut', stats?.mailsOut || 0, tr({ en: 'Emails sent in an hour', it: 'Email inviate in un\'ora' }), (s) => s.source === 'mail');
  add('photos', 'photos', news.filter((e) => e.source === 'photos' && e.kind === 'photo').length, tr({ en: 'Photos in an hour', it: 'Foto in un\'ora' }), (s) => s.kind === 'shots');
  if (time) {
    add('switches', 'switches', time.switches || 0, tr({ en: 'App switches in an hour', it: 'Cambi di app in un\'ora' }), (s) => s.kind === 'timesheet');
    if (time.longest?.app) {
      add(`focus:${time.longest.app}`, 'focus', time.longest.minutes, tr({ en: `Longest stretch on ${time.longest.app} (minutes)`, it: `Tratto più lungo su ${time.longest.app} (minuti)` }), (s) => s.kind === 'timesheet');
    }
  }
  return out;
}

const state = (store) => store.getSetting(KEY, { editions: 0, lastEd: null, keys: {} });

/** The best so far for a metric, leaving out what this same edition set (a reprint). */
const baseline = (k, editionId) => (k ? (k.best?.editionId === editionId ? k.prev : k.best) : null);

/**
 * At print: compare the hour's metrics with the records. Updates the records (once per edition,
 * reprints included) and returns those broken, with the previous best.
 */
export function checkRecords(store, list, { editionId, at, single = true }) {
  const st = state(store);
  if (st.lastEd !== editionId) { st.editions = (st.editions || 0) + 1; st.lastEd = editionId; }
  const broken = [];
  if (single) {
    for (const m of list) {
      const k = st.keys[m.key] || { obs: 0, label: m.label };
      const first = k.lastEd !== editionId;
      const base = baseline(k, editionId);
      const obsBefore = first ? k.obs : k.obs - 1;
      if (first) { k.obs = (k.obs || 0) + 1; k.lastEd = editionId; }
      k.label = m.label;
      if (!base || m.value > base.value) {
        const counts = base && m.value >= (MIN[m.kind] || 1) && obsBefore >= MIN_OBS && st.editions >= MIN_EDITIONS;
        if (counts) broken.push({ key: m.key, kind: m.kind, label: m.label, value: m.value, prev: base.value, prevAt: base.at });
        k.prev = base || null;
        k.best = { value: m.value, at, editionId };
      } else if (k.best?.editionId === editionId) {
        // a reprint with a lower figure: the record goes back to what it was
        k.best = k.prev || null;
        k.prev = null;
        if (!k.best) delete k.best;
      }
      st.keys[m.key] = k;
    }
  }
  store.setSetting(KEY, st);
  return broken;
}

/** Records being broken right now (mid-hour), without touching the table: for the flash. */
export function peekRecords(store, list, editionId) {
  const st = state(store);
  if ((st.editions || 0) < MIN_EDITIONS) return [];
  const out = [];
  for (const m of list) {
    const k = st.keys[m.key];
    const base = baseline(k, editionId);
    if (base && (k.obs || 0) >= MIN_OBS && m.value > base.value && m.value >= (MIN[m.kind] || 1)) {
      out.push({ key: m.key, kind: m.kind, label: m.label, value: m.value, prev: base.value, prevAt: base.at });
    }
  }
  return out.sort((a, b) => b.value / Math.max(1, b.prev) - a.value / Math.max(1, a.prev));
}

/** All the records held, for the sports page. */
export function recordBook(store) {
  const st = state(store);
  return Object.entries(st.keys).filter(([, k]) => k.best && k.best.value >= (MIN[k.kind] || 1))
    .map(([key, k]) => ({ key, label: k.label, value: k.best.value, at: k.best.at, editionId: k.best.editionId }))
    .sort((a, b) => b.at - a.at);
}

const when = (ms) => {
  if (!ms) return '';
  const d = dayKey(ms);
  if (d === dayKey(Date.now())) return tr({ en: `today at ${hhmm(ms)}`, it: `oggi alle ${hhmm(ms)}` });
  return new Intl.DateTimeFormat(lang() === 'it' ? 'it-IT' : 'en-US', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(ms);
};

/** The line for a story's facts. */
export function recordFact(r) {
  return tr({
    en: `\nRECORD: ${r.label}: ${r.value}. The previous best was ${r.prev} (${when(r.prevAt)}).`,
    it: `\nPRIMATO: ${r.label}: ${r.value}. Il primato precedente era ${r.prev} (${when(r.prevAt)}).`,
  });
}

// ───────────────────────── Report cards ─────────────────────────

const half = (x) => Math.max(3.5, Math.min(9.5, Math.round(x * 2) / 2));
const lg = (n) => Math.log2(Math.max(1, n));
export const fmtVote = (v) => (lang() === 'it' ? String(v).replace('.', ',') : String(v));

/** The players of the hour and their marks (deterministic: the model only comments). */
export function reportCards({ stories, time, market, records = [] }) {
  const cards = [];
  const recordFor = (key) => records.some((r) => r.key === key);
  for (const s of stories.filter((x) => x.kind === 'site').slice(0, 3)) {
    const pages = s.pages || [];
    const generic = pages.filter((p) => p.generic).length;
    const ratio = pages.length ? generic / pages.length : 0;
    const vote = half(5.5 + Math.min(2, lg((s.informative || 0) + 1) * 0.7) - ratio * 1.6 + (recordFor(`site:${s.topic}`) ? 1 : 0));
    cards.push({ id: `site:${s.topic}`, name: s.topic, kind: 'site', vote, facts: { visits: s.events.length, pages: pages.length, generic, informative: s.informative || 0 } });
  }
  if (time?.apps?.length) {
    for (const a of time.apps.filter((x) => x.minutes >= 5).slice(0, 3)) {
      const longest = time.longest?.app === a.name ? time.longest.minutes : 0;
      const vote = half(5.5 + Math.min(2.5, longest / 18) + Math.min(1, a.minutes / 60) - Math.min(1.5, (time.switches || 0) / 60));
      cards.push({ id: `app:${a.name}`, name: a.name, kind: 'app', vote, facts: { minutes: a.minutes, longest, switches: time.switches || 0 } });
    }
  }
  const term = stories.find((s) => s.kind === 'session');
  if (term && term.serious >= 5) {
    cards.push({ id: 'terminal', name: tr({ en: 'The terminal', it: 'Il terminale' }), kind: 'terminal', vote: half(5.5 + Math.min(2, term.serious / 15) + Math.min(2, term.commits.length * 0.7)), facts: { commands: term.serious, commits: term.commits.length } });
  }
  const mail = stories.find((s) => s.kind === 'webmail' || s.kind === 'inbox');
  if (mail) {
    const unread = mail.kind === 'webmail' ? (mail.unreadEnd || 0) : (mail.unread || 0);
    cards.push({ id: 'mail', name: tr({ en: 'The inbox', it: 'La posta' }), kind: 'mail', vote: half(6.5 - Math.min(3, unread / 8)), facts: { unread, messages: mail.events.length } });
  }
  if (market?.rows?.length && !cards.some((c) => c.kind === 'site')) {
    const r = market.rows[0];
    cards.push({ id: `site:${r.site}`, name: r.site, kind: 'site', vote: half(5.5 + Math.min(2, lg(r.close) * 0.5)), facts: { visits: r.close, pages: 0, generic: 0, informative: 0 } });
  }
  for (const c of cards) c.line = cardLine(c);
  return cards.sort((a, b) => b.vote - a.vote).slice(0, 6);
}

/** The typesetting's judgement, in the voice of a sports paper. */
export function cardLine(c) {
  const f = c.facts;
  const en = lang() === 'en';
  const band = c.vote >= 8 ? 'top' : c.vote >= 6.5 ? 'good' : c.vote >= 5.5 ? 'ok' : 'bad';
  if (c.kind === 'site') {
    if (band === 'bad') return en ? `All possession, no shots on goal: ${f.generic} generic pages out of ${f.pages}.` : `Tanto possesso palla, nessun tiro in porta: ${f.generic} pagine generiche su ${f.pages}.`;
    if (band === 'top') return en ? `${f.informative} real pages read: runs the game.` : `${f.informative} pagine vere lette: detta i tempi della partita.`;
    if (band === 'good') return en ? `${f.visits} touches, a few flashes of quality.` : `${f.visits} tocchi, qualche lampo di classe.`;
    return en ? `Always there, ${f.visits} visits. Does the bare minimum.` : `Sempre presente, ${f.visits} visite. Fa il compitino.`;
  }
  if (c.kind === 'app') {
    if (band === 'top' || band === 'good') return f.longest ? (en ? `${f.longest} minutes without leaving the pitch. Tireless.` : `${f.longest} minuti senza mai uscire dal campo. Instancabile.`) : (en ? `${f.minutes} minutes, a tidy game.` : `${f.minutes} minuti, partita ordinata.`);
    if (band === 'ok') return en ? `${f.minutes} minutes, in and out of the game.` : `${f.minutes} minuti, entra ed esce dalla partita.`;
    return en ? `Subbed in and out ${f.switches} times in the hour: never finds the rhythm.` : `${f.switches} cambi in un'ora: non trova mai il ritmo.`;
  }
  if (c.kind === 'terminal') {
    if (f.commits) return en ? `${f.commits} commit${f.commits > 1 ? 's' : ''}: on the scoresheet.` : `${f.commits} commit: va a segno.`;
    return en ? `${f.commands} commands, lots of build-up play, no goal.` : `${f.commands} comandi, tanta manovra, niente gol.`;
  }
  if (c.kind === 'mail') {
    return f.unread ? (en ? `${f.unread} unread left on the bench.` : `${f.unread} non letti lasciati in panchina.`) : (en ? 'Clean sheet: nothing unread.' : 'Porta inviolata: nessun non letto.');
  }
  return '';
}

/** Games on chess sites, from the page titles. */
export function matchesFrom(stories) {
  const out = [];
  for (const s of stories.filter((x) => x.kind === 'site' && GAME_SITES.test(registrable(x.topic) || x.topic))) {
    const titled = (s.pages || []).map((p) => ({ t: p.clean || p.title, ts: p.ts })).filter((p) => !isGeneric(p.t, s.topic));
    for (const g of matchesOf(titled.map((p) => p.t))) {
      const at = titled.find((p) => p.t.includes(g.a) && p.t.includes(g.b))?.ts || s.first;
      out.push({ site: s.topic, a: g.a, b: g.b, opponent: g.opponent, at });
    }
  }
  return out.slice(0, 6);
}

/** The model's version of the one-liners (post-press, optional). */
export function cardsPrompt(cards, line) {
  const facts = cards.map((c) => `- id "${c.id}" · ${c.name} · ${tr({ en: 'mark', it: 'voto' })} ${fmtVote(c.vote)} · ${Object.entries(c.facts).map(([k, v]) => `${k} ${v}`).join(', ')}`).join('\n');
  return [
    {
      role: 'system',
      content: tr({
        en: `You write the report cards of The Localhost Times's sports page: the apps and sites of the hour judged like football players after a match (marks out of 10, already given). For each one write ONE line, at most 16 words: football metaphors, grounded in the facts given. ${columnVoice('sport')} Don't change the marks, don't invent numbers.${line?.notes ? `\nEditor's notes: ${line.notes}` : ''}
Reply ONLY with JSON: {"lines": {"<id>": "...", ...}}`,
        it: `Scrivi le pagelle della pagina sportiva del «The Localhost Times»: le app e i siti dell'ora giudicati come calciatori dopo una partita (i voti sono già dati, in decimi). Per ciascuno scrivi UNA riga, massimo 16 parole: metafore calcistiche, fondata sui fatti forniti. ${columnVoice('sport')} Non cambiare i voti, non inventare numeri.${line?.notes ? `\nNote del direttore: ${line.notes}` : ''}
Rispondi SOLO con JSON: {"lines": {"<id>": "...", ...}}`,
      }),
    },
    { role: 'user', content: facts },
  ];
}
