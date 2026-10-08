import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { sizeOf, expandPrompt, wordCount } from '../server/newsroom/prompts.js';

const story = (n, weight = 1) => ({ events: Array.from({ length: n }, () => ({})), weight });

test('length: "long" promotes stories and the top of the page is never a brief', () => {
  setLang('en');
  assert.equal(sizeOf(story(5), 0, { length: 'standard' }).id, 'article');
  assert.equal(sizeOf(story(5), 0, { length: 'long' }).id, 'lead');
  assert.equal(sizeOf(story(2), 0, { length: 'long' }).id, 'brief');
  assert.equal(sizeOf(story(9), 2, { length: 'long' }).id, 'article');
  assert.equal(sizeOf(story(9), 2, { length: 'standard' }).id, 'brief');
  assert.equal(sizeOf(story(9), 0, { length: 'short' }).id, 'article');
  const lead = sizeOf(story(20), 0, { length: 'long' });
  assert.deepEqual([lead.min, lead.max, lead.paras], [225, 330, '4']);
});

test('length: a short draft goes back with its word count and the minimum', () => {
  setLang('it');
  const size = sizeOf(story(20), 0, { length: 'long' });
  const draft = { kicker: 'K', headline: 'H', dek: 'D', body: ['uno due tre', 'quattro'] };
  assert.equal(wordCount(draft), 4);
  const msgs = expandPrompt([{ role: 'user', content: 'x' }], draft, size);
  assert.equal(msgs.at(-2).role, 'assistant');
  assert.match(msgs.at(-1).content, /bozza è di 4 parole/);
  assert.match(msgs.at(-1).content, /almeno 225 parole/);
});

test('length: a short draft from the model is expanded once during printing', async () => {
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
      if (/Write the article/.test(last)) content = JSON.stringify({ kicker: 'K', headline: 'Short one', dek: 'D', body: ['Too few words here.'] });
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
    assert.ok(expands >= written.length, `expanded ${expands} of ${written.length}`);
    for (const a of written) { assert.equal(a.headline, 'Longer one'); assert.equal(a.expanded, true); }
  } finally {
    cleanup();
    server.close();
  }
});
