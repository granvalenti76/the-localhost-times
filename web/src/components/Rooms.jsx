import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, href } from '../lib.js';
import { tr } from '../i18n.js';
import { soundOn, setSound, onSound, coin, press as pressSound } from '../sound.js';

/*
 * What the newsroom's rooms share: the writers' portraits, the Editor's card (copies, rank,
 * missions), the toast that announces copies earned, and the names of a piece's steps.
 */

// one hue per desk: the portraits are engraved medallions in the writer's colour
const HUES = { web: '#7a3e4a', tech: '#3e5a7a', local: '#8a5a2e', culture: '#4a3e7a', spotlight: '#5c6b3a', columnist: '#6b3a5c' };

export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** A writer's portrait. `state`: 'busy' (writing), 'ok' (delivered), 'idle'. */
export function Medallion({ writer, size = '', state = null, title = null }) {
  return (
    <span className={`rd-med ${size}`} style={{ '--h': HUES[writer?.id] || '#7a6e5c' }} title={title || writer?.name || tr({ en: 'The newsroom', it: 'La redazione' })} aria-hidden={title ? undefined : 'true'}>
      {writer ? initials(writer.name) : '¶'}
      {state && <i className={`rd-st ${state}`} />}
    </span>
  );
}

/** A writer's mood, in a word (people.js). */
export const MOODS = tr({
  en: { inspired: 'inspired', fine: 'fine', low: 'a little low', offended: 'offended' },
  it: { inspired: 'ispirato', fine: 'sereno', low: 'giù di corda', offended: 'offeso' },
});

/** What a reporter is doing, by the step of the piece in their hands. */
export const stepText = (step, name) => {
  const who = name || tr({ en: 'The reporter', it: 'Il cronista' });
  return {
    queued: tr({ en: `${who} is waiting for the press to be free`, it: `${who} aspetta che la rotativa si liberi` }),
    reporter: tr({ en: `${who} is writing the first draft`, it: `${who} scrive la prima stesura` }),
    editor: tr({ en: 'The managing editor is reading it', it: 'Il caporedattore la sta leggendo' }),
    rewrite: tr({ en: `${who} is rewriting it after the managing editor's notes`, it: `${who} la riscrive secondo le note del caporedattore` }),
    reread: tr({ en: 'The managing editor is reading the rewrite', it: 'Il caporedattore rilegge la nuova versione' }),
    copy: tr({ en: 'The copy desk is checking figures and phrasing', it: 'Il correttore controlla cifre e frasi' }),
  }[step] || tr({ en: `${who} is writing`, it: `${who} scrive` });
};

/** The Editor's card, kept fresh; `gain(award)` shows the copies earned by a move. */
export function useDirector() {
  const [d, setD] = useState(null);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const load = useCallback(() => api('/director').then(setD).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const gain = useCallback((a, label = null) => {
    if (!a || !a.gained) return;
    const n = a.gained;
    const missions = a.missions?.length ? ` · ${tr({ en: 'mission accomplished', it: 'missione compiuta' })}` : '';
    if (n > 0) coin();
    setToast({ text: `${n > 0 ? '+' : ''}${n} ${tr({ en: 'copies', it: 'copie' })}${label ? ` · ${label}` : ''}${missions}`, neg: n < 0, at: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2200);
    load();
  }, [load]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { d, load, gain, toast };
}

/** Reports a move made on the page (a mark found, a hint, a fix…); returns what it paid. */
export async function report(reason, ref) {
  try { return (await api('/director/award', { method: 'POST', json: { reason, ref } })).award; } catch { return null; }
}

export function Toast({ toast }) {
  return <div className={`rd-toast ${toast ? 'on' : ''} ${toast?.neg ? 'neg' : ''}`} role="status" aria-live="polite">{toast?.text || ''}</div>;
}

/** The Editor's rank and copies, for the head of the rooms. */
export function DirectorChip({ d }) {
  if (!d) return <div className="rd-dir" />;
  const r = d.rank;
  const pct = r.next ? Math.round(((d.copies - r.from) / (r.next - r.from)) * 100) : 100;
  return (
    <div className="rd-dir" title={tr({ en: 'Copies are the paper\'s points: earned at the desk and in the proof round.', it: 'Le copie sono i punti del giornale: si guadagnano alla scrivania e al giro di bozze.' })}>
      <span className="rd-lvl">{r.level}</span>
      <div>
        <b>{r.title}</b>
        <div className="rd-bar"><i style={{ width: `${pct}%` }} /></div>
        <span className="rd-mut num">{d.copies.toLocaleString()} {tr({ en: 'copies', it: 'copie' })}{r.next ? ` · ${tr({ en: `${r.toNext} to level ${r.level + 1}`, it: `${r.toNext} al livello ${r.level + 1}` })}` : ''}</span>
      </div>
    </div>
  );
}

/** The day's missions. */
export function Missions({ d }) {
  if (!d) return null;
  const prize = d.missions.reduce((t, m) => t + (m.done ? 0 : m.copies), 0);
  return (
    <div className="rd-box">
      <div className="rd-sh"><h4>{tr({ en: 'Today\'s missions', it: 'Le missioni di oggi' })}</h4>{prize > 0 && <span className="rd-lbl">+{prize} {tr({ en: 'copies', it: 'copie' })}</span>}</div>
      {d.missions.map((m) => (
        <div key={m.id} className={`rd-mission ${m.done ? 'done' : ''}`}>
          <span className="rd-ck" aria-hidden="true">{m.done ? '✓' : ''}</span>
          <span>{m.text}{m.of > 1 && !m.done ? <em className="rd-mut"> · {m.n}/{m.of}</em> : null}</span>
          <em className="rd-prize">+{m.copies}</em>
        </div>
      ))}
    </div>
  );
}

/** The run of days with a piece passed for press. */
export function Streak({ d }) {
  if (!d) return null;
  return (
    <div className="rd-box rd-streak">
      <span className="rd-fire num">{d.streak}</span>
      <div>
        <b>{tr({ en: d.streak === 1 ? 'day in a row at the desk' : 'days in a row at the desk', it: d.streak === 1 ? 'giorno di fila alla scrivania' : 'giorni di fila alla scrivania' })}</b>
        <span className="rd-mut">{tr({ en: `Your best: ${d.best}. A day counts when you pass at least one draft.`, it: `Il tuo record: ${d.best}. Un giorno conta se dai il visto ad almeno una bozza.` })}</span>
        <div className="rd-week" aria-hidden="true">{d.week.map((on, i) => <i key={i} className={on ? 'on' : ''} />)}</div>
      </div>
    </div>
  );
}

/** The head of the two full-page rooms: title, what is going on, the way out. */
export function FocusBar({ title, children }) {
  useEffect(() => {
    const on = (e) => { if (e.key === 'Escape' && !e.target.closest?.('input, textarea')) location.hash = href.desk(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  return (
    <div className="rd-fbar">
      <span className="rd-ttl">{title}</span>
      <span className="rd-fmid">{children}</span>
      <SoundToggle dark />
      <a className="rd-xbtn" href={href.desk()}>{tr({ en: 'Back to the desk', it: 'Torna alla scrivania' })} <kbd>Esc</kbd></a>
    </div>
  );
}

/** The sounds of the newsroom, on or off (remembered in this browser). */
export function SoundToggle({ dark = false }) {
  const [on, setOn] = useState(soundOn());
  useEffect(() => onSound(setOn), []);
  const label = on ? tr({ en: 'Sound on', it: 'Suoni accesi' }) : tr({ en: 'Sound off', it: 'Suoni spenti' });
  return (
    <button className={`rd-sound ${dark ? 'dark' : ''} ${on ? 'on' : ''}`} onClick={() => setSound(!on)} aria-pressed={on} title={label} aria-label={label}>
      {on ? '♪' : '♪̸'}<span>{label}</span>
    </button>
  );
}

/**
 * The press running: the rollers turn, the paper goes through, the front page comes out with the
 * lead's headline. Shown when the Editor sends the edition to press, or when the press ran on its own.
 */
export function Press({ edition, onClose }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    pressSound(3);
    const t = setTimeout(() => setDone(true), 2600);
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => { clearTimeout(t); window.removeEventListener('keydown', k); };
  }, [onClose]);
  const lead = edition?.articles?.[0];
  return (
    <div className="rd-press" role="dialog" aria-modal="true" aria-label={tr({ en: 'The press', it: 'La rotativa' })}>
      <div className={`rd-machine ${done ? 'stop' : ''}`} aria-hidden="true">
        <span className="rd-roller a" /><span className="rd-roller b" />
        <span className="rd-web" />
      </div>
      <div className={`rd-front ${done ? 'out' : ''}`}>
        <div className="rd-front-np">The Localhost Times</div>
        <div className="rd-front-k">{lead?.section || ''}</div>
        <div className="rd-front-h">{lead?.headline || tr({ en: 'In print', it: 'In stampa' })}</div>
        {lead?.dek && <div className="rd-front-d">{lead.dek}</div>}
      </div>
      <p className="rd-press-msg">{done ? tr({ en: 'It\'s on the newsstand.', it: 'È in edicola.' }) : tr({ en: 'The press is running…', it: 'La rotativa gira…' })}</p>
      <div className="rd-acts">
        {done && edition && <a className="btn" href={href.edition(edition.id)} onClick={onClose}>{tr({ en: 'Read the paper →', it: 'Leggi il giornale →' })}</a>}
        <button className="rd-ghostd" onClick={onClose}>{tr({ en: 'Back to the desk', it: 'Torna alla scrivania' })}</button>
      </div>
    </div>
  );
}
