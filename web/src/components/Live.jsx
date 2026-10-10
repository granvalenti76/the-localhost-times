import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, hhmm, href, minutesLeft } from '../lib.js';
import { tr } from '../i18n.js';

// ───────────────────────── One poll for the whole page ─────────────────────────
// open calls, breaking news and the newsroom chatter, refreshed every 20 seconds and on focus

let live = { calls: [], flashes: [], chatter: [], at: 0 };
const listeners = new Set();
let timer = null;

export async function refreshLive() {
  try {
    live = { ...(await api('/live?chatter=8')), at: Date.now() };
    listeners.forEach((l) => l());
  } catch { /* the paper is restarting: keep what we have */ }
}

function subscribe(l) {
  listeners.add(l);
  if (!timer) {
    refreshLive();
    timer = setInterval(refreshLive, 20e3);
    window.addEventListener('focus', refreshLive);
  }
  return () => {
    listeners.delete(l);
    if (!listeners.size) { clearInterval(timer); timer = null; window.removeEventListener('focus', refreshLive); }
  };
}

export const useLive = () => useSyncExternalStore(subscribe, () => live);

const T = tr({
  en: {
    onLine: 'on the line', reply: 'Answer', noComment: 'No comment', ph: 'Your answer, in one line: it goes in the paper as a quote',
    late: 'Late: your answer will be added to the printed article as an update.', sent: 'Got it: it goes in the paper.',
    sentLate: 'Added to the article as an update.', chosen: 'Done: the desk follows your choice.', calls: 'The newsroom is calling',
    none: 'Nobody is calling right now. The reporters call when a big story is forming, and the desk at :55.',
    breaking: 'Breaking news', read: 'Read', live: 'In the newsroom, now', quiet: 'The newsroom is quiet.', seeAll: 'All the chatter',
    noCommentSent: '“No comment”: noted.',
    leadPh: 'A lead for the article (optional): what should the reporter look into? Not a quote: it makes the piece longer',
    sentLead: 'Got it: the quote goes in the paper, and the reporter follows your lead.',
    leadOnly: 'Nothing on the record: the reporter takes note of your lead and follows it.',
    followLate: 'The reporter goes back to the printed article and expands it with your lead.',
  },
  it: {
    onLine: 'al telefono', reply: 'Rispondi', noComment: 'Nessun commento', ph: 'La sua risposta, in una riga: finisce sul giornale come citazione',
    late: 'In ritardo: la risposta verrà aggiunta all\'articolo già stampato, come aggiornamento.', sent: 'Ricevuto: va sul giornale.',
    sentLate: 'Aggiunta all\'articolo come aggiornamento.', chosen: 'Fatto: il desk segue la sua scelta.', calls: 'La redazione chiama',
    none: 'Nessuno chiama, adesso. I cronisti chiamano quando si forma una storia grossa, il desk alle :55.',
    breaking: 'Ultim\'ora', read: 'Leggi', live: 'In redazione, ora', quiet: 'La redazione tace.', seeAll: 'Tutte le chiacchiere',
    noCommentSent: '«Nessun commento»: preso nota.',
    leadPh: 'Una traccia per l\'articolo (facoltativa): cosa dovrebbe approfondire il cronista? Non è una citazione: allunga il pezzo',
    sentLead: 'Ricevuto: la dichiarazione va sul giornale, e il cronista segue la sua traccia.',
    leadOnly: 'Niente dichiarazioni: il cronista prende nota della traccia e la segue.',
    followLate: 'Il cronista riprende l\'articolo già stampato e lo amplia con la sua traccia.',
  },
});

// ───────────────────────── A call ─────────────────────────

export function Call({ call: c, big = false, onDone }) {
  const [text, setText] = useState('');
  const [lead, setLead] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const input = useRef(null);
  useEffect(() => { if (big && c.type === 'interview') input.current?.focus(); }, [big, c.type]);

  async function send(body) {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/calls/${c.id}/answer`, { method: 'POST', json: body });
      setDone(r.follow ? T.followLate
        : body.lead ? (body.text && !body.decline ? T.sentLead : T.leadOnly)
          : body.decline ? T.noCommentSent : c.type === 'interview' ? (r.update ? T.sentLate : T.sent) : T.chosen);
      setTimeout(() => { refreshLive(); onDone?.(r); }, 1800);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <div className={`call call-done ${big ? 'big' : ''}`}><span className="call-ok">✓</span> {done}</div>;
  return (
    <div className={`call call-${c.type} ${big ? 'big' : ''} ${c.late ? 'late' : ''}`}>
      <div className="call-who">
        <span className="call-ring" aria-hidden="true">☎︎</span>
        <strong>{c.by?.name || ''}</strong>{c.type === 'interview' && <span> {T.onLine}</span>}
        {c.section && <span className="call-sec"> · {c.section}</span>}
        {!c.late && <span className="call-left">{minutesLeft(c.minutesLeft)}</span>}
      </div>
      <p className="call-q">{c.question}</p>
      {c.type === 'interview' ? (
        <>
          <form className="call-form" onSubmit={(e) => { e.preventDefault(); if (text.trim() || lead.trim()) send({ text: text.trim(), lead: lead.trim() || undefined }); }}>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={T.ph} maxLength={400} disabled={busy} />
            <button className="btn btn-small" disabled={busy || !(text.trim() || lead.trim())}>{T.reply}</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => send({ decline: true, lead: lead.trim() || undefined })}>{T.noComment}</button>
            <textarea className="call-lead" value={lead} onChange={(e) => setLead(e.target.value)} placeholder={T.leadPh} maxLength={600} rows={2} disabled={busy}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form.requestSubmit(); }} />
          </form>
          {c.late && <p className="hint-small">{T.late}</p>}
        </>
      ) : (
        <div className="call-options">
          {c.options.map((o) => <button key={o.id} className={o.id === 'desk' || o.id === 'keep' ? 'btn-ghost' : 'btn btn-small'} disabled={busy} onClick={() => send({ option: o.id })}>{o.label}</button>)}
        </div>
      )}
      {error && <p className="notice">{error}</p>}
    </div>
  );
}

/** Under the masthead, on every page: the newsroom on the line. */
export function CallsBar({ except }) {
  const { calls } = useLive();
  const shown = calls.filter((c) => !c.late && String(c.id) !== String(except)).slice(0, 2);
  if (!shown.length) return null;
  return (
    <section className="calls-bar" aria-label={T.calls}>
      {shown.map((c) => <Call key={c.id} call={c} />)}
    </section>
  );
}

/** #/calls and #/calls/:id: where the notifications lead. */
export function CallsPage({ id }) {
  const { calls, at } = useLive();
  const focus = calls.find((c) => String(c.id) === String(id));
  const rest = calls.filter((c) => c !== focus);
  return (
    <div className="calls-page">
      <h2 className="calls-title">{T.calls}</h2>
      {focus && <Call call={focus} big onDone={() => { location.hash = '#/'; }} />}
      {rest.map((c) => <Call key={c.id} call={c} big={!focus} />)}
      {!calls.length && at > 0 && <p className="empty-text">{T.none}</p>}
    </div>
  );
}

/** Breaking news at the top of the front page. */
export function FlashBand() {
  const { flashes } = useLive();
  const f = flashes[0];
  if (!f) return null;
  return (
    <div className="flash-band" role="status">
      <span className="flash-tag">⚡ {T.breaking}</span>
      <span className="flash-time">{hhmm(f.ts)}</span>
      <strong className="flash-hl">{f.headline}</strong>
      <span className="flash-text">{f.text}</span>
    </div>
  );
}

/** "In the newsroom, now": the last lines of chatter. */
export function ChatterBox({ limit = 5 }) {
  const { chatter } = useLive();
  return (
    <section className="box chatter-box">
      <h3 className="box-title"><span className="live-dot" aria-hidden="true" />{T.live}</h3>
      {chatter.length ? (
        <ul className="chatter">
          {chatter.slice(0, limit).map((x) => (
            <li key={x.id}><time>{hhmm(x.ts)}</time> <span>{x.text}</span></li>
          ))}
        </ul>
      ) : <p className="hint-small">{T.quiet}</p>}
      <a className="more" href={href.desk('viva')}>{T.seeAll} →</a>
    </section>
  );
}

/** The full feed, in the newsroom. */
export function ChatterFeed() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const load = () => api('/chatter?limit=80').then(setList).catch(() => {});
    load();
    const t = setInterval(load, 15e3);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="chatter-feed">
      {list.length ? (
        <ul className="chatter">
          {list.map((x) => <li key={x.id}><time>{hhmm(x.ts)}</time> <span>{x.text}</span></li>)}
        </ul>
      ) : <p className="hint-small">{T.quiet}</p>}
    </div>
  );
}
