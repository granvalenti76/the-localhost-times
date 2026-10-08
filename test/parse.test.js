import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson } from '../server/newsroom/llm.js';
import { parseReply } from '../server/newsroom/meeting.js';

test('model JSON is read leniently', () => {
  assert.deepEqual(parseJson('```json\n{"a": 1,}\n```'), { a: 1 });
  assert.deepEqual(parseJson('<think>hmm {not json}</think> Sure: {"a": [1, 2,]}'), { a: [1, 2] });
  assert.throws(() => parseJson('no json here'));
});

test('meeting replies survive escaped quotes and broken JSON', () => {
  assert.deepEqual(parseReply('{"reply": "ok", "actions": [{"type":"lead","article":"x"}]}'), { reply: 'ok', actions: [{ type: 'lead', article: 'x' }] });
  const escaped = parseReply('{"reply": "fine", "actions": "[{\\"type\\":\\"spike\\",\\"article\\":\\"y\\"}]"}');
  assert.equal(escaped.actions[0].type, 'spike');
  const broken = parseReply('{"reply": "half", "actions": [{\\"type\\":\\"note\\",\\"text\\":\\"z\\"} oops');
  assert.equal(broken.reply, 'half');
  assert.equal(parseReply('just words').reply, 'just words');
});
