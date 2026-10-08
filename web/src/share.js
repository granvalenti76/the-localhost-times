/**
 * The front page as an image (1200×630 PNG), drawn on a canvas with the paper's own fonts.
 * The cartoon is taken from the page itself, already drawn as SVG.
 */
import { tr, locale, quote } from './i18n.js';
import { hhmm, edHour } from './lib.js';

const W = 1200;
const H = 630;
const INK = '#121212';
const PAPER = '#fbfaf6';
const ACCENT = '#a3171f';
const MUTED = '#6b6862';
const F = {
  mast: "'UnifrakturMaguntia', serif",
  display: "'Fraunces Variable', 'Fraunces', Georgia, serif",
  serif: "'Libre Caslon Text', Georgia, serif",
  sans: "'Libre Franklin Variable', 'Libre Franklin', Arial, sans-serif",
};

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '));
    cut[maxLines - 1] = `${last}…`;
    return cut;
  }
  return lines;
}

/** Fit a headline: the biggest size (from `sizes`) that stays within `maxLines`. */
function fit(ctx, text, maxWidth, maxLines, sizes, font) {
  for (const s of sizes) {
    ctx.font = font(s);
    const lines = wrap(ctx, text, maxWidth, 99);
    if (lines.length <= maxLines) return { size: s, lines };
  }
  const s = sizes.at(-1);
  ctx.font = font(s);
  return { size: s, lines: wrap(ctx, text, maxWidth, maxLines) };
}

function svgImage(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '520');
  clone.setAttribute('height', '340');
  const src = new XMLSerializer().serializeToString(clone)
    .replace(/currentColor/g, INK)
    .replace(/var\(--card,\s*#fff\)/g, '#fff')
    .replace(/var\(--f-display,\s*serif\)/g, 'Georgia, serif');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
  });
}

/**
 * @param {object} p  { kind: 'edition'|'evening', when, label, number, kicker, headline, dek, cartoon, cartoonSvg }
 */
export async function drawShareImage(p) {
  await Promise.all([
    document.fonts.load(`64px ${F.mast}`),
    document.fonts.load(`700 48px ${F.display}`),
    document.fonts.load(`italic 22px ${F.serif}`),
    document.fonts.load(`600 14px ${F.sans}`),
  ]).catch(() => {});

  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;

  // nameplate
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `66px ${F.mast}`;
  ctx.fillText('The Localhost Times', W / 2, 92);
  ctx.font = `italic 15px ${F.display}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(quote('All the news that never left the machine'), W / 2, 118);

  // dateline between rules
  ctx.fillStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(48, 136); ctx.lineTo(W - 48, 136); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(48, 166); ctx.lineTo(W - 48, 166); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(48, 169); ctx.lineTo(W - 48, 169); ctx.stroke();
  ctx.font = `600 12.5px ${F.sans}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(p.when);
  ctx.fillText(`${date.charAt(0).toUpperCase()}${date.slice(1)}`.toUpperCase(), 48, 151);
  ctx.textAlign = 'center';
  ctx.fillText(p.label.toUpperCase(), W / 2, 151);
  ctx.textAlign = 'right';
  ctx.fillText(p.number ? `VOL. I · NO. ${p.number}` : 'LOCALHOST', W - 48, 151);

  // the story
  const hasArt = !!p.cartoonSvg;
  const colW = hasArt ? 640 : W - 96;
  let y = 214;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (p.kicker) {
    ctx.fillStyle = ACCENT;
    ctx.font = `700 13px ${F.sans}`;
    ctx.fillText(p.kicker.toUpperCase(), 48, y);
    y += 16;
  }
  ctx.fillStyle = INK;
  const hl = fit(ctx, p.headline, colW, 4, [56, 50, 44, 38, 34], (s) => `700 ${s}px ${F.display}`);
  for (const l of hl.lines) {
    y += hl.size * 1.08;
    ctx.fillText(l, 48, y);
  }
  if (p.dek) {
    y += 22;
    ctx.font = `italic 22px ${F.serif}`;
    ctx.fillStyle = '#333';
    const room = Math.max(1, Math.floor((H - 70 - y) / 31));
    for (const l of wrap(ctx, p.dek, colW, Math.min(3, room))) {
      y += 31;
      ctx.fillText(l, 48, y);
    }
  }

  // the cartoon
  if (hasArt) {
    const img = await svgImage(p.cartoonSvg);
    const x0 = 730;
    const boxW = W - 48 - x0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x0, 196, boxW, 340);
    ctx.strokeStyle = '#cfcbc2';
    ctx.strokeRect(x0 + 0.5, 196.5, boxW - 1, 339);
    if (img) ctx.drawImage(img, x0 + 18, 206, boxW - 36, (boxW - 36) * (170 / 260));
    if (p.cartoon) {
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.font = `italic 17px ${F.display}`;
      const lines = wrap(ctx, quote(p.cartoon), boxW - 40, 2);
      lines.forEach((l, i) => ctx.fillText(l, x0 + boxW / 2, 490 + i * 22));
    }
  }

  // footer
  ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(48, H - 44); ctx.lineTo(W - 48, H - 44); ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = `500 12px ${F.sans}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tr({ en: 'A newspaper written from what my Mac did, printed on 127.0.0.1.', it: 'Il giornale di ciò che ha fatto il mio Mac, stampato su 127.0.0.1.' }), 48, H - 24);

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

/** The share-image description of an hourly edition or of the evening edition. */
export function shareSpec({ edition, evening }) {
  const svg = document.querySelector('.cartoon svg');
  if (evening) {
    return {
      when: evening.start,
      label: tr({ en: 'Evening edition', it: 'Edizione della sera' }),
      kicker: tr({ en: 'Editorial', it: 'L\'editoriale' }),
      headline: evening.editorial.headline,
      dek: evening.editorial.oneliner,
      cartoon: evening.cartoon?.caption,
      cartoonSvg: evening.cartoon?.caption ? svg : null,
      file: `localhost-times-${evening.day}-evening.png`,
    };
  }
  const lead = edition.articles[0];
  return {
    when: edition.start,
    label: tr({ en: `The ${hhmm(edHour(edition))} edition`, it: `Edizione delle ${hhmm(edHour(edition))}` }),
    number: edition.number,
    kicker: lead?.section,
    headline: lead?.headline || edition.summary,
    dek: lead?.dek || edition.summary,
    cartoon: edition.cartoon?.caption,
    cartoonSvg: edition.cartoon?.caption ? svg : null,
    file: `localhost-times-${edition.id.replace('T', '-')}.png`,
  };
}
