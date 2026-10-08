import React from 'react';

function Spark({ data, up }) {
  const W = 64, H = 18;
  const max = Math.max(1, ...data);
  const step = W / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(H - 1 - (v / max) * (H - 3)).toFixed(1)}`).join(' ');
  const last = data.length - 1;
  return (
    <svg className={`spark ${up ? 'up' : 'down'}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <polyline points={pts} fill="none" />
      <circle cx={last * step} cy={H - 1 - (data[last] / max) * (H - 3)} r="1.8" />
    </svg>
  );
}

const fmt = (c) => (c == null ? 'nuovo' : `${c > 0 ? '+' : ''}${Math.round(c * 100)}%`);

export default function Market({ market, title = 'Borsa dei siti', indexName = 'Indice Localhost', note = 'Visite nell\'ora, variazione sull\'ora precedente, andamento delle ultime 12 ore.' }) {
  if (!market?.rows?.length) return null;
  const idx = market.index;
  return (
    <section className="box market">
      <h3 className="box-title">{title}</h3>
      <div className="mkt-index">
        <span className="mkt-name">{indexName}</span>
        <span className="mkt-close">{idx.close}</span>
        <span className={`mkt-chg ${!idx.change ? '' : idx.change > 0 ? 'up' : 'down'}`}>
          {idx.change == null ? '—' : idx.change === 0 ? '= invariato' : `${idx.change > 0 ? '▲' : '▼'} ${fmt(idx.change)}`}
        </span>
      </div>
      <table className="mkt">
        <thead>
          <tr><th>Titolo</th><th aria-label="Andamento 12 ore" /><th>Visite</th><th>Var.</th></tr>
        </thead>
        <tbody>
          {market.rows.map((r) => {
            const up = r.change == null || r.change >= 0;
            const flat = r.change === 0;
            return (
              <tr key={r.site} className={r.close === 0 ? 'halted' : ''}>
                <th title={r.site}>
                  <span className="tk">{r.ticker}</span>
                  <span className="site">{r.site}</span>
                </th>
                <td><Spark data={r.spark} up={up} /></td>
                <td className="num">{r.close || '—'}</td>
                <td className={`num chg ${r.change == null ? 'new' : flat ? 'flat' : up ? 'up' : 'down'}`}>
                  {r.close === 0 ? 'sospeso' : r.change == null ? 'nuovo' : flat ? '=' : `${up ? '▲' : '▼'}${Math.abs(Math.round(r.change * 100))}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {market.comment && <p className="mkt-comment">{market.comment}</p>}
      <p className="mkt-note">{note}</p>
    </section>
  );
}
