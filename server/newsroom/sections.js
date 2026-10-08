import { L } from '../i18n.js';

// The paper's sections: one per source. Names follow the paper's language
// (read at call time: the language is set after the modules are loaded).
const NAMES = {
  en: {
    safari:   { slug: 'world',          name: 'World',          tag: 'From the web' },
    mail:     { slug: 'correspondence', name: 'Correspondence', tag: 'Mail' },
    terminal: { slug: 'workshop',       name: 'Workshop',       tag: 'Terminal' },
    notes:    { slug: 'notebook',       name: 'Notebook',       tag: 'Notes' },
    journal:  { slug: 'diary',          name: 'Diary',          tag: 'Journal' },
    podcasts: { slug: 'radio',          name: 'Radio',          tag: 'Podcasts' },
    books:    { slug: 'culture',        name: 'Culture',        tag: 'Books' },
    files:    { slug: 'local',          name: 'Local',          tag: 'Files' },
  },
  it: {
    safari:   { slug: 'esteri',         name: 'Esteri',         tag: 'Dal web' },
    mail:     { slug: 'corrispondenza', name: 'Corrispondenza', tag: 'Posta' },
    terminal: { slug: 'officina',       name: 'Officina',       tag: 'Terminale' },
    notes:    { slug: 'taccuino',       name: 'Taccuino',       tag: 'Note' },
    journal:  { slug: 'diario',         name: 'Diario',         tag: 'Journal' },
    podcasts: { slug: 'radio',          name: 'Radio',          tag: 'Podcast' },
    books:    { slug: 'cultura',        name: 'Cultura',        tag: 'Libri' },
    files:    { slug: 'cronaca',        name: 'Cronaca locale', tag: 'File' },
  },
};

export const SECTION_ORDER = ['safari', 'mail', 'terminal', 'files', 'notes', 'journal', 'podcasts', 'books'];

export const SECTIONS = Object.fromEntries(SECTION_ORDER.map((id) => [id, {
  id,
  get slug() { return L(NAMES)[id].slug; },
  get name() { return L(NAMES)[id].name; },
  get tag() { return L(NAMES)[id].tag; },
}]));

/** Any slug, in any language (old editions keep the slugs they were printed with). */
export function sectionBySlug(slug) {
  for (const names of Object.values(NAMES)) {
    for (const [id, s] of Object.entries(names)) if (s.slug === slug || id === slug) return id;
  }
  return null;
}
