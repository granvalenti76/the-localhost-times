import React, { useEffect, useRef } from 'react';
import { href, shiftDay, dayKey, dayFromKey, shortDate } from '../lib.js';

export default function EditionBar({ day, list, current, onPrint, printing }) {
  const byHour = new Map(list.map((e) => [new Date(e.start).getHours(), e]));
  const today = dayKey(Date.now());
  const nowH = new Date().getHours();
  const strip = useRef(null);

  useEffect(() => {
    const el = strip.current?.querySelector('.cur, .has:last-of-type');
    if (el && strip.current) {
      strip.current.scrollLeft = el.offsetLeft - strip.current.clientWidth / 2 + el.clientWidth / 2;
    }
  }, [current, list]);

  return (
    <div className="edbar">
      <div className="edbar-day">
        <a href={href.day(shiftDay(day, -1))} aria-label="Giorno precedente">‹</a>
        <span>{day === today ? 'Oggi' : shortDate(dayFromKey(day))}</span>
        {day < today ? <a href={href.day(shiftDay(day, 1))} aria-label="Giorno successivo">›</a> : <span className="ghost">›</span>}
      </div>
      <ol className="edbar-hours" ref={strip} aria-label="Edizioni del giorno">
        {Array.from({ length: 24 }, (_, h) => {
          const e = byHour.get(h);
          const future = day === today && h > nowH;
          const label = `${String(h).padStart(2, '0')}`;
          return (
            <li key={h} className={`${e ? 'has' : ''} ${e?.id === current ? 'cur' : ''} ${future ? 'future' : ''}`}>
              {e ? (
                <a href={href.edition(e.id)} title={e.lead || ''}>
                  <span className="h">{label}</span>
                  <span className="dot" style={{ '--n': Math.min(1, (e.total || 1) / 80) }} />
                </a>
              ) : (
                <span>
                  <span className="h">{label}</span>
                  <span className="dot" />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <button className="btn btn-small" onClick={onPrint} disabled={printing}>
        {printing ? 'In stampa…' : 'Stampa ora'}
      </button>
    </div>
  );
}
