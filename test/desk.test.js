import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { printEdition } from '../server/newsroom/edition.js';
import { interviewRound, answerCall, openCalls, closingRound, closingCall, matchesOf, templateQuestion } from '../server/newsroom/calls.js';
import { getSteer, nextEditionId } from '../server/newsroom/next.js';
import { addTip, matchTip, tipsFromNotes } from '../server/newsroom/tips.js';
import { checkRecords, peekRecords, metrics } from '../server/newsroom/sport.js';
import { oracleRound, bet, judge } from '../server/newsroom/oracle.js';
import { parseEpisode } from '../server/newsroom/serial.js';
import { lint } from '../server/newsroom/lint.js';
import { createFeature, briefFeature, getFeature, publishFeature, editFeature, reviewFeature, features } from '../server/newsroom/features.js';
import { paragraphAction, verdict, headlineOptions, getTaste } from '../server/newsroom/bench.js';
import { tastePrompt } from '../server/newsroom/writers.js';
import { getLine, saveLine } from '../server/newsroom/line.js';
import { flashRound } from '../server/newsroom/flash.js';
import { chatter } from '../server/newsroom/chatter.js';
import { menubarText } from '../server/menubar.js';
import { buildStories } from '../server/newsroom/cluster.js';
import { hourStart } from '../server/util.js';
import { sandbox, quiet, BROKEN } from './helpers.js';

const HOUR = 3600e3;
const MIN = 60e3;

/** An hour on chess.com and a few commands: enough for a lead story. */
function hourOfChess(h, n = 30) {
  const ev = [];
  for (let i = 0; i < n; i++) {
    ev.push({ id: `c${h}-${i}`, source: 'safari', kind: 'visit', ts: h + (i + 1) * 60e3, title: i % 3 ? `alice vs. bob${i % 2} | Analysis` : 'Play Chess Online', detail: null, url: 'https://www.chess.com/game', meta: { host: 'chess.com' } });
  }
  for (let i = 0; i < 6; i++) ev.push({ id: `t${h}-${i}`, source: 'terminal', kind: 'command', ts: h + (40 + i) * 60e3, title: i === 5 ? 'git commit -m "fix the press"' : 'npm test', detail: null, url: null, meta: { family: i === 5 ? 'git commit' : 'npm', timed: true } });
  for (let i = 0; i < 4; i++) ev.push({ id: `y${h}-${i}`, source: 'safari', kind: 'visit', ts: h + (20 + i) * 60e3, title: `A video about knights ${i}`, detail: null, url: 'https://youtube.com/watch', meta: { host: 'youtube.com' } });
  return ev;
}

const wait = async (cond, ms = 4000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

for (const l of ['en', 'it']) {
  test(`[${l}] interview: the reporter calls, the answer becomes a quote, a late one an update`, async () => {
    setLang(l);
    const { config, store, cleanup } = sandbox();
    try {
      const h = hourStart(Date.now()) - 3 * HOUR;
      store.insertEvents(hourOfChess(h));
      const call = await interviewRound(store, config, { now: h + 30 * MIN, log: quiet, useLLM: false });
      assert.ok(call, 'no call');
      assert.equal(call.type, 'interview');
      assert.match(call.question, l === 'it' ? /Direttore/ : /Chief/);
      assert.ok(openCalls(store, h + 31 * MIN).some((c) => c.id === call.id));
      // never twice on the same story within three hours
      assert.equal(await interviewRound(store, config, { now: h + 32 * MIN, log: quiet, useLLM: false, perHour: 5 }), null);
      answerCall(store, config, call.id, { text: 'Lost to bob, as usual' }, h + 35 * MIN);
      const ed = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
      const a = ed.articles.find((x) => x.id === call.storyId);
      assert.ok(a, 'story not in the paper');
      assert.ok(a.body.some((p) => p.includes('Lost to bob, as usual')), 'quote missing');
      assert.ok(a.quotes?.length);
      assert.doesNotMatch(a.body.join(' '), BROKEN);

      // a second call on another story, answered after the press: an update at the bottom
      const c2 = store.saveItem({ kind: 'call', type: 'interview', status: 'open', ts: h + 41 * MIN, ref: 'terminal:session:all', storyId: 'terminal:session:all', editionId: ed.id, question: 'Q?', deadline: h + HOUR + 30e3 });
      await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
      const r = answerCall(store, config, c2.id, { text: 'It works now' }, h + HOUR + 5 * MIN);
      assert.ok(r.update, 'no late update');
      const fresh = store.getEdition(ed.id).articles.find((x) => x.id === 'terminal:session:all');
      assert.match(fresh.body.at(-1), /It works now/);
      assert.ok(chatter(store).length > 0, 'the newsroom said nothing');
    } finally { cleanup(); setLang('en'); }
  });

  test(`[${l}] closing at :55: the Editor picks the lead, the steering follows`, () => {
    setLang(l);
    const { config, store, cleanup } = sandbox();
    try {
      const now = Date.now();
      const h = hourStart(now);
      store.insertEvents(hourOfChess(h).map((e) => ({ ...e, ts: Math.min(e.ts, now - 1000) })));
      const c = closingRound(store, config, { now, log: quiet });
      if (!c) return; // too few stories in this hour so far: nothing to choose
      const opt = c.options.find((o) => o.action?.op === 'boost') || c.options[0];
      answerCall(store, config, c.id, { option: opt.id }, now);
      if (opt.action?.op === 'boost') assert.deepEqual(getSteer(store, nextEditionId(now)).boost, [opt.action.story]);
      assert.equal(closingRound(store, config, { now, log: quiet }), null, 'asked twice');
    } finally { cleanup(); setLang('en'); }
  });
}

test('closing: the three kinds of question', () => {
  const p = { willMerge: false, stories: [{ id: 'a', topic: 'chess.com', inPaper: true }, { id: 'b', topic: 'YouTube', inPaper: true }, { id: 'c', topic: 'Mail', inPaper: true }] };
  assert.equal(closingCall(p, 'lead').options.filter((o) => o.action?.op === 'boost').length, 3);
  assert.equal(closingCall(p, 'cut').options[0].action.story, 'c');
  assert.equal(closingCall(p, 'tone').options[0].action.op, 'note');
  assert.equal(closingCall({ ...p, willMerge: true }, 'lead'), null);
});

test('game titles: the owner is the name that keeps coming back', () => {
  const g = matchesOf(['alice vs. bob | Analysis', 'carol vs. alice | Live', 'alice vs. dave']);
  assert.equal(g[0].me, 'alice');
  assert.deepEqual(g.map((x) => x.opponent), ['bob', 'carol', 'dave']);
  const s = buildStories(hourOfChess(hourStart(Date.now()) - HOUR)).find((x) => x.kind === 'site' && x.topic === 'chess.com');
  assert.match(templateQuestion(s), /bob/);
});

test('tips: from Notes, matched to their story, the rest to the gossip column', async () => {
  const { config, store, cleanup } = sandbox();
  try {
    const h = hourStart(Date.now()) - 2 * HOUR;
    store.insertEvents(hourOfChess(h));
    const notes = [{ id: 'n1', source: 'notes', kind: 'edited', ts: h + 5 * MIN, title: 'chess', detail: 'Redazione', url: null, meta: { noteId: 9, folder: 'Redazione', snippet: 'I lost five chess games in a row on chess.com' } }];
    store.insertEvents(notes);
    assert.equal(tipsFromNotes(store, config, notes), 1);
    addTip(store, { text: 'The cat walked on the keyboard', ts: h + 6 * MIN });
    const stories = buildStories(hourOfChess(h));
    assert.equal(matchTip({ text: 'five games on chess.com' }, stories)?.topic, 'chess.com');
    const ed = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
    assert.ok(ed.articles.some((a) => a.tipped), 'the tip went nowhere');
    assert.equal(ed.rumours?.length, 1);
    assert.match(ed.rumours[0].line, /cat/);
    // the tip note itself is not news
    assert.ok(!ed.articles.some((a) => a.source === 'notes'));
    // a reprint uses the same tips again
    const again = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
    assert.equal(again.rumours?.length, 1);
  } finally { cleanup(); }
});

test('records: only with enough history; reprints don\'t count twice; the flash sees them', async () => {
  const { config, store, cleanup } = sandbox();
  try {
    const list = [{ key: 'site:chess.com', kind: 'site', value: 20, label: 'Visits', story: () => true }];
    assert.deepEqual(checkRecords(store, list, { editionId: 'e1', at: 1 }), []); // first time: nothing to beat
    store.setSetting('records', { editions: 30, lastEd: 'x', keys: { 'site:chess.com': { obs: 5, label: 'Visits', best: { value: 20, at: 1, editionId: 'old' } } } });
    const r = checkRecords(store, [{ ...list[0], value: 31 }], { editionId: 'e2', at: 2 });
    assert.equal(r.length, 1);
    assert.equal(r[0].prev, 20);
    // the same edition reprinted: still a record against the same baseline
    assert.equal(checkRecords(store, [{ ...list[0], value: 31 }], { editionId: 'e2', at: 2 })[0].prev, 20);
    assert.equal(store.getSetting('records').keys['site:chess.com'].obs, 6);
    assert.equal(peekRecords(store, [{ ...list[0], value: 40 }], 'e3').length, 1);

    // mid-hour: the flash breaks the news
    const now = Date.now();
    const h = hourStart(now);
    const evs = hourOfChess(h, 45).map((e) => ({ ...e, ts: Math.min(e.ts, now - 500) }));
    store.insertEvents(evs);
    const f = flashRound(store, config, { now, log: quiet });
    if (evs.filter((e) => e.meta.host === 'chess.com').length > 31) {
      assert.ok(f, 'no flash');
      assert.match(f.text, /20|31/);
      assert.equal(flashRound(store, config, { now, log: quiet }), null, 'two flashes in one hour');
    }
    const m = metrics({ news: evs, stats: { total: evs.length, commands: 6, searches: 0 }, time: null });
    assert.ok(m.some((x) => x.key === 'site:chess.com'));
  } finally { cleanup(); }
});

test('the Oracle bets, the next edition checks, the Editor bets too', () => {
  const { store, cleanup } = sandbox();
  try {
    const h = hourStart(Date.now()) - 4 * HOUR;
    const ev1 = hourOfChess(h);
    const first = oracleRound(store, { editionId: 'e1', events: ev1, end: h + HOUR, recentTotals: [30, 40, 20], eventsFor: () => [] });
    assert.ok(first.predictions.length >= 1);
    assert.deepEqual(oracleRound(store, { editionId: 'e1', events: ev1, end: h + HOUR, recentTotals: [], eventsFor: () => [] }), first, 'a reprint changed its mind');
    const p = first.predictions[0];
    bet(store, p.id, true, h + HOUR + 60e3);
    const ev2 = hourOfChess(h + HOUR);
    const second = oracleRound(store, { editionId: 'e2', events: ev2, end: h + 2 * HOUR, recentTotals: [], eventsFor: () => ev2 });
    assert.equal(second.results.length, first.predictions.length);
    assert.equal(second.score.total, first.predictions.length);
    assert.equal(second.score.me.total, 1);
    assert.equal(judge({ type: 'visit', site: 'chess.com' }, ev2), true);
    assert.equal(judge({ type: 'commit' }, []), false);
  } finally { cleanup(); }
});

test('the serial: the writer\'s labelled answer is parsed', () => {
  const ep = parseEpisode(`SERIE: Il caso del cursore
TITOLO: La partita delle sei

TESTO:
Il commissario guardò lo schermo. Ottantanove visite.

«Chi è REKOUS?» chiese.

RIASSUNTO: Il commissario Valenti indaga su un avversario misterioso.
A: Sfidare REKOUS a mezzanotte
B: Chiudere il portatile e dormire`);
  assert.equal(ep.title, 'La partita delle sei');
  assert.equal(ep.series, 'Il caso del cursore');
  assert.equal(ep.paragraphs.length, 2);
  assert.deepEqual(ep.choices, ['Sfidare REKOUS a mezzanotte', 'Chiudere il portatile e dormire']);
  assert.match(ep.summary, /Valenti/);
  assert.equal(parseEpisode('nonsense'), null);
});

test('lint: the tics of small models are counted', () => {
  setLang('it');
  try {
    const bad = lint(['Alle 18:22 il proprietario apre YouTube. Alle 18:23 il proprietario cerca. Alle 18:25 il proprietario chiude. Forse cercava la musica, forse il nome. Nessun like, nessun commento.']);
    assert.ok(bad.score < 70, `score ${bad.score}`);
    assert.ok(bad.issues.some((i) => i.id === 'time-starts'));
    assert.ok(bad.issues.some((i) => i.id === 'invented-absence'));
    const good = lint(['Il pomeriggio comincia con un uomo che spiega come si paga un caffè con il telefono. Finisce con un illusionista di Las Vegas.']);
    assert.equal(good.score, 100);
  } finally { setLang('en'); }
});

for (const l of ['en', 'it']) {
  test(`[${l}] a long piece: brief, outline, written section by section, published; the Editor's own piece reviewed`, async () => {
    setLang(l);
    const { config, store, cleanup } = sandbox();
    try {
      const h = hourStart(Date.now()) - 2 * HOUR;
      store.insertEvents([...hourOfChess(h - 24 * HOUR), ...hourOfChess(h)]);
      const ed = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
      const a = ed.articles.find((x) => x.kind === 'site' && x.id.includes('chess.com'));
      let f = await createFeature(store, config, { editionId: ed.id, articleId: a.id }, quiet);
      assert.equal(f.status, 'brief');
      assert.ok(f.questions.length >= 2);
      assert.match(f.dossier, /chess\.com/);
      f = briefFeature(store, config, f.id, { answers: ['I always lose to bob'], sources: ['I play every evening after dinner'], mode: 'desk' }, quiet);
      await wait(() => getFeature(store, f.id).status === 'draft');
      f = getFeature(store, f.id);
      assert.ok(f.blocks.length >= 2 && f.blocks.every((b) => b.paragraphs.length), 'empty sections');
      assert.ok(f.headline);
      assert.doesNotMatch(f.blocks.flatMap((b) => b.paragraphs).join(' '), BROKEN);
      f = publishFeature(store, f.id);
      assert.equal(f.status, 'published');
      assert.equal(features(store, { status: 'published' }).length, 1);

      // together: the outline waits for the Editor
      let t = await createFeature(store, config, { topic: 'chess.com' }, quiet);
      t = briefFeature(store, config, t.id, { mode: 'together' }, quiet);
      await wait(() => getFeature(store, t.id).status === 'outline');

      // yours: the Editor writes, the desk checks
      let y = await createFeature(store, config, { topic: 'chess.com' }, quiet);
      y = briefFeature(store, config, y.id, { mode: 'yours' }, quiet);
      assert.equal(y.status, 'draft');
      assert.equal(y.byline.id, 'director');
      y = editFeature(store, y.id, { headline: 'My evenings with bob.', text: '## The games\n\nI played 999 games tonight.\n\nAll lost.' });
      assert.equal(y.headline, 'My evenings with bob');
      assert.equal(y.blocks[0].heading, 'The games');
      assert.ok(y.check.unverified.includes('999'), 'an invented figure went unnoticed');
      reviewFeature(store, config, y.id, quiet);
      await wait(() => getFeature(store, y.id).review?.status === 'done');
      assert.ok(Array.isArray(getFeature(store, y.id).review.suggestions));
    } finally { cleanup(); setLang('en'); }
  });
}

test('the bench: a paragraph liked becomes an example, keep and cut are counted', async () => {
  const { config, store, cleanup } = sandbox();
  try {
    const h = hourStart(Date.now()) - 2 * HOUR;
    store.insertEvents(hourOfChess(h));
    const ed = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
    const a = ed.articles.find((x) => x.body.length >= 2) || ed.articles[0];
    await paragraphAction(store, config, ed.id, a.id, { index: 0, op: 'like' });
    assert.equal(getTaste(store).liked.length, 1);
    assert.match(tastePrompt(getLine(store), null), /LIKED/);
    saveLine(store, { tone: 'ironic' });
    assert.equal(getLine(store).taste.liked.length, 1, 'the taste was lost saving the line');
    assert.equal(store.getSetting('line').taste, undefined, 'the taste leaked into the line');
    if (a.body.length >= 2) {
      const n = a.body.length;
      const after = await paragraphAction(store, config, ed.id, a.id, { index: 1, op: 'cut' });
      assert.equal(after.articles.find((x) => x.id === a.id).body.length, n - 1);
    }
    await assert.rejects(() => paragraphAction(store, config, ed.id, a.id, { index: 0, op: 'rewrite', instruction: 'meaner' }), /not answering|non risponde/);
    const opts = await headlineOptions(store, config, ed.id, a.id);
    assert.ok(Array.isArray(opts.options));
    verdict(store, ed.id, ed.articles[0].id, 'keep');
    const last = store.getEdition(ed.id).articles.at(-1).id;
    const cut = verdict(store, ed.id, last, 'cut');
    assert.ok(!cut.articles.some((x) => x.id === last));
    const stats = Object.values(getTaste(store).stats);
    assert.equal(stats.reduce((t, s) => t + s.kept + s.cut, 0), 2);
  } finally { cleanup(); }
});

test('the menu bar shows the calls with one-click answers, and the flash', () => {
  const txt = menubarText({
    edition: null, next: null, base: 'http://localhost:4321', port: 4321,
    calls: [{ id: 7, type: 'closing', question: 'What leads?', options: [{ id: 's0', label: 'chess.com' }], minutesLeft: 4 }, { id: 8, type: 'interview', question: 'Chief?', by: { name: 'Nora' }, options: [] }],
    flash: { ts: Date.now(), headline: 'Record on chess.com', text: '89 visits' },
  });
  assert.match(txt.split('\n')[0], /⚡ Record on chess.com/);
  assert.match(txt, /api\/calls\/7\/answer\?option=s0/);
  assert.match(txt, /#\/calls\/8/);
});

test('a new article: proposed from the signals, commissioned, tipped, approved, printed in the next edition', async () => {
  const { config, store, cleanup } = sandbox();
  try {
    const { topicProposals, approveFeature, withdrawFeature, addSource } = await import('../server/newsroom/features.js');
    const now = Date.now();
    const h = hourStart(now);
    store.insertEvents([...hourOfChess(h - 24 * HOUR), ...hourOfChess(h).map((e) => ({ ...e, ts: Math.min(e.ts, now - 1000) }))]);
    const props = topicProposals(store, config, now);
    const p = props.find((x) => x.kind === 'now' && x.topic === 'chess.com');
    assert.ok(p, `no proposal from the signals: ${JSON.stringify(props.map((x) => x.topic))}`);
    let f = await createFeature(store, config, { storyId: p.storyId, target: 'edition', now }, quiet);
    assert.equal(f.target, 'edition');
    assert.equal(f.format, 'article');
    assert.ok(f.evidence.length > 0);
    assert.ok(topicProposals(store, config, now).find((x) => x.storyId === p.storyId).inWork, 'not marked as in the works');
    f = briefFeature(store, config, f.id, { answers: ['bob is a machine'], tips: [], mode: 'desk' }, quiet);
    await wait(() => getFeature(store, f.id).status === 'draft');
    f = addSource(store, f.id, { text: 'he plays every evening after dinner' });
    assert.equal(f.sources.at(-1).via, 'tip');
    f = approveFeature(store, f.id, { placement: 'lead' }, now);
    assert.equal(f.status, 'approved');
    f = withdrawFeature(store, f.id);
    assert.equal(f.status, 'draft');
    approveFeature(store, f.id, { placement: 'lead' }, now);
    const ed = await printEdition({ store, config, start: h, final: false, force: true, log: quiet });
    assert.equal(ed.articles[0].kind, 'commissioned', 'not at the top');
    assert.equal(ed.articles[0].featureId, f.id);
    assert.ok(ed.articles[0].body.length > 0);
    assert.ok(ed.articles[0].quotes.length === 1);
    assert.equal(getFeature(store, f.id).status, 'published');
    assert.equal(getFeature(store, f.id).printedIn, ed.id);
    // the final print of the same hour keeps it, once
    const again = await printEdition({ store, config, start: h, final: true, force: true, log: quiet });
    assert.equal(again.articles.filter((a) => a.kind === 'commissioned').length, 1);
    assert.doesNotMatch(again.articles[0].body.join(' '), BROKEN);
    // and it can't be approved twice
    assert.throws(() => approveFeature(store, f.id, {}), /already|già/);
  } finally { cleanup(); }
});
