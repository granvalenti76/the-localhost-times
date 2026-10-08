/**
 * Lettere al direttore: il lettore (cioè tu) scrive al giornale, il caporedattore risponde
 * con i dati della giornata, e la lettera esce nella prossima edizione.
 */
import { connectLLM, chat, parseJson } from './llm.js';
import { getLine } from './line.js';
import { letterPrompt } from './prompts.js';
import { DeskError } from './edition.js';
import { dayKey, hhmm } from '../util.js';

export function submitLetter(store, { text, signature }) {
  const t = String(text || '').trim();
  if (t.length < 3) throw new DeskError('La lettera è vuota.');
  return store.addLetter({
    ts: Date.now(),
    text: t.slice(0, 1500),
    signature: String(signature || '').trim().slice(0, 60) || 'Un lettore',
  });
}

/** I fatti della giornata su cui la redazione può appoggiare la risposta. */
function dayFacts(store, day) {
  const eds = store.editionsForDay(day, { full: true });
  if (!eds.length) return `OGGI (${day}): ancora nessuna edizione.`;
  const total = eds.reduce((n, e) => n + (e.stats?.total || 0), 0);
  const heads = eds.flatMap((e) => e.articles.slice(0, 3).map((a) => `- ${hhmm(e.hour ?? e.start)} [${a.section}] ${a.headline}`)).slice(-18);
  const sites = new Map();
  for (const e of eds) for (const r of e.market?.rows || []) sites.set(r.site, (sites.get(r.site) || 0) + r.close);
  const top = [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s, n]) => `${s} ${n}`).join(', ');
  return `OGGI (${day}): ${eds.length} edizioni, ${total} segnali.\nTitoli della giornata:\n${heads.join('\n')}\nSiti più visitati: ${top || 'n.d.'}`;
}

/** Fa rispondere la redazione. Ritorna la lettera aggiornata (o lancia se il modello è spento). */
export async function answerLetter(store, config, letter, log = console.log) {
  const llm = await connectLLM(config);
  if (!llm) throw new DeskError('Il caporedattore non risponde: la lettera resta in attesa della prossima edizione.', 503);
  let j;
  try {
    j = parseJson(await chat(llm, config, letterPrompt({ letter, overview: dayFacts(store, dayKey(Date.now())), line: getLine(store) }), 1500));
  } catch (e) {
    log(`[lettere] ${e.message}`);
    throw new DeskError(`Il caporedattore ha risposto male: ${e.message}`, 502);
  }
  if (typeof j.reply !== 'string' || !j.reply.trim()) throw new DeskError('Il caporedattore non ha scritto la risposta.', 502);
  const answered = {
    ...letter,
    title: String(j.title || '').trim().replace(/(?<!\.)\.$/, '') || null,
    reply: j.reply.trim(),
    repliedAt: Date.now(),
    writer: llm.model,
    status: 'answered',
  };
  store.saveLetter(answered);
  return answered;
}

/** Al momento della stampa: risponde alle lettere in attesa e le mette in pagina. */
export async function lettersForEdition(store, config, editionId, log = console.log) {
  const pending = store.letters({ status: 'pending', limit: 2 }).reverse();
  const answered = store.letters({ status: 'answered', limit: 5 });
  const out = [];
  for (const l of [...answered, ...pending].slice(0, 2)) {
    try {
      const a = l.status === 'answered' ? l : await answerLetter(store, config, l, log);
      const published = { ...a, status: 'published', editionId };
      store.saveLetter(published);
      out.push(published);
    } catch (e) {
      log(`[lettere] la lettera ${l.id} aspetta: ${e.message}`);
    }
  }
  return out;
}

/** «Rispondi subito»: risponde e la pubblica nell'ultima edizione uscita. */
export async function answerNow(store, config, id, log = console.log) {
  const letter = store.getLetter(Number(id));
  if (!letter) throw new DeskError('Lettera non trovata', 404);
  const answered = letter.reply ? letter : await answerLetter(store, config, letter, log);
  const ed = store.latestEdition();
  if (!ed) return answered;
  const published = { ...answered, status: 'published', editionId: ed.id };
  store.saveLetter(published);
  ed.letters = [published, ...(ed.letters || []).filter((x) => x.id !== published.id)].slice(0, 3);
  store.saveEdition(ed);
  return published;
}
