import React, { useState } from 'react';
import { href } from '../lib.js';
import { tr, quote } from '../i18n.js';
import Para from './Para.jsx';

/*
 * The craft, shown on the paper itself: how an article is built (its parts, and what each part
 * does or fails to do), and one note per edition from the managing editor. Plain rules, no model:
 * they work on every article, old ones included.
 */

const T = tr({
  en: {
    role: { lede: 'Lede', nut: 'Why it matters', quote: 'Quote', source: 'Source', body: 'Development', kicker: 'Kicker' },
    what: {
      lede: 'The first sentence decides whether the reader stays.',
      nut: 'It tells the reader why this story is not the usual one.',
      quote: 'A voice in the piece: attributed, and it comes from you.',
      source: 'A protected source: the tip is attributed without saying who.',
      body: 'The details, in order of importance.',
      kicker: 'The last line is the one that stays.',
    },
    timeLede: 'It opens on the time: a strong lede opens on the most interesting fact; the time can come later.',
    longLede: (n) => `A long lede (${n} words): a good one has 20-35.`,
    concrete: 'A concrete fact straight away: a number or a title in the first sentence.',
    timeAgain: 'Another sentence that opens on a time: vary the starts.',
    maybeMaybe: 'Two “perhaps”: decide, or cut.',
    absence: 'An absence nobody can know (“no likes”): cut it.',
    adjectives: (w) => `Inflated words (${w}): let the facts do the work.`,
    shortKicker: 'A short ending: it lands.',
    flatKicker: 'An ending that repeats data: an image or a dry line works better.',
    missingNut: 'Missing here: why it matters. One sentence saying why this story is not the usual one.',
    hl: { long: (n) => `A long headline (${n} words): 12 at most.`, colon: 'A headline with a colon is often two headlines: try saying it in one sentence.', good: 'A short, whole headline.', number: 'A number in the headline: concrete.' },
    headline: 'Headline', note: 'The managing editor\'s note', look: (h) => `Look at ${quote(h)}:`, see: 'See how it\'s built →',
    xray: 'How it\'s built', xrayOff: 'Hide the anatomy',
    path: 'How the piece got here', reporter: 'Reporter', editorWho: 'Managing editor', copyWho: 'Copy desk', rulesWho: 'The rules', chiefWho: 'The Editor',
    triage: { front: 'on the front page: it goes to the managing editor', flags: (n) => `flag ${n === 1 ? 'one thing' : `${n} things`}: it goes to the managing editor`, noted: (n) => `flag ${n === 1 ? 'one thing' : `${n} things`}`, clean: 'find nothing to flag' },
    hand: { edit: 'edits it by hand', headline: 'changes the headline', rewrite: 'has it rewritten', paragraph: 'rewrites a paragraph', cut: 'cuts a paragraph', approve: 'passes it for press', note: 'sends it back with a note' }, newFacts: 'New facts', updated: (a, b) => `${a} → ${b} signals: the reporter brings it up to date`, pressWho: 'The press', press: { approved: 'prints it as the Editor passed it', 'as-is': 'prints the draft as it was' }, phrased: (n) => `rephrases ${n === 1 ? 'one sentence' : `${n} sentences`} that read like a machine`,
    wrote: (n) => `writes the draft: ${n} words`, passes: 'passes it', sendsBack: 'sends it back', rewrote: (n) => `rewrites it: ${n} words`,
    keptFirst: { short: 'tries again, but the new version is too short: the first one stays', figures: 'tries again, but the new version invents figures: the first one stays', style: 'tries again, but the new version reads worse: the first one stays', failed: 'doesn\'t manage to rewrite it: the first one stays' },
    clean: 'checks every figure against the signals: all there', fixed: 'corrects', cut: 'cuts', left: 'flags, but leaves (it is the whole paragraph)', small: (n) => `${n} small thing${n === 1 ? '' : 's'} tidied (spaces, doubled words)`, flagged: (n) => `checks every figure against the signals: ${n === 1 ? 'one sentence' : `${n} sentences`} quoted figures that aren't there`,
    showDraft: 'See the first draft', hideDraft: 'Hide the first draft', draft: 'The first draft', notIn: 'not in the signals',
    credits: (e, c) => `Edited by ${e} · copy by ${c}`,
    tips: [
      'Inverted pyramid: the most important fact first, then the details in order of importance. The reader may stop anywhere and still have the news.',
      'Show, don\'t tell: not “a frantic afternoon” but the three facts that make it frantic.',
      'Strong verbs carry a sentence; adjectives weigh it down.',
      'One telling detail is worth ten listed facts: choose the one that says the most.',
      'The kicker is not a summary: end on an image, a quote, or a dry line.',
      'Vary sentence length: a long sentence, then a short one. It lands.',
      'Attribute everything that is not a signal: “the owner said”, “a source close to the owner”.',
      'A headline is a sentence with a verb, not a label.',
    ],
  },
  it: {
    role: { lede: 'Attacco', nut: 'Perché conta', quote: 'Citazione', source: 'Fonte', body: 'Sviluppo', kicker: 'Chiusa' },
    what: {
      lede: 'La prima frase decide se il lettore resta.',
      nut: 'Dice al lettore perché questa storia non è la solita.',
      quote: 'Una voce nel pezzo: attribuita, e viene da te.',
      source: 'Una fonte protetta: la soffiata è attribuita senza dire chi.',
      body: 'I dettagli, in ordine di importanza.',
      kicker: 'L\'ultima riga è quella che resta.',
    },
    timeLede: 'Comincia dall\'orario: un attacco forte parte dal fatto più interessante; l\'orario può venire dopo.',
    longLede: (n) => `Attacco lungo (${n} parole): quello buono ne ha 20-35.`,
    concrete: 'Un fatto concreto subito: un numero o un titolo nella prima frase.',
    timeAgain: 'Un\'altra frase che comincia con un orario: varia gli inizi.',
    maybeMaybe: 'Due «forse»: decidi, o taglia.',
    absence: 'Un\'assenza che nessuno può sapere («nessun like»): tagliala.',
    adjectives: (w) => `Parole gonfie (${w}): lascia lavorare i fatti.`,
    shortKicker: 'Chiusa breve: arriva.',
    flatKicker: 'Una chiusa che ripete dati: meglio un\'immagine o una riga asciutta.',
    missingNut: 'Qui mancava il perché conta: una frase che dica perché questa storia non è la solita.',
    hl: { long: (n) => `Titolo lungo (${n} parole): al massimo 12.`, colon: 'Un titolo con i due punti spesso sono due titoli: prova a dirlo in una frase.', good: 'Titolo corto e intero.', number: 'Un numero nel titolo: concreto.' },
    headline: 'Titolo', note: 'La nota del caporedattore', look: (h) => `Guarda ${quote(h)}:`, see: 'Vedi com\'è fatto →',
    xray: 'Come è fatto', xrayOff: 'Nascondi l\'anatomia',
    path: 'Il percorso del pezzo', reporter: 'Cronista', editorWho: 'Caporedattore', copyWho: 'Correzione', rulesWho: 'Le regole', chiefWho: 'Il Direttore',
    triage: { front: 'in prima pagina: passa dal caporedattore', flags: (n) => `${n === 1 ? 'segnalano una cosa' : `segnalano ${n} cose`}: passa dal caporedattore`, noted: (n) => (n === 1 ? 'segnalano una cosa' : `segnalano ${n} cose`), clean: 'non trovano niente da segnalare' },
    hand: { edit: 'lo ritocca a mano', headline: 'cambia il titolo', rewrite: 'lo fa riscrivere', paragraph: 'riscrive un paragrafo', cut: 'taglia un paragrafo', approve: 'dà il visto', note: 'lo rimanda con una nota' }, newFacts: 'Fatti nuovi', updated: (a, b) => `${a} → ${b} segnali: il cronista lo aggiorna`, pressWho: 'La stampa', press: { approved: 'lo stampa come l\'ha visto il Direttore', 'as-is': 'stampa la bozza così com\'era' }, phrased: (n) => `riformula ${n === 1 ? 'una frase' : `${n} frasi`} che suonavano da macchina`,
    wrote: (n) => `scrive la bozza: ${n} parole`, passes: 'lo passa', sendsBack: 'lo rimanda indietro', rewrote: (n) => `lo riscrive: ${n} parole`,
    keptFirst: { short: 'ci riprova, ma la nuova versione è troppo corta: resta la prima', figures: 'ci riprova, ma la nuova versione inventa cifre: resta la prima', style: 'ci riprova, ma la nuova versione si legge peggio: resta la prima', failed: 'non riesce a riscriverlo: resta la prima' },
    clean: 'controlla ogni cifra sui segnali: ci sono tutte', fixed: 'corregge', cut: 'taglia', left: 'segnala, ma lascia (è tutto il paragrafo)', small: (n) => `${n === 1 ? 'una piccolezza sistemata' : `${n} piccolezze sistemate`} (spazi, parole doppie)`, flagged: (n) => `controlla ogni cifra sui segnali: ${n === 1 ? 'una frase citava' : `${n} frasi citavano`} cifre che non ci sono`,
    showDraft: 'Vedi la prima bozza', hideDraft: 'Nascondi la prima bozza', draft: 'La prima bozza', notIn: 'non nei segnali',
    credits: (e, c) => `Rivisto da ${e} · corretto da ${c}`,
    tips: [
      'Piramide rovesciata: prima il fatto più importante, poi i dettagli in ordine di importanza. Il lettore può fermarsi in qualsiasi punto e avere comunque la notizia.',
      'Mostra, non dire: non «un pomeriggio frenetico», ma i tre fatti che lo rendono frenetico.',
      'I verbi forti reggono la frase; gli aggettivi la appesantiscono.',
      'Un dettaglio rivelatore vale dieci fatti elencati: scegli quello che dice di più.',
      'La chiusa non è un riassunto: finisci su un\'immagine, una citazione o una riga asciutta.',
      'Alterna la lunghezza delle frasi: una lunga, poi una breve. Arriva.',
      'Attribuisci tutto ciò che non è un segnale: «ha detto il proprietario», «una fonte vicina al proprietario».',
      'Un titolo è una frase con un verbo, non un\'etichetta.',
    ],
  },
});

const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
const TIME_START = /^(alle|verso le|poco dopo le|at|around|by)\s+\d{1,2}[:.]\d{2}/i;
const QUOTE = /[«“][^»”]{3,}[»”][^.]{0,60}\b(dichiarato|detto|risposto|said|told|answered|replied)\b|\b(dichiarato|detto|risposto|said|told)\b[^.]{0,40}[«“]/i;
const SOURCE = /fonte vicina|source close/i;
const NO_COMMENT = /non ha voluto commentare|non aveva risposto|non ha risposto|declined to comment|had not replied|did not reply/i;
const MATTERS = /\b(più|meno|primato|record|di fila|volte|rispetto|per la prima|puntata|ancora|di nuovo|perch[eé]|significa|segno|more than|fewer|in a row|times|compared|first time|again|why|means|instalment)\b/i;
const INFLATED = /\b(estremamente|cruciale|fondamentale|straordinari\w*|incredibil\w*|intens\w*|tenacia|maestria|immers\w*|extremely|crucial|fundamental|extraordinary|incredible|intense|tenacity|mastery|immersed|seamless)\b/gi;
const ABSENCE = /\b(nessun (like|commento|clic|click)|senza (like|commenti)|no (likes|comments|clicks))\b/i;
const MAYBE2 = /\b(forse|perhaps)\b[^.]{0,80}\b(forse|perhaps)\b/i;

/** The parts of an article, each with what it does and what could be better. */
export function anatomy(a) {
  const body = a?.body || [];
  const n = body.length;
  const parts = body.map((p, i) => {
    let role = 'body';
    if (i === 0) role = 'lede';
    else if (QUOTE.test(p) || NO_COMMENT.test(p)) role = 'quote';
    else if (SOURCE.test(p)) role = 'source';
    else if (i === n - 1 && n >= 3) role = 'kicker';
    else if (i <= 2 && MATTERS.test(p)) role = 'nut';
    return { p, role, notes: [] };
  });
  // only the first "why it matters" is one; the others are development
  let seenNut = false;
  for (const x of parts) {
    if (x.role !== 'nut') continue;
    if (seenNut) x.role = 'body';
    seenNut = true;
  }
  for (const x of parts) {
    const add = (good, text) => x.notes.push({ good, text });
    const firstSentence = x.p.split(/(?<=[.!?»”])\s/)[0];
    const infl = [...new Set((x.p.match(INFLATED) || []).map((w) => w.toLowerCase()))];
    if (x.role === 'lede') {
      if (TIME_START.test(x.p)) add(false, T.timeLede);
      const w = words(firstSentence);
      if (w > 40) add(false, T.longLede(w));
      if (/\d|[«“]/.test(firstSentence) && !TIME_START.test(x.p)) add(true, T.concrete);
    } else if (x.role === 'kicker') {
      if (words(x.p) <= 30 && !TIME_START.test(x.p)) add(true, T.shortKicker);
      else if ((x.p.match(/\d+/g) || []).length >= 3) add(false, T.flatKicker);
    } else if (x.role === 'body' && TIME_START.test(x.p)) add(false, T.timeAgain);
    if (MAYBE2.test(x.p)) add(false, T.maybeMaybe);
    if (ABSENCE.test(x.p)) add(false, T.absence);
    if (infl.length) add(false, T.adjectives(infl.slice(0, 3).join(', ')));
  }
  const missingNut = n >= 3 && !parts.some((x) => x.role === 'nut');
  const h = a?.headline || '';
  const hw = words(h);
  const headline = [];
  if (hw > 12) headline.push({ good: false, text: T.hl.long(hw) });
  if (/:/.test(h)) headline.push({ good: false, text: T.hl.colon });
  if (hw <= 10 && !/:/.test(h)) headline.push({ good: true, text: T.hl.good });
  if (/\d/.test(h)) headline.push({ good: true, text: T.hl.number });
  return { parts, missingNut, headline };
}

/** The three hands a piece passed through: reporter, managing editor, copy desk. */
export function Passage({ a }) {
  const [open, setOpen] = useState(false);
  const steps = a?.chain;
  if (!steps?.length) return null;
  const who = { reporter: T.reporter, editor: T.editorWho, copy: T.copyWho, triage: T.rulesWho, chief: T.chiefWho, update: T.newFacts, press: T.pressWho };
  const line = (x) => {
    if (x.who === 'reporter' && x.rewrote === undefined) return T.wrote(x.words);
    if (x.who === 'reporter') return x.rewrote ? T.rewrote(x.words) : T.keptFirst[x.why] || T.keptFirst.failed;
    if (x.who === 'editor') return x.verdict === 'rework' ? T.sendsBack : T.passes;
    if (x.who === 'triage') return x.why === 'clean' ? T.triage.clean : x.why === 'noted' ? T.triage.noted(x.flags.length) : x.flags?.length ? T.triage.flags(x.flags.length) : T.triage.front;
    if (x.who === 'chief') return `${T.hand[x.kind] || T.hand.edit}${x.instruction ? ` ${quote(x.instruction)}` : ''}`;
    if (x.who === 'update') return T.updated(x.signals?.[0] ?? 0, x.signals?.[1] ?? 0);
    if (x.who === 'press') return T.press[x.kind] || '';
    const n = (x.fixes || []).length;
    return `${n ? T.flagged(n) : T.clean}${x.phrasing?.length ? ` · ${T.phrased(x.phrasing.length)}` : ''}${x.small ? ` · ${T.small(x.small)}` : ''}`;
  };
  return (
    <div className="passage">
      <span className="lbl">{T.path}</span>
      <ol>
        {steps.map((x, i) => (
          <li key={i} className={`step step-${x.who}${x.verdict === 'rework' ? ' sent-back' : ''}`}>
            <span className="step-who">{who[x.who]}{x.name ? <em> · {x.name}</em> : null}</span>
            <span className="step-what">{line(x)}</span>
            {x.who === 'editor' && x.notes?.length > 0 && x.verdict === 'rework' && <ul className="step-notes">{x.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>}
            {x.who === 'editor' && x.praise && <p className="step-praise">{quote(x.praise)}</p>}
            {x.who === 'copy' && x.fixes?.length > 0 && (
              <ul className="step-fixes">
                {x.fixes.map((f, k) => (
                  <li key={k} className={`fix-${f.kind}`}>
                    <span className="fix-how">{T[f.kind === 'figure' ? 'fixed' : f.kind]}</span>{' '}
                    <del>{f.from}</del>{f.to && <> → <ins>{f.to}</ins></>}
                    <span className="fix-figs"> ({f.figures.join(', ')}: {T.notIn})</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {a.draft && (
        <>
          <button className="linkish" onClick={() => setOpen(!open)}>{open ? T.hideDraft : T.showDraft}</button>
          {open && (
            <div className="first-draft">
              <span className="lbl">{T.draft}</span>
              <h3>{a.draft.headline}</h3>
              {a.draft.dek && <p className="dek">{a.draft.dek}</p>}
              {a.draft.body.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "Edited by … · copy by …": the credits at the foot of a piece that went through the desk. */
export function DeskCredits({ a }) {
  const ed = a?.chain?.find((x) => x.who === 'editor');
  const cp = a?.chain?.find((x) => x.who === 'copy');
  if (!ed || !cp) return null;
  return <p className="desk-credits">{T.credits(ed.name, cp.name)}</p>;
}

/** The article's body with its anatomy: parts coloured and labelled, notes in the margin. */
export function Xray({ a }) {
  const { parts, missingNut, headline } = anatomy(a);
  return (
    <div className="xray">
      <Passage a={a} />
      {headline.length > 0 && (
        <div className="xray-part xray-headline">
          <span className="xray-label">{T.headline}</span>
          <ul className="xray-notes">{headline.map((x, i) => <li key={i} className={x.good ? 'good' : 'bad'}>{x.text}</li>)}</ul>
        </div>
      )}
      {parts.map((x, i) => (
        <React.Fragment key={i}>
          <div className={`xray-part role-${x.role}`}>
            <span className="xray-label">{T.role[x.role]}</span>
            <Para a={a} p={x.p} />
            <ul className="xray-notes">
              <li className="what">{T.what[x.role]}</li>
              {x.notes.map((nt, k) => <li key={k} className={nt.good ? 'good' : 'bad'}>{nt.text}</li>)}
            </ul>
          </div>
          {i === 0 && missingNut && (
            <div className="xray-part role-nut missing">
              <span className="xray-label">{T.role.nut}</span>
              <p>{T.missingNut}</p>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export const xrayLabels = () => ({ on: T.xrayOff, off: T.xray });

const seed = (s) => [...String(s)].reduce((h, c) => ((h * 31) + c.charCodeAt(0)) >>> 0, 7);

/** One note per edition: a good or a bad example from this very paper, or a technique to remember. */
export function editorNote(edition) {
  const arts = (edition?.articles || []).filter((a) => a.body?.length);
  const h = seed(edition?.id || '');
  const praise = h % 2 === 0;
  const found = [];
  for (const a of arts) {
    const an = anatomy(a);
    for (const x of an.headline) found.push({ a, good: x.good, text: x.text, kind: 'headline' });
    for (const p of an.parts) for (const nt of p.notes) found.push({ a, good: nt.good, text: nt.text, kind: p.role });
    if (an.missingNut) found.push({ a, good: false, text: T.missingNut, kind: 'nut' });
    if (an.parts.some((p) => p.role === 'quote')) found.push({ a, good: true, text: T.what.quote, kind: 'quote' });
  }
  const pool = found.filter((f) => f.good === praise);
  const pick = (pool.length ? pool : found)[h % Math.max(1, (pool.length ? pool : found).length)];
  if (pick) return { article: pick.a, good: pick.good, text: pick.text };
  return { article: null, good: true, text: T.tips[h % T.tips.length] };
}

/** In the Brief box: the managing editor's note on this edition. */
export function EditorNote({ edition }) {
  const n = editorNote(edition);
  if (!n) return null;
  return (
    <div className={`editor-note ${n.good ? 'good' : 'bad'}`}>
      <span className="lbl">✎ {T.note}</span>
      <p>
        {n.article && <>{T.look(n.article.headline)} </>}{n.article ? n.text.charAt(0).toLowerCase() + n.text.slice(1) : n.text}
        {n.article && <> <a href={`${href.article(edition.id, n.article.id)}/x`}>{T.see}</a></>}
      </p>
    </div>
  );
}
