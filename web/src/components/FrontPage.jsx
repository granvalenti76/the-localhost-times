import React from 'react';
import { href, hhmm, SECTIONS, episodeLabel } from '../lib.js';
import { tr } from '../i18n.js';
import Photo from './Photo.jsx';
import Market from './Market.jsx';
import Cartoon from './Cartoon.jsx';
import { LettersBox } from './Letters.jsx';

function Kicker({ a }) {
  return (
    <div className="kicker">
      {a.series && <span className="segue">{episodeLabel(a.series.episode)}</span>}
      <span className="sec">{a.section}</span>
      {a.kicker && a.kicker.toLowerCase() !== a.section.toLowerCase() && <span className="sub"> · {a.kicker}</span>}
    </div>
  );
}

function Meta({ a }) {
  return <div className="meta">{hhmm(a.first)}{a.last - a.first > 60e3 ? `–${hhmm(a.last)}` : ''} · {a.sources.length} {a.sources.length === 1 ? tr({ en: 'source', it: 'fonte' }) : tr({ en: 'sources', it: 'fonti' })}</div>;
}

function Activity({ stats, start }) {
  const max = Math.max(1, ...stats.bins);
  const W = 240, H = 64, bw = W / 12;
  return (
    <figure className="activity">
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={tr({ en: 'Signals every five minutes', it: 'Segnali ogni cinque minuti' })}>
        {stats.bins.map((v, i) => {
          const h = v ? Math.max(2, (v / max) * H) : 0;
          return <rect key={i} x={i * bw + 2} y={H - h} width={bw - 4} height={h} />;
        })}
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} className="axis" />
        {[0, 6, 11].map((i) => (
          <text key={i} x={i * bw + bw / 2} y={H + 12} textAnchor="middle">:{String(i * 5).padStart(2, '0')}</text>
        ))}
      </svg>
      <figcaption>{tr({ en: `Signals every five minutes, since ${hhmm(start)}`, it: `Segnali ogni cinque minuti, dalle ${hhmm(start)}` })}</figcaption>
    </figure>
  );
}

function Numbers({ stats }) {
  const rows = SECTIONS.map((s) => ({ ...s, n: stats.bySource?.[s.id] || 0 })).filter((r) => r.n);
  return (
    <table className="numbers">
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <th>{r.name}<span>{r.tag}</span></th>
            <td>{r.n}</td>
          </tr>
        ))}
        <tr className="tot">
          <th>{tr({ en: 'Total', it: 'Totale' })}</th>
          <td>{stats.total}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function FrontPage({ edition }) {
  const [lead, ...rest] = edition.articles;
  const second = rest.slice(0, 2);
  const third = rest.slice(2);
  const link = (a) => href.article(edition.id, a.id);

  const leadParas = lead ? lead.body.slice(0, 3) : [];
  const longLead = leadParas.join(' ').length > 480;

  return (
    <div className="front">
      <section className="front-top">
        <div className="front-main">
          {lead && (
            <article className="lead">
              <Kicker a={lead} />
              <h2 className="hl-xl"><a href={link(lead)}>{lead.headline}</a></h2>
              {lead.dek && <p className="dek dek-lg">{lead.dek}</p>}
              <Meta a={lead} />
              {lead.image ? (
                <div className="lead-split">
                  <Photo image={lead.image} size="md" />
                  <div className="lead-body">
                    {leadParas.map((p, i) => <p key={i} className={i === 0 && p.length > 120 ? 'dropcap' : ''}>{p}</p>)}
                    <a className="more" href={link(lead)}>{tr({ en: 'Continue reading', it: 'Continua a leggere' })} →</a>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`lead-body ${longLead ? 'two' : ''}`}>
                    {leadParas.map((p, i) => <p key={i} className={i === 0 && p.length > 160 ? 'dropcap' : ''}>{p}</p>)}
                  </div>
                  <a className="more" href={link(lead)}>{tr({ en: 'Continue reading', it: 'Continua a leggere' })} →</a>
                </>
              )}
            </article>
          )}
          {second.length > 0 && (
            <div className="front-second">
              {second.map((a) => (
                <article key={a.id} className="card card-md">
                  <Photo image={a.image} size="md" caption={false} />
                  <Kicker a={a} />
                  <h2 className="hl-lg"><a href={link(a)}>{a.headline}</a></h2>
                  {a.dek && <p className="dek">{a.dek}</p>}
                  <p className="excerpt">{a.body[0]}</p>
                  <Meta a={a} />
                </article>
              ))}
            </div>
          )}
        </div>
        <aside className="rail">
          <Cartoon cartoon={edition.cartoon} />
          <section className="box punto">
            <h3 className="box-title">{tr({ en: 'The Brief', it: 'Il punto' })}</h3>
            <p>{edition.summary}</p>
          </section>
          <LettersBox letters={edition.letters} />
          <Market market={edition.market} />
          <section className="box">
            <h3 className="box-title">{tr({ en: 'By the numbers', it: 'In numeri' })}</h3>
            <Activity stats={edition.stats} start={edition.start} />
            <Numbers stats={edition.stats} />
          </section>
        </aside>
      </section>

      {third.length > 0 && (
        <section className="front-grid">
          {third.map((a) => (
            <article key={a.id} className={`card ${a.image ? 'has-photo' : ''}`}>
              <Photo image={a.image} size="sm" caption={false} />
              <Kicker a={a} />
              <h2 className="hl-md"><a href={link(a)}>{a.headline}</a></h2>
              {a.dek && <p className="dek dek-sm">{a.dek}</p>}
              <Meta a={a} />
            </article>
          ))}
        </section>
      )}

      {edition.briefs.length > 0 && (
        <section className="briefs">
          <h3 className="box-title">{tr({ en: 'Briefly', it: 'In breve' })}</h3>
          <ul>
            {edition.briefs.map((b, i) => (
              <li key={i}><span className="sec">{b.section}</span> {b.text}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
