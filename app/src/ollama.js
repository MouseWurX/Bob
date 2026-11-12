// Talks to the local Ollama server: chat streaming, what's loaded, loading and unloading.
import { deadline as withDeadline, replyEnd, EARLY_END } from './hang-guard.js'; // items 210-212
import { replyStats } from './speed-stats.js';
import { readCard } from './gaming-card.js';
import { MID_SYSTEM_REFUSED, foldSystem } from './system-notes.js';
import fs from 'node:fs';
import path from 'node:path';

export class Ollama {
  constructor(cfg) {
    this.cfg = cfg;
    this.url = cfg.ollamaUrl.replace(/\/$/, '');
    this.timesFile = path.join(cfg.dataDir, 'load-times.json');
    try { this.loadTimes = JSON.parse(fs.readFileSync(this.timesFile, 'utf8')); } catch { this.loadTimes = {}; }
    this.sizes = {};
    this.thinkers = new Map(); // model -> whether it thinks (Ollama's "thinking" capability), asked once
  }

  async json(p, body, signal) {
    const res = await fetch(this.url + p, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: withDeadline(signal, /generate|chat|pull|create/.test(p) ? 15 * 60_000 : 30_000) // item 212: loads may take a while; look-ups don't
    });
    if (!res.ok) throw new Error(`Ollama ${p} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  // 1.5.49: what loading this brain does to the ones already loaded. Ollama keeps other brains while there's room:
  // on the processor there always is (RAM); on the card, only if the new brain fits in the free graphics memory.
  async loadPlan(model, { cpu = false } = {}) {
    const now = (await this.loaded()).filter((m) => m.name !== model && m.name !== model + ':latest');
    const before = now.map((m) => m.name);
    if (!now.length || cpu) return { before, drop: [], keep: before };
    const card = await readCard().catch(() => null);
    const need = (await this.modelSize(model)) / 1048576;
    const fits = card && need && need < card.freeMB * 0.95;
    const onCard = now.filter((m) => m.vram > 0).map((m) => m.name);
    return fits ? { before, drop: [], keep: before } : { before, drop: onCard, keep: before.filter((n) => !onCard.includes(n)) };
  }

  async loaded() {
    const r = await this.json('/api/ps');
    return (r.models || []).map((m) => ({ name: m.name || m.model, size: m.size, vram: m.size_vram, split: true, ctx: m.context_length || this.ctxOf?.[m.name || m.model] || null }));
  }

  // cpu: the model must be running on the processor only (Art session), so the painter keeps the card.
  async isLoaded(model, { cpu = false, ctx } = {}) {
    if (ctx && this.ctxOf?.[model] !== ctx) return false; // a different context size means a reload
    return (await this.loaded()).some((m) => (m.name === model || m.name === model + ':latest') && (!cpu || !m.vram));
  }

  // The longest context a model was made for (from /api/show), so a session never asks for more.
  async maxCtx(model) {
    (this.ctxMax ||= {});
    if (model in this.ctxMax) return this.ctxMax[model];
    try {
      const info = (await this.json('/api/show', { model })).model_info || {};
      const k = Object.keys(info).find((x) => x.endsWith('.context_length'));
      this.ctxMax[model] = k ? Number(info[k]) || null : null;
    } catch { this.ctxMax[model] = null; }
    return this.ctxMax[model];
  }

  // Whether a model can look at pictures (Ollama lists "vision" in its capabilities).
  async hasVision(model) {
    (this.vision ||= {});
    if (!(model in this.vision)) {
      try { this.vision[model] = ((await this.json('/api/show', { model })).capabilities || []).includes('vision'); } catch { return false; }
    }
    return this.vision[model];
  }

  // Options for a request: num_gpu 0 keeps a model entirely off the graphics card.
  opts(cpu, ctx) { const o = { ...(cpu ? { num_gpu: 0 } : {}), ...(ctx ? { num_ctx: ctx } : {}) }; return Object.keys(o).length ? o : undefined; }

  async modelSize(model) {
    if (this.sizes[model]) return this.sizes[model];
    try {
      const r = await this.json('/api/tags');
      for (const m of r.models || []) this.sizes[m.name] = m.size;
    } catch { /* fall through */ }
    return this.sizes[model] || 0;
  }

  // Seconds Bob expects a load to take: the last measured time, else a guess from file size.
  async estimateLoad(model) {
    if (this.loadTimes[model]) return Math.round(this.loadTimes[model]);
    const gb = (await this.modelSize(model)) / 1e9;
    return gb ? Math.max(5, Math.round(gb * 0.9)) : 15;
  }

  async preload(model, signal, { cpu = false, ctx } = {}) {
    (this.ctxOf ||= {})[model] = ctx || null;
    const t0 = Date.now();
    await this.json('/api/generate', { model, prompt: '', keep_alive: this.keepAlive(model), options: this.opts(cpu, ctx) }, signal);
    const secs = (Date.now() - t0) / 1000;
    if (!cpu) this.loadTimes[model] = secs;
    try { fs.writeFileSync(this.timesFile, JSON.stringify(this.loadTimes, null, 2)); } catch { /* not fatal */ }
    return secs;
  }

  // 1.5.24 "Get Bob ready while you type": read the instructions now; Ollama keeps the reading while the brain is
  // loaded, so the next message only reads itself. Same options as the load, or Ollama would reload the model.
  async prime(model, { ctx, cpu = false, messages, tools } = {}) {
    await this.json('/api/chat', { model, messages: [...messages, { role: 'user', content: '.' }], tools: tools?.length ? tools : undefined, stream: false, keep_alive: this.keepAlive(model), think: await this.thinkField(model, false), options: { ...this.opts(cpu, ctx), num_predict: 1 } });
    return 'read';
  }

  async unloadAll() {
    const models = await this.loaded();
    for (const m of models) {
      await this.json('/api/generate', { model: m.name, prompt: '', keep_alive: 0 }).catch(() => {});
    }
    return models.map((m) => m.name);
  }

  // Lets go of everything on the graphics card; models running on the processor stay.
  async unloadGpu() {
    const models = (await this.loaded()).filter((m) => m.vram > 0);
    for (const m of models) await this.json('/api/generate', { model: m.name, prompt: '', keep_alive: 0 }).catch(() => {});
    return models.map((m) => m.name);
  }

  // How long Ollama keeps a model in memory after use (setting ollamaKeepAlive, default 5 minutes).
  // keepFor (set by the brain) can override it per model: "Always on" holds the chat brain with -1.
  keepAlive(model) {
    if (model && this.keepFor) { try { const v = this.keepFor(model); if (v !== undefined) return v; } catch {} }
    const k = String(this.cfg?.ollamaKeepAlive ?? '5m'); return /^\d+[smh]$|^-1$/.test(k) ? (k === '-1' ? -1 : k) : '5m';
  }

  // Lets go of one model. Returns the names unloaded.
  async unload(model) {
    const hit = (await this.loaded()).filter((m) => m.name === model || m.name === model + ':latest' || m.name + ':latest' === model);
    for (const m of hit) await this.json('/api/generate', { model: m.name, prompt: '', keep_alive: 0 }).catch(() => {});
    return hit.map((m) => m.name);
  }

  // Re-sets how long a loaded model stays (after the Brain toggle changes). Doesn't count as a load time.
  // Same options as the load (cpu, context size), or Ollama would reload the model to change them.
  async touch(model, { cpu = false, ctx } = {}) {
    if (!(await this.isLoaded(model, { cpu, ctx }).catch(() => false))) return;
    await this.json('/api/generate', { model, prompt: '', keep_alive: this.keepAlive(model), options: this.opts(cpu, ctx) }).catch(() => {});
  }

  // A model's details; "capabilities" lists completion, vision, audio, tools, thinking (newer Ollama).
  async show(model) { return this.json('/api/show', { model }); }

  // 1.5.16: whether a model thinks before answering (gemma4, qwen3...). Asked once per model; unknown counts as no.
  async canThink(model) {
    if (!this.thinkers.has(model)) this.thinkers.set(model, this.show(model).then((r) => (r?.capabilities || []).includes('thinking')).catch(() => false));
    return this.thinkers.get(model);
  }

  // What to send as "think". false (a quick reply) turns thinking off, but only for models that think; gpt-oss can't
  // switch it off, so it gets its lowest level. A level ('high') still goes only to gpt-oss, as before.
  async thinkField(model, think) {
    if (think === false) return /gpt-oss/.test(model) ? 'low' : (await this.canThink(model)) ? false : undefined;
    return think && /gpt-oss/.test(model) ? think : undefined;
  }

  // Embeddings for topic matching (housekeeping). Never downloads: a model that isn't on this PC is an error,
  // and the housekeeper then matches topics by name and words instead.
  async embed(model, input) {
    const r = await this.json('/api/embed', { model, input, keep_alive: '2m' });
    if (!Array.isArray(r?.embeddings)) throw new Error('no embeddings');
    return r.embeddings;
  }

  // Streams a chat. Calls onToken(text) for visible text, and onThink(text) for the model's thinking (1.5.53, only
  // passed while the "Bob's thinking" window is open). Returns the final assistant message.
  async chat(args) {
    // 1.5.61: the same fold as llama.cpp (system-notes.js). Ollama runs some brains' own chat templates (Qwen 3.8), and
    // those refuse a system message anywhere but first; it was never caught here, so Medium effort failed with a 500.
    this.noMidSystem ||= new Set();
    const { model } = args;
    if (this.noMidSystem.has(model)) return this.chatOnce({ ...args, messages: foldSystem(args.messages) });
    try { return await this.chatOnce(args); } catch (e) {
      if (args.signal?.aborted || !MID_SYSTEM_REFUSED.test(String(e.full || e.message))) throw e;
      this.noMidSystem.add(model);
      this.log?.('engine', `${model}: its chat template only takes a system message first, so Bob's notes go in as user notes from now on`);
      return this.chatOnce({ ...args, messages: foldSystem(args.messages) });
    }
  }

  async chatOnce({ model, messages, tools, signal, onToken, onThink, cpu = false, think, ctx, temperature }) {
    const thinkSend = await this.thinkField(model, think);
    const res = await fetch(this.url + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: tools && tools.length ? tools : undefined, stream: true, keep_alive: this.keepAlive(model), options: Number.isFinite(temperature) ? { ...this.opts(cpu, ctx), temperature } : this.opts(cpu, ctx), // an assistant preset's own temperature
        // Deep thought: gpt-oss takes a reasoning level; other models don't all understand "think", so it's only sent to gpt-oss.
        think: thinkSend }),
      signal
    });
    if (!res.ok) { const full = await res.text(); throw Object.assign(new Error(`Ollama chat returned ${res.status}: ${full.slice(0, 300)}`), { full }); }
    let content = '';
    const toolCalls = [];
    let buf = '';
    let done = false, finish = ''; // items 210, 211 (hang-guard.js): how the reply ended
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; } // a cut or odd line: skip it rather than lose the whole reply
        if (ev.error) throw new Error('Ollama: ' + ev.error);
        const msg = ev.message || {};
        if (msg.thinking && onThink) onThink(msg.thinking);
        if (msg.content) { content += msg.content; onToken && onToken(msg.content); }
        if (msg.tool_calls) toolCalls.push(...msg.tool_calls);
        if (ev.done) { done = true; finish = ev.done_reason || ''; }
        // 1.5.30: the last line carries the reply's numbers; kept for Now running (no extra work for Ollama).
        if (ev.done) this.lastStats = ((st) => { if (st) { try { this.onStats?.(st); } catch {} } return st; })(replyStats({ model, messages, promptTokens: ev.prompt_eval_count, outTokens: ev.eval_count, tokPerSec: ev.eval_duration ? ev.eval_count / (ev.eval_duration / 1e9) : 0, ctx: ctx || this.ctxOf?.[model] })) || this.lastStats; // 96 Speed history hears each reply
      }
    }
    const end = replyEnd({ done, finish });
    if (end === 'early') { this.log?.('engine', `${model}'s reply stopped before Ollama said it was done (${content.length.toLocaleString()} characters so far)`); throw new Error(EARLY_END); }
    return { role: 'assistant', content, tool_calls: toolCalls.length ? toolCalls : undefined, ...(end === 'length' ? { cut: 'length' } : {}) };
  }
}
