/**
 * npm run probe    → check sources and permissions, show the schemas (no contents)
 * npm run collect  → collect the signals once
 * npm run print [-- --hours 6] → print the editions of the last N hours
 * npm run rebuild [-- --hours 12] → wipe and reprint (after a newsroom update)
 * npm run photos [-- --hours 4] → trace the photo search for recent pages
 * npm run notify:test → send a test notification
 * npm run tip -- "…" → a tip for the newsroom (the tip box)
 * npm run history [-- --days 365] → read the past the Mac keeps, print the last days, write the Year in Review
 * npm run recall -- "…" → what was that thing? (pages come back with their links)
 * npm run standup [-- --week] [--copy] → the standup, written by itself
 */
import { loadConfig } from './config.js';
import { Store } from './db.js';
import { SOURCES } from './sources/index.js';
import { collectAll, sourceStatus } from './collect.js';
import { createNewsroom } from './newsroom/scheduler.js';
import { connectLLM, llmStatus } from './newsroom/llm.js';
import { journalCandidates, inspectJournalDb } from './sources/journal.js';
import { withSnapshot, tables, columns, hourStart, hhmm, isSelfUrl } from './util.js';
import { buildStories } from './newsroom/cluster.js';
import { candidatePages, photoForPage } from './newsroom/photos.js';
import { createNotifier } from './notify.js';
import { tr } from './i18n.js';
import { importHistory } from './history.js';
import { recall } from './newsroom/recall.js';
import { standup } from './newsroom/standup.js';

const config = loadConfig();
const cmd = process.argv[2];
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};

const ICON = { ok: '✓', denied: '⛔', missing: '·', error: '✗', disabled: '–' };

async function probe() {
  console.log(tr({ en: '\nThe Localhost Times — source check\n', it: '\nThe Localhost Times — controllo delle fonti\n' }));
  for (const s of SOURCES) {
    const loc = s.locate();
    console.log(`${ICON[loc.state] || '?'} ${s.label.padEnd(10)} ${loc.state.padEnd(8)} ${loc.file}`);
    if (loc.state === 'ok' && process.argv.includes('--schema')) {
      try {
        withSnapshot(loc.file, (db) => {
          for (const t of tables(db).slice(0, 40)) console.log(`      ${t}: ${columns(db, t).join(', ')}`);
        });
      } catch (e) { console.log(`      (${tr({ en: 'schema not readable', it: 'schema non leggibile' })}: ${e.message})`); }
    }
  }
  const j = journalCandidates();
  console.log(tr({ en: `\nJournal (experimental): ${j.dirs.length} candidate folders, ${j.files.length} databases`, it: `\nJournal (sperimentale): ${j.dirs.length} cartelle candidate, ${j.files.length} database` }));
  for (const d of j.dirs) console.log(`   dir  ${d}`);
  for (const f of j.files.slice(0, 20)) {
    let info = '';
    try {
      info = withSnapshot(f, (db) => {
        const s = inspectJournalDb(db);
        const t = tables(db).filter((x) => !x.startsWith('sqlite_') && !x.startsWith('Z_')).slice(0, 15);
        return s ? `→ table ${s.table} (date: ${s.date}, title: ${s.title}, text: ${s.text})` : `→ tables: ${t.join(', ')}`;
      });
    } catch (e) { info = `(${e.message})`; }
    console.log(`   db   ${f}\n        ${info}`);
  }
  const llm = await connectLLM(config);
  console.log(tr({
    en: `\nWriter (${llm?.base || config.llm.baseUrl}): ${llm ? `online, model ${llm.model}` : `offline → automatic typesetting will be used\n   reason: ${llmStatus.error}`}`,
    it: `\nRedattore (${llm?.base || config.llm.baseUrl}): ${llm ? `online, modello ${llm.model}` : `offline → userò la tipografia automatica\n   motivo: ${llmStatus.error}`}`,
  }));
  if ([...SOURCES].some((s) => s.locate().state === 'denied')) {
    console.log(tr({
      en: '\n⛔ Some sources are blocked by macOS. Open System Settings → Privacy & Security →\n   Full Disk Access, and enable the app you run Node from (Terminal, iTerm, VS Code…). Then restart it.',
      it: '\n⛔ Alcune fonti sono bloccate da macOS. Apri Impostazioni di Sistema → Privacy e sicurezza →\n   Accesso completo al disco, e abilita l\'app da cui lanci Node (Terminale, iTerm, VS Code…). Poi riavviala.',
    }));
  }
  console.log('');
}

const HINT = () => tr({
  en: { denied: 'blocked by macOS → needs Full Disk Access', missing: 'not found on this Mac', disabled: 'disabled in config.json' },
  it: { denied: 'bloccata da macOS → serve Accesso completo al disco', missing: 'non trovata su questo Mac', disabled: 'disattivata in config.json' },
});

function report() {
  console.log(tr({ en: '\nSources:', it: '\nFonti:' }));
  for (const s of Object.values(sourceStatus)) {
    const extra = s.state === 'ok' ? tr({ en: `${s.found} read, ${s.added} new`, it: `${s.found} letti, ${s.added} nuovi` }) : HINT()[s.state] || s.error || '';
    console.log(`  ${ICON[s.state] || '?'} ${s.label.padEnd(10)} ${extra}`);
  }
  const t = store_?.getCursor('terminal');
  if (sourceStatus.terminal?.state === 'ok' && t?.extra?.zsh && !sourceStatus.terminal.found) {
    console.log(tr({
      en: '\n  Note: the zsh history has no timestamps. Add to ~/.zshrc\n        setopt EXTENDED_HISTORY INC_APPEND_HISTORY\n  and open a new window: from then on every command has its time.',
      it: '\n  Nota: la cronologia zsh non ha orari. Aggiungi a ~/.zshrc\n        setopt EXTENDED_HISTORY INC_APPEND_HISTORY\n  e apri una nuova finestra: da lì in poi ogni comando avrà il suo orario.',
    }));
  }
  if (Object.values(sourceStatus).some((s) => s.state === 'denied')) {
    console.log(tr({
      en: '\n⛔ System Settings → Privacy & Security → Full Disk Access:\n   enable the app you run npm from (Terminal, iTerm, VS Code…), then quit and reopen it.',
      it: '\n⛔ Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco:\n   abilita l\'app da cui lanci npm (Terminale, iTerm, VS Code…), poi chiudila e riaprila.',
    }));
  }
  console.log('');
}

let store_ = null;

/** npm run tip -- "text": a tip for the newsroom (to the running paper, or straight into the archive). */
async function tip() {
  const text = process.argv.slice(3).filter((a) => !a.startsWith('--')).join(' ').trim();
  if (!text) {
    console.log(tr({ en: 'Usage: npm run tip -- "what the newsroom should know"', it: 'Uso: npm run tip -- "cosa deve sapere la redazione"' }));
    return;
  }
  try {
    const r = await fetch(`http://127.0.0.1:${config.port}/api/tips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Localhost-Times': '1' },
      body: JSON.stringify({ text, via: 'cli' }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch {
    // the paper isn't running: the tip waits in the archive for the next edition
    const { addTip } = await import('./newsroom/tips.js');
    addTip(new Store(config.dbFile), { text, via: 'cli' });
  }
  console.log(tr({ en: '✓ Tip in the box. It goes into the next edition.', it: '✓ Soffiata nella cassetta. Finisce nella prossima edizione.' }));
}

async function main() {
  if (cmd === 'probe') return probe();
  if (cmd === 'history') {
    const store = new Store(config.dbFile);
    await importHistory(store, config, { days: Number(arg('days', config.history?.days || 365)) });
    const newsroom = createNewsroom({ store, config });
    const printed = await newsroom.catchUp();
    console.log(tr({ en: `${printed.length} past editions printed. The Year in Review: http://localhost:${config.port}/#/year`, it: `${printed.length} edizioni arretrate stampate. L'Annuario: http://localhost:${config.port}/#/year` }));
    return;
  }
  if (cmd === 'recall') {
    const store = new Store(config.dbFile);
    const q = process.argv.slice(3).filter((a) => !a.startsWith('--')).join(' ');
    const r = await recall(store, config, q, { log: () => {} });
    if (r.mode === 'ask') { console.log(r.answer || r.note || ''); return; }
    if (r.answer) console.log(`${r.answer}\n`);
    if (!r.results.length) console.log(tr({ en: 'Nothing in the archive. Try other words, or another day.', it: 'Niente in archivio. Prova altre parole, o un altro giorno.' }));
    r.results.slice(0, 12).forEach((x, i) => console.log(`${String(i + 1).padStart(2)}. ${new Date(x.first).toLocaleString()}  ${x.title}${x.times > 1 ? `  ×${x.times}` : ''}\n    ${x.url || x.site || x.section}`));
    return;
  }
  if (cmd === 'standup') {
    const store = new Store(config.dbFile);
    const s = standup(store, config, { span: process.argv.includes('--week') ? 'week' : 'day', format: arg('format', 'markdown') });
    console.log(s.text);
    if (process.argv.includes('--copy')) {
      const { spawnSync } = await import('node:child_process');
      spawnSync('pbcopy', { input: s.text });
      console.log(tr({ en: '\n(copied)', it: '\n(copiato)' }));
    }
    return;
  }
  if (cmd === 'tip' || cmd === 'soffiata') return tip();
  if (cmd === 'notify') {
    const n = createNotifier({ ...config, demo: false, notifications: { ...config.notifications, enabled: true } }, console.log);
    if (!n.enabled) return console.log(tr({ en: 'Notifications work on macOS only.', it: 'Le notifiche funzionano solo su macOS.' }));
    n.test();
    const app = n.via === 'osascript' ? 'Script Editor' : 'terminal-notifier';
    return console.log(tr({
      en: `Sent (via ${n.via}). If nothing shows up: System Settings → Notifications → ${app} → Allow notifications.`,
      it: `Inviata (con ${n.via}). Se non compare nulla: Impostazioni di Sistema → Notifiche → ${app} → Consenti notifiche.`,
    }));
  }
  const store = new Store(config.dbFile);
  store_ = store;
  if (cmd === 'collect') {
    const n = await collectAll(store, config);
    report();
    console.log(tr({ en: `${n} new signals`, it: `${n} nuovi segnali` }));
    return;
  }
  if (cmd === 'photos') {
    const hours = Number(arg('hours', 3));
    const now = hourStart(Date.now());
    let ok = 0, tried = 0;
    for (let h = now - (hours - 1) * 3600e3; h <= now; h += 3600e3) {
      const evs = store.eventsBetween(h, h + 3600e3).filter((e) => !(e.source === 'safari' && isSelfUrl(e.url, config.port)));
      const pages = buildStories(evs).flatMap((s) => candidatePages(s));
      console.log(tr({ en: `\n${hhmm(h)}: ${pages.length} candidate pages`, it: `\nOre ${hhmm(h)}: ${pages.length} pagine candidate` }));
      for (const e of pages) {
        tried++;
        const notes = [];
        const file = await photoForPage(e.url, { store, config, force: process.argv.includes('--force'), trace: (m) => notes.push(m) });
        if (file) ok++;
        console.log(`  ${file ? '✓' : '✗'} ${e.url.slice(0, 90)}\n      ${notes.join(' · ')}`);
      }
    }
    console.log(tr({ en: `\n${ok} photos from ${tried} pages. Photos are kept in data/media.`, it: `\n${ok} foto su ${tried} pagine. Le foto stanno in data/media.` }));
    return;
  }
  if (cmd === 'rebuild') {
    store.reset();
    console.log(tr({ en: 'Paper wiped: re-reading the last 24 hours from the sources.', it: 'Giornale azzerato: rileggo le ultime 24 ore dalle fonti.' }));
  }
  if (cmd === 'print' || cmd === 'rebuild') {
    const newsroom = createNewsroom({ store, config });
    await newsroom.collect();
    report();
    const hours = Number(arg('hours', cmd === 'rebuild' ? 12 : 3));
    await newsroom.backfill(hours);
    const llm = await connectLLM(config);
    console.log(llm
      ? tr({ en: `Writer: ${llm.model} (${llm.base})\n`, it: `Redattore: ${llm.model} (${llm.base})\n` })
      : tr({ en: `Writer offline (${config.llm.baseUrl})\n   reason: ${llmStatus.error}\n`, it: `Redattore offline (${config.llm.baseUrl})\n   motivo: ${llmStatus.error}\n` }));
    const ed = await newsroom.printNow();
    console.log(ed
      ? tr({ en: `Edition ${ed.id}: ${ed.articles.length} articles — “${ed.articles[0]?.headline}”`, it: `Edizione ${ed.id}: ${ed.articles.length} articoli — «${ed.articles[0]?.headline}»` })
      : tr({ en: 'No events in the current hour.', it: 'Nessun evento nell\'ora corrente.' }));
    return;
  }
  console.log('Usage: node server/cli.js probe [--schema] | collect | print [--hours N] | rebuild [--hours N] | photos [--hours N] [--force] | notify | tip "…" | history [--days N] | recall "…" | standup [--week] [--copy]');
}

main().catch((e) => { console.error(e); process.exit(1); });
