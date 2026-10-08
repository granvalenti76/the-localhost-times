import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dayRange, dayKey } from './util.js';

export class Store {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        ts INTEGER NOT NULL,
        title TEXT,
        detail TEXT,
        url TEXT,
        meta TEXT
      );
      CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
      CREATE TABLE IF NOT EXISTS cursors (source TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS editions (
        id TEXT PRIMARY KEY,
        start_ts INTEGER NOT NULL,
        end_ts INTEGER NOT NULL,
        final INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS editions_start ON editions(start_ts);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS photos (
        page_url TEXT PRIMARY KEY,
        image_url TEXT,
        file TEXT,
        host TEXT,
        ok INTEGER NOT NULL DEFAULT 0,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS photos_image ON photos(image_url);
      CREATE TABLE IF NOT EXISTS evenings (
        day TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'published',
        created_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        updated_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
    `);
    // migrazione: stato dell'edizione (bozza / pubblicata)
    const cols = this.db.prepare(`PRAGMA table_info(editions)`).all().map((r) => r.name);
    if (!cols.includes('status')) {
      this.db.exec(`ALTER TABLE editions ADD COLUMN status TEXT NOT NULL DEFAULT 'published'`);
    }
  }

  /** Svuota eventi, cursori ed edizioni: la prossima raccolta rilegge le ultime 24 ore. */
  reset() {
    this.db.exec('DELETE FROM events; DELETE FROM cursors; DELETE FROM editions; DELETE FROM evenings; DELETE FROM threads;');
  }

  insertEvents(events) {
    if (!events.length) return 0;
    const st = this.db.prepare(
      `INSERT OR IGNORE INTO events (id, source, kind, ts, title, detail, url, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let added = 0;
    this.db.exec('BEGIN');
    try {
      for (const e of events) {
        if (!Number.isFinite(e.ts)) continue;
        added += Number(
          st.run(e.id, e.source, e.kind, e.ts, e.title ?? null, e.detail ?? null, e.url ?? null,
            JSON.stringify(e.meta ?? {})).changes
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return added;
  }

  eventsBetween(start, end) {
    return this.db
      .prepare(`SELECT * FROM events WHERE ts >= ? AND ts < ? ORDER BY ts`)
      .all(start, end)
      .map((r) => ({ ...r, meta: JSON.parse(r.meta || '{}') }));
  }

  eventTimesSince(start) {
    return this.db.prepare(`SELECT ts FROM events WHERE ts >= ?`).all(start).map((r) => r.ts);
  }

  countEvents() {
    return this.db.prepare(`SELECT source, COUNT(*) AS n FROM events GROUP BY source`).all();
  }

  getCursor(source) {
    const r = this.db.prepare(`SELECT value FROM cursors WHERE source = ?`).get(source);
    return r ? JSON.parse(r.value) : null;
  }

  setCursor(source, value) {
    this.db
      .prepare(`INSERT INTO cursors (source, value) VALUES (?, ?)
                ON CONFLICT(source) DO UPDATE SET value = excluded.value`)
      .run(source, JSON.stringify(value));
  }

  // ── Impostazioni (linea editoriale) ──
  getSetting(key, fallback = null) {
    const r = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    return r ? JSON.parse(r.value) : fallback;
  }

  setSetting(key, value) {
    this.db
      .prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(key, JSON.stringify(value));
  }

  // ── Foto (cache delle immagini di anteprima) ──
  getPhoto(pageUrl) {
    return this.db.prepare(`SELECT * FROM photos WHERE page_url = ?`).get(pageUrl) || null;
  }

  savePhoto(p) {
    this.db
      .prepare(`INSERT OR REPLACE INTO photos (page_url, image_url, file, host, ok, at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(p.pageUrl, p.imageUrl ?? null, p.file ?? null, p.host ?? null, p.ok ? 1 : 0, Date.now());
  }

  /** Le altre pagine che usano la stessa immagine (servono a riconoscere il logo del sito). */
  imageUsers(imageUrl, exceptPage) {
    return this.db
      .prepare(`SELECT page_url FROM photos WHERE image_url = ? AND page_url != ?`)
      .all(imageUrl, exceptPage)
      .map((r) => r.page_url);
  }

  // ── Edizione della sera ──
  saveEvening(ev) {
    this.db
      .prepare(`INSERT OR REPLACE INTO evenings (day, status, created_at, payload) VALUES (?, ?, ?, ?)`)
      .run(ev.day, ev.status || 'published', ev.createdAt, JSON.stringify(ev));
  }

  getEvening(day) {
    const r = this.db.prepare(`SELECT payload FROM evenings WHERE day = ?`).get(day);
    return r ? JSON.parse(r.payload) : null;
  }

  // ── Riunioni di redazione ──
  getThread(id) {
    const r = this.db.prepare(`SELECT payload FROM threads WHERE id = ?`).get(id);
    return r ? JSON.parse(r.payload) : { id, messages: [] };
  }

  saveThread(t) {
    this.db
      .prepare(`INSERT OR REPLACE INTO threads (id, updated_at, payload) VALUES (?, ?, ?)`)
      .run(t.id, Date.now(), JSON.stringify(t));
  }

  // ── Edizioni ──
  saveEdition(ed) {
    this.db
      .prepare(`INSERT OR REPLACE INTO editions (id, start_ts, end_ts, final, created_at, payload, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(ed.id, ed.start, ed.end, ed.final ? 1 : 0, ed.createdAt, JSON.stringify(ed), ed.status || 'published');
  }

  getEdition(id) {
    const r = this.db.prepare(`SELECT payload FROM editions WHERE id = ?`).get(id);
    return r ? JSON.parse(r.payload) : null;
  }

  editionMeta(id) {
    const r = this.db.prepare(`SELECT id, final, status, payload FROM editions WHERE id = ?`).get(id);
    if (!r) return null;
    const p = JSON.parse(r.payload);
    return { id: r.id, final: !!r.final, status: r.status, edited: !!p.edited };
  }

  /** Fine dell'ultima edizione oraria che chiude entro `limit` (esclusa `exceptId`). */
  lastEditionEnd(limit, exceptId) {
    const r = this.db.prepare(`SELECT MAX(end_ts) AS e FROM editions WHERE end_ts <= ? AND id != ?`).get(limit, exceptId || '');
    return r?.e ?? null;
  }

  latestEdition() {
    const r = this.db
      .prepare(`SELECT payload FROM editions WHERE status = 'published' ORDER BY start_ts DESC LIMIT 1`)
      .get();
    return r ? JSON.parse(r.payload) : null;
  }

  editionNumber(start) {
    return Number(this.db.prepare(`SELECT COUNT(*) AS n FROM editions WHERE start_ts < ?`).get(start).n) + 1;
  }

  editionsForDay(day, { full = false, drafts = false } = {}) {
    const [a, b] = dayRange(day);
    const rows = this.db
      .prepare(`SELECT payload FROM editions WHERE start_ts >= ? AND start_ts < ?
                ${drafts ? '' : `AND status = 'published'`} ORDER BY start_ts`)
      .all(a, b)
      .map((r) => JSON.parse(r.payload));
    if (full) return rows;
    return rows.map((e) => ({
      id: e.id,
      start: e.start,
      end: e.end,
      hour: e.hour ?? e.start,
      final: e.final,
      status: e.status || 'published',
      edited: !!e.edited,
      number: e.number,
      total: e.stats?.total ?? 0,
      lead: e.articles?.[0]?.headline ?? null,
    }));
  }

  drafts() {
    return this.db
      .prepare(`SELECT payload FROM editions WHERE status = 'draft' ORDER BY start_ts DESC LIMIT 24`)
      .all()
      .map((r) => {
        const e = JSON.parse(r.payload);
        return { id: e.id, start: e.start, hour: e.hour ?? e.start, total: e.stats?.total ?? 0, lead: e.articles?.[0]?.headline ?? null };
      });
  }

  days() {
    const rows = this.db.prepare(`SELECT start_ts FROM editions WHERE status = 'published' ORDER BY start_ts`).all();
    const set = new Map();
    for (const r of rows) {
      const k = dayKey(r.start_ts);
      set.set(k, (set.get(k) || 0) + 1);
    }
    return [...set.entries()].map(([day, count]) => ({ day, count }));
  }
}
