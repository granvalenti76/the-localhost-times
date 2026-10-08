import { collectAll } from '../collect.js';
import { printEdition } from './edition.js';
import { hourStart, editionId } from '../util.js';

const HOUR = 3600e3;

export function createNewsroom({ store, config, log = console.log }) {
  // Una sola rotativa: le operazioni vanno in fila, mai in parallelo.
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
    if (n) log(`[raccolta] ${n} nuovi segnali`);
    return n;
  }));

  const printHour = (start, final) => queue(busy(() => printEdition({ store, config, start, final, log })));

  async function printNow() {
    await collect();
    const start = hourStart(Date.now());
    return printHour(start, false);
  }

  async function backfill(hours = config.backfillHours) {
    const now = hourStart(Date.now());
    const times = store.eventTimesSince(now - hours * HOUR);
    const withEvents = new Set(times.map(hourStart));
    for (let h = now - hours * HOUR; h < now; h += HOUR) {
      if (!withEvents.has(h)) continue;
      if (store.editionMeta(editionId(h))?.final) continue;
      await printHour(h, true);
    }
  }

  function scheduleHourly() {
    const next = hourStart(Date.now()) + HOUR + 30e3;
    state.nextEdition = next;
    setTimeout(async () => {
      try {
        await collect();
        await printHour(hourStart(Date.now()) - HOUR, true);
      } catch (e) {
        log(`[rotativa] errore: ${e.message}`);
      }
      scheduleHourly();
    }, next - Date.now());
  }

  async function start() {
    await collect();
    scheduleHourly();
    setInterval(() => collect().catch((e) => log(`[raccolta] ${e.message}`)), config.collectEveryMinutes * 60e3);
    backfill()
      .then(() => (config.demo ? printNow() : null))
      .catch((e) => log(`[arretrati] ${e.message}`));
  }

  return { collect, printNow, printHour, backfill, start, state };
}
