import React from 'react';
import { longDate, dayFromKey, href, SECTIONS, writerLabel, edSince, editionName } from '../lib.js';
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
              {editionName(edition)}{edition.cadence && edition.cadence !== 'hourly' ? '' : edSince(edition)}
              {!edition.final && <em className="live"> · {tr({ en: 'in progress', it: 'in corso' })}</em>}
            </span>
          ) : (
            <span>{status?.demo ? tr({ en: 'Demo edition', it: 'Edizione dimostrativa' }) : status?.cadence?.kind === 'daily' ? tr({ en: 'Daily edition', it: 'Edizione quotidiana' }) : status?.cadence?.kind === 'weekly' ? tr({ en: 'Weekly edition', it: 'Edizione settimanale' }) : tr({ en: 'Hourly edition', it: 'Edizione oraria' })}</span>
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
        <a href={href.spotlight()} className={`spot-link ${activeSlug === 'spotlight' ? 'on' : ''}`}>Spotlight</a>
        <a href={href.features()} className={activeSlug === 'features' ? 'on' : ''}>{tr({ en: 'Long reads', it: 'Approfondimenti' })}</a>
        <a href={href.archive()} className={activeSlug === 'archive' ? 'on' : ''}>{tr({ en: 'Archive', it: 'Archivio' })}</a>
        {/* the newsroom and its rooms: hover (or focus) opens the submenu */}
        <span className="nav-drop">
          <a href={href.desk()} className={`desk-link ${activeSlug === 'newsroom' ? 'on' : ''}`} aria-haspopup="true">
            {tr({ en: 'Newsroom', it: 'Redazione' })}{status?.drafts ? <span className="badge">{status.drafts}</span> : null}
            <span className="nav-caret" aria-hidden="true">▾</span>
          </a>
          <span className="nav-sub" role="menu">
            <a role="menuitem" href={href.desk()}>{tr({ en: 'The desk', it: 'La scrivania' })}<em>{tr({ en: 'where the next edition stands', it: 'a che punto è il prossimo numero' })}</em></a>
            <a role="menuitem" href={href.dispatches()}>{tr({ en: 'Sources', it: 'Fonti' })}<em>{tr({ en: 'what the Mac can\'t know: your traces', it: 'quello che il Mac non sa: le tue tracce' })}</em></a>
            <a role="menuitem" href={href.write()}>{tr({ en: 'Writing room', it: 'Sala scrittura' })}<em>{tr({ en: 'the pieces as they are typed', it: 'i pezzi mentre vengono scritti' })}</em></a>
            <a role="menuitem" href={href.proofs()}>{tr({ en: 'Proof round', it: 'Giro di bozze' })}<em>{tr({ en: 'the red pencil, one draft at a time', it: 'la matita rossa, una bozza alla volta' })}</em></a>
            <a role="menuitem" href={href.inquiry()}>{tr({ en: 'Inquiry', it: 'Inchiesta' })}<em>{tr({ en: 'a long piece, built together', it: 'un pezzo lungo, costruito insieme' })}</em></a>
            <a role="menuitem" href={href.editorDesk()}>Editor desk<em>{tr({ en: 'sources, structure, style', it: 'fonti, struttura, stile' })}</em></a>
            <a role="menuitem" href={href.house()}>{tr({ en: 'Publishing House', it: 'Casa Editrice' })}<em>{tr({ en: 'what paper to make: cadence, wires, staff, style', it: 'che giornale fare: uscita, agenzie, redattori, stile' })}</em></a>
          </span>
        </span>
      </nav>
    </header>
  );
}
