/**
 * The newsroom with a model: a fake OpenAI-compatible server answers each kind of prompt the way
 * a small local model would, so the paths that only run with a writer are exercised too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setLang } from '../server/i18n.js';
import { printEdition } from '../server/newsroom/edition.js';
import { enrichEdition } from '../server/newsroom/extras.js';
import { interviewRound, answerCall, openCalls } from '../server/newsroom/calls.js';
import { addTip } from '../server/newsroom/tips.js';
import { createFeature, briefFeature, getFeature, approveOutline, blockAction, reviewFeature, editFeature } from '../server/newsroom/features.js';
import { paragraphAction, headlineOptions } from '../server/newsroom/bench.js';
import { episodes } from '../server/newsroom/serial.js';
import { hourStart } from '../server/util.js';
import { sandbox, quiet, BROKEN } from './helpers.js';

const HOUR = 3600e3;
const MIN = 60e3;

function answer(messages) {
  const sys = messages[0]?.content || '';
  const user = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  const last = messages.at(-1)?.content || '';
  if (/SERIES:|SERIE:/.test(sys)) {
    return `SERIES: The Case of the Idle Cursor\nTITLE: Six o'clock game\nTEXT:\nThe inspector looked at the screen. Thirty visits to chess.com.\n\n"Who is bob?" he asked the empty room.\n\nSUMMARY: Inspector Vale chases a chess player called bob.\nA: Challenge bob at midnight\nB: Close the laptop and sleep`;
  }
  if (/"questions"/.test(sys)) return JSON.stringify({ questions: ['Chief, why chess tonight?', 'Did you win?', 'Who is bob?'] });
  if (/"question"/.test(sys)) return JSON.stringify({ question: 'Chief, how did the game against bob end?' });
  if (/"sections": \[\{"heading"/.test(sys) && /"point"/.test(sys)) return JSON.stringify({ headline: 'The knight shift', angle: 'An evening of chess', sections: [{ heading: 'The board', point: 'The first game' }, { heading: 'The rival', point: 'bob' }, { heading: 'The end', point: 'Bed' }] });
  if (/Now write ONLY section|Ora scrivi SOLO la sezione/.test(last)) return 'The evening opens on a board, thirty visits to chess.com between one move and the next, and a name that keeps coming back.\n\nIt is bob, always bob: the opponent of every game, the rival the archive cannot explain but records with patience.';
  if (/Fix these problems|Correggi questi difetti/.test(last)) return 'A cleaner version of the section, with the facts unchanged and the tics gone from every sentence.';
  if (/"alternatives"/.test(sys)) return JSON.stringify({ kicker: 'Chess', headline: 'The knight shift.', dek: 'An evening against bob.', alternatives: ['Bob, again', 'Thirty moves'] });
  if (/"claims"/.test(sys)) return JSON.stringify({ claims: [{ text: 'I played 999 games', why: 'The archive has 30 visits' }], kicker: 'Chess', headlines: ['Mine', 'Yours', 'Ours'], dek: 'A dek.' });
  if (/"lines": \{/.test(sys)) return JSON.stringify({ lines: { 'site:chess.com': 'Runs the midfield like a grandmaster.' } });
  if (/"lines": \[/.test(sys)) return JSON.stringify({ lines: ['We hear the cat has taken up typing.'] });
  if (/"headlines"/.test(sys)) return JSON.stringify({ headlines: ['Bob wins again', 'Thirty visits, one rival', 'The board never sleeps'] });
  if (/>>>/.test(user)) return 'A meaner paragraph, still with the same facts and nothing invented.';
  if (/"summary"/.test(sys)) return JSON.stringify({ summary: 'An hour of chess.', cartoon: 'I only lose on weekdays', scene: 'desk' });
  if (/"comment"/.test(sys)) return JSON.stringify({ comment: 'Chess up.' });
  if (/"kicker"/.test(sys)) {
    const quote = /(?:answered|risposto): [«“](.+?)[»”]/.exec(user)?.[1];
    return JSON.stringify({ kicker: 'Chess', headline: 'An evening of chess', dek: 'Thirty visits.', body: ['The owner played chess for most of the hour, against the same opponent.', 'The games kept coming, one after the other, with a short break for the terminal.', quote ? `“${quote},” the owner said.` : 'Nobody commented.'] });
  }
  return '{}';
}

function mockServer() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'mock-writer' }] }));
      const j = JSON.parse(body || '{}');
      calls.push(j.messages);
      res.end(JSON.stringify({ choices: [{ message: { content: answer(j.messages) }, finish_reason: 'stop' }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, port: server.address().port })));
}

function hourOfChess(h) {
  const ev = [];
  for (let i = 0; i < 30; i++) ev.push({ id: `c${h}-${i}`, source: 'safari', kind: 'visit', ts: h + (i + 1) * MIN, title: i % 3 ? `alice vs. bob | Analysis ${i}` : 'Play Chess Online', detail: null, url: 'https://www.chess.com/game', meta: { host: 'chess.com' } });
  for (let i = 0; i < 6; i++) ev.push({ id: `t${h}-${i}`, source: 'terminal', kind: 'command', ts: h + (40 + i) * MIN, title: 'npm test', detail: null, url: null, meta: { family: 'npm', timed: true } });
  return ev;
}

const wait = async (cond, ms = 5000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

test('with a writer: interview question, quote in the piece, extras after the press, long piece, bench', async () => {
  setLang('en');
  const { server, calls, port } = await mockServer();
  const { config, store, cleanup } = sandbox();
  config.llm.baseUrl = `http://127.0.0.1:${port}/v1`;
  config.llm.timeoutMs = 5000;
  try {
    const h = hourStart(Date.now()) - 3 * HOUR;
    store.insertEvents(hourOfChess(h));
    const call = await interviewRound(store, config, { now: h + 30 * MIN, log: quiet });
    assert.equal(call.question, 'Chief, how did the game against bob end?');
    answerCall(store, config, call.id, { text: 'Bob is a machine' }, h + 33 * MIN);
    addTip(store, { text: 'The cat walked on the keyboard', ts: h + 10 * MIN });
    const ed = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
    const a = ed.articles.find((x) => x.id === call.storyId);
    assert.equal(a.writer, 'mock-writer');
    assert.ok(a.body.some((p) => p.includes('Bob is a machine')));
    assert.equal(a.body.filter((p) => p.includes('Bob is a machine')).length, 1, 'the quote was added twice');
    assert.ok(calls.some((m) => /STATEMENT BY THE OWNER/.test(m.map((x) => x.content).join('\n'))), 'the statement never reached the writer');
    assert.ok(!openCalls(store, h + 2 * HOUR).some((c) => c.id === call.id));

    // after the press: report cards, gossip column, the serial's first episode and its fork
    const rich = await enrichEdition(store, config, ed.id, { log: quiet });
    assert.equal(rich.sport.by, 'mock-writer');
    assert.match(rich.sport.cards.find((c) => c.id === 'site:chess.com').line, /grandmaster/);
    assert.match(rich.rumours[0].line, /cat/);
    assert.equal(rich.serial.n, 1);
    assert.equal(rich.serial.serialTitle, 'The Case of the Idle Cursor');
    assert.equal(episodes(store).length, 1);
    const fork = store.items('call', { limit: 5 }).find((c) => c.type === 'serial');
    assert.equal(fork.options.length, 2);
    answerCall(store, config, fork.id, { option: 'a' });
    // reprint + enrich again: the same episode, no second one
    await enrichEdition(store, config, ed.id, { log: quiet });
    assert.equal(episodes(store).length, 1);

    // the bench with a writer
    const p = await paragraphAction(store, config, ed.id, a.id, { index: 0, op: 'rewrite', instruction: 'meaner' });
    assert.match(p.articles.find((x) => x.id === a.id).body[0], /meaner paragraph/);
    assert.deepEqual((await headlineOptions(store, config, ed.id, a.id)).options.length, 3);

    // a long piece: outline approved by the Editor, sections written, one rewritten, the headline
    let f = await createFeature(store, config, { editionId: ed.id, articleId: a.id }, quiet);
    assert.deepEqual(f.questions.map((x) => x.q).slice(0, 1), ['Chief, why chess tonight?']);
    f = briefFeature(store, config, f.id, { answers: ['Because bob'], mode: 'together' }, quiet);
    await wait(() => getFeature(store, f.id).status === 'outline');
    f = getFeature(store, f.id);
    assert.equal(f.outline.length, 3);
    approveOutline(store, config, f.id, [...f.outline.slice(0, 2), { heading: 'My own section', point: 'The cat' }], quiet);
    await wait(() => getFeature(store, f.id).status === 'draft' && !getFeature(store, f.id).busy);
    f = getFeature(store, f.id);
    assert.equal(f.blocks.length, 3);
    assert.equal(f.headline, 'The knight shift');
    assert.deepEqual(f.alternatives, ['Bob, again', 'Thirty moves']);
    assert.ok(calls.some((m) => /Because bob/.test(m.map((x) => x.content).join('\n'))), 'the answer never reached the writer');
    blockAction(store, config, f.id, 1, { op: 'edit', paragraphs: ['I wrote this start myself.'] }, quiet);
    blockAction(store, config, f.id, 1, { op: 'continue' }, quiet);
    await wait(() => !getFeature(store, f.id).busy);
    assert.equal(getFeature(store, f.id).blocks[1].paragraphs[0], 'I wrote this start myself.');
    assert.ok(getFeature(store, f.id).blocks[1].paragraphs.length > 1);
    assert.doesNotMatch(getFeature(store, f.id).blocks.flatMap((b) => b.paragraphs).join(' '), BROKEN);

    // the Editor's own piece, read by the desk
    let y = await createFeature(store, config, { topic: 'chess.com' }, quiet);
    y = briefFeature(store, config, y.id, { mode: 'yours' }, quiet);
    editFeature(store, y.id, { text: 'I played 999 games tonight.' });
    reviewFeature(store, config, y.id, quiet);
    await wait(() => getFeature(store, y.id).review?.status === 'done');
    const rv = getFeature(store, y.id).review;
    assert.equal(rv.claims.length, 1);
    assert.deepEqual(rv.headlines, ['Mine', 'Yours', 'Ours']);
  } finally {
    cleanup();
    server.close();
  }
});
