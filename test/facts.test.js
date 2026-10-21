import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// a home of our own, with a Calendar and a Reminders database in the places macOS keeps them
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-facts-'));
process.env.HOME = HOME;
process.env.LOCALHOST_TIMES_DIRECT_MIN = '1';
const { DatabaseSync } = await import('node:sqlite');
const { setLang } = await import('../server/i18n.js');
const { msToCd } = await import('../server/util.js');
const git = await import('../server/sources/git.js');
const calendar = (await import('../server/sources/calendar.js')).default;
const reminders = (await import('../server/sources/reminders.js')).default;
const { buildStories, factSheet, crossFacts } = await import('../server/newsroom/cluster.js');
const { fallbackArticle } = await import('../server/newsroom/fallback.js');
const { SECTIONS } = await import('../server/newsroom/sections.js');

setLang('it');
const T0 = new Date(2026, 9, 9, 15, 0, 0).getTime();
const sec = (ms) => Math.floor(ms / 1000);
const line = (from, to, ts, msg) => `${from} ${to} Luca <luca@example.com> ${sec(ts)} +0200\t${msg}`;
const H = (c) => c.repeat(40);

test('git: the reflog becomes commits, merges and branch switches, with the branch of the moment', () => {
  const text = [
    line(H('0'), H('a'), T0 - 3600e3, 'commit (initial): First'),
    line(H('a'), H('a'), T0 + 60e3, 'checkout: moving from main to redazione'),
    line(H('a'), H('b'), T0 + 5 * 60e3, 'commit: Rail balanced with the real paper'),
    line(H('b'), H('c'), T0 + 9 * 60e3, 'commit (amend): Rail balanced, really'),
    line(H('c'), H('c'), T0 + 10 * 60e3, 'rebase (pick): something'),
    line(H('c'), H('d'), T0 + 12 * 60e3, 'pull: Fast-forward'),
    line(H('d'), H('e'), T0 + 20 * 60e3, 'merge main: Merge made by the \'ort\' strategy.'),
    'garbage',
  ].join('\n');
  const ev = git.reflogEvents(text, { repo: '/Users/x/Work/git/dailymac', since: T0 });
  assert.deepEqual(ev.map((e) => e.kind), ['checkout', 'commit', 'amend', 'pull', 'merge']);
  assert.equal(ev[0].title, 'main → redazione');
  assert.equal(ev[1].title, 'Rail balanced with the real paper');
  assert.equal(ev[1].meta.branch, 'redazione');
  assert.equal(ev[1].meta.repo, 'dailymac');
  assert.equal(ev[1].source, 'git');
  // the same line twice gives the same id (the collector may read it again)
  assert.equal(git.reflogEvents(text, { repo: '/Users/x/Work/git/dailymac', since: T0 })[1].id, ev[1].id);
  assert.deepEqual(git.parseNumstat('12\t3\ta.js\n-\t-\timg.png\n0\t9\tb.js\n'), { added: 12, removed: 12, files: 3 });
});

test('git: repositories are found under the watched folders, not inside node_modules', () => {
  const root = path.join(HOME, 'Work');
  for (const p of ['git/dailymac/.git', 'git/other/.git', 'git/dailymac/node_modules/dep/.git', 'deep/a/b/c/d/e/.git']) fs.mkdirSync(path.join(root, p), { recursive: true });
  const found = git.findRepos([root]).map((p) => path.relative(root, p)).sort();
  assert.deepEqual(found, ['git/dailymac', 'git/other']);
});

test('git: a story per repository in Interni, with the lines counted', () => {
  const ev = (kind, min, title, meta = {}) => ({ id: `g${min}`, source: 'git', kind, ts: T0 + min * 60e3, title, detail: 'dailymac', meta: { repo: 'dailymac', branch: 'main', ...meta } });
  const events = [ev('commit', 5, 'Fix the rail', { added: 40, removed: 10, files: 2 }), ev('commit', 25, 'Add the git source', { added: 300, removed: 2, files: 5 })];
  const [s] = buildStories(events);
  assert.equal(s.kind, 'commits');
  assert.equal(s.section, SECTIONS.git.name);
  assert.deepEqual(s.lines, { added: 340, removed: 12, files: 7 });
  const f = factSheet(s);
  assert.match(f, /2 commit/);
  assert.match(f, /\+340/);
  assert.match(f, /«Add the git source»/);
  const a = fallbackArticle(s);
  assert.match(a.headline, /2 commit|cresce/);
  assert.ok(a.body.length >= 2);
});

test('cross facts: the same minutes seen from the apps, the calendar and the commits', () => {
  const events = [
    { id: 's1', source: 'safari', kind: 'visit', ts: T0 + 10 * 60e3, title: 'Video', meta: { host: 'youtube.com' } },
    { id: 's2', source: 'safari', kind: 'visit', ts: T0 + 30 * 60e3, title: 'Video 2', meta: { host: 'youtube.com' } },
    { id: 'a1', source: 'apps', kind: 'focus', ts: T0, title: 'Safari', meta: { app: 'Safari', end: T0 + 40 * 60e3, seconds: 2400 } },
    { id: 'c1', source: 'calendar', kind: 'appointment', ts: T0 + 15 * 60e3, title: 'Standup', meta: { end: T0 + 30 * 60e3 } },
    { id: 'g1', source: 'git', kind: 'commit', ts: T0 + 20 * 60e3, title: 'Fix', meta: { repo: 'dailymac' } },
  ];
  const story = { kind: 'site', first: T0 + 10 * 60e3, last: T0 + 30 * 60e3, events: events.slice(0, 2) };
  const x = crossFacts(story, events);
  assert.match(x, /GLI STESSI MINUTI/);
  assert.match(x, /Safari \d+ min/);
  assert.match(x, /«Standup» 15:15–15:30/);
  assert.match(x, /dailymac: «Fix»/);
  // nothing to cross: nothing at all
  assert.equal(crossFacts(story, events.slice(0, 2)), '');
});

test('calendar: the appointments that started, recurring ones too; delicate titles stay private', async () => {
  const dir = path.join(HOME, 'Library/Group Containers/group.com.apple.calendar');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'Calendar.sqlitedb'));
  db.exec(`CREATE TABLE Calendar (ROWID INTEGER PRIMARY KEY, title TEXT);
    CREATE TABLE CalendarItem (ROWID INTEGER PRIMARY KEY, summary TEXT, start_date REAL, end_date REAL, all_day INTEGER, calendar_id INTEGER, entity_type INTEGER, hidden INTEGER);
    CREATE TABLE OccurrenceCache (day REAL, event_id INTEGER, occurrence_date REAL, occurrence_start_date REAL);`);
  const now = Date.now();
  const cd = (ms) => msToCd(ms);
  db.exec(`INSERT INTO Calendar VALUES (1, 'Lavoro'), (2, 'Compleanni')`);
  const ins = db.prepare('INSERT INTO CalendarItem VALUES (?, ?, ?, ?, 0, ?, 2, 0)');
  // a weekly standup created a month ago, a doctor's visit, a birthday, one still to come
  ins.run(1, 'Standup', cd(now - 30 * 86400e3), cd(now - 30 * 86400e3 + 15 * 60e3), 1);
  ins.run(2, 'Visita dal medico', cd(now - 20 * 60e3), cd(now + 10 * 60e3), 1);
  ins.run(3, 'Compleanno di Anna', cd(now - 10 * 60e3), cd(now), 2);
  ins.run(4, 'Cena', cd(now + 3600e3), cd(now + 7200e3), 1);
  const oc = db.prepare('INSERT INTO OccurrenceCache VALUES (0, ?, ?, ?)');
  oc.run(1, cd(now - 40 * 60e3), cd(now - 40 * 60e3));
  oc.run(2, cd(now - 20 * 60e3), null);
  oc.run(3, cd(now - 10 * 60e3), null);
  oc.run(4, cd(now + 3600e3), null);
  db.close();
  assert.equal(calendar.locate().state, 'ok');
  const { events } = await calendar.collect({ since: now - 3600e3, config: {} });
  assert.deepEqual(events.map((e) => e.title), ['Standup', 'Un impegno privato']);
  assert.equal(events[0].meta.minutes, 15);
  assert.equal(events[1].meta.private, true);
});

test('reminders: ticked off and added, from every store', async () => {
  const dir = path.join(HOME, 'Library/Group Containers/group.com.apple.reminders/Container_v1/Stores');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'Data-ABC.sqlite'));
  db.exec(`CREATE TABLE ZREMCDBASELIST (Z_PK INTEGER PRIMARY KEY, ZNAME TEXT);
    CREATE TABLE ZREMCDREMINDER (Z_PK INTEGER PRIMARY KEY, ZTITLE TEXT, ZCOMPLETIONDATE REAL, ZCREATIONDATE REAL, ZLIST INTEGER, ZMARKEDFORDELETION INTEGER);`);
  const now = Date.now();
  db.exec(`INSERT INTO ZREMCDBASELIST VALUES (1, 'Casa')`);
  const ins = db.prepare('INSERT INTO ZREMCDREMINDER VALUES (?, ?, ?, ?, 1, 0)');
  ins.run(1, 'Comprare il caffè', msToCd(now - 5 * 60e3), msToCd(now - 5 * 86400e3));
  ins.run(2, 'Chiamare la banca per il mutuo', null, msToCd(now - 10 * 60e3));
  ins.run(3, 'Vecchio', msToCd(now - 9 * 86400e3), msToCd(now - 10 * 86400e3));
  db.close();
  const { events } = await reminders.collect({ since: now - 3600e3, config: {} });
  assert.deepEqual(events.map((e) => [e.kind, e.title]), [['added', 'Un promemoria privato'], ['done', 'Comprare il caffè']]);
  const [s] = buildStories(events);
  assert.equal(s.kind, 'todo');
  assert.equal(s.section, SECTIONS.notes.name);
  assert.match(factSheet(s), /Promemoria spuntati \(1\)/);
});
