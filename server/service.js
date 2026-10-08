/**
 * Run the paper as a macOS background service (a launchd LaunchAgent):
 * it starts at login, restarts if it crashes, and prints every hour on its own.
 *
 *   npm run service:install     build the site, install and start the agent
 *   npm run service:restart     rebuild the site and restart (after an update or a config change)
 *   npm run service:stop        stop it (until service:start, or the next login)
 *   npm run service:start       start it again
 *   npm run service:uninstall   stop it and remove the agent
 *   npm run service:status      is it running? can it read the sources?
 *   npm run service:logs        follow the log
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, ROOT } from './config.js';
import { tr } from './i18n.js';

export const LABEL = 'io.github.localhost-times';
const config = loadConfig();
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const logDir = path.join(ROOT, 'data', 'logs');
const logFile = path.join(logDir, 'server.log');
const uid = () => process.getuid();
const target = () => `gui/${uid()}/${LABEL}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The LaunchAgent property list. Exported for tests. */
export function plist({ node, root, log, pathEnv }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(node)}</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>${esc(path.join(root, 'server', 'index.js'))}</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(root)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${esc(pathEnv)}</string>
    <key>LOCALHOST_TIMES_SERVICE</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${esc(log)}</string>
  <key>StandardErrorPath</key><string>${esc(log)}</string>
</dict>
</plist>
`;
}

function launchctl(args, { quiet = false } = {}) {
  try {
    return execFileSync('/bin/launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'pipe'] });
  } catch (e) {
    if (quiet) return null;
    throw e;
  }
}

async function ping() {
  try {
    const r = await fetch(`http://127.0.0.1:${config.port}/api/status`, { signal: AbortSignal.timeout(2500) });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

function serviceState() {
  const out = launchctl(['print', target()], { quiet: true });
  if (!out) return { loaded: false };
  return {
    loaded: true,
    running: /state = running/.test(out),
    pid: Number((/\bpid = (\d+)/.exec(out) || [])[1]) || null,
    lastExit: (/last exit code = ([^\n]+)/.exec(out) || [])[1] || null,
  };
}

const realNode = () => fs.realpathSync(process.execPath);

/** Prefer a stable symlink (/opt/homebrew/bin/node) over the versioned Cellar path, so upgrades don't break the agent. */
function stableNode() {
  for (const d of [...(process.env.PATH || '').split(':'), '/opt/homebrew/bin', '/usr/local/bin']) {
    const p = path.join(d, 'node');
    try {
      if (fs.realpathSync(p) === realNode()) return p;
    } catch { /* not here */ }
  }
  return process.execPath;
}

function permissionsHelp() {
  const node = realNode();
  return tr({
    en: `
Permissions — once, by hand:
  The service runs as "node", not inside Terminal, so macOS asks again.
  System Settings → Privacy & Security → Full Disk Access → "+" →
  press ⌘⇧G and paste:
      ${node}
  Then: npm run service:status
  If your model is on another computer, macOS will also ask whether "node" may
  use the Local Network: say yes.
  After a Node.js upgrade (brew upgrade) the path changes: add the new one.`,
    it: `
Permessi — una volta, a mano:
  Il servizio gira come "node", non dentro il Terminale, quindi macOS chiede di nuovo.
  Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco → "+" →
  premi ⌘⇧G e incolla:
      ${node}
  Poi: npm run service:status
  Se il modello è su un altro computer, macOS chiederà anche se "node" può usare
  la rete locale: rispondi di sì.
  Dopo un aggiornamento di Node.js (brew upgrade) il percorso cambia: aggiungi quello nuovo.`,
  });
}

async function install() {
  if (process.platform !== 'darwin') throw new Error(tr({ en: 'The service is for macOS only.', it: 'Il servizio è solo per macOS.' }));
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj < 22 || (maj === 22 && min < 13) || (maj === 23 && min < 4)) {
    throw new Error(tr({ en: `Node.js ${process.versions.node} is too old: install Node 22.13 or later (brew install node).`, it: `Node.js ${process.versions.node} è troppo vecchio: installa Node 22.13 o successivo (brew install node).` }));
  }
  const st = serviceState();
  if (!st.loaded && (await ping())) {
    throw new Error(tr({
      en: `Something is already answering on port ${config.port} (probably "npm start" in a Terminal). Stop it first, then run this again.`,
      it: `C'è già qualcosa sulla porta ${config.port} (probabilmente "npm start" in un Terminale). Chiudilo e rilancia questo comando.`,
    }));
  }
  buildSite();

  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  const pathEnv = [...new Set([path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':');
  fs.writeFileSync(plistPath, plist({ node: stableNode(), root: ROOT, log: logFile, pathEnv }));

  // start a fresh log (launchd keeps the file open while the service runs)
  try { if (fs.statSync(logFile).size > 1e6) fs.renameSync(logFile, `${logFile}.1`); } catch { /* no log yet */ }
  if (st.loaded) {
    launchctl(['bootout', target()], { quiet: true });
    await new Promise((r) => setTimeout(r, 1000)); // launchd needs a moment before the label can be loaded again
  }
  launchctl(['enable', target()], { quiet: true }); // a previously disabled agent would refuse to load
  try {
    launchctl(['bootstrap', `gui/${uid()}`, plistPath]);
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
    launchctl(['bootstrap', `gui/${uid()}`, plistPath]); // "Bootstrap failed: 5" usually goes away on retry
  }
  console.log(tr({ en: `› Agent installed: ${plistPath}`, it: `› Servizio installato: ${plistPath}` }));

  let up = null;
  for (let i = 0; i < 20 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await ping();
  }
  if (up) {
    console.log(tr({
      en: `✓ The paper is running at http://localhost:${config.port} and will start by itself at every login.`,
      it: `✓ Il giornale è in edicola su http://localhost:${config.port} e ripartirà da solo a ogni accesso.`,
    }));
  } else {
    console.log(tr({ en: `! Not answering yet. Look at the log: npm run service:logs`, it: `! Non risponde ancora. Guarda il log: npm run service:logs` }));
  }
  console.log(permissionsHelp());
}

function uninstall() {
  const st = serviceState();
  if (st.loaded) launchctl(['bootout', target()], { quiet: true });
  const had = fs.existsSync(plistPath);
  if (had) fs.unlinkSync(plistPath);
  console.log(st.loaded || had
    ? tr({ en: '✓ Service stopped and removed. Your editions are still in data/.', it: '✓ Servizio fermato e rimosso. Le edizioni restano in data/.' })
    : tr({ en: 'The service was not installed.', it: 'Il servizio non era installato.' }));
}

async function status() {
  const st = serviceState();
  const s = await ping();
  if (!st.loaded) {
    console.log(tr({ en: 'Service: not installed (npm run service:install).', it: 'Servizio: non installato (npm run service:install).' }));
  } else {
    console.log(st.running
      ? tr({ en: `Service: running (pid ${st.pid}).`, it: `Servizio: in funzione (pid ${st.pid}).` })
      : tr({ en: `Service: installed but not running (last exit: ${st.lastExit ?? '?'}). See npm run service:logs`, it: `Servizio: installato ma fermo (ultima uscita: ${st.lastExit ?? '?'}). Vedi npm run service:logs` }));
  }
  if (!s) {
    console.log(tr({ en: `Paper: nothing on http://localhost:${config.port}`, it: `Giornale: nessuna risposta su http://localhost:${config.port}` }));
    return;
  }
  console.log(tr({ en: `Paper: http://localhost:${config.port} — writer ${s.llm?.state === 'online' ? s.llm.model : 'offline (automatic typesetting)'}`, it: `Giornale: http://localhost:${config.port} — redattore ${s.llm?.state === 'online' ? s.llm.model : 'spento (tipografia automatica)'}` }));
  for (const src of s.sources || []) {
    const mark = src.state === 'ok' ? '✓' : src.state === 'denied' ? '✗' : '·';
    console.log(`  ${mark} ${src.label.padEnd(10)} ${src.state}${src.error ? ` — ${src.error}` : ''}`);
  }
  if ((s.sources || []).some((x) => x.state === 'denied')) console.log(permissionsHelp());
}

async function waitUp(tries = 20) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await ping()) return true;
  }
  return false;
}

function notInstalled() {
  throw new Error(tr({ en: 'The service is not installed: npm run service:install', it: 'Il servizio non è installato: npm run service:install' }));
}

function buildSite() {
  console.log(tr({ en: '› Building the site…', it: '› Compilo il sito…' }));
  execFileSync(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['build', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
}

async function start() {
  if (!fs.existsSync(plistPath)) notInstalled();
  const st = serviceState();
  if (st.running) return console.log(tr({ en: `Already running (pid ${st.pid}).`, it: `È già in funzione (pid ${st.pid}).` }));
  if (st.loaded) launchctl(['kickstart', target()]);
  else {
    launchctl(['enable', target()], { quiet: true });
    launchctl(['bootstrap', `gui/${uid()}`, plistPath]);
  }
  console.log(await waitUp()
    ? tr({ en: `✓ Started: http://localhost:${config.port}`, it: `✓ Avviato: http://localhost:${config.port}` })
    : tr({ en: '! Not answering yet. Look at the log: npm run service:logs', it: '! Non risponde ancora. Guarda il log: npm run service:logs' }));
}

function stop() {
  if (!fs.existsSync(plistPath)) notInstalled();
  const st = serviceState();
  if (!st.loaded) return console.log(tr({ en: 'The service is already stopped.', it: 'Il servizio è già fermo.' }));
  // bootout, not kill: with KeepAlive, launchd would restart a killed process right away
  launchctl(['bootout', target()], { quiet: true });
  console.log(tr({
    en: '✓ Stopped. It starts again with npm run service:start, or by itself at the next login.',
    it: '✓ Fermato. Riparte con npm run service:start, o da solo al prossimo accesso.',
  }));
}

async function restart() {
  if (!fs.existsSync(plistPath)) notInstalled();
  buildSite(); // after an update the page must be rebuilt too
  const st = serviceState();
  if (st.loaded) launchctl(['kickstart', '-k', target()]); // -k: kill the running one and start again
  else {
    launchctl(['enable', target()], { quiet: true });
    launchctl(['bootstrap', `gui/${uid()}`, plistPath]);
  }
  console.log(await waitUp()
    ? tr({ en: `✓ Restarted: http://localhost:${config.port}`, it: `✓ Riavviato: http://localhost:${config.port}` })
    : tr({ en: '! Not answering yet. Look at the log: npm run service:logs', it: '! Non risponde ancora. Guarda il log: npm run service:logs' }));
}

function logs() {
  if (!fs.existsSync(logFile)) return console.log(tr({ en: 'No log yet.', it: 'Ancora nessun log.' }));
  spawn('/usr/bin/tail', ['-n', '60', '-f', logFile], { stdio: 'inherit' });
}

const cmd = process.argv[2];
const run = { install, uninstall, status, logs, start, stop, restart }[cmd];
// run only as a script (not when imported by the tests); realpath copes with spaces and symlinks
const isMain = (() => {
  try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  if (!run) {
    console.log('Usage: node server/service.js install | start | stop | restart | status | logs | uninstall');
    process.exit(1);
  }
  Promise.resolve(run()).catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
