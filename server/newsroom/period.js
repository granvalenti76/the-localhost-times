/**
 * The span an edition covers, for the automatic typesetting's phrases ("the exchange of the
 * day"). Kept current by getLine (line.js), as the managing editor is.
 */
let kind = 'daily';

export const setPeriod = (k) => { kind = k || 'daily'; };

const OF = {
  en: { hourly: 'of the hour', daily: 'of the day', weekly: 'of the week' },
  it: { hourly: 'dell\'ora', daily: 'della giornata', weekly: 'della settimana' },
};
const IN = {
  en: { hourly: 'in the hour', daily: 'in the day', weekly: 'in the week' },
  it: { hourly: 'nell\'ora', daily: 'nella giornata', weekly: 'nella settimana' },
};
const A = {
  en: { hourly: 'in an hour', daily: 'in a day', weekly: 'in a week' },
  it: { hourly: 'in un\'ora', daily: 'in un giorno', weekly: 'in una settimana' },
};
const THIS = {
  en: { hourly: 'this hour', daily: 'today', weekly: 'this week' },
};

/** "of the hour" / "della giornata"… */
export const ofPeriod = (lang) => OF[lang][kind] || OF[lang].daily;
/** "in the hour" / "nella giornata"… */
export const inPeriod = (lang) => IN[lang][kind] || IN[lang].daily;
/** "in an hour" / "in un giorno"… */
export const aPeriod = (lang) => A[lang][kind] || A[lang].daily;
/** "this hour" / "today" / "this week" */
export const thisPeriod = () => THIS.en[kind] || THIS.en.daily;
