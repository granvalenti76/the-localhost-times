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
import { interviewRound, answerCall, openCalls, followLead } from '../server/newsroom/calls.js';
import { addTip } from '../server/newsroom/tips.js';
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
  if (/"verdict"/.test(sys)) return JSON.stringify({ verdict: 'rework', notes: ['Open on bob, the rival, not on the hour.'], praise: 'The second paragraph moves.' });
  if (/"fixes"/.test(sys)) return JSON.stringify({ fixes: [] });
  if (/sends the piece back|ti rimanda indietro il pezzo/.test(last)) return JSON.stringify({ kicker: 'Chess', headline: 'Bob, again', dek: 'Thirty visits, one rival.', body: ['Bob was the opponent of the hour, game after game, on chess.com.', 'The owner kept playing, with a short break for the terminal and the tests.', 'Nobody commented.'] });
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

test('with a writer: interview question, quote in the piece, extras after the press, bench', async () => {
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
    // the desk: on the front page so read by the managing editor, sent back, rewritten, read by the copy desk
    assert.deepEqual(a.chain.map((x) => x.who), ['reporter', 'triage', 'editor', 'reporter', 'editor', 'copy']);
    assert.equal(a.chain[4].reread, true);
    assert.equal(a.chain[1].why, 'front');
    assert.equal(a.chain[2].verdict, 'rework');
    assert.equal(a.chain[3].rewrote, true);
    assert.equal(a.headline, 'Bob, again');
    assert.equal(a.draft.headline, 'An evening of chess');

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
  } finally {
    cleanup();
    server.close();
  }
});

test('with a writer: the Editor\'s lead reaches the writer, widens the piece, and a late one has it rewritten', async () => {
  setLang('en');
  const { server, calls, port } = await mockServer();
  const { config, store, cleanup } = sandbox();
  config.llm.baseUrl = `http://127.0.0.1:${port}/v1`;
  config.llm.timeoutMs = 5000;
  try {
    const h = hourStart(Date.now()) - 3 * HOUR;
    store.insertEvents(hourOfChess(h));
    const call = await interviewRound(store, config, { now: h + 30 * MIN, log: quiet });
    answerCall(store, config, call.id, { text: 'Bob is a machine', lead: 'he always opens with the same gambit' }, h + 33 * MIN);
    const ed = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
    const a = ed.articles.find((x) => x.id === call.storyId);
    const prompt = calls.map((m) => m.map((x) => x.content).join('\n')).find((t) => /LEAD FROM THE OWNER/.test(t));
    assert.ok(prompt, 'the lead never reached the writer');
    assert.match(prompt, /same gambit/);
    assert.equal(a.leads[0].text, 'he always opens with the same gambit');
    assert.ok(a.body.some((p) => p.includes('Bob is a machine')));

    // a lead after the press, on another printed article: rewritten by the writer, quotes kept
    const other = ed.articles.find((x) => x.id !== call.storyId) || a;
    const c2 = store.saveItem({ kind: 'call', type: 'interview', status: 'open', ts: h + 41 * MIN, ref: other.id, storyId: other.id, editionId: ed.id, printedIn: ed.id, question: 'Q?', deadline: h + HOUR + 30e3 });
    const r = answerCall(store, config, c2.id, { text: 'Green at last', lead: 'count the red runs before it' }, h + HOUR + 5 * MIN);
    const n = calls.length;
    const done = await followLead(store, config, r.follow, c2.id, quiet);
    assert.equal(done.rewritten, true);
    assert.ok(calls.slice(n).some((m) => /follow the Editor's lead/.test(m.at(-1).content)), 'no rewrite asked');
    const b = store.getEdition(ed.id).articles.find((x) => x.id === other.id);
    assert.ok(b.body.some((p) => p.includes('Green at last')), 'the rewrite lost the quote');
    assert.equal(b.leads.at(-1).text, 'count the red runs before it');
    assert.doesNotMatch(b.body.join(' '), BROKEN);
  } finally { cleanup(); server.close(); }
});
