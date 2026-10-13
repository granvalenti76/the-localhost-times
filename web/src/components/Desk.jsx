import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, href, hhmm, dayKey, shortDate } from '../lib.js';
import { tr } from '../i18n.js';
import { NewsroomNav } from './Inquiry.jsx';
import { Medallion, DirectorChip, Missions, Streak, Toast, useDirector, stepText, SoundToggle, Press, MOODS } from './Rooms.jsx';

/*
 * The Editor's desk: where the next edition stands, in six steps from the wires to the press, and
 * the one thing that is the Editor's to do now. The page plan below; the day's missions, the staff
 * and the run of days on the side. Settings live in the Publishing House, not here.
 */

const T = tr({
  en: {
    no: (n) => `No. ${n}`, closesAt: (t) => `goes to press at ${t}`, alone: 'then it prints by itself', waits: 'then it waits for you',
    steps: ['Wires', 'Meeting', 'Page plan', 'Writing', 'Proofs', 'Press'],
    wires: (n) => `${n.toLocaleString()} dispatches`, wiresSub: (k, t) => `from ${k} wires, since ${t}`,
    meeting: (n) => `${n} stories picked`, meetingSub: (n) => `out of ${n} found`, meetingWait: (t) => `next meeting at ${t}`,
    plan: 'Pages assigned', planSub: (w, n) => `${w} bylines, ${n} pieces`, planWait: 'after the meeting',
    writing: (a, b) => `${a} of ${b} written`, writingIdle: 'nobody writing now',
    proofs: (n) => (n === 1 ? '1 to proofread' : `${n} to proofread`), proofsSub: (n) => `${n} passed for press`, proofsNone: 'nothing yet',
    press: (m) => (m <= 0 ? 'any minute' : m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)} h ${m % 60} min`),
    yours: 'Your move',
    proofsH: (n) => (n === 1 ? 'A draft is on your desk.' : `${n} drafts are on your desk.`),
    proofsP: (w) => `The managing editor has read them first.${w ? ` ${w} still writing.` : ''} Proofread them now and the closing bonus is yours.`,
    startProofs: 'Start the proof round →', watch: 'See who is writing',
    writingH: 'The reporters are writing.', writingP: 'The drafts reach the desk one by one: you can watch them being typed.',
    waitH: (t) => (t ? `The next meeting is at ${t}.` : 'No drafts yet.'), waitP: 'The reporters will draft the strongest stories then. You can ask for them now.', waitPress: (t) => `Without drafts, the pieces are written at the press, at ${t}. You can ask for them now and proofread them first.`,
    draftNow: 'Have them write now', asked: 'The reporters are on it…',
    doneH: 'Everything is passed for press.', doneP: (t) => `The edition goes to press at ${t} as it is.`,
    quietH: 'A quiet hour on the wires.', quietP: (n) => `Below ${n} dispatches the hour merges into the next edition.`,
    offlineH: 'The writer is not answering.', offlineP: 'No drafts during the hour: at the press the automatic typesetting writes the paper. Start the local model to bring the reporters back.',
    nearMiss: 'Left out by the meeting:', rescue: 'Bring it in', rescued: 'story rescued',
    planTitle: 'The page plan', planHint: 'the front page, as the meeting set it',
    lead: 'Lead', toLead: 'Lead with it', leaveOut: 'Leave out', open: 'Open',
    st: { writing: 'writing', ready: 'to proofread', approved: 'passed', forming: 'waiting', queued: 'in line' },
    staff: 'In the newsroom', delivered: 'delivered', idle: 'free', onIt: (t) => `on “${t}”`,
    rooms: 'Other rooms', detail: 'The detailed desk', spotlight: 'Spotlight', tips: 'Tip box', live: 'Newsroom chatter', last: 'The last edition', house: 'Publishing House',
    noPlan: 'The meeting has not met yet: no page plan.', more: (n) => `+ ${n} more inside`,
    printNow: 'Send it to press now', printing: 'The press is starting…',
    lastWord: { overruled: (h) => `“I wouldn't have passed ‘${h}’.”`, overruledBack: (h) => `“For me ‘${h}’ was fine.”`, agreed: (h) => `Agreed with you on “${h}”.`, agreedBack: (h) => `“‘${h}’ back to the reporter: I said so too.”` },
    ideas: 'Ideas from the staff', ideaWhy: 'has a nose for stories', commission: 'Commission it', commissioned: 'Commissioned →',
  },
  it: {
    no: (n) => `numero ${n}`, closesAt: (t) => `va in stampa alle ${t}`, alone: 'poi esce da sola', waits: 'poi aspetta te',
    steps: ['Agenzie', 'Riunione', 'Timone', 'Scrittura', 'Bozze', 'Stampa'],
    wires: (n) => `${n.toLocaleString('it-IT')} dispacci`, wiresSub: (k, t) => `da ${k} agenzie, dalle ${t}`,
    meeting: (n) => `${n} notizie scelte`, meetingSub: (n) => `su ${n} storie trovate`, meetingWait: (t) => `riunione alle ${t}`,
    plan: 'Pagine assegnate', planSub: (w, n) => `${w} firme, ${n} pezzi`, planWait: 'dopo la riunione',
    writing: (a, b) => `${a} di ${b} scritti`, writingIdle: 'nessuno scrive ora',
    proofs: (n) => (n === 1 ? '1 da correggere' : `${n} da correggere`), proofsSub: (n) => `${n} con il visto`, proofsNone: 'ancora niente',
    press: (m) => (m <= 0 ? 'a momenti' : m < 60 ? `tra ${m} min` : `tra ${Math.floor(m / 60)} h ${m % 60} min`),
    yours: 'Tocca a te',
    proofsH: (n) => (n === 1 ? 'Una bozza è sul tuo tavolo.' : `${n} bozze sono sul tuo tavolo.`),
    proofsP: (w) => `Il caporedattore le ha già lette.${w ? ` ${w} sta ancora scrivendo.` : ''} Correggile ora e il bonus di chiusura è tuo.`,
    startProofs: 'Inizia il giro di bozze →', watch: 'Guarda chi scrive',
    writingH: 'I cronisti stanno scrivendo.', writingP: 'Le bozze arrivano sul tavolo una alla volta: puoi guardarle mentre nascono.',
    waitH: (t) => (t ? `La prossima riunione è alle ${t}.` : 'Ancora nessuna bozza.'), waitP: 'I cronisti scriveranno allora le storie più forti. Puoi chiederle subito.', waitPress: (t) => `Senza bozze, i pezzi si scrivono alla stampa, alle ${t}. Puoi chiederli ora e correggerli prima.`,
    draftNow: 'Falli scrivere ora', asked: 'I cronisti ci sono…',
    doneH: 'Tutto ha il visto.', doneP: (t) => `L'edizione va in stampa alle ${t} così com'è.`,
    quietH: 'Ora tranquilla sulle agenzie.', quietP: (n) => `Sotto i ${n} dispacci l'ora confluisce nella prossima edizione.`,
    offlineH: 'Il redattore non risponde.', offlineP: 'Niente bozze durante l\'ora: alla stampa scrive la tipografia automatica. Avvia il modello locale per riavere i cronisti.',
    nearMiss: 'Quasi scelte dalla riunione:', rescue: 'Ripescala', rescued: 'notizia ripescata',
    planTitle: 'Il timone', planHint: 'la prima pagina, come l\'ha decisa la riunione',
    lead: 'Apertura', toLead: 'In apertura', leaveOut: 'Fuori', open: 'Apri',
    st: { writing: 'scrive', ready: 'da correggere', approved: 'visto', forming: 'in attesa', queued: 'in fila' },
    staff: 'In redazione', delivered: 'ha consegnato', idle: 'libero', onIt: (t) => `su «${t}»`,
    rooms: 'Altre stanze', detail: 'Il tavolo dettagliato', spotlight: 'Spotlight', tips: 'Soffiate', live: 'La redazione viva', last: 'L\'ultima edizione', house: 'Casa Editrice',
    noPlan: 'La riunione non si è ancora riunita: niente timone.', more: (n) => `+ altri ${n} all'interno`,
    printNow: 'Manda in stampa ora', printing: 'Si avvia la rotativa…',
    lastWord: { overruled: (h) => `«Io ‘${h}’ non l'avrei passato.»`, overruledBack: (h) => `«Per me ‘${h}’ andava bene.»`, agreed: (h) => `D'accordo con te su «${h}».`, agreedBack: (h) => `«‘${h}’ rimandato: lo dicevo anch'io.»` },
    ideas: 'Proposte dei redattori', ideaWhy: 'ha fiuto per le storie', commission: 'Commissiona', commissioned: 'Commissionato →',
  },
});

const when = (ms) => (dayKey(ms) === dayKey(Date.now()) ? hhmm(ms) : `${shortDate(ms)} ${hhmm(ms)}`);

/** The six steps of the edition, and which one it is at. */
function steps(v) {
  const written = v.pieces.filter((p) => p.text).length;
  const inPaper = Math.min(v.stories, v.maxArticles);
  const target = Math.max(1, Math.min(v.draftTop, inPaper));
  const writing = v.pieces.filter((p) => p.status === 'writing');
  const ready = v.pieces.filter((p) => p.status === 'ready').length;
  const approved = v.pieces.filter((p) => p.status === 'approved').length;
  const met = v.rounds.some((r) => r.done) || v.pieces.length > 0;
  const writers = new Set([...v.pieces, ...v.forming.filter((f) => f.inPaper)].map((p) => p.writer?.id).filter(Boolean));
  const list = [
    { done: v.signals > 0, b: T.wires(v.signals), s: T.wiresSub(v.sources, when(v.windowStart)) },
    { done: met, b: T.meeting(inPaper), s: !met && v.nextRound ? T.meetingWait(when(v.nextRound.at)) : T.meetingSub(v.stories) },
    { done: met, b: T.plan, s: met ? T.planSub(writers.size, inPaper) : T.planWait },
    { done: met && written >= target && !writing.length, b: T.writing(written, target), s: writing.length ? stepText(writing[0].step, writing[0].writer?.name) : T.writingIdle, prog: written / target, go: href.write() },
    { done: met && written > 0 && !ready, b: ready ? T.proofs(ready) : approved ? T.proofsSub(approved) : T.proofsNone, s: ready ? T.proofsSub(approved) : '', go: href.proofs() },
    { done: false, b: hhmm(v.printsAt), s: T.press(v.minutesLeft) },
  ];
  const now = list.findIndex((x) => !x.done);
  return { list, now, written, writing, ready, approved };
}

function Rail({ v, s }) {
  return (
    <ol className="rd-rail">
      {s.list.map((x, i) => {
        const cls = `rd-step ${x.done ? 'done' : ''} ${i === s.now ? 'now' : ''}`;
        const body = (
          <>
            <span className="rd-n"><i>{x.done ? '✓' : i + 1}</i>{T.steps[i]}</span>
            <b>{x.b}</b>
            {x.s && <span className="rd-sub">{x.s}</span>}
            {x.prog != null && i === s.now && <span className="rd-prog"><i style={{ width: `${Math.round(Math.min(1, x.prog) * 100)}%` }} /></span>}
          </>
        );
        return <li key={i} className={cls}>{x.go ? <a href={x.go}>{body}</a> : <div>{body}</div>}</li>;
      })}
    </ol>
  );
}

function Clock({ v }) {
  const span = Math.max(1, v.printsAt - v.lastPress);
  const left = Math.max(0, Math.min(1, (v.printsAt - Date.now()) / span));
  const C = 2 * Math.PI * 20;
  return (
    <div className="rd-clock">
      <svg viewBox="0 0 46 46" aria-hidden="true">
        <circle cx="23" cy="23" r="20" className="trk" />
        <circle cx="23" cy="23" r="20" className="arc" strokeDasharray={C} strokeDashoffset={C * left} transform="rotate(-90 23 23)" />
      </svg>
      <div>
        <b className="num">{v.minutesLeft >= 60 ? `${Math.floor(v.minutesLeft / 60)}:${String(v.minutesLeft % 60).padStart(2, '0')}` : `${v.minutesLeft}′`}</b>
        <span>{T.closesAt(hhmm(v.printsAt))}<br />{v.autoPublish === false ? T.waits : T.alone}</span>
      </div>
    </div>
  );
}

/** What is the Editor's to do now. */
function Now({ v, s, offline, act, busy, onPrint, printing }) {
  const writingNames = [...new Set(s.writing.map((p) => p.writer?.name?.split(' ')[0]).filter(Boolean))].join(', ');
  let h; let p; let main; let second = null;
  if (offline) { h = T.offlineH; p = T.offlineP; }
  else if (s.ready) { h = T.proofsH(s.ready); p = T.proofsP(writingNames); main = <a className="btn" href={href.proofs()}>{T.startProofs}</a>; second = s.writing.length ? <a className="btn-ghost" href={href.write()}>{T.watch}</a> : null; }
  else if (s.writing.length || v.running) { h = T.writingH; p = T.writingP; main = <a className="btn" href={href.write()}>{T.watch} →</a>; }
  else if (v.willMerge) { h = T.quietH; p = T.quietP(v.willMerge); }
  else if (!v.pieces.length) { h = T.waitH(v.nextRound ? when(v.nextRound.at) : null); p = v.nextRound ? T.waitP : T.waitPress(hhmm(v.printsAt)); main = <button className="btn" disabled={busy} onClick={() => act('/workbench/round', { method: 'POST' })}>{busy ? T.asked : T.draftNow}</button>; }
  else if (s.approved && !s.ready) { h = T.doneH; p = T.doneP(hhmm(v.printsAt)); main = <button className="btn" disabled={printing} onClick={onPrint}>{printing ? T.printing : T.printNow}</button>; }
  else { h = T.waitH(v.nextRound ? when(v.nextRound.at) : null); p = v.nextRound ? T.waitP : T.waitPress(hhmm(v.printsAt)); main = <button className="btn" disabled={busy} onClick={() => act('/workbench/round', { method: 'POST' })}>{busy ? T.asked : T.draftNow}</button>; }
  const near = v.forming.filter((f) => !f.inPaper && !f.boosted).slice(0, 3);
  return (
    <div className="rd-now">
      <span className="rd-lbl">{T.yours}</span>
      <h3>{h}</h3>
      <p>{p}</p>
      {(main || second) && <div className="rd-acts">{main}{second}</div>}
      {near.length > 0 && !offline && (
        <div className="rd-near">
          <span className="rd-mut">{T.nearMiss}</span>
          {near.map((f) => (
            <button key={f.id} className="rd-rip" title={T.rescue} onClick={() => act('/next/steer', { method: 'POST', json: { op: 'boost', story: f.id } }, T.rescued)}>↺ {f.topic}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The front page as the meeting set it: the pieces in order, who writes them, where they stand. */
function Plan({ v, act }) {
  const byId = new Map(v.pieces.map((p) => [p.id, p]));
  const rows = [...v.pieces.filter((p) => p.status !== 'killed' && p.rank), ...v.forming.filter((f) => f.inPaper && !byId.has(f.id))]
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  if (!rows.length) return <p className="rd-mut">{T.noPlan}</p>;
  const shown = rows.slice(0, 6);
  return (
    <>
      <div className="rd-plan">
        {shown.map((x, i) => {
          const p = byId.get(x.id);
          const st = p ? (p.status === 'writing' && p.step === 'queued' ? 'queued' : p.status) : 'forming';
          const title = p?.text?.headline || x.topic;
          return (
            <article key={x.id} className={`rd-slot ${i === 0 ? 'lead' : i < 3 ? 'side' : 'third'} st-${st}`}>
              <span className="rd-k">{i === 0 ? `${T.lead} · ` : ''}{x.section}</span>
              <span className="rd-t">{title}</span>
              {i === 0 && p?.text?.dek && <span className="rd-dek">{p.text.dek}</span>}
              {i === 0 && !p?.text && <span className="rd-lines" aria-hidden="true"><i /><i /><i /><i /></span>}
              <div className="rd-who">
                <span><Medallion writer={x.writer} size="sm" />{x.writer?.name || '—'}</span>
                <span className={`rd-pill ${st}`}>{T.st[st]}</span>
              </div>
              <div className="rd-slot-acts">
                {st === 'ready' && <a href={href.proofs(x.id)}>{T.open}</a>}
                {st === 'writing' && <a href={href.write(x.id)}>{T.open}</a>}
                {i > 0 && <button onClick={() => act('/next/steer', { method: 'POST', json: { op: 'boost', story: x.id } })}>{T.toLead}</button>}
                <button onClick={() => (p ? act(`/workbench/${encodeURIComponent(x.id)}/kill`, { method: 'POST' }) : act('/next/steer', { method: 'POST', json: { op: 'bury', story: x.id } }))}>{T.leaveOut}</button>
              </div>
            </article>
          );
        })}
      </div>
      {rows.length > shown.length && <p className="rd-mut rd-more">{T.more(rows.length - shown.length)}</p>}
    </>
  );
}

function Staff({ staff, v }) {
  if (!staff) return null;
  const by = (id) => v.pieces.filter((p) => p.writer?.id === id);
  return (
    <div className="rd-box">
      <div className="rd-sh"><h4>{T.staff}</h4><a className="rd-lbl" href={href.house('staff')}>{staff.length}</a></div>
      {staff.map((w) => {
        const mine = by(w.id);
        const now = mine.find((p) => p.status === 'writing');
        const done = mine.filter((p) => p.text).length;
        return (
          <div key={w.id} className="rd-staffrow">
            <Medallion writer={w} state={now ? 'busy' : done ? 'ok' : 'idle'} />
            <div><b>{w.name}{w.mood && w.mood !== 'fine' ? <em className={`rd-mood ${w.mood}`}> · {MOODS[w.mood]}</em> : null}</b><small>{now ? T.onIt(now.text?.headline || now.topic) : done ? `${T.delivered} · ${done}` : T.idle}</small></div>
          </div>
        );
      })}
    </div>
  );
}

/** The managing editor: who they are, what they think of the Editor, this week's disagreements. */
function Chief() {
  const [c, setC] = useState(null);
  const [mail, setMail] = useState(0);
  useEffect(() => {
    api('/chief').then(setC).catch(() => {});
    api('/letters/mailbox').then((r) => setMail(r.letters?.length || 0)).catch(() => {});
  }, []);
  if (!c) return null;
  const last = c.recent?.[0];
  return (
    <>
      <div className="rd-box rd-chief">
        <div className="rd-sh"><h4>{c.name}</h4><span className="rd-lbl">{c.role}</span></div>
        <p className={`rd-chief-mood ${c.mood}`}>{tr({ en: `${c.name.split(' ')[0]} ${c.moodText}.`, it: `${c.name.split(' ')[0]} ${c.moodText}.` })}</p>
        <div className="rd-esteem" title={`${c.esteem}/100`}><i style={{ width: `${c.esteem}%` }} /></div>
        <span className="rd-mut">{tr({ en: `This week: agreed ${c.week.agreed} · overruled ${c.week.overruled}`, it: `Questa settimana: d'accordo ${c.week.agreed} · scavalcato ${c.week.overruled}` })}</span>
        {last && <p className="rd-chief-last">{T.lastWord[last.kind]?.(last.headline)}</p>}
      </div>
      {mail > 0 && (
        <a className="rd-box rd-mail" href={href.letters()}>
          <span className="rd-mailicon" aria-hidden="true">✉</span>
          <span><b>{tr({ en: mail === 1 ? 'A reader wrote' : `${mail} readers wrote`, it: mail === 1 ? 'Un lettore ha scritto' : `${mail} lettori hanno scritto` })}</b><small>{tr({ en: 'Publish, answer or bin →', it: 'Pubblica, rispondi o cestina →' })}</small></span>
        </a>
      )}
    </>
  );
}

/** What writers with a nose for stories propose: a long read on their beat, commissioned with one click. */
function Ideas() {
  const [list, setList] = useState([]);
  const [done, setDone] = useState({});
  const [busy, setBusy] = useState(null);
  useEffect(() => { api('/staff/proposals').then(setList).catch(() => {}); }, []);
  if (!list.length) return null;
  async function commission(x) {
    setBusy(x.storyId);
    try { const f = await api('/features', { method: 'POST', json: { storyId: x.storyId, topic: x.topic, target: 'longread' } }); setDone((d) => ({ ...d, [x.storyId]: f.id })); } catch { /* stays on offer */ } finally { setBusy(null); }
  }
  return (
    <div className="rd-box">
      <div className="rd-sh"><h4>{T.ideas}</h4></div>
      {list.map((x) => (
        <div key={x.storyId} className="rd-idea">
          <Medallion writer={x.writer} size="sm" />
          <div><b>{x.topic}</b><small>{x.writer.name} {T.ideaWhy}</small>
            {done[x.storyId] ? <a href={href.feature(done[x.storyId])}>{T.commissioned}</a> : <button className="rd-link" disabled={busy === x.storyId} onClick={() => commission(x)}>{T.commission}</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Desk() {
  const [v, setV] = useState(null);
  const [staff, setStaff] = useState(null);
  const [status, setStatus] = useState(null);
  const [line, setLine] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { d, gain, toast } = useDirector();
  const [pressed, setPressed] = useState(null); // the edition just out of the press (the animation)
  const [printing, setPrinting] = useState(false);
  const seen = useRef(null);

  const load = useCallback(() => api('/workbench').then((next) => {
    // the edition in the works changed under our eyes: the press has just run
    if (seen.current && next.editionId !== seen.current) api('/editions/latest').then((e) => e && setPressed(e)).catch(() => {});
    seen.current = next.editionId;
    setV(next);
  }).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
    api('/staff').then((r) => setStaff((r.staff || []).filter((w) => !w.fired))).catch(() => {});
    api('/status').then(setStatus).catch(() => {});
    api('/line').then((r) => setLine(r.line)).catch(() => {});
  }, [load]);
  // fresher while the reporters write
  useEffect(() => {
    const writing = v?.running || v?.pieces?.some((p) => p.status === 'writing');
    const t = setInterval(load, writing ? 3000 : 15000);
    return () => clearInterval(t);
  }, [v, load]);

  async function act(path, opts, label = null) {
    setError(null);
    if (path === '/workbench/round') setBusy(true);
    try {
      const r = await api(path, opts);
      if (r?.award) gain(r.award, label);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function printNow() {
    setPrinting(true); setError(null);
    try {
      const e = await api('/print', { method: 'POST' });
      if (e) setPressed(e);
      await load();
    } catch (err) { setError(err.message); } finally { setPrinting(false); }
  }

  const offline = ['offline', 'disabled'].includes(status?.llm?.state);
  if (!v) return <div className="rd-desk-page">{error && <p className="notice">{error}</p>}</div>;
  const s = steps(v);
  const kind = v.cadence?.kind;
  const name = kind === 'daily' ? tr({ en: 'The Daily', it: 'Il Quotidiano' }) : kind === 'weekly' ? tr({ en: 'The Weekly', it: 'Il Settimanale' }) : tr({ en: 'Every hour', it: 'Ogni ora' });
  const title = kind === 'hourly'
    ? tr({ en: `The ${hhmm(v.hour)} edition`, it: `L'edizione delle ${hhmm(v.hour)}` })
    : tr({ en: `The edition of ${shortDate(v.printsAt)}`, it: `Il numero di ${shortDate(v.printsAt)}` });

  return (
    <div className="rd-desk-page fullbleed">
      <Toast toast={toast} />
      {pressed && <Press edition={pressed} onClose={() => setPressed(null)} />}
      <header className="rd-head">
        <div>
          <h2>{tr({ en: 'The Newsroom', it: 'La Redazione' })}</h2>
          <NewsroomNav on="desk" />
        </div>
        <div className="rd-headr"><SoundToggle /><DirectorChip d={d} /></div>
      </header>

      <div className="rd-desk">
        <div className="rd-edline">
          <div>
            <span className="rd-lbl">{name}</span>
            <h2>{title} <em>{tr({ en: 'in the works', it: 'in lavorazione' })}</em></h2>
          </div>
          <Clock v={{ ...v, autoPublish: line?.autoPublish }} />
        </div>

        <Rail v={v} s={s} />
        {error && <p className="notice">{error}</p>}

        <div className="rd-grid">
          <div className="rd-main">
            <Now v={v} s={s} offline={offline} act={act} busy={busy || !!v.running} onPrint={printNow} printing={printing} />
            <section>
              <div className="rd-sh"><h4>{T.planTitle}</h4><span className="rd-lbl">{T.planHint}</span></div>
              <Plan v={v} act={act} />
            </section>
            <nav className="rd-rooms" aria-label={T.rooms}>
              <span className="rd-lbl">{T.rooms}</span>
              <a href={href.nextDetail()}>{T.detail}</a>
              <a href={href.desk('spotlight')}>{T.spotlight}</a>
              <a href={href.desk('tips')}>{T.tips}</a>
              <a href={href.desk('live')}>{T.live}</a>
              <a href={href.house()}>{T.house}</a>
            </nav>
          </div>
          <aside className="rd-side">
            <Missions d={d} />
            <Chief />
            <Ideas />
            <Staff staff={staff} v={v} />
            <Streak d={d} />
          </aside>
        </div>
      </div>
    </div>
  );
}
