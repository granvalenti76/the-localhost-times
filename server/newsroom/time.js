/**
 * Time and the Mac: what the front page shows from the app sampler and the power log.
 *   computeTime  minutes per app in an edition's window, switches, the longest stretch, time away
 *   computeMac   awake since when, sleeps, battery
 * Both are plain numbers: the writer never has to compute them.
 */

/** Sources that measure rather than report: they don't count as the hour's "signals". */
export const AMBIENT = new Set(['power', 'apps']);
export const isAmbient = (e) => AMBIENT.has(e.source);

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function computeTime(events, start, end) {
  const stretches = events
    .filter((e) => e.source === 'apps')
    .map((e) => ({ app: e.meta?.app, away: e.kind === 'away', from: e.ts, to: e.meta?.end ?? e.ts + (e.meta?.seconds || 0) * 1000 }))
    .filter((s) => s.to > s.from)
    .sort((a, b) => a.from - b.from);
  if (!stretches.length) return null;
  const per = new Map();
  let away = 0;
  let switches = 0;
  let longest = null;
  let prev = null;
  for (const s of stretches) {
    const ms = overlap(s.from, s.to, start, end);
    if (!ms) continue;
    if (s.away) { away += ms; prev = null; continue; }
    per.set(s.app, (per.get(s.app) || 0) + ms);
    if (prev && prev !== s.app) switches++;
    prev = s.app;
    if (!longest || ms > longest.ms) longest = { app: s.app, ms, from: Math.max(s.from, start), to: Math.min(s.to, end) };
  }
  const min = (ms) => Math.round(ms / 60e3);
  const apps = [...per.entries()].map(([name, ms]) => ({ name, minutes: min(ms) })).filter((a) => a.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const active = apps.reduce((t, a) => t + a.minutes, 0);
  if (!active && !away) return null;
  return {
    apps: apps.slice(0, 8),
    others: apps.slice(8).reduce((t, a) => t + a.minutes, 0),
    active,
    away: min(away),
    switches,
    longest: longest ? { app: longest.app, minutes: min(longest.ms), from: longest.from, to: longest.to } : null,
  };
}

/** The Mac's state over an edition: awake since, how many times it slept, the battery. */
export function computeMac(store, start, end) {
  const rows = store.db.prepare(`SELECT kind, ts, meta FROM events WHERE source = 'power' AND ts >= ? AND ts < ? ORDER BY ts`)
    .all(start - 24 * 3600e3, end)
    .map((r) => ({ kind: r.kind, ts: r.ts, meta: JSON.parse(r.meta || '{}') }));
  if (!rows.length) return null;
  const inWindow = rows.filter((r) => r.ts >= start);
  const lastUp = rows.filter((r) => r.kind === 'wake' || r.kind === 'boot').at(-1);
  const lastDown = rows.filter((r) => r.kind === 'sleep' || r.kind === 'shutdown').at(-1);
  const withCharge = rows.filter((r) => r.meta.charge != null).at(-1);
  const awake = lastUp && (!lastDown || lastUp.ts > lastDown.ts);
  return {
    awake,
    since: awake ? lastUp.ts : null,
    wakes: inWindow.filter((r) => r.kind === 'wake').length,
    sleeps: inWindow.filter((r) => r.kind === 'sleep').length,
    lid: inWindow.filter((r) => r.kind === 'sleep' && r.meta.reason === 'lid').length,
    power: withCharge?.meta.power || null,
    charge: withCharge?.meta.charge ?? null,
    lowest: ((x) => (x > 100 ? null : x))(inWindow.reduce((m, r) => (r.meta.charge != null && r.meta.power === 'battery' ? Math.min(m, r.meta.charge) : m), 101)),
  };
}
