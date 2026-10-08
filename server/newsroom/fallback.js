/**
 * La "Tipografia": scrive articoli senza LLM, a partire da modelli di testo.
 * Entra in servizio quando il redattore (il modello locale) è spento o sbaglia.
 */
import { hhmm } from '../util.js';

const hashNum = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pickFrom = (seed) => (arr) => arr[hashNum(seed + arr.length) % arr.length];

const q = (s) => `«${String(s).trim()}»`;
const list = (items) => {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a.join('');
  return `${a.slice(0, -1).join(', ')} e ${a.at(-1)}`;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const short = (s, n = 70) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function partOfDay(ms) {
  const h = new Date(ms).getHours();
  if (h < 6) return 'nottata';
  if (h < 12) return 'mattinata';
  if (h < 18) return 'pomeriggio';
  return 'serata';
}
const ART = { mattinata: 'la', pomeriggio: 'il', serata: 'la', nottata: 'la' };
const span = (s) => (s.first === s.last || s.last - s.first < 60e3
  ? `alle ${hhmm(s.first)}`
  : `tra le ${hhmm(s.first)} e le ${hhmm(s.last)}`);

const DULL = new Set(['ls', 'cd', 'clear', 'pwd', 'exit', 'll', 'la', 'history', 'echo', 'cat', 'z', 'which']);
function notable(s) {
  const seen = new Set();
  const cmds = s.events
    .filter((e) => !DULL.has(e.meta.family))
    .map((e) => e.title.split('\n')[0])
    .filter((c) => !seen.has(c) && seen.add(c))
    .slice(-5);
  if (!cmds.length) return null;
  return `Nel registro, tra gli altri: ${list(cmds.map((c) => `«${short(c, 60)}»`))}. ${s.events.length > 15
    ? 'Un ritmo sostenuto, da officina vera.'
    : 'Lavoro di precisione, più che di quantità.'}`;
}

const W = {
  searches(s, P) {
    const qs = s.events.map((e) => e.title);
    const n = qs.length;
    return {
      kicker: 'Le ricerche',
      headline: n === 1
        ? P([`Una sola domanda al motore di ricerca: ${q(short(qs[0], 60))}`, `${q(short(qs[0], 60))}: la domanda dell'ora`])
        : P([`${n} domande in un'ora, a cominciare da ${q(short(qs[0], 50))}`, `Dalla ricerca ${q(short(qs[0], 40))} ${n === 2 ? "a un'altra" : `ad altre ${n - 1}`}: cosa voleva sapere il Mac`]),
      dek: `${cap(span(s))} il proprietario ha interrogato ${list([...new Set(s.events.map((e) => e.detail))])} ${n === 1 ? 'una volta' : `${n} volte`}.`,
      body: [
        n === 1
          ? `La curiosità dell'ora sta tutta in una riga: ${q(qs[0])}. Una ricerca secca, ${span(s)}, senza ripensamenti apparenti.`
          : `Il registro delle ricerche, ${span(s)}, si apre con ${q(qs[0])} e prosegue con ${list(qs.slice(1, 5).map(q))}${n > 5 ? `, più altre ${n - 5}` : ''}.`,
        n >= 3
          ? P(['Letta in fila, la sequenza racconta un ragionamento che si affina passo dopo passo: ogni domanda corregge la precedente.',
            'Chi indaga così di solito non cerca una risposta qualsiasi, ma quella giusta.'])
          : P(['Poche domande ma mirate: segno che la risposta era a portata di mano.', 'Il resto, presumibilmente, lo ha fatto la pagina giusta.']),
      ],
    };
  },

  site(s, P) {
    const good = s.pages.filter((p) => !p.generic).map((p) => p.clean);
    const pod = partOfDay(s.first);
    const visits = s.events.length;
    const headline = good.length
      ? P([
        `${q(short(good[0], 48))}${good.length > 1 ? ` e altre ${good.length - 1} pagine` : ''}: ${ART[pod]} ${pod} su ${s.topic}`,
        `${cap(pod)} su ${s.topic}, a partire da ${q(short(good[0], 48))}`,
        `Su ${s.topic} ${plural(visits, 'visita', 'visite')}; in primo piano ${q(short(good[0], 48))}`,
      ])
      : P([
        `${cap(pod)} su ${s.topic}: ${plural(visits, 'visita', 'visite')} senza meta precisa`,
        `${s.topic}, ${plural(visits, 'passaggio', 'passaggi')} in un'ora: lo scorrimento continua`,
      ]);
    return {
      kicker: s.topic,
      headline,
      dek: `${cap(span(s))} il browser è tornato ${plural(visits, 'volta', 'volte')} su ${s.topic}${good.length ? `, passando per ${plural(good.length, 'pagina degna di nota', 'pagine degne di nota')}` : ''}.`,
      body: [
        good.length
          ? `Tra le pagine consultate spiccano ${list(good.slice(0, 4).map((p) => q(short(p, 80))))}${good.length === 5 ? ", oltre a un'altra" : good.length > 5 ? `, oltre ad altre ${good.length - 4}` : ''}.`
          : `I titoli delle pagine non dicono molto: home, feed, notifiche. ${P(['Il classico scorrimento, più abitudine che ricerca.', 'Una presenza costante, più che una lettura.'])}`,
        `La prima visita risale alle ${hhmm(s.first)}, l'ultima alle ${hhmm(s.last)}. ${visits > 12
          ? P(['Un andirivieni che parla da sé.', 'Il sito, a quanto risulta, è stato il punto fermo dell\'ora.'])
          : P(['Abbastanza per parlare di una vera sessione.', 'Una visita mirata, più che un vagabondaggio.'])}`,
      ],
    };
  },

  webmail(s, P) {
    const subj = s.reads.map((e) => e.title);
    const n = subj.length;
    const unread = s.unreadEnd != null
      ? (s.unreadStart !== s.unreadEnd ? `I non letti passano da ${s.unreadStart.toLocaleString('it-IT')} a ${s.unreadEnd.toLocaleString('it-IT')}.` : `In casella restano ${s.unreadEnd.toLocaleString('it-IT')} messaggi non letti.`)
      : '';
    return {
      kicker: s.service,
      headline: n
        ? (n === 1 ? `Aperta in ${s.service}: ${q(short(subj[0], 70))}` : `${n} email lette in ${s.service}, a partire da ${q(short(subj[0], 55))}`)
        : s.unreadEnd != null
          ? P([`${s.unreadEnd.toLocaleString('it-IT')} non letti: la casella guardata da lontano`, `Uno sguardo alla posta, e ${s.unreadEnd.toLocaleString('it-IT')} messaggi ancora in attesa`])
          : `Uno sguardo alla posta in ${s.service}`,
      dek: `${cap(span(s))}${n ? `, ${plural(n, 'email aperta', 'email aperte')}` : ''}${s.inboxChecks ? `; casella controllata ${plural(s.inboxChecks, 'volta', 'volte')}` : ''}.`,
      body: [
        n ? `Gli oggetti, nell'ordine: ${list(subj.slice(0, 5).map((x) => q(short(x, 70))))}${n > 5 ? ` e altri ${n - 5}` : ''}.` : 'Nessuna email aperta: solo un controllo della casella.',
        unread || P(['Il resto della corrispondenza attende.', 'La posta, per ora, può aspettare.']),
      ].filter(Boolean),
    };
  },

  roundup(s, P) {
    const titles = [...new Set(s.events.map((e) => e.title))];
    const sites = s.sites.length ? s.sites : [...new Set(s.events.map((e) => e.meta.host))];
    return {
      kicker: 'Rassegna dal web',
      headline: sites.length > 1
        ? P([`Breve giro tra ${sites.length} siti, da ${sites[0]} a ${sites.at(-1)}`, `Tappe veloci sul web: ${list(sites.slice(0, 3))}`])
        : `Una visita veloce a ${sites[0]}`,
      dek: `Visite rapide, ${span(s)}: nessuna sosta lunga, molte finestre aperte.`,
      body: [
        `Il percorso tocca ${list(titles.slice(0, 5).map((t) => q(short(t, 70))))}${titles.length > 5 ? ` e altro ancora` : ''}.`,
        P(['Classiche letture di passaggio: il web consultato di sfuggita, tra un impegno e l\'altro.', 'Niente di approfondito, ma tutto rigorosamente annotato da questo giornale.']),
      ],
    };
  },

  thread(s, P) {
    const who = s.people[0] || 'un corrispondente';
    const sent = s.sentCount;
    return {
      kicker: 'Corrispondenza',
      headline: sent
        ? P([`Botta e risposta con ${who}: ${q(short(s.topic, 60))}`, `${q(short(s.topic, 60))}, il carteggio dell'ora`])
        : `${plural(s.events.length, 'messaggio', 'messaggi')} su ${q(short(s.topic, 60))}`,
      dek: `${cap(span(s))}, ${plural(s.events.length, 'email', 'email')} nella stessa conversazione${sent ? `, di cui ${sent} in uscita` : ''}${s.people.length > 1 ? ` con ${list(s.people.slice(0, 3))}` : ''}.`,
      body: [
        s.events.slice(0, 6).map((e) => `Alle ${hhmm(e.ts)} ${e.kind === 'sent' ? `parte una risposta per ${e.meta.to?.[0] || 'il destinatario'}` : `arriva un messaggio di ${e.meta.fromName || e.meta.from}`}.`).join(' '),
        sent
          ? P(['La pratica, a quanto pare, è viva e richiede attenzione.', 'Un dialogo in corso: il prossimo numero dirà se si è chiuso.'])
          : P(['Per ora nessuna risposta in uscita: la palla resta nel campo del proprietario.', 'Il thread attende una replica.']),
      ],
    };
  },

  inbox(s, P) {
    const n = s.events.length;
    const people = [...new Set(s.events.filter((e) => !e.meta.newsletter).map((e) => e.meta.fromName || e.meta.from))];
    return {
      kicker: 'Posta in arrivo',
      headline: s.newsletters === n
        ? `${plural(n, 'newsletter', 'newsletter')} e nessuna lettera personale`
        : P([`${plural(n, 'email', 'email')} in arrivo, ${s.unread} ancora da aprire`, `La cassetta delle lettere: ${plural(n, 'messaggio', 'messaggi')} in un'ora`]),
      dek: `${s.newsletters ? `${plural(s.newsletters, 'newsletter o notifica', 'newsletter e notifiche')}` : 'Nessuna newsletter'}${people.length ? `, e posta da ${list(people.slice(0, 3))}` : ''}.`,
      body: [
        `Tra gli oggetti: ${list(s.events.slice(0, 5).map((e) => q(short(e.title, 60))))}.`,
        s.unread ? `${cap(plural(s.unread, 'messaggio resta', 'messaggi restano'))} non letti al momento della chiusura in tipografia.` : 'Tutto letto: la casella, per una volta, è in ordine.',
      ],
    };
  },

  session(s, P) {
    const top = s.families.slice(0, 3);
    const c = s.commits;
    return {
      kicker: 'Terminale',
      headline: c.length
        ? `${plural(c.length, 'commit', 'commit')} in un'ora: l'ultimo dice ${q(short(c.at(-1), 50))}`
        : s.serious
          ? P([`${s.serious} comandi nel terminale, dominano ${top.map((f) => f.family).slice(0, 2).join(' e ')}`, `Al lavoro in riga di comando: ${list(top.map((f) => f.family))}`])
          : 'Il terminale si apre, ma solo per guardarsi intorno',
      dek: `${plural(s.events.length, 'comando digitato', 'comandi digitati')}${top.length ? `; i più frequenti: ${list(top.map((f) => `${f.family} (${f.count})`))}` : ''}.`,
      body: [
        c.length ? `Il registro git racconta il lavoro: ${list(c.slice(0, 4).map(q))}.` : `Nessun commit nell'ora: ${P(['il lavoro, se c\'è, è ancora sul banco', 'si esplora prima di costruire'])}.`,
        s.hosts.length ? `Da segnalare collegamenti ssh verso ${list(s.hosts)}.` : P(['Tutto in locale, nessuna connessione remota.', 'Nessuna trasferta su server remoti.']),
        notable(s),
      ].filter(Boolean),
    };
  },

  note(s) {
    const e = s.events.at(-1);
    const created = s.events.some((x) => x.kind === 'created');
    return {
      kicker: e.meta.folder || 'Note',
      headline: created ? `Nuova nota: ${q(short(e.title, 70))}` : `Il taccuino si aggiorna: ${q(short(e.title, 70))}`,
      dek: `${created ? 'Creata' : 'Ritoccata'} ${span(s)}${s.events.length > 1 ? `, con ${s.events.length} salvataggi` : ''}${e.meta.folder ? ` nella cartella ${q(e.meta.folder)}` : ''}.`,
      body: [
        e.meta.locked ? 'La nota è protetta da password: il giornale ne registra solo l\'esistenza.'
          : e.meta.snippet ? `Si legge: ${q(short(e.meta.snippet, 400))}` : 'Il contenuto non è stato reso pubblico dalla redazione.',
      ],
    };
  },

  entry(s) {
    const e = s.events.at(-1);
    return {
      kicker: 'Diario',
      headline: e.title ? `Una pagina di diario: ${q(short(e.title, 60))}` : 'Una nuova pagina di diario',
      dek: `Scritta alle ${hhmm(e.ts)}${e.meta.words ? `, circa ${e.meta.words} parole` : ''}.`,
      body: [e.meta.text
        ? `Dal diario: ${q(short(e.meta.text, 500))}`
        : 'Il contenuto resta riservato: il giornale ne riferisce soltanto l\'esistenza, come si conviene ai diari.'],
    };
  },

  episode(s) {
    const e = s.events.at(-1);
    const m = e.meta;
    const pct = m.duration ? Math.min(100, Math.round(((m.playhead || 0) / m.duration) * 100)) : null;
    return {
      kicker: m.show || 'Podcast',
      headline: `In cuffia: ${q(short(e.title, 70))}`,
      dek: `${m.show ? `Da ${q(m.show)}` : 'Un episodio'}${pct != null ? `, ascoltato al ${pct}%` : ''}.`,
      body: [
        m.description ? short(m.description, 380) : `L'ascolto è registrato alle ${hhmm(e.ts)}.`,
        pct != null && pct < 90 ? 'L\'episodio è rimasto in sospeso: seguirà, forse, la seconda puntata dell\'ascolto.' : 'Ascolto completato.',
      ],
    };
  },

  book(s) {
    const e = s.events[0];
    const hl = s.events.filter((x) => x.kind === 'highlight');
    const op = s.events.filter((x) => x.kind === 'opened').at(-1);
    const pct = op?.meta.progress != null ? Math.round(op.meta.progress * 100) : null;
    return {
      kicker: 'Libri',
      headline: hl.length
        ? `${q(e.title)}: ${plural(hl.length, 'passo sottolineato', 'passi sottolineati')}`
        : `Ritorno a ${q(e.title)}${pct != null ? `, ora al ${pct}%` : ''}`,
      dek: `${e.meta.author ? `Di ${e.meta.author}. ` : ''}Aperto ${span(s)}.`,
      body: [
        hl.length ? `Tra le righe evidenziate: ${list(hl.slice(0, 3).map((h) => q(short(h.meta.text, 160))))}.` : 'Nessuna sottolineatura: lettura di filato.',
      ],
    };
  },
};

export function fallbackArticle(story) {
  const P = pickFrom(story.id + story.first);
  const w = W[story.kind];
  const a = w ? w(story, P) : { kicker: story.section, headline: story.topic, dek: '', body: [] };
  const sr = story.series;
  if (sr) {
    const last = sr.previous[0];
    a.body = [...a.body, `${P(['La storia continua', 'Non è la prima volta', 'Il tema torna'])}: è la ${sr.episode}ª puntata${sr.days > 1 ? ` in ${sr.days} giorni` : ''}. L'ultima, alle ${hhmm(last.hour)}, titolava ${q(short(last.headline, 70))}.`];
  }
  return { ...a, writer: 'tipografia' };
}

export function fallbackBrief(story) {
  const a = fallbackArticle(story);
  return a.headline;
}

export function fallbackSummary(articles, total) {
  const mood = total < 10 ? 'tranquilla' : total < 40 ? 'regolare' : total < 120 ? 'intensa' : 'frenetica';
  const [a] = articles;
  const parts = [`Un'ora ${mood}: ${plural(total, 'segnale registrato', 'segnali registrati')}.`];
  if (a) parts.push(`In apertura, per la sezione ${a.section}: ${a.headline.replace(/[.!?…\s]+$/, '')}.`);
  const others = [];
  for (const x of articles.slice(1)) {
    const label = x.section === a.section ? `ancora ${x.section} con ${x.kicker}` : x.section;
    if (!others.includes(label)) others.push(label);
    if (others.length === 3) break;
  }
  if (others.length) parts.push(`Nelle pagine interne: ${list(others)}.`);
  return parts.join(' ');
}

/** Battute di riserva per la vignetta, quando il redattore è spento. */
/** Editoriale della sera di riserva, quando il redattore è spento. */
export function fallbackEditorial({ top, timeline, stats, market }) {
  const lead = top[0];
  const second = top[1];
  const busiest = `${String(stats.busiestHour).padStart(2, '0')}:00`;
  const site = market?.rows?.[0];
  const P = pickFrom(String(stats.total) + (lead?.articleId || ''));
  const mood = stats.total < 60 ? 'tranquilla' : stats.total < 300 ? 'piena' : 'affollata';
  const sections = [...new Set(top.map((t) => t.section))];
  return {
    headline: lead ? P([`Una giornata ${mood}, e un filo che la tiene insieme`, `Il giorno in cui contava ${q(short(lead.headline, 40))}`]) : 'Una giornata senza titoli',
    oneliner: `${plural(stats.total, 'segnale', 'segnali')} in ${plural(timeline.length, 'edizione', 'edizioni')}; il picco alle ${busiest}.`,
    body: [
      `Una giornata ${mood}: ${plural(stats.total, 'segnale registrato', 'segnali registrati')} e ${plural(timeline.length, 'edizione', 'edizioni')} in edicola. L'ora più movimentata è stata quella delle ${busiest}.`,
      lead ? `La notizia che ha pesato di più viene dalla sezione ${lead.section}: ${q(lead.headline)}.${second ? ` Subito dietro, ${second.section}: ${q(second.headline)}.` : ''}${lead.appearances > 1 ? ` È tornata in ${lead.appearances} edizioni: segno che non era un passaggio, ma un tema.` : ''}` : 'Nessuna notizia ha davvero dominato.',
      `${sections.length > 1 ? `Il giornale ha toccato ${list(sections.slice(0, 4))}.` : ''} ${site ? `In Borsa chiude in testa ${site.ticker}, con ${plural(site.close, 'visita', 'visite')}.` : ''} ${P(['Domani, si vedrà.', 'Il resto lo scriverà la prossima edizione.', 'La redazione chiude qui.'])}`.trim(),
    ],
    cartoon: P(['Domani faccio le stesse cose, ma con più ordine.', 'Il giornale dice che oggi ho fatto molto. Sarà vero.', 'Non ho perso tempo. L\'ho archiviato.']),
    market: site ? `Seduta chiusa con ${site.ticker} in testa (${plural(site.close, 'scambio', 'scambi')}).${market.index.change != null ? ` Indice ${market.index.change >= 0 ? 'in rialzo' : 'in calo'} del ${Math.abs(Math.round(market.index.change * 100))}% su ieri.` : ''}` : null,
  };
}
