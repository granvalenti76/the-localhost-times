import React, { useCallback, useEffect, useState } from 'react';
import { api, href } from '../lib.js';
import { tr } from '../i18n.js';

const T = tr({
  en: {
    title: 'New article', sub: 'The newsroom found these subjects in the signals. Pick one: you add the tips, follow the draft and decide whether it goes into the next edition.',
    now: 'In the signals right now', recurring: 'Coming back this week', lead: 'Spotlight leads', write: 'Write it', inWork: 'in the works', working: 'Opening…',
    own: 'Or a subject of your own', ownPh: 'e.g. the evenings on chess.com, the project, the inbox', go: 'Commission', none: 'Nothing forming yet: the signals are quiet.',
    pieces: 'In the works', status: { brief: 'questions', planning: 'outline…', outline: 'outline to approve', writing: 'writing…', draft: 'to review', approved: 'approved for the next edition' },
    lead2: 'lead', close: 'Close',
  },
  it: {
    title: 'Nuovo articolo', sub: 'La redazione ha trovato questi argomenti nei segnali. Ne scelga uno: lei aggiunge le soffiate, segue la stesura e decide se va nella prossima edizione.',
    now: 'Nei segnali adesso', recurring: 'Tornano questa settimana', lead: 'Piste di Spotlight', write: 'Scrivilo', inWork: 'in lavorazione', working: 'Apro…',
    own: 'Oppure un argomento suo', ownPh: 'es. le serate su chess.com, il progetto, la posta', go: 'Commissiona', none: 'Ancora niente in formazione: i segnali tacciono.',
    pieces: 'In lavorazione', status: { brief: 'domande', planning: 'scaletta…', outline: 'scaletta da approvare', writing: 'in scrittura…', draft: 'da rivedere', approved: 'approvato per la prossima edizione' },
    lead2: 'apertura', close: 'Chiudi',
  },
});

const GROUPS = ['now', 'recurring', 'lead'];

/** The pieces the Editor commissioned, while they are being written and reviewed. */
export function PiecesStrip() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const load = () => api('/commissions').then((r) => setList(r.pieces)).catch(() => {});
    load();
    const t = setInterval(load, 10e3);
    return () => clearInterval(t);
  }, []);
  if (!list.length) return null;
  return (
    <section className="pieces">
      <span className="lbl">{T.pieces}</span>
      <ul>
        {list.map((p) => (
          <li key={p.id} className={`piece st-${p.status}`}>
            <a href={href.feature(p.id)}>
              <span className="piece-hl">{p.headline}</span>
              <span className="piece-st">{T.status[p.status] || p.status}{p.status === 'approved' && p.placement === 'lead' ? ` · ${T.lead2}` : ''}</span>
              {p.byline && <span className="piece-by">{p.byline.name}{p.words ? ` · ${p.words} w` : ''}</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The newsroom proposes, the Editor commissions. */
export default function CommissionPanel({ onClose }) {
  const [data, setData] = useState(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/commissions').then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function commission(body, key) {
    setBusy(key);
    setError(null);
    try {
      const f = await api('/features', { method: 'POST', json: { ...body, target: 'edition' } });
      location.hash = href.feature(f.id);
    } catch (e) { setError(e.message); setBusy(null); }
  }

  return (
    <section className="commission">
      <div className="commission-head">
        <h3 className="hl-md">{T.title}</h3>
        <button className="btn-link" onClick={onClose}>{T.close}</button>
      </div>
      <p className="hint-small">{T.sub}</p>
      {error && <p className="notice">{error}</p>}
      {data && !data.proposals.length && <p className="hint-small">{T.none}</p>}
      {data && GROUPS.map((g) => {
        const list = data.proposals.filter((p) => p.kind === g);
        if (!list.length) return null;
        return (
          <div key={g} className="proposals">
            <span className="lbl">{T[g]}</span>
            <ul>
              {list.map((p, i) => (
                <li key={`${g}-${i}`} className={p.inWork ? 'in-work' : ''}>
                  <span className="prop-topic">{p.topic}</span>
                  <span className="prop-why">{p.why}</span>
                  {p.inWork
                    ? <span className="tag">{T.inWork}</span>
                    : <button className="btn btn-small" disabled={!!busy} onClick={() => commission(p.storyId ? { storyId: p.storyId } : { topic: p.topic }, `${g}-${i}`)}>{busy === `${g}-${i}` ? T.working : T.write}</button>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <form className="commission-own" onSubmit={(e) => { e.preventDefault(); if (topic.trim()) commission({ topic: topic.trim() }, 'own'); }}>
        <span className="lbl">{T.own}</span>
        <div className="rewrite-row">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={T.ownPh} />
          <button className="btn btn-small" disabled={!!busy || !topic.trim()}>{busy === 'own' ? T.working : T.go}</button>
        </div>
      </form>
    </section>
  );
}
