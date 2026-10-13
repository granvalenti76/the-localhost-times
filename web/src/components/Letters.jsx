import React, { useEffect, useState } from 'react';
import { api, href, hhmm, shortDate } from '../lib.js';
import { tr } from '../i18n.js';

/** A published letter, with the newsroom's answer. */
export function Letter({ l, compact }) {
  return (
    <article className={`letter ${compact ? 'compact' : ''}`}>
      {l.title && <h4 className="letter-title">{l.title}</h4>}
      <p className="letter-text">{l.text}</p>
      <p className="letter-sign">{l.signature}</p>
      {l.reply && (
        <div className="letter-reply">
          <p>{l.reply}</p>
          <span className="letter-who">{l.replyBy === 'editor' ? tr({ en: 'The Editor replies', it: 'Risponde il Direttore' }) : tr({ en: 'The managing editor replies', it: 'Risponde il caporedattore' })}</span>
        </div>
      )}
    </article>
  );
}

/** The front-page box. */
export function LettersBox({ letters }) {
  if (!letters?.length) {
    return (
      <section className="box letters-box">
        <h3 className="box-title">{tr({ en: 'Letters to the editor', it: 'Lettere al direttore' })}</h3>
        <p className="letters-empty">{tr({ en: 'No letters in this edition.', it: 'Nessuna lettera in questa edizione.' })} <a href={href.letters()}>{tr({ en: 'Write to the paper', it: 'Scrivi al giornale' })} →</a></p>
      </section>
    );
  }
  return (
    <section className="box letters-box">
      <h3 className="box-title">{tr({ en: 'Letters to the editor', it: 'Lettere al direttore' })}</h3>
      {letters.map((l) => <Letter key={l.id} l={l} compact />)}
      <a className="more" href={href.letters()}>{tr({ en: 'All letters · Write to the paper', it: 'Tutte le lettere · Scrivi al giornale' })} →</a>
    </section>
  );
}

const STATUS = tr({
  en: { pending: 'Waiting for the next edition', answered: 'Answer ready, out in the next edition' },
  it: { pending: 'In attesa della prossima edizione', answered: 'Risposta pronta, esce nella prossima edizione' },
});

/**
 * The readers' mail: the regulars write about the pieces they read, and each letter waits for the
 * Editor. Publish it (the managing editor answers at the next press), answer it yourself, or bin it.
 * The readers remember what happened to their letters.
 */
export function Mailbox({ onChange }) {
  const [box, setBox] = useState(null);
  const [replying, setReplying] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api('/letters/mailbox').then(setBox).catch(() => setBox({ letters: [] }));
  useEffect(() => { load(); }, []);
  async function decide(id, action) {
    setBusy(id); setError(null);
    try {
      await api(`/letters/${id}/decide`, { method: 'POST', json: { action, reply } });
      setReplying(null); setReply('');
      await load();
      onChange?.();
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  }
  if (!box?.letters?.length) return null;
  const tone = { praise: tr({ en: 'praise', it: 'complimenti' }), complaint: tr({ en: 'a complaint', it: 'una lamentela' }), other: '' };
  return (
    <section className="mailbox">
      <header>
        <h3>{tr({ en: 'The readers\' mail', it: 'La posta dei lettori' })} <span className="mt-n">{box.letters.length}</span></h3>
        <p>{tr({ en: 'The regulars write about the pieces they read. You decide: publish it (the managing editor answers), answer it yourself, or bin it. They remember.', it: 'I lettori abituali scrivono sui pezzi che leggono. Decidi tu: pubblicala (risponde il caporedattore), rispondi di persona, o cestinala. Se lo ricordano.' })}</p>
      </header>
      {box.letters.map((l) => (
        <article key={l.id} className={`mail-item tone-${l.tone || 'other'}`}>
          <div className="mail-meta">
            <strong>{l.signature}</strong>
            {l.about && <> · {tr({ en: 'on', it: 'su' })} <a href={href.article(l.about.editionId, l.about.articleId)}>{l.about.headline}</a>{l.about.writer?.name ? ` (${l.about.writer.name})` : ''}</>}
            {tone[l.tone] && <em> · {tone[l.tone]}</em>}
          </div>
          <p className="letter-text">{l.text}</p>
          {replying === l.id ? (
            <div className="mail-reply">
              <label className="sr-only" htmlFor={`reply-${l.id}`}>{tr({ en: 'Your answer', it: 'La tua risposta' })}</label>
              <textarea id={`reply-${l.id}`} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={tr({ en: 'Dear reader…', it: 'Caro lettore…' })} autoFocus />
              <div className="mail-acts">
                <button className="btn btn-small" disabled={busy === l.id || !reply.trim()} onClick={() => decide(l.id, 'reply')}>{tr({ en: 'Publish with my answer', it: 'Pubblica con la mia risposta' })}</button>
                <button className="btn-ghost" onClick={() => setReplying(null)}>{tr({ en: 'Cancel', it: 'Annulla' })}</button>
              </div>
            </div>
          ) : (
            <div className="mail-acts">
              <button className="btn btn-small" disabled={busy === l.id} onClick={() => decide(l.id, 'publish')}>{tr({ en: 'Publish', it: 'Pubblica' })}</button>
              <button className="btn-ghost" disabled={busy === l.id} onClick={() => { setReplying(l.id); setReply(''); }}>{tr({ en: 'Answer it yourself', it: 'Rispondi tu' })}</button>
              <button className="btn-ghost danger" disabled={busy === l.id} onClick={() => decide(l.id, 'bin')}>{tr({ en: 'Bin it', it: 'Cestina' })}</button>
            </div>
          )}
        </article>
      ))}
      {error && <p className="notice">{error}</p>}
    </section>
  );
}

/** The letters page: write and read back. */
export default function LettersPage() {
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api('/letters').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  async function send() {
    setBusy('send');
    setError(null);
    try {
      await api('/letters', { method: 'POST', json: { text, signature } });
      setText('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function answer(id) {
    setBusy(id);
    setError(null);
    try {
      await api(`/letters/${id}/answer`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="letters-page">
      <header className="section-head">
        <h2>{tr({ en: 'Letters to the editor', it: 'Lettere al direttore' })}</h2>
        <p>{tr({ en: 'Write to the paper: the newsroom answers in the next edition, with the data at hand.', it: 'Scrivi al giornale: la redazione risponde nella prossima edizione, con i dati alla mano.' })}</p>
      </header>

      <Mailbox onChange={load} />

      <div className="letter-form">
        <label htmlFor="letter-text" className="lbl">{tr({ en: 'Your letter', it: 'La tua lettera' })}</label>
        <textarea id="letter-text" rows={6} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={tr({ en: 'Dear editor, why did I open the same page twelve times today…', it: 'Caro direttore, perché oggi ho aperto dodici volte la stessa pagina…' })} />
        <div className="letter-form-row">
          <label className="sr-only" htmlFor="letter-sign">{tr({ en: 'Signature', it: 'Firma' })}</label>
          <input id="letter-sign" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={tr({ en: 'Signature (e.g. “Sam, from the couch”)', it: 'Firma (es. «Luca, dal divano»)' })} />
          <button className="btn" onClick={send} disabled={busy === 'send' || text.trim().length < 3}>
            {busy === 'send' ? tr({ en: 'Sending…', it: 'Spedisco…' }) : tr({ en: 'Send', it: 'Spedisci' })}
          </button>
        </div>
        {error && <p className="notice">{error}</p>}
      </div>

      <div className="letters-list">
        {list && !list.length && <p className="empty-text">{tr({ en: 'No letters yet. The first one is the hardest.', it: 'Ancora nessuna lettera. La prima è la più difficile.' })}</p>}
        {(list || []).map((l) => (
          <div key={l.id} className="letters-item">
            <div className="letters-meta">
              <time>{shortDate(l.ts)}, {hhmm(l.ts)}</time>
              {l.status === 'published' && l.editionId ? (
                <a href={href.edition(l.editionId)}>{tr({ en: `Published in the ${l.editionId.slice(11)}:00 edition`, it: `Pubblicata nell'edizione delle ${l.editionId.slice(11)}:00` })}</a>
              ) : (
                <span>{STATUS[l.status] || l.status}</span>
              )}
              {l.status !== 'published' && (
                <button className="btn-ghost" disabled={!!busy} onClick={() => answer(l.id)}>
                  {busy === l.id ? tr({ en: 'The managing editor is writing…', it: 'Il caporedattore scrive…' }) : tr({ en: 'Answer now', it: 'Rispondi subito' })}
                </button>
              )}
            </div>
            <Letter l={l} />
          </div>
        ))}
      </div>
    </section>
  );
}
