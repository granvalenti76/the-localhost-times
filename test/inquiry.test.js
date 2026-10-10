/**
 * The inquiry: subject → angle → data → sources → outline → writing → Editor desk → published,
 * offline (the typesetting) and with a writer (a fake OpenAI-compatible server).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setLang } from '../server/i18n.js';
import { demoEvents } from '../server/demo.js';
import {
  createInquiry, getInquiry, inquiries, replyInquiry, chooseAngle, confirmData, addInquirySource, editInquirySource,
  confirmSources, approveInquiryOutline, toDesk, talkDesk, applyDeskAction, sectionAction, publishInquiry, backInquiry,
  editInquiry, rewriteAllInquiry, registerCheck, humanize, TARGET,
} from '../server/newsroom/inquiry.js';
import { sandbox, quiet, BROKEN } from './helpers.js';

const idle = async (store, id, ms = 8000) => {
  const t0 = Date.now();
  while (getInquiry(store, id).busy) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 15));
  }
  return getInquiry(store, id);
};

for (const l of ['en', 'it']) {
  test(`[${l}] inquiry offline: every stage, the typesetting writes, the desk checks, it goes out`, async () => {
    setLang(l);
    const { config, store, cleanup } = sandbox();
    try {
      store.insertEvents(demoEvents(9, Date.now()));
      assert.throws(() => createInquiry(store, config, { topic: '  ' }, quiet), /subject|argomento/);
      let i = createInquiry(store, config, { topic: 'GitHub', lead: 'look at the late nights', days: 14 }, quiet);
      assert.equal(i.status, 'angle');
      assert.ok(i.dossier.length > 0, 'no file from the signals');
      i = await idle(store, i.id);
      assert.ok(i.angles.length >= 2, 'no angles');
      const open = i.questions.filter((x) => !x.a);
      assert.ok(open.length >= 2, 'the reporter asked nothing');

      // a turn: the Editor answers, the reporter takes note
      i = replyInquiry(store, config, i.id, { answers: { [open[0].id]: 'It started with a broken build' } }, quiet);
      i = await idle(store, i.id);
      assert.equal(i.questions.find((x) => x.id === open[0].id).a, 'It started with a broken build');
      assert.equal(i.thread.at(-1).who, 'reporter');
      assert.throws(() => replyInquiry(store, config, i.id, {}, quiet), /Answer|Risponda/);

      i = chooseAngle(store, config, i.id, { angleId: i.angles[0].id }, quiet);
      assert.equal(i.status, 'data');
      i = await idle(store, i.id);
      assert.ok(i.needs.length >= 2);
      const sig = i.needs.find((n) => n.kind === 'signals');
      assert.ok(sig?.found, 'the archive was not searched for the data');
      const own = i.needs.find((n) => n.kind === 'owner');
      i = confirmData(store, config, i.id, { needs: [{ id: own.id, answer: 'Three nights in a row, before a deadline' }], extra: ['The repository is called press'] }, quiet);
      assert.equal(i.status, 'sources');
      i = await idle(store, i.id);
      assert.ok(i.sources.some((s) => s.kind === 'signals'), 'the signals are not a source');
      assert.ok(i.sources.some((s) => s.kind === 'testimony'), 'the Editor\'s words are not a source');
      i = addInquirySource(store, i.id, { kind: 'person', label: 'Marco, a colleague', text: '“He never sleeps before a release”', attribution: 'on' });
      const added = i.sources.at(-1);
      i = editInquirySource(store, i.id, added.id, { attribution: 'anon' });
      assert.equal(i.sources.at(-1).attribution, 'anon');

      i = confirmSources(store, config, i.id, quiet);
      i = await idle(store, i.id);
      assert.equal(i.status, 'outline');
      assert.ok(i.outline.sections.length >= 1);
      // back a step and forward again
      i = backInquiry(store, i.id, 'sources');
      assert.equal(i.status, 'sources');
      i = await idle(store, confirmSources(store, config, i.id, quiet).id);

      i = approveInquiryOutline(store, config, i.id, { ...i.outline, headline: 'The night shift' }, quiet);
      i = await idle(store, i.id);
      assert.equal(i.status, 'draft');
      assert.equal(i.writer, 'typesetting');
      assert.ok(i.words > 20);
      assert.ok(i.blocks.every((b) => b.paragraphs.length));
      assert.doesNotMatch(i.blocks.flatMap((b) => [b.heading, ...b.paragraphs]).join(' '), BROKEN);
      assert.doesNotMatch(i.blocks.at(-1).paragraphs.join(' '), /[«“]{2}/, 'a quote quoted twice');
      assert.equal(i.shape.target, TARGET);

      i = toDesk(store, config, i.id, quiet);
      i = await idle(store, i.id);
      assert.equal(i.status, 'desk');
      assert.equal(i.desk.status, 'done');
      assert.ok(i.desk.shape.sections.length === i.blocks.length);
      assert.ok(i.deskThread.length === 1, 'the managing editor said nothing');
      i = await talkDesk(store, config, i.id, 'Is the lede strong enough?', quiet);
      assert.equal(i.deskThread.at(-1).who, 'editor');

      i = sectionAction(store, config, i.id, 0, { op: 'edit', paragraphs: 'My own opening, written at the desk.\n\nAnd a second paragraph.' }, quiet);
      assert.equal(i.blocks[0].by, 'director');
      assert.equal(i.blocks[0].paragraphs.length, 2);
      i = editInquiry(store, i.id, { headline: 'The Night Shift.', dek: 'Three nights, one build.' });
      assert.equal(i.headline, 'The Night Shift');

      i = publishInquiry(store, i.id);
      assert.equal(i.status, 'published');
      const f = store.getItem('feature', i.featureId);
      assert.equal(f.status, 'published');
      assert.equal(f.target, 'longread');
      assert.equal(f.headline, 'The Night Shift');
      assert.match(f.blocks[0].paragraphs[0], /My own opening/);
      assert.ok(inquiries(store).some((x) => x.id === i.id && x.featureId === f.id));
    } finally { cleanup(); setLang('en'); }
  });
}

// ───────────────────────── With a writer ─────────────────────────

function answer(messages) {
  const sys = messages[0]?.content || '';
  const last = messages.at(-1)?.content || '';
  if (/"premise"/.test(sys)) return JSON.stringify({ premise: 'Why does the work wait for the night?', scenes: [{ moment: 'After dinner, the laptop opens on the kitchen table', when: 'evening' }, 'At 07:11 the owner opens pull request 42'], facts: ['A build broke on a Tuesday evening', '27 signals were recorded that day'], figures: [{ value: '43', meaning: 'one day that ended two silent weeks' }, { value: '9', meaning: 'x' }, { value: '7', meaning: 'y' }, { value: '5', meaning: 'too many' }], unknowns: ['What broke'], motifs: ['day job, night work'] });
  if (/"angles": \[\{"title"/.test(sys) && /"reading"/.test(sys)) return JSON.stringify({ reading: 'GitHub every night, after eleven.', angles: [{ title: 'After eleven', angle: 'The work that only happens at night', why: 'most signals after 23:00', needs: 'why the night' }, { title: 'The broken build', angle: 'A week around one failure', why: 'a peak day', needs: 'the cause' }], questions: ['Chief, why at night?', 'What broke first?'] });
  if (/"note": "\.\.\.", "questions"/.test(sys)) return JSON.stringify({ note: 'So the night is a choice, not an accident.', questions: ['Chief, who else was awake?'], angles: [] });
  if (/"needs": \[/.test(sys)) return JSON.stringify({ note: 'I will build it hour by hour.', needs: [{ kind: 'signals', text: 'Every GitHub visit at night', search: 'github', why: 'the spine' }, { kind: 'owner', text: 'Why the night', why: 'the motive' }], questions: ['Chief, since when?'] });
  if (/"missing": \[/.test(sys)) return JSON.stringify({ note: 'Solid on the signals, thin on people.', missing: [{ kind: 'person', text: 'A colleague who saw it' }], questions: [] });
  if (/"lede": "\.\.\."/.test(sys) && /"sections"/.test(sys)) return JSON.stringify({ headline: 'After Eleven', dek: 'A week of nights.', lede: 'Midnight, a pull request', nut: 'The work happens when nobody watches', sections: [{ heading: 'Midnight', beat: 'the scene', sources: ['s1'] }, { heading: 'The pattern', beat: 'the numbers', sources: ['s1', 's2'] }, { heading: 'The reason', beat: 'the Editor speaks', sources: ['s3'] }, { heading: 'Morning', beat: 'the ending', sources: [] }], ending: 'The screen goes dark at dawn' });
  if (/copy chief of a good magazine/.test(sys)) return JSON.stringify({ fixes: [{ n: 1, to: 'It had become a ritual.' }] });
  if (/Now write ONLY movement|Ora scrivi SOLO il movimento/.test(last)) {
    const n = /ONLY movement (\d)|SOLO il movimento (\d)/.exec(last);
    const slop = n?.[1] === '2' ? ' It is not just a habit, it is a ritual.' : '';
    return `It was past midnight in movement ${n?.[1] || n?.[2]}, and the tab said *GitHub*, as it had the night before and would the night after.${slop}\n\nNobody asked the owner why. The archive only kept the hours, in a column, patient as a ledger.\n\n“I like it when it is quiet,” the owner said, and the build went green.`;
  }
  if (/"alternatives"/.test(sys)) return JSON.stringify({ kicker: 'Inquiry', headline: 'After Eleven.', dek: 'What a week of nights on GitHub says about work.', alternatives: ['The Night Desk', 'Green at Dawn'] });
  if (/"claims": \[\{"p"/.test(sys)) return JSON.stringify({ claims: [{ p: 1, text: 'past midnight on GitHub', sources: ['s1'], verdict: 'ok', note: '' }, { p: 3, text: 'the build went green', sources: [], verdict: 'unsupported', note: 'no source says it' }] });
  if (/"edits": \[/.test(sys)) return JSON.stringify({ verdict: 'A real piece. The ending is soft.', lede: { ok: true, note: 'It pulls.' }, nut: { ok: true, p: 2, note: 'Clear.' }, arc: { ok: true, note: '' }, ending: { ok: false, note: 'Too soft.' }, prose: 'Clean.', edits: [{ section: 4, note: 'Sharper close', instruction: 'end on the dark screen' }], headlines: ['After Eleven', 'Night Work', 'The Late Shift'], dek: 'Nights.', kicker: 'Inquiry' });
  if (/"reply": "\.\.\."/.test(sys)) return JSON.stringify({ reply: 'Cut the green build: no source.', actions: [{ type: 'rewrite', section: 4, instruction: 'remove the green build' }, { type: 'headline', text: 'The Late Shift' }] });
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
      calls.push(j);
      res.end(JSON.stringify({ choices: [{ message: { content: answer(j.messages) }, finish_reason: 'stop' }] }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, port: server.address().port })));
}

test('inquiry with a writer: the creative model writes, turns go deeper, the desk checks and edits', async () => {
  setLang('en');
  const { server, calls, port } = await mockServer();
  const { config, store, cleanup } = sandbox();
  config.llm.baseUrl = `http://127.0.0.1:${port}/v1`;
  config.llm.timeoutMs = 5000;
  try {
    store.insertEvents(demoEvents(9, Date.now()));
    let i = await idle(store, createInquiry(store, config, { topic: 'GitHub', lead: 'the nights' }, quiet).id);
    assert.equal(i.angles[0].title, 'After eleven');
    assert.match(i.thread.at(-1).text, /after eleven/);
    assert.ok(calls.some((c) => c.temperature === 0.85), 'the creative writer was not used warmer');
    assert.ok(calls.some((c) => /the nights/.test(JSON.stringify(c.messages))), 'the Editor\'s lead never reached the reporter');

    const qs = i.questions.filter((x) => !x.a);
    i = await idle(store, replyInquiry(store, config, i.id, { answers: { [qs[0].id]: 'Because the house is quiet' } }, quiet).id);
    assert.match(i.thread.at(-1).text, /choice/);
    assert.ok(i.questions.some((x) => x.q === 'Chief, who else was awake?' && x.round === 2), 'no deeper follow-up');

    i = await idle(store, chooseAngle(store, config, i.id, { angleId: i.angles[0].id }, quiet).id);
    assert.equal(i.needs[0].search, 'github');
    assert.match(i.needs[0].found, /\d+ signals/);
    i = await idle(store, confirmData(store, config, i.id, { needs: [{ id: i.needs[1].id, answer: 'Deadlines' }] }, quiet).id);
    assert.equal(i.missing[0].kind, 'person');
    i = await idle(store, confirmSources(store, config, i.id, quiet).id);
    assert.equal(i.outline.sections.length, 4);
    assert.equal(i.outline.nut, 'The work happens when nobody watches');

    i = await idle(store, approveInquiryOutline(store, config, i.id, null, quiet).id);
    assert.equal(i.status, 'draft');
    assert.equal(i.blocks.length, 4);
    assert.match(i.blocks[3].paragraphs[0], /movement 4/);
    assert.equal(i.headline, 'After Eleven');
    const writing = calls.filter((c) => /Now write ONLY movement/.test(c.messages.at(-1).content));
    assert.equal(writing.length, 4);
    assert.ok(writing.every((c) => c.temperature === 0.85 && c.max_tokens >= 4000));
    assert.match(writing[0].messages[0].content, /New Yorker/);
    assert.match(writing[0].messages[0].content, /DASHBOARD RULE/);
    // the writer works from the reporter's notes, never from the raw file
    assert.match(writing[0].messages.at(-1).content, /THE REPORTER'S NOTES/);
    assert.match(writing[0].messages.at(-1).content, /kitchen table/);
    assert.doesNotMatch(writing[0].messages.at(-1).content, /THE FILE \(the signals|SAMPLE OF SIGNALS/);
    assert.equal(i.carnet.figures.length, 3, 'more than three figures kept');
    assert.doesNotMatch(JSON.stringify(i.carnet), /object Object/, 'scenes given as objects were lost');
    assert.doesNotMatch(JSON.stringify(i.carnet), /07:11|signals were recorded/, 'the notes still carry the dashboard');
    assert.ok(i.blocks[0].paragraphs.some((p) => p.startsWith('“I like it')), 'a quote opening a paragraph lost its quotation mark');
    // the copy desk sent back the movement with machine-made phrasing
    assert.ok(calls.some((c) => /copy chief of a good magazine/.test(c.messages[0].content) && /1\. It is not just a habit/.test(c.messages.at(-1).content)), 'the stock phrase was not sent back');
    assert.doesNotMatch(i.blocks[1].paragraphs.join(' '), /not just a habit/);
    assert.match(i.blocks[1].paragraphs[0], /the night after\. It had become a ritual\./, 'the fixed sentence was not put back in its place');
    assert.ok(i.register && typeof i.register.score === 'number');
    assert.match(writing[0].messages.at(-1).content, /nut graf/);
    assert.match(writing[2].messages.at(-1).content, /WHAT COMES JUST BEFORE/);
    assert.ok(calls.some((c) => /it needs at least/.test(c.messages.at(-1).content)), 'a short movement was not sent back to be widened');
    assert.doesNotMatch(i.blocks[0].paragraphs[0], /\*/, 'markdown left in the text');

    i = await idle(store, toDesk(store, config, i.id, quiet).id);
    assert.equal(i.desk.claims.length, 2);
    assert.equal(i.desk.claims[1].verdict, 'unsupported');
    assert.equal(i.desk.read.ending.ok, false);
    assert.equal(i.desk.read.edits[0].section, 3);
    assert.match(i.deskThread[0].text, /ending is soft/);
    // the checks run at the configured temperature, not the creative one
    assert.ok(calls.filter((c) => /fact-checker/.test(c.messages[0].content)).every((c) => c.temperature === 0.7));

    i = await talkDesk(store, config, i.id, 'What would you cut?', quiet);
    const m = i.deskThread.length - 1;
    assert.equal(i.deskThread[m].actions.length, 2);
    i = applyDeskAction(store, config, i.id, { msg: m, action: 1 }, quiet);
    assert.equal(i.headline, 'The Late Shift');
    const before = calls.length;
    i = await idle(store, applyDeskAction(store, config, i.id, { msg: m, action: 0 }, quiet).id);
    assert.ok(calls.slice(before).some((c) => /remove the green build/.test(c.messages.at(-1).content)), 'the rewrite never reached the writer');
    assert.equal(i.blocks[3].rewrittenWith, 'remove the green build');
    assert.ok(i.deskThread[m].actions[0].applied);
    i = await idle(store, applyDeskAction(store, config, i.id, { edit: i.desk.read.edits[0].id }, quiet).id);
    assert.ok(i.desk.read.edits[0].applied);

    // written again in the voice, from fresh notes
    i = rewriteAllInquiry(store, config, i.id, quiet);
    assert.equal(i.status, 'writing');
    i = await idle(store, i.id);
    assert.equal(i.status, 'draft');
    assert.ok(i.carnet, 'no fresh notes');
    assert.ok(i.blocks.every((b) => b.paragraphs.length));
    i = await idle(store, toDesk(store, config, i.id, quiet).id);

    i = publishInquiry(store, i.id);
    assert.equal(store.getItem('feature', i.featureId).headline, 'The Late Shift', 'the rewrite lost the Editor\'s headline');
    assert.ok(i.alternatives.includes('After Eleven'));
  } finally { cleanup(); server.close(); }
});

test('the register: a dashboard scores low, a magazine high', () => {
  const dash = registerCheck(['Il sistema registra 43 segnali alle 06:19, poi alle 07:04 e alle 09:12: il picco delle attività è il 10,4% dei dati del periodo.']);
  const mag = registerCheck(['Dopo cena, quando la casa si fa silenziosa, il proprietario riapre il portatile sul tavolo della cucina, come chi torna a un lavoro lasciato a metà.']);
  assert.ok(dash.score < 40, `dashboard scored ${dash.score}`);
  assert.equal(mag.score, 100);
  assert.ok(dash.words.some((x) => x.w === 'segnali'));
  assert.equal(dash.times, 3);
  assert.equal(dash.pct, 1);
  const slop = registerCheck(['Non è un semplice incremento di produttività, ma la manifestazione di una rottura: un cambiamento antropologico, con una violenza quasi chirurgica.']);
  assert.ok(slop.slop.length >= 3, JSON.stringify(slop.slop));
  assert.ok(slop.score < 60);
  // the model's favourite tic, in any form
  assert.equal(registerCheck(['Quel mattino non è l\'inizio di un nuovo ciclo, ma il superamento di una stasi.']).slop.length, 1);
  assert.equal(registerCheck(['Non era tardi, ma lui aveva fretta di finire.']).slop.length, 1, 'a plain contrast is fine once, it is still counted');
});

test('the notes lose the clock: times become parts of the day', () => {
  setLang('it');
  assert.equal(humanize('Il 10 ottobre alle 07:11 il Direttore apre la Pull request #42.'), 'Il 10 ottobre di primo mattino il Direttore apre la Pull request #42.');
  assert.equal(humanize('Alle 13:21 apre un file .dmg.'), 'nel primo pomeriggio apre un file .dmg.');
  setLang('en');
  assert.equal(humanize('At 23:40 he pushes the fix.'), 'late in the evening he pushes the fix.');
});

test('the phrasing desk fixes only the bad sentences, in place, and keeps the quotes', async () => {
  setLang('it');
  const { phrasingDesk } = await import('../server/newsroom/chain.js');
  const paras = [
    'Alle sette apre la pull request. Non è un semplice controllo, ma una ripresa. Poi legge la discussione su node:sqlite.',
    '«Di notte risponde alle review prima di tutti», dice Marco. Il sistema ha registrato ventuno consultazioni.',
  ];
  let seen = null;
  const chat = async (llm, config, msgs) => {
    seen = msgs.at(-1).content;
    return JSON.stringify({ fixes: [{ n: 1, to: 'È una ripresa.' }, { n: 2, to: 'Ha aperto la pagina più volte.' }] });
  };
  const out = await phrasingDesk(paras, { llm: {}, config: {}, chat });
  assert.match(seen, /1\. Non è un semplice controllo/);
  assert.match(seen, /2\. Il sistema ha registrato/);
  assert.doesNotMatch(seen, /\d\. Alle sette apre/, 'a clean sentence was sent to be fixed');
  assert.equal(out[0], 'Alle sette apre la pull request. È una ripresa. Poi legge la discussione su node:sqlite.');
  assert.equal(out[1], '«Di notte risponde alle review prima di tutti», dice Marco. Ha aperto la pagina più volte.');
  // no model, or nothing to fix: the text is untouched
  assert.deepEqual(await phrasingDesk(paras, { llm: null }), paras);
  setLang('en');
});
