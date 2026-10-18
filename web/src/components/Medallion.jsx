import React from 'react';
import { tr } from '../i18n.js';

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
