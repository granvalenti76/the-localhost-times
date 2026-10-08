import React, { useEffect, useRef, useState } from 'react';
import { tr } from '../i18n.js';
import { drawShareImage, shareSpec } from '../share.js';

/** Print to PDF on a given paper size: the size goes into a temporary @page rule. */
function printOn(size) {
  const style = document.createElement('style');
  style.textContent = `@page { size: ${size} portrait; margin: ${size === 'A3' ? '14mm' : '10mm'}; }`;
  document.head.appendChild(style);
  document.documentElement.dataset.paper = size;
  const done = () => {
    style.remove();
    delete document.documentElement.dataset.paper;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** "Export" in the edition bar: PDF (A4/A3), the front page as an image, the RSS feed. */
export default function ExportMenu({ edition, evening }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!edition && !evening) return null;

  async function image(copy) {
    setBusy(copy ? 'copy' : 'image');
    setNote(null);
    try {
      const spec = shareSpec({ edition, evening });
      const blob = await drawShareImage(spec);
      if (copy) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setNote(tr({ en: 'Copied: paste it anywhere.', it: 'Copiata: incollala dove vuoi.' }));
      } else {
        download(blob, spec.file);
        setOpen(false);
      }
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(null);
    }
  }

  const pdf = (size) => {
    setOpen(false);
    setTimeout(() => printOn(size), 50);
  };

  return (
    <div className="export" ref={ref}>
      <button className="btn-ghost btn-small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {tr({ en: 'Export', it: 'Esporta' })} ▾
      </button>
      {open && (
        <div className="export-menu" role="menu">
          <button role="menuitem" onClick={() => pdf('A4')}>{tr({ en: 'PDF, A4', it: 'PDF, formato A4' })}<span>{tr({ en: 'to print at home', it: 'da stampare a casa' })}</span></button>
          <button role="menuitem" onClick={() => pdf('A3')}>{tr({ en: 'PDF, A3 broadsheet', it: 'PDF, formato A3' })}<span>{tr({ en: 'like a real front page', it: 'come una vera prima pagina' })}</span></button>
          <hr />
          <button role="menuitem" disabled={!!busy} onClick={() => image(false)}>
            {busy === 'image' ? tr({ en: 'Drawing…', it: 'Disegno…' }) : tr({ en: 'Front page as an image', it: 'La prima pagina come immagine' })}
            <span>PNG 1200×630</span>
          </button>
          {typeof ClipboardItem !== 'undefined' && (
            <button role="menuitem" disabled={!!busy} onClick={() => image(true)}>
              {busy === 'copy' ? tr({ en: 'Drawing…', it: 'Disegno…' }) : tr({ en: 'Copy the image', it: 'Copia l\'immagine' })}
            </button>
          )}
          <hr />
          <a role="menuitem" href="/feed.xml" target="_blank" rel="noreferrer">
            {tr({ en: 'RSS feed', it: 'Feed RSS' })}<span>{tr({ en: 'every article, as it is printed', it: 'tutti gli articoli, appena stampati' })}</span>
          </a>
          <a role="menuitem" href="/radio.xml" target="_blank" rel="noreferrer">
            {tr({ en: 'Radio podcast feed', it: 'Feed podcast del giornale radio' })}<span>{tr({ en: 'the bulletins, for the Podcasts app', it: 'i notiziari, per l\'app Podcasts' })}</span>
          </a>
          {note && <p className="export-note">{note}</p>}
        </div>
      )}
    </div>
  );
}
