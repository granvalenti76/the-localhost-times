import React, { useCallback, useEffect, useState } from 'react';
import { api, hhmm, href, readingTime } from '../lib.js';
import { tr, quote } from '../i18n.js';
import { Track, Workings, Changes, Pending, stampOf, pendingNotes } from './Proof.jsx';

/*
 * The next edition in the works: the hour in the newsroom (when the reporters draft, the closing,
 * the press), how the desk works, and the drafts by state, each with the Editor's tools: approve,
 * send back with a note, retouch, lead with it, leave it out.
 */

const T = tr({
  en: {
    title: (h) => `The ${h} edition`, works: 'in the works', draftNow: 'Draft now', drafting: 'The reporters are writing…', printNow: 'Print now', printing: 'Printing…',
    round: (m) => `:${String(m).padStart(2, '0')} drafts`, closing: ':55 closing', press: (h) => `${h} press`, now: 'now',
    st: {
      running: 'The reporters are writing the drafts: they reach the desk one by one.',
      next: (t, p, m) => `Next drafting round at ${t}. The press at ${p}, in ${m} min.`,
      yours: (p, m) => `The drafting rounds are done: the desk is yours. The press at ${p}, in ${m} min.`,
      closing: (m) => `Closing time: the press in ${m} min.`,
      none: (p) => `No drafting rounds are set: the pieces are written at the press, at ${p}.`,
      offline: 'The model is not answering: no drafts during the hour; at the press the typesetting writes.',
    },
    merge: (n) => `Below ${n} signals it won't be printed: it will merge into the following edition.`,
    how: 'How the newsroom works',
    steps: [
      ['The drafts', (r, n) => (r.length ? `At ${r.map((m) => `:${String(m).padStart(2, '0')}`).join(' and ')} the reporters draft the ${n} strongest stories, and bring up to date the ones that grew.` : 'The reporters write at the press.')],
      ['The desk', () => 'The rules read every draft; the managing editor reads the first three and every one the rules flag, and sends it back if needed.'],
      ['You', () => 'Approve it, send it back with a note, retouch it, put it in the lead or leave it out.'],
      ['The press', (r, n, p) => `At ${p}: approved pieces go out as they are, the others are brought up to date with the new facts, stories without a draft are written then.`],
    ],
    groups: {
      ready: ['To look at', 'Drafts that crossed the desk, waiting for your word.'],
      writing: ['Being written', 'The reporter is on it.'],
      approved: ['Passed for press', 'They go out as they are.'],
      forming: ['No draft yet', 'Stories forming: the strongest get a draft at the next round, the others are written at the press.'],
      killed: ['Left out', 'They won\'t be in this edition.'],
    },
    empty: 'No drafts yet: the first round is at the time shown above. You can also ask for them now.',
    approve: '✓ Passed for press', unapprove: 'Take back the pass', sendBack: '↩ Send back with a note', retouch: '✎ Retouch', read: 'Read', workings: 'How it was made',
    lead: 'Lead with it', leadOn: 'In the lead', leaveOut: 'Leave it out', putBack: 'Put it back', inPaper: 'in the paper', briefs: 'in briefs',
    signals: (n) => `${n} signal${n === 1 ? '' : 's'}`, version: (n) => `version ${n}`, grew: (n, ok) => `+${n} signal${n === 1 ? '' : 's'} since it was written: ${ok ? 'it goes out as you passed it' : 'at the press it will be brought up to date'}`,
    writingNow: (w) => `${w || 'The reporter'} is writing…`,
    step: {
      queued: 'In line: the press finishes what it is doing first (a drafting round can take a few minutes).',
      reporter: (w) => `${w || 'The reporter'} is writing the new version…`,
      editor: 'The managing editor is reading it…',
      rewrite: (w) => `${w || 'The reporter'} is rewriting it following the managing editor's notes…`,
      reread: 'The managing editor is reading the rewrite…',
      copy: 'The copy desk is checking the figures and the phrasing…',
    },
    applyNotes: '↩ Send it back with these notes', fixYourself: '✎ Fix it yourself', changed: 'What changed', since: (s) => `since ${s}`, notePh: 'Or your note: “open on the rival, not on the time”', send: 'Send back',
    notes: ['Open on the most interesting fact, not on the time', 'No dashboard words: tell what the person did', 'Close on a dry line, no moral', 'Two or three numbers, only those that say something', 'The headline is an idea, not a log entry', 'Shorter: when the facts run out, the piece ends'],
    noteHint: 'The note goes to the reporter as it is; the new version crosses the desk again.',
    kicker: 'Kicker', headline: 'Headline', dek: 'Summary', save: 'Save', cancel: 'Cancel', paraHint: 'A blank line separates paragraphs.',
    stampOk: 'Passed', unverified: 'figures not in the facts',
    edNotes: 'Instructions for this edition only', edNotePh: 'e.g. “more irony on the mail”', add: 'Add',
    words: 'words',
    restart: 'The paper\'s server is older than this page: restart it (npm run service:restart, or stop and run npm start again) to see the edition in the works.',
  },
  it: {
    title: (h) => `Edizione delle ${h}`, works: 'in lavorazione', draftNow: 'Fai scrivere adesso', drafting: 'I cronisti scrivono…', printNow: 'Stampa ora', printing: 'In stampa…',
    round: (m) => `:${String(m).padStart(2, '0')} bozze`, closing: ':55 chiusura', press: (h) => `${h} stampa`, now: 'adesso',
    st: {
      running: 'I cronisti stanno scrivendo le bozze: arrivano sul tavolo una alla volta.',
      next: (t, p, m) => `Prossimo giro di bozze alle ${t}. La stampa alle ${p}, tra ${m} min.`,
      yours: (p, m) => `I giri di bozze sono finiti: il tavolo è suo. La stampa alle ${p}, tra ${m} min.`,
      closing: (m) => `Si chiude: la stampa tra ${m} min.`,
      none: (p) => `Nessun giro di bozze impostato: i pezzi si scrivono alla stampa, alle ${p}.`,
      offline: 'Il modello non risponde: niente bozze durante l\'ora; alla stampa scrive la tipografia.',
    },
    merge: (n) => `Sotto i ${n} segnali non uscirà: confluirà nell'edizione successiva.`,
    how: 'Come lavora la redazione',
    steps: [
      ['Le bozze', (r, n) => (r.length ? `Alle ${r.map((m) => `:${String(m).padStart(2, '0')}`).join(' e alle ')} i cronisti scrivono le ${n} storie più forti, e aggiornano quelle cresciute.` : 'I cronisti scrivono alla stampa.')],
      ['Il tavolo', () => 'Le regole leggono ogni bozza; il caporedattore legge le prime tre e quelle segnalate, e le rimanda indietro se serve.'],
      ['Lei', () => 'Dà il visto, rimanda con una nota, ritocca, mette in apertura o lascia fuori.'],
      ['La stampa', (r, n, p) => `Alle ${p}: i pezzi con il visto escono così, gli altri vengono aggiornati con i fatti nuovi, le storie senza bozza si scrivono in quel momento.`],
    ],
    groups: {
      ready: ['Da vedere', 'Bozze passate dal tavolo, aspettano la sua parola.'],
      writing: ['In scrittura', 'Il cronista ci sta lavorando.'],
      approved: ['Visto, si stampi', 'Escono così come sono.'],
      forming: ['Ancora senza bozza', 'Storie in formazione: le più forti avranno una bozza al prossimo giro, le altre si scrivono alla stampa.'],
      killed: ['Lasciate fuori', 'Non saranno in questa edizione.'],
    },
    empty: 'Ancora nessuna bozza: il primo giro è all\'ora indicata qui sopra. Può anche chiederle subito.',
    approve: '✓ Visto, si stampi', unapprove: 'Togli il visto', sendBack: '↩ Rimanda con una nota', retouch: '✎ Ritocca', read: 'Leggi', workings: 'La lavorazione',
    lead: 'In apertura', leadOn: 'In apertura ✓', leaveOut: 'Lascia fuori', putBack: 'Rimetti', inPaper: 'in pagina', briefs: 'in breve',
    signals: (n) => `${n} segnal${n === 1 ? 'e' : 'i'}`, version: (n) => `versione ${n}`, grew: (n, ok) => `+${n} segnal${n === 1 ? 'e' : 'i'} da quando è stata scritta: ${ok ? 'esce come l\'ha vista lei' : 'alla stampa sarà aggiornata'}`,
    writingNow: (w) => `${w || 'Il cronista'} sta scrivendo…`,
    step: {
      queued: 'In coda: prima la redazione finisce quello che sta facendo (un giro di bozze può durare qualche minuto).',
      reporter: (w) => `${w || 'Il cronista'} scrive la nuova versione…`,
      editor: 'Il caporedattore la sta leggendo…',
      rewrite: (w) => `${w || 'Il cronista'} la riscrive seguendo le note del caporedattore…`,
      reread: 'Il caporedattore rilegge la riscrittura…',
      copy: 'La correttrice controlla cifre e frasi…',
    },
    applyNotes: '↩ Rimanda con queste note', fixYourself: '✎ Correggi tu', changed: 'Cosa è cambiato', since: (s) => `da ${s}`, notePh: 'Oppure la sua nota: «apri sull\'avversario, non sull\'orario»', send: 'Rimanda',
    notes: ['Apri sul fatto più interessante, non sull\'orario', 'Via le parole da cruscotto: racconta cosa ha fatto la persona', 'Chiudi con una riga asciutta, senza morale', 'Due o tre numeri, solo quelli che dicono qualcosa', 'Il titolo è un\'idea, non una voce di registro', 'Più corto: quando i fatti finiscono, finisce il pezzo'],
    noteHint: 'La nota arriva al cronista così com\'è; la nuova versione ripassa dal tavolo.',
    kicker: 'Occhiello', headline: 'Titolo', dek: 'Sommario', save: 'Salva', cancel: 'Annulla', paraHint: 'Una riga vuota separa i paragrafi.',
    stampOk: 'Visto', unverified: 'cifre che nei fatti non ci sono',
    edNotes: 'Indicazioni solo per questa edizione', edNotePh: 'es. «più ironia sulla posta»', add: 'Aggiungi',
    words: 'parole',
    restart: 'Il server del giornale è più vecchio di questa pagina: lo riavvii (npm run service:restart, oppure fermi e rilanci npm start) per vedere l\'edizione in lavorazione.',
  },
});

const mm = (m) => `:${String(m).padStart(2, '0')}`;
const words = (body) => (body || []).join(' ').split(/\s+/).filter(Boolean).length;

/** The hour in the newsroom: the rounds, the closing, the press, and where we are now. */
function HourLine({ v, offline }) {
  const pressAt = hhmm(v.hour + 3600e3);
  const pct = (m) => `${(m / 60) * 100}%`;
  let status;
  if (offline) status = T.st.offline;
  else if (v.running) status = T.st.running;
  else if (!v.rounds.length) status = T.st.none(pressAt);
  else if (v.nextRound) status = T.st.next(hhmm(v.nextRound.at), pressAt, v.minutesLeft);
  else if (v.minute < v.closingMinute) status = T.st.yours(pressAt, v.minutesLeft);
  else status = T.st.closing(v.minutesLeft);
  return (
    <div className="hourline">
      <div className="hl-track" aria-hidden="true">
        <div className="hl-fill" style={{ width: pct(v.minute) }} />
        {v.rounds.map((r) => (
          <span key={r.minute} className={`hl-mark ${r.done ? 'done' : ''}`} style={{ left: pct(r.minute) }}>
            <i />{r.done ? '✓ ' : ''}{T.round(r.minute)}
          </span>
        ))}
        <span className="hl-mark closing" style={{ left: pct(v.closingMinute) }}><i />{T.closing}</span>
        <span className="hl-mark press" style={{ left: '100%' }}><i />{T.press(pressAt)}</span>
        <span className="hl-now" style={{ left: pct(v.minute) }}><b>{T.now}</b></span>
      </div>
      <p className={`hl-status ${v.running ? 'live' : ''}`}>{status}</p>
      {v.willMerge && <p className="hint-small">{T.merge(v.willMerge)}</p>}
    </div>
  );
}

function HowItWorks({ v }) {
  const pressAt = hhmm(v.hour + 3600e3);
  // once read and closed, it stays closed (in this browser)
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('lt-how') !== 'closed'; } catch { return true; } });
  const toggle = (e) => {
    const now = e.currentTarget.open;
    setOpen(now);
    try { localStorage.setItem('lt-how', now ? 'open' : 'closed'); } catch { /* private window */ }
  };
  return (
    <details className="how" open={open} onToggle={toggle}>
      <summary className="lbl">{T.how}</summary>
      <ol className="how-steps">
        {T.steps.map(([name, text], i) => (
          <li key={i}><strong>{name}</strong><span>{text(v.rounds.map((r) => r.minute), v.draftTop, pressAt)}</span></li>
        ))}
      </ol>
    </details>
  );
}

/** A draft on the desk, with the Editor's tools. */
function WorkPiece({ p, act, steer, boosted }) {
  const [panel, setPanel] = useState(null); // 'read' | 'work' | 'note' | 'edit' | 'changes'
  const [note, setNote] = useState('');
  // a new version just arrived (after a note, or new facts): show what changed, without being asked
  const [seen, setSeen] = useState(p.version || 0);
  useEffect(() => {
    if ((p.version || 0) > seen && p.status !== 'writing') {
      setSeen(p.version);
      if (p.prev) setPanel('changes');
    }
  }, [p.version, p.status, p.prev, seen]);
  const [form, setForm] = useState(null);
  const writing = p.status === 'writing';
  const approved = p.status === 'approved';
  const toggle = (k) => setPanel(panel === k ? null : k);
  const grew = (p.signalsNow || 0) - (p.signals || 0);
  const a = p.text ? { ...p.text, chain: p.chain, draft: p.draft } : null;

  async function send(text) {
    const ok = await act(`/workbench/${encodeURIComponent(p.id)}/note`, { method: 'POST', json: { note: text } });
    if (ok) { setNote(''); setPanel(null); }
  }
  function startEdit() {
    setForm({ headline: p.text.headline, dek: p.text.dek || '', body: p.text.body.join('\n\n') });
    setPanel('edit');
  }
  async function saveEdit() {
    const ok = await act(`/workbench/${encodeURIComponent(p.id)}`, { method: 'PATCH', json: { ...form, body: form.body.split(/\n\s*\n/) } });
    if (ok) setPanel(null);
  }

  return (
    <article className={`piece wpiece st-${p.status} ${panel ? 'open' : ''}`}>
      <div className="pc-rank"><span className="pc-n">{p.rank ?? '—'}</span></div>
      <div className="pc-main">
        <div className="pc-top">
          <div className="pc-meta">
            <span className="sec">{p.section}</span>
            {p.text?.byline?.name && <span>{p.text.byline.name}</span>}
            {p.text && <span>{words(p.text.body)} {T.words} · {readingTime(p.text)}</span>}
            <span>{T.signals(p.signalsNow ?? p.signals ?? 0)}</span>
            {p.version > 1 && <span>{T.version(p.version)}</span>}
          </div>
          {approved ? <span className="stamp hand">{T.stampOk}</span> : a && stampOf(a) && <span className={`stamp ${stampOf(a).cls}`}>{stampOf(a).text}</span>}
        </div>

        {writing && (() => {
          const st = T.step[p.step];
          const who = p.text?.byline?.name;
          return <p className="wp-writing">{typeof st === 'function' ? st(who) : st || T.writingNow(who)}{p.since ? <span className="muted"> · {T.since(hhmm(p.since))}</span> : null}</p>;
        })()}
        {p.text ? (
          <button className="pc-title" onClick={() => toggle('read')}>
            <span className="hl-md">{p.text.headline}</span>
            {p.text.dek && <span className="pc-dek">{p.text.dek}</span>}
          </button>
        ) : <p className="pc-dek">{p.topic}</p>}
        {p.check?.unverified?.length > 0 && <p className="pc-warn">⚠ {T.unverified}: {p.check.unverified.slice(0, 4).join(', ')}</p>}
        {grew > 0 && p.text && <p className="pc-note">{T.grew(grew, approved)}</p>}
        {a && <Track a={a} draft />}
        {a && !writing && !approved && (
          <Pending a={a}>
            <div className="wp-main">
              <button className="btn btn-small" onClick={() => send(pendingNotes(a).notes.join('; '))}>{T.applyNotes}</button>
              <button className="btn-ghost" onClick={startEdit}>{T.fixYourself}</button>
            </div>
          </Pending>
        )}

        {p.text && !writing && (
          <div className="pc-tools">
            <div className="wp-main">
              {approved
                ? <button className="btn-ghost" onClick={() => act(`/workbench/${encodeURIComponent(p.id)}/approve`, { method: 'POST', json: { on: false } })}>{T.unapprove}</button>
                : <button className="btn btn-small wp-approve" onClick={() => act(`/workbench/${encodeURIComponent(p.id)}/approve`, { method: 'POST' })}>{T.approve}</button>}
              {!approved && <button className={`btn-ghost ${panel === 'note' ? 'on' : ''}`} onClick={() => toggle('note')}>{T.sendBack}</button>}
              {!approved && <button className={`btn-ghost ${panel === 'edit' ? 'on' : ''}`} onClick={() => (panel === 'edit' ? setPanel(null) : startEdit())}>{T.retouch}</button>}
            </div>
            <div className="pc-acts">
              <div className="pc-views" role="tablist">
                <button role="tab" aria-selected={panel === 'read'} className={panel === 'read' ? 'on' : ''} onClick={() => toggle('read')}>{T.read}</button>
                <button role="tab" aria-selected={panel === 'work'} className={panel === 'work' ? 'on' : ''} onClick={() => toggle('work')}>{T.workings}</button>
                {p.prev && <button role="tab" aria-selected={panel === 'changes'} className={panel === 'changes' ? 'on' : ''} onClick={() => toggle('changes')}>{T.changed}</button>}
              </div>
              <button className={`btn-link-ink ${boosted ? 'on' : ''}`} onClick={() => steer({ op: boosted ? 'unboost' : 'boost', story: p.id })}>{boosted ? T.leadOn : T.lead}</button>
              <button className="btn-link-ink danger" onClick={() => act(`/workbench/${encodeURIComponent(p.id)}/kill`, { method: 'POST' })}>{T.leaveOut}</button>
            </div>
          </div>
        )}

        {panel === 'note' && (
          <div className="rewrite">
            <div className="chips">{T.notes.map((n) => <button key={n} className="chip" onClick={() => send(n)}>{n}</button>)}</div>
            <div className="rewrite-row">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.notePh} onKeyDown={(e) => e.key === 'Enter' && note.trim() && send(note.trim())} />
              <button className="btn btn-small" disabled={!note.trim()} onClick={() => send(note.trim())}>{T.send}</button>
            </div>
            <p className="hint-small">{T.noteHint}</p>
          </div>
        )}
        {panel === 'edit' && form && (
          <div className="draft-form pc-panel">
            <input className="f-head" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder={T.headline} />
            <input value={form.dek} onChange={(e) => setForm({ ...form, dek: e.target.value })} placeholder={T.dek} />
            <textarea rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <p className="hint-small">{T.paraHint}</p>
            <div className="draft-actions">
              <button className="btn btn-small" onClick={saveEdit}>{T.save}</button>
              <button className="btn-ghost" onClick={() => setPanel(null)}>{T.cancel}</button>
            </div>
          </div>
        )}
        {panel === 'read' && p.text && <div className="pc-panel draft-text">{p.text.body.map((x, i) => <p key={i}>{x}</p>)}</div>}
        {panel === 'work' && a && <div className="pc-panel"><Workings a={a} /></div>}
        {panel === 'changes' && p.prev && p.text && <div className="pc-panel"><Changes from={p.prev.text} to={p.text} why={p.prev.why} /></div>}
      </div>
    </article>
  );
}

function Group({ id, n, children }) {
  if (!n) return null;
  const [title, hint] = T.groups[id];
  return (
    <section className={`nx-group g-${id}`}>
      <header><h3>{title} <span className="mt-n">{n}</span></h3><p>{hint}</p></header>
      {children}
    </section>
  );
}

/** The next edition's desk. */
export default function NextDesk({ setError, offline, onPrinted }) {
  const [v, setV] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [edNote, setEdNote] = useState('');

  const load = useCallback(() => api('/workbench').then((x) => { setV(x); setMissing(false); }).catch(() => setMissing(true)), []);
  const active = !!v && (v.running || v.pieces.some((p) => p.status === 'writing'));
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, active ? 5e3 : 30e3);
    return () => clearInterval(t);
  }, [load, active]);

  const act = useCallback(async (path, opts = { method: 'POST' }) => {
    setError?.(null);
    try { setV(await api(path, opts)); return true; } catch (e) { setError?.(e.message); return false; }
  }, [setError]);
  const steer = async (body) => {
    setError?.(null);
    try { await api('/next/steer', { method: 'POST', json: body }); await load(); } catch (e) { setError?.(e.message); }
  };
  async function printNow() {
    setBusy('print');
    setError?.(null);
    try {
      const ed = await api('/print', { method: 'POST' });
      if (ed) { onPrinted?.(ed); location.hash = href.desk(ed.id); }
    } catch (e) {
      setError?.(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!v) return missing ? <p className="notice">{T.restart}</p> : null;
  const by = (st) => v.pieces.filter((p) => p.status === st);
  const boosted = new Set(v.steer.boost);
  const piece = (p) => <WorkPiece key={p.id} p={p} act={act} steer={steer} boosted={boosted.has(p.id)} />;
  // a draft being rewritten stays where it is, with its progress: only new drafts are "being written"
  const ready = v.pieces.filter((p) => p.status === 'ready' || (p.status === 'writing' && p.text));
  const writing = v.pieces.filter((p) => p.status === 'writing' && !p.text);
  const approved = by('approved');

  return (
    <div className="nx">
      <div className="desk-bar nx-bar">
        <div>
          <span className="status works">{T.works}</span>
          <strong>{T.title(hhmm(v.hour))}</strong>
        </div>
        <div className="desk-bar-actions">
          <button className="btn btn-small" disabled={!!v.running || offline} onClick={() => act('/workbench/round')}>{v.running ? T.drafting : T.draftNow}</button>
          <button className="btn-ghost" disabled={!!busy} onClick={printNow}>{busy === 'print' ? T.printing : T.printNow}</button>
        </div>
      </div>

      <HourLine v={v} offline={offline} />
      <HowItWorks v={v} />

      {!v.pieces.length && <p className="empty-text nx-empty">{T.empty}</p>}

      <Group id="ready" n={ready.length}><div className="pieces">{ready.map(piece)}</div></Group>
      <Group id="writing" n={writing.length}><div className="pieces">{writing.map(piece)}</div></Group>
      <Group id="approved" n={approved.length}><div className="pieces">{approved.map(piece)}</div></Group>

      <Group id="forming" n={v.forming.length}>
        <ul className="forming">
          {v.forming.map((s) => (
            <li key={s.id}>
              <span className="f-rank">{s.rank}</span>
              <span className="f-main"><span className="sec">{s.section}</span> {s.topic}</span>
              <span className="f-n">{T.signals(s.signals)} · {s.inPaper ? T.inPaper : T.briefs}</span>
              <span className="f-acts">
                <button className={`btn-link-ink ${boosted.has(s.id) ? 'on' : ''}`} onClick={() => steer({ op: boosted.has(s.id) ? 'unboost' : 'boost', story: s.id })}>{boosted.has(s.id) ? T.leadOn : T.lead}</button>
                <button className="btn-link-ink danger" onClick={() => steer({ op: 'bury', story: s.id })}>{T.leaveOut}</button>
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group id="killed" n={v.buried.length}>
        <ul className="forming">
          {v.buried.map((s) => (
            <li key={s.id} className="out">
              <span className="f-main"><span className="sec">{s.section}</span> {s.topic}</span>
              <span className="f-acts">
                <button className="btn-link-ink" onClick={() => (v.pieces.some((p) => p.id === s.id)
                  ? act(`/workbench/${encodeURIComponent(s.id)}/kill`, { method: 'POST', json: { on: false } })
                  : steer({ op: 'unbury', story: s.id }))}>{T.putBack}</button>
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <section className="nx-group">
        <header><h3>{T.edNotes}</h3></header>
        {v.steer.notes.length > 0 && (
          <ul className="ed-notes">
            {v.steer.notes.map((n, i) => <li key={i}>{quote(n)} <button className="btn-link" onClick={() => steer({ op: 'unnote', index: i })}>✕</button></li>)}
          </ul>
        )}
        <form className="rewrite-row" onSubmit={(e) => { e.preventDefault(); if (edNote.trim()) { steer({ op: 'note', text: edNote.trim() }); setEdNote(''); } }}>
          <input value={edNote} onChange={(e) => setEdNote(e.target.value)} placeholder={T.edNotePh} />
          <button className="btn btn-small" disabled={!edNote.trim()}>{T.add}</button>
        </form>
      </section>
    </div>
  );
}
