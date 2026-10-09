import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSequence, windows } from '../server/newsroom/spotlight/detectors.js';
import { openFromTip, tipsToLeads, linkCandidates, crossLeads, widenLead, tipLead, dossierExtras, overlap, tipWords, sanitize } from '../server/newsroom/spotlight/cross.js';
import { spotlightRound, board } from '../server/newsroom/spotlight/desk.js';
import { dossier } from '../server/newsroom/spotlight/write.js';
import { addTip } from '../server/newsroom/tips.js';
import { setLang } from '../server/i18n.js';
import { sandbox } from './helpers.js';

const DAY = 24 * 3600e3;
const MIN = 60e3;
const visit = (id, ts, host, title) => ({ id, source: 'safari', kind: 'visit', ts, title, detail: null, url: `https://${host}/`, meta: { host } });

/** Three evenings: Hacker News, then YouTube within minutes; chess.com at night. */
function evenings(now) {
  const ev = [];
  for (let d = 0; d < 3; d++) {
    for (let k = 0; k < 2; k++) {
      const t = now - d * DAY - (5 - k * 2) * 3600e3;
      ev.push(visit(`hn${d}${k}`, t, 'news.ycombinator.com', 'Hacker News: a story'));
      ev.push(visit(`yt${d}${k}`, t + 4 * MIN, 'youtube.com', `A video about knights ${d}${k}`));
    }
    for (let i = 0; i < 6; i++) ev.push(visit(`ch${d}${i}`, now - d * DAY - 2 * 3600e3 + i * MIN, 'chess.com', `alice vs. bob | Analysis ${d}${i}`));
  }
  return ev.sort((a, b) => a.ts - b.ts);
}

test('a sequence: one site keeps following another', () => {
  const now = Date.now();
  const ev = evenings(now);
  const found = detectSequence({ ...windows(ev, now), now });
  const s = found.find((x) => x.subject === 'news.ycombinator.com → youtube.com');
  assert.ok(s, JSON.stringify(found.map((x) => x.subject)));
  assert.equal(s.kind, 'sequence');
  assert.ok(s.evidence.length >= 4);
});

for (const l of ['en', 'it']) {
  test(`[${l}] Spotlight widened: a tip opens a lead, the box's tips become witnesses, leads cross`, async () => {
    setLang(l);
    const { config, store, cleanup } = sandbox();
    try {
      const now = Date.now();
      store.insertEvents(evenings(now));
      assert.deepEqual(tipWords('I play too much on chess.com at night'), ['chess.com']);
      assert.deepEqual(tipWords('the evenings on the laptop are getting longer'), ['evenings', 'laptop', 'longer']);
      assert.deepEqual(tipWords('anything', 'chess.com, lichess'), ['chess.com', 'lichess']);
      // the Editor's tip: a lead, searched in the archive, fast-tracked
      const lead = openFromTip(store, config, { text: 'I play too much on chess.com at night' }, now);
      assert.equal(lead.kind, 'tip');
      assert.ok(lead.chief);
      assert.ok(lead.evidence.filter((x) => x.source === 'safari').length >= 3, 'the archive was not searched');
      assert.ok(lead.evidence.some((x) => x.source === 'tip'));
      assert.throws(() => openFromTip(store, config, { text: 'my doctor and the hospital' }, now), /investigate|indaga/);

      // a tip in the box about the same subject joins it as a witness
      addTip(store, { text: 'He lost again on chess.com tonight', ts: now - 10 * MIN });
      assert.equal(tipsToLeads(store, now), 1);
      assert.equal(tipsToLeads(store, now), 0, 'the same witness twice');
      let saved = store.getLead(lead.id);
      assert.equal(saved.evidence.filter((x) => x.source === 'tip').length, 2);

      // the Editor widens the search and adds a tip
      saved = widenLead(store, lead.id, 'youtube.com', now);
      assert.ok(saved.evidence.some((x) => x.host === 'youtube.com'));
      saved = tipLead(store, lead.id, 'Always after dinner', now);
      assert.equal(saved.tips.length, 3);

      // two leads in the same hours cross
      const other = { id: 'obsession:site:youtube.com', kind: 'obsession', subject: 'youtube.com', hypothesis: 'YouTube comes back', status: 'open', openedAt: now - 3 * DAY, updatedAt: now, evidence: store.getLead(lead.id).evidence.filter((x) => x.host === 'youtube.com').map((x) => ({ ...x, id: `${x.id}-copy`, ts: x.ts + 3 * MIN })), facts: [], strength: 0.5, goal: 70 };
      store.saveLead(other);
      const o = overlap(store.getLead(lead.id), other);
      assert.ok(o.near.length >= 3, `near ${o.near.length}`);
      const links = linkCandidates(store.leads({ status: ['open'] }));
      assert.equal(links.length, 1);
      assert.equal(links[0].kind, 'link');
      const crossed = crossLeads(store, lead.id, other.id, now);
      assert.equal(crossed.links.length, 2);

      // the dossier knows the witnesses and the crossing
      const extras = dossierExtras(store, crossed, now);
      assert.match(extras, /WITNESSES|TESTIMONI/);
      assert.match(extras, /CROSS|INCROCIANO/);
      assert.match(dossier({ ...store.getLead(lead.id), extras: dossierExtras(store, store.getLead(lead.id), now) }), /lost again|chess\.com/);

      // a round of the desk with all of it, and the board shows it
      await spotlightRound(store, config, { now, log: () => {} });
      const b = board(store, config);
      const shown = b.leads.find((x) => x.id === lead.id);
      assert.ok(shown.tips.length >= 2);
      assert.ok(b.leads.some((x) => x.kind === 'link' && x.links.length === 2));
    } finally { cleanup(); setLang('en'); }
  });
}

test('a sentence in "widen" is a tip; delicate tips leave the file before the editor reads it', () => {
  const { config, store, cleanup } = sandbox();
  try {
    const now = Date.now();
    store.insertEvents(evenings(now));
    const lead = openFromTip(store, config, { text: 'Every evening I watch videos about knights' }, now);
    assert.ok(lead.keywords.includes('knights') || lead.keywords.includes('videos'), lead.keywords.join(','));
    const w = widenLead(store, lead.id, 'he looks for chess openings late at night', now);
    assert.ok(w.tips.some((t) => /openings/.test(t.text)), 'the sentence did not become a witness');
    assert.ok(w.keywords.every((k) => k.split(/\s+/).length <= 3), w.keywords.join(' | '));
    const l2 = store.getLead(lead.id);
    l2.tips.push({ text: 'He has ADHD', ts: now });
    l2.evidence.push({ id: 'tip:x', ts: now, source: 'tip', kind: 'tip', title: 'He has ADHD' });
    const clean = sanitize(l2);
    assert.ok(!clean.tips.some((t) => /ADHD/.test(t.text)));
    assert.ok(!clean.evidence.some((x) => /ADHD/.test(x.title)));
  } finally { cleanup(); }
});
