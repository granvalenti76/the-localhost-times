/**
 * Interni: the owner's own projects, read from the repositories themselves (read-only), not
 * only from the reflog. What each project is (its README), what changed in a period (the commits,
 * by the owner and by others, where in the tree, the files born, the dependencies that came and
 * went, the tags), and how it stands now (work not committed and since when, commits not pushed,
 * branches, how long it has been quiet).
 *
 * The folder of the projects is chosen in the Settings and kept with the paper ('interni'
 * setting); each repository can be left out, or given the name the paper calls it by.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HOME } from '../util.js';
import { gitBin, currentBranch, findRepos, roots } from '../sources/git.js';

const run = promisify(execFile);
const DAY = 24 * 3600e3;

/** The paper's choices for Interni: the folder and, per repository, on/off and a name. */
export function getInterni(store) {
  return { folder: '', repos: {}, ...(store.getSetting('interni', null) || {}) };
}

export function saveInterni(store, config, patch = {}) {
  const cur = getInterni(store);
  const next = { ...cur };
  if (typeof patch.folder === 'string') next.folder = patch.folder.trim();
  if (patch.repo && typeof patch.repo === 'string') {
    const r = { ...(cur.repos[patch.repo] || {}) };
    if (typeof patch.on === 'boolean') r.on = patch.on;
    if (typeof patch.title === 'string') r.title = patch.title.trim().slice(0, 60);
    next.repos = { ...cur.repos, [patch.repo]: r };
  }
  store.setSetting('interni', next);
  config.interni = next; // the git source reads the folder from the config
  return next;
}

const expand = (f) => (f.startsWith('~') ? path.join(HOME, f.slice(1)) : f);

/** The repositories of Interni: under the chosen folder, or where the git source looks. */
export function interniRepos(store, config) {
  const prefs = getInterni(store);
  const list = findRepos(prefs.folder ? [expand(prefs.folder)] : roots(config), 3);
  const exclude = (config.git?.exclude || []).map((x) => x.toLowerCase());
  return list
    .filter((p) => !exclude.some((x) => p.toLowerCase().includes(x)))
    .map((p) => {
      const pref = prefs.repos[p] || {};
      return { path: p, name: path.basename(p), title: pref.title || path.basename(p), on: pref.on !== false };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function git(repo, args, { timeout = 8000 } = {}) {
  const bin = gitBin();
  if (!bin) return '';
  try {
    const { stdout } = await run(bin, ['-C', repo, ...args], { timeout, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch {
    return '';
  }
}

/** What a project is, in a sentence: the first paragraph of its README that is prose. */
export function describe(readme = '') {
  for (const block of String(readme).split(/\n\s*\n/)) {
    const t = block.trim();
    // not a heading, a badge, a quote, a list, a table, a motto in italics or a line that announces something
    if (!t || /^(#|<|!\[|\[!\[|```|>|\||-|\*\s|\*[^*]|_|\d+[.)]\s|={3,})/.test(t) || /:\s*$/.test(t) || /%[0-9A-F]{2}|\s\/\s.*\s\/\s/.test(t)) continue;
    const plain = t.replace(/\s+/g, ' ').replace(/\*\*?|__?|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    if (plain.length < 25 || /^(install|usage|license|table of contents)/i.test(plain)) continue;
    const first = /^(.{25,220}?[.!?])(\s|$)/.exec(plain)?.[1] || plain.slice(0, 200);
    return first;
  }
  return null;
}

function readme(repo) {
  for (const f of ['README.md', 'README.markdown', 'README', 'readme.md', 'README.txt']) {
    try { return fs.readFileSync(path.join(repo, f), 'utf8').slice(0, 20000); } catch { /* next */ }
  }
  return '';
}

/** How a project stands now: branch, work not committed and since when, commits not pushed, last commit. */
export async function repoStatus(repo, now = Date.now()) {
  const [porcelain, ahead, last, count, branches, email] = await Promise.all([
    git(repo, ['status', '--porcelain=v1', '--untracked-files=normal']),
    git(repo, ['rev-list', '--count', '@{u}..HEAD']),
    git(repo, ['log', '-1', '--format=%ct']),
    git(repo, ['rev-list', '--count', 'HEAD']),
    git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
    git(repo, ['config', 'user.email']),
  ]);
  const dirtyFiles = porcelain.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
  // the oldest change not committed: how long the work has been lying there
  let dirtySince = null;
  for (const f of dirtyFiles.slice(0, 200)) {
    try { const m = fs.statSync(path.join(repo, f)).mtimeMs; if (dirtySince == null || m < dirtySince) dirtySince = m; } catch { /* deleted */ }
  }
  const lastTs = Number(last.trim()) * 1000 || null;
  return {
    branch: currentBranch(repo),
    branches: branches.split('\n').filter(Boolean).length,
    dirty: dirtyFiles.length,
    dirtySince,
    ahead: ahead.trim() === '' ? null : Number(ahead.trim()),
    last: lastTs,
    idleDays: lastTs ? Math.floor((now - lastTs) / DAY) : null,
    commits: Number(count.trim()) || 0,
    me: email.trim().toLowerCase() || null,
    description: describe(readme(repo)),
  };
}

const DEP_FILES = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile|Package\.swift|composer\.json)$/;

const NOT_DEPS = new Set(['version', 'name', 'node', 'npm', 'pnpm', 'yarn', 'python', 'edition', 'rust-version', 'go', 'swift-tools-version', 'requires-python']);

/** The dependencies a diff of a manifest adds and removes: names only. */
export function depsOf(diff) {
  const added = new Set();
  const removed = new Set();
  for (const line of String(diff).split('\n')) {
    if (/^(\+\+\+|---)/.test(line)) continue;
    const sign = line[0];
    if (sign !== '+' && sign !== '-') continue;
    const body = line.slice(1);
    const m = /^\s*"(@?[\w.-]+(?:\/[\w.-]+)?)"\s*:\s*"[~^>=<]*\d/.exec(body) // package.json, composer.json
      || /^\s*([A-Za-z0-9_.-]+)\s*(?:==|>=|<=|~=|>|<)\s*\d/.exec(body) // requirements.txt
      || /^\s*([\w-]+)\s*=\s*(?:"[~^>=<]*\d|\{)/.exec(body) // Cargo.toml, pyproject
      || /^\s*(?:require\s+)?([\w.-]+\/[\w./-]+)\s+v\d/.exec(body) // go.mod
      || /^\s*gem\s+["']([\w-]+)["']/.exec(body); // Gemfile
    // the fields of a manifest that look like a dependency and aren't one
    if (!m || NOT_DEPS.has(m[1])) continue;
    (sign === '+' ? added : removed).add(m[1]);
  }
  return {
    arrived: [...added].filter((d) => !removed.has(d)),
    left: [...removed].filter((d) => !added.has(d)),
    updated: [...added].filter((d) => removed.has(d)),
  };
}

/** The neighbourhood of a file: its first two folders ("server/newsroom"), or the root. */
const areaOf = (f) => {
  const parts = f.split('/');
  return parts.length > 2 ? parts.slice(0, 2).join('/') : parts.length === 2 ? parts[0] : '.';
};

/**
 * What changed in a project between two times: the commits (the owner's and the others'), the
 * areas of the tree, the files born and gone, the dependencies, the tags.
 */
export async function repoWork(repo, from, to, { me = null } = {}) {
  const range = [`--since=@${Math.floor(from / 1000)}`, `--until=@${Math.floor(to / 1000)}`];
  const log = await git(repo, ['log', '--all', '--no-merges', ...range, '--format=%x1e%H%x1f%an%x1f%ae%x1f%ct%x1f%s', '--numstat', '--no-renames']);
  const commits = [];
  for (const chunk of log.split('\x1e').slice(1)) {
    const [head, ...lines] = chunk.split('\n');
    const [hash, author, email, ct, subject] = head.split('\x1f');
    const files = [];
    for (const l of lines) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(l);
      if (m) files.push({ added: m[1] === '-' ? 0 : Number(m[1]), removed: m[2] === '-' ? 0 : Number(m[2]), path: m[3] });
    }
    commits.push({ hash: hash.slice(0, 10), author, mine: !me || email.toLowerCase() === me, ts: Number(ct) * 1000, subject, files });
  }
  commits.sort((a, b) => a.ts - b.ts);
  if (!commits.length) return { commits: [], areas: [], born: [], gone: [], deps: { arrived: [], left: [], updated: [] }, tags: [], added: 0, removed: 0 };

  const weight = new Map();
  let added = 0;
  let removed = 0;
  for (const c of commits) {
    for (const f of c.files) {
      added += f.added;
      removed += f.removed;
      weight.set(areaOf(f.path), (weight.get(areaOf(f.path)) || 0) + f.added + f.removed + 1);
    }
  }
  const total = [...weight.values()].reduce((a, b) => a + b, 0) || 1;
  const areas = [...weight].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([area, w]) => ({ area, share: Math.round((w / total) * 100) }));

  const [bornOut, goneOut, tagsOut] = await Promise.all([
    git(repo, ['log', '--all', '--no-merges', ...range, '--diff-filter=A', '--name-only', '--format=']),
    git(repo, ['log', '--all', '--no-merges', ...range, '--diff-filter=D', '--name-only', '--format=']),
    git(repo, ['for-each-ref', '--format=%(refname:short)%09%(creatordate:unix)', 'refs/tags']),
  ]);
  const born = [...new Set(bornOut.split('\n').filter(Boolean))];
  const gone = [...new Set(goneOut.split('\n').filter(Boolean))].filter((f) => !born.includes(f));
  const tags = tagsOut.split('\n').filter(Boolean).map((l) => l.split('\t')).filter(([, t]) => Number(t) * 1000 >= from && Number(t) * 1000 < to).map(([name]) => name);

  // the dependencies: the manifests' diffs over the period, commit by commit
  const deps = { arrived: new Set(), left: new Set(), updated: new Set() };
  for (const c of commits.filter((x) => x.files.some((f) => DEP_FILES.test(f.path))).slice(-20)) {
    const files = c.files.filter((f) => DEP_FILES.test(f.path)).map((f) => f.path);
    const d = depsOf(await git(repo, ['show', '--format=', c.hash, '--', ...files]));
    d.arrived.forEach((x) => { if (deps.left.has(x)) { deps.left.delete(x); deps.updated.add(x); } else deps.arrived.add(x); });
    d.left.forEach((x) => { if (deps.arrived.has(x)) deps.arrived.delete(x); else deps.left.add(x); });
    d.updated.forEach((x) => { if (!deps.arrived.has(x)) deps.updated.add(x); });
  }
  return {
    commits, areas, born, gone, tags, added, removed,
    deps: { arrived: [...deps.arrived], left: [...deps.left], updated: [...deps.updated] },
  };
}

/** Commits per day over the last `days` days (the project page's chart). */
export async function commitsPerDay(repo, { days = 30, now = Date.now() } = {}) {
  const out = await git(repo, ['log', '--all', '--no-merges', `--since=@${Math.floor((now - days * DAY) / 1000)}`, '--format=%ct']);
  const start = new Date(now - (days - 1) * DAY).setHours(0, 0, 0, 0);
  const bins = Array(days).fill(0);
  for (const l of out.split('\n').filter(Boolean)) {
    const i = Math.floor((Number(l) * 1000 - start) / DAY);
    if (i >= 0 && i < days) bins[i]++;
  }
  return { start, bins };
}

/** Every project of Interni, how it stands now (for the front page's box and the Settings). */
export async function interniStatus(store, config, { now = Date.now() } = {}) {
  const repos = interniRepos(store, config);
  const out = [];
  for (const r of repos) out.push({ ...r, ...(await repoStatus(r.path, now)) });
  return out;
}

const log2 = (n) => Math.log2(Math.max(1, n));

/**
 * The stories of Interni for an edition: one per project with work in the period, built from the
 * repository and joined with what the other sources saw of it (its files saved, the commands run
 * inside it, its reflog). Those stories leave the list; the project's story takes their place.
 * Returns the new list of stories and the board of every project, for the front page.
 */
export async function interniStories(store, config, stories, { from, to, now = Date.now() } = {}) {
  const repos = interniRepos(store, config).filter((r) => r.on);
  const { SECTIONS } = await import('./sections.js');
  let rest = stories;
  const made = [];
  const board = [];
  for (const r of repos) {
    const status = await repoStatus(r.path, now);
    const key = r.name.toLowerCase();
    const mine = (s) => s.project === key || String(s.repo || '').toLowerCase() === key;
    const matched = rest.filter(mine);
    const work = await repoWork(r.path, from, to, { me: status.me });
    board.push({ name: r.name, title: r.title, branch: status.branch, branches: status.branches, dirty: status.dirty, dirtySince: status.dirtySince, ahead: status.ahead, last: status.last, idleDays: status.idleDays, active: !!(work.commits.length || matched.length), commits: work.commits.length });
    if (!work.commits.length && !matched.length) continue;
    rest = rest.filter((s) => !mine(s));
    // the commits as events (the others' too: the reflog only knows the owner's), and what the other sources saw
    const commitEvents = work.commits.map((c) => ({ id: `interni:${r.name}:${c.hash}`, source: 'git', kind: 'commit', ts: c.ts, title: c.subject, detail: r.name, url: null, meta: { repo: r.name, author: c.author, mine: c.mine } }));
    const others = matched.flatMap((s) => s.events).filter((e) => e.source !== 'git');
    const events = [...commitEvents, ...others].sort((a, b) => a.ts - b.ts);
    if (!events.length) continue;
    const sessions = matched.filter((s) => s.kind === 'session' || s.kind === 'project');
    const commands = others.filter((e) => e.source === 'terminal');
    const folder = matched.find((s) => s.kind === 'folder') || matched.find((s) => s.folder)?.folder || null;
    const weight = Math.max(0, ...matched.map((s) => s.weight)) + 2 + log2(work.commits.length + 1) * 1.3
      + (work.commits.some((c) => !c.mine) ? 0.5 : 0) + (work.deps.arrived.length ? 0.4 : 0) + (work.tags.length ? 1 : 0);
    made.push({
      id: `interni:${r.name}`.replace(/[^\w:.-]+/g, '-'),
      source: 'git',
      section: SECTIONS.git.name,
      kind: 'cantiere',
      events,
      weight,
      first: events[0].ts,
      last: events.at(-1).ts,
      topic: r.title,
      project: key,
      repo: { name: r.name, title: r.title, description: status.description },
      work: { ...work, commits: work.commits.map(({ files, ...c }) => ({ ...c, files: files.length, added: files.reduce((a, f) => a + f.added, 0), removed: files.reduce((a, f) => a + f.removed, 0) })) },
      status: { branch: status.branch, dirty: status.dirty, dirtySince: status.dirtySince, ahead: status.ahead, idleDays: status.idleDays },
      commands: commands.length ? { all: commands.length, families: [...new Set(sessions.flatMap((s) => s.families || s.commands?.families || []))].slice(0, 6) } : null,
      saves: folder ? (folder.saves ?? folder.events?.length ?? null) : null,
      tools: matched.find((s) => s.tools?.length)?.tools || [],
    });
  }
  board.sort((a, b) => (b.active - a.active) || ((b.last || 0) - (a.last || 0)));
  return { stories: [...rest, ...made].sort((a, b) => b.weight - a.weight), board };
}
