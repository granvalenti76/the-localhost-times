import { tr } from './i18n.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const HOME = os.homedir();
export const home = (...p) => path.join(HOME, ...p);

// Core Data / NSDate: seconds since 2001-01-01 UTC
export const CD_EPOCH = 978307200;
export const cdToMs = (t) => (t == null ? null : Math.round((Number(t) + CD_EPOCH) * 1000));
export const msToCd = (ms) => ms / 1000 - CD_EPOCH;

export class PermissionError extends Error {
  constructor(file) {
    super(tr({
      en: `Access denied to ${file}. The app running Node (e.g. Terminal) needs "Full Disk Access".`,
      it: `Accesso negato a ${file}. Serve "Accesso completo al disco" per l'app che esegue Node (es. Terminale).`,
    }));
    this.file = file;
  }
}

const isDenied = (e) => e && (e.code === 'EPERM' || e.code === 'EACCES');

/** 'ok' | 'missing' | 'denied' */
export function fileState(file) {
  if (!file) return 'missing';
  try {
    fs.accessSync(file, fs.constants.R_OK);
    const fd = fs.openSync(file, 'r');
    fs.closeSync(fd);
    return 'ok';
  } catch (e) {
    if (isDenied(e)) return 'denied';
    return 'missing';
  }
}

export function listDir(dir) {
  try {
    return { state: 'ok', entries: fs.readdirSync(dir, { withFileTypes: true }) };
  } catch (e) {
    return { state: isDenied(e) ? 'denied' : 'missing', entries: [] };
  }
}

/** Find files matching `re` under `dir`, up to `depth` levels deep. */
export function findFiles(dir, re, depth = 1) {
  const out = [];
  let denied = false;
  const walk = (d, level) => {
    const { state, entries } = listDir(d);
    if (state === 'denied') denied = true;
    for (const ent of entries) {
      const p = path.join(d, ent.name);
      if (ent.isFile() && re.test(ent.name)) out.push(p);
      else if (ent.isDirectory() && level < depth) walk(p, level + 1);
    }
  };
  walk(dir, 1);
  return { files: out, denied };
}

export function newest(files) {
  let best = null, bestT = -1;
  for (const f of files) {
    try {
      const t = fs.statSync(f).mtimeMs;
      if (t > bestT) { best = f; bestT = t; }
    } catch { /* ignore */ }
  }
  return best;
}

/**
 * Copy a SQLite database (with -wal and -shm) to a temp folder and open it.
 * This way we never touch the original files or fight with the apps' locks.
 */
export function snapshot(file) {
  // Big databases (Mail's index can pass 500 MB) are not copied every five minutes: they are
  // opened read-only in place. SQLite in WAL mode (what Apple's apps use) lets a reader in while
  // the app writes, and a read-only connection can't change anything. Small ones are still copied.
  let size = 0;
  try { size = fs.statSync(file).size; } catch (e) { if (isDenied(e)) throw new PermissionError(file); }
  if (size >= DIRECT_MIN) {
    try {
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        db.exec('PRAGMA busy_timeout = 3000');
        db.prepare('SELECT count(*) FROM sqlite_master').get();
        return { db, direct: true, close() { try { db.close(); } catch { /* ignore */ } } };
      } catch (e) {
        try { db.close(); } catch { /* ignore */ }
        throw e;
      }
    } catch (e) {
      if (isDenied(e)) throw new PermissionError(file);
      // anything else (an unusual journal mode, a lock): fall back to the copy
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailymac-'));
  const base = path.join(dir, 'db.sqlite');
  try {
    fs.copyFileSync(file, base);
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    if (isDenied(e)) throw new PermissionError(file);
    throw e;
  }
  for (const ext of ['-wal', '-shm']) {
    try { fs.copyFileSync(file + ext, base + ext); } catch { /* optional */ }
  }
  const db = new DatabaseSync(base);
  return {
    db,
    direct: false,
    close() {
      try { db.close(); } catch { /* ignore */ }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Databases at least this big are read in place instead of copied. */
export const DIRECT_MIN = Number(process.env.LOCALHOST_TIMES_DIRECT_MIN) || 16 * 1024 * 1024;

/**
 * A fingerprint of a database and its WAL: if it hasn't changed since the last collection,
 * there's nothing new to read. null when it can't be told (not a file, no access).
 */
export function fingerprint(files) {
  const parts = [];
  for (const f of files) {
    for (const x of [f, `${f}-wal`]) {
      try {
        const st = fs.statSync(x);
        if (x === f && !st.isFile()) return null;
        parts.push(`${st.size}:${Math.round(st.mtimeMs)}`);
      } catch (e) {
        if (x === f) return null;
        parts.push('-');
      }
    }
  }
  return parts.length ? parts.join('|') : null;
}

export function withSnapshot(file, fn) {
  const s = snapshot(file);
  try { return fn(s.db); } finally { s.close(); }
}

export const tables = (db) =>
  db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);
export const columns = (db, table) =>
  db.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name);
export const pick = (cols, cands) => cands.find((c) => cols.includes(c));

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

/** The paper's own pages (localhost / 127.0.0.1 on the paper's port). */
export function isSelfUrl(url, port) {
  try {
    const u = new URL(url);
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname)) return false;
    return String(u.port || (u.protocol === 'https:' ? 443 : 80)) === String(port);
  } catch { return false; }
}

export function isBlockedHost(host, blocked = []) {
  return blocked.some((d) => host === d || host.endsWith('.' + d));
}

export const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

export function hourStart(ms) {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

const pad = (n) => String(n).padStart(2, '0');
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const editionId = (ms) => `${dayKey(ms)}T${pad(new Date(ms).getHours())}`;
export function hhmm(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function dayRange(day) {
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const end = new Date(y, m - 1, d + 1).getTime();
  return [start, end];
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
