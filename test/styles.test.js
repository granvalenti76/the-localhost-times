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

test('styles: each writer has one, the editor can change it, the prompt follows', () => {
  setLang('en');
  const { store, cleanup } = sandbox();
  try {
    assert.equal(staff(getLine(store)).tech.house, 'tech');
    assert.match(personaPrompt(writerFor(getLine(store), 'terminal')), /TECH NEWS/);
    const line = saveLine(store, { staff: { tech: { house: 'noir' }, web: { house: 'giraffe' } } });
    assert.equal(line.staff.tech.house, 'noir');
    assert.equal(line.staff.web?.house, undefined); // unknown styles are dropped
    const w = writerFor(line, 'terminal');
    assert.equal(w.name, 'Walt Brenner');
    assert.match(personaPrompt(w), /NOIR/);
    assert.equal(byline(w).house, 'noir');
    // the Brief never gets a house style; an editorial skips the labelled newsletter
    assert.doesNotMatch(personaPrompt(w, 'brief'), /NOIR/);
    const nl = { ...w, house: 'newsletter' };
    assert.doesNotMatch(personaPrompt(nl, 'editorial'), /NEWSLETTER/);
    assert.match(personaPrompt(nl), /Why it matters:/);
    // a newsletter runs shorter, in more paragraphs; noir a little longer
    const plain = sizeOf(story(20), 0, { length: 'standard' }, { house: 'daily' });
    const news = sizeOf(story(20), 0, { length: 'standard' }, nl);
    assert.ok(news.min < plain.min && news.paras === '5');
    assert.ok(sizeOf(story(20), 0, { length: 'standard' }, w).min > plain.min);
  } finally {
    cleanup();
  }
});
