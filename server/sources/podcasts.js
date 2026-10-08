import path from 'node:path';
import { home, listDir, fileState, withSnapshot, columns, pick, cdToMs, msToCd } from '../util.js';

const GROUPS = home('Library/Group Containers');

function locate() {
  const { state, entries } = listDir(GROUPS);
  if (state !== 'ok') return { file: GROUPS + '/…podcasts/Documents/MTLibrary.sqlite', state };
  const dir = entries.find((e) => e.isDirectory() && /groups\.com\.apple\.podcasts$/.test(e.name));
  if (!dir) return { file: GROUPS + '/…podcasts/Documents/MTLibrary.sqlite', state: 'missing' };
  const file = path.join(GROUPS, dir.name, 'Documents', 'MTLibrary.sqlite');
  return { file, state: fileState(file) };
}

export default {
  id: 'podcasts',
  label: 'Podcast',
  locate,

  collect({ since }) {
    const { file } = locate();
    return withSnapshot(file, (db) => {
      const ec = columns(db, 'ZMTEPISODE');
      const pc = columns(db, 'ZMTPODCAST');
      const played = pick(ec, ['ZLASTDATEPLAYED', 'ZLASTUSERINTERACTEDDATE']);
      if (!played) throw new Error('Schema Podcast non riconosciuto');
      const playhead = ec.includes('ZPLAYHEAD') ? 'e.ZPLAYHEAD' : 'NULL';
      const duration = ec.includes('ZDURATION') ? 'e.ZDURATION' : 'NULL';
      const author = pc.includes('ZAUTHOR') ? 'p.ZAUTHOR' : 'NULL';
      const desc = pick(ec, ['ZITEMDESCRIPTIONWITHOUTHTML', 'ZITEMDESCRIPTION']);
      const rows = db
        .prepare(
          `SELECT e.Z_PK AS pk, e.ZTITLE AS title, e.${played} AS played, ${playhead} AS playhead,
                  ${duration} AS duration, p.ZTITLE AS show, ${author} AS author
                  ${desc ? `, e.${desc} AS description` : ''}
           FROM ZMTEPISODE e LEFT JOIN ZMTPODCAST p ON p.Z_PK = e.ZPODCAST
           WHERE e.${played} > ? ORDER BY e.${played}`
        )
        .all(msToCd(since));
      const events = rows.map((r) => ({
        id: `podcasts:${r.pk}:${Math.round(r.played)}`,
        source: 'podcasts',
        kind: 'listened',
        ts: cdToMs(r.played),
        title: r.title || 'Episodio senza titolo',
        detail: r.show || null,
        url: null,
        meta: {
          episodeId: r.pk,
          show: r.show,
          author: r.author,
          playhead: r.playhead ?? null,
          duration: r.duration ?? null,
          description: r.description ? String(r.description).replace(/<[^>]+>/g, '').slice(0, 400) : null,
        },
      }));
      return { events };
    });
  },
};
