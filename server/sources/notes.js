import { tr } from '../i18n.js';
import { home, fileState, withSnapshot, columns, pick, cdToMs, msToCd } from '../util.js';

const FILE = home('Library/Group Containers/group.com.apple.notes/NoteStore.sqlite');
const T = 'ZICCLOUDSYNCINGOBJECT';

export default {
  id: 'notes',
  get label() { return tr({ en: 'Notes', it: 'Note' }); },
  locate: () => ({ file: FILE, state: fileState(FILE) }),

  collect({ since, config }) {
    const blockedFolders = (config.privacy.blockedNoteFolders || []).map((s) => s.toLowerCase());
    return withSnapshot(FILE, (db) => {
      const c = columns(db, T);
      const title = pick(c, ['ZTITLE1', 'ZTITLE']);
      const mod = pick(c, ['ZMODIFICATIONDATE1', 'ZMODIFICATIONDATE']);
      const created = pick(c, ['ZCREATIONDATE3', 'ZCREATIONDATE1', 'ZCREATIONDATE']);
      const folderTitle = pick(c, ['ZTITLE2', 'ZTITLE']);
      if (!title || !mod) throw new Error(tr({ en: `Unrecognised Notes schema (columns: ${c.slice(0, 12).join(', ')}…)`, it: `Schema Note non riconosciuto (colonne: ${c.slice(0, 12).join(', ')}…)` }));

      const snippet = c.includes('ZSNIPPET') ? 'n.ZSNIPPET' : 'NULL';
      const locked = c.includes('ZISPASSWORDPROTECTED') ? 'n.ZISPASSWORDPROTECTED' : '0';
      const delCond = c.includes('ZMARKEDFORDELETION') ? 'AND (n.ZMARKEDFORDELETION IS NULL OR n.ZMARKEDFORDELETION = 0)' : '';
      const noteCond = c.includes('ZNOTEDATA') ? 'AND n.ZNOTEDATA IS NOT NULL' : '';
      const folderJoin = c.includes('ZFOLDER') ? `LEFT JOIN ${T} f ON f.Z_PK = n.ZFOLDER` : '';
      const folderSel = c.includes('ZFOLDER') ? `f.${folderTitle} AS folder` : 'NULL AS folder';
      const folderType = c.includes('ZFOLDER') && c.includes('ZFOLDERTYPE') ? 'f.ZFOLDERTYPE AS ftype' : 'NULL AS ftype';

      const rows = db
        .prepare(
          `SELECT n.Z_PK AS pk, n.${title} AS title, n.${mod} AS mod,
                  ${created ? `n.${created}` : 'NULL'} AS created,
                  ${snippet} AS snippet, ${locked} AS locked, ${folderSel}, ${folderType}
           FROM ${T} n ${folderJoin}
           WHERE n.${title} IS NOT NULL AND n.${mod} > ? ${delCond} ${noteCond}
           ORDER BY n.${mod}`
        )
        .all(msToCd(since));

      const events = [];
      for (const r of rows) {
        if (r.ftype === 1) continue; // "Recently Deleted"
        if (r.folder && blockedFolders.includes(String(r.folder).toLowerCase())) continue;
        const ts = cdToMs(r.mod);
        const createdMs = cdToMs(r.created);
        const isNew = createdMs != null && createdMs > since && Math.abs(ts - createdMs) < 10 * 60e3;
        const showSnippet = config.privacy.notesIncludeSnippet && !r.locked && r.snippet;
        events.push({
          id: `notes:${r.pk}:${Math.round(r.mod)}`,
          source: 'notes',
          kind: isNew ? 'created' : 'edited',
          ts,
          title: r.title,
          detail: r.folder || null,
          url: null,
          meta: {
            noteId: r.pk,
            folder: r.folder || null,
            locked: !!r.locked,
            snippet: showSnippet ? String(r.snippet).slice(0, 600) : null,
          },
        });
      }
      return { events };
    });
  },
};
