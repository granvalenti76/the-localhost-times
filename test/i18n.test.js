import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang, tr, lang } from '../server/i18n.js';
import { SECTIONS, sectionBySlug } from '../server/newsroom/sections.js';
import { lengthId } from '../server/newsroom/line.js';

test('language switch and fallback to English', () => {
  assert.equal(setLang('it'), 'it');
  assert.equal(tr({ en: 'a', it: 'b' }), 'b');
  assert.equal(setLang('fr'), 'en');
  assert.equal(lang(), 'en');
  assert.equal(tr({ en: 'a', it: 'b' }), 'a');
});

test('section names follow the language, slugs of both languages resolve', () => {
  setLang('en');
  assert.equal(SECTIONS.safari.name, 'World');
  setLang('it');
  assert.equal(SECTIONS.safari.name, 'Esteri');
  assert.equal(JSON.parse(JSON.stringify(SECTIONS.terminal)).name, 'Officina');
  assert.equal(sectionBySlug('workshop'), 'terminal');
  assert.equal(sectionBySlug('officina'), 'terminal');
  assert.equal(sectionBySlug('nope'), null);
  setLang('en');
});

test('length ids from older versions are migrated', () => {
  assert.equal(lengthId('corti'), 'short');
  assert.equal(lengthId('lunghi'), 'long');
  assert.equal(lengthId('whatever'), 'standard');
});
