import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, href, SECTIONS, modelName } from '../lib.js';
import { tr } from '../i18n.js';
import { Medallion } from './Medallion.jsx';

/*
 * The settings: what paper to make, away from the desk. When it comes out and how long it is,
 * where the news comes from, who writes it and with what character, the model. Every change is
 * saved as it is made and counts from the next edition.
 */

const DAYS = tr({ en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], it: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'] });

const T = tr({
  en: {
    house: 'Settings', sub: 'What paper to make. Every change counts from the next edition.', back: '← Back to the newsroom', saved: 'Saved', saving: 'Saving…',
    tabs: { masthead: ['The paper', 'when it comes out, how long'], wires: ['The sources', 'where the news comes from'], interni: ['Home Affairs', 'your projects'], staff: ['The bylines', 'names, character, sections'], engine: ['The engine', 'the local model'] },
    iTitle: 'Your projects', iSub: 'Home Affairs tells what you built: the paper reads each repository (never writes to it) for its commits, the parts of the project that changed, the files born, the dependencies, the releases, and how it stands: work not committed, commits not pushed.',
    iFolder: 'The folder of your projects', iChoose: 'Choose the folder…', iOr: 'or type its path', iSet: 'Use it', iNone: 'No repositories in this folder.', iDefault: 'Not chosen yet: the paper looks in the folders of the Files source.',
    iIn: 'In', iOut: 'Out', iName: 'Called in the paper', iDirty: (n) => `${n} not committed`, iAhead: (n) => `${n} not pushed`, iIdle: (n) => (n === 0 ? 'worked on today' : n === 1 ? 'quiet since yesterday' : `quiet for ${n} days`), iPage: 'Its page',
    mTitle: 'What paper do you want to make?', mSub: 'The news comes in all the time. What changes is how often the newsroom sits down to make a paper of it, and how much room each piece gets.',
    kinds: {
      hourly: ['Every hour', 'A short sheet at the top of every hour, and an evening edition. Experimental: many hours have little to tell.', [['Out', 'up to 24 a day'], ['Pieces', 'up to 9, short'], ['Your time', 'a glance, if you like'], ['Proofs', 'they print by themselves']]],
      daily: ['The Daily', 'One issue a day: yesterday, told over breakfast. The paper as it is meant to be read.', [['Out', 'once a day'], ['Pieces', 'a few, with room'], ['Your time', 'five minutes'], ['Proofs', 'they print by themselves']]],
      weekly: ['The Weekly', 'One issue a week: long pieces, the week told in a few stories.', [['Out', 'once a week'], ['Pieces', '6–8, long'], ['Your time', 'half an hour, at leisure'], ['Proofs', 'they print by themselves']]],
    },
    chosen: 'chosen', dayOf: (k) => (k === 'weekly' ? 'The week of the Weekly' : k === 'daily' ? 'The day of the Daily' : 'The hour of the hourly paper'),
    tl: { wires: 'Sources', wiresSub: 'all the time', round: 'Drafts', press: 'Press' },
    pressAt: 'When it goes to press', pressHint: 'Morning: it tells last night. Evening: it tells the day.', weekday: 'The day it comes out',
    late: 'Before it goes out', lateOut: 'It prints by itself', lateWait: 'I approve it first', lateHint: 'By itself: the managing editor\'s reading is enough. Approve first: the edition stays a draft until you send it to press from the Newsroom.',
    length: 'Length of the pieces', photos: 'Photos', photosHint: 'Previews of public pages and YouTube thumbnails.',
    wTitle: 'Where the news comes from', wSub: '“Titles” means the newsroom knows something happened but cannot quote what was in it. The weight decides how much a wire counts when the meeting picks the stories.',
    funnel: [['Dispatches', 'in since the last press'], ['Stories', 'dispatches grouped by fact'], ['In the paper', 'picked by the meeting'], ['Written', 'drafted so far']],
    modes: { full: 'Full', titles: 'Titles', off: 'Off' }, today: 'today', weekHint: 'last 7 days', weight: 'weight in the meeting', writer: 'Written by', notCollected: 'not collected (config.json)',
    strict: 'How picky the meeting is', strictOpts: { loose: 'Generous', balanced: 'Balanced', strict: 'Only the big ones' }, strictHint: 'Generous lets more short pieces in; only the big ones makes a shorter paper with longer pieces.',
    sTitle: 'The bylines', sSub: 'Invented writers, all in the house voice. Their character shifts what they notice and their attitude, never the register or the rules about facts.',
    level: (n) => `Lv. ${n}`, toNext: (p) => `${Math.round(p * 100)}% to the next level`, character: 'Character', name: 'Name', role: 'Role', deviation: 'Deviation, in their own words', deviationPh: 'e.g. goes where the small things happen; always keeps the last line for a joke', deviationHint: 'One line from you, added to the dials.',
    traits: { irony: ['Irony', ['earnest', 'gentle', 'the house\'s', 'sharp', 'mocking']], pace: ['Pace', ['telegraphic', 'brisk', 'the house\'s', 'unhurried', 'expansive']], numbers: ['Eye for numbers', ['avoids them', 'few', 'the house\'s', 'keen', 'counts everything']], ending: ['Endings', ['melancholy', 'open', 'the house\'s', 'dry', 'a punchline']] },
    stats: [['pieces', 'pieces signed'], ['leads', 'leads'], ['liked', '♥ from you'], ['checked', 'figures checked, 30 days']],
    chiefDefault: 'Ray Holden', chiefRole: 'managing editor', chiefSub: 'reads the drafts before they are printed',
    severity: 'How demanding', sevNames: ['lenient', 'easy-going', 'the house\'s', 'demanding', 'ruthless'], peeve: 'Their fixation', peevePh: 'e.g. hates adverbs; wants the time of day in every lead', peeveHint: 'One line: it goes into their instructions, and they send pieces back for it.',
    lessons: 'What they have learnt', noLessons: 'Nothing yet: teach them a rule of yours.', forget: 'Forget this lesson',
    lessonPh: 'A lesson in your own words: “close on a fact, never on a moral”', teachDo: 'Teach',
    notes: 'Your notes to the writers', notesPh: 'Rules for the writers, for example:\n· Never talk about Facebook\n· Work on TurboCode is always news', diffHint: 'Struck through: the original. Highlighted: your version.',
    eTitle: 'The engine', eSub: 'The model that writes the paper runs on this Mac (or on a computer of yours). Without it, the automatic typesetting prints plainer pieces from templates.',
    state: { online: 'Online', offline: 'Not answering', disabled: 'Switched off', unknown: 'Checking…' }, model: 'Model', address: 'Address', change: 'To change it, run npm run setup in the terminal, or edit llm in config.json.', check: 'Check again',
  },
  it: {
    house: 'Impostazioni', sub: 'Che giornale fare. Ogni scelta vale dal prossimo numero.', back: '← Torna in redazione', saved: 'Salvato', saving: 'Salvo…',
    tabs: { masthead: ['Il giornale', 'quando esce, quanto è lungo'], wires: ['Le fonti', 'da dove arrivano le notizie'], interni: ['Interni', 'i tuoi progetti'], staff: ['Le firme', 'nomi, carattere, settori'], engine: ['Il motore', 'il modello locale'] },
    iTitle: 'I tuoi progetti', iSub: 'Gli Interni raccontano ciò che hai costruito: il giornale legge ogni repository (senza mai scriverci) per i commit, le parti del progetto che sono cambiate, i file nati, le dipendenze, i rilasci, e com\'è messo: lavoro non committato, commit non pushati.',
    iFolder: 'La cartella dei tuoi progetti', iChoose: 'Scegli la cartella…', iOr: 'oppure scrivi il percorso', iSet: 'Usa questa', iNone: 'Nessun repository in questa cartella.', iDefault: 'Non ancora scelta: il giornale guarda nelle cartelle della fonte File.',
    iIn: 'Dentro', iOut: 'Fuori', iName: 'Nome nel giornale', iDirty: (n) => `${n} non committat${n === 1 ? 'o' : 'i'}`, iAhead: (n) => `${n} da pushare`, iIdle: (n) => (n === 0 ? 'al lavoro oggi' : n === 1 ? 'fermo da ieri' : `fermo da ${n} giorni`), iPage: 'La sua pagina',
    mTitle: 'Che giornale vuoi fare?', mSub: 'Le notizie arrivano sempre. Cambia quante volte la redazione si siede per farne un giornale, e quanto spazio ha ogni pezzo.',
    kinds: {
      hourly: ['Ogni ora', 'Un foglio breve allo scoccare di ogni ora, e l\'edizione della sera. Sperimentale: molte ore hanno poco da dire.', [['Uscite', 'fino a 24 al giorno'], ['Pezzi', 'fino a 9, brevi'], ['Il tuo tempo', 'un\'occhiata, se vuoi'], ['Bozze', 'vanno in stampa da sole']]],
      daily: ['Il Quotidiano', 'Un numero al giorno: ieri, raccontato a colazione. Il giornale come va letto.', [['Uscite', '1 al giorno'], ['Pezzi', 'pochi, con spazio'], ['Il tuo tempo', 'cinque minuti'], ['Bozze', 'vanno in stampa da sole']]],
      weekly: ['Il Settimanale', 'Un numero a settimana: pezzi lunghi, la settimana in poche storie.', [['Uscite', '1 a settimana'], ['Pezzi', '6–8, lunghi'], ['Il tuo tempo', 'mezz\'ora, con calma'], ['Bozze', 'vanno in stampa da sole']]],
    },
    chosen: 'scelto', dayOf: (k) => (k === 'weekly' ? 'La settimana del Settimanale' : k === 'daily' ? 'La giornata del Quotidiano' : 'L\'ora del foglio orario'),
    tl: { wires: 'Fonti', wiresSub: 'sempre aperte', round: 'Bozze', press: 'Stampa' },
    pressAt: 'Quando va in stampa', pressHint: 'Mattina: racconta ieri sera. Sera: racconta la giornata.', weekday: 'Il giorno in cui esce',
    late: 'Prima che esca', lateOut: 'Esce da sola', lateWait: 'La approvo io', lateHint: 'Da sola: basta la lettura del caporedattore. La approvo io: l\'edizione resta in bozza finché non la mandi in stampa dalla Redazione.',
    length: 'Lunghezza dei pezzi', photos: 'Foto', photosHint: 'Anteprime delle pagine pubbliche e miniature di YouTube.',
    wTitle: 'Da dove arrivano le notizie', wSub: '«Titoli» vuol dire che la redazione sa che è successo qualcosa, ma non può citarne il contenuto. Il peso decide quanto un\'agenzia conta quando la riunione sceglie le notizie.',
    funnel: [['Dispacci', 'arrivati dall\'ultima stampa'], ['Storie', 'dispacci raggruppati per fatto'], ['In pagina', 'scelte dalla riunione'], ['Scritti', 'finora']],
    modes: { full: 'Intera', titles: 'Titoli', off: 'Spenta' }, today: 'oggi', weekHint: 'ultimi 7 giorni', weight: 'peso in riunione', writer: 'La scrive', notCollected: 'raccolta spenta (config.json)',
    strict: 'Quanto è severa la riunione', strictOpts: { loose: 'Di manica larga', balanced: 'Equilibrata', strict: 'Solo i fatti grossi' }, strictHint: 'Di manica larga fa entrare più brevi; solo i fatti grossi fa un giornale più corto con pezzi più lunghi.',
    sTitle: 'Le firme', sSub: 'Redattori inventati, tutti nella voce della casa. Il carattere sposta cosa notano e il loro atteggiamento, mai il registro né le regole sui fatti.',
    level: (n) => `Liv. ${n}`, toNext: (p) => `${Math.round(p * 100)}% al prossimo livello`, character: 'Il carattere', name: 'Nome', role: 'Ruolo', deviation: 'Deviazione, in parole sue', deviationPh: 'es. va dove succedono le cose piccole; tiene sempre l\'ultima riga per una battuta', deviationHint: 'Una riga tua, in aggiunta ai cursori.',
    traits: { irony: ['Ironia', ['compunto', 'garbato', 'della casa', 'tagliente', 'beffardo']], pace: ['Passo', ['telegrafico', 'asciutto', 'della casa', 'disteso', 'arioso']], numbers: ['Occhio per i numeri', ['li evita', 'pochi', 'della casa', 'attento', 'contabile']], ending: ['Finale', ['malinconico', 'aperto', 'della casa', 'secco', 'battuta']] },
    stats: [['pieces', 'pezzi firmati'], ['leads', 'aperture'], ['liked', '♥ da te'], ['checked', 'numeri verificati, 30 giorni']],
    chiefDefault: 'Aldo Ferri', chiefRole: 'caporedattore', chiefSub: 'legge le bozze prima della stampa',
    severity: 'Quanto è esigente', sevNames: ['indulgente', 'di manica larga', 'della casa', 'esigente', 'spietato'], peeve: 'La sua fissazione', peevePh: 'es. odia gli avverbi; vuole l\'orario in ogni attacco', peeveHint: 'Una riga: entra nelle sue istruzioni, e per quella rimanda i pezzi.',
    lessons: 'Cosa ha imparato', noLessons: 'Ancora niente: insegnagli una tua regola.', forget: 'Dimentica questa lezione',
    lessonPh: 'Una lezione con parole tue: «chiudi su un fatto, mai su una morale»', teachDo: 'Insegna',
    notes: 'Le tue note ai redattori', notesPh: 'Regole per i redattori, per esempio:\n· Non parlare mai di Facebook\n· Il lavoro su TurboCode è sempre notizia', diffHint: 'Barrato: l\'originale. Evidenziato: la tua versione.',
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
    ? [{ at: 0.02, t: T.tl.wires, s: T.tl.wiresSub }, { at: 20 / 60, t: T.tl.round, s: ':20' }, { at: 40 / 60, t: T.tl.round, s: ':40' }, { at: 0.985, t: T.tl.press, s: ':00', cls: 'press' }]
    : c.kind === 'daily'
      ? [{ at: 0.02, t: T.tl.wires, s: T.tl.wiresSub }, { at: 21 / 24, t: T.tl.round, s: `${pad(c.pressHour - 3)} · ${pad(c.pressHour - 1)}` }, { at: 0.985, t: T.tl.press, s: `${String(c.pressHour).padStart(2, '0')}:00`, cls: 'press' }]
      : [{ at: 0.02, t: T.tl.wires, s: T.tl.wiresSub }, { at: (span - 26) / span, t: T.tl.round, s: DAYS[(c.weekday + 6) % 7] }, { at: 0.985, t: T.tl.press, s: DAYS[c.weekday], cls: 'press' }];
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
        {['daily', 'weekly', 'hourly'].map((k) => {
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

// ───────────────────────── Interni: the projects ─────────────────────────

function Interni() {
  const [d, setD] = useState(null);
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { api('/interni').then((x) => { setD(x); setPath(x.folder || ''); }).catch((e) => setError(e.message)); }, []);
  const post = async (url, json) => {
    setBusy(true);
    setError(null);
    try {
      const x = await api(url, { method: 'POST', json });
      if (!x.cancelled) { setD(x); setPath(x.folder || ''); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="rd-htitle"><h2>{T.iTitle}</h2><p>{T.iSub}</p></div>
      <div className="rd-field in-folder">
        <span className="rd-flbl">{T.iFolder}</span>
        <div className="in-folder-row">
          <button type="button" className={`btn ${busy ? 'busy' : ''}`} onClick={() => post('/interni/choose', {})} disabled={busy}>{T.iChoose}</button>
          <form className="in-path" onSubmit={(e) => { e.preventDefault(); post('/interni', { folder: path }); }}>
            <label className="sr-only" htmlFor="in-path">{T.iOr}</label>
            <input id="in-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="~/Work/git" />
            <button type="submit" className="rd-ghost" disabled={busy || path === (d?.folder || '')}>{T.iSet}</button>
          </form>
        </div>
        <small>{d?.folder ? d.folder : T.iDefault}</small>
      </div>
      {error && <p className="notice">{error}</p>}
      {d && !d.repos.length && <p className="rd-mut">{T.iNone}</p>}
      <div className="rd-wires">
        {(d?.repos || []).map((r) => (
          <div key={r.path} className={`rd-wire ${r.on ? '' : 'off'}`}>
            <span className="rd-ic">{r.name.slice(0, 3).toUpperCase()}</span>
            <div className="rd-wmain">
              <b>{r.title}</b>{r.title !== r.name && <span className="rd-mut"> · {r.name}</span>}
              {r.description && <p className="in-desc">{r.description}</p>}
              <div className="rd-meta">
                {r.branch && <span>{r.branch}</span>}
                {r.idleDays != null && <span>{T.iIdle(r.idleDays)}</span>}
                {r.dirty > 0 && <span className="rd-warn">{T.iDirty(r.dirty)}</span>}
                {r.ahead > 0 && <span className="rd-warn">{T.iAhead(r.ahead)}</span>}
                {r.on && <a href={`#/interni/${encodeURIComponent(r.name)}`}>{T.iPage} →</a>}
              </div>
              <label className="rd-wsel">{T.iName}
                <input defaultValue={r.title} onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== r.title) post('/interni', { repo: r.path, title: e.target.value }); }} />
              </label>
            </div>
            <div className="rd-mode" role="group" aria-label={r.name}>
              <button type="button" aria-pressed={r.on} onClick={() => post('/interni', { repo: r.path, on: true })}>{T.iIn}</button>
              <button type="button" aria-pressed={!r.on} onClick={() => post('/interni', { repo: r.path, on: false })}>{T.iOut}</button>
            </div>
          </div>
        ))}
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

/** The managing editor's card: name, how demanding, their fixation. */
function ChiefDossier({ line, save }) {
  const [c, setC] = useState(null);
  useEffect(() => { api('/chief').then(setC).catch(() => {}); }, [line.chief]);
  if (!c) return <div className="rd-dossier" />;
  const set = (patch) => { setC((x) => ({ ...x, ...patch })); save({ chief: { ...line.chief, ...patch } }); };
  return (
    <div className="rd-dossier">
      <div className="rd-dhead">
        <span className="rd-med lg" style={{ '--h': '#3a3a3a' }}>✎</span>
        <div><h3>{c.name}</h3><p>{c.role} · {T.chiefSub}</p></div>
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
  const [lesson, setLesson] = useState('');
  const load = useCallback(() => api('/staff').then(setV).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (path, opts, after) => {
    setBusy(true); setErr(null);
    try { const r = await api(path, opts); setV(r); after?.(r); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!v) return null;
  const list = v.staff;
  const w = list.find((x) => x.id === cur) || list[0];
  if (!w) return null;
  const mine = line.staff?.[w.id] || {};
  const traits = { ...w.traits, ...(mine.traits || {}) };
  const setWriter = (patch) => {
    const next = { name: w.name, role: w.role, deviation: w.deviation || '', ...mine, traits, ...patch };
    setV((x) => ({ ...x, staff: x.staff.map((y) => (y.id === w.id ? { ...y, ...next } : y)) }));
    save({ staff: { [w.id]: next } });
  };
  const sections = Object.fromEntries(SECTIONS.map((s) => [s.id, s.name]));
  const pick = (id) => { setCur(id); setTrial(null); setLesson(''); };
  async function runTrial() {
    setBusy(true); setErr(null); setTrial(null);
    try { setTrial(await api('/manual/trial', { method: 'POST', json: { writer: { id: w.id, traits, deviation: mine.deviation ?? w.deviation ?? '' } } })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <>
      <div className="rd-htitle"><h2>{T.sTitle}</h2><p>{T.sSub}</p></div>
      <div className="rd-field">
        <label className="rd-flbl" htmlFor="m-notes">{T.notes}</label>
        <textarea id="m-notes" rows={3} defaultValue={line.notes} placeholder={T.notesPh} onBlur={(e) => e.target.value !== line.notes && save({ notes: e.target.value })} />
      </div>
      <div className="rd-staffgrid">
        <div className="rd-cards">
          <button className={`rd-wc rd-wc-chief ${cur === 'chief' ? 'on' : ''}`} onClick={() => pick('chief')}>
            <span className="rd-med" style={{ '--h': '#3a3a3a' }}>✎</span>
            <span><b>{line.chief?.name || T.chiefDefault}</b><small>{T.chiefRole}</small></span>
          </button>
          {list.map((x) => (
            <button key={x.id} className={`rd-wc ${x.id === w.id && cur !== 'chief' ? 'on' : ''}`} onClick={() => pick(x.id)}>
              <Medallion writer={x} />
              <span><b>{x.name}</b><small>{x.role}</small></span>
            </button>
          ))}
        </div>

        {cur === 'chief' ? <ChiefDossier line={line} save={save} /> : (
        <div className="rd-dossier">
          <div className="rd-dhead">
            <Medallion writer={w} size="lg" />
            <div>
              <h3>{w.name}</h3>
              <p>{w.role}{w.beats.length ? ` · ${w.beats.map((b) => sections[b] || (b === 'brief' ? tr({ en: 'the Brief', it: 'il Punto' }) : b)).join(', ')}` : ''}</p>
              {w.kind !== 'cartoonist' && (
                <select className="rd-beatsel" value="" aria-label={T.giveBeat} onChange={(e) => e.target.value && save({ desks: { [e.target.value]: w.id } }).then(load)}>
                  <option value="">{T.giveBeat}…</option>
                  {SECTIONS.filter((x) => !w.beats.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
            </div>
          </div>
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
                <span className="rd-lbl">{T.lessons}</span>
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
              <button className="btn btn-small" disabled={busy} onClick={runTrial}>{busy ? T.trialing : T.trial}</button>
              {err && <p className="notice">{err}</p>}
            </div>
          </div>
          <Trial r={trial} />
        </div>
        )}
      </div>
    </>
  );
}

// ───────────────────────── The engine ─────────────────────────

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

const TABS = ['masthead', 'wires', 'interni', 'staff', 'engine'];

export default function House({ tab = 'masthead' }) {
  const { meta, line, save, saving, error } = useLine();
  const t = TABS.includes(tab) ? tab : 'masthead';
  const body = useMemo(() => {
    if (!line) return null;
    const p = { line, meta, save };
    return { masthead: <Masthead {...p} />, wires: <Wires {...p} />, interni: <Interni />, staff: <Staff {...p} />, engine: <Engine /> }[t];
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
