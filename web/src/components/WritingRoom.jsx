import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { key as keySound, bell } from '../sound.js';
import { api, href, hhmm } from '../lib.js';
import { tr } from '../i18n.js';
import { Medallion, FocusBar, Toast, useDirector, stepText } from './Rooms.jsx';

/*
 * The writing room, on the whole page: the reporters' desks along the top, the piece being typed
 * in the middle, the facts on the reporter's table on the left (ticked as the piece uses them),
 * the copy desk counting on the right, with the Editor's notes for the reporter. The newsroom's
 * chatter runs along the bottom.
 */

const T = tr({
  en: {
    title: 'Writing room', at: (n) => (n === 1 ? '1 reporter at work' : `${n} reporters at work`), none: 'nobody at work', press: (m) => `press in ${m} min`,
    facts: (w) => `The facts on ${w}'s table`, factsNone: 'The facts', copy: 'The copy desk, live', words: 'Words', invented: 'Figures not in the facts', inflated: 'Inflated words', times: 'Times of day', used: 'Facts used',
    step: 'Step', step2: 'Now',
    nudge: 'Step in', nudgeLater: 'the reporter takes it when the piece is done', nudgeNow: 'the reporter rewrites it now',
    notes: [['Shorter', 'cut at the last useful fact'], ['Open on the strongest fact', 'rewrite the opening, keep the rest'], ['Drier', 'fewer adjectives, more things'], ['Fewer times of day', 'keep the one or two that matter']],
    custom: 'Or write a note…', send: 'Send', sent: 'note delivered',
    empty: 'Nobody is writing right now.', emptyNext: (t) => `The next round is at ${t}.`, emptyAsk: 'Have them write now', asked: 'The reporters are on it…',
    delivered: 'Delivered', toProofs: 'To the proof round →', waiting: 'The sheet is still blank: the reporter is reading the facts.',
    chatter: 'From the newsroom', quiet: 'The newsroom is quiet.', coffee: 'The coffee machine', brewing: 'Two of them are heading for the coffee machine…', another: 'Another coffee', close: 'Close', done: 'delivered', writing: 'writing', ready: 'on the desk', approved: 'passed',
  },
  it: {
    title: 'Sala scrittura', at: (n) => (n === 1 ? '1 cronista al lavoro' : `${n} cronisti al lavoro`), none: 'nessuno al lavoro', press: (m) => `stampa tra ${m} min`,
    facts: (w) => `I fatti sul tavolo di ${w}`, factsNone: 'I fatti', copy: 'Il correttore, in diretta', words: 'Parole', invented: 'Numeri non nei fatti', inflated: 'Parole gonfie', times: 'Orari citati', used: 'Fatti usati',
    step: 'Passaggio', step2: 'Adesso',
    nudge: 'Intervieni', nudgeLater: 'il cronista lo prende appena consegna', nudgeNow: 'il cronista lo riscrive subito',
    notes: [['Più corto', 'taglia all\'ultimo fatto utile'], ['Apri sul fatto più forte', 'riscrive l\'attacco, tiene il resto'], ['Più asciutto', 'meno aggettivi, più cose'], ['Meno orari', 'tieni i due che contano']],
    custom: 'Oppure scrivigli un biglietto…', send: 'Manda', sent: 'biglietto consegnato',
    empty: 'Nessuno sta scrivendo in questo momento.', emptyNext: (t) => `Il prossimo giro è alle ${t}.`, emptyAsk: 'Falli scrivere ora', asked: 'I cronisti ci sono…',
    delivered: 'Consegnato', toProofs: 'Al giro di bozze →', waiting: 'Il foglio è ancora bianco: il cronista legge i fatti.',
    chatter: 'Dalla redazione', quiet: 'La redazione è silenziosa.', coffee: 'La macchinetta del caffè', brewing: 'Due di loro vanno alla macchinetta…', another: 'Un altro caffè', close: 'Chiudi', done: 'consegnato', writing: 'scrive', ready: 'sul tavolo', approved: 'visto',
  },
});

const first = (name) => String(name || '').split(' ')[0];

function Typed({ a, live }) {
  return (
    <div className="rd-sheet" aria-live="off">
      {a.kicker && <div className="rd-sk">{a.kicker}</div>}
      {a.headline && <div className="rd-sh1">{a.headline}</div>}
      {a.dek && <p className="rd-sd">{a.dek}</p>}
      <div className="rd-sb">
        {a.body.map((p, i) => <p key={i}>{p}{live && i === a.body.length - 1 ? <span className="rd-caret" /> : null}</p>)}
        {live && !a.body.length && <p>{!a.headline && <span className="rd-mutd">{T.waiting}</span>}<span className="rd-caret" /></p>}
      </div>
    </div>
  );
}

/**
 * The coffee machine: two writers on a break, talking about the day and about the Editor. The
 * lines come one at a time, as in a real conversation.
 */
function Coffee({ onClose }) {
  const [c, setC] = useState(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);
  const brew = useCallback((force = false) => {
    setBusy(true); setError(null); setShown(0);
    api('/coffee', { method: 'POST', json: { force } }).then(setC).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, []);
  useEffect(() => { brew(false); }, [brew]);
  useEffect(() => {
    if (!c || shown >= c.lines.length) return undefined;
    const t = setTimeout(() => setShown((n) => n + 1), shown ? 1400 : 300);
    return () => clearTimeout(t);
  }, [c, shown]);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const who = (id) => (c?.a.id === id ? c.a : c?.b);
  return (
    <div className="rd-coffee" role="dialog" aria-modal="true" aria-label={T.coffee}>
      <div className="rd-coffee-box">
        <div className="rd-coffee-head"><span aria-hidden="true">☕</span> {T.coffee}<button className="rd-x" onClick={onClose} aria-label={T.close}>✕</button></div>
        {busy && <p className="rd-mutd">{T.brewing}</p>}
        {error && <p className="notice">{error}</p>}
        {c && (
          <div className="rd-talk" aria-live="polite">
            {c.lines.slice(0, shown).map((l, i) => (
              <div key={i} className={`rd-line ${l.who === c.a.id ? 'a' : 'b'}`}>
                <Medallion writer={who(l.who)} size="sm" />
                <p><b>{who(l.who)?.name?.split(' ')[0]}</b> {l.text}</p>
              </div>
            ))}
            {shown < c.lines.length && <div className={`rd-line ${c.lines[shown].who === c.a.id ? 'a' : 'b'} typing`}><Medallion writer={who(c.lines[shown].who)} size="sm" /><p>…</p></div>}
          </div>
        )}
        {c && shown >= c.lines.length && <div className="rd-acts"><button className="rd-ghostd" onClick={() => brew(true)}>{T.another}</button></div>}
      </div>
    </div>
  );
}

export default function WritingRoom({ sid: wanted = null }) {
  const [desks, setDesks] = useState([]);
  const [v, setV] = useState(null);
  const [chat, setChat] = useState([]);
  const [pick, setPick] = useState(wanted);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { gain, toast } = useDirector();
  const [coffee, setCoffee] = useState(false);

  const loadLive = useCallback(() => api('/workbench/live').then((r) => setDesks(r.desks || [])).catch(() => {}), []);
  const loadBench = useCallback(() => api('/workbench').then(setV).catch((e) => setError(e.message)), []);
  useEffect(() => {
    loadLive(); loadBench();
    const fast = setInterval(loadLive, 700);
    const slow = setInterval(loadBench, 5000);
    const talk = () => api('/chatter?limit=12').then(setChat).catch(() => {});
    talk();
    const t3 = setInterval(talk, 12000);
    return () => { clearInterval(fast); clearInterval(slow); clearInterval(t3); };
  }, [loadLive, loadBench]);

  // the desks along the top: whoever is typing, then the pieces already on the table
  const row = useMemo(() => {
    const out = desks.map((x) => ({ sid: x.sid, writer: x.writer, topic: x.article.headline || x.topic, live: !x.done, step: x.step, words: x.words, target: x.target }));
    for (const p of v?.pieces || []) {
      if (out.some((x) => x.sid === p.id) || p.status === 'killed') continue;
      out.push({ sid: p.id, writer: p.writer, topic: p.text?.headline || p.topic, live: false, status: p.status, step: p.step });
    }
    return out.slice(0, 8);
  }, [desks, v]);

  const current = pick && row.find((x) => x.sid === pick) ? pick : (desks.find((x) => !x.done) || desks[0] || row[0])?.sid || null;
  const d = desks.find((x) => x.sid === current) || null;
  const piece = v?.pieces.find((p) => p.id === current) || null;
  const a = d?.article || (piece?.text ? { kicker: piece.text.kicker, headline: piece.text.headline, dek: piece.text.dek, body: piece.text.body } : null);
  const live = !!d && !d.done;
  const writer = d?.writer || piece?.writer || null;
  const working = desks.filter((x) => !x.done).length;

  async function send(text) {
    if (!current || !text.trim()) return;
    setBusy(true); setError(null);
    try {
      const writingNow = live || piece?.status === 'writing';
      const r = await api(`/workbench/${encodeURIComponent(current)}/${writingNow ? 'queue-note' : 'note'}`, { method: 'POST', json: { note: text.trim() } });
      setNote('');
      gain(r?.award, T.sent);
      loadBench();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function draftNow() {
    setBusy(true);
    try { await api('/workbench/round', { method: 'POST' }); loadBench(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  // the typewriter, heard: a key for every few letters that arrived, the bell at a new paragraph
  const heard = useRef({ sid: null, len: 0, paras: 0 });
  useEffect(() => {
    if (!d || d.done) return undefined;
    const len = [d.article.headline, d.article.dek, ...d.article.body].join('').length;
    const h = heard.current;
    if (h.sid !== d.sid) { heard.current = { sid: d.sid, len, paras: d.article.body.length }; return undefined; }
    const keys = Math.min(10, Math.floor((len - h.len) / 4));
    const timers = Array.from({ length: Math.max(0, keys) }, (_, i) => setTimeout(keySound, (i * 650) / Math.max(1, keys) + Math.random() * 30));
    if (d.article.body.length > h.paras && h.paras > 0) timers.push(setTimeout(bell, 600));
    heard.current = { sid: d.sid, len, paras: d.article.body.length };
    return () => timers.forEach(clearTimeout);
  }, [d]);

  const target = d?.target;
  const words = d?.words ?? (a ? [a.dek, ...a.body].join(' ').split(/\s+/).filter(Boolean).length : 0);
  const facts = d?.facts || [];
  const canNudge = piece && (live || ['ready', 'writing'].includes(piece.status));

  return (
    <div className="rd-focus">
      <Toast toast={toast} />
      <FocusBar title={T.title}>{working ? T.at(working) : T.none}{v ? ` · ${T.press(v.minutesLeft)}` : ''}</FocusBar>

      {row.length > 0 && (
        <div className="rd-desks" role="tablist">
          {row.map((x) => (
            <button key={x.sid} role="tab" aria-selected={x.sid === current} className={`rd-wd ${x.sid === current ? 'on' : ''}`} onClick={() => setPick(x.sid)}>
              <Medallion writer={x.writer} state={x.live ? 'busy' : x.status === 'approved' ? 'ok' : 'idle'} />
              <span><b>{first(x.writer?.name) || tr({ en: 'Newsroom', it: 'Redazione' })}</b><small>{x.topic}</small></span>
              <span className="rd-roll"><i style={{ width: `${x.live ? Math.min(100, Math.round(((x.words || 0) / Math.max(1, x.target?.max || 200)) * 100)) : 100}%` }} /></span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="notice">{error}</p>}

      {!a ? (
        <div className="rd-empty">
          <p>{T.empty}</p>
          {v?.nextRound && <p className="rd-mutd">{T.emptyNext(hhmm(v.nextRound.at))}</p>}
          <button className="btn" disabled={busy || !!v?.running} onClick={draftNow}>{busy || v?.running ? T.asked : T.emptyAsk}</button>
        </div>
      ) : (
        <div className="rd-room">
          <aside className="rd-facts">
            <h5>{writer ? T.facts(first(writer.name)) : T.factsNone}</h5>
            {facts.length ? facts.map((f, i) => (
              <div key={i} className={`rd-fact ${f.used ? 'used' : ''}`}>{f.text}</div>
            )) : <p className="rd-mutd">{piece?.signalsNow ? `${piece.signalsNow} ${tr({ en: 'signals', it: 'segnali' })}` : '—'}</p>}
          </aside>

          <div className="rd-platen">
            <Typed a={a} live={live} />
            <div className="rd-thought">
              <Medallion writer={writer} size="sm" />
              <span>{live ? stepText(d.step, writer?.name) : piece?.status === 'writing' ? stepText(piece.step, writer?.name) : `${T.delivered}${piece?.at ? ` · ${hhmm(piece.at)}` : ''}`}</span>
              {!live && piece?.status === 'ready' && <a className="rd-link" href={href.proofs(piece.id)}>{T.toProofs}</a>}
            </div>
          </div>

          <aside className="rd-live">
            <h5>{T.copy}</h5>
            <div className="rd-meter">
              <div className="rd-row"><span>{T.words}</span><span className="num">{words}{target ? ` / ${target.min}–${target.max}` : ''}</span></div>
              <div className="rd-trk"><i style={{ width: `${target ? Math.min(100, (words / target.max) * 100) : 0}%` }} />{target && <u style={{ left: `${(target.min / target.max) * 100}%` }} />}</div>
            </div>
            {d && (
              <>
                <div className="rd-chk"><span>{T.invented}</span><b className={d.unverified ? 'y' : 'g'}>{d.unverified}</b></div>
                <div className="rd-chk"><span>{T.inflated}</span><b className={d.inflated ? 'y' : 'g'}>{d.inflated}</b></div>
                <div className="rd-chk"><span>{T.times}</span><b className={d.times > 2 ? 'y' : 'g'}>{d.times}</b></div>
                <div className="rd-chk"><span>{T.used}</span><b>{facts.filter((f) => f.used).length} / {facts.length}</b></div>
              </>
            )}
            {canNudge && (
              <div className="rd-nudge">
                <h5>{T.nudge}</h5>
                <p className="rd-mutd">{live || piece.status === 'writing' ? T.nudgeLater : T.nudgeNow}</p>
                {T.notes.map(([n, sub]) => <button key={n} disabled={busy} onClick={() => send(n)}>{n}<small>{sub}</small></button>)}
                <form onSubmit={(e) => { e.preventDefault(); send(note); }} className="rd-noteform">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.custom} aria-label={T.custom} />
                  <button disabled={busy || !note.trim()}>{T.send}</button>
                </form>
              </div>
            )}
          </aside>
        </div>
      )}

      {coffee && <Coffee onClose={() => setCoffee(false)} />}
      <div className="rd-chatter" aria-label={T.chatter}>
        <button className="rd-coffeebtn" onClick={() => setCoffee(true)}>☕ {T.coffee}</button>
        {chat.length ? chat.slice(0, 8).map((x) => <span key={x.id}><time>{hhmm(x.ts)}</time> {x.text}</span>) : <span>{T.quiet}</span>}
      </div>
    </div>
  );
}
