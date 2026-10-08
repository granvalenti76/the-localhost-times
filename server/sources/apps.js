/**
 * Time: which app is in front, sampled every minute while the paper runs (`lsappinfo`, and the
 * keyboard/trackpad idle time from `ioreg`; no permission needed). Consecutive samples of the
 * same app become one stretch ("Xcode, 10:02–10:47"); five idle minutes or a locked screen
 * become "away". Only app names are recorded: never window titles or what is on screen.
 *
 * The sampler lives in the server process; the collector picks up the finished stretches.
 * Stretches are cut on the hour, so every edition gets exactly its own time.
 */
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { tr } from '../i18n.js';

const LSAPPINFO = '/usr/bin/lsappinfo';
const IOREG = '/usr/sbin/ioreg';
const HOUR = 3600e3;
const AWAY_AFTER = 5 * 60; // seconds without keyboard or trackpad
const NOT_APPS = /^(loginwindow|ScreenSaverEngine|UserNotificationCenter|Dock)$/i;

// one shell, two tiny commands: the app in front, and the seconds since the last input
const PROBE = `${LSAPPINFO} info -only name "$(${LSAPPINFO} front)"; ${IOREG} -c IOHIDSystem -d 4 | /usr/bin/awk '/HIDIdleTime/ {print "IDLE=" int($NF/1000000000); exit}'`;

const hourStart = (ms) => { const d = new Date(ms); d.setMinutes(0, 0, 0); return d.getTime(); };

/** One sample of the probe's output → { app, idle }. Exported for the tests. */
export function parseProbe(out) {
  const app = (/"(?:LSDisplayName|name)"="([^"]*)"/.exec(out) || [])[1] || null;
  const idle = Number((/IDLE=(\d+)/.exec(out) || [])[1]);
  return { app, idle: Number.isFinite(idle) ? idle : 0 };
}

/**
 * The stretches: fed one sample at a time, closes a stretch when the app changes, when the owner
 * goes away, on the hour, or after a gap (the Mac was asleep). Pure: exported for the tests.
 */
export function createTimeline({ interval = 60e3, exclude = [] } = {}) {
  let open = null; // { app, start, last, away }
  const done = [];
  const skip = new Set(exclude.map((x) => String(x).toLowerCase()));
  const close = (end) => {
    if (!open) return;
    const seconds = Math.round((end - open.start) / 1000);
    if (seconds >= 20) done.push({ ...open, end, seconds });
    open = null;
  };
  return {
    sample(now, { app, idle }) {
      const away = !app || NOT_APPS.test(app) || idle >= AWAY_AFTER;
      const name = away ? null : skip.has(app.toLowerCase()) ? null : app;
      // a long gap since the last sample: the Mac slept, the stretch ended back then
      if (open && now - open.last > interval * 3) close(open.last + interval / 2);
      // on the hour: cut, so each edition has its own time
      if (open && hourStart(now) > open.start && hourStart(now) > hourStart(open.start)) {
        const cut = hourStart(now);
        const { app: a, away: w } = open;
        close(cut);
        open = { app: a, away: w, start: cut, last: cut };
      }
      // an away stretch starts when the idleness began, not when we noticed it
      const start = away && idle >= AWAY_AFTER ? Math.max(open?.start ?? 0, now - idle * 1000) : now;
      if (!open) open = { app: name, away, start, last: now };
      else if (open.away !== away || open.app !== name) {
        close(away ? start : now);
        open = { app: name, away, start: away ? start : now, last: now };
      } else open.last = now;
    },
    /** The finished stretches (and the open one cut at `now` if it began in an earlier hour). */
    drain(now = Date.now()) {
      if (open && hourStart(now) > hourStart(open.start)) {
        const { app: a, away: w } = open;
        const cut = hourStart(now);
        close(cut);
        open = { app: a, away: w, start: cut, last: Math.max(cut, now - 1) };
      }
      return done.splice(0);
    },
    get open() { return open; },
  };
}

const toEvent = (s) => ({
  id: `apps:${s.start}`,
  source: 'apps',
  kind: s.away ? 'away' : 'focus',
  ts: s.start,
  title: s.away ? tr({ en: 'Away from the Mac', it: 'Lontano dal Mac' }) : s.app,
  detail: null,
  url: null,
  meta: { app: s.away ? null : s.app, seconds: s.seconds, end: s.end },
});

let timeline = null;
let timer = null;

/** Starts sampling (macOS only). Returns a function that stops it. */
export function startSampler(config, log = console.log) {
  if (timer || process.platform !== 'darwin' || config.demo || !config.sources?.apps) return () => {};
  const interval = Math.max(15, Number(config.apps?.sampleSeconds) || 60) * 1000;
  timeline = createTimeline({ interval, exclude: config.apps?.exclude || [] });
  let failures = 0;
  const tick = () => execFile('/bin/sh', ['-c', PROBE], { timeout: 10e3 }, (err, stdout) => {
    if (err) {
      if (++failures === 3) log(tr({ en: `[time] the app sampler fails: ${err.message}`, it: `[tempo] il campionatore delle app non funziona: ${err.message}` }));
      return;
    }
    failures = 0;
    timeline.sample(Date.now(), parseProbe(stdout));
  });
  tick();
  timer = setInterval(tick, interval);
  timer.unref?.();
  return () => { clearInterval(timer); timer = null; };
}

function locate() {
  if (process.platform !== 'darwin') return { file: 'lsappinfo', state: 'missing' };
  return { file: 'lsappinfo', state: fs.existsSync(LSAPPINFO) ? 'ok' : 'missing' };
}

export default {
  id: 'apps',
  get label() { return tr({ en: 'Time', it: 'Tempo' }); },
  locate,
  collect() {
    return { events: timeline ? timeline.drain(Date.now()).map(toEvent) : [] };
  },
};
