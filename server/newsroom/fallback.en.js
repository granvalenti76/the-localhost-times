/**
 * Automatic typesetting (English): writes articles without an LLM, from text templates.
 * Steps in when the writer (the local model) is offline or fails.
 */
import { hhmm } from '../util.js';

const hashNum = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pickFrom = (seed) => (arr) => arr[hashNum(seed + arr.length) % arr.length];

const q = (s) => `“${String(s).trim()}”`;
const list = (items) => {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a.join('');
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
};
const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const short = (s, n = 70) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const num = (n) => n.toLocaleString('en-US');

export function partOfDay(ms) {
  const h = new Date(ms).getHours();
  if (h < 6) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
const span = (s) => (s.first === s.last || s.last - s.first < 60e3
  ? `at ${hhmm(s.first)}`
  : `between ${hhmm(s.first)} and ${hhmm(s.last)}`);

const DULL = new Set(['ls', 'cd', 'clear', 'pwd', 'exit', 'll', 'la', 'history', 'echo', 'cat', 'z', 'which']);
function notable(s) {
  const seen = new Set();
  const cmds = s.events
    .filter((e) => !DULL.has(e.meta.family) && e.meta.family !== 'git commit') // commits are told separately
    .map((e) => e.title.split('\n')[0])
    .filter((c) => !seen.has(c) && seen.add(c))
    .slice(-5);
  if (!cmds.length) return null;
  return `In the log, among others: ${list(cmds.map((c) => q(short(c, 60))))}. ${s.events.length > 15
    ? 'A steady pace, like a real workshop.'
    : 'Precision work rather than volume.'}`;
}

const W = {
  searches(s, P) {
    const qs = s.events.map((e) => e.title);
    const n = qs.length;
    return {
      kicker: 'Searches',
      headline: n === 1
        ? P([`A single question for the search engine: ${q(short(qs[0], 60))}`, `${q(short(qs[0], 60))}: the question of the hour`])
        : P([`${n} questions in an hour, starting with ${q(short(qs[0], 50))}`, `From ${q(short(qs[0], 40))} to ${n === 2 ? 'one more' : `${n - 1} more`}: what the Mac wanted to know`]),
      dek: `${cap(span(s))} the owner asked ${list([...new Set(s.events.map((e) => e.detail))])} ${n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`}.`,
      body: [
        n === 1
          ? `The hour's curiosity fits in one line: ${q(qs[0])}. A single search, ${span(s)}, with no visible second thoughts.`
          : `The search log, ${span(s)}, opens with ${q(qs[0])} and goes on with ${list(qs.slice(1, 5).map(q))}${n > 5 ? `, plus ${n - 5} more` : ''}.`,
        n >= 3
          ? P(['Read in order, the sequence tells a line of reasoning getting sharper: each question corrects the previous one.',
            'People who search like this are not after any answer, but the right one.'])
          : P(['Few questions, but pointed: a sign the answer was within reach.', 'The rest, presumably, was done by the right page.']),
      ],
    };
  },

  site(s, P) {
    const good = s.pages.filter((p) => !p.generic).map((p) => p.clean);
    const pod = partOfDay(s.first);
    const visits = s.events.length;
    const headline = good.length
      ? P([
        `${q(short(good[0], 48))}${good.length > 1 ? ` and ${good.length - 1} more pages` : ''}: ${/^[ae]/.test(pod) ? 'an' : 'a'} ${pod} on ${s.topic}`,
        `${cap(pod)} on ${s.topic}, starting from ${q(short(good[0], 48))}`,
        `${plural(visits, 'visit', 'visits')} to ${s.topic}; in the spotlight, ${q(short(good[0], 48))}`,
      ])
      : P([
        `${cap(pod)} on ${s.topic}: ${plural(visits, 'visit', 'visits')} with no clear destination`,
        `${s.topic}, ${plural(visits, 'pass', 'passes')} in an hour: the scrolling goes on`,
      ]);
    return {
      kicker: s.topic,
      headline,
      dek: `${cap(span(s))} the browser went back to ${s.topic} ${visits === 1 ? 'once' : `${num(visits)} times`}${good.length ? `, through ${plural(good.length, 'page worth noting', 'pages worth noting')}` : ''}.`,
      body: [
        good.length
          ? `Among the pages read: ${list(good.slice(0, 4).map((p) => q(short(p, 80))))}${good.length === 5 ? ', and one more' : good.length > 5 ? `, and ${good.length - 4} more` : ''}.`
          : `The page titles say little: home, feeds, notifications. ${P(['The classic scroll, more habit than research.', 'A steady presence rather than a read.'])}`,
        `The first visit was at ${hhmm(s.first)}, the last at ${hhmm(s.last)}. ${visits > 12
          ? P(['The coming and going speaks for itself.', 'The site, it appears, was the fixed point of the hour.'])
          : P(['Enough to call it a real session.', 'A targeted visit rather than a wander.'])}`,
      ],
    };
  },

  webmail(s, P) {
    const subj = s.reads.map((e) => e.title);
    const n = subj.length;
    const unread = s.unreadEnd != null
      ? (s.unreadStart !== s.unreadEnd ? `Unread messages go from ${num(s.unreadStart)} to ${num(s.unreadEnd)}.` : `${num(s.unreadEnd)} unread messages remain in the inbox.`)
      : '';
    return {
      kicker: s.service,
      headline: n
        ? (n === 1 ? `Opened in ${s.service}: ${q(short(subj[0], 70))}` : `${n} emails read in ${s.service}, starting with ${q(short(subj[0], 55))}`)
        : s.unreadEnd != null
          ? P([`${num(s.unreadEnd)} unread: the inbox, seen from a distance`, `A glance at the mail, and ${num(s.unreadEnd)} messages still waiting`])
          : `A glance at the mail in ${s.service}`,
      dek: `${cap(span(s))}${n ? `, ${plural(n, 'email opened', 'emails opened')}` : ''}${s.inboxChecks ? `; inbox checked ${s.inboxChecks === 1 ? 'once' : `${s.inboxChecks} times`}` : ''}.`,
      body: [
        n ? `The subjects, in order: ${list(subj.slice(0, 5).map((x) => q(short(x, 70))))}${n > 5 ? ` and ${n - 5} more` : ''}.` : 'No email opened: just a look at the inbox.',
        unread || P(['The rest of the correspondence waits.', 'The mail, for now, can wait.']),
      ].filter(Boolean),
    };
  },

  roundup(s, P) {
    const titles = [...new Set(s.events.map((e) => e.title))];
    const sites = s.sites.length ? s.sites : [...new Set(s.events.map((e) => e.meta.host))];
    return {
      kicker: 'Around the web',
      headline: sites.length > 1
        ? P([`A quick tour of ${sites.length} sites, from ${sites[0]} to ${sites.at(-1)}`, `Quick stops on the web: ${list(sites.slice(0, 3))}`])
        : `A quick visit to ${sites[0]}`,
      dek: `Quick visits, ${span(s)}: no long stops, many open windows.`,
      body: [
        `The route takes in ${list(titles.slice(0, 5).map((t) => q(short(t, 70))))}${titles.length > 5 ? ' and more' : ''}.`,
        P(['Classic reading in passing: the web consulted on the fly, between one thing and the next.', 'Nothing in depth, but all duly recorded by this paper.']),
      ],
    };
  },

  thread(s, P) {
    const who = s.people[0] || 'a correspondent';
    const sent = s.sentCount;
    return {
      kicker: 'Correspondence',
      headline: sent
        ? P([`Back and forth with ${who}: ${q(short(s.topic, 60))}`, `${q(short(s.topic, 60))}, the exchange of the hour`])
        : `${plural(s.events.length, 'message', 'messages')} on ${q(short(s.topic, 60))}`,
      dek: `${cap(span(s))}, ${plural(s.events.length, 'email', 'emails')} in the same conversation${sent ? `, ${sent} of them outgoing` : ''}${s.people.length > 1 ? ` with ${list(s.people.slice(0, 3))}` : ''}.`,
      body: [
        s.events.slice(0, 6).map((e) => `At ${hhmm(e.ts)} ${e.kind === 'sent' ? `a reply goes out to ${e.meta.to?.[0] || 'the recipient'}` : `a message arrives from ${e.meta.fromName || e.meta.from}`}.`).join(' '),
        sent
          ? P(['The matter, it seems, is alive and needs attention.', 'A conversation in progress: the next edition will say whether it closed.'])
          : P(['No reply has gone out yet: the ball is in the owner\'s court.', 'The thread awaits an answer.']),
      ],
    };
  },

  inbox(s, P) {
    const n = s.events.length;
    const people = [...new Set(s.events.filter((e) => !e.meta.newsletter).map((e) => e.meta.fromName || e.meta.from))];
    return {
      kicker: 'Incoming mail',
      headline: s.newsletters === n
        ? `${plural(n, 'newsletter', 'newsletters')} and not one personal letter`
        : P([`${plural(n, 'email', 'emails')} in, ${s.unread} still to open`, `The letterbox: ${plural(n, 'message', 'messages')} in an hour`]),
      dek: `${s.newsletters ? `${plural(s.newsletters, 'newsletter or notification', 'newsletters and notifications')}` : 'No newsletters'}${people.length ? `, and mail from ${list(people.slice(0, 3))}` : ''}.`,
      body: [
        `Among the subjects: ${list([...new Set(s.events.map((e) => e.title))].slice(0, 5).map((t) => q(short(t, 60))))}.`,
        s.unread ? `${cap(plural(s.unread, 'message remains', 'messages remain'))} unread as the paper goes to press.` : 'All read: the inbox, for once, is in order.',
      ],
    };
  },

  session(s, P) {
    const top = s.families.slice(0, 3);
    const c = [...new Set(s.commits)];
    return {
      kicker: 'Terminal',
      headline: c.length
        ? `${plural(c.length, 'commit', 'commits')} in an hour: the last one says ${q(short(c.at(-1), 50))}`
        : s.serious
          ? P([`${s.serious} commands in the terminal, led by ${top.map((f) => f.family).slice(0, 2).join(' and ')}`, `At work on the command line: ${list(top.map((f) => f.family))}`])
          : 'The terminal opens, but only to look around',
      dek: `${plural(s.events.length, 'command typed', 'commands typed')}${top.length ? `; the most frequent: ${list(top.map((f) => `${f.family} (${f.count})`))}` : ''}.`,
      body: [
        c.length ? `The git log tells the story: ${list(c.slice(0, 4).map(q))}.` : `No commits this hour: ${P(['the work, if any, is still on the bench', 'exploring before building'])}.`,
        s.hosts.length ? `Of note: ssh connections to ${list(s.hosts)}.` : P(['All local, no remote connections.', 'No trips to remote servers.']),
        notable(s),
      ].filter(Boolean),
    };
  },

  note(s) {
    const e = s.events.at(-1);
    const created = s.events.some((x) => x.kind === 'created');
    return {
      kicker: e.meta.folder || 'Notes',
      headline: created ? `New note: ${q(short(e.title, 70))}` : `The notebook gets an update: ${q(short(e.title, 70))}`,
      dek: `${created ? 'Created' : 'Edited'} ${span(s)}${s.events.length > 1 ? `, with ${s.events.length} saves` : ''}${e.meta.folder ? ` in the folder ${q(e.meta.folder)}` : ''}.`,
      body: [
        e.meta.locked ? 'The note is password-protected: the paper only records that it exists.'
          : e.meta.snippet ? `It reads: ${q(short(e.meta.snippet, 400))}` : 'The newsroom has not made the contents public.',
      ],
    };
  },

  entry(s) {
    const e = s.events.at(-1);
    return {
      kicker: 'Diary',
      headline: e.title ? `A diary page: ${q(short(e.title, 60))}` : 'A new diary page',
      dek: `Written at ${hhmm(e.ts)}${e.meta.words ? `, about ${e.meta.words} words` : ''}.`,
      body: [e.meta.text
        ? `From the diary: ${q(short(e.meta.text, 500))}`
        : 'The contents stay private: the paper only reports that it exists, as befits a diary.'],
    };
  },

  episode(s) {
    const e = s.events.at(-1);
    const m = e.meta;
    const pct = m.duration ? Math.min(100, Math.round(((m.playhead || 0) / m.duration) * 100)) : null;
    return {
      kicker: m.show || 'Podcast',
      headline: `On the headphones: ${q(short(e.title, 70))}`,
      dek: `${m.show ? `From ${q(m.show)}` : 'An episode'}${pct != null ? `, ${pct}% listened` : ''}.`,
      body: [
        m.description ? short(m.description, 380) : `The listening is recorded at ${hhmm(e.ts)}.`,
        pct != null && pct < 90 ? 'The episode was left hanging: a second instalment of listening may follow.' : 'Listening complete.',
      ],
    };
  },

  folder(s, P) {
    const types = s.exts.map((x) => `.${x.k}`);
    const where = s.project ? q(s.project) : q(s.topic);
    return {
      kicker: s.project || s.topic.split('/').pop(),
      headline: s.created >= 3
        ? P([`${where} grows: ${plural(s.created, 'new file', 'new files')}`, `New files in ${where}: ${s.created}, mostly ${types[0] || 'files'}`])
        : P([`${plural(s.events.length, 'save', 'saves')} in ${where}${types.length ? `, mostly ${types[0]}` : ''}`, `Work in progress in ${where}`]),
      dek: `${cap(span(s))}, ${s.files ? `${plural(s.files, 'file', 'files')} touched` : plural(s.events.length, 'save', 'saves')}${s.project ? ` in the ${q(s.project)} project` : ''}${s.created ? `, ${plural(s.created, 'new file', 'new files')}` : ''}.`,
      body: [
        types.length ? `By type: ${list(s.exts.map((x) => `${x.n} ${q('.' + x.k)}`))}.` : 'The file types say little.',
        s.dirs.length > 1 ? `The work moves between ${list(s.dirs.slice(0, 3).map((d) => q(d.k)))}.` : P(['All in one folder: a focused job.', 'One folder, one job.']),
        P(['What changed inside, the paper doesn\'t read: only the folders and the counts.', 'The contents stay on the desk; the paper only counts.']),
      ],
    };
  },

  folders(s, P) {
    return {
      kicker: 'Local',
      headline: P([`A few files here and there: ${list(s.folders.slice(0, 3).map((f) => q(f.k)))}`, `Small saves in ${plural(s.folders.length, 'folder', 'folders')}`]),
      dek: `${plural(s.events.length, 'file', 'files')} saved ${span(s)}, none of them in a busy folder.`,
      body: [`The folders: ${list(s.folders.map((f) => `${q(f.k)} (${f.n})`))}.`],
    };
  },

  downloads(s, P) {
    const n = s.events.length;
    const sites = s.sites.map((x) => x.k);
    return {
      kicker: 'Downloads',
      headline: n === 1
        ? `Arrived${s.events[0].meta.site ? ` from ${s.events[0].meta.site}` : ''}: ${/^\./.test(s.events[0].title) ? `a ${s.events[0].title} file` : q(short(s.events[0].title, 60))}`
        : P([`${n} downloads${sites.length ? `, from ${list(sites.slice(0, 3))}` : ''}`, `The Downloads folder fills up: ${n} new files`]),
      dek: `${cap(span(s))}${s.exts.length ? `; types: ${list(s.exts.map((x) => `.${x.k}`))}` : ''}.`,
      body: [
        `Among the arrivals: ${list(s.events.slice(0, 5).map((e) => `${/^\./.test(e.title) ? `a ${e.title} file` : q(short(e.title, 60))}${e.meta.site ? ` from ${e.meta.site}` : ''}`))}.`,
        P(['Whether they will ever be opened is a story for another edition.', 'The Downloads folder, as usual, keeps everything.']),
      ],
    };
  },

  timesheet(s, P) {
    const t = s.time;
    const top = t.apps[0];
    const second = t.apps[1];
    return {
      kicker: 'Time',
      headline: t.longest && t.longest.minutes >= 40
        ? `${t.longest.minutes} minutes of ${t.longest.app} without a break`
        : t.switches >= 25
          ? P([`${t.switches} switches between apps in an hour`, `An hour in pieces: ${t.switches} app switches`])
          : `${top.name} leads the hour${second ? `, ${second.name} follows` : ''}`,
      dek: `${t.active} minutes at the Mac${t.away ? `, ${t.away} away` : ''}; ${list(t.apps.slice(0, 3).map((a) => `${a.name} ${a.minutes} min`))}.`,
      body: [
        `The app in front, minute by minute: ${list(t.apps.slice(0, 5).map((a) => `${a.name} (${a.minutes} min)`))}${t.others ? `, and ${t.others} minutes elsewhere` : ''}.`,
        t.longest ? `The longest stretch without switching: ${t.longest.app}, ${t.longest.minutes} minutes, ${hhmm(t.longest.from)}–${hhmm(t.longest.to)}. ${t.switches ? `In all, ${plural(t.switches, 'switch', 'switches')} from one app to another.` : 'Not a single switch.'}` : '',
        P(['What was on screen, the paper doesn\'t know: only the names of the apps.', 'The paper counts the minutes, not what filled them.']),
      ].filter(Boolean),
    };
  },

  dispatch(s) {
    const e = s.dispatches[0];
    const who = { editor: 'the Editor reports', source: 'a source close to the owner reports' }[e.meta?.attribution];
    return {
      kicker: s.section,
      headline: short(e.title, 90),
      dek: who ? `So ${who}.` : '',
      body: String(e.detail).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean),
    };
  },

  project(s, P) {
    const commits = (s.git?.events || []).filter((e) => ['commit', 'amend', 'merge'].includes(e.kind));
    const size = s.git?.lines ? `+${s.git.lines.added} −${s.git.lines.removed} lines` : null;
    return {
      kicker: 'Workshop',
      headline: commits.length ? P([`${q(s.topic)}, an afternoon's work`, `${q(s.topic)} moves on by ${commits.length} commits`]) : P([`Work on ${q(s.topic)}`, `${q(s.topic)} on the bench`]),
      dek: `${cap(span(s))}: ${list([s.folder ? plural(s.folder.saves, 'save', 'saves') : null, commits.length ? plural(commits.length, 'commit', 'commits') : null, s.commands ? plural(s.commands.serious, 'command', 'commands') : null].filter(Boolean))}.`,
      body: [
        commits.length ? `The commit messages, in order: ${list(commits.slice(-4).map((e) => q(short(e.title, 90))))}${size ? ` (${size})` : ''}.` : '',
        s.folder ? `In the files: ${plural(s.folder.saves, 'save', 'saves')}, ${plural(s.folder.created, 'new file', 'new files')}${s.folder.exts?.length ? `, mostly ${list(s.folder.exts.slice(0, 3).map((x) => `.${x.k}`))}` : ''}.` : '',
        s.tools?.length ? `In front, meanwhile: ${list(s.tools.map((a) => `${a.name} (${a.minutes} min)`))}.` : '',
      ].filter(Boolean),
    };
  },

  commits(s, P) {
    const commits = s.events.filter((e) => ['commit', 'amend', 'merge'].includes(e.kind));
    const last = commits.at(-1);
    const size = s.lines ? `+${s.lines.added} −${s.lines.removed} lines` : null;
    const moves = s.events.filter((e) => e.kind === 'checkout');
    return {
      kicker: 'Workshop',
      headline: commits.length
        ? commits.length === 1 ? `${q(s.repo)}: ${q(short(last.title, 60))}` : P([`${commits.length} commits on ${q(s.repo)}`, `${q(s.repo)} grows by ${commits.length} commits`])
        : `${q(s.repo)} switches branch: ${moves.at(-1)?.title || ''}`,
      dek: `${cap(span(s))}${s.branches.length ? `, on the branch ${list(s.branches.map(q))}` : ''}${size ? `; ${size}` : ''}.`,
      body: [
        commits.length ? `The messages, in order: ${list(commits.slice(-5).map((e) => q(short(e.title, 90))))}.` : '',
        size ? `The line count: ${size}, across ${s.lines.files} files.` : '',
        moves.length ? `Branch switches: ${list(moves.map((e) => e.title))}.` : '',
      ].filter(Boolean),
    };
  },

  todo(s, P) {
    const done = s.events.filter((e) => e.kind === 'done');
    const added = s.events.filter((e) => e.kind === 'added');
    return {
      kicker: 'Reminders',
      headline: done.length
        ? done.length === 1 ? `Ticked off: ${q(short(done[0].title, 60))}` : P([`${done.length} reminders ticked off`, `The list gets ${done.length} shorter`])
        : `${added.length} new things to do`,
      dek: `${cap(span(s))}${added.length && done.length ? `; ${added.length} added` : ''}.`,
      body: [
        done.length ? `Done: ${list(done.slice(0, 6).map((e) => q(short(e.title, 70))))}.` : '',
        added.length ? `To do: ${list(added.slice(0, 6).map((e) => q(short(e.title, 70))))}.` : '',
      ].filter(Boolean),
    };
  },

  shots(s, P) {
    const c = s.counts;
    const what = list([
      c.photos && plural(c.photos, 'photo', 'photos'),
      c.videos && plural(c.videos, 'video', 'videos'),
      c.shots && plural(c.shots, 'screenshot', 'screenshots'),
    ].filter(Boolean));
    return {
      kicker: 'The Photographer',
      headline: c.burst
        ? `A burst of ${c.burst} photos in two minutes`
        : c.photos + c.videos === 0 && c.shots
          ? P([`${cap(plural(c.shots, 'screenshot', 'screenshots'))}: the hour, kept as evidence`, `The camera stays still: ${plural(c.shots, 'screenshot', 'screenshots')}`])
          : c.imported && !c.photos && !c.videos
            ? `${plural(c.imported, 'old picture', 'old pictures')} arrive in Photos`
            : P([`${cap(what || plural(c.imported, 'picture', 'pictures'))} in the hour`, `The photographer at work: ${what}`]),
      dek: `${cap(span(s))}${c.favorites ? `; ${c.favorites} already marked as favourite` : ''}.`,
      body: [
        what ? `Shot in the hour: ${what}${c.macShots ? ` (${c.macShots} of the screenshots on the Mac)` : ''}.` : '',
        [c.live && `${plural(c.live, 'Live Photo', 'Live Photos')}`, c.panorama && plural(c.panorama, 'panorama', 'panoramas'), c.slomo && 'some slow motion'].filter(Boolean).length
          ? `Among them: ${list([c.live && plural(c.live, 'Live Photo', 'Live Photos'), c.panorama && plural(c.panorama, 'panorama', 'panoramas'), c.slomo && 'some slow motion'].filter(Boolean))}.` : '',
        c.imported ? `Also: ${plural(c.imported, 'older picture', 'older pictures')} imported into the library.` : '',
        P(['What is in the pictures stays in the pictures: the paper only counts them.', 'Where and who, the paper never looks at.']),
      ].filter(Boolean),
    };
  },

  book(s) {
    const e = s.events[0];
    const hl = s.events.filter((x) => x.kind === 'highlight');
    const op = s.events.filter((x) => x.kind === 'opened').at(-1);
    const pct = op?.meta.progress != null ? Math.round(op.meta.progress * 100) : null;
    return {
      kicker: 'Books',
      headline: hl.length
        ? `${q(e.title)}: ${plural(hl.length, 'passage underlined', 'passages underlined')}`
        : `Back to ${q(e.title)}${pct != null ? `, now at ${pct}%` : ''}`,
      dek: `${e.meta.author ? `By ${e.meta.author}. ` : ''}Opened ${span(s)}.`,
      body: [
        hl.length ? `Among the highlighted lines: ${list(hl.slice(0, 3).map((h) => q(short(h.meta.text, 160))))}.` : 'No underlining: reading straight through.',
      ],
    };
  },
};

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function fallbackArticle(story) {
  const P = pickFrom(story.id + story.first);
  const w = W[story.kind];
  const a = w ? w(story, P) : { kicker: story.section, headline: story.topic, dek: '', body: [] };
  const sr = story.series;
  if (sr) {
    const last = sr.previous[0];
    a.body = [...a.body, `${P(['The story continues', 'Not for the first time', 'The subject is back'])}: this is the ${ordinal(sr.episode)} instalment${sr.days > 1 ? ` in ${sr.days} days` : ''}. The last one, at ${hhmm(last.hour)}, was headlined ${q(short(last.headline, 70))}.`];
  }
  // no double stops after a quotation that already ends a sentence: …are.”. → …are.”
  const tidy = (t) => (typeof t === 'string' ? t.replace(/([.!?…])([”»])\./g, '$1$2') : t);
  return { ...a, headline: tidy(a.headline), dek: tidy(a.dek), body: a.body.map(tidy), writer: 'typesetting' };
}

export function fallbackBrief(story) {
  return fallbackArticle(story).headline;
}

export function fallbackSummary(articles, total) {
  const mood = total < 10 ? 'quiet' : total < 40 ? 'steady' : total < 120 ? 'busy' : 'frantic';
  const [a] = articles;
  const parts = [`A ${mood} hour: ${plural(total, 'signal recorded', 'signals recorded')}.`];
  if (a) parts.push(`Leading the paper, from ${a.section}: ${a.headline.replace(/[.!?…\s]+$/, '')}.`);
  const others = [];
  for (const x of articles.slice(1)) {
    const label = x.section === a.section ? `more ${x.section} with ${x.kicker}` : x.section;
    if (!others.includes(label)) others.push(label);
    if (others.length === 3) break;
  }
  if (others.length) parts.push(`Inside: ${list(others)}.`);
  return parts.join(' ');
}

/** Fallback evening editorial, when the writer is offline. */
export function fallbackEditorial({ top, timeline, stats, market }) {
  const lead = top[0];
  const second = top[1];
  const busiest = `${String(stats.busiestHour).padStart(2, '0')}:00`;
  const site = market?.rows?.[0];
  const P = pickFrom(String(stats.total) + (lead?.articleId || ''));
  const mood = stats.total < 60 ? 'quiet' : stats.total < 300 ? 'full' : 'crowded';
  const sections = [...new Set(top.map((t) => t.section))];
  return {
    headline: lead ? P([`A ${mood} day, and a thread that holds it together`, `The day ${q(short(lead.headline, 40))} mattered`]) : 'A day without headlines',
    oneliner: `${plural(stats.total, 'signal', 'signals')} in ${plural(timeline.length, 'edition', 'editions')}; the peak at ${busiest}.`,
    body: [
      `A ${mood} day: ${plural(stats.total, 'signal recorded', 'signals recorded')} and ${plural(timeline.length, 'edition', 'editions')} on the newsstand. The busiest hour was ${busiest}.`,
      lead ? `The story that weighed most came from ${lead.section}: ${q(lead.headline)}.${second ? ` Close behind, ${second.section}: ${q(second.headline)}.` : ''}${lead.appearances > 1 ? ` It came back in ${lead.appearances} editions: not a passing item, but a theme.` : ''}` : 'No story really dominated.',
      `${sections.length > 1 ? `The paper covered ${list(sections.slice(0, 4))}.` : ''} ${site ? `On the market, ${site.ticker} closes on top with ${plural(site.close, 'visit', 'visits')}.` : ''} ${P(['Tomorrow, we shall see.', 'The next edition will write the rest.', 'The newsroom closes here.'])}`.trim(),
    ],
    cartoon: P(['Tomorrow I\'ll do the same things, but more neatly.', 'The paper says I did a lot today. If you say so.', 'I didn\'t waste time. I archived it.']),
    market: site ? `Session closed with ${site.ticker} on top (${plural(site.close, 'trade', 'trades')}).${market.index.change != null ? ` Index ${market.index.change >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(market.index.change * 100))}% on yesterday.` : ''}` : null,
  };
}
