/**
 * The newsroom, alive: what the writers say to each other while they work. Lines come from what
 * actually happens (a call to the Editor, a record, a tip in the box, the model failing), so there
 * is always something moving, at no cost: no model needed.
 */
import { tr } from '../i18n.js';
import { staff } from './writers.js';
import { getLine, featureOn } from './line.js';

const KIND = 'chatter';
const KEEP = 300;

/** Someone in the newsroom says something. `who` is a writer id, or 'desk', 'sport', 'oracle', 'press'. */
export function say(store, who, text, ts = Date.now()) {
  try {
    if (!featureOn(getLine(store), 'chatter')) return null;
    // one line per speaker at a time: a burst (the backfill, a reprint) says it once
    const last = store.items(KIND, { ref: who, limit: 1 })[0];
    if (last && Math.abs(ts - last.ts) < 90e3) return null;
    const item = store.saveItem({ kind: KIND, status: '', ts, ref: who, who, text: String(text).slice(0, 300) });
    if (item.id % 25 === 0) store.trimItems(KIND, KEEP);
    return item;
  } catch { return null; } // the chatter never stops the presses
}

/** The latest lines, newest first, with the speaker's name. */
export function chatter(store, { limit = 30, after = null } = {}) {
  const people = staff(getLine(store));
  const roles = {
    desk: tr({ en: 'The desk', it: 'Il desk' }),
    sport: tr({ en: 'Sports desk', it: 'Redazione sportiva' }),
    oracle: tr({ en: 'The Oracle', it: 'L\'Oracolo' }),
    press: tr({ en: 'The press room', it: 'La tipografia' }),
    tips: tr({ en: 'The tip box', it: 'La cassetta' }),
    serial: tr({ en: 'The serial', it: 'Il feuilleton' }),
  };
  return store.items(KIND, { limit, after }).map((x) => ({
    id: x.id, ts: x.ts, who: x.who, name: people[x.who]?.name || roles[x.who] || x.who, text: x.text,
  }));
}

/** Things worth saying while the hour is running, from the stories forming (at most one every 10 minutes). */
export function chatterRound(store, { stories = [], now = Date.now(), line = null } = {}) {
  const last = store.items(KIND, { limit: 1 })[0];
  if (last && now - last.ts < 10 * 60e3) return null;
  const top = stories[0];
  if (!top) return null;
  const prev = store.getSetting('chatterTop', null);
  store.setSetting('chatterTop', { id: top.id, n: top.events.length, at: now });
  const people = staff(line || getLine(store));
  const desks = { ...(line || getLine(store)).desks };
  const who = desks[top.source] || 'desk';
  const name = people[who]?.name || tr({ en: 'The desk', it: 'Il desk' });
  if (!prev || prev.id !== top.id) {
    return say(store, who, tr({
      en: `${name}: ${top.topic} is moving up — ${top.events.length} signals. I want the lead.`,
      it: `${name}: ${top.topic} sale — ${top.events.length} segnali. Chiedo l'apertura.`,
    }), now);
  }
  if (top.events.length >= (prev.n || 0) * 2 && top.events.length >= 20) {
    return say(store, who, tr({
      en: `${name}: still on ${top.topic}. ${top.events.length} signals now. Hold the front page.`,
      it: `${name}: sempre ${top.topic}. Ora ${top.events.length} segnali. Tenetemi la prima pagina.`,
    }), now);
  }
  const second = stories[1];
  if (second && second.source !== top.source) {
    const w2 = desks[second.source] || 'desk';
    const n2 = people[w2]?.name || tr({ en: 'The desk', it: 'Il desk' });
    return say(store, w2, tr({
      en: `${n2}: I've got ${second.topic} with ${second.events.length} signals. Room for me on page one?`,
      it: `${n2}: io ho ${second.topic}, ${second.events.length} segnali. Un posto in prima me lo date?`,
    }), now);
  }
  return null;
}
