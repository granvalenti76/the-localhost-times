import React from 'react';
import { isTypeset } from '../lib.js';
import { tr, quote } from '../i18n.js';

/*
 * The desk, shown to the Editor: the routing slip of every piece (who read it, what they decided)
 * and its workings (the managing editor's notes, the copy desk's fixes, the first draft set against
 * the piece on the page, word by word). Everything comes from the passages kept with the article.
 */

const T = tr({
  en: {
    reporter: 'Reporter', triage: 'Rules', editor: 'Managing editor', rewrite: 'Rewrite', copy: 'Copy desk', chief: 'You', page: 'On the page', proof: 'In proof',
    words: (n) => `${n} words`, draft: 'draft',
    front: 'front page: to the editor', byChief: 'your note: you read it, not the managing editor', byIntern: 'the intern: straight to you', byTrusted: 'trusted byline: only the copy desk', flags: (n) => `${n} thing${n === 1 ? '' : 's'} flagged`, clean: 'nothing to flag',
    passes: 'passes', sendsBack: (n) => `sends it back · ${n} note${n === 1 ? '' : 's'}`,
    rewrote: (n) => `rewrites · ${n} words`, kept: 'not managed: the version before stays',
    reread: 'Rereads', stillNo: (n) => `not yet · ${n} note${n === 1 ? '' : 's'}`, stampPending: 'Notes to do',
    pendingTitle: (n) => `${n} still asks for this`, pendingKept: (n) => `${n} sent it back, but the rewrite didn't hold: the notes are still to do`,
    changed: 'What changed', same: 'The reporter handed in the same text: the note wasn\'t followed. Try a more precise note, or retouch it yourself.', before2: 'Before', now: 'Now', yourNote: 'Your note', factsCame: (a, b) => `New facts: ${a} → ${b} signals`, editorNotes: 'The managing editor\'s notes',
    fixes: (n) => `${n} fix${n === 1 ? '' : 'es'}`, tidy: 'all in order',
    hand: { edit: 'edits by hand', headline: 'changes the headline', rewrite: 'has it rewritten', paragraph: (p) => `rewrites ¶${p + 1}`, cut: (p) => `cuts ¶${p + 1}`, approve: 'passes it for press', note: 'sends it back with a note' },
    before: 'Before', versions: (n) => (n === 1 ? 'one earlier version' : `${n} earlier versions`), newFacts: 'New facts', grew: (a, b) => `${a} → ${b} signals`, updates: (n) => `updates it · ${n} words`, asIs: 'as it was', approvedPress: 'as you passed it',
    typeset: 'Automatic typesetting: no writer, so no desk.', commissioned: 'Commissioned: written with you, approved by you.', old: 'Printed before every piece crossed the desk.',
    stampOk: 'Passed', stampYours: 'Yours to read', stampBack: 'Sent back', stampClean: 'Clean', stampNoted: 'Check it', notRead: 'The managing editor didn\'t read it: with this setting only the first three go to him.',
    verdictOf: (n) => `The verdict of ${n}`, managing: 'managing editor', notes: 'The notes', praise: 'What works',
    rulesSaw: 'What the rules saw', frontWhy: 'On the front page: the managing editor reads it anyway.',
    copyOf: (n) => `${n}, copy desk`, figureFix: 'fixes a figure not in the facts', cutFix: 'cuts a figure not in the facts', leftFix: 'flags a figure, leaves it (it is the whole paragraph)',
    phrasing: 'rephrases', small: (n) => `${n} small thing${n === 1 ? '' : 's'} tidied (spaces, doubled words)`,
    yourHand: 'Your hand', firstDraft: 'First draft', onPage: 'On the page', legend: 'struck through: cut · underlined: added',
    untouched: 'The piece went to the page as the reporter wrote it.', noDraft: 'The first draft was not kept for this piece.',
    keptWhy: { short: 'the new version came out too short', figures: 'the new version invented figures', style: 'the new version read worse', failed: 'the rewrite failed' },
    round: 'Round the desk', pieces: (n) => `${n} piece${n === 1 ? '' : 's'}`, sentBack: 'sent back', passedFirst: 'passed first time', cleanN: 'clean to the rules', fixesN: 'fixes', handN: 'by your hand',
  },
  it: {
    reporter: 'Cronista', triage: 'Regole', editor: 'Caporedattore', rewrite: 'Riscrittura', copy: 'Correttrice', chief: 'Lei', page: 'In pagina', proof: 'In bozza',
    words: (n) => `${n} parole`, draft: 'bozza',
    front: 'prima pagina: al caporedattore', byChief: 'tuo biglietto: lo rileggi tu, non il caporedattore', byIntern: 'lo stagista: arriva dritto a te', byTrusted: 'firma di fiducia: solo il correttore', flags: (n) => `${n === 1 ? 'una cosa segnalata' : `${n} cose segnalate`}`, clean: 'niente da segnalare',
    passes: 'passa', sendsBack: (n) => `rimanda indietro · ${n === 1 ? 'una nota' : `${n} note`}`,
    rewrote: (n) => `riscrive · ${n} parole`, kept: 'non ci riesce: resta la versione di prima',
    reread: 'Rilegge', stillNo: (n) => `non ancora · ${n === 1 ? 'una nota' : `${n} note`}`, stampPending: 'Note da fare',
    pendingTitle: (n) => `${n} chiede ancora questo`, pendingKept: (n) => `${n} l'ha rimandato indietro, ma la riscrittura non ha tenuto: le note sono ancora da fare`,
    changed: 'Cosa è cambiato', same: 'Il cronista ha consegnato lo stesso testo: la nota non è stata seguita. Provi con una nota più precisa, o lo ritocchi lei.', before2: 'Prima', now: 'Adesso', yourNote: 'La sua nota', factsCame: (a, b) => `Fatti nuovi: ${a} → ${b} segnali`, editorNotes: 'Le note del caporedattore',
    fixes: (n) => `${n === 1 ? 'una correzione' : `${n} correzioni`}`, tidy: 'tutto in ordine',
    hand: { edit: 'ritocca a mano', headline: 'cambia il titolo', rewrite: 'fa riscrivere', paragraph: (p) => `riscrive il §${p + 1}`, cut: (p) => `taglia il §${p + 1}`, approve: 'dà il visto', note: 'rimanda con una nota' },
    before: 'Prima', versions: (n) => (n === 1 ? 'una versione precedente' : `${n} versioni precedenti`), newFacts: 'Fatti nuovi', grew: (a, b) => `${a} → ${b} segnali`, updates: (n) => `aggiorna · ${n} parole`, asIs: 'così com\'era', approvedPress: 'come l\'ha vista lei',
    typeset: 'Tipografia automatica: senza redattore, niente tavolo.', commissioned: 'Su commissione: scritto con lei, approvato da lei.', old: 'Stampato prima che ogni pezzo passasse dal tavolo.',
    stampOk: 'Passa', stampYours: 'Lo rileggi tu', stampBack: 'Rimandato', stampClean: 'Pulito', stampNoted: 'Da rivedere', notRead: 'Il caporedattore non l\'ha letto: con questa impostazione gli arrivano solo i primi tre.',
    verdictOf: (n) => `Il verdetto di ${n}`, managing: 'caporedattore', notes: 'Le note', praise: 'Cosa funziona',
    rulesSaw: 'Cosa hanno visto le regole', frontWhy: 'È in prima pagina: il caporedattore lo legge comunque.',
    copyOf: (n) => `${n}, correttrice`, figureFix: 'corregge una cifra che nei fatti non c\'è', cutFix: 'taglia una cifra che nei fatti non c\'è', leftFix: 'segnala una cifra, ma la lascia (è tutto il paragrafo)',
    phrasing: 'riformula', small: (n) => `${n === 1 ? 'una piccolezza sistemata' : `${n} piccolezze sistemate`} (spazi, parole doppie)`,
    yourHand: 'La sua mano', firstDraft: 'Prima bozza', onPage: 'In pagina', legend: 'barrato: tolto · sottolineato: aggiunto',
    untouched: 'Il pezzo è andato in pagina come l\'ha scritto il cronista.', noDraft: 'Di questo pezzo la prima bozza non è stata conservata.',
    keptWhy: { short: 'la nuova versione era troppo corta', figures: 'la nuova versione inventava cifre', style: 'la nuova versione si leggeva peggio', failed: 'la riscrittura non è riuscita' },
    round: 'Il giro del tavolo', pieces: (n) => `${n === 1 ? 'un pezzo' : `${n} pezzi`}`, sentBack: 'rimandati indietro', passedFirst: 'passati al primo colpo', cleanN: 'puliti alle regole', fixesN: 'correzioni', handN: 'di sua mano',
  },
});

const words = (body) => (body || []).join(' ').split(/\s+/).filter(Boolean).length;

const boundary = (x) => x.who === 'update' || (x.who === 'chief' && x.kind === 'note');
/** Where the current version of a piece starts in its passages (0 if it has only one). */
const lastVersion = (steps) => Math.max(0, steps.findLastIndex(boundary));
const versionsBefore = (steps, cut) => 1 + steps.slice(0, cut).filter(boundary).length;

/** The routing slip of the current version: one stop per hand the piece went through. */
export function trackOf(a, { draft = false } = {}) {
  if (a.kind === 'commissioned') return { note: T.commissioned, stops: [] };
  const steps = a.chain || [];
  if (!steps.length) return { note: isTypeset(a.writer) ? T.typeset : T.old, stops: [] };
  // a new version starts with new facts or with the Editor's note: the earlier ones fold into one stop
  const cut = lastVersion(steps);
  const stops = cut > 0 ? [{ who: 'before', label: T.before, what: T.versions(versionsBefore(steps, cut)), tone: 'plain' }] : [];
  let reporterSeen = cut > 0;
  let fresh = false; // the next reporter step is a new version (an update, or the Editor's note)
  let pressed = null;
  for (const x of steps.slice(cut)) {
    if (x.who === 'reporter' && (!reporterSeen || fresh)) {
      const what = !reporterSeen ? T.words(x.words) : fresh === 'note' ? T.rewrote(x.words) : T.updates(x.words);
      stops.push({ who: 'reporter', label: T.reporter, name: x.name, what, tone: reporterSeen ? 'fix' : 'plain' });
      reporterSeen = true;
      fresh = false;
    } else if (x.who === 'update') {
      stops.push({ who: 'update', label: T.newFacts, what: T.grew(x.signals?.[0] ?? 0, x.signals?.[1] ?? 0), tone: 'warn' });
      fresh = 'update';
    } else if (x.who === 'press') {
      pressed = x.kind;
    } else if (x.who === 'reporter') {
      stops.push({ who: 'rewrite', label: T.rewrite, name: x.name, what: x.rewrote ? T.rewrote(x.words) : T.kept, tone: x.rewrote ? 'fix' : 'back' });
    } else if (x.who === 'triage') {
      const n = x.flags?.length || 0;
      stops.push({ who: 'triage', label: T.triage, what: x.why === 'chief' ? T.byChief : x.why === 'intern' ? T.byIntern : x.why === 'trusted' ? T.byTrusted : x.why === 'clean' ? T.clean : x.why === 'front' && !n ? T.front : T.flags(n), tone: x.why === 'clean' ? 'ok' : n ? 'warn' : 'plain' });
    } else if (x.who === 'editor') {
      const no = x.verdict === 'rework';
      const what = x.reread ? (no ? T.stillNo(x.notes?.length || 0) : T.passes) : no ? T.sendsBack(x.notes?.length || 0) : T.passes;
      stops.push({ who: 'editor', label: x.reread ? `${T.editor} · ${T.reread}` : T.editor, name: x.name, what, tone: no ? 'back' : 'ok' });
    } else if (x.who === 'copy') {
      const n = (x.fixes?.length || 0) + (x.phrasing?.length || 0);
      stops.push({ who: 'copy', label: T.copy, name: x.name, what: n ? T.fixes(n) : T.tidy, tone: n ? 'fix' : 'ok' });
    } else if (x.who === 'chief') {
      const h = T.hand[x.kind];
      stops.push({ who: 'chief', label: T.chief, what: typeof h === 'function' ? h(x.para ?? 0) : h || T.hand.edit, tone: 'hand' });
      if (x.kind === 'note') fresh = 'note';
    }
  }
  const end = pressed === 'approved' ? T.approvedPress : pressed === 'as-is' ? T.asIs : null;
  stops.push({ who: 'page', label: draft ? T.proof : T.page, what: end ? `${end} · ${T.words(words(a.body))}` : T.words(words(a.body)), tone: 'end' });
  return { note: null, stops };
}

/** The slip, drawn: stops joined by a rule, each with its verdict. */
export function Track({ a, draft = false }) {
  const { note, stops } = trackOf(a, { draft });
  if (note) return <p className="track-note">{note}</p>;
  return (
    <ol className="track" aria-label={T.round}>
      {stops.map((s, i) => (
        <li key={i} className={`stop t-${s.tone} w-${s.who}`} title={s.name || undefined}>
          <span className="stop-who">{s.label}</span>
          <span className="stop-what">{s.what}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The managing editor's notes still to do on the current version: his last reading sent it back and
 * no rewrite answered it (the rewrite failed, or he read it again and still wasn't satisfied).
 */
export function pendingNotes(a) {
  const steps = a.chain || [];
  const current = steps.slice(lastVersion(steps));
  const i = current.findLastIndex((x) => x.who === 'editor');
  if (i < 0 || current[i].verdict !== 'rework') return null;
  if (current.slice(i + 1).some((x) => x.who === 'reporter' && x.rewrote) || current.slice(i + 1).some((x) => x.who === 'chief' && x.kind === 'edit')) return null;
  return { name: current[i].name, notes: current[i].notes || [], reread: !!current[i].reread };
}

/** The verdict stamp of a piece: notes still to do, passed, or clean to the rules. */
export function stampOf(a) {
  const steps = a.chain || [];
  const ed = steps.slice(lastVersion(steps)).findLast((x) => x.who === 'editor');
  if (ed) return pendingNotes(a) ? { cls: 'back', text: T.stampPending } : { cls: 'ok', text: T.stampOk };
  const triage = a.chain?.find((x) => x.who === 'triage');
  if (triage?.why === 'chief' || triage?.why === 'intern') return { cls: 'noted', text: T.stampYours };
  if (triage?.why === 'clean') return { cls: 'clean', text: T.stampClean };
  if (triage?.why === 'noted') return { cls: 'noted', text: T.stampNoted };
  return null;
}

/** The edition's round of the desk, counted. */
export function tableStats(articles = []) {
  const s = { pieces: articles.length, sentBack: 0, passedFirst: 0, clean: 0, fixes: 0, hand: 0 };
  for (const a of articles) {
    for (const x of a.chain || []) {
      if (x.who === 'editor') s[x.verdict === 'rework' ? 'sentBack' : 'passedFirst']++;
      if (x.who === 'triage' && x.why === 'clean') s.clean++;
      if (x.who === 'copy') s.fixes += (x.fixes?.length || 0) + (x.phrasing?.length || 0);
      if (x.who === 'chief') s.hand++;
    }
  }
  return s;
}

export function TableSummary({ articles }) {
  const s = tableStats(articles);
  const cells = [
    { n: s.sentBack, label: T.sentBack, cls: 'back' },
    { n: s.passedFirst, label: T.passedFirst, cls: 'ok' },
    { n: s.clean, label: T.cleanN, cls: 'clean' },
    { n: s.fixes, label: T.fixesN, cls: 'fix' },
    { n: s.hand, label: T.handN, cls: 'hand' },
  ];
  return (
    <div className="round">
      <div className="round-title"><span className="lbl">{T.round}</span><span className="round-n">{T.pieces(s.pieces)}</span></div>
      <ul className="round-cells">
        {cells.map((c) => <li key={c.cls} className={`rc-${c.cls} ${c.n ? '' : 'zero'}`}><strong>{c.n}</strong><span>{c.label}</span></li>)}
      </ul>
    </div>
  );
}

// ───────────────────────── The word diff ─────────────────────────

const PARA = '¶';
const tokens = (body) => (body || []).flatMap((p, i) => [...(i ? [PARA] : []), ...p.split(/\s+/).filter(Boolean)]);

/**
 * Longest common subsequence on words: which words of each side survive into the other. Islands
 * of one or two common words inside a rewritten passage ("il", "e") count as rewritten: a sentence
 * redone from scratch reads as one change, not as confetti.
 */
export function wordDiff(aBody, bBody) {
  const a = tokens(aBody);
  const b = tokens(bBody);
  if (a.length * b.length > 1_500_000) return null; // too long to compare: show both plainly
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) ops.push({ op: 'eq', t: a[i++], u: b[j++] });
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ op: 'del', t: a[i++] });
    else ops.push({ op: 'ins', u: b[j++] });
  }
  while (i < n) ops.push({ op: 'del', t: a[i++] });
  while (j < m) ops.push({ op: 'ins', u: b[j++] });
  // short runs of common words between changes become changes
  for (let k = 0; k < ops.length;) {
    if (ops[k].op !== 'eq') { k++; continue; }
    let e = k;
    while (e < ops.length && ops[e].op === 'eq') e++;
    const words = ops.slice(k, e).filter((x) => x.t !== PARA).length;
    if (k > 0 && e < ops.length && words < 3) for (let x = k; x < e; x++) if (ops[x].t !== PARA) ops[x].op = 'swap';
    k = e;
  }
  const left = [];
  const right = [];
  for (const x of ops) {
    if (x.op !== 'ins') left.push({ t: x.t, same: x.op === 'eq' });
    if (x.op !== 'del') right.push({ t: x.u, same: x.op === 'eq' });
  }
  return { left, right };
}

/** Tokens back into paragraphs, the changed words marked. */
function Marked({ list, as: Tag }) {
  const paras = [[]];
  for (const x of list) {
    if (x.t === PARA) { paras.push([]); continue; }
    paras[paras.length - 1].push(x);
  }
  return paras.filter((p) => p.length).map((p, k) => (
    <p key={k}>
      {p.map((x, i) => (
        <React.Fragment key={i}>
          {i ? ' ' : ''}
          {x.same ? x.t : <Tag>{x.t}</Tag>}
        </React.Fragment>
      ))}
    </p>
  ));
}

/** A headline on one side of the comparison: marked when the other side has a different one. */
function Head({ text, other, as: Tag }) {
  if (!text) return null;
  return <h4 className="cmp-h">{text === other ? text : <Tag>{text}</Tag>}</h4>;
}

/** The workings of a piece: verdicts and fixes on one side, the first draft against the page on the other. */
export function Workings({ a }) {
  const steps = a.chain || [];
  const hands = steps.filter((x) => x.who === 'chief');
  const current = steps.slice(lastVersion(steps)); // the verdicts on the version in front of you
  const triage = current.find((x) => x.who === 'triage');
  const reads = current.filter((x) => x.who === 'editor');
  const retry = current.filter((x) => x.who === 'reporter')[1];
  const copy = current.findLast((x) => x.who === 'copy');
  const diff = a.draft ? wordDiff(a.draft.body, a.body) : null;
  const fixKind = { figure: T.figureFix, cut: T.cutFix, left: T.leftFix };
  return (
    <div className="workings">
      <div className="wk-notes">
        {triage && triage.why !== 'clean' && (
          <section className="wk-block wk-rules">
            <span className="lbl">{T.rulesSaw}</span>
            {triage.flags?.length ? <ul>{triage.flags.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p>{triage.why === 'chief' ? T.byChief : T.frontWhy}</p>}
            {triage.why === 'chief' && triage.flags?.length > 0 && <p className="wk-small">{T.byChief}</p>}
            {triage.why === 'noted' && <p className="wk-small">{T.notRead}</p>}
          </section>
        )}
        {reads.map((ed, k) => (
          <section key={k} className={`wk-block wk-editor ${ed.verdict === 'rework' ? 'back' : 'ok'}`}>
            <div className="wk-head">
              <span className="lbl">{T.verdictOf(ed.name)}{ed.reread ? ` · ${T.reread}` : ''}</span>
              <span className={`stamp ${ed.verdict === 'rework' ? 'back' : 'ok'}`}>{ed.verdict === 'rework' ? T.stampBack : T.stampOk}</span>
            </div>
            {ed.verdict === 'rework' && ed.notes?.length > 0 && <ol className="wk-list">{ed.notes.map((n, i) => <li key={i}>{n}</li>)}</ol>}
            {ed.praise && <p className="wk-praise"><span>{T.praise}:</span> {quote(ed.praise)}</p>}
            {k === 0 && retry && !retry.rewrote && <p className="wk-small">{T.kept} ({T.keptWhy[retry.why] || T.keptWhy.failed})</p>}
          </section>
        ))}
        {copy && (copy.fixes?.length > 0 || copy.phrasing?.length > 0 || copy.small > 0) && (
          <section className="wk-block wk-copy">
            <span className="lbl">{T.copyOf(copy.name)}</span>
            <ul className="wk-fixes">
              {(copy.fixes || []).map((f, i) => (
                <li key={`f${i}`}><em>{fixKind[f.kind]} ({f.figures.join(', ')})</em><del>{f.from}</del>{f.to && <ins>{f.to}</ins>}</li>
              ))}
              {(copy.phrasing || []).map((f, i) => (
                <li key={`p${i}`}><em>{T.phrasing}{f.why?.length ? ` (${f.why.slice(0, 3).join(', ')})` : ''}</em><del>{f.from}</del><ins>{f.to}</ins></li>
              ))}
            </ul>
            {copy.small > 0 && <p className="wk-small">{T.small(copy.small)}</p>}
          </section>
        )}
        {hands.length > 0 && (
          <section className="wk-block wk-hand">
            <span className="lbl">{T.yourHand}</span>
            <ul>{hands.map((h, i) => { const x = T.hand[h.kind]; return <li key={i}>{typeof x === 'function' ? x(h.para ?? 0) : x}{h.instruction ? ` ${quote(h.instruction)}` : ''}</li>; })}</ul>
          </section>
        )}
      </div>

      <div className="wk-compare">
        {a.draft ? (
          <>
            <div className="cmp-col cmp-draft">
              <span className="lbl">{T.firstDraft} · {T.words(words(a.draft.body))}</span>
              <Head text={a.draft.headline} other={a.headline} as="del" />
              {diff ? <Marked list={diff.left} as="del" /> : a.draft.body.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="cmp-col cmp-page">
              <span className="lbl">{T.onPage} · {T.words(words(a.body))}</span>
              <Head text={a.headline} other={a.draft.headline} as="ins" />
              {diff ? <Marked list={diff.right} as="ins" /> : a.body.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <p className="cmp-legend">{T.legend}</p>
          </>
        ) : (
          <p className="wk-small">{steps.length ? T.untouched : T.noDraft}</p>
        )}
      </div>
    </div>
  );
}

/** What changed between two versions of a piece, and why: the Editor's note, or new facts. */
export function Changes({ from, to, why }) {
  const diff = wordDiff(from.body, to.body);
  const same = from.headline === to.headline && (from.dek || '') === (to.dek || '') && from.body.join('\n') === to.body.join('\n');
  return (
    <div className="changes">
      {same && <p className="pc-warn">{T.same}</p>}
      {why?.who === 'chief' && why.instruction && <p className="ch-why"><span className="lbl">{T.yourNote}</span> {quote(why.instruction)}</p>}
      {why?.who === 'update' && <p className="ch-why"><span className="lbl">{T.factsCame(why.signals?.[0] ?? 0, why.signals?.[1] ?? 0)}</span></p>}
      <div className="wk-compare">
        <div className="cmp-col cmp-draft">
          <span className="lbl">{T.before2} · {T.words(words(from.body))}</span>
          <Head text={from.headline} other={to.headline} as="del" />
          {diff ? <Marked list={diff.left} as="del" /> : from.body.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div className="cmp-col cmp-page">
          <span className="lbl">{T.now} · {T.words(words(to.body))}</span>
          <Head text={to.headline} other={from.headline} as="ins" />
          {diff ? <Marked list={diff.right} as="ins" /> : to.body.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <p className="cmp-legend">{T.legend}</p>
      </div>
    </div>
  );
}

/** The managing editor's notes still to do, with what the Editor can do about them. */
export function Pending({ a, children }) {
  const p = pendingNotes(a);
  if (!p) return null;
  return (
    <div className="pending">
      <p className="lbl">{p.reread ? T.pendingTitle(p.name) : T.pendingKept(p.name)}</p>
      <ol>{p.notes.map((n, i) => <li key={i}>{n}</li>)}</ol>
      {children}
    </div>
  );
}
