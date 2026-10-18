/**
 * The copy desk's checklist: the tics of small models, counted. No model needed.
 * Each issue says what it is and how often; the score goes from 100 (clean) down.
 */
import { tr, lang } from '../i18n.js';

export const BANNED = {
  en: ['extremely', 'crucial', 'fundamental', 'extraordinary', 'incredible', 'intense', 'tenacity', 'mastery', 'immersed', 'journey', 'seamless', 'testament', 'delve'],
  it: ['estremamente', 'cruciale', 'fondamentale', 'straordinario', 'incredibile', 'intenso', 'tenacia', 'maestria', 'immerso', 'viaggio', 'sfida', 'testimonianza'],
};

/** System vocabulary: the traces on the Mac told as a report, not as something a person did. */
export const DASH = /\b(segnal[ei]|registrat[oaie]|registra(?:no)?|log|eventi|evento|dati|attivit[àa]|session[ei]|picco|picchi|monitoraggio|timestamp|consultazion[ei]|interazion[ei]|signals?|recorded|records|logs?|events?|data|activity|sessions?|peaks?|monitoring|interactions?)\b/gi;

/** Machine-made phrasing: the stock moves of generated prose, in both languages. */
export const SLOP = /\bnon (?:è|e'|era|sono|erano|c'è|c'era) [^.;:]{2,90}?, ma\b|\bnon si tratta (?:più |solo )?di\b[^.;]{0,90}?,? ma\b|\bin un mondo (?:in cui|dove)\b|\bquasi (?:chirurgic\w+|un sussurro)|\bviolenza\b|\bparadigm\w*|\bdinamic(?:a|he)\b|\bdimensione\b|\bnarrazion\w+|\becosistem\w+|\bsinfoni\w+|\bdanza\b|\btestimon\w+ silenzios\w+|\bantropologic\w+|\bit(?:'?s| is) not (?:just|only|merely)\b[^.;]{0,90}?,? (?:it'?s|it is|but)\b|\bin a world where\b|\btapestry\b|\bdelve\w*|\btestament to\b|\bsymphony\b|\bsurgical\b|\bsilent witness\b/gi;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * How much a text reads like a dashboard or like a machine: system words, times, percentages,
 * figures and stock phrases, per 1000 words. 100 = a well-made magazine piece.
 */
export function registerCheck(body) {
  const text = (Array.isArray(body) ? body : [body]).join(' ');
  const n = Math.max(1, text.split(/\s+/).filter(Boolean).length);
  const words = [...text.matchAll(DASH)].map((m) => m[0].toLowerCase());
  const times = (text.match(/\b([01]?\d|2[0-3])[:.][0-5]\d\b/g) || []).length;
  const pct = (text.match(/\d+(?:[.,]\d+)?\s?%/g) || []).length;
  const figures = (text.match(/(?<![\w.:])\d+(?:[.,]\d+)?(?![\w:])/g) || []).length;
  const slop = [...text.matchAll(SLOP)].map((m) => clip(m[0], 60));
  const per = (x) => Math.round((x / n) * 1000 * 10) / 10;
  const score = Math.max(0, Math.round(100 - per(words.length) * 4 - per(times) * 5 - per(pct) * 10 - Math.max(0, per(figures) - 3) * 3 - per(slop.length) * 6));
  const count = {};
  for (const w of words) count[w] = (count[w] || 0) + 1;
  return { score, words: Object.entries(count).sort((a, b) => b[1] - a[1]).map(([w, k]) => ({ w, n: k })).slice(0, 8), times, pct, figures, slop: [...new Set(slop)].slice(0, 8) };
}

/** The stock simile of small models: "come chi chiude un libro", "like someone who…", "as if…". */
const SIMILE = {
  en: /\b(like (?:someone|somebody|a man|a woman|a person) who|as if|as though)\b/gi,
  it: /\b(come (?:chi|se|qualcuno che|una persona che|un uomo che|una donna che))\b/gi,
};

/** The similes of a text, by their construction ("come chi", "as if"), in order. */
export function similes(paragraphs) {
  const text = Array.isArray(paragraphs) ? paragraphs.join('\n\n') : String(paragraphs || '');
  return [...text.matchAll(lang() === 'en' ? SIMILE.en : SIMILE.it)].map((m) => m[1].toLowerCase().replace(/\s+/g, ' '));
}

export const sentences = (text) => String(text).split(/(?<=[.!?…»”])\s+(?=[A-ZÀ-Ý«“"])/).map((s) => s.trim()).filter(Boolean);
const count = (text, re) => (String(text).match(re) || []).length;

/**
 * Issues in a text (a list of paragraphs or a string). `seen`: the similes already printed in
 * this edition's other pieces, so the same image never comes back on the next page.
 */
export function lint(paragraphs, { seen = [] } = {}) {
  const text = Array.isArray(paragraphs) ? paragraphs.join('\n\n') : String(paragraphs || '');
  const en = lang() === 'en';
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  const sents = sentences(text);
  const issues = [];
  const add = (id, n, msg) => { if (n > 0) issues.push({ id, n, msg }); };

  const timeStarts = sents.filter((s) => (en ? /^(at|by|around)\s+\d{1,2}[:.]\d{2}/i : /^(alle|verso le|poco dopo le)\s+\d{1,2}[:.]\d{2}/i).test(s)).length;
  add('time-starts', timeStarts > 1 ? timeStarts : 0, tr({ en: `${timeStarts} sentences open with a time`, it: `${timeStarts} frasi cominciano con un orario` }));

  const owner = count(text, en ? /\bthe (owner|user)\b/gi : /\b(?:(?:il|del|al|dal|nel|sul) (?:proprietario|padrone di casa|utente)|l'utente|dell'utente|all'utente)\b/gi);
  const ownerMax = Math.max(2, Math.round(words / 120));
  add('owner', owner > ownerMax ? owner : 0, tr({ en: `“the owner” ${owner} times`, it: `«il proprietario» ${owner} volte` }));

  const maybe = count(text, en ? /\b(perhaps|maybe|probably)\b/gi : /\b(forse|probabilmente)\b/gi);
  add('hedges', maybe > 2 ? maybe : 0, tr({ en: `${maybe} hedges (“perhaps”, “maybe”)`, it: `${maybe} «forse»` }));

  const negs = count(text, en ? /\b(no (likes|comments|clicks|interaction)|without (likes|comments))\b/gi : /\b(nessun (like|commento|clic|click)|senza (like|commenti))\b/gi);
  add('invented-absence', negs, tr({ en: `${negs} absences nobody can know (“no likes”)`, it: `${negs} assenze che nessuno può sapere («nessun like»)` }));

  const forseforse = count(text, en ? /\bperhaps\b[^.]{0,80}\bperhaps\b/gi : /\bforse\b[^.]{0,80}\bforse\b/gi);
  add('maybe-maybe', forseforse, tr({ en: '“perhaps…, perhaps…”', it: '«forse…, forse…»' }));

  const banned = (en ? BANNED.en : BANNED.it).filter((w) => new RegExp(`\\b${w}`, 'i').test(text));
  add('inflated', banned.length, tr({ en: `inflated words: ${banned.join(', ')}`, it: `parole gonfie: ${banned.join(', ')}` }));

  // the same opening word for three sentences in a row
  let run = 1;
  let worst = 1;
  for (let i = 1; i < sents.length; i++) {
    const a = sents[i - 1].split(/\s+/)[0]?.toLowerCase();
    const b = sents[i].split(/\s+/)[0]?.toLowerCase();
    run = a && a === b ? run + 1 : 1;
    worst = Math.max(worst, run);
  }
  add('same-start', worst >= 3 ? worst : 0, tr({ en: `${worst} sentences in a row start the same way`, it: `${worst} frasi di fila cominciano allo stesso modo` }));

  // the traces told as a report, and the phrasing of a machine
  const reg = registerCheck(text);
  const dash = reg.words.reduce((t, x) => t + x.n, 0);
  add('dashboard', dash >= 2 ? dash : 0, tr({ en: `dashboard words (${reg.words.map((x) => x.w).join(', ')}): tell what the person did, not what the Mac recorded`, it: `parole da cruscotto (${reg.words.map((x) => x.w).join(', ')}): racconta cosa ha fatto la persona, non cosa ha registrato il Mac` }));
  const timesMax = Math.max(2, Math.round(words / 70));
  add('many-times', reg.times > timesMax ? reg.times : 0, tr({ en: `${reg.times} times of day: keep the one or two that matter`, it: `${reg.times} orari: tieni i due che contano` }));
  add('slop', reg.slop.length, tr({ en: `machine-made phrasing: ${reg.slop.map((x) => `“${x}”`).join(', ')}`, it: `frasi da macchina: ${reg.slop.map((x) => `«${x}»`).join(', ')}` }));

  // one simile is an image; two in a piece are a tic; one already used on another page is a repeat
  const sim = similes(text);
  add('simile', sim.length > 1 ? sim.length : 0, tr({ en: `${sim.length} similes (“${sim[0]}…”): keep one, or none`, it: `${sim.length} similitudini («${sim[0]}…»): tienine una, o nessuna` }));
  const again = [...new Set(sim.filter((x) => seen.includes(x)))];
  add('simile-again', again.length, tr({
    en: `“${again[0]}…” is already in another piece of this edition: find another image, or drop it`,
    it: `«${again[0]}…» c'è già in un altro pezzo di questa edizione: trova un'altra immagine, o toglila`,
  }));

  const unknown = count(text, en ? /\bwe (don't|do not) know why\b/gi : /\bnon (sappiamo|si sa) perch[ée]\b/gi);
  add('dont-know', unknown > 1 ? unknown : 0, tr({ en: `“we don't know why” ×${unknown}`, it: `«non sappiamo perché» ×${unknown}` }));

  const weight = { 'time-starts': 6, owner: 4, hedges: 4, 'invented-absence': 10, 'maybe-maybe': 8, inflated: 6, 'same-start': 6, 'dont-know': 5, dashboard: 4, 'many-times': 4, slop: 8, simile: 5, 'simile-again': 6 };
  const score = Math.max(0, 100 - issues.reduce((t, i) => t + (weight[i.id] || 5) * Math.min(4, i.n), 0));
  return { score, issues };
}

/** The instruction for a rewrite that fixes them. */
export function lintInstruction(issues) {
  if (!issues?.length) return '';
  return tr({
    en: `Fix these problems of style, keeping the facts: ${issues.map((i) => i.msg).join('; ')}.`,
    it: `Correggi questi difetti di stile, tenendo i fatti: ${issues.map((i) => i.msg).join('; ')}.`,
  });
}
