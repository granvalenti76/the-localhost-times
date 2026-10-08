/**
 * Journal (app Diario di Apple, macOS 26+).
 * Apple non documenta dove salva i dati: qui proviamo a scoprirlo da soli.
 * Cerchiamo database SQLite nei container dell'app e una tabella che assomigli
 * a una "entry" con una data. È SPERIMENTALE: `npm run probe` mostra cosa trova.
 */
import path from 'node:path';
import { home, listDir, findFiles, withSnapshot, tables, columns, cdToMs, msToCd } from '../util.js';

const ROOTS = [home('Library/Containers'), home('Library/Group Containers')];
const DB_RE = /\.(sqlite|store|db)$/i;

export function journalCandidates() {
  const dirs = [];
  let denied = false;
  for (const root of ROOTS) {
    const { state, entries } = listDir(root);
    if (state === 'denied') denied = true;
    for (const e of entries) {
      if (e.isDirectory() && /journal/i.test(e.name) && !/mail/i.test(e.name)) dirs.push(path.join(root, e.name));
    }
  }
  const files = [];
  for (const d of dirs) {
    const r = findFiles(d, DB_RE, 7);
    if (r.denied) denied = true;
    files.push(...r.files);
  }
  return { dirs, files, denied };
}

/** Trova tabella/colonne plausibili in un database. */
export function inspectJournalDb(db) {
  for (const t of tables(db)) {
    if (!/ENTRY|ENTRIES/i.test(t) || /ASSET|ATTACH|MEDIA|TAG/i.test(t)) continue;
    const cols = columns(db, t);
    const date = cols.find((c) => /(MODIF|UPDATE)/i.test(c) && /DATE|TIME/i.test(c))
      || cols.find((c) => /(ENTRYDATE|CREAT|DATE)/i.test(c));
    if (!date) continue;
    const title = cols.find((c) => /TITLE/i.test(c)) || null;
    const text = cols.find((c) => /(TEXT|BODY|CONTENT|SNIPPET|PLAIN)/i.test(c)) || null;
    return { table: t, date, title, text, cols };
  }
  return null;
}

export default {
  id: 'journal',
  label: 'Journal',
  experimental: true,
  locate() {
    const { files, denied, dirs } = journalCandidates();
    if (files.length) return { file: files[0], state: 'ok', files };
    if (denied && !dirs.length) return { file: ROOTS[0] + '/…journal…', state: 'denied' };
    return { file: ROOTS[0] + '/…journal…', state: denied ? 'denied' : 'missing' };
  },

  collect({ since, config }) {
    const { files } = journalCandidates();
    const events = [];
    for (const file of files) {
      let found;
      try {
        found = withSnapshot(file, (db) => {
          const s = inspectJournalDb(db);
          if (!s) return null;
          // Le date possono essere Core Data (secondi dal 2001) o Unix: decidiamo dal valore.
          const max = db.prepare(`SELECT MAX("${s.date}") AS m FROM "${s.table}"`).get().m;
          const isCoreData = typeof max === 'number' && max < 1.5e9 && max > 3e8;
          const sinceVal = isCoreData ? msToCd(since) : since / 1000;
          const rows = db
            .prepare(
              `SELECT Z_PK AS pk, "${s.date}" AS d
               ${s.title ? `, "${s.title}" AS title` : ''}
               ${s.text ? `, "${s.text}" AS text` : ''}
               FROM "${s.table}" WHERE "${s.date}" > ? ORDER BY "${s.date}"`
            )
            .all(sinceVal);
          return rows.map((r) => {
            const ts = isCoreData ? cdToMs(r.d) : Math.round(Number(r.d) * 1000);
            const text = typeof r.text === 'string' ? r.text : null;
            return {
              id: `journal:${path.basename(file)}:${r.pk}:${Math.round(r.d)}`,
              source: 'journal',
              kind: 'entry',
              ts,
              title: typeof r.title === 'string' && r.title.trim() ? r.title : null,
              detail: null,
              url: null,
              meta: {
                words: text ? text.trim().split(/\s+/).length : null,
                text: config.privacy.journalIncludeText && text ? text.slice(0, 1200) : null,
              },
            };
          });
        });
      } catch { found = null; }
      if (found) events.push(...found);
    }
    return { events };
  },
};
