import React, { useEffect, useRef, useState } from 'react';
import { href, hhmm } from '../lib.js';
import { tr } from '../i18n.js';

const LANES = () => [
  ['world', tr({ en: 'World', it: 'Esteri' })],
  ['home', tr({ en: 'Home Affairs', it: 'Interni' })],
  ['culture', tr({ en: 'Culture', it: 'Cultura' })],
  ['mail', tr({ en: 'Mail', it: 'Posta' })],
];

/**
 * The day in a strip: the period of the edition as a ribbon, one lane per kind of news, the
 * subjects and projects pinned over it where they first turned up, the Mac's sleep shaded.
 */
export default function DayStrip({ strip, editionId }) {
  const box = useRef(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width || 1000));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  if (!strip || !Object.values(strip.lanes || {}).some((l) => l.length)) return null;
  const span = strip.to - strip.from;
  const hours = span / 3600e3;
  // a tick every three hours of a day, every hour of a short edition
  const step = hours > 12 ? 3 : 1;
  const ticks = [];
  const first = new Date(strip.from);
  first.setMinutes(0, 0, 0);
  for (let t = first.getTime() + (first.getTime() < strip.from ? 3600e3 : 0); t <= strip.to; t += 3600e3) {
    if (new Date(t).getHours() % step === 0) ticks.push(t);
  }
  // labels that would sit on top of each other go up a row (a label is about 7px a letter)
  const ends = [];
  const labels = strip.labels.map((l) => {
    const x = l.at * width;
    let row = ends.findIndex((end) => end < x);
    if (row < 0) row = ends.length;
    ends[row] = x + 12 + String(l.text).length * 7;
    return { ...l, row };
  });
  const lanes = LANES();
  return (
    <section className="daystrip" ref={box} aria-label={tr({ en: 'The day in a strip', it: 'La giornata in una striscia' })}>
      <div className="daystrip-head">
        <h2>{tr({ en: 'The day in a strip', it: 'La giornata in una striscia' })} <span>· {hours > 20 ? tr({ en: `from ${hhmm(strip.from)} to ${hhmm(strip.to)} the next day`, it: `dalle ${hhmm(strip.from)} alle ${hhmm(strip.to)} del giorno dopo` }) : `${hhmm(strip.from)}–${hhmm(strip.to)}`}</span></h2>
        <div className="daystrip-legend">
          {lanes.map(([k, name]) => <span key={k}><i className={`ln-${k}`} />{name}</span>)}
        </div>
      </div>
      <div className="daystrip-labels" style={{ height: `${22 + 16 * Math.max(0, ...labels.map((l) => l.row))}px` }}>
        {labels.map((l) => (
          <a key={l.articleId} href={href.article(editionId, l.articleId)} className={`daystrip-label lb-${l.lane}`} style={{ left: `${l.at * 100}%`, bottom: `${l.row * 16}px` }}>{l.text}</a>
        ))}
      </div>
      <div className="daystrip-lanes">
        {strip.sleep.map(([a, b], i) => <i key={`s${i}`} className="daystrip-sleep" style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%` }} title={tr({ en: 'The Mac asleep', it: 'Il Mac dorme' })} />)}
        {lanes.map(([k, name]) => (
          <div key={k} className={`daystrip-lane lane-${k}`} role="img" aria-label={`${name}: ${(strip.lanes[k] || []).length}`}>
            {(strip.lanes[k] || []).map(([a, b], i) => <i key={i} className={`ln-${k}`} style={{ left: `${a * 100}%`, width: `${Math.max(0.4, (b - a) * 100)}%` }} />)}
          </div>
        ))}
      </div>
      <div className="daystrip-axis" aria-hidden="true">
        {ticks.map((t) => <span key={t} style={{ left: `${((t - strip.from) / span) * 100}%` }}>{new Date(t).getHours()}</span>)}
      </div>
    </section>
  );
}
