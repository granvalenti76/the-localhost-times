import React from 'react';
import { longDate, hhmm, dayFromKey, href, SECTIONS, writerLabel, edHour, edSince, editionLabel } from '../lib.js';
import { tr, lang } from '../i18n.js';

export default function Masthead({ edition, evening, day, status, activeSlug }) {
  const when = edition ? edition.start : evening ? evening.start : dayFromKey(day);
  const present = new Set((edition?.sections || []).map((s) => s.id || s.slug));
  const port = typeof location !== 'undefined' ? location.port || '80' : '4321';
  const writer = writerLabel((edition || evening)?.writer || (status?.llm?.state === 'online' ? status.llm.model : null));
  return (
    <header className="mast">
      <div className="mast-head">
        <div className="mast-ear mast-ear-left">
          <strong>{longDate(when)}</strong>
          {evening ? (
            <span>{tr({ en: 'Evening edition', it: 'Edizione della sera' })}</span>
          ) : edition ? (
            <span>
              {editionLabel(edHour(edition))}{edSince(edition)}
              {!edition.final && <em className="live"> · {tr({ en: 'in progress', it: 'in corso' })}</em>}
            </span>
          ) : (
            <span>{status?.demo ? tr({ en: 'Demo edition', it: 'Edizione dimostrativa' }) : tr({ en: 'Hourly edition', it: 'Edizione oraria' })}</span>
          )}
          {edition && <span className="muted">{tr({ en: `${edition.stats.total} signals · ${edition.articles.length} articles`, it: `${edition.stats.total} segnali · ${edition.articles.length} articoli` })}</span>}
          {evening && <span className="muted">{tr({ en: `${evening.stats.total} signals · ${evening.editions} editions`, it: `${evening.stats.total} segnali · ${evening.editions} edizioni` })}</span>}
        </div>
        <h1 className="nameplate">
          <a href={href.latest()}>The Localhost Times</a>
        </h1>
        <div className="mast-ear mast-ear-right">
          <span className="motto">{lang === 'it' ? '«' : '“'}All the news that{' '}<br />never left the machine{lang === 'it' ? '»' : '”'}</span>
        </div>
      </div>
      <div className="mast-bar">
        <span>Vol. I · No. {edition?.number ?? '—'}</span>
        <span className="mast-host">{tr({ en: `Printed on 127.0.0.1, port ${port}`, it: `Stampato su 127.0.0.1, porta ${port}` })}</span>
        <span>{tr({ en: 'Writer', it: 'Redattore' })}: {writer}</span>
      </div>
      <nav className="sections" aria-label={tr({ en: 'Sections', it: 'Sezioni' })}>
        <a href={edition ? href.edition(edition.id) : href.latest()} className={!activeSlug ? 'on' : ''}>{tr({ en: 'Front page', it: 'Prima pagina' })}</a>
        {SECTIONS.map((s) => (
          <a
            key={s.slug}
            href={href.section(day, s.slug)}
            className={`${activeSlug === s.slug ? 'on' : ''} ${edition && !present.has(s.id) && !present.has(s.slug) ? 'dim' : ''}`}
          >
            {s.name}
          </a>
        ))}
        <a href={href.letters()} className={`letters-link ${activeSlug === 'letters' ? 'on' : ''}`}>{tr({ en: 'Letters', it: 'Lettere' })}</a>
        <a href={href.desk()} className={`desk-link ${activeSlug === 'newsroom' ? 'on' : ''}`}>
          {tr({ en: 'Newsroom', it: 'Redazione' })}{status?.drafts ? <span className="badge">{status.drafts}</span> : null}
        </a>
      </nav>
    </header>
  );
}
