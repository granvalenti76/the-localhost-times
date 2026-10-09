import React from 'react';
import { href, hhmm, writerLabel, edHour, shortDate, episodeLabel, readingTime } from '../lib.js';
import Para from './Para.jsx';
import { tr } from '../i18n.js';
import Photo from './Photo.jsx';
import { DeepenButton } from './Features.jsx';

const KIND = tr({
  en: {
    visit: 'visit', search: 'search', received: 'received', sent: 'sent', command: '$', read: 'read', inbox: 'inbox',
    created: 'created', edited: 'edited', entry: 'entry', listened: 'listened', opened: 'opened', highlight: 'highlight',
  },
  it: {
    visit: 'visita', search: 'ricerca', received: 'ricevuta', sent: 'inviata', command: '$', read: 'letta', inbox: 'casella',
    created: 'creata', edited: 'modificata', entry: 'voce', listened: 'ascolto', opened: 'aperto', highlight: 'evidenziato',
  },
});

export default function ArticlePage({ edition, article: a }) {
  const others = edition.articles.filter((x) => x.id !== a.id).slice(0, 4);
  return (
    <div className="story-wrap">
      <div className="story-top">
        <a className="back" href={href.edition(edition.id)}>← {tr({ en: `The ${hhmm(edHour(edition))} front page`, it: `Prima pagina delle ${hhmm(edHour(edition))}` })}</a>
        <span className="story-top-right">
          {a.commissioned
            ? <a className="btn-ghost" href={href.feature(a.commissioned.featureId)}>{tr({ en: 'The draft and its tips', it: 'La lavorazione e le soffiate' })}</a>
            : <DeepenButton editionId={edition.id} articleId={a.id} className="btn-ghost" />}
          <a className="back" href={href.desk(edition.id)}>{tr({ en: 'Open in the newsroom', it: 'Apri in redazione' })}</a>
        </span>
      </div>
      <article className="story">
        <div className="kicker">
          {a.series && <span className="segue">{episodeLabel(a.series.episode)}</span>}
          <a className="sec" href={href.section(edition.id.slice(0, 10), a.slug)}>{a.section}</a>
          {a.kicker && a.kicker.toLowerCase() !== a.section.toLowerCase() && <span className="sub"> · {a.kicker}</span>}
        </div>
        <h1 className="hl-story">{a.headline}</h1>
        {a.dek && <p className="dek dek-story">{a.dek}</p>}
        <div className="byline">
          {tr({ en: 'By', it: 'Di' })} <strong>{a.byline ? a.byline.name : tr({ en: 'The Localhost Times newsroom', it: 'Redazione Localhost Times' })}</strong>{a.byline && <span>, {a.byline.role}</span>}
          <span> · {writerLabel(a.writer)}</span>
          <span> · {hhmm(a.first)}{a.last - a.first > 60e3 ? `–${hhmm(a.last)}` : ''}</span>
          <span> · {readingTime(a)}</span>
        </div>
        {a.quotes?.length > 0 && (
          <aside className="interview-note">
            {a.quotes.map((q, i) => (
              <p key={i}><span className="lbl">☎︎ {tr({ en: 'The interview', it: 'L\'intervista' })} · {hhmm(q.at)}</span> {q.question} — <strong>{q.answer || (q.declined ? tr({ en: 'no comment', it: 'nessun commento' }) : tr({ en: 'no reply', it: 'nessuna risposta' }))}</strong></p>
            ))}
          </aside>
        )}
        <Photo image={a.image} size="lg" />
        <div className="story-body">
          {a.body.map((p, i) => <Para key={i} a={a} p={p} className={i === 0 && p.length > 160 ? 'dropcap' : ''} />)}
        </div>

        {a.series && (
          <section className="episodes">
            <h3 className="box-title">{tr({ en: 'Previously', it: 'Le puntate precedenti' })}</h3>
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
            {a.series.days > 1 && <p className="hint-small">{tr({ en: `The story has been running for ${a.series.days} days.`, it: `La storia va avanti da ${a.series.days} giorni.` })}</p>}
          </section>
        )}

        <section className="evidence">
          <h3 className="box-title">{tr({ en: 'Sources', it: 'Le fonti' })}</h3>
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
          <h3 className="box-title">{tr({ en: 'In the same edition', it: 'Nella stessa edizione' })}</h3>
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
