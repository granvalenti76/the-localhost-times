/**
 * "What was that thing I read on Tuesday?": the archive as a memory. The question is read for a
 * time ("on Tuesday", "ieri sera", "last month", "a marzo"), a kind of thing (a video, an
 * article, a book, a podcast, a command) and the words that remain; the matching pages, searches,
 * books and messages come back one per thing, with the link to the original page. The model, if
 * there is one, says which one it probably was; questions that count ("how many times…") go to
 * the archivist instead.
 */
import { tr, lang } from '../i18n.js';
import { search, ask, ftsQuery } from './archive.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { siteOf } from './cluster.js';
import { SECTIONS } from './sections.js';
import { dayKey, hhmm } from '../util.js';

const DAY = 24 * 3600e3;
// accents off before reading a question: "lunedì" is "lunedi", and \b works on it
const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const WEEKDAYS = [
  [/\b(sunday|domenica)\b/, 0], [/\b(monday|luned[iì])\b/, 1], [/\b(tuesday|marted[iì])\b/, 2], [/\b(wednesday|mercoled[iì])\b/, 3],
  [/\b(thursday|gioved[iì])\b/, 4], [/\b(friday|venerd[iì])\b/, 5], [/\b(saturday|sabato)\b/, 6],
];
const MONTHS = [
  /\b(january|gennaio)\b/, /\b(february|febbraio)\b/, /\b(march|marzo)\b/, /\b(april|aprile)\b/, /\b(may|maggio)\b/, /\b(june|giugno)\b/,
  /\b(july|luglio)\b/, /\b(august|agosto)\b/, /\b(september|settembre)\b/, /\b(october|ottobre)\b/, /\b(november|novembre)\b/, /\b(december|dicembre)\b/,
];
// the part of a day a question names, as hours
const PARTS = [
  [/\b(this morning|stamattina|stamane|in the morning|la mattina|di mattina|mattina)\b/, 5, 12],
  [/\b(afternoon|pomeriggio)\b/, 12, 18],
  [/\b(tonight|this evening|stasera|in the evening|evening|la sera|di sera|sera)\b/, 18, 24],
  [/\b(last night|stanotte|at night|di notte|notte)\b/, 0, 5],
];

const startOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const at = (day, h) => { const d = new Date(day); d.setHours(h, 0, 0, 0); return h === 24 ? startOf(day) + DAY : d.getTime(); };

/**
 * The time a question names, as a range (null: any time). Understands today, yesterday, a weekday
 * (the last one), "N days ago", this or last week and month, a month's name, and a part of the day.
 */
export function whenOf(question, now = Date.now()) {
  const q = fold(question);
  const today = startOf(now);
  let day = null;
  let range = null;
  let n;
  if ((n = /\b(\d{1,2})\s+(?:days?\s+ago|giorni\s+fa)\b/.exec(q))) day = startOf(today - Number(n[1]) * DAY + 3 * 3600e3);
  else if (/\b(the day before yesterday|l'altro ieri|altroieri|ieri l'altro)\b/.test(q)) day = startOf(today - 2 * DAY + 3 * 3600e3);
  else if (/\b(yesterday|ieri)\b/.test(q)) day = startOf(today - DAY + 3 * 3600e3);
  else if (/\b(today|oggi|stamattina|stamane|stasera|this morning|tonight)\b/.test(q)) day = today;
  else if (/\blast night\b|\bstanotte\b/.test(q)) day = today;
  else if ((n = /\b(?:last|ultimi|past|scorsi|negli ultimi)\s+(\d{1,3})\s+(?:days|giorni)\b/.exec(q))) range = { from: today - (Number(n[1]) - 1) * DAY, to: now };
  else if (/\b(last week|settimana scorsa|la scorsa settimana)\b/.test(q)) range = { from: today - 13 * DAY, to: today - 6 * DAY };
  else if (/\b(this week|questa settimana)\b/.test(q)) range = { from: today - 6 * DAY, to: now };
  else if (/\b(last month|mese scorso|il mese passato)\b/.test(q)) {
    const d = new Date(today); d.setDate(1); const thisMonth = d.getTime(); d.setMonth(d.getMonth() - 1);
    range = { from: d.getTime(), to: thisMonth };
  } else if (/\b(this month|questo mese)\b/.test(q)) {
    const d = new Date(today); d.setDate(1); range = { from: d.getTime(), to: now };
  } else {
    const wd = WEEKDAYS.find(([re]) => re.test(q));
    if (wd) {
      // the last such weekday before today ("on Tuesday", asked on a Tuesday, is a week ago)
      let d = today - DAY;
      while (new Date(d).getDay() !== wd[1]) d = startOf(d - DAY + 3 * 3600e3);
      day = d;
    } else {
      const m = MONTHS.findIndex((re) => re.test(q));
      if (m >= 0) {
        const ref = new Date(today);
        const year = m > ref.getMonth() ? ref.getFullYear() - 1 : ref.getFullYear();
        range = { from: new Date(year, m, 1).getTime(), to: Math.min(now, new Date(year, m + 1, 1).getTime()) };
      }
    }
  }
  const part = PARTS.find(([re]) => re.test(q));
  if (day != null) {
    range = part ? { from: at(day, part[1]), to: at(day, part[2]) } : { from: day, to: day + DAY };
    // "last night" asked in the morning is the evening before, into the night
    if (part && part[1] === 0 && /\blast night\b|\bstanotte\b/.test(q)) range = { from: at(day - DAY, 18), to: at(day, 5) };
  }
  return range;
}

// what kind of thing the question is after → which events
const KINDS = [
  { re: /\b(video|videos|youtube|filmato|filmati)\b/, where: (e) => /youtube\.com|youtu\.be|vimeo\.com/.test(e.host || '') },
  { re: /\b(podcast|podcasts|episode|episodio|puntata)\b/, source: 'podcasts' },
  { re: /\b(book|books|libro|libri|reading|leggevo)\b/, source: 'books' },
  { re: /\b(note|notes|nota|appunto|appunti)\b/, source: 'notes' },
  { re: /\b(mail|email|e-mail|message|messaggio|newsletter)\b/, source: 'mail' },
  { re: /\b(command|commands|comando|comandi|terminal|terminale)\b/, source: 'terminal' },
  { re: /\b(commit|commits|committed)\b/, source: 'git' },
  { re: /\b(searched|search|cercato|ricerca|googled|cercavo)\b/, kind: 'search' },
  { re: /\b(article|articolo|page|pagina|site|sito|post|thread|read|letto)\b/, source: 'safari' },
];

// the words of the question that ask, not say what: dropped before searching
const ASKING = /\b(what|which|where|who|was|were|that|thing|the|a|an|i|me|my|did|do|read|saw|seen|watched|heard|listened|found|looked|at|on|in|about|from|of|for|with|cos'era|cos|era|che|quel|quella|quello|quei|cosa|dove|chi|ho|avevo|letto|visto|guardato|sentito|ascoltato|trovato|cercato|su|di|del|della|dello|dei|delle|un|una|uno|il|lo|la|le|gli|i|per|con|in|a|da|mi|sono|quale|quali|sul|sullo|sulla|sui|sugli|sulle|nel|nello|nella|nei|negli|nelle|al|allo|alla|ai|agli|alle|dal|dalla|dai|dalle|used|use|usato|usare|again|ancora|remember|ricordi|ricordo|ricordare)\b/gi;
const TIMEWORDS = /\b(today|oggi|yesterday|ieri|the day before|l'altro|altroieri|last|this|next|scors[oa]|passat[oa]|quest[oa]|week|settimana|month|mese|days?|giorni?|ago|fa|morning|mattina|stamattina|stamane|afternoon|pomeriggio|evening|sera|stasera|tonight|night|notte|stanotte|sunday|monday|tuesday|wednesday|thursday|friday|saturday|domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|january|february|march|april|may|june|july|august|september|october|november|december|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|\d{1,3})\b/gi;

/** A question that counts or sums ("how many times…", "quanto tempo…") is the archivist's. */
export const isCounting = (q) => /\b(how many|how much|how often|how long|quante|quanti|quanto|quanta|quante volte|ogni quanto)\b/i.test(q);

/** The keywords of a question, without the asking, the time and the kind of thing. */
export function keywordsOf(q) {
  let k = fold(q).replace(/\b(l|un|dell|dall|nell|sull|all|quell|c|d)['’]/g, ' ').replace(/[?!.,;:«»“”"’']/g, ' ').replace(TIMEWORDS, ' ');
  for (const { re } of KINDS) k = k.replace(new RegExp(re.source, 'gi'), ' ');
  return k.replace(ASKING, ' ').replace(/\s+/g, ' ').trim();
}

/** One result per thing: the visits to a page, the times a search was typed, become one line. */
function group(items) {
  const m = new Map();
  for (const r of items) {
    // a page by its address; anything else by its title (a book opened and underlined is one book)
    const k = r.url ? r.url.replace(/#.*$/, '') : `${r.source}|${r.eventKind === 'search' ? 'search' : ''}|${String(r.title).toLowerCase()}`;
    const x = m.get(k);
    if (!x) m.set(k, { ...r, first: r.ts, last: r.ts, times: 1, site: r.host ? siteOf(r.host) : null });
    else { x.times++; x.first = Math.min(x.first, r.ts); x.last = Math.max(x.last, r.ts); }
  }
  return [...m.values()];
}

function recallPrompt(question, list) {
  const en = lang() === 'en';
  const lines = list.map((r, i) => `[${i + 1}] ${dayKey(r.first)} ${hhmm(r.first)}${r.times > 1 ? ` (×${r.times})` : ''} · ${r.site || r.section} · ${r.title}`).join('\n');
  const sys = en
    ? 'The owner of this Mac is trying to remember something they saw, read, heard or did. From the records below ONLY (numbered matches from their archive), say which one it most likely is, in one or two dry sentences, and cite it like [3]; mention a second candidate if it is close. If none fits, say so and suggest other words to try. Reply ONLY with JSON: {"answer": "...", "cited": [numbers]}'
    : 'Il proprietario di questo Mac cerca di ricordare qualcosa che ha visto, letto, ascoltato o fatto. SOLO in base ai documenti qui sotto (risultati numerati del suo archivio), di\' quale è con ogni probabilità, in una o due frasi asciutte, e citalo così: [3]; nomina un secondo candidato se è vicino. Se nessuno corrisponde, dillo e suggerisci altre parole da provare. Rispondi SOLO con JSON: {"answer": "...", "cited": [numeri]}';
  return [{ role: 'system', content: sys }, { role: 'user', content: `${en ? 'QUESTION' : 'DOMANDA'}: ${question}\n\n${lines}` }];
}

/**
 * Remember something. Returns { mode: 'recall', range, kind, keywords, results, answer, cited }
 * or, for a counting question, the archivist's answer with mode 'ask'.
 */
export async function recall(store, config, question, { log = console.log, llm: useLLM = true, now = Date.now() } = {}) {
  const q = String(question || '').trim().slice(0, 300);
  if (!q) return { mode: 'recall', results: [] };
  if (isCounting(q)) return { mode: 'ask', ...(await ask(store, config, q, log)) };
  const kind = KINDS.find((k) => k.re.test(fold(q))) || null;
  const keywords = keywordsOf(q);
  // with neither words nor a time ("that book I was reading"), the last month
  const range = whenOf(q, now) || (ftsQuery(keywords, { any: true }) ? null : { from: now - 30 * DAY, to: now });
  let items = [];
  if (ftsQuery(keywords, { any: true })) {
    // every word first, then any of them
    for (const any of [false, true]) {
      items = search(store, { q: keywords, any, kind: 'event', source: kind?.source || null, ...(range || {}), limit: 120 }).results;
      if (kind?.kind) items = items.filter((r) => r.eventKind === kind.kind);
      if (kind?.where) items = items.filter(kind.where);
      if (items.length) break;
    }
  } else if (range) {
    // no words ("what was that video on Tuesday evening?"): the things of that time
    const rows = store.db.prepare(`SELECT id FROM events WHERE ts >= ? AND ts < ? AND ((source = 'safari' AND kind IN ('visit', 'search')) OR source IN ('books', 'podcasts', 'notes', 'mail')) ${kind?.source ? 'AND source = ?' : ''} ORDER BY ts LIMIT 400`)
      .all(range.from, range.to, ...(kind?.source ? [kind.source] : []));
    const ids = new Set(rows.map((r) => r.id));
    items = enrichIds(store, [...ids]);
    if (kind?.kind) items = items.filter((r) => r.eventKind === kind.kind);
    if (kind?.where) items = items.filter(kind.where);
  }
  const results = group(items).sort((a, b) => b.times - a.times || b.last - a.last).slice(0, 25);
  const out = { mode: 'recall', question: q, range, kind: kind ? String(kind.re.source).match(/\((\w+)/)?.[1] : null, keywords, results };
  if (!results.length || !useLLM) return out;
  const llm = await connectLLM(config);
  if (!llm) return { ...out, offline: true };
  try {
    const j = parseJson(await chat(llm, config, recallPrompt(q, results.slice(0, 15)), 800));
    const cited = Array.isArray(j.cited) ? j.cited.map(Number).filter((n) => n >= 1 && n <= results.length) : [];
    return { ...out, answer: String(j.answer || '').trim() || null, cited, writer: llm.model };
  } catch (e) {
    log(tr({ en: `[recall] ${e.message}`, it: `[ricordi] ${e.message}` }));
    return out;
  }
}

/** Events by id, shaped like the archive's results. */
function enrichIds(store, ids) {
  if (!ids.length) return [];
  const st = store.db.prepare(`SELECT * FROM events WHERE id = ?`);
  return ids.map((id) => st.get(id)).filter(Boolean).map((e) => {
    const meta = JSON.parse(e.meta || '{}');
    return {
      kind: 'event', ts: e.ts, source: e.source, title: e.title, snippet: '', eventKind: e.kind,
      section: SECTIONS[e.source]?.name || e.source, host: meta.host || null, detail: e.detail,
      url: e.source === 'safari' && /^https?:/.test(e.url || '') ? e.url : null,
      editionId: store.editionAt(e.ts),
    };
  });
}
