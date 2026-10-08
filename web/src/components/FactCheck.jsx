import React, { useState } from 'react';
import { api, href, modelName } from '../lib.js';
import { tr, quote } from '../i18n.js';

const V = tr({
  en: { true: 'True', mostly: 'Mostly true', false: 'False', unverifiable: 'Unverifiable' },
  it: { true: 'Vero', mostly: 'Quasi vero', false: 'Falso', unverifiable: 'Non verificabile' },
});
const T = tr({
  en: { title: 'Fact check', brief: 'The Brief', stale: 'The edition changed after this check.', redo: 'Check again', checking: 'Checking…', none: 'No fact-check for this edition (the writer was offline).', by: 'Checked by' },
  it: { title: 'La verifica', brief: 'Il punto', stale: 'L\'edizione è cambiata dopo questa verifica.', redo: 'Verifica di nuovo', checking: 'Verifico…', none: 'Nessuna verifica per questa edizione (il redattore era spento).', by: 'Verificato da' },
});

/** The fact-check box: on the front page (read-only) and in the newsroom (with "check again"). */
export default function FactCheck({ edition, desk = false, onChange, setError }) {
  const [busy, setBusy] = useState(false);
  const fc = edition.factcheck;
  if (!fc && !desk) return null;

  async function redo() {
    setBusy(true);
    setError?.(null);
    try {
      onChange(await api(`/editions/${encodeURIComponent(edition.id)}/factcheck`, { method: 'POST' }));
    } catch (e) {
      setError?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`box factcheck ${desk ? 'desk-fc' : ''}`}>
      <h3 className="box-title">{T.title}</h3>
      {!fc && <p className="hint-small">{T.none}</p>}
      {fc?.checks.map((c, i) => {
        const art = c.articleId && edition.articles.find((a) => a.id === c.articleId);
        return (
          <div key={i} className="fc-item">
            <span className={`fc-verdict v-${c.verdict}`}>{V[c.verdict]}</span>
            <p className="fc-claim">{quote(c.claim)}</p>
            <p className="fc-evidence">
              {c.evidence}
              {art && <> · <a href={href.article(edition.id, art.id)}>{art.section}</a></>}
              {c.brief && <> · {T.brief}</>}
            </p>
          </div>
        );
      })}
      {fc?.stale && <p className="hint-small fc-stale">{T.stale}</p>}
      {fc?.by && <p className="fc-by">{T.by} {modelName(fc.by)}</p>}
      {desk && (
        <button className="btn-ghost" disabled={busy} onClick={redo}>{busy ? T.checking : T.redo}</button>
      )}
    </section>
  );
}
