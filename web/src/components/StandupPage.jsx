import React, { useEffect, useState } from 'react';
import { api, modelName } from '../lib.js';
import { tr } from '../i18n.js';
import NewsroomNav from './NewsroomNav.jsx';

const T = tr({
  en: {
    title: 'The standup', sub: 'What you did, from the commits, the pull requests, the terminal and the calendar. Ready to paste.',
    day: 'Since the last working day', week: 'This week', copy: 'Copy', copied: 'Copied', polish: 'Tighten it with the model', polishing: 'Tightening…',
    plain: 'Plain', markdown: 'Markdown', slack: 'Slack', offline: 'The writer is offline: here is the plain version.',
    repos: 'Repositories', reviewed: 'Pull requests and issues looked at', meetings: 'Meetings', none: 'Nothing on the record for this period yet.',
    menubar: 'Tip: with the menu-bar headline installed (npm run menubar:install), “Copy the standup” is one click away.',
  },
  it: {
    title: 'Lo standup', sub: 'Cosa hai fatto, dai commit, dalle pull request, dal terminale e dall\'agenda. Pronto da incollare.',
    day: 'Dall\'ultimo giorno lavorativo', week: 'Questa settimana', copy: 'Copia', copied: 'Copiato', polish: 'Stringilo con il modello', polishing: 'Stringo…',
    plain: 'Testo', markdown: 'Markdown', slack: 'Slack', offline: 'Il redattore è spento: ecco la versione semplice.',
    repos: 'Repository', reviewed: 'Pull request e issue guardate', meetings: 'Riunioni', none: 'Ancora niente agli atti per questo periodo.',
    menubar: 'Suggerimento: con il titolo nella barra dei menu (npm run menubar:install), «Copia lo standup» è a un clic.',
  },
});

export default function StandupPage() {
  const [span, setSpan] = useState('day');
  const [format, setFormat] = useState('markdown');
  const [s, setS] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNote(null);
    api(`/standup?span=${span}&format=${format}`).then((r) => { setS(r); setText(r.text); }).catch((e) => setNote(e.message));
  }, [span, format]);

  async function polish() {
    setBusy(true);
    setNote(null);
    try {
      const r = await api('/standup/polish', { method: 'POST', json: { span, format } });
      if (r.polished) { setText(r.polished); setNote(modelName(r.writer)); } else setNote(r.offline ? T.offline : r.error);
    } catch (e) { setNote(e.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* the text is selectable anyway */ }
  }

  const empty = s && !s.repos.length && !s.reviewed.length && !s.terminal.length && !s.meetings.length && !s.reading.length && !s.done.length;
  return (
    <section className="standup">
      <header className="section-head">
        <h2>{T.title}</h2>
        <p>{T.sub}</p>
      </header>
      <NewsroomNav on="standup" />
      <div className="su-controls">
        <div className="seg seg-small">
          <button type="button" className={span === 'day' ? 'on' : ''} onClick={() => setSpan('day')}>{T.day}</button>
          <button type="button" className={span === 'week' ? 'on' : ''} onClick={() => setSpan('week')}>{T.week}</button>
        </div>
        <div className="seg seg-small">
          {['markdown', 'slack', 'plain'].map((f) => <button key={f} type="button" className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>{T[f]}</button>)}
        </div>
      </div>
      {s && (
        <div className="su-sheet">
          <textarea className="su-text" value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(18, Math.max(6, text.split('\n').length + 1))} spellCheck={false} aria-label={T.title} />
          <div className="su-actions">
            <button className="btn" onClick={copy}>{copied ? T.copied : T.copy}</button>
            <button className={`btn-ghost ${busy ? 'busy' : ''}`} onClick={polish} disabled={busy || empty}>{busy ? T.polishing : T.polish}</button>
            {note && <span className="hint-small">{note}</span>}
          </div>
          {empty && <p className="empty-text">{T.none}</p>}
          <p className="hint-small">{T.menubar}</p>
        </div>
      )}
    </section>
  );
}
