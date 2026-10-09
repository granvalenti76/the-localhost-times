/**
 * Approfondimenti: the long piece the Editor asks for, on any story or subject, in three modes.
 *
 *  desk      the newsroom does everything: outline, then the piece section by section
 *  together  the newsroom proposes the outline, the Editor fixes it; then section by section,
 *            each one can be rewritten, edited, or written by the Editor (the writer goes on in tune)
 *  yours     the Editor writes; the newsroom is the desk: checks the figures against the signals,
 *            points out the data worth using, proposes headline, kicker and summary, flags the tics
 *
 * In every mode the facts are the signals (the dossier, built from the archive). The Editor's
 * answers to the reporter's questions are quotes; the Editor's own notes are facts they supply;
 * tips are "a source close to the owner".
 *
 * Items of kind 'feature'. Statuses: brief (questions waiting) → planning → outline (the Editor
 * approves it) → writing → draft → published; or failed.
 */
import { tr, lang } from '../i18n.js';
import { buildStories, factSheet, siteOf } from './cluster.js';
import { load, findArticle, cleanEvents, cleanHeadline, DeskError } from './edition.js';
import { gather, timeline, dataSheet, typeset, suggestions } from './investigations.js';
import { isSensitive } from './spotlight/detectors.js';
import { seriesFacts } from './series.js';
import { getLine, linePrompt, LENGTHS } from './line.js';
import { writerFor, columnist, byline, directorByline, personaPrompt, tastePrompt } from './writers.js';
import { STYLES, isStyle } from './styles.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { numbersCheck, figures } from './factcheck.js';
import { lint, lintInstruction } from './lint.js';
import { templateQuestion, formingStories } from './calls.js';
import { nextEditionId, label as storyLabel } from './next.js';
import { SECTIONS } from './sections.js';
import { words } from './tips.js';
import { say } from './chatter.js';
import { dayKey, hhmm } from '../util.js';

const KIND = 'feature';
const DAY = 24 * 3600e3;
export const MODES = ['desk', 'together', 'yours'];
const BLOCK_WORDS = { short: [120, 180], standard: [180, 260], long: [260, 360] };
/** An article for the edition is shorter: three sections that read as one piece. */
const ARTICLE_WORDS = { short: [60, 100], standard: [90, 140], long: [140, 200] };
const running = new Set(); // features being written right now (one job at a time each)

const q = (s) => (lang() === 'it' ? `«${s}»` : `“${s}”`);
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function getFeature(store, id) {
  const f = store.getItem(KIND, id);
  if (!f) throw new DeskError(tr({ en: 'Long piece not found', it: 'Approfondimento non trovato' }), 404);
  return { ...f, busy: running.has(f.id), text: featureText(f) };
}

export const features = (store, { status = null, limit = 30, target = null } = {}) => store.items(KIND, { status, limit: target ? limit * 3 : limit })
  .filter((f) => !target || (f.target || 'longread') === target).slice(0, limit)
  .map((f) => ({ target: f.target || 'longread', printedIn: f.printedIn || null, id: f.id, ts: f.ts, status: f.status, mode: f.mode, topic: f.topic, headline: f.headline || f.topic, dek: f.dek || '', kicker: f.kicker || '', byline: f.byline || null, words: wordsOf(f), publishedAt: f.publishedAt || null }));

const wordsOf = (f) => (f.blocks || []).flatMap((b) => b.paragraphs || []).join(' ').split(/\s+/).filter(Boolean).length;

const save = (store, f) => {
  const { busy, text, ...rest } = f;
  return store.saveItem(rest);
};

/** Words to search the archive with, from a story. */
/** Search words for a free subject: a site name is searched as a phrase ("chess.com", not "chess" or "com"). */
const searchWords = (text, n = 4) => words(text).slice(0, n).map((w) => (w.includes('.') ? `"${w}"` : w)).join(' ');

function keywordsOf(story, fallback) {
  if (!story) return searchWords(fallback) || fallback;
  switch (story.kind) {
    case 'site': return `"${siteOf(story.topic)}"`;
    case 'searches': return words(story.events.map((e) => e.title).join(' ')).slice(0, 5).join(' ');
    case 'folder': return `"${(story.project || story.topic).split('/').pop()}"`;
    case 'thread': return words(story.topic).slice(0, 4).join(' ');
    case 'episode': return words(story.events.at(-1)?.meta?.show || story.topic).slice(0, 3).join(' ');
    case 'book': case 'note': return words(story.topic).slice(0, 4).join(' ');
    case 'session': return story.commits?.length ? words(story.commits.join(' ')).slice(0, 4).join(' ') : 'git npm';
    default: return searchWords(`${story.topic} ${fallback}`) || fallback;
  }
}

function genericQuestions(topic) {
  return tr({
    en: [`Chief, what surprises you most about ${q(topic)}?`, 'Is there something the data don\'t say?'],
    it: [`Direttore, cosa la sorprende di più di ${q(topic)}?`, 'C\'è qualcosa che i dati non dicono?'],
  });
}

async function writtenQuestions(llm, config, topic, dossier, persona) {
  const msgs = [
    {
      role: 'system',
      content: tr({
        en: `You are a reporter of The Localhost Times preparing a long piece on a subject from the Editor's Mac. Before writing, you interview the Editor (the owner of the Mac). Write 3 short questions (at most 18 words each, starting with "Chief," in the first one), concrete, about the facts of the dossier: the kind that bring out what the data can't say (why, how it felt, how it ended). Never ask about health, money, love, faith, politics or the law.${personaPrompt(persona, 'brief')}
Reply ONLY with JSON: {"questions": ["...", "...", "..."]}`,
        it: `Sei un cronista del «The Localhost Times» e prepari un pezzo lungo su un argomento del Mac del Direttore. Prima di scrivere intervisti il Direttore (il proprietario del Mac), dandogli del lei. Scrivi 3 domande brevi (massimo 18 parole ciascuna, la prima comincia con «Direttore,»), concrete, sui fatti del fascicolo: quelle che tirano fuori ciò che i dati non dicono (perché, com'è andata, com'è finita). Mai domande su salute, soldi, amore, fede, politica o giustizia.${personaPrompt(persona, 'brief')}
Rispondi SOLO con JSON: {"questions": ["...", "...", "..."]}`,
      }),
    },
    { role: 'user', content: `${tr({ en: 'SUBJECT', it: 'ARGOMENTO' })}: ${topic}\n\n${dossier.slice(0, 5000)}` },
  ];
  try {
    const j = parseJson(await chat(llm, config, msgs, 700));
    const list = (j.questions || []).map((x) => String(x || '').trim()).filter((x) => x && x.length < 220);
    return list.length ? list.slice(0, 3) : null;
  } catch { return null; }
}

/**
 * A new long piece, from an article (editionId + articleId) or a free subject (topic).
 * Gathers the dossier at once and prepares the reporter's questions.
 */
export async function createFeature(store, config, { editionId, articleId, storyId, topic, days = 7, target = 'longread', now = Date.now() } = {}, log = console.log) {
  const line = getLine(store);
  let story = null;
  let origin = null;
  let subject = String(topic || '').trim().slice(0, 100);
  if (storyId && !(editionId && articleId)) {
    // a story forming in the current hour, proposed by the newsroom
    const { stories, editionId: next } = formingStories(store, config, now);
    story = stories.find((x) => x.id === storyId) || null;
    if (!story) throw new DeskError(tr({ en: 'That story is no longer among the signals of the hour.', it: 'Questa storia non è più tra i segnali dell\'ora.' }), 404);
    origin = { editionId: null, nextEditionId: next, articleId: null, headline: storyLabel(story), section: story.section, source: story.source, kind: story.kind, storyId: story.id };
    subject ||= story.kind === 'site' ? story.topic : storyLabel(story);
  }
  if (editionId && articleId) {
    const ed = load(store, editionId);
    const a = ed.articles[findArticle(ed, articleId)];
    story = buildStories(cleanEvents(store.eventsBetween(ed.start, ed.end), config)).find((s) => s.id === a.id) || null;
    origin = { editionId, articleId, headline: a.headline, section: a.section, source: a.source, kind: a.kind, storyId: a.id };
    subject ||= a.kind === 'site' ? (story?.topic || a.headline) : a.headline;
    if (story) story.series = a.series || null;
  }
  if (!subject) throw new DeskError(tr({ en: 'Give the piece a subject.', it: 'Dai un argomento al pezzo.' }), 400);
  const span = Math.max(1, Math.min(60, Number(days) || 7));
  const from = startOfDay(now) - (span - 1) * DAY;
  const keywords = keywordsOf(story, subject);
  let d = null;
  try { d = gather(store, { keywords, from, to: now }); } catch { d = null; }
  const tl = d ? timeline(d) : [];
  const parts = [];
  if (story) parts.push(`${tr({ en: 'THE STORY OF THE HOUR', it: 'LA STORIA DELL\'ORA' })} (${origin.headline}):\n${factSheet(story)}${seriesFacts(story.series, now)}`);
  if (d?.numbers.total) parts.push(`${tr({ en: `THE ARCHIVE, LAST ${span} DAYS`, it: `L'ARCHIVIO, ULTIMI ${span} GIORNI` })}:\n${dataSheet(subject, d, tl, from, now)}`);
  if (!parts.length) throw new DeskError(tr({ en: `The archive has nothing on ${q(subject)} in the last ${span} days.`, it: `L'archivio non ha niente su ${q(subject)} negli ultimi ${span} giorni.` }), 404);
  const dossier = parts.join('\n\n');
  const persona = story ? writerFor(line, story.source) : columnist(line);
  const llm = await connectLLM(config);
  const asked = (llm ? await writtenQuestions(llm, config, subject, dossier, persona) : null)
    || [story ? templateQuestion(story) : null, ...genericQuestions(subject)].filter(Boolean).slice(0, 3);
  // the signals behind the piece, for the "Sources" list when it goes into an edition
  const evidence = [
    ...(story?.events || []).slice(0, 25).map((e) => ({ ts: e.ts, kind: e.kind, title: e.title, detail: e.detail, host: e.meta?.host ?? null, url: e.source === 'safari' && /^https?:/.test(e.url || '') ? e.url : null, source: e.source })),
    ...(d?.events || []).slice(-15).map((e) => ({ ts: e.ts, kind: e.kind, title: e.title, detail: e.detail, host: e.host, url: null, source: e.source })),
  ].slice(0, 40);
  const forEdition = target === 'edition';
  const f = save(store, {
    kind: KIND, status: 'brief', ts: now, ref: origin?.storyId || null,
    target: forEdition ? 'edition' : 'longread', format: forEdition ? 'article' : 'long', evidence,
    mode: null, style: forEdition ? (persona?.house || 'daily') : 'magazine', length: 'standard',
    topic: subject, keywords, days: span, from, to: now,
    origin, dossier, numbers: d?.numbers || null, coverage: d?.coverage?.slice(-10) || [], timeline: tl,
    questions: asked.map((x) => ({ q: x, a: '' })), sources: [],
    persona: persona ? byline(persona) : null,
    outline: [], blocks: [], headline: '', dek: '', kicker: '', alternatives: [],
  });
  log(tr({ en: `[long piece] “${subject}”: dossier ready (${d?.numbers.total || 0} signals in the archive)`, it: `[approfondimento] «${subject}»: fascicolo pronto (${d?.numbers.total || 0} segnali in archivio)` }));
  if (persona) say(store, persona.id, forEdition
    ? tr({ en: `${persona.name}: the Editor has commissioned a piece on ${q(subject)} for the next edition. I'm on it.`, it: `${persona.name}: il Direttore mi ha commissionato un pezzo su ${q(subject)} per la prossima edizione. Ci sono.` })
    : tr({ en: `${persona.name}: the Editor wants a long piece on ${q(subject)}. I've got questions for them.`, it: `${persona.name}: il Direttore vuole un approfondimento su ${q(subject)}. Ho qualche domanda per lui.` }), now);
  return getFeature(store, f.id);
}

/** What the writer knows beyond the dossier: the Editor's answers, notes and tips. */
function extras(f) {
  const lines = [];
  const answered = f.questions.filter((x) => x.a?.trim());
  if (answered.length) {
    lines.push(tr({ en: 'STATEMENTS BY THE OWNER (real, collected by the reporter; quote them word for word and attribute them):', it: 'DICHIARAZIONI DEL PROPRIETARIO (vere, raccolte dal cronista; citale parola per parola e attribuiscile):' }));
    for (const x of answered) lines.push(`- ${q(x.q)} → ${q(x.a.trim())}`);
  }
  const notes = f.sources.filter((s) => s.via !== 'tip');
  if (notes.length) {
    lines.push(tr({ en: 'FACTS SUPPLIED BY THE OWNER (true; use them as facts):', it: 'FATTI FORNITI DAL PROPRIETARIO (veri; usali come fatti):' }));
    for (const s of notes) lines.push(`- ${s.text}`);
  }
  const tips = f.sources.filter((s) => s.via === 'tip');
  if (tips.length) {
    lines.push(tr({ en: 'TIPS (attribute them to "a source close to the owner"):', it: 'SOFFIATE (attribuiscile a «una fonte vicina al proprietario»):' }));
    for (const s of tips) lines.push(`- ${s.text}`);
  }
  return lines.join('\n');
}

const allFacts = (f) => [f.dossier, extras(f)].filter(Boolean).join('\n\n');

function styleBlock(f) {
  const st = STYLES[isStyle(f.style) ? f.style : 'magazine'];
  return `\n${st.prompt}`;
}

function system(f, line, persona, what) {
  return tr({
    en: `You are a writer of The Localhost Times, the paper that tells what happens on its owner's Mac, and you are working on ${f.target === 'edition' ? 'an article the Editor commissioned for the next edition' : 'a long piece'}: ${what}. Write like a good ${f.target === 'edition' ? 'paper' : 'magazine'}: scenes, telling details, a thread that holds, sentences of different lengths; irony from the facts, never from adjectives. Third person ("the owner"), but don't repeat it: use it at most twice per section.
Rules: every fact and every number must come from the dossier or from what the owner supplied; don't invent causes, feelings or outcomes; don't compute new numbers beyond the obvious; don't open sentences with the time over and over; no "perhaps…, perhaps…"; no absences nobody could know ("no likes"). Quote titles in curly quotes “like this”.`,
    it: `Sei una firma del «The Localhost Times», il giornale di ciò che succede sul Mac del suo proprietario, e lavori a ${f.target === 'edition' ? 'un articolo che il Direttore ha commissionato per la prossima edizione' : 'un pezzo lungo'}: ${what}. Scrivi come un buon ${f.target === 'edition' ? 'giornale' : 'magazine'}: scene, dettagli rivelatori, un filo che tiene, frasi di lunghezza diversa; l'ironia nasce dai fatti, mai dagli aggettivi. Terza persona («il proprietario»), ma senza ripeterlo: al massimo due volte per sezione.
Regole: ogni fatto e ogni numero deve venire dal fascicolo o da ciò che il proprietario ha fornito; non inventare cause, sentimenti o esiti; non calcolare numeri nuovi salvo gli ovvi; non cominciare le frasi con l'orario una dopo l'altra; niente «forse…, forse…»; niente assenze che nessuno può sapere («nessun like»). Cita i titoli tra «caporali».`,
  }) + styleBlock(f) + (line ? `\n${linePrompt(line)}` : '') + personaPrompt(persona, 'editorial') + tastePrompt(line, persona);
}

// ───────────────────────── The outline ─────────────────────────

function typesetOutline(f) {
  const d = { numbers: f.numbers || { total: 0, bySource: {}, sites: [], days: f.days, activeDays: 0, byDay: [], titles: [] }, coverage: f.coverage || [] };
  const t = f.numbers?.total ? typeset(f.topic, d, f.from, f.to) : null;
  const secs = t?.sections?.length ? t.sections : [{ heading: tr({ en: 'What happened', it: 'Cosa è successo' }), paragraphs: [] }];
  // what the owner said and supplied: a section of its own when the typesetting writes
  const said = [
    ...f.questions.filter((x) => x.a?.trim()).map((x) => tr({ en: `Asked ${q(x.q)}, the owner answered: ${q(x.a.trim())}.`, it: `Alla domanda ${q(x.q)}, il proprietario ha risposto: ${q(x.a.trim())}.` })),
    ...f.sources.filter((x) => x.via !== 'tip').map((x) => tr({ en: `The owner adds: ${x.text}`, it: `Il proprietario aggiunge: ${x.text}` })),
    ...f.sources.filter((x) => x.via === 'tip').map((x) => tr({ en: `A source close to the owner reports: ${q(x.text)}.`, it: `Una fonte vicina al proprietario riferisce: ${q(x.text)}.` })),
  ];
  if (said.length) secs.push({ heading: tr({ en: 'In the owner\'s words', it: 'Con le sue parole' }), paragraphs: said });
  return {
    angle: t?.dek || f.topic,
    outline: secs.map((s) => ({ heading: s.heading, point: s.paragraphs[0] || '' })),
    typeset: secs,
  };
}

async function writeOutline(llm, config, f, line, persona) {
  const msgs = [
    {
      role: 'system',
      content: system(f, line, persona, tr({ en: 'first the outline', it: 'prima la scaletta' })) + tr({
        en: `\nWrite the outline: a working headline, the angle (one sentence: what the piece is really about), and ${f.format === 'article' ? '3' : '4 or 5'} sections. The first opens on a scene, the last closes on a line that stays. For each section a short heading and its point (one sentence: which facts it uses and what it says).
Reply ONLY with JSON: {"headline": "...", "angle": "...", "sections": [{"heading": "...", "point": "..."}]}`,
        it: `\nScrivi la scaletta: un titolo di lavoro, l'angolo (una frase: di cosa parla davvero il pezzo) e ${f.format === 'article' ? '3' : '4 o 5'} sezioni. La prima apre su una scena, l'ultima chiude con una riga che resta. Per ogni sezione un titoletto breve e il suo punto (una frase: quali fatti usa e cosa dice).
Rispondi SOLO con JSON: {"headline": "...", "angle": "...", "sections": [{"heading": "...", "point": "..."}]}`,
      }),
    },
    { role: 'user', content: `${tr({ en: 'SUBJECT', it: 'ARGOMENTO' })}: ${f.topic}\n\n${allFacts(f)}` },
  ];
  const j = parseJson(await chat(llm, config, msgs, 1800));
  const sections = (j.sections || []).map((s) => ({ heading: String(s.heading || '').trim().slice(0, 80), point: String(s.point || '').trim().slice(0, 300) })).filter((s) => s.heading);
  if (sections.length < 2) throw new Error(tr({ en: 'outline too short', it: 'scaletta troppo corta' }));
  return { headline: cleanHeadline(String(j.headline || '').trim()), angle: String(j.angle || '').trim(), outline: sections.slice(0, 6) };
}

// ───────────────────────── Writing, section by section ─────────────────────────

const splitParas = (raw) => String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[a-z]*|```/g, '')
  .replace(/^\s*#+\s.*$/gm, '').replace(/^\s*(sezione|section)\s*\d*\s*[:.].*$/gim, '')
  .split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/^["«“]|["»”]$/g, '').trim()).filter((p) => p.length > 20);

function blockPrompt(f, i, line, persona, instruction = null) {
  const table = f.format === 'article' ? ARTICLE_WORDS : BLOCK_WORDS;
  const [min, max] = table[f.length] || table.standard;
  const sec = f.blocks[i];
  const plan = f.blocks.map((b, k) => `${k + 1}. ${b.heading}${b.point ? ` — ${b.point}` : ''}${k === i ? tr({ en: '   ← NOW', it: '   ← ORA' }) : ''}`).join('\n');
  const before = f.blocks.slice(0, i).filter((b) => b.paragraphs?.length);
  const prev = before.slice(-2).map((b) => `## ${b.heading}\n${b.paragraphs.join('\n\n')}`).join('\n\n');
  const earlier = before.slice(0, -2).map((b) => `## ${b.heading} (${tr({ en: 'already written', it: 'già scritta' })})`).join('\n');
  const own = sec.by === 'director' && sec.paragraphs?.length;
  return [
    { role: 'system', content: system(f, line, persona, `${q(f.headline || f.topic)}${f.angle ? ` — ${f.angle}` : ''}`) },
    {
      role: 'user',
      content: [
        `${tr({ en: 'DOSSIER', it: 'FASCICOLO' })}:\n${allFacts(f)}`,
        `${tr({ en: 'THE OUTLINE', it: 'LA SCALETTA' })}:\n${plan}`,
        earlier,
        prev ? `${tr({ en: 'WHAT COMES JUST BEFORE', it: 'COSA VIENE SUBITO PRIMA' })}:\n${prev}` : '',
        own ? `${tr({ en: 'THE EDITOR WROTE THE START OF THIS SECTION THEMSELVES (keep it word for word at the top, then go on in the same tone)', it: 'IL DIRETTORE HA SCRITTO LUI L\'INIZIO DI QUESTA SEZIONE (tienilo parola per parola in testa, poi prosegui con lo stesso tono)' })}:\n${sec.paragraphs.join('\n\n')}` : '',
        instruction ? `${tr({ en: 'THE EDITOR ASKS', it: 'IL DIRETTORE CHIEDE' })}: ${q(instruction)}${sec.paragraphs?.length && !own ? `\n${tr({ en: 'The current version', it: 'La versione attuale' })}:\n${sec.paragraphs.join('\n\n')}` : ''}` : '',
        tr({
          en: `Now write ONLY section ${i + 1}, “${sec.heading}”: ${sec.point || ''}\n${min}-${max} words, 2-4 paragraphs separated by a blank line. No heading, no JSON, no comments: only the text.`,
          it: `Ora scrivi SOLO la sezione ${i + 1}, «${sec.heading}»: ${sec.point || ''}\n${min}-${max} parole, 2-4 paragrafi separati da una riga vuota. Niente titoletto, niente JSON, niente commenti: solo il testo.`,
        }),
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

async function writeBlock(store, config, llm, id, i, { instruction = null } = {}) {
  let f = getFeature(store, id);
  const line = getLine(store);
  const persona = f.persona ? writerFor(line, f.origin?.source) || columnist(line) : columnist(line);
  f.blocks[i] = { ...f.blocks[i], status: 'writing' };
  save(store, f);
  let paras = null;
  if (llm) {
    const msgs = blockPrompt(f, i, line, persona, instruction);
    paras = splitParas(await chat(llm, config, msgs, 2600));
    const own = f.blocks[i].by === 'director' ? f.blocks[i].paragraphs || [] : [];
    if (own.length && paras.length && paras[0] !== own[0]) paras = [...own, ...paras.filter((p) => !own.includes(p))];
    // the copy desk: one more pass if the section is full of tics
    const l = lint(paras);
    if (paras.length && l.score < 70) {
      try {
        const fixed = splitParas(await chat(llm, config, [...msgs, { role: 'assistant', content: paras.join('\n\n') }, { role: 'user', content: `${lintInstruction(l.issues)} ${tr({ en: 'Reply with the text only.', it: 'Rispondi solo con il testo.' })}` }], 2600));
        if (fixed.length && lint(fixed).score > l.score) paras = own.length ? [...own, ...fixed.filter((p) => !own.includes(p))] : fixed;
      } catch { /* keep the first version */ }
    }
  }
  if (!paras?.length) paras = f.blocks[i].typeset || [f.blocks[i].point].filter(Boolean);
  f = getFeature(store, id);
  f.blocks[i] = { ...f.blocks[i], paragraphs: paras, status: 'done', by: f.blocks[i].by === 'director' ? 'both' : 'writer', lint: lint(paras), rewrittenWith: instruction || null };
  save(store, f);
  return f;
}

async function writeMeta(llm, config, f) {
  const text = f.blocks.map((b) => `## ${b.heading}\n${(b.paragraphs || []).join('\n\n')}`).join('\n\n');
  const msgs = [
    {
      role: 'system',
      content: tr({
        en: `You are the desk of The Localhost Times. For the long piece below write: a kicker (1-3 words), the headline (at most 10 words, magazine style: short, oblique, no final period), a dek (one sentence that says what the piece is about), and 2 alternative headlines. Only facts from the piece.
Reply ONLY with JSON: {"kicker": "...", "headline": "...", "dek": "...", "alternatives": ["...", "..."]}`,
        it: `Sei il desk del «The Localhost Times». Per il pezzo lungo qui sotto scrivi: un occhiello (1-3 parole), il titolo (massimo 10 parole, da magazine: breve, obliquo, senza punto finale), un sommario (una frase che dice di cosa parla il pezzo) e 2 titoli alternativi. Solo fatti presenti nel pezzo.
Rispondi SOLO con JSON: {"kicker": "...", "headline": "...", "dek": "...", "alternatives": ["...", "..."]}`,
      }),
    },
    { role: 'user', content: text.slice(0, 12000) },
  ];
  const j = parseJson(await chat(llm, config, msgs, 900));
  return {
    kicker: String(j.kicker || '').trim().slice(0, 40),
    headline: cleanHeadline(String(j.headline || '').trim()),
    dek: String(j.dek || '').trim(),
    alternatives: (j.alternatives || []).map((h) => cleanHeadline(String(h || ''))).filter(Boolean).slice(0, 3),
  };
}

/** The checks on the finished text: figures not in the facts, the tics. */
function checks(f) {
  const body = f.blocks.flatMap((b) => b.paragraphs || []);
  return { check: numbersCheck({ headline: f.headline, dek: f.dek, body }, allFacts(f)), lint: lint(body) };
}

/** Run a job on a feature in the background (one at a time per feature). */
function job(store, id, log, fn) {
  if (running.has(Number(id))) throw new DeskError(tr({ en: 'The newsroom is already working on it.', it: 'La redazione ci sta già lavorando.' }), 409);
  running.add(Number(id));
  Promise.resolve().then(fn).catch((e) => {
    log(tr({ en: `[long piece] ${id}: ${e.message}`, it: `[approfondimento] ${id}: ${e.message}` }));
    try {
      const f = store.getItem(KIND, id);
      if (f) store.saveItem({ ...f, status: f.blocks?.some((b) => b.paragraphs?.length) ? 'draft' : f.status === 'planning' ? 'brief' : f.status, error: e.message, blocks: (f.blocks || []).map((b) => (b.status === 'writing' ? { ...b, status: b.paragraphs?.length ? 'done' : 'pending' } : b)) });
    } catch { /* nothing to save */ }
  }).finally(() => running.delete(Number(id)));
}

/** Write the sections still pending, in order, then the headline and the checks. */
async function writeAll(store, config, id, log) {
  const llm = await connectLLM(config);
  let f = getFeature(store, id);
  f.status = 'writing';
  f.error = null;
  save(store, f);
  for (let i = 0; i < f.blocks.length; i++) {
    f = getFeature(store, id);
    if (f.status !== 'writing') return; // stopped by the Editor
    if (f.blocks[i].status === 'done') continue;
    f = await writeBlock(store, config, llm, id, i);
  }
  f = getFeature(store, id);
  if (llm) {
    try { Object.assign(f, await writeMeta(llm, config, f)); } catch (e) { log(`[long piece] headline: ${e.message}`); }
  }
  f.headline ||= f.workingHeadline || f.topic;
  f.dek ||= f.angle || '';
  Object.assign(f, checks(f), { status: 'draft', writer: llm?.model || 'typesetting', finishedAt: Date.now() });
  save(store, f);
  if (f.persona) say(store, f.persona.id, f.target === 'edition'
    ? tr({ en: `${f.persona.name}: the piece on ${q(f.topic)} is on the Editor's desk. Is it good enough for the next edition?`, it: `${f.persona.name}: il pezzo su ${q(f.topic)} è sul tavolo del Direttore. Va bene per la prossima edizione?` })
    : tr({ en: `${f.persona.name}: the long piece on ${q(f.topic)} is on the Editor's desk.`, it: `${f.persona.name}: l'approfondimento su ${q(f.topic)} è sul tavolo del Direttore.` }));
  ready(f);
  log(tr({ en: `[long piece] “${f.headline}”: ${wordsOf(f)} words`, it: `[approfondimento] «${f.headline}»: ${wordsOf(f)} parole` }));
}

async function plan(store, config, id, log) {
  const llm = await connectLLM(config);
  let f = getFeature(store, id);
  const line = getLine(store);
  const persona = writerFor(line, f.origin?.source) || columnist(line);
  const ts = typesetOutline(f);
  let o = null;
  if (llm) {
    try { o = await writeOutline(llm, config, f, line, persona); } catch (e) { log(`[long piece] outline: ${e.message}`); }
  }
  f = getFeature(store, id);
  f.workingHeadline = o?.headline || f.topic;
  f.angle = o?.angle || ts.angle;
  f.outline = o?.outline || ts.outline;
  f.blocks = f.outline.map((s, k) => ({ heading: s.heading, point: s.point, paragraphs: [], status: 'pending', by: null, typeset: o ? null : ts.typeset[k]?.paragraphs || null }));
  f.status = f.mode === 'together' ? 'outline' : 'writing';
  save(store, f);
  if (f.mode === 'desk') await writeAll(store, config, id, log);
}

/**
 * The Editor briefs the newsroom: answers, own facts, tips, mode, style and length.
 * desk and together start working at once (in the background); yours opens the editor.
 */
export function briefFeature(store, config, id, { answers = [], sources = [], tips = [], mode, style, length, format } = {}, log = console.log) {
  const f = getFeature(store, id);
  if (!['brief', 'outline', 'draft'].includes(f.status) && f.status !== 'failed') throw new DeskError(tr({ en: 'The piece is already being written.', it: 'Il pezzo è già in scrittura.' }), 409);
  if (!MODES.includes(mode)) throw new DeskError(tr({ en: 'Choose how to write it.', it: 'Scegli come scriverlo.' }), 400);
  f.questions = f.questions.map((x, i) => ({ ...x, a: String(answers[i] ?? x.a ?? '').trim().slice(0, 600) }));
  const notes = (Array.isArray(sources) ? sources : [sources]).map((t) => String(t || '').trim().slice(0, 1200)).filter(Boolean).map((text) => ({ text, via: 'editor' }));
  const tipItems = (Array.isArray(tips) ? tips : []).map((tid) => store.getItem('tip', tid)).filter(Boolean);
  f.sources = [...notes, ...tipItems.map((t) => ({ text: t.text, via: 'tip', tipId: t.id }))];
  for (const t of tipItems) store.saveItem({ ...t, status: 'used', usedIn: `feature:${f.id}` });
  f.mode = mode;
  f.style = isStyle(style) ? style : f.style || 'magazine';
  f.length = LENGTHS[length] ? length : f.length || 'standard';
  if (['article', 'long'].includes(format)) f.format = format;
  if (mode === 'yours') {
    const line = getLine(store);
    f.byline = directorByline(line);
    f.status = 'draft';
    if (!f.blocks.some((b) => b.paragraphs?.length)) f.blocks = [{ heading: '', paragraphs: [], status: 'done', by: 'director' }];
    return getFeature(store, save(store, f).id);
  }
  f.byline = f.persona;
  f.status = 'planning';
  save(store, f);
  job(store, f.id, log, () => plan(store, config, f.id, log));
  return getFeature(store, f.id);
}

/** together: the Editor's outline (reordered, cut, added to) — then the writing starts. */
export function approveOutline(store, config, id, outline, log = console.log) {
  const f = getFeature(store, id);
  if (f.status !== 'outline') throw new DeskError(tr({ en: 'There is no outline waiting.', it: 'Non c\'è una scaletta in attesa.' }), 409);
  const list = (Array.isArray(outline) ? outline : []).map((s) => ({ heading: String(s.heading || '').trim().slice(0, 80), point: String(s.point || '').trim().slice(0, 300) })).filter((s) => s.heading);
  if (!list.length) throw new DeskError(tr({ en: 'The outline is empty.', it: 'La scaletta è vuota.' }), 400);
  f.outline = list;
  f.blocks = list.map((s) => {
    const old = f.blocks.find((b) => b.heading === s.heading);
    return { heading: s.heading, point: s.point, paragraphs: [], status: 'pending', by: null, typeset: old?.typeset || null };
  });
  f.status = 'writing';
  save(store, f);
  job(store, f.id, log, () => writeAll(store, config, f.id, log));
  return getFeature(store, f.id);
}

/** Resume the writing (after a restart, or after the Editor wrote a section's start). */
export function continueFeature(store, config, id, log = console.log) {
  const f = getFeature(store, id);
  if (!f.blocks.length) throw new DeskError(tr({ en: 'There is no outline yet.', it: 'Non c\'è ancora una scaletta.' }), 409);
  job(store, f.id, log, () => writeAll(store, config, f.id, log));
  return { ...getFeature(store, f.id), busy: true };
}

/** One section: rewrite with an instruction, the Editor's own text, cut, add after, move. */
export function blockAction(store, config, id, index, { op, instruction, paragraphs, heading, point } = {}, log = console.log) {
  const f = getFeature(store, id);
  const i = Number(index);
  if (op === 'add') {
    const at = Math.max(0, Math.min(f.blocks.length, Number.isInteger(i) ? i + 1 : f.blocks.length));
    const h = String(heading || '').trim().slice(0, 80);
    if (!h) throw new DeskError(tr({ en: 'Give the new section a heading.', it: 'Dai un titoletto alla nuova sezione.' }), 400);
    f.blocks.splice(at, 0, { heading: h, point: String(point || '').trim().slice(0, 300), paragraphs: [], status: 'pending', by: null });
    save(store, f);
    if (f.mode !== 'yours') job(store, f.id, log, async () => { await writeBlock(store, config, await connectLLM(config), f.id, at); refresh(store, f.id); });
    return getFeature(store, f.id);
  }
  if (!f.blocks[i]) throw new DeskError(tr({ en: 'Section not found', it: 'Sezione non trovata' }), 404);
  if (op === 'cut') {
    f.blocks.splice(i, 1);
  } else if (op === 'up' || op === 'down') {
    const j = op === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= f.blocks.length) return f;
    [f.blocks[i], f.blocks[j]] = [f.blocks[j], f.blocks[i]];
  } else if (op === 'edit') {
    const ps = (Array.isArray(paragraphs) ? paragraphs : String(paragraphs || '').split(/\n\s*\n/)).map((p) => String(p).trim()).filter(Boolean);
    f.blocks[i] = { ...f.blocks[i], paragraphs: ps, by: 'director', status: 'done', lint: lint(ps), heading: heading != null ? String(heading).trim().slice(0, 80) : f.blocks[i].heading };
  } else if (op === 'rewrite' || op === 'continue') {
    save(store, f);
    job(store, f.id, log, async () => {
      await writeBlock(store, config, await connectLLM(config), f.id, i, { instruction: op === 'rewrite' ? String(instruction || '').trim().slice(0, 300) || tr({ en: 'a better version', it: 'una versione migliore' }) : null });
      refresh(store, f.id);
    });
    return { ...getFeature(store, f.id), busy: true };
  } else {
    throw new DeskError(tr({ en: 'Unknown operation', it: 'Operazione sconosciuta' }), 400);
  }
  save(store, refreshed(f));
  return getFeature(store, f.id);
}

const refreshed = (f) => ({ ...f, ...checks(f) });
const refresh = (store, id) => save(store, refreshed(getFeature(store, id)));

/** yours: the Editor's text (## lines are section headings), headline, kicker, summary. */
export function editFeature(store, id, { headline, dek, kicker, text, byline: by } = {}) {
  const f = getFeature(store, id);
  if (typeof headline === 'string') f.headline = cleanHeadline(headline).slice(0, 160);
  if (typeof dek === 'string') f.dek = dek.trim().slice(0, 400);
  if (typeof kicker === 'string') f.kicker = kicker.trim().slice(0, 40);
  if (typeof text === 'string') {
    const blocks = [];
    let cur = { heading: '', paragraphs: [], status: 'done', by: 'director' };
    for (const chunk of text.split(/\n\s*\n/)) {
      const t = chunk.trim();
      if (!t) continue;
      const h = /^#{1,3}\s+(.+)$/.exec(t.split('\n')[0]);
      if (h) {
        if (cur.paragraphs.length || cur.heading) blocks.push(cur);
        cur = { heading: h[1].trim().slice(0, 80), paragraphs: [], status: 'done', by: 'director' };
        const rest = t.split('\n').slice(1).join(' ').trim();
        if (rest) cur.paragraphs.push(rest);
      } else cur.paragraphs.push(t.replace(/\s*\n\s*/g, ' '));
    }
    blocks.push(cur);
    f.blocks = blocks;
  }
  if (by === 'director') f.byline = directorByline(getLine(store));
  return getFeature(store, save(store, refreshed(f)).id);
}

/** The full text in the Editor's format (for the editor box). */
export const featureText = (f) => f.blocks.map((b) => [b.heading ? `## ${b.heading}` : '', ...(b.paragraphs || [])].filter(Boolean).join('\n\n')).join('\n\n');

/** Data the Editor might use: the dossier's figures that the text doesn't quote yet. */
function suggestionsFor(f) {
  const n = f.numbers;
  const text = featureText(f);
  const used = new Set(figures(text));
  const out = [];
  const add = (fig, s) => { if (fig != null && !used.has(String(fig))) out.push(s); };
  if (n) {
    add(n.total, tr({ en: `${n.total} signals on the subject in ${n.days} days`, it: `${n.total} segnali sull'argomento in ${n.days} giorni` }));
    if (n.busiestDay) add(n.busiestDay.n, tr({ en: `The busiest day: ${dayKey(n.busiestDay.ts)}, with ${n.busiestDay.n}`, it: `Il giorno più intenso: ${dayKey(n.busiestDay.ts)}, con ${n.busiestDay.n}` }));
    if (n.busiestHour) add(`${String(n.busiestHour.hour).padStart(2, '0')}:00`, tr({ en: `The usual hour: ${String(n.busiestHour.hour).padStart(2, '0')}:00`, it: `L'ora più frequente: le ${String(n.busiestHour.hour).padStart(2, '0')}:00` }));
    for (const s of (n.sites || []).slice(0, 2)) add(s.n, tr({ en: `${s.name}: ${s.n} signals`, it: `${s.name}: ${s.n} segnali` }));
    for (const t of (n.titles || []).slice(0, 2)) add(t.n, tr({ en: `${q(t.name)} came back ${t.n} times`, it: `${q(t.name)} è tornato ${t.n} volte` }));
    if (n.first) add(hhmm(n.first), tr({ en: `The first trace: ${dayKey(n.first)} at ${hhmm(n.first)}`, it: `La prima traccia: ${dayKey(n.first)} alle ${hhmm(n.first)}` }));
  }
  return out.slice(0, 6);
}

/** yours: the desk reads the Editor's piece. */
export function reviewFeature(store, config, id, log = console.log) {
  const f = getFeature(store, id);
  if (!featureText(f).trim()) throw new DeskError(tr({ en: 'Write something first.', it: 'Prima scrivi qualcosa.' }), 400);
  f.review = { status: 'working', at: Date.now() };
  save(store, f);
  job(store, f.id, log, async () => {
    const llm = await connectLLM(config);
    const cur = getFeature(store, id);
    const base = { ...checks(cur), suggestions: suggestionsFor(cur), claims: [], headlines: [], status: 'done', at: Date.now() };
    if (llm) {
      const msgs = [
        {
          role: 'system',
          content: tr({
            en: `You are the desk of The Localhost Times, reading a piece the Editor wrote. Check it against the dossier (the signals collected by the Mac) and the facts the Editor supplied. List the statements that the dossier doesn't support (at most 5, each with a short reason) — opinions and jokes are fine, wrong facts are not. Then propose a kicker (1-3 words), 3 headlines (at most 10 words, no final period) and a dek (one sentence). Be brief and useful, like a good desk editor.
Reply ONLY with JSON: {"claims": [{"text": "...", "why": "..."}], "kicker": "...", "headlines": ["...", "...", "..."], "dek": "..."}`,
            it: `Sei il desk del «The Localhost Times» e leggi un pezzo scritto dal Direttore. Controllalo contro il fascicolo (i segnali raccolti dal Mac) e i fatti forniti dal Direttore. Elenca le affermazioni che il fascicolo non sostiene (al massimo 5, ognuna con un motivo breve): opinioni e battute vanno bene, i fatti sbagliati no. Poi proponi un occhiello (1-3 parole), 3 titoli (massimo 10 parole, senza punto finale) e un sommario (una frase). Sii breve e utile, come un buon caposervizio.
Rispondi SOLO con JSON: {"claims": [{"text": "...", "why": "..."}], "kicker": "...", "headlines": ["...", "...", "..."], "dek": "..."}`,
          }),
        },
        { role: 'user', content: `${tr({ en: 'DOSSIER', it: 'FASCICOLO' })}:\n${allFacts(cur).slice(0, 9000)}\n\n${tr({ en: 'THE EDITOR\'S PIECE', it: 'IL PEZZO DEL DIRETTORE' })}:\n${cur.headline ? `# ${cur.headline}\n` : ''}${featureText(cur)}` },
      ];
      try {
        const j = parseJson(await chat(llm, config, msgs, 1800));
        base.claims = (j.claims || []).map((c) => ({ text: String(c.text || '').slice(0, 300), why: String(c.why || '').slice(0, 300) })).filter((c) => c.text).slice(0, 5);
        base.headlines = (j.headlines || []).map((h) => cleanHeadline(String(h || ''))).filter(Boolean).slice(0, 3);
        base.kicker = String(j.kicker || '').trim().slice(0, 40);
        base.dek = String(j.dek || '').trim().slice(0, 300);
      } catch (e) {
        base.error = e.message;
      }
    }
    const fresh = getFeature(store, id);
    save(store, { ...fresh, review: base, ...checks(fresh) });
  });
  return { ...getFeature(store, f.id), busy: true };
}

export function publishFeature(store, id, now = Date.now()) {
  const f = getFeature(store, id);
  if (!f.blocks.some((b) => b.paragraphs?.length)) throw new DeskError(tr({ en: 'There is nothing to publish yet.', it: 'Non c\'è ancora niente da pubblicare.' }), 409);
  if (running.has(f.id)) throw new DeskError(tr({ en: 'Wait: the newsroom is still writing.', it: 'Aspetta: la redazione sta ancora scrivendo.' }), 409);
  f.headline ||= f.workingHeadline || f.topic;
  f.blocks = f.blocks.filter((b) => b.paragraphs?.length);
  Object.assign(f, checks(f), { status: 'published', publishedAt: f.publishedAt || now });
  save(store, f);
  say(store, f.byline?.id === 'director' ? 'desk' : (f.byline?.id || 'desk'), f.byline?.id === 'director'
    ? tr({ en: `Desk: the Editor signs a piece! ${q(f.headline)} is on the front page.`, it: `Desk: il Direttore firma un pezzo! ${q(f.headline)} è in prima pagina.` })
    : tr({ en: `Desk: ${q(f.headline)} is out.`, it: `Desk: ${q(f.headline)} è uscito.` }), now);
  return getFeature(store, f.id);
}

export function unpublishFeature(store, id) {
  const f = getFeature(store, id);
  return getFeature(store, save(store, { ...f, status: 'draft' }).id);
}

export function deleteFeature(store, id) {
  if (running.has(Number(id))) throw new DeskError(tr({ en: 'Wait: the newsroom is still writing.', it: 'Aspetta: la redazione sta ancora scrivendo.' }), 409);
  store.deleteItem(KIND, id);
}

/** After a restart, pieces left half-written stay as drafts that can be resumed. */
export function interruptedFeatures(store) {
  for (const f of store.items(KIND, { status: ['planning', 'writing'], limit: 50 })) {
    store.saveItem({ ...f, status: f.blocks?.length ? 'draft' : 'brief', blocks: (f.blocks || []).map((b) => (b.status === 'writing' ? { ...b, status: b.paragraphs?.length ? 'done' : 'pending' } : b)) });
  }
}

/** Write the whole piece again (after new tips or answers); the Editor's own sections stay. */
export function rewriteAllFeature(store, config, id, log = console.log) {
  const f = getFeature(store, id);
  if (!f.blocks.length || f.mode === 'yours') throw new DeskError(tr({ en: 'There is nothing for the newsroom to rewrite.', it: 'Non c\'è niente che la redazione possa riscrivere.' }), 409);
  if (f.status === 'published') throw new DeskError(tr({ en: 'This piece is already in the paper.', it: 'Questo pezzo è già in pagina.' }), 409);
  f.blocks = f.blocks.map((b) => (b.by === 'director' ? b : { ...b, status: 'pending' }));
  save(store, { ...f, status: 'draft', placement: null, forEdition: null });
  job(store, f.id, log, () => writeAll(store, config, f.id, log));
  return { ...getFeature(store, f.id), busy: true };
}

/** Stop a piece being written (it stays a draft with what was written so far). */
export function stopFeature(store, id) {
  const f = getFeature(store, id);
  return getFeature(store, save(store, { ...f, status: 'draft' }).id);
}

export { wordsOf };

// ───────────────────────── Commissioned pieces: into the next edition ─────────────────────────

let notifier = null;
/** The server hands over its notifier: a commissioned piece ready for review sends a notification. */
export const setNotifier = (n) => { notifier = n; };

/** The Editor approves the piece for the next edition, at the top or inside. */
export function approveFeature(store, id, { placement = 'inside' } = {}, now = Date.now()) {
  const f = getFeature(store, id);
  if (running.has(f.id)) throw new DeskError(tr({ en: 'Wait: the newsroom is still writing.', it: 'Aspetta: la redazione sta ancora scrivendo.' }), 409);
  if (!f.blocks.some((b) => b.paragraphs?.length)) throw new DeskError(tr({ en: 'There is nothing to print yet.', it: 'Non c\'è ancora niente da stampare.' }), 409);
  if (f.status === 'published' && f.printedIn) throw new DeskError(tr({ en: 'This piece has already been printed.', it: 'Questo pezzo è già stato stampato.' }), 409);
  f.headline ||= f.workingHeadline || f.topic;
  Object.assign(f, checks(f), { status: 'approved', placement: placement === 'lead' ? 'lead' : 'inside', approvedAt: now, forEdition: nextEditionId(now) });
  save(store, f);
  say(store, 'desk', tr({ en: `Desk: the Editor approved ${q(f.headline)} for the next edition${f.placement === 'lead' ? ', as the lead' : ''}.`, it: `Desk: il Direttore ha approvato ${q(f.headline)} per la prossima edizione${f.placement === 'lead' ? ', in apertura' : ''}.` }), now);
  return getFeature(store, f.id);
}

/** Back to draft: not in the next edition after all. */
export function withdrawFeature(store, id) {
  const f = getFeature(store, id);
  if (f.status !== 'approved') throw new DeskError(tr({ en: 'This piece is not waiting for the press.', it: 'Questo pezzo non è in attesa di stampa.' }), 409);
  return getFeature(store, save(store, { ...f, status: 'draft', placement: null, forEdition: null }).id);
}

/** A tip or a fact added while the piece is being written: the next rewrite uses it. */
export function addSource(store, id, { text, via = 'tip' } = {}) {
  const f = getFeature(store, id);
  const t = String(text || '').trim().slice(0, 1200);
  if (!t) throw new DeskError(tr({ en: 'The tip is empty.', it: 'La soffiata è vuota.' }), 400);
  f.sources = [...(f.sources || []), { text: t, via: via === 'editor' ? 'editor' : 'tip', at: Date.now() }];
  say(store, f.persona?.id || 'tips', tr({ en: `${f.persona?.name || 'The desk'}: a new tip for the piece on ${q(f.topic)}. Rewriting with it.`, it: `${f.persona?.name || 'Il desk'}: una soffiata nuova per il pezzo su ${q(f.topic)}. La metto dentro.` }));
  return getFeature(store, save(store, f).id);
}

/** The section of the paper a commissioned piece belongs to. */
function sourceOf(f) {
  if (f.origin?.source && SECTIONS[f.origin.source]) return f.origin.source;
  const by = Object.entries(f.numbers?.bySource || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  return SECTIONS[by] ? by : 'notes';
}

/** The piece as an article of the edition (the sections read as one text; headings only for long ones). */
export function asArticle(f, now = Date.now()) {
  const source = sourceOf(f);
  const body = f.blocks.flatMap((b) => (f.format === 'long' && b.heading ? [`${b.heading}: ${(b.paragraphs || [])[0] || ''}`, ...(b.paragraphs || []).slice(1)] : b.paragraphs || [])).filter(Boolean);
  const ts = (f.evidence || []).map((e) => e.ts).filter(Number.isFinite);
  return {
    id: `feature:${f.id}`,
    featureId: f.id,
    series: null,
    source,
    section: SECTIONS[source].name,
    slug: SECTIONS[source].slug,
    kind: 'commissioned',
    weight: 99,
    size: f.placement === 'lead' ? 'lead' : 'article',
    first: ts.length ? Math.min(...ts) : now,
    last: ts.length ? Math.max(...ts) : now,
    kicker: f.kicker || '',
    headline: f.headline || f.topic,
    dek: f.dek || f.angle || '',
    body,
    writer: f.mode === 'yours' ? 'editor' : `${f.writer || 'typesetting'} + editor`,
    byline: f.byline || null,
    commissioned: { featureId: f.id, mode: f.mode, approvedAt: f.approvedAt },
    quotes: f.questions.filter((x) => x.a?.trim()).map((x) => ({ question: x.q, answer: x.a.trim(), at: f.ts })),
    tipped: f.sources.some((x) => x.via === 'tip') || undefined,
    check: f.check || null,
    lint: f.lint || null,
    image: null,
    sources: (f.evidence || []).slice(0, 40),
  };
}

/**
 * At print: the pieces approved for the press (and those this same edition printed already,
 * for a reprint), as articles; the approved ones are marked as printed in this edition.
 */
export function commissionedFor(store, editionId, now = Date.now()) {
  const list = [
    ...store.items(KIND, { status: 'published', limit: 40 }).filter((f) => f.printedIn === editionId),
    ...store.items(KIND, { status: 'approved', limit: 20, oldest: true }),
  ];
  return list.map((f) => {
    const a = asArticle(f, now);
    if (f.status === 'approved') {
      store.saveItem({ ...f, status: 'published', printedIn: editionId, publishedAt: f.publishedAt || now });
      say(store, f.persona?.id || 'desk', tr({ en: `${f.persona?.name || 'The desk'}: my piece is in the paper. Thank you, Chief.`, it: `${f.persona?.name || 'Il desk'}: il mio pezzo è in pagina. Grazie, Direttore.` }), now);
    }
    return { article: a, placement: f.placement || 'inside' };
  });
}

/** What's waiting for the press (for the preview of the next edition). */
export const approvedPieces = (store) => store.items(KIND, { status: 'approved', limit: 20, oldest: true })
  .map((f) => ({ id: f.id, headline: f.headline || f.topic, placement: f.placement || 'inside', byline: f.byline || null }));

/** The commissioned pieces still in the works (for the newsroom). */
export const piecesInWork = (store) => store.items(KIND, { status: ['brief', 'planning', 'outline', 'writing', 'draft', 'approved'], limit: 30 })
  .filter((f) => f.target === 'edition')
  .map((f) => ({ id: f.id, ts: f.ts, status: f.status, busy: running.has(f.id), topic: f.topic, headline: f.headline || f.workingHeadline || f.topic, mode: f.mode, placement: f.placement || null, byline: f.byline || f.persona || null, words: wordsOf(f) }));

/** Tell the Editor a commissioned piece is waiting for review. */
function ready(f) {
  if (f.target === 'edition') notifier?.piece?.(f);
}

// ───────────────────────── What the newsroom proposes ─────────────────────────

/**
 * Subjects for a new article, found in the signals: the stories forming this hour, the ones that
 * keep coming back this week, the Spotlight's open leads. Each says why it's worth a piece.
 */
export function topicProposals(store, config, now = Date.now()) {
  const inWork = new Set(store.items(KIND, { status: ['brief', 'planning', 'outline', 'writing', 'draft', 'approved'], limit: 50 }).map((f) => (f.ref || f.topic || '').toLowerCase()));
  const out = [];
  const seen = new Set();
  const push = (p) => {
    const k = p.topic.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ...p, inWork: inWork.has((p.storyId || '').toLowerCase()) || inWork.has(k) });
  };
  try {
    const { stories } = formingStories(store, config, now);
    for (const st of stories.filter((x) => x.source !== 'journal' && !isSensitive([x.topic, ...(x.events || []).slice(0, 10).map((e) => e.title)].join(' '))).slice(0, 6)) {
      const n = st.events.length;
      push({
        kind: 'now', storyId: st.id, topic: storyLabel(st), section: st.section,
        why: tr({ en: `${n} signal${n === 1 ? '' : 's'} this hour · ${st.section}`, it: `${n} ${n === 1 ? 'segnale' : 'segnali'} in quest'ora · ${st.section}` }),
      });
    }
  } catch { /* no hour yet */ }
  try {
    for (const x of suggestions(store, now).slice(0, 6)) push({ kind: 'recurring', topic: x.topic, why: x.why });
  } catch { /* no history */ }
  try {
    for (const l of store.leads({ status: ['open', 'review'], limit: 5 })) {
      if (!l.subject || isSensitive(l.subject)) continue;
      push({ kind: 'lead', topic: l.subject, why: tr({ en: 'a Spotlight lead', it: 'una pista di Spotlight' }) });
    }
  } catch { /* no leads */ }
  return out;
}
