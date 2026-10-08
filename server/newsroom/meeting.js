/**
 * La riunione di redazione: il direttore discute un'edizione con il caporedattore (il modello).
 * Il caporedattore risponde e può proporre azioni; nulla cambia finché il direttore non le applica.
 */
import { connectLLM, chat } from './llm.js';
import { getLine, saveLine, TONES } from './line.js';
import { meetingPrompt } from './prompts.js';
import { buildStories, factSheet } from './cluster.js';
import { cleanEvents, DeskError, rewriteArticle, moveArticle, spikeArticle } from './edition.js';
import { rewriteEditorial } from './evening.js';
import { hhmm, dayKey } from '../util.js';

const EVENING = /^sera-(\d{4}-\d{2}-\d{2})$/;
export const eveningThreadId = (day) => `sera-${day}`;

/** Il quadro della giornata: edizioni uscite, bozze, ora attuale, prossima uscita. */
function dayOverview(store, config, day) {
  const now = Date.now();
  const eds = store.editionsForDay(day, { drafts: true });
  const lines = eds.map((e) => `- ${hhmm(e.hour)}${e.start < e.hour ? ` (dalle ${hhmm(e.start)})` : ''}: ${e.status === 'draft' ? 'BOZZA, ' : ''}${e.total} segnali, apertura «${e.lead || '—'}»`);
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const evening = store.getEvening(day);
  const eh = config.edition.eveningHour;
  return [
    `QUADRO DELLA GIORNATA (${day}): adesso sono le ${hhmm(now)}.`,
    lines.length ? `Edizioni del giorno:\n${lines.join('\n')}` : 'Nessuna edizione oggi.',
    `L'edizione dell'ora in corso (${hhmm(next.getTime() - 3600e3)}) esce verso le ${hhmm(next.getTime())}: finché l'ora non è finita non esistono bozze per le ore successive.`,
    eh != null ? (evening ? `L'edizione della sera è uscita («${evening.editorial.headline}»).` : `L'edizione della sera esce alle ${String(eh).padStart(2, '0')}:00.`) : '',
  ].filter(Boolean).join('\n');
}

function context(store, config, threadId, articleId) {
  const m = EVENING.exec(threadId);
  if (m) {
    const ev = store.getEvening(m[1]);
    if (!ev) throw new DeskError('Edizione della sera non trovata', 404);
    const items = [
      `Editoriale: «${ev.editorial.headline}» — ${ev.editorial.oneliner}`,
      ev.editorial.body.map((p) => `  ${p}`).join('\n'),
      'Notizie del giorno:',
      ...ev.top.map((t) => `- [${t.section}, ore ${hhmm(t.hour)}] ${t.headline}`),
      `Vignetta: «${ev.cartoon?.caption}»`,
    ].join('\n');
    return { kind: 'evening', label: `l'edizione della sera del ${m[1]}`, items, articles: [], evening: ev, overview: dayOverview(store, config, m[1]) };
  }
  const ed = store.getEdition(threadId);
  if (!ed) throw new DeskError('Edizione non trovata', 404);
  const items = [
    `Il punto: ${ed.summary}`,
    'Articoli, in ordine di pagina:',
    ...ed.articles.map((a, i) => `- id «${a.id}» ${i === 0 ? '(APERTURA) ' : ''}[${a.section}, ${a.size || 'articolo'}, ${a.sources.length} fonti] ${a.headline} — ${a.dek || ''}\n    Testo: ${a.body.join(' ').slice(0, 320)}`),
    ed.spiked?.length ? `Cestinati: ${ed.spiked.map((a) => `«${a.headline}»`).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  let focus = null;
  if (articleId) {
    const a = ed.articles.find((x) => x.id === articleId);
    if (a) {
      const story = buildStories(cleanEvents(store.eventsBetween(ed.start, ed.end), config)).find((s) => s.id === articleId);
      focus = `«${a.headline}» (id ${a.id})\nTesto completo: ${a.body.join(' ')}${story ? `\nI FATTI da cui nasce:\n${factSheet(story)}` : ''}`;
    }
  }
  return { kind: 'edition', label: `l'edizione delle ${hhmm(ed.hour ?? ed.start)}`, items, articles: ed.articles, focus, edition: ed, overview: dayOverview(store, config, dayKey(ed.hour ?? ed.start)) };
}

/** Prova a leggere un frammento JSON, anche con virgole finali o virgolette "escapate" (\\"). */
function tryJson(chunk) {
  const variants = [chunk, chunk.replace(/,\s*([}\]])/g, '$1')];
  variants.push(...variants.map((v) => v.replace(/\\"/g, '"')));
  for (const v of variants) {
    try { return JSON.parse(v); } catch { /* prossima variante */ }
  }
  return null;
}

function normalizeActions(actions) {
  if (typeof actions === 'string') actions = tryJson(actions) ?? [];
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => (typeof a === 'string' ? tryJson(a) : a)).filter((a) => a && typeof a === 'object');
}

/** Estrae {reply, actions} anche da risposte imperfette dei modelli locali. */
export function parseReply(raw) {
  const text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(json)?/g, '').trim();
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) {
    const j = tryJson(text.slice(a, b + 1));
    if (j && typeof j.reply === 'string') return { reply: j.reply.trim(), actions: normalizeActions(j.actions) };
    // JSON rotto: recuperiamo i pezzi uno per uno
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
  // niente JSON: prendiamo il testo così com'è, senza azioni
  return { reply: text, actions: [] };
}

function validActions(actions, ctx) {
  const ids = new Set(ctx.articles.map((a) => a.id));
  const out = [];
  for (const x of actions.slice(0, 3)) {
    if (!x || typeof x !== 'object') continue;
    const t = x.type;
    if (ctx.kind === 'edition' && ['rewrite', 'lead', 'spike'].includes(t) && ids.has(x.article)) {
      if (t === 'rewrite' && !String(x.instruction || '').trim()) continue;
      out.push({ type: t, article: x.article, instruction: t === 'rewrite' ? String(x.instruction).trim().slice(0, 300) : undefined });
    } else if (t === 'note' && String(x.text || '').trim()) {
      out.push({ type: 'note', text: String(x.text).trim().slice(0, 300) });
    } else if (t === 'tone' && TONES[x.tone]) {
      out.push({ type: 'tone', tone: x.tone });
    } else if (t === 'editorial' && ctx.kind === 'evening') {
      out.push({ type: 'editorial', instruction: String(x.instruction || '').trim().slice(0, 300) });
    }
  }
  // etichette leggibili per l'interfaccia
  return out.map((x) => {
    const art = x.article && ctx.articles.find((a) => a.id === x.article);
    const title = art ? `«${art.headline.length > 60 ? art.headline.slice(0, 59) + '…' : art.headline}»` : '';
    const label = {
      rewrite: `Riscrivi ${title}: ${x.instruction}`,
      lead: `Metti in apertura ${title}`,
      spike: `Togli dall'edizione ${title}`,
      note: `Aggiungi alle note del direttore: «${x.text}»`,
      tone: `Cambia il tono in «${TONES[x.tone]?.label}»`,
      editorial: `Riscrivi l'editoriale${x.instruction ? `: ${x.instruction}` : ''}`,
    }[x.type];
    return { ...x, label, status: 'proposed' };
  });
}

/**
 * Ogni riunione è una sessione: il caporedattore ricorda solo i messaggi della sessione in corso.
 * Le sessioni precedenti restano nel thread, consultabili dall'interfaccia.
 */
export async function discuss({ store, config, threadId, text, articleId, session, log = console.log }) {
  const msg = String(text || '').trim().slice(0, 2000);
  if (!msg) throw new DeskError('Messaggio vuoto');
  const ctx = context(store, config, threadId, articleId);
  const llm = await connectLLM(config);
  if (!llm) throw new DeskError('Il caporedattore non risponde: il modello è spento o irraggiungibile.', 503);

  const thread = store.getThread(threadId);
  const line = getLine(store);
  const sid = Number(session) || 0;
  const history = sid ? thread.messages.filter((m) => m.session === sid) : thread.messages;
  const prompt = meetingPrompt({ ...ctx, line, history, text: msg });
  let raw;
  try {
    raw = await chat(llm, config, prompt, 2000);
  } catch (e) {
    log(`[riunione] ${e.message}`);
    throw new DeskError(`Il caporedattore non ha risposto: ${e.message}`, 502);
  }
  const { reply, actions } = parseReply(raw);
  const now = Date.now();
  // rilettura: nel frattempo potrebbe essere stata applicata un'azione
  const fresh = store.getThread(threadId);
  fresh.messages.push({ role: 'director', text: msg, articleId: articleId || null, ts: now, session: sid || undefined });
  fresh.messages.push({ role: 'editor', text: reply || '…', actions: validActions(actions, ctx), ts: Date.now(), model: llm.model, session: sid || undefined });
  store.saveThread(fresh);
  return fresh;
}


export async function applyAction({ store, config, threadId, msgIndex, actionIndex, log = console.log }) {
  const thread = store.getThread(threadId);
  const action = thread.messages[msgIndex]?.actions?.[actionIndex];
  if (!action) throw new DeskError('Azione non trovata', 404);
  if (action.status === 'applied') throw new DeskError('Azione già applicata', 409);

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
      default: throw new DeskError('Azione sconosciuta');
    }
  } catch (e) {
    action.error = e.message;
    store.saveThread(thread);
    throw e;
  }
  // rilettura: l'azione potrebbe aver richiesto tempo (riscrittura) e il thread nel frattempo è cambiato
  const fresh = store.getThread(threadId);
  const a = fresh.messages[msgIndex]?.actions?.[actionIndex];
  if (a) { a.status = 'applied'; a.appliedAt = Date.now(); delete a.error; }
  store.saveThread(fresh);
  return { thread: fresh, ...result };
}

/** Ripara i messaggi salvati prima che la lettura fosse tollerante (JSON rimasto come testo). */
export function getThreadRepaired(store, config, threadId) {
  const thread = store.getThread(threadId);
  let changed = false;
  for (const m of thread.messages) {
    if (m.role !== 'editor' || m.actions?.length || !m.text?.trim().startsWith('{')) continue;
    const { reply, actions } = parseReply(m.text);
    if (reply === m.text) continue;
    let ctx = null;
    try { ctx = context(store, config, threadId); } catch { /* edizione sparita */ }
    m.text = reply;
    m.actions = ctx ? validActions(actions, ctx) : [];
    changed = true;
  }
  if (changed) store.saveThread(thread);
  return thread;
}
