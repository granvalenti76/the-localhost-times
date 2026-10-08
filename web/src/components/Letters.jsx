import React, { useEffect, useState } from 'react';
import { api, href, hhmm, shortDate } from '../lib.js';

/** Una lettera pubblicata, con la risposta della redazione. */
export function Letter({ l, compact }) {
  return (
    <article className={`letter ${compact ? 'compact' : ''}`}>
      {l.title && <h4 className="letter-title">{l.title}</h4>}
      <p className="letter-text">{l.text}</p>
      <p className="letter-sign">{l.signature}</p>
      {l.reply && (
        <div className="letter-reply">
          <p>{l.reply}</p>
          <span className="letter-who">Risponde il caporedattore</span>
        </div>
      )}
    </article>
  );
}

/** Il riquadro in prima pagina. */
export function LettersBox({ letters }) {
  if (!letters?.length) {
    return (
      <section className="box letters-box">
        <h3 className="box-title">Lettere al direttore</h3>
        <p className="letters-empty">Nessuna lettera in questa edizione. <a href={href.letters()}>Scrivi al giornale →</a></p>
      </section>
    );
  }
  return (
    <section className="box letters-box">
      <h3 className="box-title">Lettere al direttore</h3>
      {letters.map((l) => <Letter key={l.id} l={l} compact />)}
      <a className="more" href={href.letters()}>Tutte le lettere · Scrivi al giornale →</a>
    </section>
  );
}

const STATUS = { pending: 'In attesa della prossima edizione', answered: 'Risposta pronta, esce nella prossima edizione' };

/** La pagina delle lettere: scrivi e rileggi. */
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
        <h2>Lettere al direttore</h2>
        <p>Scrivi al giornale: la redazione risponde nella prossima edizione, con i dati alla mano.</p>
      </header>

      <div className="letter-form">
        <label htmlFor="letter-text" className="lbl">La tua lettera</label>
        <textarea id="letter-text" rows={6} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Caro direttore, perché oggi ho aperto dodici volte la stessa pagina…" />
        <div className="letter-form-row">
          <label className="sr-only" htmlFor="letter-sign">Firma</label>
          <input id="letter-sign" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Firma (es. «Luca, dal divano»)" />
          <button className="btn" onClick={send} disabled={busy === 'send' || text.trim().length < 3}>
            {busy === 'send' ? 'Spedisco…' : 'Spedisci'}
          </button>
        </div>
        {error && <p className="notice">{error}</p>}
      </div>

      <div className="letters-list">
        {list && !list.length && <p className="empty-text">Ancora nessuna lettera. La prima è la più difficile.</p>}
        {(list || []).map((l) => (
          <div key={l.id} className="letters-item">
            <div className="letters-meta">
              <time>{shortDate(l.ts)}, {hhmm(l.ts)}</time>
              {l.status === 'published' && l.editionId ? (
                <a href={href.edition(l.editionId)}>Pubblicata nell'edizione delle {l.editionId.slice(11)}:00</a>
              ) : (
                <span>{STATUS[l.status] || l.status}</span>
              )}
              {l.status !== 'published' && (
                <button className="btn-ghost" disabled={!!busy} onClick={() => answer(l.id)}>
                  {busy === l.id ? 'Il caporedattore scrive…' : 'Rispondi subito'}
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
