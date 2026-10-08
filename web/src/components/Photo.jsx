import React, { useState } from 'react';

/** Foto con didascalia e credito, in stile quotidiano. Sparisce se l'immagine non carica. */
export default function Photo({ image, size = 'md', caption = true }) {
  const [broken, setBroken] = useState(false);
  if (!image || broken) return null;
  return (
    <figure className={`photo photo-${size}`}>
      <div className="photo-frame">
        <img src={image.src} alt={image.caption || ''} loading="lazy" onError={() => setBroken(true)} />
      </div>
      {caption && (image.caption || image.credit) && (
        <figcaption>
          {image.caption && <span className="cap">{image.caption}</span>}
          {image.credit && <span className="credit">{image.credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}
