import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// fake macOS audio tools: "say" writes its text, "afconvert" copies, "afinfo" reports a duration
const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-bin-'));
const tool = (name, body) => { const f = path.join(bin, name); fs.writeFileSync(f, `#!/bin/sh\n${body}\n`); fs.chmodSync(f, 0o755); return f; };
process.env.LOCALHOST_TIMES_SAY = tool('say', 'if [ "$2" = "?" ]; then echo "Samantha            en_US    # Hello"; echo "Alice               it_IT    # Ciao"; exit 0; fi\nwhile [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift;; -f) in="$2"; shift;; esac; shift; done\ncp "$in" "$out"');
process.env.LOCALHOST_TIMES_AFCONVERT = tool('afconvert', 'eval "out=\\${$#}"; eval "in=\\${$(($#-1))}"; cp "$in" "$out"');
process.env.LOCALHOST_TIMES_AFINFO = tool('afinfo', 'echo "estimated duration: 52.400 sec"');

const { setLang } = await import('../server/i18n.js');
const { radioScript, recordBulletin, radioFeed } = await import('../server/newsroom/radio.js');
const { menubarText } = await import('../server/menubar.js');
const { writerFor, staff, personaPrompt } = await import('../server/newsroom/writers.js');
const { sandbox } = await import('./helpers.js');

const ed = {
  id: '2026-10-08T14', hour: new Date(2026, 9, 8, 14).getTime(), start: new Date(2026, 9, 8, 14).getTime(), status: 'published', createdAt: Date.now(),
  summary: 'An hour of “work” and curiosity…',
  market: { comment: 'A nervous session.' },
  articles: [
    { id: 'a', section: 'World', headline: 'Lead | with a pipe', dek: 'The dek' },
    { id: 'b', section: 'Workshop', headline: 'Second' },
  ],
};

test('radio: the script is for the ear, the bulletin is recorded and listed in the feed', async () => {
  setLang('en');
  const s = radioScript(ed);
  assert.match(s, /^The Localhost Times\. The 14:00 news\./);
  assert.match(s, /Leading the news\. Lead \| with a pipe\./);
  assert.doesNotMatch(s, /[“”…]/);
  assert.match(s, /next bulletin at 16:00/);
  const { store, config, cleanup } = sandbox();
  try {
    config.radio = { enabled: true, voice: '', rate: 180 };
    const r = await recordBulletin(ed, config, () => {});
    assert.equal(r.file, '2026-10-08T14.m4a');
    assert.equal(r.duration, 52.4);
    assert.equal(r.voice, 'Samantha');
    assert.ok(fs.existsSync(path.join(config.dataDir, 'radio', r.file)));
    store.saveEdition({ ...ed, end: ed.start + 3600e3, radio: r });
    const xml = radioFeed(store, { base: 'http://localhost:4321' });
    assert.match(xml, /<enclosure url="http:\/\/localhost:4321\/radio\/2026-10-08T14\.m4a"/);
    assert.match(xml, /<itunes:duration>0:52<\/itunes:duration>/);
    setLang('it');
    assert.equal((await recordBulletin(ed, config, () => {})).voice, 'Alice');
  } finally {
    cleanup();
    setLang('en');
  }
});

test('menu bar: headline on top, pipes escaped, links to the paper', () => {
  setLang('en');
  const t = menubarText({ edition: ed, next: { printsAt: Date.now(), total: 12, stories: [{ topic: 'git' }] }, base: 'http://localhost:4321' });
  const lines = t.trim().split('\n');
  assert.equal(lines[0], '🗞 Lead with a pipe');
  assert.equal(lines[1], '---');
  assert.ok(lines.some((l) => l.includes('href=http://localhost:4321/#/e/2026-10-08T14/a/a')));
  assert.ok(lines.every((l) => (l.match(/\|/g) || []).length <= 1), 'one separator per line at most');
  assert.match(menubarText({ edition: null, next: null, base: 'x' }), /^🗞 The Localhost Times/);
});

test('bylines: sections get their writers, edits apply, unsigned sections have none', () => {
  setLang('it');
  assert.equal(writerFor({}, 'terminal').name, 'Giulio Ferraris');
  const line = { desks: { safari: '' }, staff: { tech: { name: 'Ada' } } };
  assert.equal(writerFor(line, 'safari'), null);
  assert.equal(writerFor(line, 'terminal').name, 'Ada');
  assert.equal(staff(line).tech.role, 'cronista tecnico');
  assert.match(personaPrompt(writerFor(line, 'terminal')), /sei Ada, cronista tecnico/);
  setLang('en');
  assert.equal(writerFor({}, 'brief').name, 'Margaret Holt');
});
