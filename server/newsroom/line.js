/**
 * The editorial line: chosen by the editor-in-chief (you) in the Newsroom.
 * Stored in the database, read at every edition. The voice is one, the house's (voice.js, from
 * docs/STYLE.md): the line decides the length, the room for each section, the bylines and the
 * editor's notes, not the tone.
 */
import { L, tr } from '../i18n.js';
import { DEFAULT_DESKS, WRITER_IDS, STAFF_KINDS, isHire, rosterIds } from './writers.js';
import { peopleOf } from './people.js';
import { setChief, cleanChief } from './chief.js';
import { voicePrompt } from './voice.js';
import { cadenceOf } from './cadence.js';

const LENGTH_LABELS = { en: { short: 'Short', standard: 'Standard', long: 'Long' }, it: { short: 'Corti', standard: 'Standard', long: 'Lunghi' } };
const FACTORS = { short: 0.8, standard: 1, long: 1.25 };
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
const OLD_LENGTHS = { corti: 'short', lunghi: 'long' };
export const lengthId = (l) => OLD_LENGTHS[l] || (FACTORS[l] ? l : 'standard');

/** The editor's part and the games, all on by default. */
export const FEATURE_IDS = ['tips'];
export const DEFAULT_FEATURES = Object.fromEntries(FEATURE_IDS.map((id) => [id, true]));

/** Is a feature on in this editorial line? */
export const featureOn = (line, id) => line?.features?.[id] !== false;

export const DEFAULT_LINE = {
  length: 'standard',
  autoPublish: true,
  photos: true,
  notes: '',
  sectionWeights: { safari: 1, mail: 1, terminal: 1, files: 1, apps: 1, notes: 1, journal: 1, podcasts: 1, books: 1, photos: 1 },
  desks: { ...DEFAULT_DESKS }, // who writes each section ('' = unsigned)
  staff: {},                   // the editor's edits to the bylines: { web: { name, role, style } }
  // the editor's part in the paper and the paper's games: each can be turned off in the Newsroom
  features: { ...DEFAULT_FEATURES },
  directorName: '',            // how the editor signs their own pieces ('' = "The Editor")
  cadence: { kind: 'hourly', pressHour: 19, weekday: 0 }, // how often the paper comes out (cadence.js)
  wires: {},                   // per source: 'full' (default), 'titles' (no contents) or 'off'
  strictness: 'balanced',      // how picky the meeting is: 'loose', 'balanced', 'strict'
  manual: {},                  // the Editor's own version of some layers of the writers' instructions (manual.js)
};

export const WIRE_MODES = ['full', 'titles', 'off'];
export const STRICTNESS = ['loose', 'balanced', 'strict'];
/** A writer's character: four dials from 0 to 4, 2 is the house's default. */
export const TRAITS = ['irony', 'pace', 'numbers', 'ending'];
export const MANUAL_LAYERS = ['how', 'voice', 'headlines', 'examples'];

export function getLine(store) {
  const saved = store.getSetting('line', {});
  const line = {
    ...DEFAULT_LINE,
    ...saved,
    sectionWeights: { ...DEFAULT_LINE.sectionWeights, ...(saved.sectionWeights || {}) },
    desks: { ...DEFAULT_LINE.desks, ...(saved.desks || {}) },
    staff: { ...(saved.staff || {}) },
    features: { ...DEFAULT_FEATURES, ...(saved.features || {}) },
    wires: { ...(saved.wires || {}) },
    manual: { ...(saved.manual || {}) },
  };
  line.cadence = cadenceOf(saved);
  line.chief = cleanChief(saved.chief);
  setChief(line.chief); // the desk reads the managing editor from here
  // what the editor liked and disliked: examples for the writers (kept apart from the line itself)
  line.taste = store.getSetting('taste', null);
  // and what the newsroom knows of each writer today: mood, lessons, level (people.js)
  try { line.people = peopleOf(store); } catch { line.people = {}; }
  delete line.tone; // the tones of older versions: the paper has one voice now
  for (const w of Object.values(line.staff)) migrateWriter(w);
  line.length = lengthId(line.length);
  return line;
}

export function saveLine(store, patch) {
  const cur = getLine(store);
  const next = { ...cur, ...patch, sectionWeights: { ...cur.sectionWeights, ...(patch.sectionWeights || {}) } };
  delete next.tone;
  next.length = lengthId(next.length);
  next.notes = String(next.notes || '').slice(0, 2000);
  next.autoPublish = !!next.autoPublish;
  next.photos = !!next.photos;
  next.features = Object.fromEntries(FEATURE_IDS.map((id) => [id, (patch.features || {})[id] ?? cur.features[id] ?? true].map((v, i) => (i ? !!v : v))));
  next.directorName = String(next.directorName || '').trim().slice(0, 60);
  next.cadence = cadenceOf({ cadence: { ...cur.cadence, ...(patch.cadence || {}) } });
  next.chief = cleanChief({ ...cur.chief, ...(patch.chief || {}) });
  setChief(next.chief);
  next.wires = { ...cur.wires, ...(patch.wires || {}) };
  for (const [k, v] of Object.entries(next.wires)) if (!WIRE_MODES.includes(v) || v === 'full') delete next.wires[k];
  if (!STRICTNESS.includes(next.strictness)) next.strictness = 'balanced';
  next.manual = { ...cur.manual, ...(patch.manual || {}) };
  for (const k of Object.keys(next.manual)) {
    const v = String(next.manual[k] ?? '').trim().slice(0, 8000);
    if (!MANUAL_LAYERS.includes(k) || !v) delete next.manual[k]; else next.manual[k] = v;
  }
  delete next.taste;
  delete next.people;
  // each writer is patched on its own: a change of name keeps their character, a hire keeps its kind; null removes a hire
  next.staff = { ...cur.staff };
  for (const [id, w] of Object.entries(patch.staff || {})) {
    if (w === null) delete next.staff[id]; else next.staff[id] = { ...(cur.staff[id] || {}), ...w };
  }
  for (const id of Object.keys(next.staff)) {
    const hire = isHire(id);
    if (!WRITER_IDS.includes(id) && !(hire && STAFF_KINDS.includes(next.staff[id]?.kind))) { delete next.staff[id]; continue; }
    const w = migrateWriter({ ...(next.staff[id] || {}) });
    const traits = Object.fromEntries(TRAITS.map((k) => [k, Math.max(0, Math.min(4, Math.round(Number(w.traits?.[k] ?? 2))))]).filter(([, v]) => v !== 2));
    next.staff[id] = Object.fromEntries(['name', 'role', 'deviation']
      .map((k) => [k, String(w[k] ?? '').trim().slice(0, k === 'deviation' ? 300 : 60)])
      .filter(([, v]) => v));
    if (Object.keys(traits).length) next.staff[id].traits = traits;
    if (hire) Object.assign(next.staff[id], { kind: w.kind, hiredAt: Number(w.hiredAt) || Date.now() });
    if (w.fired) next.staff[id].fired = true;
    if (!Object.keys(next.staff[id]).length) delete next.staff[id];
  }
  // a section can only be written by someone on the staff (or by nobody: "the newsroom")
  const onStaff = new Set(rosterIds(next));
  next.desks = { ...cur.desks, ...(patch.desks || {}) };
  for (const [k, v] of Object.entries(next.desks)) if (v !== '' && !onStaff.has(v)) next.desks[k] = onStaff.has(DEFAULT_DESKS[k]) ? DEFAULT_DESKS[k] : '';
  for (const [k, v] of Object.entries(next.sectionWeights)) {
    next.sectionWeights[k] = Math.max(0, Math.min(3, Number(v) || 0));
  }
  store.setSetting('line', next);
  return next;
}

/**
 * A writer edited by an older version: the house style is gone (one voice now), and a voice the
 * editor wrote by hand becomes that writer's deviation.
 */
function migrateWriter(w) {
  if (w.style && !w.deviation) w.deviation = w.style;
  delete w.style;
  delete w.house;
  return w;
}

/** The block appended to the writer's instructions: the house voice and the editor's notes. */
export function linePrompt(line) {
  const parts = [`\n${line?.manual?.voice || voicePrompt()}`];
  if (line?.notes?.trim()) parts.push(tr({ en: `- Editor's notes: ${line.notes.trim()}`, it: `- Note del direttore: ${line.notes.trim()}` }));
  return parts.join('\n');
}
