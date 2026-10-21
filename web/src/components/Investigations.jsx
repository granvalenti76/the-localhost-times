import React, { useEffect, useState } from 'react';
import { api, href, hhmm, shortDate, longDate, dayKey, SECTIONS, writerLabel } from '../lib.js';
import { tr, quote } from '../i18n.js';

const T = tr({
  en: {
    title: 'Investigations', sub: 'Long pieces on one subject, across days or weeks, built from the archive.',
    tabSearch: 'Search', tabInv: 'Investigations', tabYear: 'The Year in Review',
    newTitle: 'Open an investigation', topic: 'Subject', topicPh: 'e.g. GitHub, TurboCode, YouTube, Julia…',
    keywords: 'Words to look for (optional)', keywordsPh: 'by default, the subject itself', period: 'Period',
    days: (n) => `last ${n} days`, start: 'Start the investigation', working: 'The investigations desk is at work… (a few minutes with a slow model)',
    ideas: 'Ideas from the newsroom', none: 'No investigations yet.', by: 'By', desk: 'the investigations desk',
    findings: 'Key findings', numbers: 'The numbers', signals: 'signals', share: 'of all activity', activeDays: 'active days',
    perDay: 'Signals per day', perHour: 'At what time', timeline: 'Timeline', coverage: 'In the paper', sites: 'Where',
    back: '← All investigations', del: 'Delete', confirm: 'Sure?', period2: (a, b) => `${a} – ${b}`,
    latest: 'The investigation', read: 'Read',
    working2: 'Being written', workingLong: 'The numbers are ready; the writer is working on the piece. With a local model it takes a few minutes (longer if an edition is being printed). You can leave this page: the investigation will be here.',
    elapsed: (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, failed: 'This investigation could not be finished.', retry: 'Try again', inProgress: 'being written',
  },
  it: {
    title: 'Inchieste', sub: 'Pezzi lunghi su un argomento, attraverso giorni o settimane, costruiti dall\'archivio.',
    tabSearch: 'Cerca', tabInv: 'Inchieste', tabYear: 'L\'Annuario',
    newTitle: 'Apri un\'inchiesta', topic: 'Argomento', topicPh: 'es. GitHub, TurboCode, YouTube, Giulia…',
    keywords: 'Parole da cercare (facoltativo)', keywordsPh: 'di default, l\'argomento stesso', period: 'Periodo',
    days: (n) => `ultimi ${n} giorni`, start: 'Avvia l\'inchiesta', working: 'La redazione inchieste è al lavoro… (qualche minuto con un modello lento)',
    ideas: 'Idee dalla redazione', none: 'Ancora nessuna inchiesta.', by: 'Di', desk: 'la redazione inchieste',
    findings: 'I risultati', numbers: 'I numeri', signals: 'segnali', share: 'di tutta l\'attività', activeDays: 'giorni attivi',
    perDay: 'Segnali per giorno', perHour: 'A che ora', timeline: 'Cronologia', coverage: 'Sul giornale', sites: 'Dove',
    back: '← Tutte le inchieste', del: 'Elimina', confirm: 'Sicuro?', period2: (a, b) => `${a} – ${b}`,
    latest: 'L\'inchiesta', read: 'Leggi',
    working2: 'In lavorazione', workingLong: 'I numeri sono pronti; il redattore sta scrivendo il pezzo. Con un modello locale ci vuole qualche minuto (di più se intanto si stampa un\'edizione). Puoi lasciare la pagina: l\'inchiesta resta qui.',
    elapsed: (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, failed: 'Questa inchiesta non è stata completata.', retry: 'Riprova', inProgress: 'in lavorazione',
  },
});

const pct = (x) => `${Math.round(x * 1000) / 10}%`;

function Bars({ data, labels, title }) {
  const max = Math.max(1, ...data);
  return (
    <figure className="inv-chart">
      <div className="inv-bars">
        {data.map((v, i) => (
          <span key={i} title={`${labels[i]}: ${v}`} className={v === max && v ? 'top' : ''} style={{ height: `${v ? Math.max(4, (v / max) * 100) : 0}%` }} />
        ))}
      </div>
      <div className="inv-axis"><span>{labels[0]}</span><span>{labels[Math.floor(labels.length / 2)]}</span><span>{labels.at(-1)}</span></div>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

function Tabs({ on }) {
  return (
    <nav className="arc-tabs">
      <a href={href.archive()} className={on === 'search' ? 'on' : ''}>{T.tabSearch}</a>
      <a href={href.year()}>{T.tabYear}</a>
      <a href={href.investigations()} className={on === 'inv' ? 'on' : ''}>{T.tabInv}</a>
    </nav>
  );
}

function NewInvestigation({ onCreated }) {
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [days, setDays] = useState(14);
  const [ideas, setIdeas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { api('/investigations/suggestions').then(setIdeas).catch(() => {}); }, []);

  async function go(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const inv = await api('/investigations', { method: 'POST', json: { topic, keywords, days } });
      onCreated(inv);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inv-new" onSubmit={go}>
      <h3 className="box-title">{T.newTitle}</h3>
      <label className="lbl" htmlFor="inv-topic">{T.topic}</label>
      <input id="inv-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={T.topicPh} />
      <label className="lbl" htmlFor="inv-kw">{T.keywords}</label>
      <input id="inv-kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={T.keywordsPh} />
      <span className="lbl">{T.period}</span>
      <div className="seg seg-small">
        {[7, 14, 30, 90].map((d) => (
          <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{T.days(d)}</button>
        ))}
      </div>
      <button className={`btn ${busy ? 'busy' : ''}`} disabled={busy || !topic.trim()}>{busy ? '…' : T.start}</button>
      {error && <p className="notice">{error}</p>}
      {ideas.length > 0 && (
        <div className="inv-ideas">
          <span className="lbl">{T.ideas}</span>
          <div className="chips">
            {ideas.map((i) => (
              <button key={i.topic} type="button" className="chip" title={i.why} onClick={() => setTopic(i.topic)}>
                {i.topic} <em>· {i.why}</em>
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

export function InvestigationsPage() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/investigations').then(setList).catch(() => setList([])); }, []);
  return (
    <section className="archive">
      <header className="section-head">
        <h2>{T.title}</h2>
        <p>{T.sub}</p>
      </header>
      <Tabs on="inv" />
      <div className="inv-grid">
        <div>
          {list && !list.length && <p className="empty-text">{T.none}</p>}
          <ol className="inv-list">
            {(list || []).map((i) => (
              <li key={i.id}>
                <a href={href.investigation(i.id)}>
                  <span className="kicker"><span className="sec">{i.topic}</span><span className="sub"> · {T.period2(shortDate(i.from), shortDate(i.to))}</span>{i.status === 'working' && <span className="inv-badge"> · {T.inProgress}</span>}</span>
                  <span className="hl-md">{i.headline}</span>
                  {i.dek && <span className="dek dek-sm">{i.dek}</span>}
                </a>
              </li>
            ))}
          </ol>
        </div>
        <NewInvestigation onCreated={(inv) => { location.hash = href.investigation(inv.id); }} />
      </div>
    </section>
  );
}

/** The front-page box: the latest investigation of the week. */
export function InvestigationBox() {
  const [inv, setInv] = useState(null);
  useEffect(() => {
    api('/investigations?limit=1').then((l) => setInv(l[0] && Date.now() - l[0].createdAt < 7 * 864e5 ? l[0] : null)).catch(() => {});
  }, []);
  if (!inv) return null;
  return (
    <section className="box inv-box">
      <h3 className="box-title">{T.latest}</h3>
      <a href={href.investigation(inv.id)} className="hl-sm">{inv.headline}</a>
      {inv.findings?.[0] && <p className="inv-box-find">{inv.findings[0]}</p>}
      <a className="more" href={href.investigation(inv.id)}>{T.read} →</a>
    </section>
  );
}

export function InvestigationPage({ id }) {
  const [inv, setInv] = useState(null);
  const [error, setError] = useState(null);
  const [armed, setArmed] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { api(`/investigations/${id}`).then(setInv).catch((e) => setError(e.message)); }, [id]);
  // while the piece is being written: poll every 3 seconds, and tick the clock
  const working = inv?.status === 'working';
  useEffect(() => {
    if (!working) return undefined;
    const poll = setInterval(() => api(`/investigations/${id}`).then(setInv).catch(() => {}), 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [working, id]);
  if (error) return <p className="notice">{error}</p>;
  if (!inv) return null;

  async function retry() {
    const fresh = await api('/investigations', { method: 'POST', json: { topic: inv.topic, keywords: inv.keywords, days: inv.days } });
    await api(`/investigations/${id}`, { method: 'DELETE' });
    location.hash = href.investigation(fresh.id);
  }
  const n = inv.numbers;
  const dayLabels = n.byDay.map((_, i) => dayKey(n.byDayFrom + i * 864e5).slice(5).replace('-', '/'));
  const hourLabels = n.byHour.map((_, i) => String(i).padStart(2, '0'));

  async function del() {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    await api(`/investigations/${id}`, { method: 'DELETE' });
    location.hash = href.investigations();
  }

  return (
    <div className="investigation">
      <div className="story-top">
        <a className="back" href={href.investigations()}>{T.back}</a>
        <button className={`btn-ghost ${armed ? 'danger on' : ''}`} onClick={del}>{armed ? T.confirm : T.del}</button>
      </div>
      <header className="inv-head">
        <div className="kicker"><span className="sec">{T.latest}</span><span className="sub"> · {inv.topic} · {T.period2(longDate(inv.from), longDate(inv.to))}</span></div>
        <h1 className="hl-story">{inv.headline}</h1>
        {inv.dek && <p className="dek dek-story">{inv.dek}</p>}
        {inv.status === 'published' && <div className="byline">{T.by} <strong>{T.desk}</strong><span> · {writerLabel(inv.writer)}</span><span> · {shortDate(inv.createdAt)}, {hhmm(inv.createdAt)}</span></div>}
        {working && (
          <div className="inv-working" role="status">
            <span className="inv-spinner" aria-hidden="true" />
            <div>
              <strong>{T.working2} · {T.elapsed(Math.max(0, Math.round((now - inv.createdAt) / 1000)))}</strong>
              <p>{T.workingLong}</p>
            </div>
          </div>
        )}
        {inv.status === 'failed' && (
          <div className="inv-working failed" role="status">
            <div><strong>{T.failed}</strong>{inv.error && inv.error !== 'interrupted' && <p>{inv.error}</p>}</div>
            <button className="btn btn-small" onClick={retry}>{T.retry}</button>
          </div>
        )}
      </header>

      <div className="inv-body-grid">
        <article className="inv-body">
          {inv.findings?.length > 0 && (
            <aside className="inv-findings">
              <span className="lbl">{T.findings}</span>
              <ol>{inv.findings.map((f, i) => <li key={i}>{f}</li>)}</ol>
            </aside>
          )}
          {inv.sections.map((s, i) => (
            <section key={i}>
              {s.heading && <h2 className="inv-h">{s.heading}</h2>}
              {s.paragraphs.map((p, k) => <p key={k} className={i === 0 && k === 0 && p.length > 160 ? 'dropcap' : ''}>{p}</p>)}
            </section>
          ))}
        </article>

        <aside className="inv-side">
          <section className="box">
            <h3 className="box-title">{T.numbers}</h3>
            <div className="inv-stats">
              <div><strong>{n.total.toLocaleString()}</strong><span>{T.signals}</span></div>
              <div><strong>{pct(n.share)}</strong><span>{T.share}</span></div>
              <div><strong>{n.activeDays}/{n.days}</strong><span>{T.activeDays}</span></div>
            </div>
            {n.total > 0 && <Bars data={n.byDay} labels={dayLabels} title={T.perDay} />}
            {n.total > 0 && <Bars data={n.byHour} labels={hourLabels} title={T.perHour} />}
            {Object.keys(n.bySource).length > 0 && (
              <table className="numbers">
                <tbody>
                  {SECTIONS.filter((s) => n.bySource[s.id]).map((s) => (
                    <tr key={s.id}><th>{s.name}<span>{s.tag}</span></th><td>{n.bySource[s.id]}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {n.sites?.length > 0 && (
            <section className="box">
              <h3 className="box-title">{T.sites}</h3>
              <table className="numbers"><tbody>{n.sites.map((s) => <tr key={s.name}><th>{s.name}</th><td>{s.n}</td></tr>)}</tbody></table>
            </section>
          )}
          {inv.timeline?.length > 0 && (
            <section className="box">
              <h3 className="box-title">{T.timeline}</h3>
              <ol className="inv-timeline">
                {inv.timeline.map((t, i) => (
                  <li key={i}>
                    <time>{shortDate(t.ts)}{t.day ? '' : `, ${hhmm(t.ts)}`}</time>
                    {t.editionId ? <a href={href.article(t.editionId, t.articleId)}>{quote(t.text)}</a> : <span>{t.text}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
