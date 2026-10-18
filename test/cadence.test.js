/**
 * The paper's cadence (hourly, daily, weekly), the Publishing House's settings that reach the
 * writers (wires, characters, the style manual), the proofreader's marks, the writing room and the
 * Editor's career.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { cadenceOf, nextPress, lastPress, workId, draftTimes, spanHours, maxArticlesFor } from '../server/newsroom/cadence.js';
import { printEdition, cleanEvents } from '../server/newsroom/edition.js';
import { getLine, saveLine } from '../server/newsroom/line.js';
import { systemFor } from '../server/newsroom/prompts.js';
import { personaPrompt, staff } from '../server/newsroom/writers.js';
import { marksFor, applyFix } from '../server/newsroom/marks.js';
import { partialArticle } from '../server/newsroom/live.js';
import { staffView } from '../server/newsroom/house.js';
import { nudge, addLesson, lessonFromMark, moodOf } from '../server/newsroom/people.js';
import { writerFor } from '../server/newsroom/writers.js';
import { workbenchView, dueRounds, getWorkbench } from '../server/newsroom/workbench.js';
import { keepHand } from '../server/newsroom/edition.js';
import { dayKey } from '../server/util.js';
import { sandbox, quiet } from './helpers.js';

const HOUR = 3600e3;
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test('the presses of each cadence', () => {
  const now = at(2026, 10, 14, 15, 20); // a Wednesday
  // a new paper is the morning daily
  assert.deepEqual([cadenceOf({}).kind, cadenceOf({}).pressHour], ['daily', 7]);
  const hourly = cadenceOf({ cadence: { kind: 'hourly' } });
  assert.equal(nextPress(hourly, now), at(2026, 10, 14, 16));
  assert.equal(workId(hourly, now), '2026-10-14T15');

  const daily = cadenceOf({ cadence: { kind: 'daily', pressHour: 19 } });
  assert.equal(nextPress(daily, now), at(2026, 10, 14, 19));
  assert.equal(nextPress(daily, at(2026, 10, 14, 19, 5)), at(2026, 10, 15, 19));
  assert.equal(lastPress(daily, now), at(2026, 10, 13, 19));
  assert.equal(workId(daily, now), '2026-10-14T18');
  assert.deepEqual(draftTimes(daily, {}, at(2026, 10, 14, 19)).map((r) => new Date(r.at).getHours()), [16, 18]);
  assert.equal(spanHours(daily, {}), 24);

  const weekly = cadenceOf({ cadence: { kind: 'weekly', pressHour: 9, weekday: 0 } });
  assert.equal(nextPress(weekly, now), at(2026, 10, 18, 9));
  assert.equal(lastPress(weekly, now), at(2026, 10, 11, 9));
  assert.ok(maxArticlesFor(daily, { edition: { maxArticles: 9 } }) > maxArticlesFor(hourly, { edition: { maxArticles: 9 } }));
});

const visits = (from, n, step, host = 'chess.com') => Array.from({ length: n }, (_, i) => ({
  id: `v${from}-${i}`, source: 'safari', kind: 'visit', ts: from + i * step, title: `alice vs. bob | Analysis ${i}`, detail: 'a detail', url: `https://${host}/game/${i}`, meta: { host },
}));

test('a daily paper covers the day since the last press', async () => {
  setLang('en');
  const { config, store, cleanup } = sandbox();
  try {
    saveLine(store, { cadence: { kind: 'daily', pressHour: 19 } });
    const press = at(2026, 10, 14, 19);
    // yesterday evening, this morning, this afternoon: all in one paper
    store.insertEvents([...visits(at(2026, 10, 13, 20), 6, 5 * 60e3), ...visits(at(2026, 10, 14, 9), 6, 5 * 60e3, 'example.org'), ...visits(at(2026, 10, 14, 16), 6, 5 * 60e3, 'news.org')]);
    const ed = await printEdition({ store, config, start: press - HOUR, final: true, log: quiet });
    assert.ok(ed, 'no daily edition');
    assert.equal(ed.id, '2026-10-14T18');
    assert.equal(ed.start, at(2026, 10, 13, 20), 'the paper should start at the first signal after the last press');
    assert.equal(ed.cadence, 'daily');
    assert.ok(ed.articles.length >= 3);
    // the drafting rounds of a daily paper: three hours and one hour before the press
    const cad = getLine(store).cadence;
    assert.deepEqual(dueRounds(config, getWorkbench(store, '2026-10-14T18'), at(2026, 10, 14, 16, 30), cad).length, 1);
    const v = workbenchView(store, config, { now: at(2026, 10, 14, 17) });
    assert.equal(v.editionId, '2026-10-14T18');
    assert.equal(v.printsAt, press);
  } finally {
    cleanup();
  }
});

test('wires: titles keep the contents out, off keeps the source out', () => {
  const { config, store, cleanup } = sandbox();
  try {
    const line = saveLine(store, { wires: { safari: 'titles', mail: 'off', notes: 'full' } });
    assert.deepEqual(line.wires, { safari: 'titles', mail: 'off' });
    const ev = [
      { source: 'safari', kind: 'visit', ts: 1, title: 'T', detail: 'secret', url: 'https://a.org', meta: { host: 'a.org', snippet: 'secret' } },
      { source: 'mail', kind: 'received', ts: 2, title: 'M', meta: {} },
    ];
    const out = cleanEvents(ev, config, line);
    assert.equal(out.length, 1);
    assert.equal(out[0].detail, null);
    assert.equal(out[0].meta.snippet, undefined);
    assert.equal(out[0].title, 'T');
  } finally {
    cleanup();
  }
});

test('a writer\'s character and the Editor\'s own manual reach the instructions', () => {
  setLang('it');
  const { store, cleanup } = sandbox();
  try {
    const line = saveLine(store, { staff: { local: { traits: { irony: 4, pace: 2, ending: 0 } } }, manual: { voice: 'VOCE DEL DIRETTORE', headlines: '' } });
    assert.deepEqual(line.staff.local.traits, { irony: 4, ending: 0 });
    const w = staff(line).local;
    const p = personaPrompt(w);
    assert.match(p, /IL TUO CARATTERE/);
    assert.match(p, /beffardo/);
    assert.match(p, /malinconica/);
    const sys = systemFor(line, w);
    assert.match(sys, /VOCE DEL DIRETTORE/);
    assert.match(sys, /nell'ultima ora/);
    const daily = saveLine(store, { cadence: { kind: 'daily' } });
    assert.match(systemFor(daily, w), /nell'ultimo giorno/);
    assert.equal(staffView(store).staff.find((x) => x.id === 'local').traits.irony, 4);
  } finally {
    cleanup();
    setLang('en');
  }
});

test('the proofreader pins problems to words, and a fix lands in place', () => {
  setLang('it');
  const facts = 'Sezione: Cronaca\n- 21:04 «npm test» 3 falliti\n- 21:09 ricerca «vitest mock timers»\n- 21:47 «npm test» passati';
  const text = {
    headline: 'TurboCode, la terza sera',
    dek: 'Tre test rotti.',
    body: ['Alle 21:04 la suite ha dato tre errori: un passaggio cruciale.', 'Ha cercato in quattro varianti e, quaranta minuti dopo, i test sono passati.'],
  };
  const marks = marksFor(text, facts);
  const kinds = marks.map((x) => x.kind);
  assert.ok(kinds.includes('inflated'), 'cruciale not caught');
  assert.ok(kinds.includes('figure'), '«quattro» not caught');
  assert.ok(kinds.includes('interval'), 'the interval not caught');
  const cru = marks.find((x) => x.kind === 'inflated');
  assert.equal(cru.text, 'cruciale');
  const fixed = applyFix(text, cru, cru.fixes[0].to);
  assert.match(fixed.body[0], /importante/);
  const iv = marks.find((x) => x.kind === 'interval');
  assert.ok(iv.fixes.some((f) => f.to === 'alle 21:47'));
  setLang('en');
});

test('the writing room reads a piece while it is being typed', () => {
  const a = partialArticle('{"kicker": "Local", "headline": "TurboCode, the third night", "dek": "Three tests", "body": ["At 21:04 the suite failed.", "Then Saf');
  assert.equal(a.headline, 'TurboCode, the third night');
  assert.equal(a.body.length, 2);
  assert.equal(a.body[1], 'Then Saf');
  assert.deepEqual(partialArticle('{"kick').body, []);
});

test('a rewrite keeps the corrections the Editor made by hand', () => {
  setLang('it');
  const corrected = { chain: [{ who: 'reporter' }, { who: 'editor' }, { who: 'chief', kind: 'edit' }] };
  assert.match(keepHand(corrected, 'Più corto'), /^Più corto .*tieni quelle correzioni/);
  // corrections made on an older version don't count: the reporter has written since
  const old = { chain: [{ who: 'chief', kind: 'edit' }, { who: 'reporter' }] };
  assert.equal(keepHand(old, 'Più corto'), 'Più corto');
  setLang('en');
});

test('the staff: moods and lessons reach the writers', () => {
  setLang('it');
  const { store, cleanup } = sandbox();
  try {
    // a ♥ and a pass cheer a writer up; the persona says so
    const tonino = staff(getLine(store)).local;
    nudge(store, tonino, 'like');
    nudge(store, tonino, 'visto');
    assert.equal(staff(getLine(store)).local.mood, 'inspired');
    assert.match(personaPrompt(staff(getLine(store)).local), /OGGI SEI ISPIRATO/);
    // a correction becomes a lesson, once
    assert.equal(addLesson(store, 'local', lessonFromMark('inflated', 'cruciale')), true);
    assert.equal(addLesson(store, 'local', lessonFromMark('inflated', 'cruciale')), false);
    assert.match(personaPrompt(staff(getLine(store)).local), /Non scrivere «cruciale»/);

    assert.equal(staffView(store).staff.find((x) => x.id === 'local').lessons.length, 1);
    assert.equal(moodOf([], 'x'), 'fine');
  } finally {
    cleanup();
    setLang('en');
  }
});

test('the managing editor has a character and an opinion of the Editor', async () => {
  setLang('it');
  const { store, cleanup } = sandbox();
  try {
    const { chiefReacts, chiefView, chiefPrompt, chiefOf } = await import('../server/newsroom/chief.js');
    saveLine(store, { chief: { name: 'Nives Bassi', severity: 4, peeve: 'odia gli avverbi' } });
    getLine(store);
    assert.equal(chiefOf().name, 'Nives Bassi');
    assert.match(chiefPrompt(), /spietato/);
    assert.match(chiefPrompt(), /odia gli avverbi/);
    const sentBack = { text: { headline: 'Titolo' }, chain: [{ who: 'reporter' }, { who: 'editor', verdict: 'rework', notes: ['Apri sul fatto'] }] };
    const passed = { text: { headline: 'Altro' }, chain: [{ who: 'reporter' }, { who: 'editor', verdict: 'ok', notes: [] }] };
    assert.equal(chiefReacts(store, sentBack, 'pass').kind, 'overruled');
    assert.equal(chiefReacts(store, passed, 'pass').kind, 'agreed');
    assert.equal(chiefReacts(store, { chain: [{ who: 'reporter' }] }, 'pass'), null, 'a piece they did not read');
    const v = chiefView(store);
    assert.equal(v.esteem, 57);
    assert.deepEqual(v.week, { agreed: 1, overruled: 1 });
  } finally {
    cleanup();
    setLang('en');
  }
});

test('sources: attention weighs the web, a project becomes one story, the terminal follows the cd', async () => {
  const { buildStories, attentionBySite, projectOfCommands, factSheet } = await import('../server/newsroom/cluster.js');
  const { fallbackArticle } = await import('../server/newsroom/fallback.js');
  const { BROKEN } = await import('./helpers.js');
  for (const l of ['en', 'it']) {
    setLang(l);
    const h = at(2026, 10, 14, 15);
    const MIN = 60e3;
    // a feed reloaded 40 times in 4 minutes, an article site read for 40 minutes in 4 pages
    const feed = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, source: 'safari', kind: 'visit', ts: h + i * 6e3, title: `Post ${i}`, url: `https://feed.example/p/${i}`, meta: { host: 'feed.example' } }));
    const read = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, source: 'safari', kind: 'visit', ts: h + 5 * MIN + i * 10 * MIN, title: `A long essay, part ${i + 1}`, url: `https://essays.example/${i}`, meta: { host: 'essays.example' } }));
    const focus = [{ id: 'a1', source: 'apps', kind: 'focus', ts: h, title: 'Safari', meta: { app: 'Safari', end: h + 46 * MIN, seconds: 46 * 60 } }];
    const att = attentionBySite([...feed, ...read], focus);
    assert.ok(att.get('feed.example') <= 5, `feed attention ${att.get('feed.example')}`);
    assert.ok(att.get('essays.example') >= 35, `essay attention ${att.get('essays.example')}`);
    const web = buildStories([...feed, ...read, ...focus]).filter((s) => s.kind === 'site');
    assert.equal(web[0].topic, 'essays.example', 'the site read for 40 minutes should outweigh the feed');

    // a project: files saved, commits, commands after a cd into it, the editor in front
    const P = h + 50 * MIN;
    const files = Array.from({ length: 6 }, (_, i) => ({ id: `fl${i}`, source: 'files', kind: i ? 'changed' : 'created', ts: P + i * MIN, title: '.js', meta: { folder: 'Work/git/turbocode', dir: 'Work/git/turbocode/src', project: 'turbocode', ext: 'js' } }));
    const git = [{ id: 'g1', source: 'git', kind: 'commit', ts: P + 8 * MIN, title: 'fix timers, finally', detail: 'turbocode', meta: { repo: 'turbocode', branch: 'main', added: 12, removed: 3, files: 2 } }];
    const cmds = ['cd ~/Work/git/turbocode', 'npm test', 'ls', 'git commit -m "fix timers, finally"', 'cd ~', 'brew upgrade'].map((c, i) => ({ id: `t${i}`, source: 'terminal', kind: 'command', ts: P + i * MIN, title: c, meta: { family: c.split(' ')[0] === 'git' ? 'git commit' : c.split(' ')[0] === 'npm' ? 'npm test' : c.split(' ')[0], timed: true } }));
    const where = projectOfCommands(cmds, new Set(['turbocode']));
    assert.equal(where.get('t1'), 'turbocode');
    assert.equal(where.has('t5'), false, 'after cd ~ the commands are no longer in the project');
    const ed = [{ id: 'a2', source: 'apps', kind: 'focus', ts: P, title: 'Ghostty', meta: { app: 'Ghostty', end: P + 12 * MIN, seconds: 720 } }];
    const stories = buildStories([...files, ...git, ...cmds, ...ed]);
    const proj = stories.find((s) => s.kind === 'project');
    assert.ok(proj, `no project story: ${stories.map((s) => s.id).join(', ')}`);
    assert.equal(proj.topic, 'turbocode');
    assert.ok(!stories.some((s) => s.kind === 'folder' || s.kind === 'commits'), 'folder and commits should be inside the project');
    assert.ok(stories.some((s) => s.kind === 'session' && s.events.some((e) => e.title === 'brew upgrade')), 'commands outside the project stay in the terminal');
    const sheet = factSheet(proj);
    assert.match(sheet, /fix timers, finally/);
    assert.match(sheet, /Ghostty/);
    assert.doesNotMatch(sheet, /\$ ls\b/, 'housekeeping commands are not quoted');
    const a = fallbackArticle(proj);
    assert.ok(a.headline && a.body.length);
    assert.doesNotMatch([a.headline, a.dek, ...a.body].join(' '), BROKEN);
  }
  setLang('en');
});
