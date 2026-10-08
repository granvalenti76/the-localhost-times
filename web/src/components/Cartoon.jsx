import React from 'react';
import { tr, quote } from '../i18n.js';

/**
 * The cartoon of the hour: an (original) line drawing and a caption.
 * A small library of scenes with the same character, the little man with glasses.
 * The writer picks the scene (or, when it is offline, the typesetting) from the news.
 * The catalogue the model reads is in server/newsroom/scenes.js.
 */
const S = { stroke: 'currentColor', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
const T = { ...S, strokeWidth: 1 };
const F = { fill: 'currentColor', stroke: 'none' };

// ───────── the character ─────────

function Head({ x, y, mood = 'smile' }) {
  const mouth = {
    smile: `M${x - 5} ${y + 8} q5 2.5 10 0`,
    flat: `M${x - 4} ${y + 8.5} h8`,
    o: null,
    sad: `M${x - 5} ${y + 10} q5 -2.5 10 0`,
    grin: `M${x - 6} ${y + 6.5} q6 6 12 0 z`,
  }[mood];
  return (
    <g>
      <circle cx={x} cy={y} r="15" {...S} />
      {mood === 'sleep' ? (
        <path d={`M${x - 9} ${y - 1} q3 2 6 0 M${x + 2} ${y - 1} q3 2 6 0`} {...T} />
      ) : (
        <g>
          <circle cx={x - 6} cy={y - 1} r="3.6" {...T} />
          <circle cx={x + 5} cy={y - 1} r="3.6" {...T} />
          <path d={`M${x - 2.4} ${y - 1} h3.8`} {...T} />
        </g>
      )}
      {mood === 'o' ? <circle cx={x} cy={y + 8.5} r="2.2" {...T} /> : mouth && <path d={mouth} {...T} />}
      <path d={`M${x - 13} ${y - 10} q12 -10 26 0`} {...T} />
    </g>
  );
}

/** Seated at the desk, arms towards the keyboard. */
function Seated({ mood, headphones, arms = 'type' }) {
  return (
    <g>
      <Head x={196} y={74} mood={mood} />
      <path d="M196 89 C 194 104, 200 118, 202 136" {...S} />
      {arms === 'type' && (
        <g>
          <path d="M197 100 C 184 110, 168 118, 150 120" {...S} />
          <path d="M199 104 C 188 116, 172 124, 156 126" {...S} />
        </g>
      )}
      {arms === 'lens' && (
        <g>
          <path d="M197 100 C 184 98, 170 96, 160 98" {...S} />
          <circle cx="146" cy="100" r="12" {...S} />
          <path d="M155 108 L 162 114" {...S} />
          <path d="M199 104 C 190 116, 176 124, 160 126" {...S} />
        </g>
      )}
      <path d="M214 92 L 222 140 M 202 136 L 226 136 M 214 136 L 214 160 M 202 160 L 226 160" {...S} />
      {headphones && (
        <g>
          <path d="M181 74 q0 -22 15 -22 q15 0 15 22" {...S} />
          <rect x="177" y="70" width="6" height="12" rx="2" {...S} />
          <rect x="209" y="70" width="6" height="12" rx="2" {...S} />
        </g>
      )}
    </g>
  );
}

/** Standing, arms in various poses. */
function Standing({ x, mood = 'smile', arms = 'down' }) {
  const A = {
    down: `M${x} 78 L ${x - 14} 104 M${x} 78 L ${x + 14} 104`,
    up: `M${x} 76 L ${x - 18} 46 M${x} 76 L ${x + 18} 46`,
    point: `M${x} 78 L ${x - 30} 66 M${x} 78 L ${x + 12} 104`,
    broom: `M${x} 80 L ${x - 16} 100 M${x} 82 L ${x - 10} 108`,
  }[arms];
  return (
    <g>
      <Head x={x} y={52} mood={mood} />
      <path d={`M${x} 67 L ${x} 112 M${x} 112 L ${x - 12} 150 M${x} 112 L ${x + 12} 150`} {...S} />
      <path d={A} {...S} />
    </g>
  );
}

// ───────── the props ─────────

function Desk({ children, mug = true, laptop = true }) {
  return (
    <g>
      <path d="M20 136 H 186" {...S} />
      <path d="M32 136 V 160 M 174 136 V 160" {...S} />
      {laptop && (
        <g>
          <path d="M78 134 L 150 134 L 156 128 L 84 128 Z" {...S} />
          <path d="M84 128 L 92 86 L 158 86 L 150 128" {...S} />
        </g>
      )}
      {mug && <Mug x={40} />}
      {children}
    </g>
  );
}

function Mug({ x, y = 116, steam = true }) {
  return (
    <g>
      <path d={`M${x} ${y} h16 v18 h-16 z`} {...S} />
      <path d={`M${x + 16} ${y + 5} q7 0 7 6 q0 6 -7 6`} {...S} />
      {steam && <path d={`M${x + 4} ${y - 6} q-3 -5 1 -9 M ${x + 11} ${y - 6} q-3 -5 1 -9`} {...T} />}
    </g>
  );
}

const Floor = () => <path d="M10 160 H 250" {...T} />;

// ───────── the scenes ─────────

export const SCENES = {
  desk: () => (<g><Desk /><Seated /></g>),

  terminal: () => (
    <g>
      <Desk><path d="M104 100 l6 5 l-6 5" {...S} /><path d="M114 111 h12" {...S} /></Desk>
      <Seated mood="flat" />
    </g>
  ),

  mailpile: () => (
    <g>
      <Desk mug={false}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <g key={i} transform={`translate(${28 + (i % 2) * 7 + i * 1.5} ${126 - i * 9}) rotate(${(i % 2 ? -6 : 5) + i})`}>
            <rect x="0" y="0" width="36" height="9" {...T} />
            <path d="M0 0 L18 6 L36 0" {...T} />
          </g>
        ))}
        {[[70, 40, -20], [98, 26, 15], [50, 18, 30]].map(([x, y, r], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
            <rect x="0" y="0" width="26" height="7" {...T} />
            <path d="M0 0 L13 4 L26 0" {...T} />
          </g>
        ))}
      </Desk>
      <Seated mood="o" />
    </g>
  ),

  tabs: () => (
    <g>
      <Desk>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={58 + i * 13} y={58 - Math.abs(2.5 - i) * 7} width="40" height="20" rx="2" {...T}
            fill="var(--card, #fff)" transform={`rotate(${(i - 2.5) * 7} ${78 + i * 13} 70)`} />
        ))}
        <path d="M100 100 h44 M100 107 h36 M100 114 h40" {...T} />
      </Desk>
      <Seated mood="o" />
    </g>
  ),

  question: () => (
    <g>
      <Desk>
        <path d="M150 52 q0 -22 26 -22 q26 0 26 18 q0 16 -24 16 l-10 10 l2 -11 q-20 -3 -20 -11 z" {...T} />
        <path d="M170 40 q4 -6 9 -2 q4 4 -3 8 v4 M176 54 v0.5" {...S} />
        <path d="M100 104 h40" {...T} />
      </Desk>
      <Seated mood="flat" />
    </g>
  ),

  listen: () => (
    <g>
      <Desk><path d="M100 100 q6 -10 12 0 t12 0 t12 0" {...T} /></Desk>
      <Seated headphones />
      <g {...T}>
        <path d="M232 46 v-14 l10 -3 v14" /><circle cx="229" cy="46" r="3" /><circle cx="239" cy="43" r="3" />
      </g>
    </g>
  ),

  read: () => (
    <g>
      <Desk laptop={false}>
        <path d="M92 132 q15 -7 30 0 q15 -7 30 0 v-24 q-15 -7 -30 0 q-15 -7 -30 0 z M122 108 v24" {...S} />
        <path d="M98 114 q10 -4 19 0 M98 120 q10 -4 19 0 M127 114 q10 -4 19 0 M127 120 q10 -4 19 0" {...T} />
      </Desk>
      <Seated arms="type" />
    </g>
  ),

  night: () => (
    <g>
      <rect x="22" y="14" width="64" height="52" {...S} />
      <path d="M54 14 V66 M22 40 H86" {...T} />
      <path d="M70 24 a8 8 0 1 0 6 12 a6 6 0 1 1 -6 -12 z" {...F} />
      <path d="M32 24 v4 M30 26 h4 M44 52 v3 M42.5 53.5 h3" {...T} />
      <circle cx="234" cy="28" r="12" {...T} />
      <path d="M234 28 V20 M234 28 L 228 31" {...T} />
      <Desk><path d="M104 100 l6 5 l-6 5" {...S} /><path d="M114 111 h12" {...S} /></Desk>
      <Seated mood="flat" />
    </g>
  ),

  chart: () => (
    <g>
      <rect x="18" y="12" width="128" height="70" {...S} />
      <path d="M28 70 L 50 58 L 66 64 L 88 40 L 104 48 L 132 22" {...S} />
      <path d="M124 22 h8 v8" {...S} />
      <path d="M28 76 h104" {...T} />
      <Desk mug={false} />
      <Seated mood="grin" />
      <path d="M185 82 L 150 60" {...T} strokeDasharray="3 3" />
    </g>
  ),

  newspaper: () => (
    <g>
      <Desk>
        <path d="M98 96 h48 M98 102 h20 M98 108 h20 M98 114 h20 M124 102 h20 M124 108 h20 M124 114 h20" {...T} />
      </Desk>
      <Seated arms="none" />
      <g transform="rotate(-5 190 108)">
        <rect x="160" y="84" width="62" height="46" {...S} fill="var(--card, #fff)" />
        <path d="M166 92 h50" {...S} />
        <path d="M166 100 h22 M166 105 h22 M166 110 h22 M166 115 h22 M194 100 h22 M194 105 h22 M194 110 h22 M194 115 h22" {...T} />
        <path d="M160 108 h-6 M222 108 h6" {...S} />
      </g>
    </g>
  ),

  talk: () => (
    <g>
      <Desk>
        <path d="M60 30 h64 a8 8 0 0 1 8 8 v16 a8 8 0 0 1 -8 8 h-30 l-10 14 l2 -14 h-26 a8 8 0 0 1 -8 -8 v-16 a8 8 0 0 1 8 -8 z" {...T} />
        <path d="M70 42 h46 M70 50 h34" {...T} />
        <path d="M104 104 h36" {...T} />
      </Desk>
      <path d="M200 26 h44 a6 6 0 0 1 6 6 v12 a6 6 0 0 1 -6 6 h-20 l-8 8 l1 -8 h-17 a6 6 0 0 1 -6 -6 v-12 a6 6 0 0 1 6 -6 z" {...T} />
      <path d="M208 38 h30" {...T} />
      <Seated mood="o" />
    </g>
  ),

  couch: () => (
    <g>
      <Floor />
      <path d="M40 150 V 108 q0 -10 10 -10 h150 q10 0 10 10 V 150" {...S} />
      <path d="M40 124 h170 M30 118 q-6 0 -6 8 v24 h16 M220 118 q6 0 6 8 v24 h-16" {...S} />
      <Head x={128} y={66} mood="smile" />
      <path d="M128 81 L 126 120 M126 120 L 160 122 L 164 150" {...S} />
      <path d="M126 92 L 146 104 M126 96 L 140 108" {...S} />
      <path d="M140 100 L 172 96 L 176 112 L 144 116 Z" {...T} />
      <path d="M232 96 h24 M244 96 v54" {...S} />
      <Mug x={234} y={78} steam={false} />
    </g>
  ),

  scroll: () => (
    <g>
      <Floor />
      <Desk mug={false} />
      <path d="M100 90 h44 v30 c 0 10, -40 4, -40 18 c 0 12, 46 2, 46 14 c 0 6, -30 6, -60 8" {...T} />
      <path d="M108 96 h28 M108 102 h22 M108 108 h26" {...T} />
      <Seated mood="o" />
    </g>
  ),

  celebrate: () => (
    <g>
      <Floor />
      <Desk mug={false} />
      <Standing x={212} mood="grin" arms="up" />
      {[[182, 24, 20], [236, 16, -30], [196, 40, 60], [244, 44, 10], [170, 54, -15], [222, 30, 45]].map(([x, y, r], i) => (
        <rect key={i} x={x} y={y} width="6" height="3" transform={`rotate(${r} ${x} ${y})`} {...F} />
      ))}
    </g>
  ),

  bug: () => (
    <g>
      <Desk>
        <ellipse cx="122" cy="104" rx="7" ry="5" {...S} />
        <path d="M115 100 l-5 -4 M115 104 h-6 M115 108 l-5 4 M129 100 l5 -4 M129 104 h6 M129 108 l5 4 M122 99 v-4" {...T} />
      </Desk>
      <Seated mood="o" arms="lens" />
    </g>
  ),

  sleep: () => (
    <g>
      <Desk>
        <path d="M104 100 l6 5 l-6 5" {...S} />
      </Desk>
      <Head x={176} y={118} mood="sleep" />
      <path d="M190 112 C 200 112, 204 124, 206 136" {...S} />
      <path d="M186 128 L 160 132" {...S} />
      <path d="M214 92 L 222 140 M 202 136 L 226 136 M 214 136 L 214 160 M 202 160 L 226 160" {...S} />
      <text x="190" y="84" fontSize="14" fontFamily="var(--f-display, serif)" fontStyle="italic" fill="currentColor">z</text>
      <text x="202" y="70" fontSize="18" fontFamily="var(--f-display, serif)" fontStyle="italic" fill="currentColor">z</text>
      <text x="218" y="52" fontSize="22" fontFamily="var(--f-display, serif)" fontStyle="italic" fill="currentColor">Z</text>
    </g>
  ),

  cat: () => (
    <g>
      <Desk mug={false}>
        <path d="M96 128 q-2 -26 18 -28 q20 2 18 28 z" {...S} fill="var(--card, #fff)" />
        <path d="M104 104 l-2 -12 l8 7 M124 104 l2 -12 l-8 7" {...S} />
        <path d="M108 110 h1 M119 110 h1" {...S} />
        <path d="M132 124 q20 4 14 -16" {...S} />
      </Desk>
      <Seated mood="flat" />
    </g>
  ),

  tidy: () => (
    <g>
      <Floor />
      <path d="M30 118 l6 42 h26 l6 -42 z M26 118 h46" {...S} />
      {[[86, 140, -10], [104, 146, 15], [96, 128, 30], [120, 142, -25]].map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          <path d={`M${x} ${y} h10 l4 4 v10 h-14 z M${x + 10} ${y} v4 h4`} {...T} />
        </g>
      ))}
      <Standing x={196} mood="smile" arms="broom" />
      <path d="M182 92 L 150 156 M140 152 l20 8 M144 146 l20 8" {...S} />
    </g>
  ),
};

// compatibility with editions printed earlier
const ALIASES = { mail: 'mailpile', browse: 'tabs' };

export default function Cartoon({ cartoon }) {
  if (!cartoon?.caption) return null;
  const Scene = SCENES[ALIASES[cartoon.scene] || cartoon.scene] || SCENES.desk;
  return (
    <figure className="cartoon">
      <svg viewBox="0 0 260 170" role="img" aria-label={tr({ en: 'Line-drawn cartoon', it: 'Vignetta disegnata a tratto' })}>
        <Scene />
      </svg>
      <figcaption>{quote(cartoon.caption)}</figcaption>
    </figure>
  );
}
