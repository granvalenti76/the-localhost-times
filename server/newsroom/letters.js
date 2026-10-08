/**
 * Letters to the editor: the reader (i.e. you) writes to the paper, the managing editor replies
 * with the day's data, and the letter appears in the next edition.
 */
import { connectLLM, chat, parseJson } from './llm.js';
import { getLine } from './line.js';
import { letterPrompt } from './prompts.js';
import { DeskError } from './edition.js';
import { dayKey, hhmm } from '../util.js';
import { tr } from '../i18n.js';

export function submitLetter(store, { text, signature }) {
  const t = String(text || '').trim();
  if (t.length < 3) throw new DeskError(tr({ en: 'The letter is empty.', it: 'La lettera è vuota.' }));
  return store.addLetter({
    ts: Date.now(),
    text: t.slice(0, 1500),
    signature: String(signature || '').trim().slice(0, 60) || tr({ en: 'A reader', it: 'Un lettore' }),
  });
}

/** The day's facts the newsroom can base its reply on. */
function dayFacts(store, day) {
  const eds = store.editionsForDay(day, { full: true });
  if (!eds.length) return tr({ en: `TODAY (${day}): no editions yet.`, it: `OGGI (${day}): ancora nessuna edizione.` });
  const total = eds.reduce((n, e) => n + (e.stats?.total || 0), 0);
  const heads = eds.flatMap((e) => e.articles.slice(0, 3).map((a) => `- ${hhmm(e.hour ?? e.start)} [${a.section}] ${a.headline}`)).slice(-18);
  const sites = new Map();
  for (const e of eds) for (const r of e.market?.rows || []) sites.set(r.site, (sites.get(r.site) || 0) + r.close);
  const top = [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s, n]) => `${s} ${n}`).join(', ');
  return tr({
    en: `TODAY (${day}): ${eds.length} editions, ${total} signals.\nThe day's headlines:\n${heads.join('\n')}\nMost visited sites: ${top || 'n/a'}`,
    it: `OGGI (${day}): ${eds.length} edizioni, ${total} segnali.\nTitoli della giornata:\n${heads.join('\n')}\nSiti più visitati: ${top || 'n.d.'}`,
  });
}

/** Has the newsroom reply. Returns the updated letter (or throws if the model is offline). */
export async function answerLetter(store, config, letter, log = console.log) {
  const llm = await connectLLM(config);
  if (!llm) throw new DeskError(tr({ en: 'The managing editor is not answering: the letter waits for the next edition.', it: 'Il caporedattore non risponde: la lettera resta in attesa della prossima edizione.' }), 503);
  let j;
  try {
    j = parseJson(await chat(llm, config, letterPrompt({ letter, overview: dayFacts(store, dayKey(Date.now())), line: getLine(store) }), 1500));
  } catch (e) {
    log(`[${tr({ en: 'letters', it: 'lettere' })}] ${e.message}`);
    throw new DeskError(tr({ en: `The managing editor gave a bad answer: ${e.message}`, it: `Il caporedattore ha risposto male: ${e.message}` }), 502);
  }
  if (typeof j.reply !== 'string' || !j.reply.trim()) throw new DeskError(tr({ en: 'The managing editor did not write an answer.', it: 'Il caporedattore non ha scritto la risposta.' }), 502);
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

/** At print time: answers pending letters and puts them on the page. */
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
      log(tr({ en: `[letters] letter ${l.id} waits: ${e.message}`, it: `[lettere] la lettera ${l.id} aspetta: ${e.message}` }));
    }
  }
  return out;
}

/** «Rispondi subito»: replies and publishes it in the latest edition out. */
export async function answerNow(store, config, id, log = console.log) {
  const letter = store.getLetter(Number(id));
  if (!letter) throw new DeskError(tr({ en: 'Letter not found', it: 'Lettera non trovata' }), 404);
  const answered = letter.reply ? letter : await answerLetter(store, config, letter, log);
  const ed = store.latestEdition();
  if (!ed) return answered;
  const published = { ...answered, status: 'published', editionId: ed.id };
  store.saveLetter(published);
  ed.letters = [published, ...(ed.letters || []).filter((x) => x.id !== published.id)].slice(0, 3);
  store.saveEdition(ed);
  return published;
}
