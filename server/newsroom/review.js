/**
 * The Year in Review: the paper's annual, made from the archive. The subjects of every month, the
 * sites that became habits and the ones discovered along the way, the hours the Mac kept, the
 * books, the shows, the repositories. Numbers come from the archive; the model writes the
 * editorial and a headline for each month (the typesetting does, when the model is off).
 *
 * And "A year ago today": what the Mac was busy with on this date last year, for the front page.
 */
import { tr, lang } from '../i18n.js';
import { dayKey } from '../util.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { linePrompt, getLine } from './line.js';
import { findSubjects } from './subjects.js';
import { siteOf } from './cluster.js';

const DAY = 24 * 3600e3;
const TEXTUAL = `((source = 'safari' AND kind IN ('visit', 'search')) OR source IN ('books', 'podcasts', 'notes') OR (source = 'mail' AND kind IN ('received', 'sent', 'read')))`;

const rowsToEvents = (rows) => rows.map((r) => ({ ...r, meta: JSON.parse(r.meta || '{}') }));
const monthKey = (ms) => dayKey(ms).slice(0, 7);
const monthStart = (ms) => { const d = new Date(ms); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
const nextMonth = (ms) => { const d = new Date(ms); d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The sites of a period, by the number of days they were visited on. */
function sitesOf(store, from, to, limit = 12) {
  const rows = store.db.prepare(`SELECT json_extract(meta, '$.host') AS host, COUNT(DISTINCT ts / 86400000) AS days, COUNT(*) AS visits, MIN(ts) AS first
    FROM events WHERE source = 'safari' AND kind = 'visit' AND ts >= ? AND ts < ? GROUP BY host`).all(from, to);
  const bySite = new Map();
  for (const r of rows) {
    if (!r.host) continue;
    const site = siteOf(r.host);
    const x = bySite.get(site) || { site, days: 0, visits: 0, first: r.first };
    x.days = Math.max(x.days, r.days);
    x.visits += r.visits;
    x.first = Math.min(x.first, r.first);
    bySite.set(site, x);
  }
  return [...bySite.values()].sort((a, b) => b.days - a.days || b.visits - a.visits).slice(0, limit);
}

/** The archive's numbers for a period (by default the last twelve months). */
export function computeReview(store, { to = Date.now(), days = 365 } = {}) {
  const from = to - days * DAY;
  const span = store.db.prepare(`SELECT MIN(ts) AS first, MAX(ts) AS last, COUNT(*) AS n FROM events WHERE ts >= ? AND ts < ? AND source NOT IN ('apps', 'power')`).get(from, to);
  if (!span.n) return null;
  const count = (where, ...args) => store.db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts < ? AND ${where}`).get(from, to, ...args).n;
  const totals = {
    pages: count(`source = 'safari' AND kind = 'visit'`),
    searches: count(`source = 'safari' AND kind = 'search'`),
    mailsIn: count(`source = 'mail' AND kind = 'received'`),
    mailsOut: count(`source = 'mail' AND kind = 'sent'`),
    commands: count(`source = 'terminal'`),
    commits: count(`source = 'git' AND kind IN ('commit', 'merge', 'amend')`),
    notes: count(`source = 'notes' AND kind = 'created'`),
    photos: count(`source = 'photos' AND kind IN ('photo', 'video')`),
    screenshots: count(`source = 'photos' AND kind = 'screenshot'`),
    episodes: store.db.prepare(`SELECT COUNT(DISTINCT title) AS n FROM events WHERE source = 'podcasts' AND ts >= ? AND ts < ?`).get(from, to).n,
  };

  // the hours and the days of the week the Mac was busy, in local time
  const hours = Array(24).fill(0);
  const weekdays = Array(7).fill(0);
  const perDay = new Map();
  for (const { ts } of store.db.prepare(`SELECT ts FROM events WHERE ts >= ? AND ts < ? AND (${TEXTUAL} OR source IN ('terminal', 'git'))`).all(from, to)) {
    const d = new Date(ts);
    hours[d.getHours()]++;
    weekdays[d.getDay()]++;
    const k = dayKey(ts);
    perDay.set(k, (perDay.get(k) || 0) + 1);
  }
  const busiest = [...perDay].sort((a, b) => b[1] - a[1])[0] || null;
  const activeDays = perDay.size;

  // the subjects of every day, as the paper finds them; a month's and the year's are the ones
  // that came back on the most days
  const daily = daySubjects(store, Math.max(from, span.first), to);
  const months = [];
  for (let m = monthStart(span.first); m < to; m = nextMonth(m)) {
    const end = Math.min(nextMonth(m), to);
    const inMonth = daily.filter((d) => d.ts >= m && d.ts < end);
    if (!inMonth.length) continue;
    months.push({ month: monthKey(m), events: inMonth.reduce((a, d) => a + d.events, 0), subjects: tally(inMonth).slice(0, 3), site: sitesOf(store, Math.max(m, from), end, 1)[0]?.site || null });
  }
  // the subjects of the year reach across it: every month a subject came up in counts, and a month
  // three days at most, so a fortnight spent on one thing doesn't outweigh one that came back in
  // spring and in autumn
  const bySubject = new Map(tally(daily).map((x) => {
    const perMonth = new Map();
    for (const d of daily) if (d.subjects.some((s) => s.key === x.key)) perMonth.set(monthKey(d.ts), (perMonth.get(monthKey(d.ts)) || 0) + 1);
    return [x.key, { ...x, months: [...perMonth.keys()], reach: perMonth.size * 2 + [...perMonth.values()].reduce((a, n) => a + Math.min(3, n), 0) }];
  }));
  const subjects = [...bySubject.values()].sort((a, b) => b.reach - a.reach || b.days - a.days || b.events - a.events).slice(0, 8);

  const sites = sitesOf(store, from, to, 40);
  // discovered this year: not seen in the first fortnight, and visited on ten days or more since
  const discoveries = span.last - span.first > 45 * DAY
    ? sites.filter((s) => s.first > span.first + 14 * DAY && s.days >= 10).slice(0, 5).map((s) => ({ site: s.site, first: s.first, days: s.days }))
    : [];
  const books = store.db.prepare(`SELECT title, json_extract(meta, '$.author') AS author, MAX(json_extract(meta, '$.progress')) AS progress, MIN(ts) AS first, MAX(ts) AS last
    FROM events WHERE source = 'books' AND ts >= ? AND ts < ? GROUP BY title ORDER BY last DESC LIMIT 10`).all(from, to)
    .map((b) => ({ ...b, progress: b.progress == null ? null : Math.round(b.progress * 100) }));
  const shows = store.db.prepare(`SELECT detail AS show, COUNT(DISTINCT title) AS episodes FROM events WHERE source = 'podcasts' AND ts >= ? AND ts < ? AND detail IS NOT NULL AND detail NOT LIKE '%Localhost Times%' GROUP BY detail ORDER BY episodes DESC LIMIT 6`).all(from, to);
  const repos = store.db.prepare(`SELECT json_extract(meta, '$.repo') AS repo, COUNT(*) AS commits, MIN(ts) AS first, MAX(ts) AS last FROM events
    WHERE source = 'git' AND kind IN ('commit', 'merge', 'amend') AND ts >= ? AND ts < ? GROUP BY repo ORDER BY commits DESC LIMIT 6`).all(from, to).filter((r) => r.repo);
  const search = store.db.prepare(`SELECT title, COUNT(*) AS n FROM events WHERE source = 'safari' AND kind = 'search' AND ts >= ? AND ts < ? GROUP BY lower(title) ORDER BY n DESC LIMIT 1`).get(from, to) || null;

  return {
    from: Math.max(from, span.first),
    to,
    days: Math.max(activeDays, Math.ceil((to - Math.max(from, span.first)) / DAY)),
    activeDays,
    totals,
    hours,
    weekdays,
    busiest: busiest ? { day: busiest[0], events: busiest[1], subject: daily.find((d) => d.day === busiest[0])?.subjects[0]?.label || null } : null,
    months,
    subjects,
    sites: sites.slice(0, 10).map(({ site, days: d, visits }) => ({ site, days: d, visits })),
    discoveries,
    books,
    shows,
    repos,
    search: search && search.n > 1 ? search : null,
  };
}

/** The subjects of each day of a period, as the paper would find them for a daily edition. */
function daySubjects(store, from, to) {
  const out = [];
  const q = store.db.prepare(`SELECT * FROM events WHERE ts >= ? AND ts < ? AND ${TEXTUAL} ORDER BY ts`);
  for (let d = new Date(from).setHours(0, 0, 0, 0); d < to; d = new Date(d + DAY + 3 * 3600e3).setHours(0, 0, 0, 0)) {
    const evs = rowsToEvents(q.all(d, d + DAY));
    if (!evs.length) continue;
    out.push({ ts: d, day: dayKey(d), events: evs.length, subjects: findSubjects(evs, { max: 3 }).map((s) => ({ key: s.key, label: s.label, events: s.events.length })) });
  }
  return out;
}

/** Subjects across days: the ones that came back on the most days first. */
function tally(days) {
  const m = new Map();
  for (const d of days) {
    for (const s of d.subjects) {
      const x = m.get(s.key) || { key: s.key, label: s.label, days: 0, events: 0, first: d.day, last: d.day };
      x.days++;
      x.events += s.events;
      x.last = d.day;
      m.set(s.key, x);
    }
  }
  return [...m.values()].sort((a, b) => b.days - a.days || b.events - a.events);
}

const monthName = (k, style = 'long') => new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'it-IT', { month: style })
  .format(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1));

/** The numbers, in words, for the writer. */
function reviewFacts(r) {
  const en = lang() === 'en';
  const T = (e, i) => (en ? e : i);
  const q = (x) => (en ? `“${x}”` : `«${x}»`);
  const L = [];
  L.push(T(`Period: ${dayKey(r.from)} to ${dayKey(r.to)} (${r.days} days, ${r.activeDays} with activity).`, `Periodo: dal ${dayKey(r.from)} al ${dayKey(r.to)} (${r.days} giorni, ${r.activeDays} con attività).`));
  const t = r.totals;
  L.push(T(`Totals: ${t.pages} pages, ${t.searches} searches, ${t.mailsIn} emails received and ${t.mailsOut} sent, ${t.commands} terminal commands, ${t.commits} commits, ${t.photos} photos, ${t.episodes} podcast episodes.`,
    `Totali: ${t.pages} pagine, ${t.searches} ricerche, ${t.mailsIn} email ricevute e ${t.mailsOut} inviate, ${t.commands} comandi nel terminale, ${t.commits} commit, ${t.photos} foto, ${t.episodes} episodi di podcast.`));
  if (r.subjects.length) L.push(T('Subjects of the year (days they came up on, first and last):', 'Argomenti dell\'anno (giorni in cui sono tornati, primo e ultimo):'), ...r.subjects.map((s) => `- ${q(s.label)}: ${s.days} (${s.first} → ${s.last})`));
  L.push(T('Month by month (subjects, most visited site):', 'Mese per mese (argomenti, sito più frequentato):'));
  for (const m of r.months) L.push(`- ${m.month} ${monthName(m.month)}: ${m.subjects.map((s) => q(s.label)).join(', ') || '—'}; ${m.site || '—'}`);
  if (r.sites.length) L.push(T(`Habits (days visited): ${r.sites.slice(0, 6).map((s) => `${s.site} ${s.days}`).join(', ')}.`, `Abitudini (giorni di visita): ${r.sites.slice(0, 6).map((s) => `${s.site} ${s.days}`).join(', ')}.`));
  if (r.discoveries.length) L.push(T(`Discovered along the way: ${r.discoveries.map((d) => `${d.site} (first ${dayKey(d.first)}, then ${d.days} days)`).join(', ')}.`, `Scoperti strada facendo: ${r.discoveries.map((d) => `${d.site} (la prima volta il ${dayKey(d.first)}, poi ${d.days} giorni)`).join(', ')}.`));
  const peak = r.hours.indexOf(Math.max(...r.hours));
  L.push(T(`Busiest hour of the day: ${peak}:00. Activity after midnight: ${r.hours.slice(0, 5).reduce((a, b) => a + b, 0)} events.`, `Ora più intensa: le ${peak}. Attività dopo mezzanotte: ${r.hours.slice(0, 5).reduce((a, b) => a + b, 0)} eventi.`));
  if (r.busiest) L.push(T(`Busiest day: ${r.busiest.day}${r.busiest.subject ? `, the day of ${q(r.busiest.subject)}` : ''}.`, `Giorno più pieno: ${r.busiest.day}${r.busiest.subject ? `, il giorno di ${q(r.busiest.subject)}` : ''}.`));
  if (r.books.length) L.push(T(`Books: ${r.books.slice(0, 5).map((b) => `${q(b.title)}${b.progress != null ? ` (${b.progress}%)` : ''}`).join(', ')}.`, `Libri: ${r.books.slice(0, 5).map((b) => `${q(b.title)}${b.progress != null ? ` (${b.progress}%)` : ''}`).join(', ')}.`));
  if (r.shows.length) L.push(T(`Podcasts: ${r.shows.map((s) => `${s.show} (${s.episodes})`).join(', ')}.`, `Podcast: ${r.shows.map((s) => `${s.show} (${s.episodes})`).join(', ')}.`));
  if (r.repos.length) L.push(T(`Repositories: ${r.repos.map((x) => `${x.repo} (${x.commits} commits)`).join(', ')}.`, `Repository: ${r.repos.map((x) => `${x.repo} (${x.commits} commit)`).join(', ')}.`));
  if (r.search) L.push(T(`The search typed most often: ${q(r.search.title)} (${r.search.n} times).`, `La ricerca fatta più spesso: ${q(r.search.title)} (${r.search.n} volte).`));
  return L.join('\n');
}

function reviewPrompt(r, line) {
  const en = lang() === 'en';
  const sys = en
    ? `You are the editor of The Localhost Times writing its Year in Review, the annual issue about a year on its owner's Mac. Write from the facts ONLY: invent no causes, feelings or events, and quote no number that is not in them.
Write: a headline for the issue (8 words at most, no colon), a dek (one sentence), the editorial (three or four paragraphs, 220 words in all at most: the thread of the year, not a list; the subjects that came back, the habits, what was discovered; end on a dry turn) and, for every month in the facts, a headline of 8 words at most about its subjects.${line ? '\n' + linePrompt(line) : ''}
Reply ONLY with JSON: {"headline": "...", "dek": "...", "editorial": ["paragraph", "..."], "months": {"YYYY-MM": "headline", "...": "..."}}`
    : `Sei il direttore del «The Localhost Times» e scrivi l'Annuario, il numero speciale su un anno nel Mac del suo proprietario. Scrivi SOLO dai fatti: non inventare cause, sentimenti o avvenimenti, e non citare numeri che non ci sono.
Scrivi: un titolo per il numero (massimo 8 parole, senza due punti), un sommario (una frase), l'editoriale (tre o quattro paragrafi, in tutto massimo 220 parole: il filo dell'anno, non un elenco; gli argomenti tornati, le abitudini, le scoperte; chiudi con una svolta asciutta) e, per ogni mese nei fatti, un titolo di massimo 8 parole sui suoi argomenti.${line ? '\n' + linePrompt(line) : ''}
Rispondi SOLO con JSON: {"headline": "...", "dek": "...", "editorial": ["paragrafo", "..."], "months": {"AAAA-MM": "titolo", "...": "..."}}`;
  return [{ role: 'system', content: sys }, { role: 'user', content: reviewFacts(r) }];
}

/** The review as the typesetting writes it: plain, and true. */
export function typesetReview(r) {
  const en = lang() === 'en';
  const top = r.subjects[0]?.label;
  const habit = r.sites[0]?.site;
  const headline = top ? (en ? `The year of ${top}` : `L'anno di ${top}`) : (en ? 'A year on the Mac' : 'Un anno sul Mac');
  const t = r.totals;
  const editorial = [
    en ? `In ${r.days} days the Mac kept company with ${t.pages.toLocaleString('en-US')} pages and ${t.searches.toLocaleString('en-US')} questions to the search engines${t.commits ? `, and ${t.commits} commits` : ''}.`
      : `In ${r.days} giorni il Mac ha frequentato ${t.pages.toLocaleString('it-IT')} pagine e posto ${t.searches.toLocaleString('it-IT')} domande ai motori di ricerca${t.commits ? `, oltre a ${t.commits} commit` : ''}.`,
    r.subjects.length > 1 ? (en ? `The subjects that kept coming back: ${r.subjects.slice(0, 4).map((s) => s.label).join(', ')}.` : `Gli argomenti che sono tornati: ${r.subjects.slice(0, 4).map((s) => s.label).join(', ')}.`) : '',
    habit ? (en ? `The habit of the year was ${habit}, visited on ${r.sites[0].days} days.` : `L'abitudine dell'anno è stata ${habit}, visitato in ${r.sites[0].days} giorni.`) : '',
    r.discoveries[0] ? (en ? `Discovered along the way: ${r.discoveries.map((d) => d.site).join(', ')}.` : `Scoperti strada facendo: ${r.discoveries.map((d) => d.site).join(', ')}.`) : '',
  ].filter(Boolean);
  const monthHeadlines = Object.fromEntries(r.months.map((m) => [m.month, m.subjects[0]
    ? (en ? `The month of ${m.subjects.map((s) => s.label).slice(0, 2).join(' and ')}` : `Il mese di ${m.subjects.map((s) => s.label).slice(0, 2).join(' e ')}`)
    : (en ? `A month on ${m.site || 'the Mac'}` : `Un mese su ${m.site || 'il Mac'}`)]));
  return { headline, dek: en ? `${r.activeDays} days on the Mac, in numbers and in subjects.` : `${r.activeDays} giorni sul Mac, in numeri e in argomenti.`, editorial, monthHeadlines, writer: 'typesetting' };
}

/** Compute and write the Year in Review, and keep it. */
export async function printReview(store, config, { log = console.log, to = Date.now() } = {}) {
  const r = computeReview(store, { to });
  if (!r) return null;
  let text = null;
  const llm = await connectLLM(config);
  if (llm) {
    try {
      const j = parseJson(await chat(llm, config, reviewPrompt(r, getLine(store)), 3000));
      if (j?.headline && Array.isArray(j.editorial) && j.editorial.length) {
        const fallback = typesetReview(r);
        text = {
          headline: String(j.headline).trim(),
          dek: String(j.dek || '').trim(),
          editorial: j.editorial.map((p) => String(p).trim()).filter(Boolean),
          monthHeadlines: { ...fallback.monthHeadlines, ...Object.fromEntries(Object.entries(j.months || {}).filter(([k, v]) => fallback.monthHeadlines[k] && typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()])) },
          writer: llm.model,
        };
      }
    } catch (e) {
      log(tr({ en: `[review] the writer failed (${e.message}), the typesetting takes over`, it: `[annuario] il redattore ha fallito (${e.message}), passa la tipografia` }));
    }
  }
  text ||= typesetReview(r);
  const prev = store.items('review', { limit: 1 })[0];
  const saved = store.saveItem({ ...(prev?.ref === dayKey(to) ? { id: prev.id } : {}), kind: 'review', status: 'published', ref: dayKey(to), ts: to, lang: lang(), ...r, ...text });
  store.trimItems('review', 3);
  log(tr({ en: `[review] the Year in Review is out: “${text.headline}”`, it: `[annuario] è uscito l'Annuario: «${text.headline}»` }));
  return saved;
}

export const latestReview = (store) => store.items('review', { limit: 1 })[0] || null;

/**
 * "A year ago today": what the Mac was busy with on this date last year. Null when the archive
 * doesn't reach that far back.
 */
export function yearAgo(store, ms) {
  const d = new Date(ms);
  const start = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).getTime();
  const end = start + DAY;
  const evs = rowsToEvents(store.db.prepare(`SELECT * FROM events WHERE ts >= ? AND ts < ? AND source NOT IN ('apps', 'power') ORDER BY ts`).all(start, end));
  const textual = evs.filter((e) => e.source !== 'files' && e.source !== 'terminal');
  if (textual.length < 3) return null;
  const subject = findSubjects(textual, { max: 1 })[0];
  const site = sitesOf(store, start, end, 1)[0];
  const searches = [...new Set(evs.filter((e) => e.kind === 'search').map((e) => e.title))].slice(0, 2);
  const book = evs.find((e) => e.source === 'books')?.title || null;
  const episode = evs.find((e) => e.source === 'podcasts');
  return {
    day: dayKey(start),
    subject: subject?.label || null,
    site: site ? { site: site.site, visits: site.visits } : null,
    searches,
    book,
    episode: episode ? { title: episode.title, show: episode.detail } : null,
    photos: evs.filter((e) => e.source === 'photos' && (e.kind === 'photo' || e.kind === 'video')).length,
    commits: evs.filter((e) => e.source === 'git' && e.kind === 'commit').length,
  };
}
