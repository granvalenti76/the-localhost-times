/**
 * From the raw stream of events to "stories": groups of events worth an article.
 */
import { SECTIONS } from './sections.js';
import { hhmm } from '../util.js';
import { tr, lang } from '../i18n.js';

const log2 = (n) => Math.log2(Math.max(1, n));

const groupBy = (arr, fn) => {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};

const uniqBy = (arr, fn) => {
  const seen = new Set();
  return arr.filter((x) => {
    const k = fn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// Keep subdomains with an identity of their own apart (mail.google.com ≠ google.com),
// but merge the trivial variants (www., m., mobile., language).
export function siteOf(host = '') {
  return host.replace(/^(www\d?|m|mobile|amp|[a-z]{2}(-[a-z]{2})?)\.(?=[^.]+\.[^.]+)/i, '');
}

export function registrable(host = '') {
  const p = host.split('.');
  if (p.length <= 2) return host;
  const sld = p[p.length - 2];
  if (p[p.length - 1].length === 2 && ['co', 'com', 'org', 'net', 'gov', 'ac', 'edu'].includes(sld)) {
    return p.slice(-3).join('.');
  }
  return p.slice(-2).join('.');
}

const cleanTitle = (t = '', site = '') =>
  t.replace(new RegExp(`\\s*[|\\-–—·:]\\s*(${site.split('.')[0]}|${site})[^|–—]*$`, 'i'), '').trim() || t;

const GENERIC_TITLE = /^(just a moment|attention required|one moment|un momento|caricamento|loading|redirecting|please wait|access denied|403 forbidden|404|page not found|home|homepage|login|accedi|sign in|log in|feed|explore|esplora|notifiche|notifications|messages|messaggi|amici|friends|watch|search|ricerca|untitled|nuova scheda|new tab)$/i;
export function isGeneric(title = '', site = '') {
  const t = title.toLowerCase().replace(/\s*[/|·–—-]\s*.*$/, '').replace(/[.…!]+$/, '').trim();
  const brand = registrable(site).split('.')[0];
  return t.length < 4 || t === site || t === brand || t.replace(/\s+/g, '') === brand || GENERIC_TITLE.test(t)
    || /^[\w.-]+\.[a-z]{2,}$/.test(t) || t.replace(/\(\d+\)\s*/, '') === brand;
}

const normSubject = (s = '') =>
  s.replace(/^\s*((re|r|fwd?|i|inoltra|aw|wg|tr|rif)\s*(\[\d+\])?\s*:\s*)+/i, '').trim().toLowerCase();

const TRIVIAL = new Set(['ls', 'cd', 'clear', 'pwd', 'exit', 'll', 'la', 'cls', 'history', 'z', 'which', 'echo', 'cat']);

function story(source, kind, key, events, weight, extra = {}) {
  return {
    id: `${source}:${kind}:${key}`.replace(/[^\w:.-]+/g, '-').slice(0, 120),
    source,
    section: SECTIONS[source].name,
    kind,
    events,
    weight,
    first: events[0]?.ts,
    last: events[events.length - 1]?.ts,
    ...extra,
  };
}

function safariStories(evs) {
  const out = [];
  const searches = evs.filter((e) => e.kind === 'search');
  const visits = evs.filter((e) => e.kind === 'visit');
  const uniqSearches = uniqBy(searches, (e) => e.title.toLowerCase());
  if (uniqSearches.length) {
    out.push(story('safari', 'searches', 'all', uniqSearches, 2.5 + log2(uniqSearches.length + 1) * 1.2, {
      topic: uniqSearches[0].title,
    }));
  }
  const small = [];
  for (const [site, list] of groupBy(visits, (e) => siteOf(e.meta.host))) {
    const pages = uniqBy(list, (e) => e.title);
    if (pages.length >= 3) {
      pages.forEach((p) => { p.clean = cleanTitle(p.title, registrable(site)); p.generic = isGeneric(p.clean, site); });
      const informative = pages.filter((p) => !p.generic).length;
      // informative titles first (longer = more specific), generic ones last
      pages.sort((a, b) => (a.generic - b.generic) || (b.clean.length - a.clean.length));
      out.push(story('safari', 'site', site, list, 1.2 + log2(informative + 1) * 1.4 + log2(list.length) * 0.3, {
        topic: site, pages, informative,
      }));
    } else small.push(...list);
  }
  const sites = [...groupBy(small, (e) => siteOf(e.meta.host)).keys()];
  if (sites.length >= 2) {
    out.push(story('safari', 'roundup', 'web', small, 1 + log2(sites.length + 1) * 0.6, { topic: tr({ en: 'roundup', it: 'rassegna' }), sites }));
  } else if (small.length) {
    out.push(story('safari', 'roundup', 'web', small, 0.6, { topic: tr({ en: 'roundup', it: 'rassegna' }), sites }));
  }
  return out;
}

function webmailStory(evs) {
  const reads = uniqBy(evs.filter((e) => e.kind === 'read'), (e) => normSubject(e.title));
  const counts = evs.filter((e) => e.kind === 'inbox' && Number.isFinite(e.meta.unreadCount));
  if (!reads.length && !counts.length) return [];
  const unreadStart = counts[0]?.meta.unreadCount ?? null;
  const unreadEnd = counts.at(-1)?.meta.unreadCount ?? null;
  const all = evs.filter((e) => e.kind === 'read' || e.kind === 'inbox');
  return [story('mail', 'webmail', 'gmail', all, (reads.length ? 2.5 : 1) + log2(reads.length + 1) * 1.2 + (counts.length ? 0.4 : 0), {
    topic: reads[0]?.title || tr({ en: 'Inbox', it: 'Posta in arrivo' }),
    reads,
    service: evs[0].meta.webmail || 'Gmail',
    unreadStart,
    unreadEnd,
    inboxChecks: counts.length,
  })];
}

function mailStories(all) {
  const out = webmailStory(all.filter((e) => e.meta.webmail));
  const evs = all.filter((e) => !e.meta.webmail);
  const rest = [];
  for (const [subj, list] of groupBy(evs, (e) => normSubject(e.title))) {
    const sent = list.filter((e) => e.kind === 'sent');
    const people = [...new Set(list.map((e) => (e.kind === 'sent' ? e.meta.to?.[0] : e.meta.fromName || e.meta.from)).filter(Boolean))];
    const allNews = list.every((e) => e.meta.newsletter);
    if (!allNews && (list.length >= 2 || sent.length)) {
      out.push(story('mail', 'thread', subj || 'senza-oggetto' /* kept as is: it is part of story ids already in the database */, list, (sent.length ? 4 : 3) + list.length * 0.45, {
        topic: list[0].title, people, sentCount: sent.length,
      }));
    } else rest.push(...list);
  }
  if (rest.length) {
    out.push(story('mail', 'inbox', 'all', rest, 1.4 + log2(rest.length) * 0.9, {
      topic: tr({ en: 'incoming mail', it: 'posta in arrivo' }),
      newsletters: rest.filter((e) => e.meta.newsletter).length,
      unread: rest.filter((e) => e.meta.unread).length,
    }));
  }
  return out;
}

function terminalStories(evs) {
  if (!evs.length) return [];
  const serious = evs.filter((e) => !TRIVIAL.has(e.meta.family));
  const fam = [...groupBy(serious, (e) => e.meta.family)].map(([f, l]) => ({ family: f, count: l.length }))
    .sort((a, b) => b.count - a.count);
  const commits = serious
    .filter((e) => e.meta.family === 'git commit')
    .map((e) => {
      const m = /-[a-z]*m\s+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(e.title);
      return m && (m[1] ?? m[2] ?? m[3]);
    })
    .filter(Boolean);
  const hosts = serious.filter((e) => e.meta.family === 'ssh').map((e) => e.title.split(/\s+/).pop());
  const weight = serious.length ? 2 + log2(serious.length + 1) * 1.3 + commits.length * 0.6 : 0.5;
  return [story('terminal', 'session', 'all', evs, weight, {
    topic: fam[0]?.family || tr({ en: 'terminal', it: 'terminale' }), families: fam.slice(0, 8), commits, hosts: [...new Set(hosts)],
    serious: serious.length,
  })];
}

function perKey(source, kind, keyFn, baseWeight, weightFn) {
  return (evs) => [...groupBy(evs, keyFn)].map(([k, list]) =>
    story(source, kind, k, list, baseWeight + weightFn(list), { topic: list[0].title }));
}

const notesStories = perKey('notes', 'note', (e) => e.meta.noteId, 3,
  (l) => l.length * 0.4 + (l.some((e) => e.kind === 'created') ? 0.8 : 0) + (l.at(-1).meta.snippet?.length > 200 ? 0.6 : 0));
const journalStories = perKey('journal', 'entry', (e) => e.id.split(':').slice(0, 3).join(':'), 2.5,
  (l) => (l.at(-1).meta.text ? 2.5 : 0) + Math.min(1.5, (l.at(-1).meta.words || 0) / 200));
const podcastStories = perKey('podcasts', 'episode', (e) => e.meta.episodeId, 3,
  (l) => Math.min(3, (l.at(-1).meta.playhead || 0) / 900));
const bookStories = perKey('books', 'book', (e) => e.meta.assetId, 3,
  (l) => l.filter((e) => e.kind === 'highlight').length * 0.8);

/** Files: hot folders (one story each), small ones together, and the downloads. */
function filesStories(evs) {
  const out = [];
  const dls = evs.filter((e) => e.kind === 'downloaded');
  const work = evs.filter((e) => e.kind !== 'downloaded');
  const countBy = (list, fn) => Object.entries(list.reduce((m, e) => { const k = fn(e); if (k) m[k] = (m[k] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
  const small = [];
  for (const [folder, list] of groupBy(work, (e) => e.meta.folder)) {
    // with file names hidden (the default) files can't be told apart: count saves instead
    const named = !/^\./.test(list[0].title);
    const files = named ? new Set(list.map((e) => `${e.meta.dir}/${e.title}`)).size : null;
    if (list.length >= 3) {
      out.push(story('files', 'folder', folder, list, 1.5 + log2(list.length + 1) * 1.1 + (list[0].meta.project ? 0.6 : 0), {
        topic: folder,
        project: list[0].meta.project,
        files,
        created: list.filter((e) => e.kind === 'created').length,
        exts: countBy(list, (e) => e.meta.ext).slice(0, 5),
        dirs: countBy(list, (e) => (e.meta.dir === folder ? '.' : e.meta.dir.startsWith(`${folder}/`) ? e.meta.dir.slice(folder.length + 1) : e.meta.dir)).slice(0, 4),
      }));
    } else small.push(...list);
  }
  if (small.length >= 2) {
    out.push(story('files', 'folders', 'misc', small, 0.8 + log2(small.length) * 0.5, {
      topic: tr({ en: 'files', it: 'file' }), folders: countBy(small, (e) => e.meta.folder).slice(0, 6),
    }));
  }
  if (dls.length) {
    out.push(story('files', 'downloads', 'all', dls, 2 + log2(dls.length + 1), {
      topic: tr({ en: 'downloads', it: 'download' }),
      sites: countBy(dls, (e) => e.meta.site).slice(0, 5),
      exts: countBy(dls, (e) => e.meta.ext).slice(0, 5),
    }));
  }
  return out;
}

const BUILDERS = {
  safari: safariStories, mail: mailStories, terminal: terminalStories, notes: notesStories,
  journal: journalStories, podcasts: podcastStories, books: bookStories, files: filesStories,
};

export function buildStories(events) {
  const out = [];
  for (const [src, list] of groupBy(events, (e) => e.source)) {
    if (BUILDERS[src]) out.push(...BUILDERS[src](list));
  }
  return out.sort((a, b) => b.weight - a.weight);
}

function moment(ms) {
  const h = new Date(ms).getHours();
  const [night, morning, noon, afternoon, evening] = tr({
    en: ['night', 'morning', 'midday', 'afternoon', 'evening'],
    it: ['notte', 'mattina', 'mezzogiorno', 'pomeriggio', 'sera'],
  });
  if (h < 6) return night;
  if (h < 12) return morning;
  if (h < 14) return noon;
  if (h < 19) return afternoon;
  return evening;
}

/** The story described in words, for the writer (the LLM). */
export function factSheet(s) {
  const en = lang() === 'en';
  const q = (x) => (en ? `“${x}”` : `«${x}»`);
  const T = (e, i) => (en ? e : i);
  const L = [];
  const t = (e) => hhmm(e.ts);
  L.push(T(`Section: ${s.section}`, `Sezione: ${s.section}`));
  L.push(T(`Time span: ${hhmm(s.first)}–${hhmm(s.last)} (time of day: ${moment(s.first)})`, `Intervallo: ${hhmm(s.first)}–${hhmm(s.last)} (momento della giornata: ${moment(s.first)})`));
  switch (s.kind) {
    case 'searches':
      L.push(T(`Web searches (${s.events.length}):`, `Ricerche fatte sul web (${s.events.length}):`));
      s.events.slice(0, 30).forEach((e) => L.push(`- ${t(e)} [${e.detail}] ${q(e.title)}`));
      break;
    case 'site':
      L.push(T(`Site: ${s.topic} — ${s.events.length} visits, ${s.pages.length} different pages.`, `Sito: ${s.topic} — ${s.events.length} visite, ${s.pages.length} pagine diverse.`));
      [...s.pages].sort((a, b) => a.ts - b.ts).slice(0, 25).forEach((e) => L.push(`- ${t(e)} ${q(e.clean)}${e.generic ? T(' (generic page)', ' (pagina generica)') : ''}`));
      break;
    case 'roundup':
      L.push(T(`Short visits to different sites (${s.events.length}):`, `Visite brevi su siti diversi (${s.events.length}):`));
      uniqBy(s.events, (e) => e.title).slice(0, 20).forEach((e) => L.push(`- ${t(e)} ${e.meta.host}: ${q(e.title)}`));
      break;
    case 'thread':
      L.push(T(`Email conversation ${q(s.topic)} — ${s.events.length} messages, ${s.sentCount} sent by the owner.`, `Conversazione email ${q(s.topic)} — ${s.events.length} messaggi, ${s.sentCount} inviati dal proprietario.`));
      s.events.forEach((e) => L.push(`- ${t(e)} ${e.kind === 'sent'
        ? T(`SENT to ${e.meta.to?.join(', ') || '?'}`, `INVIATA a ${e.meta.to?.join(', ') || '?'}`)
        : T(`RECEIVED from ${e.meta.fromName || e.meta.from}`, `RICEVUTA da ${e.meta.fromName || e.meta.from}`)}: ${q(e.title)}${e.meta.summary ? ` — ${e.meta.summary}` : ''}`));
      break;
    case 'webmail':
      L.push(T(`Mail read in ${s.service} in the browser: ${s.reads.length} emails opened, inbox checked ${s.inboxChecks} times.`, `Posta letta su ${s.service} nel browser: ${s.reads.length} email aperte, casella controllata ${s.inboxChecks} volte.`));
      if (s.unreadEnd != null) {
        const v = s.unreadStart === s.unreadEnd ? s.unreadEnd : T(`from ${s.unreadStart} to ${s.unreadEnd}`, `da ${s.unreadStart} a ${s.unreadEnd}`);
        L.push(T(`Unread messages in the inbox: ${v}.`, `Messaggi non letti in casella: ${v}.`));
      }
      s.reads.slice(0, 25).forEach((e) => L.push(T(`- ${t(e)} opened the email ${q(e.title)}`, `- ${t(e)} aperta l'email ${q(e.title)}`)));
      L.push(T('(We know nothing about senders or text: only the subjects.)', '(Del mittente e del testo non sappiamo nulla: conosciamo solo gli oggetti.)'));
      break;
    case 'inbox':
      L.push(T(`Incoming mail: ${s.events.length} messages (${s.newsletters} newsletters/notifications, ${s.unread} still unread).`, `Posta in arrivo: ${s.events.length} messaggi (${s.newsletters} newsletter/notifiche, ${s.unread} ancora da leggere).`));
      s.events.slice(0, 25).forEach((e) => L.push(`- ${t(e)} ${T('from', 'da')} ${e.meta.fromName || e.meta.from}${e.meta.newsletter ? ' (newsletter)' : ''}: ${q(e.title)}`));
      break;
    case 'session':
      L.push(T(`Terminal commands: ${s.events.length} in all, ${s.serious} non-trivial.`, `Comandi nel terminale: ${s.events.length} totali, ${s.serious} non banali.`));
      if (s.families.length) L.push(`${T('Command families', 'Famiglie di comandi')}: ${s.families.map((f) => `${f.family} ×${f.count}`).join(', ')}`);
      if (s.commits.length) L.push(`${T('Git commit messages', 'Messaggi di commit git')}: ${s.commits.map(q).join('; ')}`);
      if (s.hosts.length) L.push(`${T('ssh connections to', 'Connessioni ssh verso')}: ${s.hosts.join(', ')}`);
      L.push(T('Some commands:', 'Alcuni comandi:'));
      s.events.filter((e) => !TRIVIAL.has(e.meta.family)).slice(-25).forEach((e) => L.push(`- ${e.meta.timed ? t(e) : '~'} $ ${e.title.slice(0, 160)}`));
      break;
    case 'note': {
      const last = s.events.at(-1);
      const created = s.events.some((e) => e.kind === 'created');
      L.push(T(
        `Note ${q(last.title)}${last.meta.folder ? ` in the folder ${q(last.meta.folder)}` : ''}: ${created ? 'created' : 'edited'} (${s.events.length} saves).`,
        `Nota ${q(last.title)}${last.meta.folder ? ` nella cartella ${q(last.meta.folder)}` : ''}: ${created ? 'creata' : 'modificata'} (${s.events.length} salvataggi).`,
      ));
      if (last.meta.locked) L.push(T('The note is password-protected: contents not available.', 'La nota è protetta da password: contenuto non disponibile.'));
      if (last.meta.snippet) L.push(`${T('Excerpt', 'Estratto')}: ${q(last.meta.snippet)}`);
      break;
    }
    case 'entry': {
      const e = s.events.at(-1);
      L.push(T(
        `New entry in the personal diary (Journal app) at ${t(e)}.${e.title ? ` Title: ${q(e.title)}.` : ''}${e.meta.words ? ` About ${e.meta.words} words.` : ''}`,
        `Nuova voce nel diario personale (app Journal) alle ${t(e)}.${e.title ? ` Titolo: ${q(e.title)}.` : ''}${e.meta.words ? ` Circa ${e.meta.words} parole.` : ''}`,
      ));
      L.push(e.meta.text
        ? `${T('Text', 'Testo')}: ${q(e.meta.text)}`
        : T('The contents are private: don\'t quote or invent them, respect the privacy.', 'Il contenuto è riservato: non citarlo e non inventarlo, rispetta la riservatezza.'));
      break;
    }
    case 'episode': {
      const e = s.events.at(-1);
      const m = e.meta;
      L.push(`${T('Podcast', 'Podcast')} ${q(m.show || '?')}${m.author ? ` (${m.author})` : ''}, ${T('episode', 'episodio')} ${q(e.title)}.`);
      if (m.duration) L.push(T(`Length ${Math.round(m.duration / 60)} min; listened up to minute ${Math.round((m.playhead || 0) / 60)}.`, `Durata ${Math.round(m.duration / 60)} min; ascoltato fino al minuto ${Math.round((m.playhead || 0) / 60)}.`));
      if (m.description) L.push(`${T('Episode description', 'Descrizione dell\'episodio')}: ${m.description}`);
      break;
    }
    case 'folder': {
      L.push(T(
        `Folder ${q(s.topic)}${s.project ? ` (git project ${q(s.project)})` : ''}: ${s.events.length} saves${s.files ? ` on ${s.files} files` : ''}, ${s.created} of them new files. File names are private.`,
        `Cartella ${q(s.topic)}${s.project ? ` (progetto git ${q(s.project)})` : ''}: ${s.events.length} salvataggi${s.files ? ` su ${s.files} file` : ''}, di cui ${s.created} file nuovi. I nomi dei file sono riservati.`,
      ));
      if (s.exts.length) L.push(`${T('File types', 'Tipi di file')}: ${s.exts.map((x) => `.${x.k} ×${x.n}`).join(', ')}`);
      if (s.dirs.length > 1) L.push(`${T('Subfolders', 'Sottocartelle')}: ${s.dirs.map((x) => `${x.k} ×${x.n}`).join(', ')}`);
      if (!/^\./.test(s.events[0].title)) L.push(`${T('Files', 'File')}: ${[...new Set(s.events.map((e) => e.title))].slice(0, 12).map(q).join(', ')}`);
      L.push(`${T('First and last save', 'Primo e ultimo salvataggio')}: ${hhmm(s.first)}, ${hhmm(s.last)}`);
      break;
    }
    case 'folders':
      L.push(T(`A few files saved here and there (${s.events.length}):`, `Qualche file salvato qua e là (${s.events.length}):`));
      s.folders.forEach((f) => L.push(`- ${q(f.k)} ×${f.n}`));
      break;
    case 'downloads':
      L.push(T(`Downloads: ${s.events.length} files.`, `Download: ${s.events.length} file.`));
      s.events.slice(0, 20).forEach((e) => L.push(`- ${t(e)} ${q(e.title)}${e.meta.site ? ` ${T('from', 'da')} ${e.meta.site}` : ''}${e.meta.size ? ` (${Math.max(1, Math.round(e.meta.size / 1e6))} MB)` : ''}`));
      break;
    case 'book': {
      const e = s.events[0];
      const opened = s.events.filter((x) => x.kind === 'opened').at(-1);
      L.push(`${T('Book', 'Libro')} ${q(e.title)}${e.meta.author ? ` ${T('by', 'di')} ${e.meta.author}` : ''}.`);
      if (opened?.meta.progress != null) L.push(`${T('Reading progress', 'Avanzamento lettura')}: ${Math.round(opened.meta.progress * 100)}%.`);
      s.events.filter((x) => x.kind === 'highlight').forEach((h) => L.push(`- ${T('Highlighted at', 'Evidenziato alle')} ${t(h)}: ${q(h.meta.text)}${h.meta.note ? ` (${T('note', 'nota')}: ${h.meta.note})` : ''}`));
      break;
    }
  }
  return L.join('\n');
}
