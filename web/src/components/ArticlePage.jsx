import React, { useState } from 'react';
import { api, href, hhmm, writerLabel, edHour, shortDate, episodeLabel, readingTime } from '../lib.js';
import Para from './Para.jsx';
import { tr } from '../i18n.js';
import Photo from './Photo.jsx';
import { Xray, xrayLabels, DeskCredits } from './Craft.jsx';

const KIND = tr({
  en: {
    visit: 'visit', search: 'search', received: 'received', sent: 'sent', command: '$', read: 'read', inbox: 'inbox',
    created: 'created', edited: 'edited', entry: 'entry', listened: 'listened', opened: 'opened', highlight: 'highlight',
    commit: 'commit', amend: 'amend', merge: 'merge', checkout: 'branch', pull: 'pull', done: 'done', added: 'to do',
  },
  it: {
    visit: 'visita', search: 'ricerca', received: 'ricevuta', sent: 'inviata', command: '$', read: 'letta', inbox: 'casella',
    created: 'creata', edited: 'modificata', entry: 'voce', listened: 'ascolto', opened: 'aperto', highlight: 'evidenziato',
    commit: 'commit', amend: 'correzione', merge: 'merge', checkout: 'ramo', pull: 'pull', done: 'fatto', added: 'da fare',
  },
});

/**
 * The pull quote: one sentence from the middle of a long piece, set large between paragraphs,
 * the way magazines do. A sentence with a quotation or a figure, not too long, never a hedge.
 */
export function pullQuote(body = []) {
  if (body.length < 4) return null;
  let best = null;
  body.slice(1, -1).forEach((p, k) => {
    for (const raw of p.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý«“])/)) {
      const t = raw.trim();
      if (t.length < 50 || t.length > 150 || /^(alle|verso le|at|around)\s+\d/i.test(t) || /\b(forse|perhaps|maybe|probabilmente)\b/i.test(t)) continue;
      const score = (/[«“]/.test(t) ? 2 : 0) + (/\d/.test(t) ? 1 : 0) + (t.length <= 110 ? 1 : 0) + (/[:;]/.test(t) ? 0 : 0.5);
      if (!best || score > best.score) best = { text: t, para: k + 1, score };
    }
  });
  if (!best) return null;
  // set it away from its own paragraph: after the next one
  return { text: best.text, after: Math.min(body.length - 2, best.para + 1) };
}

/** The first paragraph: a drop cap, and its first words in small capitals. */
function Lede({ p, last }) {
  const m = /^(\S+(?:\s+\S+){0,3})(\s[\s\S]*)$/.exec(p);
  return <p className={`dropcap lede${last ? ' end' : ''}`}>{m ? <><span className="lede-caps">{m[1]}</span>{m[2]}</> : p}</p>;
}

/**
 * ♥ on a paragraph, right on the page: the writer learns from it (it becomes an example of what the
 * Editor likes).
 */
function Heart({ edition, a, i, liked, onLiked }) {
  const [busy, setBusy] = useState(false);
  async function like() {
    if (liked || busy) return;
    setBusy(true);
    try {
      await api(`/editions/${encodeURIComponent(edition.id)}/articles/${encodeURIComponent(a.id)}/paragraph`, { method: 'POST', json: { index: i, op: 'like' } });
      onLiked(i);
    } catch { /* the page stays as it is */ } finally { setBusy(false); }
  }
  const who = a.byline?.name;
  const label = liked
    ? tr({ en: who ? `${who} will remember this one` : 'Marked', it: who ? `${who} se lo ricorderà` : 'Segnato' })
    : tr({ en: 'I like this paragraph', it: 'Mi piace questo paragrafo' });
  return <button className={`para-heart ${liked ? 'on' : ''}`} onClick={like} disabled={busy} aria-pressed={liked} aria-label={label} title={label}>♥</button>;
}

export default function ArticlePage({ edition, article: a, xray: xrayAtStart = false }) {
  const [xray, setXray] = useState(xrayAtStart);
  const [liked, setLiked] = useState(() => Object.fromEntries(Object.entries(a.marks || {}).filter(([, v]) => v === 'like').map(([k]) => [k, true])));
  const onLiked = (i) => setLiked((x) => ({ ...x, [i]: true }));
  const others = edition.articles.filter((x) => x.id !== a.id).slice(0, 4);
  const pq = pullQuote(a.body);
  return (
    <div className="story-wrap">
      <div className="story-top">
        <a className="back" href={href.edition(edition.id)}>← {tr({ en: `The ${hhmm(edHour(edition))} front page`, it: `Prima pagina delle ${hhmm(edHour(edition))}` })}</a>
        <span className="story-top-right">
          <button className={`btn-ghost xray-toggle ${xray ? 'on' : ''}`} onClick={() => setXray((x) => !x)}>{xray ? xrayLabels().on : `◐ ${xrayLabels().off}`}</button>
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
              <p key={i}><span className="lbl">☎︎ {tr({ en: 'The interview', it: 'L\'intervista' })} · {hhmm(q.at)}</span> {q.question} — <strong>{q.answer || (q.declined ? tr({ en: 'no comment', it: 'nessun commento' }) : tr({ en: 'no reply', it: 'nessuna risposta' }))}</strong>
                {q.lead && <span className="interview-lead"> · {tr({ en: 'The lead', it: 'La traccia' })}: <em>{q.lead}</em></span>}</p>
            ))}
          </aside>
        )}
        <Photo image={a.image} size="lg" />
        {xray ? <Xray a={a} /> : (
          <div className="story-body">
            {a.body.map((p, i) => (
              <React.Fragment key={i}>
                <div className="para-wrap">
                  <Heart edition={edition} a={a} i={i} liked={!!liked[i]} onLiked={onLiked} />
                  {i === 0 && p.length > 160 ? <Lede p={p} last={a.body.length === 1} /> : <Para a={a} p={p} className={i === a.body.length - 1 ? 'end' : ''} />}
                </div>
                {pq && pq.after === i && <blockquote className="pullquote" aria-hidden="true">{pq.text}</blockquote>}
              </React.Fragment>
            ))}
            <DeskCredits a={a} />
          </div>
        )}

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
          <details open={a.sources.length <= 6}>
          <summary><h3 className="box-title">{tr({ en: 'Sources', it: 'Le fonti' })} <span className="count">{a.sources.length} {tr({ en: a.sources.length === 1 ? 'signal' : 'signals', it: a.sources.length === 1 ? 'segnale' : 'segnali' })}</span></h3></summary>
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
          </details>
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
