import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from '../server/config.js';
import { sandbox } from './helpers.js';

test('config: missing keys keep defaults, null is a real value', () => {
  const c = defaultConfig({ edition: { eveningHour: null }, llm: { model: 'x' } });
  assert.equal(c.edition.eveningHour, null);
  assert.equal(c.edition.maxArticles, 9);
  assert.equal(c.llm.model, 'x');
  assert.equal(c.llm.baseUrl, 'auto');
  assert.equal(c.host, '127.0.0.1');
});

test('old raw signals are thinned: the moments go, one of each thing a day stays', () => {
  const { store, cleanup } = sandbox();
  try {
    const now = Date.now();
    const old = now - 90 * 864e5;
    const e = (id, source, kind, ts, title, url = null) => ({ id, source, kind, ts, title, detail: null, url, meta: {} });
    store.insertEvents([
      e('a', 'safari', 'visit', old, 'An article', 'https://example.org/a'),
      e('a2', 'safari', 'visit', old + 60e3, 'An article', 'https://example.org/a'),
      e('f', 'apps', 'focus', old, 'Safari'),
      e('b', 'safari', 'visit', now - 3600e3, 'new', 'https://example.org/b'),
      e('b2', 'safari', 'visit', now - 3500e3, 'new', 'https://example.org/b'),
    ]);
    assert.equal(store.pruneEvents(now - 60 * 864e5), 2);
    assert.deepEqual(store.eventsBetween(0, now).map((x) => x.id), ['a', 'b', 'b2']);
    // the archive still finds the old article; `all` forgets it too
    assert.equal(store.db.prepare(`SELECT COUNT(*) AS n FROM search WHERE kind = 'event'`).get().n, 3);
    assert.equal(store.pruneEvents(now - 60 * 864e5, { all: true }), 1);
    assert.deepEqual(store.eventsBetween(0, now).map((x) => x.id), ['b', 'b2']);
  } finally {
    cleanup();
  }
});
