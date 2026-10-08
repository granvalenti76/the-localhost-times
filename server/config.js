import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');

const DEFAULTS = {
  port: 4321,
  demo: false,
  llm: {
    baseUrl: 'http://192.168.1.20:8080/v1',
    model: '',
    apiKey: '',
    timeoutMs: 180000,
    concurrency: 2,
    temperature: 0.7,
  },
  collectEveryMinutes: 5,
  backfillHours: 12,
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
  edition: { maxArticles: 9 },
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
  cfg.dataDir = path.join(ROOT, 'data');
  cfg.dbFile = path.join(cfg.dataDir, cfg.demo ? 'demo.sqlite' : 'dailymac.sqlite');
  return cfg;
}
