import React, { useCallback, useEffect, useState } from 'react';
import { api, href, hhmm, shortDate, longDate, dayKey, SECTIONS, writerLabel } from '../lib.js';
import { tr, quote } from '../i18n.js';

/*
 * Spotlight: the paper's investigations desk. Its scoops have one look everywhere (the black
 * band); its leads are on a board in the newsroom, with how far along each one is.
 */

const T = tr({
  en: {
    exclusive: 'Exclusive', read: 'Read the investigation', by: 'By', desk: 'the Spotlight team',
    exhibits: (n) => `${n} exhibit${n === 1 ? '' : 's'}`, days: (n) => `${n} day${n === 1 ? '' : 's'} of investigation`, min: (n) => `${n} min read`,
    today: 'Spotlight · today\'s exclusive', all: 'All of Spotlight',
    title: 'Spotlight', sub: 'The investigations desk. It publishes rarely: only when a lead, followed for days, holds up.',
    none: 'No scoop yet. The reporters are working on it.', working: (n) => `${n} lead${n === 1 ? '' : 's'} under investigation`, toDesk: 'See them in the newsroom',
    takeaways: 'What you may not know', questions: 'Questions worth asking', how: 'How we know', file: 'The file', reply: 'The owner\'s reply',
    noReply: 'The owner did not respond to a request for comment.', back: '← All of Spotlight',
    from: (a, b) => `Exhibits from ${a} to ${b}`, opened: (d) => `lead opened ${d}`, detector: 'Found by', unverified: 'figures not in the file',
    // the board
    board: 'The Spotlight board', boardSub: 'Leads the reporters are following. A scoop comes out only when one holds up.',
    lastRun: (t) => `Last look at the signals: ${t}`, never: 'The desk hasn\'t looked yet.',
    empty: 'No leads at the moment. Every hour the detectors look at the last three weeks; they need a few days of history to tell what is unusual.',
    off: 'Spotlight is off (config.json → "spotlight": { "enabled": false }).',
    nose: 'Strength', goal: 'goal', lastEx: (t) => `latest exhibit ${t}`,
    status: { open: 'Under investigation', review: 'On the editor\'s desk', reply: 'Waiting for your comment', writing: 'Being written', published: 'Published', cold: 'Gone cold', killed: 'Stopped' },
    who: { desk: 'Desk', reporters: 'Reporters', editor: 'Editor', owner: 'You', chief: 'Editor-in-chief' },
    push: 'Ask for a decision', kill: 'Stop it', sure: 'Sure?', details: 'File and log', hide: 'Hide',
    replyAsk: 'Spotlight is about to publish. You have the right of reply: your words will be quoted verbatim.',
    replyLeft: (m) => (m > 0 ? `${m} min left` : 'time is up: going to press'), replyPh: 'Your comment (optional)…',
    send: 'Send the reply', noComment: 'No comment: print it', block: 'Don\'t publish',
    angle: 'The angle', readScoop: 'Read the scoop', facts: 'The numbers', ago: (m) => (m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`),
    counts: (c) => `${c.open + c.review} open · ${c.reply} waiting for you · ${c.published} published`,
  },
  it: {
    exclusive: 'Esclusiva', read: 'Leggi l\'inchiesta', by: 'Di', desk: 'la squadra Spotlight',
    exhibits: (n) => `${n} ${n === 1 ? 'reperto' : 'reperti'}`, days: (n) => `${n} ${n === 1 ? 'giorno' : 'giorni'} di indagine`, min: (n) => `${n} min di lettura`,
    today: 'Spotlight · l\'esclusiva di oggi', all: 'Tutto Spotlight',
    title: 'Spotlight', sub: 'La squadra d\'inchiesta. Pubblica di rado: solo quando una pista, seguita per giorni, regge.',
    none: 'Ancora nessuna esclusiva. I cronisti ci stanno lavorando.', working: (n) => `${n} ${n === 1 ? 'pista' : 'piste'} in indagine`, toDesk: 'Guardale in redazione',
    takeaways: 'Cosa forse non sapevi', questions: 'Le domande da farsi', how: 'Come lo sappiamo', file: 'Il fascicolo', reply: 'La replica del proprietario',
    noReply: 'Il proprietario non ha risposto alla richiesta di commento.', back: '← Tutto Spotlight',
    from: (a, b) => `Reperti dal ${a} al ${b}`, opened: (d) => `pista aperta ${d}`, detector: 'Trovata da', unverified: 'cifre non presenti nel fascicolo',
    board: 'La lavagna di Spotlight', boardSub: 'Le piste che i cronisti stanno seguendo. Un\'esclusiva esce solo quando una regge.',
    lastRun: (t) => `Ultimo sguardo ai segnali: ${t}`, never: 'La squadra non ha ancora guardato.',
    empty: 'Nessuna pista al momento. Ogni ora i rilevatori guardano le ultime tre settimane; servono qualche giorno di storia per capire cosa è insolito.',
    off: 'Spotlight è spento (config.json → "spotlight": { "enabled": false }).',
    nose: 'Fiuto', goal: 'obiettivo', lastEx: (t) => `ultimo reperto ${t}`,
    status: { open: 'In indagine', review: 'Sul tavolo del caporedattore', reply: 'Aspetta un tuo commento', writing: 'In scrittura', published: 'Pubblicata', cold: 'Raffreddata', killed: 'Fermata' },
    who: { desk: 'Redazione', reporters: 'Cronisti', editor: 'Caporedattore', owner: 'Tu', chief: 'Direttore' },
    push: 'Chiedi una decisione', kill: 'Ferma', sure: 'Sicuro?', details: 'Fascicolo e diario', hide: 'Chiudi',
    replyAsk: 'Spotlight sta per pubblicare. Hai diritto di replica: le tue parole saranno citate alla lettera.',
    replyLeft: (m) => (m > 0 ? `mancano ${m} min` : 'tempo scaduto: si va in stampa'), replyPh: 'Il tuo commento (facoltativo)…',
    send: 'Invia la replica', noComment: 'Nessun commento: stampate', block: 'Non pubblicare',
    angle: 'L\'angolo', readScoop: 'Leggi l\'esclusiva', facts: 'I numeri', ago: (m) => (m < 1 ? 'adesso' : m < 60 ? `${m} min fa` : m < 1440 ? `${Math.round(m / 60)} h fa` : `${Math.round(m / 1440)} giorni fa`),
    counts: (c) => `${c.open + c.review} aperte · ${c.reply} aspettano te · ${c.published} pubblicate`,
  },
});

const readMin = (words) => Math.max(1, Math.round((words || 0) / tr({ en: 230, it: 200 })));
const secName = (id) => SECTIONS.find((s) => s.id === id)?.name || id;
const minsAgo = (ts) => Math.max(0, Math.round((Date.now() - ts) / 60e3));

function Meta({ s }) {
  return (
    <div className="spot-meta">
      {T.by} <strong>{s.byline?.name || T.desk}</strong>
      <span> · {T.exhibits(s.exhibits)}</span>
      <span> · {T.days(s.days)}</span>
      <span> · {T.min(readMin(s.words))}</span>
    </div>
  );
}

/** The front-page band: the same look every time a scoop comes out. */
export function SpotlightBand({ scoop }) {
  if (!scoop) return null;
  return (
    <section className="spot-band" aria-label="Spotlight">
      <div className="spot-flag">
        <span className="spot-mark">Spotlight</span>
        <span className="spot-excl">{T.exclusive}</span>
      </div>
      <div className="spot-main">
        <h2 className="spot-hl"><a href={href.spotlight(scoop.id)}>{scoop.headline}</a></h2>
        {scoop.dek && <p className="spot-dek">{scoop.dek}</p>}
        <Meta s={scoop} />
      </div>
      <a className="spot-cta" href={href.spotlight(scoop.id)}>{T.read} →</a>
    </section>
  );
}

/** In the rail of the day's other editions: the scoop that came out earlier today. */
export function SpotlightBox({ edition }) {
  const [s, setS] = useState(null);
  const end = edition?.end;
  const shownId = edition?.spotlight?.id;
  useEffect(() => {
    if (!end) return;
    const dayStart = new Date(end - 1); dayStart.setHours(0, 0, 0, 0);
    api(`/spotlight?before=${end + 3600e3}&after=${dayStart.getTime()}&limit=1`).then((l) => setS(l[0] || null)).catch(() => setS(null));
  }, [end]);
  if (!s || s.id === shownId) return null;
  return (
    <section className="box spot-box">
      <h3 className="box-title">{T.today}</h3>
      <a href={href.spotlight(s.id)} className="spot-box-hl">{s.headline}</a>
      <p className="spot-box-meta">{T.exhibits(s.exhibits)} · {T.days(s.days)}</p>
      <a className="more" href={href.spotlight(s.id)}>{T.read} →</a>
    </section>
  );
}

/** All the scoops, newest first. */
export function SpotlightList() {
  const [list, setList] = useState(null);
  const [desk, setDesk] = useState(null);
  useEffect(() => {
    api('/spotlight?limit=60').then(setList).catch(() => setList([]));
    api('/spotlight/desk').then(setDesk).catch(() => {});
  }, []);
  if (!list) return null;
  const working = desk ? desk.counts.open + desk.counts.review + desk.counts.reply + desk.counts.writing : 0;
  return (
    <div className="spot-list">
      <header className="spot-list-head">
        <span className="spot-mark">Spotlight</span>
        <p>{T.sub}</p>
        {working > 0 && <p className="spot-working"><span className="spot-dot" />{T.working(working)} · <a href={href.spotlightDesk()}>{T.toDesk} →</a></p>}
      </header>
      {list.length === 0 ? <p className="notice">{T.none}</p> : list.map((s, i) => (
        i === 0 ? <SpotlightBand key={s.id} scoop={s} /> : (
          <article key={s.id} className="spot-item">
            <div className="spot-item-date">{shortDate(s.publishedAt)}</div>
            <div>
              <h2 className="hl-md"><a href={href.spotlight(s.id)}>{s.headline}</a></h2>
              {s.dek && <p className="dek dek-sm">{s.dek}</p>}
              <Meta s={s} />
            </div>
          </article>
        )
      ))}
    </div>
  );
}

/** A scoop, in full: the piece, the takeaways, the reply, the method and the file of exhibits. */
export function SpotlightPage({ id }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api(`/spotlight/${id}`).then(setS).catch((e) => setError(e.message)); }, [id]);
  if (error) return <p className="notice">{error}</p>;
  if (!s) return null;
  const words = s.words;
  return (
    <div className="spot-page">
      <div className="story-top"><a className="back" href={href.spotlight()}>{T.back}</a></div>
      <header className="spot-head">
        <div className="spot-flag">
          <span className="spot-mark">Spotlight</span>
          <span className="spot-excl">{T.exclusive}</span>
          {s.kicker && s.kicker.toLowerCase() !== 'spotlight' && <span className="spot-kicker">{s.kicker}</span>}
        </div>
        <h1 className="spot-title">{s.headline}</h1>
        {s.dek && <p className="spot-dek">{s.dek}</p>}
        <div className="spot-meta">
          {T.by} <strong>{s.byline?.name || T.desk}</strong>{s.byline && <span>, {s.byline.role}</span>}
          <span> · {writerLabel(s.writer)}</span>
          <span> · {longDate(s.publishedAt)}, {hhmm(s.publishedAt)}</span>
          <span> · {T.min(readMin(words))}</span>
        </div>
      </header>

      <div className="spot-grid">
        <article className="spot-body">
          {s.sections.map((x, i) => (
            <section key={i}>
              {x.heading && <h2 className="spot-h">{x.heading}</h2>}
              {x.paragraphs.map((p, k) => <p key={k} className={i === 0 && k === 0 && p.length > 160 ? 'dropcap' : ''}>{p}</p>)}
            </section>
          ))}
          <blockquote className={`spot-reply ${s.reply ? '' : 'none'}`}>
            <span className="lbl">{T.reply}</span>
            {s.reply ? <p>{quote(s.reply.text)}</p> : <p>{T.noReply}</p>}
          </blockquote>
        </article>

        <aside className="spot-rail">
          {s.takeaways?.length > 0 && (
            <section className="spot-take">
              <span className="lbl">{T.takeaways}</span>
              <ol>{s.takeaways.map((t, i) => <li key={i}>{t}</li>)}</ol>
            </section>
          )}
          {s.questions?.length > 0 && (
            <section className="spot-q">
              <span className="lbl">{T.questions}</span>
              <ul>{s.questions.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </section>
          )}
          <section className="spot-how">
            <span className="lbl">{T.how}</span>
            <p>{T.from(shortDate(s.method.from), shortDate(s.method.to))}; {T.opened(shortDate(s.method.openedAt))}.</p>
            <ul>{s.method.bySource.map((b) => <li key={b.source}><span>{secName(b.source)}</span><strong>{b.n}</strong></li>)}</ul>
            {s.check?.unverified?.length > 0 && <p className="spot-warn">⚠ {T.unverified}: {s.check.unverified.join(', ')}</p>}
          </section>
        </aside>
      </div>

      <section className="spot-file">
        <h2 className="spot-h">{T.file}</h2>
        <ol className="spot-exhibits">
          {s.exhibits.map((x, i) => (
            <li key={x.id || i}>
              <span className="spot-ex-n">{i + 1}</span>
              <span className="spot-ex-when">{shortDate(x.ts)} · {hhmm(x.ts)}</span>
              <span className="spot-ex-src">{secName(x.source)}{x.host ? ` · ${x.host}` : ''}</span>
              <span className="spot-ex-title">{x.title}</span>
            </li>
          ))}
        </ol>
        {s.facts?.length > 0 && (
          <>
            <h3 className="spot-h3">{T.facts}</h3>
            <ul className="spot-facts">{s.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </>
        )}
      </section>
    </div>
  );
}

function Lead({ l, onAct }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (action, extra = {}) => {
    if (action === 'kill' && !armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    setBusy(true);
    try { await onAct(l.id, { action, ...extra }); } finally { setBusy(false); setArmed(false); }
  };
  const last = l.log.at(-1);
  const active = ['open', 'review', 'reply', 'writing'].includes(l.status);
  const left = l.reply?.deadline ? Math.max(0, Math.ceil((l.reply.deadline - Date.now()) / 60e3)) : 0;
  return (
    <article className={`lead-card st-${l.status}`}>
      <div className="lead-top">
        <span className="lead-kind">{l.kindName}</span>
        <span className={`lead-st st-${l.status}`}>{(l.status === 'review' || l.status === 'writing') && <span className="spot-dot" />}{T.status[l.status]}</span>
      </div>
      <h4 className="lead-subject">{l.subject}</h4>
      <p className="lead-hyp">{l.hypothesis}</p>
      {active && (
        <div className="lead-bar" title={`${T.nose} ${l.score}/${l.goal}`}>
          <span style={{ width: `${Math.round(l.progress * 100)}%` }} />
          <em>{T.nose} {l.score} · {T.goal} {l.goal}</em>
        </div>
      )}
      <p className="lead-meta">
        {T.exhibits(l.exhibits)} · {l.days} {tr({ en: l.days === 1 ? 'day' : 'days', it: l.days === 1 ? 'giorno' : 'giorni' })} · {l.sources.map(secName).join(', ')}
        {l.lastEvidenceAt ? ` · ${T.lastEx(T.ago(minsAgo(l.lastEvidenceAt)))}` : ''}
      </p>
      {last && <p className="lead-last"><strong>{T.who[last.who] || last.who}:</strong> {last.text}</p>}

      {l.status === 'reply' && (
        <div className="lead-reply">
          <p>{T.replyAsk} <strong>{T.replyLeft(left)}</strong></p>
          {l.desk?.angle && <p className="lead-angle"><span className="lbl">{T.angle}</span> {l.desk.angle}</p>}
          <textarea rows={3} value={text} placeholder={T.replyPh} onChange={(e) => setText(e.target.value)} />
          <div className="lead-actions">
            <button className="btn btn-small" disabled={busy || !text.trim()} onClick={() => act('reply', { text })}>{T.send}</button>
            <button className="btn-ghost btn-small" disabled={busy} onClick={() => act('publish')}>{T.noComment}</button>
            <button className={`btn-ghost btn-small danger ${armed ? 'on' : ''}`} disabled={busy} onClick={() => act('kill')}>{armed ? T.sure : T.block}</button>
          </div>
        </div>
      )}
      <div className="lead-actions">
        {l.status === 'open' && <button className="btn-ghost btn-small" disabled={busy} onClick={() => act('push')}>{T.push}</button>}
        {l.status === 'open' && <button className={`btn-ghost btn-small danger ${armed ? 'on' : ''}`} disabled={busy} onClick={() => act('kill')}>{armed ? T.sure : T.kill}</button>}
        {l.scoopId && <a className="btn-ghost btn-small" href={href.spotlight(l.scoopId)}>{T.readScoop} →</a>}
        <button className="btn-link" onClick={() => setOpen((o) => !o)}>{open ? T.hide : T.details}</button>
      </div>
      {open && (
        <div className="lead-file">
          <ul className="lead-facts">{l.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
          <ol className="lead-ex">
            {l.evidence.map((x) => <li key={x.id}><span>{shortDate(x.ts)} {hhmm(x.ts)} · {secName(x.source)}</span> {x.title}</li>)}
          </ol>
          <ul className="lead-log">
            {[...l.log].reverse().map((e, i) => <li key={i}><span>{T.ago(minsAgo(e.ts))} · {T.who[e.who] || e.who}</span> {e.text}</li>)}
          </ul>
        </div>
      )}
    </article>
  );
}

/** The newsroom's Spotlight panel: the board of leads, refreshed while it is open. */
export function SpotlightDesk({ setError }) {
  const [b, setB] = useState(null);
  const load = useCallback(() => api('/spotlight/desk').then(setB).catch((e) => setError?.(e.message)), [setError]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);
  if (!b) return <div className="spot-desk" />;
  async function onAct(id, body) {
    try { setB(await api(`/spotlight/leads/${encodeURIComponent(id)}`, { method: 'POST', json: body })); } catch (e) { setError?.(e.message); }
    setTimeout(load, 3000);
  }
  return (
    <div className="spot-desk">
      <div className="spot-desk-head">
        <span className="spot-mark small">Spotlight</span>
        <p className="hint-small">{T.boardSub}</p>
        {!b.enabled && <p className="notice">{T.off}</p>}
        <p className="spot-desk-counts">{T.counts(b.counts)}</p>
        <p className="hint-small">{b.run ? T.lastRun(`${shortDate(b.run.at)} ${hhmm(b.run.at)}`) : T.never}</p>
      </div>
      {b.leads.length === 0 ? <p className="hint-small">{T.empty}</p> : b.leads.map((l) => <Lead key={l.id} l={l} onAct={onAct} />)}
      <a className="more" href={href.spotlight()}>{T.all} →</a>
    </div>
  );
}

export const spotlightDayOf = (s) => dayKey(s.publishedAt);
