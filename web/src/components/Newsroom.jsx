import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, href, hhmm, dayKey, longDate, SECTIONS, writerLabel, edHour, edSince, readingTime, styleName } from '../lib.js';
import Meeting from './Meeting.jsx';
import DeskCartoon from './DeskCartoon.jsx';
import FactCheck from './FactCheck.jsx';
import NextDesk from './NextDesk.jsx';
import { tr, quote } from '../i18n.js';
import { Track, Workings, TableSummary, stampOf } from './Proof.jsx';
import { SpotlightDesk } from './Spotlight.jsx';
import { Paragraphs, HeadlinePicker } from './Bench.jsx';
import { ChatterFeed } from './Live.jsx';
import NewsroomNav from './NewsroomNav.jsx';

const T = tr({
  en: {
    quick: ['Shorter', 'More ironic', 'More serious', 'Better headline', 'Just the facts'],
    size: { lead: 'Lead', article: 'Article', brief: 'Brief' },
    up: 'Up', down: 'Down', leadShort: 'Ld.', rewritten: 'rewritten', source: 'source', sources: 'sources',
    kicker: 'Kicker', headline: 'Headline', dek: 'Summary', paraHint: 'A blank line separates paragraphs.', removePhoto: 'Remove the photo',
    save: 'Save', cancel: 'Cancel', orWrite: 'Or write your own: “say more about the TurboCode project”', rewrite: 'Rewrite',
    closeText: 'Close text', readText: 'Read text', toLead: 'Make it the lead', edit: 'Edit', discuss: 'Discuss', spike: 'Spike',
    working: 'The writer is working…', unverified: 'figures not in the facts', unverifiedHint: 'These numbers or times are in the article but not in the facts it was written from: check them, or rewrite.',
    title: 'The Newsroom', subtitle: 'The editor\'s desk · every piece, how it was made, and the page plan',
    readFix: 'Read and retouch', workings: 'How it was made', inWorks: 'in the works', toNext: '← back to the edition in the works', vPieces: 'The pieces', vFront: 'Front page', vCheck: 'Fact check', views: 'The edition', noSpiked: 'Nothing spiked in this edition.',
    draft: 'draft', retouched: 'edited', noEditions: 'No editions today.', evening: 'Evening',
    writingEvening: 'Writing the evening…', printEvening: 'Print the evening edition',
    oneDraft: 'One draft is waiting', nDrafts: (n) => `${n} drafts are waiting`, toPress: 'to go to press:',
    draftStatus: 'Draft', onStand: 'On the newsstand', eveningEdition: 'Evening edition',
    editions: 'editions', signals: 'signals', articles: 'articles', toneLabel: 'tone',
    inPress: 'Printing…', sendToPress: 'Send to press', reprinting: 'Reprinting…', reprintEvening: 'Reprint the evening',
    seeOnPage: 'See on the page →', editorial: 'The editorial', dayNews: 'The day\'s news', eveningNotOut: 'The evening edition is not out yet.',
    editionOf: (h) => `The ${h} edition`, writing: 'Writing…', regenBrief: 'Regenerate the Brief',
    reprintTitle: 'Rewrites the whole edition with the current editorial line.', reprintingLong: 'Reprinting… (a few minutes)',
    confirm: 'Sure? You lose the manual edits', reprint: 'Reprint', brief: 'The Brief', spiked: 'Spiked', restore: 'Restore',
    panels: 'Newsroom panels', meeting: 'Meeting', line: 'Editorial line', nextTab: 'Next edition',
    newArticle: 'New article', heads: 'Headlines', bench: 'Quick bench', benchHint: 'One article at a time, keep or cut', viva: 'Live', tipsTab: 'Tips',
    tipsTitle: 'The tip box', tipsHint: 'Hand the newsroom a fact the signals can\'t know. It goes into the matching story (“a source close to the owner”) or into “Word is”. Also from a note in the Notes folder “Newsroom” (or “Redazione”), or from the terminal: npm run tip -- "…"', tipPh: 'e.g. I lost five games in a row to the same player', tipSend: 'Into the box', tipNew: 'waiting', tipUsed: 'used', tipArchived: 'archived', tipVia: { notes: 'Notes', cli: 'terminal', web: 'paper' }, noTips: 'The box is empty.', openEdition: 'Open an edition to discuss it.',
  },
  it: {
    quick: ['Più corto', 'Più ironico', 'Più serio', 'Titolo migliore', 'Solo i fatti'],
    size: { lead: 'Apertura', article: 'Articolo', brief: 'Breve' },
    up: 'Su', down: 'Giù', leadShort: 'Ap.', rewritten: 'riscritto', source: 'fonte', sources: 'fonti',
    kicker: 'Occhiello', headline: 'Titolo', dek: 'Sommario', paraHint: 'Una riga vuota separa i paragrafi.', removePhoto: 'Togli la foto',
    save: 'Salva', cancel: 'Annulla', orWrite: 'Oppure scrivi tu: «parla di più del progetto TurboCode»', rewrite: 'Riscrivi',
    closeText: 'Chiudi testo', readText: 'Leggi testo', toLead: 'In apertura', edit: 'Modifica', discuss: 'Discuti', spike: 'Cestina',
    working: 'Il redattore lavora…', unverified: 'numeri non presenti nei fatti', unverifiedHint: 'Questi numeri o orari sono nell\'articolo ma non nei fatti da cui è stato scritto: controllali, o fai riscrivere.',
    title: 'La Redazione', subtitle: 'Il tavolo del direttore · ogni pezzo, la sua lavorazione e il menabò',
    readFix: 'Leggi e ritocca', workings: 'La lavorazione', inWorks: 'in lavorazione', toNext: '← torna all\'edizione in lavorazione', vPieces: 'I pezzi', vFront: 'Prima pagina', vCheck: 'Verifica', views: 'L\'edizione', noSpiked: 'Niente nel cestino, in questa edizione.',
    draft: 'bozza', retouched: 'ritoccata', noEditions: 'Nessuna edizione oggi.', evening: 'Sera',
    writingEvening: 'Scrivo la sera…', printEvening: 'Stampa l\'edizione della sera',
    oneDraft: 'Una bozza attende', nDrafts: (n) => `${n} bozze attendono`, toPress: 'di andare in stampa:',
    draftStatus: 'Bozza', onStand: 'In edicola', eveningEdition: 'Edizione della sera',
    editions: 'edizioni', signals: 'segnali', articles: 'articoli', toneLabel: 'tono',
    inPress: 'In stampa…', sendToPress: 'Manda in stampa', reprinting: 'Ristampo…', reprintEvening: 'Ristampa la sera',
    seeOnPage: 'Vedi in pagina →', editorial: 'L\'editoriale', dayNews: 'Le notizie del giorno', eveningNotOut: 'L\'edizione della sera non è ancora uscita.',
    editionOf: (h) => `Edizione delle ${h}`, writing: 'Scrivo…', regenBrief: 'Rigenera il Punto',
    reprintTitle: 'Riscrive tutta l\'edizione con la linea editoriale attuale.', reprintingLong: 'Ristampo… (qualche minuto)',
    confirm: 'Confermi? Perdi le modifiche a mano', reprint: 'Ristampa', brief: 'Il punto', spiked: 'Cestino', restore: 'Ripristina',
    panels: 'Pannelli della redazione', meeting: 'Riunione', line: 'Linea editoriale', nextTab: 'Prossima',
    newArticle: 'Nuovo articolo', heads: 'Titoli', bench: 'Banco rapido', benchHint: 'Un articolo alla volta, tieni o taglia', viva: 'Viva', tipsTab: 'Soffiate',
    tipsTitle: 'La cassetta delle soffiate', tipsHint: 'Dia alla redazione un fatto che i segnali non possono sapere. Finisce nella storia che c\'entra («una fonte vicina al proprietario») o in «Si dice che». Anche da una nota nella cartella «Redazione» di Note, o dal terminale: npm run tip -- "…"', tipPh: 'es. ho perso cinque partite di fila con lo stesso avversario', tipSend: 'Nella cassetta', tipNew: 'in attesa', tipUsed: 'usata', tipArchived: 'archiviata', tipVia: { notes: 'Note', cli: 'terminale', web: 'giornale' }, noTips: 'La cassetta è vuota.', openEdition: 'Apri un\'edizione per discuterne.',
  },
});
// tone names, also for ids stored by older editions
const OLD_TONE = { asciutto: 'dry', ironico: 'ironic', satirico: 'satirical', strillone: 'tabloid' };
const TONE_NAMES = tr({
  en: { dry: 'dry', ironic: 'ironic', satirical: 'satirical', british: 'understatement', tabloid: 'tabloid' },
  it: { dry: 'asciutto', ironic: 'ironico', satirical: 'satirico', british: 'understatement', tabloid: 'strillone' },
});
const toneName = (t) => TONE_NAMES[OLD_TONE[t] || t] || t;
// sizes as stored by older editions
const OLD_SIZE = { apertura: 'lead', articolo: 'article', breve: 'brief' };

/** The tip box, in the newsroom. */
function TipsPanel({ setError }) {
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/tips').then(setList).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await api('/tips', { method: 'POST', json: { text: text.trim() } }); setText(''); load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const label = { new: T.tipNew, used: T.tipUsed, archived: T.tipArchived };
  return (
    <div className="tips-panel">
      <h3 className="box-title">{T.tipsTitle}</h3>
      <p className="hint-small">{T.tipsHint}</p>
      <form onSubmit={send} className="tip-form">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={T.tipPh} />
        <button className="btn btn-small" disabled={busy || !text.trim()}>{T.tipSend}</button>
      </form>
      {list.length ? (
        <ul className="tip-list">
          {list.map((t) => (
            <li key={t.id} className={t.status}>
              <span className="tip-meta">{hhmm(t.ts)} · {T.tipVia[t.via] || t.via} · <em>{label[t.status] || t.status}</em></span>
              <span>{t.text}</span>
              {t.status === 'new' && <button className="btn-link" onClick={async () => { await api(`/tips/${t.id}/archive`, { method: 'POST' }); load(); }}>✕</button>}
            </li>
          ))}
        </ul>
      ) : <p className="hint-small">{T.noTips}</p>}
    </div>
  );
}

// ───────────────────────── A piece on the desk ─────────────────────────

function Draft({ a, i, n, ed, onChange, setError, onDiscuss }) {
  const [mode, setMode] = useState(null); // 'edit' | 'rewrite' | 'heads'
  const [panel, setPanel] = useState(null); // 'read' | 'work'
  const [busy, setBusy] = useState(false);
  const [instr, setInstr] = useState('');
  const [form, setForm] = useState(null);
  const base = `/editions/${encodeURIComponent(ed.id)}/articles/${encodeURIComponent(a.id)}`;

  async function call(path, opts) {
    setBusy(true);
    setError(null);
    try {
      onChange(await api(base + path, opts));
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const startEdit = () => {
    setForm({ kicker: a.kicker || '', headline: a.headline, dek: a.dek || '', body: a.body.join('\n\n'), removeImage: false });
    setMode('edit');
  };
  const saveEdit = async () => {
    const ok = await call('', { method: 'PATCH', json: { ...form, body: form.body.split(/\n\s*\n/) } });
    if (ok) setMode(null);
  };
  const rewrite = async (instruction) => {
    const ok = await call('/rewrite', { method: 'POST', json: { instruction } });
    if (ok) { setMode(null); setInstr(''); setPanel('work'); }
  };
  const toggle = (m) => setMode(mode === m ? null : m);
  const stamp = stampOf(a);
  const words = a.body.join(' ').split(/\s+/).filter(Boolean).length;

  return (
    <article className={`piece ${busy ? 'busy' : ''} ${i === 0 ? 'is-lead' : ''} ${panel ? 'open' : ''}`}>
      <div className="pc-rank">
        <span className="pc-n">{i === 0 ? T.leadShort : i + 1}</span>
        <button disabled={i === 0 || busy} onClick={() => call('/move', { method: 'POST', json: { to: 'up' } })} aria-label={T.up}>↑</button>
        <button disabled={i === n - 1 || busy} onClick={() => call('/move', { method: 'POST', json: { to: 'down' } })} aria-label={T.down}>↓</button>
      </div>

      <div className="pc-main">
        <div className="pc-top">
          <div className="pc-meta">
            <span className="sec">{a.section}</span>
            <span>{T.size[OLD_SIZE[a.size] || a.size] || a.size || '—'}</span>
            {a.byline?.name && <span title={writerLabel(a.writer)}>{[a.byline.name, styleName(a.byline.house)].filter(Boolean).join(' · ')}</span>}
            <span title={a.expanded ? tr({ en: 'The first draft was too short: the writer expanded it.', it: 'La prima bozza era troppo corta: la firma l\'ha allungata.' }) : undefined}>{words} {tr({ en: 'words', it: 'parole' })} · {readingTime(a)}{a.expanded ? ' ↥' : ''}</span>
            <span>{a.sources.length} {a.sources.length === 1 ? T.source : T.sources}</span>
          </div>
          {stamp && <span className={`stamp ${stamp.cls}`}>{stamp.text}</span>}
        </div>

        {mode === 'edit' ? (
          <div className="draft-form">
            <input value={form.kicker} onChange={(e) => setForm({ ...form, kicker: e.target.value })} placeholder={T.kicker} />
            <input className="f-head" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder={T.headline} />
            <input value={form.dek} onChange={(e) => setForm({ ...form, dek: e.target.value })} placeholder={T.dek} />
            <textarea rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <p className="hint-small">{T.paraHint}</p>
            {a.image && (
              <label className="check check-inline">
                <input type="checkbox" checked={form.removeImage} onChange={(e) => setForm({ ...form, removeImage: e.target.checked })} />
                <span>{T.removePhoto}</span>
              </label>
            )}
            <div className="draft-actions">
              <button className="btn btn-small" onClick={saveEdit} disabled={busy}>{T.save}</button>
              <button className="btn-ghost" onClick={() => setMode(null)}>{T.cancel}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="pc-head">
              <button className="pc-title" onClick={() => setPanel(panel === 'read' ? null : 'read')}>
                {a.kicker && a.kicker !== a.section && <span className="pc-kicker">{a.kicker}</span>}
                <span className="hl-md">{a.headline}</span>
                {a.dek && <span className="pc-dek">{a.dek}</span>}
              </button>
              {a.image && <img className="draft-thumb" src={a.image.src} alt="" loading="lazy" />}
            </div>
            {a.check?.unverified?.length > 0 && (
              <p className="pc-warn" title={T.unverifiedHint}>⚠ {T.unverified}: {a.check.unverified.slice(0, 4).join(', ')}</p>
            )}
            {a.rewrittenWith && <p className="pc-note">{T.rewritten}: {quote(a.rewrittenWith)}</p>}

            <Track a={a} draft={ed.status === 'draft'} />

            <div className="pc-tools">
              <div className="pc-views" role="tablist">
                <button role="tab" aria-selected={panel === 'read'} className={panel === 'read' ? 'on' : ''} onClick={() => setPanel(panel === 'read' ? null : 'read')}>{T.readFix}</button>
                <button role="tab" aria-selected={panel === 'work'} className={panel === 'work' ? 'on' : ''} onClick={() => setPanel(panel === 'work' ? null : 'work')}>{T.workings}</button>
              </div>
              <div className="pc-acts">
                <button className="btn-link-ink" onClick={startEdit}>{T.edit}</button>
                <button className={`btn-link-ink ${mode === 'rewrite' ? 'on' : ''}`} onClick={() => toggle('rewrite')}>{T.rewrite}</button>
                <button className={`btn-link-ink ${mode === 'heads' ? 'on' : ''}`} onClick={() => toggle('heads')}>{T.heads}</button>
                <button className="btn-link-ink" onClick={() => onDiscuss?.(a)}>{T.discuss}</button>
                {i > 0 && <button className="btn-link-ink" disabled={busy} onClick={() => call('/move', { method: 'POST', json: { to: 'top' } })}>{T.toLead}</button>}
                <button className="btn-link-ink danger" disabled={busy} onClick={() => call('/spike', { method: 'POST' })}>{T.spike}</button>
              </div>
            </div>
            {busy && <p className="working">{T.working}</p>}

            {mode === 'heads' && <HeadlinePicker key={a.headline} ed={ed} a={a} onChange={onChange} setError={setError} onClose={() => setMode(null)} />}
            {mode === 'rewrite' && (
              <div className="rewrite">
                <div className="chips">
                  {T.quick.map((q) => <button key={q} className="chip" disabled={busy} onClick={() => rewrite(q)}>{q}</button>)}
                </div>
                <div className="rewrite-row">
                  <input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder={T.orWrite}
                    onKeyDown={(e) => e.key === 'Enter' && instr.trim() && rewrite(instr.trim())} />
                  <button className="btn btn-small" disabled={busy || !instr.trim()} onClick={() => rewrite(instr.trim())}>{T.rewrite}</button>
                </div>
              </div>
            )}

            {panel === 'read' && <div className="pc-panel draft-text"><Paragraphs ed={ed} a={a} onChange={onChange} setError={setError} /></div>}
            {panel === 'work' && <div className="pc-panel"><Workings a={a} /></div>}
          </>
        )}
      </div>
    </article>
  );
}

// ───────────────────────── The desk ─────────────────────────

export default function Newsroom({ editionId: requested, onPublished }) {
  // #/newsroom/spotlight opens the Spotlight board; #/newsroom/next the detailed desk of the next edition
  const spotlightTab = requested === 'spotlight';
  const sideTab = ['viva', 'live'].includes(requested) ? 'viva' : ['soffiate', 'tips'].includes(requested) ? 'tips' : spotlightTab ? 'spotlight' : null;
  const detail = requested === 'next';
  const editionId = sideTab || detail || ['nuovo', 'new'].includes(requested) ? null : requested;
  const isEvening = !!editionId?.startsWith('sera-');
  // the next edition in the works: the detailed desk on request (or with a side panel open)
  const nextView = !editionId;
  const [day, setDay] = useState(() => (editionId ? (isEvening ? editionId.slice(5) : editionId.slice(0, 10)) : dayKey(Date.now())));
  const [tab, setTab] = useState(sideTab || 'meeting');
  const [view, setView] = useState('pieces');
  const [focus, setFocus] = useState(null);
  const [evening, setEvening] = useState(null);
  const [statusInfo, setStatusInfo] = useState(null);
  const [list, setList] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [ed, setEd] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [armed, setArmed] = useState(false);

  function reprint() {
    // an edition edited by hand: a second click confirms
    if (ed.edited && !armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    act('reprint', '/reprint');
  }

  const refreshList = useCallback(() => {
    api(`/editions?day=${day}&drafts=1`).then(setList).catch(() => setList([]));
    api('/drafts').then(setDrafts).catch(() => setDrafts([]));
    api(`/evening/${day}`).then(setEvening).catch(() => setEvening(null));
  }, [day]);
  useEffect(() => { api('/status').then(setStatusInfo).catch(() => {}); }, []);
  useEffect(() => { refreshList(); }, [refreshList]);

  // the open edition: the one requested (none: the next edition, in the works)
  const currentId = isEvening ? null : editionId || null;
  useEffect(() => {
    if (!currentId) { setEd(null); return; }
    api(`/editions/${encodeURIComponent(currentId)}`).then(setEd).catch((e) => setError(e.message));
  }, [currentId]);

  const update = (next) => { setEd(next); refreshList(); };

  // the result of an action approved in the meeting
  function onMeetingResult(r) {
    if (r.edition) setEd(r.edition);
    if (r.evening) setEvening(r.evening);
    refreshList();
  }

  async function eveningAct(label, path) {
    setBusy(label);
    setError(null);
    try {
      const ev = await api(`/evening/${day}${path}`, { method: 'POST' });
      setEvening(ev);
      onPublished?.(ev);
      if (!isEvening) location.hash = href.desk(`sera-${day}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function act(label, path) {
    setBusy(label);
    setError(null);
    try {
      const next = await api(`/editions/${encodeURIComponent(ed.id)}${path}`, { method: 'POST' });
      update(next);
      if (path === '/publish') onPublished?.(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const status = ed?.status || 'published';
  const otherDrafts = useMemo(() => drafts.filter((d) => d.id !== ed?.id), [drafts, ed]);

  const head = (
    <header className="desk-head">
      <div>
        <h2>{T.title}</h2>
        <p>{T.subtitle}</p>
        <NewsroomNav on="desk" />
      </div>
    </header>
  );

  const views = ed ? [
    { id: 'pieces', label: T.vPieces, n: ed.articles.length },
    { id: 'front', label: T.vFront },
    { id: 'check', label: T.vCheck, warn: ed.factcheck?.stale },
    { id: 'spiked', label: T.spiked, n: ed.spiked?.length || 0 },
  ] : [];

  return (
    <div className="desk fullbleed">
      <div className="desk-inner">
        {head}

        <div className="desk-grid">
          <section className="desk-main">
            <div className="desk-editions">
              <span className="lbl">{longDate(new Date(`${day}T12:00`).getTime())}</span>
              <div className="ed-chips">
                {list.map((e) => (
                  <a key={e.id} href={href.desk(e.id)} className={`ed-chip ${e.id === ed?.id ? 'on' : ''} ${e.status === 'draft' ? 'draft' : ''}`}>
                    {hhmm(edHour(e))}
                    {e.status === 'draft' && <em>{T.draft}</em>}
                    {e.edited && e.status !== 'draft' && <em>{T.retouched}</em>}
                  </a>
                ))}
                {!list.length && <span className="hint-small">{T.noEditions}</span>}
                {day === dayKey(Date.now()) && (
                  <a href={href.desk()} className={`ed-chip ed-chip-next ${nextView ? 'on' : ''}`}>
                    {hhmm(new Date().setMinutes(0, 0, 0))}<em>{T.inWorks}</em>
                  </a>
                )}
                {evening ? (
                  <a href={href.desk(`sera-${day}`)} className={`ed-chip ed-chip-evening ${isEvening ? 'on' : ''}`}>
                    {T.evening}{evening.status === 'draft' && <em>{T.draft}</em>}
                  </a>
                ) : list.length > 0 && (
                  <button className="btn-ghost" disabled={!!busy} onClick={() => eveningAct('evening', '/print')}>
                    {busy === 'evening' ? T.writingEvening : T.printEvening}
                  </button>
                )}
              </div>
            </div>

            {otherDrafts.length > 0 && (
              <p className="desk-alert">
                {otherDrafts.length === 1 ? T.oneDraft : T.nDrafts(otherDrafts.length)} {T.toPress}{' '}
                {otherDrafts.slice(0, 4).map((d, k) => (
                  <a key={d.id} href={href.desk(d.id)}>{k ? ', ' : ''}{hhmm(edHour(d))}</a>
                ))}
              </p>
            )}

            {error && <p className="notice">{error}</p>}

            {nextView && <NextDesk setError={setError} offline={['offline', 'disabled'].includes(statusInfo?.llm?.state)} onPrinted={() => refreshList()} />}

            {isEvening && evening && (
              <>
                <div className="desk-bar">
                  <div>
                    <span className={`status ${evening.status}`}>{evening.status === 'draft' ? T.draftStatus : T.onStand}</span>
                    <strong>{T.eveningEdition}</strong>
                    <span className="muted"> · {evening.editions} {T.editions} · {evening.stats.total} {T.signals} · {writerLabel(evening.writer)}</span>
                  </div>
                  <div className="desk-bar-actions">
                    {evening.status === 'draft' && (
                      <button className="btn btn-small" disabled={!!busy} onClick={() => eveningAct('publish', '/publish')}>
                        {busy === 'publish' ? T.inPress : T.sendToPress}
                      </button>
                    )}
                    <button className="btn-ghost" disabled={!!busy} onClick={() => eveningAct('evening', '/print')}>
                      {busy === 'evening' ? T.reprinting : T.reprintEvening}
                    </button>
                    {evening.status !== 'draft' && <a className="btn-ghost" href={href.evening(day)}>{T.seeOnPage}</a>}
                  </div>
                </div>
                <article className="desk-editorial">
                  <span className="lbl">{T.editorial}</span>
                  <h3 className="hl-lg">{evening.editorial.headline}</h3>
                  {evening.editorial.oneliner && <p className="dek">{evening.editorial.oneliner}</p>}
                  <div className="draft-text">{evening.editorial.body.map((p, k) => <p key={k}>{p}</p>)}</div>
                </article>
                <DeskCartoon cartoon={evening.cartoon} endpoint={`/evening/${day}/cartoon`} onChange={setEvening} setError={setError} />
                <section className="desk-top">
                  <span className="lbl">{T.dayNews}</span>
                  <ol>
                    {evening.top.map((t) => (
                      <li key={t.articleId}><span className="sec">{t.section} · {hhmm(t.hour)}</span> {t.headline}</li>
                    ))}
                  </ol>
                </section>
              </>
            )}
            {isEvening && !evening && <p className="empty-text">{T.eveningNotOut}</p>}

            {!isEvening && ed && (
              <>
                <div className="desk-bar">
                  <div>
                    <span className={`status ${status}`}>{status === 'draft' ? T.draftStatus : T.onStand}</span>
                    <strong>{T.editionOf(hhmm(edHour(ed)))}</strong>{edSince(ed)}
                    <a className="back-next" href={href.desk()}>{T.toNext}</a>
                    <span className="muted"> · {ed.articles.length} {T.articles}{ed.tone ? ` · ${T.toneLabel} ${toneName(ed.tone)}` : ''} · {writerLabel(ed.writer)}</span>
                  </div>
                  <div className="desk-bar-actions">
                    {status === 'draft' && (
                      <button className="btn btn-small" disabled={!!busy} onClick={() => act('publish', '/publish')}>
                        {busy === 'publish' ? T.inPress : T.sendToPress}
                      </button>
                    )}
                    <a className="btn-ghost bench-link" href={href.bench(ed.id)} title={T.benchHint}>⚡ {T.bench}</a>
                    {status === 'published' && <a className="btn-ghost" href={href.edition(ed.id)}>{T.seeOnPage}</a>}
                    <button className={`btn-ghost ${armed ? 'danger on' : ''}`} disabled={!!busy}
                      title={T.reprintTitle}
                      onClick={reprint}>
                      {busy === 'reprint' ? T.reprintingLong : armed ? T.confirm : T.reprint}
                    </button>
                  </div>
                </div>

                <TableSummary articles={ed.articles} />

                <div className="main-tabs" role="tablist" aria-label={T.views}>
                  {views.map((v) => (
                    <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>
                      {v.label}{v.n ? <span className="mt-n">{v.n}</span> : null}{v.warn ? <span className="mt-dot" aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>

                {view === 'pieces' && (
                  <div className="pieces">
                    {ed.articles.map((a, i) => (
                      <Draft key={a.id} a={a} i={i} n={ed.articles.length} ed={ed} onChange={update} setError={setError}
                        onDiscuss={(art) => { setTab('meeting'); setFocus({ id: art.id, headline: art.headline }); }} />
                    ))}
                  </div>
                )}

                {view === 'front' && (
                  <div className="front-view">
                    <div className="desk-punto">
                      <div className="punto-head">
                        <span className="lbl">{T.brief}</span>
                        <button className="btn-ghost" disabled={!!busy} onClick={() => act('summary', '/summary')}>
                          {busy === 'summary' ? T.writing : T.regenBrief}
                        </button>
                      </div>
                      <p>{ed.summary}</p>
                    </div>
                    <DeskCartoon cartoon={ed.cartoon} endpoint={`/editions/${encodeURIComponent(ed.id)}/cartoon`} onChange={update} setError={setError} />
                  </div>
                )}

                {view === 'check' && <FactCheck edition={ed} desk onChange={update} setError={setError} />}

                {view === 'spiked' && (
                  ed.spiked?.length > 0 ? (
                    <section className="spiked">
                      {ed.spiked.map((a) => (
                        <div key={a.id} className="spiked-row">
                          <span className="sec">{a.section}</span>
                          <span className="t">{a.headline}</span>
                          <button className="btn-ghost" onClick={async () => {
                            try { update(await api(`/editions/${encodeURIComponent(ed.id)}/articles/${encodeURIComponent(a.id)}/restore`, { method: 'POST' })); } catch (e) { setError(e.message); }
                          }}>{T.restore}</button>
                        </div>
                      ))}
                    </section>
                  ) : <p className="empty-text">{T.noSpiked}</p>
                )}
              </>
            )}
          </section>

          <aside className="desk-side">
            <div className="side-tabs" role="tablist" aria-label={T.panels}>
              <button role="tab" aria-selected={tab === 'meeting'} className={tab === 'meeting' ? 'on' : ''} onClick={() => setTab('meeting')}>{T.meeting}</button>
              <button role="tab" aria-selected={tab === 'spotlight'} className={`tab-spot ${tab === 'spotlight' ? 'on' : ''}`} onClick={() => setTab('spotlight')}>Spotlight</button>
              <button role="tab" aria-selected={tab === 'viva'} className={tab === 'viva' ? 'on' : ''} onClick={() => setTab('viva')}>{T.viva}</button>
              <button role="tab" aria-selected={tab === 'tips'} className={tab === 'tips' ? 'on' : ''} onClick={() => setTab('tips')}>{T.tipsTab}</button>
            </div>
            {/* the panel scrolls inside the column: a long board never spills over the page */}
            <div className="side-body">
            {tab === 'meeting' ? (
              (isEvening ? evening : ed || list.at(-1)) ? (
                <Meeting
                  threadId={isEvening ? `sera-${day}` : (ed || list.at(-1)).id}
                  kind={isEvening ? 'evening' : 'edition'}
                  focus={isEvening ? null : focus}
                  onClearFocus={() => setFocus(null)}
                  onResult={onMeetingResult}
                  model={statusInfo?.llm?.model}
                />
              ) : <p className="hint-small">{T.openEdition}</p>
            ) : tab === 'spotlight' ? (
              <SpotlightDesk setError={setError} />
            ) : tab === 'viva' ? (
              <ChatterFeed />
            ) : (
              <TipsPanel setError={setError} />
            )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
