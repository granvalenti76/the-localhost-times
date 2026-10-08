import { tr, locale } from './i18n.js';

export async function api(path, opts = {}) {
  // the server refuses data-changing calls without this header (protection against other sites)
  const headers = { 'X-Localhost-Times': '1' };
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts = { ...opts, body: JSON.stringify(opts.json) };
    delete opts.json;
  }
  opts = { ...opts, headers: { ...headers, ...(opts.headers || {}) } };
  const r = await fetch(`/api${path}`, opts);
  if (r.status === 204) return null;
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}

const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const dayFromKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
export const shiftDay = (k, n) => {
  const [y, m, d] = k.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n).getTime());
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const longDate = (ms) =>
  cap(new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ms));
export const shortDate = (ms) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);

// Routes are in English; the Italian ones still work (old links, bookmarks).
export function parseRoute(hash) {
  const p = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (p[0] === 'newsroom' || p[0] === 'redazione') return { desk: true, edition: p[1] || null };
  if ((p[0] === 'evening' || p[0] === 'sera') && p[1]) return { evening: p[1] };
  if (p[0] === 'letters' || p[0] === 'lettere') return { letters: true };
  if (p[0] === 'archive' || p[0] === 'archivio') return { archive: true, query: p.slice(1).join('/') };
  if (p[0] === 'investigations' || p[0] === 'inchieste') return { investigations: true };
  if ((p[0] === 'investigation' || p[0] === 'inchiesta') && p[1]) return { investigation: p[1] };
  if (p[0] === 'e' && p[1]) return { edition: p[1], article: p[2] === 'a' ? p[3] : null };
  if (p[0] === 'd' && p[1]) return { day: p[1], section: p[2] === 's' ? p[3] : null };
  return {};
}
export const href = {
  latest: () => '#/',
  edition: (id) => `#/e/${encodeURIComponent(id)}`,
  article: (ed, a) => `#/e/${encodeURIComponent(ed)}/a/${encodeURIComponent(a)}`,
  day: (d) => `#/d/${d}`,
  section: (d, s) => `#/d/${d}/s/${s}`,
  desk: (id) => (id ? `#/newsroom/${encodeURIComponent(id)}` : '#/newsroom'),
  evening: (day) => `#/evening/${day}`,
  letters: () => '#/letters',
  archive: (q) => (q ? `#/archive/${encodeURIComponent(q)}` : '#/archive'),
  investigations: () => '#/investigations',
  investigation: (id) => `#/investigation/${id}`,
};

const SECTION_NAMES = {
  en: [
    { id: 'safari', slug: 'world', name: 'World', tag: 'From the web' },
    { id: 'mail', slug: 'correspondence', name: 'Correspondence', tag: 'Mail' },
    { id: 'terminal', slug: 'workshop', name: 'Workshop', tag: 'Terminal' },
    { id: 'notes', slug: 'notebook', name: 'Notebook', tag: 'Notes' },
    { id: 'journal', slug: 'diary', name: 'Diary', tag: 'Journal' },
    { id: 'podcasts', slug: 'radio', name: 'Radio', tag: 'Podcasts' },
    { id: 'books', slug: 'culture', name: 'Culture', tag: 'Books' },
    { id: 'files', slug: 'local', name: 'Local', tag: 'Files' },
  ],
  it: [
    { id: 'safari', slug: 'esteri', name: 'Esteri', tag: 'Dal web' },
    { id: 'mail', slug: 'corrispondenza', name: 'Corrispondenza', tag: 'Mail' },
    { id: 'terminal', slug: 'officina', name: 'Officina', tag: 'Terminale' },
    { id: 'notes', slug: 'taccuino', name: 'Taccuino', tag: 'Note' },
    { id: 'journal', slug: 'diario', name: 'Diario', tag: 'Journal' },
    { id: 'podcasts', slug: 'radio', name: 'Radio', tag: 'Podcast' },
    { id: 'books', slug: 'cultura', name: 'Cultura', tag: 'Libri' },
    { id: 'files', slug: 'cronaca', name: 'Cronaca locale', tag: 'File' },
  ],
};
export const SECTIONS = tr(SECTION_NAMES);

/** A section from a slug in any language (old editions keep the slugs they were printed with). */
export function sectionBySlug(slug) {
  const i = [...SECTION_NAMES.en, ...SECTION_NAMES.it].findIndex((s) => s.slug === slug || s.id === slug);
  return i < 0 ? null : SECTIONS[i % SECTIONS.length];
}

/** «gemma-4-E4B-it-Q4_K_M.gguf» → «Gemma 4 E4B» */
export function modelName(m) {
  let s = String(m).split('/').pop().replace(/\.gguf$/i, '');
  for (let i = 0; i < 4; i++) {
    s = s.replace(/[-_.](i?q\d[\w]*|f16|bf16|fp16|fp8|int[48]|gguf|mlx|awq|gptq|\d+bit|it|instruct|chat|latest)$/i, '');
  }
  s = s.replace(/[-_:]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : m;
}
/** The hour of an edition (editions that merge several hours carry the last one). */
export const edHour = (e) => e?.hour ?? e?.start;
export const edSince = (e) => (e && e.hour && e.start < e.hour ? ` · ${tr({ en: 'since', it: 'dalle' })} ${hhmm(e.start)}` : '');

/** The automatic typesetting (older editions call it 'tipografia'). */
export const isTypeset = (w) => !w || w === 'typesetting' || w === 'tipografia';

export const writerLabel = (w) => {
  if (isTypeset(w)) return tr({ en: 'Automatic typesetting', it: 'Tipografia automatica' });
  const [model, extra] = String(w).split(' + ');
  const by = extra === 'editor' || extra === 'direttore' ? tr({ en: 'editor', it: 'direttore' }) : extra;
  return (isTypeset(model) ? tr({ en: 'Typesetting', it: 'Tipografia' }) : modelName(model)) + (by ? ` + ${by}` : '');
};

/** "The 14:00 edition" / "Edizione delle 14:00" */
export const editionLabel = (ms) => tr({ en: `The ${hhmm(ms)} edition`, it: `Edizione delle ${hhmm(ms)}` });

/** The "continuing story" tag on articles. */
export const episodeLabel = (n) => tr({ en: `Continuing · part ${n}`, it: `Segue · ${n}ª puntata` });

/** Reading time of an article: about 230 words a minute in English, 200 in Italian. */
export function readingTime(a) {
  const words = [a?.dek || '', ...(a?.body || [])].join(' ').split(/\s+/).filter(Boolean).length;
  const min = Math.max(1, Math.round(words / tr({ en: 230, it: 200 })));
  return tr({ en: `${min} min read`, it: `${min} min di lettura` });
}
