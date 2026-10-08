import React from 'react';
import { href, hhmm, longDate, SECTIONS, writerLabel } from '../lib.js';
import { tr } from '../i18n.js';
import Photo from './Photo.jsx';
import Market from './Market.jsx';
import Cartoon from './Cartoon.jsx';
import { InvestigationBox } from './Investigations.jsx';

function DayChart({ hours }) {
  const W = 288, H = 72, bw = W / 24;
  const max = Math.max(1, ...hours);
  return (
    <figure className="activity">
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={tr({ en: 'Signals hour by hour', it: 'Segnali ora per ora' })}>
        {hours.map((v, i) => {
          const h = v ? Math.max(2, (v / max) * H) : 0;
          return <rect key={i} x={i * bw + 1.5} y={H - h} width={bw - 3} height={h} />;
        })}
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} className="axis" />
        {[0, 6, 12, 18, 23].map((i) => (
          <text key={i} x={i * bw + bw / 2} y={H + 12} textAnchor="middle">{String(i).padStart(2, '0')}</text>
        ))}
      </svg>
      <figcaption>{tr({ en: 'Signals hour by hour', it: 'Segnali ora per ora' })}</figcaption>
    </figure>
  );
}

export default function EveningPage({ evening: ev }) {
  const ed = ev.editorial;
  const long = ed.body.join(' ').length > 700;
  const rows = SECTIONS.map((s) => ({ ...s, n: ev.stats.bySource?.[s.id] || 0 })).filter((r) => r.n);
  return (
    <div className="evening">
      <section className="front-top">
        <div className="front-main">
          <article className="editorial">
            <div className="kicker"><span className="sec">{tr({ en: 'Editorial', it: 'L\'editoriale' })}</span><span className="sub"> · {longDate(ev.start)}</span></div>
            <h2 className="hl-editorial">{ed.headline}</h2>
            {ed.oneliner && <p className="dek dek-lg">{ed.oneliner}</p>}
            <div className="byline">{tr({ en: 'By', it: 'Di' })} <strong>{ev.byline ? ev.byline.name : tr({ en: 'The Editor', it: 'Il Direttore' })}</strong>{ev.byline && <span>, {ev.byline.role}</span>}<span> · {writerLabel(ev.writer)}</span><span> · {tr({ en: 'at', it: 'alle' })} {hhmm(ev.createdAt)}</span></div>
            <div className={`lead-body ${long ? 'two' : ''}`}>
              {ed.body.map((p, i) => <p key={i} className={i === 0 && p.length > 120 ? 'dropcap' : ''}>{p}</p>)}
            </div>
          </article>
        </div>
        <aside className="rail">
          <Cartoon cartoon={ev.cartoon} />
          <InvestigationBox />
          <section className="box">
            <h3 className="box-title">{tr({ en: 'The day by the numbers', it: 'La giornata in numeri' })}</h3>
            <DayChart hours={ev.stats.hours} />
            <table className="numbers">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}><th>{r.name}<span>{r.tag}</span></th><td>{r.n}</td></tr>
                ))}
                <tr className="tot"><th>{tr({ en: 'Total', it: 'Totale' })}</th><td>{ev.stats.total}</td></tr>
              </tbody>
            </table>
          </section>
          <Market market={ev.market} title={tr({ en: 'Market · close', it: 'Borsa · chiusura' })} indexName={tr({ en: 'Index of the day', it: 'Indice del giorno' })}
            note={tr({ en: 'Visits of the day per site, change on yesterday at the same time, hour-by-hour trend.', it: 'Visite del giorno per sito, variazione su ieri alla stessa ora, andamento ora per ora.' })} />
        </aside>
      </section>

      {ev.top.length > 0 && (
        <section className="day-top">
          <h3 className="box-title">{tr({ en: 'The day\'s news', it: 'Le notizie del giorno' })}</h3>
          <div className="day-grid">
            {ev.top.map((t) => (
              <article key={t.articleId} className="card">
                <Photo image={t.image} size="sm" caption={false} />
                <div className="kicker">
                  <span className="sec">{t.section}</span>
                  <span className="sub"> · {hhmm(t.hour)}{t.appearances > 1 ? tr({ en: ` · in ${t.appearances} editions`, it: ` · in ${t.appearances} edizioni` }) : ''}</span>
                </div>
                <h2 className="hl-md"><a href={href.article(t.editionId, t.articleId)}>{t.headline}</a></h2>
                {t.dek && <p className="dek dek-sm">{t.dek}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="hour-by-hour">
        <h3 className="box-title">{tr({ en: 'Hour by hour', it: 'Ora per ora' })}</h3>
        <ol>
          {ev.timeline.map((t) => (
            <li key={t.id}>
              <a href={href.edition(t.id)}>
                <time>{hhmm(t.hour)}</time>
                <span className="t">{t.lead || '—'}</span>
                <span className="n">{t.total} {tr({ en: 'signals', it: 'segnali' })}</span>
              </a>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
