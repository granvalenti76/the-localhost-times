/**
 * The day in a strip: the period of an edition as a ribbon, one lane per kind of news (the web,
 * the projects, culture, the mail), filled where something happened, with the subjects and the
 * projects of the edition pinned over it and the Mac's sleep shaded. Computed at the press, drawn
 * on the front page.
 */
const LANE = (e) => {
  if (e.source === 'git' || e.source === 'files' || e.source === 'terminal') return 'home';
  if (e.source === 'books' || e.source === 'podcasts' || e.source === 'notes' || e.source === 'journal') return 'culture';
  if (e.source === 'mail') return 'mail';
  if (e.source === 'safari') return /youtube\.com|youtu\.be|netflix|disneyplus|primevideo|vimeo|spotify/.test(e.meta?.host || '') ? 'culture' : 'world';
  return null;
};
export const LANES = ['world', 'home', 'culture', 'mail'];

/** Runs of busy bins: [[fromShare, toShare], …], shares of the period between 0 and 1. */
function runs(bins) {
  const out = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i <= bins.length; i++) {
    const on = i < bins.length && bins[i] > 0;
    if (on) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0) {
      // a quiet ten minutes doesn't break a run
      if (i < bins.length && gap < 1 && bins[i + 1] > 0) { gap++; continue; }
      out.push([start / bins.length, (i - gap) / bins.length]);
      start = -1;
      gap = 0;
    }
  }
  return out.map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(Math.max(b, a + 1 / bins.length) * 1000) / 1000]);
}

/** Where a piece was busiest: the middle of its sources' times (its first minute says little). */
function busiest(a) {
  const ts = (a.sources || []).map((x) => x.ts).filter(Number.isFinite).sort((x, y) => x - y);
  return ts.length ? ts[Math.floor(ts.length / 2)] : a.first;
}

export function dayStrip(events, articles, from, to) {
  const span = Math.max(1, to - from);
  const n = Math.max(12, Math.min(144, Math.round(span / 600e3))); // ten-minute bins, a day at most
  const bins = Object.fromEntries(LANES.map((l) => [l, Array(n).fill(0)]));
  for (const e of events) {
    const lane = LANE(e);
    if (!lane || e.ts < from || e.ts >= to) continue;
    bins[lane][Math.min(n - 1, Math.floor(((e.ts - from) / span) * n))]++;
  }
  const lanes = Object.fromEntries(LANES.map((l) => [l, runs(bins[l])]));
  // the Mac asleep: from a sleep to the next wake
  const sleep = [];
  let down = null;
  for (const e of events.filter((x) => x.source === 'power').sort((a, b) => a.ts - b.ts)) {
    if (e.kind === 'sleep' && down == null) down = e.ts;
    if (e.kind === 'wake' && down != null) {
      if (e.ts - down > 45 * 60e3) sleep.push([Math.max(0, (down - from) / span), Math.min(1, (e.ts - from) / span)]);
      down = null;
    }
  }
  if (down != null) sleep.push([Math.max(0, (down - from) / span), 1]);
  // the subjects and the projects of the edition, where they first turned up
  const labels = articles
    .filter((a) => a.kind === 'subject' || a.kind === 'cantiere')
    .slice(0, 6)
    .map((a) => ({ at: Math.round(Math.max(0, Math.min(0.97, (busiest(a) - from) / span)) * 1000) / 1000, text: a.topic || a.headline, lane: a.kind === 'cantiere' ? 'home' : 'world', articleId: a.id }))
    .sort((a, b) => a.at - b.at);
  return { from, to, lanes, sleep: sleep.map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000]), labels };
}
