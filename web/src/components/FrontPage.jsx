import React from 'react';
import { href, hhmm, SECTIONS, episodeLabel, readingTime, fitOf, pagesOf } from '../lib.js';
import Para from './Para.jsx';
import { TimeBox, MacLine } from './TimeBox.jsx';
import { SpotlightBand, SpotlightBox } from './Spotlight.jsx';
import { tr, lang } from '../i18n.js';
import Engraving, { motifOf, MOTIFS } from './Engraving.jsx';
import DayStrip from './DayStrip.jsx';
import InterniBand from './InterniBand.jsx';
import Photo from './Photo.jsx';
import Market from './Market.jsx';
import Cartoon from './Cartoon.jsx';
import { LettersBox } from './Letters.jsx';
import { InvestigationBox } from './Investigations.jsx';
import FactCheck from './FactCheck.jsx';
import RadioBox from './Radio.jsx';
import { YearAgoBox } from './YearPage.jsx';
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

const onPage = (p) => tr({ en: `Continued on page ${p}`, it: `Continua a pagina ${p}` });
const plateCaption = (a) => tr({ en: 'The typesetting’s plate for this story', it: 'La tavola della tipografia per questa storia' });

/** The lead: a big headline, its plate (or its photo), the opening paragraphs, and where it goes on. */
function Lead({ a, link, page, motif }) {
  const paras = a.body.slice(0, 2);
  return (
    <article className="lead v2">
      <Kicker a={a} />
      <h2 className={`hl-xl ${fitOf(a.headline)}`}><a href={link(a)}>{a.headline}</a></h2>
      {a.dek && <p className="dek dek-lg">{a.dek}</p>}
      <Meta a={a} />
      {a.image ? <Photo image={a.image} size="lg" /> : <Engraving id={a.id} kind={a.kind} motif={motif} size="lg" lang={lang} caption={plateCaption(a)} />}
      <div className="lead-body two">
        {paras.map((p, i) => <Para key={i} a={a} p={p} className={i === 0 && p.length > 120 ? 'dropcap' : ''} />)}
        <a className="more" href={link(a)}>{page ? onPage(page) : tr({ en: 'Continue reading', it: 'Continua a leggere' })} →</a>
      </div>
    </article>
  );
}

/** The second tier: a plate, a headline, the opening, the page it goes on. */
function Card({ a, link, page, plate = true, motif }) {
  return (
    <article className="card v2">
      {a.image ? <Photo image={a.image} size="md" caption={false} /> : plate && <Engraving id={a.id} kind={a.kind} motif={motif} size="sm" lang={lang} />}
      <Kicker a={a} />
      <h2 className={`hl-lg ${fitOf(a.headline)}`}><a href={link(a)}>{a.headline}</a></h2>
      {a.dek && <p className="dek">{a.dek}</p>}
      <Meta a={a} />
      {page && <a className="more" href={link(a)}>{tr({ en: 'Page', it: 'Pagina' })} {page} →</a>}
    </article>
  );
}

function Grid({ list, link, pageOf }) {
  if (!list.length) return null;
  return (
    <section className="front-grid">
      {list.map((a) => (
        <article key={a.id} className="card">
          <Kicker a={a} />
          <h2 className="hl-md"><a href={link(a)}>{a.headline}</a></h2>
          {a.dek && <p className="dek dek-sm">{a.dek}</p>}
          <Meta a={a} />
          {pageOf(a) && <a className="more" href={link(a)}>{tr({ en: 'Page', it: 'Pagina' })} {pageOf(a)} →</a>}
        </article>
      ))}
    </section>
  );
}

/** "In this issue": every piece, with the page it is on. */
function Contents({ edition, link, pageOf }) {
  if (edition.articles.length < 2) return null;
  return (
    <section className="box contents">
      <h3 className="box-title">{tr({ en: 'In this issue', it: 'In questo numero' })}</h3>
      <ol>
        {edition.articles.map((a) => (
          <li key={a.id}><span className={`pg pg-${a.source}`}>{pageOf(a) || 'A1'}</span><a href={link(a)}>{a.headline}</a></li>
        ))}
      </ol>
    </section>
  );
}

export default function FrontPage({ edition }) {
  const link = (a) => href.article(edition.id, a.id);
  const pages = pagesOf(edition);
  const pageOf = (a) => pages[a.source] || pages[a.source === 'reminders' || a.source === 'calendar' ? 'notes' : a.source] || null;
  // the web and the rest lead; the projects have their own band below
  const outside = edition.articles.filter((a) => a.source !== 'git');
  const [lead, ...rest] = outside.length ? outside : edition.articles;
  const second = rest.slice(0, 2);
  // one motif per plate: two subjects side by side don't get the same lens
  const motifs = new Map();
  const used = new Set();
  for (const a of [lead, ...second].filter(Boolean)) {
    const m = [motifOf(a.kind), ...MOTIFS].find((x) => !used.has(x));
    used.add(m);
    motifs.set(a.id, m);
  }
  return (
    <div className="front v2">
      <SpotlightBand scoop={edition.spotlight} />
      <DayStrip strip={edition.strip} editionId={edition.id} />
      <section className="front-top">
        <div className="front-main">
          {lead && <Lead a={lead} link={link} page={pageOf(lead)} motif={motifs.get(lead.id)} />}
          {second.length > 0 && (
            <section className="front-second v2">
              {second.map((a) => <Card key={a.id} a={a} link={link} page={pageOf(a)} motif={motifs.get(a.id)} />)}
            </section>
          )}
          {edition.briefs.length > 0 && (
            <section className="briefs v2">
              <h3 className="box-title">{tr({ en: 'Briefly', it: 'In breve' })}</h3>
              <ul>
                {edition.briefs.slice(0, 8).map((b, i) => (
                  <li key={i}><span className="sec">{b.section}</span> {b.text}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {/* the rail: what the editors say about this edition */}
        <aside className="rail">
          <Cartoon cartoon={edition.cartoon} />
          <section className="box punto">
            <h3 className="box-title">{tr({ en: 'The Brief', it: 'Il punto' })}</h3>
            <p>{edition.summary}</p>
            {edition.summaryBy && <p className="punto-by">— {edition.summaryBy.name}</p>}
            <EditorNote edition={edition} />
          </section>
          <Contents edition={edition} link={link} pageOf={pageOf} />
          <YearAgoBox ago={edition.yearAgo} />
          <RadioBox edition={edition} />
        </aside>
      </section>

      <InterniBand edition={edition} link={link} page={pages.git} />

      <Grid list={rest.slice(2).filter((a) => a.source !== 'git')} link={link} pageOf={pageOf} />

      {/* below the fold: the checks and the numbers, side by side */}
      <section className="back-pages" aria-label={tr({ en: 'The numbers', it: 'I numeri' })}>
        <FactCheck edition={edition} />
        <SpotlightBox edition={edition} />
        <Market market={edition.market} />
        <LettersBox letters={edition.letters} />
        <TimeBox time={edition.time} />
        <InvestigationBox />
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
