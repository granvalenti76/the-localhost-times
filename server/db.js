import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dayRange, dayKey } from './util.js';

/** The searchable text of a raw signal: titles, people, places — never more than the paper itself may read. */
function eventText(e) {
  const m = e.meta || {};
  const parts = [e.detail, m.host, m.fromName, m.from, m.folder, m.snippet, m.show, m.author, m.text, m.project, m.site]
    .filter((x) => typeof x === 'string' && x && x !== e.title);
  return [...new Set(parts)].join('\n');
}

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
      CREATE TABLE IF NOT EXISTS letters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        updated_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
    `);
    // the archive's full-text index: articles, evening editorials and raw signals
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(
        kind UNINDEXED, ref UNINDEXED, ts UNINDEXED, source UNINDEXED, title, body,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TABLE IF NOT EXISTS investigations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'published',
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scoops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        published_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
    `);
    // the newsroom's working material: questions to the editor, tips, long pieces, flashes,
    // the serial's episodes, the newsroom chatter (one table, told apart by `kind`)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '',
        ts INTEGER NOT NULL,
        ref TEXT,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS items_kind_ts ON items(kind, ts);
      CREATE INDEX IF NOT EXISTS items_ref ON items(kind, ref);
    `);
    // migration: edition status (draft / published)
    const cols = this.db.prepare(`PRAGMA table_info(editions)`).all().map((r) => r.name);
    if (!cols.includes('status')) {
      this.db.exec(`ALTER TABLE editions ADD COLUMN status TEXT NOT NULL DEFAULT 'published'`);
    }
  }

  /** Clear events, cursors and editions: the next collection rereads the last 24 hours. */
  reset() {
    this.db.exec('DELETE FROM events; DELETE FROM cursors; DELETE FROM editions; DELETE FROM evenings; DELETE FROM threads; DELETE FROM letters; DELETE FROM search; DELETE FROM leads; DELETE FROM scoops; DELETE FROM items;');
  }

  insertEvents(events) {
    if (!events.length) return 0;
    const st = this.db.prepare(
      `INSERT OR IGNORE INTO events (id, source, kind, ts, title, detail, url, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const idx = this.db.prepare(`INSERT INTO search (kind, ref, ts, source, title, body) VALUES ('event', ?, ?, ?, ?, ?)`);
    let added = 0;
    this.db.exec('BEGIN');
    try {
      for (const e of events) {
        if (!Number.isFinite(e.ts)) continue;
        const n = Number(
          st.run(e.id, e.source, e.kind, e.ts, e.title ?? null, e.detail ?? null, e.url ?? null,
            JSON.stringify(e.meta ?? {})).changes
        );
        if (n) idx.run(e.id, e.ts, e.source, e.title ?? '', eventText(e));
        added += n;
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

  /** Raw events older than `before` are deleted: the editions written from them stay. */
  /** One event removed (a dispatch the Editor withdrew), with its entry in the archive's index. */
  deleteEvent(id) {
    this.db.prepare(`DELETE FROM search WHERE kind = 'event' AND ref = ?`).run(id);
    return Number(this.db.prepare(`DELETE FROM events WHERE id = ?`).run(id).changes);
  }

  pruneEvents(before) {
    this.db.prepare(`DELETE FROM search WHERE kind = 'event' AND ts < ?`).run(before);
    return Number(this.db.prepare(`DELETE FROM events WHERE ts < ?`).run(before).changes);
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

  // ── Settings (editorial line) ──
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

  // ── Photos (preview image cache) ──
  getPhoto(pageUrl) {
    return this.db.prepare(`SELECT * FROM photos WHERE page_url = ?`).get(pageUrl) || null;
  }

  savePhoto(p) {
    this.db
      .prepare(`INSERT OR REPLACE INTO photos (page_url, image_url, file, host, ok, at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(p.pageUrl, p.imageUrl ?? null, p.file ?? null, p.host ?? null, p.ok ? 1 : 0, Date.now());
  }

  /** The other pages using the same image (used to recognize the site logo). */
  imageUsers(imageUrl, exceptPage) {
    return this.db
      .prepare(`SELECT page_url FROM photos WHERE image_url = ? AND page_url != ?`)
      .all(imageUrl, exceptPage)
      .map((r) => r.page_url);
  }

  // ── Evening edition ──
  saveEvening(ev) {
    this.db
      .prepare(`INSERT OR REPLACE INTO evenings (day, status, created_at, payload) VALUES (?, ?, ?, ?)`)
      .run(ev.day, ev.status || 'published', ev.createdAt, JSON.stringify(ev));
    this.indexEvening(ev);
  }

  getEvening(day) {
    const r = this.db.prepare(`SELECT payload FROM evenings WHERE day = ?`).get(day);
    return r ? JSON.parse(r.payload) : null;
  }

  // ── Letters to the editor ──
  addLetter(letter) {
    const r = this.db
      .prepare(`INSERT INTO letters (ts, status, payload) VALUES (?, 'pending', ?)`)
      .run(letter.ts, JSON.stringify(letter));
    return { ...letter, id: Number(r.lastInsertRowid), status: 'pending' };
  }

  saveLetter(letter) {
    this.db.prepare(`UPDATE letters SET status = ?, payload = ? WHERE id = ?`).run(letter.status, JSON.stringify(letter), letter.id);
  }

  getLetter(id) {
    const r = this.db.prepare(`SELECT id, status, payload FROM letters WHERE id = ?`).get(id);
    return r ? { ...JSON.parse(r.payload), id: r.id, status: r.status } : null;
  }

  letters({ status, limit = 50 } = {}) {
    return this.db
      .prepare(`SELECT id, status, payload FROM letters ${status ? 'WHERE status = ?' : ''} ORDER BY ts DESC LIMIT ?`)
      .all(...(status ? [status, limit] : [limit]))
      .map((r) => ({ ...JSON.parse(r.payload), id: r.id, status: r.status }));
  }

  // ── Editorial meetings ──
  getThread(id) {
    const r = this.db.prepare(`SELECT payload FROM threads WHERE id = ?`).get(id);
    return r ? JSON.parse(r.payload) : { id, messages: [] };
  }

  saveThread(t) {
    this.db
      .prepare(`INSERT OR REPLACE INTO threads (id, updated_at, payload) VALUES (?, ?, ?)`)
      .run(t.id, Date.now(), JSON.stringify(t));
  }

  // ── Editions ──
  saveEdition(ed) {
    this.db
      .prepare(`INSERT OR REPLACE INTO editions (id, start_ts, end_ts, final, created_at, payload, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(ed.id, ed.start, ed.end, ed.final ? 1 : 0, ed.createdAt, JSON.stringify(ed), ed.status || 'published');
    this.indexEdition(ed);
  }

  // ── The archive's index ──
  indexEdition(ed) {
    this.db.prepare(`DELETE FROM search WHERE kind = 'article' AND ref LIKE ?`).run(`${ed.id}/%`);
    const ins = this.db.prepare(`INSERT INTO search (kind, ref, ts, source, title, body) VALUES ('article', ?, ?, ?, ?, ?)`);
    for (const a of ed.articles || []) {
      ins.run(`${ed.id}/${a.id}`, a.last ?? ed.start, a.source ?? '', a.headline ?? '', [a.kicker, a.dek, ...(a.body || [])].filter(Boolean).join('\n'));
    }
  }

  indexEvening(ev) {
    this.db.prepare(`DELETE FROM search WHERE kind = 'evening' AND ref = ?`).run(ev.day);
    this.db.prepare(`INSERT INTO search (kind, ref, ts, source, title, body) VALUES ('evening', ?, ?, '', ?, ?)`)
      .run(ev.day, ev.createdAt, ev.editorial.headline, [ev.editorial.oneliner, ...ev.editorial.body].filter(Boolean).join('\n'));
  }

  /** Build the index from scratch (first run after an upgrade, or after a reset). */
  reindex() {
    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM search');
      const idx = this.db.prepare(`INSERT INTO search (kind, ref, ts, source, title, body) VALUES ('event', ?, ?, ?, ?, ?)`);
      for (const r of this.db.prepare(`SELECT * FROM events`).iterate()) {
        const e = { ...r, meta: JSON.parse(r.meta || '{}') };
        idx.run(e.id, e.ts, e.source, e.title ?? '', eventText(e));
      }
      for (const r of this.db.prepare(`SELECT payload FROM editions`).iterate()) this.indexEdition(JSON.parse(r.payload));
      for (const r of this.db.prepare(`SELECT payload FROM evenings`).iterate()) this.indexEvening(JSON.parse(r.payload));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** True when there is something to search but the index is empty. */
  needsReindex() {
    const has = (sql) => !!this.db.prepare(sql).get();
    return !has(`SELECT 1 FROM search LIMIT 1`) && (has(`SELECT 1 FROM events LIMIT 1`) || has(`SELECT 1 FROM editions LIMIT 1`));
  }

  /** The edition that covers a moment (its window contains ts), published or not. */
  editionAt(ts) {
    const r = this.db.prepare(`SELECT id FROM editions WHERE start_ts <= ? AND end_ts > ? ORDER BY start_ts DESC LIMIT 1`).get(ts, ts);
    return r?.id ?? null;
  }

  // ── Investigations ──
  saveInvestigation(inv) {
    if (inv.id) {
      this.db.prepare(`UPDATE investigations SET status = ?, payload = ? WHERE id = ?`).run(inv.status || 'published', JSON.stringify(inv), inv.id);
      return inv;
    }
    const r = this.db.prepare(`INSERT INTO investigations (created_at, status, payload) VALUES (?, ?, ?)`)
      .run(inv.createdAt, inv.status || 'published', JSON.stringify(inv));
    const saved = { ...inv, id: Number(r.lastInsertRowid) };
    this.db.prepare(`UPDATE investigations SET payload = ? WHERE id = ?`).run(JSON.stringify(saved), saved.id);
    return saved;
  }

  getInvestigation(id) {
    const r = this.db.prepare(`SELECT payload FROM investigations WHERE id = ?`).get(id);
    return r ? JSON.parse(r.payload) : null;
  }

  investigations(limit = 50) {
    return this.db.prepare(`SELECT payload FROM investigations ORDER BY created_at DESC LIMIT ?`).all(limit).map((r) => JSON.parse(r.payload));
  }

  deleteInvestigation(id) {
    this.db.prepare(`DELETE FROM investigations WHERE id = ?`).run(id);
  }

  // ── Spotlight: leads being worked on, and the scoops they became ──
  saveLead(lead) {
    this.db.prepare(`INSERT INTO leads (id, status, updated_at, payload) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, payload = excluded.payload`)
      .run(lead.id, lead.status, lead.updatedAt, JSON.stringify(lead));
    return lead;
  }

  getLead(id) {
    const r = this.db.prepare(`SELECT payload FROM leads WHERE id = ?`).get(id);
    return r ? JSON.parse(r.payload) : null;
  }

  leads({ status = null, limit = 200 } = {}) {
    const rows = status
      ? this.db.prepare(`SELECT payload FROM leads WHERE status IN (${status.map(() => '?').join(',')}) ORDER BY updated_at DESC LIMIT ?`).all(...status, limit)
      : this.db.prepare(`SELECT payload FROM leads ORDER BY updated_at DESC LIMIT ?`).all(limit);
    return rows.map((r) => JSON.parse(r.payload));
  }

  deleteLeads(before, statuses) {
    return Number(this.db.prepare(`DELETE FROM leads WHERE updated_at < ? AND status IN (${statuses.map(() => '?').join(',')})`).run(before, ...statuses).changes);
  }

  saveScoop(s) {
    if (s.id) {
      this.db.prepare(`UPDATE scoops SET payload = ? WHERE id = ?`).run(JSON.stringify(s), s.id);
      return s;
    }
    const r = this.db.prepare(`INSERT INTO scoops (published_at, payload) VALUES (?, ?)`).run(s.publishedAt, JSON.stringify(s));
    const saved = { ...s, id: Number(r.lastInsertRowid) };
    this.db.prepare(`UPDATE scoops SET payload = ? WHERE id = ?`).run(JSON.stringify(saved), saved.id);
    return saved;
  }

  getScoop(id) {
    const r = this.db.prepare(`SELECT payload FROM scoops WHERE id = ?`).get(id);
    return r ? JSON.parse(r.payload) : null;
  }

  scoops({ before = null, after = null, limit = 50 } = {}) {
    return this.db.prepare(`SELECT payload FROM scoops WHERE published_at < ? AND published_at >= ? ORDER BY published_at DESC LIMIT ?`)
      .all(before ?? 8.64e15, after ?? 0, limit).map((r) => JSON.parse(r.payload));
  }

  // ── Items: the newsroom's working material ──
  /** Insert (no id) or update (with id) an item; returns it with its id. */
  saveItem(item) {
    const ts = item.ts ?? Date.now();
    if (item.id) {
      this.db.prepare(`UPDATE items SET status = ?, ts = ?, ref = ?, payload = ? WHERE id = ? AND kind = ?`)
        .run(item.status || '', ts, item.ref ?? null, JSON.stringify(item), item.id, item.kind);
      return item;
    }
    const r = this.db.prepare(`INSERT INTO items (kind, status, ts, ref, payload) VALUES (?, ?, ?, ?, ?)`)
      .run(item.kind, item.status || '', ts, item.ref ?? null, JSON.stringify({ ...item, ts }));
    const saved = { ...item, ts, id: Number(r.lastInsertRowid) };
    this.db.prepare(`UPDATE items SET payload = ? WHERE id = ?`).run(JSON.stringify(saved), saved.id);
    return saved;
  }

  getItem(kind, id) {
    const r = this.db.prepare(`SELECT payload FROM items WHERE id = ? AND kind = ?`).get(Number(id), kind);
    return r ? JSON.parse(r.payload) : null;
  }

  /** Items of a kind, newest first; filters: status (string or list), ref, after/before (ts). */
  items(kind, { status = null, ref = null, after = null, before = null, limit = 100, oldest = false } = {}) {
    const sql = ['kind = ?'];
    const args = [kind];
    const st = status == null ? null : [].concat(status);
    if (st) { sql.push(`status IN (${st.map(() => '?').join(',')})`); args.push(...st); }
    if (ref != null) { sql.push('ref = ?'); args.push(ref); }
    if (after != null) { sql.push('ts >= ?'); args.push(after); }
    if (before != null) { sql.push('ts < ?'); args.push(before); }
    return this.db.prepare(`SELECT payload FROM items WHERE ${sql.join(' AND ')} ORDER BY ts ${oldest ? 'ASC' : 'DESC'}, id ${oldest ? 'ASC' : 'DESC'} LIMIT ?`)
      .all(...args, limit).map((r) => JSON.parse(r.payload));
  }

  deleteItem(kind, id) {
    this.db.prepare(`DELETE FROM items WHERE id = ? AND kind = ?`).run(Number(id), kind);
  }

  /** Keep only the newest `keep` items of a kind. */
  trimItems(kind, keep) {
    this.db.prepare(`DELETE FROM items WHERE kind = ? AND id NOT IN (SELECT id FROM items WHERE kind = ? ORDER BY ts DESC, id DESC LIMIT ?)`).run(kind, kind, keep);
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

  /** End of the last hourly edition closing by `limit` (excluding `exceptId`). */
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
