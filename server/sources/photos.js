/**
 * The photographer: photos, videos and screenshots, counted. From the Photos library (photos
 * taken on the iPhone arrive through iCloud) and from Spotlight (screenshots taken on the Mac).
 * Never the pictures, never where they were taken, never file names: only what kind of shot,
 * when, and whether it was marked as a favourite.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tr } from '../i18n.js';
import { home, fileState, withSnapshot, tables, columns, pick, cdToMs, msToCd, hash } from '../util.js';

const run = promisify(execFile);
const MDFIND = process.env.LOCALHOST_TIMES_MDFIND || '/usr/bin/mdfind';
const HOUR = 3600e3;

/** The system Photos library (another one can be set with photos.library in config.json). */
function libraryPath(config) {
  const custom = config?.photos?.library;
  const lib = custom ? (custom.startsWith('~') ? home(custom.slice(1)) : custom) : home('Pictures/Photos Library.photoslibrary');
  return path.join(lib, 'database', 'Photos.sqlite');
}

let lastConfig = null;

function locate() {
  const file = libraryPath(lastConfig);
  const state = fileState(file);
  // without a Photos library the Mac's own screenshots are still counted
  if (state === 'missing' && process.platform === 'darwin' && fs.existsSync(MDFIND)) return { file, state: 'ok', noLibrary: true };
  return { file, state };
}

// Photos' kind subtypes (stable across recent macOS versions)
const SUBTYPE = { 1: 'panorama', 2: 'live', 10: 'screenshot', 100: 'video', 101: 'slomo', 102: 'timelapse', 103: 'screen-recording' };

const TITLES = {
  photo: { en: 'Photo', it: 'Foto' },
  video: { en: 'Video', it: 'Video' },
  screenshot: { en: 'Screenshot', it: 'Screenshot' },
  'mac-screenshot': { en: 'Screenshot on the Mac', it: 'Screenshot sul Mac' },
  imported: { en: 'Imported into Photos', it: 'Importata in Foto' },
};

function fromLibrary(file, since) {
  return withSnapshot(file, (db) => {
    const table = ['ZASSET', 'ZGENERICASSET'].find((t) => tables(db).includes(t));
    if (!table) throw new Error(tr({ en: 'Unrecognised Photos schema', it: 'Schema di Foto non riconosciuto' }));
    const c = columns(db, table);
    const created = pick(c, ['ZDATECREATED']);
    const added = pick(c, ['ZADDEDDATE', 'ZDATECREATED']);
    if (!created) throw new Error(tr({ en: 'Unrecognised Photos schema', it: 'Schema di Foto non riconosciuto' }));
    const col = (name, fallback = 'NULL') => (c.includes(name) ? name : fallback);
    // only these columns: never the location, the file name or the faces
    const rows = db.prepare(
      `SELECT Z_PK AS pk, ${created} AS created, ${added} AS added, ${col('ZKIND', '0')} AS kind,
              ${col('ZKINDSUBTYPE', '0')} AS subtype, ${col('ZFAVORITE', '0')} AS favorite, ${col('ZDURATION', '0')} AS duration
       FROM ${table}
       WHERE ${added} > ? ${c.includes('ZTRASHEDSTATE') ? 'AND ZTRASHEDSTATE = 0' : ''} ${c.includes('ZHIDDEN') ? 'AND ZHIDDEN = 0' : ''}
       ORDER BY ${added} LIMIT 2000`,
    ).all(msToCd(since));
    return rows.map((r) => {
      const createdMs = cdToMs(r.created);
      const addedMs = cdToMs(r.added);
      // old pictures arriving now (an import, a shared album): news of the import, not of the shot
      const imported = addedMs - createdMs > 6 * HOUR;
      const sub = SUBTYPE[r.subtype] || null;
      const what = imported ? 'imported' : sub === 'screenshot' || sub === 'screen-recording' ? 'screenshot' : r.kind === 1 ? 'video' : 'photo';
      return {
        id: `photos:${r.pk}`,
        source: 'photos',
        kind: what,
        ts: imported ? addedMs : createdMs,
        title: tr(TITLES[what]),
        detail: null,
        url: null,
        meta: { subtype: sub, favorite: !!r.favorite, seconds: r.kind === 1 ? Math.round(r.duration || 0) : null, added: addedMs },
      };
    });
  });
}

async function macScreenshots(since) {
  if (process.platform !== 'darwin' || !fs.existsSync(MDFIND)) return [];
  const secs = Math.max(60, Math.ceil((Date.now() - since) / 1000));
  let out = '';
  try {
    ({ stdout: out } = await run(MDFIND, [`kMDItemIsScreenCapture == 1 && kMDItemFSCreationDate >= $time.now(-${secs})`], { maxBuffer: 16 * 1024 * 1024, timeout: 20000 }));
  } catch {
    return [];
  }
  const events = [];
  for (const p of out.split('\n').filter(Boolean).slice(0, 300)) {
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    const ts = st.birthtimeMs || st.mtimeMs;
    if (ts <= since) continue;
    events.push({
      id: `photos:mac:${hash(p)}`,
      source: 'photos',
      kind: 'screenshot',
      ts,
      title: tr(TITLES['mac-screenshot']),
      detail: null,
      url: null,
      meta: { subtype: /\.mov$/i.test(p) ? 'screen-recording' : 'screenshot', mac: true },
    });
  }
  return events;
}

export default {
  id: 'photos',
  get label() { return tr({ en: 'Photos', it: 'Foto' }); },
  locate() {
    return locate();
  },
  everyMinutes: 15, // the library can be big: a look every quarter of an hour
  fingerprint: false, // the Mac's screenshots are not in the library: always look

  async collect({ since, cursor, config }) {
    lastConfig = config;
    const loc = locate();
    // the library is read by the date pictures were added (iCloud brings iPhone shots late)
    const addedSince = cursor?.added ?? since;
    const lib = loc.noLibrary ? [] : fromLibrary(loc.file, addedSince);
    const mac = await macScreenshots(since);
    const added = lib.reduce((m, e) => Math.max(m, e.meta.added || 0), addedSince);
    return { events: [...lib, ...mac], cursor: { added } };
  },
};

export { libraryPath };
