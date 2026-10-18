import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { demoEvents } from '../server/demo.js';
import { buildStories, factSheet } from '../server/newsroom/cluster.js';
import { fallbackArticle, fallbackSummary } from '../server/newsroom/fallback.js';
import { printEdition, editCartoon, spikeArticle, restoreArticle, editArticle } from '../server/newsroom/edition.js';
import { printEvening } from '../server/newsroom/evening.js';
import { rssFeed } from '../server/feed.js';
import { hourStart, dayKey } from '../server/util.js';
import { sandbox, quiet, BROKEN } from './helpers.js';

const HOUR = 3600e3;

for (const l of ['en', 'it']) {
  test(`[${l}] the typesetting writes every kind of story without gaps`, () => {
    setLang(l);
    // a fixed afternoon: at night the demo's hours are quiet, and some kinds of story don't form
    const afternoon = new Date(2026, 9, 8, 18, 30).getTime();
    const stories = buildStories(demoEvents(9, afternoon));
    const kinds = new Set(stories.map((s) => s.kind));
    for (const k of ['searches', 'site', 'thread', 'inbox', 'session', 'note', 'entry', 'episode', 'book', 'folder', 'downloads', 'timesheet', 'shots']) assert.ok(kinds.has(k), `demo lacks ${k}`);
    for (const s of stories) {
      const a = fallbackArticle(s);
      assert.ok(a.headline?.trim(), `${s.id}: no headline`);
      assert.ok(Array.isArray(a.body) && a.body.length, `${s.id}: no body`);
      const text = [a.kicker, a.headline, a.dek, ...a.body].join(' ');
      assert.doesNotMatch(text, BROKEN, `${s.id}: ${text}`);
      assert.doesNotMatch(factSheet(s), /undefined|NaN/, `${s.id} fact sheet`);
    }
    assert.doesNotMatch(fallbackSummary(stories.slice(0, 4).map(fallbackArticle).map((a, i) => ({ ...a, section: stories[i].section })), 42), BROKEN);
    setLang('en');
  });

  test(`[${l}] an hourly edition and the evening edition print end to end`, async () => {
    setLang(l);
    const { config, store, cleanup } = sandbox();
    try {
      const now = Date.now();
      store.insertEvents(demoEvents(6, now));
      const start = hourStart(now) - HOUR;
      const ed = await printEdition({ store, config, start, final: true, force: true, log: quiet });
      assert.ok(ed, 'no edition');
      assert.ok(ed.articles.length > 0);
      assert.equal(ed.writer, 'typesetting');
      assert.ok(ed.summary && ed.cartoon?.caption && ed.cartoon?.scene);
      assert.equal(store.getEdition(ed.id).id, ed.id);

      // the desk: spike and restore, change the cartoon
      const first = ed.articles[0].id;
      assert.ok(!spikeArticle(store, ed.id, first).articles.some((a) => a.id === first));
      assert.ok(restoreArticle(store, ed.id, first).articles.some((a) => a.id === first));
      assert.equal(editCartoon(store, ed.id, { scene: 'cat' }).cartoon.scene, 'cat');
      assert.throws(() => editCartoon(store, ed.id, { scene: 'giraffe' }));

      const ev = await printEvening({ store, config, day: dayKey(start), log: quiet });
      assert.ok(ev?.editorial?.headline && ev.editorial.body.length === 3);
      assert.doesNotMatch(ev.editorial.body.join(' '), BROKEN);

      const xml = rssFeed(store, { base: 'http://localhost:4321' });
      assert.match(xml, /^<\?xml/);
      assert.equal((xml.match(/<item>/g) || []).length, (xml.match(/<\/item>/g) || []).length);
      assert.ok(xml.includes(ed.articles[0].headline.replace(/&/g, '&amp;').replace(/</g, '&lt;')));
      assert.equal(rssFeed(store, { base: 'x', section: 'nope' }), null);
      // the Editor's hand joins the piece's passages, and the text before it is kept as the draft
      const before = ed.articles[0].headline;
      const edited = editArticle(store, ed.id, first, { headline: 'A headline by hand' }).articles.find((a) => a.id === first);
      assert.equal(edited.draft.headline, before);
      assert.equal(edited.chain.at(-1).who, 'chief');
      assert.equal(edited.chain.at(-1).kind, 'headline');
    } finally {
      cleanup();
      setLang('en');
    }
  });
}

test('newsworthiness: a few minutes of browsing is a brief; twins are one story; the lead always prints', async () => {
  const { newsworthy, pickNews } = await import('../server/newsroom/edition.js');
  const { mergeTwins } = await import('../server/newsroom/cluster.js');
  const daily = { kind: 'daily' };
  const MIN = 60e3;
  const st = (id, kind, weight, n, minutes, extra = {}) => ({ id, source: 'safari', kind, weight, topic: id, events: Array.from({ length: n }, (_, i) => ({ ts: i * (minutes * MIN) / Math.max(1, n - 1) })), first: 0, last: minutes * MIN, ...extra });
  const lead = st('github.com', 'site', 12, 60, 400);
  assert.equal(newsworthy(st('a streaming site', 'site', 6.7, 5, 5), 12, daily), false, 'five visits in five minutes made a piece');
  assert.equal(newsworthy(st('a long read', 'site', 6, 6, 300), 12, daily), true);
  assert.equal(newsworthy(st('the tail', 'site', 3, 30, 300), 12, daily), false, 'far below the lead');
  assert.equal(newsworthy(st('chosen', 'site', 1, 2, 1, { boosted: true }), 12, daily), true, 'the Editor\'s choice was dropped');
  const { main, rest } = pickNews([lead, st('x', 'site', 6.7, 5, 5), st('y', 'site', 6, 9, 200)], 7, daily);
  assert.deepEqual(main.map((s) => s.id), ['github.com', 'y']);
  assert.deepEqual(rest.map((s) => s.id), ['x']);
  // a quiet day: the lead prints anyway
  assert.equal(pickNews([st('z', 'site', 1, 2, 1)], 7, daily).main.length, 1);
  // the same diary title six times: one story, with all six entries
  const entries = Array.from({ length: 6 }, (_, i) => ({ id: `journal:entry:${i}`, source: 'journal', kind: 'entry', weight: 3, topic: 'A day made of paper', events: [{ ts: i }], first: i, last: i }));
  const merged = mergeTwins([...entries, lead]);
  assert.equal(merged.length, 2);
  const twin = merged.find((s) => s.kind === 'entry');
  assert.equal(twin.events.length, 6);
  assert.ok(twin.weight > 3);
});
