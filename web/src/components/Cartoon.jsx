import React from 'react';

/**
 * La vignetta dell'ora: un disegno a tratto (originale) e una battuta.
 * Il personaggio è sempre lo stesso, alla sua scrivania; cambia il dettaglio
 * secondo la notizia d'apertura.
 */
const S = { stroke: 'currentColor', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
const T = { ...S, strokeWidth: 1 };

function Person({ headphones }) {
  return (
    <g>
      {/* testa, occhiali, bocca */}
      <circle cx="196" cy="74" r="15" {...S} />
      <circle cx="190" cy="73" r="3.6" {...T} />
      <circle cx="201" cy="73" r="3.6" {...T} />
      <path d="M193.6 73 h3.8" {...T} />
      <path d="M190 83 q5 2.5 10 0" {...T} />
      <path d="M183 64 q12 -10 26 0" {...T} />
      {/* corpo e braccia verso la tastiera */}
      <path d="M196 89 C 194 104, 200 118, 202 136" {...S} />
      <path d="M197 100 C 184 110, 168 118, 150 120" {...S} />
      <path d="M199 104 C 188 116, 172 124, 156 126" {...S} />
      {/* sedia */}
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

function Desk({ children, mug = true }) {
  return (
    <g>
      <path d="M20 136 H 186" {...S} />
      <path d="M32 136 V 160 M 174 136 V 160" {...S} />
      {/* portatile */}
      <path d="M78 134 L 150 134 L 156 128 L 84 128 Z" {...S} />
      <path d="M84 128 L 92 86 L 158 86 L 150 128" {...S} />
      {mug && (
        <g>
          <path d="M40 116 h16 v18 h-16 z" {...S} />
          <path d="M56 121 q7 0 7 6 q0 6 -7 6" {...S} />
          <path d="M44 110 q-3 -5 1 -9 M 51 110 q-3 -5 1 -9" {...T} />
        </g>
      )}
      {children}
    </g>
  );
}

const SCENES = {
  desk: () => <Desk />,
  terminal: () => (
    <Desk>
      <path d="M104 100 l6 5 l-6 5" {...S} />
      <path d="M114 111 h12" {...S} />
    </Desk>
  ),
  mail: () => (
    <Desk mug={false}>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${30 + (i % 2) * 6} ${126 - i * 9}) rotate(${i % 2 ? -4 : 3})`}>
          <rect x="0" y="0" width="36" height="9" {...T} />
          <path d="M0 0 L18 6 L36 0" {...T} />
        </g>
      ))}
      <path d="M106 106 h28 M106 112 h20" {...T} />
    </Desk>
  ),
  browse: () => (
    <Desk>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={96 + i * 7} y={60 - i * 8} width="46" height="22" rx="2" {...T} fill="var(--paper)" />
      ))}
      <path d="M100 100 h44 M100 107 h36 M100 114 h40" {...T} />
    </Desk>
  ),
  question: () => (
    <Desk>
      <path d="M150 52 q0 -22 26 -22 q26 0 26 18 q0 16 -24 16 l-10 10 l2 -11 q-20 -3 -20 -11 z" {...T} />
      <path d="M170 40 q4 -6 9 -2 q4 4 -3 8 v4 M176 54 v0.5" {...S} />
      <path d="M100 104 h40" {...T} />
    </Desk>
  ),
  listen: () => (
    <Desk>
      <path d="M100 100 q6 -10 12 0 t12 0 t12 0" {...T} />
      <path d="M232 60 q6 6 0 12 M 238 54 q12 12 0 24" {...T} />
    </Desk>
  ),
  read: () => (
    <Desk>
      <path d="M58 134 l18 -10 l18 10 M76 124 v10" {...T} />
      <path d="M100 100 h40 M100 106 h34" {...T} />
    </Desk>
  ),
};

export default function Cartoon({ cartoon }) {
  if (!cartoon?.caption) return null;
  const Scene = SCENES[cartoon.scene] || SCENES.desk;
  return (
    <figure className="cartoon">
      <svg viewBox="0 0 260 170" role="img" aria-label="Vignetta: una persona al computer, alla sua scrivania">
        <Scene />
        <Person headphones={cartoon.scene === 'listen'} />
      </svg>
      <figcaption>«{cartoon.caption}»</figcaption>
    </figure>
  );
}
