import React from 'react';
import { tr } from '../i18n.js';

const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

/** The radio bulletin of the edition: a player, and the podcast feed. */
export default function RadioBox({ edition }) {
  const r = edition?.radio;
  if (!r?.file) return null;
  return (
    <section className="box radio-box">
      <h3 className="box-title">{tr({ en: 'The radio bulletin', it: 'Il giornale radio' })}{r.duration ? <span className="radio-dur"> · {dur(r.duration)}</span> : null}</h3>
      <audio controls preload="none" src={`/radio/${encodeURIComponent(r.file)}`} />
      <p className="radio-note">
        {r.voice && <>{tr({ en: 'Read by', it: 'Legge' })} {r.voice} · </>}
        <a href="/radio.xml" target="_blank" rel="noreferrer">{tr({ en: 'Podcast feed', it: 'Feed podcast' })}</a>
      </p>
    </section>
  );
}
