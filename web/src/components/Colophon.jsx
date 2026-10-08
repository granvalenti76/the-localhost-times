import React from 'react';
import { hhmm, modelName } from '../lib.js';

const STATE = {
  ok: ['in linea', 'ok'],
  demo: ['dati dimostrativi', 'ok'],
  denied: ['serve Accesso completo al disco', 'bad'],
  missing: ['non trovata', 'off'],
  error: ['errore', 'bad'],
  disabled: ['disattivata', 'off'],
  pending: ['in attesa', 'off'],
};

export default function Colophon({ status, onCheck }) {
  if (!status) return <footer className="colophon" />;
  const llm = status.llm;
  const denied = status.sources.some((s) => s.state === 'denied');
  return (
    <footer className="colophon">
      <div className="colo-grid">
        <section>
          <h3 className="box-title">La redazione</h3>
          <p className="colo-line">
            <span className={`led ${llm.state === 'online' ? 'ok' : 'off'}`} />
            Redattore {llm.state === 'online' ? <>in servizio · <strong>{modelName(llm.model)}</strong></> : <>non raggiungibile · scrive la tipografia automatica</>}
          </p>
          <p className="colo-small">{llm.baseUrl} {llm.error ? `· ${llm.error}` : ''} <button className="linkish" onClick={onCheck}>riprova</button></p>
          {status.newsroom?.nextEdition && <p className="colo-small">Prossima edizione alle {hhmm(status.newsroom.nextEdition)}</p>}
        </section>
        <section>
          <h3 className="box-title">I corrispondenti</h3>
          <ul className="colo-sources">
            {status.sources.map((s) => {
              const [label, cls] = STATE[s.state] || [s.state, 'off'];
              return (
                <li key={s.id} title={s.error || s.file || ''}>
                  <span className={`led ${cls}`} />
                  <strong>{s.label}</strong>
                  {s.experimental && <em> (sperimentale)</em>}
                  <span className="colo-small"> — {label}</span>
                </li>
              );
            })}
          </ul>
          {denied && (
            <p className="colo-small hint">
              macOS protegge alcune fonti. Apri Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco
              e abilita l'app da cui avvii il giornale (Terminale, iTerm, VS Code…), poi riavviala.
            </p>
          )}
        </section>
      </div>
      <p className="colo-end">The Localhost Times è stampato su questo Mac. Nessuna notizia lascia la redazione, se non verso il tuo redattore.</p>
    </footer>
  );
}
