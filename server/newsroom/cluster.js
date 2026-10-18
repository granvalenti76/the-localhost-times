/**
 * From the raw stream of events to "stories": groups of events worth an article.
 */
import { computeTime } from './time.js';
import { SECTIONS } from './sections.js';
import { hhmm, dayKey } from '../util.js';
import { tr, lang } from '../i18n.js';

const log2 = (n) => Math.log2(Math.max(1, n));

const groupBy = (arr, fn) => {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};

const uniqBy = (arr, fn) => {
  const seen = new Set();
  return arr.filter((x) => {
    const k = fn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// Keep subdomains with an identity of their own apart (mail.google.com ≠ google.com),
// but merge the trivial variants (www., m., mobile., language).
export function siteOf(host = '') {
  return host.replace(/^(www\d?|m|mobile|amp|[a-z]{2}(-[a-z]{2})?)\.(?=[^.]+\.[^.]+)/i, '');
}

export function registrable(host = '') {
  const p = host.split('.');
  if (p.length <= 2) return host;
  const sld = p[p.length - 2];
  if (p[p.length - 1].length === 2 && ['co', 'com', 'org', 'net', 'gov', 'ac', 'edu'].includes(sld)) {
    return p.slice(-3).join('.');
  }
  return p.slice(-2).join('.');
}

const cleanTitle = (t = '', site = '') =>
  t.replace(new RegExp(`\\s*[|\\-–—·:]\\s*(${site.split('.')[0]}|${site})[^|–—]*$`, 'i'), '').trim() || t;

const GENERIC_TITLE = /^(just a moment|attention required|one moment|un momento|caricamento|loading|redirecting|please wait|access denied|403 forbidden|404|page not found|home|homepage|login|accedi|sign in|log in|feed|explore|esplora|notifiche|notifications|messages|messaggi|amici|friends|watch|search|ricerca|untitled|nuova scheda|new tab)$/i;
export function isGeneric(title = '', site = '') {
  const t = title.toLowerCase().replace(/\s*[/|·–—-]\s*.*$/, '').replace(/[.…!]+$/, '').trim();
  const brand = registrable(site).split('.')[0];
  return t.length < 4 || t === site || t === brand || t.replace(/\s+/g, '') === brand || GENERIC_TITLE.test(t)
    || /^[\w.-]+\.[a-z]{2,}$/.test(t) || t.replace(/\(\d+\)\s*/, '') === brand;
}

const normSubject = (s = '') =>
  s.replace(/^\s*((re|r|fwd?|i|inoltra|aw|wg|tr|rif)\s*(\[\d+\])?\s*:\s*)+/i, '').trim().toLowerCase();

// housekeeping commands: counted, never quoted (moving around, looking, setting up the shell)
const TRIVIAL = new Set(['ls', 'cd', 'clear', 'pwd', 'exit', 'll', 'la', 'l', 'cls', 'history', 'z', 'j', 'which', 'echo', 'cat', 'nvm', 'source', 'export', 'tree', 'eza', 'exa', 'man', 'open', 'reset', 'whoami', 'date', 'true']);
export const isTrivial = (e) => TRIVIAL.has(e.meta?.family);

function story(source, kind, key, events, weight, extra = {}) {
  return {
    id: `${source}:${kind}:${key}`.replace(/[^\w:.-]+/g, '-').slice(0, 120),
    source,
    section: SECTIONS[source].name,
    kind,
    events,
    weight,
    first: events[0]?.ts,
    last: events[events.length - 1]?.ts,
    ...extra,
  };
}

const BROWSER = /safari|chrome|arc|firefox|brave|edge|orion|vivaldi|opera|zen/i;

/**
 * Attention: how many minutes each site really had. A visit owns the time until the next visit
 * (ten minutes at most), counted only while a browser was the app in front (the Apps source). A
 * feed reloaded a hundred times in five minutes weighs five minutes; an article read for forty,
 * forty. Without the Apps source there is no attention (null), and the counts decide as before.
 */
export function attentionBySite(visits, focus) {
  const browser = focus.filter((e) => e.kind === 'focus' && BROWSER.test(e.meta?.app || ''));
  if (!focus.length) return null;
  const sorted = [...visits].sort((a, b) => a.ts - b.ts);
  const out = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const from = sorted[i].ts;
    const to = Math.min(sorted[i + 1]?.ts ?? from + 10 * 60e3, from + 10 * 60e3);
    let ms = 0;
    for (const f of browser) {
      const a = Math.max(from, f.ts);
      const b = Math.min(to, f.meta?.end ?? f.ts + (f.meta?.seconds || 60) * 1000);
      if (b > a) ms += b - a;
    }
    const site = siteOf(sorted[i].meta?.host || '');
    out.set(site, (out.get(site) || 0) + ms);
  }
  return new Map([...out].map(([k, v]) => [k, Math.round(v / 60e3)]));
}

function safariStories(evs, all = []) {
  const out = [];
  const attention = attentionBySite(evs.filter((e) => e.kind === 'visit'), all.filter((e) => e.source === 'apps'));
  const searches = evs.filter((e) => e.kind === 'search');
  const visits = evs.filter((e) => e.kind === 'visit');
  const uniqSearches = uniqBy(searches, (e) => e.title.toLowerCase());
  if (uniqSearches.length) {
    out.push(story('safari', 'searches', 'all', uniqSearches, 2.5 + log2(uniqSearches.length + 1) * 1.2, {
      topic: uniqSearches[0].title,
    }));
  }
  const small = [];
  for (const [site, list] of groupBy(visits, (e) => siteOf(e.meta.host))) {
    const pages = uniqBy(list, (e) => e.title);
    if (pages.length >= 3) {
      pages.forEach((p) => { p.clean = cleanTitle(p.title, registrable(site)); p.generic = isGeneric(p.clean, site); });
      const informative = pages.filter((p) => !p.generic).length;
      // informative titles first (longer = more specific), generic ones last
      pages.sort((a, b) => (a.generic - b.generic) || (b.clean.length - a.clean.length));
      // the time really spent on it, when known; otherwise how many pages were opened
      const minutes = attention ? attention.get(site) || 0 : null;
      const weight = minutes == null
        ? 1.2 + log2(informative + 1) * 1.4 + log2(list.length) * 0.3
        : 1.2 + log2(informative + 1) * 0.6 + log2(minutes + 1) * 1.4 - (minutes < 3 ? 0.8 : 0);
      out.push(story('safari', 'site', site, list, weight, {
        topic: site, pages, informative, minutes,
      }));
    } else small.push(...list);
  }
  const sites = [...groupBy(small, (e) => siteOf(e.meta.host)).keys()];
  if (sites.length >= 2) {
    out.push(story('safari', 'roundup', 'web', small, 1 + log2(sites.length + 1) * 0.6, { topic: tr({ en: 'roundup', it: 'rassegna' }), sites }));
  } else if (small.length) {
    out.push(story('safari', 'roundup', 'web', small, 0.6, { topic: tr({ en: 'roundup', it: 'rassegna' }), sites }));
  }
  return out;
}

function webmailStory(evs) {
  const reads = uniqBy(evs.filter((e) => e.kind === 'read'), (e) => normSubject(e.title));
  const counts = evs.filter((e) => e.kind === 'inbox' && Number.isFinite(e.meta.unreadCount));
  if (!reads.length && !counts.length) return [];
  const unreadStart = counts[0]?.meta.unreadCount ?? null;
  const unreadEnd = counts.at(-1)?.meta.unreadCount ?? null;
  const all = evs.filter((e) => e.kind === 'read' || e.kind === 'inbox');
  return [story('mail', 'webmail', 'gmail', all, (reads.length ? 2.5 : 1) + log2(reads.length + 1) * 1.2 + (counts.length ? 0.4 : 0), {
    topic: reads[0]?.title || tr({ en: 'Inbox', it: 'Posta in arrivo' }),
    reads,
    service: evs[0].meta.webmail || 'Gmail',
    unreadStart,
    unreadEnd,
    inboxChecks: counts.length,
  })];
}

function mailStories(all) {
  const out = webmailStory(all.filter((e) => e.meta.webmail));
  const evs = all.filter((e) => !e.meta.webmail);
  const rest = [];
  for (const [subj, list] of groupBy(evs, (e) => normSubject(e.title))) {
    const sent = list.filter((e) => e.kind === 'sent');
    const people = [...new Set(list.map((e) => (e.kind === 'sent' ? e.meta.to?.[0] : e.meta.fromName || e.meta.from)).filter(Boolean))];
    const allNews = list.every((e) => e.meta.newsletter);
    if (!allNews && (list.length >= 2 || sent.length)) {
      out.push(story('mail', 'thread', subj || 'senza-oggetto' /* kept as is: it is part of story ids already in the database */, list, (sent.length ? 4 : 3) + list.length * 0.45, {
        topic: list[0].title, people, sentCount: sent.length,
      }));
    } else rest.push(...list);
  }
  if (rest.length) {
    out.push(story('mail', 'inbox', 'all', rest, 1.4 + log2(rest.length) * 0.9, {
      topic: tr({ en: 'incoming mail', it: 'posta in arrivo' }),
      newsletters: rest.filter((e) => e.meta.newsletter).length,
      unread: rest.filter((e) => e.meta.unread).length,
    }));
  }
  return out;
}

/**
 * Where each command ran, as far as the history tells: it has no working directory, but the `cd`
 * commands say where the owner moved. Commands after a `cd` into a known project belong to it.
 */
export function projectOfCommands(evs, projects) {
  const names = [...projects].filter(Boolean).map((p) => p.toLowerCase());
  const out = new Map();
  if (!names.length) return out;
  let cwd = '';
  for (const e of [...evs].sort((a, b) => a.ts - b.ts)) {
    const m = /^\s*cd\s+(.+?)\s*(?:&&.*)?$/.exec(e.title || '');
    if (m) {
      const to = m[1].replace(/^["']|["']$/g, '');
      if (to.startsWith('/') || to.startsWith('~')) cwd = to;
      else if (to === '-' || to === '') cwd = '';
      else for (const part of to.split('/')) cwd = part === '..' ? cwd.split('/').slice(0, -1).join('/') : part === '.' ? cwd : `${cwd}/${part}`;
    }
    const low = cwd.toLowerCase();
    const hit = names.find((p) => low.split('/').includes(p));
    if (hit) out.set(e.id, hit);
  }
  return out;
}

function terminalStories(evs, all = [], projects = new Set()) {
  if (!evs.length) return [];
  // commands run inside a known project go to that project's story (see mergeProjects)
  const where = projectOfCommands(evs, projects);
  const byProject = groupBy(evs.filter((e) => where.has(e.id)), (e) => where.get(e.id));
  const rest = evs.filter((e) => !where.has(e.id));
  const out = [...byProject].map(([p, list]) => ({ ...sessionStory(list, `project-${p}`), project: p }));
  if (rest.length) out.push(sessionStory(rest, 'all'));
  return out;
}

function sessionStory(evs, key) {
  const serious = evs.filter((e) => !TRIVIAL.has(e.meta.family));
  const fam = [...groupBy(serious, (e) => e.meta.family)].map(([f, l]) => ({ family: f, count: l.length }))
    .sort((a, b) => b.count - a.count);
  const commits = serious
    .filter((e) => e.meta.family === 'git commit')
    .map((e) => {
      const m = /-[a-z]*m\s+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(e.title);
      return m && (m[1] ?? m[2] ?? m[3]);
    })
    .filter(Boolean);
  const hosts = serious.filter((e) => e.meta.family === 'ssh').map((e) => e.title.split(/\s+/).pop());
  const weight = serious.length ? 2 + log2(serious.length + 1) * 1.3 + commits.length * 0.6 : 0.5;
  return story('terminal', 'session', key, evs, weight, {
    topic: fam[0]?.family || tr({ en: 'terminal', it: 'terminale' }), families: fam.slice(0, 8), commits, hosts: [...new Set(hosts)],
    serious: serious.length,
  });
}

function perKey(source, kind, keyFn, baseWeight, weightFn) {
  return (evs) => [...groupBy(evs, keyFn)].map(([k, list]) =>
    story(source, kind, k, list, baseWeight + weightFn(list), { topic: list[0].title }));
}

const notesStories = perKey('notes', 'note', (e) => e.meta.noteId, 3,
  (l) => l.length * 0.4 + (l.some((e) => e.kind === 'created') ? 0.8 : 0) + (l.at(-1).meta.snippet?.length > 200 ? 0.6 : 0));
const journalStories = perKey('journal', 'entry', (e) => e.id.split(':').slice(0, 3).join(':'), 2.5,
  (l) => (l.at(-1).meta.text ? 2.5 : 0) + Math.min(1.5, (l.at(-1).meta.words || 0) / 200));
const podcastStories = perKey('podcasts', 'episode', (e) => e.meta.episodeId, 3,
  (l) => Math.min(3, (l.at(-1).meta.playhead || 0) / 900));
const bookStories = perKey('books', 'book', (e) => e.meta.assetId, 3,
  (l) => l.filter((e) => e.kind === 'highlight').length * 0.8);

/** Files: hot folders (one story each), small ones together, and the downloads. */
function filesStories(evs) {
  const out = [];
  const dls = evs.filter((e) => e.kind === 'downloaded');
  const work = evs.filter((e) => e.kind !== 'downloaded');
  const countBy = (list, fn) => Object.entries(list.reduce((m, e) => { const k = fn(e); if (k) m[k] = (m[k] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
  const small = [];
  for (const [folder, list] of groupBy(work, (e) => e.meta.folder)) {
    // with file names hidden (the default) files can't be told apart: count saves instead
    const named = !/^\./.test(list[0].title);
    const files = named ? new Set(list.map((e) => `${e.meta.dir}/${e.title}`)).size : null;
    if (list.length >= 3) {
      out.push(story('files', 'folder', folder, list, 1.5 + log2(list.length + 1) * 1.1 + (list[0].meta.project ? 0.6 : 0), {
        topic: folder,
        project: list[0].meta.project ? String(list[0].meta.project).toLowerCase() : null,
        projectName: list[0].meta.project || null,
        files,
        created: list.filter((e) => e.kind === 'created').length,
        exts: countBy(list, (e) => e.meta.ext).slice(0, 5),
        dirs: countBy(list, (e) => (e.meta.dir === folder ? '.' : e.meta.dir.startsWith(`${folder}/`) ? e.meta.dir.slice(folder.length + 1) : e.meta.dir)).slice(0, 4),
      }));
    } else small.push(...list);
  }
  if (small.length >= 2) {
    out.push(story('files', 'folders', 'misc', small, 0.8 + log2(small.length) * 0.5, {
      topic: tr({ en: 'files', it: 'file' }), folders: countBy(small, (e) => e.meta.folder).slice(0, 6),
    }));
  }
  if (dls.length) {
    out.push(story('files', 'downloads', 'all', dls, 2 + log2(dls.length + 1), {
      topic: tr({ en: 'downloads', it: 'download' }),
      sites: countBy(dls, (e) => e.meta.site).slice(0, 5),
      exts: countBy(dls, (e) => e.meta.ext).slice(0, 5),
    }));
  }
  return out;
}

/** Time: one story for the hour, how it was split between apps. */
function appsStories(evs) {
  const focus = evs.filter((e) => e.kind === 'focus' && e.meta?.app);
  if (!focus.length) return [];
  const start = Math.min(...evs.map((e) => e.ts));
  const end = Math.max(...evs.map((e) => e.meta?.end ?? e.ts));
  const t = computeTime(evs, start, end);
  if (!t || t.active < 10) return []; // ten minutes at least, or it isn't a story
  const seq = focus.sort((a, b) => a.ts - b.ts);
  return [story('apps', 'timesheet', 'hour', seq, 1.6 + Math.min(1.5, t.switches / 25) + (t.longest?.minutes >= 40 ? 1 : 0) + Math.min(1, t.active / 60), {
    topic: t.apps[0]?.name,
    time: t,
  })];
}

/** The photographer: what was shot in the hour, counted. */
function photosStories(evs) {
  const count = (fn) => evs.filter(fn).length;
  const photos = count((e) => e.kind === 'photo');
  const videos = count((e) => e.kind === 'video');
  const shots = count((e) => e.kind === 'screenshot');
  const imported = count((e) => e.kind === 'imported');
  if (!photos && !videos && !shots && !imported) return [];
  // a burst: five or more pictures within two minutes
  const pics = evs.filter((e) => e.kind === 'photo').sort((a, b) => a.ts - b.ts);
  let burst = 0;
  for (let i = 0, j = 0; i < pics.length; i++) {
    while (pics[i].ts - pics[j].ts > 120e3) j++;
    burst = Math.max(burst, i - j + 1);
  }
  return [story('photos', 'shots', 'hour', [...evs].sort((a, b) => a.ts - b.ts), 1.2 + log2(photos + videos + 1) * 1.1 + log2(shots + 1) * 0.6 + (burst >= 5 ? 0.8 : 0), {
    topic: tr({ en: 'photos', it: 'foto' }),
    counts: {
      photos, videos, shots, imported,
      macShots: count((e) => e.kind === 'screenshot' && e.meta?.mac),
      live: count((e) => e.meta?.subtype === 'live'),
      panorama: count((e) => e.meta?.subtype === 'panorama'),
      slomo: count((e) => e.meta?.subtype === 'slomo'),
      favorites: count((e) => e.meta?.favorite),
      videoSeconds: evs.filter((e) => e.kind === 'video').reduce((t, e) => t + (e.meta?.seconds || 0), 0),
      burst: burst >= 5 ? burst : 0,
    },
  })];
}

/** Git: one story per repository with something done in it (commits, merges, branch switches). */
function gitStories(evs) {
  const out = [];
  for (const [repo, list] of groupBy(evs, (e) => e.meta?.repo || e.detail)) {
    const commits = list.filter((e) => ['commit', 'amend', 'merge'].includes(e.kind));
    const added = commits.reduce((t, e) => t + (e.meta.added || 0), 0);
    const removed = commits.reduce((t, e) => t + (e.meta.removed || 0), 0);
    const sized = commits.some((e) => e.meta.added != null);
    const branches = [...new Set(list.map((e) => e.meta.branch).filter(Boolean))];
    const weight = commits.length
      ? 2.4 + log2(commits.length + 1) * 1.4 + Math.min(1.5, log2((added + removed) / 80 + 1) * 0.5) + (list.some((e) => e.kind === 'merge') ? 0.5 : 0)
      : 0.9 + list.length * 0.2;
    out.push(story('terminal', 'commits', `git-${repo}`, list, weight, {
      topic: repo, repo, project: String(repo || '').toLowerCase() || null, projectName: repo, commits: commits.length, branches,
      lines: sized ? { added, removed, files: commits.reduce((t, e) => t + (e.meta.files || 0), 0) } : null,
    }));
  }
  return out;
}

/** Reminders: what was ticked off and what was added, in one story. */
function remindersStories(evs) {
  const done = evs.filter((e) => e.kind === 'done');
  const added = evs.filter((e) => e.kind === 'added');
  if (!done.length && added.length < 2) return [];
  return [story('notes', 'todo', 'reminders', [...evs].sort((a, b) => a.ts - b.ts), 1.4 + done.length * 0.7 + log2(added.length + 1) * 0.4, {
    topic: tr({ en: 'reminders', it: 'promemoria' }), done: done.length, added: added.length,
  })];
}

const BUILDERS = {
  safari: safariStories, mail: mailStories, terminal: terminalStories, notes: notesStories,
  journal: journalStories, podcasts: podcastStories, books: bookStories, files: filesStories,
  apps: appsStories, photos: photosStories, git: gitStories, reminders: remindersStories,
};

// the apps where the work on a project happens (the editor, the terminal, the assistant)
const DEV_APPS = /code|cursor|xcode|zed|nova|sublime|bbedit|intellij|webstorm|pycharm|android studio|terminal|iterm|ghostty|warp|kitty|alacritty|wezterm|claude|chatgpt|tower|fork|sourcetree|github desktop|electron/i;

/**
 * One story per project: when a project shows up in more than one source (its folder saved, its
 * repository committed, commands run inside it), the pieces become one. The page then tells the
 * work as it was: the files, the commits, the commands, the tools in front, the project's pages
 * on GitHub.
 */
export function mergeProjects(stories, events = []) {
  const groups = groupBy(stories.filter((x) => x.project), (x) => x.project);
  const out = stories.filter((x) => !x.project);
  for (const [p, list] of groups) {
    const kinds = new Set(list.map((x) => x.kind));
    if (list.length < 2 || kinds.size < 2) { out.push(...list); continue; }
    const evs = list.flatMap((x) => x.events).sort((a, b) => a.ts - b.ts);
    const first = evs[0].ts;
    const last = evs.at(-1).ts;
    const folder = list.find((x) => x.kind === 'folder');
    const git = list.find((x) => x.kind === 'commits');
    const sessions = list.filter((x) => x.kind === 'session');
    // the tools in front while the work went on, and the project's own pages on GitHub
    const tm = computeTime(events, first - 5 * 60e3, last + 5 * 60e3);
    const tools = (tm?.apps || []).filter((a) => DEV_APPS.test(a.name)).slice(0, 4);
    const pages = events.filter((e) => e.source === 'safari' && e.kind === 'visit' && e.ts >= first - 30 * 60e3 && e.ts <= last + 30 * 60e3
      && /github\.com|gitlab\.com/.test(e.meta?.host || '') && String(e.url || '').toLowerCase().includes(`/${p}`));
    const commands = sessions.flatMap((x) => x.events);
    out.push(story('terminal', 'project', p, evs, Math.max(...list.map((x) => x.weight)) + 1 + log2(list.length) * 0.5 + (tools.length ? 0.3 : 0), {
      topic: list.find((x) => x.projectName)?.projectName || p,
      project: p,
      folder: folder ? { saves: folder.events.length, created: folder.created, exts: folder.exts, dirs: folder.dirs } : null,
      git: git ? { repo: git.repo, commits: git.commits, branches: git.branches, lines: git.lines, events: git.events } : null,
      commands: commands.length ? { all: commands.length, serious: commands.filter((e) => !isTrivial(e)).length, families: sessions.flatMap((x) => x.families).slice(0, 6), events: commands } : null,
      tools,
      pages: uniqBy(pages, (e) => e.title).slice(0, 6),
    }));
  }
  return out;
}

export function buildStories(events) {
  const out = [];
  const bySource = groupBy(events, (e) => e.source);
  // the projects known to the files and git sources: the terminal follows the owner into them
  const projects = new Set([
    ...(bySource.get('files') || []).map((e) => e.meta?.project && String(e.meta.project).toLowerCase()),
    ...(bySource.get('git') || []).map((e) => e.meta?.repo && String(e.meta.repo).toLowerCase()),
  ].filter(Boolean));
  for (const [src, list] of bySource) {
    if (src === 'editor') continue; // the Editor's dispatches: placed below, once the stories exist
    if (src === 'terminal') out.push(...terminalStories(list, events, projects));
    else if (src === 'safari') out.push(...safariStories(list, events));
    else if (BUILDERS[src]) out.push(...BUILDERS[src](list));
  }
  return placeDispatches(mergeTwins(mergeProjects(out, events)), bySource.get('editor') || []).sort((a, b) => b.weight - a.weight);
}

/**
 * Twins: stories of the same kind, from the same source, with the same subject (the same diary
 * title written every hour, the same mail subject in two threads) become one, with all their
 * signals: the paper never prints the same headline twice.
 */
export function mergeTwins(stories) {
  const groups = groupBy(stories, (s) => `${s.source}|${s.kind}|${String(s.topic ?? s.id).trim().toLowerCase()}`);
  const out = [];
  for (const list of groups.values()) {
    if (list.length < 2) { out.push(list[0]); continue; }
    const head = list.reduce((a, b) => (b.weight > a.weight ? b : a));
    const events = list.flatMap((s) => s.events).sort((a, b) => a.ts - b.ts);
    out.push({ ...head, events, first: events[0].ts, last: events.at(-1).ts, weight: head.weight + log2(list.length) * 0.5, twins: list.length });
  }
  return out;
}

const DISPATCH_WEIGHT = { brief: 4, article: 8, lead: 14 };

/**
 * The Editor's dispatches: one tied to a story in the works becomes a fact of that story (and
 * pushes it up); the others become pieces of their own, in the section the Editor chose, as big as
 * the Editor asked.
 */
export function placeDispatches(stories, dispatches) {
  for (const e of dispatches) {
    const target = e.meta?.storyId && stories.find((s) => s.id === e.meta.storyId);
    const w = DISPATCH_WEIGHT[e.meta?.size] ?? DISPATCH_WEIGHT.article;
    if (target) {
      target.dispatches = [...(target.dispatches || []), e];
      target.weight += w / 3;
      continue;
    }
    const section = SECTIONS[e.meta?.section] ? e.meta.section : 'notes';
    stories.push(story(section, 'dispatch', e.id.split(':')[1], [e], w, { topic: e.title, dispatches: [e], size: e.meta?.size || 'article' }));
  }
  return stories;
}

/** How the paper may attribute the Editor's note. */
function attributionLine(a, T) {
  if (a === 'editor') return T('Attribute it to the Editor: “the Editor reports”, “according to the Editor”.', 'Attribuiscilo al Direttore: «riferisce il Direttore», «secondo il Direttore».');
  if (a === 'source') return T('Attribute it to “a source close to the owner”: never name the Editor.', 'Attribuiscilo a «una fonte vicina al proprietario»: non nominare mai il Direttore.');
  return T('The paper knows it: tell it as a fact, without attribution.', 'Il giornale lo sa: raccontalo come un fatto, senza attribuzione.');
}

function moment(ms) {
  const h = new Date(ms).getHours();
  const [night, morning, noon, afternoon, evening] = tr({
    en: ['night', 'morning', 'midday', 'afternoon', 'evening'],
    it: ['notte', 'mattina', 'mezzogiorno', 'pomeriggio', 'sera'],
  });
  if (h < 6) return night;
  if (h < 12) return morning;
  if (h < 14) return noon;
  if (h < 19) return afternoon;
  return evening;
}

/** The story described in words, for the writer (the LLM). */
export function factSheet(s) {
  const en = lang() === 'en';
  const q = (x) => (en ? `“${x}”` : `«${x}»`);
  const T = (e, i) => (en ? e : i);
  const L = [];
  // a story that crosses midnight (a daily or weekly paper) says the day as well as the time
  const days = dayKey(s.first) !== dayKey(s.last);
  const wd = new Intl.DateTimeFormat(en ? 'en-GB' : 'it-IT', { weekday: 'short' });
  const t = (e) => (days ? `${wd.format(e.ts)} ${hhmm(e.ts)}` : hhmm(e.ts));
  L.push(T(`Section: ${s.section}`, `Sezione: ${s.section}`));
  L.push(T(`Time span: ${t({ ts: s.first })}–${t({ ts: s.last })} (time of day: ${moment(s.first)})`, `Intervallo: ${t({ ts: s.first })}–${t({ ts: s.last })} (momento della giornata: ${moment(s.first)})`));
  switch (s.kind) {
    case 'searches':
      L.push(T(`Web searches (${s.events.length}):`, `Ricerche fatte sul web (${s.events.length}):`));
      s.events.slice(0, 30).forEach((e) => L.push(`- ${t(e)} [${e.detail}] ${q(e.title)}`));
      break;
    case 'site':
      L.push(T(`Site: ${s.topic} — ${s.events.length} visits, ${s.pages.length} different pages.`, `Sito: ${s.topic} — ${s.events.length} visite, ${s.pages.length} pagine diverse.`));
      // the time really spent on it: many visits in few minutes is scrolling, few visits in many minutes is reading
      if (s.minutes != null) L.push(T(`Time with the site in front: about ${s.minutes} min${s.minutes < 3 && s.events.length > 10 ? ' (many pages in little time: scrolling, not reading)' : ''}.`, `Tempo con il sito davanti: circa ${s.minutes} min${s.minutes < 3 && s.events.length > 10 ? ' (tante pagine in poco tempo: scorrere, non leggere)' : ''}.`));
      [...s.pages].sort((a, b) => a.ts - b.ts).slice(0, 25).forEach((e) => L.push(`- ${t(e)} ${q(e.clean)}${e.generic ? T(' (generic page)', ' (pagina generica)') : ''}`));
      break;
    case 'roundup':
      L.push(T(`Short visits to different sites (${s.events.length}):`, `Visite brevi su siti diversi (${s.events.length}):`));
      uniqBy(s.events, (e) => e.title).slice(0, 20).forEach((e) => L.push(`- ${t(e)} ${e.meta.host}: ${q(e.title)}`));
      break;
    case 'thread':
      L.push(T(`Email conversation ${q(s.topic)} — ${s.events.length} messages, ${s.sentCount} sent by the owner.`, `Conversazione email ${q(s.topic)} — ${s.events.length} messaggi, ${s.sentCount} inviati dal proprietario.`));
      s.events.forEach((e) => L.push(`- ${t(e)} ${e.kind === 'sent'
        ? T(`SENT to ${e.meta.to?.join(', ') || '?'}`, `INVIATA a ${e.meta.to?.join(', ') || '?'}`)
        : T(`RECEIVED from ${e.meta.fromName || e.meta.from}`, `RICEVUTA da ${e.meta.fromName || e.meta.from}`)}: ${q(e.title)}${e.meta.summary ? ` — ${e.meta.summary}` : ''}`));
      break;
    case 'webmail':
      L.push(T(`Mail read in ${s.service} in the browser: ${s.reads.length} emails opened, inbox checked ${s.inboxChecks} times.`, `Posta letta su ${s.service} nel browser: ${s.reads.length} email aperte, casella controllata ${s.inboxChecks} volte.`));
      if (s.unreadEnd != null) {
        const v = s.unreadStart === s.unreadEnd ? s.unreadEnd : T(`from ${s.unreadStart} to ${s.unreadEnd}`, `da ${s.unreadStart} a ${s.unreadEnd}`);
        L.push(T(`Unread messages in the inbox: ${v}.`, `Messaggi non letti in casella: ${v}.`));
      }
      s.reads.slice(0, 25).forEach((e) => L.push(T(`- ${t(e)} opened the email ${q(e.title)}`, `- ${t(e)} aperta l'email ${q(e.title)}`)));
      L.push(T('(We know nothing about senders or text: only the subjects.)', '(Del mittente e del testo non sappiamo nulla: conosciamo solo gli oggetti.)'));
      break;
    case 'inbox':
      L.push(T(`Incoming mail: ${s.events.length} messages (${s.newsletters} newsletters/notifications, ${s.unread} still unread).`, `Posta in arrivo: ${s.events.length} messaggi (${s.newsletters} newsletter/notifiche, ${s.unread} ancora da leggere).`));
      s.events.slice(0, 25).forEach((e) => L.push(`- ${t(e)} ${T('from', 'da')} ${e.meta.fromName || e.meta.from}${e.meta.newsletter ? ' (newsletter)' : ''}: ${q(e.title)}`));
      break;
    case 'session':
      L.push(T(`Terminal commands: ${s.events.length} in all, ${s.serious} non-trivial.`, `Comandi nel terminale: ${s.events.length} totali, ${s.serious} non banali.`));
      if (s.families.length) L.push(`${T('Command families', 'Famiglie di comandi')}: ${s.families.map((f) => `${f.family} ×${f.count}`).join(', ')}`);
      if (s.commits.length) L.push(`${T('Git commit messages', 'Messaggi di commit git')}: ${s.commits.map(q).join('; ')}`);
      if (s.hosts.length) L.push(`${T('ssh connections to', 'Connessioni ssh verso')}: ${s.hosts.join(', ')}`);
      L.push(T('Some commands:', 'Alcuni comandi:'));
      s.events.filter((e) => !TRIVIAL.has(e.meta.family)).slice(-25).forEach((e) => L.push(`- ${e.meta.timed ? t(e) : '~'} $ ${e.title.slice(0, 160)}`));
      break;
    case 'note': {
      const last = s.events.at(-1);
      const created = s.events.some((e) => e.kind === 'created');
      L.push(T(
        `Note ${q(last.title)}${last.meta.folder ? ` in the folder ${q(last.meta.folder)}` : ''}: ${created ? 'created' : 'edited'} (${s.events.length} saves).`,
        `Nota ${q(last.title)}${last.meta.folder ? ` nella cartella ${q(last.meta.folder)}` : ''}: ${created ? 'creata' : 'modificata'} (${s.events.length} salvataggi).`,
      ));
      if (last.meta.locked) L.push(T('The note is password-protected: contents not available.', 'La nota è protetta da password: contenuto non disponibile.'));
      if (last.meta.snippet) L.push(`${T('Excerpt', 'Estratto')}: ${q(last.meta.snippet)}`);
      break;
    }
    case 'entry': {
      const e = s.events.at(-1);
      L.push(T(
        `New entry in the personal diary (Journal app) at ${t(e)}.${e.title ? ` Title: ${q(e.title)}.` : ''}${e.meta.words ? ` About ${e.meta.words} words.` : ''}`,
        `Nuova voce nel diario personale (app Journal) alle ${t(e)}.${e.title ? ` Titolo: ${q(e.title)}.` : ''}${e.meta.words ? ` Circa ${e.meta.words} parole.` : ''}`,
      ));
      L.push(e.meta.text
        ? `${T('Text', 'Testo')}: ${q(e.meta.text)}`
        : T('The contents are private: don\'t quote or invent them, respect the privacy.', 'Il contenuto è riservato: non citarlo e non inventarlo, rispetta la riservatezza.'));
      break;
    }
    case 'episode': {
      const e = s.events.at(-1);
      const m = e.meta;
      L.push(`${T('Podcast', 'Podcast')} ${q(m.show || '?')}${m.author ? ` (${m.author})` : ''}, ${T('episode', 'episodio')} ${q(e.title)}.`);
      if (m.duration) L.push(T(`Length ${Math.round(m.duration / 60)} min; listened up to minute ${Math.round((m.playhead || 0) / 60)}.`, `Durata ${Math.round(m.duration / 60)} min; ascoltato fino al minuto ${Math.round((m.playhead || 0) / 60)}.`));
      if (m.description) L.push(`${T('Episode description', 'Descrizione dell\'episodio')}: ${m.description}`);
      break;
    }
    case 'folder': {
      L.push(T(
        `Folder ${q(s.topic)}${s.project ? ` (git project ${q(s.project)})` : ''}: ${s.events.length} saves${s.files ? ` on ${s.files} files` : ''}, ${s.created} of them new files. File names are private.`,
        `Cartella ${q(s.topic)}${s.project ? ` (progetto git ${q(s.project)})` : ''}: ${s.events.length} salvataggi${s.files ? ` su ${s.files} file` : ''}, di cui ${s.created} file nuovi. I nomi dei file sono riservati.`,
      ));
      if (s.exts.length) L.push(`${T('File types', 'Tipi di file')}: ${s.exts.map((x) => `.${x.k} ×${x.n}`).join(', ')}`);
      if (s.dirs.length > 1) L.push(`${T('Subfolders', 'Sottocartelle')}: ${s.dirs.map((x) => `${x.k} ×${x.n}`).join(', ')}`);
      if (!/^\./.test(s.events[0].title)) L.push(`${T('Files', 'File')}: ${[...new Set(s.events.map((e) => e.title))].slice(0, 12).map(q).join(', ')}`);
      L.push(`${T('First and last save', 'Primo e ultimo salvataggio')}: ${hhmm(s.first)}, ${hhmm(s.last)}`);
      break;
    }
    case 'folders':
      L.push(T(`A few files saved here and there (${s.events.length}):`, `Qualche file salvato qua e là (${s.events.length}):`));
      s.folders.forEach((f) => L.push(`- ${q(f.k)} ×${f.n}`));
      break;
    case 'downloads':
      L.push(T(`Downloads: ${s.events.length} files.`, `Download: ${s.events.length} file.`));
      s.events.slice(0, 20).forEach((e) => L.push(`- ${t(e)} ${q(e.title)}${e.meta.site ? ` ${T('from', 'da')} ${e.meta.site}` : ''}${e.meta.size ? ` (${Math.max(1, Math.round(e.meta.size / 1e6))} MB)` : ''}`));
      break;
    case 'timesheet': {
      const tm = s.time;
      const mm = (n) => T(`${n} min`, `${n} min`);
      L.push(T(
        `Time at the Mac, by app in front (sampled every minute): ${mm(tm.active)} in use${tm.away ? `, ${mm(tm.away)} away (no keyboard or trackpad)` : ''}.`,
        `Tempo al Mac, per app in primo piano (campionato ogni minuto): ${mm(tm.active)} di uso${tm.away ? `, ${mm(tm.away)} lontano (né tastiera né trackpad)` : ''}.`,
      ));
      L.push(`${T('Minutes per app', 'Minuti per app')}: ${tm.apps.map((a) => `${a.name} ${a.minutes}`).join(', ')}${tm.others ? `, ${T('others', 'altre')} ${tm.others}` : ''}`);
      L.push(T(`Switches between apps: ${tm.switches}.`, `Cambi di app: ${tm.switches}.`));
      if (tm.longest) L.push(T(`Longest uninterrupted stretch: ${tm.longest.app}, ${tm.longest.minutes} min (${hhmm(tm.longest.from)}–${hhmm(tm.longest.to)}).`, `Tratto più lungo senza interruzioni: ${tm.longest.app}, ${tm.longest.minutes} min (${hhmm(tm.longest.from)}–${hhmm(tm.longest.to)}).`));
      L.push(T('Sequence (time, app, minutes):', 'Sequenza (ora, app, minuti):'));
      s.events.slice(0, 30).forEach((e) => L.push(`- ${t(e)} ${e.meta.app} ${Math.max(1, Math.round((e.meta.seconds || 0) / 60))}`));
      L.push(T('Only app names are known: not what was on screen.', 'Si conoscono solo i nomi delle app: non cosa c\'era sullo schermo.'));
      break;
    }
    case 'shots': {
      const c = s.counts;
      const parts = [
        c.photos ? T(`${c.photos} photos`, `${c.photos} foto`) : null,
        c.videos ? T(`${c.videos} videos (${Math.round(c.videoSeconds)} seconds in all)`, `${c.videos} video (${Math.round(c.videoSeconds)} secondi in tutto)`) : null,
        c.shots ? T(`${c.shots} screenshots (${c.macShots} on the Mac)`, `${c.shots} screenshot (${c.macShots} sul Mac)`) : null,
        c.imported ? T(`${c.imported} older pictures imported`, `${c.imported} immagini vecchie importate`) : null,
      ].filter(Boolean);
      L.push(`${T('Pictures', 'Immagini')}: ${parts.join(', ')}.`);
      const extra = [c.live && T(`${c.live} Live Photos`, `${c.live} Live Photo`), c.panorama && T(`${c.panorama} panoramas`, `${c.panorama} panoramiche`), c.slomo && T(`${c.slomo} slow motion`, `${c.slomo} al rallentatore`), c.favorites && T(`${c.favorites} marked as favourite`, c.favorites === 1 ? '1 segnata come preferita' : `${c.favorites} segnate come preferite`), c.burst && T(`a burst of ${c.burst} photos within two minutes`, `una raffica di ${c.burst} foto in due minuti`)].filter(Boolean);
      if (extra.length) L.push(extra.join('; ') + '.');
      L.push(T('Times:', 'Orari:'));
      s.events.slice(0, 20).forEach((e) => L.push(`- ${t(e)} ${e.title}${e.meta?.subtype && !['screenshot'].includes(e.meta.subtype) ? ` (${e.meta.subtype})` : ''}${e.meta?.favorite ? ' ★' : ''}`));
      L.push(T('The pictures themselves, the places and the people are never seen: only what kind of shot and when.', 'Le immagini, i luoghi e le persone non si vedono mai: solo il tipo di scatto e l\'ora.'));
      break;
    }
    case 'project': {
      L.push(T(`Work on the project ${q(s.topic)}, seen from several sides of the Mac.`, `Lavoro sul progetto ${q(s.topic)}, visto da più parti del Mac.`));
      if (s.folder) {
        L.push(T(`Files: ${s.folder.saves} saves, ${s.folder.created} new files. File names are private.`, `File: ${s.folder.saves} salvataggi, ${s.folder.created} file nuovi. I nomi dei file sono riservati.`));
        if (s.folder.exts?.length) L.push(`${T('File types', 'Tipi di file')}: ${s.folder.exts.map((x) => `.${x.k} ×${x.n}`).join(', ')}`);
        if (s.folder.dirs?.length > 1) L.push(`${T('Parts of the project', 'Parti del progetto')}: ${s.folder.dirs.map((x) => `${x.k} ×${x.n}`).join(', ')}`);
      }
      if (s.git) {
        const commits = s.git.events.filter((e) => ['commit', 'amend', 'merge'].includes(e.kind));
        L.push(T(`Git: ${commits.length} commit${commits.length === 1 ? '' : 's'}${s.git.branches.length ? ` on ${s.git.branches.map(q).join(', ')}` : ''}${s.git.lines ? `, +${s.git.lines.added} −${s.git.lines.removed} lines` : ''}.`, `Git: ${commits.length} commit${s.git.branches.length ? ` sul ramo ${s.git.branches.map(q).join(', ')}` : ''}${s.git.lines ? `, +${s.git.lines.added} −${s.git.lines.removed} righe` : ''}.`));
        commits.slice(-10).forEach((e) => L.push(`- ${t(e)} ${T('commit', 'commit')}: ${q(e.title)}`));
      }
      if (s.commands) {
        L.push(T(`Terminal, inside the project: ${s.commands.all} commands, ${s.commands.serious} non-trivial.`, `Terminale, dentro il progetto: ${s.commands.all} comandi, ${s.commands.serious} non banali.`));
        s.commands.events.filter((e) => !TRIVIAL.has(e.meta.family)).slice(-12).forEach((e) => L.push(`- ${e.meta.timed ? t(e) : '~'} $ ${e.title.slice(0, 140)}`));
      }
      if (s.tools?.length) L.push(`${T('Tools in front meanwhile', 'Strumenti in primo piano intanto')}: ${s.tools.map((a) => `${a.name} ${a.minutes} min`).join(', ')}.`);
      if (s.pages?.length) L.push(`${T('The project\'s pages read on the web', 'Pagine del progetto lette sul web')}: ${s.pages.map((e) => q(e.title)).join(', ')}.`);
      L.push(T('Tell the work as one thing: what was being built, how far it went. Commit messages are the owner\'s: quote them as they are. No lessons on programming.', 'Racconta il lavoro come una cosa sola: cosa si stava costruendo, fin dove è arrivato. I messaggi di commit sono del proprietario: citali così come sono. Niente lezioni di programmazione.'));
      break;
    }
    case 'commits': {
      const commits = s.events.filter((e) => ['commit', 'amend', 'merge'].includes(e.kind));
      L.push(T(
        `Git repository ${q(s.repo)}${s.branches.length ? ` (branch ${s.branches.map(q).join(', ')})` : ''}: ${commits.length} commit${commits.length === 1 ? '' : 's'} made on this Mac.`,
        `Repository git ${q(s.repo)}${s.branches.length ? ` (ramo ${s.branches.map(q).join(', ')})` : ''}: ${commits.length} commit fatti su questo Mac.`,
      ));
      if (s.lines) L.push(T(`Size: +${s.lines.added} lines added, −${s.lines.removed} removed, ${s.lines.files} file changes in all.`, `Dimensione: +${s.lines.added} righe aggiunte, −${s.lines.removed} tolte, ${s.lines.files} modifiche a file in tutto.`));
      L.push(T('In order (time, what, message):', 'In ordine (ora, cosa, messaggio):'));
      const what = { commit: T('commit', 'commit'), amend: T('commit corrected', 'commit corretto'), merge: T('merge', 'merge'), checkout: T('switched branch', 'cambio di ramo'), pull: 'pull', rebase: 'rebase', reset: 'reset' };
      s.events.slice(-25).forEach((e) => L.push(`- ${t(e)} ${what[e.kind] || e.kind}: ${q(e.title)}${e.meta.added != null ? ` (+${e.meta.added} −${e.meta.removed})` : ''}`));
      L.push(T('Commit messages are written by the owner (or by the tools working for him): quote them as they are.', 'I messaggi di commit li scrive il proprietario (o gli strumenti che lavorano per lui): citali così come sono.'));
      break;
    }
    case 'todo': {
      const done = s.events.filter((e) => e.kind === 'done');
      const added = s.events.filter((e) => e.kind === 'added');
      if (done.length) {
        L.push(T(`Reminders ticked off (${done.length}):`, `Promemoria spuntati (${done.length}):`));
        done.slice(0, 15).forEach((e) => L.push(`- ${t(e)} ${q(e.title)}${e.meta.list ? ` [${e.meta.list}]` : ''}`));
      }
      if (added.length) {
        L.push(T(`Reminders added (${added.length}):`, `Promemoria aggiunti (${added.length}):`));
        added.slice(0, 15).forEach((e) => L.push(`- ${t(e)} ${q(e.title)}${e.meta.list ? ` [${e.meta.list}]` : ''}`));
      }
      break;
    }
    case 'dispatch': {
      const e = s.dispatches[0];
      L.push(T(`A dispatch from the Editor (it happened at ${t(e)}): ${q(e.title)}.`, `Una traccia del Direttore (è successo alle ${t(e)}): ${q(e.title)}.`));
      L.push(`${T('The note', 'L\'appunto')}: ${e.detail}`);
      L.push(attributionLine(e.meta?.attribution, T));
      L.push(T('These are the only facts: write the piece from the note, invent nothing it doesn\'t say. What the Mac recorded at the same time is below, if any.', 'Sono gli unici fatti: scrivi il pezzo a partire dall\'appunto, non inventare nulla che non dica. Quello che il Mac ha registrato nello stesso momento è qui sotto, se c\'è.'));
      break;
    }
    case 'book': {
      const e = s.events[0];
      const opened = s.events.filter((x) => x.kind === 'opened').at(-1);
      L.push(`${T('Book', 'Libro')} ${q(e.title)}${e.meta.author ? ` ${T('by', 'di')} ${e.meta.author}` : ''}.`);
      if (opened?.meta.progress != null) L.push(`${T('Reading progress', 'Avanzamento lettura')}: ${Math.round(opened.meta.progress * 100)}%.`);
      s.events.filter((x) => x.kind === 'highlight').forEach((h) => L.push(`- ${T('Highlighted at', 'Evidenziato alle')} ${t(h)}: ${q(h.meta.text)}${h.meta.note ? ` (${T('note', 'nota')}: ${h.meta.note})` : ''}`));
      break;
    }
  }
  // a dispatch the Editor tied to this story: their note, with how to attribute it
  if (s.kind !== 'dispatch') {
    for (const e of s.dispatches || []) {
      L.push(T(`THE EDITOR'S NOTE on this story (${t(e)}): ${q(e.title)} — ${e.detail}`, `L'APPUNTO DEL DIRETTORE su questa storia (${t(e)}): ${q(e.title)} — ${e.detail}`));
      L.push(attributionLine(e.meta?.attribution, T));
    }
  }
  return L.join('\n');
}

/**
 * What the other sources say about the same minutes: the apps in front, the appointments in the
 * calendar, the commits. A story about YouTube reads differently when it ran through a meeting.
 * Lines for the writer, empty when there is nothing to cross.
 */
export function crossFacts(s, events) {
  if (!s?.first || !events?.length) return '';
  const en = lang() === 'en';
  const q = (x) => (en ? `“${x}”` : `«${x}»`);
  const T = (e, i) => (en ? e : i);
  const from = s.first - 5 * 60e3;
  const to = Math.max(s.last || s.first, s.first + 10 * 60e3) + 5 * 60e3;
  const L = [];
  const own = new Set((s.events || []).map((e) => e.source));
  if (s.kind !== 'timesheet') {
    const tm = computeTime(events, from, to);
    if (tm?.apps?.length && tm.active >= 3) L.push(`${T('Apps in front in those minutes', 'App in primo piano in quei minuti')}: ${tm.apps.slice(0, 3).map((a) => `${a.name} ${a.minutes} min`).join(', ')}${tm.away >= 5 ? T(`; ${tm.away} min away from the Mac`, `; ${tm.away} min lontano dal Mac`) : ''}.`);
  }
  const agenda = events.filter((e) => e.source === 'calendar' && e.kind === 'appointment' && e.ts < to && (e.meta?.end ?? e.ts) > from);
  for (const e of agenda.slice(0, 3)) L.push(`${T('In the calendar', 'In agenda')}: ${q(e.title)} ${hhmm(e.ts)}–${hhmm(e.meta?.end ?? e.ts)}.`);
  const day = events.find((e) => e.source === 'calendar' && e.kind === 'day');
  if (day) L.push(`${T('All-day in the calendar', 'Tutto il giorno in agenda')}: ${q(day.title)}.`);
  if (!own.has('git')) {
    const commits = events.filter((e) => e.source === 'git' && ['commit', 'amend', 'merge'].includes(e.kind) && e.ts >= from && e.ts <= to);
    if (commits.length) L.push(`${T('Meanwhile, git commits', 'Intanto, commit git')}: ${commits.slice(0, 3).map((e) => `${hhmm(e.ts)} ${e.meta?.repo}: ${q(e.title.slice(0, 80))}`).join('; ')}${commits.length > 3 ? ` (+${commits.length - 3})` : ''}.`);
  }
  if (!own.has('reminders')) {
    const done = events.filter((e) => e.source === 'reminders' && e.kind === 'done' && e.ts >= from && e.ts <= to);
    if (done.length) L.push(`${T('Reminders ticked off meanwhile', 'Promemoria spuntati intanto')}: ${done.slice(0, 3).map((e) => q(e.title)).join(', ')}.`);
  }
  if (!L.length) return '';
  return `\n${T('THE SAME MINUTES, FROM THE OTHER SOURCES (use them only if they add something; never as the subject)', 'GLI STESSI MINUTI, DALLE ALTRE FONTI (usali solo se aggiungono qualcosa; mai come soggetto)')}:\n${L.map((l) => `- ${l}`).join('\n')}\n`;
}
