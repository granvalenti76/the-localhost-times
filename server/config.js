import fs from 'node:fs';
import path from 'node:path';
import { setLang } from './i18n.js';

export const ROOT = path.resolve(import.meta.dirname, '..');

const DEFAULTS = {
  port: 4321,
  language: 'en',        // 'en' | 'it': the language the paper is written in
  demo: false,
  llm: {
    baseUrl: 'http://localhost:8080/v1',
    model: '',
    apiKey: '',
    timeoutMs: 300000,   // per richiesta, dal momento in cui parte davvero
    concurrency: 1,      // richieste al modello in parallelo (1 = in fila, adatto ai server locali)
    temperature: 0.7,
    thinking: false,
  },
  collectEveryMinutes: 5,
  backfillHours: 1,
  sources: {
    safari: true, mail: true, terminal: true, notes: true,
    journal: true, podcasts: true, books: true,
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
    minEvents: 8,        // sotto questa soglia l'ora confluisce nell'edizione successiva
    maxMergeHours: 3,    // al massimo tre ore in un'unica edizione
    eveningHour: 21,     // l'edizione della sera esce a quest'ora (null per disattivarla)
  },
  notifications: {
    enabled: true,       // macOS notification when a new edition is out
    sound: false,
  },
};

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = k in base ? merge(base[k], v) : v;
  }
  return out;
}

export function loadConfig() {
  let user = {};
  const file = path.join(ROOT, 'config.json');
  if (fs.existsSync(file)) {
    try {
      user = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`[config] config.json non valido: ${e.message}`);
    }
  }
  const cfg = merge(DEFAULTS, user);
  if (process.env.DAILYMAC_DEMO === '1') cfg.demo = true;
  if (process.env.DAILYMAC_LLM_URL) cfg.llm.baseUrl = process.env.DAILYMAC_LLM_URL;
  if (process.env.DAILYMAC_LLM_MODEL) cfg.llm.model = process.env.DAILYMAC_LLM_MODEL;
  if (process.env.PORT) cfg.port = Number(process.env.PORT);
  if (process.env.LOCALHOST_TIMES_LANG) cfg.language = process.env.LOCALHOST_TIMES_LANG;
  cfg.language = setLang(cfg.language);
  cfg.dataDir = path.join(ROOT, 'data');
  cfg.dbFile = path.join(cfg.dataDir, cfg.demo ? 'demo.sqlite' : 'dailymac.sqlite');
  return cfg;
}
