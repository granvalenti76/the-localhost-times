import React from 'react';
import { longDate, dayFromKey, href, SECTIONS, writerLabel, edSince, editionName, pagesOf } from '../lib.js';
import { tr, lang } from '../i18n.js';

export default function Masthead({ edition, evening, day, status, activeSlug }) {
  // a daily or weekly paper is dated the day it comes out (it tells the day before)
  const when = edition ? (edition.cadence && edition.cadence !== 'hourly' ? edition.end - 1 : edition.start) : evening ? evening.start : dayFromKey(day);
  const pages = pagesOf(edition);
  // the sections with pieces in this edition (an edition without any keeps the sections it lists)
  const present = new Set(Object.keys(pages).length ? Object.keys(pages) : (edition?.sections || []).map((s) => s.id || s.slug));
  const subjects = (edition?.articles || []).filter((a) => a.kind === 'subject').length;
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
              {editionName(edition)}{edition.cadence && edition.cadence !== 'hourly' ? '' : edSince(edition)}
              {!edition.final && <em className="live"> · {tr({ en: 'in progress', it: 'in corso' })}</em>}
            </span>
          ) : (
            <span>{status?.demo ? tr({ en: 'Demo edition', it: 'Edizione dimostrativa' }) : status?.cadence?.kind === 'daily' ? tr({ en: 'Daily edition', it: 'Edizione quotidiana' }) : status?.cadence?.kind === 'weekly' ? tr({ en: 'Weekly edition', it: 'Edizione settimanale' }) : tr({ en: 'Hourly edition', it: 'Edizione oraria' })}</span>
          )}
          {edition && <span className="muted">{tr({ en: `${edition.stats.total} signals · ${edition.articles.length} articles${subjects ? ` · ${subjects} subject${subjects === 1 ? '' : 's'}` : ''}`, it: `${edition.stats.total} segnali · ${edition.articles.length} articoli${subjects ? ` · ${subjects} argoment${subjects === 1 ? 'o' : 'i'}` : ''}` })}</span>}
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
        <div className="sections-pages">
          <a href={edition ? href.edition(edition.id) : href.latest()} className={!activeSlug ? 'on' : ''}><span className="pg">A1</span>{tr({ en: 'Front page', it: 'Prima pagina' })}</a>
          {/* only the sections in this edition (and the one on screen): a short menu, never empty links */}
          {SECTIONS.filter((s) => activeSlug === s.slug || (activeSlug === 'interni' && s.id === 'git') || present.has(s.id) || present.has(s.slug)).map((s) => (
            <a
              key={s.slug}
              href={href.section(day, s.slug)}
              className={activeSlug === s.slug || (activeSlug === 'interni' && s.id === 'git') ? 'on' : ''}
            >
              {pages[s.id] && <span className="pg">{pages[s.id]}</span>}{s.name}
            </a>
          ))}
        </div>
        <div className="sections-rest">
          <a href={href.letters()} className={`letters-link ${activeSlug === 'letters' ? 'on' : ''}`}>{tr({ en: 'Letters', it: 'Lettere' })}</a>
          <a href={href.spotlight()} className={`spot-link ${activeSlug === 'spotlight' ? 'on' : ''}`}>Spotlight</a>
          <a href={href.archive()} className={activeSlug === 'archive' ? 'on' : ''}>{tr({ en: 'Archive', it: 'Archivio' })}</a>
          <a href={href.desk()} className={`desk-link ${activeSlug === 'newsroom' ? 'on' : ''}`}>
            {tr({ en: 'Newsroom', it: 'Redazione' })}{status?.drafts ? <span className="badge">{status.drafts}</span> : null}
          </a>
        </div>
      </nav>
    </header>
  );
}
