import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { sandbox, BROKEN } from './helpers.js';
import { thin } from '../server/history.js';
import { demoYear, demoHistory, demoEvents } from '../server/demo.js';
import { computeReview, typesetReview, printReview, yearAgo } from '../server/newsroom/review.js';
import { whenOf, keywordsOf, isCounting, recall } from '../server/newsroom/recall.js';
import { standupPeriod, standup } from '../server/newsroom/standup.js';

const DAY = 864e5;
const at = (y, mo, d, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

test('history: the old days keep one of each thing a day, the last two days everything', () => {
  const now = at(2026, 10, 21);
  const e = (id, ts, url) => ({ id, source: 'safari', kind: 'visit', ts, title: 'A page', url, meta: {} });
  const kept = thin([e('a', now - 9 * DAY, 'u1'), e('b', now - 9 * DAY + 60e3, 'u1'), e('c', now - 9 * DAY, 'u2'), e('d', now - 3600e3, 'u1'), e('e', now - 3000e3, 'u1')], { before: now - 2 * DAY });
  assert.deepEqual(kept.map((x) => x.id), ['a', 'c', 'd', 'e']);
});

test('review: a year of the demo makes months with their subjects, habits and a year ago today', () => {
  setLang('en');
  const { store, config, cleanup } = sandbox();
  try {
    store.insertEvents([...demoYear(), ...demoHistory(), ...demoEvents(24)]);
    const r = computeReview(store);
    assert.ok(r.months.length >= 9, `months: ${r.months.length}`);
    const labels = r.months.flatMap((m) => m.subjects.map((s) => s.label.toLowerCase()));
    for (const s of ['sourdough', 'kyoto', 'rust']) assert.ok(labels.some((l) => l.includes(s)), `${s} in ${labels}`);
    assert.equal(r.sites[0].site, 'nytimes.com');
    assert.ok(r.repos.some((x) => x.repo === 'localhost-times'));
    assert.ok(r.books.some((b) => b.title === 'Snow Country'));
    const t = typesetReview(r);
    assert.ok(t.headline && t.editorial.length >= 2);
    assert.doesNotMatch(JSON.stringify(t), BROKEN);
    // a year ago today: the trip to Kyoto, with its book and its photos
    const ago = yearAgo(store, Date.now() - 3600e3);
    assert.ok(ago, 'no year ago');
    assert.equal(ago.book, 'Snow Country');
    assert.ok(ago.photos >= 14);
    assert.match(ago.searches[0], /kyoto/);
  } finally {
    cleanup();
  }
});

test('review: printed without a model, kept, and written again in place', async () => {
  setLang('it');
  const { store, config, cleanup } = sandbox();
  try {
    store.insertEvents(demoYear());
    const a = await printReview(store, config, { log: () => {} });
    assert.equal(a.writer, 'typesetting');
    assert.ok(Object.keys(a.monthHeadlines).length >= 9);
    assert.ok(Array.isArray(a.months), 'the months stay data');
    const b = await printReview(store, config, { log: () => {} });
    assert.equal(a.id, b.id);
    assert.equal(store.items('review').length, 1);
  } finally {
    cleanup();
    setLang('en');
  }
});

test('recall: the time of a question, in both languages', () => {
  const now = at(2026, 10, 21, 11); // a Wednesday
  const day = (r) => [new Date(r.from).getDate(), new Date(r.from).getHours(), new Date(r.to).getDate(), new Date(r.to).getHours()];
  assert.deepEqual(day(whenOf('what was that video yesterday evening?', now)), [20, 18, 21, 0]);
  assert.deepEqual(day(whenOf("l'articolo di lunedì", now)), [19, 0, 20, 0]);
  assert.deepEqual(day(whenOf('cosa ho cercato martedì pomeriggio', now)), [20, 12, 20, 18]);
  // on a Wednesday, "Wednesday" is last week's
  assert.deepEqual(day(whenOf('on wednesday', now)), [14, 0, 15, 0]);
  assert.deepEqual(day(whenOf('3 giorni fa', now)), [18, 0, 19, 0]);
  const march = whenOf('a marzo', now);
  assert.equal(new Date(march.from).getMonth(), 2);
  assert.equal(whenOf('that article about pens', now), null);
  assert.equal(keywordsOf("Cos'era quell'articolo sulle stilografiche che ho letto lunedì?"), 'stilografiche');
  assert.equal(keywordsOf('what was that video about umberto eco I watched on Saturday'), 'umberto eco');
  assert.ok(isCounting('quante volte sono stato su YouTube?'));
  assert.ok(!isCounting('quel video su YouTube'));
});

test('recall: the pages come back one per thing, with their links, the kind of thing respected', async () => {
  setLang('en');
  const { store, config, cleanup } = sandbox();
  try {
    const now = Date.now();
    const v = (id, ts, host, title, url) => ({ id, source: 'safari', kind: 'visit', ts, title, detail: null, url, meta: { host } });
    store.insertEvents([
      v('1', now - 2 * DAY, 'youtube.com', 'Umberto Eco on The Name of the Rose - YouTube', 'https://youtube.com/watch?v=1'),
      v('2', now - 2 * DAY + 60e3, 'youtube.com', 'Umberto Eco on The Name of the Rose - YouTube', 'https://youtube.com/watch?v=1'),
      v('3', now - 2 * DAY + 120e3, 'repubblica.it', 'Umberto Eco, dieci anni dopo', 'https://repubblica.it/eco'),
      { id: '4', source: 'books', kind: 'opened', ts: now - DAY, title: 'The Name of the Rose', detail: 'Umberto Eco', url: null, meta: { author: 'Umberto Eco' } },
    ]);
    const r = await recall(store, config, 'that video about Umberto Eco', { llm: false });
    assert.equal(r.mode, 'recall');
    assert.equal(r.results.length, 1);
    assert.equal(r.results[0].url, 'https://youtube.com/watch?v=1');
    assert.equal(r.results[0].times, 2);
    const all = await recall(store, config, "Umberto Eco", { llm: false });
    assert.equal(all.results.length, 3);
    // the book by Eco too: its author is in the archive
    const book = await recall(store, config, 'the book I was reading', { llm: false });
    assert.deepEqual(book.results.map((x) => x.title), ['The Name of the Rose']);
  } finally {
    cleanup();
  }
});

test('standup: since the last working day, from commits, pull requests, the terminal and the calendar', () => {
  setLang('en');
  const monday = at(2026, 10, 19, 9, 30);
  assert.equal(new Date(standupPeriod(monday).from).getDay(), 5, 'on a Monday, since Friday');
  assert.equal(new Date(standupPeriod(at(2026, 10, 21, 9)).from).getDate(), 20);
  assert.equal(new Date(standupPeriod(at(2026, 10, 21, 9), 'week').from).getDate(), 19);
  const { store, config, cleanup } = sandbox();
  try {
    const t = at(2026, 10, 20, 15);
    const e = (id, source, kind, m, title, meta = {}, url = null) => ({ id, source, kind, ts: t + m * 60e3, title, detail: null, url, meta });
    store.insertEvents([
      e('c1', 'git', 'commit', 0, 'Subjects: the story is the subject', { repo: 'dailymac', branch: 'killer', added: 300, removed: 20 }),
      e('c2', 'git', 'commit', 30, 'fixup! subjects', { repo: 'dailymac', branch: 'killer', added: 2, removed: 1 }),
      e('c3', 'git', 'commit', 40, 'Recall: the archive remembers', { repo: 'dailymac', branch: 'killer', added: 120, removed: 4 }),
      e('t0', 'terminal', 'command', 41, 'cd ~/Work/git/dailymac', { family: 'cd' }),
      e('t1', 'terminal', 'command', 42, 'npm test', { family: 'npm test' }),
      e('t2', 'terminal', 'command', 44, 'git push -u origin killer', { family: 'git push' }),
      e('p1', 'safari', 'visit', 50, 'Add subjects by someone · Pull Request #42 · granvalenti76/the-localhost-times', { host: 'github.com' }, 'https://github.com/granvalenti76/the-localhost-times/pull/42'),
      e('m1', 'calendar', 'appointment', 60, 'Design review', { minutes: 30 }),
      e('r1', 'reminders', 'done', 70, 'Send the invoice'),
    ]);
    const s = standup(store, config, { now: at(2026, 10, 21, 9, 30) });
    assert.match(s.text, /^\*\*Yesterday\*\*/);
    assert.match(s.text, /dailymac \(killer\): 2 commits, \+422 −25 — Subjects: the story is the subject; Recall: the archive remembers/);
    assert.doesNotMatch(s.text, /fixup/);
    assert.match(s.text, /dailymac: pushed once, ran the tests once/);
    assert.match(s.text, /Looked at PR #42 “Add subjects” \(granvalenti76\/the-localhost-times\)/);
    assert.match(s.text, /Meetings: Design review 16:00/);
    assert.match(s.text, /Done: Send the invoice/);
    assert.match(s.text, /\*\*Today\*\*\n- Carry on with dailymac \(killer\)/);
    assert.match(standup(store, config, { now: at(2026, 10, 21, 9, 30), format: 'slack' }).text, /^\*Yesterday\*/);
  } finally {
    cleanup();
  }
});
