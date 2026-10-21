import React from 'react';
import { dayFromKey, href, SECTIONS, writerLabel, edSince, editionName, pagesOf, modelName, isTypeset } from '../lib.js';
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
  // the command that printed this page, as it would be typed in the terminal
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const command = edition
    ? `print --edition ${ymd(when)} --vol I --no ${edition.number ?? 1} --press ${hm(edition.end)}${edition.final ? '' : ' --draft'}`
    : evening ? `print --evening ${evening.day}` : `open the-localhost-times${day ? ` --day ${day}` : ''}`;
  const dateShort = new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(when);
  // how long the Mac had been awake when the paper went to press
  const awake = edition?.mac?.awake && edition.mac.since ? Math.max(0, Math.round(((edition.final ? edition.end : Date.now()) - edition.mac.since) / 60e3)) : null;
  const paper = evening ? tr({ en: 'evening', it: 'sera' }) : edition ? editionName(edition).toLowerCase() : status?.demo ? 'demo' : status?.cadence?.kind || 'daily';
  const model = (edition || evening)?.writer || (status?.llm?.state === 'online' ? status.llm.model : null);
  const stats = edition?.stats || evening?.stats;
  return (
    <header className="mast mast-c">
      <p className="mast-cmd"><span className="prompt">~ %</span> {command}{edition && edSince(edition) && edition.cadence === 'hourly' ? <span className="dim">{` # ${edSince(edition).replace(/^ · /, '')}`}</span> : null}</p>
      <div className="mast-head">
        <dl className="mast-ear mast-ear-left">
          <dt>date</dt><dd>{dateShort}</dd>
          <dt>paper</dt><dd>{paper}{edition && !edition.final ? <em className="live"> · {tr({ en: 'in progress', it: 'in corso' })}</em> : null}</dd>
          {awake != null && <><dt>uptime</dt><dd>{awake >= 60 ? `${Math.floor(awake / 60)}h ${awake % 60}m` : `${awake}m`}</dd></>}
          {stats && <><dt>signals</dt><dd>{stats.total.toLocaleString()}</dd></>}
          {edition && <><dt>pieces</dt><dd>{edition.articles.length}{subjects ? ` · ${subjects} ${tr({ en: subjects === 1 ? 'subject' : 'subjects', it: subjects === 1 ? 'argomento' : 'argomenti' })}` : ''}</dd></>}
        </dl>
        <h1 className="nameplate">
          <a href={href.latest()}>The Localhost Times<span className="cursor" aria-hidden="true" /></a>
        </h1>
        <dl className="mast-ear mast-ear-right">
          <dt>host</dt><dd>127.0.0.1:{port}</dd>
          <dt>model</dt><dd title={writer}>{model && !isTypeset(model) ? modelName(String(model).split(' + ')[0]).toLowerCase().split(/\s+/).slice(0, 3).join('-') : tr({ en: 'typesetting', it: 'tipografia' })}</dd>
          <dt>cloud</dt><dd>none</dd>
        </dl>
      </div>
      <p className="mast-motto"><span className="dim">#</span> all the news that never left the machine</p>
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
