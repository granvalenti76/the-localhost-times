import React from 'react';
import { href, hhmm, writerLabel, edHour, shortDate } from '../lib.js';
import Photo from './Photo.jsx';

const KIND = {
  visit: 'visita', search: 'ricerca', received: 'ricevuta', sent: 'inviata', command: '$',
  created: 'creata', edited: 'modificata', entry: 'voce', listened: 'ascolto', opened: 'aperto', highlight: 'evidenziato',
};

export default function ArticlePage({ edition, article: a }) {
  const others = edition.articles.filter((x) => x.id !== a.id).slice(0, 4);
  return (
    <div className="story-wrap">
      <div className="story-top">
        <a className="back" href={href.edition(edition.id)}>← Prima pagina delle {hhmm(edHour(edition))}</a>
        <a className="back" href={href.desk(edition.id)}>Apri in redazione</a>
      </div>
      <article className="story">
        <div className="kicker">
          {a.series && <span className="segue">Segue · {a.series.episode}ª puntata</span>}
          <a className="sec" href={href.section(edition.id.slice(0, 10), a.slug)}>{a.section}</a>
          {a.kicker && a.kicker.toLowerCase() !== a.section.toLowerCase() && <span className="sub"> · {a.kicker}</span>}
        </div>
        <h1 className="hl-story">{a.headline}</h1>
        {a.dek && <p className="dek dek-story">{a.dek}</p>}
        <div className="byline">
          Di <strong>Redazione Localhost Times</strong>
          <span> · {writerLabel(a.writer)}</span>
          <span> · {hhmm(a.first)}{a.last - a.first > 60e3 ? `–${hhmm(a.last)}` : ''}</span>
        </div>
        <Photo image={a.image} size="lg" />
        <div className="story-body">
          {a.body.map((p, i) => <p key={i} className={i === 0 && p.length > 160 ? 'dropcap' : ''}>{p}</p>)}
        </div>

        {a.series && (
          <section className="episodes">
            <h3 className="box-title">Le puntate precedenti</h3>
            <ol>
              {a.series.previous.map((p) => (
                <li key={p.editionId}>
                  <a href={href.article(p.editionId, a.id)}>
                    <time>{shortDate(p.hour)}, {hhmm(p.hour)}</time>
                    <span>{p.headline}</span>
                  </a>
                </li>
              ))}
            </ol>
            {a.series.days > 1 && <p className="hint-small">La storia va avanti da {a.series.days} giorni.</p>}
          </section>
        )}

        <section className="evidence">
          <h3 className="box-title">Le fonti</h3>
          <ol>
            {a.sources.map((s, i) => (
              <li key={i}>
                <time>{hhmm(s.ts)}</time>
                <span className="k">{KIND[s.kind] || s.kind}</span>
                <span className="t">{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title}</span>
                {(s.host || s.detail) && <span className="h">{s.host || s.detail}</span>}
              </li>
            ))}
          </ol>
        </section>
      </article>

      {others.length > 0 && (
        <aside className="also">
          <h3 className="box-title">Nella stessa edizione</h3>
          <div className="also-grid">
            {others.map((o) => (
              <a key={o.id} href={href.article(edition.id, o.id)} className="also-item">
                <span className="sec">{o.section}</span>
                <span className="hl-sm">{o.headline}</span>
              </a>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
