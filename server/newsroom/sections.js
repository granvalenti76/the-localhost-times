// Le sezioni del giornale: una per fonte.
export const SECTIONS = {
  safari:   { slug: 'esteri',         name: 'Esteri',         tag: 'Dal web' },
  mail:     { slug: 'corrispondenza', name: 'Corrispondenza', tag: 'Posta' },
  terminal: { slug: 'officina',       name: 'Officina',       tag: 'Terminale' },
  notes:    { slug: 'taccuino',       name: 'Taccuino',       tag: 'Note' },
  journal:  { slug: 'diario',         name: 'Diario',         tag: 'Journal' },
  podcasts: { slug: 'radio',          name: 'Radio',          tag: 'Podcast' },
  books:    { slug: 'cultura',        name: 'Cultura',        tag: 'Libri' },
};

export const SECTION_ORDER = ['safari', 'mail', 'terminal', 'notes', 'journal', 'podcasts', 'books'];
