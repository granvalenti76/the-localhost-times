import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { demoEvents } from '../server/demo.js';
import { preview, previewText, steer, getSteer, applySteer, steerLine, nextEditionId } from '../server/newsroom/next.js';
import { printEdition } from '../server/newsroom/edition.js';
import { hourStart } from '../server/util.js';
import { sandbox, quiet } from './helpers.js';

test('steering: lead with, leave out, one-off notes', () => {
  const stories = [{ id: 'a', weight: 5 }, { id: 'b', weight: 3 }, { id: 'c', weight: 1 }];
  const out = applySteer(stories, { boost: ['c'], bury: ['a'], notes: [] });
  assert.deepEqual(out.map((s) => s.id), ['c', 'b']);
  setLang('en');
  assert.match(steerLine({ notes: 'rule' }, { notes: ['shorter'] }).notes, /rule\nFor this edition only: shorter/);
});

test('the next edition: preview, steering, and steering spent once printed', async () => {
  setLang('en');
  const { store, config, cleanup } = sandbox();
  try {
    const now = Date.now();
    store.insertEvents(demoEvents(3, now));
    const p = preview(store, config, { now });
    assert.equal(p.editionId, nextEditionId(now));
    assert.ok(p.total > 0 && p.stories.length > 1);
    assert.match(previewText(p), /NEXT EDITION/);
    const last = p.stories.at(-1).id;
    const first = p.stories[0].id;
    steer(store, config, { op: 'boost', story: last }, now);
    steer(store, config, { op: 'bury', story: first }, now);
    steer(store, config, { op: 'note', text: 'shorter headlines' }, now);
    assert.throws(() => steer(store, config, { op: 'boost', story: 'nope' }, now));
    const p2 = preview(store, config, { now });
    assert.equal(p2.stories[0].id, last);
    assert.ok(!p2.stories.some((s) => s.id === first));
    assert.equal(p2.buried[0].id, first);

    const ed = await printEdition({ store, config, start: hourStart(now), final: false, force: true, log: quiet });
    assert.equal(ed.articles[0].id, last);
    assert.ok(!ed.articles.some((a) => a.id === first));
    assert.deepEqual(ed.steered.notes, ['shorter headlines']);
    assert.equal(getSteer(store, ed.id).boost.length, 1, 'a preview print keeps the steering');
    await printEdition({ store, config, start: hourStart(now), final: true, force: true, log: quiet });
    assert.equal(getSteer(store, ed.id).boost.length, 0, 'the final print spends it');
  } finally {
    cleanup();
  }
});
