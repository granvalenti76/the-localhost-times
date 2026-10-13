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
    const stories = buildStories(demoEvents(9));
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
