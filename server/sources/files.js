/**
 * Files: the folders you worked in, and what you downloaded.
 * Asks Spotlight (mdfind) which files changed since the last collection, so nothing is scanned.
 * By default only folder names, file types and counts reach the paper, never file names or
 * contents (files.includeNames: true to show names). For downloads, macOS remembers the site
 * a file came from: only that site's name is kept.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tr } from '../i18n.js';
import { HOME, hash, hostOf } from '../util.js';

const run = promisify(execFile);
const MDFIND = process.env.LOCALHOST_TIMES_MDFIND || '/usr/bin/mdfind'; // overridable for the tests
const MDLS = '/usr/bin/mdls';
export const DEFAULT_FOLDERS = ['Desktop', 'Documents', 'Downloads', 'Work', 'Developer', 'Projects', 'Code', 'src', 'git'];

// build output, caches and tool folders: noise, not news
const SKIP_DIR = /(^|\/)(node_modules|\.git|\.svn|\.hg|dist|build|out|\.next|\.nuxt|\.cache|__pycache__|\.venv|venv|env|target|Pods|DerivedData|\.Trash|Library|\.npm|\.gradle|coverage|tmp|temp|\.idea|\.vscode|\.DS_Store|vendor|\.terraform|\.pytest_cache|\.mypy_cache)(\/|$)/;
const SKIP_FILE = /^\.|~$|^~\$|\.(tmp|swp|swo|crdownload|download|part|partial|lock|log|pyc|pyo|o|class|map)$|^Icon\r?$/i;
const MAX_EVENTS = 600;

function folders(config) {
  const list = config.files?.folders?.length ? config.files.folders : DEFAULT_FOLDERS;
  return [...new Set(list.map((f) => (f.startsWith('~') ? path.join(HOME, f.slice(1)) : path.isAbsolute(f) ? f : path.join(HOME, f))))]
    .filter((f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } });
}

function locate() {
  if (process.platform !== 'darwin' || !fs.existsSync(MDFIND)) return { file: 'Spotlight (mdfind)', state: 'missing' };
  return { file: 'Spotlight (mdfind)', state: 'ok' };
}

/** The nearest git repository above a folder (cached), or null. */
function repoOf(dir, cache, stop) {
  const chain = [];
  let d = dir;
  while (d && d.length >= stop.length) {
    if (cache.has(d)) { const r = cache.get(d); for (const c of chain) cache.set(c, r); return r; }
    chain.push(d);
    if (fs.existsSync(path.join(d, '.git'))) { for (const c of chain) cache.set(c, d); return d; }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  for (const c of chain) cache.set(c, null);
  return null;
}

const rel = (p) => path.relative(HOME, p) || '~';

/** The site a download came from (kMDItemWhereFroms: [file URL, page URL]); just the host. */
async function whereFrom(file) {
  try {
    const { stdout } = await run(MDLS, ['-raw', '-name', 'kMDItemWhereFroms', file], { timeout: 4000 });
    const urls = [...stdout.matchAll(/"(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    const host = hostOf(urls[1] || urls[0] || '');
    return host ? host.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

export default {
  id: 'files',
  get label() { return tr({ en: 'Files', it: 'File' }); },
  locate,

  async collect({ since, config }) {
    const opts = config.files || {};
    const exclude = [...(opts.exclude || []), ...(config.privacy?.blockedFolders || [])].map((x) => x.toLowerCase());
    const secs = Math.max(60, Math.ceil((Date.now() - since) / 1000));
    const query = `kMDItemFSContentChangeDate >= $time.now(-${secs})`;
    const repoCache = new Map();
    const downloads = path.join(HOME, 'Downloads');
    const found = [];
    for (const root of folders(config)) {
      let out = '';
      try {
        ({ stdout: out } = await run(MDFIND, ['-onlyin', root, query], { maxBuffer: 64 * 1024 * 1024, timeout: 20000 }));
      } catch {
        continue; // Spotlight off for this volume, or too slow: skip it this time
      }
      for (const p of out.split('\n')) {
        if (!p) continue;
        const r = path.relative(root, p);
        if (!r || r.startsWith('..') || SKIP_DIR.test(path.dirname(r)) || SKIP_FILE.test(path.basename(p))) continue;
        const low = rel(p).toLowerCase();
        if (exclude.some((x) => low.includes(x))) continue;
        found.push({ p, root });
      }
    }
    const events = [];
    const pathOf = new Map(); // event id → file path, only in memory (to ask where downloads came from)
    for (const { p, root } of found) {
      let st;
      try { st = fs.lstatSync(p); } catch { continue; }
      if (!st.isFile() || st.mtimeMs < since) continue;
      const dir = path.dirname(p);
      const repo = repoOf(dir, repoCache, root);
      const inDownloads = p.startsWith(downloads + path.sep);
      const created = st.birthtimeMs >= since - 1000;
      // the story groups by project (a git repository) or by the first two folder levels
      const parts = path.relative(root, dir).split(path.sep).filter(Boolean);
      const group = repo ? rel(repo) : rel(path.join(root, ...parts.slice(0, 2)));
      const ext = path.extname(p).toLowerCase().slice(1) || null;
      events.push({
        id: `files:${hash(`${p}:${Math.round(st.mtimeMs / 1000)}`)}`,
        source: 'files',
        kind: inDownloads && created ? 'downloaded' : created ? 'created' : 'changed',
        ts: Math.round(st.mtimeMs),
        title: opts.includeNames ? path.basename(p) : ext ? `.${ext}` : tr({ en: 'file', it: 'file' }),
        detail: group,
        url: null,
        meta: { folder: group, dir: rel(dir), project: repo ? path.basename(repo) : null, ext, size: st.size },
      });
      pathOf.set(events.at(-1).id, p);
    }
    events.sort((a, b) => b.ts - a.ts);
    const kept = events.slice(0, MAX_EVENTS);
    // where the downloads came from (a few at most: one mdls call each)
    const dls = kept.filter((e) => e.kind === 'downloaded').slice(0, 30);
    for (const e of dls) e.meta.site = await whereFrom(pathOf.get(e.id));
    return { events: kept.sort((a, b) => a.ts - b.ts) };
  },
};
