import React from 'react';
import { longDate, hhmm, dayFromKey, href, SECTIONS, writerLabel } from '../lib.js';

export default function Masthead({ edition, day, status, activeSlug }) {
  const when = edition ? edition.start : dayFromKey(day);
  const present = new Set((edition?.sections || []).map((s) => s.slug));
  return (
    <header className="mast">
      <div className="mast-top">
        <span>{longDate(when)}</span>
        <span className="mast-ear">
          {edition ? (
            <>
              Edizione delle {hhmm(edition.start)}
              {!edition.final && <em className="live"> · in corso</em>}
            </>
          ) : status?.demo ? 'Edizione dimostrativa' : 'Edizione oraria'}
        </span>
      </div>
      <h1 className="nameplate">
        <a href={href.latest()}>The Daily Mac</a>
      </h1>
      <div className="mast-bar">
        <span>Vol. I · N. {edition?.number ?? '—'}</span>
        <span className="motto">«Tutte le notizie che il tuo Mac ha visto»</span>
        <span>Redattore: {writerLabel(edition?.writer)}</span>
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
      </nav>
    </header>
  );
}
