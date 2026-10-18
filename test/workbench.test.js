/**
 * The next edition in the works: drafts during the hour, the Editor's hand on them, and the press
 * that prints the approved ones as they are and brings the others up to date.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setLang } from '../server/i18n.js';
import { printEdition } from '../server/newsroom/edition.js';
import { draftRound, getWorkbench, approvePiece, editPiece, sendBack, killPiece, workbenchView, dueRounds } from '../server/newsroom/workbench.js';
import { hourStart } from '../server/util.js';
import { sandbox, quiet } from './helpers.js';

const MIN = 60e3;

function mock() {
  let n = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'mock' }] }));
      const msgs = JSON.parse(body || '{}').messages || [];
      const sys = msgs[0]?.content || '';
      const last = msgs.at(-1)?.content || '';
      let out = '{}';
      if (/"verdict"/.test(sys)) out = JSON.stringify({ verdict: 'ok', notes: [], praise: 'Dry.' });
      else if (/"fixes"/.test(sys)) out = JSON.stringify({ fixes: [] });
      else if (/"kicker"/.test(sys)) {
        n++;
        const update = /New facts have come in/.test(last);
        const note = /Shorter, please/.test(last);
        out = JSON.stringify({ kicker: 'Chess', headline: update ? 'Chess, later' : note ? 'Chess, short' : `Chess, draft ${n}`, dek: 'Games.', body: ['The owner played chess against the same opponent, one game after another.', 'Then the terminal.'] });
      }
      res.end(JSON.stringify({ choices: [{ message: { content: out }, finish_reason: 'stop' }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const chess = (h, from, to) => Array.from({ length: to - from }, (_, k) => {
  const i = from + k;
  return { id: `c${i}`, source: 'safari', kind: 'visit', ts: h + (i % 50 + 1) * MIN, title: `alice vs. bob | Analysis ${i}`, detail: null, url: 'https://www.chess.com/game', meta: { host: 'chess.com' } };
});

test('drafts during the hour, the Editor\'s hand, and the press', async (t) => {
  setLang('en');
  // the clock stops at :25 of the hour, whatever time the tests run
  const h0 = hourStart(Date.now());
  t.mock.timers.enable({ apis: ['Date'], now: h0 + 25 * MIN });
  const { server, port } = await mock();
  const { config, store, cleanup } = sandbox();
  config.llm.baseUrl = `http://127.0.0.1:${port}/v1`;
  config.llm.timeoutMs = 5000;
  try {
    const h = h0;
    const at = h + 25 * MIN;
    store.insertEvents(chess(h, 0, 20));
    // the :20 round is due at :25, the :40 is not
    assert.deepEqual(dueRounds(config, getWorkbench(store, workbenchView(store, config, { now: at }).editionId), at), [20]);
    const w = await draftRound(store, config, { now: at, log: quiet });
    const p = Object.values(w.pieces).find((x) => x.id.endsWith('site:chess.com'));
    assert.ok(p, 'no draft for the chess story');
    assert.equal(p.status, 'ready');
    assert.ok(p.chain.some((x) => x.who === 'editor'), 'the draft did not cross the desk');
    assert.equal(await draftRound(store, config, { now: at + MIN, log: quiet }), null, 'a round ran twice');

    // the Editor: a retouch, a note sent back, an approval
    editPiece(store, p.id, { headline: 'Chess by hand' });
    assert.equal(getWorkbench(store, w.editionId).pieces[p.id].chain.at(-1).kind, 'headline');
    const job = sendBack(store, config, p.id, 'Shorter, please');
    assert.equal(getWorkbench(store, w.editionId).pieces[p.id].status, 'writing');
    const back = await job();
    assert.equal(back.text.headline, 'Chess, short');
    assert.ok(back.chain.some((x) => x.who === 'chief' && x.kind === 'note'));
    // the Editor's note: the Editor reads the new version, the managing editor doesn't
    const afterNote = back.chain.slice(back.chain.findIndex((x) => x.who === 'chief' && x.kind === 'note'));
    assert.ok(!afterNote.some((x) => x.who === 'editor'), 'the managing editor read a rewrite the Editor asked for');
    assert.equal(afterNote.find((x) => x.who === 'triage')?.why, 'chief');
    assert.ok(afterNote.some((x) => x.who === 'copy'), 'the copy desk should still check the figures');
    approvePiece(store, p.id);

    // more chess comes in: at the press the approved draft goes out as it is
    store.insertEvents(chess(h, 20, 45));
    const ed = await printEdition({ store, config, start: h, final: false, force: true, log: quiet });
    const a = ed.articles.find((x) => x.id === p.id);
    assert.equal(a.headline, 'Chess, short');
    assert.equal(a.chain.at(-1).who, 'press');
    assert.equal(a.chain.at(-1).kind, 'approved');
    assert.equal(a.draft.headline.startsWith('Chess, draft'), true, 'the first draft of the hour was lost');

    // without the approval, the press brings the draft up to date with the new facts
    approvePiece(store, p.id, false);
    store.insertEvents(chess(h, 45, 60));
    const ed2 = await printEdition({ store, config, start: h, final: false, force: true, log: quiet });
    const b = ed2.articles.find((x) => x.id === p.id);
    assert.equal(b.headline, 'Chess, later');
    assert.ok(b.chain.some((x) => x.who === 'update'));

    // left out: the story leaves the edition
    killPiece(store, config, p.id);
    assert.equal(workbenchView(store, config).pieces.find((x) => x.id === p.id).status, 'killed');
    const ed3 = await printEdition({ store, config, start: h, final: false, force: true, log: quiet });
    assert.ok(!ed3.articles.some((x) => x.id === p.id));
  } finally {
    server.close();
    cleanup();
  }
});
