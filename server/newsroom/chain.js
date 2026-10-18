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
import { lint, registerCheck } from './lint.js';
import { numbersCheck, figures } from './factcheck.js';
import { wordCount } from './prompts.js';
import { say } from './chatter.js';

const DESK = {
  en: { editor: { name: 'Ray Holden', role: 'managing editor' }, copy: { name: 'Ida Moss', role: 'copy chief' } },
  it: { editor: { name: 'Aldo Ferri', role: 'caporedattore' }, copy: { name: 'Ines Galli', role: 'correttrice' } },
};
import { chiefOf, chiefPrompt } from './chief.js';

/** The desk's people: the managing editor as the Editor set them (chief.js), the copy chief. */
export const deskPeople = () => { const d = L(DESK); const c = chiefOf(); return { ...d, editor: { ...d.editor, name: c.name } }; };

/**
 * Which articles go through the whole chain: 'triage' (the first three, and every other piece the
 * rules flag), 'all', 'top' (the first three), 'lead' or 'off'. The others still cross the desk:
 * the rules read them and the copy desk tidies them (rulesDesk).
 */
export function chainFor(config, rank, flags = []) {
  const mode = config?.desk?.chain ?? 'triage';
  if (mode === 'off' || mode === false) return false;
  if (mode === 'lead') return rank === 0;
  if (mode === 'all') return true;
  if (mode === 'top') return rank < 3;
  return rank < 3 || flags.length > 0;
}

/** What the rules see in a draft, before anyone reads it: figures not in the facts, the tics of small models. */
export function triageFlags(text, facts) {
  const unverified = numbersCheck(text, facts).unverified;
  return [
    ...(unverified.length ? [{ id: 'figures', msg: tr({ en: `figures not in the facts: ${unverified.join(', ')}`, it: `cifre che nei fatti non ci sono: ${unverified.join(', ')}` }) }] : []),
    ...lint(text.body).issues.map((i) => ({ id: i.id, msg: i.msg })),
  ];
}

/**
 * A piece that doesn't go to the managing editor still crosses the desk, without the model: the
 * rules' findings are noted (with 'triage' there are none, or it would have gone), the copy desk tidies.
 */
export async function rulesDesk(text, facts, { writer, flags = [] } = {}) {
  const people = deskPeople();
  const copy = await copyDesk(text, facts);
  const chain = [
    { who: 'reporter', name: writer?.name || null, words: wordCount(text), lint: lint(text.body).score },
    { who: 'triage', why: flags.length ? 'noted' : 'clean', flags: flags.map((f) => f.msg) },
    { who: 'copy', name: people.copy.name, fixes: copy.fixes, small: copy.small },
  ];
  return { ...copy.text, chain };
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
- it reads as a newspaper, not a dashboard ("signals", "the system records", counts and times in a row) and not as a machine ("it's not just X, it's Y", inflated drama);
- the house voice: cultivated, amused, a touch superior, never cruel; irony from facts placed side by side, the exact verb, a dry closing line;
- the headline is an idea, not a log entry ("app + action + time of day"), in 8 words at most; the dek carries the information;
- the length follows the facts: a short note that says one thing well passes; never ask for more length the facts can't support.
You don't rewrite it yourself. Either it passes, or you send it back with at most three notes, each one precise and doable ("open on the 40 minutes of Xcode, not on the time"; "cut the last sentence: it repeats the second"). Never ask for facts the paper doesn't have.
${chiefPrompt() ? `${chiefPrompt()}\n` : ''}Reply ONLY with JSON: {"verdict": "ok" | "rework", "notes": ["…"], "praise": "one thing that works, in one sentence"}`
        : `Sei ${editor.name}, caporedattore del Localhost Times, un quotidiano scritto alla maniera del New Yorker sul Mac di una persona. Leggi la bozza di un cronista accanto ai fatti da cui è nata e la giudichi come farebbe un caporedattore vero:
- l'attacco: la prima frase fa leggere la seconda?
- il senso: il pezzo dice perché quell'ora conta?
- ogni affermazione sta sui fatti; niente inventato, niente supposto su cosa ci fosse sullo schermo;
- i dettagli concreti battono gli aggettivi; niente riempitivi, ripetizioni, lezioncine;
- si legge come un giornale, non come un cruscotto («segnali», «il sistema registra», conteggi e orari in fila) né come una macchina («non è X, ma Y», drammi gonfiati);
- la voce della casa: colta, divertita, un filo superiore, mai cattiva; l'ironia dai fatti accostati, il verbo esatto, una chiusa asciutta;
- il titolo è un'idea, non una voce di registro («app + azione + momento della giornata»), in massimo 8 parole; il sommario porta l'informazione;
- la lunghezza segue i fatti: una nota breve che dice bene una cosa passa; non chiedere mai più lunghezza di quella che i fatti reggono.
Non riscrivi tu. O il pezzo passa, o lo rimandi indietro con al massimo tre note, ognuna precisa ed eseguibile («apri sui 40 minuti di Xcode, non sull'orario»; «taglia l'ultima frase: ripete la seconda»). Non chiedere mai fatti che il giornale non ha.
${chiefPrompt() ? `${chiefPrompt()}\n` : ''}Rispondi SOLO con JSON: {"verdict": "ok" | "rework", "notes": ["…"], "praise": "una cosa riuscita, in una frase"}`,
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
/**
 * The phrasing desk, sentence by sentence: the sentences with machine-made phrasing ("it's not X,
 * it's Y") or dashboard talk ("signals", "the system records") are sent back one by one and replaced
 * where they stand. Small models rewrite a sentence well and a whole piece badly; the rest of the
 * text is never touched. Used on the hourly articles.
 */
export async function phrasingDesk(paras, { llm, config, chat, report } = {}) {
  if (!llm || !paras?.length) return paras;
  const split = paras.map((p) => sentences(p));
  const bad = [];
  split.forEach((ss, pi) => ss.forEach((t, si) => {
    const r = registerCheck(t);
    if (r.slop.length || r.words.length) bad.push({ pi, si, t, why: [...r.slop, ...r.words.map((x) => x.w)] });
  }));
  if (!bad.length) return paras;
  const list = bad.slice(0, 14);
  try {
    const j = parseJson(await chat(llm, config, [
      {
        role: 'system',
        content: tr({
          en: `You are the copy chief of a good magazine. Rewrite each numbered sentence so that it says the same facts plainly:
- "it's not X, it's Y" → say Y directly; drop the X;
- system words (signals, events, data, activity, session, peak, interactions, consultations, recorded) → say what the person did: opened, read, went back to, wrote;
- no counts, no times of day added; keep the names of things and any quotation word for word;
- one sentence each, the same length or shorter; invent nothing.
Reply ONLY with JSON: {"fixes": [{"n": 1, "to": "..."}]}`,
          it: `Sei la correttrice di un buon magazine. Riscrivi ogni frase numerata perché dica gli stessi fatti in modo semplice:
- «non è X, ma Y» → di' direttamente Y; togli la X;
- parole da sistema (segnali, eventi, dati, attività, sessione, picco, interazioni, consultazioni, registrato) → di' cosa ha fatto la persona: ha aperto, ha letto, è tornato su, ha scritto;
- niente conteggi, niente orari aggiunti; tieni i nomi delle cose e ogni citazione parola per parola;
- una frase ciascuna, lunga uguale o più corta; non inventare nulla.
Rispondi SOLO con JSON: {"fixes": [{"n": 1, "to": "..."}]}`,
        }),
      },
      { role: 'user', content: `${tr({ en: 'THE MOVEMENT', it: 'IL MOVIMENTO' })}:\n${paras.join('\n\n')}\n\n${tr({ en: 'THE SENTENCES TO FIX', it: 'LE FRASI DA CORREGGERE' })}:\n${list.map((b, n) => `${n + 1}. ${b.t}\n   (${b.why.join('; ')})`).join('\n')}` },
    ], 2400));
    let fixed = 0;
    for (const f of Array.isArray(j.fixes) ? j.fixes : []) {
      const b = list[Number(f.n) - 1];
      const to = String(f?.to || '').replace(/\s+/g, ' ').trim();
      if (!b || !to || to.length > b.t.length * 1.3 + 20) continue;
      const before = registerCheck(b.t);
      const after = registerCheck(to);
      // keep the quotes the sentence had
      const quotes = [...b.t.matchAll(/[«“]([^»”]+)[»”]/g)].map((m) => m[1]);
      if (quotes.some((x) => !to.includes(x))) continue;
      if (after.slop.length + after.words.length < before.slop.length + before.words.length) {
        split[b.pi][b.si] = to;
        fixed++;
        report?.push({ from: b.t, to, why: b.why });
      }
    }
    return fixed ? split.map((ss) => ss.join(' ')) : paras;
  } catch { return paras; }
}

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

/** The managing editor reads a version: his verdict, at most three notes, what works. */
async function editorRead(text, facts, { llm, config, chat, log, story }) {
  const check = numbersCheck(text, facts);
  const flags = [
    ...(check.unverified.length ? [tr({ en: `figures not in the facts: ${check.unverified.join(', ')}`, it: `cifre che nei fatti non ci sono: ${check.unverified.join(', ')}` })] : []),
    ...lint(text.body).issues.map((i) => i.msg),
  ];
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
  if (check.unverified.length && !notes.some((n) => /\d/.test(n))) {
    notes = [...notes, tr({ en: `Use only the figures in the facts: ${check.unverified.join(', ')} are not there.`, it: `Usa solo le cifre dei fatti: ${check.unverified.join(', ')} non ci sono.` })].slice(-3);
    verdict = 'rework';
  }
  if (verdict === 'rework' && !notes.length) verdict = 'ok';
  return { verdict, notes, praise, check };
}

/**
 * The whole chain on a reporter's draft. Never throws: whatever fails, the best text so far is
 * printed. Returns the text with `chain` (and `draft` when the piece was sent back and rewritten).
 * A piece sent back is rewritten once and read again: if the managing editor still isn't satisfied,
 * his last notes stay on the slip, for the Editor to act on.
 */
export async function deskChain(text, { facts, msgs, ctx, chat, maxTokens, fromLLM, story, writer, triage = null }) {
  const { llm, config, log = () => {}, store, progress = () => {} } = ctx;
  const people = deskPeople();
  const steps = [{ who: 'reporter', name: writer?.name || null, words: wordCount(text), lint: lint(text.body).score }];
  // why the piece went to the managing editor: its place on the page, or what the rules saw
  if (triage) steps.push({ who: 'triage', why: triage.why, flags: (triage.flags || []).map((f) => f.msg) });
  let best = text;

  // 1. the managing editor
  progress('editor');
  const first = await editorRead(text, facts, { llm, config, chat, log, story });
  steps.push({ who: 'editor', name: people.editor.name, verdict: first.verdict, notes: first.notes, praise: first.praise });
  if (store) say(store, people.editor.name, first.verdict === 'rework'
    ? tr({ en: `${writer?.name || 'Reporter'}, “${text.headline}” comes back: ${first.notes[0]}`, it: `${writer?.name || 'Cronista'}, «${text.headline}» torna indietro: ${first.notes[0].charAt(0).toLowerCase()}${first.notes[0].slice(1)}` })
    : tr({ en: `“${text.headline}” passes.${first.praise ? ` ${first.praise}` : ''}`, it: `«${text.headline}» passa.${first.praise ? ` ${first.praise}` : ''}` }));

  // 2. the reporter rewrites, once, and the managing editor reads it again
  if (first.verdict === 'rework') {
    progress('rewrite');
    try {
      const raw = await chat(llm, config, reworkPrompt(msgs, text, first.notes), maxTokens, { onText: ctx.onText });
      const v2 = fromLLM(parseJson(raw), story, llm.model);
      const c2 = numbersCheck(v2, facts);
      // the notes often ask to cut: only a piece that collapsed is refused for its length
      const okLength = wordCount(v2) >= Math.min(20, wordCount(text)) && wordCount(v2) >= wordCount(text) * 0.3;
      const okFacts = c2.unverified.length <= first.check.unverified.length;
      const okStyle = lint(v2.body).score >= lint(text.body).score - 10;
      if (okLength && okFacts && okStyle) {
        best = { ...v2, expanded: text.expanded };
        steps.push({ who: 'reporter', name: writer?.name || null, rewrote: true, words: wordCount(v2), lint: lint(v2.body).score });
        progress('reread');
        const again = await editorRead(v2, facts, { llm, config, chat, log, story });
        steps.push({ who: 'editor', name: people.editor.name, reread: true, verdict: again.verdict, notes: again.notes, praise: again.praise });
      } else {
        steps.push({ who: 'reporter', name: writer?.name || null, rewrote: false, why: !okLength ? 'short' : !okFacts ? 'figures' : 'style' });
      }
    } catch (e) {
      steps.push({ who: 'reporter', name: writer?.name || null, rewrote: false, why: 'failed' });
      log(tr({ en: `[desk] ${story.id}: the rewrite failed (${e.message})`, it: `[desk] ${story.id}: la riscrittura non è riuscita (${e.message})` }));
    }
  }

  // 3. the copy desk
  progress('copy');
  const copy = await copyDesk(best, facts, { llm, config, chat });
  steps.push({ who: 'copy', name: people.copy.name, fixes: copy.fixes, small: copy.small });
  const out = { ...copy.text, chain: steps };
  if (best !== text) out.draft = { headline: text.headline, dek: text.dek, body: text.body };
  return out;
}
