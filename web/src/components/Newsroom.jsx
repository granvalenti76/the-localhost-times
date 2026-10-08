import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, href, hhmm, dayKey, longDate, SECTIONS, writerLabel, edHour, edSince } from '../lib.js';
import Meeting from './Meeting.jsx';
import DeskCartoon from './DeskCartoon.jsx';
import FactCheck from './FactCheck.jsx';
import { tr } from '../i18n.js';

const T = tr({
  en: {
    quick: ['Shorter', 'More ironic', 'More serious', 'Better headline', 'Just the facts'],
    size: { lead: 'Lead', article: 'Article', brief: 'Brief' },
    tone: 'Tone', length: 'Article length', space: 'Room for each section', notes: 'Editor\'s notes',
    notesPh: 'Rules for the writers, for example:\n· Never talk about Facebook\n· Work on TurboCode is always news\n· Call me “the Editor”',
    printing: 'Printing', autoPub: 'Publish automatically', autoPubHint: 'If you turn it off, every edition stays a draft until you send it to press from here.',
    photos: 'Photos', photosHint: 'Previews of public pages and YouTube thumbnails.',
    saving: 'Saving…', updateLine: 'Update the line', lineSaved: 'Line up to date',
    lineHint: 'Applies from the next edition. To apply it to the open one, use “Reprint”.',
    up: 'Up', down: 'Down', leadShort: 'Ld.', rewritten: 'rewritten', source: 'source', sources: 'sources',
    kicker: 'Kicker', headline: 'Headline', dek: 'Summary', paraHint: 'A blank line separates paragraphs.', removePhoto: 'Remove the photo',
    save: 'Save', cancel: 'Cancel', orWrite: 'Or write your own: “say more about the TurboCode project”', rewrite: 'Rewrite',
    closeText: 'Close text', readText: 'Read text', toLead: 'Make it the lead', edit: 'Edit', discuss: 'Discuss', spike: 'Spike',
    working: 'The writer is working…', unverified: 'figures not in the facts', unverifiedHint: 'These numbers or times are in the article but not in the facts it was written from: check them, or rewrite.',
    title: 'The Newsroom', subtitle: 'The editor\'s desk · drafts, page plan and editorial line',
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
    panels: 'Newsroom panels', meeting: 'Meeting', line: 'Editorial line', openEdition: 'Open an edition to discuss it.',
  },
  it: {
    quick: ['Più corto', 'Più ironico', 'Più serio', 'Titolo migliore', 'Solo i fatti'],
    size: { lead: 'Apertura', article: 'Articolo', brief: 'Breve' },
    tone: 'Tono', length: 'Lunghezza degli articoli', space: 'Spazio alle sezioni', notes: 'Note del direttore',
    notesPh: 'Regole per i redattori, per esempio:\n· Non parlare mai di Facebook\n· Il lavoro su TurboCode è sempre notizia\n· Chiamami «il Direttore»',
    printing: 'Stampa', autoPub: 'Pubblicazione automatica', autoPubHint: 'Se la togli, ogni edizione resta in bozza finché non la mandi in stampa da qui.',
    photos: 'Foto', photosHint: 'Anteprime delle pagine pubbliche e miniature di YouTube.',
    saving: 'Salvo…', updateLine: 'Aggiorna la linea', lineSaved: 'Linea aggiornata',
    lineHint: 'Vale dalla prossima edizione. Per applicarla a quella aperta usa «Ristampa».',
    up: 'Su', down: 'Giù', leadShort: 'Ap.', rewritten: 'riscritto', source: 'fonte', sources: 'fonti',
    kicker: 'Occhiello', headline: 'Titolo', dek: 'Sommario', paraHint: 'Una riga vuota separa i paragrafi.', removePhoto: 'Togli la foto',
    save: 'Salva', cancel: 'Annulla', orWrite: 'Oppure scrivi tu: «parla di più del progetto TurboCode»', rewrite: 'Riscrivi',
    closeText: 'Chiudi testo', readText: 'Leggi testo', toLead: 'In apertura', edit: 'Modifica', discuss: 'Discuti', spike: 'Cestina',
    working: 'Il redattore lavora…', unverified: 'numeri non presenti nei fatti', unverifiedHint: 'Questi numeri o orari sono nell\'articolo ma non nei fatti da cui è stato scritto: controllali, o fai riscrivere.',
    title: 'La Redazione', subtitle: 'Il tavolo del direttore · bozze, menabò e linea editoriale',
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
    panels: 'Pannelli della redazione', meeting: 'Riunione', line: 'Linea editoriale', openEdition: 'Apri un\'edizione per discuterne.',
  },
});
// tone names, also for ids stored by older editions
const OLD_TONE = { asciutto: 'dry', ironico: 'ironic', satirico: 'satirical', strillone: 'tabloid' };
const TONE_NAMES = tr({
  en: { dry: 'dry', ironic: 'ironic', satirical: 'satirical', british: 'understatement', tabloid: 'tabloid' },
  it: { dry: 'asciutto', ironic: 'ironico', satirical: 'satirico', british: 'understatement', tabloid: 'strillone' },
});
const toneName = (t) => TONE_NAMES[OLD_TONE[t] || t || 'dry'] || t;
// sizes as stored by older editions
const OLD_SIZE = { apertura: 'lead', articolo: 'article', breve: 'brief' };

// ───────────────────────── Editorial line ─────────────────────────

function LinePanel({ onSaved }) {
  const [meta, setMeta] = useState(null);
  const [line, setLine] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/line').then((r) => { setMeta(r); setLine(r.line); setSaved(JSON.stringify(r.line)); });
  }, []);

  if (!line) return <div className="line-panel" />;
  const dirty = JSON.stringify(line) !== saved;
  const set = (patch) => setLine((l) => ({ ...l, ...patch }));
  const setWeight = (id, v) => setLine((l) => ({ ...l, sectionWeights: { ...l.sectionWeights, [id]: v } }));

  async function save() {
    setBusy(true);
    try {
      const r = await api('/line', { method: 'PUT', json: line });
      setLine(r.line);
      setSaved(JSON.stringify(r.line));
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="line-panel">

      <fieldset className="field">
        <legend>{T.tone}</legend>
        <div className="tones">
          {Object.entries(meta.tones).map(([k, t]) => (
            <label key={k} className={`tone ${line.tone === k ? 'on' : ''}`}>
              <input type="radio" name="tone" value={k} checked={line.tone === k} onChange={() => set({ tone: k })} />
              <span className="tone-name">{t.label}</span>
              <span className="tone-hint">{t.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>{T.length}</legend>
        <div className="seg">
          {Object.entries(meta.lengths).map(([k, l]) => (
            <button key={k} type="button" className={line.length === k ? 'on' : ''} onClick={() => set({ length: k })}>{l.label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>{T.space}</legend>
        <div className="weights">
          {SECTIONS.map((s) => (
            <div key={s.id} className="weight-row">
              <span className="w-name">{s.name}<em>{s.tag}</em></span>
              <div className="seg seg-small">
                {meta.weights.map((w) => (
                  <button key={w.value} type="button" title={w.label}
                    className={`${(line.sectionWeights[s.id] ?? 1) === w.value ? 'on' : ''} ${w.value === 0 ? 'off' : ''}`}
                    onClick={() => setWeight(s.id, w.value)}>
                    {w.value === 0 ? '✕' : w.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>{T.notes}</legend>
        <textarea
          rows={5}
          value={line.notes}
          placeholder={T.notesPh}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </fieldset>

      <fieldset className="field">
        <legend>{T.printing}</legend>
        <label className="check">
          <input type="checkbox" checked={line.autoPublish} onChange={(e) => set({ autoPublish: e.target.checked })} />
          <span><strong>{T.autoPub}</strong><em>{T.autoPubHint}</em></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={line.photos} onChange={(e) => set({ photos: e.target.checked })} />
          <span><strong>{T.photos}</strong><em>{T.photosHint}</em></span>
        </label>
      </fieldset>

      <button className="btn btn-block" onClick={save} disabled={!dirty || busy}>
        {busy ? T.saving : dirty ? T.updateLine : T.lineSaved}
      </button>
      <p className="hint-small">{T.lineHint}</p>
    </div>
  );
}

// ───────────────────────── An article draft ─────────────────────────

function Draft({ a, i, n, ed, onChange, setError, onDiscuss }) {
  const [mode, setMode] = useState(null); // 'edit' | 'rewrite'
  const [open, setOpen] = useState(false);
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
    if (ok) { setMode(null); setInstr(''); setOpen(true); }
  };

  return (
    <article className={`draft ${busy ? 'busy' : ''} ${i === 0 ? 'is-lead' : ''}`}>
      <div className="draft-pos">
        <span className="draft-n">{i === 0 ? T.leadShort : i + 1}</span>
        <button disabled={i === 0 || busy} onClick={() => call('/move', { method: 'POST', json: { to: 'up' } })} aria-label={T.up}>↑</button>
        <button disabled={i === n - 1 || busy} onClick={() => call('/move', { method: 'POST', json: { to: 'down' } })} aria-label={T.down}>↓</button>
      </div>

      <div className="draft-main">
        <div className="draft-tags">
          <span className="sec">{a.section}</span>
          <span className="tag">{T.size[OLD_SIZE[a.size] || a.size] || a.size || '—'}</span>
          <span className="tag">{writerLabel(a.writer)}</span>
          {a.rewrittenWith && <span className="tag">{T.rewritten}: «{a.rewrittenWith}»</span>}
          <span className="tag">{a.sources.length} {a.sources.length === 1 ? T.source : T.sources}</span>
          {a.check?.unverified?.length > 0 && (
            <span className="tag tag-warn" title={T.unverifiedHint}>⚠ {T.unverified}: {a.check.unverified.slice(0, 4).join(', ')}</span>
          )}
        </div>

        {mode === 'edit' ? (
          <div className="draft-form">
            <input value={form.kicker} onChange={(e) => setForm({ ...form, kicker: e.target.value })} placeholder={T.kicker} />
            <input className="f-head" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder={T.headline} />
            <input value={form.dek} onChange={(e) => setForm({ ...form, dek: e.target.value })} placeholder={T.dek} />
            <textarea rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
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
            <div className="draft-body">
              <div>
                {a.kicker && <div className="kicker"><span className="sub">{a.kicker}</span></div>}
                <h3 className="hl-md">{a.headline}</h3>
                {a.dek && <p className="dek dek-sm">{a.dek}</p>}
              </div>
              {a.image && <img className="draft-thumb" src={a.image.src} alt="" loading="lazy" />}
            </div>
            {open && <div className="draft-text">{a.body.map((p, k) => <p key={k}>{p}</p>)}</div>}

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

            <div className="draft-actions">
              <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>{open ? T.closeText : T.readText}</button>
              {i > 0 && <button className="btn-ghost" disabled={busy} onClick={() => call('/move', { method: 'POST', json: { to: 'top' } })}>{T.toLead}</button>}
              <button className="btn-ghost" onClick={startEdit}>{T.edit}</button>
              <button className={`btn-ghost ${mode === 'rewrite' ? 'on' : ''}`} onClick={() => setMode(mode === 'rewrite' ? null : 'rewrite')}>{T.rewrite}</button>
              <button className="btn-ghost" onClick={() => onDiscuss?.(a)}>{T.discuss}</button>
              <button className="btn-ghost danger" disabled={busy} onClick={() => call('/spike', { method: 'POST' })}>{T.spike}</button>
              {busy && <span className="working">{T.working}</span>}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

// ───────────────────────── The desk ─────────────────────────

export default function Newsroom({ editionId, onPublished }) {
  const isEvening = !!editionId?.startsWith('sera-');
  const [day, setDay] = useState(() => (editionId ? (isEvening ? editionId.slice(5) : editionId.slice(0, 10)) : dayKey(Date.now())));
  const [tab, setTab] = useState('meeting');
  const [focus, setFocus] = useState(null);
  const [lineKey, setLineKey] = useState(0);
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

  // the open edition: the one requested, otherwise the day's latest
  const currentId = isEvening ? null : editionId || list.at(-1)?.id || null;
  useEffect(() => {
    if (!currentId) { setEd(null); return; }
    api(`/editions/${encodeURIComponent(currentId)}`).then(setEd).catch((e) => setError(e.message));
  }, [currentId]);

  const update = (next) => { setEd(next); refreshList(); };

  // the result of an action approved in the meeting
  function onMeetingResult(r) {
    if (r.edition) setEd(r.edition);
    if (r.evening) setEvening(r.evening);
    if (r.line) setLineKey((k) => k + 1);
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

  return (
    <div className="desk">
      <header className="desk-head">
        <h2>{T.title}</h2>
        <p>{T.subtitle}</p>
      </header>

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
                  <span className="muted"> · {ed.articles.length} {T.articles} · {T.toneLabel} {toneName(ed.tone)} · {writerLabel(ed.writer)}</span>
                </div>
                <div className="desk-bar-actions">
                  {status === 'draft' && (
                    <button className="btn btn-small" disabled={!!busy} onClick={() => act('publish', '/publish')}>
                      {busy === 'publish' ? T.inPress : T.sendToPress}
                    </button>
                  )}
                  <button className="btn-ghost" disabled={!!busy} onClick={() => act('summary', '/summary')}>
                    {busy === 'summary' ? T.writing : T.regenBrief}
                  </button>
                  <button className={`btn-ghost ${armed ? 'danger on' : ''}`} disabled={!!busy}
                    title={T.reprintTitle}
                    onClick={reprint}>
                    {busy === 'reprint' ? T.reprintingLong : armed ? T.confirm : T.reprint}
                  </button>
                  {status === 'published' && <a className="btn-ghost" href={href.edition(ed.id)}>{T.seeOnPage}</a>}
                </div>
              </div>

              <div className="desk-punto">
                <span className="lbl">{T.brief}</span>
                <p>{ed.summary}</p>
              </div>
              <DeskCartoon cartoon={ed.cartoon} endpoint={`/editions/${encodeURIComponent(ed.id)}/cartoon`} onChange={update} setError={setError} />
              <FactCheck edition={ed} desk onChange={update} setError={setError} />

              <div className="drafts">
                {ed.articles.map((a, i) => (
                  <Draft key={a.id} a={a} i={i} n={ed.articles.length} ed={ed} onChange={update} setError={setError}
                    onDiscuss={(art) => { setTab('meeting'); setFocus({ id: art.id, headline: art.headline }); }} />
                ))}
              </div>

              {ed.spiked?.length > 0 && (
                <section className="spiked">
                  <h3 className="box-title">{T.spiked}</h3>
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
              )}
            </>
          )}
        </section>

        <aside className="desk-side">
          <div className="side-tabs" role="tablist" aria-label={T.panels}>
            <button role="tab" aria-selected={tab === 'meeting'} className={tab === 'meeting' ? 'on' : ''} onClick={() => setTab('meeting')}>{T.meeting}</button>
            <button role="tab" aria-selected={tab === 'line'} className={tab === 'line' ? 'on' : ''} onClick={() => setTab('line')}>{T.line}</button>
          </div>
          {tab === 'meeting' ? (
            (isEvening ? evening : ed) ? (
              <Meeting
                threadId={isEvening ? `sera-${day}` : ed.id}
                kind={isEvening ? 'evening' : 'edition'}
                focus={isEvening ? null : focus}
                onClearFocus={() => setFocus(null)}
                onResult={onMeetingResult}
                model={statusInfo?.llm?.model}
              />
            ) : <p className="hint-small">{T.openEdition}</p>
          ) : (
            <LinePanel key={lineKey} />
          )}
        </aside>
      </div>
    </div>
  );
}
