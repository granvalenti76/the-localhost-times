import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { printEdition } from '../server/newsroom/edition.js';
import { getSteer, nextEditionId } from '../server/newsroom/next.js';
import { addTip, matchTip, tipsFromNotes } from '../server/newsroom/tips.js';
import { checkRecords, metrics } from '../server/newsroom/records.js';
import { lint } from '../server/newsroom/lint.js';
import { paragraphAction, verdict, headlineOptions, getTaste } from '../server/newsroom/bench.js';
import { tastePrompt } from '../server/newsroom/writers.js';
import { getLine, saveLine } from '../server/newsroom/line.js';
import { chatter } from '../server/newsroom/chatter.js';
import { menubarText } from '../server/menubar.js';
import { buildStories } from '../server/newsroom/cluster.js';
import { hourStart } from '../server/util.js';
import { sandbox, quiet, BROKEN } from './helpers.js';

const HOUR = 3600e3;
const MIN = 60e3;

/** An hour on chess.com and a few commands: enough for a lead story. */
function hourOfChess(h, n = 30) {
  const ev = [];
  for (let i = 0; i < n; i++) {
    ev.push({ id: `c${h}-${i}`, source: 'safari', kind: 'visit', ts: h + (i + 1) * 60e3, title: i % 3 ? `alice vs. bob${i % 2} | Analysis` : 'Play Chess Online', detail: null, url: 'https://www.chess.com/game', meta: { host: 'chess.com' } });
  }
  for (let i = 0; i < 6; i++) ev.push({ id: `t${h}-${i}`, source: 'terminal', kind: 'command', ts: h + (40 + i) * 60e3, title: i === 5 ? 'git commit -m "fix the press"' : 'npm test', detail: null, url: null, meta: { family: i === 5 ? 'git commit' : 'npm', timed: true } });
  for (let i = 0; i < 4; i++) ev.push({ id: `y${h}-${i}`, source: 'safari', kind: 'visit', ts: h + (20 + i) * 60e3, title: `A video about knights ${i}`, detail: null, url: 'https://youtube.com/watch', meta: { host: 'youtube.com' } });
  return ev;
}

const wait = async (cond, ms = 4000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

test('tips: from Notes, matched to their story', async () => {
  const { config, store, cleanup } = sandbox();
  try {
    const h = hourStart(Date.now()) - 2 * HOUR;
    store.insertEvents(hourOfChess(h));
    const notes = [{ id: 'n1', source: 'notes', kind: 'edited', ts: h + 5 * MIN, title: 'chess', detail: 'Redazione', url: null, meta: { noteId: 9, folder: 'Redazione', snippet: 'I lost five chess games in a row on chess.com' } }];
    store.insertEvents(notes);
    assert.equal(tipsFromNotes(store, config, notes), 1);
    addTip(store, { text: 'The cat walked on the keyboard', ts: h + 6 * MIN });
    const stories = buildStories(hourOfChess(h));
    assert.equal(matchTip({ text: 'five games on chess.com' }, stories)?.topic, 'chess.com');
    const ed = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
    assert.ok(ed.articles.some((a) => a.tipped), 'the tip went nowhere');
    // the tip note itself is not news
    assert.ok(!ed.articles.some((a) => a.source === 'notes'));
    // a reprint uses the same tips again
    const again = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
    assert.ok(again.articles.some((a) => a.tipped), 'the reprint lost the tip');
  } finally { cleanup(); }
});

test('records: only with enough history; reprints don\'t count twice', async () => {
  const { config, store, cleanup } = sandbox();
  try {
    const list = [{ key: 'site:chess.com', kind: 'site', value: 20, label: 'Visits', story: () => true }];
    assert.deepEqual(checkRecords(store, list, { editionId: 'e1', at: 1 }), []); // first time: nothing to beat
    store.setSetting('records', { editions: 30, lastEd: 'x', keys: { 'site:chess.com': { obs: 5, label: 'Visits', best: { value: 20, at: 1, editionId: 'old' } } } });
    const r = checkRecords(store, [{ ...list[0], value: 31 }], { editionId: 'e2', at: 2 });
    assert.equal(r.length, 1);
    assert.equal(r[0].prev, 20);
    // the same edition reprinted: still a record against the same baseline
    assert.equal(checkRecords(store, [{ ...list[0], value: 31 }], { editionId: 'e2', at: 2 })[0].prev, 20);
    assert.equal(store.getSetting('records').keys['site:chess.com'].obs, 6);

    const evs = hourOfChess(hourStart(Date.now()), 45);
    const m = metrics({ news: evs, stats: { total: evs.length, commands: 6, searches: 0 }, time: null });
    assert.ok(m.some((x) => x.key === 'site:chess.com'));
  } finally { cleanup(); }
});

test('lint: the tics of small models are counted', () => {
  setLang('it');
  try {
    const bad = lint(['Alle 18:22 il proprietario apre YouTube. Alle 18:23 il proprietario cerca. Alle 18:25 il proprietario chiude. Forse cercava la musica, forse il nome. Nessun like, nessun commento.']);
    assert.ok(bad.score < 70, `score ${bad.score}`);
    assert.ok(bad.issues.some((i) => i.id === 'time-starts'));
    assert.ok(bad.issues.some((i) => i.id === 'invented-absence'));
    const good = lint(['Il pomeriggio comincia con un uomo che spiega come si paga un caffè con il telefono. Finisce con un illusionista di Las Vegas.']);
    assert.equal(good.score, 100);
  } finally { setLang('en'); }
});


test('the bench: a paragraph liked becomes an example, keep and cut are counted', async () => {
  const { config, store, cleanup } = sandbox();
  try {
    const h = hourStart(Date.now()) - 2 * HOUR;
    store.insertEvents(hourOfChess(h));
    const ed = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
    const a = ed.articles.find((x) => x.body.length >= 2) || ed.articles[0];
    await paragraphAction(store, config, ed.id, a.id, { index: 0, op: 'like' });
    assert.equal(getTaste(store).liked.length, 1);
    assert.match(tastePrompt(getLine(store), null), /LIKED/);
    saveLine(store, { length: 'long' });
    assert.equal(getLine(store).taste.liked.length, 1, 'the taste was lost saving the line');
    assert.equal(store.getSetting('line').taste, undefined, 'the taste leaked into the line');
    if (a.body.length >= 2) {
      const n = a.body.length;
      const after = await paragraphAction(store, config, ed.id, a.id, { index: 1, op: 'cut' });
      assert.equal(after.articles.find((x) => x.id === a.id).body.length, n - 1);
    }
    await assert.rejects(() => paragraphAction(store, config, ed.id, a.id, { index: 0, op: 'rewrite', instruction: 'meaner' }), /not answering|non risponde/);
    const opts = await headlineOptions(store, config, ed.id, a.id);
    assert.ok(Array.isArray(opts.options));
    verdict(store, ed.id, ed.articles[0].id, 'keep');
    const last = store.getEdition(ed.id).articles.at(-1).id;
    const cut = verdict(store, ed.id, last, 'cut');
    assert.ok(!cut.articles.some((x) => x.id === last));
    const stats = Object.values(getTaste(store).stats);
    assert.equal(stats.reduce((t, s) => t + s.kept + s.cut, 0), 2);
  } finally { cleanup(); }
});

test('the menu bar shows the lead, and Spotlight waiting for a comment', () => {
  const txt = menubarText({
    edition: { id: '2026-10-08T11', hour: new Date(2026, 9, 8, 11).getTime(), articles: [{ id: 'a', section: 'World', headline: 'Chess, again' }], summary: 'A busy hour.' },
    next: null, base: 'http://localhost:4321', port: 4321,
    spotlight: { waiting: [{ subject: 'chess', desk: { headline: 'The evenings' } }], open: 2, scoop: null },
  });
  assert.match(txt.split('\n')[0], /◉ 🗞 Chess, again/);
  assert.match(txt, /#\/e\/2026-10-08T11\/a\/a/);
  assert.match(txt, /#\/newsroom\/spotlight/);
});
