import React, { useEffect, useState } from 'react';
import { api, href, longDate } from '../lib.js';
import { tr, locale } from '../i18n.js';

const T = tr({
  en: {
    kicker: 'Home Affairs · the sites', folder: 'Folder', branch: 'Branch', pending: 'Pending', commits: 'Commits', branches: (n) => `${n} branch${n === 1 ? '' : 'es'}`,
    dirty: (n) => `${n} file${n === 1 ? '' : 's'} not committed`, ahead: (n) => `${n} commit${n === 1 ? '' : 's'} not pushed`, clean: 'nothing pending',
    chronicle: 'The chronicle of the site', chronicleSub: 'Every working day on this project, as the paper told it. The latest first.', none: 'No piece about this project yet: it appears here from its first working day in the paper.',
    perDay: 'Thirty days of commits', week: 'This week', areas: 'Where the work went', registry: 'The registry', arrived: 'New dependencies', left: 'Gone', updated: 'Updated', noDeps: 'No dependency came or went this week.',
    born: (n) => `${n} file${n === 1 ? '' : 's'} born`, gone: (n) => `${n} gone`, others: 'The other sites', settings: 'Choose the projects', missing: 'Project not found.', readme: 'from its README',
    lines: (a, r) => `+${a} −${r}`, released: 'Released',
  },
  it: {
    kicker: 'Interni · i cantieri', folder: 'Cartella', branch: 'Ramo', pending: 'In sospeso', commits: 'Commit', branches: (n) => `${n} ram${n === 1 ? 'o' : 'i'}`,
    dirty: (n) => `${n} file non committat${n === 1 ? 'o' : 'i'}`, ahead: (n) => `${n} commit da pushare`, clean: 'niente in sospeso',
    chronicle: 'La cronaca del cantiere', chronicleSub: 'Ogni giornata di lavoro su questo progetto, come l\'ha raccontata il giornale. Le più recenti in alto.', none: 'Ancora nessun pezzo su questo progetto: compare qui dal suo primo giorno di lavoro nel giornale.',
    perDay: 'Trenta giorni di commit', week: 'Questa settimana', areas: 'Dove si è lavorato', registry: 'L\'anagrafe', arrived: 'Dipendenze nuove', left: 'Partite', updated: 'Aggiornate', noDeps: 'Nessuna dipendenza arrivata o partita questa settimana.',
    born: (n) => `${n} file nat${n === 1 ? 'o' : 'i'}`, gone: (n) => `${n} scompars${n === 1 ? 'o' : 'i'}`, others: 'Gli altri cantieri', settings: 'Scegli i progetti', missing: 'Progetto non trovato.', readme: 'dal README',
    lines: (a, r) => `+${a} −${r}`, released: 'Rilasciato',
  },
});

const fmt = (n) => Number(n || 0).toLocaleString(locale);
const dayParts = (ms) => {
  const d = new Date(ms);
  return [d.getDate(), new Intl.DateTimeFormat(locale, { month: 'long' }).format(d)];
};

function PerDay({ perDay }) {
  const max = Math.max(1, ...perDay.bins);
  const peak = perDay.bins.indexOf(max);
  const short = (i) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(perDay.start + i * 864e5);
  return (
    <figure className="ip-chart">
      <div className="ip-bars" role="img" aria-label={T.perDay}>
        {perDay.bins.map((v, i) => <i key={i} title={`${short(i)} · ${v}`} style={{ height: `${v ? Math.max(4, (v / max) * 100) : 0}%` }} />)}
      </div>
      <figcaption><span>{short(0)}</span>{max > 0 && <span>{short(peak)} · {max}</span>}<span>{short(perDay.bins.length - 1)}</span></figcaption>
    </figure>
  );
}

export default function InterniPage({ name }) {
  const [p, setP] = useState(undefined);
  const [error, setError] = useState(null);
  useEffect(() => { setP(undefined); api(`/interni/${encodeURIComponent(name)}`).then(setP).catch((e) => { setP(null); setError(e.message); }); }, [name]);
  if (p === undefined) return <p className="working" style={{ textAlign: 'center', margin: '60px 0' }}>…</p>;
  if (!p) return <p className="empty-text" style={{ textAlign: 'center', margin: '60px auto' }}>{error || T.missing}</p>;
  const w = p.week;
  const deps = [...(w.deps.arrived || []).map((d) => [T.arrived, d]), ...(w.deps.left || []).map((d) => [T.left, d]), ...(w.deps.updated || []).map((d) => [T.updated, d])];
  return (
    <article className="iproject">
      <header className="ip-head">
        <p className="ip-kicker">{T.kicker}</p>
        <div className="ip-title">
          <div>
            <h1>{p.title}</h1>
            {p.description && <p className="ip-desc">«{p.description}» <span>— {T.readme}</span></p>}
          </div>
          <dl>
            <dt>{T.folder}</dt><dd>{p.path}</dd>
            <dt>{T.branch}</dt><dd>{p.branch || '—'} · {T.branches(p.branches)}</dd>
            <dt>{T.pending}</dt><dd className={p.dirty || p.ahead ? 'warn' : ''}>{[p.dirty ? T.dirty(p.dirty) : null, p.ahead ? T.ahead(p.ahead) : null].filter(Boolean).join(' · ') || T.clean}</dd>
            <dt>{T.commits}</dt><dd>{fmt(p.commits)}</dd>
          </dl>
        </div>
      </header>
      <div className="ip-cols">
        <section className="ip-chronicle">
          <h2 className="box-title">{T.chronicle}</h2>
          <p className="ip-sub">{T.chronicleSub}</p>
          {!p.chronicle.length && <p className="empty-text">{T.none}</p>}
          {p.chronicle.map((c, i) => {
            const [d, m] = dayParts(c.first || c.day);
            return (
              <article key={`${c.editionId}-${i}`} className="ip-entry">
                <div className="ip-date"><strong>{d}</strong><span>{m}</span></div>
                <div>
                  <h3 className={i === 0 ? 'hl-lg' : 'hl-md'}><a href={href.article(c.editionId, c.articleId)}>{c.headline}</a></h3>
                  {c.dek && <p className="dek dek-sm">{c.dek}</p>}
                  {i === 0 && c.body[0] && <p className="ip-body">{c.body[0]}</p>}
                </div>
              </article>
            );
          })}
        </section>
        <aside className="ip-side">
          <section>
            <h2 className="box-title">{T.perDay}</h2>
            <PerDay perDay={p.perDay} />
          </section>
          {w.commits > 0 && (
            <section>
              <h2 className="box-title">{T.week}</h2>
              <p className="ip-week">{w.commits} commit · {T.lines(fmt(w.added), fmt(w.removed))}{w.born ? ` · ${T.born(w.born)}` : ''}{w.gone ? ` · ${T.gone(w.gone)}` : ''}</p>
              {w.areas.length > 0 && (
                <div className="ip-map" role="img" aria-label={T.areas}>
                  {w.areas.map((a, i) => <span key={a.area} style={{ flexGrow: Math.max(1, a.share), opacity: 1 - i * 0.12 }} title={`${a.area} ${a.share}%`}><code>{a.area}</code><em>{a.share}%</em></span>)}
                </div>
              )}
              {w.tags?.length > 0 && <p className="ip-week"><strong>{T.released}:</strong> {w.tags.join(', ')}</p>}
            </section>
          )}
          <section>
            <h2 className="box-title">{T.registry}</h2>
            {deps.length ? <ul className="ip-list">{deps.map(([k, d]) => <li key={`${k}${d}`}><code>{d}</code><span>{k}</span></li>)}</ul> : <p className="ip-week">{T.noDeps}</p>}
          </section>
          {p.others.length > 0 && (
            <section>
              <h2 className="box-title">{T.others}</h2>
              <ul className="ip-list">{p.others.map((o) => <li key={o}><a href={href.project(o)}>{o}</a></li>)}</ul>
              <a className="more" href={href.house('interni')}>{T.settings} →</a>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
