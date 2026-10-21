import React, { useEffect, useState } from 'react';
import { api, href, dayFromKey, modelName, isTypeset } from '../lib.js';
import { tr, locale } from '../i18n.js';

const T = tr({
  en: {
    kicker: 'The Year in Review', loading: 'Leafing through the archive…', none: 'The archive is empty: the Year in Review needs something to look back on.',
    read: 'Read the past', reading: 'Reading the past the Mac keeps… the page fills in by itself.', readHint: 'The Mac already keeps a year of Safari, Mail, Books, Podcasts, the shell and git. The paper can read it once, now.',
    print: 'Write it again', printing: 'The editor is writing…', draft: 'Set by the typesetting from the archive as it is.',
    months: 'Month by month', subjects: 'The subjects of the year', habits: 'The habits', found: 'Discovered along the way', hours: 'The hours of the Mac',
    books: 'On the nightstand', shows: 'In the headphones', repos: 'In the workshop', numbers: 'By the numbers',
    days: (n) => `${n} day${n === 1 ? '' : 's'}`, since: 'since', commits: (n) => `${n} commit${n === 1 ? '' : 's'}`, episodes: (n) => `${n} episode${n === 1 ? '' : 's'}`,
    busiest: 'The busiest day', theDayOf: 'the day of', searched: 'The search typed most often', times: (n) => `${n} times`,
    tot: { pages: 'pages', searches: 'searches', mailsIn: 'emails in', mailsOut: 'emails out', commands: 'commands', commits: 'commits', photos: 'photos', episodes: 'episodes' },
    span: (d, a) => `${d} days in the archive, ${a} with something on the record`,
  },
  it: {
    kicker: 'L\'Annuario', loading: 'Sfoglio l\'archivio…', none: 'L\'archivio è vuoto: l\'Annuario ha bisogno di qualcosa da ricordare.',
    read: 'Leggi il passato', reading: 'Leggo il passato che il Mac conserva… la pagina si riempie da sola.', readHint: 'Il Mac conserva già un anno di Safari, Mail, Libri, Podcast, terminale e git. Il giornale può leggerlo una volta, adesso.',
    print: 'Riscrivilo', printing: 'Il direttore scrive…', draft: 'Composto dalla tipografia con l\'archivio com\'è.',
    months: 'Mese per mese', subjects: 'Gli argomenti dell\'anno', habits: 'Le abitudini', found: 'Scoperti strada facendo', hours: 'Le ore del Mac',
    books: 'Sul comodino', shows: 'In cuffia', repos: 'In officina', numbers: 'In numeri',
    days: (n) => `${n} ${n === 1 ? 'giorno' : 'giorni'}`, since: 'dal', commits: (n) => `${n} commit`, episodes: (n) => `${n} ${n === 1 ? 'episodio' : 'episodi'}`,
    busiest: 'Il giorno più pieno', theDayOf: 'il giorno di', searched: 'La ricerca fatta più spesso', times: (n) => `${n} volte`,
    tot: { pages: 'pagine', searches: 'ricerche', mailsIn: 'email ricevute', mailsOut: 'email inviate', commands: 'comandi', commits: 'commit', photos: 'foto', episodes: 'episodi' },
    span: (d, a) => `${d} giorni in archivio, ${a} con qualcosa agli atti`,
  },
});

const monthLabel = (k) => new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1));
const dateLabel = (k) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(typeof k === 'number' ? k : dayFromKey(k));
const fmt = (n) => Number(n || 0).toLocaleString(locale);

function Hours({ hours }) {
  const max = Math.max(1, ...hours);
  return (
    <figure className="yr-hours" aria-label={T.hours}>
      <div className="yr-hours-bars">
        {hours.map((v, h) => <span key={h} title={`${h}:00 · ${fmt(v)}`} style={{ height: `${v ? Math.max(4, (v / max) * 100) : 0}%` }} />)}
      </div>
      <div className="yr-hours-axis"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
    </figure>
  );
}

export default function YearPage() {
  const [r, setR] = useState(undefined);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = () => Promise.all([api('/review'), api('/history')]).then(([rev, h]) => { setR(rev); setHistory(h); }).catch((e) => { setR(null); setError(e.message); });
  useEffect(() => { load(); }, []);
  // while the past is being read, look again now and then
  useEffect(() => {
    if (!busy || history) return undefined;
    const t = setInterval(() => api('/history').then((h) => { if (h) { setHistory(h); setBusy(false); load(); } }).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [busy, history]);

  async function readPast() {
    setBusy(true);
    setError(null);
    try { await api('/history', { method: 'POST' }); } catch (e) { setError(e.message); setBusy(false); }
  }
  async function rewrite() {
    setBusy(true);
    setError(null);
    try { setR(await api('/review', { method: 'POST' })); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (r === undefined) return <p className="working yr-wait">{T.loading}</p>;
  const pastButton = !history && (
    <div className="yr-past">
      <p>{T.readHint}</p>
      <button className={`btn ${busy ? 'busy' : ''}`} onClick={readPast} disabled={busy}>{busy ? '…' : T.read}</button>
      {busy && <p className="working">{T.reading}</p>}
    </div>
  );
  if (!r) return <section className="year"><p className="empty-text yr-wait">{T.none}</p>{pastButton}</section>;

  const t = r.totals;
  return (
    <article className="year">
      <header className="yr-head">
        <p className="kicker"><span className="sec">{T.kicker}</span> <span className="sub">{dateLabel(r.from)} – {dateLabel(r.to)}</span></p>
        <h1 className="yr-title">{r.headline}</h1>
        {r.dek && <p className="yr-dek">{r.dek}</p>}
        <p className="yr-span">{T.span(r.days, r.activeDays)}</p>
      </header>

      <section className="yr-editorial">
        {r.editorial.map((p, i) => <p key={i} className={i === 0 ? 'first' : ''}>{p}</p>)}
        <p className="yr-by">{r.draft ? T.draft : isTypeset(r.writer) ? T.draft : `— ${modelName(r.writer)}`}</p>
        <div className="yr-actions">
          <button className={`btn-ghost ${busy ? 'busy' : ''}`} onClick={rewrite} disabled={busy}>{busy ? T.printing : T.print}</button>
        </div>
        {error && <p className="notice">{error}</p>}
      </section>

      {pastButton}

      {r.months.length > 0 && (
        <section className="yr-months">
          <h2 className="box-title">{T.months}</h2>
          <ol>
            {r.months.map((m) => (
              <li key={m.month}>
                <span className="yr-month">{monthLabel(m.month)}</span>
                <strong className="yr-month-hl">{r.monthHeadlines?.[m.month] || headlineOf(m)}</strong>
                {m.subjects.length > 0 && <span className="yr-month-subj">{m.subjects.map((s) => s.label).join(' · ')}</span>}
                {m.site && <span className="yr-month-site">{m.site}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="yr-grid">
        {r.subjects.length > 0 && (
          <section className="box">
            <h3 className="box-title">{T.subjects}</h3>
            <ol className="yr-list">
              {r.subjects.map((s) => (
                <li key={s.key || s.label}>
                  <a href={href.archive(s.label)}>{s.label}</a>
                  <span>{T.days(s.days)}{s.first ? ` · ${T.since} ${dateLabel(s.first)}` : ''}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {r.sites.length > 0 && (
          <section className="box">
            <h3 className="box-title">{T.habits}</h3>
            <ul className="yr-bars">
              {r.sites.slice(0, 8).map((s) => (
                <li key={s.site}>
                  <span className="yr-bar-label">{s.site}</span>
                  <span className="yr-bar"><span style={{ width: `${Math.max(3, (s.days / Math.max(1, r.sites[0].days)) * 100)}%` }} /></span>
                  <span className="yr-bar-n">{T.days(s.days)}</span>
                </li>
              ))}
            </ul>
            {r.discoveries.length > 0 && (
              <>
                <h4 className="yr-sub">{T.found}</h4>
                <ul className="yr-list">{r.discoveries.map((d) => <li key={d.site}><span>{d.site}</span><span>{T.since} {dateLabel(d.first)}</span></li>)}</ul>
              </>
            )}
          </section>
        )}
        <section className="box">
          <h3 className="box-title">{T.hours}</h3>
          <Hours hours={r.hours} />
          {r.busiest && <p className="yr-note"><span className="lbl">{T.busiest}</span> {dateLabel(r.busiest.day)}{r.busiest.subject ? `, ${T.theDayOf} ${r.busiest.subject}` : ''}.</p>}
          {r.search && <p className="yr-note"><span className="lbl">{T.searched}</span> “{r.search.title}”, {T.times(r.search.n)}.</p>}
        </section>
        {r.books.length > 0 && (
          <section className="box">
            <h3 className="box-title">{T.books}</h3>
            <ul className="yr-list">{r.books.slice(0, 6).map((b) => <li key={b.title}><em>{b.title}</em><span>{b.author || ''}{b.progress != null ? ` · ${b.progress}%` : ''}</span></li>)}</ul>
          </section>
        )}
        {r.shows.length > 0 && (
          <section className="box">
            <h3 className="box-title">{T.shows}</h3>
            <ul className="yr-list">{r.shows.map((s) => <li key={s.show}><span>{s.show}</span><span>{T.episodes(s.episodes)}</span></li>)}</ul>
          </section>
        )}
        {r.repos.length > 0 && (
          <section className="box">
            <h3 className="box-title">{T.repos}</h3>
            <ul className="yr-list">{r.repos.map((x) => <li key={x.repo}><span>{x.repo}</span><span>{T.commits(x.commits)}</span></li>)}</ul>
          </section>
        )}
      </section>

      <section className="yr-numbers" aria-label={T.numbers}>
        {Object.entries(T.tot).filter(([k]) => t[k]).map(([k, label]) => (
          <div key={k}><strong>{fmt(t[k])}</strong><span>{label}</span></div>
        ))}
      </section>
    </article>
  );
}

/** A month's headline: the editor's, or the typesetting's. */
function headlineOf(m) {
  const first = m.subjects[0]?.label;
  return first ? `${first}${m.subjects[1] ? `, ${m.subjects[1].label}` : ''}` : (m.site || '—');
}

/** "A year ago today", for the front page's rail. */
export function YearAgoBox({ ago }) {
  if (!ago) return null;
  const bits = [];
  if (ago.subject) bits.push(tr({ en: <>the subject was <strong>{ago.subject}</strong></>, it: <>l'argomento era <strong>{ago.subject}</strong></> }));
  if (ago.searches?.length) bits.push(tr({ en: <>you searched “{ago.searches[0]}”</>, it: <>cercavi «{ago.searches[0]}»</> }));
  if (ago.book) bits.push(tr({ en: <>you were reading <em>{ago.book}</em></>, it: <>leggevi <em>{ago.book}</em></> }));
  if (ago.episode) bits.push(tr({ en: <>in the headphones, {ago.episode.show || ago.episode.title}</>, it: <>in cuffia, {ago.episode.show || ago.episode.title}</> }));
  if (ago.site && bits.length < 3) bits.push(tr({ en: <>{ago.site.site} came first</>, it: <>in testa c'era {ago.site.site}</> }));
  if (ago.photos) bits.push(tr({ en: `${ago.photos} photo${ago.photos === 1 ? '' : 's'}`, it: `${ago.photos} foto` }));
  if (ago.commits) bits.push(tr({ en: `${ago.commits} commit${ago.commits === 1 ? '' : 's'}`, it: `${ago.commits} commit` }));
  if (!bits.length) return null;
  return (
    <section className="box year-ago">
      <h3 className="box-title">{tr({ en: 'A year ago today', it: 'Un anno fa, oggi' })}</h3>
      <p className="year-ago-date">{dateLabel(ago.day)}</p>
      <ul>{bits.slice(0, 4).map((b, i) => <li key={i}>{b}</li>)}</ul>
      <a className="year-ago-link" href="#/year">{tr({ en: 'The Year in Review →', it: 'L\'Annuario →' })}</a>
    </section>
  );
}
