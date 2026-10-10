import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLang } from '../server/i18n.js';
import { EXAMPLES, voicePrompt, examplesPrompt, columnVoice } from '../server/newsroom/voice.js';
import { systemFor, summaryPrompt, marketPrompt } from '../server/newsroom/prompts.js';
import { linePrompt } from '../server/newsroom/line.js';
import { figures, numbersCheck } from '../server/newsroom/factcheck.js';

const guide = readFileSync(new URL('../docs/STYLE.md', import.meta.url), 'utf8');

test('voice: the examples in the prompts are the style guide\'s, word for word', () => {
  for (const l of ['en', 'it']) {
    const e = EXAMPLES[l];
    for (const text of [e.brief, e.inflated, e.log, e.note.headline, e.note.dek, ...e.note.body, e.piece.headline, e.piece.dek, ...e.piece.body]) {
      assert.ok(guide.includes(text), `${l}: not in docs/STYLE.md: ${text.slice(0, 60)}…`);
    }
  }
});

test('voice: every piece gets the house voice, the reporter also the examples', () => {
  for (const l of ['en', 'it']) {
    setLang(l);
    const sys = systemFor(null);
    assert.ok(sys.includes(voicePrompt()), l);
    assert.ok(sys.includes(examplesPrompt()), l);
    assert.ok(sys.indexOf(voicePrompt()) < sys.indexOf(examplesPrompt()), `${l}: the voice comes before the examples`);
    assert.ok(linePrompt({ notes: 'Mai il lunedì.' }).includes('Mai il lunedì.'));
    assert.ok(summaryPrompt([], 3, '18:00', null)[0].content.includes(EXAMPLES[l].brief), `${l}: the Brief has its example`);
    assert.ok(marketPrompt({ rows: [], index: { close: 3, change: null } }, '18:00', null)[0].content.includes(columnVoice('market')), l);
    assert.doesNotMatch(sys, /TONE|TONO|HOUSE STYLE|STILE DELLA CASA/);
  }
  setLang('en');
});

test('voice: numbers up to ten are spelled out, and checked like figures', () => {
  assert.deepEqual(figures('lo chiede tre volte, alle 11:02'), ['3', '11:02']);
  assert.deepEqual(figures('Ten tabs, then three more'), ['10', '3']);
  // the time of day and the idioms are not counts
  assert.deepEqual(figures('alle otto apre Gmail; at nine, a quattro mani, in quattro e quattr\'otto'), []);
  // "tre" is in the facts as 3: verified; "sette" is not
  const facts = 'Unread messages in the inbox: 3.';
  assert.deepEqual(numbersCheck({ headline: 'La posta', dek: '', body: ['Le tre email non lette restano tali.'] }, facts).unverified, []);
  assert.deepEqual(numbersCheck({ headline: 'La posta', dek: '', body: ['Le sette email non lette restano tali.'] }, facts).unverified, ['7']);
});

test('voice: a draft that copies the examples is caught, an ordinary one is not', async () => {
  const { copiedFromExamples } = await import('../server/newsroom/voice.js');
  setLang('it');
  const copied = copiedFromExamples({ headline: 'La posta, per scrupolo', dek: '', body: ['Due messaggi attendono: la corrispondenza, a quanto pare, può attendere.'] });
  assert.equal(copied[0], 'La posta, per scrupolo');
  assert.ok(copied.length >= 2);
  assert.deepEqual(copiedFromExamples({ headline: 'Un passaggio rapido su X', dek: '', body: ['Alle 18:38 il proprietario percorre tre pagine di X.'] }), []);
  setLang('en');
});
