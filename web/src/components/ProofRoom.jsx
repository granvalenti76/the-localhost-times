import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, href } from '../lib.js';
import { tr } from '../i18n.js';
import { FocusBar, Toast, useDirector, report } from './Rooms.jsx';
import { Workings } from './Proof.jsx';
import { pencil, stamp as stampSound } from '../sound.js';

/*
 * The proof round, on the whole page: one draft at a time under the red pencil. The proofreader
 * knows how many problems the draft has, not where: the Editor finds them by clicking the words
 * (a hint shows one, for a few copies). Each found mark offers its fixes in the margin. The
 * headline can be swapped for one of three others; ♥ in the margin marks a paragraph worth
 * imitating. Then the stamp: passed for press. Or back to the reporter with a note, or out.
 */

const T = tr({
  en: {
    title: (i, n) => `Proof round · ${i} of ${n}`, words: 'words',
    what: 'The drafts come here before the press. Every correction is saved at once; once you pass a piece, it goes to press as it is and nobody touches it again.',
    heads: 'The headline', theirs: (w) => `${w || 'The reporter'}'s`, alt: 'From the headline desk', more: 'Three more headlines', loading: 'The headline desk is thinking…',
    margin: 'In the margin', left: (n) => (n === 1 ? 'The proofreader felt <b>1</b> problem. Find it in the text.' : `The proofreader felt <b>${n}</b> problems. Find them in the text.`),
    allFound: 'All found. Fine pencil work.', clean: 'The proofreader found nothing: read it anyway.',
    hint: 'A hint (−5 copies)', found: 'found', earned: 'copies earned', onDraft: 'on this draft', hearts: '♥ given',
    back: '↩ Back to the reporter with a note', out: 'Leave it out', visto: 'Passed for press', next: 'Next draft →',
    notePh: 'The note for the reporter', send: 'Send it back', cancel: 'Cancel',
    stamp: 'Passed for press', by: 'The Editor',
    empty: 'No drafts are waiting for you.', emptySub: 'When the reporters deliver, the drafts come here one at a time.', toDesk: 'Back to the desk', toWrite: 'See who is writing',
    workings: 'How it was made', hide: 'Hide', like: 'I like this paragraph', unliked: 'paragraph marked',
    kinds: { inflated: 'inflated word', figure: 'figure', interval: 'interval', slop: 'phrasing', dashboard: 'dashboard word' },
    keep: 'Leave it', fixedLbl: 'fixed', foundLbl: 'found', hintLbl: 'hint', cleanLbl: 'clean draft', headLbl: 'new headline', passedLbl: 'passed for press',
    learned: (w) => `${w || 'The reporter'} has learnt`,
    chiefBack: ' would send it back:', chiefOk: ' passed it', chiefWarn: 'Passing it anyway goes against them: they will remember.',
    unfixed: (n) => (n === 1 ? '1 mark found and not fixed' : `${n} marks found and not fixed`),
  },
  it: {
    title: (i, n) => `Giro di bozze · ${i} di ${n}`, words: 'parole',
    what: 'Le bozze passano di qui prima della stampa. Ogni correzione si salva subito; col visto il pezzo va in stampa così com\'è e nessuno lo tocca più.',
    heads: 'Il titolo', theirs: (w) => `Proposta di ${w || 'redazione'}`, alt: 'Dal banco titoli', more: 'Altri tre titoli', loading: 'Il banco titoli ci pensa…',
    margin: 'A margine', left: (n) => (n === 1 ? 'Il correttore ha sentito <b>1</b> problema. Trovalo nel testo.' : `Il correttore ha sentito <b>${n}</b> problemi. Trovali nel testo.`),
    allFound: 'Tutti trovati. Bel lavoro di matita.', clean: 'Il correttore non ha trovato niente: leggila comunque.',
    hint: 'Un indizio (−5 copie)', found: 'trovati', earned: 'copie guadagnate', onDraft: 'sulla bozza', hearts: '♥ dati',
    back: '↩ Rimanda al cronista con un biglietto', out: 'Togli dal giornale', visto: 'Visto, si stampi', next: 'Prossima bozza →',
    notePh: 'Il biglietto per il cronista', send: 'Rimanda', cancel: 'Annulla',
    stamp: 'Visto, si stampi', by: 'Il Direttore',
    empty: 'Nessuna bozza ti aspetta.', emptySub: 'Quando i cronisti consegnano, le bozze arrivano qui una alla volta.', toDesk: 'Torna alla scrivania', toWrite: 'Guarda chi scrive',
    workings: 'La lavorazione', hide: 'Nascondi', like: 'Mi piace questo paragrafo', unliked: 'paragrafo segnato',
    kinds: { inflated: 'parola gonfia', figure: 'numero', interval: 'intervallo', slop: 'frase da macchina', dashboard: 'parola da cruscotto' },
    keep: 'Lascia così', fixedLbl: 'corretto', foundLbl: 'trovato', hintLbl: 'indizio', cleanLbl: 'bozza pulita', headLbl: 'titolo nuovo', passedLbl: 'visto',
    learned: (w) => `${w || 'Il cronista'} ha imparato`,
    chiefBack: ' lo rimanderebbe:', chiefOk: ' l\'ha passato', chiefWarn: 'Se gli dai il visto lo scavalchi: se ne ricorderà.',
    unfixed: (n) => (n === 1 ? '1 segno trovato e non corretto' : `${n} segni trovati e non corretti`),
  },
});

const partOf = (t, part) => (part === 'headline' ? t.headline : part === 'dek' ? t.dek : t.body[part]);

/** A fix applied in place: the text, and how much the part moved (for the marks after it). */
function applyFix(t, m, to) {
  const src = partOf(t, m.part) || '';
  if (src.slice(m.start, m.end) !== m.text) return null;
  let a = m.start;
  let b = m.end;
  if (!to) { if (src[b] === ' ') b++; else if (src[a - 1] === ' ') a--; }
  let next = src.slice(0, a) + to + src.slice(b);
  if (a === 0) next = next.charAt(0).toUpperCase() + next.slice(1);
  const out = { headline: t.headline, dek: t.dek, body: [...t.body] };
  if (m.part === 'headline') out.headline = next; else if (m.part === 'dek') out.dek = next; else out.body[m.part] = next;
  return { text: out, at: a, delta: next.length - src.length };
}

/** A part of the text with its marks: hidden until found, then underlined in red, then corrected. */
function Marked({ text, marks, state, onFind }) {
  const list = marks.filter((m) => !state[m.id]?.fixed).sort((a, b) => a.start - b.start);
  const out = [];
  let i = 0;
  for (const m of list) {
    if (m.start < i) continue;
    out.push(text.slice(i, m.start));
    const s = state[m.id] || {};
    out.push(
      <span key={m.id} className={`rd-flag ${s.found ? 'shown' : ''}`} onClick={() => onFind(m)} role={s.found ? undefined : 'button'} tabIndex={s.found ? -1 : 0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onFind(m)}>
        {text.slice(m.start, m.end)}{s.found && <sup>{s.n}</sup>}
      </span>,
    );
    i = m.end;
  }
  out.push(text.slice(i));
  return out;
}

function Proof({ p, v, idx, total, gain, onDone }) {
  const [text, setText] = useState(p.text);
  const [marks, setMarks] = useState(p.marks || []);
  const [state, setState] = useState({}); // mark id → { found, n, fixed, hint }
  const [heads, setHeads] = useState(null);
  const [head, setHead] = useState(p.text.headline);
  const [hearts, setHearts] = useState({});
  const [earned, setEarned] = useState(0);
  const [note, setNote] = useState(null);
  const [stamped, setStamped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [work, setWork] = useState(false);
  const [learned, setLearned] = useState([]);
  const [secs, setSecs] = useState(0);
  const counter = useRef(0);
  const ref = (m) => `${v.editionId}:${p.id}:${m.id}`;

  useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    let alive = true;
    api(`/workbench/${encodeURIComponent(p.id)}/headlines`, { method: 'POST' }).then((r) => alive && setHeads(r.options || [])).catch(() => alive && setHeads([]));
    return () => { alive = false; };
  }, [p.id]);

  const pay = (a, label) => { if (a?.gained) { setEarned((e) => e + a.gained); gain(a, label); } };

  async function find(m, viaHint = false) {
    if (state[m.id]?.found) return;
    counter.current += 1;
    pencil();
    setState((s) => ({ ...s, [m.id]: { found: true, n: counter.current, hint: viaHint } }));
    pay(await report(viaHint ? 'hint' : 'found', ref(m)), viaHint ? T.hintLbl : T.foundLbl);
  }
  const hint = () => { const m = marks.find((x) => !state[x.id]?.found); if (m) find(m, true); };

  // every correction is saved at once: whatever happens next (a note, the press), the piece keeps it
  const persist = (t, h) => api(`/workbench/${encodeURIComponent(p.id)}`, { method: 'PATCH', json: { headline: h, dek: t.dek, body: t.body } })
    .catch((e) => setError(e.message));

  async function fix(m, to) {
    const r = applyFix(text, m, to);
    if (!r) return;
    setText(r.text);
    persist(r.text, m.part === 'headline' ? r.text.headline : head);
    if (m.part === 'headline') setHead(r.text.headline);
    // the marks after it, in the same part, move with the text
    setMarks((list) => list.map((x) => (x.id !== m.id && x.part === m.part && x.start >= m.end ? { ...x, start: x.start + r.delta, end: x.end + r.delta } : x)));
    setState((s) => ({ ...s, [m.id]: { ...s[m.id], fixed: true } }));
    pencil();
    pay(await report('fixed', ref(m)), T.fixedLbl);
    // the writer learns from the correction: it becomes a lesson in their instructions
    try {
      const l = await api(`/workbench/${encodeURIComponent(p.id)}/lesson`, { method: 'POST', json: { kind: m.kind, text: m.text } });
      if (l?.learned) setLearned((x) => [...x, l.lesson]);
    } catch { /* the lesson can wait */ }
  }
  const keep = (m) => setState((s) => ({ ...s, [m.id]: { ...s[m.id], fixed: true, kept: true } }));

  async function like(i) {
    if (hearts[i]) return;
    setHearts((h) => ({ ...h, [i]: true }));
    try { const r = await api(`/workbench/${encodeURIComponent(p.id)}/paragraph`, { method: 'POST', json: { index: i, op: 'like' } }); pay(r.award, T.unliked); } catch { /* the heart stays on the page */ }
  }

  async function chooseHead(h) {
    setHead(h);
    persist(text, h);
    if (h !== p.text.headline) pay(await report('headline', `${v.editionId}:${p.id}`), T.headLbl);
  }

  const allFound = marks.length > 0 && marks.every((m) => state[m.id]?.found);
  const allFixed = marks.every((m) => state[m.id]?.fixed);
  const changed = head !== p.text.headline || text.dek !== (p.text.dek || '') || text.body.join('\n') !== p.text.body.join('\n');

  async function visto() {
    setBusy(true); setError(null);
    try {
      if (changed) await api(`/workbench/${encodeURIComponent(p.id)}`, { method: 'PATCH', json: { headline: head, dek: text.dek, body: text.body } });
      const r = await api(`/workbench/${encodeURIComponent(p.id)}/approve`, { method: 'POST' });
      let total2 = r.award?.gained || 0;
      if (marks.length && allFound && allFixed && !marks.some((m) => state[m.id]?.hint)) {
        const c = await report('clean', `${v.editionId}:${p.id}`);
        total2 += c?.gained || 0;
        if (c?.missions?.length) r.award = { ...r.award, missions: [...(r.award?.missions || []), ...c.missions] };
      }
      setEarned((e) => e + total2);
      gain({ gained: total2, missions: r.award?.missions }, T.passedLbl);
      setStamped(true);
      stampSound();
      setTimeout(onDone, 1500);
    } catch (e) { setError(e.message); setBusy(false); }
  }

  async function sendBack() {
    setBusy(true); setError(null);
    try {
      const r = await api(`/workbench/${encodeURIComponent(p.id)}/note`, { method: 'POST', json: { note } });
      gain(r.award);
      onDone();
    } catch (e) { setError(e.message); setBusy(false); }
  }
  async function leaveOut() {
    setBusy(true);
    try { await api(`/workbench/${encodeURIComponent(p.id)}/kill`, { method: 'POST' }); onDone(); } catch (e) { setError(e.message); setBusy(false); }
  }
  function startNote() {
    const open = marks.filter((m) => !state[m.id]?.fixed);
    setNote(open.map((m) => `${m.msg} (${m.text})`).join(' '));
  }

  const found = marks.filter((m) => state[m.id]?.found).length;
  const shown = marks.filter((m) => state[m.id]?.found).sort((a, b) => state[a.id].n - state[b.id].n);
  const options = [...new Set([p.text.headline, ...(heads || [])])];
  const words = [text.dek, ...text.body].join(' ').split(/\s+/).filter(Boolean).length;
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const partMarks = (part) => marks.filter((m) => m.part === part);

  return (
    <>
      <FocusBar title={T.title(idx + 1, total)}>{p.writer?.name || ''} · {p.section} · {words} {T.words}</FocusBar>
      <div className="rd-proofwrap">
        <p className="rd-mutd rd-what">{T.what}</p>
        <div className="rd-heads" role="group" aria-label={T.heads}>
          {options.map((h, i) => (
            <button key={h} className="rd-hopt" aria-pressed={head === h} onClick={() => chooseHead(h)}>
              <small>{i === 0 ? T.theirs(p.writer?.name?.split(' ')[0]) : T.alt}</small>
              <b>{h}</b>
            </button>
          ))}
          {heads === null && <div className="rd-hopt ghost"><small>{T.alt}</small><b>{T.loading}</b></div>}
        </div>

        <div className="rd-proof">
          <div className="rd-galley">
            <div className="rd-gk">{text.kicker || p.section}</div>
            <h2>{head === text.headline ? <Marked text={text.headline} marks={partMarks('headline')} state={state} onFind={find} /> : head}</h2>
            {text.dek && <p className="rd-gdek"><Marked text={text.dek} marks={partMarks('dek')} state={state} onFind={find} /></p>}
            <div className="rd-gby">{p.writer?.name || ''}{p.writer?.role ? ` · ${p.writer.role}` : ''}</div>
            {text.body.map((para, i) => (
              <p key={i}>
                <button className={`rd-heart ${hearts[i] ? 'on' : ''}`} aria-label={T.like} title={T.like} onClick={() => like(i)}>♥</button>
                <Marked text={para} marks={partMarks(i)} state={state} onFind={find} />
              </p>
            ))}
            <div className={`rd-stamp ${stamped ? 'on' : ''}`} aria-hidden={!stamped}>{T.stamp}<small>{T.by}</small></div>
          </div>
          <aside className="rd-margin">
            <span className="rd-mttl">{T.margin}</span>
            {(() => {
              // what the managing editor said about this version, if they read it
              const ch = p.chain || [];
              const since = ch.findLastIndex((x) => x.who === 'reporter' || x.who === 'update');
              const v2 = ch.slice(Math.max(0, since)).filter((x) => x.who === 'editor').at(-1);
              if (!v2) return null;
              const back = v2.verdict === 'rework' && v2.notes?.length;
              return (
                <div className={`rd-mnote rd-chiefnote ${back ? 'back' : 'ok'}`}>
                  <div className="rd-q">{v2.name}{back ? T.chiefBack : T.chiefOk}</div>
                  {back ? <ul>{v2.notes.map((n) => <li key={n}>{n}</li>)}</ul> : v2.praise ? <p>«{v2.praise}»</p> : null}
                  {back && <small>{T.chiefWarn}</small>}
                </div>
              );
            })()}
            {shown.map((m) => {
              const s = state[m.id];
              return (
                <div key={m.id} className={`rd-mnote ${s.fixed ? 'done' : ''}`}>
                  <div className="rd-q">{s.n} · {T.kinds[m.kind] || m.kind} · «{m.text}»</div>
                  {m.msg}
                  {!s.fixed && (
                    <div className="rd-opts">
                      {m.fixes.map((f) => <button key={f.label} onClick={() => fix(m, f.to)}>{f.label}</button>)}
                      <button className="keep" onClick={() => keep(m)}>{T.keep}</button>
                    </div>
                  )}
                </div>
              );
            })}
            {learned.length > 0 && (
              <div className="rd-mnote rd-learned">
                <div className="rd-q">{T.learned(p.writer?.name?.split(' ')[0])}</div>
                <ul>{learned.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
            <div className="rd-mnote ghost" dangerouslySetInnerHTML={{ __html: !marks.length ? T.clean : allFound ? T.allFound : T.left(marks.length - found) }} />
            {marks.length > 0 && !allFound && <button className="rd-hint" onClick={hint}>{T.hint}</button>}
          </aside>
        </div>

        <div className="rd-workings">
          <button className="rd-link" onClick={() => setWork((w) => !w)}>{work ? T.hide : T.workings}</button>
          {work && <div className="rd-wbox"><Workings a={{ ...p.text, chain: p.chain, draft: p.draft }} /></div>}
        </div>

        {note !== null && (
          <form className="rd-noteback" onSubmit={(e) => { e.preventDefault(); if (note.trim()) sendBack(); }}>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.notePh} aria-label={T.notePh} autoFocus />
            <div><button className="btn" disabled={busy || !note.trim()}>{T.send}</button><button type="button" className="rd-ghostd" onClick={() => setNote(null)}>{T.cancel}</button></div>
          </form>
        )}
        {error && <p className="notice">{error}</p>}
      </div>

      <div className="rd-pfoot">
        <div className="rd-score">
          <div><b className="num">{found}/{marks.length}</b>{T.found}</div>
          <div><b className="num gd">{earned >= 0 ? '+' : ''}{earned}</b>{T.earned}</div>
          <div><b className="num">{mm}</b>{T.onDraft}</div>
          <div><b className="num">{Object.keys(hearts).length}</b>{T.hearts}</div>
        </div>
        <div className="rd-pacts">
          {marks.some((m) => state[m.id]?.found && !state[m.id]?.fixed) && <span className="rd-mutd">{T.unfixed(marks.filter((m) => state[m.id]?.found && !state[m.id]?.fixed).length)}</span>}
          <button className="rd-ghostd" disabled={busy} onClick={startNote}>{T.back}</button>
          <button className="rd-ghostd" disabled={busy} onClick={leaveOut}>{T.out}</button>
          <button className="rd-visto" disabled={busy || stamped} onClick={visto}>{T.visto}</button>
        </div>
      </div>
    </>
  );
}

export default function ProofRoom({ sid = null }) {
  const [v, setV] = useState(null);
  const [error, setError] = useState(null);
  const [cur, setCur] = useState(sid);
  const { gain, toast } = useDirector();
  const load = useCallback(() => api('/workbench').then(setV).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  // new drafts arrive while the Editor works
  useEffect(() => { const t = setInterval(() => { if (!cur) load(); }, 10000); return () => clearInterval(t); }, [cur, load]);

  const queue = useMemo(() => (v?.pieces || []).filter((p) => p.status === 'ready' && p.text), [v]);
  const p = queue.find((x) => x.id === cur) || queue[0] || null;
  const idx = p ? queue.indexOf(p) : 0;

  if (!v) return <div className="rd-focus">{error && <p className="notice">{error}</p>}</div>;
  return (
    <div className="rd-focus">
      <Toast toast={toast} />
      {p ? (
        <Proof key={p.id + (p.version || 0)} p={p} v={v} idx={idx} total={queue.length} gain={gain}
          onDone={() => { setCur(queue[idx + 1]?.id || null); load(); }} />
      ) : (
        <>
          <FocusBar title={tr({ en: 'Proof round', it: 'Giro di bozze' })} />
          <div className="rd-empty">
            <p>{T.empty}</p>
            <p className="rd-mutd">{T.emptySub}</p>
            <div className="rd-acts"><a className="btn" href={href.desk()}>{T.toDesk}</a><a className="rd-ghostd" href={href.write()}>{T.toWrite}</a></div>
          </div>
        </>
      )}
    </div>
  );
}
