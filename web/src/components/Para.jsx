import React from 'react';

/** A paragraph of an article; in a newsletter-style piece ("Why it matters: …") the label is set in bold. */
export default function Para({ a, p, className }) {
  const m = a?.byline?.house === 'newsletter' ? /^([^:.!?]{2,32}):\s+([\s\S]+)$/.exec(p) : null;
  return m ? <p className={className}><strong className="para-label">{m[1]}:</strong> {m[2]}</p> : <p className={className}>{p}</p>;
}
