/**
 * macOS notifications: "a new edition is out".
 * Uses terminal-notifier when installed (clicking opens the paper), otherwise osascript.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tr } from './i18n.js';
import { hhmm } from './util.js';

const TITLE = 'The Localhost Times';

function findBin(name) {
  const dirs = [...(process.env.PATH || '').split(':'), '/opt/homebrew/bin', '/usr/local/bin'];
  for (const d of dirs) {
    const p = path.join(d, name);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch { /* keep looking */ }
  }
  return null;
}

export function createNotifier(config, log = console.log) {
  const off = process.platform !== 'darwin' || !config.notifications?.enabled || config.demo;
  if (off) return { enabled: false, edition() {}, evening() {}, spotlight() {}, spotlightReply() {}, test() {} };
  const tn = findBin('terminal-notifier');
  const base = `http://127.0.0.1:${config.port}/`;

  function send({ subtitle, message, url }) {
    const done = (e) => e && log(`[notify] ${e.message}`);
    if (tn) {
      const args = ['-title', TITLE, '-subtitle', subtitle, '-message', message, '-group', 'localhost-times', '-open', base + (url || '')];
      if (config.notifications.sound) args.push('-sound', 'default');
      return execFile(tn, args, { timeout: 10e3 }, done);
    }
    // the text goes in as arguments: no escaping, no injection
    const script = [
      'on run argv',
      `display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv)${config.notifications.sound ? ' sound name "Glass"' : ''}`,
      'end run',
    ];
    execFile('/usr/bin/osascript', [...script.flatMap((l) => ['-e', l]), message, TITLE, subtitle], { timeout: 10e3 }, done);
  }

  /** A new hourly edition (or a draft waiting in the newsroom). */
  function edition(ed) {
    if (!ed) return;
    const lead = ed.articles?.[0]?.headline || ed.summary || '';
    const at = hhmm(ed.hour ?? ed.start);
    if (ed.status === 'draft') {
      send({
        subtitle: tr({ en: `The ${at} edition is waiting in the newsroom`, it: `L'edizione delle ${at} aspetta in Redazione` }),
        message: lead,
        url: `#/newsroom/${encodeURIComponent(ed.id)}`,
      });
    } else {
      send({ subtitle: tr({ en: `The ${at} edition`, it: `Edizione delle ${at}` }), message: lead, url: `#/e/${encodeURIComponent(ed.id)}` });
    }
  }

  function evening(ev) {
    if (!ev) return;
    send({
      subtitle: tr({ en: 'The evening edition is out', it: 'È uscita l\'edizione della sera' }),
      message: ev.editorial?.headline || '',
      url: ev.status === 'draft' ? `#/newsroom/sera-${ev.day}` : `#/evening/${ev.day}`,
    });
  }

  /** A Spotlight scoop is out. */
  function spotlight(s) {
    if (!s) return;
    send({ subtitle: tr({ en: 'Spotlight · Exclusive', it: 'Spotlight · Esclusiva' }), message: s.headline, url: `#/spotlight/${s.id}` });
  }

  /** Spotlight asks the owner for a comment before printing. */
  function spotlightReply(lead) {
    send({
      subtitle: tr({ en: 'Spotlight asks for your comment', it: 'Spotlight chiede un tuo commento' }),
      message: lead.desk?.headline || lead.subject,
      url: '#/newsroom/spotlight',
    });
  }

  function test() {
    send({ subtitle: tr({ en: 'Notifications are on', it: 'Le notifiche funzionano' }), message: tr({ en: 'You will hear from us every hour.', it: 'Ci sentiamo a ogni edizione.' }) });
  }

  return { enabled: true, edition, evening, spotlight, spotlightReply, test, via: tn ? 'terminal-notifier' : 'osascript' };
}
