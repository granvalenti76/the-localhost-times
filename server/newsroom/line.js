/**
 * La linea editoriale: decisa dal direttore (tu) nell'area Redazione.
 * Salvata nel database, letta a ogni edizione.
 */
export const TONES = {
  asciutto: {
    label: 'Asciutto',
    hint: 'Quotidiano serio, ironia rara',
    prompt: 'Tono asciutto e preciso. Ironia rara, di sottrazione.',
  },
  ironico: {
    label: 'Ironico',
    hint: 'Una battuta per paragrafo',
    prompt: 'Tono ironico: concediti una battuta per paragrafo, sempre fondata sui fatti, mai cattiva.',
  },
  satirico: {
    label: 'Satirico',
    hint: 'Corsivo di costume',
    prompt: 'Tono da corsivo satirico di costume: esagera con garbo le piccole manie del proprietario, come un corsivista d\'altri tempi. Mai offensivo, mai volgare.',
  },
  british: {
    label: 'Understatement',
    hint: 'Calma britannica',
    prompt: 'Understatement britannico: tutto è «piuttosto», «non del tutto trascurabile». Calma olimpica anche davanti a centosessanta visite allo stesso sito.',
  },
  strillone: {
    label: 'Strillone',
    hint: 'Tabloid, per gioco',
    prompt: 'Per gioco, stile da tabloid d\'altri tempi: titoli a effetto, «CLAMOROSO», «ECCO», punti esclamativi ammessi nei titoli. Il corpo resta breve e i fatti restano veri.',
  },
};

export const LENGTHS = {
  corti: { label: 'Corti', factor: 0.65 },
  standard: { label: 'Standard', factor: 1 },
  lunghi: { label: 'Lunghi', factor: 1.5 },
};

export const WEIGHTS = [
  { value: 0, label: 'Nascosta' },
  { value: 0.5, label: '−' },
  { value: 1, label: '=' },
  { value: 1.6, label: '+' },
  { value: 2.5, label: '++' },
];

export const DEFAULT_LINE = {
  tone: 'asciutto',
  length: 'standard',
  autoPublish: true,
  photos: true,
  notes: '',
  sectionWeights: { safari: 1, mail: 1, terminal: 1, notes: 1, journal: 1, podcasts: 1, books: 1 },
};

export function getLine(store) {
  const saved = store.getSetting('line', {});
  return {
    ...DEFAULT_LINE,
    ...saved,
    sectionWeights: { ...DEFAULT_LINE.sectionWeights, ...(saved.sectionWeights || {}) },
  };
}

export function saveLine(store, patch) {
  const cur = getLine(store);
  const next = { ...cur, ...patch, sectionWeights: { ...cur.sectionWeights, ...(patch.sectionWeights || {}) } };
  if (!TONES[next.tone]) next.tone = 'asciutto';
  if (!LENGTHS[next.length]) next.length = 'standard';
  next.notes = String(next.notes || '').slice(0, 2000);
  next.autoPublish = !!next.autoPublish;
  next.photos = !!next.photos;
  for (const [k, v] of Object.entries(next.sectionWeights)) {
    next.sectionWeights[k] = Math.max(0, Math.min(3, Number(v) || 0));
  }
  store.setSetting('line', next);
  return next;
}

/** Blocco da aggiungere alle istruzioni del redattore. */
export function linePrompt(line) {
  const parts = [`\nLINEA EDITORIALE DELLA DIREZIONE (prevale sulle indicazioni di stile qui sopra, non su quelle sui fatti):\n- ${TONES[line.tone]?.prompt || TONES.asciutto.prompt}`];
  if (line.notes?.trim()) parts.push(`- Note del direttore: ${line.notes.trim()}`);
  return parts.join('\n');
}
