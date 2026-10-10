import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, href, hhmm, shortDate, dayKey, writerLabel } from '../lib.js';
import { tr } from '../i18n.js';

/**
 * The Inquiry (Newsroom → Inquiry): a long piece built in conversation with the reporter, stage by
 * stage, then checked at the Editor desk with the managing editor. Both rooms use the whole width.
 */

const T = tr({
  en: {
    rooms: 'Newsroom rooms', desk: 'The desk', inquiry: 'Inquiry', editorDesk: 'Editor desk',
    homeTitle: 'The Inquiry', homeSub: 'A long piece of about 1,500 words, in the manner of The New Yorker. You give the subject and the lead; the reporter reads the signals, asks, digs, and writes.',
    ask: 'What subject do you want to look into?', askSub: 'A site, a project, a habit, a person, a week. Say it the way you would to a reporter.',
    topicPh: 'e.g. the nights on GitHub, the chess rival, the Julia project…', leadLbl: 'Your lead (optional)', leadPh: 'Where should the reporter look? What do you suspect? e.g. “it all started after the broken build on Tuesday”',
    period: 'Signals from the last', days: (n) => `${n} days`, open: 'Open the inquiry', opening: 'Opening the file…', ideas: 'Ideas from the newsroom',
    yours: 'Your inquiries', none: 'No inquiries yet. The first one starts with a subject.', words: 'words', at: (w) => `at ${w}`,
    status: { angle: 'Angle', data: 'Data', sources: 'Sources', outline: 'Outline', writing: 'Writing', draft: 'Draft', desk: 'At the Editor desk', published: 'Published' },
    rail: { subject: 'Subject', angle: 'Angle', data: 'Data', sources: 'Sources', outline: 'Outline', writing: 'Writing', desk: 'Editor desk' },
    back: 'go back here', del: 'Delete the inquiry', sure: 'Sure? Click again', allInq: '← All inquiries',
    working: {
      angles: 'is reading the file…', followup: 'is taking notes…', needs: 'is searching the archive for the data…', sources: 'is weighing the sources…',
      outline: 'is building the structure…', writing: 'is writing…', review: 'is reading the piece…', section: 'is rewriting a section…',
    },
    error: 'Something went wrong', retry: 'Try again', interrupted: 'The work was interrupted (the paper restarted).',
    you: 'You', reply: 'Answer', replyPh: 'Answer the questions above, or tell the reporter anything: a correction, a doubt, a new direction…', send: 'Send',
    answerPh: 'Your answer… (it can go in the piece, word for word)', answered: 'answered',
    angles: 'The angles', pick: 'Take this angle', needs: 'Needs', yourAngle: 'Your own angle', angleTitlePh: 'Working title', angleTextPh: 'What the piece is really about, in one sentence', useMine: 'Use my angle',
    dataTitle: 'The data', fromSignals: 'From the signals', fromYou: 'Only you know', found: 'In the archive', notFound: 'The archive found nothing', keep: 'keep',
    yourAnswer: 'Your answer…', extra: 'Other data you have (one per line)', extraPh: 'e.g. The repository was born in March, on a train', confirmData: 'These are the data → the sources',
    srcTitle: 'The sources', attrib: { on: 'On the record', background: 'Background', anon: 'Anonymous' }, auto: 'collected', use: 'use',
    kinds: { signals: 'Signals', archive: 'The paper', testimony: 'Testimony', person: 'A person', document: 'A document', note: 'A note', tip: 'A tip' },
    wouldHelp: 'The reporter would like', addThis: 'Add it', addSrc: 'Add a source', srcLabelPh: 'Who or what: e.g. “Marco, a colleague”, “the release notes”', srcTextPh: 'What they say, or what it contains. Quotes in quotation marks.',
    add: 'Add', remove: 'Remove', confirmSrc: 'The sources are complete → the outline',
    outTitle: 'The structure', headline: 'Working headline', dek: 'Dek', lede: 'Lede — the opening scene', nut: 'Nut graf — what it is really about', ending: 'Ending — the image that stays',
    section: 'Movement', beat: 'What happens in it', sourcesOf: 'Stands on', addSection: 'Add a movement', approve: 'Approve and write (~1,500 words)',
    writingTitle: 'The writing', of: 'of', draftTitle: 'The draft', toDesk: 'Take it to the Editor desk →', toDeskHint: (n) => `${n} will read it, check every claim against the sources, and work on it with you.`,
    notebook: 'The reporter\'s notebook', subject: 'Subject', lead: 'Your lead', file: 'The file', signals: 'signals', in: 'in', daysW: 'days', busiest: 'busiest day', usual: 'usual hour',
    angle: 'The angle', dataKept: 'Data kept', statements: 'Your statements', sourcesN: 'Sources', creative: 'Writer', noFile: 'No signals on this subject: the piece rests on your words.',
    // the Editor desk
    deskTitle: 'Editor desk', deskSub: 'Where the inquiry is checked with the managing editor: every claim against its source, the structure, the prose, the headline.',
    queue: 'On the desk', ready: 'Waiting for the desk', out: 'Published', noneDesk: 'Nothing on the desk. An inquiry comes here when it is written.',
    notYet: 'This piece is not at the desk yet.', send2: 'Bring it to the desk', backInq: '← The inquiry', recheck: 'Check again', publish: 'Publish', publishing: 'Publishing…', readIt: 'Read it in Long reads →',
    tabs: { editor: 'Managing editor', sources: 'Sources', structure: 'Structure', style: 'Style', heads: 'Headlines' },
    claims: 'Claims checked', verdict: { ok: 'supported', partial: 'partial', unsupported: 'unsupported' }, goTo: 'go to ¶', noClaims: 'No claim list: the fact-checker was not available. The figures are checked under Style.',
    srcUse: { planned: 'in the outline', quoted: 'quoted', unused: 'not used' },
    lede2: 'Lede', nut2: 'Nut graf', arc: 'Arc', ending2: 'Ending', lengths: 'Length by movement', edits: 'Proposed edits', apply: 'Apply', applied: 'applied',
    styleScore: 'Style score', tics: 'Tics', figures: 'Figures not in the sources', allFig: 'Every figure is in the sources.', quotes: 'Your words in the piece', prose: 'The prose',
    alts: 'Alternatives', set: 'Use', kicker: 'Kicker', save: 'Save', cancel: 'Cancel', edit: 'Edit', rewrite: 'Rewrite', rewritePh: 'How? e.g. “tighter, open on the screen going dark”',
    talkPh: (n) => `Ask ${n}: “is the nut graf in the right place?”, “what would you cut?”…`, thinking: 'is reading…', paraHint: 'A blank line separates paragraphs.',
    tiles: { sources: 'Sources', structure: 'Structure', length: 'Length', style: 'Style' },
    rewriteAll: 'Rewrite it all in the voice', rewriteAllHint: 'From fresh notes, with the same outline: the story, not the dashboard. Your own sections stay.', sure2: 'Sure? The current text is replaced',
    register: 'Register', registerHint: 'How much the prose sounds like a dashboard or like a machine: system words, times, figures, stock phrases. 100 = a well-made magazine piece.', dashWords: 'Dashboard words', slop: 'Machine-made phrasing', times: 'times', pcts: 'percentages', figs: 'figures',
    carnet: 'Notes for the writing', carnetHint: 'The writer works from these, not from the raw file.', premise: 'The question', scenes: 'Scenes', keptFigures: 'Figures kept',
  },
  it: {
    rooms: 'Stanze della redazione', desk: 'Il tavolo', inquiry: 'Inchiesta', editorDesk: 'Editor desk',
    homeTitle: 'L\'Inchiesta', homeSub: 'Un pezzo lungo, circa 1.500 parole, alla maniera del New Yorker. Lei dà l\'argomento e la traccia; il cronista legge i segnali, chiede, scava, e scrive.',
    ask: 'Che argomento vuole trattare?', askSub: 'Un sito, un progetto, un\'abitudine, una persona, una settimana. Lo dica come lo direbbe a un cronista.',
    topicPh: 'es. le notti su GitHub, il rivale agli scacchi, il progetto Giulia…', leadLbl: 'La sua traccia (facoltativa)', leadPh: 'Dove dovrebbe guardare il cronista? Cosa sospetta? es. «è cominciato tutto dopo la build rotta di martedì»',
    period: 'Segnali degli ultimi', days: (n) => `${n} giorni`, open: 'Apri l\'inchiesta', opening: 'Apro il fascicolo…', ideas: 'Idee dalla redazione',
    yours: 'Le sue inchieste', none: 'Ancora nessuna inchiesta. La prima comincia da un argomento.', words: 'parole', at: (w) => `a ${w}`,
    status: { angle: 'Angolo', data: 'Dati', sources: 'Fonti', outline: 'Scaletta', writing: 'In stesura', draft: 'Bozza', desk: 'All\'Editor desk', published: 'Pubblicata' },
    rail: { subject: 'Argomento', angle: 'Angolo', data: 'Dati', sources: 'Fonti', outline: 'Scaletta', writing: 'Stesura', desk: 'Editor desk' },
    back: 'torna qui', del: 'Elimina l\'inchiesta', sure: 'Sicuro? Clicchi ancora', allInq: '← Tutte le inchieste',
    working: {
      angles: 'sta leggendo il fascicolo…', followup: 'prende appunti…', needs: 'cerca i dati nell\'archivio…', sources: 'pesa le fonti…',
      outline: 'costruisce la struttura…', writing: 'sta scrivendo…', review: 'sta leggendo il pezzo…', section: 'riscrive una sezione…',
    },
    error: 'Qualcosa è andato storto', retry: 'Riprova', interrupted: 'Il lavoro si è interrotto (il giornale è ripartito).',
    you: 'Lei', reply: 'Rispondi', replyPh: 'Risponda alle domande qui sopra, o dica al cronista quello che vuole: una correzione, un dubbio, una direzione nuova…', send: 'Invia',
    answerPh: 'La sua risposta… (può finire nel pezzo, parola per parola)', answered: 'risposto',
    angles: 'Gli angoli', pick: 'Scelgo questo angolo', needs: 'Gli serve', yourAngle: 'Il suo angolo', angleTitlePh: 'Titolo di lavoro', angleTextPh: 'Di cosa parla davvero il pezzo, in una frase', useMine: 'Uso il mio angolo',
    dataTitle: 'I dati', fromSignals: 'Dai segnali', fromYou: 'Lo sa solo lei', found: 'Nell\'archivio', notFound: 'L\'archivio non ha trovato niente', keep: 'tieni',
    yourAnswer: 'La sua risposta…', extra: 'Altri dati che ha lei (uno per riga)', extraPh: 'es. Il repository è nato a marzo, in treno', confirmData: 'Questi sono i dati → le fonti',
    srcTitle: 'Le fonti', attrib: { on: 'In chiaro', background: 'Background', anon: 'Anonima' }, auto: 'raccolta', use: 'usa',
    kinds: { signals: 'Segnali', archive: 'Il giornale', testimony: 'Testimonianza', person: 'Una persona', document: 'Un documento', note: 'Una nota', tip: 'Una soffiata' },
    wouldHelp: 'Al cronista servirebbe', addThis: 'Aggiungi', addSrc: 'Aggiungi una fonte', srcLabelPh: 'Chi o cosa: es. «Marco, un collega», «le note di rilascio»', srcTextPh: 'Cosa dice, o cosa contiene. Le citazioni tra virgolette.',
    add: 'Aggiungi', remove: 'Togli', confirmSrc: 'Le fonti sono complete → la scaletta',
    outTitle: 'La struttura', headline: 'Titolo di lavoro', dek: 'Sommario', lede: 'Attacco — la scena d\'apertura', nut: 'Nut graf — di cosa parla davvero', ending: 'Chiusa — l\'immagine che resta',
    section: 'Movimento', beat: 'Cosa succede', sourcesOf: 'Si regge su', addSection: 'Aggiungi un movimento', approve: 'Approva e scrivi (~1.500 parole)',
    writingTitle: 'La stesura', of: 'su', draftTitle: 'La bozza', toDesk: 'Portala all\'Editor desk →', toDeskHint: (n) => `${n} la leggerà, controllerà ogni affermazione contro le fonti e ci lavorerà con lei.`,
    notebook: 'Il taccuino del cronista', subject: 'Argomento', lead: 'La sua traccia', file: 'Il fascicolo', signals: 'segnali', in: 'in', daysW: 'giorni', busiest: 'giorno più intenso', usual: 'ora più frequente',
    angle: 'L\'angolo', dataKept: 'Dati tenuti', statements: 'Le sue dichiarazioni', sourcesN: 'Fonti', creative: 'Penna', noFile: 'Nessun segnale su questo argomento: il pezzo si regge sulle sue parole.',
    deskTitle: 'Editor desk', deskSub: 'Dove l\'inchiesta si controlla con il caporedattore: ogni affermazione contro la sua fonte, la struttura, la prosa, il titolo.',
    queue: 'Sul desk', ready: 'In attesa del desk', out: 'Pubblicate', noneDesk: 'Niente sul desk. Un\'inchiesta arriva qui quando è scritta.',
    notYet: 'Questo pezzo non è ancora all\'Editor desk.', send2: 'Portalo al desk', backInq: '← L\'inchiesta', recheck: 'Ricontrolla', publish: 'Pubblica', publishing: 'Pubblico…', readIt: 'Leggila negli Approfondimenti →',
    tabs: { editor: 'Caporedattore', sources: 'Fonti', structure: 'Struttura', style: 'Stile', heads: 'Titoli' },
    claims: 'Affermazioni controllate', verdict: { ok: 'sostenuta', partial: 'parziale', unsupported: 'non sostenuta' }, goTo: 'vai al ¶', noClaims: 'Nessun elenco di affermazioni: il fact-checker non era disponibile. I numeri sono controllati in Stile.',
    srcUse: { planned: 'in scaletta', quoted: 'citata', unused: 'non usata' },
    lede2: 'Attacco', nut2: 'Nut graf', arc: 'Arco', ending2: 'Chiusa', lengths: 'Lunghezza per movimento', edits: 'Interventi proposti', apply: 'Applica', applied: 'applicato',
    styleScore: 'Punteggio di stile', tics: 'Tic', figures: 'Numeri non presenti nelle fonti', allFig: 'Ogni numero è nelle fonti.', quotes: 'Le sue parole nel pezzo', prose: 'La prosa',
    alts: 'Alternative', set: 'Usa', kicker: 'Occhiello', save: 'Salva', cancel: 'Annulla', edit: 'Modifica', rewrite: 'Riscrivi', rewritePh: 'Come? es. «più asciutta, apri sullo schermo che si spegne»',
    talkPh: (n) => `Chieda a ${n}: «il nut graf è al posto giusto?», «cosa taglieresti?»…`, thinking: 'sta leggendo…', paraHint: 'Una riga vuota separa i paragrafi.',
    tiles: { sources: 'Fonti', structure: 'Struttura', length: 'Lunghezza', style: 'Stile' },
    rewriteAll: 'Riscrivi tutto nello stile', rewriteAllHint: 'Da appunti nuovi, con la stessa scaletta: la storia, non il cruscotto. Le sezioni scritte da lei restano.', sure2: 'Sicuro? Il testo attuale viene sostituito',
    register: 'Registro', registerHint: 'Quanto la prosa suona come un cruscotto o come una macchina: parole da sistema, orari, numeri, frasi fatte. 100 = un pezzo da magazine fatto bene.', dashWords: 'Parole da cruscotto', slop: 'Frasi da macchina', times: 'orari', pcts: 'percentuali', figs: 'numeri',
    carnet: 'Gli appunti per la stesura', carnetHint: 'Chi scrive lavora su questi, non sul fascicolo grezzo.', premise: 'La domanda', scenes: 'Scene', keptFigures: 'Numeri tenuti',
  },
});

const RAIL = ['subject', 'angle', 'data', 'sources', 'outline', 'writing', 'desk'];
const railIndex = (s) => ({ angle: 1, data: 2, sources: 3, outline: 4, writing: 5, draft: 5, desk: 6, published: 7 }[s] ?? 0);
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const workingLabel = (w) => (w?.startsWith('section') ? T.working.section : T.working[w] || T.working.followup);
const KIND_ICON = { signals: '◉', archive: '▤', testimony: '❝', person: '☺', document: '▢', note: '✎', tip: '✉' };

/** The newsroom's rooms, under the title of each. */
export function NewsroomNav({ on }) {
  return (
    <nav className="nr-nav" aria-label={T.rooms}>
      <a href={href.desk()} className={on === 'desk' ? 'on' : ''}>{T.desk}</a>
      <a href={href.inquiry()} className={on === 'inquiry' ? 'on' : ''}>{T.inquiry}</a>
      <a href={href.editorDesk()} className={on === 'editorDesk' ? 'on' : ''}>{T.editorDesk}</a>
    </nav>
  );
}

/** One inquiry, kept fresh while the reporter works. */
function useInquiry(id) {
  const [i, setI] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api(`/inquiries/${id}`).then(setI).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!i || (!i.busy && !i.working)) return undefined;
    const t = setTimeout(load, 1500);
    return () => clearTimeout(t);
  }, [i, load]);
  const act = useCallback(async (path, opts = { method: 'POST' }) => {
    setError(null);
    try {
      const r = await api(`/inquiries/${id}${path}`, opts);
      if (r) setI(r);
      return r;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [id]);
  return { i, setI, error, setError, act, load };
}

function Head({ title, sub, on, children }) {
  return (
    <header className="iq-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
        <NewsroomNav on={on} />
      </div>
      {children}
    </header>
  );
}

// ───────────────────────── The inquiry: home ─────────────────────────

export function InquiryPage({ id }) {
  return id ? <InquiryRoom id={id} /> : <InquiryHome />;
}

function InquiryHome() {
  const [list, setList] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [topic, setTopic] = useState('');
  const [lead, setLead] = useState('');
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    api('/inquiries').then(setList).catch(() => setList([]));
    Promise.all([api('/commissions').catch(() => ({ proposals: [] })), api('/investigations/suggestions').catch(() => [])])
      .then(([c, s]) => {
        const seen = new Set();
        setIdeas([...(c.proposals || []), ...s].filter((x) => x.topic && !seen.has(x.topic.toLowerCase()) && seen.add(x.topic.toLowerCase())).slice(0, 10));
      });
  }, []);
  async function open(e) {
    e.preventDefault();
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const i = await api('/inquiries', { method: 'POST', json: { topic: topic.trim(), lead: lead.trim() || undefined, days } });
      location.hash = href.inquiry(i.id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <div className="iq-page fullbleed">
      <Head title={T.homeTitle} sub={T.homeSub} on="inquiry" />
      <div className="iq-home">
        <form className="iq-start" onSubmit={open}>
          <div className="iq-ask">
            <span className="iq-avatar big" aria-hidden="true">?</span>
            <div>
              <h3>{T.ask}</h3>
              <p>{T.askSub}</p>
            </div>
          </div>
          <input className="iq-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={T.topicPh} maxLength={120} autoFocus disabled={busy} />
          <label className="lbl iq-lbl">{T.leadLbl}</label>
          <textarea className="iq-lead" rows={3} value={lead} onChange={(e) => setLead(e.target.value)} placeholder={T.leadPh} maxLength={800} disabled={busy} />
          <div className="iq-start-row">
            <span className="lbl">{T.period}</span>
            <div className="seg seg-small">
              {[7, 14, 30, 60, 90].map((d) => <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{T.days(d)}</button>)}
            </div>
            <button className="btn" disabled={busy || !topic.trim()}>{busy ? T.opening : T.open}</button>
          </div>
          {error && <p className="notice">{error}</p>}
          {ideas.length > 0 && (
            <div className="iq-ideas">
              <span className="lbl">{T.ideas}</span>
              <div className="chips">
                {ideas.map((x) => <button key={x.topic} type="button" className="chip" title={x.why} onClick={() => setTopic(x.topic)}>{x.topic}{x.why && <em> · {x.why}</em>}</button>)}
              </div>
            </div>
          )}
        </form>

        <section className="iq-list">
          <h3 className="box-title">{T.yours}</h3>
          {list && !list.length && <p className="hint-small">{T.none}</p>}
          <div className="iq-cards">
            {(list || []).map((x) => (
              <a key={x.id} className={`iq-card st-${x.status}`} href={['desk'].includes(x.status) ? href.editorDesk(x.id) : href.inquiry(x.id)}>
                <span className="iq-card-top">
                  <span className={`iq-pill st-${x.status}`}>{T.status[x.status] || x.status}</span>
                  {(x.busy || x.working) && <span className="iq-dots" aria-hidden="true"><i /><i /><i /></span>}
                  <span className="iq-card-date">{shortDate(x.ts)}</span>
                </span>
                <strong className="iq-card-hl">{x.headline}</strong>
                {x.dek && <span className="iq-card-dek">{x.dek}</span>}
                <span className="iq-card-meta">{x.topic}{x.words ? ` · ${x.words} ${T.words}` : ''}{x.reporter ? ` · ${x.reporter.name}` : ''}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ───────────────────────── The inquiry: the room ─────────────────────────

function InquiryRoom({ id }) {
  const { i, error, setError, act } = useInquiry(id);
  const [answers, setAnswers] = useState({});
  const [text, setText] = useState('');
  const [armed, setArmed] = useState(false);
  const endRef = useRef(null);
  const n = i?.thread?.length || 0;
  useEffect(() => { if (n) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [n]);

  if (!i) return <div className="iq-page fullbleed">{error ? <p className="notice">{error}</p> : <p className="hint-small">…</p>}</div>;
  const who = i.reporter?.name || tr({ en: 'The reporter', it: 'Il cronista' });
  const busy = i.busy || !!i.working;
  const talking = ['angle', 'data', 'sources', 'outline'].includes(i.status);
  const openQs = (i.questions || []).filter((x) => x.stage === i.status && !x.a);
  const filled = Object.entries(answers).filter(([k, v]) => v.trim() && openQs.some((x) => x.id === k));

  async function sendReply(e) {
    e?.preventDefault();
    if (!filled.length && !text.trim()) return;
    const r = await act('/reply', { method: 'POST', json: { answers: Object.fromEntries(filled), text: text.trim() } });
    if (r) { setAnswers({}); setText(''); }
  }
  async function del() {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    try { await api(`/inquiries/${i.id}`, { method: 'DELETE' }); location.hash = href.inquiry(); } catch (e) { setError(e.message); }
  }

  return (
    <div className="iq-page fullbleed">
      <Head title={T.homeTitle} on="inquiry">
        <a className="btn-ghost" href={href.inquiry()}>{T.allInq}</a>
      </Head>
      <div className="iq-room">
        {/* the stages */}
        <aside className="iq-rail">
          <ol>
            {RAIL.map((s, k) => {
              const at = railIndex(i.status);
              const state = k < at ? 'done' : k === at ? 'now' : 'todo';
              const canBack = state === 'done' && k >= 1 && k <= 4 && !busy && i.status !== 'published';
              return (
                <li key={s} className={state}>
                  <span className="iq-rail-n">{state === 'done' ? '✓' : k + 1}</span>
                  <span className="iq-rail-name">
                    {s === 'desk' && k <= at ? <a href={href.editorDesk(i.id)}>{T.rail[s]}</a> : T.rail[s]}
                    {canBack && <button className="btn-link" onClick={() => act('/back', { method: 'POST', json: { to: s } })}>{T.back}</button>}
                  </span>
                </li>
              );
            })}
          </ol>
          {i.reporter && (
            <div className="iq-who">
              <span className="iq-avatar">{initials(i.reporter.name)}</span>
              <span><strong>{i.reporter.name}</strong><em>{i.reporter.role}</em></span>
            </div>
          )}
          {i.writer && <p className="hint-small">{T.creative}: {writerLabel(i.writer)}</p>}
          <button className={`btn-ghost danger ${armed ? 'on' : ''}`} onClick={del} disabled={busy}>{armed ? T.sure : T.del}</button>
        </aside>

        {/* the conversation, and what the stage asks for */}
        <section className="iq-main">
          <div className="iq-thread">
            {(i.thread || []).map((m) => (
              <Message key={m.id} m={m} i={i} who={who} answers={answers} setAnswers={setAnswers} busy={busy} />
            ))}
            {busy && (
              <div className="iq-msg reporter typing">
                <span className="iq-avatar">{initials(who)}</span>
                <div className="iq-bubble"><strong>{who}</strong> {workingLabel(i.working)} <span className="iq-dots"><i /><i /><i /></span></div>
              </div>
            )}
            {i.error && !busy && (
              <div className="iq-error">
                <span>{i.error === 'interrupted' ? T.interrupted : `${T.error}: ${i.error}`}</span>
                <button className="btn-ghost" onClick={() => act('/retry')}>{T.retry}</button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {!busy && <Stage i={i} act={act} who={who} />}

          {talking && (
            <form className="iq-composer" onSubmit={sendReply}>
              <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={T.replyPh} disabled={busy}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(e); }} />
              <button className="btn" disabled={busy || (!filled.length && !text.trim())}>
                {filled.length ? `${T.reply} (${filled.length})` : T.send}
              </button>
            </form>
          )}
          {error && <p className="notice">{error}</p>}
        </section>

        <Notebook i={i} />
      </div>
    </div>
  );
}

function Message({ m, i, who, answers, setAnswers, busy }) {
  const qs = (m.qids || []).map((qid) => i.questions.find((x) => x.id === qid)).filter(Boolean);
  const mine = m.who === 'director';
  return (
    <div className={`iq-msg ${mine ? 'director' : 'reporter'}`}>
      <span className="iq-avatar">{mine ? T.you.slice(0, 1) : initials(who)}</span>
      <div className="iq-bubble">
        <span className="iq-msg-who">{mine ? T.you : who} · {hhmm(m.at)}</span>
        {m.text.split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}
        {qs.length > 0 && (
          <ol className="iq-qs">
            {qs.map((x) => (
              <li key={x.id} className={x.a ? 'done' : ''}>
                <span className="iq-q">{x.q}</span>
                {x.a ? <span className="iq-a">— {x.a}</span> : x.stage === i.status ? (
                  <textarea rows={2} value={answers[x.id] || ''} placeholder={T.answerPh} disabled={busy}
                    onChange={(e) => setAnswers((a) => ({ ...a, [x.id]: e.target.value }))} />
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stage({ i, act, who }) {
  if (i.status === 'angle' && i.angles?.length) return <AnglePanel i={i} act={act} />;
  if (i.status === 'data' && i.needs?.length) return <DataPanel key={i.needs.map((n) => n.id).join()} i={i} act={act} />;
  if (i.status === 'sources') return <SourcesPanel i={i} act={act} />;
  if (i.status === 'outline' && i.outline) return <OutlinePanel key={JSON.stringify(i.outline).length + i.outline.headline} i={i} act={act} />;
  if (i.status === 'writing') return <WritingPanel i={i} />;
  if (['draft', 'desk', 'published'].includes(i.status)) return <DraftPanel i={i} act={act} />;
  return null;
}

// ───────────────────────── The stages ─────────────────────────

function AnglePanel({ i, act }) {
  const [title, setTitle] = useState('');
  const [angle, setAngle] = useState('');
  return (
    <section className="iq-stage">
      <h3 className="iq-stage-title">{T.angles}</h3>
      <div className="iq-angles">
        {i.angles.map((a, k) => (
          <article key={a.id} className="iq-angle">
            <span className="iq-angle-n">{String.fromCharCode(65 + k)}</span>
            <h4>{a.title}</h4>
            <p className="iq-angle-text">{a.angle}</p>
            {a.why && <p className="iq-angle-why">◆ {a.why}</p>}
            {a.needs && <p className="iq-angle-needs"><span className="lbl">{T.needs}</span> {a.needs}</p>}
            <button className="btn btn-small" onClick={() => act('/angle', { method: 'POST', json: { angleId: a.id } })}>{T.pick}</button>
          </article>
        ))}
        <article className="iq-angle own">
          <span className="iq-angle-n">✎</span>
          <h4>{T.yourAngle}</h4>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={T.angleTitlePh} maxLength={80} />
          <textarea rows={3} value={angle} onChange={(e) => setAngle(e.target.value)} placeholder={T.angleTextPh} maxLength={400} />
          <button className="btn btn-small" disabled={!angle.trim()} onClick={() => act('/angle', { method: 'POST', json: { title, angle } })}>{T.useMine}</button>
        </article>
      </div>
    </section>
  );
}

function DataPanel({ i, act }) {
  const [needs, setNeeds] = useState(() => Object.fromEntries(i.needs.map((n) => [n.id, { use: n.use !== false, answer: n.answer || '' }])));
  const [extra, setExtra] = useState('');
  const set = (id, patch) => setNeeds((x) => ({ ...x, [id]: { ...x[id], ...patch } }));
  const confirm = () => act('/data', { method: 'POST', json: { needs: Object.entries(needs).map(([id, v]) => ({ id, ...v })), extra: extra.split('\n').map((s) => s.trim()).filter(Boolean) } });
  return (
    <section className="iq-stage">
      <h3 className="iq-stage-title">{T.dataTitle}</h3>
      <ul className="iq-needs">
        {i.needs.map((n) => (
          <li key={n.id} className={`${n.kind} ${needs[n.id]?.use ? '' : 'off'}`}>
            <label className="iq-keep"><input type="checkbox" checked={!!needs[n.id]?.use} onChange={(e) => set(n.id, { use: e.target.checked })} /> {T.keep}</label>
            <div>
              <span className={`iq-kind ${n.kind}`}>{n.kind === 'signals' ? T.fromSignals : T.fromYou}</span>
              <strong>{n.text}</strong>
              {n.why && <span className="iq-why"> — {n.why}</span>}
              {n.kind === 'signals' ? (
                <p className={`iq-found ${n.found ? '' : 'empty'}`}><span className="lbl">{T.found}{n.search ? ` · ⌕ ${n.search}` : ''}</span>{n.found || T.notFound}</p>
              ) : (
                <textarea rows={2} value={needs[n.id]?.answer || ''} onChange={(e) => set(n.id, { answer: e.target.value })} placeholder={T.yourAnswer} disabled={!needs[n.id]?.use} />
              )}
            </div>
          </li>
        ))}
      </ul>
      <label className="lbl iq-lbl">{T.extra}</label>
      <textarea className="iq-extra" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={T.extraPh} />
      <div className="iq-stage-go"><button className="btn" onClick={confirm}>{T.confirmData}</button></div>
    </section>
  );
}

function Attribution({ value, onChange }) {
  return (
    <div className="seg seg-small iq-attr">
      {['on', 'background', 'anon'].map((a) => <button key={a} type="button" className={value === a ? 'on' : ''} onClick={() => onChange(a)}>{T.attrib[a]}</button>)}
    </div>
  );
}

function SourcesPanel({ i, act }) {
  const [form, setForm] = useState({ kind: 'person', label: '', text: '', attribution: 'on' });
  const formRef = useRef(null);
  const add = async () => {
    const r = await act('/sources', { method: 'POST', json: form });
    if (r) setForm({ kind: 'person', label: '', text: '', attribution: 'on' });
  };
  const patch = (sid, body) => act(`/sources/${sid}`, { method: 'PATCH', json: body });
  return (
    <section className="iq-stage">
      <h3 className="iq-stage-title">{T.srcTitle}</h3>
      <div className="iq-sources">
        {(i.sources || []).map((s) => (
          <article key={s.id} className={`iq-src k-${s.kind} ${s.use === false ? 'off' : ''}`}>
            <header>
              <span className="iq-src-icon" aria-hidden="true">{KIND_ICON[s.kind] || '•'}</span>
              <span className="iq-src-kind">{T.kinds[s.kind] || s.kind}{s.auto ? ` · ${T.auto}` : ''}</span>
              <span className="iq-src-id">{s.id}</span>
              <label className="iq-keep"><input type="checkbox" checked={s.use !== false} onChange={(e) => patch(s.id, { use: e.target.checked })} /> {T.use}</label>
            </header>
            <strong>{s.label}</strong>
            <p>{s.text}</p>
            {!['signals', 'archive'].includes(s.kind) && <Attribution value={s.attribution || 'on'} onChange={(a) => patch(s.id, { attribution: a })} />}
            {!s.auto && <button className="btn-link danger" onClick={() => patch(s.id, { remove: true })}>{T.remove}</button>}
          </article>
        ))}
      </div>
      {i.missing?.length > 0 && (
        <div className="iq-missing">
          <span className="lbl">{T.wouldHelp}</span>
          {i.missing.map((m, k) => (
            <button key={k} type="button" className="iq-miss" onClick={() => { setForm((f) => ({ ...f, kind: m.kind, label: '', text: '' })); formRef.current?.focus(); }}>
              <span aria-hidden="true">{KIND_ICON[m.kind]}</span> {m.text} <em>{T.addThis} →</em>
            </button>
          ))}
        </div>
      )}
      <div className="iq-addsrc">
        <span className="lbl">{T.addSrc}</span>
        <div className="iq-addsrc-row">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {['person', 'document', 'note', 'testimony'].map((k) => <option key={k} value={k}>{T.kinds[k]}</option>)}
          </select>
          <input ref={formRef} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={T.srcLabelPh} maxLength={80} />
        </div>
        <textarea rows={3} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder={T.srcTextPh} />
        <div className="iq-addsrc-row">
          <Attribution value={form.attribution} onChange={(a) => setForm({ ...form, attribution: a })} />
          <button className="btn-ghost" disabled={!form.text.trim()} onClick={add}>＋ {T.add}</button>
        </div>
      </div>
      <div className="iq-stage-go"><button className="btn" onClick={() => act('/sources/done')}>{T.confirmSrc}</button></div>
    </section>
  );
}

function OutlinePanel({ i, act }) {
  const [o, setO] = useState(() => structuredClone(i.outline));
  const usable = (i.sources || []).filter((s) => s.use !== false);
  const setSec = (k, patch) => setO((x) => ({ ...x, sections: x.sections.map((s, n) => (n === k ? { ...s, ...patch } : s)) }));
  const move = (k, d) => setO((x) => {
    const s = [...x.sections];
    const j = k + d;
    if (j < 0 || j >= s.length) return x;
    [s[k], s[j]] = [s[j], s[k]];
    return { ...x, sections: s };
  });
  return (
    <section className="iq-stage iq-outline">
      <h3 className="iq-stage-title">{T.outTitle}</h3>
      <input className="iq-out-hl" value={o.headline || ''} onChange={(e) => setO({ ...o, headline: e.target.value })} placeholder={T.headline} />
      <input className="iq-out-dek" value={o.dek || ''} onChange={(e) => setO({ ...o, dek: e.target.value })} placeholder={T.dek} />
      <div className="iq-out-frame">
        <label><span className="lbl">{T.lede}</span><textarea rows={2} value={o.lede || ''} onChange={(e) => setO({ ...o, lede: e.target.value })} /></label>
        <label><span className="lbl">{T.nut}</span><textarea rows={2} value={o.nut || ''} onChange={(e) => setO({ ...o, nut: e.target.value })} /></label>
      </div>
      <ol className="iq-out-secs">
        {o.sections.map((s, k) => (
          <li key={k}>
            <span className="iq-out-n">{k + 1}</span>
            <div>
              <input className="iq-out-head" value={s.heading} onChange={(e) => setSec(k, { heading: e.target.value })} placeholder={T.section} />
              <textarea rows={2} value={s.beat || ''} onChange={(e) => setSec(k, { beat: e.target.value })} placeholder={T.beat} />
              {usable.length > 0 && (
                <div className="iq-out-src">
                  <span className="lbl">{T.sourcesOf}</span>
                  {usable.map((src) => {
                    const on = (s.sources || []).includes(src.id);
                    return <button key={src.id} type="button" title={src.label} className={`iq-srcchip ${on ? 'on' : ''}`} onClick={() => setSec(k, { sources: on ? s.sources.filter((x) => x !== src.id) : [...(s.sources || []), src.id] })}>{KIND_ICON[src.kind]} {src.id}</button>;
                  })}
                </div>
              )}
            </div>
            <div className="iq-out-tools">
              <button type="button" onClick={() => move(k, -1)} disabled={k === 0} aria-label="↑">↑</button>
              <button type="button" onClick={() => move(k, 1)} disabled={k === o.sections.length - 1} aria-label="↓">↓</button>
              <button type="button" onClick={() => setO((x) => ({ ...x, sections: x.sections.filter((_, n) => n !== k) }))} disabled={o.sections.length < 2} aria-label={T.remove}>✕</button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn-ghost" onClick={() => setO((x) => ({ ...x, sections: [...x.sections, { heading: '', beat: '', sources: [] }] }))}>＋ {T.addSection}</button>
      <label className="iq-out-end"><span className="lbl">{T.ending}</span><textarea rows={2} value={o.ending || ''} onChange={(e) => setO({ ...o, ending: e.target.value })} /></label>
      <div className="iq-stage-go">
        <button className="btn" disabled={!o.sections.some((s) => s.heading.trim())} onClick={() => act('/outline', { method: 'POST', json: { outline: { ...o, sections: o.sections.filter((s) => s.heading.trim()) } } })}>{T.approve}</button>
      </div>
    </section>
  );
}

function Gauge({ words, target }) {
  const pct = Math.min(100, Math.round((words / target) * 100));
  return (
    <div className="iq-gauge" title={`${words} / ${target}`}>
      <span style={{ width: `${pct}%` }} className={words > target * 1.25 ? 'over' : words >= target * 0.8 ? 'ok' : ''} />
      <em>{words} {T.of} {target.toLocaleString()} {T.words}</em>
    </div>
  );
}

function WritingPanel({ i }) {
  return (
    <section className="iq-stage">
      <h3 className="iq-stage-title">{T.writingTitle}</h3>
      <Gauge words={i.words} target={i.target} />
      <ol className="iq-progress">
        {i.blocks.map((b, k) => (
          <li key={k} className={b.status}>
            <span className="iq-out-n">{b.status === 'done' ? '✓' : b.status === 'writing' ? '✎' : k + 1}</span>
            <div>
              <strong>{b.heading}</strong>
              {b.status === 'done' ? <p className="iq-progress-text">{b.paragraphs[0]}</p> : <p className="hint-small">{b.beat}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The piece as it will read: the draft under the conversation. */
function Piece({ i, markers = null, onPara = null, focus = null }) {
  let n = 0;
  return (
    <div className="iq-piece">
      {i.kicker && <div className="kicker"><span className="sec">{i.kicker}</span></div>}
      <h2 className="iq-piece-hl">{i.headline || i.outline?.headline || i.topic}</h2>
      {i.dek && <p className="iq-piece-dek">{i.dek}</p>}
      {i.reporter && <p className="byline">{tr({ en: 'By', it: 'Di' })} <strong>{i.reporter.name}</strong> · {i.words} {T.words}</p>}
      {i.blocks.map((b, k) => (
        <section key={k} className="iq-piece-sec" id={`sec-${k}`}>
          {k > 0 && <div className="iq-piece-break" aria-hidden="true">✦</div>}
          {b.heading && <h3>{b.heading}</h3>}
          {(b.paragraphs || []).map((p) => {
            n += 1;
            const at = n;
            const ms = markers?.get(at) || [];
            const worst = ms.find((c) => c.verdict === 'unsupported') || ms.find((c) => c.verdict === 'partial') || ms[0];
            return (
              <p key={at} id={`p-${at}`} className={`${k === 0 && at === 1 ? 'iq-dropcap' : ''} ${worst ? `mark v-${worst.verdict}` : ''} ${focus === at ? 'focus' : ''}`}
                title={ms.map((c) => `${T.verdict[c.verdict]}: ${c.text}${c.note ? ` — ${c.note}` : ''}`).join('\n') || undefined}
                onClick={onPara && ms.length ? () => onPara(at) : undefined}>
                {p}
              </p>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** Two clicks: the draft is written again from fresh notes. */
function RewriteAll({ i, act }) {
  const [armed, setArmed] = useState(false);
  if (!['draft', 'desk'].includes(i.status)) return null;
  return (
    <button className={`btn-ghost ${armed ? 'danger on' : ''}`} title={T.rewriteAllHint} disabled={i.busy || !!i.working}
      onClick={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; } setArmed(false); act('/rewrite-all'); }}>
      ↻ {armed ? T.sure2 : T.rewriteAll}
    </button>
  );
}

function DraftPanel({ i, act }) {
  const editor = i.editor?.name || tr({ en: 'The managing editor', it: 'Il caporedattore' });
  return (
    <section className="iq-stage iq-draft">
      <div className="iq-draft-bar">
        <h3 className="iq-stage-title">{T.draftTitle}</h3>
        <Gauge words={i.words} target={i.target} />
      </div>
      <Piece i={i} />
      <div className="iq-stage-go">
        {i.status === 'draft' && <p className="hint-small">{T.toDeskHint(editor)}</p>}
        <RewriteAll i={i} act={act} />
        {i.status === 'draft'
          ? <button className="btn" onClick={async () => { const r = await act('/desk'); if (r) location.hash = href.editorDesk(i.id); }}>{T.toDesk}</button>
          : i.status === 'published' && i.featureId ? <a className="btn" href={href.feature(i.featureId)}>{T.readIt}</a>
            : <a className="btn" href={href.editorDesk(i.id)}>{T.editorDesk} →</a>}
      </div>
    </section>
  );
}

function Spark({ data }) {
  const max = Math.max(1, ...data);
  return <span className="iq-spark" aria-hidden="true">{data.map((v, k) => <i key={k} style={{ height: `${v ? Math.max(8, (v / max) * 100) : 0}%` }} className={v === max && v ? 'top' : ''} />)}</span>;
}

function Notebook({ i }) {
  const n = i.numbers;
  const kept = (i.needs || []).filter((x) => x.use !== false);
  const said = (i.questions || []).filter((x) => x.a);
  const srcs = (i.sources || []).filter((s) => s.use !== false);
  return (
    <aside className="iq-notebook">
      <h3 className="iq-nb-title">{T.notebook}</h3>
      <dl>
        <dt>{T.subject}</dt>
        <dd className="iq-nb-topic">{i.topic}</dd>
        {i.lead && (<><dt>{T.lead}</dt><dd className="iq-nb-lead">{i.lead}</dd></>)}
        <dt>{T.file}</dt>
        <dd>
          {n?.total ? (
            <>
              <span className="iq-nb-big">{n.total}</span> {T.signals} {T.in} {n.activeDays}/{n.days} {T.daysW}
              <Spark data={n.byDay || []} />
              {n.busiestDay && <span className="iq-nb-line">{T.busiest}: {dayKey(n.busiestDay.ts)} ({n.busiestDay.n})</span>}
              {n.busiestHour && <span className="iq-nb-line">{T.usual}: {String(n.busiestHour.hour).padStart(2, '0')}:00</span>}
              {n.sites?.length > 0 && <span className="iq-nb-line">{n.sites.slice(0, 3).map((s) => `${s.name} ${s.n}`).join(' · ')}</span>}
            </>
          ) : <span className="hint-small">{T.noFile}</span>}
        </dd>
        {i.angle && (<><dt>{T.angle}</dt><dd><strong>{i.angle.title}</strong><span className="iq-nb-line">{i.angle.angle}</span></dd></>)}
        {i.carnet && (
          <>
            <dt>{T.carnet}</dt>
            <dd className="iq-nb-carnet">
              <span className="hint-small">{T.carnetHint}</span>
              {i.carnet.premise && <span className="iq-nb-line"><strong>{T.premise}:</strong> {i.carnet.premise}</span>}
              {i.carnet.scenes.length > 0 && <ul>{i.carnet.scenes.slice(0, 4).map((x, k) => <li key={k}>{x}</li>)}</ul>}
              {i.carnet.figures.length > 0 && <span className="iq-nb-line"><strong>{T.keptFigures}:</strong> {i.carnet.figures.map((f) => f.value).join(' · ')}</span>}
            </dd>
          </>
        )}
        {kept.length > 0 && i.status !== 'data' && (<><dt>{T.dataKept}</dt><dd><ul>{kept.slice(0, 6).map((x) => <li key={x.id}>{x.text}</li>)}</ul></dd></>)}
        {said.length > 0 && (<><dt>{T.statements} · {said.length}</dt><dd><ul className="iq-nb-quotes">{said.slice(-4).map((x) => <li key={x.id}>{tr({ en: `“${x.a}”`, it: `«${x.a}»` })}</li>)}</ul></dd></>)}
        {srcs.length > 0 && (<><dt>{T.sourcesN} · {srcs.length}</dt><dd className="iq-nb-src">{srcs.map((s) => <span key={s.id} title={s.label}>{KIND_ICON[s.kind]} {s.label}</span>)}</dd></>)}
      </dl>
    </aside>
  );
}

// ───────────────────────── The Editor desk ─────────────────────────

export function EditorDeskPage({ id }) {
  return id ? <EditorDesk id={id} /> : <DeskQueue />;
}

function DeskQueue() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/inquiries?limit=60').then(setList).catch(() => setList([])); }, []);
  const groups = [
    ['desk', T.queue, (x) => x.status === 'desk'],
    ['draft', T.ready, (x) => x.status === 'draft'],
    ['published', T.out, (x) => x.status === 'published'],
  ];
  return (
    <div className="iq-page fullbleed">
      <Head title={T.deskTitle} sub={T.deskSub} on="editorDesk" />
      {list && !list.some((x) => ['desk', 'draft', 'published'].includes(x.status)) && <p className="empty-text">{T.noneDesk}</p>}
      <div className="edk-queue">
        {groups.map(([k, title, f]) => {
          const xs = (list || []).filter(f);
          if (!xs.length) return null;
          return (
            <section key={k}>
              <h3 className="box-title">{title}</h3>
              <div className="iq-cards">
                {xs.map((x) => (
                  <a key={x.id} className={`iq-card st-${x.status}`} href={href.editorDesk(x.id)}>
                    <span className="iq-card-top"><span className={`iq-pill st-${x.status}`}>{T.status[x.status]}</span><span className="iq-card-date">{shortDate(x.ts)}</span></span>
                    <strong className="iq-card-hl">{x.headline}</strong>
                    {x.dek && <span className="iq-card-dek">{x.dek}</span>}
                    <span className="iq-card-meta">{x.words} {T.words}{x.reporter ? ` · ${x.reporter.name}` : ''}</span>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EditorDesk({ id }) {
  const { i, setI, error, act } = useInquiry(id);
  const [tab, setTab] = useState('editor');
  const [focus, setFocus] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const markers = useMemo(() => {
    const m = new Map();
    for (const c of i?.desk?.claims || []) m.set(c.p, [...(m.get(c.p) || []), c]);
    return m;
  }, [i?.desk?.claims]);

  if (!i) return <div className="iq-page fullbleed">{error ? <p className="notice">{error}</p> : <p className="hint-small">…</p>}</div>;
  const ed = i.editor?.name || tr({ en: 'The managing editor', it: 'Il caporedattore' });
  const busy = i.busy || !!i.working;
  const goTo = (p) => {
    setFocus(p);
    document.getElementById(`p-${p}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  if (!['desk', 'published'].includes(i.status)) {
    return (
      <div className="iq-page fullbleed">
        <Head title={T.deskTitle} on="editorDesk" />
        <div className="edk-notyet">
          <p>{T.notYet}</p>
          {i.status === 'draft' ? <button className="btn" onClick={() => act('/desk')}>{T.send2}</button> : <a className="btn-ghost" href={href.inquiry(i.id)}>{T.backInq}</a>}
        </div>
      </div>
    );
  }

  const claims = i.desk?.claims || [];
  const count = (v) => claims.filter((c) => c.verdict === v).length;
  const read = i.desk?.read;
  const shape = i.desk?.shape || i.shape;
  const tiles = [
    { id: 'sources', k: 'sources', label: T.tiles.sources, value: claims.length ? `${count('ok')}/${claims.length}` : '—', warn: count('unsupported') > 0 },
    { id: 'structure', k: 'structure', label: T.tiles.structure, value: read ? `${['lede', 'nut', 'arc', 'ending'].filter((x) => read[x]?.ok !== false).length}/4` : '—', warn: read && ['lede', 'nut', 'arc', 'ending'].some((x) => read[x]?.ok === false) },
    { id: 'length', k: 'structure', label: T.tiles.length, value: `${i.words}`, warn: shape && !shape.ok },
    { id: 'style', k: 'style', label: T.tiles.style, value: i.register ? `${i.register.score}` : i.lint ? `${i.lint.score}` : '—', warn: (i.register?.score ?? 100) < 80 || (i.lint?.score ?? 100) < 70 || i.check?.unverified?.length > 0 },
  ];

  async function publish() {
    setPublishing(true);
    await act('/publish');
    setPublishing(false);
  }

  return (
    <div className="iq-page fullbleed edk">
      <Head title={T.deskTitle} on="editorDesk">
        <div className="edk-actions">
          <a className="btn-ghost" href={href.inquiry(i.id)}>{T.backInq}</a>
          {i.status === 'desk' && <button className="btn-ghost" disabled={busy} onClick={() => act('/desk')}>✓ {T.recheck}</button>}
          {i.status === 'desk' && <RewriteAll i={i} act={async (p) => { const r = await act(p); if (r) location.hash = href.inquiry(i.id); return r; }} />}
          {i.status === 'published' && i.featureId
            ? <a className="btn" href={href.feature(i.featureId)}>{T.readIt}</a>
            : <button className="btn" disabled={busy || publishing} onClick={publish}>{publishing ? T.publishing : T.publish}</button>}
        </div>
      </Head>
      {error && <p className="notice">{error}</p>}
      <div className="edk-grid">
        <section className="edk-proof">
          <div className="edk-proofbar">
            <Gauge words={i.words} target={i.target} />
            {i.status !== 'published' && <HeadlineBox i={i} setI={setI} />}
          </div>
          <Manuscript i={i} act={act} busy={busy} markers={markers} focus={focus} onPara={(p) => { setTab('sources'); setFocus(p); }} />
        </section>

        <aside className="edk-side">
          <div className="edk-tiles">
            {tiles.map((t) => (
              <button key={t.id} className={`edk-tile ${t.warn ? 'warn' : ''} ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.k)}>
                <span className="edk-tile-v">{t.value}</span><span className="edk-tile-l">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="side-tabs" role="tablist">
            {Object.entries(T.tabs).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k === 'editor' ? ed.split(' ')[0] : label}</button>
            ))}
          </div>
          <div className="edk-body">
            {busy && i.working === 'review' && <div className="iq-msg reporter typing"><span className="iq-avatar">{initials(ed)}</span><div className="iq-bubble"><strong>{ed}</strong> {T.working.review} <span className="iq-dots"><i /><i /><i /></span></div></div>}
            {tab === 'editor' && <EditorTalk i={i} setI={setI} act={act} ed={ed} busy={busy} />}
            {tab === 'sources' && (
              <div className="edk-sec">
                <h4 className="lbl">{T.claims}</h4>
                {claims.length ? (
                  <ul className="edk-claims">
                    {claims.map((c, k) => (
                      <li key={k} className={`v-${c.verdict} ${focus === c.p ? 'focus' : ''}`}>
                        <span className={`edk-v v-${c.verdict}`}>{T.verdict[c.verdict]}</span>
                        <span className="edk-claim">{c.text}</span>
                        {c.note && <span className="edk-note">{c.note}</span>}
                        <span className="edk-claim-foot">
                          {c.sources.map((s) => <span key={s} className="iq-srcchip on">{KIND_ICON[i.sources.find((x) => x.id === s)?.kind]} {s}</span>)}
                          <button className="btn-link" onClick={() => goTo(c.p)}>{T.goTo}{c.p}</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="hint-small">{T.noClaims}</p>}
                <h4 className="lbl">{T.srcTitle}</h4>
                <ul className="edk-srcs">
                  {(shape?.sources || []).map((s) => (
                    <li key={s.id}>
                      <span>{KIND_ICON[s.kind]} <strong>{s.id}</strong> {s.label}</span>
                      <em className={s.quoted ? 'ok' : s.planned ? '' : 'warn'}>{s.quoted ? T.srcUse.quoted : s.planned ? T.srcUse.planned : T.srcUse.unused}</em>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tab === 'structure' && (
              <div className="edk-sec">
                {read?.verdict && <blockquote className="edk-verdict">{read.verdict}<cite>— {ed}</cite></blockquote>}
                {read && (
                  <ul className="edk-parts">
                    {[['lede', T.lede2], ['nut', T.nut2], ['arc', T.arc], ['ending', T.ending2]].map(([k, label]) => read[k] && (
                      <li key={k} className={read[k].ok ? 'ok' : 'warn'}><span>{read[k].ok ? '✓' : '✗'} <strong>{label}</strong>{k === 'nut' && read.nut.p ? ` · ¶${read.nut.p}` : ''}</span>{read[k].note && <em>{read[k].note}</em>}</li>
                    ))}
                  </ul>
                )}
                <h4 className="lbl">{T.lengths}</h4>
                <ul className="edk-lengths">
                  {(shape?.sections || []).map((s, k) => (
                    <li key={k} className={s.ok ? '' : 'warn'}>
                      <span className="edk-len-name">{k + 1}. {s.heading}</span>
                      <span className="edk-len-bar"><i style={{ width: `${Math.min(100, (s.words / (s.max * 1.4)) * 100)}%` }} /><b style={{ left: `${(s.min / (s.max * 1.4)) * 100}%`, width: `${((s.max - s.min) / (s.max * 1.4)) * 100}%` }} /></span>
                      <span className="edk-len-n">{s.words}</span>
                    </li>
                  ))}
                </ul>
                {read?.edits?.length > 0 && (
                  <>
                    <h4 className="lbl">{T.edits}</h4>
                    <ul className="edk-edits">
                      {read.edits.map((e) => (
                        <li key={e.id} className={e.applied ? 'applied' : ''}>
                          <span className="edk-edit-sec">{T.section} {e.section + 1}</span>
                          <span>{e.note}</span>
                          {e.instruction && <em>→ {e.instruction}</em>}
                          {e.applied ? <span className="tag">{T.applied}</span> : <button className="btn-ghost" disabled={busy} onClick={() => act('/desk/apply', { method: 'POST', json: { edit: e.id } })}>{T.apply}</button>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {tab === 'style' && (
              <div className="edk-sec">
                {i.register && (
                  <>
                    <div className="edk-score"><span className={i.register.score < 80 ? 'warn' : ''}>{i.register.score}</span><em>{T.register} /100</em></div>
                    <p className="hint-small">{T.registerHint}</p>
                    {i.register.words.length > 0 && <p className="edk-figs"><span className="lbl">{T.dashWords}</span> {i.register.words.map((x) => <span key={x.w} className="tag tag-warn">{x.w} ×{x.n}</span>)}</p>}
                    {i.register.slop?.length > 0 && <><h4 className="lbl">{T.slop}</h4><ul className="edk-list">{i.register.slop.map((x) => <li key={x} className="warn">«{x}»</li>)}</ul></>}
                    <p className="edk-prose">{i.register.times} {T.times} · {i.register.pct} {T.pcts} · {i.register.figures} {T.figs}</p>
                  </>
                )}
                <div className="edk-score"><span className={(i.lint?.score ?? 100) < 70 ? 'warn' : ''}>{i.lint?.score ?? '—'}</span><em>{T.styleScore} /100</em></div>
                {read?.prose && <p className="edk-prose"><strong>{T.prose}:</strong> {read.prose}</p>}
                {i.lint?.issues?.length > 0 && (<><h4 className="lbl">{T.tics}</h4><ul className="edk-list">{i.lint.issues.map((x) => <li key={x.id}>{x.msg} <em>×{x.n}</em></li>)}</ul></>)}
                <h4 className="lbl">{T.figures}</h4>
                {i.check?.unverified?.length ? <p className="edk-figs">{i.check.unverified.map((f) => <span key={f} className="tag tag-warn">{f}</span>)}</p> : <p className="hint-small">{T.allFig}</p>}
                {shape?.quotes?.length > 0 && (<><h4 className="lbl">{T.quotes}</h4><ul className="edk-list">{shape.quotes.map((x, k) => <li key={k} className={x.used ? 'ok' : 'warn'}>{x.used ? '✓' : '✗'} {tr({ en: `“${x.a}”`, it: `«${x.a}»` })}</li>)}</ul></>)}
              </div>
            )}
            {tab === 'heads' && <Headlines i={i} act={act} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function HeadlineBox({ i, setI }) {
  const [form, setForm] = useState(null);
  async function save() {
    try { setI(await api(`/inquiries/${i.id}`, { method: 'PATCH', json: form })); setForm(null); } catch { /* keep the form */ }
  }
  if (form) {
    return (
      <div className="edk-hlform">
        <input value={form.kicker} onChange={(e) => setForm({ ...form, kicker: e.target.value })} placeholder={T.kicker} />
        <input className="iq-out-hl" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder={T.headline} />
        <textarea rows={2} value={form.dek} onChange={(e) => setForm({ ...form, dek: e.target.value })} placeholder={T.dek} />
        <div className="draft-actions"><button className="btn btn-small" onClick={save}>{T.save}</button><button className="btn-ghost" onClick={() => setForm(null)}>{T.cancel}</button></div>
      </div>
    );
  }
  return <button className="btn-link edk-hledit" onClick={() => setForm({ kicker: i.kicker || '', headline: i.headline || '', dek: i.dek || '' })}>✎ {T.edit}</button>;
}

function Manuscript({ i, act, busy, markers, focus, onPara }) {
  const [mode, setMode] = useState(null); // { k, op: 'rewrite'|'edit', value }
  const locked = i.status === 'published';
  const shape = i.desk?.shape || i.shape;
  let n = 0;
  return (
    <article className="iq-piece edk-ms">
      {i.kicker && <div className="kicker"><span className="sec">{i.kicker}</span></div>}
      <h2 className="iq-piece-hl">{i.headline}</h2>
      {i.dek && <p className="iq-piece-dek">{i.dek}</p>}
      {i.reporter && <p className="byline">{tr({ en: 'By', it: 'Di' })} <strong>{i.reporter.name}</strong>, {i.reporter.role}</p>}
      {i.blocks.map((b, k) => {
        const len = shape?.sections?.[k];
        const working = i.working === `section:${k}`;
        return (
          <section key={k} className={`iq-piece-sec edk-sec-block ${working ? 'working' : ''}`} id={`sec-${k}`}>
            {k > 0 && <div className="iq-piece-break" aria-hidden="true">✦</div>}
            <div className="edk-sec-tools">
              <span className="edk-sec-n">{k + 1}</span>
              {len && <span className={`tag ${len.ok ? '' : 'tag-warn'}`}>{len.words} / {len.min}–{len.max}</span>}
              {b.by === 'director' && <span className="tag">{T.you}</span>}
              {!locked && <button className="btn-link" disabled={busy} onClick={() => setMode({ k, op: 'rewrite', value: '' })}>{T.rewrite}</button>}
              {!locked && <button className="btn-link" disabled={busy} onClick={() => setMode({ k, op: 'edit', value: b.paragraphs.join('\n\n'), heading: b.heading })}>{T.edit}</button>}
              {working && <span className="iq-dots"><i /><i /><i /></span>}
            </div>
            {mode?.k === k ? (
              <div className="edk-editbox">
                {mode.op === 'edit' && <input value={mode.heading} onChange={(e) => setMode({ ...mode, heading: e.target.value })} />}
                <textarea rows={mode.op === 'edit' ? 12 : 2} value={mode.value} placeholder={mode.op === 'rewrite' ? T.rewritePh : ''} onChange={(e) => setMode({ ...mode, value: e.target.value })} autoFocus />
                {mode.op === 'edit' && <p className="hint-small">{T.paraHint}</p>}
                <div className="draft-actions">
                  <button className="btn btn-small" disabled={busy || (mode.op === 'edit' && !mode.value.trim())} onClick={async () => {
                    const r = await act(`/blocks/${k}`, { method: 'POST', json: mode.op === 'edit' ? { op: 'edit', paragraphs: mode.value, heading: mode.heading } : { op: 'rewrite', instruction: mode.value } });
                    if (r) setMode(null);
                  }}>{mode.op === 'edit' ? T.save : T.rewrite}</button>
                  <button className="btn-ghost" onClick={() => setMode(null)}>{T.cancel}</button>
                </div>
              </div>
            ) : (
              <>
                {b.heading && <h3>{b.heading}</h3>}
                {(b.paragraphs || []).map((p) => {
                  n += 1;
                  const at = n;
                  const ms = markers.get(at) || [];
                  const worst = ms.find((c) => c.verdict === 'unsupported') || ms.find((c) => c.verdict === 'partial') || ms[0];
                  return (
                    <p key={at} id={`p-${at}`} className={`${k === 0 && at === 1 ? 'iq-dropcap' : ''} ${worst ? `mark v-${worst.verdict}` : ''} ${focus === at ? 'focus' : ''}`}
                      title={ms.map((c) => `${T.verdict[c.verdict]}: ${c.text}${c.note ? ` — ${c.note}` : ''}`).join('\n') || undefined}
                      onClick={ms.length ? () => onPara(at) : undefined}>
                      {p}
                    </p>
                  );
                })}
              </>
            )}
          </section>
        );
      })}
    </article>
  );
}

function Headlines({ i, act }) {
  const set = (body) => act('', { method: 'PATCH', json: body });
  const heads = [...new Set([...(i.desk?.headlines || []), ...(i.alternatives || [])])].filter((h) => h && h !== i.headline);
  return (
    <div className="edk-sec">
      <h4 className="lbl">{T.headline}</h4>
      <p className="edk-cur-hl">{i.headline}</p>
      {heads.length > 0 && (
        <>
          <h4 className="lbl">{T.alts}</h4>
          <ul className="edk-heads">
            {heads.map((h) => <li key={h}><span>{h}</span><button className="btn-ghost" onClick={() => set({ headline: h })}>{T.set}</button></li>)}
          </ul>
        </>
      )}
      {i.desk?.dek && i.desk.dek !== i.dek && (
        <>
          <h4 className="lbl">{T.dek}</h4>
          <ul className="edk-heads"><li><span>{i.desk.dek}</span><button className="btn-ghost" onClick={() => set({ dek: i.desk.dek })}>{T.set}</button></li></ul>
        </>
      )}
      {i.desk?.kicker && i.desk.kicker !== i.kicker && (
        <>
          <h4 className="lbl">{T.kicker}</h4>
          <ul className="edk-heads"><li><span>{i.desk.kicker}</span><button className="btn-ghost" onClick={() => set({ kicker: i.desk.kicker })}>{T.set}</button></li></ul>
        </>
      )}
    </div>
  );
}

function EditorTalk({ i, setI, act, ed, busy }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const thread = i.deskThread || [];
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [thread.length, sending]);
  async function send(e) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setI((x) => ({ ...x, deskThread: [...(x.deskThread || []), { who: 'director', text: t, at: Date.now(), pending: true }] }));
    setText('');
    const r = await act('/desk/talk', { method: 'POST', json: { text: t } });
    if (!r) { setText(t); setI((x) => ({ ...x, deskThread: x.deskThread.filter((m) => !m.pending) })); }
    setSending(false);
  }
  return (
    <div className="edk-talk">
      <div className="edk-talk-thread">
        {thread.map((m, k) => (
          <div key={k} className={`iq-msg ${m.who === 'director' ? 'director' : 'reporter'}`}>
            <span className="iq-avatar">{m.who === 'director' ? T.you.slice(0, 1) : initials(ed)}</span>
            <div className="iq-bubble">
              <span className="iq-msg-who">{m.who === 'director' ? T.you : ed}{m.at ? ` · ${hhmm(m.at)}` : ''}</span>
              {String(m.text).split(/\n\s*\n/).map((p, n) => <p key={n}>{p}</p>)}
              {m.actions?.length > 0 && (
                <div className="edk-acts">
                  {m.actions.map((a, n) => (
                    <button key={n} className={`edk-act ${a.applied ? 'applied' : ''}`} disabled={a.applied || busy} onClick={() => act('/desk/apply', { method: 'POST', json: { msg: k, action: n } })}>
                      {a.type === 'rewrite' ? `✎ ${T.section} ${a.section + 1}: ${a.instruction}` : `${a.type === 'headline' ? T.headline : T.dek}: ${tr({ en: `“${a.text}”`, it: `«${a.text}»` })}`}
                      {a.applied ? ` · ${T.applied}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div className="iq-msg reporter typing"><span className="iq-avatar">{initials(ed)}</span><div className="iq-bubble"><strong>{ed}</strong> {T.thinking} <span className="iq-dots"><i /><i /><i /></span></div></div>}
        <div ref={endRef} />
      </div>
      <form className="iq-composer edk-composer" onSubmit={send}>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={T.talkPh(ed)} disabled={sending}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} />
        <button className="btn btn-small" disabled={sending || !text.trim()}>{T.send}</button>
      </form>
    </div>
  );
}
