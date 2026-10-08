import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setLang } from '../server/i18n.js';
import { SCENE_IDS, validScene, autoScene, sceneCaption, sceneMenu } from '../server/newsroom/scenes.js';

const at = (h) => new Date(2026, 9, 8, h).getTime();

test('every scene in the catalogue is drawn in Cartoon.jsx', () => {
  const src = fs.readFileSync(new URL('../web/src/components/Cartoon.jsx', import.meta.url), 'utf8');
  for (const id of SCENE_IDS) assert.match(src, new RegExp(`\\n  ${id}: \\(\\) =>`), `missing drawing: ${id}`);
});

test('scene names from the model are normalised', () => {
  assert.equal(validScene(' Mail '), 'mailpile');
  assert.equal(validScene('TABS'), 'tabs');
  assert.equal(validScene('giraffe'), null);
  assert.equal(validScene(42), null);
});

test('the automatic scene follows the lead story and the time of day', () => {
  const s = { total: 40 };
  assert.equal(autoScene([{ source: 'terminal', headline: 'Three commands failed in a row' }], s, { hour: at(10) }), 'bug');
  assert.equal(autoScene([{ source: 'terminal', headline: 'git commit and push' }], s, { hour: at(15) }), 'celebrate');
  assert.equal(autoScene([{ source: 'safari', kind: 'site', id: 'safari:site:youtube.com' }], s, { hour: at(21) }), 'couch');
  assert.equal(autoScene([{ source: 'safari', kind: 'searches' }], s, { hour: at(11) }), 'question');
  assert.equal(autoScene([{ source: 'terminal' }], s, { hour: at(2) }), 'night');
  assert.equal(autoScene([], { total: 0 }, { hour: at(14) }), 'sleep');
});

test('captions and the catalogue exist in both languages', () => {
  for (const l of ['en', 'it']) {
    setLang(l);
    for (const id of SCENE_IDS) assert.ok(sceneCaption(id, 'x').length > 5);
    assert.equal(sceneMenu().split('\n').length, SCENE_IDS.length);
  }
  setLang('en');
});
