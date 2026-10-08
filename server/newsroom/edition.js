import { buildStories, factSheet } from './cluster.js';
import { SECTIONS, SECTION_ORDER } from './sections.js';
import { fallbackArticle, fallbackBrief, fallbackSummary } from './fallback.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { articlePrompt, summaryPrompt } from './prompts.js';
import { editionId, hhmm, mapLimit } from '../util.js';

const HOUR = 3600e3;

function sourcesOf(story) {
  return story.events.slice(0, 40).map((e) => ({
    ts: e.ts,
    kind: e.kind,
    title: e.title,
    detail: e.detail,
    host: e.meta?.host ?? null,
  }));
}

function validArticle(a) {
  return a && typeof a.headline === 'string' && a.headline.trim()
    && Array.isArray(a.body) && a.body.length && a.body.every((p) => typeof p === 'string');
}

async function writeArticle(story, llm, config, hourLabel, log) {
  let text = null;
  if (llm) {
    try {
      const raw = await chat(llm, config, articlePrompt(story, factSheet(story), hourLabel));
      const j = parseJson(raw);
      if (validArticle(j)) {
        text = {
          kicker: String(j.kicker || story.section).slice(0, 40),
          headline: j.headline.trim(),
          dek: String(j.dek || '').trim(),
          body: j.body.map((p) => p.trim()).filter(Boolean),
          writer: llm.model,
        };
      } else throw new Error('JSON incompleto');
    } catch (e) {
      log(`[redazione] ${story.id}: il redattore ha fallito (${e.message}), passa la tipografia`);
    }
  }
  text ||= fallbackArticle(story);
  return {
    id: story.id,
    source: story.source,
    section: story.section,
    slug: SECTIONS[story.source].slug,
    kind: story.kind,
    weight: Math.round(story.weight * 100) / 100,
    first: story.first,
    last: story.last,
    ...text,
    sources: sourcesOf(story),
  };
}

function computeStats(events, start) {
  const bySource = {};
  for (const id of SECTION_ORDER) bySource[id] = 0;
  const bins = Array.from({ length: 12 }, () => 0);
  for (const e of events) {
    bySource[e.source] = (bySource[e.source] || 0) + 1;
    const b = Math.min(11, Math.max(0, Math.floor((e.ts - start) / (5 * 60e3))));
    bins[b]++;
  }
  return {
    total: events.length,
    bySource,
    bins,
    searches: events.filter((e) => e.kind === 'search').length,
    mailsIn: events.filter((e) => e.source === 'mail' && e.kind === 'received').length,
    mailsOut: events.filter((e) => e.source === 'mail' && e.kind === 'sent').length,
    commands: bySource.terminal || 0,
  };
}

/**
 * Stampa l'edizione per l'ora che comincia in `start`.
 * Ritorna null se nell'ora non è successo nulla.
 */
export async function printEdition({ store, config, start, final = true, log = console.log }) {
  const end = start + HOUR;
  const events = store.eventsBetween(start, end);
  if (!events.length) return null;

  const stories = buildStories(events);
  const max = config.edition.maxArticles;
  const main = stories.slice(0, max);
  const rest = stories.slice(max);
  const hourLabel = hhmm(start);

  const llm = await connectLLM(config);
  log(`[redazione] edizione ${editionId(start)}: ${events.length} eventi, ${stories.length} storie, redattore ${llm ? llm.model : 'offline → tipografia'}`);

  const articles = await mapLimit(main, llm ? config.llm.concurrency : 8,
    (s) => writeArticle(s, llm, config, hourLabel, log));
  const briefs = rest.map((s) => ({ section: s.section, slug: SECTIONS[s.source].slug, ts: s.last, text: fallbackBrief(s) }));

  let summary = null;
  if (llm && articles.some((a) => a.writer !== 'tipografia')) {
    try {
      const j = parseJson(await chat(llm, config, summaryPrompt(articles, events.length, hourLabel), 500));
      if (typeof j.summary === 'string' && j.summary.trim()) summary = j.summary.trim();
    } catch (e) {
      log(`[redazione] punto di prima pagina: ${e.message}`);
    }
  }
  summary ||= fallbackSummary(articles, events.length);

  const edition = {
    id: editionId(start),
    start,
    end,
    final,
    number: store.editionNumber(start),
    createdAt: Date.now(),
    writer: llm ? llm.model : 'tipografia',
    summary,
    articles,
    briefs,
    stats: computeStats(events, start),
    sections: SECTION_ORDER.filter((s) => events.some((e) => e.source === s)).map((s) => SECTIONS[s]),
  };
  store.saveEdition(edition);
  return edition;
}
