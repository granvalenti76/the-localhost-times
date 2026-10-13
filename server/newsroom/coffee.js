/**
 * The coffee machine: two writers on a break, talking about the day's work and about the Editor.
 * What they say comes from what happened (their pieces, the cuts, the ♥, the lessons, the
 * managing editor's grumbles, the readers' letters); the model only puts it in their mouths.
 * Without a model, the newsroom still gossips, from templates.
 */
import { tr, L } from '../i18n.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { getLine, featureOn } from './line.js';
import { staff } from './writers.js';
import { chiefView } from './chief.js';
import { lessonsOf } from './people.js';
import { DeskError } from './edition.js';
import { dayKey } from '../util.js';

const KEY = 'coffee';
const COOLDOWN = 8 * 60e3; // a break every few minutes at most: the same two would say the same things
const DAY = 24 * 3600e3;

const MOODS = { en: { inspired: 'in high spirits', fine: 'calm', low: 'a little low', offended: 'offended' }, it: { inspired: 'di ottimo umore', fine: 'tranquillo', low: 'un po\' giù', offended: 'offeso' } };

/** What each writer has to talk about: today's pieces, what the Editor did to them, what they learnt. */
function gossipOf(store, w, now) {
  const today = dayKey(now);
  const eds = store.editionsForDay(today, { full: true });
  const pieces = eds.flatMap((e) => e.articles.filter((a) => a.byline?.id === w.id).map((a) => a.headline)).slice(-3);
  const moves = store.getSetting('moods', []).filter((x) => x.w === w.id && now - x.at < DAY).map((x) => x.m);
  const count = (m) => moves.filter((x) => x === m).length;
  const lessons = lessonsOf(store, w.id).filter((x) => now - x.at < 3 * DAY).map((x) => x.text).slice(0, 2);
  return { pieces, likes: count('like'), passes: count('visto'), cuts: count('cut') + count('kill'), notes: count('note'), lessons };
}

function factsFor(store, a, b, now) {
  const mood = L(MOODS);
  const one = (w) => {
    const g = gossipOf(store, w, now);
    return tr({
      en: `${w.name} (${w.role}, ${mood[w.mood || 'fine']}${w.kind === 'intern' ? ', the intern' : ''}): today's pieces ${g.pieces.length ? g.pieces.map((x) => `“${x}”`).join(', ') : 'none'}; from the Editor today: ${g.likes} ♥, ${g.passes} passed, ${g.notes} sent back, ${g.cuts} cut${g.lessons.length ? `; recent lessons: ${g.lessons.join(' / ')}` : ''}.`,
      it: `${w.name} (${w.role}, ${mood[w.mood || 'fine']}${w.kind === 'intern' ? ', lo stagista' : ''}): pezzi di oggi ${g.pieces.length ? g.pieces.map((x) => `«${x}»`).join(', ') : 'nessuno'}; dal Direttore oggi: ${g.likes} ♥, ${g.passes} visti, ${g.notes} rimandati, ${g.cuts} tagli${g.lessons.length ? `; lezioni recenti: ${g.lessons.join(' / ')}` : ''}.`,
    });
  };
  const c = chiefView(store, now);
  const letters = store.letters({ limit: 10 }).filter((l) => l.reader && now - l.ts < DAY);
  return [
    one(a), one(b),
    tr({ en: `The managing editor, ${c.name}, ${c.moodText} (this week: agreed ${c.week.agreed} times, overruled ${c.week.overruled}).`, it: `Il caporedattore, ${c.name}, ${c.moodText} (questa settimana: d'accordo ${c.week.agreed} volte, scavalcato ${c.week.overruled}).` }),
    letters.length ? tr({ en: `Readers' letters today: ${letters.map((l) => `${l.signature} on “${l.about?.headline}”`).join('; ')}.`, it: `Lettere dei lettori oggi: ${letters.map((l) => `${l.signature} su «${l.about?.headline}»`).join('; ')}.` }) : '',
  ].filter(Boolean).join('\n');
}

/** Who goes for a coffee: preferably someone with something on their mind, and a colleague. */
function pair(line, now) {
  const people = Object.values(staff(line)).filter((w) => w.kind !== 'cartoonist' || Math.random() < 0.5);
  if (people.length < 2) return null;
  const weight = (w) => (w.mood === 'offended' || w.mood === 'inspired' ? 3 : w.mood === 'low' ? 2 : 1) + Math.random();
  const sorted = [...people].sort((x, y) => weight(y) - weight(x));
  const a = sorted[0];
  const rest = sorted.slice(1);
  const b = rest[Math.floor((now / 60e3) % rest.length)];
  return [a, b];
}

/** Templates for a break without a model. */
function typeset(store, a, b, now) {
  const ga = gossipOf(store, a, now);
  const fa = a.name.split(' ')[0];
  const c = chiefView(store, now);
  const lines = [];
  if (ga.cuts) lines.push({ who: a.id, text: tr({ en: `${ga.cuts === 1 ? 'One cut' : `${ga.cuts} cuts`} today. I'm counting them.`, it: `${ga.cuts === 1 ? 'Un taglio' : `${ga.cuts} tagli`} oggi. Li sto contando.` }) });
  else if (ga.likes) lines.push({ who: a.id, text: tr({ en: 'The Editor put a heart on my paragraph. I\'m not saying it changes everything. It changes everything.', it: 'Il Direttore ha messo un cuore sul mio paragrafo. Non dico che cambi tutto. Cambia tutto.' }) });
  else lines.push({ who: a.id, text: tr({ en: 'Quiet day. Suspiciously quiet.', it: 'Giornata tranquilla. Sospettosamente tranquilla.' }) });
  lines.push({ who: b.id, text: tr({ en: `${fa}, you know what they say: the Editor reads everything. Even the commas.`, it: `${fa}, lo sai: il Direttore legge tutto. Anche le virgole.` }) });
  lines.push({ who: a.id, text: c.week.overruled > c.week.agreed ? tr({ en: `And ${c.name} is fuming: overruled again.`, it: `E ${c.name} è nero: scavalcato un'altra volta.` }) : tr({ en: `At least ${c.name} seems happy.`, it: `Almeno ${c.name} sembra contento.` }) });
  lines.push({ who: b.id, text: tr({ en: `Back to the desk, ${fa}. The press doesn't wait.`, it: `Torniamo alla scrivania, ${fa}. La rotativa non aspetta.` }) });
  return { lines, by: 'typesetting', a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, at: now };
}

/** The last break (or a new one, if the last was a while ago). */
export async function coffeeBreak(store, config, { force = false, now = Date.now(), log = () => {} } = {}) {
  const line = getLine(store);
  if (!featureOn(line, 'coffee')) throw new DeskError(tr({ en: 'The coffee machine is switched off (Publishing House → Games).', it: 'La macchinetta è spenta (Casa Editrice → Giochi).' }), 409);
  const last = store.getSetting(KEY, null);
  if (last && !force && now - last.at < COOLDOWN) return last;
  const two = pair(line, now);
  if (!two) throw new DeskError(tr({ en: 'Nobody to have a coffee with.', it: 'Nessuno con cui prendere un caffè.' }), 409);
  const [a, b] = two;
  const llm = await connectLLM(config);
  let out = null;
  if (llm) {
    const msgs = [
      {
        role: 'system',
        content: tr({
          en: `You write a short scene at the coffee machine of The Localhost Times newsroom (the paper about its owner's Mac; the owner is "the Editor"). Two writers on a break: ${a.name} (A) and ${b.name} (B). 5 to 7 short lines, alternating, starting with A: they talk shop about today's work and about the Editor, with affection and a little gossip, never nasty. Use ONLY the facts below; don't invent pieces, numbers or events. Each line at most 25 words. English.
Reply ONLY with JSON: {"lines": [{"who": "A" | "B", "text": "…"}]}`,
          it: `Scrivi una breve scena alla macchinetta del caffè della redazione del «The Localhost Times» (il giornale del Mac del suo proprietario; il proprietario è «il Direttore»). Due redattori in pausa: ${a.name} (A) e ${b.name} (B). Da 5 a 7 battute brevi, alternate, comincia A: parlano del lavoro di oggi e del Direttore, con affetto e un po' di pettegolezzo, mai cattivi. Usa SOLO i fatti qui sotto; non inventare pezzi, numeri o eventi. Ogni battuta massimo 25 parole. Italiano.
Rispondi SOLO con JSON: {"lines": [{"who": "A" | "B", "text": "…"}]}`,
        }),
      },
      { role: 'user', content: factsFor(store, a, b, now) },
    ];
    try {
      const j = parseJson(await chat(llm, config, msgs, 900));
      const lines = (j.lines || []).map((x) => ({ who: x.who === 'B' ? b.id : a.id, text: String(x.text || '').trim().slice(0, 240) })).filter((x) => x.text).slice(0, 8);
      if (lines.length >= 3) out = { lines, by: llm.model, a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, at: now };
    } catch (e) {
      log(`[coffee] ${e.message}`);
    }
  }
  out ||= typeset(store, a, b, now);
  store.setSetting(KEY, out);
  return out;
}
