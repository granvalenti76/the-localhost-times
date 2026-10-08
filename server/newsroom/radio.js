/**
 * The radio bulletin: every edition read aloud in about a minute by the Mac's own voice
 * (`say`, then `afconvert` to AAC: both built into macOS). The bulletins are served at
 * /radio/<edition>.m4a and as a podcast feed at /radio.xml.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tr, lang } from '../i18n.js';
import { hhmm } from '../util.js';

const run = promisify(execFile);
// macOS tools (overridable, for the tests)
const SAY = process.env.LOCALHOST_TIMES_SAY || '/usr/bin/say';
const AFCONVERT = process.env.LOCALHOST_TIMES_AFCONVERT || '/usr/bin/afconvert';
const AFINFO = process.env.LOCALHOST_TIMES_AFINFO || '/usr/bin/afinfo';
const KEEP = 72; // bulletins kept on disk (three days of hours)

export const radioDir = (config) => path.join(config.dataDir, 'radio');
export const radioAvailable = () => fs.existsSync(SAY) && fs.existsSync(AFCONVERT);

/** Text for the ear: no quotation marks, no ellipses, no URLs; "[[slnc 500]]" is a pause for `say`. */
const spoken = (s) => String(s || '')
  .replace(/[«»“”"„]/g, '')
  .replace(/https?:\/\/\S+/g, '')
  .replace(/…/g, '.')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/([^.!?])$/, '$1.');

const PAUSE = ' [[slnc 450]] ';

/** The bulletin's script, from the printed edition. */
export function radioScript(ed) {
  const en = lang() === 'en';
  const at = hhmm(ed.hour ?? ed.start);
  const next = hhmm((ed.hour ?? ed.start) + 2 * 3600e3);
  const [lead, ...rest] = ed.articles || [];
  const parts = [en ? `The Localhost Times. The ${at} news.` : `The Localhost Times. Il giornale radio delle ${at}.`];
  if (lead) {
    parts.push(`${en ? 'Leading the news.' : 'In apertura.'} ${spoken(lead.headline)}`);
    if (lead.dek) parts.push(spoken(lead.dek));
  }
  if (rest.length) parts.push(`${en ? 'Also in this edition.' : 'Nelle altre notizie.'} ${rest.slice(0, 4).map((a) => spoken(a.headline)).join(PAUSE)}`);
  if (ed.summary) parts.push(`${en ? 'The Brief.' : 'Il punto.'} ${spoken(ed.summary)}`);
  if (ed.market?.comment) parts.push(`${en ? 'On the website market.' : 'In Borsa.'} ${spoken(ed.market.comment)}`);
  parts.push(en ? `That's all. The next bulletin at ${next}.` : `È tutto. Il prossimo giornale radio alle ${next}.`);
  return parts.join(PAUSE);
}

const PREFERRED = { en: ['Samantha', 'Daniel', 'Karen', 'Moira', 'Serena', 'Alex'], it: ['Alice', 'Federica', 'Paola', 'Luca', 'Emma'] };

/** A voice that speaks the paper's language (the system default if none is found). */
async function pickVoice() {
  try {
    const { stdout } = await run(SAY, ['-v', '?'], { timeout: 5000 });
    const voices = stdout.split('\n').map((l) => /^(.+?)\s{2,}([a-z]{2})[_-][A-Za-z]{2}/.exec(l)).filter(Boolean).map((m) => ({ name: m[1].trim(), lang: m[2] }));
    const mine = voices.filter((v) => v.lang === lang());
    for (const p of PREFERRED[lang()] || []) if (mine.some((v) => v.name === p)) return p;
    return mine[0]?.name || null;
  } catch {
    return null;
  }
}

/** Record the bulletin of an edition. Returns { file, duration, voice } or null. */
export async function recordBulletin(ed, config, log = console.log) {
  if (!config.radio?.enabled || !radioAvailable()) return null;
  const dir = radioDir(config);
  fs.mkdirSync(dir, { recursive: true });
  const base = ed.id.replace(/[^\w-]/g, '-');
  const txt = path.join(os.tmpdir(), `lt-${base}.txt`);
  const aiff = path.join(os.tmpdir(), `lt-${base}.aiff`);
  const out = path.join(dir, `${base}.m4a`);
  fs.writeFileSync(txt, radioScript(ed));
  try {
    const voice = config.radio.voice || (await pickVoice());
    const args = [...(voice ? ['-v', voice] : []), '-r', String(config.radio.rate || 180), '-o', aiff, '-f', txt];
    await run(SAY, args, { timeout: 120e3 });
    await run(AFCONVERT, ['-f', 'm4af', '-d', 'aac', aiff, out], { timeout: 120e3 });
    let duration = null;
    try {
      const { stdout } = await run(AFINFO, [out], { timeout: 10e3 });
      duration = Number((/estimated duration:\s*([\d.]+)/.exec(stdout) || [])[1]) || null;
    } catch { /* no duration */ }
    prune(dir);
    return { file: `${base}.m4a`, duration, voice, bytes: fs.statSync(out).size, at: Date.now() };
  } catch (e) {
    log(tr({ en: `[radio] ${e.message}`, it: `[radio] ${e.message}` }));
    return null;
  } finally {
    for (const f of [txt, aiff]) fs.rmSync(f, { force: true });
  }
}

function prune(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.m4a')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.rmSync(path.join(dir, f), { force: true });
}

const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

/** The podcast feed of the bulletins (subscribe to it in Podcasts: File → Follow a Show by URL). */
export function radioFeed(store, { base }) {
  const rows = store.db.prepare(`SELECT payload FROM editions WHERE status = 'published' ORDER BY start_ts DESC LIMIT 100`).all()
    .map((r) => JSON.parse(r.payload))
    .filter((e) => e.radio?.file)
    .slice(0, 48);
  const title = tr({ en: 'The Localhost Times — Radio', it: 'The Localhost Times — Giornale radio' });
  const desc = tr({ en: 'Your Mac\'s hourly news, read aloud. All the news that never left the machine.', it: 'Le notizie del tuo Mac, ogni ora, lette ad alta voce. Tutte le notizie che non hanno mai lasciato il computer.' });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${x(title)}</title>
  <link>${x(base)}/</link>
  <atom:link href="${x(base)}/radio.xml" rel="self" type="application/rss+xml"/>
  <description>${x(desc)}</description>
  <language>${lang()}</language>
  <itunes:author>The Localhost Times</itunes:author>
  <itunes:image href="${x(base)}/podcast-cover.png"/>
  <itunes:category text="News"/>
  <itunes:explicit>false</itunes:explicit>
${rows.map((e) => `  <item>
    <title>${x(tr({ en: `The ${hhmm(e.hour ?? e.start)} news`, it: `Giornale radio delle ${hhmm(e.hour ?? e.start)}` }))}${e.articles?.[0] ? ` — ${x(e.articles[0].headline)}` : ''}</title>
    <description>${x(e.summary || '')}</description>
    <enclosure url="${x(base)}/radio/${x(e.radio.file)}" length="${e.radio.bytes || 0}" type="audio/x-m4a"/>
    <guid isPermaLink="false">${x(e.id)}-${e.radio.at || ''}</guid>
    <pubDate>${new Date(e.radio.at || e.createdAt).toUTCString()}</pubDate>
    ${e.radio.duration ? `<itunes:duration>${dur(e.radio.duration)}</itunes:duration>` : ''}
  </item>`).join('\n')}
</channel>
</rss>
`;
}
