import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { sizeOf, widen, expandPrompt, wordCount, articlePrompt } from '../server/newsroom/prompts.js';

const story = (n, weight = 1) => ({ events: Array.from({ length: n }, () => ({})), weight });

test('length: "long" promotes stories and the top of the page is never a note', () => {
  setLang('en');
  assert.equal(sizeOf(story(5), 0, { length: 'standard' }).id, 'article');
  assert.equal(sizeOf(story(5), 0, { length: 'long' }).id, 'lead');
  assert.equal(sizeOf(story(2), 0, { length: 'long' }).id, 'brief');
  assert.equal(sizeOf(story(9), 2, { length: 'long' }).id, 'article');
  assert.equal(sizeOf(story(9), 2, { length: 'standard' }).id, 'brief');
  assert.equal(sizeOf(story(9), 0, { length: 'short' }).id, 'article');
  const lead = sizeOf(story(20), 0, { length: 'long' });
  assert.deepEqual([lead.min, lead.max, lead.paras], [315, 500, '3-5']);
  // the three formats of the style guide
  const sizes = (l) => [sizeOf(story(1), 1, { length: l }), sizeOf(story(13), 1, { length: l }), sizeOf(story(20), 0, { length: l })].map((s) => [s.id, s.min, s.max, s.paras]);
  assert.deepEqual(sizes('standard'), [['brief', 40, 90, '1'], ['article', 150, 300, '2-4'], ['lead', 250, 400, '3-5']]);
});

test('length: a lead from the Editor widens the piece, a note becomes a piece', () => {
  const note = widen(sizeOf(story(1), 1, { length: 'standard' }), 1);
  assert.deepEqual([note.id, note.paras], ['article', '2']);
  assert.equal(widen(sizeOf(story(13), 1, { length: 'standard' }), 2).paras, '4-6');
});

test('length: a short draft goes back with its word count and the minimum', () => {
  setLang('it');
  const size = sizeOf(story(20), 0, { length: 'long' });
  const draft = { kicker: 'K', headline: 'H', dek: 'D', body: ['uno due tre', 'quattro'] };
  assert.equal(wordCount(draft), 4);
  const msgs = expandPrompt([{ role: 'user', content: 'x' }], draft, size);
  assert.equal(msgs.at(-2).role, 'assistant');
  assert.match(msgs.at(-1).content, /bozza è di 4 parole/);
  assert.match(msgs.at(-1).content, /almeno 315 parole/);
});

test('length: a note is asked for a top, a piece for a range, never padded', () => {
  setLang('en');
  const kind = { kind: 'site' };
  const note = articlePrompt(kind, 'F', '18:00', sizeOf(story(1), 1, { length: 'standard' }), null).at(-1).content;
  assert.match(note, /NOTE — up to 90 words, 1 paragraph/);
  const piece = articlePrompt(kind, 'F', '18:00', sizeOf(story(13), 1, { length: 'standard' }), null).at(-1).content;
  assert.match(piece, /PIECE — 150-300 words, 2-4 paragraphs; fewer if the facts run out, never padded/);
});

test('length: a short piece from the model is expanded once during printing, a note never', async () => {
  const http = await import('node:http');
  const { demoEvents } = await import('../server/demo.js');
  const { printEdition } = await import('../server/newsroom/edition.js');
  const { hourStart } = await import('../server/util.js');
  const { sandbox, quiet } = await import('./helpers.js');
  setLang('en');
  let expands = 0;
  const server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'mock' }] }));
      const last = JSON.parse(b).messages.at(-1).content;
      let content;
      if (/Write the piece/.test(last)) content = JSON.stringify({ kicker: 'K', headline: 'Short one', dek: 'D', body: ['Too few words here.'] });
      else if (/This draft is \d+ words/.test(last)) { expands++; content = JSON.stringify({ kicker: 'K', headline: 'Longer one', dek: 'D', body: [Array(80).fill('word').join(' ')] }); }
      else content = '{}';
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { config, store, cleanup } = sandbox();
  try {
    config.llm.baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
    const now = Date.now();
    store.insertEvents(demoEvents(6, now));
    const ed = await printEdition({ store, config, start: hourStart(now) - 3600e3, final: true, force: true, log: quiet });
    const written = ed.articles.filter((a) => a.writer === 'mock');
    assert.ok(written.length > 0, 'no article by the model');
    const pieces = written.filter((a) => a.size !== 'brief');
    const notes = written.filter((a) => a.size === 'brief');
    assert.ok(pieces.length > 0 && notes.length > 0, `${pieces.length} pieces, ${notes.length} notes`);
    assert.ok(expands >= pieces.length, `expanded ${expands} of ${pieces.length}`);
    for (const a of pieces) { assert.equal(a.headline, 'Longer one'); assert.equal(a.expanded, true); }
    for (const a of notes) { assert.equal(a.headline, 'Short one'); assert.ok(!a.expanded); }
  } finally {
    cleanup();
    server.close();
  }
});
