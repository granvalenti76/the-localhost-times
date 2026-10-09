/**
 * After the press: what the model adds once the edition is already on the newsstand, so that the
 * edition never waits for it. The report cards in the voice of a sports paper, the gossip column,
 * the serial's new episode. Each step is optional and independent.
 */
import { tr } from '../i18n.js';
import { connectLLM, chat, parseJson } from './llm.js';
import { getLine, featureOn } from './line.js';
import { cardsPrompt } from './sport.js';
import { rumourPrompt } from './tips.js';
import { writeEpisode, episodeTeaser } from './serial.js';

/** Re-read the edition, change it, save it (it may have been edited in the meantime). */
function patch(store, id, fn) {
  const ed = store.getEdition(id);
  if (!ed) return null;
  fn(ed);
  store.saveEdition(ed);
  return ed;
}

export async function enrichEdition(store, config, id, { log = () => {} } = {}) {
  const ed = store.getEdition(id);
  if (!ed) return null;
  const line = getLine(store);
  const llm = await connectLLM(config);
  if (!llm) return ed;

  if (ed.sport?.cards?.length && !ed.sport.by && featureOn(line, 'sport')) {
    try {
      const j = parseJson(await chat(llm, config, cardsPrompt(ed.sport.cards, line), 900));
      const lines = j.lines || {};
      patch(store, id, (e) => {
        if (!e.sport) return;
        e.sport.cards = e.sport.cards.map((c) => (typeof lines[c.id] === 'string' && lines[c.id].trim() ? { ...c, line: lines[c.id].trim().slice(0, 160) } : c));
        e.sport.by = llm.model;
      });
    } catch (e) {
      log(tr({ en: `[sport] report cards: ${e.message}`, it: `[sport] pagelle: ${e.message}` }));
    }
  }

  if (ed.rumours?.length && !ed.rumours.some((r) => r.by) && featureOn(line, 'tips')) {
    try {
      const j = parseJson(await chat(llm, config, rumourPrompt(ed.rumours), 900));
      const lines = Array.isArray(j.lines) ? j.lines : [];
      patch(store, id, (e) => {
        e.rumours = (e.rumours || []).map((r, i) => (typeof lines[i] === 'string' && lines[i].trim() ? { ...r, line: lines[i].trim().slice(0, 300), by: llm.model } : r));
      });
    } catch (e) {
      log(tr({ en: `[tips] gossip column: ${e.message}`, it: `[soffiate] indiscrezioni: ${e.message}` }));
    }
  }

  if (!ed.serial && featureOn(line, 'serial')) {
    try {
      const ep = await writeEpisode(store, config, ed, { log });
      if (ep) patch(store, id, (e) => { e.serial = episodeTeaser(ep); });
    } catch (e) {
      log(tr({ en: `[serial] ${e.message}`, it: `[feuilleton] ${e.message}` }));
    }
  }
  return store.getEdition(id);
}
