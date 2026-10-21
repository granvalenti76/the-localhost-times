import React, { useState } from 'react';
import { href } from '../lib.js';
import { tr } from '../i18n.js';

const T = tr({
  en: {
    title: 'Home Affairs', from: 'From the sites of', projects: (n) => `${n} project${n === 1 ? '' : 's'}`, page: 'page',
    siteOfDay: 'the site of the day', areas: 'Where the work went', born: 'New in town', arrived: 'New arrivals', left: 'Moved out', released: 'Released',
    state: 'How the work stands', working: 'at work', quiet: (n) => (n == null ? 'never touched' : n <= 1 ? 'quiet since yesterday' : `quiet for ${n} days`),
    dirty: (n) => `${n} not committed`, ahead: (n) => `${n} not pushed`, clean: 'clean',
    standup: 'The standup, already written', copy: 'Copy the standup', copied: 'Copied', more: 'Page', others: (n) => `${n} by others`,
  },
  it: {
    title: 'Interni', from: 'Dai cantieri di', projects: (n) => `${n} progett${n === 1 ? 'o' : 'i'}`, page: 'pagina',
    siteOfDay: 'il cantiere del giorno', areas: 'Le zone del cantiere', born: 'Nuovi in città', arrived: 'Nuovi arrivi', left: 'Traslocati', released: 'Rilasciato',
    state: 'Lo stato dei lavori', working: 'al lavoro', quiet: (n) => (n == null ? 'mai toccato' : n <= 1 ? 'fermo da ieri' : `fermo da ${n} giorni`),
    dirty: (n) => `${n} non committat${n === 1 ? 'o' : 'i'}`, ahead: (n) => `${n} da pushare`, clean: 'pulito',
    standup: 'Lo standup, già scritto', copy: 'Copia lo standup', copied: 'Copiato', more: 'Pagina', others: (n) => `${n} di altri`,
  },
});

const fmt = (n) => Number(n || 0).toLocaleString(tr({ en: 'en-US', it: 'it-IT' }));

/** One project's piece: the big one leads the band, the next ones follow smaller. */
function Site({ a, link, page, big }) {
  const s = a.site;
  return (
    <article className={`in-site ${big ? 'big' : ''}`}>
      <p className="kicker"><span className="sec">{a.repo?.title || a.topic || a.section}</span>{big && <span className="sub"> · {T.siteOfDay}</span>}</p>
      <h3 className={big ? 'hl-lg' : 'hl-md'}><a href={link(a)}>{a.headline}</a></h3>
      {a.dek && <p className={big ? 'dek' : 'dek dek-sm'}>{a.dek}</p>}
      {big && a.body[0] && <p className="in-excerpt">{a.body[0]}</p>}
      {s && big && s.areas?.length > 0 && (
        <div className="in-areas">
          <p className="lbl">{T.areas}</p>
          <div className="in-area-grid">
            {s.areas.slice(0, 5).map((x) => (
              <React.Fragment key={x.area}>
                <code>{x.area}</code>
                <span className="in-bar"><i style={{ width: `${Math.max(4, (x.share / Math.max(1, s.areas[0].share)) * 100)}%` }} /></span>
                <span className="in-pct">{x.share}%</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {s && (
        <p className="in-facts">
          {s.commits > 0 && <span>{s.commits} commit · +{fmt(s.added)} −{fmt(s.removed)}{s.others ? ` · ${T.others(s.others)}` : ''}</span>}
          {big && s.bornCount > 0 && <span><strong>{T.born}:</strong> {s.born.slice(0, 6).map((f) => f.split('/').pop()).join(', ')}{s.bornCount > 6 ? ` +${s.bornCount - 6}` : ''}</span>}
          {s.deps?.arrived?.length > 0 && <span><strong>{T.arrived}:</strong> {s.deps.arrived.join(', ')}</span>}
          {s.deps?.left?.length > 0 && <span><strong>{T.left}:</strong> {s.deps.left.join(', ')}</span>}
          {s.tags?.length > 0 && <span><strong>{T.released}:</strong> {s.tags.join(', ')}</span>}
        </p>
      )}
      <a className="more" href={link(a)}>{T.more} {page} →</a>
    </article>
  );
}

function Board({ board }) {
  return (
    <section className="in-board">
      <h3 className="box-title">{T.state}</h3>
      <ul>
        {board.slice(0, 7).map((r) => (
          <li key={r.name}>
            <span className="in-name">
              <a href={href.project(r.name)}><strong>{r.title}</strong></a>
              <span>{[r.branch, r.dirty ? T.dirty(r.dirty) : T.clean, r.ahead ? T.ahead(r.ahead) : null].filter(Boolean).join(' · ')}</span>
            </span>
            {r.active ? <span className="in-badge">{T.working}</span> : <span className="in-idle">{T.quiet(r.idleDays)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Standup({ text }) {
  const [copied, setCopied] = useState(false);
  const plain = text.replace(/\*\*/g, '');
  return (
    <section className="in-standup">
      <h3 className="box-title">{T.standup}</h3>
      <pre>{plain}</pre>
      <button type="button" className="btn btn-small" onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {})}>{copied ? T.copied : T.copy}</button>
    </section>
  );
}

/** The Interni band of the front page: the projects' pieces, how every project stands, the standup. */
export default function InterniBand({ edition, link, page }) {
  const pieces = edition.articles.filter((a) => a.source === 'git');
  const board = edition.interni?.board || [];
  if (!pieces.length && !board.length) return null;
  return (
    <section className="interni-band" aria-label={T.title}>
      <div className="in-head">
        <h2>{T.title}</h2>
        <p>{T.from} <strong>{edition.interni?.folder || '~'}</strong>{board.length ? ` · ${T.projects(board.length)}` : ''}{page ? ` · ${T.page} ${page}` : ''}</p>
      </div>
      <div className="in-cols">
        {pieces.length > 0 && (
          <div className="in-main">
            {pieces.slice(0, 3).map((a, i) => <Site key={a.id} a={a} link={link} page={page} big={i === 0} />)}
          </div>
        )}
        {board.length > 0 && <Board board={board} />}
        {edition.standup && <Standup text={edition.standup} />}
      </div>
    </section>
  );
}
