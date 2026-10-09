import React, { useCallback, useEffect, useState } from 'react';
import { api, href, shortDate, writerLabel } from '../lib.js';
import { tr, quote } from '../i18n.js';

const T = tr({
  en: {
    deepen: 'Go deeper', deepening: 'Opening the file…', feature: 'Long piece', features: 'Long pieces', newOne: 'A long piece on…', newPh: 'a subject: chess.com, the project, the evenings…', start: 'Open the file',
    dossier: 'The file', signals: (n, d) => `${n} signals in ${d} days`, busiest: 'busiest day', questions: 'The reporter\'s questions', qHint: 'Your answers become quotes in the piece. Skip the ones you like.',
    facts: 'Your facts', factsHint: 'What the signals can\'t know: how it went, why, who. They go in as facts.', addFact: '+ another fact', tips: 'From the tip box',
    how: 'Who writes it', modes: {
      desk: ['The newsroom writes', 'Outline and piece, section by section. You watch it grow.'],
      together: ['Four hands', 'The newsroom proposes the outline, you fix it; then every section can be rewritten, edited, or started by you.'],
      yours: ['I write it', 'You write, signed by you. The desk checks the figures, suggests data, headline and summary.'],
    },
    style: 'Style', length: 'Length', go: 'Go', planning: 'The newsroom is drawing up the outline…', writing: 'Writing…', pending: 'waiting',
    outline: 'The outline', outlineHint: 'Reorder, cut, rename, add. Then the writing starts.', heading: 'Heading', point: 'What it says', addSec: '+ add a section', approve: 'Approve and write',
    publish: 'Publish', unpublish: 'Back to draft', stop: 'Stop', resume: 'Resume writing', del: 'Delete', confirmDel: 'Sure?', edit: 'Edit', save: 'Save', cancel: 'Cancel',
    rewrite: 'Rewrite', mine: 'I\'ll start it', continue: 'Go on from here', after: '+ section after', quick: ['Meaner', 'Shorter', 'Longer', 'More of a scene', 'More ironic'], instrPh: 'Or your instruction…',
    headline: 'Headline', kicker: 'Kicker', dek: 'Summary', alt: 'Other headlines', words: 'words', score: 'style', unverified: 'figures not in the facts', review: 'Ask the desk', reviewing: 'The desk is reading…',
    textPh: 'Write here. A blank line between paragraphs; a line starting with ## is a section heading.', claims: 'What the facts don\'t support', suggestions: 'Data you could use', proposals: 'The desk proposes', apply: 'use',
    issues: 'Style', by: 'By', of: 'of', allFeatures: 'All the long pieces', none: 'No long pieces yet. Open one from any article: “Go deeper”.', draft: 'draft', yourDraft: 'your draft',
    sourcesNote: 'With the owner\'s statements and the tips of the tip box.', unchecked: 'Not yet checked',
    newArticle: 'New article', forNext: 'for the next edition', newsroom: 'Newsroom', format: 'Format', formats: { article: 'Article', long: 'Long piece' },
    approveEd: 'Approve for the next edition', placement: { lead: 'As the lead', inside: 'Inside' }, approved: (h) => `Approved: it goes into the ${h} edition`, withdraw: 'Withdraw',
    printed: 'In the paper', seeIt: 'See it on the page →', asLong: 'Publish as a long read', tipFor: 'A tip for this piece', tipForPh: 'something the signals can\'t know: it goes into the next rewrite',
    addTip: 'Add', rewriteAll: 'Rewrite with the new tips', tipsGiven: 'Tips given', judge: 'Is it good for the next edition?',
  },
  it: {
    deepen: 'Approfondisci', deepening: 'Apro il fascicolo…', feature: 'Approfondimento', features: 'Approfondimenti', newOne: 'Un approfondimento su…', newPh: 'un argomento: chess.com, il progetto, le serate…', start: 'Apri il fascicolo',
    dossier: 'Il fascicolo', signals: (n, d) => `${n} segnali in ${d} giorni`, busiest: 'giorno più intenso', questions: 'Le domande del cronista', qHint: 'Le risposte diventano citazioni nel pezzo. Salti quelle che vuole.',
    facts: 'I suoi fatti', factsHint: 'Quello che i segnali non possono sapere: com\'è andata, perché, chi. Entrano come fatti.', addFact: '+ un altro fatto', tips: 'Dalla cassetta delle soffiate',
    how: 'Chi lo scrive', modes: {
      desk: ['Scrive la redazione', 'Scaletta e pezzo, una sezione alla volta. Lei lo guarda crescere.'],
      together: ['A quattro mani', 'La redazione propone la scaletta, lei la sistema; poi ogni sezione si può riscrivere, correggere, o cominciare lei.'],
      yours: ['Scrivo io', 'Scrive lei, con la sua firma. Il desk controlla i numeri, suggerisce dati, titolo e sommario.'],
    },
    style: 'Stile', length: 'Lunghezza', go: 'Via', planning: 'La redazione prepara la scaletta…', writing: 'Scrive…', pending: 'in attesa',
    outline: 'La scaletta', outlineHint: 'Riordini, tagli, rinomini, aggiunga. Poi si comincia a scrivere.', heading: 'Titoletto', point: 'Cosa dice', addSec: '+ aggiungi una sezione', approve: 'Approva e scrivi',
    publish: 'Pubblica', unpublish: 'Torna in bozza', stop: 'Ferma', resume: 'Riprendi a scrivere', del: 'Elimina', confirmDel: 'Sicuro?', edit: 'Modifica', save: 'Salva', cancel: 'Annulla',
    rewrite: 'Riscrivi', mine: 'Comincio io', continue: 'Prosegui da qui', after: '+ sezione dopo', quick: ['Più cattivo', 'Più corto', 'Più lungo', 'Più scena', 'Più ironico'], instrPh: 'Oppure la sua indicazione…',
    headline: 'Titolo', kicker: 'Occhiello', dek: 'Sommario', alt: 'Altri titoli', words: 'parole', score: 'stile', unverified: 'numeri non presenti nei fatti', review: 'Chiedi al desk', reviewing: 'Il desk legge…',
    textPh: 'Scriva qui. Una riga vuota tra i paragrafi; una riga che comincia con ## è un titoletto di sezione.', claims: 'Cosa i fatti non sostengono', suggestions: 'Dati che potrebbe usare', proposals: 'Il desk propone', apply: 'usa',
    issues: 'Stile', by: 'Di', of: 'di', allFeatures: 'Tutti gli approfondimenti', none: 'Ancora nessun approfondimento. Lo apra da un articolo qualsiasi: «Approfondisci».', draft: 'bozza', yourDraft: 'la sua bozza',
    sourcesNote: 'Con le dichiarazioni del proprietario e le soffiate della cassetta.', unchecked: 'Non ancora controllato',
    newArticle: 'Nuovo articolo', forNext: 'per la prossima edizione', newsroom: 'Redazione', format: 'Formato', formats: { article: 'Articolo', long: 'Pezzo lungo' },
    approveEd: 'Approva per la prossima edizione', placement: { lead: 'In apertura', inside: 'All\'interno' }, approved: (h) => `Approvato: esce nell'edizione delle ${h}`, withdraw: 'Ritira',
    printed: 'In pagina', seeIt: 'Vedi in pagina →', asLong: 'Pubblica come approfondimento', tipFor: 'Una soffiata per questo pezzo', tipForPh: 'qualcosa che i segnali non sanno: entra alla prossima riscrittura',
    addTip: 'Aggiungi', rewriteAll: 'Riscrivi con le soffiate nuove', tipsGiven: 'Soffiate date', judge: 'Va bene per la prossima edizione?',
  },
});

const wordCount = (blocks) => blocks.flatMap((b) => b.paragraphs || []).join(' ').split(/\s+/).filter(Boolean).length;

/** The "Go deeper" button on an article. */
export function DeepenButton({ editionId, articleId, className = 'btn-ghost' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const f = await api('/features', { method: 'POST', json: { editionId, articleId } });
      location.hash = href.feature(f.id);
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <>
      <button className={`${className} deepen`} onClick={go} disabled={busy}>{busy ? T.deepening : `✎ ${T.deepen}`}</button>
      {error && <span className="notice"> {error}</span>}
    </>
  );
}

/** In the rail: the latest long pieces. */
export function FeaturesBox() {
  const [list, setList] = useState([]);
  useEffect(() => { api('/features?status=published&target=longread&limit=3').then(setList).catch(() => {}); }, []);
  if (!list.length) return null;
  return (
    <section className="box features-box">
      <h3 className="box-title">{T.features}</h3>
      {list.map((f) => (
        <a key={f.id} className="feature-teaser" href={href.feature(f.id)}>
          {f.kicker && <span className="kicker"><span className="sec">{f.kicker}</span></span>}
          <span className="hl-sm">{f.headline}</span>
          {f.byline && <span className="meta">{T.by} {f.byline.name} · {f.words} {T.words}</span>}
        </a>
      ))}
      <a className="more" href={href.features()}>{T.allFeatures} →</a>
    </section>
  );
}

/** #/features: the list, and a new one on any subject. */
export function FeaturesList() {
  const [list, setList] = useState(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { api('/features?limit=60').then(setList).catch(() => setList([])); }, []);
  async function start(e) {
    e.preventDefault();
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const f = await api('/features', { method: 'POST', json: { topic: topic.trim() } });
      location.hash = href.feature(f.id);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <div className="features-page">
      <header className="serial-head">
        <span className="lbl">{T.features}</span>
        <h1 className="hl-story">{T.features}</h1>
      </header>
      <form className="feature-new" onSubmit={start}>
        <label className="lbl" htmlFor="ftopic">{T.newOne}</label>
        <div className="rewrite-row">
          <input id="ftopic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={T.newPh} />
          <button className="btn btn-small" disabled={busy || !topic.trim()}>{busy ? T.deepening : T.start}</button>
        </div>
        {error && <p className="notice">{error}</p>}
      </form>
      {list && !list.length && <p className="empty-text">{T.none}</p>}
      <ul className="feature-list">
        {(list || []).map((f) => (
          <li key={f.id}>
            <a href={href.feature(f.id)}>
              <span className="feature-date">{shortDate(f.publishedAt || f.ts)}</span>
              <span>
                {f.status !== 'published' && <span className="status draft">{T.draft}</span>}
                <strong className="hl-sm">{f.headline}</strong>
                {f.dek && <span className="dek dek-sm"> {f.dek}</span>}
                <span className="meta">{f.byline ? `${T.by} ${f.byline.name} · ` : ''}{f.words} {T.words}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── The brief ─────────────────────────

function Brief({ f, meta, onChange, setError }) {
  const [answers, setAnswers] = useState(f.questions.map((x) => x.a || ''));
  const [facts, setFacts] = useState(f.sources.filter((s) => s.via !== 'tip').map((s) => s.text).concat(['']).slice(0, 6));
  const [tips, setTips] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [mode, setMode] = useState(f.mode || (f.target === 'edition' ? 'together' : 'desk'));
  const [style, setStyle] = useState(f.style || 'magazine');
  const [format, setFormat] = useState(f.format || 'long');
  const [length, setLength] = useState(f.length || 'standard');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/tips?status=new').then(setTips).catch(() => {}); }, []);
  const n = f.numbers;
  async function go() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api(`/features/${f.id}/brief`, { method: 'POST', json: { answers, sources: facts.filter((x) => x.trim()), tips: [...picked], mode, style, length, format } }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="brief">
      <details className="dossier">
        <summary>
          <span className="lbl">{T.dossier}</span>
          {n && <span className="muted"> · {T.signals(n.total, n.days)}{n.busiestDay ? ` · ${T.busiest} ${shortDate(n.busiestDay.ts)} (${n.busiestDay.n})` : ''}</span>}
        </summary>
        <pre>{f.dossier}</pre>
      </details>

      <fieldset className="field">
        <legend>{T.questions}</legend>
        <p className="hint-small">{T.qHint}</p>
        {f.questions.map((x, i) => (
          <label key={i} className="brief-q">
            <span className="q">{x.q}</span>
            <textarea rows={2} value={answers[i]} onChange={(e) => setAnswers((a) => a.map((v, k) => (k === i ? e.target.value : v)))} />
          </label>
        ))}
      </fieldset>

      <fieldset className="field">
        <legend>{T.facts}</legend>
        <p className="hint-small">{T.factsHint}</p>
        {facts.map((t, i) => (
          <textarea key={i} rows={2} value={t} onChange={(e) => setFacts((a) => a.map((v, k) => (k === i ? e.target.value : v)))} />
        ))}
        {facts.length < 6 && <button type="button" className="btn-link" onClick={() => setFacts((a) => [...a, ''])}>{T.addFact}</button>}
        {tips.length > 0 && (
          <div className="brief-tips">
            <span className="lbl">{T.tips}</span>
            {tips.slice(0, 8).map((t) => (
              <label key={t.id} className="check check-inline">
                <input type="checkbox" checked={picked.has(t.id)} onChange={(e) => setPicked((s) => { const x = new Set(s); if (e.target.checked) x.add(t.id); else x.delete(t.id); return x; })} />
                <span>{t.text.slice(0, 140)}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="field">
        <legend>{T.how}</legend>
        <div className="modes">
          {Object.entries(T.modes).map(([k, [name, hint]]) => (
            <label key={k} className={`mode ${mode === k ? 'on' : ''}`}>
              <input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} />
              <span className="mode-name">{name}</span>
              <span className="mode-hint">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode !== 'yours' && meta && (
        <div className="brief-row">
          <label className="lbl">{T.style}
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {meta.styles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <div>
            <span className="lbl">{T.format}</span>
            <div className="seg">
              {Object.entries(T.formats).map(([k, l]) => <button key={k} type="button" className={format === k ? 'on' : ''} onClick={() => setFormat(k)}>{l}</button>)}
            </div>
          </div>
          <div>
            <span className="lbl">{T.length}</span>
            <div className="seg">
              {Object.entries(meta.lengths).map(([k, l]) => <button key={k} type="button" className={length === k ? 'on' : ''} onClick={() => setLength(k)}>{l.label}</button>)}
            </div>
          </div>
        </div>
      )}
      <button className="btn btn-block" onClick={go} disabled={busy}>{busy ? '…' : T.go}</button>
    </div>
  );
}

// ───────────────────────── The outline ─────────────────────────

function Outline({ f, onChange, setError }) {
  const [list, setList] = useState(f.outline.map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setList((l) => l.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i, d) => setList((l) => { const x = [...l]; const j = i + d; if (j < 0 || j >= x.length) return x; [x[i], x[j]] = [x[j], x[i]]; return x; });
  async function approve() {
    setBusy(true);
    setError(null);
    try { onChange(await api(`/features/${f.id}/outline`, { method: 'POST', json: { outline: list } })); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="outline-edit">
      <span className="lbl">{T.outline}</span>
      {f.workingHeadline && <h2 className="hl-lg">{f.workingHeadline}</h2>}
      {f.angle && <p className="dek">{f.angle}</p>}
      <p className="hint-small">{T.outlineHint}</p>
      <ol>
        {list.map((s, i) => (
          <li key={i} className="outline-row">
            <div className="outline-fields">
              <input value={s.heading} onChange={(e) => set(i, 'heading', e.target.value)} placeholder={T.heading} />
              <input value={s.point} onChange={(e) => set(i, 'point', e.target.value)} placeholder={T.point} />
            </div>
            <div className="outline-moves">
              <button onClick={() => move(i, -1)} disabled={!i} aria-label="↑">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="↓">↓</button>
              <button onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label="✕">✕</button>
            </div>
          </li>
        ))}
      </ol>
      <button className="btn-link" onClick={() => setList((l) => [...l, { heading: '', point: '' }])}>{T.addSec}</button>
      <button className="btn btn-block" onClick={approve} disabled={busy || !list.some((s) => s.heading.trim())}>{T.approve}</button>
    </div>
  );
}

// ───────────────────────── A section ─────────────────────────

function Block({ f, b, i, busy, act }) {
  const [mode, setMode] = useState(null); // 'rewrite' | 'edit' | 'mine' | 'add'
  const [instr, setInstr] = useState('');
  const [text, setText] = useState('');
  const [head, setHead] = useState('');
  const [point, setPoint] = useState('');
  const writing = b.status === 'writing';
  const close = () => { setMode(null); setInstr(''); };
  return (
    <section className={`fblock ${writing ? 'writing' : ''} ${b.status === 'pending' ? 'pending' : ''}`}>
      {b.heading && <h3 className="spot-h">{b.heading}</h3>}
      {b.status === 'pending' && !b.paragraphs?.length && <p className="hint-small">{T.pending}{b.point ? ` · ${b.point}` : ''}</p>}
      {writing && <p className="working"><span className="inv-spinner" aria-hidden="true" /> {T.writing}</p>}
      {mode === 'edit' || mode === 'mine' ? (
        <div className="draft-form">
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="draft-actions">
            <button className="btn btn-small" onClick={async () => { await act(`/blocks/${i}`, { op: 'edit', paragraphs: text }); if (mode === 'mine') await act(`/blocks/${i}`, { op: 'continue' }); close(); }}>{mode === 'mine' ? T.continue : T.save}</button>
            <button className="btn-ghost" onClick={close}>{T.cancel}</button>
          </div>
        </div>
      ) : (
        (b.paragraphs || []).map((p, k) => <p key={k} className={i === 0 && k === 0 && p.length > 160 ? 'dropcap' : ''}>{p}</p>)
      )}
      {f.status !== 'published' && !writing && !mode && (
        <div className="fblock-tools">
          {b.lint && b.lint.score < 80 && <span className="tag tag-warn" title={b.lint.issues.map((x) => x.msg).join(' · ')}>{T.score} {b.lint.score}</span>}
          {f.mode !== 'yours' && <button className="btn-ghost" disabled={busy} onClick={() => setMode('rewrite')}>{T.rewrite}</button>}
          <button className="btn-ghost" disabled={busy} onClick={() => { setText((b.paragraphs || []).join('\n\n')); setMode('edit'); }}>{T.edit}</button>
          {f.mode !== 'yours' && <button className="btn-ghost" disabled={busy} onClick={() => { setText(''); setMode('mine'); }}>{T.mine}</button>}
          <button className="btn-ghost" disabled={busy || !i} onClick={() => act(`/blocks/${i}`, { op: 'up' })}>↑</button>
          <button className="btn-ghost" disabled={busy || i === f.blocks.length - 1} onClick={() => act(`/blocks/${i}`, { op: 'down' })}>↓</button>
          <button className="btn-ghost" disabled={busy} onClick={() => setMode('add')}>{T.after}</button>
          <button className="btn-ghost danger" disabled={busy || f.blocks.length < 2} onClick={() => act(`/blocks/${i}`, { op: 'cut' })}>✕</button>
        </div>
      )}
      {mode === 'rewrite' && (
        <div className="rewrite">
          <div className="chips">{T.quick.map((q) => <button key={q} className="chip" onClick={() => { act(`/blocks/${i}`, { op: 'rewrite', instruction: q }); close(); }}>{q}</button>)}</div>
          <div className="rewrite-row">
            <input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder={T.instrPh} onKeyDown={(e) => { if (e.key === 'Enter' && instr.trim()) { act(`/blocks/${i}`, { op: 'rewrite', instruction: instr.trim() }); close(); } }} />
            <button className="btn btn-small" disabled={!instr.trim()} onClick={() => { act(`/blocks/${i}`, { op: 'rewrite', instruction: instr.trim() }); close(); }}>{T.rewrite}</button>
            <button className="btn-ghost" onClick={close}>{T.cancel}</button>
          </div>
        </div>
      )}
      {mode === 'add' && (
        <div className="rewrite">
          <div className="outline-fields">
            <input value={head} onChange={(e) => setHead(e.target.value)} placeholder={T.heading} />
            <input value={point} onChange={(e) => setPoint(e.target.value)} placeholder={T.point} />
          </div>
          <div className="draft-actions">
            <button className="btn btn-small" disabled={!head.trim()} onClick={() => { act(`/blocks/${i}`, { op: 'add', heading: head, point }); setHead(''); setPoint(''); close(); }}>{T.after.replace('+ ', '')}</button>
            <button className="btn-ghost" onClick={close}>{T.cancel}</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── The Editor's own piece ─────────────────────────

function Yours({ f, onChange, setError, busy }) {
  const [form, setForm] = useState({ kicker: f.kicker || '', headline: f.headline || '', dek: f.dek || '', text: f.text || '' });
  const [saving, setSaving] = useState(false);
  const dirty = form.kicker !== (f.kicker || '') || form.headline !== (f.headline || '') || form.dek !== (f.dek || '') || form.text !== (f.text || '');
  const saveNow = useCallback(async () => {
    setSaving(true);
    try { onChange(await api(`/features/${f.id}`, { method: 'PATCH', json: form })); } catch (e) { setError(e.message); } finally { setSaving(false); }
  }, [f.id, form, onChange, setError]);
  const r = f.review;
  const apply = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  return (
    <div className="yours">
      <div className="yours-editor">
        <input className="f-kicker" value={form.kicker} onChange={(e) => apply('kicker', e.target.value)} placeholder={T.kicker} />
        <input className="f-head" value={form.headline} onChange={(e) => apply('headline', e.target.value)} placeholder={T.headline} />
        <input className="f-dek" value={form.dek} onChange={(e) => apply('dek', e.target.value)} placeholder={T.dek} />
        <textarea className="f-text" rows={22} value={form.text} onChange={(e) => apply('text', e.target.value)} placeholder={T.textPh} />
        <div className="draft-actions">
          <button className="btn btn-small" onClick={saveNow} disabled={saving || !dirty}>{saving ? '…' : T.save}</button>
          <button className="btn-ghost" disabled={busy || saving} onClick={async () => { if (dirty) await saveNow(); try { onChange(await api(`/features/${f.id}/review`, { method: 'POST' })); } catch (e) { setError(e.message); } }}>{r?.status === 'working' ? T.reviewing : T.review}</button>
          <span className="hint-small">{wordCount(f.blocks)} {T.words}</span>
        </div>
      </div>
      <aside className="yours-desk">
        {!r && <p className="hint-small">{T.unchecked}</p>}
        {r?.status === 'working' && <p className="working"><span className="inv-spinner" aria-hidden="true" /> {T.reviewing}</p>}
        {(r?.status === 'done' || f.check) && (
          <>
            {f.check?.unverified?.length > 0 && <p className="tag tag-warn">⚠ {T.unverified}: {f.check.unverified.slice(0, 6).join(', ')}</p>}
            {f.lint?.issues?.length > 0 && (
              <div className="desk-sec"><span className="lbl">{T.issues} · {f.lint.score}</span><ul>{f.lint.issues.map((x) => <li key={x.id}>{x.msg}</li>)}</ul></div>
            )}
          </>
        )}
        {r?.status === 'done' && (
          <>
            {r.claims?.length > 0 && <div className="desk-sec"><span className="lbl">{T.claims}</span><ul>{r.claims.map((c, i) => <li key={i}>{quote(c.text)} — <em>{c.why}</em></li>)}</ul></div>}
            {r.suggestions?.length > 0 && <div className="desk-sec"><span className="lbl">{T.suggestions}</span><ul>{r.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
            {(r.headlines?.length > 0 || r.dek || r.kicker) && (
              <div className="desk-sec">
                <span className="lbl">{T.proposals}</span>
                <ul>
                  {r.kicker && <li>{T.kicker}: <strong>{r.kicker}</strong> <button className="btn-link" onClick={() => apply('kicker', r.kicker)}>{T.apply}</button></li>}
                  {r.headlines?.map((h) => <li key={h}>{h} <button className="btn-link" onClick={() => apply('headline', h)}>{T.apply}</button></li>)}
                  {r.dek && <li><em>{r.dek}</em> <button className="btn-link" onClick={() => apply('dek', r.dek)}>{T.apply}</button></li>}
                </ul>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

// ───────────────────────── A commissioned piece: tips and the verdict ─────────────────────────

function TipBox({ f, act }) {
  const [text, setText] = useState('');
  const tips = (f.sources || []).filter((x) => x.via === 'tip');
  const fresh = tips.some((x) => x.at && x.at > (f.finishedAt || 0));
  return (
    <section className="tipbox">
      <span className="lbl">{T.tipFor}</span>
      {tips.length > 0 && (
        <ul className="tipbox-list">{tips.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
      )}
      <form className="rewrite-row" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await act('/sources', { text: text.trim(), via: 'tip' }); setText(''); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={T.tipForPh} />
        <button className="btn btn-small" disabled={!text.trim()}>{T.addTip}</button>
      </form>
      {fresh && f.mode !== 'yours' && f.status !== 'writing' && <button className="btn-ghost" disabled={f.busy} onClick={() => act('/rewrite-all')}>↻ {T.rewriteAll}</button>}
    </section>
  );
}

const nextHour = () => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return `${String(d.getHours()).padStart(2, '0')}:00`; };

function Verdict({ f, act }) {
  const [placement, setPlacement] = useState(f.placement || 'inside');
  if (f.printedIn) {
    return (
      <section className="verdict printed">
        <span className="lbl">✓ {T.printed}</span>
        <a className="more" href={href.article(f.printedIn, `feature:${f.id}`)}>{T.seeIt}</a>
      </section>
    );
  }
  if (f.status === 'approved') {
    return (
      <section className="verdict approved">
        <p><strong>✓ {T.approved(nextHour())}</strong> · {T.placement[f.placement || 'inside']}</p>
        <button className="btn-ghost" onClick={() => act('/withdraw')}>{T.withdraw}</button>
      </section>
    );
  }
  return (
    <section className="verdict">
      <p className="verdict-q">{T.judge}</p>
      <div className="seg">
        {['lead', 'inside'].map((k) => <button key={k} type="button" className={placement === k ? 'on' : ''} onClick={() => setPlacement(k)}>{T.placement[k]}</button>)}
      </div>
      <button className="btn" disabled={f.busy || !f.blocks.some((b) => b.paragraphs?.length)} onClick={() => act('/approve', { placement })}>{T.approveEd}</button>
    </section>
  );
}

// ───────────────────────── The page ─────────────────────────

export function FeaturePage({ id }) {
  const [f, setF] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [armed, setArmed] = useState(false);
  const [editingHead, setEditingHead] = useState(false);
  const load = useCallback(() => api(`/features/${id}`).then(setF).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); api('/line').then(setMeta).catch(() => {}); }, [load]);
  const working = f && (f.busy || ['planning', 'writing'].includes(f.status) || f.review?.status === 'working');
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [working, load]);

  const act = useCallback(async (path, body, method = 'POST') => {
    setError(null);
    try {
      const r = await api(`/features/${id}${path}`, { method, json: body });
      if (r) setF(r);
      setTimeout(load, 300);
    } catch (e) { setError(e.message); }
  }, [id, load]);

  if (!f) return error ? <p className="notice">{error}</p> : null;
  const published = f.status === 'published';
  const editable = !published && f.mode && f.mode !== 'yours' && ['writing', 'draft'].includes(f.status);
  const pending = f.blocks.some((b) => b.status === 'pending');
  const forEdition = f.target === 'edition';
  const approved = f.status === 'approved';

  return (
    <div className="feature">
      <div className="story-top">
        {forEdition ? <a className="back" href={href.desk()}>← {T.newsroom}</a> : <a className="back" href={href.features()}>← {T.features}</a>}
        {f.origin?.editionId && <a className="back" href={href.article(f.origin.editionId, f.origin.articleId)}>{quote(f.origin.headline)}</a>}
      </div>
      <article className="feature-article">
        <div className="kicker">
          <span className="sec">{forEdition ? T.newArticle : (f.kicker || T.feature)}</span>
          {forEdition && !f.printedIn && <span className="sub"> · {T.forNext}</span>}
          {f.status !== 'published' && f.mode && <span className="sub"> · {T.modes[f.mode]?.[0]}</span>}
        </div>
        {editable && editingHead ? (
          <div className="draft-form">
            <input className="f-head" defaultValue={f.headline} id="fhead" />
            <input defaultValue={f.dek} id="fdek" />
            <div className="draft-actions">
              <button className="btn btn-small" onClick={async () => { await act('', { headline: document.getElementById('fhead').value, dek: document.getElementById('fdek').value }, 'PATCH'); setEditingHead(false); }}>{T.save}</button>
              <button className="btn-ghost" onClick={() => setEditingHead(false)}>{T.cancel}</button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="hl-story" onDoubleClick={() => editable && setEditingHead(true)}>{f.headline || f.workingHeadline || f.topic}</h1>
            {(f.dek || f.angle) && <p className="dek dek-story">{f.dek || f.angle}</p>}
          </>
        )}
        {f.byline && f.blocks.some((b) => b.paragraphs?.length) && (
          <div className="byline">{T.by} <strong>{f.byline.name}</strong>, {f.byline.role}{f.writer && f.byline.id !== 'director' ? ` · ${writerLabel(f.writer)}` : ''} · {wordCount(f.blocks)} {T.words}{f.publishedAt ? ` · ${shortDate(f.publishedAt)}` : ''}</div>
        )}
        {editable && f.alternatives?.length > 0 && (
          <p className="alt-heads"><span className="lbl">{T.alt}</span> {f.alternatives.map((h) => <button key={h} className="chip" onClick={() => act('', { headline: h }, 'PATCH')}>{h}</button>)} <button className="btn-link" onClick={() => setEditingHead(true)}>{T.edit}</button></p>
        )}
        {error && <p className="notice">{error}</p>}

        {f.status === 'brief' && <Brief f={f} meta={meta} onChange={setF} setError={setError} />}
        {f.status === 'planning' && <p className="working big"><span className="inv-spinner" aria-hidden="true" /> {T.planning}</p>}
        {f.status === 'outline' && <Outline f={f} onChange={setF} setError={setError} />}
        {f.mode === 'yours' && f.status === 'draft' && <Yours f={f} onChange={setF} setError={setError} busy={f.busy} />}
        {(['writing', 'draft', 'approved'].includes(f.status) && f.mode !== 'yours') || published || (approved && f.mode === 'yours') ? (
          <div className="story-body feature-body">
            {f.blocks.map((b, i) => <Block key={`${i}-${b.heading}`} f={f} b={b} i={i} busy={f.busy} act={act} />)}
          </div>
        ) : null}

        {forEdition && ['draft', 'writing', 'approved'].includes(f.status) && <TipBox f={f} act={act} />}
        {forEdition && (f.status === 'draft' || approved || (published && f.printedIn)) && <Verdict f={f} act={act} />}
        {(f.status === 'draft' || f.status === 'writing' || published || approved) && (
          <div className="feature-bar">
            {f.check?.unverified?.length > 0 && !published && <span className="tag tag-warn">⚠ {T.unverified}: {f.check.unverified.slice(0, 5).join(', ')}</span>}
            {f.lint && !published && <span className="tag">{T.score} {f.lint.score}/100</span>}
            {f.status === 'writing' && <button className="btn-ghost" onClick={() => act('/stop')}>{T.stop}</button>}
            {f.status === 'draft' && pending && f.mode !== 'yours' && <button className="btn-ghost" disabled={f.busy} onClick={() => act('/continue')}>{T.resume}</button>}
            {f.status === 'draft' && (forEdition
              ? <button className="btn-ghost" disabled={f.busy} onClick={() => act('/publish')}>{T.asLong}</button>
              : <button className="btn" disabled={f.busy} onClick={() => act('/publish')}>{T.publish}</button>)}
            {published && !f.printedIn && <button className="btn-ghost" onClick={() => act('/unpublish')}>{T.unpublish}</button>}
            <button className={`btn-ghost danger ${armed ? 'on' : ''}`} onClick={async () => {
              if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return; }
              try { await api(`/features/${f.id}`, { method: 'DELETE' }); location.hash = forEdition ? href.desk() : href.features(); } catch (e) { setError(e.message); }
            }}>{armed ? T.confirmDel : T.del}</button>
          </div>
        )}
        {published && f.sources?.length > 0 && <p className="hint-small">{T.sourcesNote}</p>}
      </article>
    </div>
  );
}

