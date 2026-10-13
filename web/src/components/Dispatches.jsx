import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, href, hhmm, shortDate, dayKey } from '../lib.js';
import { tr } from '../i18n.js';
import { NewsroomNav } from './Inquiry.jsx';
import { Medallion } from './Rooms.jsx';

/*
 * The Editor's sources: what the Mac can't know, written by the Editor as a trace. Choose the
 * section (its writer will write it), tie it to a story in the works if it belongs there, write
 * the subject and the note, say when it happened, how the paper may attribute it and how much room
 * it deserves. It is a signal like the others: the meeting weighs it, a writer drafts it, it goes
 * through the proof round and to press.
 */

const T = tr({
  en: {
    title: 'Sources', sub: 'What the Mac can\'t know, you write: a trace, and a writer makes a piece of it.',
    section: 'Section', writes: (n) => `${n} writes it`, unsigned: 'the newsroom writes it',
    tie: 'Tie it to', alone: 'A piece of its own', tieHint: 'Tied to a story in the works, the note becomes one more fact of that piece.',
    subject: 'Subject', subjectPh: 'e.g. Why the tests ran all night',
    note: 'The note', notePh: 'What happened, in a few lines: the facts only you know. The writer won\'t invent anything beyond them.',
    when: 'When it happened', now: 'now',
    attr: 'How we quote it', attrs: { fact: 'As a fact', editor: '“The Editor reports”', source: '“A source close to the owner”' },
    size: 'Room', sizes: { brief: 'Brief', article: 'Article', lead: 'Lead' },
    writeNow: 'Have it written now', send: 'Send to the newsroom', sending: 'Sending…', sent: 'In the newsroom.', watch: 'See it being written →',
    mine: 'Your traces', none: 'No traces yet. The first one could be what the Mac missed today.',
    st: { waiting: 'waiting for the meeting', writing: 'being written', drafted: 'draft ready', printed: 'in print' },
    open: { drafted: 'To the proof round →', writing: 'To the writing room →', printed: 'Read it →' },
    withdraw: 'Withdraw', tiedTo: 'tied to a story', at: 'at',
  },
  it: {
    title: 'Fonti', sub: 'Quello che il Mac non può sapere, lo scrivi tu: una traccia, e un redattore ne fa un pezzo.',
    section: 'Sezione', writes: (n) => `la scrive ${n}`, unsigned: 'la scrive la redazione',
    tie: 'Agganciala a', alone: 'Un pezzo a sé', tieHint: 'Agganciata a una storia in lavorazione, l\'appunto diventa un fatto in più di quel pezzo.',
    subject: 'Argomento', subjectPh: 'es. Perché i test sono girati tutta la notte',
    note: 'L\'appunto', notePh: 'Cosa è successo, in poche righe: i fatti che sai solo tu. Il redattore non inventerà niente oltre a questi.',
    when: 'Quando è successo', now: 'adesso',
    attr: 'Come la citiamo', attrs: { fact: 'Come un fatto', editor: '«Riferisce il Direttore»', source: '«Una fonte vicina al proprietario»' },
    size: 'Spazio', sizes: { brief: 'Breve', article: 'Articolo', lead: 'Apertura' },
    writeNow: 'Fallo scrivere subito', send: 'Manda in redazione', sending: 'Spedisco…', sent: 'È in redazione.', watch: 'Guardalo nascere →',
    mine: 'Le tue tracce', none: 'Ancora nessuna traccia. La prima potrebbe essere quello che oggi il Mac non ha visto.',
    st: { waiting: 'in attesa della riunione', writing: 'in scrittura', drafted: 'bozza pronta', printed: 'in pagina' },
    open: { drafted: 'Al giro di bozze →', writing: 'In sala scrittura →', printed: 'Leggilo →' },
    withdraw: 'Ritira', tiedTo: 'agganciata a una storia', at: 'alle',
  },
});

// "2026-10-14T15:20" in local time, for the datetime input
const localInput = (ms) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };

export default function Dispatches() {
  const [v, setV] = useState(null);
  const [meta, setMeta] = useState(null);
  const [f, setF] = useState({ section: 'terminal', storyId: '', title: '', text: '', at: '', attribution: 'fact', size: 'article', writeNow: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const load = useCallback(() => api('/dispatches').then(setV).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); api('/line').then(setMeta).catch(() => {}); }, [load]);
  useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const writer = useMemo(() => {
    const id = meta?.line?.desks?.[f.section];
    return id ? meta?.staff?.[id] : null;
  }, [meta, f.section]);
  const stories = (v?.stories || []).filter((x) => x.source === f.section);

  async function send(e) {
    e.preventDefault();
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await api('/dispatches', { method: 'POST', json: { ...f, at: f.at ? new Date(f.at).getTime() : null, storyId: f.storyId || null } });
      setV(r);
      setDone({ writeNow: f.writeNow });
      setF((x) => ({ ...x, title: '', text: '', at: '', storyId: '' }));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function withdraw(id) {
    try { setV(await api(`/dispatches/${encodeURIComponent(id)}`, { method: 'DELETE' })); } catch (err) { setError(err.message); }
  }
  const linkOf = (d) => (d.status === 'printed' ? href.edition(d.editionId) : d.status === 'drafted' ? href.proofs(d.storyId) : d.status === 'writing' ? href.write(d.storyId) : null);

  return (
    <div className="rd-desk-page fullbleed">
      <header className="rd-head">
        <div><h2>{T.title}</h2><p className="rd-mut rd-headsub">{T.sub}</p><NewsroomNav on="sources" /></div>
      </header>
      <div className="rd-sources">
        <form className="rd-dispatch" onSubmit={send}>
          <div className="rd-field">
            <span className="rd-flbl">{T.section}</span>
            <div className="rd-seg rd-seg-wrap" role="group" aria-label={T.section}>
              {(v?.sections || []).map((s) => <button key={s.id} type="button" aria-pressed={f.section === s.id} onClick={() => set({ section: s.id, storyId: '' })}>{s.name}</button>)}
            </div>
            <small className="rd-writes"><Medallion writer={writer} size="sm" /> {writer ? T.writes(writer.name) : T.unsigned}</small>
          </div>
          {stories.length > 0 && (
            <div className="rd-field">
              <label className="rd-flbl" htmlFor="d-tie">{T.tie}</label>
              <select id="d-tie" value={f.storyId} onChange={(e) => set({ storyId: e.target.value })}>
                <option value="">{T.alone}</option>
                {stories.map((s) => <option key={s.id} value={s.id}>{s.topic}</option>)}
              </select>
              <small>{T.tieHint}</small>
            </div>
          )}
          <div className="rd-field">
            <label className="rd-flbl" htmlFor="d-title">{T.subject}</label>
            <input id="d-title" type="text" maxLength={140} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={T.subjectPh} />
          </div>
          <div className="rd-field">
            <label className="rd-flbl" htmlFor="d-text">{T.note}</label>
            <textarea id="d-text" rows={6} maxLength={3000} value={f.text} onChange={(e) => set({ text: e.target.value })} placeholder={T.notePh} />
          </div>
          <div className="rd-field">
            <span className="rd-flbl">{T.attr}</span>
            <div className="rd-seg" role="group" aria-label={T.attr}>
              {Object.entries(T.attrs).map(([k, l]) => <button key={k} type="button" aria-pressed={f.attribution === k} onClick={() => set({ attribution: k })}>{l}</button>)}
            </div>
          </div>
          <div className="rd-two3">
            <div className="rd-field">
              <label className="rd-flbl" htmlFor="d-when">{T.when}</label>
              <input id="d-when" type="datetime-local" value={f.at} max={localInput(Date.now())} onChange={(e) => set({ at: e.target.value })} />
              <small>{f.at ? '' : T.now}</small>
            </div>
            {!f.storyId && (
              <div className="rd-field">
                <span className="rd-flbl">{T.size}</span>
                <div className="rd-seg" role="group" aria-label={T.size}>
                  {Object.entries(T.sizes).map(([k, l]) => <button key={k} type="button" aria-pressed={f.size === k} onClick={() => set({ size: k })}>{l}</button>)}
                </div>
              </div>
            )}
          </div>
          <div className="rd-acts">
            <button className="btn" disabled={busy || !f.title.trim() || f.text.trim().length < 10}>{busy ? T.sending : T.send}</button>
            <label className="rd-check"><input type="checkbox" checked={f.writeNow} onChange={(e) => set({ writeNow: e.target.checked })} /> {T.writeNow}</label>
            {done && <span className="rd-sent">{T.sent} {done.writeNow && <a href={href.write()}>{T.watch}</a>}</span>}
          </div>
          {error && <p className="notice">{error}</p>}
        </form>

        <section className="rd-mine">
          <div className="rd-sh"><h4>{T.mine}</h4></div>
          {!v?.list?.length && <p className="rd-mut">{T.none}</p>}
          {(v?.list || []).map((d) => (
            <article key={d.id} className={`rd-trace st-${d.status}`}>
              <div className="rd-trace-meta">
                <span className="rd-k">{d.sectionName}</span>
                <span className="rd-mut">{dayKey(d.ts) === dayKey(Date.now()) ? '' : `${shortDate(d.ts)} `}{T.at} {hhmm(d.ts)}{d.tiedTo ? ` · ${T.tiedTo}` : ''}</span>
                <span className={`rd-pill ${d.status === 'printed' ? 'ok' : d.status === 'drafted' ? 'ready' : d.status === 'writing' ? 'writing' : ''}`}>{T.st[d.status]}</span>
              </div>
              <b>{d.title}</b>
              <p>{d.text.length > 220 ? `${d.text.slice(0, 219)}…` : d.text}</p>
              <div className="rd-trace-acts">
                {linkOf(d) && <a href={linkOf(d)}>{T.open[d.status]}</a>}
                {d.status !== 'printed' && <button className="rd-link danger" onClick={() => withdraw(d.id)}>{T.withdraw}</button>}
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
