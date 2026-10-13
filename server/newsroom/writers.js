/**
 * The newsroom's staff: invented bylines. The paper has one voice (voice.js): the bylines are
 * people on the staff, not different styles. Each section is assigned a writer; the columnist
 * also signs the Brief and the evening editorial. Names, roles and an optional deviation (one
 * line from the editor that shifts a writer's focus or attitude, never the register) can be
 * edited in the Newsroom (stored with the editorial line).
 */
import { L, tr } from '../i18n.js';

const ROSTER = {
  en: {
    web: { name: 'Nora Lake', role: 'web correspondent' },
    tech: { name: 'Walt Brenner', role: 'technology correspondent' },
    local: { name: 'Frank Doyle', role: 'city desk' },
    culture: { name: 'Julian Ashe', role: 'critic' },
    spotlight: { name: 'Ruth Calder', role: 'Spotlight editor' },
    columnist: { name: 'Margaret Holt', role: 'columnist' },
  },
  it: {
    web: { name: 'Elena Rossetti', role: 'inviata sul web' },
    tech: { name: 'Giulio Ferraris', role: 'cronista tecnico' },
    local: { name: 'Tonino Brera', role: 'cronaca locale' },
    culture: { name: 'Ottavio Lancia', role: 'critico' },
    spotlight: { name: 'Marta Vescovi', role: 'caporedattrice di Spotlight' },
    columnist: { name: 'Bice Cantoni', role: 'corsivista' },
  },
};

export const WRITER_IDS = ['web', 'tech', 'local', 'culture', 'columnist', 'spotlight'];

/** Who the Editor can hire, as the paper grows: an intern to train, a cartoonist, a special correspondent. */
export const HIRE_KINDS = ['intern', 'cartoonist', 'correspondent'];
/** A hire's kind: the three jobs, and the reporter an intern becomes once promoted. */
export const STAFF_KINDS = [...HIRE_KINDS, 'reporter'];
const HIRES = {
  en: {
    intern: { name: 'Sam Porter', role: 'intern' },
    cartoonist: { name: 'Max Penrose', role: 'cartoonist' },
    correspondent: { name: 'Clara Voss', role: 'special correspondent' },
  },
  it: {
    intern: { name: 'Pietro Gallo', role: 'stagista' },
    cartoonist: { name: 'Livia Sforza', role: 'vignettista' },
    correspondent: { name: 'Arturo Mancini', role: 'inviato speciale' },
  },
};
export const hireDefaults = (kind) => L(HIRES)[kind] || {};

/** People hired by the Editor have ids of their own ("h-…"); the founding staff keep theirs. */
export const isHire = (id) => /^h-/.test(String(id));

/** Who is on the staff now: the founding writers not fired, and the people hired since. */
export function rosterIds(line) {
  const custom = line?.staff || {};
  return [
    ...WRITER_IDS.filter((id) => !custom[id]?.fired),
    ...Object.keys(custom).filter((id) => isHire(id) && STAFF_KINDS.includes(custom[id]?.kind) && !custom[id].fired),
  ];
}

/** Founding writers the Editor let go (they can be taken back). */
export const firedIds = (line) => WRITER_IDS.filter((id) => line?.staff?.[id]?.fired);

export const DEFAULT_DESKS = {
  safari: 'web', terminal: 'tech', files: 'local', mail: 'local',
  notes: 'culture', journal: 'columnist', podcasts: 'culture', books: 'culture',
  apps: 'tech', photos: 'culture',
  brief: 'columnist', // the Brief and the evening editorial
  spotlight: 'spotlight', // the Spotlight desk's scoops
};

/**
 * The staff, with the editor's edits (names, roles, deviations, character) on top of the defaults,
 * and what the newsroom knows of each today (mood, lessons, level: `line.people`, see people.js).
 */
export function staff(line, { all = false } = {}) {
  const base = L(ROSTER);
  const custom = line?.staff || {};
  const people = line?.people || {};
  const ids = all ? [...rosterIds(line), ...firedIds(line)] : rosterIds(line);
  return Object.fromEntries(ids.map((id) => {
    const kind = isHire(id) ? custom[id].kind : 'writer';
    return [id, { id, kind, ...(isHire(id) ? hireDefaults(kind) : base[id]), ...(custom[id] || {}), ...(people[id] || {}) }];
  }));
}

/** Who writes a section ('' or someone no longer on the staff = unsigned: "the newsroom"). */
export function writerFor(line, source) {
  const desks = { ...DEFAULT_DESKS, ...(line?.desks || {}) };
  const id = desks[source];
  if (!id) return null;
  return staff(line)[id] || null;
}

/** The hired cartoonist, the special correspondent (or null). */
const hired = (line, kind) => Object.values(staff(line)).find((w) => w.kind === kind) || null;
export const cartoonist = (line) => hired(line, 'cartoonist');
export const correspondent = (line) => hired(line, 'correspondent');

/** Who signs the Brief and the evening editorial (if their desk is empty, the first writer on the staff). */
export const columnist = (line) => writerFor(line, 'brief') || Object.values(staff(line)).find((w) => w.kind === 'writer') || null;

/**
 * A writer's character, set with four dials in the Publishing House (0–4, 2 = the house's own
 * measure, which adds nothing). Each dial off the middle becomes one line of the persona.
 */
const TRAIT_LINES = {
  en: {
    irony: ['Keep irony out: earnest and plain.', 'Go easy on irony: one light touch at most.', null, 'Be sharper than the house: a dry jab where the facts allow it.', 'Be openly mocking (never cruel): the funniest true reading of the facts.'],
    pace: ['Telegraphic: very short sentences, no subordinate clauses.', 'Brisk: short sentences, few clauses.', null, 'Unhurried: let a sentence breathe when the fact deserves it.', 'Expansive: long, well-built sentences, a scene before the fact.'],
    numbers: ['Avoid figures: say "a few", "many" unless a number is the news.', 'Few figures: one per piece unless more are the point.', null, 'Notice the numbers: the right count often makes the story.', 'Count everything worth counting: the piece leans on its figures (only those in the facts).'],
    ending: ['End on a quiet, melancholy note.', 'End open, on a detail that lingers.', null, 'End on a dry, ironic line.', 'End on a one-line punch: the last fact, said sharply.'],
  },
  it: {
    irony: ['Niente ironia: serio e piano.', 'Ironia col contagocce: al massimo un tocco leggero.', null, 'Più tagliente della casa: una frecciata asciutta dove i fatti lo permettono.', 'Apertamente beffardo (mai cattivo): la lettura più divertente e vera dei fatti.'],
    pace: ['Telegrafico: frasi brevissime, niente subordinate.', 'Asciutto: frasi brevi, poche subordinate.', null, 'Disteso: lascia respirare la frase quando il fatto lo merita.', 'Arioso: frasi lunghe e ben costruite, una scena prima del fatto.'],
    numbers: ['Evita le cifre: «qualche», «molti», a meno che il numero sia la notizia.', 'Poche cifre: una per pezzo, salvo che siano il punto.', null, 'Nota i numeri: il conteggio giusto spesso fa la storia.', 'Conta tutto ciò che vale la pena contare: il pezzo si regge sulle cifre (solo quelle nei fatti).'],
    ending: ['Chiudi su una nota quieta, malinconica.', 'Chiudi aperto, su un dettaglio che resta.', null, 'Chiudi con una riga secca e ironica.', 'Chiudi con una battuta di una riga: l\'ultimo fatto, detto secco.'],
  },
};

/** The lines a writer's dials add to the persona (none when every dial is in the middle). */
export function traitLines(traits) {
  const lines = L(TRAIT_LINES);
  return Object.entries(traits || {}).map(([k, v]) => lines[k]?.[v]).filter(Boolean);
}

const MOOD_PROMPT = {
  inspired: { en: 'TODAY YOU ARE INSPIRED (the Editor liked your work): you may allow yourself one more observation, always on the facts.', it: 'OGGI SEI ISPIRATO (al Direttore è piaciuto il tuo lavoro): puoi concederti un\'osservazione in più, sempre sui fatti.' },
  low: { en: 'TODAY YOU ARE A LITTLE LOW: write clean and safe, no risks.', it: 'OGGI SEI UN PO\' GIÙ: scrivi pulito e sicuro, senza rischi.' },
  offended: { en: 'TODAY YOU ARE A LITTLE OFFENDED (the Editor cut your work): write shorter and drier, no frills.', it: 'OGGI SEI UN PO\' OFFESO (il Direttore ti ha tagliato): scrivi più corto e asciutto, senza fronzoli.' },
};

/** The lines added to the writer's instructions: who you are, your character, your mood, what the Editor taught you, the deviation. */
export function personaPrompt(w) {
  if (!w) return '';
  const dev = String(w.deviation || '').trim();
  const traits = traitLines(w.traits);
  const mood = MOOD_PROMPT[w.mood] ? tr(MOOD_PROMPT[w.mood]) : '';
  const lessons = (w.lessons || []).slice(0, 8);
  const intern = w.kind === 'intern'
    ? tr({ en: '\nYOU ARE THE INTERN: you are learning the trade and the Editor reads everything you write. Follow their lessons to the letter.', it: '\nSEI LO STAGISTA: stai imparando il mestiere e il Direttore legge tutto quello che scrivi. Segui le sue lezioni alla lettera.' })
    : '';
  return tr({
    en: `\nYOUR BYLINE: you are ${w.name}, ${w.role} of the paper. You write in the house voice; don't sign the text and don't mention your name.${intern}${traits.length ? `\nYOUR CHARACTER (set by the editor): ${traits.join(' ')}` : ''}${mood ? `\n${mood}` : ''}${lessons.length ? `\nWHAT THE EDITOR TAUGHT YOU (from their corrections):\n${lessons.map((x) => `- ${x}`).join('\n')}` : ''}${dev ? `\nYOUR DEVIATION (from the editor): ${dev} It shifts what you notice and your attitude, never the house register or the rules about facts.` : ''}`,
    it: `\nLA TUA FIRMA: sei ${w.name}, ${w.role} del giornale. Scrivi nella voce della casa; non firmare il testo e non nominarti.${intern}${traits.length ? `\nIL TUO CARATTERE (deciso dal direttore): ${traits.join(' ')}` : ''}${mood ? `\n${mood}` : ''}${lessons.length ? `\nCIÒ CHE IL DIRETTORE TI HA INSEGNATO (dalle sue correzioni):\n${lessons.map((x) => `- ${x}`).join('\n')}` : ''}${dev ? `\nLA TUA DEVIAZIONE (decisa dal direttore): ${dev} Sposta cosa noti e il tuo atteggiamento, mai il registro della casa né le regole sui fatti.` : ''}`,
  });
}

/** What the page shows under the headline. */
export const byline = (w) => (w ? { id: w.id, name: w.name, role: w.role } : null);

/**
 * The editor's taste: paragraphs they marked as good (to imitate the pace, not the content) or as
 * bad (to avoid), for this writer first and then for the whole staff. A few lines, never more.
 */
export function tastePrompt(line, w) {
  const t = line?.taste;
  if (!t) return '';
  const pick = (list) => {
    const mine = (list || []).filter((x) => w && x.writer === w.id);
    const rest = (list || []).filter((x) => !w || x.writer !== w.id);
    return [...mine, ...rest].slice(0, 3).map((x) => String(x.text).slice(0, 320));
  };
  const liked = pick(t.liked);
  const disliked = pick(t.disliked);
  if (!liked.length && !disliked.length) return '';
  const q = (s) => tr({ en: `“${s}”`, it: `«${s}»` });
  const parts = [];
  if (liked.length) parts.push(tr({ en: 'PARAGRAPHS THE EDITOR LIKED (imitate the pace and the kind of observation, never the content):', it: 'PARAGRAFI CHE IL DIRETTORE HA APPREZZATO (imita il passo e il tipo di osservazione, mai il contenuto):' }), ...liked.map((x) => `- ${q(x)}`));
  if (disliked.length) parts.push(tr({ en: 'PARAGRAPHS THE EDITOR DISLIKED (don\'t write like this):', it: 'PARAGRAFI CHE IL DIRETTORE NON HA APPREZZATO (non scrivere così):' }), ...disliked.map((x) => `- ${q(x)}`));
  return `\n${parts.join('\n')}`;
}

/** The editor-in-chief as a byline, for the pieces they write themselves. */
export function directorByline(line) {
  return {
    id: 'director',
    name: line?.directorName || tr({ en: 'The Editor', it: 'Il Direttore' }),
    role: tr({ en: 'editor-in-chief', it: 'direttore' }),
  };
}
