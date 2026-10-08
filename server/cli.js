/**
 * npm run probe    → controlla fonti e permessi, mostra gli schemi (senza contenuti)
 * npm run collect  → raccoglie i segnali una volta
 * npm run print [-- --hours 6] → stampa le edizioni delle ultime N ore
 * npm run rebuild [-- --hours 12] → azzera e ristampa (dopo un aggiornamento della redazione)
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

const config = loadConfig();
const cmd = process.argv[2];
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};

const ICON = { ok: '✓', denied: '⛔', missing: '·', error: '✗', disabled: '–' };

async function probe() {
  console.log('\nThe Localhost Times — controllo delle fonti\n');
  for (const s of SOURCES) {
    const loc = s.locate();
    console.log(`${ICON[loc.state] || '?'} ${s.label.padEnd(10)} ${loc.state.padEnd(8)} ${loc.file}`);
    if (loc.state === 'ok' && process.argv.includes('--schema')) {
      try {
        withSnapshot(loc.file, (db) => {
          for (const t of tables(db).slice(0, 40)) console.log(`      ${t}: ${columns(db, t).join(', ')}`);
        });
      } catch (e) { console.log(`      (schema non leggibile: ${e.message})`); }
    }
  }
  const j = journalCandidates();
  console.log(`\nJournal (sperimentale): ${j.dirs.length} cartelle candidate, ${j.files.length} database`);
  for (const d of j.dirs) console.log(`   dir  ${d}`);
  for (const f of j.files.slice(0, 20)) {
    let info = '';
    try {
      info = withSnapshot(f, (db) => {
        const s = inspectJournalDb(db);
        const t = tables(db).filter((x) => !x.startsWith('sqlite_') && !x.startsWith('Z_')).slice(0, 15);
        return s ? `→ tabella ${s.table} (data: ${s.date}, titolo: ${s.title}, testo: ${s.text})` : `→ tabelle: ${t.join(', ')}`;
      });
    } catch (e) { info = `(${e.message})`; }
    console.log(`   db   ${f}\n        ${info}`);
  }
  const llm = await connectLLM(config);
  console.log(`\nRedattore (${config.llm.baseUrl}): ${llm ? `online, modello ${llm.model}` : `offline → userò la tipografia automatica\n   motivo: ${llmStatus.error}`}`);
  if ([...SOURCES].some((s) => s.locate().state === 'denied')) {
    console.log('\n⛔ Alcune fonti sono bloccate da macOS. Apri Impostazioni di Sistema → Privacy e sicurezza →');
    console.log('   Accesso completo al disco, e abilita l\'app da cui lanci Node (Terminale, iTerm, VS Code…). Poi riavviala.');
  }
  console.log('');
}

const HINT = {
  denied: 'bloccata da macOS → serve Accesso completo al disco',
  missing: 'non trovata su questo Mac',
  disabled: 'disattivata in config.json',
};

function report() {
  console.log('\nFonti:');
  for (const s of Object.values(sourceStatus)) {
    const extra = s.state === 'ok' ? `${s.found} letti, ${s.added} nuovi` : HINT[s.state] || s.error || '';
    console.log(`  ${ICON[s.state] || '?'} ${s.label.padEnd(10)} ${extra}`);
  }
  const t = store_?.getCursor('terminal');
  if (sourceStatus.terminal?.state === 'ok' && t?.extra?.zsh && !sourceStatus.terminal.found) {
    console.log('\n  Nota: la cronologia zsh non ha orari. Aggiungi a ~/.zshrc');
    console.log('        setopt EXTENDED_HISTORY INC_APPEND_HISTORY');
    console.log('  e apri una nuova finestra: da lì in poi ogni comando avrà il suo orario.');
  }
  if (Object.values(sourceStatus).some((s) => s.state === 'denied')) {
    console.log('\n⛔ Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco:');
    console.log('   abilita l\'app da cui lanci npm (Terminale, iTerm, VS Code…), poi chiudila e riaprila.');
  }
  console.log('');
}

let store_ = null;

async function main() {
  if (cmd === 'probe') return probe();
  if (cmd === 'notify') {
    const n = createNotifier({ ...config, demo: false, notifications: { ...config.notifications, enabled: true } }, console.log);
    if (!n.enabled) return console.log('Notifications work on macOS only.');
    n.test();
    return console.log(`Sent (via ${n.via}). If nothing shows up: System Settings → Notifications → ${n.via === 'osascript' ? 'Script Editor' : 'terminal-notifier'} → Allow.`);
  }
  const store = new Store(config.dbFile);
  store_ = store;
  if (cmd === 'collect') {
    const n = await collectAll(store, config);
    report();
    console.log(`${n} nuovi segnali`);
    return;
  }
  if (cmd === 'photos') {
    const hours = Number(arg('hours', 3));
    const now = hourStart(Date.now());
    let ok = 0, tried = 0;
    for (let h = now - (hours - 1) * 3600e3; h <= now; h += 3600e3) {
      const evs = store.eventsBetween(h, h + 3600e3).filter((e) => !(e.source === 'safari' && isSelfUrl(e.url, config.port)));
      const pages = buildStories(evs).flatMap((s) => candidatePages(s));
      console.log(`\nOre ${hhmm(h)}: ${pages.length} pagine candidate`);
      for (const e of pages) {
        tried++;
        const notes = [];
        const file = await photoForPage(e.url, { store, config, force: process.argv.includes('--force'), trace: (m) => notes.push(m) });
        if (file) ok++;
        console.log(`  ${file ? '✓' : '✗'} ${e.url.slice(0, 90)}\n      ${notes.join(' · ')}`);
      }
    }
    console.log(`\n${ok} foto su ${tried} pagine. Le foto stanno in data/media.`);
    return;
  }
  if (cmd === 'rebuild') {
    store.reset();
    console.log('Giornale azzerato: rileggo le ultime 24 ore dalle fonti.');
  }
  if (cmd === 'print' || cmd === 'rebuild') {
    const newsroom = createNewsroom({ store, config });
    await newsroom.collect();
    report();
    const hours = Number(arg('hours', cmd === 'rebuild' ? 12 : 3));
    await newsroom.backfill(hours);
    const llm = await connectLLM(config);
    console.log(llm ? `Redattore: ${llm.model} (${config.llm.baseUrl})\n` : `Redattore offline (${config.llm.baseUrl})\n   motivo: ${llmStatus.error}\n`);
    const ed = await newsroom.printNow();
    console.log(ed ? `Edizione ${ed.id}: ${ed.articles.length} articoli — «${ed.articles[0]?.headline}»` : 'Nessun evento nell\'ora corrente.');
    return;
  }
  console.log('Uso: node server/cli.js probe [--schema] | collect | print [--hours N] | rebuild [--hours N] | photos [--hours N] [--force]');
}

main().catch((e) => { console.error(e); process.exit(1); });
