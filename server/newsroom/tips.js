/**
 * The tip box: facts the Editor hands to the newsroom. A tip comes from a note in the Notes folder
 * "Redazione" (or "Newsroom"), from the terminal (npm run tip -- "…") or from the paper's page.
 * At print, a tip that matches a story goes into its facts ("a source close to the owner");
 * the others end up in the gossip column, "Word is".
 *
 * Tips are items of kind 'tip': { status: new | used | archived, text, via, usedIn, storyId }.
 */
import { tr, lang } from '../i18n.js';
import { DeskError } from './edition.js';
import { say } from './chatter.js';
import { hhmm } from '../util.js';

const KIND = 'tip';

/** The Notes folders that are a tip box rather than news (any language). */
export function tipFolders(config) {
  const own = String(config?.tips?.notesFolder || '').trim().toLowerCase();
  return new Set(['redazione', 'newsroom', 'soffiate', 'tips', own].filter(Boolean));
}

export const isTipNote = (e, folders) => e.source === 'notes' && !!e.meta?.folder && folders.has(String(e.meta.folder).toLowerCase());

/** A new tip (or, for a note already in the box, its new text). */
export function addTip(store, { text, via = 'web', ref = null, ts = Date.now() } = {}) {
  const t = String(text || '').replace(/\s+\n/g, '\n').trim().slice(0, 1200);
  if (!t) throw new DeskError(tr({ en: 'The tip is empty.', it: 'La soffiata è vuota.' }), 400);
  if (ref) {
    const old = store.items(KIND, { ref, limit: 1 })[0];
    if (old) {
      if (old.text === t) return old;
      // a note edited after it was used is a new tip; otherwise just update the text
      return store.saveItem(old.status === 'new' ? { ...old, text: t, ts } : { kind: KIND, status: 'new', ts, ref, text: t, via });
    }
  }
  const tip = store.saveItem({ kind: KIND, status: 'new', ts, ref, text: t, via });
  say(store, 'tips', tr({ en: 'Someone left a tip in the box. Anyone want it?', it: 'Qualcuno ha lasciato una soffiata nella cassetta. Chi la prende?' }), ts);
  return tip;
}

/** Notes saved in the tip-box folder become tips. */
export function tipsFromNotes(store, config, events) {
  const folders = tipFolders(config);
  let n = 0;
  for (const e of events) {
    if (!isTipNote(e, folders)) continue;
    const text = [e.title, e.meta?.snippet].filter(Boolean).join('\n').trim();
    if (!text) continue;
    addTip(store, { text, via: 'notes', ref: `notes:${e.meta.noteId}`, ts: e.ts });
    n++;
  }
  return n;
}

export const tips = (store, { status = null, limit = 50 } = {}) => store.items(KIND, { status, limit });

export function archiveTip(store, id) {
  const t = store.getItem(KIND, id);
  if (!t) throw new DeskError(tr({ en: 'Tip not found', it: 'Soffiata non trovata' }), 404);
  return store.saveItem({ ...t, status: 'archived' });
}

const STOP = new Set(('the and for that this with from have what about there their would been were they your into just like '
  + 'che per con una uno del della delle dei degli nel nella sono come anche questo questa quello quella ho ha hai mio mia '
  + 'suo sua più poi già oggi ieri dopo prima molto tutto tutti').split(' '));

export function words(text) {
  return [...new Set(String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9.]+/).map((w) => w.replace(/^\.+|\.+$/g, '')).filter((w) => w.length >= 4 && !STOP.has(w)))];
}

/** What a story is about, in words (topic, titles, sites, folders, commits). */
function storyWords(s) {
  const bits = [s.topic, s.project, ...(s.sites || []), ...(s.commits || []), ...(s.events || []).slice(0, 40).flatMap((e) => [e.title, e.meta?.host, e.meta?.folder, e.meta?.show])];
  const ws = new Set(words(bits.join(' ')));
  for (const b of bits) if (typeof b === 'string' && /\./.test(b)) ws.add(b.toLowerCase().split('.')[0]);
  return ws;
}

/** The story a tip is about: the one sharing most words with it (at least one), or null. */
export function matchTip(tip, stories) {
  const tw = words(tip.text).flatMap((w) => [w, w.split('.')[0]]);
  let best = null;
  let score = 0;
  for (const s of stories) {
    const sw = storyWords(s);
    const n = new Set(tw.filter((w) => sw.has(w))).size;
    if (n > score) { best = s; score = n; }
  }
  return score ? best : null;
}

const q = (s) => (lang() === 'it' ? `«${s}»` : `“${s}”`);

/**
 * At print: the tips waiting in the box go to their stories (as facts) or to the gossip column.
 * Returns { facts: Map(storyId → lines), box: [{ id, text, at }] } and marks the tips as used.
 */
export function tipsForEdition(store, stories, { end, editionId }) {
  // the new tips, and those this same edition already used (a reprint uses them again)
  const waiting = [
    ...store.items(KIND, { status: 'used', after: end - 6 * 3600e3, limit: 40, oldest: true }).filter((t) => t.usedIn === editionId),
    ...store.items(KIND, { status: 'new', before: end, limit: 20, oldest: true }),
  ];
  const facts = new Map();
  const box = [];
  for (const t of waiting) {
    const s = matchTip(t, stories);
    if (s) {
      const line = tr({
        en: `TIP from the tip box (a source close to the owner, ${hhmm(t.ts)}): ${q(t.text.slice(0, 500))}`,
        it: `SOFFIATA dalla cassetta (una fonte vicina al proprietario, ore ${hhmm(t.ts)}): ${q(t.text.slice(0, 500))}`,
      });
      facts.set(s.id, `${facts.get(s.id) || ''}\n${line}`);
      store.saveItem({ ...t, status: 'used', usedIn: editionId, storyId: s.id });
    } else {
      box.push({ id: t.id, text: t.text.slice(0, 400), at: t.ts, line: typesetRumour(t.text) });
      store.saveItem({ ...t, status: 'used', usedIn: editionId, storyId: null });
    }
  }
  return { facts, box };
}

/** The typesetting's line for the gossip column. */
export function typesetRumour(text) {
  const t = String(text).replace(/\s+/g, ' ').trim().slice(0, 240);
  return tr({ en: `A source close to the owner reports: ${q(t)}.`, it: `Una fonte vicina al proprietario riferisce: ${q(t)}.` });
}

/** The gossip column in the voice of the paper (the model, in the post-press pass). */
export function rumourPrompt(box) {
  return [
    {
      role: 'system',
      content: tr({
        en: `You write "Word is", the gossip column of The Localhost Times, the paper about what happens on its owner's Mac. Each tip below comes from "a source close to the owner": turn each one into ONE sentence of gossip column (at most 30 words), wry and discreet, attributing it ("a source close to the owner says…", "we hear that…"). Keep every fact as it is, add none.
Reply ONLY with JSON: {"lines": ["...", ...]} — one line per tip, in the same order.`,
        it: `Scrivi «Si dice che», la rubrica di indiscrezioni del «The Localhost Times», il giornale di ciò che succede sul Mac del proprietario. Ogni soffiata qui sotto viene da «una fonte vicina al proprietario»: trasformala in UNA frase da rubrica di indiscrezioni (massimo 30 parole), sorniona e discreta, attribuendola («una fonte vicina al proprietario riferisce…», «ci risulta che…»). Lascia ogni fatto com'è, non aggiungerne.
Rispondi SOLO con JSON: {"lines": ["...", ...]} — una riga per soffiata, nello stesso ordine.`,
      }),
    },
    { role: 'user', content: box.map((b, i) => `${i + 1}. ${b.text}`).join('\n') },
  ];
}
