import { tr } from '../i18n.js';
import { home, findFiles, newest, withSnapshot, columns, pick, cdToMs, msToCd, fileState } from '../util.js';

const BASE = home('Library/Containers/com.apple.iBooksX/Data/Documents');

function locate() {
  const lib = findFiles(BASE + '/BKLibrary', /^BKLibrary.*\.sqlite$/, 1);
  const ann = findFiles(BASE + '/AEAnnotation', /^AEAnnotation.*\.sqlite$/, 1);
  const library = newest(lib.files);
  const annotations = newest(ann.files);
  if (library) return { file: library, annotations, state: fileState(library) };
  return { file: BASE + '/BKLibrary/BKLibrary-*.sqlite', state: lib.denied ? 'denied' : 'missing' };
}

export default {
  id: 'books',
  get label() { return tr({ en: 'Books', it: 'Libri' }); },
  locate,

  collect({ since }) {
    const { file, annotations } = locate();
    const books = new Map();
    const events = [];

    withSnapshot(file, (db) => {
      const c = columns(db, 'ZBKLIBRARYASSET');
      const opened = pick(c, ['ZLASTOPENDATE', 'ZLASTENGAGEDDATE']);
      const progress = c.includes('ZREADINGPROGRESS') ? 'ZREADINGPROGRESS' : 'NULL';
      const genre = c.includes('ZGENRE') ? 'ZGENRE' : 'NULL';
      for (const r of db.prepare(`SELECT ZASSETID AS id, ZTITLE AS title, ZAUTHOR AS author, ${genre} AS genre FROM ZBKLIBRARYASSET`).all()) {
        books.set(r.id, r);
      }
      if (!opened) return;
      const rows = db
        .prepare(`SELECT ZASSETID AS id, ZTITLE AS title, ZAUTHOR AS author, ${genre} AS genre,
                         ${opened} AS opened, ${progress} AS progress
                  FROM ZBKLIBRARYASSET WHERE ${opened} > ? ORDER BY ${opened}`)
        .all(msToCd(since));
      for (const r of rows) {
        events.push({
          id: `books:open:${r.id}:${Math.round(r.opened)}`,
          source: 'books',
          kind: 'opened',
          ts: cdToMs(r.opened),
          title: r.title || tr({ en: 'Untitled book', it: 'Libro senza titolo' }),
          detail: r.author || null,
          url: null,
          meta: { assetId: r.id, author: r.author, genre: r.genre, progress: r.progress },
        });
      }
    });

    if (annotations) {
      try {
        withSnapshot(annotations, (db) => {
          const c = columns(db, 'ZAEANNOTATION');
          const created = pick(c, ['ZANNOTATIONCREATIONDATE', 'ZANNOTATIONMODIFICATIONDATE']);
          if (!created) return;
          const del = c.includes('ZANNOTATIONDELETED') ? 'AND (ZANNOTATIONDELETED IS NULL OR ZANNOTATIONDELETED = 0)' : '';
          const note = c.includes('ZANNOTATIONNOTE') ? 'ZANNOTATIONNOTE' : 'NULL';
          const rows = db
            .prepare(`SELECT Z_PK AS pk, ZANNOTATIONASSETID AS asset, ZANNOTATIONSELECTEDTEXT AS text,
                             ${note} AS note, ${created} AS created
                      FROM ZAEANNOTATION
                      WHERE ${created} > ? AND ZANNOTATIONSELECTEDTEXT IS NOT NULL ${del}
                      ORDER BY ${created}`)
            .all(msToCd(since));
          for (const r of rows) {
            const b = books.get(r.asset) || {};
            events.push({
              id: `books:hl:${r.pk}`,
              source: 'books',
              kind: 'highlight',
              ts: cdToMs(r.created),
              title: b.title || 'Libro',
              detail: b.author || null,
              url: null,
              meta: { assetId: r.asset, author: b.author, text: String(r.text).slice(0, 500), note: r.note },
            });
          }
        });
      } catch { /* annotations are optional */ }
    }
    return { events };
  },
};
