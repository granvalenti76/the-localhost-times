import React, { useEffect, useState } from 'react';
import { api } from '../lib.js';
import Cartoon from './Cartoon.jsx';

let catalog = null;
const loadCatalog = () => (catalog ||= api('/scenes').catch(() => { catalog = null; return []; }));

const BY = { redattore: 'scelta dal redattore', tipografia: 'scelta dalla tipografia', direttore: 'scelta dal direttore' };

/** In redazione: la vignetta con il disegno e la battuta modificabili a mano. */
export default function DeskCartoon({ cartoon, endpoint, onChange, setError }) {
  const [scenes, setScenes] = useState([]);
  const [caption, setCaption] = useState(cartoon?.caption || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadCatalog().then(setScenes); }, []);
  useEffect(() => { setCaption(cartoon?.caption || ''); }, [cartoon?.caption]);
  if (!cartoon) return null;

  async function save(patch) {
    setBusy(true);
    setError?.(null);
    try {
      onChange(await api(endpoint, { method: 'PATCH', json: patch }));
    } catch (e) {
      setError?.(e.message);
    } finally {
      setBusy(false);
    }
  }

  const changed = caption.trim() && caption.trim() !== cartoon.caption;
  return (
    <div className={`desk-vignetta ${busy ? 'busy' : ''}`}>
      <div className="desk-vignetta-art"><Cartoon cartoon={cartoon} /></div>
      <div className="desk-vignetta-form">
        <span className="lbl">La vignetta{cartoon.by ? ` · ${BY[cartoon.by] || cartoon.by}` : ''}</span>
        <label className="sr-only" htmlFor="vg-scene">Disegno</label>
        <select id="vg-scene" value={cartoon.scene === 'mail' ? 'mailpile' : cartoon.scene === 'browse' ? 'tabs' : cartoon.scene}
          disabled={busy || !scenes.length} onChange={(e) => save({ scene: e.target.value })}>
          {scenes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <p className="muted small">{scenes.find((s) => s.id === cartoon.scene)?.about}</p>
        <label className="sr-only" htmlFor="vg-caption">Battuta</label>
        <textarea id="vg-caption" rows={2} value={caption} maxLength={160} onChange={(e) => setCaption(e.target.value)} />
        <button className="btn-ghost" disabled={busy || !changed} onClick={() => save({ caption })}>Salva la battuta</button>
      </div>
    </div>
  );
}
