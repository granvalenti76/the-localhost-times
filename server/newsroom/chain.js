/**
 * The desk: every article passes through three hands before it is printed.
 *   the reporter   writes the draft (edition.js)
 *   the managing editor reads it against the facts and either passes it or sends it back with
 *                  at most three precise notes; the reporter rewrites it once
 *   the copy desk  checks every figure against the facts (certain, no model needed) and fixes
 *                  the sentences that quote a number the facts don't contain; then the small
 *                  things: double words, double spaces, stray punctuation
 * The passages are kept with the article (text.chain), so the Editor can see how a piece was
 * made in its X-ray, and the old draft when it was sent back.
 */
import { tr, L, lang } from '../i18n.js';
import { parseJson } from './llm.js';
import { lint } from './lint.js';
import { numbersCheck, figures } from './factcheck.js';
import { wordCount } from './prompts.js';
import { say } from './chatter.js';

const DESK = {
  en: { editor: { name: 'Ray Holden', role: 'managing editor' }, copy: { name: 'Ida Moss', role: 'copy chief' } },
  it: { editor: { name: 'Aldo Ferri', role: 'caporedattore' }, copy: { name: 'Ines Galli', role: 'correttrice' } },
};
export const deskPeople = () => L(DESK);

/** Which articles go through the whole chain: 'all', 'top' (the first three), 'lead' or 'off'. */
export function chainFor(config, rank) {
  const mode = config?.desk?.chain ?? 'top';
  if (mode === 'off' || mode === false) return false;
  if (mode === 'lead') return rank === 0;
  if (mode === 'all') return true;
  return rank < 3;
}

const sentences = (p) => String(p).split(/(?<=[.!?…»”])\s+(?=[A-ZÀ-Ý«“"0-9])/).filter(Boolean);
const draftJson = (t) => JSON.stringify({ kicker: t.kicker, headline: t.headline, dek: t.dek, body: t.body });

function editorPrompt(text, facts, flags) {
  const en = lang() === 'en';
  const { editor } = deskPeople();
  return [
    {
      role: 'system',
      content: en
        ? `You are ${editor.name}, managing editor of The Localhost Times, a daily paper written in the manner of The New Yorker about one person's Mac. You read a reporter's draft against the facts it was written from, and judge it as a real managing editor would:
- the lede: does the first sentence make you read the second?
- the nut: does the piece say why the hour mattered?
- every claim stands on the facts; nothing is invented, nothing is guessed about what was on screen;
- concrete details beat adjectives; no padding, no repetitions, no lecture;
- the headline says something, in few words.
You don't rewrite it yourself. Either it passes, or you send it back with at most three notes, each one precise and doable ("open on the 40 minutes of Xcode, not on the time"; "cut the last sentence: it repeats the second"). Never ask for facts the paper doesn't have.
Reply ONLY with JSON: {"verdict": "ok" | "rework", "notes": ["…"], "praise": "one thing that works, in one sentence"}`
        : `Sei ${editor.name}, caporedattore del Localhost Times, un quotidiano scritto alla maniera del New Yorker sul Mac di una persona. Leggi la bozza di un cronista accanto ai fatti da cui è nata e la giudichi come farebbe un caporedattore vero:
- l'attacco: la prima frase fa leggere la seconda?
- il senso: il pezzo dice perché quell'ora conta?
- ogni affermazione sta sui fatti; niente inventato, niente supposto su cosa ci fosse sullo schermo;
- i dettagli concreti battono gli aggettivi; niente riempitivi, ripetizioni, lezioncine;
- il titolo dice qualcosa, in poche parole.
Non riscrivi tu. O il pezzo passa, o lo rimandi indietro con al massimo tre note, ognuna precisa ed eseguibile («apri sui 40 minuti di Xcode, non sull'orario»; «taglia l'ultima frase: ripete la seconda»). Non chiedere mai fatti che il giornale non ha.
Rispondi SOLO con JSON: {"verdict": "ok" | "rework", "notes": ["…"], "praise": "una cosa riuscita, in una frase"}`,
    },
    {
      role: 'user',
      content: [
        `${en ? 'FACTS' : 'FATTI'}:\n${facts}`,
        `${en ? 'DRAFT' : 'BOZZA'}:\n${en ? 'Headline' : 'Titolo'}: ${text.headline}\n${en ? 'Dek' : 'Occhiello'}: ${text.dek || '—'}\n\n${text.body.join('\n\n')}`,
        flags.length ? `${en ? 'The copy desk already flags' : 'La correzione segnala già'}:\n${flags.map((f) => `- ${f}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

function reworkPrompt(msgs, text, notes) {
  const { editor } = deskPeople();
  return [
    ...msgs,
    { role: 'assistant', content: draftJson(text) },
    {
      role: 'user',
      content: tr({
        en: `${editor.name}, the managing editor, sends the piece back with these notes:\n${notes.map((n) => `- ${n}`).join('\n')}\nRewrite it following them: the same facts, about the same length, nothing invented. Reply ONLY with the JSON.`,
        it: `${editor.name}, il caporedattore, ti rimanda indietro il pezzo con queste note:\n${notes.map((n) => `- ${n}`).join('\n')}\nRiscrivilo seguendole: stessi fatti, lunghezza simile, niente di inventato. Rispondi SOLO con il JSON.`,
      }),
    },
  ];
}

function copyPrompt(bad, facts) {
  const en = lang() === 'en';
  return [
    {
      role: 'system',
      content: en
        ? 'You are the copy chief. Each sentence below quotes a figure (a number or a time) that is not in the facts. Correct each sentence using only figures that are in the facts, or drop the figure and keep the sentence true. Change as little as possible. Reply ONLY with JSON: {"fixes": [{"from": "the sentence as it is", "to": "the corrected sentence"}]}'
        : 'Sei la correttrice. Ogni frase qui sotto cita una cifra (un numero o un orario) che nei fatti non c\'è. Correggi ogni frase usando solo cifre che stanno nei fatti, oppure togli la cifra e lascia la frase vera. Cambia il meno possibile. Rispondi SOLO con JSON: {"fixes": [{"from": "la frase com\'è", "to": "la frase corretta"}]}',
    },
    { role: 'user', content: `${en ? 'FACTS' : 'FATTI'}:\n${facts}\n\n${en ? 'SENTENCES' : 'FRASI'}:\n${bad.map((b) => `- ${b.sentence} [${b.figures.join(', ')}]`).join('\n')}` },
  ];
}

/** The small things a copy desk fixes without asking: double words and spaces, stray punctuation. */
export function tidy(p) {
  let s = String(p);
  const before = s;
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.;:!?])(?=\s|$)/g, '$1').replace(/([,;])(?=[A-Za-zÀ-ÿ«“])/g, '$1 ');
  s = s.replace(/\b(\p{L}{2,})\s+\1\b/giu, '$1'); // "il il", "the the"
  if (lang() === 'it') s = s.replace(/\.\.\./g, '…');
  s = s.replace(/(?<!\.)\.\.(?!\.)/g, '.').replace(/,\./g, '.').replace(/\s+$/, '');
  return { text: s, changed: s !== before };
}

/** Sentences of the body that quote a figure the facts don't contain. */
export function badSentences(body, facts) {
  const known = new Set(figures(facts));
  const out = [];
  body.forEach((p, i) => {
    for (const sentence of sentences(p)) {
      const f = figures(sentence).filter((x) => !known.has(x));
      if (f.length) out.push({ para: i, sentence, figures: f });
    }
  });
  return out;
}

/**
 * The copy desk on a finished text: the figures first (the model fixes the sentences when it
 * can, otherwise the sentence goes, unless it is all the paragraph has), then the small things.
 */
export async function copyDesk(text, facts, { llm, config, chat } = {}) {
  const fixes = [];
  let body = [...text.body];
  const bad = badSentences(body, facts);
  if (bad.length) {
    const known = new Set(figures(facts));
    let proposed = [];
    if (llm && chat) {
      try {
        const j = parseJson(await chat(llm, config, copyPrompt(bad.slice(0, 6), facts), 900));
        proposed = Array.isArray(j?.fixes) ? j.fixes : [];
      } catch { /* the model can't help: cut instead */ }
    }
    for (const b of bad) {
      const fix = proposed.find((x) => typeof x?.from === 'string' && typeof x?.to === 'string' && (x.from.trim() === b.sentence.trim() || b.sentence.includes(x.from.trim().slice(0, 50))));
      const good = fix && fix.to.trim() && figures(fix.to).every((f) => known.has(f));
      if (good) {
        body[b.para] = body[b.para].replace(b.sentence, fix.to.trim());
        fixes.push({ kind: 'figure', from: b.sentence, to: fix.to.trim(), figures: b.figures });
      } else if (sentences(body[b.para]).length > 1) {
        body[b.para] = body[b.para].replace(b.sentence, '').replace(/\s{2,}/g, ' ').trim();
        fixes.push({ kind: 'cut', from: b.sentence, figures: b.figures });
      } else fixes.push({ kind: 'left', from: b.sentence, figures: b.figures });
    }
  }
  let small = 0;
  body = body.map((p) => { const t = tidy(p); if (t.changed) small++; return t.text; }).filter(Boolean);
  const dek = tidy(text.dek || '').text;
  return { text: { ...text, body, dek }, fixes, small };
}

/**
 * The whole chain on a reporter's draft. Never throws: whatever fails, the best text so far is
 * printed. Returns the text with `chain` (and `draft` when the piece was sent back and rewritten).
 */
export async function deskChain(text, { facts, msgs, size, ctx, chat, maxTokens, fromLLM, story, writer }) {
  const { llm, config, log = () => {}, store } = ctx;
  const people = deskPeople();
  const steps = [{ who: 'reporter', name: writer?.name || null, words: wordCount(text), lint: lint(text.body).score }];
  let best = text;
  const check0 = numbersCheck(text, facts);
  const flags = [
    ...(check0.unverified.length ? [tr({ en: `figures not in the facts: ${check0.unverified.join(', ')}`, it: `cifre che nei fatti non ci sono: ${check0.unverified.join(', ')}` })] : []),
    ...lint(text.body).issues.map((i) => i.msg),
  ];
  // 1. the managing editor
  let verdict = 'ok';
  let notes = [];
  let praise = null;
  try {
    const j = parseJson(await chat(llm, config, editorPrompt(text, facts, flags), 1200));
    verdict = j?.verdict === 'rework' ? 'rework' : 'ok';
    notes = (Array.isArray(j?.notes) ? j.notes : []).map((n) => String(n).trim()).filter((n) => n.length > 6).slice(0, 3);
    praise = typeof j?.praise === 'string' && j.praise.trim() ? j.praise.trim().slice(0, 240) : null;
  } catch (e) {
    log(tr({ en: `[desk] ${story.id}: the managing editor didn't answer (${e.message})`, it: `[desk] ${story.id}: il caporedattore non ha risposto (${e.message})` }));
  }
  // invented figures always send a piece back, whatever the editor thought
  if (check0.unverified.length && !notes.some((n) => /\d/.test(n))) {
    notes = [...notes, tr({ en: `Use only the figures in the facts: ${check0.unverified.join(', ')} are not there.`, it: `Usa solo le cifre dei fatti: ${check0.unverified.join(', ')} non ci sono.` })].slice(-3);
    verdict = 'rework';
  }
  if (verdict === 'rework' && !notes.length) verdict = 'ok';
  steps.push({ who: 'editor', name: people.editor.name, verdict, notes, praise });
  if (store) say(store, people.editor.name, verdict === 'rework'
    ? tr({ en: `${writer?.name || 'Reporter'}, “${text.headline}” comes back: ${notes[0]}`, it: `${writer?.name || 'Cronista'}, «${text.headline}» torna indietro: ${notes[0].charAt(0).toLowerCase()}${notes[0].slice(1)}` })
    : tr({ en: `“${text.headline}” passes.${praise ? ` ${praise}` : ''}`, it: `«${text.headline}» passa.${praise ? ` ${praise}` : ''}` }));

  // 2. the reporter rewrites, once
  if (verdict === 'rework') {
    try {
      const raw = await chat(llm, config, reworkPrompt(msgs, text, notes), maxTokens);
      const v2 = fromLLM(parseJson(raw), story, llm.model);
      const c2 = numbersCheck(v2, facts);
      const okLength = wordCount(v2) >= Math.min(size.min * 0.8, wordCount(text) * 0.8);
      const okFacts = c2.unverified.length <= check0.unverified.length;
      const okStyle = lint(v2.body).score >= lint(text.body).score - 5;
      if (okLength && okFacts && okStyle) {
        best = { ...v2, expanded: text.expanded };
        steps.push({ who: 'reporter', name: writer?.name || null, rewrote: true, words: wordCount(v2), lint: lint(v2.body).score });
      } else {
        steps.push({ who: 'reporter', name: writer?.name || null, rewrote: false, why: !okLength ? 'short' : !okFacts ? 'figures' : 'style' });
      }
    } catch (e) {
      steps.push({ who: 'reporter', name: writer?.name || null, rewrote: false, why: 'failed' });
      log(tr({ en: `[desk] ${story.id}: the rewrite failed (${e.message})`, it: `[desk] ${story.id}: la riscrittura non è riuscita (${e.message})` }));
    }
  }

  // 3. the copy desk
  const copy = await copyDesk(best, facts, { llm, config, chat });
  steps.push({ who: 'copy', name: people.copy.name, fixes: copy.fixes, small: copy.small });
  const out = { ...copy.text, chain: steps };
  if (best !== text) out.draft = { headline: text.headline, dek: text.dek, body: text.body };
  return out;
}
