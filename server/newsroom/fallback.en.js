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
