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
    Object.assign(llmStatus, { state: 'offline', model: null, at: Date.now(), error: e.name === 'AbortError' ? 'timeout' : e.message });
    return null;
  }
}

export async function chat(llm, config, messages, maxTokens = 1400) {
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
      }),
    },
    config.llm.timeoutMs
  );
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? '';
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
