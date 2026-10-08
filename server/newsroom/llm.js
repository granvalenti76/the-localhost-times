/**
 * Client per un server OpenAI-compatibile (llama.cpp, LM Studio, Ollama, vLLM…).
 */
async function fetchT(url, opts = {}, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

const LOCAL_NET_HINT = 'macOS potrebbe bloccare la rete locale: Impostazioni di Sistema → Privacy e sicurezza → Rete locale → abilita l\'app da cui lanci Node (Terminale, iTerm, VS Code…)';

export function describeError(e) {
  if (e?.name === 'AbortError') return 'timeout: nessuna risposta in 4 secondi';
  const code = e?.cause?.code || e?.code;
  const msg = e?.cause?.message || e?.message || String(e);
  if (['EHOSTUNREACH', 'ENETUNREACH', 'EPERM', 'EACCES'].includes(code)) return `${code} — ${LOCAL_NET_HINT}`;
  if (code === 'ECONNREFUSED') return 'ECONNREFUSED — il computer risponde ma nessun server ascolta su quella porta';
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return `${code} — l'indirizzo non risponde (spento? IP cambiato? oppure ${LOCAL_NET_HINT})`;
  return code ? `${code} — ${msg}` : msg;
}

export const llmStatus = { state: 'unknown', model: null, at: null, error: null };

export async function connectLLM(config) {
  const base = (config.llm.baseUrl || '').replace(/\/+$/, '');
  if (!base) {
    Object.assign(llmStatus, { state: 'disabled', model: null, at: Date.now(), error: null });
    return null;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (config.llm.apiKey) headers.Authorization = `Bearer ${config.llm.apiKey}`;
  try {
    const r = await fetchT(`${base}/models`, { headers }, 4000);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const model = config.llm.model || j.data?.[0]?.id || j.models?.[0]?.name || 'local';
    Object.assign(llmStatus, { state: 'online', model, at: Date.now(), error: null });
    return { base, headers, model };
  } catch (e) {
    Object.assign(llmStatus, { state: 'offline', model: null, at: Date.now(), error: describeError(e) });
    return null;
  }
}

/**
 * La fila per il redattore: i server locali (llama.cpp, LM Studio…) di solito elaborano
 * una richiesta alla volta. Mandarne di più insieme le fa solo aspettare in coda sul server,
 * dove il tempo massimo scade prima ancora che il modello cominci a scrivere.
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

export async function chat(llm, config, messages, maxTokens = 1400) {
  await slot(Math.max(1, config.llm.concurrency || 1));
  try {
    return await chatNow(llm, config, messages, maxTokens);
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`il modello non ha risposto entro ${Math.round(config.llm.timeoutMs / 1000)} secondi (troppo lento o occupato)`);
    }
    throw e;
  } finally {
    release();
  }
}

async function chatNow(llm, config, messages, maxTokens) {
  const r = await fetchT(
    `${llm.base}/chat/completions`,
    {
      method: 'POST',
      headers: llm.headers,
      body: JSON.stringify({
        model: llm.model,
        messages,
        temperature: config.llm.temperature,
        max_tokens: maxTokens,
        stream: false,
        // i modelli che "ragionano" consumano token prima di rispondere: per un giornale non serve
        ...(config.llm.thinking ? {} : { chat_template_kwargs: { enable_thinking: false, thinking: false } }),
      }),
    },
    config.llm.timeoutMs
  );
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const choice = j.choices?.[0] || {};
  const content = choice.message?.content ?? '';
  if (!content.trim()) {
    const thought = choice.message?.reasoning_content || choice.message?.reasoning || '';
    throw new Error(choice.finish_reason === 'length'
      ? `risposta troncata: finiti i ${maxTokens} token${thought ? ' mentre il modello ragionava' : ''}`
      : 'risposta vuota');
  }
  if (choice.finish_reason === 'length') llmStatus.truncated = (llmStatus.truncated || 0) + 1;
  return content;
}

/** Estrae un oggetto JSON anche da risposte "sporche" (think, ```json, testo attorno). */
export function parseJson(text) {
  let t = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Nessun JSON nella risposta');
  t = t.slice(a, b + 1);
  try {
    return JSON.parse(t);
  } catch {
    // virgole finali e simili
    return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
  }
}
