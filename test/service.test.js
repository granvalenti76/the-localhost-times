import test from 'node:test';
import assert from 'node:assert/strict';
import { plist, LABEL } from '../server/service.js';

test('the LaunchAgent is well formed and escapes paths', () => {
  const xml = plist({ node: '/opt/homebrew/bin/node', root: '/Users/me/R&D/paper', log: '/tmp/x.log', pathEnv: '/usr/bin:/bin' });
  assert.match(xml, new RegExp(`<string>${LABEL.replace(/\./g, '\\.')}</string>`));
  assert.ok(xml.includes('/Users/me/R&amp;D/paper/server/index.js'));
  assert.ok(!xml.includes('R&D'));
  assert.match(xml, /<key>RunAtLoad<\/key><true\/>/);
});
