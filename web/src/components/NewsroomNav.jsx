import React from 'react';
import { href } from '../lib.js';
import { tr } from '../i18n.js';

const T = tr({
  en: { rooms: 'Newsroom rooms', desk: 'The desk', writeRoom: 'Writing room', proofRoom: 'Proof round', lineRoom: 'Publishing House' },
  it: { rooms: 'Stanze della redazione', desk: 'La scrivania', writeRoom: 'Sala scrittura', proofRoom: 'Giro di bozze', lineRoom: 'Casa Editrice' },
});

/** The newsroom's rooms, as tabs under a room's title. */
export default function NewsroomNav({ on }) {
  return (
    <nav className="nr-nav" aria-label={T.rooms}>
      <a href={href.desk()} className={on === 'desk' ? 'on' : ''}>{T.desk}</a>
      <a href={href.write()}>{T.writeRoom}</a>
      <a href={href.proofs()}>{T.proofRoom}</a>
      <a href={href.house()} className={on === 'line' ? 'on' : ''}>{T.lineRoom}</a>
    </nav>
  );
}
