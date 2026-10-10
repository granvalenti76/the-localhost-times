import React, { useCallback, useEffect, useState } from 'react';
import { api, href, hhmm, edHour, readingTime, styleName } from '../lib.js';
import { tr } from '../i18n.js';
import Para from './Para.jsx';
import { DeepenButton } from './Features.jsx';

const T = tr({
  en: {
    like: 'Good: the writer will learn from it', dislike: 'Bad: the writer will avoid it', cut: 'Cut the paragraph', redo: 'Rewrite the paragraph',
    pquick: ['Meaner', 'Shorter', 'Longer', 'Plainer', 'Funnier'], pph: 'Or your instruction…', go: 'Go', working: 'Rewriting…',
    title: 'The quick bench', sub: 'One article at a time. → keep, ← cut, R rewrite, H headlines.', keep: 'Keep', spike: 'Cut', rewrite: 'Rewrite', heads: 'Headlines',
    aquick: ['Shorter', 'More ironic', 'More serious', 'Better headline', 'Just the facts'], done: 'Edition reviewed', kept: 'kept', cutN: 'cut', again: 'Back to the newsroom',
    streak: (n) => `${n} edition${n === 1 ? '' : 's'} reviewed today`, nothing: 'No edition to review yet.', of: 'of', unverified: 'figures not in the facts', style: 'style',
    loadingHeads: 'The headline writer is thinking…', noHeads: 'No alternatives this time.', quote: 'quote collected', record: 'record', tip: 'tip',
  },
  it: {
    like: 'Buono: il redattore ne terrà conto', dislike: 'Brutto: il redattore lo eviterà', cut: 'Taglia il paragrafo', redo: 'Riscrivi il paragrafo',
    pquick: ['Più cattivo', 'Più corto', 'Più lungo', 'Più semplice', 'Più spiritoso'], pph: 'Oppure la sua indicazione…', go: 'Vai', working: 'Riscrivo…',
    title: 'Il banco rapido', sub: 'Un articolo alla volta. → tieni, ← taglia, R riscrivi, T titoli.', keep: 'Tieni', spike: 'Taglia', rewrite: 'Riscrivi', heads: 'Titoli',
    aquick: ['Più corto', 'Più ironico', 'Più serio', 'Titolo migliore', 'Solo i fatti'], done: 'Edizione rivista', kept: 'tenuti', cutN: 'tagliati', again: 'Torna in redazione',
    streak: (n) => `${n} ${n === 1 ? 'edizione rivista' : 'edizioni riviste'} oggi`, nothing: 'Ancora nessuna edizione da rivedere.', of: 'di', unverified: 'numeri non presenti nei fatti', style: 'stile',
    loadingHeads: 'Il titolista ci pensa…', noHeads: 'Nessuna alternativa, stavolta.', quote: 'citazione raccolta', record: 'primato', tip: 'soffiata',
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

const todayKey = () => new Date().toISOString().slice(0, 10);
function streakOf(id) {
  try {
    const s = JSON.parse(localStorage.getItem('lt-bench') || '{}');
    const day = todayKey();
    const list = s.day === day ? s.list : [];
    if (id && !list.includes(id)) list.push(id);
    localStorage.setItem('lt-bench', JSON.stringify({ day, list }));
    return list.length;
  } catch { return 0; }
}

/** #/newsroom/banco: the edition one card at a time. */
export default function Bench({ editionId }) {
  const [ed, setEd] = useState(null);
  const [i, setI] = useState(0);
  const [panel, setPanel] = useState(null); // 'rewrite' | 'heads'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tally, setTally] = useState({ keep: 0, cut: 0 });
  const [loaded, setLoaded] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const p = editionId ? api(`/editions/${encodeURIComponent(editionId)}`) : api('/drafts').then((d) => d[0] ? api(`/editions/${encodeURIComponent(d[0].id)}`) : api('/editions/latest'));
    p.then((e) => { setEd(e); setI(0); }).catch(() => setEd(null)).finally(() => setLoaded(true));
  }, [editionId]);

  const a = ed?.articles?.[i] || null;
  const finished = ed && i >= ed.articles.length;
  useEffect(() => { if (finished) setStreak(streakOf(ed.id)); }, [finished, ed]);

  const judge = useCallback(async (v) => {
    if (!a || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api(`/editions/${encodeURIComponent(ed.id)}/articles/${encodeURIComponent(a.id)}/verdict`, { method: 'POST', json: { verdict: v } });
      setTally((t) => ({ ...t, [v]: t[v] + 1 }));
      setEd(next);
      setPanel(null);
      if (v === 'keep') setI((k) => k + 1); // a cut article leaves the list: the next one slides in
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [a, busy, ed]);

  async function rewrite(instruction) {
    setBusy(true);
    setError(null);
    try {
      setEd(await api(`/editions/${encodeURIComponent(ed.id)}/articles/${encodeURIComponent(a.id)}/rewrite`, { method: 'POST', json: { instruction } }));
      setPanel(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  useEffect(() => {
    const on = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'k') judge('keep');
      else if (e.key === 'ArrowLeft' || e.key === 'x') judge('cut');
      else if (e.key === 'r') setPanel((p) => (p === 'rewrite' ? null : 'rewrite'));
      else if (e.key === 'h' || e.key === 't') setPanel((p) => (p === 'heads' ? null : 'heads'));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [judge]);

  // swipe on touch screens
  const [x0, setX0] = useState(null);
  const touch = {
    onTouchStart: (e) => setX0(e.touches[0].clientX),
    onTouchEnd: (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      setX0(null);
      if (Math.abs(dx) > 80) judge(dx > 0 ? 'keep' : 'cut');
    },
  };

  if (!loaded) return null;
  if (!ed) return <p className="empty-text">{T.nothing}</p>;
  const total = i + (ed.articles.length - i);
  return (
    <div className="bench">
      <header className="bench-head">
        <h2>{T.title}</h2>
        <p>{tr({ en: `The ${hhmm(edHour(ed))} edition`, it: `Edizione delle ${hhmm(edHour(ed))}` })} · {T.sub}</p>
        <div className="bench-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (i / Math.max(1, total)) * 100)}%` }} /></div>
      </header>
      {error && <p className="notice">{error}</p>}
      {finished ? (
        <div className="bench-done">
          <p className="bench-done-title">✓ {T.done}</p>
          <p>{tally.keep} {T.kept} · {tally.cut} {T.cutN}</p>
          {streak > 0 && <p className="bench-streak">🔥 {T.streak(streak)}</p>}
          <a className="btn" href={href.desk(ed.id)}>{T.again}</a>
        </div>
      ) : a && (
        <article className={`bench-card ${busy ? 'busy' : ''}`} {...touch}>
          <div className="draft-tags">
            <span className="sec">{a.section}</span>
            <span className="tag">{i + 1} {T.of} {total}</span>
            {a.byline && <span className="tag">{[a.byline.name, styleName(a.byline.house)].filter(Boolean).join(' · ')}</span>}
            <span className="tag">{readingTime(a)}</span>
            {a.lint && a.lint.score < 85 && <span className="tag tag-warn" title={a.lint.issues.map((x) => x.msg).join(' · ')}>{T.style} {a.lint.score}</span>}
            {a.check?.unverified?.length > 0 && <span className="tag tag-warn">⚠ {T.unverified}: {a.check.unverified.slice(0, 3).join(', ')}</span>}
            {a.quotes?.some((q) => q.answer) && <span className="tag tag-good">☎︎ {T.quote}</span>}
            {a.record && <span className="tag tag-good">{T.record}</span>}
            {a.tipped && <span className="tag tag-good">{T.tip}</span>}
          </div>
          <h3 className="hl-lg">{a.headline}</h3>
          {a.dek && <p className="dek">{a.dek}</p>}
          <Paragraphs ed={ed} a={a} onChange={setEd} setError={setError} />
          {panel === 'heads' && <HeadlinePicker key={a.id + a.headline} ed={ed} a={a} onChange={setEd} setError={setError} onClose={() => setPanel(null)} />}
          {panel === 'rewrite' && (
            <div className="rewrite"><div className="chips">{T.aquick.map((q) => <button key={q} className="chip" disabled={busy} onClick={() => rewrite(q)}>{q}</button>)}</div></div>
          )}
          <div className="bench-actions">
            <button className="btn-ghost danger bench-cut" disabled={busy} onClick={() => judge('cut')}>← {T.spike}</button>
            <button className={`btn-ghost ${panel === 'rewrite' ? 'on' : ''}`} disabled={busy} onClick={() => setPanel(panel === 'rewrite' ? null : 'rewrite')}>{T.rewrite}</button>
            <button className={`btn-ghost ${panel === 'heads' ? 'on' : ''}`} disabled={busy} onClick={() => setPanel(panel === 'heads' ? null : 'heads')}>{T.heads}</button>
            <DeepenButton editionId={ed.id} articleId={a.id} />
            <button className="btn bench-keep" disabled={busy} onClick={() => judge('keep')}>{T.keep} →</button>
          </div>
        </article>
      )}
    </div>
  );
}
