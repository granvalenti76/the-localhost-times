/**
 * Dal flusso grezzo di eventi alle "storie": gruppi di eventi che meritano un articolo.
 */
import { SECTIONS } from './sections.js';
import { hhmm } from '../util.js';

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

// Teniamo separati i sottodomini con identità propria (mail.google.com ≠ google.com),
// ma uniamo le varianti banali (www., m., mobile., lingua).
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
      // i titoli informativi prima (più lunghi = più specifici), quelli generici in fondo
      pages.sort((a, b) => (a.generic - b.generic) || (b.clean.length - a.clean.length));
      out.push(story('safari', 'site', site, list, 1.2 + log2(informative + 1) * 1.4 + log2(list.length) * 0.3, {
        topic: site, pages, informative,
      }));
    } else small.push(...list);
  }
  const sites = [...groupBy(small, (e) => siteOf(e.meta.host)).keys()];
  if (sites.length >= 2) {
    out.push(story('safari', 'roundup', 'web', small, 1 + log2(sites.length + 1) * 0.6, { topic: 'rassegna', sites }));
  } else if (small.length) {
    out.push(story('safari', 'roundup', 'web', small, 0.6, { topic: 'rassegna', sites }));
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
    topic: reads[0]?.title || 'Posta in arrivo',
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
      out.push(story('mail', 'thread', subj || 'senza-oggetto', list, (sent.length ? 4 : 3) + list.length * 0.45, {
        topic: list[0].title, people, sentCount: sent.length,
      }));
    } else rest.push(...list);
  }
  if (rest.length) {
    out.push(story('mail', 'inbox', 'all', rest, 1.4 + log2(rest.length) * 0.9, {
      topic: 'posta in arrivo',
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
    topic: fam[0]?.family || 'terminale', families: fam.slice(0, 8), commits, hosts: [...new Set(hosts)],
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

const BUILDERS = {
  safari: safariStories, mail: mailStories, terminal: terminalStories, notes: notesStories,
  journal: journalStories, podcasts: podcastStories, books: bookStories,
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
  if (h < 6) return 'notte';
  if (h < 12) return 'mattina';
  if (h < 14) return 'mezzogiorno';
  if (h < 19) return 'pomeriggio';
  return 'sera';
}

/** Descrizione testuale della storia per il redattore (LLM). */
export function factSheet(s) {
  const L = [];
  const t = (e) => hhmm(e.ts);
  L.push(`Sezione: ${s.section}`);
  L.push(`Intervallo: ${hhmm(s.first)}–${hhmm(s.last)} (momento della giornata: ${moment(s.first)})`);
  switch (s.kind) {
    case 'searches':
      L.push(`Ricerche fatte sul web (${s.events.length}):`);
      s.events.slice(0, 30).forEach((e) => L.push(`- ${t(e)} [${e.detail}] «${e.title}»`));
      break;
    case 'site':
      L.push(`Sito: ${s.topic} — ${s.events.length} visite, ${s.pages.length} pagine diverse.`);
      [...s.pages].sort((a, b) => a.ts - b.ts).slice(0, 25).forEach((e) => L.push(`- ${t(e)} «${e.clean}»${e.generic ? ' (pagina generica)' : ''}`));
      break;
    case 'roundup':
      L.push(`Visite brevi su siti diversi (${s.events.length}):`);
      uniqBy(s.events, (e) => e.title).slice(0, 20).forEach((e) => L.push(`- ${t(e)} ${e.meta.host}: «${e.title}»`));
      break;
    case 'thread':
      L.push(`Conversazione email «${s.topic}» — ${s.events.length} messaggi, ${s.sentCount} inviati dal proprietario.`);
      s.events.forEach((e) => L.push(`- ${t(e)} ${e.kind === 'sent' ? `INVIATA a ${e.meta.to?.join(', ') || '?'}` : `RICEVUTA da ${e.meta.fromName || e.meta.from}`}: «${e.title}»${e.meta.summary ? ` — ${e.meta.summary}` : ''}`));
      break;
    case 'webmail':
      L.push(`Posta letta su ${s.service} nel browser: ${s.reads.length} email aperte, casella controllata ${s.inboxChecks} volte.`);
      if (s.unreadEnd != null) L.push(`Messaggi non letti in casella: ${s.unreadStart === s.unreadEnd ? s.unreadEnd : `da ${s.unreadStart} a ${s.unreadEnd}`}.`);
      s.reads.slice(0, 25).forEach((e) => L.push(`- ${t(e)} aperta l'email «${e.title}»`));
      L.push('(Del mittente e del testo non sappiamo nulla: conosciamo solo gli oggetti.)');
      break;
    case 'inbox':
      L.push(`Posta in arrivo: ${s.events.length} messaggi (${s.newsletters} newsletter/notifiche, ${s.unread} ancora da leggere).`);
      s.events.slice(0, 25).forEach((e) => L.push(`- ${t(e)} da ${e.meta.fromName || e.meta.from}${e.meta.newsletter ? ' (newsletter)' : ''}: «${e.title}»`));
      break;
    case 'session':
      L.push(`Comandi nel terminale: ${s.events.length} totali, ${s.serious} non banali.`);
      if (s.families.length) L.push(`Famiglie di comandi: ${s.families.map((f) => `${f.family} ×${f.count}`).join(', ')}`);
      if (s.commits.length) L.push(`Messaggi di commit git: ${s.commits.map((c) => `«${c}»`).join('; ')}`);
      if (s.hosts.length) L.push(`Connessioni ssh verso: ${s.hosts.join(', ')}`);
      L.push('Alcuni comandi:');
      s.events.filter((e) => !TRIVIAL.has(e.meta.family)).slice(-25).forEach((e) => L.push(`- ${e.meta.timed ? t(e) : '~'} $ ${e.title.slice(0, 160)}`));
      break;
    case 'note': {
      const last = s.events.at(-1);
      L.push(`Nota «${last.title}»${last.meta.folder ? ` nella cartella «${last.meta.folder}»` : ''}: ${s.events.some((e) => e.kind === 'created') ? 'creata' : 'modificata'} (${s.events.length} salvataggi).`);
      if (last.meta.locked) L.push('La nota è protetta da password: contenuto non disponibile.');
      if (last.meta.snippet) L.push(`Estratto: «${last.meta.snippet}»`);
      break;
    }
    case 'entry': {
      const e = s.events.at(-1);
      L.push(`Nuova voce nel diario personale (app Journal) alle ${t(e)}.${e.title ? ` Titolo: «${e.title}».` : ''}${e.meta.words ? ` Circa ${e.meta.words} parole.` : ''}`);
      L.push(e.meta.text ? `Testo: «${e.meta.text}»` : 'Il contenuto è riservato: non citarlo e non inventarlo, rispetta la riservatezza.');
      break;
    }
    case 'episode': {
      const e = s.events.at(-1);
      const m = e.meta;
      L.push(`Podcast «${m.show || '?'}»${m.author ? ` (${m.author})` : ''}, episodio «${e.title}».`);
      if (m.duration) L.push(`Durata ${Math.round(m.duration / 60)} min; ascoltato fino al minuto ${Math.round((m.playhead || 0) / 60)}.`);
      if (m.description) L.push(`Descrizione dell'episodio: ${m.description}`);
      break;
    }
    case 'book': {
      const e = s.events[0];
      const opened = s.events.filter((x) => x.kind === 'opened').at(-1);
      L.push(`Libro «${e.title}»${e.meta.author ? ` di ${e.meta.author}` : ''}.`);
      if (opened?.meta.progress != null) L.push(`Avanzamento lettura: ${Math.round(opened.meta.progress * 100)}%.`);
      s.events.filter((x) => x.kind === 'highlight').forEach((h) => L.push(`- Evidenziato alle ${t(h)}: «${h.meta.text}»${h.meta.note ? ` (nota: ${h.meta.note})` : ''}`));
      break;
    }
  }
  return L.join('\n');
}
