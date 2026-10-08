/**
 * Il catalogo delle vignette: le scene disegnate in web/src/components/Cartoon.jsx.
 * Il redattore sceglie la scena insieme alla battuta; se è spento (o sceglie male)
 * la tipografia la deduce dalla notizia d'apertura e dall'ora.
 */

export const SCENES = {
  desk: { label: 'Alla scrivania', about: 'il proprietario alla scrivania col portatile, scena neutra' },
  terminal: { label: 'Il terminale', about: 'il proprietario davanti al terminale, sguardo serio' },
  bug: { label: 'Caccia al bug', about: 'il proprietario con la lente d\'ingrandimento su un insetto sulla scrivania: un errore, qualcosa che non funziona' },
  mailpile: { label: 'La pila di posta', about: 'una pila di buste che crolla sulla scrivania: posta arretrata, non letti' },
  tabs: { label: 'Troppe schede', about: 'un ventaglio di schede del browser che esce dallo schermo: navigazione dispersiva' },
  scroll: { label: 'Lo scorrimento infinito', about: 'una pagina che scorre fuori dallo schermo e arriva a terra: social, feed, scorrere senza fine' },
  question: { label: 'La domanda', about: 'un fumetto con un punto interrogativo sopra lo schermo: ricerche, dubbi' },
  talk: { label: 'Il dialogo col computer', about: 'il proprietario e il computer si parlano a fumetti: chatbot, assistenti, chat' },
  chart: { label: 'Il grafico', about: 'un grafico in salita appeso al muro, il proprietario soddisfatto: Borsa dei siti, numeri, risultati' },
  night: { label: 'Notte fonda', about: 'finestra con la luna, orologio, terminale acceso: lavoro di notte, ore piccole' },
  sleep: { label: 'Addormentato', about: 'il proprietario dorme con la testa sulla scrivania: ora tranquilla, pochi segnali' },
  cat: { label: 'Il gatto', about: 'un gatto seduto sulla tastiera: ora ferma, distrazioni, niente di fatto' },
  listen: { label: 'In cuffia', about: 'il proprietario in cuffia con le note musicali: podcast, audio' },
  read: { label: 'Il libro', about: 'il proprietario con un libro aperto sulla scrivania: libri, letture, note, diario' },
  couch: { label: 'Sul divano', about: 'il proprietario sul divano con tablet e tazza: video, svago, YouTube' },
  newspaper: { label: 'Il giornale', about: 'il proprietario legge il giornale, il portatile mostra una pagina di giornale: il Mac che si legge, riepiloghi' },
  celebrate: { label: 'Festa', about: 'il proprietario in piedi a braccia alzate tra i coriandoli: un successo, qualcosa finito, un commit, un rilascio' },
  tidy: { label: 'Le pulizie', about: 'il proprietario con la scopa davanti al cestino pieno di fogli: riordino, cancellazioni, archiviazione' },
};

export const SCENE_IDS = Object.keys(SCENES);
const ALIASES = { mail: 'mailpile', browse: 'tabs' };

/** Normalizza la scena proposta dal modello; null se non è nel catalogo. */
export function validScene(s) {
  if (typeof s !== 'string') return null;
  const k = s.trim().toLowerCase().replace(/[^a-z]/g, '');
  const id = ALIASES[k] || k;
  return SCENES[id] ? id : null;
}

/** Il catalogo così come lo legge il redattore. */
export function sceneMenu() {
  return SCENE_IDS.map((id) => `- ${id}: ${SCENES[id].about}`).join('\n');
}

const text = (a) => `${a?.id || ''} ${a?.headline || ''} ${a?.dek || ''} ${(a?.body || []).join(' ')}`.toLowerCase();
const has = (a, re) => re.test(text(a));

const RE = {
  bug: /errore|error|fallit|failed|crash|non funziona|bug|eccezione|exception|panic|denied|segfault/,
  win: /commit|push|rilasci|deploy|merge|pubblicat|release|completat|risolt/,
  chat: /chatgpt|claude\.ai|gemini|copilot|perplexity|chatbot|assistente|ollama|lm ?studio|openai|anthropic/,
  video: /youtube|youtu\.be|netflix|vimeo|twitch|primevideo|raiplay|disneyplus|video/,
  social: /x\.com|twitter|reddit|instagram|facebook|linkedin|threads\.net|tiktok|bsky|mastodon|hacker ?news|news\.ycombinator/,
  tidy: /\brm\b|cancell|elimin|pulizi|archivi|svuot|clean|prune|riordin/,
  money: /borsa|finanz|azion|trading|banca|bank|invest|cripto|bitcoin|mercat/,
  self: /localhost times|127\.0\.0\.1|localhost/,
};

/**
 * La scena di riserva, dedotta dalla notizia d'apertura.
 * @param {object[]} articles  i pezzi dell'edizione (o le notizie del giorno)
 * @param {object} stats       statistiche dell'ora (total, bySource, searches…)
 * @param {object} opts        { hour: inizio della finestra in ms }
 */
export function autoScene(articles, stats = {}, { hour } = {}) {
  const lead = articles?.[0];
  const h = hour != null ? new Date(hour).getHours() : null;
  const total = stats.total ?? 0;
  if (!lead) return total ? 'desk' : 'sleep';
  if (h != null && h >= 0 && h < 5) return 'night';
  if (total && total < 12 && articles.length <= 1) return total % 2 ? 'cat' : 'sleep';

  switch (lead.source) {
    case 'terminal':
      if (has(lead, RE.bug)) return 'bug';
      if (has(lead, RE.win)) return 'celebrate';
      if (has(lead, RE.tidy)) return 'tidy';
      return h != null && h >= 23 ? 'night' : 'terminal';
    case 'mail': {
      if (lead.kind === 'webmail' || lead.kind === 'inbox') return 'mailpile';
      if ((stats.mailsIn || 0) >= 8) return 'mailpile';
      return has(lead, RE.tidy) ? 'tidy' : 'mailpile';
    }
    case 'safari':
      if (lead.kind === 'searches') return 'question';
      if (has(lead, RE.chat)) return 'talk';
      if (has(lead, RE.video)) return 'couch';
      if (has(lead, RE.social)) return 'scroll';
      if (has(lead, RE.self)) return 'newspaper';
      if (has(lead, RE.money)) return 'chart';
      if (has(lead, RE.bug)) return 'bug';
      return (stats.bySource?.safari || 0) > 40 || lead.kind === 'roundup' ? 'tabs' : 'desk';
    case 'podcasts':
      return 'listen';
    case 'books':
    case 'journal':
      return 'read';
    case 'notes':
      return has(lead, RE.tidy) ? 'tidy' : 'read';
    default:
      return 'desk';
  }
}

// La battuta di riserva, scritta per stare sotto il disegno
const CAPTIONS = {
  desk: ['Non stavo lavorando. Stavo facendo notizia.', 'Il giornale dice che oggi ho fatto molto. Sarà vero.'],
  terminal: ['Non è un errore. È un comando che non conoscevo.', 'Il computer dice di no, ma con molta cortesia.'],
  bug: ['Funzionava. Poi ho premuto invio.', 'Non è un bug. È una caratteristica che non ho chiesto.', 'L\'ho trovato. Adesso devo capire chi l\'ha invitato.'],
  mailpile: ['Non sono non letti. Sono un archivio.', 'Rispondo a tutti appena finisco di leggere.', 'La posta? La lascio maturare.'],
  tabs: ['Apro solo una scheda, giuro.', 'Le chiudo appena finisco di leggerle tutte.', 'Non sto perdendo tempo. Sto raccogliendo notizie.'],
  scroll: ['Ancora uno e smetto.', 'Non leggo, aggiorno.', 'Sono arrivato alla fine. Ne hanno aggiunta un\'altra.'],
  question: ['Non cercavo niente. Volevo solo vedere cosa sa.', 'Ho fatto una domanda, mi ha risposto con altre dieci.'],
  talk: ['Gli ho chiesto un parere. Me ne ha dati sei.', 'Siamo d\'accordo su tutto. È questo che mi preoccupa.'],
  chart: ['Il titolo sale. Non chiedetemi cosa produce.', 'Ho diversificato: tre siti invece di due.'],
  night: ['Ancora cinque minuti. Lo dico da due ore.', 'Di notte i comandi vengono meglio. Anche gli errori.'],
  sleep: ['Non dormivo. Aspettavo la prossima edizione.', 'Ora tranquilla. Anche per me.'],
  cat: ['Non ho fatto niente. Lui invece ha scritto molto.', 'L\'ultimo commit è suo.'],
  listen: ['Lo ascolto a velocità doppia, così ho tempo per un altro.', 'Non parlo con nessuno. Ascolto chi parla con tutti.'],
  read: ['Sottolineo, quindi leggo.', 'Scrivo tutto, così non devo ricordare niente.'],
  couch: ['Solo un video. Poi l\'altro era collegato.', 'È documentazione. Con la musica.'],
  newspaper: ['Volevo sapere cosa ho fatto oggi. C\'è scritto qui.', 'Il giornale dice che oggi ho fatto molto. Sarà vero.'],
  celebrate: ['Funziona. Nessuno sa perché, ma funziona.', 'Pubblicato. Adesso posso rompere tutto il resto.'],
  tidy: ['Non ho cancellato niente. Ho fatto spazio.', 'Ho messo in ordine. Adesso non trovo niente.'],
};

function pick(list, seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export function sceneCaption(scene, seed = '') {
  return pick(CAPTIONS[scene] || CAPTIONS.desk, `${scene}:${seed}`);
}
