import { tr } from '../i18n.js';
import { collectAll } from '../collect.js';
import { printEdition } from './edition.js';
import { hourStart, editionId, dayKey } from '../util.js';
import { printEvening } from './evening.js';
import { recordBulletin } from './radio.js';
import { spotlightRound } from './spotlight/desk.js';
import { enrichEdition } from './extras.js';
import { interviewRound, closingRound, expireCalls, msToClosing, formingStories } from './calls.js';
import { flashRound } from './flash.js';
import { chatterRound } from './chatter.js';

const HOUR = 3600e3;

export function createNewsroom({ store, config, log = console.log, notify = null }) {
  // A single press: operations are queued, never run in parallel.
  let chain = Promise.resolve();
  const queue = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };
  const state = { busy: false, lastCollect: null, nextEdition: null };

  const busy = (fn) => async () => {
    state.busy = true;
    try { return await fn(); } finally { state.busy = false; }
  };

  const collect = () => queue(busy(async () => {
    if (config.demo) return 0;
    const n = await collectAll(store, config, log);
    state.lastCollect = Date.now();
    if (n) log(tr({ en: `[collect] ${n} new signals`, it: `[raccolta] ${n} nuovi segnali` }));
    return n;
  }));

  // the radio bulletin is recorded outside the queue: the next edition doesn't wait for it
  const radio = (ed) => {
    if (!ed) return;
    recordBulletin(ed, config, log).then((r) => {
      const fresh = r && store.getEdition(ed.id);
      if (fresh) { fresh.radio = r; store.saveEdition(fresh); }
    }).catch(() => {});
  };

  // after the press, the model adds the report cards, the gossip column and the serial (the edition doesn't wait)
  const enrich = (ed) => {
    if (!ed) return;
    queue(busy(() => enrichEdition(store, config, ed.id, { log }))).catch((e) => log(`[extras] ${e.message}`));
  };

  const printHour = (start, final, force = false) => queue(busy(async () => {
    const ed = await printEdition({ store, config, start, final, force, log });
    radio(ed);
    enrich(ed);
    return ed;
  }));

  // the newsroom at work during the hour: calls to the Editor, breaking news, the chatter
  let deskBusy = false;
  async function deskRound() {
    if (deskBusy || config.demo) return;
    deskBusy = true;
    try {
      const now = Date.now();
      expireCalls(store, now);
      flashRound(store, config, { now, notify, log });
      const { stories, line } = formingStories(store, config, now);
      chatterRound(store, { stories, now, line });
      await interviewRound(store, config, { now, notify, log });
    } catch (e) {
      log(`[desk] ${e.message}`);
    } finally {
      deskBusy = false;
    }
  }

  function scheduleClosing() {
    setTimeout(async () => {
      try {
        await collect();
        closingRound(store, config, { notify, log });
      } catch (e) {
        log(`[closing] ${e.message}`);
      }
      scheduleClosing();
    }, msToClosing(Date.now(), config.desk?.closingMinute ?? 55) + 1000);
  }

  // Spotlight works in the same queue (one model, one press), after the paper
  const spotlight = (light = false) => queue(busy(() => spotlightRound(store, config, { log, notify, light })))
    .catch((e) => log(`[spotlight] ${e.message}`));

  const printEveningFor = (day) => queue(busy(() => printEvening({ store, config, day, log })));

  /** The evening edition, if it's time and it hasn't come out yet. */
  async function eveningIfDue(force = false) {
    const h = config.edition.eveningHour;
    if (h == null) return null;
    const day = dayKey(Date.now());
    if (new Date().getHours() < h || (!force && store.getEvening(day))) return null;
    return printEveningFor(day);
  }

  async function printNow() {
    await collect();
    const start = hourStart(Date.now());
    return printHour(start, false, true);
  }

  async function backfill(hours = config.backfillHours) {
    const now = hourStart(Date.now());
    const printed = [];
    for (let h = now - hours * HOUR; h < now; h += HOUR) {
      // even an empty hour can close an edition: it gathers the quiet hours before it
      const meta = store.editionMeta(editionId(h));
      // already final, or hand-edited by the editor: leave it alone
      if (meta?.final || meta?.edited) continue;
      const ed = await printHour(h, true);
      if (ed) printed.push(ed);
    }
    return printed;
  }

  function scheduleHourly() {
    const next = hourStart(Date.now()) + HOUR + 30e3;
    state.nextEdition = next;
    setTimeout(async () => {
      try {
        await collect();
        // print the hour just closed (and, if the Mac was asleep, only the last one missed)
        const printed = await backfill();
        // once a day (on the first press of the day, even if the Mac slept through the night),
        // drop raw signals older than keepEventsDays
        const today = dayKey(Date.now());
        if (config.keepEventsDays > 0 && store.getSetting('lastPrune', null) !== today) {
          const n = store.pruneEvents(Date.now() - config.keepEventsDays * 24 * HOUR);
          store.setSetting('lastPrune', today);
          if (n) log(tr({ en: `[archive] ${n} old signals removed`, it: `[archivio] ${n} segnali vecchi rimossi` }));
        }
        if (printed.length) notify?.edition(printed.at(-1));
        // the Spotlight desk takes a look at the leads once the hour is printed
        await spotlight();
        // at 21:00 (or the chosen time) the evening edition comes out too
        if (new Date().getHours() === config.edition.eveningHour) notify?.evening(await eveningIfDue(true));
      } catch (e) {
        log(tr({ en: `[press] error: ${e.message}`, it: `[rotativa] errore: ${e.message}` }));
      }
      scheduleHourly();
    }, next - Date.now());
  }

  async function start() {
    await collect();
    scheduleHourly();
    if (!config.demo) scheduleClosing();
    setInterval(() => {
      collect().then(() => deskRound()).catch((e) => log(`[${tr({ en: 'collect', it: 'raccolta' })}] ${e.message}`));
      // a right of reply that has expired doesn't wait for the next hour
      spotlight(true);
    }, config.collectEveryMinutes * 60e3);
    backfill(config.demo ? 12 : config.backfillHours)
      .then(() => (config.demo ? printNow() : null))
      .then(() => (config.demo ? printEveningFor(dayKey(Date.now())) : eveningIfDue()))
      .then(() => spotlight())
      .catch((e) => log(`[${tr({ en: 'backfill', it: 'arretrati' })}] ${e.message}`));
  }

  return { collect, printNow, printHour, printEveningFor, backfill, start, state, spotlight, deskRound, enrich, queue };
}
