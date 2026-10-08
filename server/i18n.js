/**
 * The paper's language. One language per process, set once from config.language.
 * Every user-facing string (prompts, fallback copy, log lines) picks from { en, it }.
 */
export const LANGS = ['en', 'it'];
let current = 'en';

export function setLang(l) {
  current = LANGS.includes(l) ? l : 'en';
  return current;
}
export const lang = () => current;
export const locale = () => (current === 'it' ? 'it-IT' : 'en-US');

/** tr({ en: '…', it: '…' }) → the string (or value) for the current language. */
export const tr = (d) => (d[current] ?? d.en);

/** Pick from a per-language table of functions or values. */
export function L(table) {
  return table[current] ?? table.en;
}
