import React, { useEffect, useState } from 'react';
import { api } from '../lib.js';
import { tr } from '../i18n.js';
import Para from './Para.jsx';

const T = tr({
  en: {
    like: 'Good: the writer will learn from it', dislike: 'Bad: the writer will avoid it', cut: 'Cut the paragraph', redo: 'Rewrite the paragraph',
    pquick: ['Meaner', 'Shorter', 'Longer', 'Plainer', 'Funnier'], pph: 'Or your instruction…', go: 'Go', working: 'Rewriting…',
    loadingHeads: 'The headline writer is thinking…', noHeads: 'No alternatives this time.',
  },
  it: {
    like: 'Buono: il redattore ne terrà conto', dislike: 'Brutto: il redattore lo eviterà', cut: 'Taglia il paragrafo', redo: 'Riscrivi il paragrafo',
    pquick: ['Più cattivo', 'Più corto', 'Più lungo', 'Più semplice', 'Più spiritoso'], pph: 'Oppure la sua indicazione…', go: 'Vai', working: 'Riscrivo…',
    loadingHeads: 'Il titolista ci pensa…', noHeads: 'Nessuna alternativa, stavolta.',
  },
});

/** The paragraphs of an article, each with the bench's tools: ♥ ✕ ✂ ↻. */
export function Paragraphs({ ed, a, onChange, setError }) {
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [instr, setInstr] = useState('');
  const base = `/editions/${encodeURIComponent(ed.id)}/articles/${encodeURIComponent(a.id)}/paragraph`;
  async function run(index, op, instruction) {
    setBusy(index);
    setError?.(null);
    try {
      onChange(await api(base, { method: 'POST', json: { index, op, instruction } }));
      setOpen(null);
      setInstr('');
    } catch (e) { setError?.(e.message); } finally { setBusy(null); }
  }
  return (
    <div className="paras">
      {a.body.map((p, i) => (
        <div key={`${i}-${p.slice(0, 12)}`} className={`para ${a.marks?.[i] || ''} ${busy === i ? 'busy' : ''}`}>
          <Para a={a} p={p} />
          <div className="para-tools" role="toolbar">
            <button title={T.like} aria-label={T.like} className={a.marks?.[i] === 'like' ? 'on' : ''} onClick={() => run(i, 'like')}>♥</button>
            <button title={T.dislike} aria-label={T.dislike} className={a.marks?.[i] === 'dislike' ? 'on' : ''} onClick={() => run(i, 'dislike')}>✕</button>
            <button title={T.cut} aria-label={T.cut} disabled={a.body.length < 2} onClick={() => run(i, 'cut')}>✂</button>
            <button title={T.redo} aria-label={T.redo} className={open === i ? 'on' : ''} onClick={() => setOpen(open === i ? null : i)}>↻</button>
          </div>
          {busy === i && <span className="working">{T.working}</span>}
          {open === i && (
            <div className="rewrite para-rewrite">
              <div className="chips">{T.pquick.map((q) => <button key={q} className="chip" disabled={busy != null} onClick={() => run(i, 'rewrite', q)}>{q}</button>)}</div>
              <div className="rewrite-row">
                <input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder={T.pph} onKeyDown={(e) => e.key === 'Enter' && instr.trim() && run(i, 'rewrite', instr.trim())} />
                <button className="btn btn-small" disabled={busy != null || !instr.trim()} onClick={() => run(i, 'rewrite', instr.trim())}>{T.go}</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Headlines to pick from (three options from the headline writer). */
export function HeadlinePicker({ ed, a, onChange, setError, onClose }) {
  const [opts, setOpts] = useState(null);
  const base = `/editions/${encodeURIComponent(ed.id)}/articles/${encodeURIComponent(a.id)}`;
  useEffect(() => {
    api(`${base}/headlines`, { method: 'POST' }).then((r) => setOpts(r.options)).catch((e) => { setError?.(e.message); setOpts([]); });
  }, [base, setError]);
  return (
    <div className="rewrite heads">
      {!opts ? <span className="working">{T.loadingHeads}</span> : opts.length ? (
        <div className="head-opts">
          {opts.map((h) => (
            <button key={h} className="head-opt" onClick={async () => { try { onChange(await api(base, { method: 'PATCH', json: { headline: h } })); onClose?.(); } catch (e) { setError?.(e.message); } }}>{h}</button>
          ))}
        </div>
      ) : <span className="hint-small">{T.noHeads}</span>}
    </div>
  );
}
