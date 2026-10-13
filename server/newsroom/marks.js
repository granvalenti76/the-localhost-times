/**
 * The proofreader's marks: the problems of a draft, each at its place in the text, with the fixes
 * the Editor can pick. The proof round on the page hides their places (the Editor finds them with
 * the red pencil) and shows only how many there are. No model needed: the same rules as the copy
 * desk (lint.js) and the figure check (factcheck.js), pinned to words.
 */
import { tr, lang } from '../i18n.js';
import { BANNED, SLOP, DASH } from './lint.js';
import { figures, WORDS } from './factcheck.js';

const MAX = 8;

// plainer words for the inflated ones ('' = just drop it)
const PLAIN = {
  it: { estremamente: '', cruciale: 'importante', fondamentale: 'importante', straordinario: 'insolito', incredibile: '', intenso: 'lungo', tenacia: 'pazienza', maestria: 'mestiere', immerso: 'preso', viaggio: 'giro', sfida: 'prova', testimonianza: 'segno' },
  en: { extremely: '', crucial: 'important', fundamental: 'basic', extraordinary: 'unusual', incredible: '', intense: 'long', tenacity: 'patience', mastery: 'skill', immersed: 'busy', journey: 'trip', seamless: 'smooth', testament: 'sign', delve: 'look' },
};

const INTERVAL = {
  it: /\b(?:(?:\d+|un|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|quindici|venti|trenta|quaranta|cinquanta)\s+(?:minut[oi]|or[ae]|second[oi])|mezz'ora|un'ora|un quarto d'ora)\s+(?:dopo|più tardi|prima)\b/gi,
  en: /\b(?:(?:\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty)\s+(?:minutes?|hours?|seconds?)|half an hour|an hour|a quarter of an hour)\s+(?:later|after|before|earlier)\b/gi,
};

const SPELLED = Object.fromEntries(Object.entries(WORDS).map(([w, n]) => [w, String(n)]));

/** Where a figure (as factcheck reads it: "4", "21:47") appears in a text: digits or words. */
function figureAt(text, fig) {
  const out = [];
  const re = /:/.test(fig) ? new RegExp(`\\b0?${fig.replace(/^0/, '')}\\b`, 'g') : new RegExp(`(?<![\\w.,:])${fig.replace('.', '[.,]')}(?![\\w:]|[.,]\\d)`, 'g');
  for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length]);
  for (const [w, n] of Object.entries(SPELLED)) {
    if (n !== fig) continue;
    for (const m of text.matchAll(new RegExp(`\\b${w}\\b`, 'gi'))) out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

/** The figures of the facts nearest to a wrong one (same kind: times with times). */
function nearest(fig, known) {
  const isTime = /:/.test(fig);
  const v = (f) => (isTime ? Number(f.slice(0, 2)) * 60 + Number(f.slice(3)) : Number(f));
  return [...known].filter((k) => /:/.test(k) === isTime).sort((a, b) => Math.abs(v(a) - v(fig)) - Math.abs(v(b) - v(fig))).slice(0, 2);
}

/**
 * The marks of a text ({ headline, dek, body }) against its facts. Each: where (part: 'headline',
 * 'dek' or the paragraph's index; start and end), what it says, and the fixes on offer ({ label,
 * to }: the replacement; '' cuts it).
 */
export function marksFor(text, facts) {
  const en = lang() === 'en';
  const known = new Set(figures(facts));
  const factTimes = [...known].filter((f) => /:/.test(f));
  const all = [];
  const parts = [['headline', text.headline || ''], ['dek', text.dek || ''], ...(text.body || []).map((p, i) => [i, p])];
  const whole = parts.map(([, t]) => t).join(' ');
  const cut = { label: tr({ en: 'Cut it', it: 'Taglia' }), to: '' };
  const dashCount = [...whole.matchAll(DASH)].length;
  const unverified = new Set(figures(whole).filter((f) => !known.has(f)));
  const plain = PLAIN[en ? 'en' : 'it'];
  const banned = BANNED[en ? 'en' : 'it'];

  for (const [part, t] of parts) {
    const add = (start, end, kind, msg, fixes) => all.push({ id: `${part}:${start}`, part, start, end, text: t.slice(start, end), kind, msg, fixes });
    for (const w of banned) {
      for (const m of t.matchAll(new RegExp(`\\b${w}\\w*`, 'gi'))) {
        const to = plain[w];
        add(m.index, m.index + m[0].length, 'inflated', tr({ en: 'An inflated word: the style guide bans it.', it: 'Parola gonfia: il manuale di stile la vieta.' }),
          [to ? { label: tr({ en: `Write “${to}”`, it: `Scrivi «${to}»` }), to } : null, cut].filter(Boolean));
      }
    }
    for (const f of unverified) {
      for (const [a, b] of figureAt(t, f)) {
        const near = nearest(f, known);
        add(a, b, 'figure', tr({ en: 'This figure is not in the facts.', it: 'Questo numero non è nei fatti.' }),
          [...near.map((n) => ({ label: tr({ en: `The facts say ${n}`, it: `Nei fatti: ${n}` }), to: n })), cut]);
      }
    }
    for (const m of t.matchAll(INTERVAL[en ? 'en' : 'it'])) {
      add(m.index, m.index + m[0].length, 'interval', tr({ en: 'An interval worked out by the writer: the guide wants the time as it is.', it: 'Intervallo calcolato dal redattore: il manuale vuole l\'orario così com\'è.' }),
        [...factTimes.filter((x) => !whole.includes(x)).slice(0, 2).map((x) => ({ label: tr({ en: `“at ${x}”`, it: `«alle ${x}»` }), to: tr({ en: `at ${x}`, it: `alle ${x}` }) })), cut]);
    }
    for (const m of t.matchAll(SLOP)) {
      add(m.index, m.index + m[0].length, 'slop', tr({ en: 'Machine-made phrasing.', it: 'Frase da macchina.' }), [cut]);
    }
    if (dashCount >= 2) {
      for (const m of t.matchAll(DASH)) {
        add(m.index, m.index + m[0].length, 'dashboard', tr({ en: 'A dashboard word: tell what the person did, not what the Mac recorded.', it: 'Parola da cruscotto: racconta cosa ha fatto la persona, non cosa ha registrato il Mac.' }), [cut]);
      }
    }
  }
  // one mark per place, in reading order: where two rules catch the same words, the longer catch wins
  const order = (x) => (x.part === 'headline' ? -2 : x.part === 'dek' ? -1 : x.part);
  all.sort((a, b) => order(a) - order(b) || a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = [];
  for (const m of all) {
    if (out.some((x) => x.part === m.part && m.start < x.end && x.start < m.end)) continue;
    out.push(m);
  }
  return out.slice(0, MAX);
}

/** A mark's fix applied to a text: the new text (the marks after it in the same part shift). */
export function applyFix(text, mark, to) {
  const t = { headline: text.headline, dek: text.dek || '', body: [...text.body] };
  const get = () => (mark.part === 'headline' ? t.headline : mark.part === 'dek' ? t.dek : t.body[mark.part]);
  const src = get();
  if (src == null || src.slice(mark.start, mark.end) !== mark.text) return t;
  let next = src.slice(0, mark.start) + to + src.slice(mark.end);
  next = next.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?»”])/g, '$1').replace(/^\s+/, '');
  next = next.charAt(0).toUpperCase() + next.slice(1);
  if (mark.part === 'headline') t.headline = next;
  else if (mark.part === 'dek') t.dek = next;
  else t.body[mark.part] = next;
  return t;
}
