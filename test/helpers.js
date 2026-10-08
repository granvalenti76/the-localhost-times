import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultConfig } from '../server/config.js';
import { Store } from '../server/db.js';

/** A throwaway database and a config with no model (the typesetting writes) and no photos. */
export function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localhost-times-test-'));
  const config = defaultConfig({ demo: true, llm: { baseUrl: '' }, notifications: { enabled: false } });
  config.dataDir = dir;
  config.dbFile = path.join(dir, 'test.sqlite');
  const store = new Store(config.dbFile);
  return { dir, config, store, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export const quiet = () => {};

/** Text that should never reach a reader. */
export const BROKEN = /undefined|NaN|\[object Object\]|null(?![-\w])/;
