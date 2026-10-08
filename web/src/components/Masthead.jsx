import React from 'react';
import { longDate, hhmm, dayFromKey, href, SECTIONS, writerLabel, edHour, edSince } from '../lib.js';

export default function Masthead({ edition, evening, day, status, activeSlug }) {
  const when = edition ? edition.start : evening ? evening.start : dayFromKey(day);
  const present = new Set((edition?.sections || []).map((s) => s.slug));
  const port = typeof location !== 'undefined' ? location.port || '80' : '4321';
  const writer = writerLabel((edition || evening)?.writer || (status?.llm?.state === 'online' ? status.llm.model : null));
  return (
    <header className="mast">
      <div className="mast-head">
        <div className="mast-ear mast-ear-left">
          <strong>{longDate(when)}</strong>
          {evening ? (
            <span>Edizione della sera</span>
          ) : edition ? (
            <span>
              Edizione delle {hhmm(edHour(edition))}{edSince(edition)}
              {!edition.final && <em className="live"> · in corso</em>}
            </span>
          ) : (
            <span>{status?.demo ? 'Edizione dimostrativa' : 'Edizione oraria'}</span>
          )}
          {edition && <span className="muted">{edition.stats.total} segnali · {edition.articles.length} articoli</span>}
          {evening && <span className="muted">{evening.stats.total} segnali · {evening.editions} edizioni</span>}
        </div>
        <h1 className="nameplate">
          <a href={href.latest()}>The Localhost Times</a>
        </h1>
        <div className="mast-ear mast-ear-right">
          <span className="motto">«All the news that{' '}<br />never left the machine»</span>
        </div>
      </div>
      <div className="mast-bar">
        <span>Vol. I · No. {edition?.number ?? '—'}</span>
        <span className="mast-host">Stampato su 127.0.0.1, porta {port}</span>
        <span>Redattore: {writer}</span>
      </div>
      <nav className="sections" aria-label="Sezioni">
        <a href={edition ? href.edition(edition.id) : href.latest()} className={!activeSlug ? 'on' : ''}>Prima pagina</a>
        {SECTIONS.map((s) => (
          <a
            key={s.slug}
            href={href.section(day, s.slug)}
            className={`${activeSlug === s.slug ? 'on' : ''} ${edition && !present.has(s.slug) ? 'dim' : ''}`}
          >
            {s.name}
          </a>
        ))}
        <a href={href.letters()} className={`letters-link ${activeSlug === 'lettere' ? 'on' : ''}`}>Lettere</a>
        <a href={href.desk()} className={`desk-link ${activeSlug === 'redazione' ? 'on' : ''}`}>
          Redazione{status?.drafts ? <span className="badge">{status.drafts}</span> : null}
        </a>
      </nav>
    </header>
  );
}
