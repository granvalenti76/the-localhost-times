/**
 * The readers: a handful of regulars who write to the paper about the pieces they read. Each has a
 * character and a memory (their last letter, and what the Editor did with it). After an edition is
 * printed, one of them may write about one of its pieces; the letter lands in the Editor's mailbox,
 * and the Editor decides: publish it (the managing editor answers), answer it in person, or bin it.
 * The writer of the piece hears about it.
 */
import { tr, L } from '../i18n.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { DeskError } from './edition.js';
import { getLine, featureOn } from './line.js';
import { staff } from './writers.js';
import { say } from './chatter.js';
import { nudge } from './people.js';
import { dayKey } from '../util.js';

const MAX_INBOX = 3;   // unread letters at most: the regulars don't flood the mailbox
const MAX_A_DAY = 3;

const CAST = {
  en: [
    { id: 'pedant', name: 'Prof. Edmund Hale', from: 'Oxford', character: 'a retired schoolmaster, a pedant: he notices a word out of place, a figure that doesn\'t add up, a cliché; courteous and merciless' },
    { id: 'fan', name: 'Dot Mercer', from: 'Leeds', character: 'a devoted reader who reads every edition with her morning tea; warm, a little sentimental, she has favourite bylines and says so' },
    { id: 'grump', name: 'Eng. Carl Webb', from: 'Swindon', character: 'an engineer who finds the paper frivolous: he wants numbers, hard facts, fewer jokes; grumpy but loyal, he never cancels his subscription' },
    { id: 'young', name: 'Mia, 17', from: 'Brighton', character: 'a teenager who discovered the paper by chance; ironic, quick, writes short, catches the absurd' },
    { id: 'rival', name: 'A colleague from The Remote Gazette', from: '', character: 'a journalist from a rival paper: envious, sly compliments, points out what they would have done better' },
  ],
  it: [
    { id: 'pedant', name: 'Prof. Anselmo Bertoli', from: 'Pavia', character: 'professore di liceo in pensione, pignolo: nota la parola fuori posto, il numero che non torna, la frase fatta; cortese e implacabile' },
    { id: 'fan', name: 'Gina Fabbri', from: 'Rovereto', character: 'lettrice affezionatissima che legge ogni edizione con il caffellatte; calorosa, un po\' sentimentale, ha le sue firme preferite e lo dice' },
    { id: 'grump', name: 'Ing. Carlo Mezzadri', from: 'Lodi', character: 'ingegnere che trova il giornale frivolo: vuole numeri, fatti duri, meno battute; brontolone ma fedele, non disdice mai l\'abbonamento' },
    { id: 'young', name: 'Lia, 17 anni', from: 'Bari', character: 'studentessa che ha scoperto il giornale per caso; ironica, veloce, scrive corto, coglie l\'assurdo' },
    { id: 'rival', name: 'Un collega della «Gazzetta del Cloud»', from: '', character: 'giornalista di un giornale rivale: invidioso, complimenti obliqui, fa notare cosa avrebbe fatto meglio' },
  ],
};
export const cast = () => L(CAST);

const seedOf = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11);

/** The reader's history with the paper: their last letter and what the Editor did with it. */
function memoryOf(store, readerId) {
  const mine = store.letters({ limit: 200 }).filter((l) => l.reader === readerId);
  const last = mine[0];
  if (!last) return '';
  const fate = { published: tr({ en: 'it was published', it: 'è stata pubblicata' }), binned: tr({ en: 'the Editor binned it', it: 'il Direttore l\'ha cestinata' }), inbox: tr({ en: 'no answer yet', it: 'ancora nessuna risposta' }), pending: tr({ en: 'it is about to be published', it: 'sta per essere pubblicata' }), answered: tr({ en: 'it is about to be published', it: 'sta per essere pubblicata' }) }[last.status] || '';
  const byEditor = last.replyBy === 'editor' ? tr({ en: ' (the Editor answered in person)', it: ' (il Direttore ha risposto di persona)' }) : '';
  return tr({
    en: `\nYOUR LAST LETTER (${mine.length} so far): “${last.text.slice(0, 220)}” — ${fate}${byEditor}. You may refer to it, if it comes naturally.`,
    it: `\nLA TUA ULTIMA LETTERA (${mine.length} finora): «${last.text.slice(0, 220)}» — ${fate}${byEditor}. Puoi farci riferimento, se viene naturale.`,
  });
}

/** Which piece a reader writes about: one the Editor liked, or the lead. */
function pickPiece(ed) {
  const liked = ed.articles.filter((a) => a.byline && Object.values(a.marks || {}).includes('like'));
  const signed = ed.articles.filter((a) => a.byline && a.body?.length);
  return liked[0] || signed[0] || null;
}

/**
 * After the press: perhaps a reader writes about a piece of the edition. At most one letter per
 * edition, three a day, three unread at a time; never without a model.
 */
export async function readersRound(store, config, editionId, { log = () => {}, now = Date.now() } = {}) {
  const line = getLine(store);
  if (!featureOn(line, 'readers')) return null;
  const ed = store.getEdition(editionId);
  if (!ed?.articles?.length) return null;
  const letters = store.letters({ limit: 60 });
  if (letters.filter((l) => l.status === 'inbox').length >= MAX_INBOX) return null;
  if (letters.filter((l) => l.reader && dayKey(l.ts) === dayKey(now)).length >= MAX_A_DAY) return null;
  if (letters.some((l) => l.about?.editionId === editionId)) return null;
  const a = pickPiece(ed);
  if (!a) return null;
  const llm = await connectLLM(config);
  if (!llm) return null;
  // the regular who wrote least recently writes next (with a little chance in it)
  const list = cast();
  const lastBy = (id) => letters.find((l) => l.reader === id)?.ts || 0;
  const reader = [...list].sort((x, y) => lastBy(x.id) - lastBy(y.id) || (seedOf(editionId + x.id) % 7) - (seedOf(editionId + y.id) % 7))[0];
  const msgs = [
    {
      role: 'system',
      content: tr({
        en: `You are ${reader.name}${reader.from ? `, from ${reader.from}` : ''}, a regular reader of The Localhost Times (the paper that tells what happens on its owner's Mac). Your character: ${reader.character}. Write a letter to the editor about the piece below, 40 to 90 words: react to one precise detail of it (a sentence, a word, a fact), in your own voice. No greetings formula at the end, no signature. Never invent facts about the owner beyond the piece.${memoryOf(store, reader.id)}
Reply ONLY with JSON: {"text": "the letter", "tone": "praise" | "complaint" | "other"}`,
        it: `Sei ${reader.name}${reader.from ? `, da ${reader.from}` : ''}, lettore abituale del «The Localhost Times» (il giornale che racconta ciò che succede sul Mac del suo proprietario). Il tuo carattere: ${reader.character}. Scrivi una lettera al direttore sul pezzo qui sotto, da 40 a 90 parole: reagisci a un dettaglio preciso (una frase, una parola, un fatto), con la tua voce. Niente formule di saluto in fondo, niente firma. Non inventare fatti sul proprietario oltre al pezzo.${memoryOf(store, reader.id)}
Rispondi SOLO con JSON: {"text": "la lettera", "tone": "praise" | "complaint" | "other"}`,
      }),
    },
    { role: 'user', content: `${a.section} · ${a.byline.name}\n${a.headline}\n${a.dek || ''}\n\n${a.body.join('\n\n')}` },
  ];
  let j;
  try { j = parseJson(await chat(llm, config, msgs, 900)); } catch (e) { log(`[readers] ${e.message}`); return null; }
  const text = String(j?.text || '').trim();
  if (text.length < 20) return null;
  const letter = store.addLetter({
    ts: now,
    text: text.slice(0, 900),
    signature: reader.from ? `${reader.name}, ${reader.from}` : reader.name,
    reader: reader.id,
    tone: ['praise', 'complaint'].includes(j.tone) ? j.tone : 'other',
    about: { editionId, articleId: a.id, headline: a.headline, writer: a.byline },
  });
  store.saveLetter({ ...letter, status: 'inbox' });
  say(store, 'desk', tr({ en: `Mail: ${reader.name} wrote about “${a.headline}”.`, it: `Posta: ${reader.name} ha scritto su «${a.headline}».` }), now);
  return letter;
}

/**
 * The Editor's decision on a reader's letter: 'publish' (the managing editor answers it at the next
 * press), 'reply' (the Editor answers in person: it goes out as it is), or 'bin'. A published
 * letter about a piece reaches its writer: praise cheers them up, a complaint stings.
 */
export function decideLetter(store, id, { action, reply = '' } = {}) {
  const l = store.getLetter(Number(id));
  if (!l || l.status !== 'inbox') throw new DeskError(tr({ en: 'That letter is not in the mailbox.', it: 'Questa lettera non è nella posta.' }), 404);
  if (action === 'bin') { store.saveLetter({ ...l, status: 'binned', decidedAt: Date.now() }); return store.getLetter(l.id); }
  if (action !== 'publish' && action !== 'reply') throw new DeskError(tr({ en: 'Publish, reply or bin.', it: 'Pubblica, rispondi o cestina.' }), 400);
  const text = String(reply || '').trim().slice(0, 900);
  if (action === 'reply' && !text) throw new DeskError(tr({ en: 'Write your answer.', it: 'Scrivi la tua risposta.' }), 400);
  const next = action === 'reply'
    ? { ...l, status: 'answered', reply: text, replyBy: 'editor', repliedAt: Date.now(), title: null }
    : { ...l, status: 'pending' };
  store.saveLetter(next);
  const w = l.about?.writer && staff(getLine(store))[l.about.writer.id];
  if (w) {
    nudge(store, w, l.tone === 'praise' ? 'like' : l.tone === 'complaint' ? 'note' : null);
    const first = w.name.split(' ')[0];
    say(store, w.id, l.tone === 'complaint'
      ? tr({ en: `${first}: a reader is complaining about my piece. In print, too.`, it: `${first}: un lettore si lamenta del mio pezzo. E il Direttore la pubblica pure.` })
      : tr({ en: `${first}: a reader wrote about my piece! I'm framing it.`, it: `${first}: un lettore ha scritto del mio pezzo! Me la incornicio.` }));
  }
  return store.getLetter(l.id);
}

/** The mailbox: the readers' letters waiting for the Editor. */
export const mailbox = (store) => store.letters({ status: 'inbox', limit: 20 });
