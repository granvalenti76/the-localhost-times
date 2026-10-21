/**
 * Subjects: what the owner was really busy with, across apps. A site is where something
 * happened; a subject is what it was about. Umberto Eco searched on Google, watched on YouTube,
 * asked of ChatGPT and read in Books is one story, not four: the subject finds the events that
 * speak of it (search queries, page titles, books, episodes, notes, mail subjects) and gathers
 * them, whatever app they came from.
 *
 * A term becomes a subject when it turns up in at least two different places (two sites, or a
 * site and an app), in at least three events with at least two different titles. Brand names
 * (YouTube, Google…) and the words of the web (video, login, official…) never are subjects.
 */
import { siteOf, registrable, isGeneric } from './cluster.js';

// the events a subject can be made of: what the owner read, asked, heard, wrote about
const TEXTUAL = {
  safari: new Set(['visit', 'search']),
  books: new Set(['opened', 'highlight']),
  podcasts: new Set(['listened']),
  notes: new Set(['created', 'edited']),
  mail: new Set(['received', 'sent', 'read']),
  journal: null, // private: never a subject
};

const STOP = new Set(`
the a an of to in on at for and or is are was were be been do does did how what when where which who why with from by about
into over under after before than then there here this that these those it its you your my our their his her we they not no yes
all any each every more most some such only very just also can could should would will may might new best top free online official
video videos watch youtube google search results result news home page pages login sign log account settings help support
download app apps review reviews vs versus guide tutorial full episode part live update updates today tomorrow yesterday week year
inbox mail email message messages reply re fwd fw untitled tab window new chat conversation thread post posts comments comment reddit
github pull request issue issues commit main master branch code file files docs documentation wiki wikipedia amazon shop store buy price
il lo la i gli le un uno una di a da in con su per tra fra e o ma che chi cosa come quando dove quanto perché perche non si sono è era
del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla
sui sugli sulle questo questa questi queste quello quella più meno anche solo già ancora sempre mai oggi ieri domani anno settimana
nuovo nuova nuovi nuove migliore migliori gratis ufficiale guarda cerca ricerca risultati notizie accedi accesso pagina messaggio posta
puntata episodio parte diretta recensione recensioni prezzo prezzi acquista negozio come fare cos cosa sito
film films movie movies series serie streaming trailer release released says said making make made other others fine source open
save compared launch personal testing community power developers developer people thing things world first last best great good
review watch season stagione capitolo chapter year years day days time times part show shows story stories life
read reading use using used get set run running find learn work works working example examples alternative alternatives
forecast weather meteo tempo complete completa completo social media digital network
`.split(/\s+/).filter(Boolean));

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** One word for its singular and plural (stilografica, stilografiche; pen, pens). */
const stem = (f) => (f.length >= 6 ? f.replace(/h[ei]$/, '').replace(/(es|[aeios])$/, '') : f.replace(/s$/, ''));

/** The words of a text, as they were written and folded, without the noise. */
function tokens(text) {
  const out = [];
  for (const m of String(text).matchAll(/[\p{L}][\p{L}\p{N}'’-]*[\p{L}\p{N}]|[\p{L}]{2,}/gu)) {
    const raw = m[0].replace(/['’]s$/i, '').replace(/^[a-z]{1,2}['’]/i, '');
    const f = fold(raw);
    out.push({ raw, f, s: stem(f), stop: STOP.has(f) || f.length < 3 || /^\d+$/.test(f) });
  }
  // a capital in the middle of a title is a name (a person, a book, a product), unless the title
  // capitalises every word, as English headlines do; "DeepSeek" is a name anywhere
  const words = out.filter((t) => !t.stop);
  const titleCase = words.length >= 3 && words.filter((t) => /^\p{Lu}/u.test(t.raw)).length >= words.length * 0.6;
  out.forEach((t, i) => { t.proper = (!titleCase && i > 0 && /^\p{Lu}\p{Ll}/u.test(t.raw)) || /\p{Ll}\p{Lu}/u.test(t.raw); });
  return out;
}

/** Where an event happened: one place per site, one per app. */
function placeOf(e) {
  if (e.source === 'safari') return e.kind === 'search' ? 'search' : siteOf(e.meta?.host || '');
  return e.source;
}

/** The text of an event that can speak of a subject (null: it can't). */
export function textOf(e) {
  const kinds = TEXTUAL[e.source];
  if (!kinds || !kinds.has(e.kind)) return null;
  if (e.source === 'safari' && e.kind === 'visit') {
    const site = siteOf(e.meta?.host || '');
    const t = String(e.title || '').replace(new RegExp(`\\s*[|\\-–—·:]\\s*(${registrable(site).split('.')[0]}|${site})[^|–—]*$`, 'i'), '').trim();
    return !t || isGeneric(t, site) ? null : t;
  }
  if (e.source === 'mail' && /^(no.?reply|newsletter)/i.test(e.meta?.from || '')) return null;
  // a book speaks of its author too
  if (e.source === 'books' && e.meta?.author) return `${e.title} — ${e.meta.author}`;
  return String(e.title || '').trim() || null;
}

/** The terms of a text: the words that matter, and the pairs of them ("umberto eco"). */
function termsOf(text, banned) {
  const tk = tokens(text);
  const out = new Map(); // stemmed term → { raw: as written, phrase: as folded, proper }
  for (let i = 0; i < tk.length; i++) {
    const a = tk[i];
    if (a.stop || banned.has(a.f) || a.f.length < 4) continue;
    out.set(a.s, { raw: a.raw, phrase: a.f, proper: a.proper });
    const b = tk[i + 1];
    if (b && !b.stop && !banned.has(b.f)) out.set(`${a.s} ${b.s}`, { raw: `${a.raw} ${b.raw}`, phrase: `${a.f} ${b.f}`, proper: a.proper || b.proper });
    // a name with a small word inside: "Il nome della rosa", "Lord of the Rings"
    const c = tk[i + 2];
    if (b && LINK.has(b.f) && c && !c.stop && !banned.has(c.f) && c.f.length >= 3) {
      out.set(`${a.s} ${c.s}`, { raw: `${a.raw} ${b.raw} ${c.raw}`, phrase: `${a.f} ${b.f} ${c.f}`, proper: a.proper || c.proper });
    }
  }
  return out;
}

const LINK = new Set(['of', 'the', 'de', 'di', 'del', 'della', 'dei', 'delle', 'degli', 'da', 'la', 'il', 'lo', 'le', 'and', 'e']);

/** The brand names of every site in the events: "youtube", "nytimes"… are places, not subjects. */
function brandsOf(events) {
  const out = new Set();
  for (const e of events) {
    const host = e.meta?.host;
    if (!host) continue;
    for (const part of registrable(siteOf(host)).split('.').slice(0, -1)) out.add(fold(part));
  }
  for (const w of ['safari', 'gmail', 'chatgpt', 'claude', 'openai', 'twitter', 'facebook', 'instagram', 'linkedin', 'netflix', 'spotify', 'apple', 'macos', 'iphone']) out.add(w);
  return out;
}

/** How a subject is written: its most common spelling, capitalised as the titles had it. */
function display(forms) {
  const counts = new Map();
  for (const f of forms) counts.set(f, (counts.get(f) || 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1] || (/[A-Z]/.test(b[0]) - /[A-Z]/.test(a[0])))[0][0];
  return /[A-Z]/.test(best) ? best : best.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

/**
 * The subjects among a set of events, strongest first.
 * @returns {{ key, label, terms: string[], events, places: Map<string, number>, score }[]}
 */
export function findSubjects(events, { max = 3 } = {}) {
  const banned = brandsOf(events);
  const texts = events.map((e) => [e, textOf(e)]).filter(([, t]) => t);
  const fixed = boilerplate(texts, banned);
  const byTerm = new Map(); // term → { events: Set, places: Set, titles: Set, forms: [] }
  for (const [e, text] of texts) {
    const own = fixed.get(placeOf(e));
    for (const [t, w] of termsOf(text, banned)) {
      if (own?.has(t.split(' ')[0]) || own?.has(t.split(' ')[1])) continue;
      let x = byTerm.get(t);
      if (!x) byTerm.set(t, (x = { term: t, events: new Set(), places: new Set(), titles: new Set(), forms: [], phrases: [], proper: 0, searched: 0 }));
      if (x.events.has(e)) continue;
      x.events.add(e);
      x.places.add(placeOf(e));
      x.titles.add(fold(text));
      x.forms.push(w.raw);
      x.phrases.push(w.phrase);
      if (w.proper) x.proper++;
      if (e.kind === 'search') x.searched++;
    }
  }
  // a single word is a subject if it reads as a name in the titles, or the owner typed it in a search twice;
  // a pair of words ("fountain pen", "intelligenza artificiale") is specific enough on its own
  // (or it was searched once and then found in three places or more)
  const specific = (x) => x.term.includes(' ') || x.proper >= x.events.size * 0.4 || x.searched >= 2 || (x.searched && x.places.size >= 3) || x.places.size >= 4;
  let cands = [...byTerm.values()].filter((x) => x.places.size >= 2 && x.events.size >= 3 && x.titles.size >= 2 && specific(x));
  // a pair that covers most of its words' events is the better name ("umberto eco" over "umberto")
  const pairs = cands.filter((x) => x.term.includes(' '));
  cands = cands.filter((x) => {
    if (x.term.includes(' ')) {
      const [a, b] = x.term.split(' ');
      // a pair that is mostly one of its words, plus noise, adds nothing
      return [a, b].every((w) => !byTerm.get(w) || x.events.size >= byTerm.get(w).events.size * 0.5);
    }
    return !pairs.some((p) => p.term.split(' ').includes(x.term) && p.events.size >= x.events.size * 0.6 && p.places.size >= x.places.size - 1);
  });
  const score = (x) => x.places.size * 2 + Math.log2(x.events.size) + (x.places.has('search') ? 1 : 0) + (x.term.includes(' ') ? 0.5 : 0);
  cands.sort((a, b) => score(b) - score(a));
  // terms that share most of their events are one subject ("eco" and "nome della rosa" in the same titles)
  const out = [];
  for (const x of cands) {
    // the same words joined or apart ("fountainpen", "fountain pen") are one subject too
    const same = out.find((s) => overlap(s.events, x.events) >= 0.6 || s.compact === x.term.replace(/\s+/g, ''));
    if (same) {
      for (const e of x.events) same.events.add(e);
      for (const p of x.places) same.places.add(p);
      same.terms.push(display(x.phrases));
      continue;
    }
    if (out.length >= max) continue;
    out.push({ compact: x.term.replace(/\s+/g, ''), key: fold(display(x.phrases)).replace(/\s+/g, '-'), label: display(x.forms), terms: [display(x.phrases)], events: new Set(x.events), places: new Set(x.places), score: score(x) });
  }
  // an event belongs to one subject only: the strongest that claims it
  const claimed = new Set();
  return out.map((s) => {
    const evs = [...s.events].filter((e) => !claimed.has(e)).sort((a, b) => a.ts - b.ts);
    evs.forEach((e) => claimed.add(e));
    const places = new Map();
    for (const e of evs) places.set(placeOf(e), (places.get(placeOf(e)) || 0) + 1);
    const { compact, ...rest } = s;
    return { ...rest, events: evs, places };
  }).filter((s) => s.events.length >= 3 && s.places.size >= 2);
}

/**
 * The words a site puts in all its titles ("The New York Times", a section name): words that are
 * in half the titles of a place with eight titles or more say where, not what.
 */
function boilerplate(texts, banned) {
  const byPlace = new Map();
  for (const [e, text] of texts) {
    const p = placeOf(e);
    if (!byPlace.has(p)) byPlace.set(p, new Set());
    byPlace.get(p).add(text);
  }
  const out = new Map();
  for (const [p, titles] of byPlace) {
    if (titles.size < 8 || p === 'search') continue;
    const n = new Map();
    for (const t of titles) for (const w of new Set([...termsOf(t, banned).keys()].filter((k) => !k.includes(' ')))) n.set(w, (n.get(w) || 0) + 1);
    out.set(p, new Set([...n].filter(([, c]) => c >= titles.size * 0.5).map(([w]) => w)));
  }
  return out;
}

function overlap(a, b) {
  let n = 0;
  for (const e of b) if (a.has(e)) n++;
  return n / Math.min(a.size, b.size);
}

/** The words to look a subject up by in the archive (its terms, as an FTS phrase each). */
export const subjectQuery = (s) => s.terms.slice(0, 2).map((t) => `"${fold(t).replace(/"/g, '')}"`).join(' OR ');

/**
 * The days a subject came up before this edition (the last `days` days), from the archive's
 * index: a subject seen on four of the last fourteen days is an interest, not a whim.
 */
export function subjectDays(store, s, { before, days = 14 } = {}) {
  const DAY = 24 * 3600e3;
  try {
    const rows = store.db.prepare(`SELECT ts FROM search WHERE search MATCH ? AND kind = 'event' AND ts >= ? AND ts < ?`)
      .all(subjectQuery(s), before - days * DAY, before);
    const seen = new Set(rows.map((r) => new Date(r.ts).toDateString()));
    return [...seen].map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** The subject's past, for the writer: on how many earlier days it came up, and since when. */
export function subjectPast(store, s, { before, lang = 'en' } = {}) {
  const seen = subjectDays(store, s, { before });
  if (!seen.length) return '';
  const fmt = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return lang === 'en'
    ? `\nEARLIER DAYS: the subject also came up on ${seen.length} of the previous 14 days (first on ${fmt.format(seen[0])}). A continuing interest, not a passing one.\n`
    : `\nGIORNI PRIMA: l'argomento è comparso anche in ${seen.length} dei 14 giorni precedenti (la prima volta ${fmt.format(seen[0])}). Un interesse che dura, non di passaggio.\n`;
}
