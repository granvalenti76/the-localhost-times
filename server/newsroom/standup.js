/**
 * The standup, written by itself: what was done since the last working day (or this week), from
 * the commits, the pull requests and issues opened in the browser, the pushes and test runs in the
 * terminal, the meetings and the reminders ticked off. Plain words, first person, no house voice:
 * it is meant to be pasted into a chat, not read over breakfast.
 */
import { tr, lang } from '../i18n.js';
import { hhmm } from '../util.js';
import { findSubjects } from './subjects.js';
import { projectOfCommands } from './cluster.js';
import { connectLLM, chat, parseJson } from './llm.js';

const DAY = 24 * 3600e3;
const startOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayBefore = (ms) => startOf(ms - DAY + 3 * 3600e3);

/**
 * The period a standup covers. A day: since the start of the last working day (on a Monday, since
 * Friday: the weekend's work counts too), until now. A week: since Monday (on a Monday, the
 * whole week before).
 */
export function standupPeriod(now = Date.now(), span = 'day') {
  const today = startOf(now);
  const wd = new Date(today).getDay();
  if (span === 'week') {
    let from = today;
    while (new Date(from).getDay() !== 1) from = dayBefore(from);
    if (from === today) from = startOf(today - 7 * DAY + 3 * 3600e3);
    return { from, to: now, span };
  }
  let from = dayBefore(today);
  if (wd === 1) from = startOf(today - 3 * DAY + 3 * 3600e3); // Monday: since Friday
  if (wd === 0) from = startOf(today - 2 * DAY + 3 * 3600e3); // Sunday: since Friday
  return { from, to: now, span };
}

// a pull request or an issue, as GitHub and GitLab title their pages
const GH_PR = /^(.*?)(?:\s+by\s+\S+)?\s+·\s+Pull Request #(\d+)\s+·\s+(\S+)/;
const GH_ISSUE = /^(.*?)\s+·\s+Issue #(\d+)\s+·\s+(\S+)/;
const GL_MR = /^(.*?)\s+\(!(\d+)\)\s+·\s+Merge requests\s+·\s+(.+?)\s+·\s+GitLab/;
const DEV_SITE = /github\.com|gitlab\.com|stackoverflow\.com|stackexchange\.com|developer\.|docs\.|mdn|\.dev$|readthedocs|npmjs\.com|pypi\.org|huggingface\.co|arxiv\.org|crates\.io|pkg\.go\.dev|news\.ycombinator\.com/;
const NOISE_COMMIT = /^(wip|fixup!|squash!|merge (branch|pull request|remote-tracking))/i;

function pullRequests(events) {
  const out = new Map();
  for (const e of events) {
    if (e.source !== 'safari' || e.kind !== 'visit') continue;
    const url = String(e.url || '');
    const m = /\/(pull|issues|merge_requests)\/(\d+)/.exec(url);
    if (!m) continue;
    const t = String(e.title || '');
    const hit = GH_PR.exec(t) || GH_ISSUE.exec(t) || GL_MR.exec(t);
    const kind = m[1] === 'issues' ? 'issue' : 'pr';
    const repo = hit?.[3] || url.replace(/^https?:\/\/[^/]+\//, '').split('/').slice(0, 2).join('/');
    const key = `${repo}#${m[2]}`;
    const x = out.get(key) || { kind, number: Number(m[2]), repo, title: hit?.[1]?.trim() || null, visits: 0, first: e.ts, last: e.ts };
    x.visits++;
    x.last = Math.max(x.last, e.ts);
    out.set(key, x);
  }
  return [...out.values()].sort((a, b) => b.visits - a.visits);
}

function repoWork(events, exclude) {
  const out = new Map();
  for (const e of events) {
    if (e.source !== 'git') continue;
    const repo = e.meta?.repo || e.detail;
    if (!repo || exclude.some((x) => String(repo).toLowerCase().includes(String(x).toLowerCase()))) continue;
    const x = out.get(repo) || { repo, commits: [], branches: new Set(), added: 0, removed: 0, merges: 0, last: 0 };
    if (['commit', 'amend'].includes(e.kind)) {
      if (!NOISE_COMMIT.test(e.title || '')) x.commits.push(String(e.title || '').split('\n')[0].trim());
      x.added += e.meta?.added || 0;
      x.removed += e.meta?.removed || 0;
    }
    if (e.kind === 'merge') x.merges++;
    if (e.meta?.branch) x.branches.add(e.meta.branch);
    x.last = Math.max(x.last, e.ts);
    out.set(repo, x);
  }
  return [...out.values()].filter((x) => x.commits.length || x.merges).sort((a, b) => b.commits.length - a.commits.length)
    .map((x) => ({ ...x, commits: [...new Set(x.commits)], branches: [...x.branches] }));
}

function terminalWork(events, repos) {
  const cmds = events.filter((e) => e.source === 'terminal');
  const where = projectOfCommands(cmds, new Set(repos.map((r) => String(r).toLowerCase())));
  const out = new Map();
  for (const e of cmds) {
    const p = where.get(e.id) || null;
    const x = out.get(p) || { project: p, pushes: 0, tests: 0, deploys: 0 };
    const c = String(e.title || '');
    if (/^\s*git push\b/.test(c)) x.pushes++;
    if (/\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bpytest\b|\bcargo test\b|\bgo test\b|\bswift test\b|\bxcodebuild test\b|\bjest\b|\bvitest\b/.test(c)) x.tests++;
    if (/\b(deploy|vercel|netlify deploy|fly deploy|kubectl apply|terraform apply)\b/.test(c)) x.deploys++;
    out.set(p, x);
  }
  return [...out.values()].filter((x) => x.pushes || x.tests || x.deploys);
}

/** What was done, as data: repos, pull requests and issues, terminal, meetings, reminders, reading. */
export function standupData(store, config, { now = Date.now(), span = 'day' } = {}) {
  const period = standupPeriod(now, span);
  const events = store.eventsBetween(period.from, period.to);
  const repos = repoWork(events, config.standup?.exclude || []);
  const reviewed = pullRequests(events);
  const terminal = terminalWork(events, repos.map((r) => r.repo));
  const meetings = events.filter((e) => e.source === 'calendar' && e.kind === 'appointment')
    .map((e) => ({ title: e.title, ts: e.ts, minutes: e.meta?.minutes ?? null }));
  const done = [...new Set(events.filter((e) => e.source === 'reminders' && e.kind === 'done').map((e) => e.title))];
  // what was read up on: the subjects that went through developer sites, day by day (over a
  // week, the ones that came back on the most days)
  const tally = new Map();
  for (let d = startOf(period.from); d < period.to; d = startOf(d + DAY + 3 * 3600e3)) {
    for (const s of findSubjects(events.filter((e) => e.ts >= d && e.ts < d + DAY), { max: 6 })) {
      if (![...s.places.keys()].some((p) => DEV_SITE.test(p))) continue;
      const x = tally.get(s.key) || { label: s.label, days: 0, events: 0 };
      x.days++;
      x.events += s.events.length;
      tally.set(s.key, x);
    }
  }
  const reading = [...tally.values()].sort((a, b) => b.days - a.days || b.events - a.events).slice(0, 3).map((x) => x.label);
  const latest = repos.slice().sort((a, b) => b.last - a.last)[0] || null;
  return { ...period, repos, reviewed, terminal, meetings, done, reading, next: latest ? { repo: latest.repo, branch: latest.branches.at(-1) || null } : null };
}

const short = (s, n = 72) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The standup as text: markdown (GitHub, most chats), Slack's own flavour, or plain. */
export function standupText(d, { format = 'markdown' } = {}) {
  const en = lang() === 'en';
  const T = (e, i) => (en ? e : i);
  const q = (x) => `“${x}”`;
  const bold = (s) => (format === 'plain' ? s : format === 'slack' ? `*${s}*` : `**${s}**`);
  const fmt = new Intl.DateTimeFormat(en ? 'en-GB' : 'it-IT', { weekday: 'long', day: 'numeric', month: 'short' });
  const since = d.span === 'week'
    ? T(`This week (since ${fmt.format(d.from)})`, `Questa settimana (da ${fmt.format(d.from)})`)
    : startOf(d.to) - d.from > DAY + 3 * 3600e3
      ? T(`Since ${fmt.format(d.from)}`, `Da ${fmt.format(d.from)}`)
      : T('Yesterday', 'Ieri');
  const done = [];
  for (const r of d.repos) {
    const size = r.added || r.removed ? `, +${r.added} −${r.removed}` : '';
    const what = r.commits.slice(0, d.span === 'week' ? 6 : 4).map((c) => short(c)).join('; ');
    const more = r.commits.length > (d.span === 'week' ? 6 : 4) ? T(` and ${r.commits.length - (d.span === 'week' ? 6 : 4)} more`, ` e altri ${r.commits.length - (d.span === 'week' ? 6 : 4)}`) : '';
    const n = r.commits.length;
    done.push(`${r.repo}${r.branches.length === 1 ? ` (${r.branches[0]})` : ''}: ${T(`${n} commit${n === 1 ? '' : 's'}`, `${n} commit`)}${size}${r.merges ? T(`, ${r.merges} merge${r.merges === 1 ? '' : 's'}`, `, ${r.merges} merge`) : ''}${what ? ` — ${what}${more}` : ''}`);
  }
  for (const t of d.terminal) {
    const bits = [t.pushes && T(`pushed ${t.pushes === 1 ? 'once' : `${t.pushes} times`}`, `push ${t.pushes === 1 ? 'una volta' : `${t.pushes} volte`}`),
      t.tests && T(`ran the tests ${t.tests === 1 ? 'once' : `${t.tests} times`}`, `test lanciati ${t.tests === 1 ? 'una volta' : `${t.tests} volte`}`),
      t.deploys && T(`deployed ${t.deploys === 1 ? 'once' : `${t.deploys} times`}`, `deploy ${t.deploys === 1 ? 'una volta' : `${t.deploys} volte`}`)].filter(Boolean);
    done.push(`${t.project ? `${t.project}: ` : ''}${bits.join(', ')}`);
  }
  for (const p of d.reviewed.slice(0, 5)) {
    const label = p.kind === 'pr' ? `PR #${p.number}` : T(`issue #${p.number}`, `issue #${p.number}`);
    done.push(`${T('Looked at', 'Guardato')} ${label}${p.title ? ` ${q(short(p.title, 60))}` : ''} (${p.repo})`);
  }
  if (d.reading.length) done.push(`${T('Read up on', 'Studiato')}: ${d.reading.join(', ')}`);
  if (d.meetings.length) done.push(`${T('Meetings', 'Riunioni')}: ${[...new Set(d.meetings.map((m) => `${m.title} ${hhmm(m.ts)}`))].slice(0, 5).join(', ')}`);
  if (d.done.length) done.push(`${T('Done', 'Fatto')}: ${d.done.slice(0, 5).join(', ')}`);
  const today = d.next ? [`${T('Carry on with', 'Proseguo con')} ${d.next.repo}${d.next.branch ? ` (${d.next.branch})` : ''}`] : [];
  const lines = [bold(since)];
  if (done.length) lines.push(...done.map((l) => `- ${l}`));
  else lines.push(`- ${T('Nothing on the record.', 'Niente agli atti.')}`);
  if (today.length && d.span !== 'week') lines.push('', bold(T('Today', 'Oggi')), ...today.map((l) => `- ${l}`));
  return lines.join('\n');
}

/** The standup, data and text. */
export function standup(store, config, opts = {}) {
  const d = standupData(store, config, opts);
  return { ...d, text: standupText(d, opts) };
}

/** The model tightens the standup into a few first-person lines, keeping every fact and nothing else. */
export async function polishStandup(store, config, opts = {}, log = console.log) {
  const s = standup(store, config, opts);
  const llm = await connectLLM(config);
  if (!llm) return { ...s, polished: null, offline: true };
  const en = lang() === 'en';
  const sys = en
    ? 'Rewrite this standup update in the first person, as three to six short bullet points a developer would paste in a team chat: what I did, what I am doing today. Keep every repository, PR number and figure exactly; add nothing that is not there; no greeting, no emoji. Keep the two headings. Reply ONLY with JSON: {"text": "..."}'
    : 'Riscrivi questo aggiornamento da standup in prima persona, in tre-sei punti brevi da incollare nella chat del team: cosa ho fatto, cosa faccio oggi. Mantieni esattamente ogni repository, numero di PR e cifra; non aggiungere nulla che non ci sia; niente saluti, niente emoji. Tieni i due titoli. Rispondi SOLO con JSON: {"text": "..."}';
  try {
    const j = parseJson(await chat(llm, config, [{ role: 'system', content: sys }, { role: 'user', content: s.text }], 900));
    return { ...s, polished: String(j.text || '').trim() || null, writer: llm.model };
  } catch (e) {
    log(tr({ en: `[standup] ${e.message}`, it: `[standup] ${e.message}` }));
    return { ...s, polished: null, error: e.message };
  }
}
