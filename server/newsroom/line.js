/**
 * The editorial line: chosen by the editor-in-chief (you) in the Newsroom.
 * Stored in the database, read at every edition.
 */
import { L, tr } from '../i18n.js';
import { DEFAULT_DESKS, WRITER_IDS } from './writers.js';

const TONE_TEXT = {
  en: {
    dry: { label: 'Dry', hint: 'A serious paper, rare irony', prompt: 'Dry, precise tone. Irony is rare and understated.' },
    ironic: { label: 'Ironic', hint: 'One joke per paragraph', prompt: 'Ironic tone: allow yourself one joke per paragraph, always grounded in the facts, never mean.' },
    satirical: { label: 'Satirical', hint: 'A column on manners', prompt: 'The tone of a satirical column on manners: gently exaggerate the owner\'s small manias, like an old-school columnist. Never offensive, never vulgar.' },
    british: { label: 'Understatement', hint: 'British calm', prompt: 'British understatement: everything is "rather", "not entirely negligible". Olympian calm even in front of a hundred and sixty visits to the same site.' },
    tabloid: { label: 'Tabloid', hint: 'Yellow press, for fun', prompt: 'For fun, old-fashioned tabloid style: punchy headlines, "SHOCK", "REVEALED", exclamation marks allowed in headlines. The body stays short and the facts stay true.' },
  },
  it: {
    dry: { label: 'Asciutto', hint: 'Quotidiano serio, ironia rara', prompt: 'Tono asciutto e preciso. Ironia rara, di sottrazione.' },
    ironic: { label: 'Ironico', hint: 'Una battuta per paragrafo', prompt: 'Tono ironico: concediti una battuta per paragrafo, sempre fondata sui fatti, mai cattiva.' },
    satirical: { label: 'Satirico', hint: 'Corsivo di costume', prompt: 'Tono da corsivo satirico di costume: esagera con garbo le piccole manie del proprietario, come un corsivista d\'altri tempi. Mai offensivo, mai volgare.' },
    british: { label: 'Understatement', hint: 'Calma britannica', prompt: 'Understatement britannico: tutto è «piuttosto», «non del tutto trascurabile». Calma olimpica anche davanti a centosessanta visite allo stesso sito.' },
    tabloid: { label: 'Strillone', hint: 'Tabloid, per gioco', prompt: 'Per gioco, stile da tabloid d\'altri tempi: titoli a effetto, «CLAMOROSO», «ECCO», punti esclamativi ammessi nei titoli. Il corpo resta breve e i fatti restano veri.' },
  },
};

const lazy = (ids, text) => Object.fromEntries(ids.map((id) => [id, {
  get label() { return L(text)[id].label; },
  get hint() { return L(text)[id].hint; },
  get prompt() { return L(text)[id].prompt; },
}]));

export const TONES = lazy(['dry', 'ironic', 'satirical', 'british', 'tabloid'], TONE_TEXT);

const LENGTH_LABELS = { en: { short: 'Short', standard: 'Standard', long: 'Long' }, it: { short: 'Corti', standard: 'Standard', long: 'Lunghi' } };
const FACTORS = { short: 0.65, standard: 1, long: 1.5 };
export const LENGTHS = Object.fromEntries(Object.keys(FACTORS).map((id) => [id, {
  factor: FACTORS[id],
  get label() { return L(LENGTH_LABELS)[id]; },
}]));

export const WEIGHTS = [
  { value: 0, get label() { return tr({ en: 'Hidden', it: 'Nascosta' }); } },
  { value: 0.5, label: '−' },
  { value: 1, label: '=' },
  { value: 1.6, label: '+' },
  { value: 2.5, label: '++' },
];

// ids used before the paper became bilingual
const OLD_TONES = { asciutto: 'dry', ironico: 'ironic', satirico: 'satirical', strillone: 'tabloid' };
const OLD_LENGTHS = { corti: 'short', lunghi: 'long' };
export const toneId = (t) => OLD_TONES[t] || (TONES[t] ? t : 'dry');
export const isTone = (t) => !!(OLD_TONES[t] || TONES[t]);
export const lengthId = (l) => OLD_LENGTHS[l] || (FACTORS[l] ? l : 'standard');

export const DEFAULT_LINE = {
  tone: 'dry',
  length: 'standard',
  autoPublish: true,
  photos: true,
  notes: '',
  sectionWeights: { safari: 1, mail: 1, terminal: 1, files: 1, notes: 1, journal: 1, podcasts: 1, books: 1 },
  desks: { ...DEFAULT_DESKS }, // who writes each section ('' = unsigned)
  staff: {},                   // the editor's edits to the bylines: { web: { name, role, style } }
};

export function getLine(store) {
  const saved = store.getSetting('line', {});
  const line = {
    ...DEFAULT_LINE,
    ...saved,
    sectionWeights: { ...DEFAULT_LINE.sectionWeights, ...(saved.sectionWeights || {}) },
    desks: { ...DEFAULT_LINE.desks, ...(saved.desks || {}) },
    staff: { ...(saved.staff || {}) },
  };
  line.tone = toneId(line.tone);
  line.length = lengthId(line.length);
  return line;
}

export function saveLine(store, patch) {
  const cur = getLine(store);
  const next = { ...cur, ...patch, sectionWeights: { ...cur.sectionWeights, ...(patch.sectionWeights || {}) } };
  next.tone = toneId(next.tone);
  next.length = lengthId(next.length);
  next.notes = String(next.notes || '').slice(0, 2000);
  next.autoPublish = !!next.autoPublish;
  next.photos = !!next.photos;
  next.desks = { ...cur.desks, ...(patch.desks || {}) };
  for (const [k, v] of Object.entries(next.desks)) if (v !== '' && !WRITER_IDS.includes(v)) next.desks[k] = DEFAULT_DESKS[k] ?? '';
  next.staff = { ...cur.staff, ...(patch.staff || {}) };
  for (const id of Object.keys(next.staff)) {
    if (!WRITER_IDS.includes(id)) { delete next.staff[id]; continue; }
    const w = next.staff[id] || {};
    next.staff[id] = Object.fromEntries(['name', 'role', 'style']
      .map((k) => [k, String(w[k] ?? '').trim().slice(0, k === 'style' ? 400 : 60)])
      .filter(([, v]) => v));
  }
  for (const [k, v] of Object.entries(next.sectionWeights)) {
    next.sectionWeights[k] = Math.max(0, Math.min(3, Number(v) || 0));
  }
  store.setSetting('line', next);
  return next;
}

/** The block appended to the writer's instructions. */
export function linePrompt(line) {
  const tone = TONES[toneId(line.tone)].prompt;
  const parts = [tr({
    en: `\nTHE EDITOR-IN-CHIEF'S EDITORIAL LINE (overrides the style guidance above, not the rules about facts):\n- ${tone}`,
    it: `\nLINEA EDITORIALE DELLA DIREZIONE (prevale sulle indicazioni di stile qui sopra, non su quelle sui fatti):\n- ${tone}`,
  })];
  if (line.notes?.trim()) parts.push(tr({ en: `- Editor's notes: ${line.notes.trim()}`, it: `- Note del direttore: ${line.notes.trim()}` }));
  return parts.join('\n');
}
