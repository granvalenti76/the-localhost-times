export async function api(path, opts) {
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

export const writerLabel = (w) => (!w || w === 'tipografia' ? 'Tipografia automatica' : w);
