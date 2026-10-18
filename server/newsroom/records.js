/**
 * Records: the measurable things of an edition ("most visits to chess.com in a day"), compared
 * with the best the paper has seen. A record broken becomes a fact of its story, and a flag on the page.
 */
import { tr, lang } from '../i18n.js';
import { siteOf } from './cluster.js';
import { hhmm, dayKey } from '../util.js';

const KEY = 'records';
/** A record counts only once the paper has seen enough editions, and the metric often enough. */
const MIN_EDITIONS = 12;
const MIN_OBS = 3;

const MIN = { site: 15, signals: 40, commands: 15, commits: 2, searches: 5, switches: 30, focus: 30, mailsOut: 3, photos: 10 };

/** "in an hour", "in a day", "in a week": records are kept per cadence, never mixed. */
const PER = {
  hourly: { en: 'in an hour', it: 'in un\'ora' },
  daily: { en: 'in a day', it: 'in un giorno' },
  weekly: { en: 'in a week', it: 'in una settimana' },
};

/** The measurable things of an edition, each with the story it belongs to. */
export function metrics({ news, stats, time, cadence = 'hourly' }) {
  const out = [];
  const per = PER[cadence] || PER.hourly;
  const L = (en, it) => tr({ en: `${en} ${per.en}`, it: `${it} ${per.it}` });
  // hourly records keep their old keys; the others are kept apart
  const K = (key) => (cadence === 'hourly' ? key : `${cadence}:${key}`);
  const visits = {};
  for (const e of news) if (e.source === 'safari' && e.kind === 'visit' && e.meta?.host) visits[siteOf(e.meta.host)] = (visits[siteOf(e.meta.host)] || 0) + 1;
  for (const [site, n] of Object.entries(visits)) {
    out.push({ key: K(`site:${site}`), kind: 'site', value: n, label: L(`Visits to ${site}`, `Visite a ${site}`), story: (s) => s.kind === 'site' && s.topic === site });
  }
  const commits = news.filter((e) => e.source === 'terminal' && e.meta?.family === 'git commit').length;
  const add = (key, kind, value, label, story) => { if (value) out.push({ key: K(key), kind, value, label, story }); };
  add('signals', 'signals', stats?.total || news.length, L('Signals', 'Segnali'), () => false);
  add('commands', 'commands', stats?.commands || 0, L('Terminal commands', 'Comandi nel terminale'), (s) => s.kind === 'session');
  add('commits', 'commits', commits, L('Commits', 'Commit'), (s) => s.kind === 'session');
  add('searches', 'searches', stats?.searches || 0, L('Web searches', 'Ricerche sul web'), (s) => s.kind === 'searches');
  add('mailsOut', 'mailsOut', stats?.mailsOut || 0, L('Emails sent', 'Email inviate'), (s) => s.source === 'mail');
  add('photos', 'photos', news.filter((e) => e.source === 'photos' && e.kind === 'photo').length, L('Photos', 'Foto'), (s) => s.kind === 'shots');
  if (time) {
    add('switches', 'switches', time.switches || 0, L('App switches', 'Cambi di app'), (s) => s.kind === 'timesheet');
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
