/**
 * The Inquiry: the paper's most ambitious piece, about 1500 words in the manner of The New Yorker,
 * written by the creative model (llm.creative) and built with the Editor over several turns:
 *
 *   angle     the Editor names the subject (and a lead, if they like); the reporter reads the
 *             signals and proposes angles, with what each would need; the Editor picks or rewrites
 *   data      what the angle needs: what the signals hold (the reporter searches the archive for
 *             it) and what only the Editor knows (they answer)
 *   sources   what the piece stands on: the signals, the paper's archive, the Editor's testimony,
 *             documents, people, each with how it may be attributed
 *   outline   lede, nut graf, movements, ending: the Editor fixes it
 *   writing   the creative model writes it, section by section, with everything above
 *   draft     the finished piece, waiting to go to the Editor desk
 *   desk      the Editor desk: the claims checked against the sources, the structure, the style,
 *             the headline; a conversation with the managing editor, rewrites section by section
 *   published out as a long read (a published feature)
 *
 * At every stage the reporter asks questions; the Editor's answers can raise follow-ups (another
 * turn, deeper), until the reporter has enough or the Editor moves on.
 *
 * Items of kind 'inquiry'. `working` names the job running in the background, if any.
 */
import { tr, lang } from '../i18n.js';
import { gather, timeline, dataSheet, typeset } from './investigations.js';
import { DeskError, cleanHeadline } from './edition.js';
import { getLine } from './line.js';
import { writerFor, columnist, byline } from './writers.js';
import { deskPeople, phrasingDesk } from './chain.js';
import { connectLLM, connectCreative, chat, parseJson } from './llm.js';
import { numbersCheck } from './factcheck.js';
import { lint, registerCheck } from './lint.js';

export { registerCheck };
import { words } from './tips.js';
import { isSensitive } from './spotlight/detectors.js';
import { say } from './chatter.js';
import { dayKey, hhmm } from '../util.js';

const KIND = 'inquiry';
const DAY = 24 * 3600e3;
export const STAGES = ['angle', 'data', 'sources', 'outline', 'writing', 'draft', 'desk', 'published'];
/** The length of the piece, in words. */
export const TARGET = 1500;
/** Follow-up turns per stage: after these the reporter has what it needs. */
const ROUNDS = 3;
const running = new Set();

const q = (s) => (lang() === 'it' ? `«${s}»` : `“${s}”`);
const unquote = (s) => String(s || '').trim().replace(/^["«“”]+|["»”“]+$/g, '').trim();
const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const wordsIn = (paras) => (paras || []).join(' ').split(/\s+/).filter(Boolean).length;
export const wordsOf = (i) => (i.blocks || []).reduce((n, b) => n + wordsIn(b.paragraphs), 0);

/** The archive on some words, without the signals the paper never writes about (health, money, love…). */
function gatherClean(store, q) {
  const d = gather(store, q);
  d.events = d.events.filter((e) => !isSensitive(`${e.title || ''} ${e.host || ''}`));
  d.numbers.titles = (d.numbers.titles || []).filter((t) => !isSensitive(t.name));
  return d;
}

/** Search words for a subject: a site name is searched as a phrase ("chess.com", not "chess"). */
const searchWords = (text, n = 4) => words(text).slice(0, n).map((w) => (w.includes('.') ? `"${w}"` : w)).join(' ');

// ───────────────────────── Store ─────────────────────────

export function getInquiry(store, id) {
  const i = store.getItem(KIND, id);
  if (!i) throw new DeskError(tr({ en: 'Inquiry not found', it: 'Inchiesta non trovata' }), 404);
  return { ...i, busy: running.has(i.id), words: wordsOf(i), target: TARGET };
}

export const inquiries = (store, { limit = 30 } = {}) => store.items(KIND, { limit })
  .map((i) => ({ id: i.id, ts: i.ts, status: i.status, topic: i.topic, headline: i.headline || i.outline?.headline || i.angle?.title || i.topic, dek: i.dek || i.angle?.angle || '', words: wordsOf(i), busy: running.has(i.id), working: i.working || null, featureId: i.featureId || null, reporter: i.reporter || null }));

const save = (store, i) => {
  const { busy, words: _w, target: _t, ...rest } = i;
  return store.saveItem(rest);
};

/** Who works on it: the reporter (the Spotlight desk, the paper's investigator) and the managing editor. */
const reporterOf = (line) => writerFor(line, 'spotlight') || columnist(line);
const editorOf = () => deskPeople().editor;

/** A line in the conversation. */
function post(i, who, text, extra = {}) {
  i.thread = [...(i.thread || []), { id: uid('m'), who, stage: i.status, text: String(text || '').trim(), at: Date.now(), ...extra }];
}

/** New questions from the reporter, for this stage. */
function ask(i, list, round) {
  const qs = (list || []).map((x) => String(x || '').trim()).filter((x) => x && x.length < 260 && !isSensitive(x)).slice(0, 3)
    .map((x) => ({ id: uid('q'), stage: i.status, round, q: x, a: '' }));
  i.questions = [...(i.questions || []), ...qs];
  return qs.map((x) => x.id);
}

const roundOf = (i) => Math.max(0, ...(i.questions || []).filter((x) => x.stage === i.status).map((x) => x.round || 0));

/** Refuse a change while the reporter is working on this inquiry (before anything is saved). */
function idle(i) {
  if (running.has(Number(i.id))) throw new DeskError(tr({ en: 'Wait: the reporter is working on it.', it: 'Aspetti: il cronista ci sta lavorando.' }), 409);
  return i;
}

/** Run a job in the background, one at a time per inquiry; an error is told in the conversation. */
function job(store, id, name, log, fn) {
  const n = Number(id);
  if (running.has(n)) throw new DeskError(tr({ en: 'The reporter is already working on it.', it: 'Il cronista ci sta già lavorando.' }), 409);
  running.add(n);
  const i = store.getItem(KIND, n);
  if (i) store.saveItem({ ...i, working: name, error: null });
  Promise.resolve().then(fn).catch((e) => {
    log(tr({ en: `[inquiry] ${id}: ${e.message}`, it: `[inchiesta] ${id}: ${e.message}` }));
    const cur = store.getItem(KIND, n);
    if (cur) {
      const blocks = (cur.blocks || []).map((b) => (b.status === 'writing' ? { ...b, status: b.paragraphs?.length ? 'done' : 'pending' } : b));
      store.saveItem({ ...cur, blocks, status: cur.status === 'writing' ? 'draft' : cur.status, error: e.message });
    }
  }).finally(() => {
    running.delete(n);
    const cur = store.getItem(KIND, n);
    if (cur?.working) store.saveItem({ ...cur, working: null });
  });
}

/** After a restart: no job is running any more. */
export function interruptedInquiries(store) {
  for (const i of store.items(KIND, { limit: 100 })) {
    if (!i.working && i.status !== 'writing') continue;
    const blocks = (i.blocks || []).map((b) => (b.status === 'writing' ? { ...b, status: b.paragraphs?.length ? 'done' : 'pending' } : b));
    store.saveItem({ ...i, working: null, blocks, status: i.status === 'writing' ? 'draft' : i.status, error: i.working ? 'interrupted' : i.error || null });
  }
}

// ───────────────────────── What the writer knows ─────────────────────────

/** The sources, numbered, as the writer and the desk read them. */
function sourceSheet(i) {
  const how = {
    on: tr({ en: 'on the record: name them', it: 'in chiaro: nominala' }),
    background: tr({ en: 'background: use it, never name it', it: 'in background: usala, non nominarla mai' }),
    anon: tr({ en: 'anonymous: "a person close to the owner"', it: 'anonima: «una persona vicina al proprietario»' }),
  };
  return (i.sources || []).filter((s) => s.use !== false)
    .map((s) => `[${s.id}] ${s.label}${s.attribution && s.attribution !== 'on' ? ` (${how[s.attribution] || ''})` : ''}: ${cut(s.text, 900)}`).join('\n');
}

/** Everything the piece may use: the file, the angle, the data, the sources, the Editor's words. */
export function factsOf(i, { full = true } = {}) {
  const parts = [];
  if (i.topic) parts.push(`${tr({ en: 'SUBJECT', it: 'ARGOMENTO' })}: ${i.topic}`);
  if (i.lead) parts.push(`${tr({ en: 'THE EDITOR\'S LEAD (where to look; not a quote)', it: 'LA TRACCIA DEL DIRETTORE (dove guardare; non è una citazione)' })}: ${q(i.lead)}`);
  if (i.angle) parts.push(`${tr({ en: 'THE ANGLE', it: 'L\'ANGOLO' })}: ${i.angle.title} — ${i.angle.angle}`);
  if (full && i.dossier) parts.push(`${tr({ en: 'THE FILE (the signals recorded by the Mac)', it: 'IL FASCICOLO (i segnali registrati dal Mac)' })}:\n${i.dossier}`);
  const data = (i.needs || []).filter((n) => n.use !== false && (n.found || n.answer?.trim()));
  if (data.length) {
    parts.push(`${tr({ en: 'THE DATA GATHERED', it: 'I DATI RACCOLTI' })}:\n${data.map((n) => `- ${n.text}: ${n.found ? n.found : ''}${n.answer?.trim() ? `${n.found ? ' · ' : ''}${tr({ en: 'the owner says', it: 'il proprietario dice' })} ${q(n.answer.trim())}` : ''}`).join('\n')}`);
  }
  const said = (i.questions || []).filter((x) => x.a?.trim());
  if (said.length) {
    parts.push(`${tr({ en: 'THE OWNER\'S STATEMENTS (real, from the interview: quote them word for word and attribute them)', it: 'LE DICHIARAZIONI DEL PROPRIETARIO (vere, dall\'intervista: citale parola per parola e attribuiscile)' })}:\n${said.map((x) => `- ${q(x.q)} → ${q(x.a.trim())}`).join('\n')}`);
  }
  const src = sourceSheet(i);
  if (src) parts.push(`${tr({ en: 'THE SOURCES (attribute each one as indicated)', it: 'LE FONTI (attribuisci ciascuna come indicato)' })}:\n${src}`);
  return parts.join('\n\n');
}

function system(i, line, persona, task) {
  return tr({
    en: `You are a reporter of The Localhost Times, the paper about what happens on its owner's Mac, and you are working on the paper's inquiry: a long piece of about ${TARGET} words, in the manner of The New Yorker, built from the signals the Mac recorded and from the sources the Editor (the owner) gave you. Now: ${task}.
Rules on facts (never broken): every fact and every number comes from the file, the data gathered, the Editor's statements or the sources; don't invent causes, feelings, dialogue or outcomes; what isn't known, say it isn't known. Never ask or write about health, money, love, faith, politics or the law.`,
    it: `Sei un cronista del «The Localhost Times», il giornale di ciò che succede sul Mac del suo proprietario, e lavori all'inchiesta del giornale: un pezzo lungo, circa ${TARGET} parole, alla maniera del New Yorker, costruito dai segnali registrati dal Mac e dalle fonti che ti ha dato il Direttore (il proprietario). Ora: ${task}.
Regole sui fatti (inviolabili): ogni fatto e ogni numero viene dal fascicolo, dai dati raccolti, dalle dichiarazioni del Direttore o dalle fonti; non inventare cause, sentimenti, dialoghi o esiti; quello che non si sa, si dice che non si sa. Mai domande o frasi su salute, soldi, amore, fede, politica o giustizia. Dai del lei al Direttore.`,
  }) + (line?.notes?.trim() ? tr({ en: `\nThe Editor's notes: ${line.notes.trim()}`, it: `\nNote del direttore: ${line.notes.trim()}` }) : '') + (persona ? tr({ en: `\nYou are ${persona.name}, ${persona.role} of the paper.`, it: `\nSei ${persona.name}, ${persona.role} del giornale.` }) : '');
}

const said = (i, stage) => (i.questions || []).filter((x) => x.stage === stage && x.a?.trim()).map((x) => `- ${q(x.q)} → ${q(x.a.trim())}`).join('\n');

/** The conversation so far, short, for the follow-up turns. */
const talkSoFar = (i) => (i.thread || []).slice(-10).map((m) => `${m.who === 'director' ? tr({ en: 'EDITOR', it: 'DIRETTORE' }) : tr({ en: 'REPORTER', it: 'CRONISTA' })}: ${cut(m.text, 600)}`).join('\n');

// ───────────────────────── 1. Subject → angles ─────────────────────────

/**
 * The Editor names the subject (and a lead, if they like). The file is gathered at once from the
 * signals of the last `days`; the reporter reads it and proposes angles in the background.
 */
export function createInquiry(store, config, { topic, lead, days = 30, now = Date.now() } = {}, log = console.log) {
  const subject = cut(topic, 120);
  if (!subject) throw new DeskError(tr({ en: 'Tell the reporter the subject.', it: 'Dica al cronista l\'argomento.' }), 400);
  const span = Math.max(3, Math.min(90, Number(days) || 30));
  const from = startOfDay(now) - (span - 1) * DAY;
  const keywords = [searchWords(subject), searchWords(lead || '', 2)].filter(Boolean).join(' ') || subject;
  let d = null;
  try { d = gatherClean(store, { keywords, from, to: now }); } catch { d = null; }
  const tl = d ? timeline(d) : [];
  const line = getLine(store);
  const persona = reporterOf(line);
  const i = {
    kind: KIND, status: 'angle', ts: now, ref: null,
    topic: subject, lead: cut(lead, 800) || null, days: span, from, to: now, keywords,
    dossier: d?.numbers.total ? dataSheet(subject, d, tl, from, now) : '',
    numbers: d?.numbers || null, timeline: tl, coverage: d?.coverage?.slice(-12) || [],
    evidence: (d?.events || []).slice(-30).map((e) => ({ ts: e.ts, kind: e.kind, title: e.title, detail: e.detail, host: e.host, url: null, source: e.source })),
    reporter: byline(persona), editor: editorOf(),
    thread: [], questions: [], angles: [], angle: null, needs: [], sources: [], outline: null, blocks: [],
    headline: '', dek: '', kicker: '', alternatives: [], desk: null, deskThread: [], working: null, error: null,
  };
  post(i, 'director', i.lead ? `${subject}\n\n${tr({ en: 'Lead', it: 'Traccia' })}: ${i.lead}` : subject);
  const saved = save(store, i);
  if (persona) say(store, persona.id, tr({ en: `${persona.name}: the Editor wants an inquiry on ${q(subject)}. Opening the file.`, it: `${persona.name}: il Direttore vuole un'inchiesta su ${q(subject)}. Apro il fascicolo.` }), now);
  job(store, saved.id, 'angles', log, () => proposeAngles(store, config, saved.id));
  return getInquiry(store, saved.id);
}

function typesetAngles(i) {
  const n = i.numbers;
  const t = i.topic;
  const hh = n?.busiestHour ? `${String(n.busiestHour.hour).padStart(2, '0')}:00` : null;
  const out = [
    { title: tr({ en: 'The chronicle', it: 'La cronaca' }), angle: tr({ en: `How ${t} entered the owner's days, one day after another`, it: `Come ${t} è entrato nelle giornate del proprietario, un giorno dopo l'altro` }), why: n?.total ? tr({ en: `${n.total} signals on ${n.activeDays} days`, it: `${n.total} segnali in ${n.activeDays} giorni` }) : tr({ en: 'The Editor\'s memory, more than the archive', it: 'La memoria del Direttore, più dell\'archivio' }) },
  ];
  if (hh) out.push({ title: tr({ en: 'The hour', it: 'L\'ora' }), angle: tr({ en: `Why ${t} lives above all at ${hh}`, it: `Perché ${t} vive soprattutto alle ${hh}` }), why: tr({ en: `${n.busiestHour.n} signals at that hour`, it: `${n.busiestHour.n} segnali a quell'ora` }) });
  if (n?.sites?.length) out.push({ title: tr({ en: 'The places', it: 'I luoghi' }), angle: tr({ en: `${t} through the sites where it happens: ${n.sites.slice(0, 3).map((s) => s.name).join(', ')}`, it: `${t} attraverso i siti dove succede: ${n.sites.slice(0, 3).map((s) => s.name).join(', ')}` }), why: tr({ en: `${n.sites[0].name}: ${n.sites[0].n} signals`, it: `${n.sites[0].name}: ${n.sites[0].n} segnali` }) });
  else out.push({ title: tr({ en: 'The person', it: 'La persona' }), angle: tr({ en: `${t} as the owner tells it: what the signals can't see`, it: `${t} come lo racconta il proprietario: ciò che i segnali non vedono` }), why: tr({ en: 'It rests on the interview', it: 'Si regge sull\'intervista' }) });
  return out;
}

const typesetQuestions = (i) => tr({
  en: [`Chief, when did ${i.topic} really begin, before the Mac noticed?`, 'What were you looking for, that the signals can\'t see?', 'Who else is in this story?'],
  it: [`Direttore, quando è cominciato davvero ${i.topic}, prima che il Mac se ne accorgesse?`, 'Che cosa cercava, che i segnali non possono vedere?', 'Chi altro c\'entra in questa storia?'],
});

const cleanAngles = (list) => (Array.isArray(list) ? list : []).map((a) => ({
  id: uid('a'), title: cut(a.title, 80), angle: cut(a.angle, 400), why: cut(a.why, 300), needs: cut(a.needs, 300),
})).filter((a) => a.title && a.angle && !isSensitive([a.title, a.angle, a.why, a.needs].join(' '))).slice(0, 4);

async function proposeAngles(store, config, id) {
  const llm = await connectCreative(config);
  let i = getInquiry(store, id);
  const line = getLine(store);
  const persona = reporterOf(line);
  let j = null;
  if (llm) {
    const msgs = [
      {
        role: 'system',
        content: system(i, line, persona, tr({ en: 'read the file and propose the angle', it: 'leggere il fascicolo e proporre l\'angolo' })) + tr({
          en: `\nAn angle is what the piece is really about: not the subject ("chess") but the story inside it ("the rival who keeps coming back at night"). Read the file like an investigator: patterns, anomalies, beginnings and endings, what repeats and what breaks. Propose 3 angles, different from one another, each with a working title, the angle in one sentence, why the signals support it (with a figure from the file) and what it would need that the file doesn't have. Then ask the Editor 2 or 3 questions that go deep: the ones only they can answer, which would change the piece.${i.dossier ? '' : ' The file is empty: the angles must rest on what the Editor can tell.'}
Reply ONLY with JSON: {"reading": "what you see in the file, 2-3 sentences", "angles": [{"title": "...", "angle": "...", "why": "...", "needs": "..."}], "questions": ["...", "..."]}`,
          it: `\nL'angolo è ciò di cui il pezzo parla davvero: non l'argomento («gli scacchi») ma la storia dentro («l'avversario che torna di notte»). Leggi il fascicolo da investigatore: ricorrenze, anomalie, inizi e fini, cosa si ripete e cosa si rompe. Proponi 3 angoli, diversi tra loro, ciascuno con un titolo di lavoro, l'angolo in una frase, perché i segnali lo sostengono (con un numero del fascicolo) e cosa gli servirebbe che il fascicolo non ha. Poi fai al Direttore 2 o 3 domande che vanno a fondo: quelle a cui solo lui può rispondere e che cambierebbero il pezzo.${i.dossier ? '' : ' Il fascicolo è vuoto: gli angoli devono reggersi su ciò che il Direttore può raccontare.'}
Rispondi SOLO con JSON: {"reading": "cosa vedi nel fascicolo, 2-3 frasi", "angles": [{"title": "...", "angle": "...", "why": "...", "needs": "..."}], "questions": ["...", "..."]}`,
        }),
      },
      { role: 'user', content: factsOf(i) },
    ];
    try { j = parseJson(await chat(llm, config, msgs, 2400)); } catch { j = null; }
  }
  i = getInquiry(store, id);
  const angles = cleanAngles(j?.angles);
  i.angles = angles.length ? angles : typesetAngles(i).map((a) => ({ id: uid('a'), needs: '', ...a }));
  const reading = cut(j?.reading, 900) || (i.numbers?.total
    ? tr({ en: `The file holds ${i.numbers.total} signals on ${q(i.topic)} in ${i.days} days. Here is where I would look.`, it: `Il fascicolo ha ${i.numbers.total} segnali su ${q(i.topic)} in ${i.days} giorni. Ecco dove guarderei.` })
    : tr({ en: `The archive has nothing on ${q(i.topic)} in the last ${i.days} days: the piece will rest on what you tell me. Here are the angles I see.`, it: `L'archivio non ha niente su ${q(i.topic)} negli ultimi ${i.days} giorni: il pezzo si reggerà su ciò che mi racconterà lei. Ecco gli angoli che vedo.` }));
  const qids = ask(i, j?.questions?.length ? j.questions : typesetQuestions(i), 1);
  post(i, 'reporter', reading, { kind: 'angles', qids });
  i.writer = llm?.model || null;
  save(store, i);
}

// ───────────────────────── The turns: the Editor answers, the reporter digs ─────────────────────────

/**
 * The Editor answers the reporter's questions and/or says something. The reporter takes note and,
 * if the answers open something, asks again, deeper (at most ROUNDS turns per stage). At the angle
 * stage a remark can also bring new angles.
 */
export function replyInquiry(store, config, id, { answers = {}, text = '' } = {}, log = console.log) {
  const i = idle(getInquiry(store, id));
  if (!['angle', 'data', 'sources', 'outline'].includes(i.status)) throw new DeskError(tr({ en: 'The interview is over: the piece is being written.', it: 'L\'intervista è chiusa: il pezzo è in scrittura.' }), 409);
  const lines = [];
  i.questions = (i.questions || []).map((x) => {
    const a = String(answers?.[x.id] ?? '').trim().slice(0, 1200);
    if (!a || x.a) return x;
    lines.push(`${q(x.q)}\n${a}`);
    return { ...x, a, at: Date.now() };
  });
  const t = String(text || '').trim().slice(0, 2000);
  if (t) lines.push(t);
  if (!lines.length) throw new DeskError(tr({ en: 'Answer at least one question, or write something.', it: 'Risponda almeno a una domanda, o scriva qualcosa.' }), 400);
  post(i, 'director', lines.join('\n\n'));
  save(store, i);
  job(store, i.id, 'followup', log, () => followUp(store, config, i.id, t));
  return getInquiry(store, i.id);
}

async function followUp(store, config, id, remark) {
  const llm = await connectCreative(config);
  let i = getInquiry(store, id);
  const line = getLine(store);
  const persona = reporterOf(line);
  const round = roundOf(i);
  const more = round < ROUNDS;
  const stageTask = {
    angle: tr({ en: 'choosing the angle with the Editor', it: 'scegliere l\'angolo con il Direttore' }),
    data: tr({ en: 'gathering the data the angle needs', it: 'raccogliere i dati che servono all\'angolo' }),
    sources: tr({ en: 'deciding the sources', it: 'decidere le fonti' }),
    outline: tr({ en: 'building the outline', it: 'costruire la scaletta' }),
  }[i.status];
  let j = null;
  if (llm) {
    const msgs = [
      {
        role: 'system',
        content: system(i, line, persona, stageTask) + tr({
          en: `\nThe Editor has just answered you. Take note like a good reporter: say in 1-3 sentences what their words change for the piece (a new thread, a detail to keep, a doubt). ${more ? 'If the answers open something worth digging into, ask 1 or 2 follow-up questions that go deeper (why, how exactly, who else, what happened next); if you have enough, ask none.' : 'You have enough: ask no more questions.'}${i.status === 'angle' ? ' If the Editor asked for a different direction, propose up to 3 new angles in "angles"; otherwise leave it empty.' : ''}
Reply ONLY with JSON: {"note": "...", "questions": [...]${i.status === 'angle' ? ', "angles": [{"title": "...", "angle": "...", "why": "...", "needs": "..."}]' : ''}}`,
          it: `\nIl Direttore ti ha appena risposto. Prendi nota da buon cronista: di' in 1-3 frasi cosa cambiano le sue parole per il pezzo (un filo nuovo, un dettaglio da tenere, un dubbio). ${more ? 'Se le risposte aprono qualcosa che vale la pena scavare, fai 1 o 2 domande di approfondimento che vanno più a fondo (perché, come esattamente, chi altro, cosa è successo dopo); se hai abbastanza, non farne.' : 'Hai abbastanza: non fare altre domande.'}${i.status === 'angle' ? ' Se il Direttore ha chiesto una direzione diversa, proponi fino a 3 angoli nuovi in «angles»; altrimenti lascialo vuoto.' : ''}
Rispondi SOLO con JSON: {"note": "...", "questions": [...]${i.status === 'angle' ? ', "angles": [{"title": "...", "angle": "...", "why": "...", "needs": "..."}]' : ''}}`,
        }),
      },
      { role: 'user', content: `${factsOf(i, { full: i.status === 'angle' })}\n\n${tr({ en: 'THE CONVERSATION', it: 'LA CONVERSAZIONE' })}:\n${talkSoFar(i)}` },
    ];
    try { j = parseJson(await chat(llm, config, msgs, 1600)); } catch { j = null; }
  }
  i = getInquiry(store, id);
  const fresh = i.status === 'angle' ? cleanAngles(j?.angles) : [];
  if (fresh.length) i.angles = [...fresh, ...i.angles].slice(0, 6);
  const qids = more ? ask(i, j?.questions, round + 1) : [];
  const note = cut(j?.note, 900) || (remark
    ? tr({ en: 'Noted. It goes in the notebook.', it: 'Preso nota. Va nel taccuino.' })
    : tr({ en: 'Noted: these answers go in the piece, word for word.', it: 'Preso nota: queste risposte vanno nel pezzo, parola per parola.' }));
  post(i, 'reporter', note, { kind: fresh.length ? 'angles' : 'note', qids });
  save(store, i);
}

// ───────────────────────── 2. The angle → the data ─────────────────────────

/** The Editor picks an angle (or writes their own): the reporter lists the data it needs. */
export function chooseAngle(store, config, id, { angleId, title, angle } = {}, log = console.log) {
  const i = idle(getInquiry(store, id));
  if (i.status !== 'angle') throw new DeskError(tr({ en: 'The angle has already been chosen.', it: 'L\'angolo è già stato scelto.' }), 409);
  const picked = i.angles.find((a) => a.id === angleId);
  const custom = { title: cut(title, 80), angle: cut(angle, 400) };
  const a = custom.angle ? { title: custom.title || cut(custom.angle, 60), angle: custom.angle, why: '', own: true } : picked;
  if (!a) throw new DeskError(tr({ en: 'Choose an angle, or write your own.', it: 'Scelga un angolo, o scriva il suo.' }), 400);
  i.angle = { title: a.title, angle: a.angle, why: a.why || '', needs: a.needs || '', own: !!a.own };
  post(i, 'director', tr({ en: `The angle: ${a.title} — ${a.angle}`, it: `L'angolo: ${a.title} — ${a.angle}` }));
  i.status = 'data';
  save(store, i);
  job(store, i.id, 'needs', log, () => proposeNeeds(store, config, i.id));
  return getInquiry(store, i.id);
}

/** What the archive holds on some words, in the inquiry's period: a line of real data. */
function findInSignals(store, i, search) {
  const kw = searchWords(search, 5);
  if (!kw) return null;
  try {
    const d = gatherClean(store, { keywords: kw, from: i.from, to: i.to });
    const n = d.numbers;
    if (!n.total) return tr({ en: `no signals on ${q(search)} in the period`, it: `nessun segnale su ${q(search)} nel periodo` });
    const peak = n.busiestDay ? tr({ en: `, peak ${dayKey(n.busiestDay.ts)} (${n.busiestDay.n})`, it: `, picco il ${dayKey(n.busiestDay.ts)} (${n.busiestDay.n})` }) : '';
    const hour = n.busiestHour ? tr({ en: `, mostly at ${String(n.busiestHour.hour).padStart(2, '0')}:00`, it: `, soprattutto alle ${String(n.busiestHour.hour).padStart(2, '0')}:00` }) : '';
    const ex = d.events.slice(0, 2).concat(d.events.slice(-2)).filter((e, k, arr) => arr.findIndex((x) => x.id === e.id) === k)
      .map((e) => `${dayKey(e.ts)} ${hhmm(e.ts)} ${q(cut(e.title, 70))}`).join('; ');
    return tr({
      en: `${n.total} signal${n.total === 1 ? '' : 's'} on ${n.activeDays} day${n.activeDays === 1 ? '' : 's'}${peak}${hour}; first ${dayKey(n.first)} ${hhmm(n.first)}, last ${dayKey(n.last)} ${hhmm(n.last)}. E.g. ${ex}`,
      it: `${n.total} ${n.total === 1 ? 'segnale' : 'segnali'} in ${n.activeDays === 1 ? 'un giorno' : `${n.activeDays} giorni`}${peak}${hour}; il primo il ${dayKey(n.first)} alle ${hhmm(n.first)}, l'ultimo il ${dayKey(n.last)} alle ${hhmm(n.last)}. Per esempio: ${ex}`,
    });
  } catch { return null; }
}

function typesetNeeds(i) {
  return [
    { kind: 'signals', text: tr({ en: `The full chronology of ${i.topic}`, it: `La cronologia completa di ${i.topic}` }), search: i.topic, why: tr({ en: 'the spine of the piece', it: 'la spina dorsale del pezzo' }) },
    { kind: 'owner', text: tr({ en: 'What happened before the period the Mac observed', it: 'Cosa è successo prima del periodo osservato dal Mac' }), why: tr({ en: 'the signals start late', it: 'i segnali cominciano tardi' }) },
    { kind: 'owner', text: tr({ en: 'The moment it mattered most, in your words', it: 'Il momento in cui ha contato di più, con le sue parole' }), why: tr({ en: 'the scene for the lede', it: 'la scena per l\'attacco' }) },
  ];
}

async function proposeNeeds(store, config, id) {
  const llm = await connectCreative(config);
  let i = getInquiry(store, id);
  const line = getLine(store);
  const persona = reporterOf(line);
  let j = null;
  if (llm) {
    const msgs = [
      {
        role: 'system',
        content: system(i, line, persona, tr({ en: 'list the data the chosen angle needs', it: 'elencare i dati che servono all\'angolo scelto' })) + tr({
          en: `\nThink like an investigative reporter with this angle: which data would make the piece stand up? List 4 to 6. Two kinds: "signals" — something the Mac's archive may hold (give in "search" 1-4 words to search the history for: a site, a title, a project, a name); "owner" — something only the Editor knows (a date before the records, a reason, a scene, a person). For each, why it matters to the piece. Then ask the Editor 1 or 2 deep questions about the angle.
Reply ONLY with JSON: {"note": "1-2 sentences on how you will build the angle", "needs": [{"kind": "signals", "text": "...", "search": "...", "why": "..."}, {"kind": "owner", "text": "...", "why": "..."}], "questions": ["..."]}`,
          it: `\nRagiona da cronista d'inchiesta con questo angolo: quali dati farebbero stare in piedi il pezzo? Elencane da 4 a 6. Di due tipi: «signals» — qualcosa che l'archivio del Mac può avere (in «search» 1-4 parole da cercare nella cronologia: un sito, un titolo, un progetto, un nome); «owner» — qualcosa che sa solo il Direttore (una data prima delle registrazioni, un motivo, una scena, una persona). Per ciascuno, perché conta per il pezzo. Poi fai al Direttore 1 o 2 domande profonde sull'angolo.
Rispondi SOLO con JSON: {"note": "1-2 frasi su come costruirai l'angolo", "needs": [{"kind": "signals", "text": "...", "search": "...", "why": "..."}, {"kind": "owner", "text": "...", "why": "..."}], "questions": ["..."]}`,
        }),
      },
      { role: 'user', content: factsOf(i) },
    ];
    try { j = parseJson(await chat(llm, config, msgs, 2000)); } catch { j = null; }
  }
  i = getInquiry(store, id);
  const list = (Array.isArray(j?.needs) && j.needs.length ? j.needs : typesetNeeds(i)).slice(0, 6);
  i.needs = list.map((n) => {
    const kind = n.kind === 'signals' ? 'signals' : 'owner';
    const search = kind === 'signals' ? cut(n.search || n.text, 60) : '';
    return { id: uid('n'), kind, text: cut(n.text, 200), why: cut(n.why, 240), search, use: true, answer: '', found: kind === 'signals' ? findInSignals(store, i, search) : null };
  }).filter((n) => n.text && !isSensitive(n.text));
  const found = i.needs.filter((n) => n.kind === 'signals' && n.found).length;
  const qids = ask(i, j?.questions, 1);
  post(i, 'reporter', [cut(j?.note, 600), found ? tr({ en: `I searched the archive for ${found === 1 ? 'one of them' : `${found} of them`}: here is what's there. The others only you can tell me.`, it: `Ne ho cercat${found === 1 ? 'o uno' : `i ${found}`} nell'archivio: ecco cosa c'è. Gli altri può dirmeli solo lei.` }) : ''].filter(Boolean).join(' ') || tr({ en: 'Here is what I need for this angle.', it: 'Ecco cosa mi serve per questo angolo.' }), { kind: 'needs', qids });
  save(store, i);
}

/** The Editor confirms the data (keeps, drops, answers, adds): the reporter lists the sources. */
export function confirmData(store, config, id, { needs = [], extra = [] } = {}, log = console.log) {
  const i = idle(getInquiry(store, id));
  if (i.status !== 'data') throw new DeskError(tr({ en: 'This is not the moment for the data.', it: 'Non è il momento dei dati.' }), 409);
  const by = new Map((Array.isArray(needs) ? needs : []).map((n) => [n.id, n]));
  i.needs = i.needs.map((n) => {
    const x = by.get(n.id);
    return x ? { ...n, use: x.use !== false, answer: String(x.answer ?? n.answer ?? '').trim().slice(0, 1500) } : n;
  });
  for (const t of (Array.isArray(extra) ? extra : [extra]).map((x) => String(x || '').trim()).filter(Boolean)) {
    i.needs.push({ id: uid('n'), kind: 'owner', text: cut(t, 200), why: '', use: true, answer: t.slice(0, 1500), found: null, added: true });
  }
  const kept = i.needs.filter((n) => n.use !== false).length;
  post(i, 'director', tr({ en: `The data: ${kept} kept${i.needs.some((n) => n.answer) ? ', with my answers' : ''}.`, it: `I dati: ne tengo ${kept}${i.needs.some((n) => n.answer) ? ', con le mie risposte' : ''}.` }));
  i.status = 'sources';
  save(store, i);
  job(store, i.id, 'sources', log, () => proposeSources(store, config, i.id));
  return getInquiry(store, i.id);
}

// ───────────────────────── 3. The sources ─────────────────────────

/** The sources the piece already has: the signals, the paper, the Editor's words, the data found. */
function baseSources(i) {
  const out = [];
  const n = i.numbers;
  if (n?.total) out.push({ kind: 'signals', label: tr({ en: 'The Mac\'s signals', it: 'I segnali del Mac' }), text: tr({ en: `${n.total} signals on ${n.activeDays} of ${n.days} days (${dayKey(i.from)} → ${dayKey(i.to)}); sections: ${Object.entries(n.bySource).map(([k, v]) => `${k} ${v}`).join(', ')}`, it: `${n.total} segnali in ${n.activeDays} giorni su ${n.days} (${dayKey(i.from)} → ${dayKey(i.to)}); sezioni: ${Object.entries(n.bySource).map(([k, v]) => `${k} ${v}`).join(', ')}` }), attribution: 'on', auto: true });
  if (i.coverage?.length) out.push({ kind: 'archive', label: tr({ en: 'The paper\'s archive', it: 'L\'archivio del giornale' }), text: i.coverage.map((c) => `${dayKey(c.ts)} ${q(c.headline)}`).join('; '), attribution: 'on', auto: true });
  for (const x of i.needs.filter((y) => y.use !== false && y.kind === 'signals' && y.found)) {
    out.push({ kind: 'signals', label: cut(x.text, 80), text: x.found, attribution: 'on', auto: true });
  }
  const words = [...(i.questions || []).filter((x) => x.a?.trim()).map((x) => `${q(x.q)} → ${q(x.a.trim())}`), ...i.needs.filter((y) => y.use !== false && y.answer?.trim()).map((y) => `${y.text}: ${q(y.answer.trim())}`)];
  if (words.length) out.push({ kind: 'testimony', label: tr({ en: 'The Editor\'s interview', it: 'L\'intervista al Direttore' }), text: words.join(' · '), attribution: 'on', auto: true });
  return out.map((s, k) => ({ id: `s${k + 1}`, use: true, ...s }));
}

async function proposeSources(store, config, id) {
  const llm = await connectCreative(config);
  let i = getInquiry(store, id);
  const keep = (i.sources || []).filter((s) => !s.auto);
  i.sources = [...baseSources(i), ...keep.map((s, k) => ({ ...s, id: `s${100 + k}` }))];
  save(store, i);
  const line = getLine(store);
  const persona = reporterOf(line);
  let j = null;
  if (llm) {
    const msgs = [
      {
        role: 'system',
        content: system(i, line, persona, tr({ en: 'decide what the piece stands on', it: 'decidere su cosa si regge il pezzo' })) + tr({
          en: `\nThese are the sources you have. Say in 1-2 sentences how solid the piece is on them, and which claim of the angle is still weak. Then list up to 4 sources that would strengthen it, which the Editor could give: a person who was there (and how they could be quoted), a document, a note, a message, a photo. Then 1 or 2 questions on the sources.
Reply ONLY with JSON: {"note": "...", "missing": [{"kind": "person|document|note", "text": "..."}], "questions": ["..."]}`,
          it: `\nQueste sono le fonti che hai. Di' in 1-2 frasi quanto è solido il pezzo su di esse, e quale affermazione dell'angolo è ancora debole. Poi elenca fino a 4 fonti che lo rafforzerebbero e che il Direttore potrebbe dare: una persona che c'era (e come si potrebbe citarla), un documento, una nota, un messaggio, una foto. Poi 1 o 2 domande sulle fonti.
Rispondi SOLO con JSON: {"note": "...", "missing": [{"kind": "person|document|note", "text": "..."}], "questions": ["..."]}`,
        }),
      },
      { role: 'user', content: factsOf(i, { full: false }) },
    ];
    try { j = parseJson(await chat(llm, config, msgs, 1600)); } catch { j = null; }
  }
  i = getInquiry(store, id);
  i.missing = (Array.isArray(j?.missing) ? j.missing : []).map((m) => ({ kind: ['person', 'document', 'note'].includes(m.kind) ? m.kind : 'note', text: cut(m.text, 240) })).filter((m) => m.text && !isSensitive(m.text)).slice(0, 4);
  if (!i.missing.length && !llm) {
    i.missing = [
      { kind: 'person', text: tr({ en: 'Someone who was there: what they saw, and how they may be quoted', it: 'Qualcuno che c\'era: cosa ha visto, e come si può citarlo' }) },
      { kind: 'document', text: tr({ en: 'A note, a message or a file from those days', it: 'Una nota, un messaggio o un file di quei giorni' }) },
    ];
  }
  const qids = ask(i, j?.questions, 1);
  post(i, 'reporter', cut(j?.note, 700) || tr({ en: `The piece stands on ${i.sources.length} source${i.sources.length === 1 ? '' : 's'} for now. Here is what would make it stronger.`, it: `Per ora il pezzo si regge su ${i.sources.length} font${i.sources.length === 1 ? 'e' : 'i'}. Ecco cosa lo renderebbe più solido.` }), { kind: 'sources', qids });
  save(store, i);
}

/** Add a source (or change one): kind, label, text, how to attribute it. */
export function addInquirySource(store, id, { kind = 'note', label, text, attribution = 'on' } = {}) {
  const i = getInquiry(store, id);
  const t = String(text || '').trim().slice(0, 3000);
  if (!t) throw new DeskError(tr({ en: 'The source is empty.', it: 'La fonte è vuota.' }), 400);
  const k = ['person', 'document', 'note', 'testimony', 'tip'].includes(kind) ? kind : 'note';
  const n = 100 + (i.sources || []).filter((s) => !s.auto).length;
  i.sources = [...(i.sources || []), { id: `s${n}`, kind: k, label: cut(label, 80) || { person: tr({ en: 'A witness', it: 'Un testimone' }), document: tr({ en: 'A document', it: 'Un documento' }) }[k] || tr({ en: 'A note from the Editor', it: 'Una nota del Direttore' }), text: t, attribution: ['on', 'background', 'anon'].includes(attribution) ? attribution : 'on', use: true, at: Date.now() }];
  return getInquiry(store, save(store, i).id);
}

/** Keep or drop a source, change how it is attributed. */
export function editInquirySource(store, id, sid, { use, attribution, remove } = {}) {
  const i = getInquiry(store, id);
  if (remove) i.sources = i.sources.filter((s) => s.id !== sid || s.auto);
  else i.sources = i.sources.map((s) => (s.id === sid ? { ...s, ...(use != null ? { use: !!use } : {}), ...(['on', 'background', 'anon'].includes(attribution) ? { attribution } : {}) } : s));
  return getInquiry(store, save(store, i).id);
}

/** The Editor is done with the sources: the reporter builds the outline. */
export function confirmSources(store, config, id, log = console.log) {
  const i = idle(getInquiry(store, id));
  if (i.status !== 'sources') throw new DeskError(tr({ en: 'This is not the moment for the sources.', it: 'Non è il momento delle fonti.' }), 409);
  if (!i.sources.some((s) => s.use !== false)) throw new DeskError(tr({ en: 'The piece needs at least one source.', it: 'Il pezzo ha bisogno di almeno una fonte.' }), 400);
  post(i, 'director', tr({ en: `The sources: ${i.sources.filter((s) => s.use !== false).length}. Build the outline.`, it: `Le fonti: ${i.sources.filter((s) => s.use !== false).length}. Prepari la scaletta.` }));
  i.status = 'outline';
  i.outline = null;
  save(store, i);
  job(store, i.id, 'outline', log, () => proposeOutline(store, config, i.id));
  return getInquiry(store, i.id);
}

// ───────────────────────── 4. The outline ─────────────────────────

function typesetOutline(i) {
  const d = { numbers: i.numbers || { total: 0, bySource: {}, sites: [], days: i.days, activeDays: 0, byDay: [], titles: [] }, coverage: i.coverage || [] };
  const t = i.numbers?.total ? typeset(i.topic, d, i.from, i.to) : null;
  const secs = (t?.sections || []).map((s) => ({ heading: s.heading, beat: s.paragraphs[0] || '', sources: ['s1'] }));
  if ((i.questions || []).some((x) => x.a?.trim()) || i.sources.some((s) => !s.auto)) secs.push({ heading: tr({ en: 'In their words', it: 'Con le loro parole' }), beat: tr({ en: 'What the Editor and the sources tell', it: 'Ciò che raccontano il Direttore e le fonti' }), sources: i.sources.filter((s) => !s.auto || s.kind === 'testimony').map((s) => s.id) });
  if (!secs.length) secs.push({ heading: tr({ en: 'What happened', it: 'Cosa è successo' }), beat: i.angle?.angle || i.topic, sources: [] });
  return {
    headline: i.angle?.title || i.topic,
    dek: i.angle?.angle || '',
    lede: tr({ en: 'The first signal in the file', it: 'Il primo segnale del fascicolo' }),
    nut: i.angle?.angle || i.topic,
    sections: secs.slice(0, 6),
    ending: tr({ en: 'The latest trace, and what remains open', it: 'L\'ultima traccia, e ciò che resta aperto' }),
  };
}

const cleanOutline = (o) => {
  const sections = (Array.isArray(o?.sections) ? o.sections : []).map((s) => ({
    heading: cut(s.heading, 80), beat: cut(s.beat || s.point, 500),
    sources: (Array.isArray(s.sources) ? s.sources : []).map((x) => String(x).replace(/[[\]]/g, '').trim()).filter((x) => /^s\d+$/.test(x)).slice(0, 6),
  })).filter((s) => s.heading).slice(0, 7);
  return {
    headline: cleanHeadline(cut(o?.headline, 120)), dek: cut(o?.dek, 300),
    lede: cut(o?.lede, 500), nut: cut(o?.nut, 500), ending: cut(o?.ending, 500), sections,
  };
};

async function proposeOutline(store, config, id) {
  const llm = await connectCreative(config);
  await distill(store, config, llm, id);
  let i = getInquiry(store, id);
  const line = getLine(store);
  const persona = reporterOf(line);
  let o = null;
  if (llm) {
    const msgs = [
      {
        role: 'system',
        content: system(i, line, persona, tr({ en: 'the outline', it: 'la scaletta' })) + tr({
          en: `\nBuild the structure of a great New Yorker piece of about ${TARGET} words:
- "lede": the opening scene — a human moment taken from the notes' scenes, with nothing added (no light, faces or silence that the notes don't have), that pulls the reader in before they know where the piece is going; a note of one sentence, not the text itself;
- "nut": the nut graf — what the inquiry is really about and why it matters, as a note of one sentence (the writer will turn it into prose); it arrives within the first three paragraphs;
- "sections": 4 or 5 movements, each with a short evocative heading, its "beat" (what happens in it, which facts and which voices it uses, how it moves the idea forward) and the ids of the sources it rests on; alternate scene and reflection, detail and big picture; one movement may be a digression that comes back;
- "ending": the closing image or line, understated, that stays: not a moral;
- beats are about a person and an idea, never "analysis of the signals" or "the data show": the traces are evidence, not the story;
- a working headline (short, oblique) and a dek (one sentence that promises the piece).
Reply ONLY with JSON: {"headline": "...", "dek": "...", "lede": "...", "nut": "...", "sections": [{"heading": "...", "beat": "...", "sources": ["s1"]}], "ending": "..."}`,
          it: `\nCostruisci la struttura di un grande pezzo da New Yorker di circa ${TARGET} parole:
- «lede»: la scena d'apertura — un momento umano preso dalle scene degli appunti, senza aggiungere nulla (niente luci, volti o silenzi che gli appunti non hanno), che porta dentro il lettore prima che sappia dove va il pezzo; un appunto di una frase, non il testo;
- «nut»: il nut graf — di cosa parla davvero l'inchiesta e perché conta, come appunto di una frase (il cronista lo trasformerà in prosa); arriva entro i primi tre paragrafi;
- «sections»: 4 o 5 movimenti, ciascuno con un titoletto breve ed evocativo, il suo «beat» (cosa succede, quali fatti e quali voci usa, come fa avanzare l'idea) e gli id delle fonti su cui si regge; alterna scena e riflessione, dettaglio e quadro generale; un movimento può essere una digressione che ritorna;
- «ending»: l'immagine o la frase di chiusura, sottotono, che resta: non una morale;
- i beat parlano di una persona e di un'idea, mai di «analisi dei segnali» o di «i dati mostrano»: le tracce sono prove, non la storia;
- un titolo di lavoro (breve, obliquo) e un sommario (una frase che promette il pezzo).
Rispondi SOLO con JSON: {"headline": "...", "dek": "...", "lede": "...", "nut": "...", "sections": [{"heading": "...", "beat": "...", "sources": ["s1"]}], "ending": "..."}`,
        }),
      },
      { role: 'user', content: i.carnet ? `${writerFacts(i)}

${tr({ en: 'ALL THE SOURCES (ids for the movements)', it: 'TUTTE LE FONTI (gli id per i movimenti)' })}:
${(i.sources || []).filter((x) => x.use !== false).map((x) => `[${x.id}] ${x.label}`).join('\n')}` : factsOf(i) },
    ];
    try {
      o = cleanOutline(parseJson(await chat(llm, config, msgs, 2600)));
      if (o.sections.length < 3) o = null;
    } catch { o = null; }
  }
  i = getInquiry(store, id);
  i.outline = o || typesetOutline(i);
  post(i, 'reporter', o
    ? tr({ en: `Here is the structure: ${i.outline.sections.length} movements, about ${TARGET} words. Move, cut, rewrite what you like; when it convinces you, I'll write.`, it: `Ecco la struttura: ${i.outline.sections.length} movimenti, circa ${TARGET} parole. Sposti, tagli, riscriva quello che vuole; quando la convince, scrivo.` })
    : tr({ en: 'A first structure, from the file. Fix it as you like.', it: 'Una prima struttura, dal fascicolo. La sistemi come crede.' }), { kind: 'outline' });
  save(store, i);
}

/** The Editor's outline (edited, reordered): the writing starts. */
export function approveInquiryOutline(store, config, id, outline, log = console.log) {
  const i = idle(getInquiry(store, id));
  if (i.status !== 'outline' || !i.outline) throw new DeskError(tr({ en: 'There is no outline waiting.', it: 'Non c\'è una scaletta in attesa.' }), 409);
  const o = outline ? cleanOutline({ ...i.outline, ...outline }) : i.outline;
  if (!o.sections.length) throw new DeskError(tr({ en: 'The outline is empty.', it: 'La scaletta è vuota.' }), 400);
  i.outline = { ...o, headline: o.headline || i.outline.headline };
  i.blocks = o.sections.map((s) => ({ heading: s.heading, beat: s.beat, sources: s.sources, paragraphs: [], status: 'pending' }));
  i.status = 'writing';
  post(i, 'director', tr({ en: 'The outline is good. Write it.', it: 'La scaletta va bene. Scriva.' }));
  save(store, i);
  job(store, i.id, 'writing', log, () => writeAll(store, config, i.id, log));
  return getInquiry(store, i.id);
}

// ───────────────────────── 5. The writing ─────────────────────────

/** The voice of the piece: the creative model's instructions. */
function writerSystem(i, line, persona) {
  return tr({
    en: `You are ${persona?.name || 'a staff writer'} of The Localhost Times, writing the paper's inquiry: a long piece of about ${TARGET} words in the manner of a good magazine like The New Yorker. Not a masterpiece: a well-made piece, written by an attentive person and not by a machine. The subject is a person and what they do with their days and evenings; the Mac is only the place where traces were left.
The voice:
- Clear, intelligent, measured. Concrete verbs, the names of things, sentences of varied length without forcing it.
- Proportion: this is the story of someone's evenings at a computer. Give it the weight it has — curiosity, a light dry irony, no epic. A broken build is not a fire; a new habit is not an anthropological shift.
- No machine-made phrasing: "it's not just X, it's Y"; "in a world where"; "almost surgical"; "a whisper"; "violence"; "paradigm", "dynamic", "dimension", "narrative", "ecosystem", "tapestry", "symphony", "dance", "silent witness", "testament"; triplets of adjectives; rhetorical questions; endings that deliver a moral.
- Few metaphors, simple ones, only when they make something clearer.
The craft:
- Open on a human moment taken from the notes, and let the reader step into it before they know where the piece is going.
- Within the first three paragraphs, the nut graf, in prose — what this story is really about, and why it matters beyond itself.
- Movements, not lists: each one moves the idea forward, alternating scene and reflection, the telling detail and the wide shot.
- The Editor's words and the sources are quoted word for word and attributed as indicated; background sources are never named.
- Close on an image that stays, understated: never a moral.
- The structure is a plan, not text: never copy its sentences. Never talk about the piece itself ("this inquiry examines…", "as we will see"). No markdown.
THE DASHBOARD RULE (the difference between a magazine and a report): the traces on the Mac are the reporter's evidence, not the story. Never write "signals", "the system records", "logs", "events", "data", "activity", "session", "peak", "monitoring"; no percentages; no counts of visits or pages; no times in a row. In the whole piece, at most the three figures the notes keep, each carried by a sentence that makes it mean something. At most one exact time per movement, and only if it is an image ("a little before seven"). If a sentence could appear on a dashboard, rewrite it as something a person did, read or left undone.
CONCRETE, NOT VAGUE: the names of things are the piece's best material — the project, the page that was read, the discussion, the opponent. Use them. What the rule bans is counting and system talk, not precision. Never replace a fact with an abstraction ("a circuit under pressure", "the resistance of the mind", "inhabiting technology").
NO INVENTED ATMOSPHERE: the light of the screen, a face, the silence of the house, the weather, sounds, feelings — if it isn't in the notes, it isn't in the piece. A scene is made of what is known.
PROPORTION: no "explosion", "emergency", "violence", "obsessive", "frantic" for an evening at a computer.
BAD (never like this): "On 3 March the calm broke with sudden violence: the system recorded 41 visits to chess.com, 12.3% of all activity. It is not just a pastime, it is an existential challenge, a silent dance of pawns and bishops."
GOOD: "That Tuesday the owner played chess for most of the evening, always against the same opponent, someone called bob. He lost the first three games. Before the fourth he opened a page on openings and stayed there a while, then went back to the board."
Rules on facts (never broken): everything comes from the notes, the Editor's words and the sources; don't invent causes, feelings, dialogue or outcomes; what isn't known is said to be unknown, and becomes part of the story. Third person ("the owner"), never repeated obsessively.`,
    it: `Sei ${persona?.name || 'una firma'} del «The Localhost Times» e scrivi l'inchiesta del giornale: un pezzo lungo, circa ${TARGET} parole, alla maniera di un buon magazine come il New Yorker. Non un capolavoro: un pezzo fatto bene, scritto da una persona attenta e non da una macchina. Il soggetto è una persona, e ciò che fa delle sue giornate e delle sue sere; il Mac è soltanto il luogo dove sono rimaste delle tracce.
La voce:
- Chiara, intelligente, misurata. Verbi concreti, i nomi delle cose, frasi di lunghezza varia senza forzare.
- Proporzione: è la storia delle sere di una persona al computer. Dalle il peso che ha — curiosità, un'ironia leggera e asciutta, niente epica. Una build rotta non è un incendio; un'abitudine nuova non è una svolta antropologica.
- Niente frasi da macchina: «non è (solo) X, ma Y»; «in un mondo in cui»; «quasi chirurgico»; «un sussurro»; «violenza»; «paradigma», «dinamica», «dimensione», «narrazione», «ecosistema», «sinfonia», «danza», «testimone silenzioso», «testimonianza»; triadi di aggettivi; domande retoriche; chiuse che consegnano una morale.
- Poche metafore, semplici, solo quando chiariscono.
Il mestiere:
- Apri su un momento umano preso dagli appunti, e lascia che il lettore ci entri prima di sapere dove va il pezzo.
- Entro i primi tre paragrafi, il nut graf, in prosa — di cosa parla davvero questa storia, e perché conta al di là di sé stessa.
- Movimenti, non elenchi: ognuno fa avanzare l'idea, alternando scena e riflessione, il dettaglio rivelatore e il campo lungo.
- Le parole del Direttore e delle fonti si citano parola per parola, attribuite come indicato; le fonti in background non si nominano mai.
- Chiudi su un'immagine che resta, sottotono: mai una morale.
- La struttura è un piano, non un testo: non copiarne mai le frasi. Mai parlare del pezzo stesso («questa inchiesta esamina…», «come vedremo»). Niente markdown.
LA REGOLA DEL CRUSCOTTO (la differenza tra un magazine e un rapporto): le tracce sul Mac sono le prove del cronista, non la storia. Mai scrivere «segnali», «il sistema registra», «log», «eventi», «dati», «attività», «sessione», «picco», «monitoraggio»; niente percentuali; niente conteggi di visite o pagine; niente orari in fila. In tutto il pezzo, al massimo i tre numeri che gli appunti conservano, ciascuno portato da una frase che lo fa significare. Al massimo un orario esatto per movimento, e solo se è un'immagine («poco prima delle sette»). Se una frase potrebbe stare su un cruscotto, riscrivila come qualcosa che una persona ha fatto, letto o lasciato in sospeso.
CONCRETO, NON VAGO: i nomi delle cose sono il materiale migliore del pezzo — il progetto, la pagina letta, la discussione, l'avversario. Usali. La regola vieta i conteggi e il linguaggio da sistema, non la precisione. Mai sostituire un fatto con un'astrazione («un circuito sotto pressione», «la resistenza della mente», «abitare la tecnologia»).
NIENTE ATMOSFERA INVENTATA: la luce dello schermo, un volto, il silenzio della casa, il tempo, i suoni, i sentimenti — se non è negli appunti, non è nel pezzo. Una scena si fa con quello che si sa.
PROPORZIONE: niente «esplosione», «emergenza», «violenza», «ossessivo», «frenetico» per una sera al computer.
CATTIVO (mai così): «Il 3 marzo la quiete si è rotta con una violenza improvvisa: il sistema ha registrato 41 visite a chess.com, il 12,3% dell'attività. Non si tratta di un semplice passatempo, ma di una sfida esistenziale, una danza silenziosa tra pedoni e alfieri.»
BUONO: «Quel martedì il proprietario ha giocato a scacchi per quasi tutta la sera, sempre contro lo stesso avversario, un certo bob. Ha perso le prime tre partite. Prima della quarta ha aperto una pagina sulle aperture, ci è rimasto un po', poi è tornato alla scacchiera.»
Regole sui fatti (inviolabili): tutto viene dagli appunti, dalle parole del Direttore e dalle fonti; non inventare cause, sentimenti, dialoghi o esiti; ciò che non si sa si dice che non si sa, e diventa parte del racconto. Terza persona («il proprietario»), mai ripetuta ossessivamente. Cita i titoli tra «caporali».`,
  }) + (line?.notes?.trim() ? tr({ en: `\nThe Editor's notes (they don't change the voice above): ${line.notes.trim()}`, it: `\nNote del direttore (non cambiano la voce qui sopra): ${line.notes.trim()}` }) : '');
}

// ───────────────────────── The notes: from the dashboard to the story ─────────────────────────

/**
 * Before the writing, the reporter turns the file into working notes: human scenes, facts in
 * words, at most three figures worth keeping, what isn't known. The writer works from these, never
 * from the raw file: a magazine piece can't parade what it never sees. The fact-checker still reads
 * everything.
 */
async function distill(store, config, llm, id) {
  let i = getInquiry(store, id);
  if (!llm || !i.dossier) return null;
  const line = getLine(store);
  const msgs = [
    {
      role: 'system',
      content: system(i, line, reporterOf(line), tr({ en: 'turn the file into working notes for the writer', it: 'trasformare il fascicolo negli appunti di lavorazione per chi scrive' })) + tr({
        en: `\nThe writer will NOT see the file: only your notes. Translate the traces into what a person did, saw, looked for, left undone. Write without system vocabulary (no "signals", "events", "logs", "records", "recorded", "interactions", "activity", "peak"), and keep times only when they say something ("before dawn", "after dinner").
- "premise": the human question the piece asks, in one sentence;
- "scenes": up to 6 concrete moments, each ONE plain sentence (a string, not an object) a writer could open on: who, when in the day, what they did, the names of the things involved (the project, the page, the discussion). Only what the file says: no light, faces, silence or moods;
- "facts": up to 8 facts in plain words, true to the file and to its meaning: a page opened 17 times is a page opened 17 times, not "17 interventions";
- "figures": at most 3 numbers worth keeping, each with what it means for the story;
- "unknowns": what the file can't say, and might be part of the story;
- "motifs": up to 3 recurring images or contrasts in the material (e.g. "the day job and the night work").
Reply ONLY with JSON: {"premise": "...", "scenes": ["..."], "facts": ["..."], "figures": [{"value": "...", "meaning": "..."}], "unknowns": ["..."], "motifs": ["..."]}`,
        it: `\nChi scrive NON vedrà il fascicolo: solo i tuoi appunti. Traduci le tracce in ciò che una persona ha fatto, visto, cercato, lasciato in sospeso. Scrivi senza lessico da sistema (niente «segnali», «eventi», «log», «registrazioni», «registrato», «interazioni», «attività», «picco») e conserva gli orari solo quando dicono qualcosa («prima dell'alba», «dopo cena»).
- «premise»: la domanda umana che il pezzo si pone, in una frase;
- «scenes»: fino a 6 momenti concreti, ciascuno UNA frase semplice (una stringa, non un oggetto) su cui si potrebbe aprire: chi, in che momento della giornata, cosa ha fatto, i nomi delle cose coinvolte (il progetto, la pagina, la discussione). Solo ciò che dice il fascicolo: niente luci, volti, silenzi o stati d'animo;
- «facts»: fino a 8 fatti detti a parole, fedeli al fascicolo e al suo significato: una pagina aperta 17 volte è una pagina aperta 17 volte, non «17 interventi»;
- «figures»: al massimo 3 numeri che vale la pena tenere, ciascuno con ciò che significa per la storia;
- «unknowns»: ciò che il fascicolo non può dire, e che può far parte del racconto;
- «motifs»: fino a 3 immagini o contrasti ricorrenti nel materiale (es. «il lavoro del giorno e quello della notte»).
Rispondi SOLO con JSON: {"premise": "...", "scenes": ["..."], "facts": ["..."], "figures": [{"value": "...", "meaning": "..."}], "unknowns": ["..."], "motifs": ["..."]}`,
      }),
    },
    { role: 'user', content: factsOf(i) },
  ];
  let c = null;
  try {
    const j = parseJson(await chat(llm, config, msgs, 2600));
    // small models sometimes answer with objects ({ "moment": …, "when": … }): keep their words
    const text = (v) => (v && typeof v === 'object' ? Object.values(v).filter((x) => typeof x === 'string' || typeof x === 'number').join(' — ') : v);
    const list = (x, n, m = 400) => (Array.isArray(x) ? x : []).map((v) => cut(text(v), m)).filter((v) => v && !isSensitive(v)).slice(0, n);
    // the writer can't parade what it never sees: no clock times, no facts told in system words
    c = {
      premise: humanize(cut(j.premise, 400)),
      scenes: list(j.scenes, 6, 500).map(humanize),
      facts: list(j.facts, 8).filter((f) => !SYSTEMISH.test(f)).map(humanize),
      figures: (Array.isArray(j.figures) ? j.figures : []).map((f) => ({ value: cut(f?.value ?? f, 30), meaning: cut(f?.meaning, 240) })).filter((f) => f.value).slice(0, 3),
      unknowns: list(j.unknowns, 4).map(humanize),
      motifs: list(j.motifs, 3, 200),
      at: Date.now(),
    };
    if (!c.scenes.length && !c.facts.length) c = null;
  } catch { c = null; }
  i = getInquiry(store, id);
  i.carnet = c;
  save(store, i);
  return c;
}

/** A time of day in words: what a writer keeps of "07:11". */
function partOfDay(h) {
  const en = lang() === 'en';
  if (h < 5) return en ? 'in the middle of the night' : 'nel cuore della notte';
  if (h < 8) return en ? 'early in the morning' : 'di primo mattino';
  if (h < 11) return en ? 'during the morning' : 'in mattinata';
  if (h < 13) return en ? 'around midday' : 'verso mezzogiorno';
  if (h < 15) return en ? 'early in the afternoon' : 'nel primo pomeriggio';
  if (h < 18) return en ? 'in the afternoon' : 'nel pomeriggio';
  if (h < 21) return en ? 'in the evening' : 'la sera';
  return en ? 'late in the evening' : 'a tarda sera';
}

/** The notes as the writer may see them: times become parts of the day, the system's words go. */
export function humanize(text) {
  return String(text || '')
    .replace(/\b(?:alle|all'|verso le|dalle|fino alle|at|around|by|from|until)?\s*\b([01]?\d|2[0-3])[:.]([0-5]\d)\b(?:\s*(?:del mattino|di mattina|del pomeriggio|di sera|a\.?m\.?|p\.?m\.?))?/gi, (m, h) => ` ${partOfDay(Number(h))}`)
    .replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])(?=\s|$)/g, '$1').trim();
}
const SYSTEMISH = /\b(segnal[ei]|registrat\w*|interazion\w*|signals?|recorded|interactions?|logs?)\b/i;

/** What the writer reads: the notes (not the file), the angle, the Editor's words, the human sources. */
function writerFacts(i) {
  const c = i.carnet;
  if (!c) return factsOf(i);
  const parts = [`${tr({ en: 'SUBJECT', it: 'ARGOMENTO' })}: ${i.topic}`];
  if (i.angle) parts.push(`${tr({ en: 'THE ANGLE', it: 'L\'ANGOLO' })}: ${i.angle.title} — ${i.angle.angle}`);
  if (i.lead) parts.push(`${tr({ en: 'THE EDITOR\'S LEAD (where to look; not a quote)', it: 'LA TRACCIA DEL DIRETTORE (dove guardare; non è una citazione)' })}: ${q(i.lead)}`);
  const notes = [
    c.premise ? `${tr({ en: 'The question', it: 'La domanda' })}: ${c.premise}` : '',
    c.scenes.length ? `${tr({ en: 'Scenes', it: 'Scene' })}:\n${c.scenes.map((x) => `- ${x}`).join('\n')}` : '',
    c.facts.length ? `${tr({ en: 'Facts', it: 'Fatti' })}:\n${c.facts.map((x) => `- ${x}`).join('\n')}` : '',
    c.figures.length ? `${tr({ en: 'The only figures you may use', it: 'I soli numeri che puoi usare' })}:\n${c.figures.map((f) => `- ${f.value}: ${f.meaning}`).join('\n')}` : tr({ en: 'Figures: none. Write without numbers.', it: 'Numeri: nessuno. Scrivi senza numeri.' }),
    c.unknowns.length ? `${tr({ en: 'What isn\'t known', it: 'Ciò che non si sa' })}:\n${c.unknowns.map((x) => `- ${x}`).join('\n')}` : '',
    c.motifs.length ? `${tr({ en: 'Motifs', it: 'Motivi' })}: ${c.motifs.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  parts.push(`${tr({ en: 'THE REPORTER\'S NOTES', it: 'GLI APPUNTI DEL CRONISTA' })}:\n${notes}`);
  const owner = [...(i.questions || []).filter((x) => x.a?.trim()).map((x) => `- ${q(x.q)} → ${q(x.a.trim())}`), ...(i.needs || []).filter((n) => n.use !== false && n.answer?.trim()).map((n) => `- ${n.text} → ${q(n.answer.trim())}`)];
  if (owner.length) parts.push(`${tr({ en: 'THE OWNER\'S WORDS (real: quote them word for word and attribute them)', it: 'LE PAROLE DEL PROPRIETARIO (vere: citale parola per parola e attribuiscile)' })}:\n${owner.join('\n')}`);
  const how = { on: '', background: tr({ en: ' (background: use it, never name it)', it: ' (in background: usala, non nominarla mai)' }), anon: tr({ en: ' (anonymous: "a person close to the owner")', it: ' (anonima: «una persona vicina al proprietario»)' }) };
  const human = (i.sources || []).filter((x) => x.use !== false && !['signals', 'archive', 'testimony'].includes(x.kind));
  if (human.length) parts.push(`${tr({ en: 'THE SOURCES', it: 'LE FONTI' })}:\n${human.map((x) => `[${x.id}] ${x.label}${how[x.attribution] || ''}: ${cut(x.text, 900)}`).join('\n')}`);
  return parts.join('\n\n');
}

/** A paragraph wrapped whole in quotation marks loses them; a quote that opens a paragraph keeps its own. */
const unwrap = (p) => {
  const m = /^(["«“])([\s\S]*)(["»”])$/.exec(p);
  return m && !/["«“»”]/.test(m[2]) ? m[2].trim() : p;
};

const splitParas = (raw) => String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[a-z]*|```/g, '')
  .replace(/^\s*#+\s.*$/gm, '').replace(/^\s*\*\*[^*]{1,80}\*\*\s*$/gm, '').replace(/^\s*(sezione|section|movimento|movement)\s*\d*\s*[:.].*$/gim, '')
  .split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/\*{1,2}([^*\n]+?)\*{1,2}/g, '$1').replace(/(^|\s)_([^_\n]+?)_(?=[\s.,;:!?]|$)/g, '$1$2').trim()).map(unwrap).filter((p) => p.length > 20);

/** Words for section k: the piece's length shared out, the lede and the ending a little shorter. */
function budget(i, k) {
  const n = i.blocks.length || 1;
  const each = TARGET / n;
  const f = n > 2 && (k === 0 || k === n - 1) ? 0.85 : n > 2 ? 1 + (0.3 / (n - 2)) : 1;
  const w = Math.round((each * f) / 10) * 10;
  return [Math.round(w * 0.85 / 10) * 10, Math.round(w * 1.15 / 10) * 10];
}

function sectionPrompt(i, k, line, persona, instruction = null) {
  const o = i.outline || {};
  const b = i.blocks[k];
  const [min, max] = budget(i, k);
  const plan = [
    `${tr({ en: 'Working headline', it: 'Titolo di lavoro' })}: ${o.headline || i.topic}${o.dek ? ` — ${o.dek}` : ''}`,
    `${tr({ en: 'Lede (opening scene)', it: 'Attacco (scena d\'apertura)' })}: ${o.lede || ''}`,
    `${tr({ en: 'Nut graf', it: 'Nut graf' })}: ${o.nut || ''}`,
    ...i.blocks.map((x, n) => `${n + 1}. ${x.heading} — ${x.beat || ''}${n === k ? tr({ en: '   ← NOW', it: '   ← ORA' }) : ''}`),
    `${tr({ en: 'Ending', it: 'Chiusa' })}: ${o.ending || ''}`,
  ].join('\n');
  // what is written so far: the last two sections in full, the earlier ones by heading and opening
  const before = i.blocks.slice(0, k).filter((x) => x.paragraphs?.length);
  const earlier = before.slice(0, -2).map((x) => `## ${x.heading}\n${cut(x.paragraphs[0], 400)} […]`).join('\n\n');
  const near = before.slice(-2).map((x) => `## ${x.heading}\n${x.paragraphs.join('\n\n')}`).join('\n\n');
  const role = k === 0
    ? tr({ en: 'It is the opening: start on the lede\'s scene and reach the nut graf by the end of the section.', it: 'È l\'apertura: comincia dalla scena dell\'attacco e arriva al nut graf entro la fine della sezione.' })
    : k === i.blocks.length - 1
      ? tr({ en: `It is the last movement: close on the ending — ${o.ending || 'an image that stays'}.`, it: `È l'ultimo movimento: chiudi sulla chiusa — ${o.ending || 'un\'immagine che resta'}.` })
      : tr({ en: 'Pick up from where the previous section left off, without summarising it.', it: 'Riprendi da dove si è fermata la sezione precedente, senza riassumerla.' });
  return [
    { role: 'system', content: writerSystem(i, line, persona) },
    {
      role: 'user',
      content: [
        writerFacts(i),
        `${tr({ en: 'THE STRUCTURE', it: 'LA STRUTTURA' })}:\n${plan}`,
        earlier ? `${tr({ en: 'ALREADY WRITTEN (beginnings)', it: 'GIÀ SCRITTO (inizi)' })}:\n${earlier}` : '',
        near ? `${tr({ en: 'WHAT COMES JUST BEFORE', it: 'COSA VIENE SUBITO PRIMA' })}:\n${near}` : '',
        instruction ? `${tr({ en: 'THE EDITOR ASKS', it: 'IL DIRETTORE CHIEDE' })}: ${q(instruction)}${b.paragraphs?.length ? `\n${tr({ en: 'The current version', it: 'La versione attuale' })}:\n${b.paragraphs.join('\n\n')}` : ''}` : '',
        tr({
          en: `Now write ONLY movement ${k + 1}, “${b.heading}”: ${b.beat || ''}\n${role}\n${min}-${max} words, 3-6 paragraphs separated by a blank line. Only the text: no heading, no comments, no JSON.`,
          it: `Ora scrivi SOLO il movimento ${k + 1}, «${b.heading}»: ${b.beat || ''}\n${role}\n${min}-${max} parole, 3-6 paragrafi separati da una riga vuota. Solo il testo: niente titoletto, niente commenti, niente JSON.`,
        }),
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

/** The typesetting's text for a section, when no model is there. */
function typesetSection(i, k) {
  const b = i.blocks[k];
  const t = i.numbers?.total ? typeset(i.topic, { numbers: i.numbers, coverage: i.coverage || [] }, i.from, i.to) : null;
  const from = t?.sections?.find((s) => s.heading === b.heading)?.paragraphs || [];
  const voices = (b.sources || []).map((sid) => i.sources.find((s) => s.id === sid)).filter((s) => s && !s.auto)
    .map((s) => (s.attribution === 'on' ? `${s.label}: ${q(unquote(cut(s.text, 300)))}` : tr({ en: `A person close to the owner reports: ${q(unquote(cut(s.text, 300)))}.`, it: `Una persona vicina al proprietario riferisce: ${q(unquote(cut(s.text, 300)))}.` })));
  const said = k === i.blocks.length - 1 ? (i.questions || []).filter((x) => x.a?.trim()).map((x) => tr({ en: `Asked ${q(x.q)}, the owner answered: ${q(x.a.trim())}.`, it: `Alla domanda ${q(x.q)}, il proprietario ha risposto: ${q(x.a.trim())}.` })) : [];
  return [...from, ...voices, ...said].length ? [...from, ...voices, ...said] : [b.beat || i.angle?.angle || i.topic].filter(Boolean);
}

/** The copy desk on a movement: the shared sentence-by-sentence pass (see chain.js). */
export const copyFix = (llm, config, paras) => phrasingDesk(paras, { llm, config, chat });

async function writeSection(store, config, llm, id, k, instruction = null) {
  let i = getInquiry(store, id);
  const line = getLine(store);
  const persona = reporterOf(line);
  i.blocks[k] = { ...i.blocks[k], status: 'writing' };
  save(store, i);
  let paras = null;
  if (llm) {
    const msgs = sectionPrompt(i, k, line, persona, instruction);
    paras = splitParas(await chat(llm, config, msgs, llm.maxTokens || 4000));
    // local models write short: a movement well under its length goes back once, to be widened
    const [min] = budget(i, k);
    const have = wordsIn(paras);
    if (paras.length && have < min * 0.75) {
      try {
        const longer = splitParas(await chat(llm, config, [...msgs, { role: 'assistant', content: paras.join('\n\n') }, {
          role: 'user',
          content: tr({
            en: `This movement is ${have} words: it needs at least ${min}. Widen it from within — let the scene breathe, deepen the reflection, give the voices room — not with more data, counts or times, and without padding or inventing anything. Reply with the whole movement, text only.`,
            it: `Questo movimento è di ${have} parole: ne servono almeno ${min}. Allargalo da dentro — fai respirare la scena, approfondisci la riflessione, dai spazio alle voci — non con più dati, conteggi o orari, e senza riempitivi né invenzioni. Rispondi con tutto il movimento, solo il testo.`,
          }),
        }], llm.maxTokens || 4000));
        if (wordsIn(longer) > have) paras = longer;
      } catch { /* keep the first version */ }
    }
  }
  if (llm && paras?.length) paras = await copyFix(llm, config, paras);
  if (!paras?.length) paras = typesetSection(i, k);
  i = getInquiry(store, id);
  i.blocks[k] = { ...i.blocks[k], paragraphs: paras, status: 'done', by: 'writer', rewrittenWith: instruction || null, lint: lint(paras) };
  save(store, i);
  return i;
}

async function writeMeta(llm, config, i) {
  const msgs = [
    {
      role: 'system',
      content: tr({
        en: `You are the desk of The Localhost Times. For the inquiry below write, in the manner of The New Yorker: a kicker (1-3 words), the headline (short and oblique, at most 8 words, no final period), the dek (one clear sentence that promises the piece, at most 30 words) and 3 alternative headlines. Only facts from the piece; no system words ("signals", "logs", "data"), no grand drama, no "it's not X, it's Y".
Reply ONLY with JSON: {"kicker": "...", "headline": "...", "dek": "...", "alternatives": ["...", "...", "..."]}`,
        it: `Sei il desk del «The Localhost Times». Per l'inchiesta qui sotto scrivi, alla maniera del New Yorker: un occhiello (1-3 parole), il titolo (breve e obliquo, massimo 8 parole, senza punto finale), il sommario (una frase chiara che promette il pezzo, massimo 30 parole) e 3 titoli alternativi. Solo fatti presenti nel pezzo; niente parole da sistema («segnali», «log», «dati»), niente drammi, niente «non è X, ma Y».
Rispondi SOLO con JSON: {"kicker": "...", "headline": "...", "dek": "...", "alternatives": ["...", "...", "..."]}`,
      }),
    },
    { role: 'user', content: textOf(i).slice(0, 14000) },
  ];
  const j = parseJson(await chat(llm, config, msgs, 900));
  return {
    kicker: cut(j.kicker, 40),
    headline: cleanHeadline(cut(j.headline, 140)),
    dek: cut(j.dek, 300),
    alternatives: (j.alternatives || []).map((h) => cleanHeadline(cut(h, 140))).filter(Boolean).slice(0, 3),
  };
}

/** The whole text, ## for the headings. */
export const textOf = (i) => (i.blocks || []).map((b) => [b.heading ? `## ${b.heading}` : '', ...(b.paragraphs || [])].filter(Boolean).join('\n\n')).join('\n\n');

async function writeAll(store, config, id, log) {
  const llm = await connectCreative(config);
  if (llm && !getInquiry(store, id).carnet) await distill(store, config, llm, id);
  let i = getInquiry(store, id);
  for (let k = 0; k < i.blocks.length; k++) {
    i = getInquiry(store, id);
    if (i.status !== 'writing') return; // stopped
    if (i.blocks[k].status === 'done') continue;
    i = await writeSection(store, config, llm, id, k);
  }
  i = getInquiry(store, id);
  if (llm) {
    try {
      // the headline the Editor chose stays: the new ones become alternatives
      const m = await writeMeta(llm, config, i);
      i.alternatives = [...new Set([...(i.headline && m.headline !== i.headline ? [m.headline] : []), ...m.alternatives])].slice(0, 4);
      i.headline ||= m.headline;
      i.dek ||= m.dek;
      i.kicker ||= m.kicker;
    } catch (e) { log(`[inquiry] headline: ${e.message}`); }
  }
  i.headline ||= i.outline?.headline || i.angle?.title || i.topic;
  i.dek ||= i.outline?.dek || i.angle?.angle || '';
  Object.assign(i, quickChecks(i), { status: 'draft', writer: llm?.model || 'typesetting', finishedAt: Date.now() });
  post(i, 'reporter', tr({ en: `Done: ${wordsOf(i)} words. When you like, take it to the Editor desk: ${editorOf().name} is waiting.`, it: `Fatto: ${wordsOf(i)} parole. Quando vuole, lo porti all'Editor desk: ${editorOf().name} aspetta.` }), { kind: 'draft' });
  save(store, i);
  const persona = reporterOf(getLine(store));
  if (persona) say(store, persona.id, tr({ en: `${persona.name}: the inquiry on ${q(i.topic)} is written. ${wordsOf(i)} words.`, it: `${persona.name}: l'inchiesta su ${q(i.topic)} è scritta. ${wordsOf(i)} parole.` }));
  log(tr({ en: `[inquiry] “${i.headline}”: ${wordsOf(i)} words`, it: `[inchiesta] «${i.headline}»: ${wordsOf(i)} parole` }));
}

/** Resume a stopped or interrupted writing, or redo the stage's work after an error. */
export function retryInquiry(store, config, id, log = console.log) {
  const i = idle(getInquiry(store, id));
  const run = {
    angle: ['angles', () => proposeAngles(store, config, i.id)],
    data: ['needs', () => proposeNeeds(store, config, i.id)],
    sources: ['sources', () => proposeSources(store, config, i.id)],
    outline: ['outline', () => proposeOutline(store, config, i.id)],
    desk: ['review', () => deskReview(store, config, i.id)],
  }[i.status];
  if (i.status === 'draft' && i.blocks.some((b) => b.status !== 'done')) {
    save(store, { ...i, status: 'writing' });
    job(store, i.id, 'writing', log, () => writeAll(store, config, i.id, log));
  } else if (run) {
    job(store, i.id, run[0], log, run[1]);
  } else {
    throw new DeskError(tr({ en: 'Nothing to resume.', it: 'Non c\'è niente da riprendere.' }), 409);
  }
  return { ...getInquiry(store, i.id), busy: true };
}

/**
 * Write the whole piece again, from fresh notes, with the same outline (after the voice changed, or
 * when the draft reads like a report). The Editor's own sections stay.
 */
export function rewriteAllInquiry(store, config, id, log = console.log) {
  const i = idle(getInquiry(store, id));
  if (!['draft', 'desk'].includes(i.status) || !i.blocks.length) throw new DeskError(tr({ en: 'There is no draft to rewrite.', it: 'Non c\'è una bozza da riscrivere.' }), 409);
  i.blocks = i.blocks.map((b) => (b.by === 'director' ? b : { ...b, status: 'pending', paragraphs: [] }));
  i.carnet = null;
  i.desk = null;
  i.deskThread = [];
  i.status = 'writing';
  post(i, 'director', tr({ en: 'Write it again, in the voice of a great magazine: the story, not the dashboard.', it: 'Lo riscriva, con la voce di un grande magazine: la storia, non il cruscotto.' }));
  save(store, i);
  job(store, i.id, 'writing', log, () => writeAll(store, config, i.id, log));
  return getInquiry(store, i.id);
}

/** Go back to an earlier stage (the work done is kept, the later stages are redone). */
export function backInquiry(store, id, to) {
  const i = getInquiry(store, id);
  const a = STAGES.indexOf(i.status);
  const b = STAGES.indexOf(to);
  if (running.has(i.id)) throw new DeskError(tr({ en: 'Wait: the reporter is working.', it: 'Aspetti: il cronista sta lavorando.' }), 409);
  if (b < 0 || b >= a || b > STAGES.indexOf('outline') || i.status === 'published') throw new DeskError(tr({ en: 'You can\'t go back there.', it: 'Non si può tornare lì.' }), 400);
  i.status = to;
  if (to === 'outline') i.blocks = [];
  post(i, 'director', tr({ en: 'Let\'s go back a step.', it: 'Torniamo indietro di un passo.' }));
  return getInquiry(store, save(store, i).id);
}

// ───────────────────────── 6. The Editor desk ─────────────────────────

/** The checks that need no model: length, structure in numbers, figures, style, sources used. */
export function quickChecks(i) {
  const body = (i.blocks || []).flatMap((b) => b.paragraphs || []);
  const total = wordsIn(body);
  const sections = (i.blocks || []).map((b, k) => {
    const [min, max] = budget(i, k);
    const w = wordsIn(b.paragraphs);
    return { heading: b.heading, words: w, min, max, ok: w >= min * 0.7 && w <= max * 1.4, lint: lint(b.paragraphs || []).score };
  });
  const text = body.join(' ').toLowerCase();
  const sources = (i.sources || []).filter((s) => s.use !== false).map((s) => {
    const cited = (i.blocks || []).some((b) => (b.sources || []).includes(s.id));
    // a quote or a name from the source appears in the text
    const bits = [...String(s.text).matchAll(/[«“"]([^»”"]{12,})[»”"]/g)].map((m) => m[1].slice(0, 30).toLowerCase());
    const named = s.attribution === 'on' && s.kind === 'person' && s.label && text.includes(s.label.toLowerCase().split(/[ ,:]/)[0]);
    return { id: s.id, label: s.label, kind: s.kind, planned: cited, quoted: bits.some((x) => text.includes(x)) || named };
  });
  const quotes = (i.questions || []).filter((x) => x.a?.trim()).map((x) => ({ q: x.q, a: x.a, used: text.includes(x.a.trim().slice(0, 40).toLowerCase()) }));
  return {
    check: numbersCheck({ headline: i.headline, dek: i.dek, body }, factsOf(i)),
    lint: lint(body),
    register: registerCheck(body),
    shape: { words: total, target: TARGET, ok: total >= TARGET * 0.8 && total <= TARGET * 1.25, sections, sources, quotes },
  };
}

/** The draft goes to the Editor desk: the managing editor reads it and checks it. */
export function toDesk(store, config, id, log = console.log) {
  const i = idle(getInquiry(store, id));
  if (!['draft', 'desk'].includes(i.status)) throw new DeskError(tr({ en: 'The piece is not finished yet.', it: 'Il pezzo non è ancora finito.' }), 409);
  if (!i.blocks.some((b) => b.paragraphs?.length)) throw new DeskError(tr({ en: 'There is nothing to check yet.', it: 'Non c\'è ancora niente da controllare.' }), 409);
  if (i.status === 'draft') post(i, 'director', tr({ en: 'To the Editor desk.', it: 'All\'Editor desk.' }));
  i.status = 'desk';
  i.desk = { ...(i.desk || {}), status: 'working', at: Date.now() };
  save(store, i);
  job(store, i.id, 'review', log, () => deskReview(store, config, i.id));
  return getInquiry(store, i.id);
}

const VERDICTS = ['ok', 'partial', 'unsupported'];

async function deskReview(store, config, id) {
  const llm = await connectLLM(config);
  let i = getInquiry(store, id);
  const ed = editorOf();
  const paras = (i.blocks || []).flatMap((b, k) => (b.paragraphs || []).map((p) => ({ k, p })));
  const numbered = paras.map((x, n) => `[p${n + 1}] (${tr({ en: 'section', it: 'sezione' })} ${x.k + 1}) ${x.p}`).join('\n\n');
  const desk = { status: 'done', at: Date.now(), claims: [], read: null, headlines: [], error: null };
  if (llm) {
    // 1. the claims against the sources
    try {
      const j = parseJson(await chat(llm, config, [
        {
          role: 'system',
          content: tr({
            en: `You are the fact-checker of The Localhost Times. Check the inquiry below against its sources, like the fact-checking department of The New Yorker. List the main factual claims of the piece (at most 12: facts, figures, times, attributed quotes; not opinions or images). For each: the paragraph ("p": its number), the claim in a few words, the ids of the sources that support it, and the verdict: "ok" (supported), "partial" (supported only in part, or stretched) or "unsupported" (no source says it). A short note for anything not "ok".
Reply ONLY with JSON: {"claims": [{"p": 1, "text": "...", "sources": ["s1"], "verdict": "ok", "note": ""}]}`,
            it: `Sei il fact-checker del «The Localhost Times». Controlla l'inchiesta qui sotto contro le sue fonti, come il fact-checking del New Yorker. Elenca le principali affermazioni fattuali del pezzo (al massimo 12: fatti, numeri, orari, citazioni attribuite; non opinioni o immagini). Per ognuna: il paragrafo («p»: il suo numero), l'affermazione in poche parole, gli id delle fonti che la sostengono e il verdetto: «ok» (sostenuta), «partial» (sostenuta solo in parte, o forzata) o «unsupported» (nessuna fonte lo dice). Una nota breve per ciò che non è «ok».
Rispondi SOLO con JSON: {"claims": [{"p": 1, "text": "...", "sources": ["s1"], "verdict": "ok", "note": ""}]}`,
          }),
        },
        { role: 'user', content: `${factsOf(i)}\n\n${tr({ en: 'THE PIECE', it: 'IL PEZZO' })}:\n${numbered}` },
      ], 2600));
      desk.claims = (j.claims || []).map((c) => ({
        p: Math.max(1, Math.min(paras.length, Number(c.p) || 1)), text: cut(c.text, 240),
        sources: (Array.isArray(c.sources) ? c.sources : []).map((x) => String(x).replace(/[[\]]/g, '').trim()).filter((x) => i.sources.some((s) => s.id === x)),
        verdict: VERDICTS.includes(c.verdict) ? c.verdict : 'partial', note: cut(c.note, 240),
      })).filter((c) => c.text).slice(0, 12)
        .map((c) => ({ ...c, section: paras[c.p - 1]?.k ?? 0 }));
    } catch (e) { desk.error = e.message; }
    // 2. the managing editor's reading: structure, style, headline
    try {
      const j = parseJson(await chat(llm, config, [
        {
          role: 'system',
          content: tr({
            en: `You are ${ed.name}, managing editor of The Localhost Times, and you edit the paper's inquiry the way a good magazine editor would: exacting, specific, generous with what works. Read the piece and judge its structure and its prose. Say whether the lede pulls the reader in, where the nut graf is and whether it does its job, whether the movements build an arc, whether the ending stays. Above all, judge the register: it must read as elite magazine prose, not as a report on the Mac's traces — any passage that sounds like a dashboard (counts, times in a row, "signals", "the system records", page titles listed) is a fault, and deserves an edit that turns it into something a person did. So is machine-made phrasing ("it's not just X, it's Y", inflated drama, "paradigm", grand metaphors for small things): the piece should be well made, not grandiose. Then at most 5 concrete edits, each tied to a section (its number) with an instruction the writer can follow. Then 3 headlines (at most 8 words, no final period), a dek and a kicker.
Reply ONLY with JSON: {"verdict": "one or two sentences: your overall judgement", "lede": {"ok": true, "note": "..."}, "nut": {"ok": true, "p": 2, "note": "..."}, "arc": {"ok": true, "note": "..."}, "ending": {"ok": true, "note": "..."}, "prose": "one sentence on the prose", "edits": [{"section": 1, "note": "...", "instruction": "..."}], "headlines": ["...", "...", "..."], "dek": "...", "kicker": "..."}`,
            it: `Sei ${ed.name}, ${ed.role} del «The Localhost Times», e curi l'inchiesta del giornale come farebbe un buon editor di magazine: esigente, preciso, generoso con ciò che funziona. Leggi il pezzo e giudicane la struttura e la prosa. Di' se l'attacco porta dentro il lettore, dov'è il nut graf e se fa il suo lavoro, se i movimenti costruiscono un arco, se la chiusa resta. Soprattutto, giudica il registro: deve leggersi come prosa da grande magazine, non come un rapporto sulle tracce del Mac — ogni passo che suona come un cruscotto (conteggi, orari in fila, «segnali», «il sistema registra», titoli di pagine elencati) è un difetto, e merita un intervento che lo trasformi in qualcosa che una persona ha fatto. Lo sono anche le frasi da macchina («non è X, ma Y», drammi gonfiati, «paradigma», grandi metafore per piccole cose): il pezzo deve essere fatto bene, non grandioso. Poi al massimo 5 interventi concreti, ciascuno legato a una sezione (il suo numero) con un'istruzione che il cronista possa seguire. Poi 3 titoli (massimo 8 parole, senza punto finale), un sommario e un occhiello.
Rispondi SOLO con JSON: {"verdict": "una o due frasi: il tuo giudizio complessivo", "lede": {"ok": true, "note": "..."}, "nut": {"ok": true, "p": 2, "note": "..."}, "arc": {"ok": true, "note": "..."}, "ending": {"ok": true, "note": "..."}, "prose": "una frase sulla prosa", "edits": [{"section": 1, "note": "...", "instruction": "..."}], "headlines": ["...", "...", "..."], "dek": "...", "kicker": "..."}`,
          }),
        },
        { role: 'user', content: `${tr({ en: 'THE ANGLE', it: 'L\'ANGOLO' })}: ${i.angle?.title || ''} — ${i.angle?.angle || ''}\n\n${i.headline ? `# ${i.headline}\n${i.dek ? `${i.dek}\n` : ''}\n` : ''}${(i.blocks || []).map((b, k) => `## ${k + 1}. ${b.heading}\n${(b.paragraphs || []).join('\n\n')}`).join('\n\n')}` },
      ], 2400));
      const part = (x) => (x && typeof x === 'object' ? { ok: x.ok !== false, note: cut(x.note, 400), ...(x.p ? { p: Number(x.p) || null } : {}) } : null);
      desk.read = {
        verdict: cut(j.verdict, 600), lede: part(j.lede), nut: part(j.nut), arc: part(j.arc), ending: part(j.ending), prose: cut(j.prose, 400),
        edits: (j.edits || []).map((e) => ({ id: uid('e'), section: Math.max(0, Math.min(i.blocks.length - 1, (Number(e.section) || 1) - 1)), note: cut(e.note, 400), instruction: cut(e.instruction, 300) })).filter((e) => e.instruction || e.note).slice(0, 5),
      };
      desk.headlines = (j.headlines || []).map((h) => cleanHeadline(cut(h, 140))).filter(Boolean).slice(0, 3);
      desk.dek = cut(j.dek, 300);
      desk.kicker = cut(j.kicker, 40);
    } catch (e) { desk.error ||= e.message; }
  }
  i = getInquiry(store, id);
  i.desk = { ...desk, ...quickChecks(i) };
  Object.assign(i, quickChecks(i));
  if (!i.deskThread?.length) {
    const bad = desk.claims.filter((c) => c.verdict !== 'ok').length;
    i.deskThread = [{
      who: 'editor', at: Date.now(),
      text: desk.read?.verdict
        ? `${desk.read.verdict}${bad ? tr({ en: ` I've flagged ${bad} claim${bad === 1 ? '' : 's'} the sources don't fully hold.`, it: ` Ho segnato ${bad} affermazion${bad === 1 ? 'e' : 'i'} che le fonti non reggono del tutto.` }) : ''}`
        : tr({ en: `I've read it. The figures, the length and the style are checked in the tabs above; ask me anything about the piece.`, it: `L'ho letto. Numeri, lunghezza e stile sono controllati nelle schede qui sopra; mi chieda pure qualunque cosa sul pezzo.` }),
    }];
  }
  save(store, i);
}

/** At the desk: the Editor talks to the managing editor, who answers and proposes edits. */
export async function talkDesk(store, config, id, text, log = console.log) {
  const t = String(text || '').trim().slice(0, 2000);
  if (!t) throw new DeskError(tr({ en: 'Write something.', it: 'Scriva qualcosa.' }), 400);
  let i = getInquiry(store, id);
  if (i.status !== 'desk') throw new DeskError(tr({ en: 'The piece is not at the desk.', it: 'Il pezzo non è all\'Editor desk.' }), 409);
  i.deskThread = [...(i.deskThread || []), { who: 'director', text: t, at: Date.now() }];
  save(store, i);
  const llm = await connectLLM(config);
  const ed = editorOf();
  let reply = { who: 'editor', at: Date.now(), text: tr({ en: 'I can\'t read it now: the writer is not answering.', it: 'Ora non riesco a leggerlo: il redattore non risponde.' }), actions: [] };
  if (llm) {
    const checks = [
      i.desk?.read?.verdict ? `${tr({ en: 'Your reading', it: 'La tua lettura' })}: ${i.desk.read.verdict}` : '',
      (i.desk?.claims || []).filter((c) => c.verdict !== 'ok').map((c) => `- p${c.p} ${c.verdict}: ${c.text} (${c.note})`).join('\n'),
      `${tr({ en: 'Words', it: 'Parole' })}: ${wordsOf(i)} / ${TARGET}`,
    ].filter(Boolean).join('\n');
    const msgs = [
      {
        role: 'system',
        content: tr({
          en: `You are ${ed.name}, managing editor of The Localhost Times, at the Editor desk with the Editor (the paper's owner), working on the inquiry below. Answer like a great editor: brief, concrete, honest, with taste. If what you say implies changing the text, propose actions the Editor can apply with one click: "rewrite" a section (its number, with the instruction for the writer), a new "headline", a new "dek". At most 3 actions; none if not needed.
Reply ONLY with JSON: {"reply": "...", "actions": [{"type": "rewrite", "section": 2, "instruction": "..."}, {"type": "headline", "text": "..."}, {"type": "dek", "text": "..."}]}`,
          it: `Sei ${ed.name}, ${ed.role} del «The Localhost Times», all'Editor desk con il Direttore (il proprietario del giornale), al lavoro sull'inchiesta qui sotto. Rispondi da grande editor: breve, concreto, onesto, con gusto. Dai del lei al Direttore. Se ciò che dici implica cambiare il testo, proponi azioni che il Direttore può applicare con un clic: «rewrite» di una sezione (il suo numero, con l'istruzione per il cronista), un nuovo «headline», un nuovo «dek». Al massimo 3 azioni; nessuna se non serve.
Rispondi SOLO con JSON: {"reply": "...", "actions": [{"type": "rewrite", "section": 2, "instruction": "..."}, {"type": "headline", "text": "..."}, {"type": "dek", "text": "..."}]}`,
        }),
      },
      {
        role: 'user',
        content: `${factsOf(i, { full: false })}\n\n${tr({ en: 'THE PIECE', it: 'IL PEZZO' })}:\n# ${i.headline}\n${i.dek}\n\n${(i.blocks || []).map((b, k) => `## ${k + 1}. ${b.heading}\n${(b.paragraphs || []).join('\n\n')}`).join('\n\n')}\n\n${tr({ en: 'THE DESK\'S CHECKS', it: 'I CONTROLLI DEL DESK' })}:\n${checks}\n\n${tr({ en: 'THE CONVERSATION', it: 'LA CONVERSAZIONE' })}:\n${i.deskThread.slice(-8).map((m) => `${m.who === 'director' ? tr({ en: 'EDITOR', it: 'DIRETTORE' }) : ed.name.toUpperCase()}: ${m.text}`).join('\n')}`,
      },
    ];
    try {
      const j = parseJson(await chat(llm, config, msgs, 1800));
      reply = {
        who: 'editor', at: Date.now(), text: cut(j.reply, 1500) || '…',
        actions: (Array.isArray(j.actions) ? j.actions : []).map((a) => ({
          type: ['rewrite', 'headline', 'dek'].includes(a.type) ? a.type : null,
          section: a.type === 'rewrite' ? Math.max(0, Math.min(i.blocks.length - 1, (Number(a.section) || 1) - 1)) : undefined,
          instruction: a.type === 'rewrite' ? cut(a.instruction, 300) : undefined,
          text: a.type !== 'rewrite' ? cut(a.text, 300) : undefined,
        })).filter((a) => a.type && (a.instruction || a.text)).slice(0, 3),
      };
    } catch (e) {
      log(`[inquiry] desk: ${e.message}`);
      reply.text = tr({ en: `I lost the thread (${e.message}). Ask me again?`, it: `Ho perso il filo (${e.message}). Me lo richiede?` });
    }
  }
  i = getInquiry(store, id);
  i.deskThread = [...(i.deskThread || []), reply];
  return getInquiry(store, save(store, i).id);
}

/** Apply a managing editor's proposal (from the conversation or from the reading). */
export function applyDeskAction(store, config, id, { msg, action, edit } = {}, log = console.log) {
  const i = idle(getInquiry(store, id));
  let a = null;
  if (edit) {
    const e = i.desk?.read?.edits?.find((x) => x.id === edit);
    if (e) a = { type: 'rewrite', section: e.section, instruction: e.instruction || e.note };
    if (e) i.desk.read.edits = i.desk.read.edits.map((x) => (x.id === edit ? { ...x, applied: true } : x));
  } else {
    const m = i.deskThread?.[Number(msg)];
    a = m?.actions?.[Number(action)] || null;
    if (a) i.deskThread[Number(msg)].actions[Number(action)] = { ...a, applied: true };
  }
  if (!a) throw new DeskError(tr({ en: 'Proposal not found', it: 'Proposta non trovata' }), 404);
  if (a.type === 'headline') i.headline = cleanHeadline(a.text);
  if (a.type === 'dek') i.dek = a.text;
  save(store, i);
  if (a.type === 'rewrite') return sectionAction(store, config, id, a.section, { op: 'rewrite', instruction: a.instruction }, log);
  return getInquiry(store, id);
}

/** One section at the desk: rewrite with an instruction (the creative writer), or the Editor's own text. */
export function sectionAction(store, config, id, index, { op, instruction, paragraphs, heading } = {}, log = console.log) {
  const i = idle(getInquiry(store, id));
  const k = Number(index);
  if (!i.blocks[k]) throw new DeskError(tr({ en: 'Section not found', it: 'Sezione non trovata' }), 404);
  if (!['draft', 'desk'].includes(i.status)) throw new DeskError(tr({ en: 'The piece can\'t be changed now.', it: 'Il pezzo ora non si può cambiare.' }), 409);
  if (op === 'edit') {
    const ps = (Array.isArray(paragraphs) ? paragraphs : String(paragraphs || '').split(/\n\s*\n/)).map((p) => String(p).replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    if (!ps.length) throw new DeskError(tr({ en: 'The section is empty.', it: 'La sezione è vuota.' }), 400);
    i.blocks[k] = { ...i.blocks[k], paragraphs: ps, by: 'director', lint: lint(ps), heading: heading != null ? cut(heading, 80) || i.blocks[k].heading : i.blocks[k].heading };
    return getInquiry(store, save(store, { ...i, ...quickChecks(i), desk: i.desk ? { ...i.desk, ...quickChecks(i) } : i.desk }).id);
  }
  if (op !== 'rewrite') throw new DeskError(tr({ en: 'Unknown operation', it: 'Operazione sconosciuta' }), 400);
  const instr = cut(instruction, 300) || tr({ en: 'a better version', it: 'una versione migliore' });
  job(store, i.id, `section:${k}`, log, async () => {
    await writeSection(store, config, await connectCreative(config), id, k, instr);
    const cur = getInquiry(store, id);
    save(store, { ...cur, ...quickChecks(cur), desk: cur.desk ? { ...cur.desk, ...quickChecks(cur) } : cur.desk });
  });
  return { ...getInquiry(store, i.id), busy: true };
}

/** Headline, dek, kicker. */
export function editInquiry(store, id, { headline, dek, kicker } = {}) {
  const i = getInquiry(store, id);
  if (typeof headline === 'string') i.headline = cleanHeadline(headline).slice(0, 160);
  if (typeof dek === 'string') i.dek = dek.trim().slice(0, 400);
  if (typeof kicker === 'string') i.kicker = kicker.trim().slice(0, 40);
  return getInquiry(store, save(store, i).id);
}

/** Out of the desk: the inquiry becomes a published long read. */
export function publishInquiry(store, id, now = Date.now()) {
  const i = getInquiry(store, id);
  if (running.has(i.id)) throw new DeskError(tr({ en: 'Wait: the reporter is still working.', it: 'Aspetti: il cronista sta ancora lavorando.' }), 409);
  if (!['draft', 'desk', 'published'].includes(i.status) || !i.blocks.some((b) => b.paragraphs?.length)) throw new DeskError(tr({ en: 'There is nothing to publish yet.', it: 'Non c\'è ancora niente da pubblicare.' }), 409);
  const blocks = i.blocks.filter((b) => b.paragraphs?.length).map((b) => ({ heading: b.heading, paragraphs: b.paragraphs, status: 'done', by: b.by || 'writer' }));
  const feature = {
    kind: 'feature', status: 'published', ts: i.ts, ref: null, publishedAt: now,
    target: 'longread', format: 'long', mode: 'desk', style: 'magazine', length: 'long', inquiryId: i.id,
    topic: i.topic, keywords: i.keywords, days: i.days, from: i.from, to: i.to,
    origin: null, dossier: i.dossier, numbers: i.numbers, coverage: i.coverage, timeline: i.timeline, evidence: i.evidence || [],
    questions: (i.questions || []).filter((x) => x.a?.trim()).map((x) => ({ q: x.q, a: x.a })),
    sources: (i.sources || []).filter((s) => s.use !== false && !s.auto && s.attribution === 'on').map((s) => ({ text: `${s.label}: ${s.text}`, via: 'editor' })),
    persona: i.reporter, byline: i.reporter, outline: (i.outline?.sections || []).map((s) => ({ heading: s.heading, point: s.beat })),
    blocks, headline: i.headline || i.topic, dek: i.dek || '', kicker: i.kicker || tr({ en: 'Inquiry', it: 'Inchiesta' }), alternatives: i.alternatives || [],
    writer: i.writer, ...quickChecks(i),
  };
  const f = i.featureId && store.getItem('feature', i.featureId) ? store.saveItem({ ...feature, id: i.featureId }) : store.saveItem(feature);
  save(store, { ...i, status: 'published', featureId: f.id, publishedAt: i.publishedAt || now });
  say(store, 'desk', tr({ en: `Desk: the inquiry ${q(f.headline)} is out.`, it: `Desk: l'inchiesta ${q(f.headline)} è uscita.` }), now);
  return getInquiry(store, i.id);
}

export function deleteInquiry(store, id) {
  if (running.has(Number(id))) throw new DeskError(tr({ en: 'Wait: the reporter is still working.', it: 'Aspetti: il cronista sta ancora lavorando.' }), 409);
  store.deleteItem(KIND, id);
}
