import React from 'react';

/*
 * The paper's engravings: line drawings made for each piece, hatched like an old plate. No
 * photographs needed: the motif follows the kind of story (a lens over a web of nodes for a
 * subject, scaffolding for a project, an open book, letters, the press), and the article's id
 * moves its parts, so no two plates are the same. Drawn in the ink colour, on the paper's.
 */

/** A small seeded random generator: the same id, the same plate. */
function seeded(id) {
  let h = 2166136261;
  for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

const MOTIF = {
  subject: 'lens', searches: 'lens', site: 'lens', roundup: 'lens',
  cantiere: 'scaffold', project: 'scaffold', commits: 'scaffold', session: 'scaffold', folder: 'scaffold', folders: 'scaffold', downloads: 'scaffold',
  book: 'book', episode: 'book', note: 'book', entry: 'book', todo: 'book',
  thread: 'letters', webmail: 'letters', inbox: 'letters',
};
export const motifOf = (kind) => MOTIF[kind] || 'press';
export const MOTIFS = ['lens', 'scaffold', 'book', 'letters', 'press'];

const TITLE = {
  en: { lens: 'a lens over a web of nodes', scaffold: 'scaffolding on a building site', book: 'an open book', letters: 'letters on a desk', press: 'the rollers of a press' },
  it: { lens: 'una lente sopra un intreccio di nodi', scaffold: 'ponteggi in un cantiere', book: 'un libro aperto', letters: 'lettere sullo scrittoio', press: 'i rulli di una rotativa' },
};

function Lens({ r, W, H, fa, fb }) {
  const nodes = Array.from({ length: 9 }, () => [40 + r() * (W - 80), 30 + r() * (H - 60)]);
  const cx = W * (0.35 + r() * 0.3);
  const cy = H * 0.5;
  const R = H * 0.34;
  return (
    <>
      {[0, 1, 2].map((k) => {
        const y0 = H * (0.25 + k * 0.25);
        return <path key={k} d={`M0 ${y0} C ${W * 0.2} ${y0 - 60 + r() * 120}, ${W * 0.45} ${y0 + 60 - r() * 120}, ${W * 0.6} ${y0} S ${W * 0.9} ${y0 - 40 + r() * 80}, ${W} ${y0}`} fill="none" stroke="currentColor" strokeWidth="1.3" />;
      })}
      {nodes.slice(1).map(([x, y], i) => <line key={i} x1={nodes[i][0]} y1={nodes[i][1]} x2={x} y2={y} stroke="currentColor" strokeWidth="1" />)}
      {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={5 + r() * 6} fill="var(--engr-bg)" stroke="currentColor" strokeWidth="1.5" />)}
      <circle cx={cx} cy={cy} r={R} fill={fb} opacity="0.4" />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="currentColor" strokeWidth="6" />
      <circle cx={cx} cy={cy} r={R - 8} fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1={cx + R * 0.7} y1={cy + R * 0.7} x2={cx + R * 1.45} y2={cy + R * 1.45} stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
    </>
  );
}

function Scaffold({ r, W, H, fa, fb }) {
  const base = H - 24;
  const blocks = Array.from({ length: 4 }, (_, i) => ({ x: 60 + i * (W - 160) / 4 + r() * 20, w: 70 + r() * 60, h: 60 + r() * (H - 120) }));
  const crane = W * (0.6 + r() * 0.25);
  return (
    <>
      <line x1="0" y1={base} x2={W} y2={base} stroke="currentColor" strokeWidth="2" />
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={base - b.h} width={b.w} height={b.h} fill={i % 2 ? fa : fb} stroke="currentColor" strokeWidth="1.5" />
          {Array.from({ length: Math.floor(b.h / 22) }, (_, k) => <line key={k} x1={b.x - 8} x2={b.x + b.w + 8} y1={base - 22 * (k + 1)} y2={base - 22 * (k + 1)} stroke="currentColor" strokeWidth="1" />)}
          <line x1={b.x - 8} x2={b.x - 8} y1={base} y2={base - b.h - 6} stroke="currentColor" strokeWidth="1" />
          <line x1={b.x + b.w + 8} x2={b.x + b.w + 8} y1={base} y2={base - b.h - 6} stroke="currentColor" strokeWidth="1" />
        </g>
      ))}
      <line x1={crane} y1={base} x2={crane} y2={20} stroke="currentColor" strokeWidth="3" />
      <line x1={crane - W * 0.32} y1={30} x2={crane + 60} y2={30} stroke="currentColor" strokeWidth="3" />
      {Array.from({ length: 9 }, (_, k) => <line key={k} x1={crane - W * 0.32 + k * (W * 0.32 + 60) / 9} y1={30} x2={crane - W * 0.32 + (k + 0.5) * (W * 0.32 + 60) / 9} y2={42} stroke="currentColor" strokeWidth="1" />)}
      <line x1={crane - W * 0.32} y1={42} x2={crane + 60} y2={42} stroke="currentColor" strokeWidth="1" />
      <line x1={crane - W * 0.22} y1={42} x2={crane - W * 0.22} y2={110 + r() * 60} stroke="currentColor" strokeWidth="1" />
      <rect x={crane - W * 0.22 - 14} y={110 + r() * 60} width="28" height="18" fill="currentColor" />
    </>
  );
}

function Book({ r, W, H, fa, fb }) {
  const cx = W / 2;
  const top = 34;
  const bottom = H - 30;
  const w = Math.min(W * 0.36, 280);
  const line = (x0, x1, y, k) => <line key={k} x1={x0} x2={x1 - r() * 30} y1={y} y2={y} stroke="currentColor" strokeWidth="1" />;
  return (
    <>
      <path d={`M${cx} ${top + 10} C ${cx - w * 0.4} ${top - 6}, ${cx - w * 0.8} ${top}, ${cx - w} ${top + 8} L ${cx - w} ${bottom} C ${cx - w * 0.8} ${bottom - 8}, ${cx - w * 0.4} ${bottom - 12}, ${cx} ${bottom} Z`} fill="var(--engr-bg)" stroke="currentColor" strokeWidth="1.6" />
      <path d={`M${cx} ${top + 10} C ${cx + w * 0.4} ${top - 6}, ${cx + w * 0.8} ${top}, ${cx + w} ${top + 8} L ${cx + w} ${bottom} C ${cx + w * 0.8} ${bottom - 8}, ${cx + w * 0.4} ${bottom - 12}, ${cx} ${bottom} Z`} fill="var(--engr-bg)" stroke="currentColor" strokeWidth="1.6" />
      {Array.from({ length: 11 }, (_, k) => line(cx - w + 24, cx - 18, top + 34 + k * ((bottom - top - 60) / 11), `l${k}`))}
      {Array.from({ length: 11 }, (_, k) => line(cx + 18, cx + w - 24, top + 34 + k * ((bottom - top - 60) / 11), `r${k}`))}
      <path d={`M${cx - w} ${bottom} L ${cx - w - 14} ${bottom + 10} L ${cx + w + 14} ${bottom + 10} L ${cx + w} ${bottom}`} fill={fa} stroke="currentColor" strokeWidth="1.2" />
      <path d={`M${cx + w * 0.5} ${top - 4} L ${cx + w * 0.5} ${top + 70} L ${cx + w * 0.5 + 9} ${top + 60} L ${cx + w * 0.5 + 18} ${top + 70} L ${cx + w * 0.5 + 18} ${top - 4}`} fill="currentColor" />
    </>
  );
}

function Letters({ r, W, H, fa, fb }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => {
        const w = 170 + r() * 60;
        const h = w * 0.6;
        const x = 40 + i * (W - 260) / 4 + r() * 20;
        const y = 30 + r() * (H - h - 50);
        const a = -12 + r() * 24;
        return (
          <g key={i} transform={`rotate(${a} ${x + w / 2} ${y + h / 2})`}>
            <rect x={x} y={y} width={w} height={h} fill={i % 2 ? fa : 'var(--engr-bg)'} stroke="currentColor" strokeWidth="1.5" />
            <path d={`M${x} ${y} L ${x + w / 2} ${y + h * 0.55} L ${x + w} ${y}`} fill="none" stroke="currentColor" strokeWidth="1.3" />
            <rect x={x + w - 34} y={y + 8} width="24" height="28" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          </g>
        );
      })}
    </>
  );
}

function Press({ r, W, H, fa, fb }) {
  return (
    <>
      {Array.from({ length: 3 }, (_, i) => {
        const cx = W * (0.22 + i * 0.28);
        const R = H * (0.22 + r() * 0.08);
        return (
          <g key={i}>
            <circle cx={cx} cy={H * 0.48} r={R} fill={fb} stroke="currentColor" strokeWidth="2" />
            <circle cx={cx} cy={H * 0.48} r={R * 0.25} fill="var(--engr-bg)" stroke="currentColor" strokeWidth="1.5" />
          </g>
        );
      })}
      <path d={`M0 ${H * 0.82} C ${W * 0.3} ${H * 0.7}, ${W * 0.6} ${H * 0.95}, ${W} ${H * 0.78}`} fill="none" stroke="currentColor" strokeWidth="2" />
      {Array.from({ length: 14 }, (_, k) => <line key={k} x1={k * W / 14} y1={H * 0.86} x2={k * W / 14 + 20} y2={H * 0.86} stroke="currentColor" strokeWidth="1" />)}
    </>
  );
}

const DRAW = { lens: Lens, scaffold: Scaffold, book: Book, letters: Letters, press: Press };

/** The plate of an article. `size` lg (the lead), md, sm. */
export default function Engraving({ id, kind, motif: chosen = null, size = 'lg', caption = null, lang = 'en' }) {
  const motif = chosen || motifOf(kind);
  const r = seeded(id);
  const [W, H] = size === 'lg' ? [760, 300] : [360, 150];
  const Draw = DRAW[motif];
  const pid = `${String(id).replace(/[^\w-]/g, '')}-${size}`;
  return (
    <figure className={`engraving engraving-${size}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={(TITLE[lang] || TITLE.en)[motif]}>
        <defs>
          <pattern id={`ha-${pid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" /></pattern>
          <pattern id={`hb-${pid}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="0.8" /></pattern>
          <pattern id={`dt-${pid}`} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.2" fill="currentColor" /></pattern>
        </defs>
        <rect width={W} height={H} fill={`url(#dt-${pid})`} opacity="0.14" />
        <Draw r={r} W={W} H={H} fa={`url(#ha-${pid})`} fb={`url(#hb-${pid})`} />
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
