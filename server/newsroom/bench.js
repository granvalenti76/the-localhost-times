/**
 * The editor's bench: quick moves on the drafts, one paragraph or one headline at a time.
 *  - a paragraph rewritten with an instruction ("meaner", "shorter"), cut, or marked as good/bad
 *    (the marked ones become examples for that writer: see tastePrompt in writers.js)
 *  - three alternative headlines to choose from
 *  - keep / cut, article by article, counted per writer (the staff's scoreboard)
 */
import { tr } from '../i18n.js';
import { buildStories, factSheet } from './cluster.js';
import { load, findArticle, touch, cleanEvents, cleanHeadline, spikeArticle, DeskError } from './edition.js';
import { seriesFacts } from './series.js';
import { getLine } from './line.js';
import { writerFor } from './writers.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { systemFor } from './prompts.js';
import { lint } from './lint.js';
import { say } from './chatter.js';
import { hhmm } from '../util.js';

const TASTE = 'taste';
const KEEP_EXAMPLES = 12;

export const getTaste = (store) => ({ liked: [], disliked: [], stats: {}, ...store.getSetting(TASTE, {}) });

function bump(t, writer, key) {
  const w = writer || 'newsroom';
  t.stats[w] ||= { liked: 0, disliked: 0, kept: 0, cut: 0 };
  t.stats[w][key]++;
}

/** The facts an article was written from (or, if they're gone, the article and its sources). */
function factsFor(store, config, ed, a) {
  const story = buildStories(cleanEvents(store.eventsBetween(ed.start, ed.end), config)).find((s) => s.id === a.id);
  if (story) return factSheet(story) + seriesFacts(a.series || null, Date.now());
  return [`${a.section}`, ...(a.sources || []).map((s) => `- ${hhmm(s.ts)} ${s.title}${s.host ? ` (${s.host})` : ''}`)].join('\n');
}

async function writer(store, config) {
  const llm = await connectLLM(config);
  if (!llm) throw new DeskError(tr({ en: 'The writer is not answering: cannot rewrite now.', it: 'Il redattore non risponde: impossibile riscrivere ora.' }), 503);
  return llm;
}

const clean = (raw) => String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[a-z]*|```/g, '').trim()
  .replace(/^["«“]+|["»”]+$/g, '').replace(/^(paragrafo|paragraph)\s*:\s*/i, '').trim();

/** One paragraph: rewrite with an instruction, cut, or mark it as good or bad. */
export async function paragraphAction(store, config, id, aid, { index, op, instruction } = {}, log = console.log) {
  const ed = load(store, id);
  const a = ed.articles[findArticle(ed, aid)];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= a.body.length) throw new DeskError(tr({ en: 'Paragraph not found', it: 'Paragrafo non trovato' }), 404);
  const line = getLine(store);
  const w = a.byline?.id || writerFor(line, a.source)?.id || null;
  if (op === 'like' || op === 'dislike') {
    const t = getTaste(store);
    const list = op === 'like' ? t.liked : t.disliked;
    if (!list.some((x) => x.text === a.body[i])) list.unshift({ text: a.body[i], writer: w, at: Date.now(), editionId: id, articleId: aid });
    t[op === 'like' ? 'liked' : 'disliked'] = list.slice(0, KEEP_EXAMPLES);
    bump(t, w, op === 'like' ? 'liked' : 'disliked');
    store.setSetting(TASTE, t);
    a.marks = { ...(a.marks || {}), [i]: op };
    store.saveEdition(ed);
    if (op === 'like' && a.byline?.name) say(store, w, tr({ en: `${a.byline.name}: the Editor liked my paragraph. Framing it.`, it: `${a.byline.name}: al Direttore è piaciuto il mio paragrafo. Me lo incornicio.` }));
    return ed;
  }
  if (op === 'cut') {
    if (a.body.length < 2) throw new DeskError(tr({ en: 'It is the only paragraph: spike the article instead.', it: 'È l\'unico paragrafo: cestina l\'articolo, piuttosto.' }), 400);
    a.body.splice(i, 1);
    a.marks = {};
    a.writer = /\+ (editor|direttore)$/.test(a.writer || '') ? a.writer : `${a.writer || 'typesetting'} + editor`;
    return touch(store, ed);
  }
  const instr = String(instruction || '').trim().slice(0, 300) || tr({ en: 'a better version', it: 'una versione migliore' });
  const llm = await writer(store, config);
  const persona = writerFor(line, a.source);
  const msgs = [
    { role: 'system', content: systemFor(line, persona).replace(/(Reply ONLY with a valid JSON object|Rispondi SOLO con un oggetto JSON)[^\n]*\n\{[^\n]*\}/, '').trim() },
    {
      role: 'user',
      content: tr({
        en: `FACTS:\n${factsFor(store, config, ed, a)}\n\nTHE ARTICLE (“${a.headline}”):\n${a.body.map((p, k) => `${k === i ? '>>> ' : ''}${p}`).join('\n\n')}\n\nRewrite ONLY the paragraph marked >>>. The editor's instruction: “${instr}”. Same facts, invent nothing; it must still fit between the paragraphs around it. Reply with the new paragraph only: no quotes around it, no comments.`,
        it: `FATTI:\n${factsFor(store, config, ed, a)}\n\nL'ARTICOLO («${a.headline}»):\n${a.body.map((p, k) => `${k === i ? '>>> ' : ''}${p}`).join('\n\n')}\n\nRiscrivi SOLO il paragrafo segnato con >>>. Indicazione del direttore: «${instr}». Stessi fatti, non inventare nulla; deve stare ancora bene tra i paragrafi intorno. Rispondi solo con il nuovo paragrafo: niente virgolette intorno, niente commenti.`,
      }),
    },
  ];
  let text;
  try {
    text = clean(await chat(llm, config, msgs, 1400)).split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join(' ');
  } catch (e) {
    throw new DeskError(tr({ en: `The writer gave a bad answer: ${e.message}`, it: `Il redattore ha risposto male: ${e.message}` }), 502);
  }
  if (!text || text.length < 15) throw new DeskError(tr({ en: 'The writer gave an empty paragraph.', it: 'Il redattore ha consegnato un paragrafo vuoto.' }), 502);
  const fresh = load(store, id);
  const b = fresh.articles[findArticle(fresh, aid)];
  if (b.body[i] !== a.body[i]) throw new DeskError(tr({ en: 'The article changed in the meantime: try again.', it: 'L\'articolo è cambiato nel frattempo: riprova.' }), 409);
  b.body[i] = text;
  b.marks = { ...(b.marks || {}) };
  delete b.marks[i];
  b.lint = lint(b.body);
  b.writer = /\+ (editor|direttore)$/.test(b.writer || '') ? b.writer : `${b.writer || 'typesetting'} + editor`;
  log(tr({ en: `[bench] ${aid}: paragraph ${i + 1} rewritten (“${instr}”)`, it: `[banco] ${aid}: paragrafo ${i + 1} riscritto («${instr}»)` }));
  return touch(store, fresh);
}

/** Three other headlines for an article (the model, or simple variants without it). */
export async function headlineOptions(store, config, id, aid) {
  const ed = load(store, id);
  const a = ed.articles[findArticle(ed, aid)];
  const llm = await connectLLM(config);
  if (llm) {
    const line = getLine(store);
    const msgs = [
      {
        role: 'system',
        content: tr({
          en: `You are the headline writer of The Localhost Times. Write 3 alternative headlines for the article, each different in approach: one plain and informative, one wry, one that intrigues. 12 words at most each, sentence case, no final period, only facts that are in the article.${line.notes ? `\nEditor's notes: ${line.notes}` : ''}
Reply ONLY with JSON: {"headlines": ["...", "...", "..."]}`,
          it: `Sei il titolista del «The Localhost Times». Scrivi 3 titoli alternativi per l'articolo, ciascuno con un approccio diverso: uno piano e informativo, uno sornione, uno che incuriosisce. Massimo 12 parole ciascuno, senza punto finale, solo fatti presenti nell'articolo.${line.notes ? `\nNote del direttore: ${line.notes}` : ''}
Rispondi SOLO con JSON: {"headlines": ["...", "...", "..."]}`,
        }),
      },
      { role: 'user', content: `${tr({ en: 'Current headline', it: 'Titolo attuale' })}: ${a.headline}\n${a.dek ? `${a.dek}\n` : ''}\n${a.body.join('\n\n')}` },
    ];
    try {
      const j = parseJson(await chat(llm, config, msgs, 900));
      const list = (j.headlines || []).map((h) => cleanHeadline(String(h || '').replace(/^["«“]+|["»”]+$/g, ''))).filter((h) => h && h !== a.headline);
      if (list.length) return { options: [...new Set(list)].slice(0, 3), by: 'writer' };
    } catch { /* fall back to the variants */ }
  }
  const first = a.body[0] || '';
  const firstSentence = first.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, '');
  const options = [
    a.dek ? cleanHeadline(a.dek.split(/[,;:—]/)[0]) : null,
    firstSentence && firstSentence.split(/\s+/).length <= 14 ? firstSentence : null,
    a.kicker && a.kicker !== a.section ? `${a.kicker}: ${a.headline.charAt(0).toLowerCase()}${a.headline.slice(1)}` : null,
  ].filter((h) => h && h !== a.headline);
  return { options: [...new Set(options)].slice(0, 3), by: 'typesetting' };
}

/** Keep or cut, from the quick bench. */
export function verdict(store, id, aid, v) {
  if (!['keep', 'cut'].includes(v)) throw new DeskError(tr({ en: 'Unknown verdict', it: 'Verdetto sconosciuto' }), 400);
  const ed = load(store, id);
  const a = ed.articles[findArticle(ed, aid)];
  const t = getTaste(store);
  bump(t, a.byline?.id, v === 'keep' ? 'kept' : 'cut');
  store.setSetting(TASTE, t);
  ed.review = { ...(ed.review || {}), [aid]: v, at: Date.now() };
  if (v === 'keep') {
    a.reviewed = 'keep';
    store.saveEdition(ed);
    return ed;
  }
  store.saveEdition(ed);
  return spikeArticle(store, id, aid);
}

/** The staff's scoreboard: what the Editor liked and cut, writer by writer. */
export function scoreboard(store) {
  const t = getTaste(store);
  return { stats: t.stats, liked: t.liked.length, disliked: t.disliked.length };
}

/** Forget an example (the Editor changed their mind). */
export function forgetExample(store, text) {
  const t = getTaste(store);
  t.liked = t.liked.filter((x) => x.text !== text);
  t.disliked = t.disliked.filter((x) => x.text !== text);
  store.setSetting(TASTE, t);
  return getTaste(store);
}

