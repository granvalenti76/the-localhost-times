/**
 * The newsroom calls the editor: short questions that take ten seconds to answer.
 *
 *  interview  a reporter asks the owner about a story while it is happening; the answer becomes a
 *             real quote in the article ("«…», the owner said"), silence becomes "did not reply".
 *             An answer that arrives after the edition is printed is added as an update.
 *  closing    at :55 the desk asks which story should lead, whether to cut one, or which tone.
 *  serial     the serial's readers choose how the next episode goes (see serial.js).
 *
 * Calls are items of kind 'call': { type, status: open | answered | declined | expired, question,
 * options, deadline, storyId, editionId, answer }.
 */
import { tr, lang } from '../i18n.js';
import { buildStories } from './cluster.js';
import { editionWindow, cleanEvents, DeskError } from './edition.js';
import { preview, steer as applySteerOp } from './next.js';
import { getLine, featureOn } from './line.js';
import { writerFor, byline, personaPrompt } from './writers.js';
import { isSensitive } from './spotlight/detectors.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { say } from './chatter.js';
import { hourStart, hhmm } from '../util.js';

const MIN = 60e3;
const HOUR = 3600e3;
const KIND = 'call';
/** A late answer to an interview is still welcome this long after the edition is printed. */
const LATE = 3 * HOUR;
const NO_INTERVIEW = new Set(['entry']); // the diary is private: nobody calls about it
const NO_INTERVIEW_SOURCES = new Set(['journal']);

const q = (s) => (lang() === 'it' ? `«${s}»` : `“${s}”`);
const cut = (s, n = 60) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

// ───────────────────────── Calls ─────────────────────────

export function getCall(store, id) {
  const c = store.getItem(KIND, id);
  if (!c) throw new DeskError(tr({ en: 'Question not found', it: 'Domanda non trovata' }), 404);
  return c;
}

/** Calls still waiting for the editor (an interview stays answerable for a while after print). */
export function openCalls(store, now = Date.now()) {
  return store.items(KIND, { status: 'open', after: now - 12 * HOUR, limit: 50 })
    .filter((c) => now < (c.type === 'interview' ? c.deadline + LATE : c.deadline))
    .sort((a, b) => a.deadline - b.deadline);
}

/** Calls whose time is up become 'expired'. */
export function expireCalls(store, now = Date.now()) {
  let n = 0;
  for (const c of store.items(KIND, { status: 'open', limit: 200 })) {
    const end = c.type === 'interview' ? c.deadline + LATE : c.deadline;
    if (now >= end) { store.saveItem({ ...c, status: 'expired' }); n++; }
  }
  return n;
}

/** What the page and the menu bar show of a call. */
export const callView = (c, now = Date.now()) => ({
  id: c.id,
  type: c.type,
  status: c.status,
  question: c.question,
  options: (c.options || []).map((o) => ({ id: o.id, label: o.label })),
  by: c.by || null,
  topic: c.topic || null,
  section: c.section || null,
  deadline: c.deadline,
  late: c.type === 'interview' && now >= c.deadline,
  minutesLeft: Math.max(0, Math.round((c.deadline - now) / MIN)),
  printedIn: c.printedIn || null,
  answer: c.answer || null,
});

/**
 * The editor answers: text (interview), an option (closing, serial), or "no comment".
 * Returns { call, update } where update is the article that got the late quote, if any.
 */
export function answerCall(store, config, id, { text, option, decline } = {}, now = Date.now()) {
  const c = getCall(store, id);
  if (c.status !== 'open') throw new DeskError(tr({ en: 'This question has already been answered or has expired.', it: 'A questa domanda hai già risposto, o è scaduta.' }), 409);
  let update = null;
  if (c.type === 'interview') {
    if (decline) {
      Object.assign(c, { status: 'declined', answeredAt: now });
    } else {
      const t = String(text || '').trim().slice(0, 400);
      if (!t) throw new DeskError(tr({ en: 'Write your answer (or choose “no comment”).', it: 'Scrivi la risposta (o scegli «nessun commento»).' }), 400);
      Object.assign(c, { status: 'answered', answer: t, answeredAt: now });
      if (c.printedIn) update = lateQuote(store, c, now);
    }
    const w = c.by?.name || tr({ en: 'The reporter', it: 'Il cronista' });
    say(store, c.by?.id || 'desk', decline
      ? tr({ en: `${w}: the Editor won't comment. “No comment” it is.`, it: `${w}: il Direttore non commenta. Scrivo «nessun commento».` })
      : tr({ en: `${w}: got the quote! It goes in the piece.`, it: `${w}: ho la dichiarazione! Va nel pezzo.` }), now);
  } else {
    const o = (c.options || []).find((x) => String(x.id) === String(option));
    if (!o) throw new DeskError(tr({ en: 'Choose one of the options.', it: 'Scegli una delle opzioni.' }), 400);
    if (c.type === 'closing' && o.action) {
      try { applySteerOp(store, config, o.action, now); } catch (e) {
        // the story may have dropped out of the edition in the meantime
        if (!(e instanceof DeskError)) throw e;
      }
    }
    Object.assign(c, { status: 'answered', answer: o.label, option: o.id, answeredAt: now });
    if (c.type === 'closing') say(store, 'desk', tr({ en: `Desk: the Editor has spoken — ${o.label}.`, it: `Desk: il Direttore ha deciso — ${o.label}.` }), now);
  }
  store.saveItem(c);
  return { call: callView(c, now), update };
}

// ───────────────────────── Interviews ─────────────────────────

/** The stories forming in the current hour (same window and weights as the next edition). */
export function formingStories(store, config, now = Date.now()) {
  const { windowStart, id } = editionWindow(store, config, hourStart(now));
  const line = getLine(store);
  const events = cleanEvents(store.eventsBetween(windowStart, now), config);
  const stories = buildStories(events)
    .map((s) => ({ ...s, weight: s.weight * (line.sectionWeights[s.source] ?? 1) }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  return { stories, windowStart, editionId: id, line };
}

/** Players in game titles ("alice vs. bob | Analysis"): the owner is the name that keeps coming back. */
export function matchesOf(titles) {
  const games = [];
  for (const t of titles) {
    const m = /^\s*(.+?)\s+vs\.?\s+(.+?)(?:\s*[|–—-]\s*.*)?$/i.exec(String(t || ''));
    if (m && m[1].length < 40 && m[2].length < 40) games.push([m[1].trim(), m[2].trim()]);
  }
  const seen = new Map();
  for (const g of games) for (const p of g) seen.set(p, (seen.get(p) || 0) + 1);
  const me = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const uniq = [...new Map(games.map((g) => [g.join('|'), g])).values()];
  return uniq.map(([a, b]) => ({ a, b, me: games.length > 1 ? me : null, opponent: games.length > 1 ? (a === me ? b : a) : null }));
}

const titlesOf = (s) => (s.pages || s.events || []).map((e) => e.clean || e.title).filter(Boolean);

/** A question written by the typesetting: specific to the kind of story, addressed to the Editor. */
export function templateQuestion(s) {
  const en = lang() === 'en';
  const n = s.events.length;
  const first = (s.pages || []).find((p) => !p.generic)?.clean || s.events[0]?.title;
  switch (s.kind) {
    case 'site': {
      const games = matchesOf(titlesOf(s));
      if (games.length) {
        const g = games[0];
        const who = g.opponent || `${g.a} – ${g.b}`;
        return en ? `Chief, the game against ${who}: how did it end?` : `Direttore, la partita contro ${who}: com'è finita?`;
      }
      if (/youtube/.test(s.topic) && first) return en ? `Chief, ${q(cut(first, 50))} on YouTube: worth watching?` : `Direttore, ${q(cut(first, 50))} su YouTube: vale la pena?`;
      return en ? `Chief, ${n} visits to ${s.topic} this hour: what were you looking for?` : `Direttore, ${n} visite su ${s.topic} in un'ora: cosa cercava?`;
    }
    case 'searches': return en ? `Chief, you searched for ${q(cut(s.topic, 50))}: what did you want to know?` : `Direttore, ha cercato ${q(cut(s.topic, 50))}: cosa voleva sapere?`;
    case 'roundup': return en ? `Chief, ${(s.sites || []).length} sites in a few minutes: looking for something, or just passing through?` : `Direttore, ${(s.sites || []).length} siti in pochi minuti: cercava qualcosa o passava di lì?`;
    case 'session':
      if (s.commits?.length) return en ? `Chief, commit ${q(cut(s.commits.at(-1), 50))}: what changes?` : `Direttore, commit ${q(cut(s.commits.at(-1), 50))}: cosa cambia?`;
      return en ? `Chief, ${s.serious || n} commands in the terminal: what are you building?` : `Direttore, ${s.serious || n} comandi nel terminale: cosa sta costruendo?`;
    case 'folder': return en ? `Chief, work in ${q(s.project || s.topic)}: how far along is it?` : `Direttore, il lavoro su ${q(s.project || s.topic)}: a che punto è?`;
    case 'folders': return en ? 'Chief, files saved here and there: tidying up?' : 'Direttore, file salvati qua e là: sta facendo ordine?';
    case 'downloads': return en ? `Chief, ${q(cut(s.events[0]?.title, 40))} downloaded: what is it for?` : `Direttore, scaricato ${q(cut(s.events[0]?.title, 40))}: a cosa serve?`;
    case 'thread': return en ? `Chief, the ${q(cut(s.topic, 40))} exchange: how did it end?` : `Direttore, lo scambio ${q(cut(s.topic, 40))}: com'è finita?`;
    case 'inbox': return en ? `Chief, ${n} emails this hour: any worth reading?` : `Direttore, ${n} email in un'ora: ce n'è una che valeva la pena?`;
    case 'webmail': return s.unreadEnd ? (en ? `Chief, ${s.unreadEnd} unread: will they ever be read?` : `Direttore, ${s.unreadEnd} non letti: li leggerà mai?`) : (en ? 'Chief, inbox checked: anything good?' : 'Direttore, casella controllata: niente di buono?');
    case 'note': return en ? `Chief, the note ${q(cut(s.topic, 40))}: what is it about?` : `Direttore, la nota ${q(cut(s.topic, 40))}: di che si tratta?`;
    case 'episode': return en ? `Chief, ${q(cut(s.events.at(-1)?.meta?.show || s.topic, 40))}: would you recommend it?` : `Direttore, ${q(cut(s.events.at(-1)?.meta?.show || s.topic, 40))}: lo consiglierebbe?`;
    case 'book': return en ? `Chief, ${q(cut(s.topic, 40))}: how is it so far?` : `Direttore, ${q(cut(s.topic, 40))}: com'è finora?`;
    case 'timesheet': return s.time?.longest
      ? (en ? `Chief, ${s.time.longest.minutes} minutes straight on ${s.time.longest.app}: what kept you there?` : `Direttore, ${s.time.longest.minutes} minuti di fila su ${s.time.longest.app}: cosa la teneva lì?`)
      : (en ? 'Chief, a fragmented hour: what was going on?' : 'Direttore, un\'ora a pezzetti: cosa succedeva?');
    case 'shots': return en ? 'Chief, pictures this hour: a special occasion?' : 'Direttore, foto in quest\'ora: un\'occasione speciale?';
    default: return en ? `Chief, about ${q(cut(s.topic, 40))}: a comment for the paper?` : `Direttore, su ${q(cut(s.topic, 40))}: una dichiarazione per il giornale?`;
  }
}

/** A short fact sheet for the reporter who phones in the question. */
function briefFacts(s) {
  const lines = [`${s.section} · ${s.kind} · ${hhmm(s.first)}–${hhmm(s.last)} · ${s.events.length} signals`, `topic: ${s.topic}`];
  for (const t of titlesOf(s).slice(0, 8)) lines.push(`- ${cut(t, 90)}`);
  if (s.commits?.length) lines.push(`commits: ${s.commits.slice(-3).join('; ')}`);
  return lines.join('\n');
}

async function writtenQuestion(s, line, config) {
  const llm = await connectLLM(config);
  if (!llm) return null;
  const w = writerFor(line, s.source);
  const msgs = [
    {
      role: 'system',
      content: tr({
        en: `You are a reporter of The Localhost Times, the paper about what happens on the Editor's Mac. You phone the Editor (the owner of the Mac) for a quote on a story happening right now. Write ONE question: at most 18 words, starting with "Chief,", concrete, about the facts, curious or wry — the kind that gets a funny or revealing one-line answer. Never ask about health, money, love, faith, politics or the law.${personaPrompt(w, 'brief')}
Reply ONLY with JSON: {"question": "..."}`,
        it: `Sei un cronista del «The Localhost Times», il giornale di ciò che succede sul Mac del Direttore. Telefoni al Direttore (il proprietario del Mac) per una dichiarazione su una storia che sta succedendo adesso. Scrivi UNA domanda: massimo 18 parole, comincia con «Direttore,», dagli del lei, concreta, sui fatti, curiosa o sorniona: il tipo di domanda che strappa una risposta di una riga, divertente o rivelatrice. Mai domande su salute, soldi, amore, fede, politica o giustizia.${personaPrompt(w, 'brief')}
Rispondi SOLO con JSON: {"question": "..."}`,
      }),
    },
    { role: 'user', content: `${tr({ en: 'THE STORY', it: 'LA STORIA' })}:\n${briefFacts(s)}` },
  ];
  try {
    const j = parseJson(await chat(llm, config, msgs, 400));
    const t = String(j.question || '').replace(/^["«“]+|["»”]+$/g, '').trim();
    return t && t.length <= 200 && !isSensitive(t) ? t : null;
  } catch { return null; }
}

/** Has this story already had a call recently? */
function recentlyAsked(store, storyId, since) {
  return store.items(KIND, { ref: storyId, after: since, limit: 5 }).some((c) => c.type === 'interview');
}

/**
 * During the hour: if a big story is forming and nobody has called the Editor about it, a reporter
 * calls. At most `perHour` calls per edition, never twice on the same story within three hours.
 */
export async function interviewRound(store, config, { now = Date.now(), log = () => {}, notify = null, perHour = 2, useLLM = true } = {}) {
  const { stories, windowStart, editionId, line } = formingStories(store, config, now);
  if (!featureOn(line, 'interview')) return null;
  const end = hourStart(now) + HOUR;
  if (end - now < 6 * MIN) return null; // too late for this edition: the closing call takes over
  const asked = store.items(KIND, { after: windowStart, limit: 20 }).filter((c) => c.type === 'interview').length;
  if (asked >= perHour) return null;
  const max = config.edition.maxArticles;
  const candidate = stories.slice(0, Math.min(3, max)).find((s) => s.events.length >= 6
    && !NO_INTERVIEW.has(s.kind) && !NO_INTERVIEW_SOURCES.has(s.source)
    && !isSensitive([s.topic, ...titlesOf(s).slice(0, 12)].join(' '))
    && !recentlyAsked(store, s.id, now - 3 * HOUR));
  if (!candidate) return null;
  const w = writerFor(line, candidate.source);
  const question = (useLLM ? await writtenQuestion(candidate, line, config) : null) || templateQuestion(candidate);
  const call = store.saveItem({
    kind: KIND,
    type: 'interview',
    status: 'open',
    ts: now,
    ref: candidate.id,
    storyId: candidate.id,
    editionId,
    question,
    topic: candidate.topic,
    section: candidate.section,
    by: byline(w),
    deadline: end + 30e3,
  });
  log(tr({ en: `[newsroom] ${w?.name || 'a reporter'} calls the Editor about ${candidate.id}`, it: `[redazione] ${w?.name || 'un cronista'} chiama il Direttore su ${candidate.id}` }));
  say(store, w?.id || 'desk', tr({
    en: `${w?.name || 'Reporter'}: I've got ${candidate.events.length} signals on ${candidate.topic}. Calling the Editor for a quote.`,
    it: `${w?.name || 'Cronista'}: ho ${candidate.events.length} segnali su ${candidate.topic}. Chiamo il Direttore per una dichiarazione.`,
  }), now);
  notify?.call?.(callView(call, now));
  return call;
}

/**
 * At print: the statements collected for a story in this edition's window, as lines for the facts.
 * Marks the calls as printed in this edition, so that a late answer becomes an update.
 */
export function interviewFacts(store, story, { windowStart, end, editionId }) {
  const calls = store.items(KIND, { ref: story.id, after: windowStart, before: end, limit: 5 }).filter((c) => c.type === 'interview');
  if (!calls.length) return { facts: '', quotes: [] };
  const lines = [];
  const quotes = [];
  for (const c of calls) {
    const at = hhmm(c.ts);
    if (c.status === 'answered' && c.answer) {
      lines.push(tr({
        en: `STATEMENT BY THE OWNER (real, collected by the paper at ${at}): asked ${q(c.question)}, he answered: ${q(c.answer)}`,
        it: `DICHIARAZIONE DEL PROPRIETARIO (vera, raccolta dal giornale alle ${at}): alla domanda ${q(c.question)} ha risposto: ${q(c.answer)}`,
      }));
      quotes.push({ question: c.question, answer: c.answer, at: c.answeredAt || c.ts });
    } else if (c.status === 'declined') {
      lines.push(tr({ en: `The owner, asked at ${at} (${q(c.question)}), declined to comment.`, it: `Il proprietario, interpellato alle ${at} (${q(c.question)}), non ha voluto commentare.` }));
      quotes.push({ question: c.question, answer: null, declined: true, at: c.ts });
    } else {
      lines.push(tr({ en: `The owner, asked at ${at} (${q(c.question)}), had not replied by the time the paper went to press.`, it: `Il proprietario, interpellato alle ${at} (${q(c.question)}), non aveva risposto al momento di andare in stampa.` }));
      quotes.push({ question: c.question, answer: null, at: c.ts });
    }
    if (!c.printedIn) store.saveItem({ ...c, printedIn: editionId });
  }
  return { facts: `\n${lines.join('\n')}`, quotes };
}

/** The typesetting's paragraph for a statement (the model weaves it in; without it, this is added). */
export function quoteParagraph(qt) {
  if (qt.answer) return tr({ en: `${q(qt.answer)}, the owner told the paper.`, it: `${q(qt.answer)}, ha dichiarato il proprietario al nostro giornale.` });
  if (qt.declined) return tr({ en: 'The owner declined to comment.', it: 'Il proprietario non ha voluto commentare.' });
  return tr({ en: 'The owner had not replied by the time the paper went to press.', it: 'Il proprietario non aveva risposto al momento di andare in stampa.' });
}

/** An answer after the press: an update at the bottom of the printed article. */
function lateQuote(store, c, now) {
  const ed = store.getEdition(c.printedIn);
  const a = ed?.articles?.find((x) => x.id === c.storyId);
  if (!a) return null;
  const p = tr({
    en: `Update, ${hhmm(now)}: ${q(c.answer)}, the owner later told the paper.`,
    it: `Aggiornamento delle ${hhmm(now)}: ${q(c.answer)}, ha poi dichiarato il proprietario al nostro giornale.`,
  });
  a.body = [...a.body.filter((x) => !x.startsWith(p.slice(0, 18)) || !x.includes(c.answer)), p];
  a.updates = [...(a.updates || []), { at: now, text: c.answer }];
  a.quotes = [...(a.quotes || []), { question: c.question, answer: c.answer, at: now, late: true }];
  store.saveEdition(ed);
  return { editionId: ed.id, articleId: a.id };
}

// ───────────────────────── The closing at :55 ─────────────────────────

const TONE_NOTES = () => tr({
  en: [
    { id: 'serious', label: 'Serious', note: 'A serious edition: dry, precise, no jokes.' },
    { id: 'ironic', label: 'Ironic', note: 'An ironic edition: one joke per paragraph, always grounded in the facts.' },
    { id: 'tabloid', label: 'Tabloid', note: 'A tabloid edition: punchy headlines, exclamation marks allowed in headlines, facts still true.' },
  ],
  it: [
    { id: 'serious', label: 'Seria', note: 'Un\'edizione seria: asciutta, precisa, niente battute.' },
    { id: 'ironic', label: 'Ironica', note: 'Un\'edizione ironica: una battuta per paragrafo, sempre fondata sui fatti.' },
    { id: 'tabloid', label: 'Strillona', note: 'Un\'edizione da tabloid: titoli a effetto, punti esclamativi ammessi nei titoli, fatti sempre veri.' },
  ],
});

/** Which question the desk asks this hour: mostly the lead, sometimes a cut or the tone. */
export function closingVariant(hour) {
  const h = new Date(hour).getHours();
  const day = new Date(hour).getDate();
  if (h % 3 !== 2) return 'lead';
  return day % 2 ? 'tone' : 'cut';
}

/** The closing question for the edition about to be printed (null if there's nothing to choose). */
export function closingCall(p, variant) {
  const inPaper = p.stories.filter((s) => s.inPaper);
  if (inPaper.length < 2 || p.willMerge) return null;
  const desk = { id: 'desk', label: tr({ en: 'Let the desk decide', it: 'Decida la redazione' }) };
  if (variant === 'tone') {
    return {
      question: tr({ en: 'The edition closes in five minutes. What kind of paper do you want?', it: 'Si chiude tra cinque minuti. Che edizione vuole, Direttore?' }),
      options: [...TONE_NOTES().map((t) => ({ id: t.id, label: t.label, action: { op: 'note', text: t.note } })), desk],
    };
  }
  if (variant === 'cut' && inPaper.length >= 3) {
    const weak = inPaper.at(-1);
    return {
      question: tr({ en: `Closing in five minutes. Do we cut ${q(cut(weak.topic, 50))}?`, it: `Si chiude tra cinque minuti. Tagliamo ${q(cut(weak.topic, 50))}?` }),
      storyId: weak.id,
      options: [
        { id: 'cut', label: tr({ en: 'Cut it', it: 'Taglia' }), action: { op: 'bury', story: weak.id } },
        { id: 'keep', label: tr({ en: 'Keep it', it: 'Tieni' }) },
      ],
    };
  }
  return {
    question: tr({ en: 'Closing in five minutes. What leads the paper?', it: 'Si chiude tra cinque minuti. Cosa va in apertura?' }),
    options: [
      ...inPaper.slice(0, 3).map((s, i) => ({ id: `s${i}`, label: cut(s.topic, 48), storyId: s.id, action: { op: 'boost', story: s.id } })),
      desk,
    ],
  };
}

/** At :55, the desk calls the Editor about the edition that is about to close. */
export function closingRound(store, config, { now = Date.now(), log = () => {}, notify = null } = {}) {
  const line = getLine(store);
  if (!featureOn(line, 'closing')) return null;
  const p = preview(store, config, { now });
  const id = p.editionId;
  if (store.items(KIND, { after: now - HOUR, limit: 10 }).some((c) => c.type === 'closing' && c.editionId === id)) return null;
  const c = closingCall(p, closingVariant(p.hour));
  if (!c) return null;
  const call = store.saveItem({
    kind: KIND,
    type: 'closing',
    status: 'open',
    ts: now,
    ref: id,
    editionId: id,
    ...c,
    by: { id: 'desk', name: tr({ en: 'The desk', it: 'Il desk' }), role: '' },
    deadline: p.printsAt,
  });
  log(tr({ en: `[newsroom] closing call for ${id}`, it: `[redazione] chiamata di chiusura per ${id}` }));
  notify?.call?.(callView(call, now));
  return call;
}

/** At print: how the Editor answered the closing call of this edition, if they did. */
export function closingOf(store, { windowStart, end }) {
  const c = store.items(KIND, { after: windowStart, before: end, limit: 10 }).find((x) => x.type === 'closing' && x.status === 'answered');
  return c ? { question: c.question, answer: c.answer, option: c.option, storyId: c.options?.find((o) => o.id === c.option)?.storyId || null, at: c.answeredAt } : null;
}

/** The milliseconds until the next :55 (or the configured minute). */
export function msToClosing(now = Date.now(), minute = 55) {
  const d = new Date(now);
  const target = new Date(d);
  target.setMinutes(minute, 0, 0);
  if (target.getTime() <= now) target.setTime(target.getTime() + HOUR);
  return target.getTime() - now;
}

