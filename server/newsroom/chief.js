/**
 * The managing editor as a person: a name, how demanding they are, a fixation of their own, and
 * how much they think of the Editor. They read the drafts before the Editor does (chain.js); when
 * the Editor overrules them (a pass on a piece they sent back, a note on a piece they passed) their
 * esteem goes down and they say so; when the Editor agrees with them, it goes up.
 */
import { tr, L } from '../i18n.js';
import { say } from './chatter.js';

const KEY = 'chief';
const DAY = 24 * 3600e3;

const DEFAULT = {
  en: { name: 'Ray Holden', role: 'managing editor' },
  it: { name: 'Aldo Ferri', role: 'caporedattore' },
};

// set from the editorial line every time it is read (line.js), so the desk always has the current one
let current = {};
export function setChief(c) { current = c || {}; }

/** The managing editor as the line describes them. */
export function chiefOf(c = current) {
  const sev = Number.isFinite(Number(c?.severity)) ? Math.max(0, Math.min(4, Math.round(Number(c.severity)))) : 2;
  return { ...L(DEFAULT), ...(c?.name ? { name: String(c.name).slice(0, 60) } : {}), severity: sev, peeve: String(c?.peeve || '').slice(0, 200) };
}

/** A clean copy of what the Editor set (for saving with the line). */
export function cleanChief(c) {
  const x = chiefOf(c || {});
  const out = {};
  if (c?.name && String(c.name).trim()) out.name = String(c.name).trim().slice(0, 60);
  if (x.severity !== 2) out.severity = x.severity;
  if (x.peeve.trim()) out.peeve = x.peeve.trim();
  return out;
}

const SEVERITY = {
  en: [
    'You are lenient: you send a piece back only for a factual mistake or machine-made phrasing.',
    'You are easy-going: you send back only what really doesn\'t work.',
    null,
    'You are demanding: a flat opening or a weak ending is reason enough to send a piece back.',
    'You are ruthless: only what would make the front page of The New Yorker passes.',
  ],
  it: [
    'Sei indulgente: rimandi un pezzo solo per un errore di fatto o una frase da macchina.',
    'Sei di manica larga: rimandi solo ciò che proprio non va.',
    null,
    'Sei esigente: un attacco piatto o una chiusa debole bastano per rimandare un pezzo.',
    'Sei spietato: passa solo ciò che starebbe nella prima pagina del New Yorker.',
  ],
};

/** The lines the managing editor's character adds to their instructions. */
export function chiefPrompt(c = chiefOf()) {
  const sev = L(SEVERITY)[c.severity];
  const peeve = c.peeve ? tr({ en: `YOUR FIXATION: ${c.peeve}`, it: `LA TUA FISSAZIONE: ${c.peeve}` }) : '';
  return [sev, peeve].filter(Boolean).join('\n');
}

// ───────────────────────── Esteem ─────────────────────────

const get = (store) => ({ esteem: 60, log: [], ...store.getSetting(KEY, {}) });

/** What the managing editor last said about a draft: their verdict on the current version, if they read it. */
export function lastVerdict(chain = []) {
  const since = chain.findLastIndex((x) => x.who === 'reporter' || x.who === 'update');
  const reads = chain.slice(Math.max(0, since)).filter((x) => x.who === 'editor');
  return reads.at(-1) || null;
}

const LINES = {
  overruled: { en: (h) => `I wouldn't have passed “${h}”. But you're the Editor.`, it: (h) => `Io «${h}» non l'avrei passato. Ma il Direttore è lei.` },
  overruledBack: { en: (h) => `For me “${h}” was fine as it was.`, it: (h) => `Per me «${h}» andava bene così.` },
  agreedBack: { en: (h) => `“${h}” back to the reporter: I said so too.`, it: (h) => `«${h}» rimandato: lo dicevo anch'io.` },
};

/**
 * The Editor acted on a draft the managing editor had read: `act` is 'pass' or 'note'. Esteem
 * moves, and when the Editor goes against them the managing editor says it in the newsroom.
 */
export function chiefReacts(store, piece, act, now = Date.now()) {
  try {
    const v = lastVerdict(piece?.chain || []);
    if (!v) return null; // they didn't read this one
    const h = piece.text?.headline || piece.topic || '';
    const back = v.verdict === 'rework' && (v.notes || []).length > 0;
    let kind = null;
    let d = 0;
    if (act === 'pass') { kind = back ? 'overruled' : 'agreed'; d = back ? -5 : 2; }
    if (act === 'note') { kind = back ? 'agreedBack' : 'overruledBack'; d = back ? 3 : -2; }
    if (!kind) return null;
    const s = get(store);
    s.esteem = Math.max(0, Math.min(100, s.esteem + d));
    s.log = [...s.log.filter((x) => now - x.at < 14 * DAY), { at: now, kind, headline: h.slice(0, 120), d }].slice(-60);
    store.setSetting(KEY, s);
    const c = chiefOf();
    if (LINES[kind]) say(store, c.name, `${c.name}: ${tr(LINES[kind])(h)}`, now);
    return { kind, esteem: s.esteem };
  } catch { return null; }
}

/** How the managing editor sees the Editor, in a word. */
const mood = (e) => (e >= 80 ? 'admires' : e >= 55 ? 'trusts' : e >= 30 ? 'doubts' : 'fumes');
const MOOD_TEXT = {
  en: { admires: 'thinks the world of you', trusts: 'trusts your judgement', doubts: 'is starting to doubt your judgement', fumes: 'is fuming: you keep overruling them' },
  it: { admires: 'ha grande stima di te', trusts: 'si fida del tuo giudizio', doubts: 'comincia a dubitare del tuo giudizio', fumes: 'è furioso: continui a scavalcarlo' },
};

/** The managing editor's card: who they are, what they think of the Editor, the week's disagreements. */
export function chiefView(store, now = Date.now()) {
  const s = get(store);
  const week = s.log.filter((x) => now - x.at < 7 * DAY);
  return {
    ...chiefOf(),
    esteem: s.esteem,
    mood: mood(s.esteem),
    moodText: L(MOOD_TEXT)[mood(s.esteem)],
    week: {
      agreed: week.filter((x) => x.kind === 'agreed' || x.kind === 'agreedBack').length,
      overruled: week.filter((x) => x.kind === 'overruled' || x.kind === 'overruledBack').length,
    },
    recent: s.log.slice(-5).reverse(),
  };
}
