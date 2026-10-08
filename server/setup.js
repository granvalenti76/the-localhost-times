/**
 * npm run setup — a guided first run.
 * Picks the language, finds (or asks for) the writer model, checks the macOS permissions,
 * writes config.json and says what to do next. Safe to run again: it keeps your other settings.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { ROOT } from './config.js';
import { setLang, tr } from './i18n.js';
import { findLocalServer, connectLLM, llmStatus } from './newsroom/llm.js';
import { SOURCES } from './sources/index.js';

const file = path.join(ROOT, 'config.json');
const B = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const OK = (s) => `\x1b[32m${s}\x1b[0m`;
const WARN = (s) => `\x1b[33m${s}\x1b[0m`;

if (!process.stdin.isTTY) {
  console.log('npm run setup is interactive: run it in a Terminal window. Or copy config.example.json to config.json and edit it.');
  process.exit(1);
}

let current = {};
if (fs.existsSync(file)) {
  try {
    current = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    console.log(WARN('config.json is not valid JSON: it will be replaced.'));
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, def = '') => {
  const a = (await rl.question(`${q}${def ? DIM(` [${def}]`) : ''} `)).trim();
  return a || def;
};
const yes = async (q, def = true) => /^(y|yes|s|si|sì)$/i.test(await ask(`${q} ${def ? '(Y/n)' : '(y/N)'}`, def ? 'y' : 'n'));

console.log(`\n${B('The Localhost Times')} — setup\n`);

// 1. language
const sysLang = Intl.DateTimeFormat().resolvedOptions().locale.startsWith('it') ? 'it' : 'en';
let language = (await ask('Language of the paper / Lingua del giornale: en | it', current.language || sysLang)).toLowerCase();
if (!['en', 'it'].includes(language)) language = 'en';
setLang(language);

// 2. the writer
console.log(`\n${B(tr({ en: '1. The writer', it: '1. Il redattore' }))}`);
console.log(tr({
  en: 'Articles are written by a language model running on your own machine or network (any OpenAI-compatible server:\nOllama, LM Studio, llama.cpp…). Without one, the automatic typesetting writes plainer articles from templates.',
  it: 'Gli articoli li scrive un modello linguistico sul tuo computer o in rete locale (qualsiasi server OpenAI-compatibile:\nOllama, LM Studio, llama.cpp…). Senza, la tipografia automatica scrive articoli più semplici, a modelli fissi.',
}));
process.stdout.write(DIM(tr({ en: 'Looking for a local model… ', it: 'Cerco un modello locale… ' })));
const found = await findLocalServer();
console.log(found ? OK(`${found.name} → ${found.model || '?'} (${found.base})`) : tr({ en: 'none found.', it: 'nessuno trovato.' }));

const llm = { ...(current.llm || {}) };
if (found) {
  const keepAuto = await yes(tr({ en: `Use ${found.name}? (it will be found automatically every time)`, it: `Uso ${found.name}? (verrà trovato automaticamente ogni volta)` }));
  llm.baseUrl = keepAuto ? 'auto' : '';
}
if (!found || llm.baseUrl !== 'auto') {
  console.log(DIM(tr({
    en: 'Examples: http://192.168.1.20:8080/v1 (another computer) · http://127.0.0.1:11434/v1 (Ollama) · "none"',
    it: 'Esempi: http://192.168.1.20:8080/v1 (un altro computer) · http://127.0.0.1:11434/v1 (Ollama) · "none"',
  })));
  const def = current.llm?.baseUrl && current.llm.baseUrl !== 'auto' ? current.llm.baseUrl : 'none';
  let url = await ask(tr({ en: 'Address of the model server:', it: 'Indirizzo del server del modello:' }), def);
  if (url !== 'none' && !/^https?:\/\//.test(url)) url = `http://${url}`;
  if (url !== 'none' && !/\/v1\/?$/.test(url)) {
    if (await yes(tr({ en: `Add /v1 at the end (${url.replace(/\/$/, '')}/v1)?`, it: `Aggiungo /v1 in fondo (${url.replace(/\/$/, '')}/v1)?` }))) url = `${url.replace(/\/$/, '')}/v1`;
  }
  llm.baseUrl = url === 'none' ? '' : url;
}
if (llm.baseUrl) {
  process.stdout.write(DIM(tr({ en: 'Testing… ', it: 'Provo… ' })));
  const c = await connectLLM({ llm: { ...llm } });
  if (c) console.log(OK(tr({ en: `✓ ${c.model} answers.`, it: `✓ ${c.model} risponde.` })));
  else {
    console.log(WARN(`✗ ${llmStatus.error}`));
    console.log(tr({
      en: 'Saved anyway: the paper keeps trying, and uses the typesetting until the model answers.',
      it: 'Lo salvo comunque: il giornale continua a provare e usa la tipografia finché il modello non risponde.',
    }));
  }
}

// 3. notifications
console.log(`\n${B(tr({ en: '2. Notifications', it: '2. Notifiche' }))}`);
const notify = await yes(tr({ en: 'A macOS notification when a new edition is out?', it: 'Una notifica di macOS quando esce una nuova edizione?' }), current.notifications?.enabled ?? true);

// 4. write config.json
const next = { ...current, language, llm, notifications: { ...(current.notifications || {}), enabled: notify } };
fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
console.log(`\n${OK('✓')} ${tr({ en: 'Saved', it: 'Salvato' })} ${path.relative(process.cwd(), file) || file}`);

// 5. permissions
console.log(`\n${B(tr({ en: '3. Permissions', it: '3. Permessi' }))}`);
if (process.platform !== 'darwin') {
  console.log(WARN(tr({ en: 'This is not a Mac: only the demo will work (npm run demo).', it: 'Questo non è un Mac: funzionerà solo la demo (npm run demo).' })));
} else {
  const states = SOURCES.map((s) => ({ s, st: s.locate().state }));
  for (const { s, st } of states) {
    const mark = st === 'ok' ? OK('✓') : st === 'denied' ? WARN('⛔') : DIM('·');
    console.log(`  ${mark} ${s.label.padEnd(10)} ${DIM(st)}`);
  }
  if (states.some((x) => x.st === 'denied')) {
    console.log(tr({
      en: `\nmacOS protects these apps' data. Open ${B('System Settings → Privacy & Security → Full Disk Access')},\nturn on the app you are using now (Terminal, iTerm, VS Code…), then quit and reopen it.`,
      it: `\nmacOS protegge i dati di queste app. Apri ${B('Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco')},\nattiva l'app che stai usando (Terminale, iTerm, VS Code…), poi chiudila e riaprila.`,
    }));
    if (await yes(tr({ en: 'Open that settings page now?', it: 'Apro adesso quella pagina delle impostazioni?' }))) {
      execFile('/usr/bin/open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'], () => {});
    }
  } else {
    console.log(OK(tr({ en: 'All readable sources are accessible.', it: 'Tutte le fonti presenti sono leggibili.' })));
  }
}

// 6. next steps
console.log(`\n${B(tr({ en: 'Ready.', it: 'Pronto.' }))} ${tr({ en: 'Next:', it: 'Adesso:' })}
  npm start                  ${DIM(tr({ en: 'the paper → http://localhost:4321', it: 'il giornale → http://localhost:4321' }))}
  npm run service:install    ${DIM(tr({ en: 'or: start it at every login, in the background', it: 'oppure: avvialo a ogni accesso, in background' }))}
  npm run demo               ${DIM(tr({ en: 'a demo with invented data', it: 'una demo con dati inventati' }))}
`);
rl.close();
