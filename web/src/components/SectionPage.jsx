import React, { useEffect, useState } from 'react';
import { api, href, hhmm, longDate, dayFromKey, sectionBySlug } from '../lib.js';
import { tr } from '../i18n.js';

export default function SectionPage({ day, slug }) {
  const sec = sectionBySlug(slug);
  const [items, setItems] = useState(null);

  useEffect(() => {
    setItems(null);
    api(`/editions?day=${day}&full=1`)
      .then((eds) => {
        const out = [];
        for (const e of eds) for (const a of e.articles) if (sec ? a.source === sec.id : a.slug === slug) out.push({ e, a });
        out.sort((x, y) => y.a.last - x.a.last);
        setItems(out);
      })
      .catch(() => setItems([]));
  }, [day, slug, sec?.id]);

  return (
    <section className="section-page">
      <header className="section-head">
        <h2>{sec?.name || slug}</h2>
        <p>{sec?.tag} · {longDate(dayFromKey(day))}{sec && <> · <a className="feed-link" href={`/feed/${sec.slug}.xml`} target="_blank" rel="noreferrer">RSS</a></>}</p>
      </header>
      {items && items.length === 0 && <p className="empty-text">{tr({ en: 'No articles in this section today.', it: 'Nessun articolo in questa sezione per oggi.' })}</p>}
      <ol className="section-list">
        {(items || []).map(({ e, a }) => (
          <li key={e.id + a.id}>
            <time>{hhmm(a.first)}</time>
            <div>
              {a.kicker && <div className="kicker"><span className="sub">{a.kicker}</span></div>}
              <h3 className="hl-md"><a href={href.article(e.id, a.id)}>{a.headline}</a></h3>
              {a.dek && <p className="dek dek-sm">{a.dek}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
