// Rented brains (1.5.127): a big brain hired from a service the owner has an account with, for one job.
// Three kinds, named by what they do: "pay per answer" (OpenRouter, Together, Lambda, or any address that speaks the
// common OpenAI-style API), "RunPod serverless" (per second, scales to zero itself) and "a machine by the minute"
// (RunPod pods, Vast.ai, Lambda). A rented brain is Bob's own brain for the whole job: the same prompt, memory and
// tools; the tools still run on this replicant matrix. Nothing is hired without a card the owner pressed, every limit
// starts at 0, and a hired machine carries a self-destruct timer so it dies even if this computer does.
// Keys: environment variables only (the owner's pick, 2026-11-06). Bob never stores a key, never logs one, and sends
// it only to the service it belongs to. On Mac and Linux they can also sit in ~/.config/bob/env (NAME=value lines).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { keyEnv } from './cloud.js';
import { LlamaCpp, cleanHarmony, textCalls, TEXT_CALL_START, MAX_REPLY_TOKENS } from './llamacpp.js';
import { tidySchema } from './toolbox.js';
import { parseJson } from './util.js';

export const RENT_PREFIX = 'bob-rental-'; // every machine Bob starts is named this way, so he only ever stops his own

// Prices here are rough list prices (early November 2026) for the card tiers, used only until the service's own price
// is read (readPrice). They're labelled "about" everywhere on screen and the service's billing page is the real bill.
export const CARDS = {
  '24': { name: '24 GB card', say: 'fits a 24Bob or any Q4 file up to about 20 GB', perHour: 0.7, runpod: ['NVIDIA GeForce RTX 4090', 'NVIDIA RTX A5000', 'NVIDIA L4'], vastGB: 24, lambda: ['gpu_1x_a10'] },
  '48': { name: '48 GB card', say: 'fits a 35B model at Q8, or a 24Bob at full size with a short memory', perHour: 1.2, runpod: ['NVIDIA RTX A6000', 'NVIDIA L40S', 'NVIDIA L40', 'NVIDIA RTX 6000 Ada Generation'], vastGB: 48, lambda: ['gpu_1x_a6000'] },
  '80': { name: '80 GB card', say: 'fits a 35B model at full size with its whole memory', perHour: 3.5, runpod: ['NVIDIA H100 80GB HBM3', 'NVIDIA H100 PCIe', 'NVIDIA A100 80GB PCIe', 'NVIDIA A100-SXM4-80GB'], vastGB: 80, lambda: ['gpu_1x_h100_pcie', 'gpu_1x_h100_sxm5', 'gpu_1x_a100_sxm4'] },
  '141': { name: '141 GB card', say: 'the biggest single card: a 70B model at full size', perHour: 5, runpod: ['NVIDIA H200'], vastGB: 141, lambda: ['gpu_1x_h200'] }
};

export const SERVICES = [
  { id: 'openrouter', name: 'OpenRouter', kind: 'answer', keyEnv: 'OPENROUTER_API_KEY', keyPage: 'https://openrouter.ai/keys', modelsPage: 'https://openrouter.ai/models', baseUrl: 'https://openrouter.ai/api/v1', what: 'Pay per answer. Hundreds of open models behind one key; nothing to shut down.' },
  { id: 'together', name: 'Together AI', kind: 'answer', keyEnv: 'TOGETHER_API_KEY', keyPage: 'https://api.together.ai/settings/api-keys', modelsPage: 'https://www.together.ai/models', baseUrl: 'https://api.together.xyz/v1', what: 'Pay per answer. Fast hosting of the big open models; nothing to shut down.' },
  { id: 'lambda', name: 'Lambda (pay per answer)', kind: 'answer', keyEnv: 'LAMBDA_API_KEY', keyPage: 'https://cloud.lambda.ai/api-keys', modelsPage: 'https://docs.lambda.ai/public-cloud/lambda-inference-api/', baseUrl: 'https://api.lambda.ai/v1', what: 'Pay per answer, on the same key as Lambda machines.' },
  { id: 'runpod-serverless', name: 'RunPod (serverless)', kind: 'serverless', keyEnv: 'RUNPOD_API_KEY', keyPage: 'https://www.runpod.io/console/user/settings', what: 'Billed by the second, only while a job runs. Starts in a minute or two and switches itself off. Runs any model from Hugging Face, including Bob\'s own.' },
  { id: 'runpod', name: 'RunPod (a machine by the minute)', kind: 'machine', keyEnv: 'RUNPOD_API_KEY', keyPage: 'https://www.runpod.io/console/user/settings', what: 'A whole graphics card, started by Bob and stopped when the job is done. A few minutes to start.' },
  { id: 'vast', name: 'Vast.ai (a machine by the minute)', kind: 'machine', keyEnv: 'VAST_API_KEY', keyPage: 'https://cloud.vast.ai/manage-keys/', what: 'A marketplace of other people\'s cards, often the cheapest. Starts in a few minutes. The chat travels to the machine over a plain connection.', plain: true },
  { id: 'lambda-machine', name: 'Lambda (a machine by the minute)', kind: 'machine', keyEnv: 'LAMBDA_API_KEY', keyPage: 'https://cloud.lambda.ai/api-keys', what: 'A whole graphics card from Lambda. Needs an SSH key on your Lambda account. The chat travels to the machine over a plain connection.', plain: true },
  { id: 'other', name: 'Another service (address and key)', kind: 'answer', keyEnv: '', keyPage: '', what: 'Any service, or a friend\'s server, that speaks the common OpenAI-style API: you type its address and the name of the variable that holds its key.' }
];
export const serviceOf = (id) => SERVICES.find((s) => s.id === id) || null;
// How many cards one hired machine may have. More than one is for a model that doesn't fit a single card (the giant
// MoE models); it costs that many times as much an hour, so Settings shows a big warning before it can be picked.
export const CARD_COUNTS = [1, 2, 4, 8];
export const cardsOf = (rental) => (CARD_COUNTS.includes(Number(rental?.cards)) ? Number(rental.cards) : 1);
export const cardsText = (rental) => { const n = cardsOf(rental); const c = CARDS[rental?.card || '48']; return n > 1 ? `${n} × ${c?.name || 'card'} on one machine` : c?.name || 'card'; };

// ---------- keys ----------
// 1.5.127: on Mac and Linux an app started from the Dock or a menu doesn't see the shell's variables, so Bob also reads
// ~/.config/bob/env (plain NAME=value lines, mode 600). He only ever reads it. Cached for a minute.
let envFileCache = null;
export function envFileVars({ home = os.homedir(), platform = process.platform, now = Date.now() } = {}) {
  if (platform === 'win32') return {};
  if (envFileCache && now - envFileCache.at < 60000 && envFileCache.home === home) return envFileCache.vars;
  const vars = {};
  try {
    const text = fs.readFileSync(path.join(home, '.config', 'bob', 'env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,63})\s*=\s*(.*?)\s*$/);
      if (m) vars[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  } catch {}
  envFileCache = { at: now, home, vars };
  return vars;
}
// For testing on a machine whose user variables hold a real key: BOB_RENT_KEYS=off makes Bob see no key at all;
// BOB_RENT_KEYS=env makes him read process.env only (no Windows registry, no ~/.config/bob/env). Not a setting.
export function rentKeyEnv(base = keyEnv(), file = envFileVars()) {
  const mode = process.env.BOB_RENT_KEYS;
  if (mode === 'off') return {};
  if (mode === 'env') return { ...process.env };
  return new Proxy(base, { get(target, k) { if (typeof k !== 'string') return undefined; return target[k] || file[k] || undefined; } });
}
export const KEY_NAME_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
export function keyEnvFor(rental, service = serviceOf(rental?.service)) {
  if (!service) return '';
  return service.id === 'other' ? (KEY_NAME_RE.test(rental?.keyEnv || '') ? rental.keyEnv : '') : service.keyEnv;
}
// Anything that could be a key is stripped before an error is shown or logged.
export function scrubKey(text, keys = []) {
  let s = String(text || '');
  for (const k of keys) if (k && k.length >= 8) s = s.split(k).join('[key]');
  return s.replace(/(Bearer|Authorization:?|x-api-key:?|api[_-]?key[=:])\s*[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [key]').replace(/\b(sk|rpa|or|tgp)[_-][A-Za-z0-9_-]{16,}/g, '[key]');
}

// ---------- settings ----------
export const DEFAULT_CAPS = { month: 0, job: 0, minutes: 0 }; // every limit starts at 0 (the owner's rule): nothing is hired until each is set
export function cleanCaps(c = {}) {
  const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n * 100) / 100) : 0; };
  return { month: num(c.month, 10000), job: num(c.job, 10000), minutes: Math.round(num(c.minutes, 24 * 60)) };
}
export const RENTAL_ID_RE = /^[a-z0-9]{6,12}$/;
export function cleanRental(r = {}) {
  const service = serviceOf(r.service);
  if (!service) return null;
  const out = { id: RENTAL_ID_RE.test(r.id || '') ? r.id : crypto.randomBytes(4).toString('hex'), service: service.id };
  const model = String(r.model || '').replace(/[\u0000-\u001f\s]/g, '').slice(0, 160);
  if (!/^[\w.:/-]{1,160}$/.test(model)) return null;
  out.model = model;
  out.name = String(r.name || '').replace(/[\u0000-\u001f<>{}"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || `${model.split('/').pop()} on ${service.name}`;
  if (service.kind !== 'answer') out.card = CARDS[String(r.card)] ? String(r.card) : '48';
  if (service.kind === 'machine' && CARD_COUNTS.includes(Number(r.cards)) && Number(r.cards) > 1) out.cards = Number(r.cards); // several cards on one machine (serverless stays at one)
  if (service.id === 'other') {
    const addr = String(r.address || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s"'<>]{3,200}$/.test(addr)) return null;
    out.address = addr;
    out.keyEnv = KEY_NAME_RE.test(r.keyEnv || '') ? r.keyEnv : '';
  }
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
  if (num(r.inPerM) != null) out.inPerM = num(r.inPerM); // $ per million words in / out (pay per answer)
  if (num(r.outPerM) != null) out.outPerM = num(r.outPerM);
  if (num(r.perHour) != null) out.perHour = num(r.perHour); // $ per hour (machines, serverless worker time)
  if (typeof r.endpointId === 'string' && /^[\w-]{4,40}$/.test(r.endpointId)) out.endpointId = r.endpointId; // RunPod serverless, reused
  if (typeof r.region === 'string' && /^[\w-]{2,30}$/.test(r.region)) out.region = r.region;
  return out;
}
// What config.json may hold under "rentals": switches per service, the limits, the list, which one is in the slot,
// and which services the owner has read the warning card for. Nothing else gets in (no addresses but the typed one, no keys).
export function cleanRentals(v = {}) {
  const out = { enabled: {}, caps: cleanCaps(v.caps), list: [], current: '', warned: {} };
  for (const [id, on] of Object.entries(v.enabled || {})) if (serviceOf(id) && typeof on === 'boolean') out.enabled[id] = on;
  for (const [id, on] of Object.entries(v.warned || {})) if (serviceOf(id) && on === true) out.warned[id] = true;
  const seen = new Set();
  for (const r of [].concat(v.list || []).slice(0, 30)) { const c = cleanRental(r); if (c && !seen.has(c.id)) { seen.add(c.id); out.list.push(c); } }
  if (typeof v.current === 'string' && out.list.some((r) => r.id === v.current)) out.current = v.current;
  return out;
}
export const rentalsOf = (cfg) => cleanRentals(cfg?.rentals || {});
export function currentRental(cfg) {
  const r = rentalsOf(cfg);
  return r.list.find((x) => x.id === r.current) || null;
}
// A rental is ready when its service is switched on and its key is on this replicant matrix.
export function rentalReady(cfg, rental, env = rentKeyEnv()) {
  if (!rental) return { ok: false, why: 'No rented brain is in its slot.' };
  const r = rentalsOf(cfg);
  const s = serviceOf(rental.service);
  if (!r.enabled[rental.service]) return { ok: false, why: `"Let Bob hire from ${s.name}" is off (Settings, Online services).` };
  const kname = keyEnvFor(rental, s);
  if (!kname) return { ok: false, why: 'This rental has no key variable named. Edit it in Settings, Online services.' };
  if (!env[kname]) return { ok: false, why: `No key yet: add a variable named ${kname} on this replicant matrix.` };
  return { ok: true };
}

// ---------- money ----------
export const money = (n) => (n == null ? '' : n < 0.01 && n > 0 ? 'under 1 cent' : `$${(Math.round(n * 100) / 100).toFixed(2)}`);
export function priceLine(rental) {
  const s = serviceOf(rental.service);
  if (!s) return '';
  if (s.kind === 'answer') {
    if (rental.inPerM == null && rental.outPerM == null) return 'price not read yet';
    return `about ${money((rental.inPerM || 0) / 10)} per 100K words read, ${money((rental.outPerM || 0) / 10)} per 100K written`;
  }
  const ph = rental.perHour ?? (CARDS[rental.card || '48']?.perHour ?? 2) * cardsOf(rental);
  return `about ${money(ph)} an hour${cardsOf(rental) > 1 ? ` for ${cardsOf(rental)} cards` : ''}${s.kind === 'machine' ? ' plus the minutes it takes to start' : ', only while it works'}`;
}
// A rough cost for a job before it starts: words in and out for pay per answer; start-up plus working minutes for machines.
export function estimate(rental, { tokensIn = 0, tokensOut = 2000, minutes = 10 } = {}) {
  const s = serviceOf(rental.service);
  if (!s) return 0;
  if (s.kind === 'answer') return ((rental.inPerM || 0) * tokensIn + (rental.outPerM || 0) * tokensOut) / 1e6;
  const ph = rental.perHour ?? (CARDS[rental.card || '48']?.perHour ?? 2) * cardsOf(rental);
  const start = s.kind === 'machine' ? 5 : 1;
  return (ph / 60) * (minutes + start);
}

export const estimateText = (rental, tokens = 0) => { const e = estimate(rental, { tokensIn: tokens, tokensOut: 3000, minutes: 10 }); return e >= 0.01 ? `about ${money(e)}` : 'under 1 cent'; };
// A RunPod serverless endpoint is made once and reused; its id is kept with the rental.
export function saveEndpoint(cfg, rentalId, endpointId) {
  const st = rentalsOf(cfg);
  const r = st.list.find((x) => x.id === rentalId);
  if (!r) return false;
  r.endpointId = endpointId;
  cfg.rentals = st;
  return true;
}

// ---------- the ledger: what was spent, kept on this replicant matrix ----------
export class Ledger {
  constructor(file, { now = Date.now } = {}) { this.file = file; this.now = now; this.rows = null; }
  load() {
    if (this.rows) return this.rows;
    try { this.rows = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (!Array.isArray(this.rows)) this.rows = []; } catch { this.rows = []; }
    return this.rows;
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.load().slice(-2000), null, 1)); } catch {} }
  add(row) { this.load().push({ at: this.now(), ...row }); this.save(); return row; }
  monthSpent(now = this.now()) {
    const d = new Date(now);
    const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    return this.load().filter((r) => r.at >= from).reduce((n, r) => n + (Number(r.usd) || 0), 0);
  }
  recent(n = 20) { return this.load().slice(-n).reverse(); }
}

// ---------- the brain itself: an OpenAI-style chat endpoint with a key ----------
// The same request shape llama-server takes (LlamaCpp.toOpenAI), so tool calls, pictures and system notes work the same.
export async function chatOpenAI({ url, key, model, messages, tools, signal, onToken, onThink, think, fetchImpl = fetch, log = () => {} }) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;
  const body = { model, messages: LlamaCpp.toOpenAI(messages), tools: tools && tools.length ? tidySchema(tools) : undefined, stream: true, stream_options: { include_usage: true }, max_tokens: MAX_REPLY_TOKENS };
  if (think === false) body.chat_template_kwargs = { enable_thinking: false };
  let res;
  try { res = await fetchImpl(`${url.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal }); }
  catch (e) { throw new Error(`couldn't reach the rented brain (${scrubKey(e.message, [key])})`); }
  if (!res.ok) {
    const text = scrubKey((await res.text().catch(() => '')).slice(0, 300), [key]);
    const e = new Error(`the rented brain answered ${res.status}: ${text}`);
    e.status = res.status;
    throw e;
  }
  let content = '', held = null, usage = null;
  const calls = [];
  let buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      const ev = parseJson(data);
      if (!ev) continue;
      if (ev.error) throw new Error('the rented brain said: ' + scrubKey(ev.error.message || JSON.stringify(ev.error), [key]));
      if (ev.usage) usage = { in: ev.usage.prompt_tokens, out: ev.usage.completion_tokens, usd: ev.usage.cost ?? ev.usage.total_cost ?? null };
      const d = ev.choices?.[0]?.delta || {};
      const thought = d.reasoning_content || d.reasoning;
      if (thought && onThink) onThink(thought);
      if (d.content) {
        content += d.content;
        if (!tools?.length) onToken && onToken(d.content);
        else if (held === null) { if (content.trim()) { if (TEXT_CALL_START.test(content.trimStart())) held = content; else { held = false; onToken && onToken(content); } } }
        else if (held === false) onToken && onToken(d.content);
        else held += d.content;
      }
      for (const tc of d.tool_calls || []) {
        const i = tc.index ?? calls.length;
        calls[i] = calls[i] || { name: '', args: '' };
        if (tc.function?.name) calls[i].name += tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }
    }
  }
  const tool_calls = calls.filter(Boolean).map((c) => { let args = {}; try { args = c.args ? JSON.parse(c.args) : {}; } catch { args = {}; } return { function: { name: c.name, arguments: args } }; });
  let reply;
  if (!tool_calls.length && tools?.length) {
    const names = new Set(tools.map((t) => t.function?.name).filter(Boolean));
    const rescued = textCalls(content, names);
    if (rescued) reply = { role: 'assistant', content: rescued.text, tool_calls: rescued.calls };
  }
  if (!reply) {
    if (held) onToken && onToken(cleanHarmony(held));
    if (held && /<\|(channel|message|start|end)\|>/.test(content)) content = cleanHarmony(content);
    reply = { role: 'assistant', content, tool_calls: tool_calls.length ? tool_calls : undefined };
  }
  if (!usage) usage = { in: Math.ceil(JSON.stringify(body.messages).length / 4), out: Math.ceil((content.length + JSON.stringify(tool_calls).length) / 4), usd: null, guessed: true };
  log('rent', `reply: ${usage.in} words in, ${usage.out} out${usage.usd != null ? `, ${money(usage.usd)}` : ''}`);
  return { reply, usage };
}

// Reads the service's own price for a model (pay per answer), so the card quotes the real list price.
export async function readPrice(rental, key, fetchImpl = fetch) {
  const s = serviceOf(rental.service);
  if (!s || s.kind !== 'answer') return null;
  const url = (rental.address || s.baseUrl).replace(/\/$/, '') + '/models';
  const res = await fetchImpl(url, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${s.name} answered ${res.status} when asked for its model list`);
  const j = await res.json();
  const list = Array.isArray(j) ? j : j.data || j.models || [];
  const m = list.find((x) => x.id === rental.model || x.name === rental.model);
  if (!m) throw new Error(`${s.name} has no model called "${rental.model}". Check the name on its model list.`);
  const p = m.pricing || {};
  // OpenRouter: dollars per word as strings; Together: dollars per million words.
  const perM = (v) => (v == null ? null : Number(v) < 0.01 ? Number(v) * 1e6 : Number(v));
  const inPerM = perM(p.prompt ?? p.input ?? m.input_price ?? m.pricing?.input), outPerM = perM(p.completion ?? p.output ?? m.output_price ?? m.pricing?.output);
  return { inPerM: Number.isFinite(inPerM) ? inPerM : null, outPerM: Number.isFinite(outPerM) ? outPerM : null, context: m.context_length || m.context_window || null };
}

// 1.5.137: find a brain from Bob's list on a pay-per-answer service, so you don't have to know what the service calls
// it. Its Hugging Face name (Owner/Repo) or its plain name is matched against the service's own model list, letters and
// digits only: exact first, then one that starts with the other. Only when you press Find it, with the service on.
const plainName = (x) => String(x || '').toLowerCase().replace(/[-_](fp8|bf16|fp16|mxfp8|gguf|awq|gptq)$/i, '').replace(/[^a-z0-9.]+/g, '');
export function matchModel(list, { hf = '', name = '' } = {}) {
  const want = [plainName(String(hf).split('/').pop()), plainName(name)].filter((w) => w.length >= 4);
  const ids = (list || []).map((x) => ({ id: String(x.id || x.name || ''), keys: [plainName(String(x.id || '').split('/').pop()), plainName(x.name)].filter(Boolean) })).filter((x) => x.id);
  for (const w of want) { const hit = ids.find((x) => x.keys.includes(w)); if (hit) return hit.id; }
  for (const w of want) { const hit = ids.find((x) => x.keys.some((k) => k.length >= 6 && (k.startsWith(w) || w.startsWith(k)))); if (hit) return hit.id; }
  return null;
}
export async function findModel(service, { hf, name, address = '' }, key, fetchImpl = fetch) {
  const s = serviceOf(service);
  if (!s || s.kind !== 'answer') return null;
  const url = (address || s.baseUrl || '').replace(/\/$/, '') + '/models';
  if (!/^https:\/\//.test(url)) return null;
  const res = await fetchImpl(url, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${s.name} answered ${res.status} when asked for its model list`);
  const j = await res.json();
  return matchModel(Array.isArray(j) ? j : j.data || j.models || [], { hf, name });
}

// ---------- machines ----------
// The server a hired machine runs: vLLM for a Hugging Face model at full size, llama.cpp for a GGUF file
// ("hf:Owner/Repo/file.gguf"). Both answer the OpenAI-style API on port 8000. The command is wrapped in a timer (the
// longest run the owner set) so the machine stops itself even if this computer never tells it to.
export function modelSpec(model) {
  const m = String(model || '');
  const gg = m.match(/^hf:([^/]+\/[^/]+)\/(.+\.gguf)$/i) || m.match(/^([^/]+\/[^/]+)\/(.+\.gguf)$/i);
  if (gg) return { kind: 'gguf', repo: gg[1], file: gg[2], image: 'ghcr.io/ggml-org/llama.cpp:server-cuda', port: 8000 };
  return { kind: 'vllm', repo: m, image: 'vllm/vllm-openai:latest', port: 8000 };
}
export function serverCommand(model, { minutes, after = '', cards = 1 } = {}) {
  const spec = modelSpec(model);
  const secs = Math.max(60, Math.round((minutes || 60) * 60));
  const run = spec.kind === 'gguf'
    ? `/app/llama-server --host 0.0.0.0 --port ${spec.port} -ngl 999 -c 32768 --hf-repo ${spec.repo} --hf-file ${spec.file}`
    : `python3 -m vllm.entrypoints.openai.api_server --host 0.0.0.0 --port ${spec.port} --model ${spec.repo} --max-model-len 32768 --enable-auto-tool-choice --tool-call-parser hermes${cards > 1 ? ` --tensor-parallel-size ${cards}` : ''}`; // llama.cpp splits layers over every card it sees by itself
  // timeout: the self-destruct. When it fires (or the server dies), the "after" line tells the service to remove the machine.
  return `timeout ${secs} ${run}; ${after || 'true'}`;
}

const RUNPOD = 'https://rest.runpod.io/v1';
const VAST = 'https://console.vast.ai/api/v0';
const LAMBDA = 'https://cloud.lambda.ai/api/v1';

export class Machines {
  constructor({ fetchImpl = fetch, now = Date.now, log = () => {} } = {}) { this.fetch = fetchImpl; this.now = now; this.log = log; }
  async api(url, { key, method = 'GET', body, auth = 'bearer', timeout = 30000 } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (auth === 'bearer') headers.authorization = `Bearer ${key}`;
    if (auth === 'basic') headers.authorization = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
    const res = await this.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}: ${scrubKey(text.slice(0, 200), [key])}`);
    if (!text) return null;
    try { return JSON.parse(text); } catch { return parseJson(text) ?? text; } // lists come back as arrays, which parseJson skips
  }

  // Starts a machine (or reuses a serverless endpoint). Returns { id, url, kind, startedAt, name }.
  async start(rental, { key, minutes, onNote = () => {} }) {
    const s = serviceOf(rental.service);
    const name = `${RENT_PREFIX}${rental.id}`;
    const card = CARDS[rental.card || '48'];
    if (s.id === 'runpod-serverless') {
      let id = rental.endpointId;
      if (!id) {
        onNote('Making a RunPod serverless endpoint for this model (once; it costs nothing while idle)…');
        const spec = modelSpec(rental.model);
        const j = await this.api(`${RUNPOD}/endpoints`, { key, method: 'POST', body: { name, workersMin: 0, workersMax: 1, idleTimeout: 5, gpuTypeIds: card.runpod, templateId: undefined, imageName: 'runpod/worker-v1-vllm:stable-cuda12.1.0', env: { MODEL_NAME: spec.repo, MAX_MODEL_LEN: '32768', ENABLE_AUTO_TOOL_CHOICE: 'true', TOOL_CALL_PARSER: 'hermes' } } });
        id = j?.id;
        if (!id) throw new Error('RunPod didn\'t give the endpoint an id.');
      }
      return { id, url: `https://api.runpod.ai/v2/${id}/openai/v1`, kind: 'serverless', startedAt: this.now(), name, newEndpoint: !rental.endpointId };
    }
    if (s.id === 'runpod') {
      const spec = modelSpec(rental.model);
      const cmd = serverCommand(rental.model, { minutes, after: 'runpodctl remove pod $RUNPOD_POD_ID', cards: cardsOf(rental) });
      onNote(`Starting ${cardsText(rental)} on RunPod…`);
      const j = await this.api(`${RUNPOD}/pods`, { key, method: 'POST', body: { name, imageName: spec.image, gpuTypeIds: card.runpod, gpuCount: cardsOf(rental), containerDiskInGb: 60, volumeInGb: 0, ports: [`${spec.port}/http`], dockerEntrypoint: ['/bin/sh', '-c'], dockerStartCmd: [cmd], env: { RUNPOD_API_KEY: key } } });
      if (!j?.id) throw new Error('RunPod didn\'t give the machine an id.');
      return { id: j.id, url: `https://${j.id}-${spec.port}.proxy.runpod.net/v1`, kind: 'machine', startedAt: this.now(), name, ...(j.costPerHr ? { perHour: j.costPerHr } : {}) };
    }
    if (s.id === 'vast') {
      const spec = modelSpec(rental.model);
      onNote(`Looking for ${cardsText(rental)} on Vast.ai…`);
      const q = { verified: { eq: true }, rentable: { eq: true }, num_gpus: { eq: cardsOf(rental) }, gpu_ram: { gte: card.vastGB * 1000 }, disk_space: { gte: 60 }, inet_down: { gte: 500 }, type: 'on-demand', order: [['dph_total', 'asc']], limit: 5 };
      const offers = await this.api(`${VAST}/bundles/`, { key, method: 'PUT', body: q });
      const offer = (offers?.offers || [])[0];
      if (!offer) throw new Error(`Vast.ai has no ${cardsText(rental)} free right now. Try another card size, or later.`);
      onNote(`Renting ${offer.gpu_name || 'a card'} on Vast.ai, about ${money(offer.dph_total)} an hour…`);
      const cmd = serverCommand(rental.model, { minutes, after: 'vastai destroy instance $CONTAINER_ID || shutdown -h now', cards: cardsOf(rental) });
      const j = await this.api(`${VAST}/asks/${offer.id}/`, { key, method: 'PUT', body: { client_id: 'me', image: spec.image, disk: 60, label: name, onstart: cmd, env: { [`-p ${spec.port}:${spec.port}`]: '1' }, runtype: 'ssh' } });
      if (!j?.new_contract) throw new Error('Vast.ai didn\'t start the machine.');
      return { id: String(j.new_contract), url: '', kind: 'machine', startedAt: this.now(), name, perHour: offer.dph_total, port: spec.port };
    }
    if (s.id === 'lambda-machine') {
      const spec = modelSpec(rental.model);
      const keys = await this.api(`${LAMBDA}/ssh-keys`, { key });
      const sshName = (keys?.data || [])[0]?.name;
      if (!sshName) throw new Error('Lambda needs an SSH key on your account before it starts a machine (cloud.lambda.ai, SSH keys). Add one, then try again.');
      const types = await this.api(`${LAMBDA}/instance-types`, { key });
      let pick = null;
      const wanted = card.lambda.map((t) => t.replace(/^gpu_1x_/, `gpu_${cardsOf(rental)}x_`)); // Lambda names its machines gpu_1x_…, gpu_8x_…
      for (const t of wanted) { const r = types?.data?.[t]?.regions_with_capacity_available?.[0]?.name; if (r) { pick = { type: t, region: r, price: types.data[t].instance_type?.price_cents_per_hour }; break; } }
      if (!pick) throw new Error(`Lambda has no ${cardsText(rental)} free right now. Try another card size or count, or later.`);
      onNote(`Starting ${pick.type} on Lambda (${pick.region}), about ${money((pick.price || 0) / 100)} an hour…`);
      const cmd = serverCommand(rental.model, { minutes, after: 'shutdown -h now', cards: cardsOf(rental) });
      const userData = `#cloud-config\nruncmd:\n  - [ sh, -c, ${JSON.stringify(`docker run --gpus all -p ${spec.port}:${spec.port} --rm ${spec.image} ${spec.kind === 'gguf' ? '' : ''}sh -c ${JSON.stringify(cmd).replace(/"/g, '\\"')} ; shutdown -h now`)} ]\n`;
      const j = await this.api(`${LAMBDA}/instance-operations/launch`, { key, method: 'POST', body: { region_name: pick.region, instance_type_name: pick.type, ssh_key_names: [sshName], quantity: 1, name, user_data: userData } });
      const id = j?.data?.instance_ids?.[0];
      if (!id) throw new Error('Lambda didn\'t give the machine an id.');
      return { id, url: '', kind: 'machine', startedAt: this.now(), name, perHour: (pick.price || 0) / 100, port: spec.port, lambdaMinutes: minutes };
    }
    throw new Error(`${s.name} doesn't rent machines.`);
  }

  // The machine's address once it has one (Vast and Lambda hand it out after a minute).
  async address(rental, m, key) {
    if (m.url) return m.url;
    if (rental.service === 'vast') {
      const j = await this.api(`${VAST}/instances/${m.id}/`, { key });
      const inst = j?.instances || j;
      const port = inst?.ports?.[`${m.port}/tcp`]?.[0]?.HostPort;
      if (inst?.public_ipaddr && port) m.url = `http://${inst.public_ipaddr}:${port}/v1`;
      m.perHour = inst?.dph_total ?? m.perHour;
    }
    if (rental.service === 'lambda-machine') {
      const j = await this.api(`${LAMBDA}/instances/${m.id}`, { key });
      if (j?.data?.ip && j.data.status === 'active') m.url = `http://${j.data.ip}:${m.port}/v1`;
    }
    return m.url;
  }

  // Waits until the model answers (the weights have to download onto the machine first: minutes).
  async ready(rental, m, key, { signal, maxMs = 20 * 60000, everyMs = 10000, onNote = () => {} } = {}) {
    const t0 = this.now();
    let told = 0;
    while (this.now() - t0 < maxMs) {
      if (signal?.aborted) throw new Error('Stopped.');
      const url = await this.address(rental, m, key).catch(() => '');
      if (url) {
        try {
          const res = await this.fetch(`${url}/models`, { headers: m.kind === 'serverless' ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(8000) });
          if (res.ok) return url;
        } catch {}
      }
      const mins = Math.round((this.now() - t0) / 60000);
      if (mins >= told + 2) { told = mins; onNote(`Still starting the rented machine (${mins} min so far; the model has to download onto it).`); }
      await new Promise((r) => setTimeout(r, everyMs));
    }
    throw new Error('The rented machine didn\'t come up in 20 minutes. It\'s being stopped.');
  }

  async stop(rental, m, key) {
    const s = serviceOf(rental.service);
    if (s.id === 'runpod') return this.api(`${RUNPOD}/pods/${m.id}`, { key, method: 'DELETE' });
    if (s.id === 'vast') return this.api(`${VAST}/instances/${m.id}/`, { key, method: 'DELETE' });
    if (s.id === 'lambda-machine') return this.api(`${LAMBDA}/instance-operations/terminate`, { key, method: 'POST', body: { instance_ids: [m.id] } });
    return null; // serverless scales to zero by itself
  }

  // Machines on the account that Bob started (by their name) and nobody stopped: shown with a Stop button at start-up.
  async leftovers(service, key) {
    const out = [];
    if (service === 'runpod') {
      const j = await this.api(`${RUNPOD}/pods`, { key });
      for (const p of [].concat(j || [])) if (String(p.name || '').startsWith(RENT_PREFIX)) out.push({ service, id: p.id, name: p.name, since: p.createdAt || null, perHour: p.costPerHr ?? null });
    } else if (service === 'vast') {
      const j = await this.api(`${VAST}/instances/`, { key });
      for (const p of j?.instances || []) if (String(p.label || '').startsWith(RENT_PREFIX)) out.push({ service, id: String(p.id), name: p.label, since: p.start_date ? p.start_date * 1000 : null, perHour: p.dph_total ?? null });
    } else if (service === 'lambda-machine') {
      const j = await this.api(`${LAMBDA}/instances`, { key });
      for (const p of j?.data || []) if (String(p.name || '').startsWith(RENT_PREFIX) && p.status !== 'terminated') out.push({ service, id: p.id, name: p.name, since: null, perHour: (p.instance_type?.price_cents_per_hour || 0) / 100 });
    }
    return out;
  }
}

// ---------- Rentals: what Bob keeps while a brain is hired ----------
export class Rentals {
  constructor(cfg, { fetchImpl = fetch, now = Date.now, log = () => {}, broadcast = () => {}, env = null } = {}) {
    this.cfg = cfg; this.fetch = fetchImpl; this.now = now; this.log = log; this.broadcast = broadcast;
    this.envImpl = env;
    this.ledger = new Ledger(path.join(cfg.dataDir || cfg.agentDir || '.', 'rentals-ledger.json'), { now });
    this.machines = new Machines({ fetchImpl, now, log });
    this.running = new Map(); // rental id -> { id, url, kind, startedAt, jobs: Set, usd }
    this.okUntil = null; // { rental, usd }: the owner pressed Hire it; good for this rental until about $1 more is spent
    this.offers = new Map(); // card id -> { rental, jobId, at }
    this.leftover = []; // machines found at start-up that Bob didn't expect
    this.timer = null;
  }
  env() { return this.envImpl || rentKeyEnv(); }
  settings() { return rentalsOf(this.cfg); }
  current() { return currentRental(this.cfg); }
  keyFor(rental) { const k = keyEnvFor(rental); return k ? this.env()[k] : ''; }
  spent() { return this.ledger.monthSpent(); }
  // The limits: all three start at 0 and a rental needs every one it uses to be set.
  limits(rental) {
    const caps = this.settings().caps;
    const s = serviceOf(rental?.service);
    const missing = [];
    if (!caps.month) missing.push('the most Bob may spend this month');
    if (!caps.job) missing.push('the most one job may cost');
    if (s && s.kind !== 'answer' && !caps.minutes) missing.push('the longest a hired machine may run');
    return { caps, missing };
  }
  // Can this rental start a job costing about est? A plain line says why not.
  canStart(rental, est = 0) {
    const ready = rentalReady(this.cfg, rental, this.env());
    if (!ready.ok) return ready;
    const { caps, missing } = this.limits(rental);
    if (missing.length) return { ok: false, why: `Set ${missing.join(', ')} first, in Settings, Online services (every limit starts at 0).` };
    const spent = this.spent();
    if (spent + est > caps.month) return { ok: false, why: `That would pass this month's cap (${money(caps.month)}; ${money(spent)} spent so far).` };
    if (est > caps.job) return { ok: false, why: `That job could cost about ${money(est)}, more than the per-job cap (${money(caps.job)}).` };
    return { ok: true };
  }
  approved(rental, job) {
    if (job?.rentOk) return true;
    return Boolean(this.okUntil && this.okUntil.rental === rental.id && this.spent() < this.okUntil.usd);
  }
  // The owner pressed Hire it: this job, and this rental for about $1 more of jobs (the 🏗 switch on the chat page).
  approve(rental, jobId) { this.okUntil = { rental: rental.id, usd: this.spent() + 1 }; this.log('rent', `hired ${rental.name} (your click)${jobId ? '' : ''}`); }
  forget() { this.okUntil = null; }

  // The Hire it card. Returns its id; nothing is spent until the card is answered.
  offer(rental, { jobId, tokens = 0, why = '', emit }) {
    const s = serviceOf(rental.service);
    const est = estimate(rental, { tokensIn: tokens, tokensOut: 3000, minutes: 10 });
    const can = this.canStart(rental, est);
    const id = crypto.randomUUID();
    this.offers.set(id, { rental: rental.id, jobId, at: this.now() });
    for (const [k, v] of this.offers) if (this.now() - v.at > 3600000) this.offers.delete(k);
    const ev = { type: 'offer-rent', id, rental: { id: rental.id, name: rental.name, service: s.name, kind: s.kind, model: rental.model, plain: Boolean(s.plain), cards: cardsOf(rental), cardsText: s.kind === 'answer' ? '' : cardsText(rental) }, est: est ? money(est) : 'under 1 cent', price: priceLine(rental), why, startMinutes: s.kind === 'machine' ? 5 : s.kind === 'serverless' ? 2 : 0, blocked: can.ok ? '' : can.why, carryOn: Boolean(jobId) };
    emit?.(ev);
    this.log('rent', `offered ${rental.name} (${ev.est})${can.ok ? '' : ': ' + can.why}`);
    return id;
  }
  // The card was answered. yes: the job runs on the rented brain (the brain puts it back in line).
  answer(id, yes) {
    const o = this.offers.get(id);
    if (!o) return { ok: false, why: 'That card is too old now. Ask me again.' };
    this.offers.delete(id);
    const rental = this.settings().list.find((r) => r.id === o.rental);
    if (!yes) { this.log('rent', 'Not now'); return { ok: true, done: 'none', jobId: o.jobId }; }
    if (!rental) return { ok: false, why: 'That rental is gone from Settings.' };
    const can = this.canStart(rental, 0);
    if (!can.ok) return { ok: false, why: can.why };
    this.approve(rental, o.jobId);
    return { ok: true, done: 'hired', jobId: o.jobId, rental };
  }

  // One job's turn on the rented brain: the machine is started if it has to be, the reply is streamed, the ledger kept.
  async chat(rental, { messages, tools, signal, onToken, onThink, think, job, emit = () => {} }) {
    const s = serviceOf(rental.service);
    const key = this.keyFor(rental);
    const can = this.canStart(rental, 0);
    if (!can.ok) throw new Error(can.why);
    let url = rental.address || s.baseUrl || '';
    let run = null;
    if (s.kind !== 'answer') {
      run = await this.ensureRunning(rental, { key, signal, emit, job });
      url = run.url;
    }
    const t0 = this.now();
    const { reply, usage } = await chatOpenAI({ url, key: s.kind === 'machine' ? '' : key, model: s.kind === 'answer' ? rental.model : modelSpec(rental.model).repo, messages, tools, signal, onToken, onThink, think, fetchImpl: this.fetch, log: this.log });
    // The money: the service's own figure when it gives one; otherwise words times the list price, or minutes times the hourly price.
    let usd = usage.usd;
    if (usd == null) usd = s.kind === 'answer' ? ((rental.inPerM || 0) * (usage.in || 0) + (rental.outPerM || 0) * (usage.out || 0)) / 1e6 : ((run?.perHour ?? rental.perHour ?? CARDS[rental.card || '48'].perHour * cardsOf(rental)) / 3600000) * (this.now() - t0);
    if (s.kind === 'machine') usd = 0; // machines are charged by the minute they run, counted once when they stop (below)
    const row = { rental: rental.id, name: rental.name, service: s.id, model: rental.model, tokensIn: usage.in || 0, tokensOut: usage.out || 0, usd: Math.round(usd * 10000) / 10000, guessed: Boolean(usage.guessed), job: job?.id || null };
    this.ledger.add(row);
    if (run) run.usd += usd;
    const total = run ? this.machineCost(run) : usd;
    emit({ type: 'rent', action: 'used', rental: rental.name, usd: money(total), monthUsd: money(this.spent() + (run ? this.machineCost(run) : 0)), tokensIn: usage.in, tokensOut: usage.out });
    this.checkCaps(rental, run);
    return reply;
  }

  machineCost(run) { return run.kind === 'machine' ? ((run.perHour || 0) / 3600000) * (this.now() - run.startedAt) : run.usd; }

  // The machine for a rental, started if it isn't running. One machine per rental; jobs share it.
  async ensureRunning(rental, { key, signal, emit, job }) {
    let run = this.running.get(rental.id);
    if (run?.url) { if (job) run.jobs.add(job.id); return run; }
    if (run?.starting) { await run.starting; run = this.running.get(rental.id); if (job && run) run.jobs.add(job.id); if (run?.url) return run; }
    const { caps } = this.limits(rental);
    const s = serviceOf(rental.service);
    const note = (text) => emit({ type: 'announce', text });
    run = { id: '', url: '', kind: s.kind, startedAt: this.now(), jobs: new Set(job ? [job.id] : []), usd: 0, perHour: rental.perHour ?? CARDS[rental.card || '48'].perHour * cardsOf(rental), rental: rental.id };
    run.starting = (async () => {
      const m = await this.machines.start(rental, { key, minutes: caps.minutes, onNote: note });
      Object.assign(run, m, { startedAt: this.now() });
      if (m.perHour) run.perHour = m.perHour;
      this.running.set(rental.id, run);
      if (m.newEndpoint && rental.service === 'runpod-serverless') this.rememberEndpoint?.(rental.id, m.id);
      emit({ type: 'rent', action: 'start', rental: rental.name, service: s.name, kind: s.kind, machine: m.id, minutes: caps.minutes });
      this.log('rent', `started ${s.name} ${m.id} for ${rental.name}, timer ${caps.minutes} min`);
      try { run.url = await this.machines.ready(rental, run, key, { signal, onNote: note }); }
      catch (e) { await this.stopRun(rental, run, 'didn\'t start').catch(() => {}); throw e; }
      note(`The rented brain is up (${s.name}). Working on it there now.`);
      this.armWatch();
    })();
    this.running.set(rental.id, run);
    try { await run.starting; } finally { run.starting = null; }
    return run;
  }

  // A job finished: the machine stops once no job is using it (a short grace, so a follow-up message keeps it).
  turnDone(job) {
    if (!job) return;
    for (const run of this.running.values()) run.jobs.delete(job.id);
    this.armWatch(true);
  }
  armWatch(soon = false) {
    clearTimeout(this.timer);
    if (!this.running.size) return;
    this.timer = setTimeout(() => this.watch().catch((e) => this.log('rent', `watch: ${e.message}`)), soon ? 30000 : 30000);
    this.timer.unref?.();
  }
  async watch() {
    for (const [rid, run] of [...this.running]) {
      const rental = this.settings().list.find((r) => r.id === rid);
      if (!rental) { this.running.delete(rid); continue; }
      if (!run.jobs.size && !run.starting) { await this.stopRun(rental, run, 'the job is done'); continue; }
      this.checkCaps(rental, run);
      this.broadcast({ type: 'rent', action: 'tick', rental: rental.name, usd: money(this.machineCost(run)), minutes: Math.round((this.now() - run.startedAt) / 60000) });
    }
    this.armWatch();
  }
  checkCaps(rental, run) {
    const { caps } = this.limits(rental);
    const spent = this.spent() + (run ? this.machineCost(run) : 0);
    if (run && caps.minutes && this.now() - run.startedAt > caps.minutes * 60000) { this.stopRun(rental, run, `it reached the longest run you set (${caps.minutes} min)`).catch(() => {}); return; }
    if (run && (spent >= caps.month || this.machineCost(run) >= caps.job)) { this.stopRun(rental, run, 'it reached a spending cap').catch(() => {}); return; }
    if (run && caps.minutes && this.now() - run.startedAt > (caps.minutes - 5) * 60000 && !run.warned) { run.warned = true; this.broadcast({ type: 'rent', action: 'warn', rental: rental.name, text: `The rented machine stops in about 5 minutes (the longest run you set is ${caps.minutes} min).` }); }
  }
  async stopRun(rental, run, why) {
    this.running.delete(rental.id);
    const key = this.keyFor(rental);
    const s = serviceOf(rental.service);
    const mins = Math.round((this.now() - run.startedAt) / 60000);
    let stopped = true;
    if (run.id) {
      try { await this.machines.stop(rental, run, key); } catch (e) { stopped = false; this.log('rent', `couldn't stop ${s.name} ${run.id}: ${scrubKey(e.message, [key])}`); }
    }
    const usd = run.kind === 'machine' ? this.machineCost(run) : 0;
    if (usd) this.ledger.add({ rental: rental.id, name: rental.name, service: s.id, model: rental.model, minutes: mins, usd: Math.round(usd * 10000) / 10000, machine: run.id });
    this.log('rent', `${stopped ? 'stopped' : 'COULD NOT STOP'} ${s.name} ${run.id || ''} after ${mins} min (${why})${usd ? `, ${money(usd)}` : ''}`);
    this.broadcast({ type: 'rent', action: 'stop', rental: rental.name, service: s.name, minutes: mins, usd: money(usd), stopped, why, machine: run.id });
    if (!this.running.size) clearTimeout(this.timer);
    return stopped;
  }
  async stopAll(why = 'you pressed Stop') {
    const out = [];
    for (const [rid, run] of [...this.running]) { const rental = this.settings().list.find((r) => r.id === rid); if (rental) out.push(await this.stopRun(rental, run, why)); }
    for (const m of [...this.leftover]) { const ok = await this.stopLeftover(m); out.push(ok); }
    return out;
  }
  // At start-up (and from Settings): machines on each switched-on service that carry Bob's name and that this Bob isn't running.
  async findLeftovers() {
    const st = this.settings();
    const found = [];
    for (const s of SERVICES.filter((x) => x.kind === 'machine' && st.enabled[x.id])) {
      const key = this.env()[s.keyEnv];
      if (!key) continue;
      try { for (const m of await this.machines.leftovers(s.id, key)) if (![...this.running.values()].some((r) => r.id === m.id)) found.push(m); }
      catch (e) { this.log('rent', `couldn't list ${s.name}: ${scrubKey(e.message, [key])}`); }
    }
    this.leftover = found;
    if (found.length) { this.log('rent', `${found.length} rented machine(s) still running from before`); this.broadcast({ type: 'rent', action: 'leftover', machines: found.map((m) => ({ ...m, service: serviceOf(m.service)?.name || m.service })) }); }
    return found;
  }
  async stopLeftover(m) {
    const key = this.env()[serviceOf(m.service)?.keyEnv || ''];
    try { await this.machines.stop({ service: m.service }, m, key); this.leftover = this.leftover.filter((x) => x.id !== m.id); this.log('rent', `stopped leftover ${m.service} ${m.id} (your click)`); return true; }
    catch (e) { this.log('rent', `couldn't stop leftover ${m.id}: ${scrubKey(e.message, [key])}`); return false; }
  }
  // For Settings and Now running: never a key.
  view() {
    const st = this.settings();
    const env = this.env();
    return {
      caps: st.caps, current: st.current, spent: Math.round(this.spent() * 100) / 100, spentText: money(this.spent()),
      services: SERVICES.map((s) => ({ id: s.id, name: s.name, kind: s.kind, what: s.what, keyEnv: s.keyEnv, keyPage: s.keyPage, modelsPage: s.modelsPage || '', plain: Boolean(s.plain), enabled: st.enabled[s.id] === true, warned: st.warned[s.id] === true, keyFound: s.id === 'other' ? null : Boolean(env[s.keyEnv]) })),
      rentals: st.list.map((r) => ({ ...r, cards: cardsOf(r), cardsText: serviceOf(r.service)?.kind === 'answer' ? '' : cardsText(r), serviceName: serviceOf(r.service)?.name || r.service, kind: serviceOf(r.service)?.kind, price: priceLine(r), ready: rentalReady(this.cfg, r, env), keyEnvName: keyEnvFor(r), running: this.running.has(r.id) })),
      running: [...this.running.values()].map((run) => ({ rental: run.rental, machine: run.id, kind: run.kind, minutes: Math.round((this.now() - run.startedAt) / 60000), usd: money(this.machineCost(run)), starting: Boolean(run.starting) })),
      leftover: this.leftover.map((m) => ({ ...m, serviceName: serviceOf(m.service)?.name || m.service })),
      cards: Object.entries(CARDS).map(([id, c]) => ({ id, name: c.name, say: c.say, perHour: c.perHour })),
      cardCounts: CARD_COUNTS,
      recent: this.ledger.recent(10).map((r) => ({ at: r.at, name: r.name, usd: money(r.usd), minutes: r.minutes || null, tokensIn: r.tokensIn || null, tokensOut: r.tokensOut || null, guessed: Boolean(r.guessed) })),
      okUntil: this.okUntil ? { rental: this.okUntil.rental } : null
    };
  }
}
