/**
 * The editorial meeting: the editor discusses an edition with the managing editor (the model).
 * The managing editor replies and may propose actions; nothing changes until the editor applies them.
 */
import { connectLLM, chat } from './llm.js';
import { getLine, saveLine, TONES, toneId, isTone } from './line.js';
import { meetingPrompt } from './prompts.js';
import { buildStories, factSheet } from './cluster.js';
import { cleanEvents, DeskError, rewriteArticle, moveArticle, spikeArticle } from './edition.js';
import { rewriteEditorial } from './evening.js';
import { hhmm, dayKey } from '../util.js';
import { preview, previewText, steer, toolsHelp, dayText } from './next.js';
import { search } from './archive.js';
import { tr, lang } from '../i18n.js';

const EVENING = /^sera-(\d{4}-\d{2}-\d{2})$/;
export const eveningThreadId = (day) => `sera-${day}`;

const en = () => lang() === 'en';
const q = (x) => (en() ? `“${x}”` : `«${x}»`);
const SIZE = { en: { lead: 'lead story', article: 'article', brief: 'brief' }, it: { lead: 'apertura', article: 'articolo', brief: 'breve' } };
const sizeName = (s) => (en() ? SIZE.en : SIZE.it)[{ apertura: 'lead', articolo: 'article', breve: 'brief' }[s] || s] || s || '';

/** The day at a glance: editions out, drafts, current time, next edition. */
function dayOverview(store, config, day) {
  const now = Date.now();
  const eds = store.editionsForDay(day, { drafts: true });
  const lines = eds.map((e) => (en()
    ? `- ${hhmm(e.hour)}${e.start < e.hour ? ` (since ${hhmm(e.start)})` : ''}: ${e.status === 'draft' ? 'DRAFT, ' : ''}${e.total} signals, lead ${q(e.lead || '—')}`
    : `- ${hhmm(e.hour)}${e.start < e.hour ? ` (dalle ${hhmm(e.start)})` : ''}: ${e.status === 'draft' ? 'BOZZA, ' : ''}${e.total} segnali, apertura ${q(e.lead || '—')}`));
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const evening = store.getEvening(day);
  const eh = config.edition.eveningHour;
  const cur = hhmm(next.getTime() - 3600e3);
  const out = hhmm(next.getTime());
  const evAt = eh != null ? `${String(eh).padStart(2, '0')}:00` : null;
  return (en()
    ? [
      `THE DAY AT A GLANCE (${day}): it is now ${hhmm(now)}.`,
      lines.length ? `Today's editions:\n${lines.join('\n')}` : 'No editions today.',
      `The edition for the current hour (${cur}) comes out around ${out}: until the hour is over, no drafts exist for later hours.`,
      evAt ? (evening ? `The evening edition is out (${q(evening.editorial.headline)}).` : `The evening edition comes out at ${evAt}.`) : '',
    ]
    : [
      `QUADRO DELLA GIORNATA (${day}): adesso sono le ${hhmm(now)}.`,
      lines.length ? `Edizioni del giorno:\n${lines.join('\n')}` : 'Nessuna edizione oggi.',
      `L'edizione dell'ora in corso (${cur}) esce verso le ${out}: finché l'ora non è finita non esistono bozze per le ore successive.`,
      evAt ? (evening ? `L'edizione della sera è uscita (${q(evening.editorial.headline)}).` : `L'edizione della sera esce alle ${evAt}.`) : '',
    ]).filter(Boolean).join('\n');
}

function context(store, config, threadId, articleId) {
  const m = EVENING.exec(threadId);
  if (m) {
    const ev = store.getEvening(m[1]);
    if (!ev) throw new DeskError(tr({ en: 'Evening edition not found', it: 'Edizione della sera non trovata' }), 404);
    const items = [
      `${tr({ en: 'Editorial', it: 'Editoriale' })}: ${q(ev.editorial.headline)} — ${ev.editorial.oneliner}`,
      ev.editorial.body.map((p) => `  ${p}`).join('\n'),
      tr({ en: 'The day\'s news:', it: 'Notizie del giorno:' }),
      ...ev.top.map((t) => `- [${t.section}, ${tr({ en: 'at', it: 'ore' })} ${hhmm(t.hour)}] ${t.headline}`),
      `${tr({ en: 'Cartoon', it: 'Vignetta' })}: ${q(ev.cartoon?.caption)}`,
    ].join('\n');
    return { kind: 'evening', label: tr({ en: `the evening edition of ${m[1]}`, it: `l'edizione della sera del ${m[1]}` }), items, articles: [], evening: ev, overview: dayOverview(store, config, m[1]) };
  }
  const ed = store.getEdition(threadId);
  if (!ed) throw new DeskError(tr({ en: 'Edition not found', it: 'Edizione non trovata' }), 404);
  const items = [
    `${tr({ en: 'The brief', it: 'Il punto' })}: ${ed.summary}`,
    tr({ en: 'Articles, in page order:', it: 'Articoli, in ordine di pagina:' }),
    ...ed.articles.map((a, i) => (en()
      ? `- id “${a.id}” ${i === 0 ? '(LEAD) ' : ''}[${a.section}, ${sizeName(a.size) || 'article'}, ${a.sources.length} sources${a.series ? `, continuing story: instalment ${a.series.episode}` : ''}] ${a.headline} — ${a.dek || ''}\n    Text: ${a.body.join(' ').slice(0, 320)}`
      : `- id «${a.id}» ${i === 0 ? '(APERTURA) ' : ''}[${a.section}, ${sizeName(a.size) || 'articolo'}, ${a.sources.length} fonti${a.series ? `, storia che continua: ${a.series.episode}ª puntata` : ''}] ${a.headline} — ${a.dek || ''}\n    Testo: ${a.body.join(' ').slice(0, 320)}`)),
    ed.spiked?.length ? `${tr({ en: 'Spiked', it: 'Cestinati' })}: ${ed.spiked.map((a) => q(a.headline)).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  let focus = null;
  if (articleId) {
    const a = ed.articles.find((x) => x.id === articleId);
    if (a) {
      const story = buildStories(cleanEvents(store.eventsBetween(ed.start, ed.end), config)).find((s) => s.id === articleId);
      focus = `${q(a.headline)} (id ${a.id})\n${tr({ en: 'Full text', it: 'Testo completo' })}: ${a.body.join(' ')}${story ? `\n${tr({ en: 'THE FACTS behind it', it: 'I FATTI da cui nasce' })}:\n${factSheet(story)}` : ''}`;
    }
  }
  return { kind: 'edition', label: tr({ en: `the ${hhmm(ed.hour ?? ed.start)} edition`, it: `l'edizione delle ${hhmm(ed.hour ?? ed.start)}` }), items, articles: ed.articles, focus, edition: ed, overview: dayOverview(store, config, dayKey(ed.hour ?? ed.start)) };
}

/** Tries to parse a JSON fragment, even with trailing commas or escaped quotes (\\"). */
function tryJson(chunk) {
  const variants = [chunk, chunk.replace(/,\s*([}\]])/g, '$1')];
  variants.push(...variants.map((v) => v.replace(/\\"/g, '"')));
  for (const v of variants) {
    try { return JSON.parse(v); } catch { /* next variant */ }
  }
  return null;
}

function normalizeActions(actions) {
  if (typeof actions === 'string') actions = tryJson(actions) ?? [];
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => (typeof a === 'string' ? tryJson(a) : a)).filter((a) => a && typeof a === 'object');
}

/** Extracts {reply, actions} even from imperfect local-model responses. */
export function parseReply(raw) {
  const text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(json)?/g, '').trim();
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) {
    const j = tryJson(text.slice(a, b + 1));
    if (j && typeof j.reply === 'string') return { reply: j.reply.trim(), actions: normalizeActions(j.actions) };
    // broken JSON: recover the pieces one by one
    const r = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
    if (r) {
      const reply = tryJson(`"${r[1]}"`) ?? r[1];
      const actions = [];
      for (const m of text.matchAll(/\{\s*\\?"type\\?"[^{}]*\}/g)) {
        const obj = tryJson(m[0]);
        if (obj) actions.push(obj);
      }
      return { reply: String(reply).trim(), actions };
    }
  }
  // no JSON: take the text as is, without actions
  return { reply: text, actions: [] };
}

function validActions(actions, ctx) {
  const ids = new Set(ctx.articles.map((a) => a.id));
  const nextStories = ctx.next?.stories || [];
  const nextIds = new Set([...nextStories.map((x) => x.id), ...(ctx.next?.buried || []).map((x) => x.id)]);
  const out = [];
  for (const x of actions.slice(0, 3)) {
    if (!x || typeof x !== 'object') continue;
    const t = x.type;
    if (ctx.kind === 'edition' && ['rewrite', 'lead', 'spike'].includes(t) && ids.has(x.article)) {
      if (t === 'rewrite' && !String(x.instruction || '').trim()) continue;
      out.push({ type: t, article: x.article, instruction: t === 'rewrite' ? String(x.instruction).trim().slice(0, 300) : undefined });
    } else if (t === 'note' && String(x.text || '').trim()) {
      out.push({ type: 'note', text: String(x.text).trim().slice(0, 300) });
    } else if (t === 'tone' && isTone(x.tone)) {
      out.push({ type: 'tone', tone: toneId(x.tone) });
    } else if (t === 'editorial' && ctx.kind === 'evening') {
      out.push({ type: 'editorial', instruction: String(x.instruction || '').trim().slice(0, 300) });
    } else if ((t === 'lead_next' || t === 'drop_next') && nextIds.has(x.story)) {
      const st = nextStories.find((y) => y.id === x.story);
      out.push({ type: t, story: x.story, topic: st?.topic || x.story });
    } else if (t === 'next_note' && String(x.text || '').trim()) {
      out.push({ type: 'next_note', text: String(x.text).trim().slice(0, 300) });
    } else if (t === 'print_now') {
      out.push({ type: 'print_now' });
    }
  }
  // human-readable labels for the UI
  return out.map((x) => {
    const art = x.article && ctx.articles.find((a) => a.id === x.article);
    const title = art ? q(art.headline.length > 60 ? art.headline.slice(0, 59) + '…' : art.headline) : '';
    const label = (en()
      ? {
        rewrite: `Rewrite ${title}: ${x.instruction}`,
        lead: `Lead with ${title}`,
        spike: `Drop ${title} from the edition`,
        note: `Add to the editor's notes: ${q(x.text)}`,
        tone: `Change the tone to ${q(TONES[x.tone]?.label)}`,
        editorial: `Rewrite the editorial${x.instruction ? `: ${x.instruction}` : ''}`,
        lead_next: `Next edition: lead with ${q(x.topic)}`,
        drop_next: `Next edition: leave out ${q(x.topic)}`,
        next_note: `Next edition only: ${q(x.text)}`,
        print_now: 'Print the current hour\'s edition now',
      }
      : {
        rewrite: `Riscrivi ${title}: ${x.instruction}`,
        lead: `Metti in apertura ${title}`,
        spike: `Togli dall'edizione ${title}`,
        note: `Aggiungi alle note del direttore: ${q(x.text)}`,
        tone: `Cambia il tono in ${q(TONES[x.tone]?.label)}`,
        editorial: `Riscrivi l'editoriale${x.instruction ? `: ${x.instruction}` : ''}`,
        lead_next: `Prossima edizione: apertura su ${q(x.topic)}`,
        drop_next: `Prossima edizione: lascia fuori ${q(x.topic)}`,
        next_note: `Solo per la prossima edizione: ${q(x.text)}`,
        print_now: 'Stampa subito l\'edizione dell\'ora in corso',
      })[x.type];
    return { ...x, label, status: 'proposed' };
  });
}

/**
 * Each meeting is a session: the managing editor only remembers messages from the current session.
 * Earlier sessions stay in the thread, viewable from the UI.
 */
/** A tool call in a reply: {"tool": "...", ...}, and no "reply". */
function toolCall(raw) {
  const text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(json)?/g, '').trim();
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const j = tryJson(text.slice(a, b + 1));
  return j && typeof j.tool === 'string' && typeof j.reply !== 'string' ? j : null;
}

/** Run one of the managing editor's tools; the result goes back to the model as text. */
function runTool(call, { store, config, runtime, ctx }) {
  const en = lang() === 'en';
  switch (call.tool) {
    case 'next_edition': {
      const p = preview(store, config, { lastCollect: runtime?.lastCollect, nextPress: runtime?.nextEdition });
      ctx.next = p; // the actions on the next edition are checked against these stories
      return previewText(p);
    }
    case 'story': {
      const id = String(call.id || call.story || '');
      const pool = [...buildStories(cleanEvents(store.eventsBetween(Date.now() - 4 * 3600e3, Date.now()), config))];
      if (ctx.edition) pool.push(...buildStories(cleanEvents(store.eventsBetween(ctx.edition.start, ctx.edition.end), config)));
      const st = pool.find((x) => x.id === id);
      return st ? factSheet(st) : (en ? `No story with id “${id}”.` : `Nessuna storia con id «${id}».`);
    }
    case 'today':
      return dayText(store);
    case 'search': {
      const days = Math.max(1, Math.min(90, Number(call.days) || 7));
      const r = search(store, { q: String(call.query || ''), any: true, from: Date.now() - days * 864e5, limit: 15 });
      if (!r.total) return en ? 'Nothing found.' : 'Nessun risultato.';
      return `${r.total} ${en ? 'matches' : 'risultati'}:\n${r.results.map((x) => `- ${dayKey(x.ts)} ${hhmm(x.ts)} [${x.section || x.kind}] ${x.title}`).join('\n')}`;
    }
    default:
      return en ? `Unknown tool “${call.tool}”.` : `Strumento sconosciuto «${call.tool}».`;
  }
}

export async function discuss({ store, config, threadId, text, articleId, session, runtime = null, log = console.log }) {
  const msg = String(text || '').trim().slice(0, 2000);
  if (!msg) throw new DeskError(tr({ en: 'Empty message', it: 'Messaggio vuoto' }));
  const ctx = context(store, config, threadId, articleId);
  const llm = await connectLLM(config);
  if (!llm) throw new DeskError(tr({ en: 'The managing editor is not answering: the model is off or unreachable.', it: 'Il caporedattore non risponde: il modello è spento o irraggiungibile.' }), 503);

  const thread = store.getThread(threadId);
  const line = getLine(store);
  const sid = Number(session) || 0;
  const history = sid ? thread.messages.filter((m) => m.session === sid) : thread.messages;
  const prompt = meetingPrompt({ ...ctx, line, history, text: msg, tools: toolsHelp() });
  let raw;
  const used = [];
  try {
    // the managing editor may look things up (at most 3 tools) before answering
    for (let round = 0; round < 4; round++) {
      raw = await chat(llm, config, prompt, 2000);
      const call = toolCall(raw);
      if (!call) break;
      if (round === 3) { raw = ''; break; }
      const result = runTool(call, { store, config, runtime, ctx });
      used.push({ tool: call.tool, ...(call.id ? { id: String(call.id) } : {}), ...(call.query ? { query: String(call.query) } : {}) });
      prompt.push({ role: 'assistant', content: JSON.stringify(call) });
      prompt.push({
        role: 'user',
        content: `${tr({ en: 'TOOL RESULT', it: 'RISULTATO DELLO STRUMENTO' })} (${call.tool}):\n${result}\n\n${round === 2
          ? tr({ en: 'Now answer the editor, with JSON {"reply": ..., "actions": [...]}. No more tools.', it: 'Ora rispondi al direttore, con JSON {"reply": ..., "actions": [...]}. Niente altri strumenti.' })
          : tr({ en: 'Answer the editor with JSON {"reply": ..., "actions": [...]}, or call another tool.', it: 'Rispondi al direttore con JSON {"reply": ..., "actions": [...]}, oppure usa un altro strumento.' })}`,
      });
    }
  } catch (e) {
    log(`[${tr({ en: 'meeting', it: 'riunione' })}] ${e.message}`);
    throw new DeskError(tr({ en: `The managing editor did not answer: ${e.message}`, it: `Il caporedattore non ha risposto: ${e.message}` }), 502);
  }
  if (!ctx.next && /lead_next|drop_next/.test(raw)) ctx.next = preview(store, config, { lastCollect: runtime?.lastCollect, nextPress: runtime?.nextEdition });
  const { reply, actions } = parseReply(raw);
  const now = Date.now();
  // re-read: an action may have been applied in the meantime
  const fresh = store.getThread(threadId);
  fresh.messages.push({ role: 'director', text: msg, articleId: articleId || null, ts: now, session: sid || undefined });
  fresh.messages.push({ role: 'editor', text: reply || '…', actions: validActions(actions, ctx), tools: used.length ? used : undefined, ts: Date.now(), model: llm.model, session: sid || undefined });
  store.saveThread(fresh);
  return fresh;
}


export async function applyAction({ store, config, threadId, msgIndex, actionIndex, printNow = null, log = console.log }) {
  const thread = store.getThread(threadId);
  const action = thread.messages[msgIndex]?.actions?.[actionIndex];
  if (!action) throw new DeskError(tr({ en: 'Action not found', it: 'Azione non trovata' }), 404);
  if (action.status === 'applied') throw new DeskError(tr({ en: 'Action already applied', it: 'Azione già applicata' }), 409);

  let result = {};
  try {
    switch (action.type) {
      case 'rewrite': result.edition = await rewriteArticle(store, config, threadId, action.article, action.instruction, log); break;
      case 'lead': result.edition = moveArticle(store, threadId, action.article, 'top'); break;
      case 'spike': result.edition = spikeArticle(store, threadId, action.article); break;
      case 'note': {
        const line = getLine(store);
        const notes = [line.notes?.trim(), `· ${action.text}`].filter(Boolean).join('\n');
        result.line = saveLine(store, { notes });
        break;
      }
      case 'tone': result.line = saveLine(store, { tone: action.tone }); break;
      case 'editorial': result.evening = await rewriteEditorial(store, config, EVENING.exec(threadId)[1], action.instruction, log); break;
      case 'lead_next': result.steer = steer(store, config, { op: 'boost', story: action.story }); break;
      case 'drop_next': result.steer = steer(store, config, { op: 'bury', story: action.story }); break;
      case 'next_note': result.steer = steer(store, config, { op: 'note', text: action.text }); break;
      case 'print_now': {
        if (!printNow) throw new DeskError(tr({ en: 'Printing is not available here.', it: 'La stampa non è disponibile qui.' }), 503);
        const ed = await printNow();
        if (!ed) throw new DeskError(tr({ en: 'Nothing worth telling has happened yet this hour.', it: 'Nell\'ora corrente non è ancora successo nulla da raccontare.' }), 409);
        result.printed = ed;
        break;
      }
      default: throw new DeskError(tr({ en: 'Unknown action', it: 'Azione sconosciuta' }));
    }
  } catch (e) {
    action.error = e.message;
    store.saveThread(thread);
    throw e;
  }
  // re-read: the action may have taken time (rewrite) and the thread has changed in the meantime
  const fresh = store.getThread(threadId);
  const a = fresh.messages[msgIndex]?.actions?.[actionIndex];
  if (a) { a.status = 'applied'; a.appliedAt = Date.now(); delete a.error; }
  store.saveThread(fresh);
  return { thread: fresh, ...result };
}

/** Repairs messages saved before parsing was lenient (JSON left as text). */
export function getThreadRepaired(store, config, threadId) {
  const thread = store.getThread(threadId);
  let changed = false;
  for (const m of thread.messages) {
    if (m.role !== 'editor' || m.actions?.length || !m.text?.trim().startsWith('{')) continue;
    const { reply, actions } = parseReply(m.text);
    if (reply === m.text) continue;
    let ctx = null;
    try { ctx = context(store, config, threadId); } catch { /* edition gone */ }
    m.text = reply;
    m.actions = ctx ? validActions(actions, ctx) : [];
    changed = true;
  }
  if (changed) store.saveThread(thread);
  return thread;
}
