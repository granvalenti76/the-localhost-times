import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// databases from 1 byte up are read in place (so the test exercises the direct path)
process.env.LOCALHOST_TIMES_DIRECT_MIN = '1';
const { DatabaseSync } = await import('node:sqlite');
const { setLang } = await import('../server/i18n.js');
const { snapshot, fingerprint, msToCd } = await import('../server/util.js');
const { parsePmset } = await import('../server/sources/power.js');
const { createTimeline, parseProbe } = await import('../server/sources/apps.js');
const photos = (await import('../server/sources/photos.js')).default;
const { computeTime, computeMac } = await import('../server/newsroom/time.js');
const { sandbox } = await import('./helpers.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lt-sig-'));

test('collection: big databases are read in place, read-only; unchanged ones are recognised', () => {
  const dir = tmp();
  try {
    const f = path.join(dir, 'app.sqlite');
    const w = new DatabaseSync(f);
    w.exec('PRAGMA journal_mode=WAL; CREATE TABLE t(x); INSERT INTO t VALUES (1)');
    const s = snapshot(f);
    assert.equal(s.direct, true);
    assert.equal(s.db.prepare('SELECT count(*) AS n FROM t').get().n, 1);
    assert.throws(() => s.db.exec('INSERT INTO t VALUES (2)'));
    s.close();
    const a = fingerprint([f]);
    assert.equal(fingerprint([f]), a);
    w.exec('INSERT INTO t VALUES (3)');
    assert.notEqual(fingerprint([f]), a);
    assert.equal(fingerprint([dir]), null); // a folder can't be fingerprinted
    w.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the Mac: the power log becomes wake, sleep and display events', () => {
  setLang('en');
  const log = [
    '2026-10-08 08:57:34 +0200 Wake                \tWake from Deep Idle [CDNVA] : due to EC.LidOpen/Lid Open SMC.OutboxNotEmpty Using BATT (Charge:83%)',
    '2026-10-08 08:57:35 +0200 Notification        \tDisplay is turned on',
    '2026-10-08 10:02:00 +0200 DarkWake            \tDarkWake from Deep Idle [CDN] : due to RTC/Maintenance Using AC (Charge:83%) 45 secs',
    '2026-10-08 12:33:01 +0200 Sleep               \tEntering Sleep state due to \'Clamshell Sleep\':TCPKeepAlive=active Using Batt (Charge:61%) 2337 secs',
    '2026-10-08 12:40:00 +0200 Sleep               \tEntering Sleep state due to \'Maintenance Sleep\':TCPKeepAlive=active Using AC (Charge:61%) 20 secs',
    'garbage line',
  ].join('\n');
  const evs = parsePmset(log, 0);
  assert.deepEqual(evs.map((e) => e.kind), ['wake', 'display-on', 'sleep']);
  assert.deepEqual(evs[0].meta, { reason: 'lid', power: 'battery', charge: 83 });
  assert.equal(evs[2].meta.reason, 'lid');
  assert.equal(evs[0].ts, Date.parse('2026-10-08T08:57:34+02:00'));
  assert.equal(parsePmset(log, evs[0].ts).length, 2); // only after the cursor
});

test('time: samples become stretches, cut on the hour, with time away', () => {
  setLang('en');
  assert.deepEqual(parseProbe('"LSDisplayName"="Xcode"\nIDLE=3\n'), { app: 'Xcode', idle: 3 });
  const h = new Date(2026, 9, 8, 10, 0, 0).getTime();
  const min = 60e3;
  const tl = createTimeline({ interval: min, exclude: ['WhatsApp'] });
  const feed = (m, app, idle = 0) => tl.sample(h + m * min, { app, idle });
  for (let m = 0; m < 20; m++) feed(m, 'Xcode');
  for (let m = 20; m < 25; m++) feed(m, 'Safari');
  feed(25, 'WhatsApp'); // excluded: not recorded by name
  for (let m = 26; m < 40; m++) feed(m, 'Safari', m >= 33 ? (m - 32) * 60 + 300 : 0); // away from 10:33
  for (let m = 40; m < 75; m++) feed(m, 'Xcode'); // crosses 11:00
  const out = tl.drain(h + 75 * min);
  const names = out.map((s) => (s.away ? 'away' : s.app || '?'));
  assert.deepEqual(names.slice(0, 2), ['Xcode', 'Safari']);
  assert.ok(names.includes('away'));
  assert.ok(!names.includes('WhatsApp'));
  // nothing straddles 11:00
  assert.ok(out.every((s) => new Date(s.start).getHours() === new Date(s.end - 1).getHours()), JSON.stringify(out.map((s) => [new Date(s.start).toTimeString(), new Date(s.end).toTimeString()])));
  // a long gap (the Mac slept) closes the stretch where it was
  const tl2 = createTimeline({ interval: min });
  tl2.sample(h, { app: 'Mail', idle: 0 });
  tl2.sample(h + min, { app: 'Mail', idle: 0 });
  tl2.sample(h + 30 * min, { app: 'Mail', idle: 0 });
  const [first] = tl2.drain(h + 31 * min);
  assert.ok(first.end - first.start < 3 * min);

  // the edition's numbers
  const ev = (app, from, to, away = false) => ({ source: 'apps', kind: away ? 'away' : 'focus', ts: h + from * min, meta: { app, end: h + to * min, seconds: (to - from) * 60 } });
  const t = computeTime([ev('Xcode', 0, 30), ev('Safari', 30, 35), ev(null, 35, 45, true), ev('Xcode', 45, 60), ev('Safari', 60, 70)], h, h + 60 * min);
  assert.deepEqual(t.apps, [{ name: 'Xcode', minutes: 45 }, { name: 'Safari', minutes: 5 }]);
  assert.equal(t.away, 10);
  assert.equal(t.switches, 1);
  assert.equal(t.longest.app, 'Xcode');
  assert.equal(t.longest.minutes, 30);
});

test('the Mac: awake since, naps and battery for an edition', () => {
  const { store, cleanup } = sandbox();
  try {
    const h = new Date(2026, 9, 8, 13, 0, 0).getTime();
    store.insertEvents([
      { id: 'p1', source: 'power', kind: 'wake', ts: h - 4 * 3600e3, title: 'w', meta: { power: 'battery', charge: 90 } },
      { id: 'p2', source: 'power', kind: 'sleep', ts: h + 5 * 60e3, title: 's', meta: { reason: 'lid', power: 'battery', charge: 55 } },
      { id: 'p3', source: 'power', kind: 'wake', ts: h + 50 * 60e3, title: 'w', meta: { power: 'ac', charge: 54 } },
    ]);
    const m = computeMac(store, h, h + 3600e3);
    assert.equal(m.awake, true);
    assert.equal(m.since, h + 50 * 60e3);
    assert.equal(m.sleeps, 1);
    assert.equal(m.lid, 1);
    assert.equal(m.power, 'ac');
    assert.equal(m.lowest, 55);
  } finally {
    cleanup();
  }
});

test('the photographer: counts from the Photos library, never places or file names', async () => {
  setLang('it');
  const dir = tmp();
  try {
    const lib = path.join(dir, 'Lib.photoslibrary');
    fs.mkdirSync(path.join(lib, 'database'), { recursive: true });
    const db = new DatabaseSync(path.join(lib, 'database', 'Photos.sqlite'));
    db.exec(`CREATE TABLE ZASSET (Z_PK INTEGER PRIMARY KEY, ZDATECREATED REAL, ZADDEDDATE REAL, ZKIND INTEGER, ZKINDSUBTYPE INTEGER,
      ZFAVORITE INTEGER, ZDURATION REAL, ZTRASHEDSTATE INTEGER, ZHIDDEN INTEGER, ZLATITUDE REAL, ZLONGITUDE REAL, ZFILENAME TEXT)`);
    const now = Date.now();
    const ins = db.prepare('INSERT INTO ZASSET VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, 45.46, 9.19, ?)');
    ins.run(msToCd(now - 60e3), msToCd(now - 50e3), 0, 2, 1, 0, 0, 0, 'IMG_0001.HEIC'); // live photo, favourite
    ins.run(msToCd(now - 50e3), msToCd(now - 40e3), 1, 0, 0, 12.5, 0, 0, 'IMG_0002.MOV'); // video
    ins.run(msToCd(now - 40e3), msToCd(now - 30e3), 0, 10, 0, 0, 0, 0, 'IMG_0003.PNG'); // screenshot
    ins.run(msToCd(now - 30e3), msToCd(now - 20e3), 0, 0, 0, 0, 1, 0, 'IMG_0004.HEIC'); // trashed: skipped
    ins.run(msToCd(now - 9 * 86400e3), msToCd(now - 10e3), 0, 0, 0, 0, 0, 0, 'OLD.JPG'); // old, imported now
    db.close();
    const { events, cursor } = await photos.collect({ since: now - 3600e3, cursor: null, config: { photos: { library: lib } } });
    assert.deepEqual(events.map((e) => e.kind), ['photo', 'video', 'screenshot', 'imported']);
    assert.equal(events[0].meta.subtype, 'live');
    assert.equal(events[0].meta.favorite, true);
    assert.equal(events[1].meta.seconds, 13);
    assert.ok(cursor.added >= now - 11e3);
    const text = JSON.stringify(events);
    assert.doesNotMatch(text, /45\.46|9\.19|IMG_|OLD\.JPG/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    setLang('en');
  }
});
