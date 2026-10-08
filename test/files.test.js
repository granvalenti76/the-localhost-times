import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// a fake home with a project, build noise and a hidden file; a fake mdfind that lists everything
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-home-'));
process.env.HOME = home;
const write = (p) => { fs.mkdirSync(path.dirname(path.join(home, p)), { recursive: true }); fs.writeFileSync(path.join(home, p), 'x'); };
write('Work/app/.git/HEAD');
write('Work/app/src/main.js');
write('Work/app/src/view.jsx');
write('Work/app/node_modules/lib/index.js');
write('Work/app/.env');
write('Documents/Medical/report.pdf');
write('Documents/Taxes/2026.pdf');
const fake = path.join(home, 'mdfind');
fs.writeFileSync(fake, '#!/bin/sh\nfind "$2" -type f\n');
fs.chmodSync(fake, 0o755);
process.env.LOCALHOST_TIMES_MDFIND = fake;

const { default: files } = await import('../server/sources/files.js');
const { setLang } = await import('../server/i18n.js');

test('files: folders and types, no build noise, no names by default, exclusions respected', async () => {
  setLang('en');
  const config = { files: { folders: ['Work', 'Documents'], exclude: ['Documents/Medical'], includeNames: false }, privacy: {} };
  const { events } = await files.collect({ since: Date.now() - 3600e3, config });
  const dirs = events.map((e) => e.meta.dir);
  assert.ok(dirs.includes('Work/app/src'));
  assert.ok(!dirs.some((d) => d.includes('node_modules')), 'build folders are skipped');
  assert.ok(!events.some((e) => e.meta.ext === 'env' || e.title === '.env'), 'hidden files are skipped');
  assert.ok(!dirs.some((d) => d.includes('Medical')), 'excluded folders are skipped');
  assert.ok(events.every((e) => e.title.startsWith('.')), 'no file names by default');
  const app = events.find((e) => e.meta.ext === 'js');
  assert.equal(app.meta.project, 'app');
  assert.equal(app.meta.folder, 'Work/app');
  const names = await files.collect({ since: Date.now() - 3600e3, config: { files: { folders: ['Work'], includeNames: true }, privacy: {} } });
  assert.ok(names.events.some((e) => e.title === 'main.js'));
  fs.rmSync(home, { recursive: true, force: true });
});
