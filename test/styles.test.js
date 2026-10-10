import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { STYLE_IDS, STYLES, styleList } from '../server/newsroom/styles.js';
import { staff, writerFor, personaPrompt, byline } from '../server/newsroom/writers.js';
import { getLine, saveLine } from '../server/newsroom/line.js';
import { sizeOf } from '../server/newsroom/prompts.js';
import { sandbox } from './helpers.js';

const story = (n) => ({ events: Array.from({ length: n }, () => ({})), weight: 1 });

test('styles: every style is complete in both languages', () => {
  for (const l of ['en', 'it']) {
    setLang(l);
    assert.equal(styleList().length, 8);
    for (const id of STYLE_IDS) assert.ok(STYLES[id].label && STYLES[id].hint && STYLES[id].prompt.length > 80, `${l} ${id}`);
  }
  setLang('en');
});

test('styles: the long reads keep them; the writers have one voice, and an optional deviation', () => {
  setLang('en');
  const { store, cleanup } = sandbox();
  try {
    const w0 = writerFor(getLine(store), 'terminal');
    assert.equal(w0.house, undefined);
    assert.match(personaPrompt(w0), /YOUR BYLINE: you are Walt Brenner/);
    assert.doesNotMatch(personaPrompt(w0), /TECH NEWS|DEVIATION/);
    const line = saveLine(store, { staff: { tech: { deviation: 'Keener on the numbers.' } } });
    const w = writerFor(line, 'terminal');
    assert.match(personaPrompt(w), /YOUR DEVIATION \(from the editor\): Keener on the numbers\./);
    assert.deepEqual(Object.keys(byline(w)).sort(), ['id', 'name', 'role']);
    // the length is the format's, whoever writes it
    assert.deepEqual(sizeOf(story(20), 0, { length: 'standard' }, { house: 'newsletter' }), sizeOf(story(20), 0, { length: 'standard' }));
  } finally {
    cleanup();
  }
});

test('styles: a line saved by an older version loses the tone and the house styles; a voice becomes a deviation', () => {
  setLang('it');
  const { store, cleanup } = sandbox();
  try {
    store.setSetting('line', { tone: 'tabloid', length: 'long', staff: { web: { house: 'explainer' }, tech: { house: 'noir', style: 'Scrive come un detective.' } } });
    const line = getLine(store);
    assert.equal(line.tone, undefined);
    assert.deepEqual(line.staff.web, {});
    assert.deepEqual(line.staff.tech, { deviation: 'Scrive come un detective.' });
    const saved = saveLine(store, {});
    assert.equal(saved.tone, undefined);
    assert.deepEqual(saved.staff, { tech: { deviation: 'Scrive come un detective.' } });
    assert.match(personaPrompt(writerFor(saved, 'terminal')), /LA TUA DEVIAZIONE \(decisa dal direttore\): Scrive come un detective\./);
  } finally {
    cleanup();
    setLang('en');
  }
});
