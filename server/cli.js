/**
 * npm run probe    → controlla fonti e permessi, mostra gli schemi (senza contenuti)
 * npm run collect  → raccoglie i segnali una volta
 * npm run print [-- --hours 6] → stampa le edizioni delle ultime N ore
 */
import { loadConfig } from './config.js';
import { Store } from './db.js';
import { SOURCES } from './sources/index.js';
import { collectAll, sourceStatus } from './collect.js';
import { createNewsroom } from './newsroom/scheduler.js';
import { connectLLM } from './newsroom/llm.js';
import { journalCandidates, inspectJournalDb } from './sources/journal.js';
import { withSnapshot, tables, columns } from './util.js';

const config = loadConfig();
const cmd = process.argv[2];
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};

const ICON = { ok: '✓', denied: '⛔', missing: '·', error: '✗', disabled: '–' };

async function probe() {
  console.log('\nThe Daily Mac — controllo delle fonti\n');
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
  console.log(`\nRedattore (${config.llm.baseUrl}): ${llm ? `online, modello ${llm.model}` : 'offline → userò la tipografia automatica'}`);
  if ([...SOURCES].some((s) => s.locate().state === 'denied')) {
    console.log('\n⛔ Alcune fonti sono bloccate da macOS. Apri Impostazioni di Sistema → Privacy e sicurezza →');
    console.log('   Accesso completo al disco, e abilita l\'app da cui lanci Node (Terminale, iTerm, VS Code…). Poi riavviala.');
  }
  console.log('');
}

async function main() {
  if (cmd === 'probe') return probe();
  const store = new Store(config.dbFile);
  if (cmd === 'collect') {
    const n = await collectAll(store, config);
    console.table(Object.values(sourceStatus).map(({ label, state, found, added, error }) => ({ label, state, found, added, error })));
    console.log(`${n} nuovi segnali`);
    return;
  }
  if (cmd === 'print') {
    const newsroom = createNewsroom({ store, config });
    await newsroom.collect();
    const hours = Number(arg('hours', 3));
    await newsroom.backfill(hours);
    const ed = await newsroom.printNow();
    console.log(ed ? `Edizione ${ed.id}: ${ed.articles.length} articoli — «${ed.articles[0]?.headline}»` : 'Nessun evento nell\'ora corrente.');
    return;
  }
  console.log('Uso: node server/cli.js probe [--schema] | collect | print [--hours N]');
}

main().catch((e) => { console.error(e); process.exit(1); });
