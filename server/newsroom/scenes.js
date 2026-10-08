/**
 * The cartoon catalogue: the scenes drawn in web/src/components/Cartoon.jsx.
 * The writer picks the scene together with the caption; when it is offline (or picks badly)
 * the automatic typesetting infers it from the lead story and the time of day.
 */
import { L } from '../i18n.js';

const TEXT = {
  en: {
    desk: ['At the desk', 'the owner at the desk with the laptop, a neutral scene'],
    terminal: ['The terminal', 'the owner in front of the terminal, serious look'],
    bug: ['Bug hunt', 'the owner with a magnifying glass over a bug on the desk: an error, something not working'],
    mailpile: ['The mail pile', 'a pile of envelopes collapsing on the desk: backlog, unread mail'],
    tabs: ['Too many tabs', 'a fan of browser tabs bursting out of the screen: scattered browsing'],
    scroll: ['Endless scroll', 'a page scrolling out of the screen down to the floor: social media, feeds, endless scrolling'],
    question: ['The question', 'a speech bubble with a question mark above the screen: searches, doubts'],
    talk: ['Talking to the computer', 'the owner and the computer talk in speech bubbles: chatbots, assistants, chat'],
    chart: ['The chart', 'a rising chart on the wall, the owner pleased: website stock market, numbers, results'],
    night: ['Dead of night', 'window with the moon, clock, terminal on: working at night, small hours'],
    sleep: ['Asleep', 'the owner asleep with the head on the desk: a quiet hour, few signals'],
    cat: ['The cat', 'a cat sitting on the keyboard: a stalled hour, distractions, nothing done'],
    listen: ['Headphones on', 'the owner with headphones and music notes: podcasts, audio'],
    read: ['The book', 'the owner with an open book on the desk: books, reading, notes, journal'],
    couch: ['On the couch', 'the owner on the couch with tablet and mug: videos, leisure, YouTube'],
    newspaper: ['The newspaper', 'the owner reads the paper, the laptop shows a newspaper page: the Mac reading itself, recaps'],
    celebrate: ['Celebration', 'the owner standing with arms up among confetti: a success, something finished, a commit, a release'],
    tidy: ['Spring cleaning', 'the owner with a broom by a bin full of paper: tidying, deleting, archiving'],
  },
  it: {
    desk: ['Alla scrivania', 'il proprietario alla scrivania col portatile, scena neutra'],
    terminal: ['Il terminale', 'il proprietario davanti al terminale, sguardo serio'],
    bug: ['Caccia al bug', 'il proprietario con la lente d\'ingrandimento su un insetto sulla scrivania: un errore, qualcosa che non funziona'],
    mailpile: ['La pila di posta', 'una pila di buste che crolla sulla scrivania: posta arretrata, non letti'],
    tabs: ['Troppe schede', 'un ventaglio di schede del browser che esce dallo schermo: navigazione dispersiva'],
    scroll: ['Lo scorrimento infinito', 'una pagina che scorre fuori dallo schermo e arriva a terra: social, feed, scorrere senza fine'],
    question: ['La domanda', 'un fumetto con un punto interrogativo sopra lo schermo: ricerche, dubbi'],
    talk: ['Il dialogo col computer', 'il proprietario e il computer si parlano a fumetti: chatbot, assistenti, chat'],
    chart: ['Il grafico', 'un grafico in salita appeso al muro, il proprietario soddisfatto: Borsa dei siti, numeri, risultati'],
    night: ['Notte fonda', 'finestra con la luna, orologio, terminale acceso: lavoro di notte, ore piccole'],
    sleep: ['Addormentato', 'il proprietario dorme con la testa sulla scrivania: ora tranquilla, pochi segnali'],
    cat: ['Il gatto', 'un gatto seduto sulla tastiera: ora ferma, distrazioni, niente di fatto'],
    listen: ['In cuffia', 'il proprietario in cuffia con le note musicali: podcast, audio'],
    read: ['Il libro', 'il proprietario con un libro aperto sulla scrivania: libri, letture, note, diario'],
    couch: ['Sul divano', 'il proprietario sul divano con tablet e tazza: video, svago, YouTube'],
    newspaper: ['Il giornale', 'il proprietario legge il giornale, il portatile mostra una pagina di giornale: il Mac che si legge, riepiloghi'],
    celebrate: ['Festa', 'il proprietario in piedi a braccia alzate tra i coriandoli: un successo, qualcosa finito, un commit, un rilascio'],
    tidy: ['Le pulizie', 'il proprietario con la scopa davanti al cestino pieno di fogli: riordino, cancellazioni, archiviazione'],
  },
};

export const SCENES = Object.fromEntries(Object.keys(TEXT.en).map((id) => [id, {
  get label() { return L(TEXT)[id][0]; },
  get about() { return L(TEXT)[id][1]; },
}]));

export const SCENE_IDS = Object.keys(SCENES);
const ALIASES = { mail: 'mailpile', browse: 'tabs' };

/** Normalise the scene proposed by the model; null if it is not in the catalogue. */
export function validScene(s) {
  if (typeof s !== 'string') return null;
  const k = s.trim().toLowerCase().replace(/[^a-z]/g, '');
  const id = ALIASES[k] || k;
  return SCENES[id] ? id : null;
}

/** The catalogue as the writer reads it. */
export function sceneMenu() {
  return SCENE_IDS.map((id) => `- ${id}: ${SCENES[id].about}`).join('\n');
}

const text = (a) => `${a?.id || ''} ${a?.headline || ''} ${a?.dek || ''} ${(a?.body || []).join(' ')}`.toLowerCase();
const has = (a, re) => re.test(text(a));

const RE = {
  bug: /errore|error|fallit|failed|fails|crash|non funziona|broken|bug|eccezione|exception|panic|denied|segfault/,
  win: /commit|push|rilasci|deploy|merge|pubblicat|release|shipped|completat|complete[sd]|risolt|fixed|solved/,
  chat: /chatgpt|claude\.ai|gemini|copilot|perplexity|chatbot|assistente|assistant|ollama|lm ?studio|openai|anthropic/,
  video: /youtube|youtu\.be|netflix|vimeo|twitch|primevideo|raiplay|disneyplus|video/,
  social: /x\.com|twitter|reddit|instagram|facebook|linkedin|threads\.net|tiktok|bsky|mastodon|hacker ?news|news\.ycombinator/,
  tidy: /\brm\b|cancell|elimin|pulizi|archivi|svuot|clean|prune|riordin|delet|tidy|archiv/,
  money: /borsa|finanz|azion|trading|banca|bank|invest|cripto|crypto|bitcoin|mercat|market|stock/,
  self: /localhost times|127\.0\.0\.1|localhost/,
};

/**
 * The fallback scene, inferred from the lead story.
 * @param {object[]} articles  the edition's pieces (or the day's top stories)
 * @param {object} stats       the hour's statistics (total, bySource, searches…)
 * @param {object} opts        { hour: start of the window, in ms }
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
    case 'files':
      if (lead.kind === 'downloads') return 'mailpile';
      return lead.project ? (h != null && h >= 23 ? 'night' : 'terminal') : 'tidy';
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

// Fallback captions, written to sit under each drawing
const CAPTIONS = {
  en: {
    desk: ['I wasn\'t working. I was making news.', 'The paper says I did a lot today. If you say so.'],
    terminal: ['It\'s not an error. It\'s a command I didn\'t know.', 'The computer says no, but very politely.'],
    bug: ['It worked. Then I pressed enter.', 'It\'s not a bug. It\'s a feature nobody asked for.', 'Found it. Now I need to know who invited it.'],
    mailpile: ['They\'re not unread. They\'re an archive.', 'I\'ll answer everyone as soon as I\'ve read them all.', 'The mail? I\'m letting it age.'],
    tabs: ['Just one tab, I swear.', 'I\'ll close them once I\'ve read them all.', 'I\'m not wasting time. I\'m gathering news.'],
    scroll: ['One more and I stop.', 'I don\'t read, I refresh.', 'I reached the end. They added another one.'],
    question: ['I wasn\'t looking for anything. I just wanted to see what it knows.', 'I asked one question. It answered with ten more.'],
    talk: ['I asked for an opinion. It gave me six.', 'We agree on everything. That\'s what worries me.'],
    chart: ['The stock is up. Don\'t ask me what it makes.', 'I diversified: three sites instead of two.'],
    night: ['Five more minutes. I\'ve been saying it for two hours.', 'Commands come out better at night. So do the errors.'],
    sleep: ['I wasn\'t sleeping. I was waiting for the next edition.', 'A quiet hour. For me too.'],
    cat: ['I did nothing. He, on the other hand, typed a lot.', 'The last commit is his.'],
    listen: ['I play it at double speed, so I have time for another.', 'I talk to no one. I listen to people who talk to everyone.'],
    read: ['I underline, therefore I read.', 'I write everything down, so I don\'t have to remember anything.'],
    couch: ['Just one video. Then the next one was related.', 'It\'s documentation. With music.'],
    newspaper: ['I wanted to know what I did today. It\'s all in here.', 'The paper says I did a lot today. If you say so.'],
    celebrate: ['It works. Nobody knows why, but it works.', 'Shipped. Now I can break everything else.'],
    tidy: ['I didn\'t delete anything. I made room.', 'I tidied up. Now I can\'t find anything.'],
  },
  it: {
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
  },
};

function pick(list, seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export function sceneCaption(scene, seed = '') {
  const c = L(CAPTIONS);
  return pick(c[scene] || c.desk, `${scene}:${seed}`);
}
