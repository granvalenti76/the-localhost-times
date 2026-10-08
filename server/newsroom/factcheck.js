/**
 * Fact-checking. Two layers:
 *  - numbersCheck: every figure an LLM-written article quotes must appear in the facts it was given
 *    (a cheap, certain guard against invented numbers, shown in the newsroom);
 *  - factCheck: the writer, as a checker, picks the boldest claims of the edition and rates them
 *    against the hour's data (shown on the front page).
 */
import { tr, lang } from '../i18n.js';
import { chat, parseJson } from './llm.js';
import { factSheet } from './cluster.js';

/** Figures in a text: times (11:08), numbers (1,204 · 3.5 · 42%). Small counts (0–2) are too common to flag. */
export function figures(text) {
  const out = new Set();
  const t = String(text || '');
  for (const m of t.matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b/g)) out.add(m[0].padStart(5, '0'));
  const rest = t.replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/g, ' ');
  for (const m of rest.matchAll(/(?<![\w.])\d{1,3}(?:[.,\s]\d{3})+(?![\d])|(?<![\w.])\d+(?:[.,]\d+)?/g)) {
    const n = m[0].replace(/[\s,.](?=\d{3}\b)/g, '').replace(',', '.');
    const v = Number(n);
    if (Number.isFinite(v) && v > 2 && !(v >= 1990 && v <= 2100 && Number.isInteger(v))) out.add(String(v));
  }
  return [...out];
}

/** Figures of an article that its facts don't contain. */
export function numbersCheck(article, facts) {
  const known = new Set(figures(facts));
  const text = [article.headline, article.dek, ...(article.body || [])].join(' ');
  const found = figures(text);
  return { figures: found.length, unverified: found.filter((f) => !known.has(f)) };
}

const VERDICTS = ['true', 'mostly', 'false', 'unverifiable'];

function sheet({ articles, stories, summary, stats, market, hourLabel }) {
  const en = lang() === 'en';
  const src = Object.entries(stats.bySource || {}).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ');
  const lines = [
    en ? `THE ${hourLabel} EDITION — DATA` : `EDIZIONE DELLE ${hourLabel} — DATI`,
    `${en ? 'Signals' : 'Segnali'}: ${stats.total} (${src}); ${en ? 'searches' : 'ricerche'} ${stats.searches}, ${en ? 'mails in/out' : 'mail ricevute/inviate'} ${stats.mailsIn}/${stats.mailsOut}, ${en ? 'terminal commands' : 'comandi nel terminale'} ${stats.commands}`,
    market?.rows?.length ? `${en ? 'Site visits' : 'Visite ai siti'}: ${market.rows.slice(0, 8).map((r) => `${r.site} ${r.close}`).join(', ')}` : '',
    '',
    `${en ? 'THE BRIEF' : 'IL PUNTO'}: ${summary}`,
  ];
  articles.forEach((a, i) => {
    const s = stories.find((x) => x.id === a.id);
    lines.push('', `[A${i + 1}] ${a.headline} — ${a.dek || ''}`, `${en ? 'Text' : 'Testo'}: ${(a.body || []).join(' ').slice(0, 500)}`);
    if (s) lines.push(`${en ? 'Facts' : 'Fatti'}: ${factSheet(s).slice(0, 900)}`);
  });
  return lines.filter((l) => l !== null).join('\n');
}

function prompt(data, line) {
  return [
    {
      role: 'system',
      content: tr({
        en: `You are the fact-checker of The Localhost Times, the paper about what happens on its owner's Mac. Pick the 3 boldest checkable claims in this edition (prefer The Brief and the headlines; prefer numbers, times, "most", "all", "first", characterisations like "a morning of coding") and rate each against the DATA and the Facts given. Verdicts: "true", "mostly" (true but imprecise), "false", "unverifiable" (the data says nothing about it). The evidence is one short sentence quoting the data. Be strict and fair; never invent data.
Reply ONLY with JSON: {"checks": [{"claim": "the claim, quoted or closely paraphrased", "article": "A1 or BRIEF", "verdict": "true|mostly|false|unverifiable", "evidence": "..."}]}`,
        it: `Sei il fact-checker del «The Localhost Times», il giornale di ciò che succede sul Mac del suo proprietario. Scegli le 3 affermazioni verificabili più forti di questa edizione (preferisci il Punto e i titoli; preferisci numeri, orari, «la maggior parte», «tutti», «il primo», giudizi come «una mattinata dedicata al codice») e valuta ciascuna con i DATI e i Fatti forniti. Verdetti: "true" (vero), "mostly" (vero ma impreciso), "false" (falso), "unverifiable" (i dati non ne parlano). La prova è una frase breve che cita i dati. Sii severo e giusto; non inventare dati. Scrivi in italiano.
Rispondi SOLO con JSON: {"checks": [{"claim": "l'affermazione, citata o parafrasata fedelmente", "article": "A1 oppure BRIEF", "verdict": "true|mostly|false|unverifiable", "evidence": "..."}]}`,
      }),
    },
    { role: 'user', content: data },
  ];
}

/**
 * The fact-check box of an edition, or null (writer offline, or nothing checkable).
 * @param ctx {llm, config, log}
 */
export async function factCheck({ articles, stories, summary, stats, market, hourLabel }, { llm, config, log }) {
  if (!llm || !articles.length) return null;
  try {
    const j = parseJson(await chat(llm, config, prompt(sheet({ articles, stories, summary, stats, market, hourLabel })), 1800));
    const checks = (Array.isArray(j.checks) ? j.checks : [])
      .map((c) => {
        const ref = String(c.article || '').toUpperCase();
        const idx = /^A(\d+)$/.exec(ref)?.[1];
        return {
          claim: String(c.claim || '').trim().replace(/^[«"“']+|[»"”']+$/g, ''),
          verdict: VERDICTS.includes(String(c.verdict).toLowerCase()) ? String(c.verdict).toLowerCase() : 'unverifiable',
          evidence: String(c.evidence || '').trim(),
          articleId: idx ? articles[Number(idx) - 1]?.id || null : null,
          brief: ref === 'BRIEF',
        };
      })
      .filter((c) => c.claim)
      .slice(0, 3);
    return checks.length ? { checks, at: Date.now(), by: llm.model, stale: false } : null;
  } catch (e) {
    log(tr({ en: `[fact-check] ${e.message}`, it: `[verifica] ${e.message}` }));
    return null;
  }
}
