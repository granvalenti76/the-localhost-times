import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, href, hhmm, shortDate, dayKey, SECTIONS, modelName } from '../lib.js';
import { tr } from '../i18n.js';

const T = tr({
  en: {
    title: 'The Archive', sub: 'Everything the paper printed, and every signal it read.',
    askPh: 'What was that article about the trams in Lisbon I read on Tuesday?', ask: 'Remember', asking: 'Looking through the archive…',
    remember: 'Remember', rememberSub: 'Ask for a page, a video, a search, a book or a command the way you remember it: roughly, with a day if you have one. “How many times…” questions work too.',
    examples: ['that video on Saturday evening', 'the book I was reading', 'what did I search on Thursday afternoon'], visits: (n) => `${n} times`, firstLast: 'from', to: 'to', noRecall: 'Nothing like that in the archive. Try other words, or another day.',
    searchPh: 'Search articles and signals', all: 'All', articles: 'Articles', signals: 'Signals', evenings: 'Editorials',
    allSections: 'All sections', relevance: 'Most relevant', recent: 'Most recent',
    results: (n) => (n === 1 ? '1 result' : `${n.toLocaleString('en-US')} results`), none: 'Nothing found. Try fewer or different words, or “a phrase in quotes”.',
    last30: 'Matching signals, last 30 days', archivist: 'The archivist', records: 'Records', more: 'Show more',
    hint: 'Words match their beginning (“ship” finds “shipped”); “quotes” match a whole phrase.',
    edition: 'edition', evening: 'Evening edition', open: 'open the page',
    tabSearch: 'Search', tabInv: 'Investigations', tabYear: 'The Year in Review',
  },
  it: {
    title: 'L\'emeroteca', sub: 'Tutto quello che il giornale ha stampato, e ogni segnale che ha letto.',
    askPh: 'Cos\'era quell\'articolo sui tram di Lisbona che ho letto martedì?', ask: 'Ricorda', asking: 'Cerco nell\'archivio…',
    remember: 'Ricorda', rememberSub: 'Chiedi una pagina, un video, una ricerca, un libro o un comando come te lo ricordi: a grandi linee, con il giorno se ce l\'hai. Funzionano anche le domande «quante volte…».',
    examples: ['quel video di sabato sera', 'il libro che leggevo', 'cosa ho cercato giovedì pomeriggio'], visits: (n) => `${n} volte`, firstLast: 'dal', to: 'al', noRecall: 'Niente del genere in archivio. Prova altre parole, o un altro giorno.',
    searchPh: 'Cerca negli articoli e nei segnali', all: 'Tutto', articles: 'Articoli', signals: 'Segnali', evenings: 'Editoriali',
    allSections: 'Tutte le sezioni', relevance: 'Più pertinenti', recent: 'Più recenti',
    results: (n) => (n === 1 ? '1 risultato' : `${n.toLocaleString('it-IT')} risultati`), none: 'Nessun risultato. Prova con meno parole, parole diverse o «una frase tra virgolette».',
    last30: 'Segnali trovati, ultimi 30 giorni', archivist: 'L\'archivista', records: 'Documenti', more: 'Mostra altri',
    hint: 'Le parole valgono anche come inizio («pubblic» trova «pubblicato»); tra "virgolette" cerchi una frase intera.',
    edition: 'edizione', evening: 'Edizione della sera', open: 'apri la pagina',
    tabSearch: 'Cerca', tabInv: 'Inchieste', tabYear: 'L\'Annuario',
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

/** One thing remembered: a page with its link, a search, a book, a message. */
function Memory({ r, n }) {
  const link = r.editionId ? href.edition(r.editionId) : null;
  return (
    <li className="arc-item arc-event arc-memory">
      <time>{shortDate(r.first)}<br />{hhmm(r.first)}</time>
      <div>
        <div className="arc-meta">
          {n != null && <span className="arc-n">[{n}]</span>}
          <span className="sec">{r.section}</span>
          {(r.site || r.detail) && <span className="h"> · {r.site || r.detail}</span>}
          {r.times > 1 && <span className="h"> · {T.visits(r.times)}{dayKey(r.first) !== dayKey(r.last) ? ` (${T.firstLast} ${shortDate(r.first)} ${T.to} ${shortDate(r.last)})` : ''}</span>}
        </div>
        <div className="arc-title-ev">
          {r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener">{r.title || '—'} <span className="arc-ext">↗</span></a> : link ? <a href={link}>{r.title || '—'}</a> : (r.title || '—')}
        </div>
      </div>
    </li>
  );
}

function Remember({ focus = false }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const input = useRef(null);
  useEffect(() => { if (focus) input.current?.focus(); }, [focus]);

  async function go(e, text = q) {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setRes(null);
    try {
      setRes(await api('/recall', { method: 'POST', json: { question: text } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // a counting question went to the archivist: the old answer, with its records
  const asked = res?.mode === 'ask';
  const cited = asked
    ? (res.cited?.length ? res.cited.map((n) => ({ n, r: res.items[n - 1] })) : (res.items || []).slice(0, 8).map((r, i) => ({ n: i + 1, r })))
    : [];
  const first = !asked && res?.cited?.length ? new Set(res.cited) : null;
  const memories = !asked && res ? (first ? [...res.results.map((r, i) => ({ r, n: i + 1 })).filter((x) => first.has(x.n)), ...res.results.map((r, i) => ({ r, n: i + 1 })).filter((x) => !first.has(x.n))] : res.results.map((r, i) => ({ r, n: i + 1 }))) : [];
  return (
    <section className="arc-ask arc-remember">
      <h3 className="box-title">{T.remember}</h3>
      <p className="hint-small">{T.rememberSub}</p>
      <form onSubmit={go} className="arc-ask-row">
        <label className="sr-only" htmlFor="arc-ask">{T.ask}</label>
        <input id="arc-ask" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.askPh} />
        <button className={`btn ${busy ? 'busy' : ''}`} disabled={busy || !q.trim()}>{busy ? '…' : T.ask}</button>
      </form>
      {!res && !busy && (
        <p className="arc-examples">{T.examples.map((x) => <button key={x} type="button" className="chip" onClick={() => { setQ(x); go(null, x); }}>{x}</button>)}</p>
      )}
      {busy && <p className="working">{T.asking}</p>}
      {error && <p className="notice">{error}</p>}
      {res && asked && (
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
      {res && !asked && (
        <div className="arc-answer">
          {res.answer && <><span className="lbl">{T.archivist}{res.writer ? ` · ${modelName(res.writer)}` : ''}</span><p className="arc-answer-text">{res.answer}</p></>}
          {memories.length ? <ol className="arc-list">{memories.slice(0, 15).map(({ r, n }) => <Memory key={n} r={r} n={n} />)}</ol> : <p className="hint-small">{T.noRecall}</p>}
        </div>
      )}
    </section>
  );
}

export default function ArchivePage({ query = '', remember = false }) {
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
        <a href="#/year">{T.tabYear}</a>
        <a href="#/investigations">{T.tabInv}</a>
      </nav>

      <Remember focus={remember} />

      <div className="arc-search">
        <label className="sr-only" htmlFor="arc-q">{T.searchPh}</label>
        <input id="arc-q" type="search" value={q} autoFocus={!remember} onChange={(e) => { setQ(e.target.value); setLimit(40); }} placeholder={T.searchPh} />
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
