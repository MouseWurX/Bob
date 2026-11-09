// 1.5.30: speed and context readings for Now running. Everything here comes from numbers the engine already sends
// at the end of each reply (Ollama's eval_count/eval_duration, llama-server's timings), so it costs nothing extra.

// The share of the prompt that is Bob's instructions and memory (the system message), by characters. A rough split,
// so it is always shown as "about".
export function promptSplit(messages = []) {
  let sys = 0, rest = 0;
  for (const m of messages) {
    const n = typeof m?.content === 'string' ? m.content.length : JSON.stringify(m?.content ?? '').length;
    if (m?.role === 'system') sys += n; else rest += n;
  }
  return sys + rest ? sys / (sys + rest) : 0;
}

// One reply's numbers: tokens per second while writing, and how much of the context the prompt filled.
export function replyStats({ model, messages, promptTokens, outTokens, tokPerSec, ctx, now = Date.now() }) {
  if (!(promptTokens > 0) && !(outTokens > 0)) return null;
  const used = (promptTokens || 0) + (outTokens || 0);
  const sysShare = promptSplit(messages);
  return {
    model, at: now, ctx: ctx || null, used,
    tokPerSec: tokPerSec > 0 ? Math.round(tokPerSec * 10) / 10 : null,
    instructions: Math.round((promptTokens || 0) * sysShare), // about: Bob's instructions and memory
    chat: Math.round((promptTokens || 0) * (1 - sysShare)) + (outTokens || 0) // about: the chat, files and the reply
  };
}

// Processor load from os.cpus() tick counts between two calls: pure arithmetic, no extra program is started.
export function cpuLoad(prev, cpus) {
  const sum = (list) => list.reduce((a, c) => { const t = c.times; a.idle += t.idle; a.all += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, all: 0 });
  const now = sum(cpus);
  if (!prev) return { snap: now, pct: null };
  const all = now.all - prev.all, idle = now.idle - prev.idle;
  return { snap: now, pct: all > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / all) * 100))) : null };
}
