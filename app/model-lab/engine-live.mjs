// The Brain Engine's live switches over HTTP, with the server's key (a rented card has one): experts per word (0013), the
// expert mask (0001), dials (0003), and one chat call with the expert trace (0002/0009). Every switch is live and goes back
// with reset(); nothing is written to the brain.
export function live(url, key = process.env.LAB_API_KEY) {
  url = String(url || '').replace(/\/+$/, '');
  const headers = { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) };
  const call = async (p, body, { tries = 4, timeout = 60_000 } = {}) => {
    for (let i = 1; ; i++) {
      try {
        const r = await fetch(url + p, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeout) });
        const t = await r.text();
        if (r.status === 404) throw Object.assign(new Error(`this engine has no ${p} (it needs Brain Engine 7)`), { fatal: true });
        if (!r.ok) throw new Error(`${p} ${r.status}: ${t.slice(0, 200)}`);
        return t ? JSON.parse(t) : {};
      } catch (e) { if (e.fatal || i >= tries) throw e; await new Promise((res) => setTimeout(res, 3000 * i)); }
    }
  };
  const api = {
    url, call,
    // one count for every layer (N), a list per layer, or null = the brain's own
    setUsed: (used) => call('/experts-per-word', { used: used ?? null }),
    getUsed: () => call('/experts-per-word'),
    setMask: (keep) => call('/expert-mask', { keep: keep ?? null }),
    setDials: (dials) => call('/dials', { dials: dials?.length ? dials : [] }),
    reset: async () => { for (const f of [() => api.setDials([]), () => api.setMask(null), () => api.setUsed(null)]) { try { await f(); } catch {} } },
    // a chat that reads (and maybe writes) with the trace on. No tools unless the caller passes them.
    trace: (messages, { mass = false, max = 1, extra = {} } = {}) => call('/v1/chat/completions', { messages, max_tokens: max, cache_prompt: false, temperature: 0, expert_trace: true, ...(mass ? { expert_trace_mass: true } : {}), ...extra }, { timeout: 10 * 60_000 }),
    chat: (body) => call('/v1/chat/completions', body, { timeout: 15 * 60_000 })
  };
  return api;
}

// run `fn` over items with `n` at once, in order of the results
export async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

// Bob's odds shape for a saved answer (tool-score and experts-test use the same): [{t, p, top: [[token, logprob]]}]
export const oddsOf = (lp) => (lp?.content || []).map((x) => ({ t: x.token, p: x.logprob, top: (x.top_logprobs || []).map((y) => [y.token, y.logprob]) }));

// paired difference of two 0/1 score lists on the same questions: mean and its 95% range
export function pairedGap(a, b) {
  const n = Math.min(a.length, b.length); if (!n) return { gap: 0, range: 1, n: 0 };
  const d = Array.from({ length: n }, (_, i) => (a[i] ? 1 : 0) - (b[i] ? 1 : 0));
  const m = d.reduce((x, y) => x + y, 0) / n, v = n > 1 ? d.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1) : 1;
  return { gap: m, range: 1.96 * Math.sqrt(v / n), n };
}
// a score's own 95% range (Wilson), as a ± half width around the plain share
export function wilson(k, n) {
  if (!n) return { p: 0, lo: 0, hi: 1, pm: 0.5 };
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h), pm: (Math.min(1, c + h) - Math.max(0, c - h)) / 2 };
}

// Every assistant turn of a saved lesson as the question a brain is asked: the chat before it (Bob's prompt from the turn's
// tool set), the tools loaded then, and the recorded answer's calls. Same rebuild as tool-score.mjs.
export function turnsOf(lesson, sets) {
  const out = []; let system = null, tools = null; const msgs = [];
  for (const m of lesson.messages || []) {
    if (m.role === 'assistant') {
      if (system === null && sets[m.set]) { system = sets[m.set].system; tools = sets[m.set].tools; }
      if (system !== null) out.push({ k: out.length, messages: [{ role: 'system', content: system }, ...msgs.map((x) => ({ ...x }))], tools, want: (m.tool_calls || []).map((c) => ({ name: c.function?.name, args: c.function?.arguments })) });
      msgs.push({ role: 'assistant', content: m.content || '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map((c, i) => ({ id: c.id || `call_${i}`, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments || {}) } })) } : {}) });
    } else if (m.role === 'tool') msgs.push({ role: 'tool', tool_call_id: m.tool_call_id || 'call_0', name: m.name, content: String(m.content || '') });
    else msgs.push({ role: 'user', content: typeof m.content === 'string' ? m.content : String(m.content?.find?.((p) => p.type === 'text')?.text || '') });
  }
  return out;
}

// per-layer pick counts from any trace (experts or heads): its own counts, or counted from the per-word rows
export function countsOf(tr) {
  if (!tr) return null;
  if (Array.isArray(tr.layers)) return tr.layers;
  if (!Array.isArray(tr.rows)) return null;
  const n = Number(tr.n_expert) || 1 + Math.max(-1, ...tr.rows.flatMap((r) => (r?.e || []).flatMap((ids) => (Array.isArray(ids) ? ids : []))));
  const L = Math.max(0, ...tr.rows.map((r) => (Array.isArray(r?.e) ? r.e.length : 0)));
  const out = Array.from({ length: L }, () => null);
  for (const r of tr.rows) (r?.e || []).forEach((ids, l) => { if (!Array.isArray(ids)) return; out[l] ||= new Array(n).fill(0); for (const id of ids) if (id >= 0 && id < n) out[l][id]++; });
  return out;
}
export function addCounts(acc, layers) {
  if (!Array.isArray(layers)) return false;
  layers.forEach((row, l) => { if (!Array.isArray(row)) { acc[l] ??= null; return; } acc[l] ||= new Array(row.length).fill(0); row.forEach((v, e) => { acc[l][e] += Number(v) || 0; }); });
  return true;
}
