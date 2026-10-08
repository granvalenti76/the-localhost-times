import React, { useEffect, useState } from 'react';
import { api, hhmm, href } from '../lib.js';
import { tr } from '../i18n.js';

const T = tr({
  en: {
    title: 'The next edition', out: (t, m) => `Out at about ${t} (in ${m} min)`, signals: 'signals so far', since: 'since',
    merge: (n) => `Below ${n} signals it won't be printed: it will merge into the following edition.`,
    forming: 'Stories forming, in page order', none: 'Nothing collected yet for this hour.',
    lead: 'Lead', unlead: 'Lead ✓', out2: 'Leave out', back: 'Put back', briefs: 'briefs', buried: 'Left out',
    notes: 'Instructions for this edition only', notePh: 'e.g. “more irony on the mail”, “no social media”', add: 'Add',
    print: 'Print now', printing: 'Printing…', hint: 'Your choices apply to this edition only, then they are cleared. The paper collects every 5 minutes.',
    lastCollect: 'last collection',
  },
  it: {
    title: 'La prossima edizione', out: (t, m) => `Esce verso le ${t} (tra ${m} min)`, signals: 'segnali finora', since: 'dalle',
    merge: (n) => `Sotto i ${n} segnali non uscirà: confluirà nell'edizione successiva.`,
    forming: 'Storie in formazione, in ordine di pagina', none: 'Ancora niente raccolto per quest\'ora.',
    lead: 'Apertura', unlead: 'Apertura ✓', out2: 'Fuori', back: 'Rimetti', briefs: 'in breve', buried: 'Lasciate fuori',
    notes: 'Indicazioni solo per questa edizione', notePh: 'es. «più ironia sulla posta», «niente social»', add: 'Aggiungi',
    print: 'Stampa ora', printing: 'In stampa…', hint: 'Le tue scelte valgono solo per questa edizione, poi si azzerano. Il giornale raccoglie ogni 5 minuti.',
    lastCollect: 'ultima raccolta',
  },
});

/** In the newsroom: what the next edition will contain, and how to steer it before it is printed. */
export default function NextEdition({ onPrinted, setError }) {
  const [p, setP] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);

  const load = () => api('/next').then(setP).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60e3);
    return () => clearInterval(t);
  }, []);

  async function steer(body, key) {
    setBusy(key);
    setError?.(null);
    try {
      setP(await api('/next/steer', { method: 'POST', json: body }));
    } catch (e) {
      setError?.(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function printNow() {
    setBusy('print');
    setError?.(null);
    try {
      const ed = await api('/print', { method: 'POST' });
      if (ed) { onPrinted?.(ed); location.hash = href.desk(ed.id); }
      load();
    } catch (e) {
      setError?.(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!p) return <div className="next-panel" />;
  const boosted = new Set(p.steer.boost);
  return (
    <div className="next-panel">
      <div className="next-head">
        <strong>{T.out(hhmm(p.printsAt), p.minutesLeft)}</strong>
        <span className="muted">{p.total} {T.signals} · {T.since} {hhmm(p.windowStart)}{p.lastCollect ? ` · ${T.lastCollect} ${hhmm(p.lastCollect)}` : ''}</span>
      </div>
      {p.willMerge && p.total > 0 && <p className="next-warn">{T.merge(p.minEvents)}</p>}

      <span className="lbl">{T.forming}</span>
      {!p.stories.length && <p className="hint-small">{T.none}</p>}
      <ol className="next-stories">
        {p.stories.map((s) => (
          <li key={s.id} className={`${s.inPaper ? '' : 'out'} ${s.boosted ? 'boosted' : ''}`}>
            <span className="n">{s.rank}</span>
            <div className="t">
              <span className="sec">{s.section}</span>
              <span className="topic">{s.topic}</span>
              <span className="muted"> · {s.signals}{s.inPaper ? '' : ` · ${T.briefs}`}</span>
            </div>
            <div className="b">
              <button className={`btn-ghost ${boosted.has(s.id) ? 'on' : ''}`} disabled={!!busy}
                onClick={() => steer({ op: boosted.has(s.id) ? 'unboost' : 'boost', story: s.id }, s.id)}>
                {boosted.has(s.id) ? T.unlead : T.lead}
              </button>
              <button className="btn-ghost" disabled={!!busy} onClick={() => steer({ op: 'bury', story: s.id }, s.id)}>{T.out2}</button>
            </div>
          </li>
        ))}
      </ol>
      {p.buried.length > 0 && (
        <div className="next-buried">
          <span className="lbl">{T.buried}</span>
          {p.buried.map((s) => (
            <div key={s.id} className="next-buried-row">
              <span><span className="sec">{s.section}</span> {s.topic}</span>
              <button className="btn-ghost" disabled={!!busy} onClick={() => steer({ op: 'unbury', story: s.id }, s.id)}>{T.back}</button>
            </div>
          ))}
        </div>
      )}

      <span className="lbl">{T.notes}</span>
      {p.steer.notes.map((n, i) => (
        <div key={i} className="next-note">
          <span>{n}</span>
          <button className="linkish" onClick={() => steer({ op: 'unnote', index: i }, `n${i}`)} aria-label="✕">✕</button>
        </div>
      ))}
      <form className="next-note-form" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { steer({ op: 'note', text: note }, 'note'); setNote(''); } }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.notePh} />
        <button className="btn-ghost" disabled={!note.trim() || !!busy}>{T.add}</button>
      </form>

      <button className={`btn btn-block ${busy === 'print' ? 'busy' : ''}`} disabled={!!busy || !p.total} onClick={printNow}>
        {busy === 'print' ? T.printing : T.print}
      </button>
      <p className="hint-small">{T.hint}</p>
    </div>
  );
}
