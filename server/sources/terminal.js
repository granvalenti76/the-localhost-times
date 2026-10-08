import fs from 'node:fs';
import { home, fileState, hash, PermissionError } from '../util.js';

const FILES = [
  { shell: 'zsh', file: home('.zsh_history') },
  { shell: 'bash', file: home('.bash_history') },
];

// zsh salva i caratteri non-ASCII "metafied": 0x83 seguito dal byte XOR 32
function unmetafy(buf) {
  const out = Buffer.alloc(buf.length);
  let j = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x83 && i + 1 < buf.length) out[j++] = buf[++i] ^ 32;
    else out[j++] = buf[i];
  }
  return out.subarray(0, j).toString('utf8');
}

function parseZsh(text) {
  const entries = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (cur && cur.cmd.endsWith('\\')) { cur.cmd += '\n' + line; continue; }
    const m = /^: (\d+):\d+;(.*)$/.exec(line);
    if (m) { cur = { ts: Number(m[1]) * 1000, cmd: m[2] }; entries.push(cur); }
    else if (line.trim()) { cur = { ts: null, cmd: line }; entries.push(cur); }
  }
  return entries;
}

function parseBash(text) {
  const entries = [];
  let ts = null;
  for (const line of text.split('\n')) {
    const m = /^#(\d{9,})$/.exec(line);
    if (m) { ts = Number(m[1]) * 1000; continue; }
    if (line.trim()) { entries.push({ ts, cmd: line }); ts = null; }
  }
  return entries;
}

const SECRET_PATTERNS = [
  [/((?:password|passwd|pwd|token|secret|api[_-]?key|auth)[\w-]*\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1•••'],
  [/(--?(?:password|pass|token|secret|key)[= ])("[^"]*"|'[^']*'|\S+)/gi, '$1•••'],
  [/(Bearer\s+)\S+/gi, '$1•••'],
  [/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{10,}|gho_[A-Za-z0-9]{10,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{12,})\b/g, '•••'],
  [/(\w+:\/\/[^:\s/]+:)[^@\s]+@/g, '$1•••@'],
  [/(mysql\s.*?-p)\S+/g, '$1•••'],
];

export function redact(cmd) {
  let out = cmd;
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out;
}

export function family(cmd) {
  const words = cmd.trim().replace(/^(sudo|time|env)\s+/, '').split(/\s+/);
  const w = (words[0] || '').split('/').pop();
  if (['git', 'npm', 'pnpm', 'yarn', 'brew', 'docker', 'kubectl', 'cargo', 'swift', 'go', 'pip', 'uv'].includes(w) && words[1] && !words[1].startsWith('-')) {
    return `${w} ${words[1]}`;
  }
  return w;
}

const tailEq = (entries, idx, tail) =>
  tail.every((c, k) => entries[idx - tail.length + 1 + k]?.cmd === c);

export default {
  id: 'terminal',
  label: 'Terminale',
  locate() {
    const states = FILES.map((f) => fileState(f.file));
    if (states.includes('ok')) return { file: FILES[states.indexOf('ok')].file, state: 'ok' };
    if (states.includes('denied')) return { file: FILES[0].file, state: 'denied' };
    return { file: FILES[0].file, state: 'missing' };
  },

  collect({ since, cursor = {} }) {
    const now = Date.now();
    const events = [];
    const next = { ...cursor };
    for (const { shell, file } of FILES) {
      if (fileState(file) !== 'ok') continue;
      let text;
      try {
        const buf = fs.readFileSync(file);
        text = shell === 'zsh' ? unmetafy(buf) : buf.toString('utf8');
      } catch (e) {
        if (e.code === 'EPERM' || e.code === 'EACCES') throw new PermissionError(file);
        throw e;
      }
      const entries = shell === 'zsh' ? parseZsh(text) : parseBash(text);
      const prev = cursor[shell];
      let fresh = [];
      const timed = entries.length > 0 && entries[entries.length - 1].ts != null;
      if (timed) {
        fresh = entries.filter((e) => e.ts != null && e.ts > since);
      } else if (prev?.tail?.length) {
        // nessun timestamp: ci ancoriamo agli ultimi comandi già visti
        let anchor = -1;
        for (let i = entries.length - 1; i >= prev.tail.length - 1; i--) {
          if (tailEq(entries, i, prev.tail)) { anchor = i; break; }
        }
        fresh = anchor >= 0 ? entries.slice(anchor + 1) : [];
      }
      next[shell] = { tail: entries.slice(-3).map((e) => e.cmd) };

      fresh.forEach((e, k) => {
        const cmd = redact(e.cmd.trim());
        if (!cmd) return;
        const ts = e.ts ?? now;
        events.push({
          // con timestamp l'id è stabile tra una raccolta e l'altra; senza, è unico per raccolta
          id: `terminal:${shell}:${hash(e.ts != null ? `${ts}:${cmd}` : `${ts}:${k}:${cmd}`)}`,
          source: 'terminal',
          kind: 'command',
          ts,
          title: cmd.slice(0, 500),
          detail: shell,
          url: null,
          meta: { shell, family: family(cmd), timed: e.ts != null },
        });
      });
    }
    return { events, cursor: next };
  },
};
