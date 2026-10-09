import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { tidy, badSentences, copyDesk, chainFor, deskChain } from '../server/newsroom/chain.js';

setLang('it');
const FACTS = 'Sito: youtube.com — 14 visite, 9 pagine diverse.\n- 21:05 «Video uno»\n- 21:40 «Video due»';

test('copy desk: the small things', () => {
  assert.equal(tidy('Il il giornale , dice  che...').text, 'Il giornale, dice che…');
  assert.equal(tidy('Alle 21:05 apre youtube.com: poi https://x.it').text, 'Alle 21:05 apre youtube.com: poi https://x.it');
  assert.equal(tidy('Una frase pulita.').changed, false);
});

test('copy desk: sentences with figures the facts lack are fixed, or cut', async () => {
  const body = ['Quattordici visite? No: 14 visite su youtube.com, dalle 21:05. Poi 37 video in fila.', 'Alle 22:15 tutto tace.'];
  const bad = badSentences(body, FACTS);
  assert.deepEqual(bad.map((b) => b.figures), [['37'], ['22:15']]);
  // without a model: the first goes (the paragraph keeps the rest), the second stays (it is all there is)
  const r = await copyDesk({ headline: 'H', dek: '', body }, FACTS);
  assert.equal(r.text.body[0], 'Quattordici visite? No: 14 visite su youtube.com, dalle 21:05.');
  assert.deepEqual(r.fixes.map((f) => f.kind), ['cut', 'left']);
  // with a model that proposes a fix: kept only if its figures are in the facts
  const chat = async () => JSON.stringify({ fixes: [{ from: 'Poi 37 video in fila.', to: 'Poi 9 pagine diverse, in fila.' }, { from: 'Alle 22:15 tutto tace.', to: 'Alle 23:00 tutto tace.' }] });
  const m = await copyDesk({ headline: 'H', dek: '', body }, FACTS, { llm: {}, config: {}, chat });
  assert.match(m.text.body[0], /Poi 9 pagine diverse, in fila\.$/);
  assert.deepEqual(m.fixes.map((f) => f.kind), ['figure', 'left']);
});

test('the chain: which articles, and a piece sent back for an invented figure even if the editor liked it', async () => {
  assert.equal(chainFor({ desk: { chain: 'top' } }, 2), true);
  assert.equal(chainFor({ desk: { chain: 'top' } }, 3), false);
  assert.equal(chainFor({ desk: { chain: 'lead' } }, 1), false);
  assert.equal(chainFor({ desk: { chain: 'off' } }, 0), false);
  assert.equal(chainFor({}, 0), true);
  const draft = { kicker: 'Esteri', headline: 'YouTube a oltranza', dek: '', body: ['Ventuno video, anzi 21, tra le 21:05 e le 21:40.', 'Poi basta.'] };
  const prompts = [];
  const chat = async (llm, config, msgs) => {
    prompts.push(msgs);
    const sys = msgs[0].content;
    if (/"verdict"/.test(sys)) return JSON.stringify({ verdict: 'ok', notes: [], praise: 'Asciutto.' });
    if (/"fixes"/.test(sys)) return JSON.stringify({ fixes: [] });
    return JSON.stringify({ kicker: 'Esteri', headline: 'Quattordici visite a YouTube', dek: '', body: ['Quattordici visite, 14, tra le 21:05 e le 21:40, su nove pagine.', 'Poi basta.'] });
  };
  const fromLLM = (j) => ({ ...j, writer: 'm' });
  const out = await deskChain(draft, { facts: FACTS, msgs: [{ role: 'system', content: 'x' }], size: { min: 5 }, ctx: { llm: { model: 'm' }, config: {} }, chat, maxTokens: 100, fromLLM, story: { id: 's' }, writer: { name: 'Elena Rossetti' } });
  assert.equal(out.chain[1].verdict, 'rework');
  assert.match(out.chain[1].notes[0], /21/);
  assert.equal(out.headline, 'Quattordici visite a YouTube');
  assert.equal(out.draft.headline, 'YouTube a oltranza');
  assert.ok(/LA correzione segnala|La correzione segnala/.test(prompts[0][1].content));
});
