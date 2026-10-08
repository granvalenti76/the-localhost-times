/**
 * The Mac itself: when it wakes, sleeps, starts and shuts down, the display, and whether it runs
 * on battery. Read from `pmset -g log` (no permission needed). Nothing about what is on screen.
 */
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tr } from '../i18n.js';

const run = promisify(execFile);
const PMSET = process.env.LOCALHOST_TIMES_PMSET || '/usr/bin/pmset';

// 2026-10-08 08:57:34 +0200 Wake                	Wake from Deep Idle [CDNVA] : due to EC.LidOpen/Lid Open … Using BATT (Charge:83%)
const LINE = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d{4}) (Sleep|Wake|Start|Shutdown|Notification)\b[^\t]*\t\s*(.*)$/;

const parseTs = (d, t, z) => Date.parse(`${d}T${t}${z.slice(0, 3)}:${z.slice(3)}`);

function power(msg) {
  const m = /Using (AC|BATT|Batt)\s*\(Charge:\s*(\d+)%?\)/i.exec(msg);
  return m ? { power: /^ac$/i.test(m[1]) ? 'ac' : 'battery', charge: Number(m[2]) } : {};
}

function sleepReason(msg) {
  const r = (/due to '([^']+)'/.exec(msg) || [])[1] || '';
  if (/clamshell/i.test(r)) return 'lid';
  if (/idle/i.test(r)) return 'idle';
  if (/software|sleep service/i.test(r)) return 'user';
  if (/low power|battery/i.test(r)) return 'battery';
  if (/maintenance/i.test(r)) return 'maintenance';
  return r ? 'other' : null;
}

function wakeReason(msg) {
  if (/lid ?open/i.test(msg)) return 'lid';
  if (/power ?button/i.test(msg)) return 'button';
  if (/user ?activity|HID|keyboard|trackpad/i.test(msg)) return 'user';
  return 'other';
}

const TITLES = {
  wake: { en: 'Woke up', it: 'Risveglio' },
  sleep: { en: 'Went to sleep', it: 'A riposo' },
  boot: { en: 'Started up', it: 'Accensione' },
  shutdown: { en: 'Shut down', it: 'Spegnimento' },
  'display-on': { en: 'Display on', it: 'Schermo acceso' },
  'display-off': { en: 'Display off', it: 'Schermo spento' },
};

/** The events of the power log after `since`. Exported for the tests. */
export function parsePmset(text, since) {
  const events = [];
  for (const line of text.split('\n')) {
    const m = LINE.exec(line);
    if (!m) continue;
    const ts = parseTs(m[1], m[2], m[3]);
    if (!Number.isFinite(ts) || ts <= since) continue;
    const [, , , , domain, msg] = m;
    let kind = null;
    let meta = {};
    if (domain === 'Wake' && /^Wake from/i.test(msg)) { kind = 'wake'; meta = { reason: wakeReason(msg), ...power(msg) }; }
    else if (domain === 'Sleep' && /Entering Sleep/i.test(msg)) {
      const reason = sleepReason(msg);
      if (reason === 'maintenance') continue;
      kind = 'sleep';
      meta = { reason, ...power(msg) };
    } else if (domain === 'Start') kind = 'boot';
    else if (domain === 'Shutdown') kind = 'shutdown';
    else if (domain === 'Notification' && /Display is turned on/i.test(msg)) kind = 'display-on';
    else if (domain === 'Notification' && /Display is turned off/i.test(msg)) kind = 'display-off';
    if (!kind) continue;
    events.push({ id: `power:${kind}:${ts}`, source: 'power', kind, ts, title: tr(TITLES[kind]), detail: meta.reason || null, url: null, meta });
  }
  return events;
}

function locate() {
  if (process.platform !== 'darwin' && !process.env.LOCALHOST_TIMES_PMSET) return { file: 'pmset -g log', state: 'missing' };
  return { file: 'pmset -g log', state: fs.existsSync(PMSET) ? 'ok' : 'missing' };
}

export default {
  id: 'power',
  get label() { return tr({ en: 'The Mac', it: 'Il Mac' }); },
  locate,
  everyMinutes: 15, // the power log is long: once every quarter of an hour is plenty

  async collect({ since }) {
    const { stdout } = await run(PMSET, ['-g', 'log'], { maxBuffer: 256 * 1024 * 1024, timeout: 60e3 });
    return { events: parsePmset(stdout, since) };
  },
};
