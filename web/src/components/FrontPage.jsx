import React from 'react';
import { href, hhmm, SECTIONS, episodeLabel, readingTime } from '../lib.js';
import Para from './Para.jsx';
import { TimeBox, MacLine } from './TimeBox.jsx';
import { SpotlightBand, SpotlightBox } from './Spotlight.jsx';
import { tr } from '../i18n.js';
import Photo from './Photo.jsx';
import Market from './Market.jsx';
import Cartoon from './Cartoon.jsx';
import { LettersBox } from './Letters.jsx';
import { InvestigationBox } from './Investigations.jsx';
import FactCheck from './FactCheck.jsx';
import RadioBox from './Radio.jsx';
import { FlashBand, ChatterBox } from './Live.jsx';
import { SportBox, OracleBox, SerialBox, RumoursBox } from './Games.jsx';
import { FeaturesBox } from './Features.jsx';
import { EditorNote } from './Craft.jsx';

/** Small flags on an article: the Editor's choice, a record, a quote, a tip. */
function Flags({ a, chosen }) {
  const quoted = a.quotes?.some((q) => q.answer);
  if (!chosen && !a.record && !quoted && !a.tipped && !a.commissioned) return null;
  return (
    <span className="flags">
      {a.commissioned && <span className="flag flag-chosen">{tr({ en: 'Commissioned', it: 'Su commissione' })}</span>}
      {chosen && <span className="flag flag-chosen">{tr({ en: 'The Editor\'s choice', it: 'Scelta del direttore' })}</span>}
      {a.record && <span className="flag flag-record">{tr({ en: 'Record', it: 'Primato' })}</span>}
      {quoted && <span className="flag flag-quote">☎︎ {tr({ en: 'Interview', it: 'Intervista' })}</span>}
      {a.tipped && <span className="flag flag-tip">{tr({ en: 'Tip', it: 'Soffiata' })}</span>}
    </span>
  );
}

function Kicker({ a, chosen = false }) {
  return (
    <div className="kicker">
      <Flags a={a} chosen={chosen} />
      {a.series && <span className="segue">{episodeLabel(a.series.episode)}</span>}
      <span className="sec">{a.section}</span>
      {a.kicker && a.kicker.toLowerCase() !== a.section.toLowerCase() && <span className="sub"> · {a.kicker}</span>}
    </div>
  );
}

function Meta({ a }) {
  return <div className="meta">{a.byline && <><span className="byline-name">{tr({ en: 'By', it: 'Di' })} {a.byline.name}</span> · </>}{hhmm(a.first)}{a.last - a.first > 60e3 ? `–${hhmm(a.last)}` : ''} · {a.sources.length} {a.sources.length === 1 ? tr({ en: 'source', it: 'fonte' }) : tr({ en: 'sources', it: 'fonti' })} · {readingTime(a)}</div>;
}

function Activity({ stats, start }) {
  const max = Math.max(1, ...stats.bins);
  const W = 240, H = 64, bw = W / 12;
  return (
    <figure className="activity">
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={tr({ en: 'Signals every five minutes', it: 'Segnali ogni cinque minuti' })}>
        {stats.bins.map((v, i) => {
          const h = v ? Math.max(2, (v / max) * H) : 0;
          return <rect key={i} x={i * bw + 2} y={H - h} width={bw - 4} height={h} />;
        })}
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} className="axis" />
        {[0, 6, 11].map((i) => (
          <text key={i} x={i * bw + bw / 2} y={H + 12} textAnchor="middle">:{String(i * 5).padStart(2, '0')}</text>
        ))}
      </svg>
      <figcaption>{tr({ en: `Signals every five minutes, since ${hhmm(start)}`, it: `Segnali ogni cinque minuti, dalle ${hhmm(start)}` })}</figcaption>
    </figure>
  );
}

function Numbers({ stats }) {
  const rows = SECTIONS.map((s) => ({ ...s, n: stats.bySource?.[s.id] || 0 })).filter((r) => r.n);
  return (
    <table className="numbers">
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <th>{r.name}<span>{r.tag}</span></th>
            <td>{r.n}</td>
          </tr>
        ))}
        <tr className="tot">
          <th>{tr({ en: 'Total', it: 'Totale' })}</th>
          <td>{stats.total}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function FrontPage({ edition }) {
  const [lead, ...rest] = edition.articles;
  const second = rest.slice(0, 2);
  const third = rest.slice(2);
  const link = (a) => href.article(edition.id, a.id);

  const leadParas = lead ? lead.body.slice(0, 3) : [];
  const longLead = leadParas.join(' ').length > 480;

  return (
    <div className="front">
      <FlashBand />
      <SpotlightBand scoop={edition.spotlight} />
      <section className="front-top">
        <div className="front-main">
          {lead && (
            <article className="lead">
              <Kicker a={lead} chosen={edition.closing?.storyId === lead.id} />
              <h2 className="hl-xl"><a href={link(lead)}>{lead.headline}</a></h2>
              {lead.dek && <p className="dek dek-lg">{lead.dek}</p>}
              <Meta a={lead} />
              {lead.image ? (
                <div className="lead-split">
                  <Photo image={lead.image} size="md" />
                  <div className="lead-body">
                    {leadParas.map((p, i) => <Para key={i} a={lead} p={p} className={i === 0 && p.length > 120 ? 'dropcap' : ''} />)}
                    <a className="more" href={link(lead)}>{tr({ en: 'Continue reading', it: 'Continua a leggere' })} →</a>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`lead-body ${longLead ? 'two' : ''}`}>
                    {leadParas.map((p, i) => <Para key={i} a={lead} p={p} className={i === 0 && p.length > 160 ? 'dropcap' : ''} />)}
                  </div>
                  <a className="more" href={link(lead)}>{tr({ en: 'Continue reading', it: 'Continua a leggere' })} →</a>
                </>
              )}
            </article>
          )}
          {second.length > 0 && (
            <div className="front-second">
              {second.map((a) => (
                <article key={a.id} className="card card-md">
                  <Photo image={a.image} size="md" caption={false} />
                  <Kicker a={a} />
                  <h2 className="hl-lg"><a href={link(a)}>{a.headline}</a></h2>
                  {a.dek && <p className="dek">{a.dek}</p>}
                  <Para a={a} p={a.body[0]} className="excerpt" />
                  <Meta a={a} />
                </article>
              ))}
            </div>
          )}
          {/* the rest of the paper stays in the main column, next to the rail: no empty space beside it */}
          {third.length > 0 && (
            <section className="front-grid">
              {third.map((a) => (
                <article key={a.id} className={`card ${a.image ? 'has-photo' : ''}`}>
                  <Photo image={a.image} size="sm" caption={false} />
                  <Kicker a={a} />
                  <h2 className="hl-md"><a href={link(a)}>{a.headline}</a></h2>
                  {a.dek && <p className="dek dek-sm">{a.dek}</p>}
                  <Meta a={a} />
                </article>
              ))}
            </section>
          )}
          {edition.briefs.length > 0 && (
            <section className="briefs">
              <h3 className="box-title">{tr({ en: 'Briefly', it: 'In breve' })}</h3>
              <ul>
                {edition.briefs.map((b, i) => (
                  <li key={i}><span className="sec">{b.section}</span> {b.text}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {/* the rail: what the editors say about this edition */}
        <aside className="rail">
          <Cartoon cartoon={edition.cartoon} />
          <RadioBox edition={edition} />
          <section className="box punto">
            <h3 className="box-title">{tr({ en: 'The Brief', it: 'Il punto' })}</h3>
            <p>{edition.summary}</p>
            {edition.summaryBy && <p className="punto-by">— {edition.summaryBy.name}</p>}
            {edition.closing && !edition.closing.storyId && edition.closing.option !== 'desk' && edition.closing.option !== 'keep' && (
              <p className="closing-note">{tr({ en: `At ${hhmm(edition.closing.at)} the Editor decided: ${edition.closing.answer}.`, it: `Alle ${hhmm(edition.closing.at)} il direttore ha deciso: ${edition.closing.answer}.` })}</p>
            )}
            <EditorNote edition={edition} />
          </section>
          <FactCheck edition={edition} />
          <SpotlightBox edition={edition} />
          <RumoursBox rumours={edition.rumours} />
        </aside>
      </section>

      {/* below the fold: the games and the numbers, side by side */}
      <section className="back-pages" aria-label={tr({ en: 'Games and numbers', it: 'Giochi e numeri' })}>
        <ChatterBox />
        <SerialBox serial={edition.serial} />
        <SportBox sport={edition.sport} />
        <OracleBox oracle={edition.oracle} />
        <FeaturesBox />
        <InvestigationBox />
        <LettersBox letters={edition.letters} />
        <TimeBox time={edition.time} />
        <Market market={edition.market} />
        <section className="box">
          <h3 className="box-title">{tr({ en: 'By the numbers', it: 'In numeri' })}</h3>
          <MacLine mac={edition.mac} />
          <Activity stats={edition.stats} start={edition.start} />
          <Numbers stats={edition.stats} />
        </section>
      </section>
    </div>
  );
}
