import path from 'node:path';
import { home, listDir, fileState, withSnapshot, columns, tables } from '../util.js';

const MAIL = home('Library/Mail');

function locateEnvelope() {
  const { state, entries } = listDir(MAIL);
  if (state !== 'ok') return { file: path.join(MAIL, 'V?/MailData/Envelope Index'), state };
  const versions = entries
    .filter((e) => e.isDirectory() && /^V\d+$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  for (const v of versions) {
    const file = path.join(MAIL, v, 'MailData', 'Envelope Index');
    const st = fileState(file);
    if (st !== 'missing') return { file, state: st };
  }
  return { file: path.join(MAIL, 'V?/MailData/Envelope Index'), state: 'missing' };
}

const SENT = /sent|inviat|envoy|gesendet|enviad/i;
const SKIP = /junk|spam|trash|deleted|cestino|indesiderat|draft|bozze|outbox|in uscita/i;
const NEWSLETTER = /no-?reply|newsletter|news@|notification|notifiche|mailer|marketing|updates?@|digest|info@|hello@|team@/i;

function mailboxName(url) {
  if (!url) return null;
  try { return decodeURIComponent(url.split('/').pop()); } catch { return url.split('/').pop(); }
}

export default {
  id: 'mail',
  label: 'Mail',
  locate: locateEnvelope,

  collect({ since, config }) {
    const { file } = locateEnvelope();
    const blocked = (config.privacy.blockedMailSenders || []).map((s) => s.toLowerCase());
    return withSnapshot(file, (db) => {
      const mc = columns(db, 'messages');
      const tbs = tables(db);
      const withSummary = config.privacy.mailIncludeSummary && mc.includes('summary') && tbs.includes('summaries');
      const sel = [
        'm.ROWID AS id',
        'm.date_received AS dr',
        mc.includes('date_sent') ? 'm.date_sent AS ds' : 'NULL AS ds',
        mc.includes('read') ? 'm.read AS read' : 'NULL AS read',
        mc.includes('flagged') ? 'm.flagged AS flagged' : '0 AS flagged',
        'a.address AS address',
        'a.comment AS name',
        's.subject AS subject',
        'mb.url AS mailbox',
        withSummary ? 'su.summary AS summary' : 'NULL AS summary',
      ];
      const joins = [
        'LEFT JOIN addresses a ON a.ROWID = m.sender',
        'LEFT JOIN subjects s ON s.ROWID = m.subject',
        'LEFT JOIN mailboxes mb ON mb.ROWID = m.mailbox',
        withSummary ? 'LEFT JOIN summaries su ON su.ROWID = m.summary' : '',
      ];
      const deleted = mc.includes('deleted') ? 'AND (m.deleted IS NULL OR m.deleted = 0)' : '';
      const rows = db
        .prepare(`SELECT ${sel.join(', ')} FROM messages m ${joins.join(' ')}
                  WHERE m.date_received > ? ${deleted} ORDER BY m.date_received`)
        .all(Math.floor(since / 1000));

      let recipientsStmt = null;
      if (tbs.includes('recipients')) {
        const rc = columns(db, 'recipients');
        if (rc.includes('message') && rc.includes('address')) {
          const order = rc.includes('position') ? 'ORDER BY r.position' : '';
          recipientsStmt = db.prepare(
            `SELECT a.address AS address, a.comment AS name FROM recipients r
             JOIN addresses a ON a.ROWID = r.address WHERE r.message = ? ${order} LIMIT 4`
          );
        }
      }

      const events = [];
      for (const r of rows) {
        const box = r.mailbox || '';
        if (SKIP.test(box)) continue;
        const sent = SENT.test(box);
        const from = (r.address || '').toLowerCase();
        if (!sent && blocked.some((b) => from.includes(b))) continue;
        let to = [];
        if (sent && recipientsStmt) {
          try { to = recipientsStmt.all(r.id).map((x) => x.name || x.address); } catch { /* ignore */ }
        }
        const ts = Math.round(Number(sent && r.ds ? r.ds : r.dr) * 1000);
        events.push({
          id: `mail:${r.id}`,
          source: 'mail',
          kind: sent ? 'sent' : 'received',
          ts,
          title: r.subject || '(senza oggetto)',
          detail: sent ? (to[0] || null) : (r.name || r.address || null),
          url: null,
          meta: {
            from: r.address,
            fromName: r.name,
            to,
            mailbox: mailboxName(box),
            unread: r.read === 0,
            flagged: !!r.flagged,
            newsletter: !sent && NEWSLETTER.test(from),
            summary: r.summary ? String(r.summary).slice(0, 400) : null,
          },
        });
      }
      return { events };
    });
  },
};
