import React from 'react';
import { href, hhmm, writerLabel } from '../lib.js';

const KIND = {
  visit: 'visita', search: 'ricerca', received: 'ricevuta', sent: 'inviata', command: '$',
  created: 'creata', edited: 'modificata', entry: 'voce', listened: 'ascolto', opened: 'aperto', highlight: 'evidenziato',
};

export default function ArticlePage({ edition, article: a }) {
  const others = edition.articles.filter((x) => x.id !== a.id).slice(0, 4);
  return (
    <div className="story-wrap">
      <a className="back" href={href.edition(edition.id)}>← Prima pagina delle {hhmm(edition.start)}</a>
      <article className="story">
        <div className="kicker">
          <a className="sec" href={href.section(edition.id.slice(0, 10), a.slug)}>{a.section}</a>
          {a.kicker && a.kicker.toLowerCase() !== a.section.toLowerCase() && <span className="sub"> · {a.kicker}</span>}
        </div>
        <h1 className="hl-story">{a.headline}</h1>
        {a.dek && <p className="dek dek-story">{a.dek}</p>}
        <div className="byline">
          Di <strong>Redazione Daily Mac</strong>
          <span> · {writerLabel(a.writer)}</span>
          <span> · {hhmm(a.first)}{a.last - a.first > 60e3 ? `–${hhmm(a.last)}` : ''}</span>
        </div>
        <div className="story-body">
          {a.body.map((p, i) => <p key={i} className={i === 0 && p.length > 160 ? 'dropcap' : ''}>{p}</p>)}
        </div>

        <section className="evidence">
          <h3 className="box-title">Le fonti</h3>
          <ol>
            {a.sources.map((s, i) => (
              <li key={i}>
                <time>{hhmm(s.ts)}</time>
                <span className="k">{KIND[s.kind] || s.kind}</span>
                <span className="t">{s.title}</span>
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
