/**
 * The next edition, before it is printed: what has been collected so far, the stories forming,
 * and the editor's steering for that edition only (lead with a story, leave one out, a one-off
 * instruction to the writers). The steering is used when the edition is printed, then cleared.
 */
import { isAmbient } from './time.js';
import { tr, lang } from '../i18n.js';
import { buildStories } from './cluster.js';
import { getLine } from './line.js';
import { editionWindow, cleanEvents, DeskError, weightedStories, pickNews } from './edition.js';
import { cadenceOf, workHour, workId, maxArticlesFor } from './cadence.js';
import { hourStart, editionId, hhmm, dayKey } from '../util.js';
import { SECTIONS } from './sections.js';
import { siteOf } from './cluster.js';

const HOUR = 3600e3;
const KEY = 'steer';

/** The stories forming in the current hour (same window and weights as the next edition). */
export function formingStories(store, config, now = Date.now()) {
  const line = getLine(store);
  const { windowStart, id } = editionWindow(store, config, workHour(cadenceOf(line), now));
  const events = cleanEvents(store.eventsBetween(windowStart, now), config, line);
  const stories = weightedStories(events, line);
  return { stories, windowStart, editionId: id, line };
}

// ───────────────────────── Steering ─────────────────────────

const empty = (id) => ({ editionId: id, boost: [], bury: [], notes: [] });

/** The steering for an edition (empty if what is saved was meant for another edition). */
export function getSteer(store, id) {
  const s = store.getSetting(KEY, null);
  return s && s.editionId === id ? { ...empty(id), ...s } : empty(id);
}

export function saveSteer(store, steer) {
  store.setSetting(KEY, steer);
  return steer;
}

/** The edition was printed for good: its steering is spent. */
export function clearSteer(store, id) {
  const s = store.getSetting(KEY, null);
  if (s?.editionId === id) store.setSetting(KEY, null);
}

/** A quiet hour merged into the next one: the steering moves with it. */
export function carrySteer(store, fromId, toId) {
  const s = store.getSetting(KEY, null);
  if (s?.editionId === fromId) store.setSetting(KEY, { ...s, editionId: toId });
}

/** Stories with the steering applied: buried ones out, boosted ones on top (in the order chosen). */
export function applySteer(stories, steer) {
  if (!steer || (!steer.boost.length && !steer.bury.length)) return stories;
  const buried = new Set(steer.bury);
  const top = Math.max(1, ...stories.map((s) => s.weight));
  return stories
    .filter((s) => !buried.has(s.id))
    .map((s) => {
      const i = steer.boost.indexOf(s.id);
      return i < 0 ? s : { ...s, weight: top * 3 + (steer.boost.length - i), boosted: true };
    })
    .sort((a, b) => b.weight - a.weight);
}

/** The editorial line plus this edition's one-off instructions. */
export function steerLine(line, steer) {
  if (!steer?.notes?.length) return line;
  const head = tr({ en: 'For this edition only:', it: 'Solo per questa edizione:' });
  return { ...line, notes: [line.notes?.trim(), `${head} ${steer.notes.join(' · ')}`].filter(Boolean).join('\n') };
}

// ───────────────────────── The preview ─────────────────────────

/** A short, readable name for a story that has no headline yet. */
export function label(s) {
  const en = lang() === 'en';
  switch (s.kind) {
    case 'session': return `${en ? 'Terminal session' : 'Sessione nel terminale'}${s.families?.length ? ` (${s.families.slice(0, 2).map((f) => f.family).join(', ')})` : ''}`;
    case 'searches': return `${en ? 'Searches' : 'Ricerche'}: “${s.topic}”${s.events.length > 1 ? ` +${s.events.length - 1}` : ''}`;
    case 'roundup': return `${en ? 'Around the web' : 'Giro sul web'}: ${(s.sites || []).slice(0, 3).join(', ')}`;
    case 'inbox': return en ? 'Incoming mail' : 'Posta in arrivo';
    case 'thread': return `${en ? 'Email' : 'Mail'}: “${s.topic}”`;
    case 'folder': return `${en ? 'Folder' : 'Cartella'} ${s.project || s.topic}`;
    case 'project': return `${en ? 'Project' : 'Progetto'} ${s.topic}`;
    case 'dispatch': return `${en ? 'Dispatch' : 'Traccia'}: ${s.topic}`;
    case 'downloads': return en ? 'Downloads' : 'Download';
    default: return s.topic;
  }
}

/** The edition that the next press will print (the paper's cadence decides which; without a store, the current hour's). */
export const nextEditionId = (now = Date.now(), store = null) => (store ? workId(cadenceOf(getLine(store)), now) : editionId(hourStart(now)));

export function preview(store, config, { now = Date.now(), lastCollect = null, nextPress = null } = {}) {
  const line = getLine(store);
  const cad = cadenceOf(line);
  const hour = workHour(cad, now);
  const { id, end, maxMerge, windowStart } = editionWindow(store, config, hour);
  const events = cleanEvents(store.eventsBetween(windowStart, now), config, line);
  const steer = getSteer(store, id);
  const all = weightedStories(events, line);
  const ranked = applySteer(all, steer);
  const buried = all.filter((s) => steer.bury.includes(s.id));
  const max = maxArticlesFor(cad, config, line.strictness);
  const inPaper = new Set(pickNews(ranked, max, cad).main.map((s) => s.id));
  const news = events.filter((e) => !isAmbient(e)); // time and power are measurements, not signals
  const bySource = {};
  for (const e of news) bySource[e.source] = (bySource[e.source] || 0) + 1;
  const sites = {};
  for (const e of events) if (e.meta?.host) sites[siteOf(e.meta.host)] = (sites[siteOf(e.meta.host)] || 0) + 1;
  const covered = Math.max(1, Math.round((end - Math.max(windowStart, events[0] ? hourStart(events[0].ts) : hour)) / HOUR));
  const willMerge = cad.kind === 'hourly' && news.length < (config.edition.minEvents || 0) && covered < maxMerge;
  const brief = (s, i) => ({
    id: s.id,
    rank: i + 1,
    section: SECTIONS[s.source]?.name || s.source,
    source: s.source,
    kind: s.kind,
    topic: label(s),
    signals: s.events.length,
    weight: Math.round(s.weight * 10) / 10,
    first: s.first,
    last: s.last,
    inPaper: inPaper.has(s.id),
    boosted: !!s.boosted,
  });
  return {
    editionId: id,
    hour,
    windowStart,
    cadence: cad,
    printsAt: (cad.kind === 'hourly' && nextPress) || end + 30e3,
    minutesLeft: Math.max(0, Math.round((((cad.kind === 'hourly' && nextPress) || end + 30e3) - now) / 60e3)),
    lastCollect,
    total: news.length,
    bySource,
    topSites: Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([site, n]) => ({ site, n })),
    willMerge,
    minEvents: config.edition.minEvents || 0,
    stories: ranked.map(brief),
    buried: buried.map((s, i) => ({ ...brief(s, i), inPaper: false })),
    steer,
  };
}

/** The same preview, in words, for the managing editor. */
export function previewText(p) {
  const en = lang() === 'en';
  const src = Object.entries(p.bySource).map(([k, n]) => `${SECTIONS[k]?.name || k} ${n}`).join(', ') || '—';
  const lines = [
    en
      ? `NEXT EDITION ${p.editionId}: prints at about ${hhmm(p.printsAt)} (in ${p.minutesLeft} min). Signals collected so far: ${p.total} (${src}), since ${hhmm(p.windowStart)}${p.lastCollect ? `; last collection at ${hhmm(p.lastCollect)} (every 5 minutes)` : ''}.`
      : `PROSSIMA EDIZIONE ${p.editionId}: esce verso le ${hhmm(p.printsAt)} (tra ${p.minutesLeft} min). Segnali raccolti finora: ${p.total} (${src}), dalle ${hhmm(p.windowStart)}${p.lastCollect ? `; ultima raccolta alle ${hhmm(p.lastCollect)} (ogni 5 minuti)` : ''}.`,
    p.willMerge ? (en
      ? `With fewer than ${p.minEvents} signals it would not be printed: it would merge into the following edition.`
      : `Con meno di ${p.minEvents} segnali non uscirebbe: confluirebbe nell'edizione successiva.`) : '',
    p.topSites.length ? `${en ? 'Top sites' : 'Siti più visti'}: ${p.topSites.map((s) => `${s.site} ${s.n}`).join(', ')}` : '',
    en ? 'STORIES FORMING (in page order; weight = importance):' : 'STORIE IN FORMAZIONE (in ordine di pagina; peso = importanza):',
    ...p.stories.slice(0, 12).map((s) => `- ${s.rank}. id “${s.id}” [${s.section}, ${s.kind}] ${s.topic} — ${s.signals} ${en ? 'signals' : 'segnali'}, ${en ? 'weight' : 'peso'} ${s.weight}${s.boosted ? (en ? ', LEAD chosen by the editor' : ', APERTURA scelta dal direttore') : ''}${s.inPaper ? '' : (en ? ' (would not fit: briefs)' : ' (non entrerebbe: in breve)')}`),
    p.buried.length ? `${en ? 'Left out by the editor' : 'Escluse dal direttore'}: ${p.buried.map((s) => `“${s.id}”`).join(', ')}` : '',
    p.steer.notes.length ? `${en ? 'Instructions for this edition' : 'Indicazioni per questa edizione'}: ${p.steer.notes.join(' · ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** Steering changes from the newsroom page (or from an action approved in the meeting). */
export function steer(store, config, { op, story, text, index }, now = Date.now()) {
  const id = nextEditionId(now, store);
  const s = getSteer(store, id);
  const known = new Set(preview(store, config, { now }).stories.map((x) => x.id).concat(s.bury));
  const need = () => { if (!known.has(story)) throw new DeskError(tr({ en: 'That story is not in the next edition.', it: 'Questa storia non è nella prossima edizione.' }), 404); };
  switch (op) {
    case 'boost': need(); s.bury = s.bury.filter((x) => x !== story); s.boost = [story, ...s.boost.filter((x) => x !== story)]; break;
    case 'unboost': s.boost = s.boost.filter((x) => x !== story); break;
    case 'bury': need(); s.boost = s.boost.filter((x) => x !== story); s.bury = [...new Set([...s.bury, story])]; break;
    case 'unbury': s.bury = s.bury.filter((x) => x !== story); break;
    case 'note': {
      const t = String(text || '').trim().slice(0, 300);
      if (!t) throw new DeskError(tr({ en: 'The instruction is empty.', it: 'L\'indicazione è vuota.' }), 400);
      s.notes = [...s.notes, t].slice(-6);
      break;
    }
    case 'unnote': s.notes = s.notes.filter((_, i) => i !== Number(index)); break;
    case 'clear': Object.assign(s, empty(id)); break;
    default: throw new DeskError(tr({ en: 'Unknown steering', it: 'Indicazione sconosciuta' }), 400);
  }
  return saveSteer(store, s);
}

// ───────────────────────── Tools for the managing editor ─────────────────────────

/** What the managing editor can look up during the meeting. */
export function toolsHelp() {
  return tr({
    en: `- {"tool":"next_edition"}  the next edition before it is printed: signals collected so far, stories forming in page order, minutes left
- {"tool":"story","id":"<story id>"}  the facts behind a story (of the next edition or of the edition discussed)
- {"tool":"today"}  the day so far: editions, signals, sites
- {"tool":"search","query":"words","days":7}  search the archive
- {"tool":"spotlight"}  the Spotlight desk: the leads its reporters are following, how strong each is, the latest scoops`,
    it: `- {"tool":"next_edition"}  la prossima edizione prima che esca: segnali raccolti finora, storie in formazione in ordine di pagina, minuti mancanti
- {"tool":"story","id":"<id della storia>"}  i fatti dietro una storia (della prossima edizione o dell'edizione discussa)
- {"tool":"today"}  la giornata finora: edizioni, segnali, siti
- {"tool":"search","query":"parole","days":7}  cerca nell'archivio
- {"tool":"spotlight"}  la squadra Spotlight: le piste che i cronisti seguono, quanto è forte ciascuna, le ultime esclusive`,
  });
}

export function dayText(store, now = Date.now()) {
  const en = lang() === 'en';
  const day = dayKey(now);
  const eds = store.editionsForDay(day, { drafts: true });
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const counts = store.db.prepare(`SELECT source, COUNT(*) AS n FROM events WHERE ts >= ? GROUP BY source`).all(start.getTime());
  const total = counts.reduce((a, r) => a + r.n, 0);
  return [
    en ? `TODAY ${day}: ${total} signals (${counts.map((r) => `${SECTIONS[r.source]?.name || r.source} ${r.n}`).join(', ')}), ${eds.length} editions.`
      : `OGGI ${day}: ${total} segnali (${counts.map((r) => `${SECTIONS[r.source]?.name || r.source} ${r.n}`).join(', ')}), ${eds.length} edizioni.`,
    ...eds.map((e) => `- ${hhmm(e.hour)}: ${e.total} ${en ? 'signals, lead' : 'segnali, apertura'} “${e.lead || '—'}”`),
  ].join('\n');
}
