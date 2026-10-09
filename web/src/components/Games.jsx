import React, { useEffect, useState } from 'react';
import { api, hhmm, href, fmtVote, shortDate } from '../lib.js';
import { tr, quote } from '../i18n.js';
import { useLive, Call, refreshLive } from './Live.jsx';

const T = tr({
  en: {
    sport: 'Sport', cards: 'Report cards', records: 'Records', recordBook: 'The record book', games: 'The games', prev: 'previous best',
    oracle: 'The Oracle', yes: 'I believe it', no: 'Not a chance', bets: 'Bets close at', you: 'You', oracleWord: 'Oracle',
    rightWrong: (h, t) => `${h} out of ${t}`, last: 'The last ones', noBets: 'Bet against the Oracle: who reads the hour better?',
    serial: 'The serial', episode: (n) => `Episode ${n}`, readOn: 'Read the episode', chooses: 'How does it go on? You choose.',
    allEpisodes: 'All the episodes', road: 'The readers chose', chance: 'Nobody voted: chance chose', serialEmpty: 'The serial starts with the next edition (it needs the writer).',
    rumours: 'Word is', sourceClose: 'from the tip box', streak: (n) => (n > 0 ? `${n} right in a row` : n < 0 ? `${-n} wrong in a row` : ''),
    noRecords: 'No records yet: the paper needs half a day of history to compare against.', season: (s) => `season ${s}`,
  },
  it: {
    sport: 'Sport', cards: 'Le pagelle', records: 'Primati', recordBook: 'L\'albo dei primati', games: 'Le partite', prev: 'primato precedente',
    oracle: 'L\'Oracolo', yes: 'Ci credo', no: 'Non ci credo', bets: 'Scommesse chiuse alle', you: 'Lei', oracleWord: 'Oracolo',
    rightWrong: (h, t) => `${h} su ${t}`, last: 'Le ultime', noBets: 'Scommetta contro l\'Oracolo: chi legge meglio l\'ora?',
    serial: 'Il feuilleton', episode: (n) => `Puntata ${n}`, readOn: 'Leggi la puntata', chooses: 'Come continua? Decide lei.',
    allEpisodes: 'Tutte le puntate', road: 'I lettori hanno scelto', chance: 'Nessuno ha votato: ha scelto il caso', serialEmpty: 'Il feuilleton comincia con la prossima edizione (serve il redattore).',
    rumours: 'Si dice che', sourceClose: 'dalla cassetta delle soffiate', streak: (n) => (n > 0 ? `${n} giuste di fila` : n < 0 ? `${-n} sbagliate di fila` : ''),
    noRecords: 'Ancora nessun primato: al giornale serve mezza giornata di storia con cui confrontarsi.', season: (s) => `stagione ${s}`,
  },
});

const voteClass = (v) => (v >= 7 ? 'v-good' : v >= 6 ? 'v-ok' : 'v-bad');

/** The sports page in the rail: report cards, records, games. */
export function SportBox({ sport }) {
  if (!sport || (!sport.cards?.length && !sport.records?.length && !sport.matches?.length)) return null;
  return (
    <section className="box sport-box">
      <h3 className="box-title">{T.sport} · {T.cards}</h3>
      {sport.records?.length > 0 && (
        <ul className="records">
          {sport.records.map((r) => (
            <li key={r.key}><span className="rec-tag">{tr({ en: 'Record', it: 'Primato' })}</span> {r.label}: <strong>{r.value}</strong> <span className="muted">({T.prev} {r.prev})</span></li>
          ))}
        </ul>
      )}
      <ol className="cards">
        {(sport.cards || []).map((c) => (
          <li key={c.id}>
            <span className={`vote ${voteClass(c.vote)}`}>{fmtVote(c.vote)}</span>
            <span className="card-name">{c.name}</span>
            <span className="card-line">{c.line}</span>
          </li>
        ))}
      </ol>
      {sport.matches?.length > 0 && (
        <>
          <h4 className="lbl sport-sub">{T.games}</h4>
          <ul className="matches">
            {sport.matches.map((m, i) => <li key={i}><time>{hhmm(m.at)}</time> {m.a} <em>–</em> {m.b}</li>)}
          </ul>
        </>
      )}
      <a className="more" href={href.sport()}>{T.recordBook} →</a>
    </section>
  );
}

/** The Oracle: the predictions of this edition, the Editor's bets, the scores. */
export function OracleBox({ oracle }) {
  const [board, setBoard] = useState(null);
  useEffect(() => { api('/oracle').then(setBoard).catch(() => {}); }, [oracle]);
  if (!oracle) return null;
  const bets = new Map((board?.pending || []).map((p) => [p.id, p]));
  const score = board?.score || oracle.score;
  async function place(id, yes) {
    try { setBoard({ ...(board || {}), ...(await api('/oracle/bet', { method: 'POST', json: { id, yes } })) }); } catch { /* closed */ }
  }
  return (
    <section className="box oracle-box">
      <h3 className="box-title">{T.oracle}</h3>
      {oracle.results?.length > 0 && (
        <ul className="oracle-results">
          {oracle.results.map((r) => (
            <li key={r.id} className={r.ok ? 'ok' : 'ko'}>
              <span className="mark">{r.ok ? '✓' : '✗'}</span> {r.text}
              {r.me != null && <span className={`me ${r.me ? 'ok' : 'ko'}`}> · {T.you} {r.me ? '✓' : '✗'}</span>}
            </li>
          ))}
        </ul>
      )}
      <ul className="oracle-preds">
        {oracle.predictions.map((p) => {
          const live = bets.get(p.id);
          const open = live && Date.now() < (live.closes || p.closes || p.due);
          return (
            <li key={p.id}>
              <p className="pred">{p.text}</p>
              {open ? (
                <div className="bet">
                  <button className={`chip ${live.bet === true ? 'on' : ''}`} onClick={() => place(p.id, true)}>{T.yes}</button>
                  <button className={`chip ${live.bet === false ? 'on' : ''}`} onClick={() => place(p.id, false)}>{T.no}</button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {score?.total > 0 ? (
        <p className="oracle-score">
          <span>{T.oracleWord} <strong>{score.pct}%</strong> ({T.rightWrong(score.hits, score.total)})</span>
          {score.me.total > 0 && <span> · {T.you} <strong>{score.me.pct}%</strong> ({T.rightWrong(score.me.hits, score.me.total)})</span>}
          {score.streak ? <span className="muted"> · {T.streak(score.streak)}</span> : null}
        </p>
      ) : <p className="hint-small">{T.noBets}</p>}
    </section>
  );
}

/** The serial's episode on the front page, with the fork to vote on. */
export function SerialBox({ serial }) {
  const { calls } = useLive();
  if (!serial) return null;
  const fork = calls.find((c) => c.type === 'serial');
  return (
    <section className="box serial-box">
      <h3 className="box-title">{T.serial}</h3>
      <p className="serial-title">{serial.serialTitle}</p>
      <a className="serial-ep" href={href.serial(serial.id)}>{T.episode(serial.n)} · <em>{serial.title}</em></a>
      <p className="serial-teaser">{serial.teaser}</p>
      {fork ? <Call call={fork} /> : <a className="more" href={href.serial(serial.id)}>{T.readOn} →</a>}
    </section>
  );
}

/** "Word is": the tips that didn't match a story. */
export function RumoursBox({ rumours }) {
  if (!rumours?.length) return null;
  return (
    <section className="box rumours-box">
      <h3 className="box-title">{T.rumours}</h3>
      <ul>{rumours.slice(0, 3).map((r) => <li key={r.id}>{r.line}</li>)}</ul>
      <p className="hint-small">{T.sourceClose}</p>
    </section>
  );
}

/** #/serial: every episode, newest first. */
export function SerialPage({ id }) {
  const [list, setList] = useState(null);
  const { calls } = useLive();
  useEffect(() => { api('/serial').then(setList).catch(() => setList([])); }, []);
  useEffect(() => {
    if (!list || !id) return;
    document.getElementById(`ep-${id}`)?.scrollIntoView({ block: 'start' });
  }, [list, id]);
  if (!list) return null;
  const fork = calls.find((c) => c.type === 'serial');
  return (
    <div className="serial-page">
      <header className="serial-head">
        <span className="lbl">{T.serial}</span>
        <h1 className="hl-story">{list[0]?.serialTitle || T.serial}</h1>
        {list[0] && <p className="dek">{T.season(list[0].season)} · {T.episode(list[0].n)}</p>}
      </header>
      {fork && <Call call={fork} big />}
      {!list.length && <p className="empty-text">{T.serialEmpty}</p>}
      {list.map((e) => (
        <article key={e.id} id={`ep-${e.id}`} className="episode">
          <div className="episode-n">{T.episode(e.n)} <span className="muted">· {shortDate(e.ts)}, {hhmm(e.ts)}</span></div>
          <h2 className="hl-lg">{e.title}</h2>
          {e.road && <p className="episode-road">{e.road.byChance ? T.chance : T.road}: {quote(e.road.text)}</p>}
          <div className="story-body">{e.paragraphs.map((p, i) => <p key={i} className={i === 0 ? 'dropcap' : ''}>{p}</p>)}</div>
          <p className="episode-fork"><span>A · {e.choices[0]}</span><span>B · {e.choices[1]}</span></p>
        </article>
      ))}
    </div>
  );
}

/** #/sport: the record book. */
export function SportPage() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/records').then(setList).catch(() => setList([])); refreshLive(); }, []);
  if (!list) return null;
  return (
    <div className="sport-page">
      <header className="serial-head">
        <span className="lbl">{T.sport}</span>
        <h1 className="hl-story">{T.recordBook}</h1>
      </header>
      {list.length ? (
        <table className="record-table">
          <tbody>
            {list.map((r) => (
              <tr key={r.key}>
                <th>{r.label}</th>
                <td className="rec-v">{r.value}</td>
                <td className="muted">{r.editionId ? <a href={href.edition(r.editionId)}>{shortDate(r.at)}, {hhmm(r.at)}</a> : `${shortDate(r.at)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty-text">{T.noRecords}</p>}
    </div>
  );
}
