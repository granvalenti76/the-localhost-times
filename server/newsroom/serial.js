/**
 * The serial (feuilleton): a novel in instalments, one episode with every edition, made from the
 * hour's real facts (sites become places, apps characters, emails mysterious messages). Every
 * episode ends on a cliffhanger and a fork: the Editor chooses how it goes on. Declared fiction:
 * it lives in its own box, never among the news.
 *
 * Episodes are items of kind 'episode'; the choice is a call of type 'serial'.
 */
import { tr, lang } from '../i18n.js';
import { connectLLM, chat } from './llm.js';
import { getLine, featureOn } from './line.js';
import { say } from './chatter.js';
import { hhmm } from '../util.js';

const KIND = 'episode';
const HOUR = 3600e3;
const SEASON = 24; // episodes per season

const GENRES = {
  en: {
    giallo: 'a detective mystery (a classic whodunit)',
    spy: 'a spy thriller (Cold War atmosphere, dead drops, double agents)',
    scifi: 'science fiction (a near future where machines keep diaries)',
    feuilleton: 'a 19th-century serial novel (inheritances, letters, unmasked identities)',
    western: 'a western (a frontier town, saloons, a sheriff)',
  },
  it: {
    giallo: 'un giallo classico (chi è stato?)',
    spy: 'una spy story (atmosfera da guerra fredda, messaggi cifrati, doppiogiochisti)',
    scifi: 'fantascienza (un futuro prossimo in cui le macchine tengono un diario)',
    feuilleton: 'un romanzo d\'appendice ottocentesco (eredità, lettere, identità smascherate)',
    western: 'un western (una città di frontiera, saloon, uno sceriffo)',
  },
};
export const GENRE_LABELS = { en: { giallo: 'Mystery', spy: 'Spy story', scifi: 'Science fiction', feuilleton: 'Serial novel', western: 'Western' }, it: { giallo: 'Giallo', spy: 'Spy story', scifi: 'Fantascienza', feuilleton: 'Romanzo d\'appendice', western: 'Western' } };

const stateOf = (store) => store.getSetting('serial', { season: 1, episode: 0, title: null, summary: '', lastId: null, genre: null });

/** Parse the writer's answer (plain text with labels: easier for small models than JSON). */
export function parseEpisode(text) {
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\r/g, '').replace(/\*\*/g, '');
  const grab = (re) => (re.exec(t)?.[1] || '').trim();
  const series = grab(/^\s*(?:SERIE|SERIES)\s*:\s*(.+)$/im);
  const title = grab(/^\s*(?:TITOLO|TITLE)\s*:\s*(.+)$/im);
  const body = /^\s*(?:TESTO|TEXT)\s*:\s*\n?([\s\S]*?)^\s*(?:RIASSUNTO|SUMMARY)\s*:/im.exec(t)?.[1] || '';
  const summary = grab(/^\s*(?:RIASSUNTO|SUMMARY)\s*:\s*([\s\S]*?)(?=^\s*A\s*[:)]|$(?![\s\S]))/im);
  const a = grab(/^\s*A\s*[:)]\s*(.+)$/m);
  const b = grab(/^\s*B\s*[:)]\s*(.+)$/m);
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter((p) => p.length > 1);
  if (!title || paragraphs.length < 2 || !a || !b) return null;
  const clean = (s) => s.replace(/^["«“]+|["»”]+$/g, '').trim().slice(0, 90);
  return { series: series ? clean(series) : null, title: clean(title), paragraphs, summary: summary.replace(/\s+/g, ' ').slice(0, 700), choices: [clean(a), clean(b)] };
}

const q = (s) => (lang() === 'it' ? `«${s}»` : `“${s}”`);

export function episodePrompt({ genre, st, n, chosen, byChance, ed, last }) {
  const g = (lang() === 'it' ? GENRES.it : GENRES.en)[genre] || GENRES.en.giallo;
  const facts = [
    `${tr({ en: 'Edition', it: 'Edizione' })} ${hhmm(ed.hour ?? ed.start)}`,
    ...ed.articles.slice(0, 5).map((a) => `- [${a.section}] ${a.headline}${a.dek ? ` — ${a.dek}` : ''}`),
    ed.market?.rows?.length ? `${tr({ en: 'Sites', it: 'Siti' })}: ${ed.market.rows.slice(0, 5).map((r) => r.site).join(', ')}` : '',
    ed.time?.apps?.length ? `${tr({ en: 'Apps', it: 'App' })}: ${ed.time.apps.slice(0, 4).map((x) => `${x.name} ${x.minutes} min`).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  return [
    {
      role: 'system',
      content: tr({
        en: `You write the serial of The Localhost Times: a novel in instalments, one episode with every edition, genre: ${g}. The hero is the owner of the Mac (give him a name in the first episode and keep it: it is in the summary). The hour's real facts enter the plot as clues, places and omens: sites become places, apps become characters, emails mysterious messages. It is declared fiction, but every detail of the hour you use must be true. 220-320 words, 3-5 paragraphs, lively sentences, dialogue allowed. End on a cliffhanger and a fork: two possible roads for the next episode, at most 8 words each.
Answer in exactly this format:
SERIES: title of the novel (in the first episode; afterwards repeat it)
TITLE: title of this episode
TEXT:
paragraphs separated by a blank line
SUMMARY: the story so far in at most 90 words (characters, names, open mysteries)
A: first road
B: second road`,
        it: `Scrivi il feuilleton del «The Localhost Times»: un romanzo a puntate, una puntata a ogni edizione, genere: ${g}. Il protagonista è il proprietario del Mac (dagli un nome alla prima puntata e tienilo: è nel riassunto). I fatti veri dell'ora entrano nella trama come indizi, luoghi e presagi: i siti diventano luoghi, le app personaggi, le email messaggi misteriosi. È finzione dichiarata, ma ogni dettaglio dell'ora che usi deve essere vero. 220-320 parole, 3-5 paragrafi, frasi vive, dialoghi ammessi. Chiudi con un colpo di scena e un bivio: due strade possibili per la prossima puntata, ognuna di massimo 8 parole.
Rispondi esattamente in questo formato:
SERIE: titolo del romanzo (alla prima puntata; poi ripetilo)
TITOLO: titolo di questa puntata
TESTO:
paragrafi separati da una riga vuota
RIASSUNTO: la storia finora in massimo 90 parole (personaggi, nomi, misteri aperti)
A: prima strada
B: seconda strada`,
      }),
    },
    {
      role: 'user',
      content: [
        tr({ en: `EPISODE ${n}${st.title ? ` of ${q(st.title)}` : ' (the first: invent the title of the novel)'}.`, it: `PUNTATA ${n}${st.title ? ` di ${q(st.title)}` : ' (la prima: inventa il titolo del romanzo)'}.` }),
        st.summary ? `${tr({ en: 'THE STORY SO FAR', it: 'LA STORIA FINORA' })}: ${st.summary}` : '',
        last ? `${tr({ en: 'HOW THE LAST EPISODE ENDED', it: 'COME FINIVA LA PUNTATA PRECEDENTE' })}: ${last}` : '',
        chosen ? (byChance
          ? tr({ en: `The readers didn't vote: chance chose the road ${q(chosen)}.`, it: `I lettori non hanno votato: il caso ha scelto la strada ${q(chosen)}.` })
          : tr({ en: `THE READERS CHOSE: ${q(chosen)}. Follow that road.`, it: `I LETTORI HANNO SCELTO: ${q(chosen)}. Segui quella strada.` })) : '',
        `${tr({ en: 'THE FACTS OF THE HOUR', it: 'I FATTI DELL\'ORA' })}:\n${facts}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

/** The road the readers took (or chance, if nobody voted): closes the previous episode's call. */
function roadTaken(store, st, now) {
  if (!st.lastId) return { chosen: null, byChance: false };
  const call = store.items('call', { ref: `serial:${st.lastId}`, limit: 1 })[0];
  const prev = store.getItem(KIND, st.lastId);
  if (!call || !prev) return { chosen: null, byChance: false };
  if (call.status === 'answered') return { chosen: call.answer, byChance: false };
  const pick = prev.choices[now % 2];
  if (call.status === 'open') store.saveItem({ ...call, status: 'expired' });
  return { chosen: pick, byChance: true };
}

/** After the press: the episode for this edition (once; a reprint keeps it). */
export async function writeEpisode(store, config, ed, { log = () => {}, now = Date.now() } = {}) {
  const line = getLine(store);
  if (!featureOn(line, 'serial') || !ed?.articles?.length) return null;
  const done = store.items(KIND, { ref: ed.id, limit: 1 })[0];
  if (done) return done;
  const llm = await connectLLM(config);
  if (!llm) return null;
  const st = stateOf(store);
  const genre = line.serialGenre || 'giallo';
  if (st.genre && st.genre !== genre) Object.assign(st, { season: st.season + 1, episode: 0, title: null, summary: '', lastId: null });
  if (st.episode >= SEASON) Object.assign(st, { season: st.season + 1, episode: 0, title: null, summary: '', lastId: null });
  st.genre = genre;
  const { chosen, byChance } = roadTaken(store, st, now);
  const prev = st.lastId ? store.getItem(KIND, st.lastId) : null;
  const n = st.episode + 1;
  let ep = null;
  for (let attempt = 0; attempt < 2 && !ep; attempt++) {
    try {
      ep = parseEpisode(await chat(llm, config, episodePrompt({ genre, st, n, chosen, byChance, ed, last: prev?.paragraphs?.at(-1) }), 2200));
    } catch (e) {
      log(tr({ en: `[serial] ${e.message}`, it: `[feuilleton] ${e.message}` }));
      break;
    }
  }
  if (!ep) return null;
  const item = store.saveItem({
    kind: KIND, status: '', ts: now, ref: ed.id, editionId: ed.id,
    season: st.season, n, genre,
    serialTitle: st.title || ep.series || tr({ en: 'The serial', it: 'Il feuilleton' }),
    title: ep.title, paragraphs: ep.paragraphs, choices: ep.choices,
    road: chosen ? { text: chosen, byChance } : null,
    writer: llm.model,
  });
  store.setSetting('serial', { ...st, episode: n, title: item.serialTitle, summary: ep.summary || st.summary, lastId: item.id });
  store.saveItem({
    kind: 'call', type: 'serial', status: 'open', ts: now, ref: `serial:${item.id}`, editionId: ed.id,
    question: tr({ en: `${item.serialTitle}, episode ${n}: how does it go on?`, it: `${item.serialTitle}, puntata ${n}: come continua?` }),
    options: ep.choices.map((c, i) => ({ id: i ? 'b' : 'a', label: c })),
    by: { id: 'serial', name: tr({ en: 'The serial', it: 'Il feuilleton' }), role: '' },
    deadline: (ed.end || now) + HOUR + 30e3,
  });
  say(store, 'serial', tr({ en: `The serial: episode ${n} is on the page. The readers choose what happens next.`, it: `Il feuilleton: la puntata ${n} è in pagina. Cosa succede dopo lo decidono i lettori.` }), now);
  return item;
}

/** What the front page shows of the episode. */
export const episodeTeaser = (e) => (e ? {
  id: e.id, n: e.n, season: e.season, title: e.title, serialTitle: e.serialTitle,
  teaser: e.paragraphs[0].length > 260 ? `${e.paragraphs[0].slice(0, 257).trimEnd()}…` : e.paragraphs[0],
  choices: e.choices,
} : null);

export const episodes = (store, limit = 60) => store.items(KIND, { limit }).map(({ id, ts, n, season, title, serialTitle, paragraphs, choices, road, genre, editionId }) => ({ id, ts, n, season, title, serialTitle, paragraphs, choices, road, genre, editionId }));
