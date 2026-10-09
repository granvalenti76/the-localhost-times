/**
 * Calendar: the appointments of the hour, from the Calendar app's own database. They are
 * context more than news: the newsroom knows that the hour of YouTube was the hour of the
 * meeting. Recurring events are read from the occurrence cache, so the weekly standup counts.
 *
 * Titles that touch on delicate matters (health, money, love, faith, the law…) reach the paper
 * only as "a private appointment". Birthdays and holiday calendars are left out.
 */
import { tr } from '../i18n.js';
import { home, fileState, withSnapshot, tables, columns, cdToMs, msToCd } from '../util.js';
import { isSensitive } from '../newsroom/spotlight/detectors.js';

const FILES = [
  home('Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb'),
  home('Library/Calendars/Calendar.sqlitedb'),
];
const SKIP_CALENDARS = /birthday|compleann|festivit|holiday|feste|siri|suggest|found in/i;

function locate() {
  for (const f of FILES) if (fileState(f) === 'ok') return { file: f, state: 'ok' };
  return { file: FILES[0], state: fileState(FILES[0]) };
}

/** A title fit for the paper: delicate ones become "a private appointment". */
export const publicTitle = (t) => {
  const s = String(t || '').trim();
  if (!s) return tr({ en: 'An appointment', it: 'Un impegno' });
  return isSensitive(s) ? tr({ en: 'A private appointment', it: 'Un impegno privato' }) : s.slice(0, 160);
};

export default {
  id: 'calendar',
  get label() { return tr({ en: 'Calendar', it: 'Calendario' }); },
  experimental: true,
  fingerprint: false, // an appointment starts without the database changing
  everyMinutes: 10,
  locate,

  collect({ since }) {
    const { file } = locate();
    return withSnapshot(file, (db) => {
      const t = tables(db);
      if (!t.includes('CalendarItem')) throw new Error(tr({ en: 'Unrecognised Calendar schema', it: 'Schema del Calendario non riconosciuto' }));
      const ci = columns(db, 'CalendarItem');
      const hasCal = t.includes('Calendar') && ci.includes('calendar_id');
      const calJoin = hasCal ? 'LEFT JOIN Calendar c ON c.ROWID = i.calendar_id' : '';
      const calSel = hasCal ? 'c.title AS calendar' : 'NULL AS calendar';
      const notReminder = ci.includes('entity_type') ? 'AND (i.entity_type IS NULL OR i.entity_type != 3)' : '';
      const notHidden = ci.includes('hidden') ? 'AND (i.hidden IS NULL OR i.hidden = 0)' : '';
      const allDay = ci.includes('all_day') ? 'i.all_day' : '0';
      const now = msToCd(Date.now());
      let rows;
      const oc = t.includes('OccurrenceCache') ? columns(db, 'OccurrenceCache') : [];
      if (oc.includes('event_id') && oc.includes('occurrence_date')) {
        // every occurrence, recurring ones included; the end is the start plus the event's length
        const start = oc.includes('occurrence_start_date') ? 'COALESCE(o.occurrence_start_date, o.occurrence_date)' : 'o.occurrence_date';
        rows = db.prepare(
          `SELECT i.ROWID AS id, i.summary AS title, ${start} AS start, ${start} + (i.end_date - i.start_date) AS end,
                  ${allDay} AS allDay, ${calSel}
           FROM OccurrenceCache o JOIN CalendarItem i ON i.ROWID = o.event_id ${calJoin}
           WHERE ${start} > ? AND ${start} <= ? ${notReminder} ${notHidden}
           ORDER BY start`
        ).all(msToCd(since), now);
      } else {
        rows = db.prepare(
          `SELECT i.ROWID AS id, i.summary AS title, i.start_date AS start, i.end_date AS end, ${allDay} AS allDay, ${calSel}
           FROM CalendarItem i ${calJoin}
           WHERE i.start_date > ? AND i.start_date <= ? ${notReminder} ${notHidden}
           ORDER BY i.start_date`
        ).all(msToCd(since), now);
      }
      const events = [];
      const seen = new Set();
      for (const r of rows) {
        if (r.calendar && SKIP_CALENDARS.test(r.calendar)) continue;
        const ts = cdToMs(r.start);
        const key = `${r.id}:${Math.round(r.start)}`;
        if (seen.has(key) || !Number.isFinite(ts)) continue;
        seen.add(key);
        const end = cdToMs(r.end);
        events.push({
          id: `calendar:${key}`,
          source: 'calendar',
          kind: r.allDay ? 'day' : 'appointment',
          ts,
          title: publicTitle(r.title),
          detail: null,
          url: null,
          meta: { end: Number.isFinite(end) && end > ts ? end : ts + 3600e3, minutes: Number.isFinite(end) && end > ts ? Math.round((end - ts) / 60e3) : null, private: isSensitive(r.title || '') || undefined },
        });
      }
      return { events };
    });
  },
};
