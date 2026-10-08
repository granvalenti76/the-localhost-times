/**
 * Spotlight's nose: deterministic detectors that look across days of signals for something the
 * owner may not have noticed. Each detector returns candidates ("leads"): a key, a subject, the
 * evidence (real events) and the numbers. No model here: the model judges and writes later.
 *
 *   cross      one rare subject showing up in different apps (searched, mailed, downloaded, noted)
 *   obsession  a site, show, book or project coming back far more often than usual
 *   intent     searches that reveal a plan (comparisons, prices, reviews, flights)
 *   vanish     something that was part of every day and has gone quiet
 *   habit      when the day starts and ends, nights, how the time is split between apps
 */
import { tr, lang } from '../../i18n.js';
import { siteOf } from '../cluster.js';
import { SECTIONS } from '../sections.js';
import { dayKey, hhmm } from '../../util.js';

const DAY = 24 * 3600e3;
const HOUR = 3600e3;
export const RECENT_DAYS = 4; // "now": the last four days
export const HISTORY_DAYS = 21; // what "usual" is measured against

// ---------------------------------------------------------------------------------------------
// Words

const STOP = new Set(`
about above after again against also always among another anything around away back because been before being below
between both came come could does doing done down during each even ever every first from further getting given goes going
good great have having here hers herself himself into itself just know last least less like made make many maybe more
most much must myself need never next none nothing only other ours over own part please same should since some still such
take than that their theirs them then there these they thing things this those though through today together tomorrow
under until upon very want were what whatever when where whether which while whom whose will with within without would
yesterday your yours yourself
anche ancora allora altra altre altri altro avere aveva cioè come comunque contro cosa cose dalla dalle dallo degli della
delle dello dentro dopo dove dunque essere fare fatto fino forse frattempo infatti inoltre insieme intanto loro mentre
molto nella nelle nello nessuno niente noi nostro ogni oggi ora oppure perché perche però piu più poco poi prima proprio
quale quali qualcosa quando quanto quella quelle quelli quello questa queste questi questo quindi sempre senza siamo sono
sopra sotto stato stessa stesso subito sulla sulle sullo tanto tempo tutta tutte tutti tutto verso vostro
home page pagina login sign signin account accedi registrati welcome benvenuto official ufficiale online free gratis
video videos youtube google search ricerca risultati results gmail inbox posta mail email newsletter news notizie
http https html index untitled senza titolo nuova nuovo note nota draft bozza document documento file files download
week settimana month mese year anno days giorni hours minutes minuti watch guarda live diretta update aggiornamento
times volte orari guide guida localhost giornale paper
`.split(/\s+/).filter(Boolean));

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** The words of a title worth following: 4+ letters, not stopwords, not the site's own name. */
export function terms(title, own = '') {
  const skip = new Set(norm(own).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const out = new Map(); // normalized → surface form
  for (const raw of String(title || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []) {
    const w = raw.replace(/['’-]+$/, '');
    const n = norm(w);
    if (n.length < 4 || /^\d+$/.test(n) || STOP.has(n) || skip.has(n)) continue;
    if (!out.has(n)) out.set(n, w);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Delicate subjects: Spotlight never opens a lead on them (health, money troubles, love and sex,
// faith, politics, the law, looking for another job). Better a missed scoop than a hurtful one.

const SENSITIVE = new RegExp([
  // health
  'medic', 'doctor', 'dottor', 'ospedal', 'hospital', 'clinic', 'sintom', 'symptom', 'malatt', 'disease', 'diagnos',
  'farmac', 'pharma', 'terapi', 'therap', 'psicolog', 'psychiat', 'psichiatr', 'ansia', 'anxiety', 'depress', 'cancro', 'cancer',
  'tumor', 'incinta', 'pregnan', 'gravidanz', 'aborto', 'abortion', 'pillola', 'dieta', 'diet\\b', 'calori', 'anoress', 'bulimi',
  'suicid', 'autolesion', 'self-harm', 'dolore', '\\bpain\\b', 'analisi del sangue', 'blood test', 'vaccin', 'covid', 'hiv',
  // money troubles
  'debit', '\\bdebt', 'prestit', '\\bloan', 'mutuo', 'mortgage', 'fallimento', 'bankrupt', 'pignorament', 'stipendi', 'salary',
  'tasse arretrate', 'equitalia', 'agenzia entrate', 'cartella esattoriale', 'gambling', 'scommess', 'casino', 'betting',
  // love, sex, family
  'dating', 'tinder', 'bumble', 'hinge', 'grindr', 'meetic', 'divorz', 'divorce', 'separazione', 'tradiment', 'cheating',
  'porn', '\\bsex', 'sesso', 'escort', 'onlyfans', 'nude', 'nudi',
  // faith, politics, the law
  'religion', 'religio', 'chiesa', 'church', 'moschea', 'mosque', 'sinagog', 'synagog', 'elezion', 'election', 'partito', 'votare',
  'avvocat', 'lawyer', 'attorney', 'denuncia', 'lawsuit', 'tribunal', '\\bcourt', 'polizia', 'police', 'arrest', 'carcere', 'prison',
  // another job
  'curriculum', '\\bcv\\b', 'resume', 'colloquio', 'job interview', 'dimission', 'resign', 'licenziam', 'fired', 'offerte di lavoro',
  'job offer', 'recruiter', 'headhunter', 'linkedin.com/jobs', 'indeed', 'infojobs', 'glassdoor',
].join('|'), 'i');

export const isSensitive = (text) => SENSITIVE.test(norm(text));

// ---------------------------------------------------------------------------------------------
// Helpers

const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|ecosia|yahoo|startpage|qwant|perplexity|chatgpt|claude)\./;
const UTILITY_SITES = new Set(['google.com', 'gmail.com', 'mail.google.com', 'icloud.com', 'localhost', 'apple.com', 'bing.com', 'duckduckgo.com']);
const SHOPS = /(amazon|ebay|subito|zalando|mediaworld|unieuro|euronics|idealo|trovaprezzi|etsy|aliexpress|ikea|decathlon|apple\.com\/shop|booking|airbnb|skyscanner|kayak|expedia|trainline|trenitalia|italotreno|ryanair|easyjet|ita-airways|lufthansa|backmarket|refurbed|vinted|leroymerlin|autoscout|immobiliare|idealista)/i;

/** Days between two timestamps, by calendar day. */
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const daysOf = (evs) => new Set(evs.map((e) => dayKey(e.ts)));
const fmtDay = (ms) => new Intl.DateTimeFormat(lang() === 'it' ? 'it-IT' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
const q = (s) => (lang() === 'it' ? `«${s}»` : `“${s}”`);
const secName = (s) => SECTIONS[s]?.name || s;

/** Visits close together (less than 30 minutes apart) make one session. */
export function sessions(evs, gap = 30 * 60e3) {
  const out = [];
  for (const e of [...evs].sort((a, b) => a.ts - b.ts)) {
    const last = out.at(-1);
    if (last && e.ts - last.at(-1).ts <= gap) last.push(e);
    else out.push([e]);
  }
  return out;
}

/** What a lead keeps of an event: enough to show it as an exhibit, nothing more. */
export const exhibit = (e) => ({
  id: e.id,
  ts: e.ts,
  source: e.source,
  kind: e.kind,
  title: String(e.title || '').slice(0, 140),
  host: e.meta?.host ? siteOf(e.meta.host) : null,
});

/** One exhibit per session (its first event) and the most recent ones: a readable file. */
function pickExhibits(evs, max = 14) {
  const per = sessions(evs).map((s) => s[0]);
  const chosen = new Map(per.map((e) => [e.id, e]));
  for (const e of [...evs].sort((a, b) => b.ts - a.ts)) {
    if (chosen.size >= max) break;
    chosen.set(e.id, e);
  }
  return [...chosen.values()].sort((a, b) => a.ts - b.ts).slice(-max).map(exhibit);
}

/** The entity an event belongs to, for obsession and vanish: a site, a show, a book, a project, a notes folder. */
function entityOf(e) {
  const m = e.meta || {};
  if (e.source === 'safari' && e.kind === 'visit' && m.host) {
    const s = siteOf(m.host);
    if (!s || UTILITY_SITES.has(s) || SEARCH_HOSTS.test(`.${s}`)) return null;
    return { key: `site:${s}`, label: s, type: 'site' };
  }
  if (e.source === 'podcasts' && m.show) return { key: `show:${norm(m.show)}`, label: m.show, type: 'show' };
  if (e.source === 'books' && e.title) return { key: `book:${norm(e.title)}`, label: e.title, type: 'book' };
  if (e.source === 'files' && (m.project || m.folder)) return { key: `project:${norm(m.project || m.folder)}`, label: m.project || m.folder, type: 'project' };
  if (e.source === 'terminal' && m.project) return { key: `project:${norm(m.project)}`, label: m.project, type: 'project' };
  if (e.source === 'notes' && m.folder) return { key: `folder:${norm(m.folder)}`, label: m.folder, type: 'folder' };
  return null;
}

/** The two windows every detector compares: "now" (recent) and "usual" (the days before). */
export function windows(events, now) {
  const recentFrom = startOfDay(now) - (RECENT_DAYS - 1) * DAY;
  const recent = events.filter((e) => e.ts >= recentFrom && e.ts <= now);
  const before = events.filter((e) => e.ts < recentFrom);
  const baseDays = daysOf(before).size;
  const recentDays = daysOf(recent).size;
  return { recentFrom, recent, before, baseDays, recentDays };
}

// ---------------------------------------------------------------------------------------------
// Detectors

/** One rare subject in different apps within a few days. */
export function detectCross(w) {
  const { recent, before, baseDays } = w;
  const usable = (e) => e.source !== 'journal' && e.source !== 'terminal' && e.kind !== 'inbox' && !(e.source === 'mail' && e.meta?.newsletter);
  const index = new Map(); // term → { surface, events: [] }
  for (const e of recent) {
    if (!usable(e)) continue;
    const own = [e.meta?.host, e.meta?.fromName, e.detail].filter(Boolean).join(' ');
    for (const [n, surface] of terms(e.title, own)) {
      const t = index.get(n) || { surface, events: [] };
      t.events.push(e);
      index.set(n, t);
    }
  }
  const baseCount = new Map();
  if (baseDays >= 2) {
    for (const e of before) {
      if (!usable(e)) continue;
      for (const n of terms(e.title).keys()) if (index.has(n)) baseCount.set(n, (baseCount.get(n) || 0) + 1);
    }
  }
  const ACTION = (e) => e.kind === 'search' || e.kind === 'sent' || e.source === 'notes' || e.kind === 'downloaded' || e.kind === 'created' || e.source === 'books' || e.source === 'podcasts';
  const found = [];
  for (const [n, t] of index) {
    const evs = t.events;
    const sources = new Set(evs.map((e) => e.source === 'mail' && e.kind === 'read' ? 'mail' : e.source));
    // with little history there is no "usual" to compare with: ask for a third app
    if (sources.size < (baseDays >= 2 ? 2 : 3) || evs.length < 3 || !evs.some(ACTION)) continue;
    const base = baseCount.get(n) || 0;
    // rare: it was (almost) absent before; with little history, we can't tell, and we accept it
    const perDayBefore = baseDays ? base / baseDays : 0;
    const perDayNow = evs.length / RECENT_DAYS;
    if (baseDays >= 2 && perDayBefore > 0 && perDayNow < perDayBefore * 3) continue;
    found.push({ n, surface: t.surface, evs, sources, base });
  }
  // terms that travel together (Tokyo, Giappone, Kyoto) become one lead
  found.sort((a, b) => b.evs.length * b.sources.size - a.evs.length * a.sources.size);
  const groups = [];
  for (const f of found) {
    const ids = new Set(f.evs.map((e) => e.id));
    const g = groups.find((x) => {
      const inter = [...ids].filter((i) => x.ids.has(i)).length;
      return inter / Math.min(ids.size, x.ids.size) >= 0.5;
    });
    if (g) {
      g.labels.push(f.surface);
      for (const e of f.evs) if (!g.ids.has(e.id)) { g.ids.add(e.id); g.evs.push(e); }
      f.sources.forEach((s) => g.sources.add(s));
    } else {
      groups.push({ key: f.n, labels: [f.surface], ids, evs: [...f.evs], sources: new Set(f.sources), base: f.base });
    }
  }
  return groups.slice(0, 6).map((g) => {
    const subject = g.labels.slice(0, 2).join(' / ');
    const bySource = {};
    for (const e of g.evs) bySource[e.source] = (bySource[e.source] || 0) + 1;
    const srcText = Object.entries(bySource).map(([s, c]) => `${secName(s)} ${c}`).join(', ');
    const days = daysOf(g.evs);
    return {
      key: `cross:${g.key}`,
      kind: 'cross',
      subject,
      hypothesis: tr({
        en: `${q(subject)} shows up in ${g.sources.size} different apps in a few days: something is being planned or followed.`,
        it: `${q(subject)} compare in ${g.sources.size} app diverse in pochi giorni: qualcosa si sta preparando o seguendo.`,
      }),
      evidence: pickExhibits(g.evs, 18),
      facts: [
        tr({ en: `Signals on the subject in the last ${RECENT_DAYS} days: ${g.evs.length}, on ${days.size} days`, it: `Segnali sull'argomento negli ultimi ${RECENT_DAYS} giorni: ${g.evs.length}, in ${days.size} giorni` }),
        tr({ en: `Apps where it appears: ${g.sources.size} (${srcText})`, it: `App in cui compare: ${g.sources.size} (${srcText})` }),
        g.base
          ? tr({ en: `In the ${w.baseDays} days before: ${g.base} signals`, it: `Nei ${w.baseDays} giorni precedenti: ${g.base} segnali` })
          : w.baseDays >= 2 ? tr({ en: `In the ${w.baseDays} days before: never`, it: `Nei ${w.baseDays} giorni precedenti: mai` }) : null,
        tr({ en: `Words that travel together: ${g.labels.slice(0, 5).join(', ')}`, it: `Parole che viaggiano insieme: ${g.labels.slice(0, 5).join(', ')}` }),
      ].filter(Boolean),
      strength: Math.min(1, (g.sources.size - 1) / 2 * 0.6 + (g.base === 0 && w.baseDays >= 2 ? 0.4 : 0.15)),
      sources: [...g.sources],
    };
  });
}

/** Something coming back far more often than usual. */
export function detectObsession(w) {
  const { recent, before, baseDays } = w;
  const now = new Map();
  for (const e of recent) {
    const ent = entityOf(e);
    if (!ent) continue;
    const x = now.get(ent.key) || { ...ent, evs: [] };
    x.evs.push(e);
    now.set(ent.key, x);
  }
  const usual = new Map();
  for (const e of before) {
    const ent = entityOf(e);
    if (ent && now.has(ent.key)) usual.set(ent.key, (usual.get(ent.key) || 0) + 1);
  }
  const out = [];
  for (const x of now.values()) {
    const ss = sessions(x.evs);
    const days = daysOf(x.evs);
    if (ss.length < 4 || days.size < 2) continue;
    const base = usual.get(x.key) || 0;
    const perDayBefore = baseDays ? base / baseDays : 0;
    const perDayNow = x.evs.length / RECENT_DAYS;
    const ratio = perDayBefore ? perDayNow / perDayBefore : null;
    // "more than usual" needs a usual: at least three days on record before
    if (baseDays < 3) continue;
    if (ratio != null && ratio < 2.5) continue; // it was already like this
    const pages = new Set(x.evs.map((e) => norm(e.title))).size;
    const perSession = Math.round((x.evs.length / ss.length) * 10) / 10;
    const lengths = ss.map((s) => s.at(-1).ts - s[0].ts);
    const shortSessions = lengths.filter((l) => l < 5 * 60e3).length;
    const hours = {};
    for (const s of ss) { const h = new Date(s[0].ts).getHours(); hours[h] = (hours[h] || 0) + 1; }
    const topHour = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
    const evening = ss.filter((s) => new Date(s[0].ts).getHours() >= 19).length;
    out.push({
      key: `obsession:${x.key}`,
      kind: 'obsession',
      subject: x.label,
      hypothesis: tr({
        en: `${q(x.label)} keeps coming back: ${ss.length} separate returns in ${days.size} days${ratio ? `, ${Math.round(ratio * 10) / 10} times the usual rate` : ''}.`,
        it: `${q(x.label)} continua a tornare: ${ss.length} ritorni separati in ${days.size} giorni${ratio ? `, ${String(Math.round(ratio * 10) / 10).replace('.', ',')} volte il ritmo abituale` : ''}.`,
      }),
      evidence: pickExhibits(x.evs, 16),
      facts: [
        tr({ en: `Returns (separate sessions) in the last ${RECENT_DAYS} days: ${ss.length}, on ${days.size} days`, it: `Ritorni (sessioni separate) negli ultimi ${RECENT_DAYS} giorni: ${ss.length}, in ${days.size} giorni` }),
        tr({ en: `Signals: ${x.evs.length}; ${perSession} per session; ${pages} different pages or titles`, it: `Segnali: ${x.evs.length}; ${String(perSession).replace('.', lang() === 'it' ? ',' : '.')} per sessione; ${pages} pagine o titoli diversi` }),
        tr({ en: `Sessions shorter than 5 minutes: ${shortSessions} of ${ss.length}`, it: `Sessioni più brevi di 5 minuti: ${shortSessions} su ${ss.length}` }),
        topHour ? tr({ en: `Most frequent hour: ${String(topHour[0]).padStart(2, '0')}:00 (${topHour[1]} sessions); after 19:00: ${evening}`, it: `Ora più frequente: le ${String(topHour[0]).padStart(2, '0')}:00 (${topHour[1]} sessioni); dopo le 19: ${evening}` }) : null,
        tr({ en: `Usual rate (${baseDays} days before): ${Math.round(perDayBefore * 10) / 10} a day; now: ${Math.round(perDayNow * 10) / 10} a day`, it: `Ritmo abituale (${baseDays} giorni prima): ${String(Math.round(perDayBefore * 10) / 10).replace('.', ',')} al giorno; ora: ${String(Math.round(perDayNow * 10) / 10).replace('.', ',')} al giorno` }),
      ].filter(Boolean),
      strength: Math.min(1, 0.35 + (ratio ? Math.min(0.4, (ratio - 2.5) / 10) : 0.4) + (shortSessions / ss.length) * 0.25),
      sources: [x.evs[0].source],
    });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

const INTENT = /\b(vs|versus|contro|oppure|migliore|migliori|best|top|prezzo|prezzi|price|prices|costo|costa|cost|recensione|recensioni|review|reviews|opinioni|offerta|offerte|deal|deals|sconto|sconti|discount|comprare|compra|buy|acquist\w*|noleggio|rent|affitto|volo|voli|flight|flights|hotel|biglietti|biglietto|tickets?|corso|corsi|course|alternativa|alternative|alternatives|confronto|compare|comparison|specifiche|specs|usato|used|refurbished|ricondizionat\w*|abbonamento|subscription|iscrizione|prenota\w*|booking)\b/i;

/** Searches that reveal a plan. */
export function detectIntent(w) {
  const searches = w.recent.filter((e) => e.kind === 'search' && INTENT.test(e.title || ''));
  if (searches.length < 3) return [];
  const byTerm = new Map();
  for (const e of searches) {
    for (const [n, surface] of terms(String(e.title).replace(INTENT, ' '))) {
      const x = byTerm.get(n) || { surface, evs: [] };
      x.evs.push(e);
      byTerm.set(n, x);
    }
  }
  const out = [];
  const used = new Set();
  for (const [n, x] of [...byTerm.entries()].sort((a, b) => b[1].evs.length - a[1].evs.length)) {
    if (x.evs.length < 3 || x.evs.every((e) => used.has(e.id))) continue;
    const ss = sessions(x.evs);
    const days = daysOf(x.evs);
    if (ss.length < 2 && days.size < 2) continue;
    x.evs.forEach((e) => used.add(e.id));
    // pages that follow the searches: shops, or titles that mention the subject
    const after = w.recent.filter((e) => e.source === 'safari' && e.kind === 'visit' && e.ts >= x.evs[0].ts
      && (SHOPS.test(e.url || e.meta?.host || '') || norm(e.title).includes(n)));
    const shops = [...new Set(after.filter((e) => SHOPS.test(e.url || e.meta?.host || '')).map((e) => siteOf(e.meta?.host || '')))].filter(Boolean);
    const markers = [...new Set(x.evs.flatMap((e) => (String(e.title).match(new RegExp(INTENT.source, 'gi')) || []).map((m) => m.toLowerCase())))];
    out.push({
      key: `intent:${n}`,
      kind: 'intent',
      subject: x.surface,
      hypothesis: tr({
        en: `${x.evs.length} searches about ${q(x.surface)} with words like ${markers.slice(0, 3).map(q).join(', ')}: a decision is being made.`,
        it: `${x.evs.length} ricerche su ${q(x.surface)} con parole come ${markers.slice(0, 3).map(q).join(', ')}: si sta prendendo una decisione.`,
      }),
      evidence: pickExhibits([...x.evs, ...after.slice(0, 10)], 18),
      facts: [
        tr({ en: `Searches on the subject: ${x.evs.length}, in ${ss.length} sessions over ${days.size} days`, it: `Ricerche sull'argomento: ${x.evs.length}, in ${ss.length} sessioni su ${days.size} giorni` }),
        tr({ en: `Decision words used: ${markers.join(', ')}`, it: `Parole da decisione usate: ${markers.join(', ')}` }),
        shops.length ? tr({ en: `Shops or booking sites visited afterwards: ${shops.join(', ')}`, it: `Negozi o siti di prenotazione visitati dopo: ${shops.join(', ')}` }) : tr({ en: 'No shop visited yet', it: 'Nessun negozio ancora visitato' }),
        tr({ en: `Pages about it visited after the first search: ${after.length}`, it: `Pagine sull'argomento visitate dopo la prima ricerca: ${after.length}` }),
        tr({ en: `First search: ${dayKey(x.evs[0].ts)} ${hhmm(x.evs[0].ts)}; latest: ${dayKey(x.evs.at(-1).ts)} ${hhmm(x.evs.at(-1).ts)}`, it: `Prima ricerca: ${dayKey(x.evs[0].ts)} ${hhmm(x.evs[0].ts)}; ultima: ${dayKey(x.evs.at(-1).ts)} ${hhmm(x.evs.at(-1).ts)}` }),
      ],
      strength: Math.min(1, 0.3 + Math.min(0.3, x.evs.length / 20) + (shops.length ? 0.3 : 0) + (days.size > 1 ? 0.1 : 0)),
      sources: ['safari'],
    });
  }
  return out.slice(0, 4);
}

/** Something that was part of every day and has gone quiet. */
export function detectVanish(w) {
  const { recent, before, baseDays, recentDays } = w;
  if (baseDays < 5 || recentDays < 2) return [];
  // the Mac is in use: otherwise silence means nothing
  const perDayBefore = before.length / baseDays;
  const perDayNow = recent.length / Math.max(1, recentDays);
  if (perDayNow < perDayBefore * 0.4) return [];
  const seenNow = new Set(recent.map(entityOf).filter(Boolean).map((x) => x.key));
  const hist = new Map();
  for (const e of before) {
    const ent = entityOf(e);
    if (!ent || seenNow.has(ent.key)) continue;
    const x = hist.get(ent.key) || { ...ent, evs: [] };
    x.evs.push(e);
    hist.set(ent.key, x);
  }
  const out = [];
  for (const x of hist.values()) {
    const days = daysOf(x.evs);
    if (x.evs.length < 15 || days.size < Math.max(4, baseDays * 0.4)) continue;
    const last = x.evs.reduce((a, e) => (e.ts > a.ts ? e : a));
    const silentDays = Math.floor((w.now - last.ts) / DAY);
    out.push({
      key: `vanish:${x.key}`,
      kind: 'vanish',
      subject: x.label,
      hypothesis: tr({
        en: `${q(x.label)} was there on ${days.size} of ${baseDays} days, then nothing for ${silentDays} days.`,
        it: `${q(x.label)} c'era in ${days.size} giorni su ${baseDays}, poi più niente da ${silentDays} giorni.`,
      }),
      evidence: pickExhibits(x.evs, 14),
      facts: [
        tr({ en: `Active on ${days.size} of the ${baseDays} days on record before; ${x.evs.length} signals`, it: `Presente in ${days.size} dei ${baseDays} giorni registrati prima; ${x.evs.length} segnali` }),
        tr({ en: `Last seen: ${fmtDay(last.ts)} at ${hhmm(last.ts)} (${q(String(last.title || '').slice(0, 60))})`, it: `Ultima volta: ${fmtDay(last.ts)} alle ${hhmm(last.ts)} (${q(String(last.title || '').slice(0, 60))})` }),
        tr({ en: `Days of silence: ${silentDays}, while the Mac was in use (${recent.length} other signals)`, it: `Giorni di silenzio: ${silentDays}, mentre il Mac era in uso (${recent.length} altri segnali)` }),
      ],
      strength: Math.min(1, 0.4 + Math.min(0.4, days.size / baseDays) + Math.min(0.2, silentDays / 20)),
      sources: [x.evs[0].source],
    });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 3);
}

/** When the day starts and ends, nights, and how the time is split between apps. */
export function detectHabits(w) {
  const { recent, before, baseDays, recentDays } = w;
  if (baseDays < 5 || recentDays < 3) return [];
  const out = [];
  // a "day" runs from 05:00 to 05:00, so that a late night belongs to the day before
  const dayOf = (ts) => dayKey(ts - 5 * HOUR);
  const bounds = (evs) => {
    const m = new Map();
    for (const e of evs) {
      const k = dayOf(e.ts);
      const mins = ((new Date(e.ts).getHours() - 5 + 24) % 24) * 60 + new Date(e.ts).getMinutes();
      const b = m.get(k) || { first: Infinity, last: -Infinity, n: 0, firstEv: null, lastEv: null };
      if (mins < b.first) { b.first = mins; b.firstEv = e; }
      if (mins > b.last) { b.last = mins; b.lastEv = e; }
      b.n++;
      m.set(k, b);
    }
    return [...m.values()].filter((b) => b.n >= 10);
  };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const clock = (mins) => { const t = (mins + 5 * 60) % (24 * 60); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  const bNow = bounds(recent);
  const bBefore = bounds(before);
  if (bNow.length >= 3 && bBefore.length >= 4) {
    for (const [which, keyName] of [['first', 'start'], ['last', 'end']]) {
      const now = median(bNow.map((b) => b[which]));
      const then = median(bBefore.map((b) => b[which]));
      const shift = now - then;
      if (Math.abs(shift) < 60) continue;
      const later = shift > 0;
      const subject = keyName === 'start'
        ? tr({ en: later ? 'The day starts later' : 'The day starts earlier', it: later ? 'La giornata comincia più tardi' : 'La giornata comincia prima' })
        : tr({ en: later ? 'The evenings get longer' : 'The evenings get shorter', it: later ? 'Le serate si allungano' : 'Le serate si accorciano' });
      out.push({
        key: `habit:${keyName}-${later ? 'later' : 'earlier'}`,
        kind: 'habit',
        subject,
        hypothesis: tr({
          en: `${keyName === 'start' ? 'The first signal of the day' : 'The last signal of the day'} has moved from about ${clock(then)} to about ${clock(now)}.`,
          it: `${keyName === 'start' ? 'Il primo segnale della giornata' : 'L\'ultimo segnale della giornata'} si è spostato da circa le ${clock(then)} a circa le ${clock(now)}.`,
        }),
        evidence: bNow.map((b) => exhibit(b[which === 'first' ? 'firstEv' : 'lastEv'])).sort((a, b) => a.ts - b.ts),
        facts: [
          tr({ en: `Usual time (median of ${bBefore.length} days before): ${clock(then)}`, it: `Orario abituale (mediana di ${bBefore.length} giorni prima): ${clock(then)}` }),
          tr({ en: `Time in the last ${bNow.length} days (median): ${clock(now)}`, it: `Orario negli ultimi ${bNow.length} giorni (mediana): ${clock(now)}` }),
          tr({ en: `Shift: ${Math.abs(Math.round(shift))} minutes ${later ? 'later' : 'earlier'}`, it: `Spostamento: ${Math.abs(Math.round(shift))} minuti ${later ? 'più tardi' : 'prima'}` }),
          tr({ en: `Day by day, recently: ${bNow.map((b) => clock(b[which])).join(', ')}`, it: `Giorno per giorno, di recente: ${bNow.map((b) => clock(b[which])).join(', ')}` }),
        ],
        strength: Math.min(1, 0.4 + Math.min(0.5, (Math.abs(shift) - 60) / 180)),
        sources: [],
      });
    }
  }
  // nights: signals between 00:30 and 05:00
  const isNight = (e) => { const d = new Date(e.ts); const m = d.getHours() * 60 + d.getMinutes(); return m >= 30 && m < 300; };
  const nightsNow = sessions(recent.filter(isNight), 90 * 60e3).filter((s) => s.length >= 5);
  const nightDaysBefore = daysOf(before.filter(isNight)).size;
  if (nightsNow.length >= 2 && nightDaysBefore / baseDays < 0.2) {
    const all = nightsNow.flat();
    const bySource = {};
    for (const e of all) bySource[e.source] = (bySource[e.source] || 0) + 1;
    out.push({
      key: 'habit:nights',
      kind: 'habit',
      subject: tr({ en: 'Awake at night', it: 'Svegli di notte' }),
      hypothesis: tr({
        en: `${nightsNow.length} nights in the last ${RECENT_DAYS} days with activity after half past midnight; before, it happened on ${nightDaysBefore} of ${baseDays} days.`,
        it: `${nightsNow.length} notti negli ultimi ${RECENT_DAYS} giorni con attività dopo mezzanotte e mezza; prima succedeva in ${nightDaysBefore} giorni su ${baseDays}.`,
      }),
      evidence: pickExhibits(all, 14),
      facts: [
        tr({ en: `Night sessions (00:30–05:00): ${nightsNow.length}; signals: ${all.length}`, it: `Sessioni notturne (00:30–05:00): ${nightsNow.length}; segnali: ${all.length}` }),
        tr({ en: `Latest night signal: ${hhmm(all.reduce((a, e) => { const m = (new Date(e.ts).getHours() * 60 + new Date(e.ts).getMinutes()); return m > a.m ? { m, ts: e.ts } : a; }, { m: -1, ts: all[0].ts }).ts)}`, it: `Segnale notturno più tardo: ${hhmm(all.reduce((a, e) => { const m = (new Date(e.ts).getHours() * 60 + new Date(e.ts).getMinutes()); return m > a.m ? { m, ts: e.ts } : a; }, { m: -1, ts: all[0].ts }).ts)}` }),
        tr({ en: `What was done at night: ${Object.entries(bySource).map(([s, c]) => `${secName(s)} ${c}`).join(', ')}`, it: `Cosa si faceva di notte: ${Object.entries(bySource).map(([s, c]) => `${secName(s)} ${c}`).join(', ')}` }),
        tr({ en: `Nights with activity before: ${nightDaysBefore} of ${baseDays} days`, it: `Notti con attività prima: ${nightDaysBefore} giorni su ${baseDays}` }),
      ],
      strength: Math.min(1, 0.45 + nightsNow.length * 0.12),
      sources: Object.keys(bySource),
    });
  }
  // how the time is split: an app whose share doubled or halved
  if (recent.length >= 150 && before.length >= 300) {
    const share = (evs) => { const c = {}; for (const e of evs) c[e.source] = (c[e.source] || 0) + 1; return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / evs.length])); };
    const sNow = share(recent);
    const sThen = share(before);
    for (const src of Object.keys(SECTIONS)) {
      const a = sThen[src] || 0;
      const b = sNow[src] || 0;
      if (a < 0.05 && b < 0.05) continue;
      const ratio = a ? b / a : null;
      if (ratio != null && ratio > 0.5 && ratio < 2) continue;
      if (ratio == null && b < 0.1) continue;
      const up = ratio == null || ratio >= 2;
      const pct = (x) => `${Math.round(x * 100)}%`;
      out.push({
        key: `habit:share-${src}-${up ? 'up' : 'down'}`,
        kind: 'habit',
        subject: tr({ en: `${secName(src)}: ${up ? 'taking over' : 'fading'}`, it: `${secName(src)}: ${up ? 'prende spazio' : 'perde terreno'}` }),
        hypothesis: tr({
          en: `${secName(src)} went from ${pct(a)} to ${pct(b)} of everything the Mac records.`,
          it: `${secName(src)} è passata da ${pct(a)} a ${pct(b)} di tutto ciò che il Mac registra.`,
        }),
        evidence: pickExhibits(recent.filter((e) => e.source === src), 10),
        facts: [
          tr({ en: `Share of all signals, ${baseDays} days before: ${pct(a)}`, it: `Quota di tutti i segnali, nei ${baseDays} giorni prima: ${pct(a)}` }),
          tr({ en: `Share in the last ${RECENT_DAYS} days: ${pct(b)}`, it: `Quota negli ultimi ${RECENT_DAYS} giorni: ${pct(b)}` }),
          tr({ en: `Signals now: ${recent.filter((e) => e.source === src).length} of ${recent.length}`, it: `Segnali ora: ${recent.filter((e) => e.source === src).length} su ${recent.length}` }),
        ],
        strength: Math.min(1, 0.35 + Math.min(0.4, Math.abs(Math.log2(ratio || 4)) / 4)),
        sources: [src],
      });
    }
  }
  return out;
}

export const DETECTORS = { cross: detectCross, obsession: detectObsession, intent: detectIntent, vanish: detectVanish, habit: detectHabits };

/** Every detector on the signals of the last weeks. Delicate subjects are dropped here, before anything is stored. */
export function detect(events, now = Date.now()) {
  const w = { ...windows(events, now), now };
  const out = [];
  for (const fn of Object.values(DETECTORS)) {
    try {
      out.push(...fn(w));
    } catch (e) {
      out.push({ error: `${fn.name}: ${e.message}` });
    }
  }
  return out.filter((c) => c.error || !isSensitive([c.subject, ...c.evidence.map((x) => `${x.title} ${x.host || ''}`)].join(' ')));
}

export { fmtDay, startOfDay, DAY };
