/**
 * Photos: for public web pages we take the preview image
 * (og:image, the one shown when you share a link) or the YouTube thumbnail.
 * Images are downloaded to data/media and served by the paper: no hotlinking.
 *
 * Privacy: we never touch private or logged-in pages (mail, social, chat, local networks,
 * URLs with tokens), nor the domains blocked in config.json.
 */
import { tr } from '../i18n.js';
import fs from 'node:fs';
import path from 'node:path';
import { hash, isBlockedHost } from '../util.js';
import { isGeneric, siteOf } from './cluster.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAX_HTML = 700_000;
const MAX_IMG = 5_000_000;
const RETRY_FAILED_AFTER = 24 * 3600e3;

const SKIP_HOSTS = [
  'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'threads.net', 'tiktok.com', 'linkedin.com',
  'mail.google.com', 'accounts.google.com', 'docs.google.com', 'drive.google.com', 'calendar.google.com',
  'google.com', 'bing.com', 'duckduckgo.com', 'chatgpt.com', 'chat.openai.com', 'claude.ai',
  'chat.deepseek.com', 'gemini.google.com', 'web.whatsapp.com', 'web.telegram.org', 'icloud.com',
  'outlook.live.com', 'outlook.office.com', 'localhost',
];
const SECRET_QUERY = /[?&](token|key|auth|session|sid|code|password|pwd|signature|sig|access_token|otp)=/i;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)|\.local$|\.lan$|\.internal$/i;
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
// the "section" of a page: /granvalenti76/TurboCode/pulse → /granvalenti76/TurboCode
function section(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + '/' + u.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  } catch { return url; }
}

/**
 * The site's logo or default image? Yes if the name says so, or if the same image
 * also appears in another section of the site (pages of the same repository or the same
 * article may legitimately share it).
 */
function looksLikeLogo(store, img, pageUrl) {
  if (LOGO_HINT.test(img)) return true;
  const mine = section(pageUrl);
  return store.imageUsers(img, pageUrl).some((p) => section(p) !== mine);
}

const LOGO_HINT = /(logo|favicon|apple-touch|default[-_]?(og|share|image)|placeholder|og-default|social-default|share-default|sprite)/i;

export function photoAllowed(url, blocked = []) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.replace(/^www\./, '');
  if (PRIVATE_HOST.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  if (isBlockedHost(host, SKIP_HOSTS) || isBlockedHost(host, blocked)) return false;
  if (SECRET_QUERY.test(u.search) || u.username || u.password) return false;
  return true;
}

export function youtubeId(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^(www|m|music)\./, '');
    if (h === 'youtube.com' && u.pathname === '/watch') return u.searchParams.get('v');
    if (h === 'youtube.com' && u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
    if (h === 'youtu.be') return u.pathname.slice(1);
  } catch { /* ignore */ }
  return null;
}

async function fetchT(url, opts = {}, ms = 7000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8', ...(opts.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

async function readLimited(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Extracts og:image / twitter:image / image_src from the HTML. */
export function parseOgImage(html, base) {
  const head = html.slice(0, html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : 300_000);
  const found = {};
  for (const tag of head.match(/<(meta|link)\b[^>]*>/gi) || []) {
    const attr = {};
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attr[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5];
    }
    const key = (attr.property || attr.name || attr.rel || '').toLowerCase();
    const val = attr.content || attr.href;
    if (!val) continue;
    if (['og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image_src'].includes(key) && !found[key]) {
      found[key] = val;
    }
  }
  const raw = found['og:image:secure_url'] || found['og:image'] || found['og:image:url'] || found['twitter:image'] || found['twitter:image:src'] || found.image_src;
  if (!raw) return null;
  try {
    return new URL(raw.replace(/&amp;/g, '&'), base).href;
  } catch {
    return null;
  }
}

async function imageCandidates(pageUrl, trace = () => {}) {
  const yt = youtubeId(pageUrl);
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    return [`https://i.ytimg.com/vi/${yt}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`];
  }
  const r = await fetchT(pageUrl, { headers: { Accept: 'text/html,application/xhtml+xml' } });
  if (!r.ok) { trace(tr({ en: `the page answers HTTP ${r.status}`, it: `la pagina risponde HTTP ${r.status}` })); return []; }
  if (!/html/i.test(r.headers.get('content-type') || '')) { trace(tr({ en: 'the page is not HTML', it: 'la pagina non è HTML' })); return []; }
  const buf = await readLimited(r, MAX_HTML);
  if (!buf) return [];
  const img = parseOgImage(buf.toString('utf8'), r.url || pageUrl);
  return img && /^https:/i.test(img) ? [img] : [];
}

async function download(imageUrl, mediaDir, trace = () => {}) {
  const r = await fetchT(imageUrl, { headers: { Accept: 'image/*' } });
  if (!r.ok) { trace(`immagine HTTP ${r.status}: ${imageUrl}`); return null; }
  const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMG_TYPES[type];
  if (!ext) return null;
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX_IMG) return null;
  const buf = await readLimited(r, MAX_IMG);
  if (!buf || buf.length < 4000) { trace('immagine troppo piccola o troppo grande'); return null; } // icon or tracking pixel
  fs.mkdirSync(mediaDir, { recursive: true });
  const file = `${hash(imageUrl)}.${ext}`;
  fs.writeFileSync(path.join(mediaDir, file), buf);
  return file;
}

/** Finds (and caches) a page's photo. Returns the file name or null. */
export async function photoForPage(pageUrl, { store, config, trace = () => {}, force = false }) {
  if (!photoAllowed(pageUrl, config.privacy.blockedDomains)) { trace('pagina esclusa (privata o dietro login)'); return null; }
  const mediaDir = path.join(config.dataDir, 'media');
  const cached = store.getPhoto(pageUrl);
  if (cached && !force) {
    if (cached.ok && cached.file && fs.existsSync(path.join(mediaDir, cached.file))) { trace(tr({ en: `already archived: ${cached.file}`, it: `già in archivio: ${cached.file}` })); return cached.file; }
    if (!cached.ok && Date.now() - cached.at < RETRY_FAILED_AFTER) { trace('fallita di recente, riprovo domani'); return null; }
  }
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  try {
    const imgs = await imageCandidates(pageUrl, trace);
    if (!imgs.length) trace(tr({ en: 'the page declares no preview image', it: 'la pagina non dichiara un\'immagine di anteprima' }));
    for (const img of imgs) {
      // same image for different pages of the same site → it's the logo, not a photo
      if (looksLikeLogo(store, img, pageUrl)) {
        trace(tr({ en: `discarded, looks like the site logo: ${img}`, it: `scartata, sembra il logo del sito: ${img}` }));
        store.savePhoto({ pageUrl, imageUrl: img, host, ok: false });
        return null;
      }
      const file = await download(img, mediaDir, trace);
      if (file) {
        trace(`scaricata: data/media/${file}`);
        store.savePhoto({ pageUrl, imageUrl: img, file, host, ok: true });
        return file;
      }
    }
  } catch (e) { trace(`${tr({ en: 'network error', it: 'errore di rete' })}: ${e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message)}`); }
  store.savePhoto({ pageUrl, host, ok: false });
  return null;
}

/** Candidate pages to illustrate a story, most promising first. */
export function candidatePages(story) {
  if (!['site', 'roundup'].includes(story.kind)) return [];
  const seen = new Set();
  const out = [];
  const visits = story.events.filter((e) => e.url && e.kind === 'visit');
  // YouTube first (guaranteed thumbnail), then pages with an informative title, most visited
  const count = new Map();
  for (const e of visits) count.set(e.url, (count.get(e.url) || 0) + 1);
  const ranked = [...visits].sort((a, b) =>
    (!!youtubeId(b.url) - !!youtubeId(a.url)) || (count.get(b.url) - count.get(a.url)) || ((b.title || '').length - (a.title || '').length));
  for (const e of ranked) {
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    if (isGeneric(e.title || '', siteOf(e.meta?.host || ''))) continue;
    if (!youtubeId(e.url) && new URL(e.url).pathname.length <= 1) continue; // home page: no photo
    out.push(e);
    if (out.length === 3) break;
  }
  return out;
}

export async function illustrate(story, ctx) {
  for (const e of candidatePages(story)) {
    const file = await photoForPage(e.url, ctx);
    if (file) {
      return { src: `/media/${file}`, caption: e.title, credit: e.meta?.host || null, page: e.url };
    }
  }
  return null;
}
