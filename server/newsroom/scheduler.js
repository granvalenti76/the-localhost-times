import { collectAll } from '../collect.js';
import { printEdition } from './edition.js';
import { hourStart, editionId, dayKey } from '../util.js';
import { printEvening } from './evening.js';

const HOUR = 3600e3;

export function createNewsroom({ store, config, log = console.log, notify = null }) {
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

  const printHour = (start, final, force = false) => queue(busy(() => printEdition({ store, config, start, final, force, log })));

  const printEveningFor = (day) => queue(busy(() => printEvening({ store, config, day, log })));

  /** L'edizione della sera, se è ora e non è ancora uscita. */
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
      // anche un'ora vuota può chiudere un'edizione: raccoglie le ore tranquille prima di lei
      const meta = store.editionMeta(editionId(h));
      // già definitiva, oppure ritoccata a mano dal direttore: non la tocchiamo
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
        // stampa l'ora appena chiusa (e, se il Mac era in stop, solo l'ultima persa)
        const printed = await backfill();
        if (printed.length) notify?.edition(printed.at(-1));
        // alle 21 (o all'ora scelta) esce anche l'edizione della sera
        if (new Date().getHours() === config.edition.eveningHour) notify?.evening(await eveningIfDue(true));
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
    backfill(config.demo ? 12 : config.backfillHours)
      .then(() => (config.demo ? printNow() : null))
      .then(() => (config.demo ? printEveningFor(dayKey(Date.now())) : eveningIfDue()))
      .catch((e) => log(`[arretrati] ${e.message}`));
  }

  return { collect, printNow, printHour, printEveningFor, backfill, start, state };
}
