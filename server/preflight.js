/**
 * Runs before `npm start`, `npm run demo` and `npm run dev`: catches the usual installation
 * problems early, with a clear message instead of a stack trace.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const problems = [];

const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13) || (maj === 23 && min < 4)) { // node:sqlite needs 22.13+ (or 23.4+)
  problems.push(`Node.js 22.13 or later is needed (this is ${process.versions.node}).\n  Install it with: brew install node   (or use nvm: nvm install 22)`);
}

for (const dep of ['express', 'vite', 'react']) {
  if (!fs.existsSync(path.join(ROOT, 'node_modules', dep))) {
    problems.push('The dependencies are not installed.\n  Run: npm install');
    break;
  }
}

const cfg = path.join(ROOT, 'config.json');
// the setup replaces a broken config.json itself
if (fs.existsSync(cfg) && !process.argv.includes('--setup')) {
  try {
    JSON.parse(fs.readFileSync(cfg, 'utf8'));
  } catch (e) {
    problems.push(`config.json is not valid JSON (${e.message}).\n  Fix it, or delete it and run: npm run setup`);
  }
}

if (problems.length) {
  console.error(`\n✗ The Localhost Times can't start yet:\n\n${problems.map((p) => `• ${p}`).join('\n\n')}\n`);
  process.exit(1);
}

if (process.platform !== 'darwin' && !process.argv.includes('--demo') && !process.argv.includes('--setup')) {
  console.warn('! This is not a Mac: there are no sources to read, the paper will stay empty. Try: npm run demo\n');
}
