/**
 * Reminders: what was ticked off and what was added, from the Reminders app's stores
 * (one database per account). A ticked reminder is the smallest piece of news there is,
 * and the most satisfying. Delicate titles become "a private reminder".
 */
import fs from 'node:fs';
import path from 'node:path';
import { tr } from '../i18n.js';
import { home, fileState, withSnapshot, tables, columns, pick, cdToMs, msToCd, hash } from '../util.js';
import { isSensitive } from '../newsroom/spotlight/detectors.js';

const DIR = home('Library/Group Containers/group.com.apple.reminders/Container_v1/Stores');

function stores() {
  try {
    return fs.readdirSync(DIR).filter((f) => /^Data-.*\.sqlite$/.test(f)).map((f) => path.join(DIR, f))
      .filter((f) => { try { return fs.statSync(f).size > 0; } catch { return false; } });
  } catch { return []; }
}

function locate() {
  const list = stores();
  if (list.length) return { file: list[0], state: fileState(list[0]) };
  return { file: DIR, state: fileState(DIR) === 'ok' ? 'missing' : fileState(DIR) };
}

const publicTitle = (t) => (isSensitive(t) ? tr({ en: 'A private reminder', it: 'Un promemoria privato' }) : String(t).trim().slice(0, 160));

export default {
  id: 'reminders',
  get label() { return tr({ en: 'Reminders', it: 'Promemoria' }); },
  experimental: true,
  fingerprint: false,
  locate,

  async collect({ since }) {
    const events = [];
    for (const file of stores()) {
      const part = await withSnapshot(file, (db) => {
        if (!tables(db).includes('ZREMCDREMINDER')) return [];
        const c = columns(db, 'ZREMCDREMINDER');
        const title = pick(c, ['ZTITLE']);
        const done = pick(c, ['ZCOMPLETIONDATE']);
        const created = pick(c, ['ZCREATIONDATE']);
        if (!title || (!done && !created)) return [];
        const del = c.includes('ZMARKEDFORDELETION') ? 'AND (r.ZMARKEDFORDELETION IS NULL OR r.ZMARKEDFORDELETION = 0)' : '';
        const hasList = c.includes('ZLIST') && tables(db).includes('ZREMCDBASELIST') && columns(db, 'ZREMCDBASELIST').includes('ZNAME');
        const s = msToCd(since);
        const rows = db.prepare(
          `SELECT r.Z_PK AS pk, r.${title} AS title, ${done ? `r.${done}` : 'NULL'} AS done, ${created ? `r.${created}` : 'NULL'} AS created,
                  ${hasList ? 'l.ZNAME' : 'NULL'} AS list
           FROM ZREMCDREMINDER r ${hasList ? 'LEFT JOIN ZREMCDBASELIST l ON l.Z_PK = r.ZLIST' : ''}
           WHERE r.${title} IS NOT NULL AND (${done ? `r.${done} > ?` : '0'} OR ${created ? `r.${created} > ?` : '0'}) ${del}`
        ).all(...[done ? s : null, created ? s : null].filter((x) => x != null));
        const out = [];
        const store = hash(file);
        for (const r of rows) {
          const list = r.list && !isSensitive(r.list) ? r.list : null;
          if (r.done != null && cdToMs(r.done) > since) {
            out.push({ id: `reminders:${store}:${r.pk}:done`, source: 'reminders', kind: 'done', ts: cdToMs(r.done), title: publicTitle(r.title), detail: list, url: null, meta: { list } });
          }
          if (r.created != null && cdToMs(r.created) > since) {
            out.push({ id: `reminders:${store}:${r.pk}:added`, source: 'reminders', kind: 'added', ts: cdToMs(r.created), title: publicTitle(r.title), detail: list, url: null, meta: { list } });
          }
        }
        return out;
      });
      events.push(...part);
    }
    return { events: events.sort((a, b) => a.ts - b.ts) };
  },
};
