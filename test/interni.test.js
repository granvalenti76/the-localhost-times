import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setLang } from '../server/i18n.js';
import { sandbox } from './helpers.js';
import { gitBin } from '../server/sources/git.js';
import { describe, depsOf, repoStatus, repoWork, interniStories, saveInterni } from '../server/newsroom/interni.js';
import { factSheet } from '../server/newsroom/cluster.js';
import { fallbackArticle } from '../server/newsroom/fallback.js';
import { dayStrip } from '../server/newsroom/strip.js';

test('interni: what a project is, from the first prose paragraph of its README', () => {
  assert.equal(describe('# Title\n\n[![CI](x)](y)\n\n*“A motto”*\n\n**A daily newspaper about your Mac**, written by your local LLM. More here.\n'), 'A daily newspaper about your Mac, written by your local LLM.');
  assert.equal(describe('# Pi\n\n- a list item that is long enough to count\n\nTo update an existing installation:\n\nThis is the home of the Pi agent harness.'), 'This is the home of the Pi agent harness.');
  assert.equal(describe('# Nothing\n\n![logo](x.png)\n'), null);
});

test('interni: the dependencies that arrived, left or changed, from a manifest diff', () => {
  const d = depsOf(`--- a/package.json\n+++ b/package.json\n-    "express": "^4.19.0",\n+    "express": "^5.1.0",\n+    "zod": "^3.23.8",\n-    "lodash": "^4.17.21",\n+  "version": "0.2.0",`);
  assert.deepEqual(d, { arrived: ['zod'], left: ['lodash'], updated: ['express'] });
  assert.deepEqual(depsOf('+requests==2.32.3\n-flask>=2.0').arrived, ['requests']);
});

const git = gitBin();
test('interni: a project read from its repository becomes one story, with how it stands', { skip: !git && 'git is not installed' }, async () => {
  setLang('en');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-interni-'));
  const repo = path.join(dir, 'paper');
  const { store, config, cleanup } = sandbox();
  try {
    fs.mkdirSync(path.join(repo, 'server'), { recursive: true });
    const g = (...a) => execFileSync(git, ['-C', repo, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_DATE: '', GIT_COMMITTER_DATE: '' } });
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 'me@example.com');
    g('config', 'user.name', 'Me');
    fs.writeFileSync(path.join(repo, 'README.md'), '# Paper\n\nA small paper about a Mac, for the tests.\n');
    fs.writeFileSync(path.join(repo, 'package.json'), '{\n  "dependencies": {\n  }\n}\n');
    g('add', '.');
    g('commit', '-q', '-m', 'First page');
    fs.writeFileSync(path.join(repo, 'server', 'press.js'), 'export const press = () => 1;\n'.repeat(20));
    fs.writeFileSync(path.join(repo, 'package.json'), '{\n  "dependencies": {\n    "express": "^5.1.0"\n  }\n}\n');
    g('add', '.');
    g('commit', '-q', '-m', 'The press, with express');
    fs.writeFileSync(path.join(repo, 'server', 'press.js'), 'changed\n');
    // a commit by someone else
    execFileSync(git, ['-C', repo, '-c', 'user.email=ada@example.com', '-c', 'user.name=Ada', 'commit', '-q', '--allow-empty', '-m', 'Review notes'], { stdio: 'pipe' });

    const st = await repoStatus(repo);
    assert.equal(st.branch, 'main');
    assert.equal(st.dirty, 1);
    assert.equal(st.description, 'A small paper about a Mac, for the tests.');
    const w = await repoWork(repo, Date.now() - 3600e3, Date.now() + 60e3, { me: st.me });
    assert.equal(w.commits.length, 3);
    assert.equal(w.commits.filter((c) => !c.mine).length, 1);
    assert.ok(w.born.includes('server/press.js'));
    assert.deepEqual(w.deps.arrived, ['express']);
    assert.equal(w.areas[0].area, 'server');

    saveInterni(store, config, { folder: dir });
    const { stories, board } = await interniStories(store, config, [], { from: Date.now() - 3600e3, to: Date.now() + 60e3 });
    const s = stories.find((x) => x.kind === 'cantiere');
    assert.equal(s.id, 'interni:paper');
    assert.equal(s.section, 'Home Affairs');
    assert.equal(board[0].name, 'paper');
    assert.ok(board[0].active);
    const facts = factSheet(s);
    assert.match(facts, /What it is, in its own README: “A small paper about a Mac/);
    assert.match(facts, /Commits by others \(1\)/);
    assert.match(facts, /New dependencies: express/);
    assert.match(facts, /1 file changed and not committed/);
    const a = fallbackArticle(s);
    assert.ok(a.body.some((p) => /express/.test(p)), a.body.join(' | '));
    // a project switched off in the Settings stays out
    saveInterni(store, config, { repo, on: false });
    assert.equal((await interniStories(store, config, [], { from: Date.now() - 3600e3, to: Date.now() + 60e3 })).stories.length, 0);
  } finally {
    cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('strip: lanes where something happened, the subjects pinned where they were busiest, the sleep shaded', () => {
  const from = new Date(2026, 9, 20, 7).getTime();
  const to = from + 24 * 3600e3;
  const at = (h) => from + h * 3600e3;
  const ev = (source, h, meta = {}, kind = 'visit') => ({ source, kind, ts: at(h), meta });
  const events = [ev('safari', 1, { host: 'nytimes.com' }), ev('safari', 1.05, { host: 'nytimes.com' }), ev('git', 4, {}, 'commit'), ev('safari', 9, { host: 'youtube.com' }),
    ev('power', 17, {}, 'sleep'), ev('power', 23, {}, 'wake')];
  const articles = [{ id: 'subject:lisbon', kind: 'subject', topic: 'Lisbon', first: at(0.5), sources: [{ ts: at(0.5) }, { ts: at(6) }, { ts: at(7) }] }];
  const s = dayStrip(events, articles, from, to);
  assert.equal(s.lanes.world.length, 1);
  assert.equal(s.lanes.home.length, 1);
  assert.equal(s.lanes.culture.length, 1, 'YouTube is culture');
  assert.deepEqual(s.sleep, [[0.708, 0.958]]);
  assert.equal(s.labels[0].text, 'Lisbon');
  assert.equal(s.labels[0].at, 0.25);
});
