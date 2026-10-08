import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { demoEvents } from '../server/demo.js';
import { ftsQuery, search, ask, timeRange } from '../server/newsroom/archive.js';
import { createInvestigation, suggestions } from '../server/newsroom/investigations.js';
import { figures, numbersCheck } from '../server/newsroom/factcheck.js';
import { printEdition } from '../server/newsroom/edition.js';
import { hourStart } from '../server/util.js';
import { sandbox, quiet, BROKEN } from './helpers.js';

test('queries are made safe for FTS5', () => {
  assert.equal(ftsQuery('core data'), '"core"* AND "data"*');
  assert.equal(ftsQuery('"core data" swift'), '"core data" AND "swift"*');
  assert.equal(ftsQuery('how many times on youtube', { any: true }), '"youtube"*');
  assert.equal(ftsQuery('((( AND'), '"and"*');
  assert.equal(ftsQuery('   '), null);
});

test('time words become a range', () => {
  const now = new Date(2026, 9, 8, 15).getTime();
  const y = timeRange('what did I do yesterday?', now);
  assert.equal(new Date(y.from).getDate(), 7);
  assert.equal(timeRange('ultimi 3 giorni', now).to, now);
  assert.equal(timeRange('github', now), null);
});

test('figures in articles are checked against the facts', () => {
  assert.deepEqual(figures('At 8:20, 12 commands; 1,204 visits; 2 tabs; in 2026'), ['08:20', '12', '1204']);
  assert.deepEqual(numbersCheck({ headline: '12 commands', dek: '', body: ['then 45 more at 08:20'] }, '- 08:20 x\n12 in all').unverified, ['45']);
});

for (const l of ['en', 'it']) {
  test(`[${l}] search, ask (offline) and an investigation over the demo archive`, async () => {
    setLang(l);
    const { store, config, cleanup } = sandbox();
    try {
      const now = Date.now();
      store.insertEvents(demoEvents(9, now));
      for (let h = hourStart(now) - 8 * 3600e3; h < now; h += 3600e3) await printEdition({ store, config, start: h, force: true, log: quiet });

      const r = search(store, { q: 'github' });
      assert.ok(r.total > 0 && r.results.length > 0);
      assert.ok(r.results.every((x) => x.ts && x.kind));
      assert.ok(r.results.some((x) => x.snippet.includes('[[')));
      assert.ok(search(store, { q: 'github', kind: 'article' }).results.every((x) => x.kind === 'article' && x.editionId));
      assert.equal(search(store, { q: 'zzzzqqq' }).total, 0);

      const a = await ask(store, config, 'How many times GitHub today?', quiet);
      assert.equal(a.answer, null);
      assert.ok(a.offline && a.items.length > 0);

      const inv = await createInvestigation(store, config, { topic: 'GitHub', days: 7 }, quiet);
      assert.ok(inv.id && inv.headline && inv.sections.length >= 3);
      assert.ok(inv.numbers.total > 0 && inv.numbers.byDay.length === 7);
      assert.doesNotMatch([inv.headline, inv.dek, ...inv.sections.flatMap((s) => s.paragraphs)].join(' '), BROKEN);
      assert.equal(store.getInvestigation(inv.id).headline, inv.headline);
      const none = await createInvestigation(store, config, { topic: 'zzzzqqq', days: 7 }, quiet);
      assert.equal(none.numbers.total, 0);
      assert.ok(Array.isArray(suggestions(store)));

      // a fresh database built from an old one gets its index
      store.db.exec('DELETE FROM search');
      assert.ok(store.needsReindex());
      store.reindex();
      assert.ok(search(store, { q: 'github' }).total > 0);
    } finally {
      cleanup();
      setLang('en');
    }
  });
}
