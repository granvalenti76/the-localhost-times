/**
 * The lead headline in the macOS menu bar, through SwiftBar or xbar (free menu-bar apps that
 * show the output of a small script). The server writes the menu (/api/menubar); the plugin
 * script only fetches it.
 *
 *   npm run menubar:install     put the plugin in SwiftBar's or xbar's plugin folder
 *   npm run menubar:uninstall   remove it
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tr } from './i18n.js';
import { hhmm } from './util.js';

const PLUGIN = 'localhost-times.5m.sh'; // ".5m" = SwiftBar/xbar refresh it every 5 minutes

const clean = (s, n) => {
  const t = String(s || '').replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim(); // "|" separates text from options in the menu format
  return n && t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** The menu, in the SwiftBar/xbar text format: first line in the bar, then the dropdown. */
/** A menu item that answers a call with one click (curl with the paper's header, no browser). */
const answerItem = (port, c, o) => `--${clean(o.label, 50)} | bash=/usr/bin/curl param1=-s param2=-X param3=POST param4=-H param5=X-Localhost-Times:1 param6=http://127.0.0.1:${port}/api/calls/${c.id}/answer?option=${encodeURIComponent(o.id)} terminal=false refresh=true`;

export function menubarText({ edition, next, base, evening = null, spotlight = null, calls = [], flash = null, port = 4321, max = 42 }) {
  const lines = [];
  const lead = edition?.articles?.[0];
  const waiting = spotlight?.waiting || [];
  const ringing = calls.filter((c) => !c.late);
  // a scoop waiting for the owner's comment, or the newsroom on the line, puts a mark in the bar
  const mark = `${waiting.length ? '◉ ' : ''}${ringing.length ? '☎︎ ' : ''}`;
  lines.push(flash ? `${mark}⚡ ${clean(flash.headline, max)}` : `${mark}${lead ? `🗞 ${clean(lead.headline, max)}` : '🗞 The Localhost Times'}`);
  lines.push('---');
  if (flash) lines.push(`⚡ ${tr({ en: 'Breaking', it: 'Ultim\'ora' })} ${hhmm(flash.ts)}: ${clean(flash.text, 90)} | color=red href=${base}/`);
  for (const c of ringing) {
    if (c.type === 'interview') {
      lines.push(`☎︎ ${clean(c.by?.name || '', 30)}: ${clean(c.question, 70)} | href=${base}/#/calls/${c.id}`);
    } else {
      lines.push(`☎︎ ${clean(c.question, 70)}${c.minutesLeft ? ` (${c.minutesLeft} min)` : ''}`);
      for (const o of c.options) lines.push(answerItem(port, c, o));
    }
  }
  if (flash || ringing.length) lines.push('---');
  if (edition) {
    lines.push(`${tr({ en: `The ${hhmm(edition.hour ?? edition.start)} edition`, it: `Edizione delle ${hhmm(edition.hour ?? edition.start)}` })} | href=${base}/#/e/${encodeURIComponent(edition.id)}`);
    for (const a of edition.articles.slice(0, 6)) {
      lines.push(`--${clean(a.section)}: ${clean(a.headline, 80)} | href=${base}/#/e/${encodeURIComponent(edition.id)}/a/${encodeURIComponent(a.id)}`);
    }
    if (edition.summary) lines.push(`${clean(edition.summary, 90)} | color=gray`);
  } else {
    lines.push(tr({ en: 'No edition yet today', it: 'Ancora nessuna edizione oggi' }));
  }
  if (spotlight?.scoop) lines.push(`${tr({ en: 'Spotlight exclusive', it: 'Esclusiva Spotlight' })}: ${clean(spotlight.scoop.headline, 70)} | href=${base}/#/spotlight/${spotlight.scoop.id}`);
  for (const l of waiting) lines.push(`◉ ${tr({ en: 'Spotlight asks for your comment', it: 'Spotlight chiede un tuo commento' })}: ${clean(l.desk?.headline || l.subject, 50)} | color=red href=${base}/#/newsroom/spotlight`);
  if (spotlight?.open) lines.push(`${tr({ en: `Spotlight: ${spotlight.open} lead${spotlight.open === 1 ? '' : 's'} under investigation`, it: `Spotlight: ${spotlight.open} ${spotlight.open === 1 ? 'pista' : 'piste'} in indagine` })} | color=gray href=${base}/#/newsroom/spotlight`);
  if (evening?.editorial) lines.push(`${tr({ en: 'Evening', it: 'Sera' })}: ${clean(evening.editorial.headline, 70)} | href=${base}/#/evening/${evening.day}`);
  lines.push('---');
  if (next) {
    lines.push(tr({
      en: `Next edition at ${hhmm(next.printsAt)} · ${next.total} signals so far`,
      it: `Prossima edizione alle ${hhmm(next.printsAt)} · ${next.total} segnali finora`,
    }) + ' | color=gray');
    const s = next.stories[0];
    if (s) lines.push(`${tr({ en: 'Would lead with', it: 'Aprirebbe con' })}: ${clean(s.topic, 60)} | href=${base}/#/newsroom`);
  }
  lines.push(`${tr({ en: 'Open the paper', it: 'Apri il giornale' })} | href=${base}/`);
  lines.push(`${tr({ en: 'Newsroom', it: 'Redazione' })} | href=${base}/#/newsroom`);
  lines.push(`${tr({ en: 'Archive', it: 'Archivio' })} | href=${base}/#/archive`);
  lines.push('---');
  lines.push(`${tr({ en: 'Refresh', it: 'Aggiorna' })} | refresh=true`);
  return `${lines.join('\n')}\n`;
}

/** The plugin script: it only asks the paper for the menu. */
export function pluginScript(port) {
  return `#!/bin/bash
# <xbar.title>The Localhost Times</xbar.title>
# <xbar.desc>The lead headline of your local newspaper.</xbar.desc>
# <xbar.author>The Localhost Times</xbar.author>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideDisablePlugin>false</swiftbar.hideDisablePlugin>
curl -s --max-time 4 "http://127.0.0.1:${port}/api/menubar" && exit 0
echo "🗞"
echo "---"
echo "The Localhost Times is not running | color=gray"
echo "npm run service:start | color=gray"
`;
}

function pluginDirs() {
  const dirs = [];
  try {
    const d = execFileSync('/usr/bin/defaults', ['read', 'com.ameba.SwiftBar', 'PluginDirectory'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (d) dirs.push({ app: 'SwiftBar', dir: d.replace(/^~/, os.homedir()) });
  } catch { /* SwiftBar not installed or not set up */ }
  const xbar = path.join(os.homedir(), 'Library', 'Application Support', 'xbar', 'plugins');
  if (fs.existsSync(xbar)) dirs.push({ app: 'xbar', dir: xbar });
  return dirs;
}

async function install() {
  const { loadConfig } = await import('./config.js');
  const config = loadConfig();
  const dirs = pluginDirs();
  if (!dirs.length) {
    console.log(tr({
      en: `No menu-bar app found. Install SwiftBar (free):\n  brew install --cask swiftbar\nopen it once and choose a plugin folder, then run: npm run menubar:install`,
      it: `Nessuna app per la barra dei menu. Installa SwiftBar (gratuita):\n  brew install --cask swiftbar\naprila una volta e scegli una cartella per i plugin, poi lancia: npm run menubar:install`,
    }));
    return;
  }
  for (const { app, dir } of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, PLUGIN);
    fs.writeFileSync(file, pluginScript(config.port), { mode: 0o755 });
    fs.chmodSync(file, 0o755);
    console.log(tr({ en: `✓ ${app}: ${file}`, it: `✓ ${app}: ${file}` }));
  }
  console.log(tr({
    en: 'The headline appears in the menu bar within a few seconds (refresh the app if not). It updates every 5 minutes.',
    it: 'Il titolo compare nella barra dei menu in pochi secondi (aggiorna l\'app se non compare). Si aggiorna ogni 5 minuti.',
  }));
}

function uninstall() {
  let n = 0;
  for (const { app, dir } of pluginDirs()) {
    const file = path.join(dir, PLUGIN);
    if (fs.existsSync(file)) { fs.unlinkSync(file); n++; console.log(`✓ ${app}: ${file}`); }
  }
  if (!n) console.log(tr({ en: 'The plugin was not installed.', it: 'Il plugin non era installato.' }));
}

const isMain = (() => {
  try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  if (process.platform !== 'darwin') {
    console.log('The menu-bar plugin is for macOS.');
  } else {
    const cmd = process.argv[2];
    Promise.resolve(cmd === 'uninstall' ? uninstall() : install()).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
  }
}
