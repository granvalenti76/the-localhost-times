import { sceneMenu } from './scenes.js';
import { linePrompt, LENGTHS, toneId } from './line.js';
import { L, tr } from '../i18n.js';
import { personaPrompt } from './writers.js';
import { styleOf } from './styles.js';

const SYSTEM_EN = `You are a reporter for The Localhost Times, a daily paper that tells what happened on a MacBook in the last hour. The style is that of a good newspaper: dry, precise, with light, understated irony. Never emphatic.

How to write:
- English, third person. The protagonist is "the owner" (or "the user"); don't overuse it.
- Short sentences. One fact per sentence. The most interesting fact first, then the context.
- Length follows the news: three commands in the terminal are a brief, not an investigation.
- Irony comes from putting facts side by side, not from adjectives. One joke per article is enough, zero is fine.
- Quote titles, objects and commands in curly quotes “like this”. Never use straight double quotes inside the text. No URLs.

What NOT to do:
- No inflated adjectives and adverbs: "extremely", "crucial", "fundamental", "extraordinary", "incredible", "intense", "tenacity", "mastery", "immersed", "journey", "challenge", "seamless".
- Don't invent causes, emotions, intentions or outcomes the facts don't state ("the software was broken", "frustrated", "finally"). If you guess, say so: "perhaps", "judging by".
- Don't repeat the time in every sentence: one or two per article at most.
- Don't compute intervals between times ("ten minutes later", "half an hour"): quote the times as they are. For the time of day, use the one given in the facts.
- Don't explain the obvious (what “npm install” does, that YouTube is a video site).
- Don't list every event in a row: pick the ones that tell something.
- Headlines in sentence case, no final period, no colons everywhere.
- If some content is marked as private, don't quote it and don't imagine it.
- If the facts mark a CONTINUING STORY, write in continuity like a real paper: a short reference to the previous instalment ("as reported this morning", "for the second day running"), then only what is new. Don't repeat headlines and sentences from earlier instalments.

BAD example (do not imitate):
"In an extremely concentrated segment of time, the owner immersed himself in the Terminal environment. This twofold attempt demonstrates the tenacity typical of developers: a fundamental adjustment."
GOOD example:
"At 11:08 the owner runs “npm start”. Then comes “npm install”, then “npm start” again. The right order, found on the second try."

Reply ONLY with a valid JSON object, with no text before or after:
{"kicker": "kicker, 1-3 words", "headline": "headline", "dek": "one-sentence summary", "body": ["paragraph", ...]}`;

const SYSTEM_IT = `Sei un redattore del «The Localhost Times», un quotidiano che racconta ciò che è successo su un MacBook nell'ultima ora. Lo stile è quello di un buon quotidiano: asciutto, preciso, con un'ironia leggera e di sottrazione. Mai enfatico.

Come scrivere:
- Italiano, terza persona. Il protagonista è «il proprietario» (o «l'utente»); non abusarne.
- Frasi brevi. Un fatto per frase. Prima il fatto più interessante, poi il contesto.
- La lunghezza segue la notizia: tre comandi nel terminale sono una breve, non un'inchiesta.
- L'ironia nasce dai fatti accostati, non dagli aggettivi. Una battuta per articolo basta, anche zero.
- Cita titoli, oggetti e comandi tra caporali «così». Niente URL.

Cosa NON fare:
- Niente aggettivi e avverbi gonfi: «estremamente», «cruciale», «fondamentale», «straordinario», «incredibile», «intenso», «tenacia», «maestria», «immerso», «viaggio», «sfida», «piena funzionalità».
- Non inventare cause, emozioni, intenzioni o esiti che i fatti non dicono («il software non funzionava», «frustrato», «finalmente»). Se ipotizzi, dillo: «forse», «a giudicare da».
- Non ripetere gli orari in ogni frase: al massimo uno o due per articolo.
- Non calcolare intervalli tra orari («dieci minuti dopo», «mezz'ora»): cita gli orari così come sono. Per il momento della giornata usa quello indicato nei fatti.
- Non spiegare l'ovvio (cosa fa «npm install», che YouTube è un sito di video).
- Non elencare tutti gli eventi in fila: scegli quelli che raccontano qualcosa.
- Titoli senza punto finale e senza due punti dappertutto.
- Se un contenuto è indicato come riservato, non citarlo e non immaginarlo.
- Se i fatti indicano una STORIA CHE CONTINUA, scrivi in continuità come un giornale vero: un breve richiamo alla puntata precedente («come anticipato stamattina», «secondo giorno di fila»), poi solo ciò che c'è di nuovo. Non ripetere titoli e frasi delle puntate precedenti.

Esempio CATTIVO (da non imitare):
«In un segmento di tempo estremamente concentrato, il proprietario si è immerso nell'ambiente del Terminale. Questo duplice tentativo dimostra la tenacia tipica di chi sviluppa: un aggiustamento fondamentale.»
Esempio BUONO:
«Alle 11:08 il proprietario lancia «npm start». Cinque minuti dopo arriva «npm install», poi di nuovo «npm start». L'ordine giusto, scoperto al secondo tentativo.»

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"kicker": "occhiello, 1-3 parole", "headline": "titolo", "dek": "sommario di una frase", "body": ["paragrafo", ...]}`;

export const systemFor = (line, writer = null) => {
  const sys = tr({ en: SYSTEM_EN, it: SYSTEM_IT });
  return (line ? sys + '\n' + linePrompt(line) : sys) + personaPrompt(writer);
};

const HINTS_EN = {
  searches: 'The searches column: what was the owner trying to find out? Put the questions side by side, don\'t comment on them one by one.',
  site: 'Time spent on one site: what was the owner dealing with, judging by the titles. Pages marked "generic" (home, feeds) mean scrolling more than reading.',
  roundup: 'Short visits to different sites: the tone of a column of briefs.',
  thread: 'An email conversation: tell the exchange, without inventing contents.',
  webmail: 'Mail read in Gmail in the browser: we only know the subjects of the opened emails and the unread count.',
  inbox: 'The hour\'s incoming mail.',
  session: 'Work in the terminal: what was being done, in plain words. No computer-science lessons.',
  note: 'A note written or edited: a notebook entry.',
  entry: 'A personal journal entry: absolute discretion.',
  episode: 'A podcast episode: name the show and the episode.',
  book: 'Reading a book: you may quote the highlighted passages.',
  folder: 'Work in a folder of the Mac (often a software project): what was being worked on, judging by the folders and file types. Local news, plain words.',
  folders: 'A few files saved in different folders: a short local brief.',
  timesheet: 'How the hour was split between apps, measured minute by minute: the shape of the hour (focus or fragments), with the minutes. Only app names are known: don\'t guess what was on screen.',
  shots: 'The photographer: photos, videos and screenshots of the hour, counted. Never imagine what is in the pictures, where, or who: only how many, what kind, when.',
  downloads: 'What arrived in the Downloads folder, and from which sites.',
};

const HINTS_IT = {
  searches: 'Rubrica delle ricerche: cosa cercava di capire il proprietario? Accosta le domande, non commentarle una per una.',
  site: 'Tempo passato su un sito: di cosa si stava occupando, a giudicare dai titoli. Le pagine marcate «generica» (home, feed) indicano scorrimento più che lettura.',
  roundup: 'Visite brevi su siti diversi: tono da colonnino di brevi.',
  thread: 'Una conversazione via email: racconta lo scambio, senza inventare contenuti.',
  webmail: 'Posta letta su Gmail nel browser: conosciamo solo gli oggetti delle email aperte e il numero dei non letti.',
  inbox: 'La posta in arrivo dell\'ora.',
  session: 'Lavoro nel terminale: cosa si stava facendo, in parole semplici. Niente lezioni di informatica.',
  note: 'Una nota scritta o modificata: un appunto di taccuino.',
  entry: 'Una voce di diario personale: discrezione assoluta.',
  episode: 'Un podcast ascoltato: cita lo show e l\'episodio.',
  book: 'Lettura di un libro: puoi citare i passi evidenziati.',
  folder: 'Lavoro in una cartella del Mac (spesso un progetto software): su cosa si lavorava, a giudicare da cartelle e tipi di file. Cronaca locale, parole semplici.',
  folders: 'Qualche file salvato in cartelle diverse: una breve di cronaca locale.',
  timesheet: 'Come si è divisa l\'ora tra le app, misurata minuto per minuto: la forma dell\'ora (concentrazione o frammenti), con i minuti. Si conoscono solo i nomi delle app: non indovinare cosa ci fosse sullo schermo.',
  shots: 'Il fotografo: foto, video e screenshot dell\'ora, contati. Non immaginare mai cosa c\'è nelle immagini, dove o chi: solo quante, di che tipo, quando.',
  downloads: 'Cosa è arrivato nella cartella Download, e da quali siti.',
};

const SIZE_NAMES = { en: { lead: 'lead story', article: 'article', brief: 'brief' }, it: { lead: 'apertura', article: 'articolo', brief: 'breve' } };

const round5 = (x) => Math.round(x / 5) * 5;

// How many signals a story needs to become a lead or an article: "Long" promotes more stories,
// "Short" fewer, so the length setting changes the shape of the page and not only word counts.
const THRESHOLDS = {
  short: { lead: 10, article: 15, weight: 8 },
  standard: { lead: 8, article: 12, weight: 6 },
  long: { lead: 5, article: 8, weight: 4 },
};

const format = (id, a, b, f, paras) => {
  const min = round5(a * f);
  const max = round5(b * f);
  return { id, min, max, words: `${min}-${max}`, paras };
};

/** Article format based on the story's weight (and the length chosen by the editors). */
export function sizeOf(story, rank, line, writer = null) {
  const id = LENGTHS[line?.length] ? line.length : 'standard';
  const st = writer ? styleOf(writer) : null;
  const f = LENGTHS[id].factor * (st?.factor || 1);
  const t = THRESHOLDS[id] || THRESHOLDS.standard;
  const n = story.events.length;
  if (rank === 0 && n >= t.lead) return format('lead', 150, 220, f, st?.labeled ? '5' : f < 1 ? '2' : f > 1 ? '4' : '3');
  // the top of the page is never a brief, unless the story is only a couple of signals
  if (n >= t.article || story.weight >= t.weight || (rank === 0 && n >= 3)) return format('article', 90, 150, f, st?.labeled ? '4' : f > 1 ? '3' : '2');
  return format('brief', 35, 70, f, st?.labeled ? '2' : '1');
}

/** Words in an article's body. */
export const wordCount = (a) => (a?.body || []).join(' ').split(/\s+/).filter(Boolean).length;

/** The draft came out too short: ask the same writer to expand it, once, with the same facts. */
export function expandPrompt(msgs, draft, size) {
  const have = wordCount(draft);
  return [
    ...msgs,
    { role: 'assistant', content: JSON.stringify({ kicker: draft.kicker, headline: draft.headline, dek: draft.dek, body: draft.body }) },
    {
      role: 'user',
      content: tr({
        en: `This draft is ${have} words: the format asks for ${size.words} words in ${size.paras} paragraph${size.paras === '1' ? '' : 's'}. Expand it to at least ${size.min} words using only the facts above: more of the details they contain (titles, times, counts, sites), the context, the continuity with earlier instalments if any. Don't invent anything and don't pad with adjectives. Reply ONLY with the JSON.`,
        it: `Questa bozza è di ${have} parole: il formato chiede ${size.words} parole in ${size.paras} paragraf${size.paras === '1' ? 'o' : 'i'}. Allungala ad almeno ${size.min} parole usando solo i fatti qui sopra: più dettagli fra quelli che contengono (titoli, orari, numeri, siti), il contesto, la continuità con le puntate precedenti se ci sono. Non inventare niente e non riempire con aggettivi. Rispondi SOLO con il JSON.`,
      }),
    },
  ];
}

export function articlePrompt(story, facts, hourLabel, size, line, writer = null) {
  const name = L(SIZE_NAMES)[size.id].toUpperCase();
  const maxWords = size.id === 'brief' ? 9 : 12;
  return [
    { role: 'system', content: systemFor(line, writer) },
    {
      role: 'user',
      content: tr({
        en: `The ${hourLabel} edition. ${HINTS_EN[story.kind] || ''}
Format: ${name} — ${size.words} words in all (no fewer than ${size.min}), ${size.paras} paragraph${size.paras === '1' ? '' : 's'}. Headline of ${maxWords} words at most.

FACTS:
${facts}

Write the article.`,
        it: `Edizione delle ${hourLabel}. ${HINTS_IT[story.kind] || ''}
Formato: ${name} — ${size.words} parole in tutto (non meno di ${size.min}), ${size.paras} paragraf${size.paras === '1' ? 'o' : 'i'}. Titolo di massimo ${maxWords} parole.

FATTI:
${facts}

Scrivi l'articolo.`,
      }),
    },
  ];
}

export function rewritePrompt(story, facts, hourLabel, size, line, previous, instruction, writer = null) {
  const msgs = articlePrompt(story, facts, hourLabel, size, line, writer);
  msgs.push({ role: 'assistant', content: JSON.stringify({ kicker: previous.kicker, headline: previous.headline, dek: previous.dek, body: previous.body }) });
  msgs.push({
    role: 'user',
    content: tr({
      en: `The editor asks for a rewrite. Instruction: “${instruction || 'a better version'}”. Same facts, same rules. Reply ONLY with the JSON.`,
      it: `Il direttore chiede di riscrivere il pezzo. Indicazione: «${instruction || 'una versione migliore'}». Stessi fatti, stesse regole. Rispondi SOLO con il JSON.`,
    }),
  });
  return msgs;
}

export function summaryPrompt(articles, total, hourLabel, line, writer = null) {
  const lines = articles.map((a) => `- [${a.section}] ${a.headline}`).join('\n');
  const extra = (line ? '\n' + linePrompt(line) : '') + personaPrompt(writer, 'brief');
  return [
    {
      role: 'system',
      content: tr({
        en: `You are the editor of The Localhost Times, the paper that tells the hour that just went by on a MacBook. Write three things:
1. "summary": the front-page Brief. Two sentences, 45 words at most, tying the hour's facts together with a touch of dry irony. No emphasis, no inflated adjectives, no lists of sections.
2. "cartoon": the caption of the hour's cartoon, like a New Yorker cartoon. One short sentence (14 words at most), said by the Mac's owner to someone off-panel. Understatement, everyday absurdity, inspired by a fact of the hour. No quotation marks.
3. "scene": the drawing above the caption, chosen from this catalogue (write only the id). Pick the scene that makes the caption work, not necessarily the one of the lead section:
${sceneMenu()}
Use only the headlines provided.${extra}
Reply ONLY with JSON: {"summary": "...", "cartoon": "...", "scene": "id"}`,
        it: `Sei il direttore del «The Localhost Times», il quotidiano che racconta l'ora appena trascorsa su un MacBook. Scrivi tre cose:
1. «summary»: il Punto di prima pagina. Due frasi, massimo 45 parole, che legano i fatti dell'ora con un tocco di ironia asciutta. Niente enfasi, niente aggettivi gonfi, niente elenchi di sezioni.
2. «cartoon»: la battuta della vignetta dell'ora, come nelle vignette del New Yorker. Una sola frase breve (massimo 14 parole), detta dal proprietario del Mac a qualcuno fuori scena. Understatement, assurdo quotidiano, ispirata a un fatto dell'ora. Senza virgolette.
3. «scene»: il disegno sopra la battuta, scelto da questo catalogo (scrivi solo l'id). Scegli la scena che fa funzionare la battuta, non per forza quella della sezione d'apertura:
${sceneMenu()}
Usa solo i titoli forniti.${extra}
Rispondi SOLO con JSON: {"summary": "...", "cartoon": "...", "scene": "id"}`,
      }),
    },
    {
      role: 'user',
      content: tr({
        en: `The ${hourLabel} edition, ${total} signals.\nHeadlines:\n${lines}`,
        it: `Edizione delle ${hourLabel}, ${total} segnali.\nTitoli:\n${lines}`,
      }),
    },
  ];
}

const pct = (c) => `${c > 0 ? '+' : ''}${Math.round(c * 100)}%`;

export function marketPrompt(market, hourLabel, line) {
  const rows = market.rows.map((r) => tr({
    en: `${r.ticker} (${r.site}): ${r.close} visits, ${r.change == null ? 'new listing' : `${pct(r.change)} on the previous hour`}`,
    it: `${r.ticker} (${r.site}): ${r.close} visite, ${r.change == null ? 'nuova quotazione' : `${pct(r.change)} sull'ora precedente`}`,
  })).join('\n');
  const idx = market.index.change == null ? 'n/a' : `${Math.round(market.index.change * 100)}%`;
  const extra = line ? '\n' + linePrompt(line) : '';
  return [
    {
      role: 'system',
      content: tr({
        en: `You are the stock-market reporter of The Localhost Times. You comment on the list of websites visited on a Mac as if they were shares on the exchange: one or two sentences, 40 words at most, financial jargon used with irony ("session", "profit-taking", "trading halted on excessive gains"). Only the data provided.${extra}
Reply ONLY with JSON: {"comment": "..."}`,
        it: `Sei il cronista di Piazza Affari del «The Localhost Times». Commenti il listino dei siti web visitati su un Mac come se fossero titoli in borsa: una o due frasi, massimo 40 parole, gergo finanziario usato con ironia («seduta», «realizzi», «titolo sospeso per eccesso di rialzo»). Solo i dati forniti.${extra}
Rispondi SOLO con JSON: {"comment": "..."}`,
      }),
    },
    {
      role: 'user',
      content: tr({
        en: `The ${hourLabel} session. General index: ${market.index.close} visits (${idx}).\n${rows}`,
        it: `Seduta delle ${hourLabel}. Indice generale: ${market.index.close} visite (${idx}).\n${rows}`,
      }),
    },
  ];
}

// ───────────────────────── The evening edition ─────────────────────────

const hh = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:00`; };

export function eveningPrompt({ top, timeline, stats, market, line, writer = null }) {
  const en = tr({ en: true, it: false });
  const topLines = top.map((t) => `- [${t.section}, ${hh(t.hour)}${t.appearances > 1 ? (en ? `, in ${t.appearances} editions` : `, in ${t.appearances} edizioni`) : ''}] ${t.headline} — ${t.dek || ''}`).join('\n');
  const tl = timeline.map((t) => (en
    ? `- ${hh(t.hour)}: ${t.total} signals, leading with “${t.lead || '—'}”`
    : `- ${hh(t.hour)}: ${t.total} segnali, in apertura «${t.lead || '—'}»`)).join('\n');
  const src = Object.entries(stats.bySource).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ');
  const mk = market?.rows?.slice(0, 6).map((r) => (en
    ? `${r.ticker} (${r.site}) ${r.close} visits${r.change == null ? ', new since yesterday' : `, ${pct(r.change)} on yesterday`}`
    : `${r.ticker} (${r.site}) ${r.close} visite${r.change == null ? ', nuovo rispetto a ieri' : `, ${pct(r.change)} su ieri`}`)).join('; ');
  const extra = (line ? '\n' + linePrompt(line) : '') + personaPrompt(writer, 'editorial');
  const busiest = `${String(stats.busiestHour).padStart(2, '0')}:00`;
  const tm = stats.time;
  const timeLine = tm ? (en
    ? `\nTIME AT THE MAC: ${Math.round(tm.active / 6) / 10} hours in use, ${Math.round(tm.away / 6) / 10} away; by app: ${tm.apps.slice(0, 6).map((x) => `${x.name} ${x.minutes} min`).join(', ')}; ${tm.switches} switches between apps; longest stretch ${tm.longest ? `${tm.longest.app} ${tm.longest.minutes} min` : '—'}.`
    : `\nTEMPO AL MAC: ${String(Math.round(tm.active / 6) / 10).replace('.', ',')} ore di uso, ${String(Math.round(tm.away / 6) / 10).replace('.', ',')} lontano; per app: ${tm.apps.slice(0, 6).map((x) => `${x.name} ${x.minutes} min`).join(', ')}; ${tm.switches} cambi di app; tratto più lungo ${tm.longest ? `${tm.longest.app} ${tm.longest.minutes} min` : '—'}.`) : '';
  const mc = stats.mac;
  const macLine = mc ? (en
    ? `\nTHE MAC: ${mc.wakes} wake-ups, ${mc.sleeps} sleeps (${mc.lid} with the lid closed)${mc.lowest != null ? `, battery down to ${mc.lowest}%` : ''}.`
    : `\nIL MAC: ${mc.wakes} risvegli, ${mc.sleeps} riposi (${mc.lid} a coperchio chiuso)${mc.lowest != null ? `, batteria scesa fino al ${mc.lowest}%` : ''}.`) : '';
  return [
    {
      role: 'system',
      content: tr({
        en: `You are the editor of The Localhost Times, the paper that tells what happens on a MacBook. It is evening: write the editorial that closes the day, in the style of a good front-page column. Dry, intelligent, with understated irony. Connect the facts, find the thread of the day, don't list. Third person ("the owner").
Rules: use only the facts provided, invent nothing; no inflated adjectives ("extraordinary", "intense", "crucial"); don't compute time intervals; quote titles and sites in curly quotes “like this”, never straight double quotes.${extra}

Reply ONLY with JSON:
{"headline": "headline of the editorial, 10 words at most, no final period",
 "oneliner": "the day in one line, 16 words at most",
 "editorial": ["paragraph", "paragraph", "paragraph"],
 "cartoon": "caption of the day's cartoon, said by the owner, New Yorker style, 14 words at most, no quotation marks",
 "scene": "id of the cartoon's drawing, from the catalogue below",
 "market": "closing comment on the website stock market, ironic financial jargon, 30 words at most"}
The editorial has 3 paragraphs, 160-230 words in all.
Catalogue of drawings for the cartoon (pick the one that makes the caption work):
${sceneMenu()}`,
        it: `Sei il direttore del «The Localhost Times», il quotidiano che racconta ciò che succede su un MacBook. È sera: scrivi l'editoriale che chiude la giornata, con lo stile di un buon corsivo da prima pagina. Asciutto, intelligente, con ironia di sottrazione. Collega i fatti, trova il filo della giornata, non elencare. Terza persona («il proprietario»).
Regole: usa solo i fatti forniti, non inventare; niente aggettivi gonfi («straordinario», «intenso», «cruciale»); non calcolare intervalli di tempo; cita titoli e siti tra «caporali».${extra}

Rispondi SOLO con JSON:
{"headline": "titolo dell'editoriale, massimo 10 parole, senza punto finale",
 "oneliner": "la giornata in una riga, massimo 16 parole",
 "editorial": ["paragrafo", "paragrafo", "paragrafo"],
 "cartoon": "battuta della vignetta del giorno, detta dal proprietario, stile New Yorker, massimo 14 parole, senza virgolette",
 "scene": "id del disegno della vignetta, dal catalogo qui sotto",
 "market": "commento di chiusura della Borsa dei siti, gergo finanziario ironico, massimo 30 parole"}
L'editoriale ha 3 paragrafi, 160-230 parole in tutto.
Catalogo dei disegni per la vignetta (scegli quello che fa funzionare la battuta):
${sceneMenu()}`,
      }),
    },
    {
      role: 'user',
      content: tr({
        en: `THE DAY: ${stats.total} signals (${src}). Busiest hour: ${busiest}.${timeLine}${macLine}

THE DAY'S NEWS:
${topLines}

THE EDITIONS, HOUR BY HOUR:
${tl}

WEBSITE STOCK MARKET (close): ${mk || 'no listings'}

Write the evening editorial.`,
        it: `GIORNATA: ${stats.total} segnali (${src}). Ora più movimentata: ${busiest}.${timeLine}${macLine}

LE NOTIZIE DEL GIORNO:
${topLines}

LE EDIZIONI ORA PER ORA:
${tl}

BORSA DEI SITI (chiusura): ${mk || 'nessuna quotazione'}

Scrivi l'editoriale della sera.`,
      }),
    },
  ];
}

// ───────────────────────── The editorial meeting ─────────────────────────

const TONE_IDS = 'dry|ironic|satirical|british|tabloid';

export function meetingPrompt({ kind, label, items, line, focus, history, text, overview, tools = '' }) {
  const en = tr({ en: true, it: false });
  const tone = `- {"type":"tone","tone":"${TONE_IDS}"}  ${en ? 'change the paper\'s tone' : 'cambiare il tono del giornale'}`;
  const note = `- {"type":"note","text":"..."}  ${en ? 'add a permanent rule to the editor\'s notes (applies to the next editions)' : 'aggiungere una regola permanente alle note del direttore (vale per le prossime edizioni)'}`;
  // steering the edition that hasn't been printed yet (story ids come from the next_edition tool)
  const next = [
    `- {"type":"lead_next","story":"<id>"}  ${en ? 'make a story the lead of the NEXT edition' : 'mettere una storia in apertura nella PROSSIMA edizione'}`,
    `- {"type":"drop_next","story":"<id>"}  ${en ? 'leave a story out of the next edition' : 'lasciare fuori una storia dalla prossima edizione'}`,
    `- {"type":"next_note","text":"..."}  ${en ? 'a one-off instruction for the writers of the next edition only' : 'un\'indicazione solo per i redattori della prossima edizione'}`,
    `- {"type":"print_now"}  ${en ? 'print the current hour\'s edition right away' : 'stampare subito l\'edizione dell\'ora in corso'}`,
  ];
  const actions = kind === 'evening'
    ? [`- {"type":"editorial","instruction":"..."}  ${en ? 'rewrite the evening editorial' : 'riscrivere l\'editoriale della sera'}`, note, tone, ...next].join('\n')
    : [
      `- {"type":"rewrite","article":"<id>","instruction":"..."}  ${en ? 'rewrite an article of this edition with an instruction' : 'riscrivere un articolo di questa edizione con un\'indicazione'}`,
      `- {"type":"lead","article":"<id>"}  ${en ? 'make it the lead story of this edition' : 'metterlo in apertura in questa edizione'}`,
      `- {"type":"spike","article":"<id>"}  ${en ? 'drop it from this edition' : 'toglierlo da questa edizione'}`,
      note,
      tone,
      ...next,
    ].join('\n');
  const toolBlock = tools ? tr({
    en: `\n\nBefore answering you can look things up with these tools. To use one, reply ONLY with its JSON (one tool per reply, at most 3 in a row); you will get the result, then you answer normally:\n${tools}\nUse next_edition whenever the editor asks about the coming hour, what is still to be processed, what to expect or how to steer: never guess those numbers.`,
    it: `\n\nPrima di rispondere puoi consultare questi strumenti. Per usarne uno rispondi SOLO con il suo JSON (uno per risposta, al massimo 3 di fila); riceverai il risultato, poi rispondi normalmente:\n${tools}\nUsa next_edition ogni volta che il direttore chiede dell'ora in corso, di cosa resta da elaborare, di cosa aspettarsi o di come orientare l'edizione: non indovinare quei numeri.`,
  }) : '';
  const notes = line.notes?.trim();
  const msgs = [
    {
      role: 'system',
      content: tr({
        en: `You are the managing editor of The Localhost Times, the paper that tells what happens on the editor's MacBook. You are in the editorial meeting with the editor-in-chief (the owner of the Mac), discussing ${label}.
Speak English, direct and collegial, like a real managing editor: give reasoned opinions (what deserves the lead, what is weak or repetitive, what is missing, which angle to take), ask a question if needed, respect the editor's choices and remember what you have said to each other. Short replies: 110 words at most. Don't invent facts: you only know what is written here.

You can propose concrete actions, which the editor approves with one click:
${actions}
Propose actions only when they are really needed, 3 at most, and only with the ids listed.
The editor applies the actions with a button next to your reply: don't ask for confirmation in words ("shall we?"), just propose them. If the editor tells you to do something, propose the matching action right away.
Write "actions" as plain JSON, without backslashes: [{"type":"lead","article":"..."}].${toolBlock}

Reply ONLY with JSON: {"reply": "...", "actions": [ ... ]}`,
        it: `Sei il caporedattore del «The Localhost Times», il quotidiano che racconta ciò che succede sul MacBook del direttore. Sei in riunione di redazione con il direttore (il proprietario del Mac) e discutete ${label}.
Parla in italiano, diretto e collegiale, come un caporedattore vero: dai opinioni motivate (cosa merita l'apertura, cosa è debole o ripetitivo, cosa manca, che angolo prendere), fai una domanda se serve, rispetta le scelte del direttore e ricordati di quello che vi siete detti. Risposte brevi: massimo 110 parole. Non inventare fatti: conosci solo quello che è scritto qui.

Puoi proporre azioni concrete, che il direttore approva con un clic:
${actions}
Proponi azioni solo quando servono davvero, al massimo 3, e solo con gli id elencati.
Le azioni le applica il direttore con un pulsante accanto alla tua risposta: non chiedere conferma a parole («approviamo?»), proponile e basta. Se il direttore ti dice di fare qualcosa, proponi subito l'azione corrispondente.
Scrivi «actions» come JSON normale, senza barre rovesciate: [{"type":"lead","article":"..."}].${toolBlock}

Rispondi SOLO con JSON: {"reply": "...", "actions": [ ... ]}`,
      }),
    },
    {
      role: 'user',
      content: `${label.toUpperCase()}
${items}

${en
    ? `CURRENT EDITORIAL LINE: tone ${toneId(line.tone)}, length ${line.length}${notes ? `; editor's notes: ${notes}` : '; no editor\'s notes'}.`
    : `LINEA EDITORIALE ATTUALE: tono ${toneId(line.tone)}, lunghezza ${line.length}${notes ? `; note del direttore: ${notes}` : '; nessuna nota del direttore'}.`}${overview ? `\n\n${overview}` : ''}${focus ? `\n\n${en ? 'ARTICLE UNDER DISCUSSION' : 'ARTICOLO IN DISCUSSIONE'}: ${focus}` : ''}`,
    },
    { role: 'assistant', content: JSON.stringify({ reply: tr({ en: 'I have the edition in front of me. Go ahead.', it: 'Ho l\'edizione davanti. Dimmi.' }), actions: [] }) },
  ];
  for (const m of history.slice(-12)) {
    if (m.role === 'director') msgs.push({ role: 'user', content: m.text });
    else msgs.push({ role: 'assistant', content: JSON.stringify({ reply: m.text, actions: (m.actions || []).map(({ status, appliedAt, error, ...a }) => a) }) });
  }
  msgs.push({ role: 'user', content: text });
  return msgs;
}

// ───────────────────────── Letters to the editor ─────────────────────────

export function letterPrompt({ letter, overview, line }) {
  const extra = line ? '\n' + linePrompt(line) : '';
  return [
    {
      role: 'system',
      content: tr({
        en: `You are the managing editor of The Localhost Times, the paper that tells what happens on a MacBook. Answer a letter sent to the paper, for the "Letters to the editor" column. The writer is the owner of the Mac: answer with grace, dry irony and frankness, leaning on the real data of the day below when useful (numbers, sites, times). Don't invent data. 90 words at most. English.${extra}
Reply ONLY with JSON: {"title": "title of the letter, 8 words at most, no final period", "reply": "the answer"}`,
        it: `Sei il caporedattore del «The Localhost Times», il quotidiano che racconta ciò che succede su un MacBook. Rispondi a una lettera arrivata in redazione, per la rubrica «Lettere al direttore». Chi scrive è il proprietario del Mac stesso: rispondigli con garbo, ironia asciutta e franchezza, appoggiandoti ai dati veri della giornata qui sotto quando servono (numeri, siti, orari). Non inventare dati. Massimo 90 parole. Italiano.${extra}
Rispondi SOLO con JSON: {"title": "titolo della lettera, massimo 8 parole, senza punto finale", "reply": "la risposta"}`,
      }),
    },
    {
      role: 'user',
      content: tr({
        en: `${overview}\n\nTHE LETTER (signed “${letter.signature}”):\n${letter.text}`,
        it: `${overview}\n\nLA LETTERA (firmata «${letter.signature}»):\n${letter.text}`,
      }),
    },
  ];
}
