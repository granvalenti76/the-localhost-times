/**
 * Spotlight's writing: the dossier a lead becomes, the editor's verdict on it, the long piece,
 * and the typesetting's version when no model is available. The reader of a Spotlight piece is
 * the owner of the Mac: the piece walks them through the evidence and leaves them aware of
 * something about their own habits they may not have noticed.
 */
import { tr, lang } from '../../i18n.js';
import { SECTIONS } from '../sections.js';
import { chat, parseJson } from '../llm.js';
import { linePrompt } from '../line.js';
import { personaPrompt } from '../writers.js';
import { numbersCheck } from '../factcheck.js';
import { dayKey, hhmm } from '../../util.js';

const secName = (s) => SECTIONS[s]?.name || s;
const q = (s) => (lang() === 'it' ? `«${s}»` : `“${s}”`);
const KIND_NAMES = {
  en: { cross: 'Crossed traces', obsession: 'A recurring presence', intent: 'A decision in the making', vanish: 'A disappearance', habit: 'A change of habits' },
  it: { cross: 'Tracce incrociate', obsession: 'Una presenza ricorrente', intent: 'Una decisione in arrivo', vanish: 'Una sparizione', habit: 'Un cambio di abitudini' },
};
export const kindName = (k) => (lang() === 'it' ? KIND_NAMES.it : KIND_NAMES.en)[k] || k;

/** The exhibits as the reader sees them: numbered, dated, with the app they come from. */
export const exhibitLine = (x, i) => `${tr({ en: 'Exhibit', it: 'Reperto' })} ${i + 1} · ${dayKey(x.ts)} ${hhmm(x.ts)} · ${secName(x.source)}${x.host ? ` (${x.host})` : ''} · ${q(x.title)}`;

/** Everything the desk knows about a lead, as plain text for the model. */
export function dossier(lead) {
  const en = lang() === 'en';
  const lines = [
    `${en ? 'LEAD' : 'PISTA'}: ${lead.subject} — ${kindName(lead.kind)}`,
    `${en ? 'HYPOTHESIS OF THE DETECTORS' : 'IPOTESI DEI RILEVATORI'}: ${lead.hypothesis}`,
    `${en ? 'UNDER INVESTIGATION SINCE' : 'IN INDAGINE DAL'}: ${dayKey(lead.openedAt)} ${hhmm(lead.openedAt)}`,
    '',
    `${en ? 'NUMBERS' : 'NUMERI'}:`,
    ...lead.facts.map((f) => `- ${f}`),
    '',
    `${en ? 'EXHIBITS (in order)' : 'REPERTI (in ordine)'}:`,
    ...lead.evidence.map((x, i) => `- ${exhibitLine(x, i)}`),
  ];
  if (lead.desk?.angle) lines.push('', `${en ? 'THE EDITOR\'S ANGLE' : 'L\'ANGOLO DEL CAPOREDATTORE'}: ${lead.desk.angle}`);
  if (lead.reply?.text) lines.push('', `${en ? 'THE OWNER\'S REPLY (quote it verbatim)' : 'LA REPLICA DEL PROPRIETARIO (citala alla lettera)'}: ${lead.reply.text}`);
  else lines.push('', en ? 'THE OWNER DID NOT REPLY to the request for comment.' : 'IL PROPRIETARIO NON HA RISPOSTO alla richiesta di commento.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// The editor's verdict

export function judgePrompt(lead, line) {
  return [
    {
      role: 'system',
      content: tr({
        en: `You are the editor of Spotlight, the investigations desk of The Localhost Times, the paper made from what happens on its owner's Mac. Your reporters bring you a lead with its exhibits. Decide whether it is a story: something true, supported by the exhibits, that the owner may not have noticed about their own habits and would find worth knowing. Be demanding: coincidences, routine and things the owner obviously knows are not stories. A subject touching health, money troubles, love or sex, faith, politics, the law or a job search is never published: mark it sensitive.${line ? '\n' + linePrompt(line) : ''}
Reply ONLY with JSON: {"story": true|false, "confidence": 0-100, "sensitive": true|false, "angle": "one sentence: what the owner may not know", "headline": "a working headline, 12 words at most", "missing": "if not a story yet, what would make it one"}`,
        it: `Sei il caporedattore di Spotlight, la squadra d'inchiesta del «The Localhost Times», il giornale fatto con ciò che succede sul Mac del suo proprietario. I tuoi cronisti ti portano una pista con i suoi reperti. Decidi se è una storia: qualcosa di vero, sostenuto dai reperti, che il proprietario potrebbe non aver notato delle proprie abitudini e che gli farebbe bene sapere. Sii esigente: coincidenze, routine e cose che il proprietario ovviamente sa non sono storie. Un argomento che tocca salute, problemi di soldi, amore o sesso, fede, politica, la legge o la ricerca di un altro lavoro non si pubblica mai: segnalalo come delicato.${line ? '\n' + linePrompt(line) : ''}
Rispondi SOLO con JSON: {"story": true|false, "confidence": 0-100, "sensitive": true|false, "angle": "una frase: cosa il proprietario potrebbe non sapere", "headline": "un titolo di lavoro, massimo 12 parole", "missing": "se non è ancora una storia, cosa servirebbe"}`,
      }),
    },
    { role: 'user', content: `${dossier({ ...lead, reply: { text: null } }).split('\n').filter((l) => !/NON HA RISPOSTO|DID NOT REPLY/.test(l)).join('\n')}\n\n${tr({ en: 'Is it a story?', it: 'È una storia?' })}` },
  ];
}

export async function judge(lead, ctx) {
  const j = parseJson(await chat(ctx.llm, ctx.config, judgePrompt(lead, ctx.line), 1200));
  return {
    story: j.story === true || j.story === 'true',
    confidence: Math.max(0, Math.min(100, Number(j.confidence) || 0)),
    sensitive: j.sensitive === true || j.sensitive === 'true',
    angle: String(j.angle || '').trim().slice(0, 300),
    headline: String(j.headline || '').trim().replace(/(?<!\.)\.$/, '').slice(0, 120),
    missing: String(j.missing || '').trim().slice(0, 300),
    at: Date.now(),
    by: ctx.llm.model,
  };
}

// ---------------------------------------------------------------------------------------------
// The piece

const MIN_WORDS = 800;

function writePrompt(lead, line, writer) {
  const extra = (line ? '\n' + linePrompt(line) : '') + personaPrompt(writer);
  return [
    {
      role: 'system',
      content: tr({
        en: `You write for Spotlight, the investigations desk of The Localhost Times, the paper made from what happens on its owner's Mac. Spotlight publishes rarely, only when a lead holds up. Your reader is the owner: the piece must lead them, step by step, to see something about their own habits they may not have noticed, and leave them more aware. Inform, don't judge: no moralizing, no advice they didn't ask for.
Rules:
- Use ONLY the dossier. Every number you write must be in it. Refer to the exhibits by number ("exhibit 4") when you use them. Quote titles in curly quotes “like this”, never straight double quotes.
- Don't invent motives, feelings or outcomes. When you interpret, say so ("perhaps", "one reading is").
- Third person: "the owner".
- If the dossier has the owner's reply, quote it verbatim once; otherwise write that the owner did not respond to a request for comment.
Structure: a kicker (1-3 words), a headline (12 words at most, no final period), a dek (one sentence), then 5 sections, each with a short heading:
1. the finding, said plainly in the first paragraph;
2. how it unfolded, exhibit by exhibit, in order;
3. the numbers against the usual;
4. what we don't know;
5. what it says, for the reader.
${MIN_WORDS}-1200 words in all, in paragraphs of 2-5 sentences. Then "takeaways": 3 short lines of what the reader may not know, each with a number from the dossier; and "questions": 2 or 3 short questions the reader might ask themselves.${extra}
Reply ONLY with JSON: {"kicker": "...", "headline": "...", "dek": "...", "sections": [{"heading": "...", "paragraphs": ["...", "..."]}], "takeaways": ["...", "...", "..."], "questions": ["...", "..."]}`,
        it: `Scrivi per Spotlight, la squadra d'inchiesta del «The Localhost Times», il giornale fatto con ciò che succede sul Mac del suo proprietario. Spotlight pubblica di rado, solo quando una pista regge. Il tuo lettore è il proprietario: il pezzo deve accompagnarlo, passo dopo passo, a vedere qualcosa delle proprie abitudini che potrebbe non aver notato, e lasciarlo più consapevole. Informa, non giudicare: niente prediche, niente consigli non richiesti.
Regole:
- Usa SOLO il fascicolo. Ogni numero che scrivi deve esserci. Cita i reperti per numero («reperto 4») quando li usi. Cita i titoli tra «caporali», mai tra virgolette dritte.
- Non inventare motivazioni, sentimenti o esiti. Quando interpreti, dillo («forse», «una lettura possibile è»).
- Terza persona: «il proprietario».
- Se il fascicolo contiene la replica del proprietario, citala una volta alla lettera; altrimenti scrivi che il proprietario non ha risposto alla richiesta di commento.
Struttura: un occhiello (1-3 parole), un titolo (massimo 12 parole, senza punto finale), un sommario (una frase), poi 5 sezioni, ognuna con un breve titoletto:
1. la scoperta, detta chiaramente nel primo paragrafo;
2. come è andata, reperto dopo reperto, in ordine;
3. i numeri, confrontati con il solito;
4. cosa non sappiamo;
5. cosa ci dice, per il lettore.
${MIN_WORDS}-1200 parole in tutto, in paragrafi di 2-5 frasi. Poi «takeaways»: 3 righe brevi su cosa il lettore potrebbe non sapere, ognuna con un numero del fascicolo; e «questions»: 2 o 3 brevi domande che il lettore potrebbe farsi.${extra}
Rispondi SOLO con JSON: {"kicker": "...", "headline": "...", "dek": "...", "sections": [{"heading": "...", "paragraphs": ["...", "..."]}], "takeaways": ["...", "...", "..."], "questions": ["...", "..."]}`,
      }),
    },
    { role: 'user', content: `${dossier(lead)}\n\n${tr({ en: 'Write the Spotlight piece.', it: 'Scrivi il pezzo di Spotlight.' })}` },
  ];
}

const strs = (a, n) => (Array.isArray(a) ? a : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, n);

function fromJson(j) {
  if (typeof j?.headline !== 'string' || !Array.isArray(j.sections) || !j.sections.length) throw new Error(tr({ en: 'incomplete JSON', it: 'JSON incompleto' }));
  const sections = j.sections.map((x) => ({
    heading: String(x?.heading || '').trim(),
    paragraphs: (Array.isArray(x?.paragraphs) ? x.paragraphs : [x?.paragraphs]).map((p) => String(p || '').trim()).filter(Boolean),
  })).filter((x) => x.paragraphs.length);
  if (!sections.length) throw new Error(tr({ en: 'no text', it: 'nessun testo' }));
  return {
    kicker: String(j.kicker || 'Spotlight').trim().slice(0, 40),
    headline: j.headline.trim().replace(/(?<!\.)\.$/, ''),
    dek: String(j.dek || '').trim(),
    sections,
    takeaways: strs(j.takeaways, 3),
    questions: strs(j.questions, 3),
  };
}

export const scoopWords = (s) => [s.dek, ...s.sections.flatMap((x) => x.paragraphs)].join(' ').split(/\s+/).filter(Boolean).length;

/** The long piece, by the model; expanded once if it comes out too short. */
export async function writeScoop(lead, ctx, writer) {
  const msgs = writePrompt(lead, ctx.line, writer);
  let text = fromJson(parseJson(await chat(ctx.llm, ctx.config, msgs, 6000)));
  if (scoopWords(text) < MIN_WORDS * 0.8) {
    try {
      const more = fromJson(parseJson(await chat(ctx.llm, ctx.config, [
        ...msgs,
        { role: 'assistant', content: JSON.stringify(text) },
        { role: 'user', content: tr({
          en: `This draft is ${scoopWords(text)} words: Spotlight pieces run ${MIN_WORDS}-1200. Expand it using only the dossier: more of the exhibits, in order, with their times and titles; the numbers against the usual; what we don't know. Same structure, same rules. Reply ONLY with the JSON.`,
          it: `Questa bozza è di ${scoopWords(text)} parole: i pezzi di Spotlight sono di ${MIN_WORDS}-1200. Allungala usando solo il fascicolo: più reperti, in ordine, con orari e titoli; i numeri confrontati con il solito; cosa non sappiamo. Stessa struttura, stesse regole. Rispondi SOLO con il JSON.`,
        }) },
      ], 6000)));
      if (scoopWords(more) > scoopWords(text)) text = { ...more, expanded: true };
    } catch { /* the first draft stays */ }
  }
  return text;
}

/** Figures the piece quotes that the dossier doesn't contain. */
export const scoopCheck = (text, lead) => numbersCheck({ headline: text.headline, dek: text.dek, body: [...text.sections.flatMap((s) => s.paragraphs), ...text.takeaways] }, dossier(lead));

// ---------------------------------------------------------------------------------------------
// The typesetting's version: the same facts, in templates, when no model is available

const TEMPLATES = {
  en: {
    unknown: {
      cross: 'We know where the subject appears and when. We don\'t know what it is for: a plan, a curiosity, someone else\'s project. The exhibits show the traces, not the intentions behind them.',
      obsession: 'We know how often and when. We don\'t know why: pleasure, habit, a reflex between two tasks. Short visits may be a glance, or a way to pause.',
      intent: 'We know what was searched and in what order. We don\'t know whether a decision has been taken, nor what it will be.',
      vanish: 'We know when it stopped. We don\'t know whether it ended, moved to another device, or is only on hold.',
      habit: 'We know the times. We don\'t know the reason: a new rhythm, a busy week, a season.',
    },
    meaning: {
      cross: 'Seen one at a time, these are ordinary signals. Seen together, they tell a story the owner is writing without noticing: the Mac remembers how a subject grows from a search into a plan.',
      obsession: 'Habits are made of returns more than of hours. Each visit is short; together they draw the shape of the day around one place.',
      intent: 'Decisions leave a trail of comparisons. The trail is here; the decision, for now, is still the owner\'s alone.',
      vanish: 'What disappears is often noticed later than what arrives. The paper noticed it now.',
      habit: 'Clocks move slowly, a few minutes a day: that is why a change of rhythm is easier to see from outside.',
    },
    questions: {
      cross: ['Is it a plan already, or still an idea?', 'Which of these traces was the first step?'],
      obsession: ['What do these returns replace?', 'Would the owner have guessed the number?'],
      intent: ['What is still missing for the decision?', 'Which comparison weighed most?'],
      vanish: ['Did it end, or is it only waiting?', 'What took its place?'],
      habit: ['Was it chosen, or did it just happen?', 'Which other habit moved with it?'],
    },
    h: ['The finding', 'How it unfolded', 'The numbers', 'What we don\'t know', 'What it says'],
    noReply: 'The owner did not respond to a request for comment.',
    reply: (t) => `Asked for a comment, the owner replied: “${t}”`,
    exhibits: (n) => `The file holds ${n} exhibits.`,
  },
  it: {
    unknown: {
      cross: 'Sappiamo dove compare l\'argomento e quando. Non sappiamo a cosa serva: un progetto, una curiosità, una faccenda di qualcun altro. I reperti mostrano le tracce, non le intenzioni.',
      obsession: 'Sappiamo quanto spesso e quando. Non sappiamo perché: piacere, abitudine, un riflesso tra due impegni. Le visite brevi possono essere un\'occhiata, o un modo per fermarsi.',
      intent: 'Sappiamo cosa è stato cercato e in che ordine. Non sappiamo se una decisione sia stata presa, né quale sarà.',
      vanish: 'Sappiamo quando si è fermato. Non sappiamo se è finito, se si è spostato su un altro dispositivo o se è solo in pausa.',
      habit: 'Conosciamo gli orari. Non conosciamo la ragione: un ritmo nuovo, una settimana piena, una stagione.',
    },
    meaning: {
      cross: 'Presi uno alla volta sono segnali qualunque. Messi insieme raccontano una storia che il proprietario sta scrivendo senza accorgersene: il Mac ricorda come un argomento passa da una ricerca a un progetto.',
      obsession: 'Le abitudini sono fatte di ritorni più che di ore. Ogni visita è breve; tutte insieme disegnano la forma della giornata attorno a un posto.',
      intent: 'Le decisioni lasciano una scia di confronti. La scia è qui; la decisione, per ora, è ancora soltanto del proprietario.',
      vanish: 'Ciò che sparisce si nota più tardi di ciò che arriva. Il giornale l\'ha notato adesso.',
      habit: 'Gli orologi si spostano piano, pochi minuti al giorno: per questo un cambio di ritmo si vede meglio da fuori.',
    },
    questions: {
      cross: ['È già un progetto, o ancora un\'idea?', 'Quale di queste tracce è stata il primo passo?'],
      obsession: ['Che cosa sostituiscono questi ritorni?', 'Il proprietario avrebbe indovinato il numero?'],
      intent: ['Cosa manca ancora per decidere?', 'Quale confronto ha pesato di più?'],
      vanish: ['È finito, o sta solo aspettando?', 'Che cosa ne ha preso il posto?'],
      habit: ['È stato scelto, o è semplicemente successo?', 'Quale altra abitudine si è spostata con lui?'],
    },
    h: ['La scoperta', 'Come è andata', 'I numeri', 'Cosa non sappiamo', 'Cosa ci dice'],
    noReply: 'Il proprietario non ha risposto alla richiesta di commento.',
    reply: (t) => `Interpellato, il proprietario ha risposto: «${t}»`,
    exhibits: (n) => `Il fascicolo contiene ${n} reperti.`,
  },
};

export function typesetScoop(lead) {
  const T = lang() === 'it' ? TEMPLATES.it : TEMPLATES.en;
  const ex = lead.evidence;
  const chunks = [];
  for (let i = 0; i < ex.length; i += 4) chunks.push(ex.slice(i, i + 4).map((x, k) => `${exhibitLine(x, i + k)}.`).join(' '));
  return {
    kicker: 'Spotlight',
    headline: lead.desk?.headline || lead.subject,
    dek: lead.hypothesis,
    sections: [
      { heading: T.h[0], paragraphs: [lead.hypothesis, T.exhibits(ex.length)] },
      { heading: T.h[1], paragraphs: chunks.slice(0, 4) },
      { heading: T.h[2], paragraphs: [lead.facts.map((f) => `${f}.`).join(' ')] },
      { heading: T.h[3], paragraphs: [T.unknown[lead.kind] || T.unknown.cross, lead.reply?.text ? T.reply(lead.reply.text) : T.noReply] },
      { heading: T.h[4], paragraphs: [T.meaning[lead.kind] || T.meaning.cross] },
    ],
    takeaways: lead.facts.slice(0, 3),
    questions: T.questions[lead.kind] || T.questions.cross,
  };
}

/** "How we know": the apps and the period the exhibits come from (computed, never written by the model). */
export function method(lead) {
  const bySource = {};
  for (const x of lead.evidence) bySource[x.source] = (bySource[x.source] || 0) + 1;
  const ts = lead.evidence.map((x) => x.ts);
  return {
    bySource: Object.entries(bySource).map(([s, n]) => ({ source: s, name: secName(s), n })),
    from: Math.min(...ts),
    to: Math.max(...ts),
    days: new Set(lead.evidence.map((x) => dayKey(x.ts))).size,
    detector: lead.kind,
    openedAt: lead.openedAt,
  };
}
