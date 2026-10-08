import React from 'react';
import { hhmm, modelName } from '../lib.js';
import { tr } from '../i18n.js';

const STATE = tr({
  en: {
    ok: ['online', 'ok'], demo: ['demo data', 'ok'], denied: ['needs Full Disk Access', 'bad'], missing: ['not found', 'off'],
    error: ['error', 'bad'], disabled: ['disabled', 'off'], pending: ['waiting', 'off'],
  },
  it: {
    ok: ['in linea', 'ok'], demo: ['dati dimostrativi', 'ok'], denied: ['serve Accesso completo al disco', 'bad'], missing: ['non trovata', 'off'],
    error: ['errore', 'bad'], disabled: ['disattivata', 'off'], pending: ['in attesa', 'off'],
  },
});

export default function Colophon({ status, onCheck }) {
  if (!status) return <footer className="colophon" />;
  const llm = status.llm;
  const denied = status.sources.some((s) => s.state === 'denied');
  return (
    <footer className="colophon">
      <div className="colo-grid">
        <section>
          <h3 className="box-title">{tr({ en: 'The newsroom', it: 'La redazione' })}</h3>
          <p className="colo-line">
            <span className={`led ${llm.state === 'online' ? 'ok' : 'off'}`} />
            {tr({ en: 'Writer', it: 'Redattore' })} {llm.state === 'online'
              ? <>{tr({ en: 'on duty', it: 'in servizio' })} · <strong>{modelName(llm.model)}</strong></>
              : <>{tr({ en: 'unreachable · the automatic typesetting writes', it: 'non raggiungibile · scrive la tipografia automatica' })}</>}
          </p>
          <p className="colo-small">{llm.base || llm.baseUrl} {llm.error ? `· ${llm.error}` : ''} <button className="linkish" onClick={onCheck}>{tr({ en: 'retry', it: 'riprova' })}</button></p>
          {status.newsroom?.nextEdition && <p className="colo-small">{tr({ en: 'Next edition at', it: 'Prossima edizione alle' })} {hhmm(status.newsroom.nextEdition)}</p>}
        </section>
        <section>
          <h3 className="box-title">{tr({ en: 'The correspondents', it: 'I corrispondenti' })}</h3>
          <ul className="colo-sources">
            {status.sources.map((s) => {
              const [label, cls] = STATE[s.state] || [s.state, 'off'];
              return (
                <li key={s.id} title={s.error || s.file || ''}>
                  <span className={`led ${cls}`} />
                  <strong>{s.label}</strong>
                  {s.experimental && <em> ({tr({ en: 'experimental', it: 'sperimentale' })})</em>}
                  <span className="colo-small"> — {label}</span>
                </li>
              );
            })}
          </ul>
          {denied && (
            <p className="colo-small hint">
              {tr({
                en: 'macOS protects some sources. Open System Settings → Privacy & Security → Full Disk Access and enable the app you start the paper from (Terminal, iTerm, VS Code…), then restart it. Running as a service? Add node itself: npm run service:status shows the path.',
                it: 'macOS protegge alcune fonti. Apri Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco e abilita l\'app da cui avvii il giornale (Terminale, iTerm, VS Code…), poi riavviala. Gira come servizio? Aggiungi node stesso: npm run service:status ti dà il percorso.',
              })}
            </p>
          )}
        </section>
      </div>
      <p className="colo-end">{tr({
        en: 'The Localhost Times is printed on this Mac. No news leaves the newsroom, except to your own writer.',
        it: 'The Localhost Times è stampato su questo Mac. Nessuna notizia lascia la redazione, se non verso il tuo redattore.',
      })}</p>
    </footer>
  );
}
