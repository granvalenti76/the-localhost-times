import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson } from '../server/newsroom/llm.js';

test('model JSON is read leniently', () => {
  assert.deepEqual(parseJson('```json\n{"a": 1,}\n```'), { a: 1 });
  assert.deepEqual(parseJson('<think>hmm {not json}</think> Sure: {"a": [1, 2,]}'), { a: [1, 2] });
  assert.throws(() => parseJson('no json here'));
});
