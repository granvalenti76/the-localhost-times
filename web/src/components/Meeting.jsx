import React, { useEffect, useRef, useState } from 'react';
import { api, modelName, hhmm } from '../lib.js';

const STARTERS = {
  edition: ['Cosa metteresti in apertura?', 'Qual è il pezzo più debole?', 'Il tono di questa edizione ti convince?', 'Manca qualcosa?'],
  evening: ['L\'editoriale coglie la giornata?', 'Cosa è stato davvero importante oggi?', 'Che regola daresti alla redazione per domani?'],
};

/**
 * La riunione di redazione: il direttore parla, il caporedattore (il modello) risponde
 * e propone azioni che il direttore può applicare con un clic.
 */
export default function Meeting({ threadId, kind = 'edition', focus, onClearFocus, onResult, model }) {
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(null);
  const [error, setError] = useState(null);
  // ogni volta che si entra in redazione comincia una riunione nuova
  const [session, setSession] = useState(() => Date.now());
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const url = `/threads/${encodeURIComponent(threadId)}`;

  useEffect(() => {
    setThread(null);
    setError(null);
    api(url).then(setThread).catch((e) => setError(e.message));
  }, [url]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [thread, busy]);

  useEffect(() => {
    if (focus) inputRef.current?.focus();
  }, [focus]);

  async function send(msg) {
    const t = (msg ?? text).trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    // il messaggio del direttore compare subito
    setThread((th) => ({ ...th, messages: [...(th?.messages || []), { role: 'director', text: t, articleId: focus?.id || null, pending: true, session }] }));
    setText('');
    try {
      setThread(await api(url, { method: 'POST', json: { text: t, articleId: focus?.id || null, session } }));
      onClearFocus?.();
    } catch (e) {
      setError(e.message);
      setText(t);
      setThread((th) => ({ ...th, messages: th.messages.filter((m) => !m.pending) }));
    } finally {
      setBusy(false);
    }
  }

  async function apply(mi, ai) {
    setApplying(`${mi}-${ai}`);
    setError(null);
    try {
      const r = await api(`${url}/apply`, { method: 'POST', json: { msg: mi, action: ai } });
      setThread(r.thread);
      onResult?.(r);
    } catch (e) {
      setError(e.message);
      api(url).then(setThread).catch(() => {});
    } finally {
      setApplying(null);
    }
  }

  // messaggi della riunione in corso e delle riunioni precedenti (con l'indice originale, per «Applica»)
  const all = (thread?.messages || []).map((m, idx) => ({ ...m, idx }));
  const messages = all.filter((m) => m.session === session);
  const past = [];
  for (const m of all.filter((x) => x.session !== session)) {
    const key = m.session ?? 'prima';
    let g = past.find((p) => p.key === key);
    if (!g) { g = { key, ts: m.ts, messages: [] }; past.push(g); }
    g.messages.push(m);
  }
  past.reverse();

  const renderMsg = (m) => (
    <div key={m.idx} className={`msg msg-${m.role} ${m.pending ? 'pending' : ''}`}>
      <div className="msg-who">{m.role === 'director' ? 'Il direttore' : 'Il caporedattore'}</div>
      {m.articleId && m.role === 'director' && <div className="msg-about">sull'articolo {m.articleId.split(':').pop()}</div>}
      <p className="msg-text">{m.text}</p>
      {m.actions?.length > 0 && (
        <ul className="msg-actions">
          {m.actions.map((a, ai) => (
            <li key={ai} className={a.status === 'applied' ? 'done' : ''}>
              <span className="a-label">{a.label}</span>
              {a.status === 'applied' ? (
                <span className="a-done">✓ Fatto</span>
              ) : (
                <button className="btn btn-small" disabled={!!applying} onClick={() => apply(m.idx, ai)}>
                  {applying === `${m.idx}-${ai}` ? (a.type === 'rewrite' || a.type === 'editorial' ? 'Riscrivo…' : 'Applico…') : 'Applica'}
                </button>
              )}
              {a.error && <span className="a-error">{a.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="meeting" aria-label="Riunione di redazione">
      <div className="meeting-head">
        <span className="hint-small">Riunione delle {hhmm(session)}</span>
        {messages.length > 0 && (
          <button className="linkish" onClick={() => { setSession(Date.now()); onClearFocus?.(); }}>Nuova riunione</button>
        )}
      </div>
      <div className="meeting-log" aria-live="polite">
        {!messages.length && !busy && (
          <div className="meeting-empty">
            <p>La riunione è aperta. Il caporedattore{model ? ` (${modelName(model)})` : ''} ha l'edizione davanti: chiedigli un parere, discuti un pezzo, dai una regola.</p>
            <div className="chips">
              {STARTERS[kind].map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map(renderMsg)}
        {busy && (
          <div className="msg msg-editor">
            <div className="msg-who">Il caporedattore</div>
            <p className="msg-text working">ci pensa…</p>
          </div>
        )}
        <div ref={endRef} />
        {past.length > 0 && (
          <details className="meeting-past">
            <summary>Riunioni precedenti ({past.length})</summary>
            {past.map((g) => (
              <details key={g.key} className="meeting-session">
                <summary>Riunione delle {hhmm(g.ts)} · {g.messages.length} messaggi</summary>
                {g.messages.map(renderMsg)}
              </details>
            ))}
          </details>
        )}
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="meeting-compose">
        {focus && (
          <div className="focus-chip">
            <span>Su: «{focus.headline}»</span>
            <button className="linkish" onClick={onClearFocus} aria-label="Togli l'articolo dalla discussione">✕</button>
          </div>
        )}
        <label className="sr-only" htmlFor="meeting-input">Scrivi al caporedattore</label>
        <textarea
          id="meeting-input"
          ref={inputRef}
          rows={3}
          value={text}
          placeholder={focus ? 'Cosa ne pensi di questo pezzo?' : 'Scrivi al caporedattore…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
        />
        <div className="compose-row">
          <span className="hint-small">⌘↩ per inviare · le azioni proposte partono solo se le applichi</span>
          <button className="btn btn-small" onClick={() => send()} disabled={busy || !text.trim()}>Invia</button>
        </div>
      </div>
    </section>
  );
}
