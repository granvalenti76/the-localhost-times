import fs from 'node:fs';
import path from 'node:path';
import { setLang } from './i18n.js';

export const ROOT = path.resolve(import.meta.dirname, '..');

const DEFAULTS = {
  port: 4321,
  host: '127.0.0.1',     // only this Mac can open the paper; '0.0.0.0' to share it on your network
  language: 'en',        // 'en' | 'it': the language the paper is written in
  demo: false,
  llm: {
    baseUrl: 'auto',      // 'auto' finds Ollama, LM Studio or llama.cpp on this Mac; or a URL ending in /v1; or '' for none
    model: '',
    apiKey: '',
    timeoutMs: 300000,   // per request, from the moment it actually starts
    concurrency: 1,      // parallel requests to the model (1 = queued, suits local servers)
    temperature: 0.7,
    thinking: false,
  },
  collectEveryMinutes: 5,
  backfillHours: 1,
  keepEventsDays: 60,    // raw signals are kept this long (editions are kept forever); 0 = forever
  sources: {
    safari: true, mail: true, terminal: true, notes: true,
    journal: true, podcasts: true, books: true, files: true,
    apps: true, power: true, photos: true,
  },
  apps: {
    sampleSeconds: 60,   // how often the app in front is noted (one tiny command each time)
    exclude: [],         // apps never recorded, e.g. ["Messages", "WhatsApp"]
  },
  photos: {
    library: '',         // another Photos library (empty = ~/Pictures/Photos Library.photoslibrary)
  },
  files: {
    folders: [],         // folders to watch (empty = Desktop, Documents, Downloads, Work, Developer, Projects, Code…)
    exclude: [],         // parts of paths to leave out, e.g. "Documents/Medical"
    includeNames: false, // true = file names in the paper (otherwise only folders, types and counts)
  },
  privacy: {
    blockedDomains: [],
    blockedMailSenders: [],
    blockedNoteFolders: [],
    mailIncludeSummary: false,
    notesIncludeSnippet: true,
    journalIncludeText: false,
  },
  edition: {
    maxArticles: 9,
    minEvents: 8,        // below this threshold the hour merges into the next edition
    maxMergeHours: 3,    // at most three hours in a single edition
    eveningHour: 21,     // the evening edition comes out at this hour (null to disable it)
  },
  radio: {
    enabled: true,       // the hourly bulletin read aloud by the Mac's voice (macOS only)
    voice: '',           // a voice from `say -v '?'`; empty = one that speaks the paper's language
    rate: 180,           // words per minute
  },
  notifications: {
    enabled: true,       // macOS notification when a new edition is out
    sound: false,
  },
  spotlight: {
    enabled: true,       // the Spotlight desk: leads followed across days, scoops when they hold up
    replyMinutes: 60,    // the owner's right of reply before a scoop goes to press (0 = no wait)
    goal: 70,            // how strong a lead must be (0-100) before the desk weighs it
  },
};

function merge(base, over) {
  // `null` is a real value (e.g. eveningHour: null = no evening edition); only a missing key keeps the default
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = k in base ? merge(base[k], v) : v;
  }
  return out;
}

/** The default settings (a fresh copy), optionally merged with overrides: used by the tests. */
export const defaultConfig = (over = {}) => merge(structuredClone(DEFAULTS), over);

const env = (name) => process.env[`LOCALHOST_TIMES_${name}`] ?? process.env[`DAILYMAC_${name}`]; // DAILYMAC_* = old names

export function loadConfig() {
  let user = {};
  const file = path.join(ROOT, 'config.json');
  if (fs.existsSync(file)) {
    try {
      user = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`\n✗ config.json is not valid JSON: ${e.message}\n  Fix it, or delete it and run "npm run setup" to create a new one.\n`);
      process.exit(1);
    }
  }
  const cfg = merge(DEFAULTS, user);
  if (env('DEMO') === '1' || process.argv.includes('--demo')) cfg.demo = true;
  if (env('LLM_URL')) cfg.llm.baseUrl = env('LLM_URL');
  if (env('LLM_MODEL')) cfg.llm.model = env('LLM_MODEL');
  if (env('LANG')) cfg.language = env('LANG');
  if (process.env.PORT) cfg.port = Number(process.env.PORT);
  cfg.language = setLang(cfg.language);
  cfg.dataDir = path.join(ROOT, 'data');
  // the database was called dailymac.sqlite before the paper had its name: keep using it if it exists
  const legacy = path.join(cfg.dataDir, 'dailymac.sqlite');
  cfg.dbFile = cfg.demo ? path.join(cfg.dataDir, 'demo.sqlite') : fs.existsSync(legacy) ? legacy : path.join(cfg.dataDir, 'localhost-times.sqlite');
  return cfg;
}
