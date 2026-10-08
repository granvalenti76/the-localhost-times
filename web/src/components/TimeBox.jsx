import React from 'react';
import { hhmm } from '../lib.js';
import { tr } from '../i18n.js';

/** "Time": how the edition's hour was split between apps (from the app sampler). */
export function TimeBox({ time }) {
  if (!time || !time.apps?.length) return null;
  const max = Math.max(1, ...time.apps.map((a) => a.minutes));
  const rows = time.apps.slice(0, 6);
  return (
    <section className="box time-box">
      <h3 className="box-title">{tr({ en: 'Time', it: 'Il tempo' })}</h3>
      <ul className="time-bars">
        {rows.map((a) => (
          <li key={a.name}>
            <span className="time-app">{a.name}</span>
            <span className="time-bar"><span style={{ width: `${Math.max(3, (a.minutes / max) * 100)}%` }} /></span>
            <span className="time-min">{a.minutes}′</span>
          </li>
        ))}
      </ul>
      <p className="time-foot">
        {tr({ en: `${time.active} min at the Mac`, it: `${time.active} min al Mac` })}
        {time.away ? tr({ en: ` · ${time.away} away`, it: ` · ${time.away} lontano` }) : ''}
        {tr({ en: ` · ${time.switches} switches`, it: ` · ${time.switches} cambi di app` })}
        {time.longest && time.longest.minutes >= 10 ? tr({ en: ` · longest: ${time.longest.app}, ${time.longest.minutes} min`, it: ` · tratto più lungo: ${time.longest.app}, ${time.longest.minutes} min` }) : ''}
      </p>
    </section>
  );
}

/** One line on the Mac itself: awake since when, sleeps, battery. */
export function MacLine({ mac }) {
  if (!mac) return null;
  const parts = [];
  if (mac.awake && mac.since) parts.push(tr({ en: `awake since ${hhmm(mac.since)}`, it: `sveglio dalle ${hhmm(mac.since)}` }));
  else if (!mac.awake) parts.push(tr({ en: 'asleep', it: 'a riposo' }));
  if (mac.sleeps) parts.push(tr({ en: `${mac.sleeps} ${mac.sleeps === 1 ? 'nap' : 'naps'}`, it: `${mac.sleeps} ${mac.sleeps === 1 ? 'pausa' : 'pause'}` }));
  if (mac.charge != null) parts.push(mac.power === 'battery' ? tr({ en: `on battery, ${mac.charge}%`, it: `a batteria, ${mac.charge}%` }) : tr({ en: `plugged in, ${mac.charge}%`, it: `in carica, ${mac.charge}%` }));
  if (!parts.length) return null;
  return <p className="mac-line"><strong>{tr({ en: 'The Mac', it: 'Il Mac' })}</strong> · {parts.join(' · ')}</p>;
}
