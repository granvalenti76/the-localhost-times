/**
 * Automatic typesetting: the paper written without an LLM, from templates.
 * One module per language; this one forwards to the paper's language.
 */
import { L } from '../i18n.js';
import * as en from './fallback.en.js';
import * as it from './fallback.it.js';

const M = { en, it };
export const fallbackArticle = (...a) => L(M).fallbackArticle(...a);
export const fallbackBrief = (...a) => L(M).fallbackBrief(...a);
export const fallbackSummary = (...a) => L(M).fallbackSummary(...a);
export const fallbackEditorial = (...a) => L(M).fallbackEditorial(...a);
export const partOfDay = (...a) => L(M).partOfDay(...a);
