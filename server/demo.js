/**
 * Demo data: an invented but plausible day, to see the paper without permissions
 * or real sources. `npm run demo`.
 */
import { hourStart, hash } from './util.js';
import { L } from './i18n.js';

const HOUR = 3600e3;

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const DATA_EN = {
  SITES: {
    'developer.apple.com': ['Swift Concurrency – Apple Developer', 'Actors | Apple Developer Documentation', 'Sendable | Apple Developer Documentation', 'WWDC Videos – Meet async/await in Swift', 'NSWorkspace | Apple Developer Documentation'],
    'react.dev': ['useEffect – React', 'Synchronizing with Effects – React', 'You Might Not Need an Effect – React', 'useMemo – React'],
    'github.com': ['vitejs/vite: Next generation frontend tooling', 'Pull request #42 · localhost-times/localhost-times', 'Issues · nodejs/node', 'node:sqlite – Discussion #51234'],
    'stackoverflow.com': ['How to read Safari History.db on macOS - Stack Overflow', 'Core Data timestamp to Unix - Stack Overflow', 'CSS multi-column layout with rules - Stack Overflow'],
    'en.wikipedia.org': ['The New York Times - Wikipedia', 'Blackletter - Wikipedia', 'Fraktur - Wikipedia', 'Broadsheet - Wikipedia'],
    'developer.mozilla.org': ['CSS multi-column layout - MDN', 'initial-letter - CSS | MDN', 'font-variation-settings - MDN'],
    'fonts.google.com': ['UnifrakturMaguntia - Google Fonts', 'Source Serif 4 - Google Fonts'],
    'youtube.com': ['Lo-fi beats to code to – 3 hours - YouTube'],
    'weather.example.com': ['Forecast for Boston – today'],
  },
  SEARCHES: ['how to read safari history.db', 'core data timestamp 2001', 'free alternative to nyt cheltenham font', 'css drop cap initial-letter', 'node sqlite built in', 'pumpkin risotto recipe', 'train times boston new york'],
  PEOPLE: [['Julia Ferris', 'julia.ferris@studio.example'], ['Mark Bass', 'mark@bass.example'], ['Ellen Kent', 'ellen.kent@client.example']],
  NEWS: [['Tech Newsletter', 'newsletter@tech.example'], ['GitHub', 'noreply@github.com'], ['The Bank', 'alerts@bank.example'], ['Amtrak', 'noreply@amtrak.example']],
  THREADS: ['Website redesign quote', 'Thursday\'s meeting', 'Contract draft v3', 'Dinner on Saturday?'],
  NEWS_SUBJ: ['This week\'s news', '[localhost-times] New issue opened', 'Your statement is ready', 'Your ticket', 'Digest: 5 articles for you'],
  SENT: 'Sent',
  CMDS: ['git status', 'git pull', 'npm run dev', 'npm install express', 'git add -A', 'git diff', 'code .', 'ls', 'cd ~/Work/git/localhost-times', 'node server/cli.js probe', 'brew upgrade', 'docker compose up -d', 'ssh nas.local', 'clear', 'npm test', 'git log --oneline -5'],
  COMMITS: ['add Safari collector', 'NYT-style front page', 'fix: Core Data timestamps', 'newsroom: typesetting fallback', 'cluster by domain'],
  NOTES: [
    ['Ideas for The Localhost Times', 'Sections: World (web), Correspondence (mail), Workshop (terminal). An edition every hour. An evening front page with the best of the day?', 'Projects'],
    ['Shopping list', 'pumpkin, arborio rice, parmesan, butter, vegetable stock', 'Home'],
    ['Notes from Thursday\'s meeting', 'Points: delivery dates, budget, who owns the design. Review the quote by Friday.', 'Work'],
  ],
  JOURNAL: 'A day made of paper',
  PODCAST: [
    ['Source Code', 'Episode 112 – SQLite everywhere', 'Why the most widely deployed database in the world lives inside every app you use.', 2900],
    ['Paper Stories', 'The night the front page was born', 'A journey through the composing rooms of twentieth-century newspapers.', 2400],
  ],
  BOOKS: [
    ['Moby-Dick', 'Herman Melville', 'mobydick', ['Call me Ishmael.', 'It is not down in any map; true places never are.']],
    ['Pride and Prejudice', 'Jane Austen', 'pride', ['It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.']],
  ],
};

const DATA_IT = {
  SITES: {
    'developer.apple.com': ['Swift Concurrency – Apple Developer', 'Actors | Apple Developer Documentation', 'Sendable | Apple Developer Documentation', 'WWDC Videos – Meet async/await in Swift', 'NSWorkspace | Apple Developer Documentation'],
    'react.dev': ['useEffect – React', 'Synchronizing with Effects – React', 'You Might Not Need an Effect – React', 'useMemo – React'],
    'github.com': ['vitejs/vite: Next generation frontend tooling', 'Pull request #42 · localhost-times/localhost-times', 'Issues · nodejs/node', 'node:sqlite – Discussion #51234'],
    'stackoverflow.com': ['How to read Safari History.db on macOS - Stack Overflow', 'Core Data timestamp to Unix - Stack Overflow', 'CSS multi-column layout with rules - Stack Overflow'],
    'it.wikipedia.org': ['The New York Times - Wikipedia', 'Carattere gotico - Wikipedia', 'Fraktur - Wikipedia', 'Giornalismo - Wikipedia'],
    'developer.mozilla.org': ['CSS multi-column layout - MDN', 'initial-letter - CSS | MDN', 'font-variation-settings - MDN'],
    'fonts.google.com': ['UnifrakturMaguntia - Google Fonts', 'Source Serif 4 - Google Fonts'],
    'youtube.com': ['Lo-fi per programmare – 3 ore - YouTube'],
    'meteo.example.it': ['Previsioni Milano – oggi'],
  },
  SEARCHES: ['come leggere history.db safari', 'core data timestamp 2001', 'nyt cheltenham font alternativa gratuita', 'css drop cap initial-letter', 'node sqlite built in', 'ricetta risotto zucca', 'orari treni milano bologna'],
  PEOPLE: [['Giulia Ferri', 'giulia.ferri@studio.example'], ['Marco Bassi', 'marco@bassi.example'], ['Elena Conti', 'elena.conti@cliente.example']],
  NEWS: [['Newsletter Tech', 'newsletter@tech.example'], ['GitHub', 'noreply@github.com'], ['Banca', 'notifiche@banca.example'], ['Trenitalia', 'noreply@trenitalia.example']],
  THREADS: ['Preventivo redesign sito', 'Riunione di giovedì', 'Bozza contratto v3', 'Cena sabato?'],
  NEWS_SUBJ: ['Le novità della settimana', '[localhost-times] New issue opened', 'Estratto conto disponibile', 'Il tuo biglietto', 'Digest: 5 articoli per te'],
  CMDS: ['git status', 'git pull', 'npm run dev', 'npm install express', 'git add -A', 'git diff', 'code .', 'ls', 'cd ~/Work/git/localhost-times', 'node server/cli.js probe', 'brew upgrade', 'docker compose up -d', 'ssh nas.local', 'clear', 'npm test', 'git log --oneline -5'],
  COMMITS: ['aggiunge raccoglitore Safari', 'prima pagina in stile NYT', 'fix: timestamp Core Data', 'redazione: fallback tipografico', 'cluster per dominio'],
  NOTES: [
    ['Idee per The Localhost Times', 'Sezioni: Esteri (web), Corrispondenza (mail), Officina (terminale). Edizione ogni ora. Una prima pagina serale con il meglio della giornata?', 'Progetti'],
    ['Lista spesa', 'zucca, riso carnaroli, parmigiano, burro, brodo vegetale', 'Casa'],
    ['Appunti riunione giovedì', 'Punti: tempi di consegna, budget, chi segue il design. Rivedere preventivo entro venerdì.', 'Lavoro'],
  ],
  PODCAST: [
    ['Codice Sorgente', 'Episodio 112 – SQLite ovunque', 'Perché il database più diffuso al mondo sta dentro ogni app che usi.', 2900],
    ['Storie di Carta', 'La notte in cui nacque la prima pagina', 'Viaggio nelle tipografie dei quotidiani del Novecento.', 2400],
  ],
  BOOKS: [
    ['I promessi sposi', 'Alessandro Manzoni', 'ipromessi', ['Quel ramo del lago di Como, che volge a mezzogiorno, tra due catene non interrotte di monti', 'La c\'è la Provvidenza!']],
    ['Il fu Mattia Pascal', 'Luigi Pirandello', 'mattiapascal', ['Una delle poche cose, anzi forse la sola ch\'io sapessi di certo era questa: che mi chiamavo Mattia Pascal.']],
  ],

  SENT: 'Inviata',
  JOURNAL: 'Una giornata di carta',
};

export function demoEvents(hours = 9, now = Date.now()) {
  seed = 42;
  const { SITES, SEARCHES, PEOPLE, NEWS, THREADS, NEWS_SUBJ, CMDS, COMMITS, NOTES, PODCAST, BOOKS, SENT, JOURNAL } = L({ en: DATA_EN, it: DATA_IT });
  const events = [];
  const add = (source, kind, ts, title, detail, meta = {}, url = null) =>
    events.push({ id: `${source}:demo:${hash(`${ts}:${title}:${events.length}`)}`, source, kind, ts, title, detail, url, meta });
  const start = hourStart(now) - (hours - 1) * HOUR;

  for (let h = 0; h < hours; h++) {
    const H = start + h * HOUR;
    const limit = h === hours - 1 ? now - H : HOUR;
    const at = () => H + Math.floor(rnd() * limit);
    const hourOfDay = new Date(H).getHours();
    const quiet = hourOfDay < 7 || hourOfDay === 13;

    // Safari
    const focus = pick(Object.keys(SITES));
    const nVisits = quiet ? 3 : 8 + Math.floor(rnd() * 14);
    for (let i = 0; i < nVisits; i++) {
      const site = rnd() < 0.55 ? focus : pick(Object.keys(SITES));
      const title = pick(SITES[site]);
      add('safari', 'visit', at(), title, null, { host: site }, `https://${site}/`);
    }
    const nSearch = quiet ? 0 : Math.floor(rnd() * 4);
    for (let i = 0; i < nSearch; i++) {
      add('safari', 'search', at(), pick(SEARCHES), 'Google', { host: 'google.com', engine: 'Google' });
    }

    // Mail
    const nMail = quiet ? 1 : 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < nMail; i++) {
      const [name, addr] = pick(NEWS);
      add('mail', 'received', at(), pick(NEWS_SUBJ), name, { from: addr, fromName: name, newsletter: true, unread: rnd() < 0.6, mailbox: 'INBOX' });
    }
    if (!quiet && rnd() < 0.7) {
      const subj = pick(THREADS);
      const [name, addr] = pick(PEOPLE);
      const t0 = at();
      add('mail', 'received', t0, subj, name, { from: addr, fromName: name, unread: false, mailbox: 'INBOX' });
      if (rnd() < 0.7) add('mail', 'sent', Math.min(t0 + 9 * 60e3, H + limit - 1), `Re: ${subj}`, name, { to: [name], mailbox: SENT });
    }

    // Terminal
    if (!quiet && rnd() < 0.8) {
      const n = 6 + Math.floor(rnd() * 20);
      for (let i = 0; i < n; i++) {
        const c = pick(CMDS);
        add('terminal', 'command', at(), c, 'zsh', { shell: 'zsh', family: c.split(' ').slice(0, c.startsWith('git') || c.startsWith('npm') || c.startsWith('docker') || c.startsWith('brew') ? 2 : 1).join(' '), timed: true });
      }
      if (rnd() < 0.6) {
        const m = pick(COMMITS);
        add('terminal', 'command', at(), `git commit -m "${m}"`, 'zsh', { shell: 'zsh', family: 'git commit', timed: true });
      }
    }

    // Notes
    if (rnd() < 0.45) {
      const [title, snippet, folder] = pick(NOTES);
      const id = NOTES.findIndex((n) => n[0] === title) + 1;
      add('notes', rnd() < 0.3 ? 'created' : 'edited', at(), title, folder, { noteId: id, folder, snippet, locked: false });
    }

    // Journal (evening)
    if (hourOfDay >= 21 || h === hours - 2) {
      add('journal', 'entry', at(), JOURNAL, null, { words: 310, text: null });
    }

    // Podcasts
    if (rnd() < 0.3 || hourOfDay === 8) {
      const [show, title, desc, dur] = pick(PODCAST);
      add('podcasts', 'listened', at(), title, show, { episodeId: show, show, duration: dur, playhead: Math.floor(dur * (0.3 + rnd() * 0.7)), description: desc });
    }

    // Books
    if (rnd() < 0.3) {
      const [title, author, id, hls] = pick(BOOKS);
      const t = at();
      add('books', 'opened', t, title, author, { assetId: id, author, progress: 0.2 + rnd() * 0.6 });
      if (rnd() < 0.7) add('books', 'highlight', Math.min(t + 5 * 60e3, H + limit - 1), title, author, { assetId: id, author, text: pick(hls) });
    }
  }
  return events;
}

export function seedDemo(store) {
  const events = demoEvents();
  return store.insertEvents(events);
}
