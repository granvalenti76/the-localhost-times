/**
 * Git: what happened in the repositories on this Mac, read from each repository's reflog
 * (.git/logs/HEAD). The reflog records only what was done here — commits, branch switches,
 * merges, pulls, rebases — with the time and the message, so nobody else's history slips in.
 * When git itself is installed, each commit also gets its size (lines added and removed).
 *
 * The repositories are found once an hour under the same folders the Files source watches.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tr } from '../i18n.js';
import { HOME, hash } from '../util.js';
import { DEFAULT_FOLDERS } from './files.js';

const run = promisify(execFile);
const SKIP = /^(node_modules|\.git|dist|build|out|vendor|Pods|DerivedData|Library|\.Trash|\.cache|\.npm|target|venv|\.venv|coverage)$/;
const GITS = ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/Library/Developer/CommandLineTools/usr/bin/git', '/Applications/Xcode.app/Contents/Developer/usr/bin/git'];
const MAX_DEPTH = 4;
const MAX_STATS = 40; // commits sized per collection (one `git show` each)

let repos = null;
let reposAt = 0;

function roots(config) {
  const list = config.git?.folders?.length ? config.git.folders : config.files?.folders?.length ? config.files.folders : DEFAULT_FOLDERS;
  return [...new Set(list.map((f) => (f.startsWith('~') ? path.join(HOME, f.slice(1)) : path.isAbsolute(f) ? f : path.join(HOME, f))))]
    .filter((f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } });
}

/** Repositories under the roots (a folder with a .git directory), up to four levels down. */
export function findRepos(rootList, depth = MAX_DEPTH) {
  const out = new Set();
  const walk = (dir, d) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (ents.some((e) => e.name === '.git' && e.isDirectory())) { out.add(dir); return; }
    if (d >= depth) return;
    for (const e of ents) if (e.isDirectory() && !e.name.startsWith('.') && !SKIP.test(e.name)) walk(path.join(dir, e.name), d + 1);
  };
  for (const r of rootList) walk(r, 0);
  return [...out];
}

/**
 * One reflog line → { from, to, ts, action, message }.
 *   "<old> <new> Name <mail> 1791570000 +0200\tcommit: Fix the rail"
 */
export function parseReflogLine(line) {
  const m = /^([0-9a-f]{7,64}) ([0-9a-f]{7,64}) .*? (\d{9,11}) [+-]\d{4}\t(.*)$/.exec(line);
  if (!m) return null;
  const [, from, to, sec, rest] = m;
  const i = rest.indexOf(': ');
  const action = (i < 0 ? rest : rest.slice(0, i)).trim();
  const message = i < 0 ? '' : rest.slice(i + 2).trim();
  return { from, to, ts: Number(sec) * 1000, action, message };
}

/** The kind of a reflog action: commit, amend, merge, checkout, pull, rebase, reset, other. */
export function kindOf(action) {
  if (/^commit \(amend\)/.test(action)) return 'amend';
  if (/^commit \(merge\)|^merge\b/.test(action)) return 'merge';
  if (/^commit/.test(action)) return 'commit';
  if (/^checkout\b|^switch\b/.test(action)) return 'checkout';
  if (/^pull\b/.test(action)) return 'pull';
  if (/^rebase\b/.test(action)) return /finish|\(finish\)/.test(action) ? 'rebase' : null; // only the end of a rebase
  if (/^reset\b/.test(action)) return 'reset';
  if (/^cherry-pick\b|^revert\b/.test(action)) return 'commit';
  return null;
}

const ZERO = /^0+$/;

/** Reflog text → events of one repository since a time. Pure: exported for the tests. */
export function reflogEvents(text, { repo, since, current = null }) {
  const name = path.basename(repo);
  const lines = String(text || '').split('\n').map(parseReflogLine).filter(Boolean);
  // the branch at each moment: follow the checkouts ("moving from a to b")
  let branch = null;
  const firstMove = lines.find((l) => kindOf(l.action) === 'checkout' && /moving from (\S+) to (\S+)/.test(l.message));
  if (firstMove) branch = /moving from (\S+) to/.exec(firstMove.message)[1];
  const events = [];
  for (const l of lines) {
    const kind = kindOf(l.action);
    let moved = null;
    if (kind === 'checkout') {
      const mv = /moving from (\S+) to (\S+)/.exec(l.message);
      if (mv) { moved = { from: mv[1], to: mv[2] }; branch = mv[2]; }
    }
    if (!kind || l.ts <= since) continue;
    if (kind === 'checkout' && (!moved || moved.from === moved.to)) continue;
    const title = kind === 'checkout' ? `${moved.from} → ${moved.to}` : kind === 'pull' || kind === 'reset' ? (l.message || l.action) : l.message.split('\n')[0];
    events.push({
      id: `git:${hash(repo)}:${l.to.slice(0, 12)}:${l.ts}`,
      source: 'git',
      kind,
      ts: l.ts,
      title: title.slice(0, 200) || l.action,
      detail: name,
      url: null,
      meta: { repo: name, branch: kind === 'checkout' ? moved.to : branch, hash: ZERO.test(l.to) ? null : l.to.slice(0, 10), parent: ZERO.test(l.from) ? null : l.from.slice(0, 10), ...(moved ? { from: moved.from } : {}) },
    });
  }
  // the branch of the last events is the current one, when the log never said
  if (current) for (const e of events) e.meta.branch ||= current;
  return events;
}

/** Lines added and removed, and files touched, from `git show --numstat`. */
export function parseNumstat(out) {
  let added = 0, removed = 0, files = 0;
  for (const line of String(out || '').split('\n')) {
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (!m) continue;
    files++;
    if (m[1] !== '-') added += Number(m[1]);
    if (m[2] !== '-') removed += Number(m[2]);
  }
  return { added, removed, files };
}

// not /usr/bin/git on a Mac: without the developer tools it opens an installer dialog
const gitBin = () => [...GITS, ...(process.platform === 'darwin' ? [] : ['/usr/bin/git'])].find((g) => fs.existsSync(g)) || null;

function currentBranch(repo) {
  try {
    const head = fs.readFileSync(path.join(repo, '.git', 'HEAD'), 'utf8').trim();
    return (/^ref: refs\/heads\/(.+)$/.exec(head) || [])[1] || null;
  } catch { return null; }
}

export default {
  id: 'git',
  label: 'Git',
  fingerprint: false,
  locate: () => ({ file: tr({ en: 'the reflog of each repository', it: 'il reflog di ogni repository' }), state: 'ok' }),

  async collect({ since, config }) {
    const exclude = [...(config.git?.exclude || []), ...(config.privacy?.blockedFolders || [])].map((x) => x.toLowerCase());
    if (!repos || Date.now() - reposAt > 3600e3) { repos = findRepos(roots(config)); reposAt = Date.now(); }
    const events = [];
    for (const repo of repos) {
      if (exclude.some((x) => repo.toLowerCase().includes(x))) continue;
      const log = path.join(repo, '.git', 'logs', 'HEAD');
      let st;
      try { st = fs.statSync(log); } catch { continue; }
      if (st.mtimeMs < since) continue;
      let text = '';
      try { text = fs.readFileSync(log, 'utf8'); } catch { continue; }
      // the reflog only grows at the end: the last 2,000 lines are plenty
      const tail = text.split('\n').slice(-2000).join('\n');
      for (const e of reflogEvents(tail, { repo, since, current: currentBranch(repo) })) { e.meta.path = repo; events.push(e); }
    }
    const git = gitBin();
    if (git) {
      for (const e of events.filter((x) => ['commit', 'amend', 'merge'].includes(x.kind) && x.meta.hash).slice(-MAX_STATS)) {
        try {
          const { stdout } = await run(git, ['-C', e.meta.path, 'show', '--numstat', '--format=', '--no-renames', e.meta.hash], { timeout: 4000, maxBuffer: 8 * 1024 * 1024 });
          Object.assign(e.meta, parseNumstat(stdout));
        } catch { /* a commit gone after a rebase: no size */ }
      }
    }
    for (const e of events) delete e.meta.path;
    return { events: events.sort((a, b) => a.ts - b.ts) };
  },
};
