import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, href, hhmm, dayKey, longDate, SECTIONS, writerLabel, edHour, edSince } from '../lib.js';
import Meeting from './Meeting.jsx';

const QUICK = ['Più corto', 'Più ironico', 'Più serio', 'Titolo migliore', 'Solo i fatti'];
const SIZE_LABEL = { apertura: 'Apertura', articolo: 'Articolo', breve: 'Breve' };

// ───────────────────────── Linea editoriale ─────────────────────────

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
        <legend>Tono</legend>
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
        <legend>Lunghezza degli articoli</legend>
        <div className="seg">
          {Object.entries(meta.lengths).map(([k, l]) => (
            <button key={k} type="button" className={line.length === k ? 'on' : ''} onClick={() => set({ length: k })}>{l.label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Spazio alle sezioni</legend>
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
        <legend>Note del direttore</legend>
        <textarea
          rows={5}
          value={line.notes}
          placeholder={'Regole per i redattori, per esempio:\n· Non parlare mai di Facebook\n· Il lavoro su TurboCode è sempre notizia\n· Chiamami «il Direttore»'}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </fieldset>

      <fieldset className="field">
        <legend>Stampa</legend>
        <label className="check">
          <input type="checkbox" checked={line.autoPublish} onChange={(e) => set({ autoPublish: e.target.checked })} />
          <span><strong>Pubblicazione automatica</strong><em>Se la togli, ogni edizione resta in bozza finché non la mandi in stampa da qui.</em></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={line.photos} onChange={(e) => set({ photos: e.target.checked })} />
          <span><strong>Foto</strong><em>Anteprime delle pagine pubbliche e miniature di YouTube.</em></span>
        </label>
      </fieldset>

      <button className="btn btn-block" onClick={save} disabled={!dirty || busy}>
        {busy ? 'Salvo…' : dirty ? 'Aggiorna la linea' : 'Linea aggiornata'}
      </button>
      <p className="hint-small">Vale dalla prossima edizione. Per applicarla a quella aperta usa «Ristampa».</p>
    </div>
  );
}

// ───────────────────────── Bozza di un articolo ─────────────────────────

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
        <span className="draft-n">{i === 0 ? 'Ap.' : i + 1}</span>
        <button disabled={i === 0 || busy} onClick={() => call('/move', { method: 'POST', json: { to: 'up' } })} aria-label="Su">↑</button>
        <button disabled={i === n - 1 || busy} onClick={() => call('/move', { method: 'POST', json: { to: 'down' } })} aria-label="Giù">↓</button>
      </div>

      <div className="draft-main">
        <div className="draft-tags">
          <span className="sec">{a.section}</span>
          <span className="tag">{SIZE_LABEL[a.size] || a.size || '—'}</span>
          <span className="tag">{writerLabel(a.writer)}</span>
          {a.rewrittenWith && <span className="tag">riscritto: «{a.rewrittenWith}»</span>}
          <span className="tag">{a.sources.length} {a.sources.length === 1 ? 'fonte' : 'fonti'}</span>
        </div>

        {mode === 'edit' ? (
          <div className="draft-form">
            <input value={form.kicker} onChange={(e) => setForm({ ...form, kicker: e.target.value })} placeholder="Occhiello" />
            <input className="f-head" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Titolo" />
            <input value={form.dek} onChange={(e) => setForm({ ...form, dek: e.target.value })} placeholder="Sommario" />
            <textarea rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <p className="hint-small">Una riga vuota separa i paragrafi.</p>
            {a.image && (
              <label className="check check-inline">
                <input type="checkbox" checked={form.removeImage} onChange={(e) => setForm({ ...form, removeImage: e.target.checked })} />
                <span>Togli la foto</span>
              </label>
            )}
            <div className="draft-actions">
              <button className="btn btn-small" onClick={saveEdit} disabled={busy}>Salva</button>
              <button className="btn-ghost" onClick={() => setMode(null)}>Annulla</button>
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
                  {QUICK.map((q) => <button key={q} className="chip" disabled={busy} onClick={() => rewrite(q)}>{q}</button>)}
                </div>
                <div className="rewrite-row">
                  <input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Oppure scrivi tu: «parla di più del progetto TurboCode»"
                    onKeyDown={(e) => e.key === 'Enter' && instr.trim() && rewrite(instr.trim())} />
                  <button className="btn btn-small" disabled={busy || !instr.trim()} onClick={() => rewrite(instr.trim())}>Riscrivi</button>
                </div>
              </div>
            )}

            <div className="draft-actions">
              <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Chiudi testo' : 'Leggi testo'}</button>
              {i > 0 && <button className="btn-ghost" disabled={busy} onClick={() => call('/move', { method: 'POST', json: { to: 'top' } })}>In apertura</button>}
              <button className="btn-ghost" onClick={startEdit}>Modifica</button>
              <button className={`btn-ghost ${mode === 'rewrite' ? 'on' : ''}`} onClick={() => setMode(mode === 'rewrite' ? null : 'rewrite')}>Riscrivi</button>
              <button className="btn-ghost" onClick={() => onDiscuss?.(a)}>Discuti</button>
              <button className="btn-ghost danger" disabled={busy} onClick={() => call('/spike', { method: 'POST' })}>Cestina</button>
              {busy && <span className="working">Il redattore lavora…</span>}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

// ───────────────────────── Il tavolo ─────────────────────────

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
    // edizione ritoccata a mano: serve un secondo clic per confermare
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

  // edizione aperta: quella richiesta, altrimenti la più recente del giorno
  const currentId = isEvening ? null : editionId || list.at(-1)?.id || null;
  useEffect(() => {
    if (!currentId) { setEd(null); return; }
    api(`/editions/${encodeURIComponent(currentId)}`).then(setEd).catch((e) => setError(e.message));
  }, [currentId]);

  const update = (next) => { setEd(next); refreshList(); };

  // risultato di un'azione approvata in riunione
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
        <h2>La Redazione</h2>
        <p>Il tavolo del direttore · bozze, menabò e linea editoriale</p>
      </header>

      <div className="desk-grid">
        <section className="desk-main">
          <div className="desk-editions">
            <span className="lbl">{longDate(new Date(`${day}T12:00`).getTime())}</span>
            <div className="ed-chips">
              {list.map((e) => (
                <a key={e.id} href={href.desk(e.id)} className={`ed-chip ${e.id === ed?.id ? 'on' : ''} ${e.status === 'draft' ? 'draft' : ''}`}>
                  {hhmm(edHour(e))}
                  {e.status === 'draft' && <em>bozza</em>}
                  {e.edited && e.status !== 'draft' && <em>ritoccata</em>}
                </a>
              ))}
              {!list.length && <span className="hint-small">Nessuna edizione oggi.</span>}
              {evening ? (
                <a href={href.desk(`sera-${day}`)} className={`ed-chip ed-chip-evening ${isEvening ? 'on' : ''}`}>
                  Sera{evening.status === 'draft' && <em>bozza</em>}
                </a>
              ) : list.length > 0 && (
                <button className="btn-ghost" disabled={!!busy} onClick={() => eveningAct('evening', '/print')}>
                  {busy === 'evening' ? 'Scrivo la sera…' : 'Stampa l\'edizione della sera'}
                </button>
              )}
            </div>
          </div>

          {otherDrafts.length > 0 && (
            <p className="desk-alert">
              {otherDrafts.length === 1 ? 'Una bozza attende' : `${otherDrafts.length} bozze attendono`} di andare in stampa:{' '}
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
                  <span className={`status ${evening.status}`}>{evening.status === 'draft' ? 'Bozza' : 'In edicola'}</span>
                  <strong>Edizione della sera</strong>
                  <span className="muted"> · {evening.editions} edizioni · {evening.stats.total} segnali · {writerLabel(evening.writer)}</span>
                </div>
                <div className="desk-bar-actions">
                  {evening.status === 'draft' && (
                    <button className="btn btn-small" disabled={!!busy} onClick={() => eveningAct('publish', '/publish')}>
                      {busy === 'publish' ? 'In stampa…' : 'Manda in stampa'}
                    </button>
                  )}
                  <button className="btn-ghost" disabled={!!busy} onClick={() => eveningAct('evening', '/print')}>
                    {busy === 'evening' ? 'Ristampo…' : 'Ristampa la sera'}
                  </button>
                  {evening.status !== 'draft' && <a className="btn-ghost" href={href.evening(day)}>Vedi in pagina →</a>}
                </div>
              </div>
              <article className="desk-editorial">
                <span className="lbl">L'editoriale</span>
                <h3 className="hl-lg">{evening.editorial.headline}</h3>
                {evening.editorial.oneliner && <p className="dek">{evening.editorial.oneliner}</p>}
                <div className="draft-text">{evening.editorial.body.map((p, k) => <p key={k}>{p}</p>)}</div>
                <p className="desk-cartoon">Vignetta: «{evening.cartoon?.caption}»</p>
              </article>
              <section className="desk-top">
                <span className="lbl">Le notizie del giorno</span>
                <ol>
                  {evening.top.map((t) => (
                    <li key={t.articleId}><span className="sec">{t.section} · {hhmm(t.hour)}</span> {t.headline}</li>
                  ))}
                </ol>
              </section>
            </>
          )}
          {isEvening && !evening && <p className="empty-text">L'edizione della sera non è ancora uscita.</p>}

          {!isEvening && ed && (
            <>
              <div className="desk-bar">
                <div>
                  <span className={`status ${status}`}>{status === 'draft' ? 'Bozza' : 'In edicola'}</span>
                  <strong>Edizione delle {hhmm(edHour(ed))}</strong>{edSince(ed)}
                  <span className="muted"> · {ed.articles.length} articoli · tono {ed.tone || 'asciutto'} · {writerLabel(ed.writer)}</span>
                </div>
                <div className="desk-bar-actions">
                  {status === 'draft' && (
                    <button className="btn btn-small" disabled={!!busy} onClick={() => act('publish', '/publish')}>
                      {busy === 'publish' ? 'In stampa…' : 'Manda in stampa'}
                    </button>
                  )}
                  <button className="btn-ghost" disabled={!!busy} onClick={() => act('summary', '/summary')}>
                    {busy === 'summary' ? 'Scrivo…' : 'Rigenera il Punto'}
                  </button>
                  <button className={`btn-ghost ${armed ? 'danger on' : ''}`} disabled={!!busy}
                    title="Riscrive tutta l'edizione con la linea editoriale attuale."
                    onClick={reprint}>
                    {busy === 'reprint' ? 'Ristampo… (qualche minuto)' : armed ? 'Confermi? Perdi le modifiche a mano' : 'Ristampa'}
                  </button>
                  {status === 'published' && <a className="btn-ghost" href={href.edition(ed.id)}>Vedi in pagina →</a>}
                </div>
              </div>

              <div className="desk-punto">
                <span className="lbl">Il punto</span>
                <p>{ed.summary}</p>
              </div>

              <div className="drafts">
                {ed.articles.map((a, i) => (
                  <Draft key={a.id} a={a} i={i} n={ed.articles.length} ed={ed} onChange={update} setError={setError}
                    onDiscuss={(art) => { setTab('meeting'); setFocus({ id: art.id, headline: art.headline }); }} />
                ))}
              </div>

              {ed.spiked?.length > 0 && (
                <section className="spiked">
                  <h3 className="box-title">Cestino</h3>
                  {ed.spiked.map((a) => (
                    <div key={a.id} className="spiked-row">
                      <span className="sec">{a.section}</span>
                      <span className="t">{a.headline}</span>
                      <button className="btn-ghost" onClick={async () => {
                        try { update(await api(`/editions/${encodeURIComponent(ed.id)}/articles/${encodeURIComponent(a.id)}/restore`, { method: 'POST' })); } catch (e) { setError(e.message); }
                      }}>Ripristina</button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </section>

        <aside className="desk-side">
          <div className="side-tabs" role="tablist" aria-label="Pannelli della redazione">
            <button role="tab" aria-selected={tab === 'meeting'} className={tab === 'meeting' ? 'on' : ''} onClick={() => setTab('meeting')}>Riunione</button>
            <button role="tab" aria-selected={tab === 'line'} className={tab === 'line' ? 'on' : ''} onClick={() => setTab('line')}>Linea editoriale</button>
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
            ) : <p className="hint-small">Apri un'edizione per discuterne.</p>
          ) : (
            <LinePanel key={lineKey} />
          )}
        </aside>
      </div>
    </div>
  );
}
