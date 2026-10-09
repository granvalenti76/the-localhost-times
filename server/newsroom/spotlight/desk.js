/**
 * The Spotlight desk: leads followed across days until they become a scoop, or go cold.
 *
 * Every hour the detectors look at the last weeks of signals. A lead gathers exhibits as they
 * come in; its score grows with the evidence (more exhibits, more days, more apps). When it
 * reaches the goal and has been followed for a while, the Spotlight editor (the model) decides
 * whether it is a story. If it is, the owner gets a right of reply; then the piece is written,
 * checked and published with the next front page. Nothing runs on a timetable: a scoop comes out
 * when a lead holds up, and most never do.
 *
 * Statuses: open → review → reply → writing → published; or cold (no new evidence), or killed
 * (by the editor-in-chief, or because the subject is delicate).
 */
import { tr } from '../../i18n.js';
import { connectLLM } from '../llm.js';
import { getLine } from '../line.js';
import { writerFor, byline } from '../writers.js';
import { cleanEvents, DeskError } from '../edition.js';
import { detect, HISTORY_DAYS, isSensitive } from './detectors.js';
import { judge, writeScoop, typesetScoop, scoopCheck, scoopWords, method, kindName } from './write.js';
import { linkCandidates, searchCandidates, tipsToLeads, dossierExtras, openFromTip, tipLead, widenLead, crossLeads, sanitize } from './cross.js';
import { dayKey } from '../../util.js';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const MIN_AGE = 3 * HOUR; // a lead is followed for at least this long before the editor weighs it
const COLD_AFTER = 3 * DAY; // no new evidence for this long: the lead goes cold
const MAX_OPEN = 12; // leads on the board at once
const ACTIVE = ['open', 'review', 'reply', 'writing'];

const clamp = (x) => Math.max(0, Math.min(1, x));

/** How strong a lead is, 0-100: exhibits, days, apps, and how unusual the detector found it. */
export function scoreOf(lead) {
  const days = new Set(lead.evidence.map((x) => dayKey(x.ts))).size;
  const sources = new Set(lead.evidence.map((x) => x.source)).size;
  return Math.round(100 * (
    0.28 * clamp(lead.evidence.length / 10)
    + 0.22 * clamp(days / 3)
    + 0.15 * clamp((sources - 1) / 2)
    + 0.35 * clamp(lead.strength)
  ));
}

const note = (lead, who, text, now = Date.now()) => {
  lead.log = [...(lead.log || []), { ts: now, who, text }].slice(-40);
};

/** The detectors' findings merged into the board: new leads, new exhibits, leads gone cold. */
export function updateLeads(store, config, candidates, now = Date.now()) {
  const goal = Math.max(30, Math.min(95, Number(config.spotlight?.goal) || 70));
  const seen = new Set();
  const changes = { opened: 0, grown: 0, cold: 0 };
  const open = store.leads({ status: ACTIVE });
  for (const c of candidates.sort((a, b) => b.strength - a.strength)) {
    if (c.error) continue;
    seen.add(c.key);
    let lead = store.getLead(c.key);
    if (lead?.status === 'killed') continue;
    if (lead?.status === 'published' && now - lead.updatedAt < 14 * DAY) continue; // already told
    if (!lead || lead.status === 'published' || lead.status === 'cold') {
      if (!lead && open.length >= MAX_OPEN) continue;
      const reopened = lead?.status === 'cold';
      lead = {
        id: c.key,
        kind: c.kind,
        subject: c.subject,
        hypothesis: c.hypothesis,
        status: 'open',
        openedAt: reopened ? lead.openedAt : now,
        updatedAt: now,
        lastEvidenceAt: now,
        passes: 0,
        goal,
        evidence: reopened ? lead.evidence : [],
        facts: c.facts,
        strength: c.strength,
        log: reopened ? lead.log : [],
        links: c.links || lead?.links || null,
        tips: lead?.tips || [],
        witnesses: lead?.witnesses || [],
      };
      note(lead, 'desk', reopened
        ? tr({ en: 'The lead is warm again: new exhibits.', it: 'La pista torna calda: nuovi reperti.' })
        : tr({ en: `Lead opened (${kindName(c.kind)}): ${c.hypothesis}`, it: `Aperta una pista (${kindName(c.kind)}): ${c.hypothesis}` }), now);
      if (!reopened) { changes.opened++; open.push(lead); }
    }
    if (!ACTIVE.includes(lead.status)) continue;
    const known = new Set(lead.evidence.map((x) => x.id));
    const fresh = c.evidence.filter((x) => !known.has(x.id));
    if (fresh.length) {
      // the witnesses (tips) always stay in the file; the signals keep the latest 30
      const all = [...lead.evidence, ...fresh];
      lead.evidence = [...all.filter((x) => x.source !== 'tip').sort((a, b) => a.ts - b.ts).slice(-30), ...all.filter((x) => x.source === 'tip')].sort((a, b) => a.ts - b.ts);
      lead.lastEvidenceAt = now;
      if (lead.passes > 0) {
        note(lead, 'reporters', tr({
          en: `${fresh.length} new exhibit${fresh.length === 1 ? '' : 's'}: ${fresh.slice(-2).map((x) => `“${x.title.slice(0, 50)}”`).join(', ')}`,
          it: `${fresh.length === 1 ? 'Un nuovo reperto' : `${fresh.length} nuovi reperti`}: ${fresh.slice(-2).map((x) => `«${x.title.slice(0, 50)}»`).join(', ')}`,
        }), now);
        changes.grown++;
      }
    }
    lead.subject = c.subject;
    lead.hypothesis = c.hypothesis;
    lead.facts = c.facts;
    if (c.links) lead.links = c.links;
    lead.strength = Math.max(lead.strength * 0.9, c.strength);
    lead.passes = (lead.passes || 0) + 1;
    lead.score = scoreOf(lead);
    lead.updatedAt = now;
    store.saveLead(lead);
  }
  // leads the detectors no longer see: they cool down
  for (const lead of store.leads({ status: ['open'] })) {
    if (seen.has(lead.id)) continue;
    if (now - (lead.lastEvidenceAt || lead.openedAt) > COLD_AFTER) {
      lead.status = 'cold';
      lead.updatedAt = now;
      note(lead, 'desk', tr({ en: 'No new evidence for three days: the lead has gone cold.', it: 'Nessun reperto nuovo da tre giorni: la pista si è raffreddata.' }), now);
      store.saveLead(lead);
      changes.cold++;
    }
  }
  // old closed leads leave the board
  store.deleteLeads(now - 30 * DAY, ['cold', 'killed']);
  return changes;
}

/** Ready for the editor: strong enough, followed long enough, and with something new since the last look. */
// a lead opened or crossed by the Editor is fast-tracked: the editor weighs it at the next round
const dueForReview = (lead, now, demo) => lead.status === 'open'
  && lead.score >= lead.goal
  && (demo || lead.chief || now - lead.openedAt >= MIN_AGE)
  && (lead.passes || 0) >= (demo || lead.chief ? 1 : 2)
  && (!lead.reviewedAt || lead.lastEvidenceAt > lead.reviewedAt);

/** The Spotlight editor weighs a lead: story or not (yet). */
async function review(store, config, lead, ctx, now) {
  lead.status = 'review';
  sanitize(lead);
  lead.extras = dossierExtras(store, lead, now);
  store.saveLead(lead);
  let verdict;
  if (ctx.llm) {
    try {
      verdict = await judge(lead, ctx);
    } catch (e) {
      ctx.log(tr({ en: `[spotlight] the editor failed (${e.message})`, it: `[spotlight] il caporedattore ha fallito (${e.message})` }));
      lead.status = 'open';
      store.saveLead(lead);
      return lead;
    }
  } else {
    // no model: the typesetting publishes only the strongest leads, on the numbers alone
    verdict = { story: lead.score >= lead.goal + 10, confidence: lead.score, sensitive: false, angle: '', headline: '', missing: tr({ en: 'more evidence', it: 'più prove' }), at: now, by: 'typesetting' };
  }
  lead.desk = verdict;
  lead.reviewedAt = now;
  lead.reviews = (lead.reviews || 0) + 1;
  if (verdict.sensitive || isSensitive(`${verdict.angle} ${verdict.headline}`)) {
    lead.status = 'killed';
    note(lead, 'editor', tr({ en: 'Dropped: the subject is too personal to print.', it: 'Scartata: l\'argomento è troppo personale per essere stampato.' }), now);
  } else if (verdict.story && verdict.confidence >= 60) {
    const wait = Math.max(0, Number(config.spotlight?.replyMinutes ?? 60));
    note(lead, 'editor', tr({
      en: `It's a story (${verdict.confidence}%). ${verdict.angle}`,
      it: `È una storia (${verdict.confidence}%). ${verdict.angle}`,
    }), now);
    if (wait && !config.demo) {
      lead.status = 'reply';
      lead.reply = { askedAt: now, deadline: now + wait * 60e3, text: null };
      note(lead, 'desk', tr({ en: `Asked the owner for a comment: ${wait} minutes to reply.`, it: `Chiesto un commento al proprietario: ${wait} minuti per rispondere.` }), now);
      ctx.notify?.spotlightReply?.(lead);
    } else {
      lead.status = 'writing';
      lead.reply = { askedAt: now, deadline: now, text: null };
    }
  } else {
    lead.status = 'open';
    lead.goal = Math.min(95, lead.goal + 8); // ask for more before looking again
    note(lead, 'editor', tr({
      en: `Not yet (${verdict.confidence}%).${verdict.missing ? ` Missing: ${verdict.missing.replace(/^(missing|manca)\s*:?\s*/i, '')}` : ''}`,
      it: `Non ancora (${verdict.confidence}%).${verdict.missing ? ` Manca: ${verdict.missing.replace(/^(manca|missing)\s*:?\s*/i, '')}` : ''}`,
    }), now);
  }
  lead.updatedAt = now;
  store.saveLead(lead);
  return lead;
}

/** Writes, checks and publishes a scoop; it goes on the latest front page of the day. */
async function publish(store, config, lead, ctx, now) {
  lead.status = 'writing';
  sanitize(lead);
  lead.extras = dossierExtras(store, lead, now);
  store.saveLead(lead);
  const writer = writerFor(ctx.line, 'spotlight');
  let text = null;
  let by = 'typesetting';
  if (ctx.llm) {
    try {
      text = await writeScoop(lead, ctx, writer);
      by = ctx.llm.model;
    } catch (e) {
      ctx.log(tr({ en: `[spotlight] the writer failed (${e.message}), typesetting takes over`, it: `[spotlight] il redattore ha fallito (${e.message}), passa la tipografia` }));
    }
  }
  text ||= typesetScoop(lead);
  const check = scoopCheck(text, lead);
  const scoop = store.saveScoop({
    leadId: lead.id,
    kind: lead.kind,
    subject: lead.subject,
    ...text,
    exhibits: lead.evidence,
    facts: lead.facts,
    method: method(lead),
    reply: lead.reply?.text ? { text: lead.reply.text, at: lead.reply.at } : null,
    byline: by === 'typesetting' ? null : byline(writer),
    writer: by,
    check,
    words: scoopWords(text),
    investigatedFrom: lead.openedAt,
    publishedAt: now,
    editionId: null,
  });
  // on the front page: the latest edition of today, or the next one
  const latest = store.latestEdition();
  if (latest && dayKey(latest.hour ?? latest.start) === dayKey(now) && !latest.spotlight) {
    latest.spotlight = teaser(scoop);
    store.saveEdition(latest);
    scoop.editionId = latest.id;
  } else {
    store.setSetting('spotlightPending', scoop.id);
  }
  store.saveScoop(scoop);
  lead.status = 'published';
  lead.scoopId = scoop.id;
  lead.updatedAt = now;
  note(lead, 'desk', tr({ en: `Published: “${scoop.headline}”.`, it: `Pubblicata: «${scoop.headline}».` }), now);
  store.saveLead(lead);
  ctx.log(tr({ en: `[spotlight] scoop: “${scoop.headline}” (${scoop.words} words, ${lead.evidence.length} exhibits)`, it: `[spotlight] esclusiva: «${scoop.headline}» (${scoop.words} parole, ${lead.evidence.length} reperti)` }));
  ctx.notify?.spotlight?.(scoop);
  return scoop;
}

/** What the front page shows of a scoop. */
export const teaser = (s) => ({
  id: s.id,
  kicker: s.kicker,
  headline: s.headline,
  dek: s.dek,
  exhibits: s.exhibits.length,
  days: s.method.days,
  words: s.words,
  byline: s.byline,
  publishedAt: s.publishedAt,
});

/** A scoop published between two editions goes on the next front page. */
export function pendingScoop(store, editionId) {
  const id = store.getSetting('spotlightPending', null);
  if (!id) return null;
  store.setSetting('spotlightPending', null);
  const s = store.getScoop(id);
  if (!s) return null;
  store.saveScoop({ ...s, editionId });
  return teaser(s);
}

/** After a restart: a lead left "under review" goes back to the board. */
export function recoverLeads(store) {
  for (const l of store.leads({ status: ['review'] })) store.saveLead({ ...l, status: 'open', updatedAt: Date.now() });
}

/**
 * One round of the desk: detectors, then at most one review and one piece (the model is slow,
 * and the hourly paper comes first). `light` skips the detectors: only replies that are due.
 */
export async function spotlightRound(store, config, { log = console.log, notify = null, now = Date.now(), light = false } = {}) {
  if (config.spotlight?.enabled === false) return { off: true };
  const ctx = { store, config, log, notify, line: getLine(store), llm: null };
  const result = { changes: null, reviewed: null, published: null };
  if (!light) {
    const events = cleanEvents(store.eventsBetween(now - HISTORY_DAYS * DAY, now), config);
    // delicate tips and words left in a file (by an older version) are cleaned out at every round
    for (const l of store.leads({ status: ACTIVE })) {
      const before = JSON.stringify([l.tips, l.keywords, l.evidence.length]);
      sanitize(l);
      if (JSON.stringify([l.tips, l.keywords, l.evidence.length]) !== before) store.saveLead(l);
    }
    const live = store.leads({ status: ACTIVE });
    // the detectors, the crossings between open leads, the leads searched by words (the Editor's tips)
    const candidates = [...detect(events, now), ...linkCandidates(live), ...searchCandidates(store, live, now)];
    for (const c of candidates.filter((x) => x.error)) log(`[spotlight] ${c.error}`);
    result.changes = updateLeads(store, config, candidates, now);
    // the tips in the box that speak of an open lead join it as witnesses
    result.changes.witnesses = tipsToLeads(store, now);
    store.setSetting('spotlightRun', { at: now, events: events.length, candidates: candidates.length });
  }
  const due = store.leads({ status: ['reply', 'writing'] })
    .filter((l) => l.status === 'writing' || (l.reply && (l.reply.text || now >= l.reply.deadline)))
    .sort((a, b) => a.updatedAt - b.updatedAt)[0];
  const toReview = light ? null : store.leads({ status: ['open'] }).filter((l) => dueForReview(l, now, config.demo)).sort((a, b) => b.score - a.score)[0];
  if (due || toReview) ctx.llm = await connectLLM(config);
  if (toReview) {
    const l = await review(store, config, toReview, ctx, now);
    result.reviewed = { id: l.id, status: l.status };
    if (l.status === 'writing') result.published = await publish(store, config, l, ctx, now);
  }
  if (due && !result.published) result.published = await publish(store, config, due, ctx, now);
  return result;
}

/** The board, for the newsroom: what the reporters are working on, and how far along. */
export function board(store, config) {
  const leads = store.leads({ limit: 60 });
  const order = { reply: 0, writing: 1, review: 2, open: 3, published: 4, cold: 5, killed: 6 };
  const shown = leads
    .filter((l) => ACTIVE.includes(l.status) || Date.now() - l.updatedAt < 7 * DAY)
    .sort((a, b) => order[a.status] - order[b.status] || b.score - a.score)
    .map((l) => ({
      id: l.id,
      kind: l.kind,
      kindName: kindName(l.kind),
      subject: l.subject,
      hypothesis: l.hypothesis,
      status: l.status,
      score: l.score,
      goal: l.goal,
      progress: Math.min(1, (l.score || 0) / (l.goal || 70)),
      exhibits: l.evidence.length,
      days: new Set(l.evidence.map((x) => dayKey(x.ts))).size,
      sources: [...new Set(l.evidence.map((x) => x.source))],
      openedAt: l.openedAt,
      updatedAt: l.updatedAt,
      lastEvidenceAt: l.lastEvidenceAt,
      evidence: l.evidence.slice(-12),
      facts: l.facts,
      desk: l.desk || null,
      reply: l.reply || null,
      log: (l.log || []).slice(-12),
      scoopId: l.scoopId || null,
      chief: !!l.chief,
      keywords: (l.keywords || []).filter((k) => k.trim().split(/\s+/).length <= 3 && !isSensitive(k)),
      tips: (l.tips || []).map((t) => ({ text: t.text, ts: t.ts })),
      links: (l.links || []).map((id) => { const p = store.getLead(id); return p ? { id, subject: p.subject, status: p.status } : null; }).filter(Boolean),
    }));
  return {
    enabled: config.spotlight?.enabled !== false,
    replyMinutes: config.spotlight?.replyMinutes ?? 60,
    run: store.getSetting('spotlightRun', null),
    leads: shown,
    counts: Object.fromEntries(Object.keys(order).map((k) => [k, leads.filter((l) => l.status === k).length])),
    scoops: store.scoops({ limit: 5 }).map(teaser),
  };
}

/** The editor-in-chief's moves on a lead: reply, publish without waiting, push, kill. */
export function leadAction(store, id, { action, text } = {}) {
  const lead = store.getLead(id);
  if (!lead) throw new DeskError(tr({ en: 'Lead not found.', it: 'Pista non trovata.' }), 404);
  const now = Date.now();
  if (action === 'kill') {
    if (lead.status === 'published') throw new DeskError(tr({ en: 'Already published.', it: 'Già pubblicata.' }), 409);
    lead.status = 'killed';
    note(lead, 'chief', tr({ en: 'Killed by the editor-in-chief.', it: 'Fermata dal direttore.' }), now);
  } else if (action === 'reply') {
    if (lead.status !== 'reply') throw new DeskError(tr({ en: 'This lead is not waiting for a reply.', it: 'Questa pista non aspetta una replica.' }), 409);
    const t = String(text || '').trim().slice(0, 600);
    if (!t) throw new DeskError(tr({ en: 'Write the reply.', it: 'Scrivi la replica.' }), 400);
    lead.reply = { ...lead.reply, text: t, at: now };
    note(lead, 'owner', tr({ en: `The owner replied: “${t}”`, it: `Il proprietario ha replicato: «${t}»` }), now);
  } else if (action === 'publish') {
    if (lead.status !== 'reply') throw new DeskError(tr({ en: 'This lead is not waiting for a reply.', it: 'Questa pista non aspetta una replica.' }), 409);
    lead.reply = { ...lead.reply, deadline: now };
    note(lead, 'chief', tr({ en: 'No comment: to press.', it: 'Nessun commento: si va in stampa.' }), now);
  } else if (action === 'push') {
    if (lead.status !== 'open') throw new DeskError(tr({ en: 'Only an open lead can be pushed.', it: 'Si può spingere solo una pista aperta.' }), 409);
    // the editor-in-chief wants it looked at now: the next round weighs it, whatever the score
    lead.goal = Math.min(lead.goal, lead.score || 0);
    lead.openedAt = Math.min(lead.openedAt, now - MIN_AGE);
    lead.passes = Math.max(lead.passes || 0, 2);
    lead.reviewedAt = null;
    note(lead, 'chief', tr({ en: 'The editor-in-chief wants a decision on this one.', it: 'Il direttore vuole una decisione su questa.' }), now);
  } else if (action === 'tip') {
    return tipLead(store, id, text, now);
  } else if (action === 'widen') {
    return widenLead(store, id, text, now);
  } else if (action === 'cross') {
    return crossLeads(store, id, String(text || ''), now);
  } else {
    throw new DeskError(tr({ en: 'Unknown action.', it: 'Azione sconosciuta.' }), 400);
  }
  lead.updatedAt = now;
  store.saveLead(lead);
  return lead;
}

/** The Editor hands Spotlight a tip: a lead of its own, searched in the archive, fast-tracked. */
export const leadFromTip = (store, config, body, now = Date.now()) => openFromTip(store, config, body, now);
