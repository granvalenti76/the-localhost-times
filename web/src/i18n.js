/**
 * The paper's language, chosen on the server (config.language) and injected into index.html.
 * tr({ en, it }) picks the string for the current language.
 */
export const lang = (typeof window !== 'undefined' && window.__LT__?.lang) || 'en';
export const locale = lang === 'it' ? 'it-IT' : 'en-US';
export const tr = (d) => d[lang] ?? d.en;
