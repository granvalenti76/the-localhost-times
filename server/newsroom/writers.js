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

export const DEFAULT_DESKS = {
  safari: 'web', terminal: 'tech', files: 'local', mail: 'local',
  notes: 'culture', journal: 'columnist', podcasts: 'culture', books: 'culture',
  apps: 'tech', photos: 'culture',
  brief: 'columnist', // the Brief and the evening editorial
  spotlight: 'spotlight', // the Spotlight desk's scoops
};

/** The staff, with the editor's edits (names, roles, deviations) on top of the defaults. */
export function staff(line) {
  const base = L(ROSTER);
  const custom = line?.staff || {};
  return Object.fromEntries(WRITER_IDS.map((id) => [id, { id, ...base[id], ...(custom[id] || {}) }]));
}

/** Who writes a section ('' = unsigned: "the newsroom"). */
export function writerFor(line, source) {
  const desks = { ...DEFAULT_DESKS, ...(line?.desks || {}) };
  const id = desks[source];
  if (!id) return null;
  return staff(line)[id] || null;
}

/** Who signs the Brief and the evening editorial. */
export const columnist = (line) => writerFor(line, 'brief');

/** The lines added to the writer's instructions: who you are, and the deviation the editor gave you, if any. */
export function personaPrompt(w) {
  if (!w) return '';
  const dev = String(w.deviation || '').trim();
  return tr({
    en: `\nYOUR BYLINE: you are ${w.name}, ${w.role} of the paper. You write in the house voice; don't sign the text and don't mention your name.${dev ? `\nYOUR DEVIATION (from the editor): ${dev} It shifts what you notice and your attitude, never the house register or the rules about facts.` : ''}`,
    it: `\nLA TUA FIRMA: sei ${w.name}, ${w.role} del giornale. Scrivi nella voce della casa; non firmare il testo e non nominarti.${dev ? `\nLA TUA DEVIAZIONE (decisa dal direttore): ${dev} Sposta cosa noti e il tuo atteggiamento, mai il registro della casa né le regole sui fatti.` : ''}`,
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
