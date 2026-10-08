/**
 * House styles: how a piece is built, as opposed to the tone (the attitude). Each writer of the
 * staff has one, chosen by the editor. The prompts describe a manner, they don't copy anyone:
 * the facts still come only from the fact sheet.
 *
 * factor   multiplies the word count of the format (a magazine piece runs longer, a newsletter shorter)
 * labeled  paragraphs open with a short label ("Why it matters: …"), shown in bold on the page
 */
import { L } from '../i18n.js';

const TEXT = {
  en: {
    daily: {
      label: 'Daily paper',
      hint: 'The most important fact first, then the context.',
      prompt: 'HOUSE STYLE — DAILY PAPER: inverted pyramid. The most newsworthy fact in the first sentence, then the details in order of importance, then the context.',
    },
    magazine: {
      label: 'Literary magazine',
      hint: 'In the manner of The New Yorker: a scene, the details, an elegant close.',
      prompt: 'HOUSE STYLE — LITERARY MAGAZINE, in the manner of The New Yorker: open on a small scene (a time, a page, a gesture), linger on one telling detail from the facts, allow one short digression, and close on an understated line that makes the reader smile. Long, well-built sentences alternated with short ones. Never pompous.',
    },
    essay: {
      label: 'Essay',
      hint: 'In the manner of The Atlantic: the fact as the start of a bigger idea.',
      prompt: 'HOUSE STYLE — ESSAY, in the manner of The Atlantic: use the facts of the hour as the starting point for one bigger idea about habits, work or attention. State the thesis early, support it only with the facts given, and say why it matters. Thoughtful, never preachy; one idea, not three.',
    },
    tech: {
      label: 'Tech news',
      hint: 'In the manner of The Verge or Ars Technica: direct, what changed and why it matters.',
      prompt: 'HOUSE STYLE — TECH NEWS, in the manner of The Verge or Ars Technica: direct and knowledgeable. Say plainly what happened and what changed, name tools, commands and versions correctly, explain why it matters to the person using the machine. Technical terms are fine; hype is not.',
    },
    newsletter: {
      label: 'Newsletter',
      hint: 'In the manner of Axios: very short paragraphs with labels.',
      labeled: true,
      factor: 0.8,
      prompt: 'HOUSE STYLE — NEWSLETTER, in the manner of Axios ("smart brevity"): the first paragraph is one sentence with the news. Every following paragraph starts with a short label and a colon, chosen from: "Why it matters:", "The big picture:", "By the numbers:", "Between the lines:", "What\'s next:". One or two sentences per paragraph. No filler. Write the labels in English.',
    },
    explainer: {
      label: 'Explainer',
      hint: 'In the manner of Il Post: what we know, what we don\'t, clear and patient.',
      factor: 1.1,
      prompt: 'HOUSE STYLE — EXPLAINER, in the manner of Il Post: clear, patient, precise. Say what happened, then what we know for certain from the facts and what we don\'t know (and can\'t, from the data). Explain any context a reader might miss, without talking down. Calm, never alarmist.',
    },
    economist: {
      label: 'The Economist',
      hint: 'Analysis, the editorial "we", cultured wit.',
      prompt: 'HOUSE STYLE — in the manner of The Economist: analytical and confident, with dry, cultured wit and the occasional pun in the headline. Use the editorial "we" when giving a judgement. Treat a small fact as if it were a trend worth weighing, with the figures from the facts. Crisp sentences, no jargon.',
    },
    noir: {
      label: 'Noir',
      hint: 'The history as a case to crack; the owner as the suspect.',
      factor: 1.1,
      prompt: 'HOUSE STYLE — NOIR: write it like a hard-boiled detective story. The browser history and the logs are the evidence, the owner is the suspect, the times are alibis. Short, smoky sentences, one or two dark similes, an atmosphere of night. Every clue must come from the facts; the case doesn\'t need to be solved.',
    },
  },
  it: {
    daily: {
      label: 'Quotidiano',
      hint: 'Prima il fatto più importante, poi il contesto.',
      prompt: 'STILE DELLA TESTATA — QUOTIDIANO: piramide rovesciata. Il fatto più notiziabile nella prima frase, poi i dettagli in ordine di importanza, poi il contesto.',
    },
    magazine: {
      label: 'Magazine letterario',
      hint: 'Alla New Yorker: una scena, i dettagli, una chiusa elegante.',
      prompt: 'STILE DELLA TESTATA — MAGAZINE LETTERARIO, alla maniera del New Yorker: apri con una piccola scena (un orario, una pagina, un gesto), soffermati su un dettaglio rivelatore preso dai fatti, concediti una breve digressione e chiudi con una riga sottotono che faccia sorridere. Frasi lunghe e ben costruite alternate a frasi brevi. Mai pomposo.',
    },
    essay: {
      label: 'Saggio',
      hint: 'Alla Atlantic: il fatto come spunto per un\'idea più grande.',
      prompt: 'STILE DELLA TESTATA — SAGGIO, alla maniera di The Atlantic: usa i fatti dell\'ora come punto di partenza per un\'idea più grande su abitudini, lavoro o attenzione. Enuncia la tesi presto, sostienila solo con i fatti forniti e di\' perché conta. Riflessivo, mai predicatorio; un\'idea sola, non tre.',
    },
    tech: {
      label: 'Tech news',
      hint: 'Alla The Verge o Ars Technica: diretto, cosa è cambiato e perché importa.',
      prompt: 'STILE DELLA TESTATA — TECH NEWS, alla maniera di The Verge o Ars Technica: diretto e competente. Di\' chiaramente cosa è successo e cosa è cambiato, chiama strumenti, comandi e versioni con il loro nome giusto, spiega perché importa a chi usa il computer. I termini tecnici vanno bene, l\'enfasi no.',
    },
    newsletter: {
      label: 'Newsletter',
      hint: 'Alla Axios: paragrafi brevissimi con un\'etichetta.',
      labeled: true,
      factor: 0.8,
      prompt: 'STILE DELLA TESTATA — NEWSLETTER, alla maniera di Axios («smart brevity»): il primo paragrafo è una frase sola con la notizia. Ogni paragrafo successivo comincia con una breve etichetta e i due punti, scelta fra: «Perché conta:», «Il quadro:», «In numeri:», «Tra le righe:», «Cosa succede ora:». Una o due frasi per paragrafo. Niente riempitivi. Scrivi le etichette in italiano.',
    },
    explainer: {
      label: 'Spiegone',
      hint: 'Alla Il Post: cosa sappiamo, cosa non sappiamo, chiaro e paziente.',
      factor: 1.1,
      prompt: 'STILE DELLA TESTATA — SPIEGONE, alla maniera del Post: chiaro, paziente, preciso. Racconta cosa è successo, poi cosa sappiamo con certezza dai fatti e cosa non sappiamo (e non possiamo sapere dai dati). Spiega il contesto che un lettore potrebbe non avere, senza trattarlo dall\'alto in basso. Calmo, mai allarmista.',
    },
    economist: {
      label: 'The Economist',
      hint: 'Analisi, il «noi» editoriale, battute colte.',
      prompt: 'STILE DELLA TESTATA — alla maniera dell\'Economist: analitico e sicuro di sé, con un umorismo asciutto e colto e, se viene, un gioco di parole nel titolo. Usa il «noi» editoriale quando dai un giudizio. Tratta un fatto piccolo come se fosse una tendenza da pesare, con le cifre dei fatti. Frasi nette, niente gergo.',
    },
    noir: {
      label: 'Noir',
      hint: 'La cronologia come un caso da risolvere; il proprietario come sospettato.',
      factor: 1.1,
      prompt: 'STILE DELLA TESTATA — NOIR: scrivilo come un poliziesco hard-boiled. La cronologia del browser e i log sono le prove, il proprietario è il sospettato, gli orari sono alibi. Frasi brevi e fumose, una o due similitudini cupe, un\'atmosfera notturna. Ogni indizio deve venire dai fatti; il caso non deve per forza essere risolto.',
    },
  },
};

export const STYLE_IDS = ['daily', 'magazine', 'essay', 'tech', 'newsletter', 'explainer', 'economist', 'noir'];

/** The styles, in the paper's language: { id: { label, hint, prompt, factor, labeled } }. */
export const STYLES = Object.fromEntries(STYLE_IDS.map((id) => [id, {
  get label() { return L(TEXT)[id].label; },
  get hint() { return L(TEXT)[id].hint; },
  get prompt() { return L(TEXT)[id].prompt; },
  factor: TEXT.en[id].factor || 1,
  labeled: !!TEXT.en[id].labeled,
}]));

export const isStyle = (id) => STYLE_IDS.includes(id);
export const styleOf = (w) => STYLES[isStyle(w?.house) ? w.house : 'daily'];

/** For the client: id, label and hint of each style. */
export const styleList = () => STYLE_IDS.map((id) => ({ id, label: STYLES[id].label, hint: STYLES[id].hint }));
