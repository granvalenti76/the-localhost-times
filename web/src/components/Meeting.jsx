import React, { useEffect, useRef, useState } from 'react';
import { api, modelName, hhmm } from '../lib.js';
import { tr } from '../i18n.js';

const STARTERS = tr({
  en: {
    edition: ['What would you lead with?', 'Which piece is the weakest?', 'Does the tone of this edition work?', 'Is anything missing?'],
    evening: ['Does the editorial capture the day?', 'What really mattered today?', 'What rule would you give the newsroom for tomorrow?'],
  },
  it: {
    edition: ['Cosa metteresti in apertura?', 'Qual è il pezzo più debole?', 'Il tono di questa edizione ti convince?', 'Manca qualcosa?'],
    evening: ['L\'editoriale coglie la giornata?', 'Cosa è stato davvero importante oggi?', 'Che regola daresti alla redazione per domani?'],
  },
});

/**
 * The editorial meeting: the editor speaks, the managing editor (the model) answers
 * and proposes actions the editor can apply with one click.
 */
export default function Meeting({ threadId, kind = 'edition', focus, onClearFocus, onResult, model }) {
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(null);
  const [error, setError] = useState(null);
  // every visit to the newsroom starts a new meeting
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
    // the editor's message shows up right away
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

  // messages of the current meeting and of earlier ones (with the original index, for "Apply")
  const all = (thread?.messages || []).map((m, idx) => ({ ...m, idx }));
  const messages = all.filter((m) => m.session === session);
  const past = [];
  for (const m of all.filter((x) => x.session !== session)) {
    const key = m.session ?? 'first';
    let g = past.find((p) => p.key === key);
    if (!g) { g = { key, ts: m.ts, messages: [] }; past.push(g); }
    g.messages.push(m);
  }
  past.reverse();

  const renderMsg = (m) => (
    <div key={m.idx} className={`msg msg-${m.role} ${m.pending ? 'pending' : ''}`}>
      <div className="msg-who">{m.role === 'director' ? tr({ en: 'The editor', it: 'Il direttore' }) : tr({ en: 'The managing editor', it: 'Il caporedattore' })}</div>
      {m.articleId && m.role === 'director' && <div className="msg-about">{tr({ en: 'on the article', it: 'sull\'articolo' })} {m.articleId.split(':').pop()}</div>}
      <p className="msg-text">{m.text}</p>
      {m.actions?.length > 0 && (
        <ul className="msg-actions">
          {m.actions.map((a, ai) => (
            <li key={ai} className={a.status === 'applied' ? 'done' : ''}>
              <span className="a-label">{a.label}</span>
              {a.status === 'applied' ? (
                <span className="a-done">✓ {tr({ en: 'Done', it: 'Fatto' })}</span>
              ) : (
                <button className="btn btn-small" disabled={!!applying} onClick={() => apply(m.idx, ai)}>
                  {applying === `${m.idx}-${ai}`
                    ? (a.type === 'rewrite' || a.type === 'editorial' ? tr({ en: 'Rewriting…', it: 'Riscrivo…' }) : tr({ en: 'Applying…', it: 'Applico…' }))
                    : tr({ en: 'Apply', it: 'Applica' })}
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
    <section className="meeting" aria-label={tr({ en: 'Editorial meeting', it: 'Riunione di redazione' })}>
      <div className="meeting-head">
        <span className="hint-small">{tr({ en: `Meeting of ${hhmm(session)}`, it: `Riunione delle ${hhmm(session)}` })}</span>
        {messages.length > 0 && (
          <button className="linkish" onClick={() => { setSession(Date.now()); onClearFocus?.(); }}>{tr({ en: 'New meeting', it: 'Nuova riunione' })}</button>
        )}
      </div>
      <div className="meeting-log" aria-live="polite">
        {!messages.length && !busy && (
          <div className="meeting-empty">
            <p>{tr({
              en: `The meeting is open. The managing editor${model ? ` (${modelName(model)})` : ''} has the edition in front of them: ask for an opinion, discuss a piece, set a rule.`,
              it: `La riunione è aperta. Il caporedattore${model ? ` (${modelName(model)})` : ''} ha l'edizione davanti: chiedigli un parere, discuti un pezzo, dai una regola.`,
            })}</p>
            <div className="chips">
              {STARTERS[kind].map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map(renderMsg)}
        {busy && (
          <div className="msg msg-editor">
            <div className="msg-who">{tr({ en: 'The managing editor', it: 'Il caporedattore' })}</div>
            <p className="msg-text working">{tr({ en: 'thinking…', it: 'ci pensa…' })}</p>
          </div>
        )}
        <div ref={endRef} />
        {past.length > 0 && (
          <details className="meeting-past">
            <summary>{tr({ en: 'Earlier meetings', it: 'Riunioni precedenti' })} ({past.length})</summary>
            {past.map((g) => (
              <details key={g.key} className="meeting-session">
                <summary>{tr({ en: `Meeting of ${hhmm(g.ts)} · ${g.messages.length} messages`, it: `Riunione delle ${hhmm(g.ts)} · ${g.messages.length} messaggi` })}</summary>
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
            <span>{tr({ en: `On: “${focus.headline}”`, it: `Su: «${focus.headline}»` })}</span>
            <button className="linkish" onClick={onClearFocus} aria-label={tr({ en: 'Remove the article from the discussion', it: 'Togli l\'articolo dalla discussione' })}>✕</button>
          </div>
        )}
        <label className="sr-only" htmlFor="meeting-input">{tr({ en: 'Write to the managing editor', it: 'Scrivi al caporedattore' })}</label>
        <textarea
          id="meeting-input"
          ref={inputRef}
          rows={3}
          value={text}
          placeholder={focus ? tr({ en: 'What do you think of this piece?', it: 'Cosa ne pensi di questo pezzo?' }) : tr({ en: 'Write to the managing editor…', it: 'Scrivi al caporedattore…' })}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
        />
        <div className="compose-row">
          <span className="hint-small">{tr({ en: '⌘↩ to send · proposed actions only run if you apply them', it: '⌘↩ per inviare · le azioni proposte partono solo se le applichi' })}</span>
          <button className="btn btn-small" onClick={() => send()} disabled={busy || !text.trim()}>{tr({ en: 'Send', it: 'Invia' })}</button>
        </div>
      </div>
    </section>
  );
}
