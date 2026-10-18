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
  DOCS: 'Documents/Invoices',
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
  DOCS: 'Documents/Fatture',
};

export function demoEvents(hours = 9, now = Date.now()) {
  seed = 42;
  const { SITES, SEARCHES, PEOPLE, NEWS, THREADS, NEWS_SUBJ, CMDS, COMMITS, NOTES, PODCAST, BOOKS, SENT, JOURNAL, DOCS } = L({ en: DATA_EN, it: DATA_IT });
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
        const tc = at();
        add('terminal', 'command', tc, `git commit -m "${m}"`, 'zsh', { shell: 'zsh', family: 'git commit', timed: true });
        // the same commit as the repository's reflog sees it, with its size
        const added = 4 + Math.floor(rnd() * 180);
        add('git', 'commit', tc + 2000, m, 'dailymac', { repo: 'dailymac', branch: 'main', hash: hash(m).slice(0, 10), added, removed: Math.floor(added * rnd() * 0.6), files: 1 + Math.floor(rnd() * 6) });
      }
    }

    // The calendar and the reminders
    if (hourOfDay === 10) add('calendar', 'appointment', H + 30 * 60e3, 'Standup', null, { end: H + 45 * 60e3, minutes: 15 });
    if (hourOfDay === 15) add('calendar', 'appointment', H, L({ en: 'Call with Martha', it: 'Chiamata con Marta' }), null, { end: H + 40 * 60e3, minutes: 40 });
    if (!quiet && rnd() < 0.3) add('reminders', 'done', at(), pick(L({ en: ['Pay the electricity bill', 'Return the library books', 'Answer Luca', 'Buy coffee'], it: ['Pagare la bolletta della luce', 'Riportare i libri in biblioteca', 'Rispondere a Luca', 'Comprare il caffè'] })), null, { list: L({ en: 'Home', it: 'Casa' }) });

    // Files: a project folder, a documents folder, the downloads
    if (!quiet && rnd() < 0.75) {
      const project = 'Work/git/localhost-times';
      const n = 4 + Math.floor(rnd() * 12);
      for (let i = 0; i < n; i++) {
        const [dir, ext] = pick([['server', 'js'], ['server/newsroom', 'js'], ['web/src/components', 'jsx'], ['web/src', 'css'], ['', 'md']]);
        add('files', rnd() < 0.15 ? 'created' : 'changed', at(), `.${ext}`, project, { folder: project, dir: dir ? `${project}/${dir}` : project, project: 'localhost-times', ext, size: 2000 + Math.floor(rnd() * 30000) });
      }
    }
    if (rnd() < 0.2) {
      const ext = pick(['pdf', 'docx']);
      add('files', 'changed', at(), `.${ext}`, DOCS, { folder: DOCS, dir: DOCS, project: null, ext, size: 80000 });
      const t = at();
      add('files', 'created', t, `.${ext}`, DOCS, { folder: DOCS, dir: DOCS, project: null, ext, size: 60000 });
      // a third save, so the folder makes a story of its own (the project folder joins its commits)
      add('files', 'changed', t + 60e3, `.${ext}`, DOCS, { folder: DOCS, dir: DOCS, project: null, ext, size: 61000 });
    }
    if (rnd() < 0.3) {
      const [ext, site] = pick([['dmg', 'github.com'], ['pdf', 'arxiv.org'], ['zip', 'fonts.google.com']]);
      add('files', 'downloaded', at(), `.${ext}`, 'Downloads', { folder: 'Downloads', dir: 'Downloads', project: null, ext, site, size: 4e6 + Math.floor(rnd() * 9e7) });
    }
    // and one download the first hour, whatever the dice say (no draw: the rest of the day stays the same)
    if (h === 0) add('files', 'downloaded', H + 20 * 60e3, '.pdf', 'Downloads', { folder: 'Downloads', dir: 'Downloads', project: null, ext: 'pdf', site: 'arxiv.org', size: 2.4e6 });

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

    // Time: the app in front, stretch by stretch (lunch is spent away from the Mac)
    {
      const APPS = ['Xcode', 'Xcode', 'Safari', 'Safari', 'Terminal', 'Mail', 'Slack', 'Notes', 'Visual Studio Code'];
      let t = H;
      const stop = H + limit;
      while (t < stop - 60e3) {
        const away = hourOfDay === 13 ? true : rnd() < 0.08;
        const mins = away ? 5 + Math.floor(rnd() * 20) : pick([1, 1, 2, 3, 4, 6, 9, 14, 22, 35]);
        const end = Math.min(stop, t + mins * 60e3);
        const app = away ? null : pick(APPS);
        events.push({ id: `apps:demo:${t}`, source: 'apps', kind: away ? 'away' : 'focus', ts: t, title: away ? (L({ en: 'Away from the Mac', it: 'Lontano dal Mac' })) : app, detail: null, url: null, meta: { app, seconds: Math.round((end - t) / 1000), end } });
        t = end;
      }
    }

    // The Mac: awake in the morning, asleep over lunch
    if (h === 0) add('power', 'wake', H + 2 * 60e3, L({ en: 'Woke up', it: 'Risveglio' }), 'lid', { reason: 'lid', power: 'battery', charge: 92 });
    if (hourOfDay === 13) {
      add('power', 'sleep', H + 4 * 60e3, L({ en: 'Went to sleep', it: 'A riposo' }), 'lid', { reason: 'lid', power: 'battery', charge: 58 });
      add('power', 'wake', H + 52 * 60e3, L({ en: 'Woke up', it: 'Risveglio' }), 'lid', { reason: 'lid', power: 'ac', charge: 57 });
    }

    // The photographer: a burst at lunch, a screenshot now and then
    if (hourOfDay === 13) {
      for (let i = 0; i < 6; i++) add('photos', 'photo', H + 20 * 60e3 + i * 15e3, L({ en: 'Photo', it: 'Foto' }), null, { subtype: i === 0 ? 'live' : null, favorite: i === 2 });
      add('photos', 'video', H + 24 * 60e3, 'Video', null, { subtype: null, seconds: 18 });
    } else if (!quiet && rnd() < 0.35) {
      add('photos', 'screenshot', at(), L({ en: 'Screenshot on the Mac', it: 'Screenshot sul Mac' }), null, { subtype: 'screenshot', mac: true });
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

// Two weeks of history for the Spotlight desk: a background of ordinary days, and five stories
// for its detectors to find (a trip being planned, an obsession, a purchase, a project gone
// quiet, mornings that start later).
const STORIES = {
  en: {
    city: 'Lisbon',
    searches: ['flights Boston Lisbon', 'Lisbon what to see in 3 days', 'tram 28 Lisbon times'],
    page: 'Lisbon travel guide – Lonely Planet',
    mail: ['TAP Air Portugal', 'booking@tap.example', 'Booking confirmed: Boston → Lisbon'],
    file: 'Lisbon_guide.pdf',
    note: 'Lisbon — things to see',
    chess: ['Play Chess Online for Free – Chess.com', 'Puzzles – Chess.com', 'Chess.com – Home'],
    buy: ['kobo vs kindle', 'kobo libra colour price', 'best ereader 2026', 'kobo clara review'],
    shop: 'Kobo Libra Colour : Amazon.com',
  },
  it: {
    city: 'Lisbona',
    searches: ['voli Milano Lisbona', 'Lisbona cosa vedere in 3 giorni', 'tram 28 Lisbona orari'],
    page: 'Lisbona: guida di viaggio – Lonely Planet',
    mail: ['TAP Air Portugal', 'booking@tap.example', 'Prenotazione confermata: Milano → Lisbona'],
    file: 'Guida_Lisbona.pdf',
    note: 'Lisbona — cose da vedere',
    chess: ['Gioca a scacchi online gratis – Chess.com', 'Problemi – Chess.com', 'Chess.com – Home'],
    buy: ['kobo vs kindle', 'kobo libra colour prezzo', 'migliore ereader 2026', 'kobo clara recensione'],
    shop: 'Kobo Libra Colour : Amazon.it',
  },
};

export function demoHistory(now = Date.now()) {
  seed = 7;
  const { SITES } = L({ en: DATA_EN, it: DATA_IT });
  const S = L(STORIES);
  const events = [];
  const add = (source, kind, ts, title, detail, meta = {}, url = null) =>
    events.push({ id: `${source}:hist:${hash(`${ts}:${title}:${events.length}`)}`, source, kind, ts, title, detail, url, meta });
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const at = (daysAgo, h, m = 0) => day0.getTime() - daysAgo * 24 * HOUR + h * HOUR + m * 60e3;
  const sites = Object.keys(SITES);
  for (let d = 14; d >= 1; d--) {
    // an ordinary day: it used to start around 9, lately around 10:30
    const startH = d >= 4 ? 8.75 + rnd() * 0.5 : 10.3 + rnd() * 0.4;
    for (let i = 0; i < 26; i++) {
      const t = at(d, startH + (i / 26) * (19 - startH), Math.floor(rnd() * 20));
      const site = pick(sites);
      add('safari', 'visit', t, pick(SITES[site]), null, { host: site }, `https://${site}/`);
    }
    // the TurboCode project: every working day until five days ago, then silence
    if (d >= 5) for (let i = 0; i < 4; i++) add('files', 'changed', at(d, 11 + i * 1.5, 7), ['.js', '.ts', '.json', '.md'][i], 'turbocode', { folder: 'turbocode', dir: 'Work/turbocode/src', project: 'turbocode', ext: ['js', 'ts', 'json', 'md'][i] });
  }
  // a trip being planned, across four apps
  add('safari', 'search', at(2, 21, 10), S.searches[0], 'Google', { host: 'google.com', engine: 'Google' });
  add('safari', 'search', at(2, 21, 16), S.searches[1], 'Google', { host: 'google.com', engine: 'Google' });
  add('safari', 'visit', at(2, 21, 18), S.page, null, { host: 'lonelyplanet.com' }, 'https://www.lonelyplanet.com/');
  add('mail', 'received', at(1, 9, 42), S.mail[2], S.mail[0], { from: S.mail[1], fromName: S.mail[0], unread: false, mailbox: 'INBOX' });
  add('files', 'downloaded', at(1, 12, 5), S.file, 'Downloads', { folder: 'Downloads', dir: 'Downloads', ext: 'pdf', site: 'tap.example' });
  add('notes', 'created', at(1, 22, 30), S.note, 'Notes', { folder: 'Notes', snippet: null });
  add('safari', 'search', now - 2 * HOUR, S.searches[2], 'Google', { host: 'google.com', engine: 'Google' });
  // chess.com: once in the fortnight before, then every evening
  add('safari', 'visit', at(9, 18, 20), S.chess[2], null, { host: 'chess.com' }, 'https://www.chess.com/');
  for (const [d, h, n] of [[3, 21, 3], [2, 13, 2], [2, 21.5, 4], [1, 18.8, 2], [1, 22.2, 3]]) {
    for (let i = 0; i < n; i++) add('safari', 'visit', at(d, h, i * 2), S.chess[i % 3], null, { host: 'chess.com' }, 'https://www.chess.com/');
  }
  // an e-reader being chosen
  add('safari', 'search', at(2, 12, 40), S.buy[0], 'Google', { host: 'google.com', engine: 'Google' });
  add('safari', 'search', at(1, 13, 5), S.buy[1], 'Google', { host: 'google.com', engine: 'Google' });
  add('safari', 'search', at(1, 13, 9), S.buy[2], 'Google', { host: 'google.com', engine: 'Google' });
  add('safari', 'search', now - 3 * HOUR, S.buy[3], 'Google', { host: 'google.com', engine: 'Google' });
  add('safari', 'visit', now - 3 * HOUR + 4 * 60e3, S.shop, null, { host: 'amazon.com' }, 'https://www.amazon.com/');
  return events;
}

export function seedDemo(store) {
  // two days: enough for the morning paper's full day, from one press to the next
  return store.insertEvents([...demoHistory(), ...demoEvents(48)]);
}

/** The demo's tip box: one tip, waiting for the newsroom. */
export async function seedDemoDesk(store) {
  const { addTip, tips } = await import('./newsroom/tips.js');
  if (tips(store, { limit: 1 }).length) return 0;
  const { tr } = await import('./i18n.js');
  addTip(store, { text: tr({ en: 'The cat walked on the keyboard twice this morning.', it: 'Il gatto è passato due volte sulla tastiera stamattina.' }), via: 'web', ts: Date.now() - 20 * 60e3 });
  return 1;
}
