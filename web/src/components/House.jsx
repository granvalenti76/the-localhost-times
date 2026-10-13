import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, href, SECTIONS, modelName } from '../lib.js';
import { tr } from '../i18n.js';
import { Medallion, MOODS } from './Rooms.jsx';
import { wordDiff } from './Proof.jsx';

/*
 * The Publishing House: where the Editor decides what paper to make, away from the desk. How often
 * it comes out, where the news comes from, who writes it and with what character, what the writers
 * are told before they write, the games. Every change is saved as it is made and counts from the
 * next edition.
 */

const DAYS = tr({ en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], it: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'] });

const T = tr({
  en: {
    house: 'Publishing House', sub: 'What paper to make. Every change counts from the next edition.', back: '← Back to the newsroom', saved: 'Saved', saving: 'Saving…',
    tabs: { masthead: ['The masthead', 'how often, when, how long'], wires: ['The wires', 'where the news comes from'], staff: ['The staff', 'bylines, character, beats'], manual: ['The style manual', 'what the writers are told'], games: ['Games and calls', 'interviews, Oracle, serial'], engine: ['The engine', 'the local model'] },
    // masthead
    mTitle: 'What paper do you want to make?', mSub: 'The news comes in all the time. What changes is how often the newsroom sits down to make a paper of it, and how much room each piece gets.',
    kinds: {
      hourly: ['Every hour', 'A short sheet at the top of every hour. The paper as it was.', [['Out', 'up to 24 a day'], ['Pieces', 'up to 9, short'], ['Your time', 'a glance, if you like'], ['Proofs', 'they print by themselves']]],
      daily: ['The Daily', 'One issue a day, with the meeting, the page plan and the proof round. The format to play.', [['Out', 'once a day'], ['Pieces', '8–12, one lead'], ['Your time', '10–15 minutes'], ['Proofs', 'yours to correct']]],
      weekly: ['The Weekly', 'One issue a week: long pieces, the week told in a few stories.', [['Out', 'once a week'], ['Pieces', '6–8, long'], ['Your time', 'half an hour, at leisure'], ['Proofs', 'two rounds, the day before']]],
    },
    chosen: 'chosen', dayOf: (k) => (k === 'weekly' ? 'The week of the Weekly' : k === 'daily' ? 'The day of the Daily' : 'The hour of the hourly paper'),
    tl: { wires: 'Wires', wiresSub: 'all the time', round: 'Drafts', you: 'You', youSub: 'proofs', closing: 'Closing', press: 'Press' },
    pressAt: 'When it goes to press', pressHint: 'Morning: it tells last night. Evening: it tells the day.', weekday: 'The day it comes out',
    late: 'If you don\'t proofread in time', lateOut: 'It goes out anyway', lateWait: 'It waits for me', lateHint: 'Out anyway: the managing editor\'s reading is enough. Waits: the edition stays a draft until you send it to press.',
    length: 'Length of the pieces', photos: 'Photos', photosHint: 'Previews of public pages and YouTube thumbnails.', signature: 'How you sign your pieces', signaturePh: 'The Editor',
    // wires
    wTitle: 'Where the news comes from', wSub: '“Titles” means the newsroom knows something happened but cannot quote what was in it. The weight decides how much a wire counts when the meeting picks the stories.',
    funnel: [['Dispatches', 'in since the last press'], ['Stories', 'dispatches grouped by fact'], ['In the paper', 'picked by the meeting'], ['Written', 'drafted so far']],
    modes: { full: 'Full', titles: 'Titles', off: 'Off' }, today: 'today', weekHint: 'last 7 days', weight: 'weight in the meeting', writer: 'Written by', notCollected: 'not collected (config.json)',
    strict: 'How picky the meeting is', strictOpts: { loose: 'Generous', balanced: 'Balanced', strict: 'Only the big ones' }, strictHint: 'Generous lets more short pieces in; only the big ones makes a shorter paper with longer pieces.',
    // staff
    sTitle: 'The staff', sSub: 'Invented writers, all in the house voice. Their character shifts what they notice and their attitude, never the register or the rules about facts.',
    level: (n) => `Lv. ${n}`, toNext: (p) => `${Math.round(p * 100)}% to the next level`, character: 'Character', name: 'Name', role: 'Role', deviation: 'Deviation, in their own words', deviationPh: 'e.g. goes where the small things happen; always keeps the last line for a joke', deviationHint: 'One line from you, added to the dials.',
    traits: { irony: ['Irony', ['earnest', 'gentle', 'the house\'s', 'sharp', 'mocking']], pace: ['Pace', ['telegraphic', 'brisk', 'the house\'s', 'unhurried', 'expansive']], numbers: ['Eye for numbers', ['avoids them', 'few', 'the house\'s', 'keen', 'counts everything']], ending: ['Endings', ['melancholy', 'open', 'the house\'s', 'dry', 'a punchline']] },
    stats: [['pieces', 'pieces signed'], ['leads', 'leads'], ['visti', 'passed by you'], ['liked', '♥ from you'], ['checked', 'figures checked, 30 days'], ['lessons', 'lessons learnt']],
    kindNames: { intern: 'Intern', cartoonist: 'Cartoonist', correspondent: 'Special correspondent', reporter: 'Reporter' },
    chiefDefault: 'Ray Holden', chiefRole: 'managing editor', chiefSub: 'reads the drafts before you', esteem: 'their esteem for you',
    severity: 'How demanding', sevNames: ['lenient', 'easy-going', 'the house\'s', 'demanding', 'ruthless'], peeve: 'Their fixation', peevePh: 'e.g. hates adverbs; wants the time of day in every lead', peeveHint: 'One line: it goes into their instructions, and they send pieces back for it.',
    agreedWeek: 'times you agreed, this week', overruledWeek: 'times you overruled them', esteemHint: 'Their esteem drops when you pass a piece they sent back, or send back one they passed; it rises when you agree.',
    logKind: { overruled: 'You passed', overruledBack: 'You sent back', agreed: 'You both passed', agreedBack: 'You both sent back' },
    hireTitle: 'Hire', hire: 'Hire', full: 'The newsroom is full', unlockAt: (n, r) => `from level ${n} (you are ${r})`,
    hireOpen: { intern: 'someone to teach the trade', cartoonist: 'signs the cartoon\'s caption', correspondent: 'writes the long reads' },
    hireH: { intern: 'An intern', cartoonist: 'A cartoonist', correspondent: 'A special correspondent' },
    hireWhy: {
      intern: 'Everything they write comes straight to you, without the managing editor: every correction you make becomes a lesson. At level 3 you can make them a reporter.',
      cartoonist: 'Writes the caption of every cartoon, in their own character, and signs it.',
      correspondent: 'Takes the long reads: the pieces you commission and the ones the staff propose.',
    },
    hireDo: (n) => `Hire ${n}`, firstBeat: 'Their first section', firstBeatHint: 'They take it over from whoever had it.', giveBeat: 'Give them a section', gone: 'let go', rehire: 'Take back',
    moodLine: { inspired: 'Inspired: you liked their work lately.', fine: 'Fine.', low: 'A little low: a piece sent back, a cut.', offended: 'Offended: too many cuts lately. Writes shorter and drier.' },
    internTrain: (n) => `Learning the trade: everything comes to you. At level ${n} you can promote them.`, internReady: (n) => `${n} has learnt the trade.`, promote: 'Make them a reporter',
    lessons: 'What they have learnt', teach: 'Teach them the trade', noLessons: 'Nothing yet: the corrections of the proof round become lessons.', forget: 'Forget this lesson',
    lessonPh: 'A lesson in your own words: “close on a fact, never on a moral”', teachDo: 'Teach',
    abilities: 'What they can do', fire: (n) => `Let ${n} go…`, heir: (n) => (n ? 'Their sections go to' : 'Who takes their place'), unsigned: 'Unsigned (the newsroom)', fireDo: 'Let go',
    fireBack: 'A founding writer can be taken back, with their record.', fireGone: 'They leave for good, with their record.',
    medals: 'Medals', beats: 'Beats', trial: 'Write a trial with this character', trialing: 'Writing a trial… (a minute or two)', before: 'As printed', after: 'With this character',
    // manual
    manTitle: 'What we tell the writers before they write', manSub: 'The instructions every reporter receives, in the layers they are made of. Open one to read it; the unlocked ones can be replaced with your own version, and tried on a real piece before you keep them.',
    forWriter: 'Shown for', tokens: (n) => `${n.toLocaleString()} tokens`, total: (n) => `The whole instructions: about ${n.toLocaleString()} tokens`,
    locked: 'locked', auto: 'automatic', yours: 'yours', original: 'original',
    edit: 'Edit', restore: 'Restore the original', save: 'Keep this version', cancel: 'Cancel', try: 'Try it on a recent piece →', trying: 'Writing the trial… (a minute or two)',
    lockedWhy: { facts: 'These rules keep the paper true: they come before everything, the voice included.', reply: 'The program reads the writers\' answer in this shape: changing it would break the paper.' },
    autoWhy: { persona: 'Built from the byline and the character set in “The staff”.', taste: 'Built from the paragraphs you marked with ♥ and ✕.' },
    notes: 'Your notes to the writers', notesPh: 'Rules for the writers, for example:\n· Never talk about Facebook\n· Work on TurboCode is always news', diffHint: 'Struck through: the original. Highlighted: your version.',
    // games
    gTitle: 'Games and calls', gSub: 'Each can be switched off. The calls and the closing send a notification.',
    feat: { interview: ['Interviews', 'A reporter calls you about a big story; your answer becomes a quote'], closing: ['The closing', 'The desk asks what leads, or what to cut'], tips: ['Tip box', 'Your tips go into the stories, or into “Word is”'], flash: ['Breaking news', 'A flash when a record falls'], sport: ['Sport', 'Report cards and records'], oracle: ['The Oracle', 'Predictions on what comes next; bet against it'], serial: ['The serial', 'A novel in instalments, you choose how it goes on'], chatter: ['The newsroom, live', 'What the writers say to each other'], readers: ['Readers\' letters', 'The regulars write about the pieces; you publish, answer or bin'], coffee: ['The coffee machine', 'Two writers on a break, talking about the day and about you'] },
    genre: 'Genre of the serial', genres: { giallo: 'Mystery', spy: 'Spy story', scifi: 'Science fiction', feuilleton: 'Serial novel', western: 'Western' },
    // engine
    eTitle: 'The engine', eSub: 'The model that writes the paper runs on this Mac (or on a computer of yours). Without it, the automatic typesetting prints plainer pieces from templates.',
    state: { online: 'Online', offline: 'Not answering', disabled: 'Switched off', unknown: 'Checking…' }, model: 'Model', address: 'Address', change: 'To change it, run npm run setup in the terminal, or edit llm in config.json.', check: 'Check again',
  },
  it: {
    house: 'Casa Editrice', sub: 'Che giornale fare. Ogni scelta vale dal prossimo numero.', back: '← Torna in redazione', saved: 'Salvato', saving: 'Salvo…',
    tabs: { masthead: ['La testata', 'quanto spesso, quando, quanto lungo'], wires: ['Le agenzie', 'da dove arrivano le notizie'], staff: ['I redattori', 'firme, carattere, settori'], manual: ['Il manuale di stile', 'cosa diciamo ai redattori'], games: ['Giochi e chiamate', 'interviste, Oracolo, feuilleton'], engine: ['Il motore', 'il modello locale'] },
    mTitle: 'Che giornale vuoi fare?', mSub: 'Le notizie arrivano sempre. Cambia quante volte la redazione si siede per farne un giornale, e quanto spazio ha ogni pezzo.',
    kinds: {
      hourly: ['Ogni ora', 'Un foglio breve allo scoccare di ogni ora. Il giornale com\'era.', [['Uscite', 'fino a 24 al giorno'], ['Pezzi', 'fino a 9, brevi'], ['Il tuo tempo', 'un\'occhiata, se vuoi'], ['Bozze', 'vanno in stampa da sole']]],
      daily: ['Il Quotidiano', 'Un numero al giorno, con la riunione, il timone, il giro di bozze. Il formato da giocare.', [['Uscite', '1 al giorno'], ['Pezzi', '8–12, un\'apertura'], ['Il tuo tempo', '10–15 minuti'], ['Bozze', 'le correggi tu']]],
      weekly: ['Il Settimanale', 'Un numero a settimana: pezzi lunghi, la settimana in poche storie.', [['Uscite', '1 a settimana'], ['Pezzi', '6–8, lunghi'], ['Il tuo tempo', 'mezz\'ora, con calma'], ['Bozze', 'due giri, il giorno prima']]],
    },
    chosen: 'scelto', dayOf: (k) => (k === 'weekly' ? 'La settimana del Settimanale' : k === 'daily' ? 'La giornata del Quotidiano' : 'L\'ora del foglio orario'),
    tl: { wires: 'Agenzie', wiresSub: 'sempre aperte', round: 'Bozze', you: 'Tu', youSub: 'correzioni', closing: 'Chiusura', press: 'Stampa' },
    pressAt: 'Quando va in stampa', pressHint: 'Mattina: racconta ieri sera. Sera: racconta la giornata.', weekday: 'Il giorno in cui esce',
    late: 'Se non correggi in tempo', lateOut: 'Esce lo stesso', lateWait: 'Aspetta me', lateHint: 'Esce lo stesso: basta la lettura del caporedattore. Aspetta me: l\'edizione resta in bozza finché non la mandi in stampa.',
    length: 'Lunghezza dei pezzi', photos: 'Foto', photosHint: 'Anteprime delle pagine pubbliche e miniature di YouTube.', signature: 'Come firmi i tuoi pezzi', signaturePh: 'Il Direttore',
    wTitle: 'Da dove arrivano le notizie', wSub: '«Titoli» vuol dire che la redazione sa che è successo qualcosa, ma non può citarne il contenuto. Il peso decide quanto un\'agenzia conta quando la riunione sceglie le notizie.',
    funnel: [['Dispacci', 'arrivati dall\'ultima stampa'], ['Storie', 'dispacci raggruppati per fatto'], ['In pagina', 'scelte dalla riunione'], ['Scritti', 'finora']],
    modes: { full: 'Intera', titles: 'Titoli', off: 'Spenta' }, today: 'oggi', weekHint: 'ultimi 7 giorni', weight: 'peso in riunione', writer: 'La scrive', notCollected: 'raccolta spenta (config.json)',
    strict: 'Quanto è severa la riunione', strictOpts: { loose: 'Di manica larga', balanced: 'Equilibrata', strict: 'Solo i fatti grossi' }, strictHint: 'Di manica larga fa entrare più brevi; solo i fatti grossi fa un giornale più corto con pezzi più lunghi.',
    sTitle: 'La squadra', sSub: 'Redattori inventati, tutti nella voce della casa. Il carattere sposta cosa notano e il loro atteggiamento, mai il registro né le regole sui fatti.',
    level: (n) => `Liv. ${n}`, toNext: (p) => `${Math.round(p * 100)}% al prossimo livello`, character: 'Il carattere', name: 'Nome', role: 'Ruolo', deviation: 'Deviazione, in parole sue', deviationPh: 'es. va dove succedono le cose piccole; tiene sempre l\'ultima riga per una battuta', deviationHint: 'Una riga tua, in aggiunta ai cursori.',
    traits: { irony: ['Ironia', ['compunto', 'garbato', 'della casa', 'tagliente', 'beffardo']], pace: ['Passo', ['telegrafico', 'asciutto', 'della casa', 'disteso', 'arioso']], numbers: ['Occhio per i numeri', ['li evita', 'pochi', 'della casa', 'attento', 'contabile']], ending: ['Finale', ['malinconico', 'aperto', 'della casa', 'secco', 'battuta']] },
    stats: [['pieces', 'pezzi firmati'], ['leads', 'aperture'], ['visti', 'visti da te'], ['liked', '♥ da te'], ['checked', 'numeri verificati, 30 giorni'], ['lessons', 'lezioni imparate']],
    kindNames: { intern: 'Stagista', cartoonist: 'Vignettista', correspondent: 'Inviato speciale', reporter: 'Cronista' },
    chiefDefault: 'Aldo Ferri', chiefRole: 'caporedattore', chiefSub: 'legge le bozze prima di te', esteem: 'la sua stima per te',
    severity: 'Quanto è esigente', sevNames: ['indulgente', 'di manica larga', 'della casa', 'esigente', 'spietato'], peeve: 'La sua fissazione', peevePh: 'es. odia gli avverbi; vuole l\'orario in ogni attacco', peeveHint: 'Una riga: entra nelle sue istruzioni, e per quella rimanda i pezzi.',
    agreedWeek: 'volte d\'accordo, questa settimana', overruledWeek: 'volte che l\'hai scavalcato', esteemHint: 'La sua stima scende quando passi un pezzo che lui aveva rimandato, o rimandi uno che aveva passato; sale quando siete d\'accordo.',
    logKind: { overruled: 'Hai passato', overruledBack: 'Hai rimandato', agreed: 'Passato da tutti e due', agreedBack: 'Rimandato da tutti e due' },
    hireTitle: 'Assumi', hire: 'Assumi', full: 'La redazione è piena', unlockAt: (n, r) => `dal livello ${n} (sei al ${r})`,
    hireOpen: { intern: 'qualcuno a cui insegnare il mestiere', cartoonist: 'firma la battuta della vignetta', correspondent: 'scrive gli approfondimenti' },
    hireH: { intern: 'Uno stagista', cartoonist: 'Un vignettista', correspondent: 'Un inviato speciale' },
    hireWhy: {
      intern: 'Tutto quello che scrive arriva dritto a te, senza caporedattore: ogni correzione che fai diventa una lezione. Al livello 3 puoi farlo cronista.',
      cartoonist: 'Scrive la battuta di ogni vignetta, con il suo carattere, e la firma.',
      correspondent: 'Prende gli approfondimenti: quelli che commissioni e quelli che propongono i redattori.',
    },
    hireDo: (n) => `Assumi ${n}`, firstBeat: 'Il suo primo settore', firstBeatHint: 'Lo prende da chi lo aveva.', giveBeat: 'Affidagli un settore', gone: 'lasciato andare', rehire: 'Riassumi',
    moodLine: { inspired: 'Ispirato: ultimamente il suo lavoro ti è piaciuto.', fine: 'Sereno.', low: 'Giù di corda: un pezzo rimandato, un taglio.', offended: 'Offeso: troppi tagli, ultimamente. Scrive più corto e asciutto.' },
    internTrain: (n) => `Impara il mestiere: tutto arriva a te. Al livello ${n} puoi promuoverlo.`, internReady: (n) => `${n} ha imparato il mestiere.`, promote: 'Fallo cronista',
    lessons: 'Cosa ha imparato', teach: 'Insegnagli il mestiere', noLessons: 'Ancora niente: le correzioni del giro di bozze diventano lezioni.', forget: 'Dimentica questa lezione',
    lessonPh: 'Una lezione con parole tue: «chiudi su un fatto, mai su una morale»', teachDo: 'Insegna',
    abilities: 'Cosa sa fare', fire: (n) => `Licenzia ${n}…`, heir: (n) => (n ? 'I suoi settori passano a' : 'Chi prende il suo posto'), unsigned: 'Senza firma (la redazione)', fireDo: 'Licenzia',
    fireBack: 'Una firma storica si può riassumere, con il suo curriculum.', fireGone: 'Se ne va per sempre, con il suo curriculum.',
    medals: 'Medaglie', beats: 'Settori', trial: 'Fagli scrivere una prova con questo carattere', trialing: 'Scrive la prova… (un minuto o due)', before: 'Com\'è uscito', after: 'Con questo carattere',
    manTitle: 'Cosa diciamo ai redattori prima che scrivano', manSub: 'Le istruzioni che ogni cronista riceve, negli strati da cui sono fatte. Aprine uno per leggerlo; quelli non bloccati si possono sostituire con una versione tua, e provare su un pezzo vero prima di tenerla.',
    forWriter: 'Mostrate per', tokens: (n) => `${n.toLocaleString('it-IT')} token`, total: (n) => `Le istruzioni intere: circa ${n.toLocaleString('it-IT')} token`,
    locked: 'bloccato', auto: 'automatico', yours: 'tuo', original: 'originale',
    edit: 'Modifica', restore: 'Ripristina l\'originale', save: 'Tieni questa versione', cancel: 'Annulla', try: 'Provala su un pezzo recente →', trying: 'Scrive la prova… (un minuto o due)',
    lockedWhy: { facts: 'Queste regole tengono il giornale vero: vengono prima di tutto, anche della voce.', reply: 'Il programma legge la risposta dei redattori in questa forma: cambiarla romperebbe il giornale.' },
    autoWhy: { persona: 'Si compone dalla firma e dal carattere scelti in «I redattori».', taste: 'Si compone dai paragrafi che hai segnato con ♥ e ✕.' },
    notes: 'Le tue note ai redattori', notesPh: 'Regole per i redattori, per esempio:\n· Non parlare mai di Facebook\n· Il lavoro su TurboCode è sempre notizia', diffHint: 'Barrato: l\'originale. Evidenziato: la tua versione.',
    gTitle: 'Giochi e chiamate', gSub: 'Ognuno si può spegnere. Le chiamate e la chiusura mandano una notifica.',
    feat: { interview: ['Interviste', 'Un cronista ti chiama su una storia grossa; la risposta diventa una citazione'], closing: ['La chiusura', 'Il desk chiede cosa aprire, o cosa tagliare'], tips: ['Cassetta delle soffiate', 'Le soffiate entrano nelle storie, o in «Si dice che»'], flash: ['Ultim\'ora', 'Un flash quando cade un primato'], sport: ['Sport', 'Pagelle e primati'], oracle: ['L\'Oracolo', 'Pronostici su ciò che viene; ci si può scommettere contro'], serial: ['Il feuilleton', 'Un romanzo a puntate, come continua lo decidi tu'], chatter: ['La redazione viva', 'Cosa si dicono i redattori'], readers: ['Le lettere dei lettori', 'I lettori abituali scrivono sui pezzi; tu pubblichi, rispondi o cestini'], coffee: ['La macchinetta del caffè', 'Due redattori in pausa parlano della giornata e di te'] },
    genre: 'Genere del feuilleton', genres: { giallo: 'Giallo', spy: 'Spy story', scifi: 'Fantascienza', feuilleton: 'Romanzo d\'appendice', western: 'Western' },
    eTitle: 'Il motore', eSub: 'Il modello che scrive il giornale gira su questo Mac (o su un tuo computer). Senza, la tipografia automatica stampa pezzi più semplici, da modelli.',
    state: { online: 'In linea', offline: 'Non risponde', disabled: 'Spento', unknown: 'Controllo…' }, model: 'Modello', address: 'Indirizzo', change: 'Per cambiarlo, esegui npm run setup nel terminale, o modifica llm in config.json.', check: 'Controlla di nuovo',
  },
});

/** The editorial line, saved as it changes (each change sends only what changed). */
function useLine() {
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState(null);
  useEffect(() => { api('/line').then(setMeta).catch((e) => setError(e.message)); }, []);
  const save = useCallback(async (patch) => {
    // shown at once; nested maps (desks, weights, wires, staff…) are merged, not replaced, as the server does
    const merge = (cur, p) => Object.fromEntries(Object.entries({ ...cur, ...p }).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) && cur[k] && typeof cur[k] === 'object' && k in p ? { ...cur[k], ...v } : v]));
    setMeta((m) => (m ? { ...m, line: merge(m.line, patch) } : m));
    setSaving((n) => n + 1);
    setError(null);
    try {
      const r = await api('/line', { method: 'PUT', json: patch });
      setMeta((m) => ({ ...m, line: r.line, staff: r.staff || m.staff }));
    } catch (e) { setError(e.message); } finally { setSaving((n) => n - 1); }
  }, []);
  return { meta, line: meta?.line, save, saving, error };
}

function Seg({ value, options, onChange, label }) {
  return (
    <div className="rd-seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

// ───────────────────────── The masthead ─────────────────────────

function MiniPaper({ kind }) {
  if (kind === 'hourly') {
    return (
      <div className="rd-art rd-stack">
        {[-1, 0, 1].map((k) => <div key={k} className="rd-mini small" style={{ transform: `translate(${k * 24}px, ${k * 9}px) rotate(${k * 4.5}deg)` }}><div className="rd-mn">Times</div><i /><i style={{ width: '70%' }} /></div>)}
      </div>
    );
  }
  if (kind === 'weekly') {
    return <div className="rd-art"><div className="rd-mini tall"><div className="rd-mn big">{tr({ en: 'The Weekly', it: 'La Domenica' })}</div><i className="pic" /><i /><i /><i style={{ width: '80%' }} /></div></div>;
  }
  return <div className="rd-art"><div className="rd-mini"><div className="rd-mn">The Localhost Times</div><div className="rd-g2"><span><i /><i /><i /><i style={{ width: '70%' }} /></span><span><i /><i /><i style={{ width: '50%' }} /></span></div></div></div>;
}

/** A day (or hour, or week) of the chosen paper, on one line. */
function Timeline({ line }) {
  const c = line.cadence;
  const span = c.kind === 'weekly' ? 7 * 24 : c.kind === 'daily' ? 24 : 1;
  const pad = (h) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;
  const marks = c.kind === 'hourly'
    ? [{ at: 0.02, t: T.tl.wires, s: T.tl.wiresSub }, { at: 20 / 60, t: T.tl.round, s: ':20' }, { at: 40 / 60, t: T.tl.round, s: ':40' }, { at: 55 / 60, t: T.tl.closing, s: ':55', cls: 'you' }, { at: 0.985, t: T.tl.press, s: ':00', cls: 'press' }]
    : c.kind === 'daily'
      ? [{ at: 0.02, t: T.tl.wires, s: T.tl.wiresSub }, { at: 21 / 24, t: T.tl.round, s: `${pad(c.pressHour - 3)} · ${pad(c.pressHour - 1)}` }, { at: 23 / 24 - 0.012, t: T.tl.you, s: T.tl.youSub, cls: 'you' }, { at: 0.985, t: T.tl.press, s: `${String(c.pressHour).padStart(2, '0')}:00`, cls: 'press' }]
      : [{ at: 0.02, t: T.tl.wires, s: T.tl.wiresSub }, { at: (span - 26) / span, t: T.tl.round, s: DAYS[(c.weekday + 6) % 7] }, { at: (span - 3) / span - 0.02, t: T.tl.you, s: T.tl.youSub, cls: 'you' }, { at: 0.985, t: T.tl.press, s: DAYS[c.weekday], cls: 'press' }];
  const ticks = c.kind === 'hourly' ? [':00', ':15', ':30', ':45', ':00'] : c.kind === 'daily' ? [0, 6, 12, 18, 24].map((h) => pad(c.pressHour + h)) : [0, 1, 2, 3, 4, 5, 6, 7].map((d) => DAYS[(c.weekday + d) % 7].slice(0, 3));
  return (
    <div className="rd-timeline">
      <div className="rd-sh"><h4>{T.dayOf(c.kind)}</h4></div>
      <div className="rd-tl">
        <div className="rd-axis" />
        {marks.map((m, i) => <div key={i} className={`rd-mk ${m.cls || ''}`} style={{ left: `${m.at * 100}%` }}><b>{m.t}</b><i /><span>{m.s}</span></div>)}
      </div>
      <div className="rd-tlh num">{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>
    </div>
  );
}

function Masthead({ line, meta, save }) {
  const c = line.cadence;
  const hours = [6, 7, 8, 12, 13, 18, 19, 20, 21];
  return (
    <>
      <div className="rd-htitle"><h2>{T.mTitle}</h2><p>{T.mSub}</p></div>
      <div className="rd-periods" role="group">
        {['hourly', 'daily', 'weekly'].map((k) => {
          const [name, text, dl] = T.kinds[k];
          return (
            <button key={k} className="rd-per" aria-pressed={c.kind === k} onClick={() => save({ cadence: { ...c, kind: k } })}>
              {c.kind === k && <span className="rd-tag">{T.chosen}</span>}
              <MiniPaper kind={k} />
              <span className="rd-pbody">
                <b>{name}</b>
                <span className="rd-ptext">{text}</span>
                <dl>{dl.map(([a, b]) => <React.Fragment key={a}><dt>{a}</dt><dd>{b}</dd></React.Fragment>)}</dl>
              </span>
            </button>
          );
        })}
      </div>
      <Timeline line={line} />
      <div className="rd-cfg">
        {c.kind !== 'hourly' && (
          <div className="rd-field">
            <span className="rd-flbl">{T.pressAt}</span>
            <Seg value={c.pressHour} options={hours.map((h) => [h, `${String(h).padStart(2, '0')}:00`])} onChange={(h) => save({ cadence: { ...c, pressHour: h } })} label={T.pressAt} />
            <small>{T.pressHint}</small>
          </div>
        )}
        {c.kind === 'weekly' && (
          <div className="rd-field">
            <label className="rd-flbl" htmlFor="h-weekday">{T.weekday}</label>
            <select id="h-weekday" value={c.weekday} onChange={(e) => save({ cadence: { ...c, weekday: Number(e.target.value) } })}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
        )}
        <div className="rd-field">
          <span className="rd-flbl">{T.late}</span>
          <Seg value={line.autoPublish} options={[[true, T.lateOut], [false, T.lateWait]]} onChange={(v) => save({ autoPublish: v })} label={T.late} />
          <small>{T.lateHint}</small>
        </div>
        <div className="rd-field">
          <span className="rd-flbl">{T.length}</span>
          <Seg value={line.length} options={Object.entries(meta.lengths).map(([k, l]) => [k, l.label])} onChange={(v) => save({ length: v })} label={T.length} />
        </div>
        <div className="rd-field">
          <span className="rd-flbl">{T.photos}</span>
          <Seg value={line.photos} options={[[true, tr({ en: 'On', it: 'Sì' })], [false, tr({ en: 'Off', it: 'No' })]]} onChange={(v) => save({ photos: v })} label={T.photos} />
          <small>{T.photosHint}</small>
        </div>
        <div className="rd-field">
          <label className="rd-flbl" htmlFor="h-sign">{T.signature}</label>
          <input id="h-sign" type="text" defaultValue={line.directorName} placeholder={T.signaturePh} onBlur={(e) => e.target.value !== line.directorName && save({ directorName: e.target.value })} />
        </div>
      </div>
    </>
  );
}

// ───────────────────────── The wires ─────────────────────────

function Spark({ data }) {
  const max = Math.max(1, ...data);
  const pts = data.map((y, i) => `${(i / (data.length - 1)) * 70},${17 - (y / max) * 15}`);
  return <svg className="rd-spark" viewBox="0 0 70 18" aria-hidden="true"><path className="a" d={`M0,18 L${pts.join(' L')} L70,18 Z`} /><path d={`M${pts.join(' L')}`} /></svg>;
}

function Wires({ line, meta, save }) {
  const [w, setW] = useState(null);
  const [v, setV] = useState(null);
  useEffect(() => { api('/wires').then(setW).catch(() => {}); api('/workbench').then(setV).catch(() => {}); }, []);
  const people = Object.values(meta.staff || {});
  const funnel = v ? [v.signals, v.stories, Math.min(v.stories, v.maxArticles), v.pieces.filter((p) => p.text).length] : [0, 0, 0, 0];
  const top = Math.max(1, funnel[0]);
  return (
    <>
      <div className="rd-htitle"><h2>{T.wTitle}</h2><p>{T.wSub}</p></div>
      <div className="rd-funnel">
        {T.funnel.map(([a, b], i) => (
          <div key={a}><span className="rd-lbl">{a}</span><b className="num">{funnel[i].toLocaleString()}</b><span>{b}</span><i style={{ width: `${Math.max(4, (funnel[i] / top) * 100)}%` }} className={i === 2 ? 'r' : ''} /></div>
        ))}
      </div>
      <div className="rd-wires">
        {SECTIONS.map((s) => {
          const mode = line.wires?.[s.id] || 'full';
          const week = w?.week?.[s.id] || Array(7).fill(0);
          const weight = line.sectionWeights?.[s.id] ?? 1;
          const level = weight === 0 ? 0 : weight < 1 ? 1 : weight === 1 ? 2 : weight < 2 ? 3 : 4;
          const collecting = w?.collecting?.[s.id] !== false;
          return (
            <div key={s.id} className={`rd-wire ${mode === 'off' ? 'off' : ''}`}>
              <span className="rd-ic">{s.id.slice(0, 3).toUpperCase()}</span>
              <div className="rd-wmain">
                <b>{s.name}</b> <span className="rd-mut">· {s.tag}</span>
                <div className="rd-meta">
                  <span title={T.weekHint}><Spark data={week} /></span>
                  <span className="num">{week[6]} {T.today}</span>
                  {!collecting && <span className="rd-warn">{T.notCollected}</span>}
                </div>
                <div className="rd-meta">
                  <span className="rd-weight" role="group" aria-label={T.weight} title={T.weight}>
                    {meta.weights.filter((x) => x.value > 0).map((x, k) => (
                      <button key={x.value} type="button" className={k + 1 <= level ? 'on' : ''} aria-label={x.label} onClick={() => save({ sectionWeights: { [s.id]: x.value } })} />
                    ))}
                  </span>
                  <label className="rd-wsel">{T.writer}
                    <select value={line.desks?.[s.id] ?? ''} onChange={(e) => save({ desks: { [s.id]: e.target.value } })}>
                      <option value="">{T.unsigned}</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="rd-mode" role="group" aria-label={s.name}>
                {['full', 'titles', 'off'].map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => save({ wires: { [s.id]: m } })}>{T.modes[m]}</button>)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="rd-field" style={{ maxWidth: 560 }}>
        <span className="rd-flbl">{T.strict}</span>
        <Seg value={line.strictness || 'balanced'} options={Object.entries(T.strictOpts)} onChange={(v2) => save({ strictness: v2 })} label={T.strict} />
        <small>{T.strictHint}</small>
      </div>
    </>
  );
}

// ───────────────────────── The staff ─────────────────────────

function Trial({ r }) {
  if (!r) return null;
  return (
    <div className="rd-trial">
      <div><h6>{T.before}</h6><b>{r.before.headline}</b>{r.before.body.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}</div>
      <div className="t2"><h6>{T.after}</h6><b>{r.after.headline}</b>{r.after.body.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}</div>
    </div>
  );
}

/** The managing editor's card: name, how demanding, their fixation, and what they think of you. */
function ChiefDossier({ line, save }) {
  const [c, setC] = useState(null);
  useEffect(() => { api('/chief').then(setC).catch(() => {}); }, [line.chief]);
  if (!c) return <div className="rd-dossier" />;
  const set = (patch) => { setC((x) => ({ ...x, ...patch })); save({ chief: { ...line.chief, ...patch } }); };
  return (
    <div className="rd-dossier">
      <div className="rd-dhead">
        <span className="rd-med lg" style={{ '--h': '#3a3a3a' }}>✎</span>
        <div><h3>{c.name}</h3><p>{c.role} · {T.chiefSub}</p><p className={`rd-chief-mood ${c.mood}`}>{c.moodText}.</p></div>
        <div className="rd-lvbox"><b>{c.esteem}</b><div className="rd-esteem"><i style={{ width: `${c.esteem}%` }} /></div>{T.esteem}</div>
      </div>
      <div className="rd-dbody">
        <div>
          <div className="rd-trait">
            <div className="rd-row"><label htmlFor="c-sev">{T.severity}</label><span>{T.sevNames[c.severity]}</span></div>
            <input id="c-sev" type="range" min="0" max="4" step="1" value={c.severity} onChange={(e) => set({ severity: Number(e.target.value) })} />
            <div className="rd-ends"><span>{T.sevNames[0]}</span><span>{T.sevNames[4]}</span></div>
          </div>
          <div className="rd-field">
            <label className="rd-flbl" htmlFor="c-peeve">{T.peeve}</label>
            <input id="c-peeve" type="text" maxLength={200} defaultValue={line.chief?.peeve || ''} placeholder={T.peevePh} onBlur={(e) => e.target.value !== (line.chief?.peeve || '') && set({ peeve: e.target.value })} />
            <small>{T.peeveHint}</small>
          </div>
          <div className="rd-field">
            <label className="rd-flbl" htmlFor="c-name">{T.name}</label>
            <input id="c-name" type="text" defaultValue={line.chief?.name || ''} placeholder={c.name} onBlur={(e) => e.target.value !== (line.chief?.name || '') && set({ name: e.target.value })} />
          </div>
        </div>
        <div className="rd-dright">
          <div className="rd-stats">
            <div className="rd-stat"><b className="num">{c.week.agreed}</b><span>{T.agreedWeek}</span></div>
            <div className="rd-stat"><b className="num">{c.week.overruled}</b><span>{T.overruledWeek}</span></div>
          </div>
          <p className="rd-mut">{T.esteemHint}</p>
          {c.recent?.length > 0 && (
            <ul className="rd-chieflog">{c.recent.map((x, i) => <li key={i} className={x.d < 0 ? 'neg' : 'pos'}><span>{x.d > 0 ? `+${x.d}` : x.d}</span>{T.logKind[x.kind]} «{x.headline}»</li>)}</ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Staff({ line, save }) {
  const [v, setV] = useState(null);
  const [cur, setCur] = useState('local');
  const [trial, setTrial] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [firing, setFiring] = useState(null); // the heir chosen while confirming
  const [hiring, setHiring] = useState(null); // { kind, name, role }
  const [lesson, setLesson] = useState('');
  const load = useCallback(() => api('/staff').then(setV).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (path, opts, after) => {
    setBusy(true); setErr(null);
    try { const r = await api(path, opts); setV(r); after?.(r); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!v) return null;
  const list = v.staff;
  const onStaff = list.filter((x) => !x.fired);
  const w = list.find((x) => x.id === cur) || onStaff[0];
  if (!w) return null;
  const mine = line.staff?.[w.id] || {};
  const traits = { ...w.traits, ...(mine.traits || {}) };
  const setWriter = (patch) => {
    const next = { name: w.name, role: w.role, deviation: w.deviation || '', ...mine, traits, ...patch };
    setV((x) => ({ ...x, staff: x.staff.map((y) => (y.id === w.id ? { ...y, ...next } : y)) }));
    save({ staff: { [w.id]: next } });
  };
  const sections = Object.fromEntries(SECTIONS.map((s) => [s.id, s.name]));
  const pick = (id) => { setCur(id); setTrial(null); setFiring(null); setHiring(null); setLesson(''); };
  async function runTrial() {
    setBusy(true); setErr(null); setTrial(null);
    try { setTrial(await api('/manual/trial', { method: 'POST', json: { writer: { id: w.id, traits, deviation: mine.deviation ?? w.deviation ?? '' } } })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const kindName = (k) => T.kindNames[k] || '';
  return (
    <>
      <div className="rd-htitle"><h2>{T.sTitle}</h2><p>{T.sSub}</p></div>
      <div className="rd-staffgrid">
        <div className="rd-cards">
          <button className={`rd-wc rd-wc-chief ${cur === 'chief' && !hiring ? 'on' : ''}`} onClick={() => pick('chief')}>
            <span className="rd-med" style={{ '--h': '#3a3a3a' }}>✎</span>
            <span><b>{line.chief?.name || T.chiefDefault}</b><small>{T.chiefRole}</small></span>
            <span className="rd-lv" />
          </button>
          {onStaff.map((x) => (
            <button key={x.id} className={`rd-wc ${x.id === w.id && cur !== 'chief' && !hiring ? 'on' : ''}`} onClick={() => pick(x.id)}>
              <Medallion writer={x} />
              <span><b>{x.name}</b><small>{x.role}{x.mood && x.mood !== 'fine' ? ` · ${MOODS[x.mood]}` : ''}</small></span>
              <span className="rd-lv">{T.level(x.level)}</span>
            </button>
          ))}
          <span className="rd-lbl rd-cards-h">{T.hireTitle}</span>
          {v.hires.filter((h) => !h.taken).map((h) => (
            <button key={h.kind} className={`rd-wc locked ${h.open ? 'open' : ''} ${hiring?.kind === h.kind ? 'on' : ''}`} disabled={!h.open}
              onClick={() => setHiring({ kind: h.kind, name: h.name, role: h.role })}>
              <span className="rd-med">+</span>
              <span><b>{kindName(h.kind)}</b><small>{h.open ? T.hireOpen[h.kind] : v.full ? T.full : T.unlockAt(h.rank, v.rank)}</small></span>
              <span className="rd-lv">{h.open ? T.hire : '🔒'}</span>
            </button>
          ))}
          {list.filter((x) => x.fired).map((x) => (
            <div key={x.id} className="rd-wc gone">
              <Medallion writer={x} />
              <span><b>{x.name}</b><small>{T.gone}</small></span>
              <button className="rd-link" disabled={busy || v.full} onClick={() => act(`/staff/${x.id}/rehire`, { method: 'POST' }, () => pick(x.id))}>{T.rehire}</button>
            </div>
          ))}
        </div>

        {cur === 'chief' && !hiring ? <ChiefDossier line={line} save={save} /> : hiring ? (
          <div className="rd-dossier rd-hiring">
            <div className="rd-dhead"><span className="rd-med lg">+</span><div><h3>{T.hireH[hiring.kind]}</h3><p>{T.hireWhy[hiring.kind]}</p></div></div>
            <form className="rd-dbody" onSubmit={(e) => { e.preventDefault(); act('/staff/hire', { method: 'POST', json: hiring }, (r) => r.hired && pick(r.hired)); }}>
              <div className="rd-two">
                <div className="rd-field"><label className="rd-flbl" htmlFor="h-name">{T.name}</label><input id="h-name" type="text" value={hiring.name} onChange={(e) => setHiring({ ...hiring, name: e.target.value })} /></div>
                <div className="rd-field"><label className="rd-flbl" htmlFor="h-role">{T.role}</label><input id="h-role" type="text" value={hiring.role} onChange={(e) => setHiring({ ...hiring, role: e.target.value })} /></div>
              </div>
              {hiring.kind === 'intern' && (
                <div className="rd-field">
                  <label className="rd-flbl" htmlFor="h-beat">{T.firstBeat}</label>
                  <select id="h-beat" value={hiring.beat || ''} onChange={(e) => setHiring({ ...hiring, beat: e.target.value })}>
                    <option value="">—</option>
                    {SECTIONS.map((x) => <option key={x.id} value={x.id}>{x.name}{line.desks?.[x.id] ? ` (${onStaff.find((y) => y.id === line.desks[x.id])?.name || '—'})` : ''}</option>)}
                  </select>
                  <small>{T.firstBeatHint}</small>
                </div>
              )}
              <div className="rd-acts"><button className="btn btn-small" disabled={busy || !hiring.name.trim() || (hiring.kind === 'intern' && !hiring.beat)}>{T.hireDo(hiring.name || '…')}</button><button type="button" className="rd-ghost" onClick={() => setHiring(null)}>{T.cancel}</button></div>
            </form>
            {err && <p className="notice rd-pad">{err}</p>}
          </div>
        ) : (
        <div className="rd-dossier">
          <div className="rd-dhead">
            <Medallion writer={w} size="lg" />
            <div>
              <h3>{w.name}{w.kind !== 'writer' && <span className="rd-pill h rd-kind">{kindName(w.kind)}</span>}</h3>
              <p>{w.role}{w.beats.length ? ` · ${w.beats.map((b) => sections[b] || (b === 'brief' ? tr({ en: 'the Brief', it: 'il Punto' }) : b)).join(', ')}` : ''}</p>
              <p className={`rd-mood ${w.mood}`}>{T.moodLine[w.mood]}</p>
              {w.kind !== 'cartoonist' && (
                <select className="rd-beatsel" value="" aria-label={T.giveBeat} onChange={(e) => e.target.value && save({ desks: { [e.target.value]: w.id } }).then(load)}>
                  <option value="">{T.giveBeat}…</option>
                  {SECTIONS.filter((x) => !w.beats.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
            </div>
            <div className="rd-lvbox"><b>{T.level(w.level)}</b><div className="rd-bar"><i style={{ width: `${Math.round(w.progress * 100)}%` }} /></div>{T.toNext(w.progress)}</div>
          </div>
          {w.kind === 'intern' && (
            <div className={`rd-intern ${w.promotable ? 'ready' : ''}`}>
              <span>{w.promotable ? T.internReady(w.name) : T.internTrain(v.promoteLevel)}</span>
              {w.promotable && <button className="btn btn-small" disabled={busy} onClick={() => act(`/staff/${w.id}/promote`, { method: 'POST' })}>{T.promote}</button>}
            </div>
          )}
          <div className="rd-dbody">
            <div>
              <span className="rd-lbl">{T.character}</span>
              {Object.entries(T.traits).map(([k, [name, ends]]) => (
                <div key={`${w.id}-${k}`} className="rd-trait">
                  <div className="rd-row"><label htmlFor={`t-${k}`}>{name}</label><span>{ends[traits[k]]}</span></div>
                  <input id={`t-${k}`} type="range" min="0" max="4" step="1" value={traits[k]} onChange={(e) => setWriter({ traits: { ...traits, [k]: Number(e.target.value) } })} />
                  <div className="rd-ends"><span>{ends[0]}</span><span>{ends[4]}</span></div>
                </div>
              ))}
              <div className="rd-field">
                <label className="rd-flbl" htmlFor="w-dev">{T.deviation}</label>
                <textarea id="w-dev" key={`dev-${w.id}`} rows={2} maxLength={300} defaultValue={mine.deviation ?? w.deviation ?? ''} placeholder={T.deviationPh} onBlur={(e) => e.target.value !== (mine.deviation ?? w.deviation ?? '') && setWriter({ deviation: e.target.value })} />
                <small>{T.deviationHint}</small>
              </div>
              <div className="rd-two">
                <div className="rd-field"><label className="rd-flbl" htmlFor="w-name">{T.name}</label><input id="w-name" key={`n-${w.id}`} type="text" defaultValue={w.name} onBlur={(e) => e.target.value.trim() && e.target.value !== w.name && setWriter({ name: e.target.value.trim() })} /></div>
                <div className="rd-field"><label className="rd-flbl" htmlFor="w-role">{T.role}</label><input id="w-role" key={`r-${w.id}`} type="text" defaultValue={w.role} onBlur={(e) => e.target.value.trim() && e.target.value !== w.role && setWriter({ role: e.target.value.trim() })} /></div>
              </div>
              <div className="rd-lessons">
                <span className="rd-lbl">{w.kind === 'intern' ? T.teach : T.lessons}</span>
                {w.lessons.length ? (
                  <ul>{w.lessons.map((l) => (
                    <li key={l.key}><span>{l.text}</span><button className="rd-x" aria-label={T.forget} title={T.forget} onClick={() => act(`/staff/${w.id}/lessons`, { method: 'DELETE', json: { key: l.key } })}>✕</button></li>
                  ))}</ul>
                ) : <p className="rd-mut">{T.noLessons}</p>}
                <form className="rd-lessonform" onSubmit={(e) => { e.preventDefault(); if (lesson.trim()) act(`/staff/${w.id}/lessons`, { method: 'POST', json: { text: lesson } }, () => setLesson('')); }}>
                  <input type="text" value={lesson} maxLength={240} onChange={(e) => setLesson(e.target.value)} placeholder={T.lessonPh} aria-label={T.lessonPh} />
                  <button className="btn btn-small" disabled={busy || !lesson.trim()}>{T.teachDo}</button>
                </form>
              </div>
            </div>
            <div className="rd-dright">
              <div className="rd-stats">
                {T.stats.map(([k, label]) => <div key={k} className="rd-stat"><b className="num">{k === 'checked' ? (w.stats.checked == null ? '—' : `${w.stats.checked}%`) : w.stats[k] ?? 0}</b><span>{label}</span></div>)}
              </div>
              <div>
                <span className="rd-lbl">{T.abilities}</span>
                <ul className="rd-abilities">
                  {w.abilities.map((x) => <li key={x.id} className={x.have ? 'have' : ''}><b>{x.have ? '★' : `${T.level(x.level)}`}</b><span><strong>{x.name}</strong>{x.what}</span></li>)}
                </ul>
              </div>
              <div>
                <span className="rd-lbl">{T.medals}</span>
                <div className="rd-badges">
                  {w.medals.map((m) => <span key={m.id} className={`rd-badge ${m.won ? '' : 'lock'}`} title={`${m.have}/${m.need}`}><i>{m.won ? '★' : `${m.have}`}</i>{m.name}</span>)}
                </div>
              </div>
              <button className="btn btn-small" disabled={busy} onClick={runTrial}>{busy ? T.trialing : T.trial}</button>
              {err && <p className="notice">{err}</p>}
              <div className="rd-fire">
                {firing === null ? (
                  <button className="rd-link danger" disabled={onStaff.length <= 1} onClick={() => setFiring('')}>{T.fire(w.name.split(' ')[0])}</button>
                ) : (
                  <div className="rd-firebox">
                    <label className="rd-flbl" htmlFor="w-heir">{T.heir(w.beats.length)}</label>
                    <select id="w-heir" value={firing} onChange={(e) => setFiring(e.target.value)}>
                      <option value="">{T.unsigned}</option>
                      {onStaff.filter((x) => x.id !== w.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <div className="rd-acts">
                      <button className="btn btn-small danger" disabled={busy} onClick={() => act(`/staff/${w.id}/fire`, { method: 'POST', json: { heir: firing } }, () => { setFiring(null); setCur(firing || onStaff.find((x) => x.id !== w.id)?.id); })}>{T.fireDo}</button>
                      <button className="rd-ghost" onClick={() => setFiring(null)}>{T.cancel}</button>
                    </div>
                    <small className="rd-mut">{w.kind === 'writer' ? T.fireBack : T.fireGone}</small>
                  </div>
                )}
              </div>
            </div>
          </div>
          <Trial r={trial} />
        </div>
        )}
      </div>
    </>
  );
}

// ───────────────────────── The style manual ─────────────────────────

/** Side by side: the original layer with what you removed struck through, your version with what you added marked. */
function Diff({ base, own }) {
  const d = wordDiff(base.split(/\n+/), own.split(/\n+/));
  if (!d) return <pre className="rd-code">{own}</pre>;
  const col = (list, Tag) => {
    const paras = [[]];
    for (const x of list) { if (x.t === '¶') paras.push([]); else paras[paras.length - 1].push(x); }
    return paras.map((p, k) => <div key={k}>{p.map((x, i) => <React.Fragment key={i}>{i ? ' ' : ''}{x.same ? x.t : <Tag>{x.t}</Tag>}</React.Fragment>)}</div>);
  };
  return (
    <div className="rd-diff">
      <div className="rd-code"><span className="rd-lbl">{T.original}</span>{col(d.left, 'del')}</div>
      <div className="rd-code"><span className="rd-lbl">{T.yours}</span>{col(d.right, 'ins')}</div>
    </div>
  );
}

function Manual({ line, meta, save }) {
  const [writer, setWriter] = useState('local');
  const [m, setM] = useState(null);
  const [cur, setCur] = useState('voice');
  const [draft, setDraft] = useState(null);
  const [trial, setTrial] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const load = useCallback(() => api(`/manual?writer=${writer}`).then(setM).catch((e) => setErr(e.message)), [writer]);
  useEffect(() => { load(); }, [load, line.manual, line.notes]);
  const people = Object.values(meta.staff || {});
  if (!m) return null;
  const layer = m.layers.find((x) => x.id === cur) || m.layers[0];
  const editable = !layer.locked && !layer.auto;
  const colors = { how: 'var(--ink-2)', facts: 'var(--ink)', voice: 'var(--accent)', headlines: 'var(--fix)', persona: 'var(--hand)', taste: 'var(--good)', examples: 'var(--rd-gold)', reply: 'var(--muted)' };
  async function keep() {
    await save({ manual: { [layer.id]: draft } });
    setDraft(null);
  }
  async function runTrial() {
    setBusy(true); setErr(null); setTrial(null);
    try { setTrial(await api('/manual/trial', { method: 'POST', json: { manual: draft != null ? { [layer.id]: draft } : null } })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const tag = (x) => (x.locked ? <span className="rd-pill">{T.locked}</span> : x.auto ? <span className="rd-pill ok">{T.auto}</span> : x.own ? <span className="rd-pill h">{T.yours}</span> : <span className="rd-pill">{T.original}</span>);
  return (
    <>
      <div className="rd-htitle"><h2>{T.manTitle}</h2><p>{T.manSub}</p></div>
      <div className="rd-scope">
        <label htmlFor="m-writer">{T.forWriter}</label>
        <select id="m-writer" value={writer} onChange={(e) => setWriter(e.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {m.layers.some((x) => x.own) && <span className="rd-pill h">{m.layers.filter((x) => x.own).length} {T.yours}</span>}
      </div>
      <div className="rd-manual">
        <div>
          <div className="rd-layers">
            {m.layers.map((x, i) => (
              <button key={x.id} className={`rd-layer ${x.id === layer.id ? 'on' : ''}`} onClick={() => { setCur(x.id); setDraft(null); setTrial(null); }}>
                <span className="rd-ix">{i + 1}</span>
                <span><b>{x.title}</b><small>{x.sub || T.tokens(x.tokens)}</small></span>
                {tag(x)}
              </button>
            ))}
          </div>
          <div className="rd-tokmeta">{T.total(m.total)}<div className="rd-tokbar">{m.layers.map((x) => <i key={x.id} style={{ width: `${(x.tokens / Math.max(1, m.total)) * 100}%`, background: colors[x.id] }} />)}</div></div>
        </div>
        <div className="rd-editorcol">
          <div className="rd-editor">
            <div className="rd-edhead">
              <div><span className="rd-lbl">{layer.title} · {T.tokens(layer.tokens)}</span></div>
              <div className="rd-acts">
                {editable && draft == null && <button className="rd-ghost" onClick={() => setDraft(layer.own || layer.base || '')}>{T.edit}</button>}
                {editable && layer.own && draft == null && <button className="rd-ghost" onClick={() => save({ manual: { [layer.id]: '' } })}>{T.restore}</button>}
              </div>
            </div>
            {draft != null ? (
              <textarea className="rd-code rd-edit" rows={16} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={layer.title} />
            ) : layer.own ? (
              <><Diff base={layer.base} own={layer.own} /><p className="rd-mut rd-pad">{T.diffHint}</p></>
            ) : (
              <pre className="rd-code">{layer.text || '—'}</pre>
            )}
            {layer.locked && <p className="rd-mut rd-pad">{T.lockedWhy[layer.id]}</p>}
            {layer.auto && <p className="rd-mut rd-pad">{T.autoWhy[layer.id]}</p>}
            {layer.id === 'voice' && draft == null && (
              <div className="rd-field rd-pad">
                <label className="rd-flbl" htmlFor="m-notes">{T.notes}</label>
                <textarea id="m-notes" rows={4} defaultValue={line.notes} placeholder={T.notesPh} onBlur={(e) => e.target.value !== line.notes && save({ notes: e.target.value })} />
              </div>
            )}
            {editable && (
              <div className="rd-edfoot">
                {draft != null && <><button className="btn btn-small" onClick={keep}>{T.save}</button><button className="rd-ghost" onClick={() => setDraft(null)}>{T.cancel}</button></>}
                <button className="btn btn-small" disabled={busy} onClick={runTrial}>{busy ? T.trying : T.try}</button>
              </div>
            )}
          </div>
          {err && <p className="notice">{err}</p>}
          <Trial r={trial} />
        </div>
      </div>
    </>
  );
}

// ───────────────────────── Games, engine ─────────────────────────

function Games({ line, save }) {
  return (
    <>
      <div className="rd-htitle"><h2>{T.gTitle}</h2><p>{T.gSub}</p></div>
      <div className="rd-games">
        {Object.entries(T.feat).map(([k, [name, hint]]) => (
          <label key={k} className={`rd-game ${line.features?.[k] !== false ? 'on' : ''}`}>
            <input type="checkbox" checked={line.features?.[k] !== false} onChange={(e) => save({ features: { [k]: e.target.checked } })} />
            <span><b>{name}</b><small>{hint}</small></span>
          </label>
        ))}
      </div>
      <div className="rd-field" style={{ maxWidth: 360 }}>
        <label className="rd-flbl" htmlFor="g-genre">{T.genre}</label>
        <select id="g-genre" value={line.serialGenre || 'giallo'} onChange={(e) => save({ serialGenre: e.target.value })}>
          {Object.entries(T.genres).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
    </>
  );
}

function Engine() {
  const [s, setS] = useState(null);
  const check = () => api('/status?check=1').then(setS).catch(() => {});
  useEffect(() => { check(); }, []);
  const st = s?.llm?.state || 'unknown';
  return (
    <>
      <div className="rd-htitle"><h2>{T.eTitle}</h2><p>{T.eSub}</p></div>
      <div className="rd-engine">
        <div><span className="rd-lbl">{tr({ en: 'State', it: 'Stato' })}</span><b className={`st-${st}`}>{T.state[st] || st}</b>{s?.llm?.error && <small>{s.llm.error}</small>}</div>
        <div><span className="rd-lbl">{T.model}</span><b>{s?.llm?.model ? modelName(s.llm.model) : '—'}</b></div>
        <div><span className="rd-lbl">{T.address}</span><b className="rd-mono">{s?.llm?.base || s?.llm?.baseUrl || '—'}</b></div>
      </div>
      <p className="rd-mut">{T.change}</p>
      <button className="btn btn-small" onClick={check}>{T.check}</button>
    </>
  );
}

const TABS = ['masthead', 'wires', 'staff', 'manual', 'games', 'engine'];

export default function House({ tab = 'masthead' }) {
  const { meta, line, save, saving, error } = useLine();
  const t = TABS.includes(tab) ? tab : 'masthead';
  const body = useMemo(() => {
    if (!line) return null;
    const p = { line, meta, save };
    return { masthead: <Masthead {...p} />, wires: <Wires {...p} />, staff: <Staff {...p} />, manual: <Manual {...p} />, games: <Games {...p} />, engine: <Engine /> }[t];
  }, [t, line, meta, save]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } window.scrollTo({ top: 0 }); }, [t]);
  return (
    <div className="rd-house">
      <aside className="rd-hnav">
        <div className="rd-np">{T.house}</div>
        <p className="rd-hsub">{T.sub}</p>
        {TABS.map((k) => (
          <a key={k} href={href.house(k)} className={k === t ? 'on' : ''}>{T.tabs[k][0]}<small>{T.tabs[k][1]}</small></a>
        ))}
        <a className="rd-back" href={href.desk()}>{T.back}</a>
        <span className="rd-saved" role="status">{saving ? T.saving : line ? T.saved : ''}</span>
      </aside>
      <main className="rd-hmain">
        {error && <p className="notice">{error}</p>}
        {body}
      </main>
    </div>
  );
}
