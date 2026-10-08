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

test('old raw signals are pruned, newer ones kept', () => {
  const { store, cleanup } = sandbox();
  try {
    const now = Date.now();
    store.insertEvents([
      { id: 'a', source: 'safari', kind: 'visit', ts: now - 90 * 864e5, title: 'old', detail: null, url: null, meta: {} },
      { id: 'b', source: 'safari', kind: 'visit', ts: now - 3600e3, title: 'new', detail: null, url: null, meta: {} },
    ]);
    assert.equal(store.pruneEvents(now - 60 * 864e5), 1);
    assert.deepEqual(store.eventsBetween(0, now).map((e) => e.id), ['b']);
  } finally {
    cleanup();
  }
});
