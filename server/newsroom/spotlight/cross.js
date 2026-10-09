/**
 * Spotlight, widened: the tips and the crossings.
 *
 *  tips       a tip in the box that speaks of an open lead becomes one of its exhibits (a witness:
 *             "a source close to the owner"); the Editor can also hand a tip straight to Spotlight,
 *             and a lead is opened on it, with the archive searched for what supports it
 *  widen      the Editor gives the reporters more words to search: new exhibits from the archive
 *  links      two open leads that keep happening in the same hours, or share their subject,
 *             become a third lead: "the two leads cross"
 *  dossier    what the desk knows beyond the exhibits: the witnesses, the Editor's statements to
 *             the paper's reporters, the crossings, what the paper already printed on the subject
 *
 * Everything here is deterministic; the model only judges and writes, as before.
 */
import { tr, lang } from '../../i18n.js';
import { DeskError } from '../edition.js';
import { gather } from '../investigations.js';
import { terms, isSensitive, exhibit, pickExhibits, norm, HISTORY_DAYS } from './detectors.js';
import { kindName } from './write.js';
import { say } from '../chatter.js';
import { scoreOf } from './desk.js';
import { dayKey, hhmm, hash } from '../../util.js';

const DAY = 24 * 3600e3;
const ACTIVE = ['open', 'review', 'reply', 'writing'];
const q = (s) => (lang() === 'it' ? `«${s}»` : `“${s}”`);

const note = (lead, who, text, now = Date.now()) => {
  lead.log = [...(lead.log || []), { ts: now, who, text }].slice(-40);
};

/** A tip as an exhibit: a witness, not a signal. */
export const tipExhibit = (t, ts = Date.now()) => ({
  id: `tip:${t.id ?? hash(t.text)}`,
  ts: t.ts ?? ts,
  source: 'tip',
  kind: 'tip',
  title: String(t.text || '').replace(/\s+/g, ' ').slice(0, 140),
  host: null,
});

/** The words a lead is about: its subject first, then the titles of its exhibits. */
export function leadTerms(lead) {
  const subj = new Set(terms(lead.subject).keys());
  for (const w of String(lead.subject || '').toLowerCase().split(/[\s/→×]+/)) if (w.includes('.') && w.length > 4) subj.add(norm(w.split('.')[0]));
  const all = new Set(subj);
  for (const x of lead.evidence || []) for (const n of terms(`${x.title} ${x.host || ''}`).keys()) all.add(n);
  for (const k of lead.keywords || []) for (const n of terms(k).keys()) { subj.add(n); all.add(n); }
  return { subj, all };
}

/** How much a text speaks of a lead: a word of its subject counts double. */
export function relevance(text, lead) {
  const t = [...terms(text).keys()];
  const hosts = (String(text).toLowerCase().match(/[a-z0-9-]+\.[a-z]{2,}/g) || []).map((h) => norm(h.split('.')[0]));
  const { subj, all } = leadTerms(lead);
  let score = 0;
  for (const w of new Set([...t, ...hosts])) score += subj.has(w) ? 2 : all.has(w) ? 1 : 0;
  return score;
}

function addExhibits(lead, list, now) {
  const known = new Set(lead.evidence.map((x) => x.id));
  const fresh = list.filter((x) => !known.has(x.id));
  if (!fresh.length) return 0;
  // the witnesses always stay in the file; the signals keep the latest 30
  const tips = [...lead.evidence, ...fresh].filter((x) => x.source === 'tip');
  const rest = [...lead.evidence, ...fresh].filter((x) => x.source !== 'tip').sort((a, b) => a.ts - b.ts).slice(-30);
  lead.evidence = [...rest, ...tips].sort((a, b) => a.ts - b.ts);
  lead.lastEvidenceAt = now;
  return fresh.length;
}

/** Tips in the box (of the last days) that speak of an open lead join its file as witnesses. */
export function tipsToLeads(store, now = Date.now()) {
  const leads = store.leads({ status: ACTIVE });
  if (!leads.length) return 0;
  const tips = store.items('tip', { after: now - 7 * DAY, limit: 60 }).filter((t) => t.status !== 'archived' && !isSensitive(t.text));
  let n = 0;
  for (const t of tips) {
    for (const lead of leads) {
      if ((lead.witnesses || []).includes(t.id)) continue;
      if (relevance(t.text, lead) < 2) continue;
      addExhibits(lead, [tipExhibit(t)], now);
      lead.witnesses = [...(lead.witnesses || []), t.id];
      lead.tips = [...(lead.tips || []), { id: t.id, text: t.text, ts: t.ts }].slice(-10);
      lead.strength = Math.min(1, (lead.strength || 0) + 0.1);
      lead.score = scoreOf(lead);
      note(lead, 'reporters', tr({ en: `A tip from the box backs the lead: ${q(t.text.slice(0, 80))}`, it: `Una soffiata dalla cassetta conferma la pista: ${q(t.text.slice(0, 80))}` }), now);
      lead.updatedAt = now;
      store.saveLead(lead);
      say(store, 'spotlight', tr({ en: `Spotlight: a tip fits the lead on ${q(lead.subject)}. One more witness.`, it: `Spotlight: una soffiata combacia con la pista su ${q(lead.subject)}. Un testimone in più.` }), now);
      n++;
    }
  }
  return n;
}

/** Search the archive for a lead's words: exhibits and numbers. */
function search(store, words, now, days = HISTORY_DAYS) {
  const keywords = words.map((w) => (/\./.test(w) ? `"${w}"` : w)).join(' ');
  if (!keywords.trim()) return { evidence: [], numbers: null };
  try {
    const d = gather(store, { keywords, from: now - days * DAY, to: now });
    const evs = d.events.map((e) => ({ id: e.id || `ev:${e.ts}:${hash(e.title)}`, ts: e.ts, source: e.source, kind: e.kind, title: e.title, meta: { host: e.host } }));
    return { evidence: pickExhibits(evs.filter((e) => !isSensitive(`${e.title} ${e.meta.host || ''}`)), 16), numbers: d.numbers };
  } catch {
    return { evidence: [], numbers: null };
  }
}

const searchFacts = (n, words) => (n ? [
  tr({ en: `Signals on ${words.map(q).join(', ')} in the archive: ${n.total}, on ${n.activeDays} of ${n.days} days`, it: `Segnali su ${words.map(q).join(', ')} in archivio: ${n.total}, in ${n.activeDays} giorni su ${n.days}` }),
  n.busiestDay ? tr({ en: `Busiest day: ${dayKey(n.busiestDay.ts)} (${n.busiestDay.n})`, it: `Giorno più intenso: ${dayKey(n.busiestDay.ts)} (${n.busiestDay.n})` }) : null,
  n.sites?.length ? tr({ en: `Sites: ${n.sites.slice(0, 4).map((s) => `${s.name} ${s.n}`).join(', ')}`, it: `Siti: ${n.sites.slice(0, 4).map((s) => `${s.name} ${s.n}`).join(', ')}` }) : null,
].filter(Boolean) : []);

/** The words of a tip worth searching (or the ones the Editor gave). */
export function tipWords(text, keywords) {
  const given = String(keywords || '').split(/[,;]+|\s{2,}/).map((x) => x.trim()).filter(Boolean);
  if (given.length) return given.slice(0, 5);
  const hosts = String(text).toLowerCase().match(/[a-z0-9-]+\.(com|it|org|net|io|tv|app|dev|co\.uk|de|fr|es)\b/g) || [];
  // a site named in the tip is the best thing to search; otherwise its strongest words
  if (hosts.length) return [...new Set(hosts)].slice(0, 3);
  return [...terms(text).values()].slice(0, 3);
}

/**
 * The Editor hands a tip straight to Spotlight: a lead is opened on it, the archive is searched
 * for its words, and it is fast-tracked (the editor weighs it at the next round).
 */
export function openFromTip(store, config, { text, keywords } = {}, now = Date.now()) {
  const t = String(text || '').trim().slice(0, 600);
  if (!t) throw new DeskError(tr({ en: 'Write the tip.', it: 'Scrivi la soffiata.' }), 400);
  if (isSensitive(`${t} ${keywords || ''}`)) throw new DeskError(tr({ en: 'Spotlight doesn\'t investigate this kind of subject (health, money, love, faith, politics, the law, a job search).', it: 'Spotlight non indaga su questo genere di argomenti (salute, soldi, amore, fede, politica, giustizia, ricerca di lavoro).' }), 422);
  const words = tipWords(t, keywords);
  const { evidence, numbers } = search(store, words, now);
  const id = `tip:${hash(`${t}|${now}`)}`;
  const witness = tipExhibit({ id: `spot-${hash(t)}`, text: t, ts: now });
  const goal = Math.max(30, Math.min(95, Number(config.spotlight?.goal) || 70));
  const lead = {
    id,
    kind: 'tip',
    subject: words.slice(0, 2).join(' / ') || t.slice(0, 40),
    hypothesis: tr({ en: `The Editor reports: ${q(t)}. The reporters check it against the signals.`, it: `Il direttore segnala: ${q(t)}. I cronisti la verificano sui segnali.` }),
    status: 'open',
    chief: true,
    keywords: words,
    openedAt: now,
    updatedAt: now,
    lastEvidenceAt: now,
    passes: 1,
    goal,
    evidence: [...evidence, witness].sort((a, b) => a.ts - b.ts),
    facts: searchFacts(numbers, words),
    strength: Math.min(1, 0.35 + Math.min(0.45, evidence.length / 25)),
    tips: [{ id: witness.id, text: t, ts: now }],
    witnesses: [],
    log: [],
  };
  lead.score = scoreOf(lead);
  note(lead, 'chief', tr({ en: `Tip from the Editor: ${q(t)}`, it: `Soffiata del direttore: ${q(t)}` }), now);
  note(lead, 'reporters', evidence.length
    ? tr({ en: `Searched the archive for ${words.map(q).join(', ')}: ${evidence.length} exhibits (${numbers?.total || 0} signals in all).`, it: `Cercato in archivio ${words.map(q).join(', ')}: ${evidence.length} reperti (${numbers?.total || 0} segnali in tutto).` })
    : tr({ en: `Nothing in the archive on ${words.map(q).join(', ')} yet: the reporters keep listening.`, it: `Ancora niente in archivio su ${words.map(q).join(', ')}: i cronisti restano in ascolto.` }), now);
  store.saveLead(lead);
  say(store, 'spotlight', tr({ en: `Spotlight: the Editor has a tip. Lead opened on ${q(lead.subject)}.`, it: `Spotlight: il direttore ha una soffiata. Aperta una pista su ${q(lead.subject)}.` }), now);
  return lead;
}

/** The Editor adds a tip to a lead. */
export function tipLead(store, id, text, now = Date.now()) {
  const lead = store.getLead(id);
  if (!lead) throw new DeskError(tr({ en: 'Lead not found.', it: 'Pista non trovata.' }), 404);
  const t = String(text || '').trim().slice(0, 600);
  if (!t) throw new DeskError(tr({ en: 'Write the tip.', it: 'Scrivi la soffiata.' }), 400);
  if (isSensitive(t)) throw new DeskError(tr({ en: 'Spotlight doesn\'t investigate this kind of subject.', it: 'Spotlight non indaga su questo genere di argomenti.' }), 422);
  const w = tipExhibit({ id: `spot-${hash(`${t}|${now}`)}`, text: t, ts: now });
  addExhibits(lead, [w], now);
  lead.tips = [...(lead.tips || []), { id: w.id, text: t, ts: now }].slice(-10);
  lead.strength = Math.min(1, (lead.strength || 0) + 0.12);
  note(lead, 'chief', tr({ en: `Tip from the Editor: ${q(t)}`, it: `Soffiata del direttore: ${q(t)}` }), now);
  lead.reviewedAt = null; // something new: the editor will look again
  lead.score = scoreOf(lead);
  lead.updatedAt = now;
  return store.saveLead(lead);
}

/** The Editor widens the search: more words, more exhibits from the archive. */
export function widenLead(store, id, keywords, now = Date.now()) {
  const lead = store.getLead(id);
  if (!lead) throw new DeskError(tr({ en: 'Lead not found.', it: 'Pista non trovata.' }), 404);
  const words = String(keywords || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
  if (!words.length) throw new DeskError(tr({ en: 'Give the reporters some words to search.', it: 'Dai ai cronisti qualche parola da cercare.' }), 400);
  if (isSensitive(words.join(' '))) throw new DeskError(tr({ en: 'Spotlight doesn\'t investigate this kind of subject.', it: 'Spotlight non indaga su questo genere di argomenti.' }), 422);
  const { evidence, numbers } = search(store, words, now);
  const n = addExhibits(lead, evidence, now);
  lead.keywords = [...new Set([...(lead.keywords || []), ...words])].slice(-10);
  lead.facts = [...(lead.facts || []).filter((f) => !words.some((w) => f.includes(q(w)))), ...searchFacts(numbers, words)].slice(-10);
  if (n) lead.strength = Math.min(1, (lead.strength || 0) + Math.min(0.2, n / 50));
  lead.reviewedAt = null;
  note(lead, 'chief', tr({ en: `The Editor widens the search to ${words.map(q).join(', ')}: ${n} new exhibits.`, it: `Il direttore allarga la ricerca a ${words.map(q).join(', ')}: ${n} reperti nuovi.` }), now);
  lead.score = scoreOf(lead);
  lead.updatedAt = now;
  return store.saveLead(lead);
}

// ───────────────────────── The crossings ─────────────────────────

/** How two leads touch: exhibits in the same hours (within 20 minutes), shared words. */
export function overlap(a, b, windowMs = 20 * 60e3) {
  const A = a.evidence.filter((x) => x.source !== 'tip');
  const B = b.evidence.filter((x) => x.source !== 'tip');
  const near = [];
  for (const x of A) {
    const y = B.find((z) => z.id !== x.id && Math.abs(z.ts - x.ts) <= windowMs);
    if (y) near.push([x, y]);
  }
  const days = new Set(near.map(([x]) => dayKey(x.ts)));
  const ta = leadTerms(a).subj;
  const tb = leadTerms(b).subj;
  const shared = [...ta].filter((w) => tb.has(w));
  const sameIds = A.filter((x) => B.some((y) => y.id === x.id)).length;
  return { near, days: days.size, shared, sameIds };
}

function linkFrom(a, b, o, forced = false) {
  const [x, y] = [a, b].sort((p, r) => (p.id < r.id ? -1 : 1));
  const evidence = [...new Map(o.near.flat().map((e) => [e.id, e])).values()].sort((p, r) => p.ts - r.ts).slice(-18);
  const tipsOf = (l) => (l.evidence || []).filter((e) => e.source === 'tip');
  return {
    key: `link:${hash(`${x.id}|${y.id}`)}`,
    kind: 'link',
    subject: `${x.subject} × ${y.subject}`,
    hypothesis: o.near.length
      ? tr({
        en: `Two leads cross: ${q(x.subject)} and ${q(y.subject)} happen in the same hours, ${o.near.length} times on ${o.days} days.`,
        it: `Due piste si incrociano: ${q(x.subject)} e ${q(y.subject)} succedono nelle stesse ore, ${o.near.length} volte in ${o.days} giorni.`,
      })
      : o.shared.length
        ? tr({ en: `Two leads cross: ${q(x.subject)} and ${q(y.subject)} share their subject.`, it: `Due piste si incrociano: ${q(x.subject)} e ${q(y.subject)} hanno lo stesso argomento.` })
        : tr({ en: `The Editor puts ${q(x.subject)} and ${q(y.subject)} side by side: the reporters look for where they meet.`, it: `Il direttore mette insieme ${q(x.subject)} e ${q(y.subject)}: i cronisti cercano dove si toccano.` }),
    evidence: [...(evidence.length ? evidence : [...x.evidence.slice(-6), ...y.evidence.slice(-6)]), ...tipsOf(x), ...tipsOf(y)],
    facts: [
      tr({ en: `Lead 1 (${kindName(x.kind)}): ${x.hypothesis}`, it: `Pista 1 (${kindName(x.kind)}): ${x.hypothesis}` }),
      tr({ en: `Lead 2 (${kindName(y.kind)}): ${y.hypothesis}`, it: `Pista 2 (${kindName(y.kind)}): ${y.hypothesis}` }),
      o.near.length ? tr({ en: `Exhibits of the two within 20 minutes of each other: ${o.near.length}, on ${o.days} days`, it: `Reperti delle due a meno di 20 minuti l'uno dall'altro: ${o.near.length}, in ${o.days} giorni` }) : null,
      o.shared.length ? tr({ en: `Words they share: ${o.shared.slice(0, 5).join(', ')}`, it: `Parole in comune: ${o.shared.slice(0, 5).join(', ')}` }) : null,
      forced ? tr({ en: 'Crossed on the Editor\'s request.', it: 'Incrociate su richiesta del direttore.' }) : null,
    ].filter(Boolean),
    strength: Math.min(1, 0.45 + Math.min(0.35, o.near.length / 12) + Math.min(0.2, o.shared.length * 0.1) + (forced ? 0.1 : 0)),
    links: [x.id, y.id],
    sources: [...new Set(evidence.map((e) => e.source))],
  };
}

/** Pairs of open leads that cross, as candidates for the board (a link of links is not made). */
export function linkCandidates(leads) {
  const live = leads.filter((l) => ACTIVE.includes(l.status) && l.kind !== 'link');
  const out = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.kind === b.kind && a.kind !== 'tip') continue; // two of the same detector are one story, not a crossing
      const o = overlap(a, b);
      // the same events seen twice is a duplicate, not a crossing
      if (o.sameIds > Math.min(a.evidence.length, b.evidence.length) * 0.6) continue;
      if ((o.near.length >= 3 && o.days >= 2) || o.shared.length >= 2) out.push(linkFrom(a, b, o));
    }
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 3);
}

/** The Editor crosses two leads by hand. */
export function crossLeads(store, aId, bId, now = Date.now()) {
  const a = store.getLead(aId);
  const b = store.getLead(bId);
  if (!a || !b || a.id === b.id) throw new DeskError(tr({ en: 'Choose two different leads.', it: 'Scegli due piste diverse.' }), 400);
  const c = linkFrom(a, b, overlap(a, b), true);
  const old = store.getLead(c.key);
  const goal = a.goal || 70;
  const lead = {
    ...(old || {}),
    id: c.key, kind: 'link', subject: c.subject, hypothesis: c.hypothesis, status: 'open', chief: true,
    links: c.links, openedAt: old?.openedAt || now, updatedAt: now, lastEvidenceAt: now, passes: Math.max(old?.passes || 0, 1),
    goal, evidence: c.evidence, facts: c.facts, strength: c.strength, log: old?.log || [],
  };
  lead.score = scoreOf(lead);
  note(lead, 'chief', tr({ en: `The Editor crosses ${q(a.subject)} with ${q(b.subject)}.`, it: `Il direttore incrocia ${q(a.subject)} con ${q(b.subject)}.` }), now);
  for (const l of [a, b]) { note(l, 'chief', tr({ en: `Crossed with ${q(l === a ? b.subject : a.subject)}.`, it: `Incrociata con ${q(l === a ? b.subject : a.subject)}.` }), now); store.saveLead(l); }
  store.saveLead(lead);
  say(store, 'spotlight', tr({ en: `Spotlight: two leads crossed — ${c.subject}.`, it: `Spotlight: due piste incrociate — ${c.subject}.` }), now);
  return lead;
}

/** Leads searched by words (opened on a tip, or widened): the reporters search again every round. */
export function searchCandidates(store, leads, now = Date.now()) {
  const out = [];
  for (const l of leads.filter((x) => ACTIVE.includes(x.status) && x.kind === 'tip' && x.keywords?.length)) {
    const { evidence, numbers } = search(store, l.keywords, now);
    out.push({
      key: l.id, kind: 'tip', subject: l.subject, hypothesis: l.hypothesis,
      evidence, facts: numbers ? searchFacts(numbers, l.keywords) : l.facts,
      strength: Math.min(1, 0.35 + Math.min(0.45, evidence.length / 25)),
    });
  }
  return out;
}

// ───────────────────────── The dossier, widened ─────────────────────────

/** What the desk knows beyond the exhibits, as lines for the model (and for the reader's file). */
export function dossierExtras(store, lead, now = Date.now()) {
  const en = lang() === 'en';
  const lines = [];
  // the witnesses: the lead's own tips, those of the leads it crosses, the tips among its exhibits
  const parentsTips = (lead.links || []).flatMap((id) => store.getLead(id)?.tips || []);
  const fromEvidence = (lead.evidence || []).filter((x) => x.source === 'tip').map((x) => ({ text: x.title, ts: x.ts }));
  const tips = [...new Map([...(lead.tips || []), ...parentsTips, ...fromEvidence].map((t) => [t.text, t])).values()].sort((a, b) => a.ts - b.ts);
  if (tips.length) {
    lines.push('', en ? 'WITNESSES (tips: attribute them to "a source close to the owner"; they are true)' : 'TESTIMONI (soffiate: attribuiscile a «una fonte vicina al proprietario»; sono vere)');
    for (const t of tips) lines.push(`- ${dayKey(t.ts)} ${hhmm(t.ts)}: ${q(t.text)}`);
  }
  // what the owner told the paper's reporters on the same subject
  const said = store.items('call', { after: now - 14 * DAY, status: 'answered', limit: 80 })
    .filter((c) => c.type === 'interview' && c.answer && relevance(`${c.question} ${c.topic || ''} ${c.answer}`, lead) >= 2);
  if (said.length) {
    lines.push('', en ? 'THE OWNER TO OUR REPORTERS (real quotes; quote them verbatim)' : 'IL PROPRIETARIO AI NOSTRI CRONISTI (citazioni vere; riportale alla lettera)');
    for (const c of said.slice(-4)) lines.push(`- ${dayKey(c.answeredAt || c.ts)}: ${q(c.question)} → ${q(c.answer)}`);
  }
  if (lead.links?.length) {
    const parents = lead.links.map((id) => store.getLead(id)).filter(Boolean);
    if (parents.length) {
      lines.push('', en ? 'THE LEADS THAT CROSS HERE' : 'LE PISTE CHE QUI SI INCROCIANO');
      for (const p of parents) lines.push(`- ${p.subject} (${kindName(p.kind)}): ${p.hypothesis}`);
    }
  }
  // what the paper already printed on the subject (headlines only)
  const words = [...leadTerms(lead).subj].slice(0, 4);
  if (words.length) {
    try {
      const rows = store.db.prepare(`SELECT ref, ts, title FROM search WHERE search MATCH ? AND kind = 'article' AND ts >= ? ORDER BY ts DESC LIMIT 5`)
        .all(`title : (${words.map((w) => `"${w.replace(/"/g, '')}"*`).join(' OR ')})`, now - 14 * DAY);
      if (rows.length) {
        lines.push('', en ? 'WHAT THE PAPER ALREADY PRINTED ON IT' : 'COSA IL GIORNALE HA GIÀ STAMPATO');
        for (const r of rows.reverse()) lines.push(`- ${dayKey(r.ts)} ${hhmm(r.ts)}: ${q(r.title)}`);
      }
    } catch { /* no index */ }
  }
  return lines.join('\n');
}

export { exhibit };
