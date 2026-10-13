/**
 * The writing room: who is typing right now, and what. Kept in memory only (a piece being written
 * is gone after a restart anyway). The reporter's answer arrives as JSON being typed, so it is read
 * leniently: whatever kicker, headline, summary and paragraphs are already there.
 */
import { figures } from './factcheck.js';
import { lint } from './lint.js';

const desks = new Map(); // story id → { sid, editionId, writer, step, raw, since, at, facts, size }
const KEEP = 90e3;       // a finished piece stays in the room this long

export function liveStart(sid, info) {
  desks.set(sid, { sid, raw: '', step: 'reporter', since: Date.now(), at: Date.now(), done: false, ...info });
}

export function liveText(sid, raw) {
  const d = desks.get(sid);
  if (d) { d.raw = raw; d.at = Date.now(); }
}

export function liveStep(sid, step) {
  const d = desks.get(sid);
  if (d) { d.step = step; d.at = Date.now(); }
}

export function liveEnd(sid) {
  const d = desks.get(sid);
  if (d) { d.done = true; d.step = null; d.at = Date.now(); }
}

/** Reads a JSON string starting at `i` (just after the opening quote): the text so far, and whether it closed. */
function readString(raw, i) {
  let out = '';
  for (; i < raw.length; i++) {
    const c = raw[i];
    if (c === '\\') {
      const n = raw[i + 1];
      if (n === undefined) break;
      if (n === 'n') out += '\n';
      else if (n === 'u') { const h = raw.slice(i + 2, i + 6); if (h.length < 4) break; out += String.fromCharCode(parseInt(h, 16)); i += 4; } else out += n;
      i++;
    } else if (c === '"') return { text: out, end: i + 1, closed: true };
    else out += c;
  }
  return { text: out, end: raw.length, closed: false };
}

function field(raw, key) {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw);
  return m ? readString(raw, m.index + m[0].length).text : '';
}

/** A piece as far as it has been typed. */
export function partialArticle(raw) {
  const t = String(raw || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
  const body = [];
  const m = /"body"\s*:\s*\[/.exec(t);
  if (m) {
    let i = m.index + m[0].length;
    for (;;) {
      const q = t.indexOf('"', i);
      if (q < 0) break;
      const between = t.slice(i, q);
      if (/\]/.test(between)) break;
      const s = readString(t, q + 1);
      body.push(s.text);
      if (!s.closed) break;
      i = s.end;
    }
  }
  return { kicker: field(t, 'kicker'), headline: field(t, 'headline'), dek: field(t, 'dek'), body };
}

const words = (a) => [a.dek, ...a.body].join(' ').split(/\s+/).filter(Boolean).length;

/**
 * The facts on the reporter's desk, each marked as used once the piece quotes its time or one of
 * its quoted titles.
 */
function factsUsed(facts, text) {
  const plain = text.toLowerCase();
  const nums = new Set(figures(text));
  return (facts || []).map((f) => {
    const quoted = [...f.matchAll(/[«“]([^»”]{4,60})[»”]/g)].map((x) => x[1].toLowerCase());
    const time = /\b([01]?\d|2[0-3]):[0-5]\d\b/.exec(f)?.[0];
    const used = quoted.some((q) => plain.includes(q)) || (time && nums.has(time.padStart(5, '0')));
    return { text: f, used: !!used };
  });
}

/** The room as the page shows it: one desk per piece being written (or just finished). */
export function liveView(now = Date.now()) {
  const out = [];
  for (const [sid, d] of desks) {
    if (d.done && now - d.at > KEEP) { desks.delete(sid); continue; }
    const a = partialArticle(d.raw);
    const text = [a.headline, a.dek, ...a.body].join(' ');
    const l = text.trim() ? lint(a.body) : { issues: [] };
    out.push({
      sid,
      editionId: d.editionId,
      writer: d.writer,
      topic: d.topic,
      section: d.section,
      step: d.step,
      done: d.done,
      since: d.since,
      at: d.at,
      article: a,
      words: words(a),
      target: d.size ? { min: d.size.min, max: d.size.max } : null,
      facts: factsUsed(d.facts, text),
      times: (text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || []).length,
      inflated: l.issues.find((x) => x.id === 'inflated')?.n || 0,
      unverified: d.known ? figures(text).filter((f) => !d.known.has(f)).length : 0,
    });
  }
  return out.sort((a, b) => (a.done - b.done) || b.at - a.at);
}

/** What composeText needs to report to the room. */
export function liveHooks(sid) {
  return { onText: (raw) => liveText(sid, raw), progress: (step) => liveStep(sid, step) };
}

/** The facts as a list of lines, and the figures they contain (for the live check). */
export function factLines(sheet) {
  const lines = String(sheet || '').split('\n').map((x) => x.replace(/^-\s*/, '').trim()).filter((x) => x && !/^(Section|Sezione|Time span|Intervallo):/.test(x));
  return { lines: lines.slice(0, 14), known: new Set(figures(sheet)) };
}
