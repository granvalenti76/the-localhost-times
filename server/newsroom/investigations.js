/**
 * Investigations: a long piece on one subject across days or weeks, built from the archive.
 * The numbers and the timeline are computed here; the writer only tells them.
 */
import { tr, lang } from '../i18n.js';
import { ftsQuery } from './archive.js';
import { siteOf } from './cluster.js';
import { SECTIONS } from './sections.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { getLine, linePrompt } from './line.js';
import { DeskError } from './edition.js';
import { dayKey, hhmm } from '../util.js';

const DAY = 24 * 3600e3;

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const fmtDay = (ms) => new Intl.DateTimeFormat(lang() === 'it' ? 'it-IT' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);

/** Everything the archive knows about a subject in a period: signals, coverage and the numbers. */
export function gather(store, { keywords, from, to }) {
  const match = ftsQuery(keywords, { any: true });
  if (!match) throw new DeskError(tr({ en: 'Give the investigation a subject.', it: 'Dai un argomento all\'inchiesta.' }), 400);
  const hits = store.db.prepare(
    `SELECT ref, ts, source, title FROM search WHERE search MATCH ? AND kind = 'event' AND ts >= ? AND ts < ? ORDER BY ts LIMIT 5000`,
  ).all(match, from, to);
  const meta = store.db.prepare(`SELECT kind, detail, meta FROM events WHERE id = ?`);
  const events = hits.map((h) => {
    const e = meta.get(h.ref);
    const m = e ? JSON.parse(e.meta || '{}') : {};
    return { ts: h.ts, source: h.source, title: h.title, kind: e?.kind, host: m.host ? siteOf(m.host) : null, detail: e?.detail || null };
  });
  // coverage: only headlines, so that "the owner" in every article body doesn't match everything
  let coverage = [];
  try {
    coverage = store.db.prepare(
      `SELECT ref, ts, source, title FROM search WHERE search MATCH ? AND kind = 'article' AND ts >= ? AND ts < ? ORDER BY ts LIMIT 200`,
    ).all(`title : (${match})`, from, to).map((r) => {
      const [editionId, ...rest] = r.ref.split('/');
      return { ts: r.ts, editionId, articleId: rest.join('/'), headline: r.title, section: SECTIONS[r.source]?.name || r.source };
    });
  } catch { /* no coverage */ }

  const days = Math.max(1, Math.round((startOfDay(to - 1) - startOfDay(from)) / DAY) + 1);
  const byDay = Array(days).fill(0);
  const byHour = Array(24).fill(0);
  const bySource = {};
  const sites = {};
  const titles = {};
  for (const e of events) {
    const i = Math.round((startOfDay(e.ts) - startOfDay(from)) / DAY);
    if (i >= 0 && i < days) byDay[i]++;
    byHour[new Date(e.ts).getHours()]++;
    bySource[e.source] = (bySource[e.source] || 0) + 1;
    if (e.host) sites[e.host] = (sites[e.host] || 0) + 1;
    if (e.title) titles[e.title] = (titles[e.title] || 0) + 1;
  }
  const allInPeriod = store.db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts < ?`).get(from, to).n;
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, n: v }));
  const busiestDay = byDay.indexOf(Math.max(...byDay));
  const busiestHour = byHour.indexOf(Math.max(...byHour));
  const activeDays = byDay.filter(Boolean).length;
  return {
    events,
    coverage,
    numbers: {
      total: events.length,
      share: allInPeriod ? events.length / allInPeriod : 0,
      days,
      activeDays,
      byDay,
      byDayFrom: startOfDay(from),
      byHour,
      bySource,
      sites: top(sites, 6),
      titles: top(titles, 8),
      first: events[0]?.ts ?? null,
      last: events.at(-1)?.ts ?? null,
      busiestDay: events.length ? { ts: startOfDay(from) + busiestDay * DAY, n: byDay[busiestDay] } : null,
      busiestHour: events.length ? { hour: busiestHour, n: byHour[busiestHour] } : null,
      articles: coverage.length,
    },
  };
}

/** Key moments, in order: first sighting, the busiest days, the paper's headlines, the latest sighting. */
export function timeline({ events, coverage, numbers }) {
  const out = [];
  if (numbers.first) out.push({ ts: numbers.first, text: tr({ en: `First trace: ${q(events[0].title)}`, it: `Prima traccia: ${q(events[0].title)}` }) });
  const peaks = numbers.byDay
    .map((n, i) => ({ n, ts: numbers.byDayFrom + i * DAY }))
    .filter((d) => d.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  for (const p of peaks) out.push({ ts: p.ts, day: true, text: tr({ en: `${p.n} signals in one day`, it: `${p.n} segnali in un giorno` }) });
  for (const c of coverage.slice(-6)) out.push({ ts: c.ts, text: c.headline, editionId: c.editionId, articleId: c.articleId, section: c.section });
  if (numbers.last && numbers.last !== numbers.first) out.push({ ts: numbers.last, text: tr({ en: `Latest trace: ${q(events.at(-1).title)}`, it: `Ultima traccia: ${q(events.at(-1).title)}` }) });
  return out.sort((a, b) => a.ts - b.ts);
}

const q = (s) => (lang() === 'it' ? `«${String(s || '').slice(0, 80)}»` : `“${String(s || '').slice(0, 80)}”`);
const pct = (x) => `${Math.round(x * 1000) / 10}%`;

/** A spread of signals for the writer: the first, the last, and the most varied in between. */
function sample(events, n = 40) {
  if (events.length <= n) return events;
  const seen = new Set();
  const out = [events[0]];
  const step = events.length / n;
  for (let i = 0; i < events.length && out.length < n - 1; i += step) {
    const e = events[Math.floor(i)];
    const k = `${e.source}|${e.title}`;
    if (!seen.has(k)) { seen.add(k); out.push(e); }
  }
  out.push(events.at(-1));
  return out;
}

function dataSheet(topic, d, tl, from, to) {
  const en = lang() === 'en';
  const n = d.numbers;
  const src = Object.entries(n.bySource).map(([k, v]) => `${SECTIONS[k]?.name || k} ${v}`).join(', ');
  const lines = [
    en ? `SUBJECT: ${topic}` : `ARGOMENTO: ${topic}`,
    en ? `PERIOD: ${dayKey(from)} → ${dayKey(to - 1)} (${n.days} days)` : `PERIODO: ${dayKey(from)} → ${dayKey(to - 1)} (${n.days} giorni)`,
    en ? `SIGNALS: ${n.total} (${pct(n.share)} of everything recorded in the period), on ${n.activeDays} of ${n.days} days` : `SEGNALI: ${n.total} (${pct(n.share)} di tutto ciò che è stato registrato nel periodo), in ${n.activeDays} giorni su ${n.days}`,
    `${en ? 'BY SECTION' : 'PER SEZIONE'}: ${src || '—'}`,
    n.sites.length ? `${en ? 'SITES' : 'SITI'}: ${n.sites.map((s) => `${s.name} ${s.n}`).join(', ')}` : '',
    n.busiestDay ? `${en ? 'BUSIEST DAY' : 'GIORNO PIÙ INTENSO'}: ${dayKey(n.busiestDay.ts)} (${n.busiestDay.n})` : '',
    n.busiestHour ? `${en ? 'USUAL HOUR' : 'ORA PIÙ FREQUENTE'}: ${String(n.busiestHour.hour).padStart(2, '0')}:00 (${n.busiestHour.n})` : '',
    `${en ? 'SIGNALS PER DAY' : 'SEGNALI PER GIORNO'}: ${n.byDay.map((v, i) => `${dayKey(n.byDayFrom + i * DAY).slice(5)} ${v}`).join(', ')}`,
    n.titles.length ? `${en ? 'MOST FREQUENT TITLES' : 'TITOLI PIÙ FREQUENTI'}: ${n.titles.map((t) => `${q(t.name)} ×${t.n}`).join('; ')}` : '',
    `${en ? 'THE PAPER\'S COVERAGE' : 'COPERTURA DEL GIORNALE'} (${n.articles}): ${d.coverage.slice(-10).map((c) => `${dayKey(c.ts)} ${q(c.headline)}`).join('; ') || '—'}`,
    `${en ? 'TIMELINE' : 'CRONOLOGIA'}:\n${tl.map((t) => `- ${dayKey(t.ts)}${t.day ? '' : ` ${hhmm(t.ts)}`}: ${t.text}`).join('\n')}`,
    `${en ? 'SAMPLE OF SIGNALS' : 'CAMPIONE DI SEGNALI'}:\n${sample(d.events).map((e) => `- ${dayKey(e.ts)} ${hhmm(e.ts)} [${SECTIONS[e.source]?.name || e.source}${e.host ? `, ${e.host}` : ''}] ${e.title}`).join('\n')}`,
  ];
  return lines.filter(Boolean).join('\n');
}

function prompt(topic, sheet, line) {
  const extra = line ? '\n' + linePrompt(line) : '';
  return [
    {
      role: 'system',
      content: tr({
        en: `You are the investigations editor of The Localhost Times, the paper about what happens on its owner's Mac. Write an investigation: a long, readable piece on one subject across days, like a good weekend feature. Dry, precise, curious; irony from the facts, never from adjectives. Third person ("the owner").
Rules: use ONLY the data sheet; every number you write must be in it; do not compute new numbers except obvious ones (e.g. "twice as many"); don't invent motives; quote titles in curly quotes “like this”, never straight double quotes.
Structure: a headline (10 words at most, no final period), a dek (one sentence), 3 or 4 sections with a short heading each, 450-650 words in all, and 3 key findings (one short line each, each with a number).${extra}
Reply ONLY with JSON: {"headline": "...", "dek": "...", "sections": [{"heading": "...", "paragraphs": ["...", "..."]}], "findings": ["...", "...", "..."]}`,
        it: `Sei il responsabile delle inchieste del «The Localhost Times», il giornale di ciò che succede sul Mac del suo proprietario. Scrivi un'inchiesta: un pezzo lungo e leggibile su un argomento, attraverso più giorni, come un buon servizio del fine settimana. Asciutto, preciso, curioso; l'ironia viene dai fatti, mai dagli aggettivi. Terza persona («il proprietario»).
Regole: usa SOLO la scheda dei dati; ogni numero che scrivi deve esserci; non calcolare numeri nuovi salvo quelli ovvi (es. «il doppio»); non inventare motivazioni; cita i titoli tra «caporali».
Struttura: un titolo (massimo 10 parole, senza punto finale), un sommario (una frase), 3 o 4 sezioni con un breve titoletto ciascuna, 450-650 parole in tutto, e 3 risultati chiave (una riga breve ciascuno, ognuno con un numero).${extra}
Rispondi SOLO con JSON: {"headline": "...", "dek": "...", "sections": [{"heading": "...", "paragraphs": ["...", "..."]}], "findings": ["...", "...", "..."]}`,
      }),
    },
    { role: 'user', content: `${sheet}\n\n${tr({ en: `Write the investigation about “${topic}”.`, it: `Scrivi l'inchiesta su «${topic}».` })}` },
  ];
}

/** The typesetting's version, when the writer is offline: the same facts, in templates. */
function typeset(topic, d, from, to) {
  const n = d.numbers;
  const en = lang() === 'en';
  const srcs = Object.entries(n.bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SECTIONS[k]?.name || k} (${v})`);
  const hh = n.busiestHour ? `${String(n.busiestHour.hour).padStart(2, '0')}:00` : '—';
  if (!n.total) {
    return {
      headline: en ? `${topic}: no traces in the archive` : `${topic}: nessuna traccia in archivio`,
      dek: en ? `Between ${dayKey(from)} and ${dayKey(to - 1)} the archive records nothing on the subject.` : `Tra il ${dayKey(from)} e il ${dayKey(to - 1)} l'archivio non registra nulla sull'argomento.`,
      sections: [],
      findings: [],
    };
  }
  return en ? {
    headline: `${topic}, ${n.days} days on record`,
    dek: `${n.total} signals on ${n.activeDays} of ${n.days} days: ${pct(n.share)} of everything the Mac recorded in the period.`,
    sections: [
      { heading: 'The numbers', paragraphs: [`The archive holds ${n.total} signals on the subject, mostly from ${srcs.slice(0, 3).join(', ')}.${n.busiestDay ? ` The busiest day was ${fmtDay(n.busiestDay.ts)}, with ${n.busiestDay.n}.` : ''}`] },
      { heading: 'When', paragraphs: [`The usual hour is ${hh}. The first trace dates from ${dayKey(n.first)} at ${hhmm(n.first)}, the latest from ${dayKey(n.last)} at ${hhmm(n.last)}.`] },
      ...(n.sites.length ? [{ heading: 'Where', paragraphs: [`On the web the subject lives mostly on ${n.sites.slice(0, 4).map((s) => `${s.name} (${s.n})`).join(', ')}.`] }] : []),
      { heading: 'In the paper', paragraphs: [n.articles ? `The paper wrote about it ${n.articles === 1 ? 'once' : n.articles === 2 ? 'twice' : `${n.articles} times`}, most recently: ${q(d.coverage.at(-1).headline)}.` : 'The paper never put it in a headline: a subject that stayed between the lines.'] },
    ],
    findings: [`${n.total} signals in ${n.days} days`, `${pct(n.share)} of all activity`, n.busiestDay ? `Peak: ${n.busiestDay.n} on ${fmtDay(n.busiestDay.ts)}` : `${n.activeDays} active days`],
  } : {
    headline: `${topic}, ${n.days} giorni sotto osservazione`,
    dek: `${n.total} segnali in ${n.activeDays} giorni su ${n.days}: il ${pct(n.share)} di tutto ciò che il Mac ha registrato nel periodo.`,
    sections: [
      { heading: 'I numeri', paragraphs: [`L'archivio conserva ${n.total} segnali sull'argomento, soprattutto da ${srcs.slice(0, 3).join(', ')}.${n.busiestDay ? ` Il giorno più intenso è stato ${fmtDay(n.busiestDay.ts)}, con ${n.busiestDay.n}.` : ''}`] },
      { heading: 'Quando', paragraphs: [`L'ora più frequente è le ${hh}. La prima traccia risale al ${dayKey(n.first)} alle ${hhmm(n.first)}, l'ultima al ${dayKey(n.last)} alle ${hhmm(n.last)}.`] },
      ...(n.sites.length ? [{ heading: 'Dove', paragraphs: [`Sul web l'argomento vive soprattutto su ${n.sites.slice(0, 4).map((s) => `${s.name} (${s.n})`).join(', ')}.`] }] : []),
      { heading: 'Sul giornale', paragraphs: [n.articles ? `Il giornale ne ha scritto ${n.articles === 1 ? 'una volta' : `${n.articles} volte`}, l'ultima così: ${q(d.coverage.at(-1).headline)}.` : 'Il giornale non l\'ha mai messo in un titolo: un argomento rimasto tra le righe.'] },
    ],
    findings: [`${n.total} segnali in ${n.days} giorni`, `${pct(n.share)} di tutta l'attività`, n.busiestDay ? `Picco: ${n.busiestDay.n} ${fmtDay(n.busiestDay.ts)}` : `${n.activeDays} giorni attivi`],
  };
}

export async function createInvestigation(store, config, { topic, keywords, days = 14, now = Date.now() }, log = console.log) {
  const subject = String(topic || '').trim().slice(0, 80);
  if (!subject) throw new DeskError(tr({ en: 'Give the investigation a subject.', it: 'Dai un argomento all\'inchiesta.' }), 400);
  const span = Math.max(1, Math.min(90, Number(days) || 14));
  const from = startOfDay(now) - (span - 1) * DAY;
  const to = now;
  const d = gather(store, { keywords: String(keywords || subject).slice(0, 120), from, to });
  const tl = timeline(d);
  let text = null;
  let writer = 'typesetting';
  const llm = d.numbers.total ? await connectLLM(config) : null;
  if (llm) {
    try {
      const j = parseJson(await chat(llm, config, prompt(subject, dataSheet(subject, d, tl, from, to), getLine(store)), 4000));
      if (typeof j.headline === 'string' && Array.isArray(j.sections) && j.sections.length) {
        text = {
          headline: j.headline.trim().replace(/(?<!\.)\.$/, ''),
          dek: String(j.dek || '').trim(),
          sections: j.sections.map((s) => ({
            heading: String(s.heading || '').trim(),
            paragraphs: (Array.isArray(s.paragraphs) ? s.paragraphs : [s.paragraphs]).map((p) => String(p || '').trim()).filter(Boolean),
          })).filter((s) => s.paragraphs.length),
          findings: (Array.isArray(j.findings) ? j.findings : []).map((f) => String(f).trim()).filter(Boolean).slice(0, 3),
        };
        writer = llm.model;
      }
    } catch (e) {
      log(tr({ en: `[investigation] the writer failed (${e.message}), typesetting takes over`, it: `[inchiesta] il redattore ha fallito (${e.message}), passa la tipografia` }));
    }
  }
  text ||= typeset(subject, d, from, to);
  const inv = {
    topic: subject,
    keywords: String(keywords || subject),
    from, to, days: span,
    createdAt: Date.now(),
    status: 'published',
    writer,
    ...text,
    numbers: { ...d.numbers },
    timeline: tl,
    coverage: d.coverage.slice(-20),
  };
  const saved = store.saveInvestigation(inv);
  log(tr({ en: `[investigation] “${saved.headline}”: ${d.numbers.total} signals, writer ${writer}`, it: `[inchiesta] «${saved.headline}»: ${d.numbers.total} segnali, redattore ${writer}` }));
  return saved;
}

/** Subjects worth an investigation: stories that keep coming back, and the sites of the week. */
export function suggestions(store, now = Date.now()) {
  const since = now - 7 * DAY;
  const rows = store.db.prepare(`SELECT payload FROM editions WHERE start_ts >= ? ORDER BY start_ts`).all(since);
  const counts = new Map();
  for (const r of rows) {
    const ed = JSON.parse(r.payload);
    for (const a of ed.articles || []) {
      if (['roundup', 'searches', 'inbox', 'session', 'webmail', 'folders', 'downloads'].includes(a.kind)) continue;
      const key = a.id;
      const tail = a.id.split(':').slice(2).join(':');
      const label = a.kind === 'site' ? tail
        : a.kind === 'folder' ? tail.split('/').pop()
          : (a.kicker && a.kicker !== a.section ? a.kicker : a.headline.split(/[:,—]/)[0]).slice(0, 50);
      const c = counts.get(key) || { label, n: 0, days: new Set() };
      c.n++;
      c.days.add(dayKey(ed.start));
      counts.set(key, c);
    }
  }
  const stories = [...counts.values()].filter((c) => c.n >= 3).sort((a, b) => b.n - a.n).slice(0, 5)
    .map((c) => ({
      topic: c.label,
      why: c.days.size === 1
        ? tr({ en: `${c.n} editions in one day`, it: `${c.n} edizioni in un giorno` })
        : tr({ en: `${c.n} editions in ${c.days.size} days`, it: `${c.n} edizioni in ${c.days.size} giorni` }),
    }));
  const seen = new Set(stories.map((s) => s.topic.toLowerCase()));
  const sites = {};
  for (const e of store.db.prepare(`SELECT meta FROM events WHERE source = 'safari' AND kind = 'visit' AND ts >= ?`).all(since)) {
    const h = JSON.parse(e.meta || '{}').host;
    if (h) sites[siteOf(h)] = (sites[siteOf(h)] || 0) + 1;
  }
  const topSites = Object.entries(sites).sort((a, b) => b[1] - a[1]).filter(([s]) => !seen.has(s)).slice(0, 4)
    .map(([s, n]) => ({ topic: s, why: tr({ en: `${n} visits this week`, it: `${n} visite questa settimana` }) }));
  return [...stories, ...topSites];
}
