import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setLang } from '../server/i18n.js';
import { demoHistory, demoEvents } from '../server/demo.js';
import { detect, isSensitive, terms } from '../server/newsroom/spotlight/detectors.js';
import { spotlightRound, leadAction, board, scoreOf } from '../server/newsroom/spotlight/desk.js';
import { printEdition } from '../server/newsroom/edition.js';
import { menubarText } from '../server/menubar.js';
import { hourStart } from '../server/util.js';
import { sandbox, quiet, BROKEN } from './helpers.js';

const HOUR = 3600e3;

for (const l of ['en', 'it']) {
  test(`[${l}] spotlight: the detectors find the five demo stories`, () => {
    setLang(l);
    const now = Date.now();
    const found = detect([...demoHistory(now), ...demoEvents(9, now)].sort((a, b) => a.ts - b.ts), now);
    const keys = found.map((c) => c.key);
    assert.ok(keys.includes(l === 'en' ? 'cross:lisbon' : 'cross:lisbona'), keys.join(' '));
    for (const k of ['obsession:site:chess.com', 'intent:kobo', 'vanish:project:turbocode', 'habit:start-later']) assert.ok(keys.includes(k), `${k} missing: ${keys.join(' ')}`);
    for (const c of found) {
      assert.ok(!c.error, c.error);
      assert.ok(c.evidence.length > 0 && c.facts.length > 0, c.key);
      assert.doesNotMatch([c.subject, c.hypothesis, ...c.facts].join(' '), BROKEN, c.key);
    }
    const lisbon = found.find((c) => c.kind === 'cross' && /lisbo/i.test(c.subject));
    assert.equal(new Set(lisbon.evidence.map((x) => x.source)).size, 4);
    setLang('en');
  });
}

test('spotlight: delicate subjects never become leads', () => {
  setLang('en');
  assert.ok(isSensitive('cardiologist appointment, symptoms of anxiety'));
  assert.ok(isSensitive('Colloquio di lavoro lunedì'));
  assert.ok(!isSensitive('Flights Boston Lisbon'));
  const now = Date.now();
  const at = (h) => now - h * HOUR;
  const evs = [
    { id: 's1', source: 'safari', kind: 'search', ts: at(30), title: 'cardiologist near me symptoms', meta: { host: 'google.com' } },
    { id: 's2', source: 'safari', kind: 'search', ts: at(20), title: 'cardiologist reviews', meta: { host: 'google.com' } },
    { id: 'm1', source: 'mail', kind: 'received', ts: at(10), title: 'Your cardiologist appointment', meta: { from: 'clinic@x.example' } },
    { id: 'n1', source: 'notes', kind: 'created', ts: at(5), title: 'Cardiologist questions', meta: {} },
  ];
  assert.equal(detect(evs, now).filter((c) => /cardiolog/i.test(c.subject)).length, 0);
  // the words of a title, without the site's own name
  assert.deepEqual([...terms('Lisbon travel guide – Lonely Planet', 'lonelyplanet.com lonely planet').keys()], ['lisbon', 'travel']);
});

test('spotlight: a lead is followed, judged, waits for the owner\'s reply, and goes on the front page', async () => {
  setLang('en');
  const { store, config, cleanup } = sandbox();
  try {
    config.demo = false; // the real timings: a lead must be followed for a while
    const now = Date.now();
    store.insertEvents([...demoHistory(now), ...demoEvents(9, now)]);
    // first look: leads opened, nobody judged yet
    const r1 = await spotlightRound(store, config, { log: quiet, now });
    assert.ok(r1.changes.opened >= 5);
    assert.equal(r1.reviewed, null);
    const lead = store.getLead('cross:lisbon');
    assert.equal(lead.status, 'open');
    assert.equal(lead.score, scoreOf(lead));
    // four hours later: the strongest lead is weighed (no model: the typesetting's rule) and the owner is asked
    const later = now + 4 * HOUR;
    const r2 = await spotlightRound(store, config, { log: quiet, now: later });
    assert.ok(r2.reviewed, 'nothing reviewed');
    const asked = store.leads({ status: ['reply'] });
    assert.equal(asked.length, 1);
    assert.ok(asked[0].reply.deadline > later);
    // the board shows it, the menu bar flags it
    const b = board(store, config);
    assert.equal(b.counts.reply, 1);
    assert.match(menubarText({ edition: null, next: null, base: 'http://x', spotlight: { waiting: asked, open: 3 } }), /^◉ /);
    // the owner replies; the piece is written and waits for the next front page
    leadAction(store, asked[0].id, { action: 'reply', text: 'Guilty as charged.' });
    const r3 = await spotlightRound(store, config, { log: quiet, now: later + 60e3, light: true });
    const scoop = r3.published;
    assert.ok(scoop?.id, 'not published');
    assert.equal(scoop.reply.text, 'Guilty as charged.');
    assert.ok(scoop.sections.length >= 5 && scoop.takeaways.length && scoop.questions.length);
    assert.ok(scoop.sections.flatMap((x) => x.paragraphs).join(' ').includes('Guilty as charged.'));
    assert.doesNotMatch(JSON.stringify(scoop.sections), BROKEN);
    assert.equal(store.getLead(asked[0].id).status, 'published');
    const ed = await printEdition({ store, config, start: hourStart(now) - HOUR, final: true, force: true, log: quiet });
    assert.equal(ed.spotlight?.id, scoop.id);
    assert.equal(store.getScoop(scoop.id).editionId, ed.id);
    // a reprint keeps it
    const again = await printEdition({ store, config, start: hourStart(now) - HOUR, final: true, force: true, log: quiet });
    assert.equal(again.spotlight?.id, scoop.id);
  } finally {
    cleanup();
  }
});

test('spotlight: the editor-in-chief can stop or push a lead; the model can drop a delicate one', async () => {
  setLang('en');
  let judged = 0;
  const server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'mock' }] }));
      judged++;
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ story: true, confidence: 90, sensitive: true, angle: 'x', headline: 'y', missing: '' }) } }] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { store, config, cleanup } = sandbox();
  try {
    config.demo = false;
    config.llm.baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
    const now = Date.now();
    store.insertEvents([...demoHistory(now), ...demoEvents(9, now)]);
    await spotlightRound(store, config, { log: quiet, now });
    // stop one
    assert.equal(leadAction(store, 'intent:kobo', { action: 'kill' }).status, 'killed');
    assert.throws(() => leadAction(store, 'intent:kobo', { action: 'reply', text: 'x' }));
    // push another: it's weighed on the next round, and the model finds it too personal
    leadAction(store, 'vanish:project:turbocode', { action: 'push' });
    const lead = store.getLead('vanish:project:turbocode');
    await spotlightRound(store, config, { log: quiet, now: now + 60e3 });
    assert.ok(judged >= 1);
    const after = store.getLead(lead.id);
    assert.equal(after.status, 'killed');
    assert.match(after.log.at(-1).text, /too personal/);
    // a killed lead is not reopened by the detectors
    await spotlightRound(store, config, { log: quiet, now: now + 2 * 60e3 });
    assert.equal(store.getLead('intent:kobo').status, 'killed');
  } finally {
    cleanup();
    server.close();
  }
});
