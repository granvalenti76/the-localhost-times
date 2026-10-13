/**
 * Client for an OpenAI-compatible server (llama.cpp, LM Studio, Ollama, vLLM…).
 */
import { tr } from '../i18n.js';
async function fetchT(url, opts = {}, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

const LOCAL_NET_HINT = () => tr({
  en: 'macOS may be blocking the local network: System Settings → Privacy & Security → Local Network → enable the app you run Node from (Terminal, iTerm, VS Code…)',
  it: 'macOS potrebbe bloccare la rete locale: Impostazioni di Sistema → Privacy e sicurezza → Rete locale → abilita l\'app da cui lanci Node (Terminale, iTerm, VS Code…)',
});

export function describeError(e) {
  if (e?.name === 'AbortError') return tr({ en: 'timeout: no answer within 4 seconds', it: 'timeout: nessuna risposta in 4 secondi' });
  const code = e?.cause?.code || e?.code;
  const msg = e?.cause?.message || e?.message || String(e);
  if (['EHOSTUNREACH', 'ENETUNREACH', 'EPERM', 'EACCES'].includes(code)) return `${code} — ${LOCAL_NET_HINT()}`;
  if (code === 'ECONNREFUSED') return tr({ en: 'ECONNREFUSED — the computer answers but no server is listening on that port', it: 'ECONNREFUSED — il computer risponde ma nessun server ascolta su quella porta' });
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return tr({ en: `${code} — the address does not answer (switched off? IP changed? or ${LOCAL_NET_HINT()})`, it: `${code} — l'indirizzo non risponde (spento? IP cambiato? oppure ${LOCAL_NET_HINT()})` });
  return code ? `${code} — ${msg}` : msg;
}

export const llmStatus = { state: 'unknown', model: null, base: null, at: null, error: null };

/** Where local OpenAI-compatible servers usually listen (baseUrl: 'auto'). */
export const LOCAL_SERVERS = [
  { name: 'Ollama', base: 'http://127.0.0.1:11434/v1' },
  { name: 'LM Studio', base: 'http://127.0.0.1:1234/v1' },
  { name: 'llama.cpp', base: 'http://127.0.0.1:8080/v1' },
  { name: 'vLLM', base: 'http://127.0.0.1:8000/v1' },
];

/** The first chat model in a /models answer (embedding models can't write). */
function pickModel(j) {
  const ids = [...(j.data || []).map((m) => m.id), ...(j.models || []).map((m) => m.name || m.model)].filter(Boolean);
  return ids.find((id) => !/embed|rerank|whisper|tts/i.test(id)) || null;
}

async function probe(base, headers, ms) {
  const r = await fetchT(`${base}/models`, { headers }, ms);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return pickModel(await r.json());
}

/** Look for a local server with a chat model on the usual ports; null if none. */
export async function findLocalServer(model = '') {
  // no API key here: it is not sent to whatever happens to listen on these ports
  const tries = await Promise.allSettled(LOCAL_SERVERS.map((s) => probe(s.base, {}, 1500).then((m) => ({ ...s, model: model || m }))));
  // a server with no chat model (e.g. Ollama with nothing pulled) can't write
  return tries.find((t) => t.status === 'fulfilled' && t.value.model)?.value || null;
}

let autoCache = null; // { base, at }

export async function connectLLM(config) {
  const wanted = (config.llm.baseUrl || '').trim().replace(/\/+$/, '');
  if (!wanted || wanted === 'none') {
    Object.assign(llmStatus, { state: 'disabled', model: null, base: null, at: Date.now(), error: null });
    return null;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (config.llm.apiKey) headers.Authorization = `Bearer ${config.llm.apiKey}`;
  try {
    let base = wanted;
    let model;
    if (wanted === 'auto') {
      // reuse the server found recently, otherwise look again
      if (autoCache && Date.now() - autoCache.at < 10 * 60e3) {
        base = autoCache.base;
        model = await probe(base, headers, 4000);
      } else {
        const found = await findLocalServer(config.llm.model);
        if (!found) {
          throw new Error(tr({
            en: 'no local model found (looked for Ollama, LM Studio, llama.cpp and vLLM on their usual ports). Start one, or set llm.baseUrl in config.json',
            it: 'nessun modello locale trovato (cercati Ollama, LM Studio, llama.cpp e vLLM sulle porte abituali). Avviane uno, o imposta llm.baseUrl in config.json',
          }));
        }
        base = found.base;
        model = found.model;
      }
      autoCache = { base, at: Date.now() };
    } else {
      model = await probe(base, headers, 4000);
    }
    model = config.llm.model || model || 'local';
    Object.assign(llmStatus, { state: 'online', model, base, at: Date.now(), error: null });
    return { base, headers, model };
  } catch (e) {
    if (wanted === 'auto') autoCache = null;
    Object.assign(llmStatus, { state: 'offline', model: null, base: wanted === 'auto' ? null : wanted, at: Date.now(), error: e.message?.startsWith('no local') || e.message?.startsWith('nessun') ? e.message : describeError(e) });
    return null;
  }
}

/**
 * The creative writer, for the investigation: llm.creative in config.json. With its own baseUrl it
 * is a separate server (a model trained for prose); otherwise it is the newsroom's model, used
 * warmer. Either way the requests carry its temperature. Null when nothing answers.
 */
export async function connectCreative(config) {
  const c = config.llm.creative || {};
  const temperature = Number.isFinite(c.temperature) ? c.temperature : 0.85;
  const maxTokens = Number(c.maxTokens) || 4000;
  const own = String(c.baseUrl || '').trim().replace(/\/+$/, '');
  if (!own) {
    const llm = await connectLLM(c.model ? { ...config, llm: { ...config.llm, model: c.model } } : config);
    return llm && { ...llm, temperature, maxTokens, creative: true };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (c.apiKey) headers.Authorization = `Bearer ${c.apiKey}`;
  try {
    const model = c.model || await probe(own, headers, 4000) || 'local';
    return { base: own, headers, model, temperature, maxTokens, creative: true };
  } catch {
    // the creative server is down: the newsroom's model writes, warmer
    const llm = await connectLLM(config);
    return llm && { ...llm, temperature, maxTokens, creative: true };
  }
}

/**
 * The writer's queue: local servers (llama.cpp, LM Studio…) usually process
 * one request at a time. Sending several at once just makes them wait in the server's queue,
 * where the timeout expires before the model even starts writing.
 */
let active = 0;
const waiting = [];
async function slot(limit) {
  if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
  active++;
}
function release() {
  active--;
  waiting.shift()?.();
}
export const llmQueue = () => ({ active, waiting: waiting.length });

/**
 * One request to the model. With `onText`, the answer is streamed and `onText` receives the text so
 * far as it grows (the writing room shows the piece being typed); servers that don't stream
 * answer all at once, and `onText` is called once.
 */
export async function chat(llm, config, messages, maxTokens = 1400, { onText = null } = {}) {
  await slot(Math.max(1, config.llm.concurrency || 1));
  try {
    return await chatNow(llm, config, messages, maxTokens, onText);
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(tr({
        en: `the model did not answer within ${Math.round(config.llm.timeoutMs / 1000)} seconds (too slow or busy)`,
        it: `il modello non ha risposto entro ${Math.round(config.llm.timeoutMs / 1000)} secondi (troppo lento o occupato)`,
      }));
    }
    throw e;
  } finally {
    release();
  }
}

async function chatNow(llm, config, messages, maxTokens, onText = null) {
  const r = await fetchT(
    `${llm.base}/chat/completions`,
    {
      method: 'POST',
      headers: llm.headers,
      body: JSON.stringify({
        model: llm.model,
        messages,
        temperature: llm.temperature ?? config.llm.temperature,
        max_tokens: maxTokens,
        stream: !!onText,
        // "reasoning" models spend tokens before answering: a newspaper does not need that
        ...(config.llm.thinking ? {} : { chat_template_kwargs: { enable_thinking: false, thinking: false } }),
      }),
    },
    config.llm.timeoutMs
  );
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = onText && /event-stream/.test(r.headers.get('content-type') || '') ? await readStream(r, onText) : await r.json();
  const choice = j.choices?.[0] || {};
  if (onText && choice.message?.content) onText(choice.message.content);
  const content = choice.message?.content ?? '';
  if (!content.trim()) {
    const thought = choice.message?.reasoning_content || choice.message?.reasoning || '';
    throw new Error(choice.finish_reason === 'length'
      ? tr({ en: `truncated answer: ran out of ${maxTokens} tokens${thought ? ' while the model was thinking' : ''}`, it: `risposta troncata: finiti i ${maxTokens} token${thought ? ' mentre il modello ragionava' : ''}` })
      : tr({ en: 'empty answer', it: 'risposta vuota' }));
  }
  if (choice.finish_reason === 'length') llmStatus.truncated = (llmStatus.truncated || 0) + 1;
  return content;
}

/** A streamed answer (server-sent events), put back together as a normal one. */
async function readStream(r, onText) {
  const dec = new TextDecoder();
  let buf = '';
  let content = '';
  let reasoning = '';
  let finish = null;
  let last = 0;
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const ln = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!ln.startsWith('data:')) continue;
      const data = ln.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const c = JSON.parse(data).choices?.[0] || {};
        content += c.delta?.content || '';
        reasoning += c.delta?.reasoning_content || c.delta?.reasoning || '';
        finish = c.finish_reason || finish;
      } catch { /* a broken line: skip it */ }
    }
    // the page polls: a few updates a second are plenty
    if (Date.now() - last > 150) { last = Date.now(); onText(content); }
  }
  return { choices: [{ message: { content, reasoning_content: reasoning }, finish_reason: finish }] };
}

/** Extracts a JSON object even from "dirty" responses (think, ```json, surrounding text). */
export function parseJson(text) {
  let t = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error(tr({ en: 'No JSON in the answer', it: 'Nessun JSON nella risposta' }));
  t = t.slice(a, b + 1);
  try {
    return JSON.parse(t);
  } catch {
    // trailing commas and the like
    return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
  }
}
