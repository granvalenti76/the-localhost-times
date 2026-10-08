export async function api(path, opts = {}) {
  if (opts.json !== undefined) {
    opts = { ...opts, body: JSON.stringify(opts.json), headers: { 'Content-Type': 'application/json' } };
    delete opts.json;
  }
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
  cap(new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ms));
export const shortDate = (ms) =>
  new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);

export function parseRoute(hash) {
  const p = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (p[0] === 'redazione') return { desk: true, edition: p[1] || null };
  if (p[0] === 'sera' && p[1]) return { evening: p[1] };
  if (p[0] === 'lettere') return { letters: true };
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
  desk: (id) => (id ? `#/redazione/${encodeURIComponent(id)}` : '#/redazione'),
  evening: (day) => `#/sera/${day}`,
  letters: () => '#/lettere',
};

export const SECTIONS = [
  { id: 'safari', slug: 'esteri', name: 'Esteri', tag: 'Dal web' },
  { id: 'mail', slug: 'corrispondenza', name: 'Corrispondenza', tag: 'Mail' },
  { id: 'terminal', slug: 'officina', name: 'Officina', tag: 'Terminale' },
  { id: 'notes', slug: 'taccuino', name: 'Taccuino', tag: 'Note' },
  { id: 'journal', slug: 'diario', name: 'Diario', tag: 'Journal' },
  { id: 'podcasts', slug: 'radio', name: 'Radio', tag: 'Podcast' },
  { id: 'books', slug: 'cultura', name: 'Cultura', tag: 'Libri' },
];

/** «gemma-4-E4B-it-Q4_K_M.gguf» → «Gemma 4 E4B» */
export function modelName(m) {
  let s = String(m).split('/').pop().replace(/\.gguf$/i, '');
  for (let i = 0; i < 4; i++) {
    s = s.replace(/[-_.](i?q\d[\w]*|f16|bf16|fp16|fp8|int[48]|gguf|mlx|awq|gptq|\d+bit|it|instruct|chat|latest)$/i, '');
  }
  s = s.replace(/[-_:]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : m;
}
/** L'ora di un'edizione (le edizioni che uniscono più ore portano l'ora finale). */
export const edHour = (e) => e?.hour ?? e?.start;
export const edSince = (e) => (e && e.hour && e.start < e.hour ? ` · dalle ${hhmm(e.start)}` : '');

export const writerLabel = (w) => {
  if (!w || w === 'tipografia') return 'Tipografia automatica';
  const [model, extra] = String(w).split(' + ');
  return modelName(model) + (extra ? ` + ${extra}` : '');
};
