import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, href, hhmm, shortDate, dayKey, SECTIONS, modelName } from '../lib.js';
import { tr } from '../i18n.js';

const T = tr({
  en: {
    title: 'The Archive', sub: 'Everything the paper printed, and every signal it read.',
    askPh: 'Ask the archive: “How many times was I on YouTube this week?”', ask: 'Ask', asking: 'Looking through the archive…',
    searchPh: 'Search articles and signals', all: 'All', articles: 'Articles', signals: 'Signals', evenings: 'Editorials',
    allSections: 'All sections', relevance: 'Most relevant', recent: 'Most recent',
    results: (n) => (n === 1 ? '1 result' : `${n.toLocaleString('en-US')} results`), none: 'Nothing found. Try fewer or different words, or “a phrase in quotes”.',
    last30: 'Matching signals, last 30 days', archivist: 'The archivist', records: 'Records', more: 'Show more',
    hint: 'Words match their beginning (“ship” finds “shipped”); “quotes” match a whole phrase.',
    edition: 'edition', evening: 'Evening edition', open: 'open the page',
    tabSearch: 'Search', tabInv: 'Investigations',
  },
  it: {
    title: 'L\'emeroteca', sub: 'Tutto quello che il giornale ha stampato, e ogni segnale che ha letto.',
    askPh: 'Chiedi all\'archivio: «Quante volte sono finito su YouTube questa settimana?»', ask: 'Chiedi', asking: 'Cerco nell\'archivio…',
    searchPh: 'Cerca negli articoli e nei segnali', all: 'Tutto', articles: 'Articoli', signals: 'Segnali', evenings: 'Editoriali',
    allSections: 'Tutte le sezioni', relevance: 'Più pertinenti', recent: 'Più recenti',
    results: (n) => (n === 1 ? '1 risultato' : `${n.toLocaleString('it-IT')} risultati`), none: 'Nessun risultato. Prova con meno parole, parole diverse o «una frase tra virgolette».',
    last30: 'Segnali trovati, ultimi 30 giorni', archivist: 'L\'archivista', records: 'Documenti', more: 'Mostra altri',
    hint: 'Le parole valgono anche come inizio («pubblic» trova «pubblicato»); tra "virgolette" cerchi una frase intera.',
    edition: 'edizione', evening: 'Edizione della sera', open: 'apri la pagina',
    tabSearch: 'Cerca', tabInv: 'Inchieste',
  },
});

/** A snippet with [[highlights]], rendered without injecting HTML. */
export function Snippet({ text }) {
  const parts = String(text || '').split(/(\[\[.*?\]\])/g);
  return <>{parts.map((p, i) => (p.startsWith('[[') ? <mark key={i}>{p.slice(2, -2)}</mark> : p))}</>;
}

function linkOf(r) {
  if (r.kind === 'article') return href.article(r.editionId, r.articleId);
  if (r.kind === 'evening') return href.evening(r.day);
  if (r.editionId) return href.edition(r.editionId);
  return null;
}

export function Result({ r, n }) {
  const link = linkOf(r);
  const label = r.kind === 'evening' ? T.evening : r.section;
  return (
    <li className={`arc-item arc-${r.kind}`}>
      <time>{shortDate(r.ts)}<br />{hhmm(r.ts)}</time>
      <div>
        <div className="arc-meta">
          {n != null && <span className="arc-n">[{n}]</span>}
          <span className="sec">{label}</span>
          {r.kind === 'event' && r.host && <span className="h"> · {r.host}</span>}
          {r.kind === 'event' && !r.host && r.detail && <span className="h"> · {r.detail}</span>}
        </div>
        <div className={r.kind === 'event' ? 'arc-title-ev' : 'hl-sm arc-title'}>
          {link ? <a href={link}>{r.title || '—'}</a> : (r.title || '—')}
          {r.url && <a className="arc-ext" href={r.url} target="_blank" rel="noreferrer noopener" title={T.open}>↗</a>}
        </div>
        {r.snippet && <p className="arc-snip"><Snippet text={r.snippet} /></p>}
      </div>
    </li>
  );
}

function Days({ data, from }) {
  const max = Math.max(1, ...data);
  if (!data.some(Boolean)) return null;
  return (
    <figure className="arc-days" aria-label={T.last30}>
      <div className="arc-bars">
        {data.map((v, i) => (
          <span key={i} title={`${dayKey(from + i * 864e5)}: ${v}`} style={{ height: `${v ? Math.max(6, (v / max) * 100) : 0}%` }} />
        ))}
      </div>
      <figcaption>{T.last30}</figcaption>
    </figure>
  );
}

function Ask() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);

  async function go(e) {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    setRes(null);
    try {
      setRes(await api('/ask', { method: 'POST', json: { question: q } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const cited = res?.cited?.length ? res.cited.map((n) => ({ n, r: res.items[n - 1] })) : (res?.items || []).slice(0, 8).map((r, i) => ({ n: i + 1, r }));
  return (
    <section className="arc-ask">
      <form onSubmit={go} className="arc-ask-row">
        <label className="sr-only" htmlFor="arc-ask">{T.ask}</label>
        <input id="arc-ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.askPh} />
        <button className={`btn ${busy ? "busy" : ""}`} disabled={busy || !q.trim()}>{busy ? "…" : T.ask}</button>
      </form>
      {busy && <p className="working">{T.asking}</p>}
      {error && <p className="notice">{error}</p>}
      {res && (
        <div className="arc-answer">
          <span className="lbl">{T.archivist}{res.writer ? ` · ${modelName(res.writer)}` : ''}</span>
          {res.answer ? <p className="arc-answer-text">{res.answer}</p> : <p className="hint-small">{res.note || res.error}</p>}
          {cited.length > 0 && (
            <details open={!res.answer}>
              <summary>{T.records} ({cited.length}{res.items.length > cited.length ? ` / ${res.items.length}` : ''})</summary>
              <ol className="arc-list">{cited.map(({ n, r }) => r && <Result key={n} r={r} n={n} />)}</ol>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

export default function ArchivePage({ query = '' }) {
  const [q, setQ] = useState(query);
  const [kind, setKind] = useState('');
  const [source, setSource] = useState('');
  const [sort, setSort] = useState('relevance');
  const [data, setData] = useState(null);
  const [limit, setLimit] = useState(40);
  const timer = useRef(null);

  useEffect(() => { setQ(query); }, [query]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setData(null); return undefined; }
    timer.current = setTimeout(() => {
      const p = new URLSearchParams({ q, sort, limit: String(limit) });
      if (kind) p.set('kind', kind);
      if (source) p.set('source', source);
      api(`/search?${p}`).then(setData).catch(() => setData(null));
      const h = `#/archive/${encodeURIComponent(q)}`;
      if (location.hash !== h) history.replaceState(null, '', h);
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q, kind, source, sort, limit]);

  const kinds = useMemo(() => [['', T.all], ['article', T.articles], ['event', T.signals], ['evening', T.evenings]], []);

  return (
    <section className="archive">
      <header className="section-head">
        <h2>{T.title}</h2>
        <p>{T.sub}</p>
      </header>
      <nav className="arc-tabs">
        <a href="#/archive" className="on">{T.tabSearch}</a>
        <a href="#/investigations">{T.tabInv}</a>
      </nav>

      <Ask />

      <div className="arc-search">
        <label className="sr-only" htmlFor="arc-q">{T.searchPh}</label>
        <input id="arc-q" type="search" value={q} autoFocus onChange={(e) => { setQ(e.target.value); setLimit(40); }} placeholder={T.searchPh} />
        <div className="arc-filters">
          <div className="seg seg-small">
            {kinds.map(([k, l]) => (
              <button key={k || 'all'} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {l}{data?.counts && (k ? data.counts[k] : null) ? <em> {data.counts[k]}</em> : null}
              </button>
            ))}
          </div>
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label={T.allSections}>
            <option value="">{T.allSections}</option>
            {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={T.relevance}>
            <option value="relevance">{T.relevance}</option>
            <option value="recent">{T.recent}</option>
          </select>
        </div>
        <p className="hint-small">{T.hint}</p>
      </div>

      {data && (
        <>
          <div className="arc-summary">
            <strong>{T.results(data.total)}</strong>
            <Days data={data.byDay} from={data.byDayFrom} />
          </div>
          {data.total === 0 && <p className="empty-text">{T.none}</p>}
          <ol className="arc-list">{data.results.map((r, i) => <Result key={`${r.kind}${r.ts}${i}`} r={r} />)}</ol>
          {data.results.length >= limit && data.total > limit && (
            <button className="btn-ghost" onClick={() => setLimit((l) => l + 40)}>{T.more}</button>
          )}
        </>
      )}
    </section>
  );
}
