/**
 * How often the paper comes out: once a day (the default: every morning at 7:00), once a week, or
 * every hour. Chosen in the Settings and stored with the editorial line. Everything that used
 * to assume "the hour" asks here instead: which edition is in the works, when the press runs,
 * how far back an edition reaches, when the reporters draft and when the desk closes.
 *
 * An edition keeps the id of the hour before its press (an hourly edition printed at 15:00 is
 * "…T14"; a daily paper printed at 19:00 is "…T18"), so archives, links and the timeline keep
 * working whatever the cadence.
 */
import { hourStart, editionId } from '../util.js';
import { tr } from '../i18n.js';

const HOUR = 3600e3;
const DAY = 24 * HOUR;

export const CADENCES = ['hourly', 'daily', 'weekly'];

export const DEFAULT_CADENCE = {
  kind: 'daily',   // the morning paper: yesterday, told over breakfast
  pressHour: 7,    // daily and weekly: when the paper goes to press
  weekday: 0,      // weekly: the day it comes out (0 = Sunday)
};

/** The cadence of a line, cleaned up (a line without one gets the morning paper). */
export function cadenceOf(line) {
  const c = { ...DEFAULT_CADENCE, ...(line?.cadence || {}) };
  if (!CADENCES.includes(c.kind)) c.kind = DEFAULT_CADENCE.kind;
  c.pressHour = Math.max(0, Math.min(23, Math.round(Number(c.pressHour)) || 0));
  c.weekday = Math.max(0, Math.min(6, Math.round(Number(c.weekday)) || 0));
  return c;
}

const at = (ms, h) => { const d = new Date(ms); d.setHours(h, 0, 0, 0); return d.getTime(); };

/** The next press after `now` (hourly: the top of the next hour). */
export function nextPress(cad, now = Date.now()) {
  if (cad.kind === 'hourly') return hourStart(now) + HOUR;
  let t = at(now, cad.pressHour);
  if (cad.kind === 'daily') return t > now ? t : at(t + DAY + HOUR, cad.pressHour);
  while (new Date(t).getDay() !== cad.weekday || t <= now) t = at(t + DAY + HOUR, cad.pressHour);
  return t;
}

/** The last press at or before `now`. */
export function lastPress(cad, now = Date.now()) {
  if (cad.kind === 'hourly') return hourStart(now);
  const step = cad.kind === 'daily' ? DAY : 7 * DAY;
  return at(nextPress(cad, now) - step + HOUR, cad.pressHour);
}

/** The hour an edition is filed under: the hour before its press. */
export const workHour = (cad, now = Date.now()) => nextPress(cad, now) - HOUR;

/** The edition the next press will print. */
export const workId = (cad, now = Date.now()) => editionId(workHour(cad, now));

/** How many hours an edition may reach back (quiet hourly editions merge, up to the config's limit). */
export function spanHours(cad, config) {
  if (cad.kind === 'daily') return 24;
  if (cad.kind === 'weekly') return 7 * 24;
  return Math.max(1, config.edition?.maxMergeHours || 1);
}

/** How the riunione's strictness changes the size of the paper. */
const STRICT = { loose: 1.3, balanced: 1, strict: 0.7 };

/** How many pieces go in the paper. */
export function maxArticlesFor(cad, config, strictness = 'balanced') {
  const base = config.edition?.maxArticles || 9;
  const n = cad.kind === 'daily' ? base + 3 : cad.kind === 'weekly' ? Math.max(6, base - 1) : base;
  return Math.max(3, Math.round(n * (STRICT[strictness] ?? 1)));
}

/** A daily paper has room for longer pieces; a weekly one for long reads. */
export const lengthBoost = (cad) => (cad.kind === 'daily' ? 1.3 : cad.kind === 'weekly' ? 1.7 : 1);

/**
 * When the reporters draft the next edition: hourly at the configured minutes (:20, :40); a daily
 * paper three hours and one hour before the press; a weekly one the day before and three hours
 * before. Each round has a key (stored once it ran) and its time.
 */
export function draftTimes(cad, config, press) {
  if (cad.kind === 'hourly') {
    const hour = press - HOUR;
    return (config.desk?.rounds ?? [20, 40]).filter((m) => m > 0 && m < 60).sort((a, b) => a - b)
      .map((m) => ({ key: m, minute: m, at: hour + m * 60e3 }));
  }
  const before = cad.kind === 'daily' ? [3, 1] : [26, 3];
  return before.map((h) => ({ key: press - h * HOUR, at: press - h * HOUR }));
}

/** Is an evening edition part of this paper? Only the hourly one has a day to sum up. */
export const hasEvening = (cad) => cad.kind === 'hourly';

/** What the paper covers, for the writers' instructions. */
export function periodText(cad) {
  return cad.kind === 'daily'
    ? tr({ en: 'in the last day', it: 'nell\'ultimo giorno' })
    : cad.kind === 'weekly'
      ? tr({ en: 'in the last week', it: 'nell\'ultima settimana' })
      : tr({ en: 'in the last hour', it: 'nell\'ultima ora' });
}

/** The name of the paper's format. */
export function cadenceName(cad) {
  return cad.kind === 'daily'
    ? tr({ en: 'The Daily', it: 'Il Quotidiano' })
    : cad.kind === 'weekly'
      ? tr({ en: 'The Weekly', it: 'Il Settimanale' })
      : tr({ en: 'Every hour', it: 'Ogni ora' });
}
