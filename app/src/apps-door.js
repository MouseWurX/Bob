// Brains for other apps (Settings, Other apps). Off unless you turn it on.
//
// Bob answers the OpenAI-style requests most coding and chat apps already speak (VS Code with Continue, OpenCode,
// Open WebUI, scripts), at http://localhost:<Bob's port>/v1:
//   GET  /v1/models             Bob's brains: "bob" (his chat brain in this session) and each brain in his slots
//   POST /v1/chat/completions   chat, streamed or not, with tools (the app runs its own tools; Bob never does here)
//   POST /v1/embeddings         meaning-vectors from his Memory brain (nomic-embed-text)
//   GET  /v1/bob/status         Bob's own: is he up, which brain, is the card busy (for `bob status`)
// Rules:
// - Off by default. On: this replicant matrix only (127.0.0.1). "Also from my other devices" (off) lets apps on your
//   Tailscale (and home network, if Bob-Net's switch for that is on) in, through the same door as your phone, and only
//   while that door is open.
// - Every request carries the key Bob made (Authorization: Bearer <key>), here too. A web page can't send it without
//   asking first, and Bob never says yes to a web page (no CORS), so websites can't use your brains.
// - The app's words are never saved or logged; the log says only which brain answered and how long it took.
// - Jobs queue for the graphics card like Bob's own (the gate). In the Gaming session only "bob" answers, on the
//   processor, like Bob does himself.
// Android: Bob for Android doesn't run this door (the phone app talks to a desktop Bob). An app on the phone can use a
// desktop Bob's door over Tailscale with "Also from my other devices" on.
import crypto from 'node:crypto';
import { readJsonFile, writeJsonAtomic } from './util.js';
import { bobsBrains, chatBrain, sameModel } from './brain-mode.js';
import { currentSession, brainDefaults } from './sessions.js';

export const KEY_RE = /^bob-[0-9a-f]{32}$/;
export const newKey = (rand = crypto.randomBytes) => 'bob-' + rand(16).toString('hex');
export const HOLD_MS = 5 * 60000; // a brain an app asked for stays a while: coding apps ask again within seconds
export const MAX_EMBED = 256;
const BAD_TRIES = 10; // wrong keys a minute, then "wait a minute"
const SLOTS = ['bob', 'tinker', 'ledger', 'scout', 'reviewer']; // brains that talk (the painter slot doesn't)

export function appsDoor(cfg) {
  const a = cfg?.appsDoor || {};
  return { enabled: a.enabled === true, network: a.network === true, key: KEY_RE.test(String(a.key || '')) ? a.key : '' };
}
export const appsDoorOn = (cfg) => { const a = appsDoor(cfg); return a.enabled && Boolean(a.key); };

// What Settings shows. The key is shown on this replicant matrix only (the route is local only), so it can be copied.
export function appsDoorView(cfg, { ownAddresses = [] } = {}) {
  const a = appsDoor(cfg);
  const port = cfg.port || 7777;
  const doorOpen = Boolean(cfg.remote?.enabled);
  return { ...a, port, url: `http://localhost:${port}/v1`, doorOpen, others: a.network && doorOpen ? ownAddresses.map((h) => `http://${h}/v1`) : [] };
}

// Only these can change, and only from Settings on this replicant matrix (server.js checks isLocal).
export function cleanAppsDoorPatch(b) {
  const out = {};
  if (typeof b?.enabled === 'boolean') out.enabled = b.enabled;
  if (typeof b?.network === 'boolean') out.network = b.network;
  if (b?.newKey === true) out.newKey = true;
  return out;
}

// The key and switches live in config.json, like the phone door's passcode, never in settings.json.
export function saveAppsDoor(cfg, patch, { rand } = {}) {
  const p = cleanAppsDoorPatch(patch);
  const raw = readJsonFile(cfg.configFile);
  const now = { ...appsDoor(raw), ...(raw.appsDoor || {}) };
  if (typeof p.enabled === 'boolean') now.enabled = p.enabled;
  if (typeof p.network === 'boolean') now.network = p.network;
  if (p.newKey || (now.enabled && !KEY_RE.test(String(now.key || '')))) now.key = newKey(rand);
  raw.appsDoor = { enabled: now.enabled === true, network: now.network === true, key: now.key || '' };
  writeJsonAtomic(cfg.configFile, raw, 2);
  cfg.appsDoor = { ...raw.appsDoor };
  return appsDoor(cfg);
}

export function keyOk(header, key) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(String(header || ''));
  if (!m || !key) return false;
  const a = crypto.createHash('sha256').update(m[1]).digest(), b = crypto.createHash('sha256').update(key).digest();
  return crypto.timingSafeEqual(a, b);
}

// Why a request is turned away before anything else, or ''. `remote`: it came through the door from another device.
export function doorRefusal(cfg, req, { remote = false } = {}) {
  const a = appsDoor(cfg);
  if (!a.enabled || !a.key) return { code: 404, msg: 'Brains for other apps is off (Settings, Other apps).' };
  if (remote && !a.network) return { code: 403, msg: 'Only apps on this replicant matrix may use Bob\'s brains. Turn on Also from my other devices to let others in.' };
  // A web page always sends Origin; apps don't. Bob never answers a web page here, so websites can't use him.
  if (req.headers.origin || req.method === 'OPTIONS') return { code: 403, msg: 'Web pages can\'t use Bob\'s brains. Use an app, or Bob\'s own window.' };
  if (!keyOk(req.headers.authorization, a.key)) return { code: 401, msg: 'Wrong or missing key. Copy it from Settings, Other apps, Brains for other apps.' };
  return null;
}

// The brains an app may ask for: "bob" first, then each brain in Bob's slots and sessions that's on this replicant matrix.
export function appModels(brain) {
  const cfg = brain.cfg;
  const chat = chatBrain(cfg).model;
  const own = (m) => cfg.engine !== 'llamacpp' || (() => { try { return Boolean(brain.engine?.resolve?.(m)?.gguf); } catch { return false; } })();
  const talks = new Set(SLOTS.map((s) => cfg.models?.[s]).filter(Boolean));
  const painter = cfg.models?.painter;
  const out = chat ? [{ id: 'bob', name: `Bob (${label(brain, chat)})`, model: chat }] : [];
  for (const m of bobsBrains(cfg)) {
    if ((m === painter && !talks.has(m)) || !own(m) || out.some((o) => o.id === m)) continue;
    out.push({ id: m, name: label(brain, m), model: m });
  }
  return out;
}
const label = (brain, m) => { try { return brain.brainLabel?.(m) || m; } catch { return m; } };

// The brain, context and place for one request, or { error }.
export function pickBrain(brain, id) {
  const cfg = brain.cfg;
  const want = String(id || 'bob').trim();
  const gaming = currentSession(cfg).id === 'light';
  if (!want || want === 'bob' || /^bob[:/]/i.test(want)) {
    const c = chatBrain(cfg);
    return c.model ? { model: c.model, cpu: Boolean(c.cpu), ctx: c.ctx || 32768, think: c.think } : { error: 'Bob has no chat brain yet. Pick one in Settings, Brains.', code: 503 };
  }
  const hit = appModels(brain).find((m) => m.id !== 'bob' && (m.id === want || sameModel(m.id, want)));
  if (!hit) return { error: `Bob has no brain called "${want.slice(0, 80)}". Ask GET /v1/models for the list, or use "bob".`, code: 404 };
  if (gaming && !sameModel(hit.model, chatBrain(cfg).model)) return { error: 'Bob is in the Gaming session, so only "bob" answers (on the processor). Ask again after switching back to Normal.', code: 503 };
  return { model: hit.model, cpu: false, ctx: brainDefaults(hit.model, 'tinker').ctx || chatBrain(cfg).ctx || 32768 };
}

// OpenAI's "reasoning_effort" to Bob's thinking: none -> no thinking, low/medium/high as they are, missing -> the brain's own.
export function thinkFrom(effort, fallback) {
  const e = String(effort || '').toLowerCase();
  if (e === 'none' || e === 'minimal') return false;
  if (['low', 'medium', 'high'].includes(e)) return e;
  return fallback;
}

// OpenAI messages -> the shape Bob's engine takes: text, pictures (data: URLs only, never fetched), tool calls by name.
export function fromOpenAI(list) {
  const roles = new Set(['system', 'developer', 'user', 'assistant', 'tool']);
  const names = new Map(); // tool_call_id -> tool name
  const out = [];
  for (const m of [].concat(list || []).slice(-400)) {
    if (!m || !roles.has(m.role)) continue;
    const role = m.role === 'developer' ? 'system' : m.role;
    let text = '';
    const images = [];
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part?.type === 'text' && typeof part.text === 'string') text += (text ? '\n' : '') + part.text;
        const u = part?.type === 'image_url' ? String(part.image_url?.url || part.image_url || '') : '';
        const d = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(u);
        if (d) images.push(d[1]);
      }
    }
    const o = { role, content: text.slice(0, 400000) };
    if (images.length && role === 'user') o.images = images.slice(0, 8);
    if (role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      o.tool_calls = m.tool_calls.slice(0, 32).map((c) => {
        const name = String(c?.function?.name || '').slice(0, 80);
        if (c?.id) names.set(String(c.id), name);
        let args = c?.function?.arguments;
        if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch { args = {}; } }
        return { function: { name, arguments: args && typeof args === 'object' ? args : {} } };
      });
    }
    if (role === 'tool') o.tool_name = names.get(String(m.tool_call_id || '')) || String(m.name || '').slice(0, 80);
    out.push(o);
  }
  return out;
}

export function cleanTools(tools) {
  return [].concat(tools || []).slice(0, 128).filter((t) => t?.type === 'function' && /^[\w.-]{1,80}$/.test(String(t.function?.name || '')));
}

// Bob's tool calls -> OpenAI's, with ids the app sends back on its tool results.
export function toOpenAICalls(calls, idOf = (i) => `call_${crypto.randomBytes(6).toString('hex')}_${i}`) {
  return (calls || []).map((c, i) => ({ index: i, id: idOf(i), type: 'function', function: { name: c.function?.name || '', arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) } }));
}

const rough = (x) => Math.ceil(JSON.stringify(x || '').length / 4);

// POST /v1/chat/completions. `deps` are for tests: { now, holdMs }.
export async function chatRoute(brain, req, res, b, deps = {}) {
  const pick = pickBrain(brain, b?.model);
  if (pick.error) return json(res, pick.code, err(pick.error, pick.code === 404 ? 'model_not_found' : 'unavailable'));
  const messages = fromOpenAI(b?.messages);
  if (!messages.some((m) => m.role === 'user' || m.role === 'tool')) return json(res, 400, err('No messages to answer.', 'invalid_request_error'));
  const tools = b?.tool_choice === 'none' ? [] : cleanTools(b?.tools);
  const stream = b?.stream === true;
  const id = `chatcmpl-${crypto.randomBytes(8).toString('hex')}`;
  const created = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const modelId = String(b?.model || 'bob');
  const stop = new AbortController();
  res.on('close', () => { if (!res.writableEnded) stop.abort(); }); // the app gave up: stop thinking
  brain.lastActivity = Date.now(); // an update never restarts Bob in the middle of an answer
  clearTimeout(brain.appsHold); brain.appsHold = null;
  const chunk = (delta, finish = null) => `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: modelId, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  let started = false;
  const begin = () => { if (started || !stream) return; started = true; res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' }); res.write(chunk({ role: 'assistant', content: '' })); };
  const t0 = Date.now();
  try {
    const ctx = await brain.fitCtx(pick.model, pick.ctx);
    const use = (await brain.ensureModel(pick.model, () => {}, stop.signal, 'bob', { cpu: pick.cpu, ctx, noTalker: true })) || pick.model;
    if (stop.signal.aborted) throw new Error('stopped');
    begin();
    const think = thinkFrom(b?.reasoning_effort ?? b?.reasoning?.effort, pick.think);
    const reply = await brain.chatSafe({ model: use, messages, tools: tools.length ? tools : undefined, signal: stop.signal, cpu: pick.cpu, think, ctx,
      onToken: (t) => { if (stream) res.write(chunk({ content: t })); },
      onThink: stream ? (t) => res.write(chunk({ reasoning_content: t })) : undefined });
    const calls = toOpenAICalls(reply.tool_calls);
    const finish = calls.length ? 'tool_calls' : 'stop';
    const usage = { prompt_tokens: rough(messages), completion_tokens: rough(reply.content || '') + rough(calls), total_tokens: 0 };
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
    brain.log?.('apps', `answered another app with ${use} in ${((Date.now() - t0) / 1000).toFixed(1)} s${calls.length ? ` (asked for ${calls.length} tool${calls.length === 1 ? '' : 's'})` : ''}`); // never the words
    if (stream) {
      if (calls.length) res.write(chunk({ tool_calls: calls }));
      res.write(chunk({}, finish));
      if (b?.stream_options?.include_usage) res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: modelId, choices: [], usage })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    const message = { role: 'assistant', content: reply.content || (calls.length ? null : '') };
    if (calls.length) message.tool_calls = calls.map(({ index, ...c }) => c);
    return json(res, 200, { id, object: 'chat.completion', created, model: modelId, choices: [{ index: 0, message, finish_reason: finish }], usage });
  } catch (e) {
    const msg = stop.signal.aborted ? 'stopped' : String(e?.message || e).slice(0, 300);
    if (!stop.signal.aborted) brain.log?.('apps', `couldn't answer another app: ${msg}`);
    if (started) { res.write(`data: ${JSON.stringify({ error: { message: msg, type: 'server_error' } })}\n\n`); res.write('data: [DONE]\n\n'); return res.end(); }
    if (!res.writableEnded && !res.headersSent) return json(res, e?.code === 'gaming' ? 503 : 500, err(msg, 'server_error'));
  } finally {
    brain.gate?.done(stop.signal); // the graphics card goes to whoever waits next
    // Back to light once apps go quiet. The chat brain itself stays, as after Bob's own jobs (settle keeps it).
    brain.appsHold = setTimeout(() => { brain.appsHold = null; brain.settle?.({ noWake: true })?.catch?.(() => {}); }, deps.holdMs ?? HOLD_MS);
    brain.appsHold.unref?.();
  }
}

// POST /v1/embeddings: Bob's Memory brain (the same one he matches Topics with).
export async function embedRoute(brain, res, b) {
  const input = typeof b?.input === 'string' ? [b.input] : Array.isArray(b?.input) ? b.input : null;
  if (!input || !input.length || input.length > MAX_EMBED || !input.every((x) => typeof x === 'string')) return json(res, 400, err(`input must be text, or a list of up to ${MAX_EMBED} texts.`, 'invalid_request_error'));
  if (currentSession(brain.cfg).id === 'light') return json(res, 503, err('Bob is in the Gaming session, so meaning-matching waits until you switch back to Normal.', 'unavailable'));
  const model = brain.cfg.housekeeping?.embedModel || 'nomic-embed-text';
  try {
    const rows = await brain.housekeeper.embed(input);
    return json(res, 200, { object: 'list', model, data: rows.map((embedding, index) => ({ object: 'embedding', index, embedding })), usage: { prompt_tokens: rough(input), total_tokens: rough(input) } });
  } catch (e) {
    return json(res, 503, err(`Bob's Memory brain (${model}) isn't ready: ${String(e?.message || e).slice(0, 200)}. Get it in Settings, Brains, Memory.`, 'unavailable'));
  }
}

const err = (message, type) => ({ error: { message, type } });
function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

// Everything under /v1. Returns true when it answered. server.js calls this before the passcode check: apps carry the
// key, not the phone's cookie.
export const MAX_BODY = 32 * 1024 * 1024; // a long coding chat with pictures; Bob's own pages stop at 1 MB
export async function readBody(req, max = MAX_BODY) {
  const parts = [];
  let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new Error('too big'); parts.push(c); }
  const s = Buffer.concat(parts).toString('utf8');
  return s ? JSON.parse(s) : {};
}

export function makeAppsRoute({ brain, cfg, version, body = readBody, now = () => Date.now() }) {
  const tries = [];
  return async function appsRoute({ req, res, p, remote }) {
    if (p !== '/v1' && !p.startsWith('/v1/')) return false;
    const t = now();
    while (tries.length && t - tries[0] > 60000) tries.shift();
    if (tries.length >= BAD_TRIES) { json(res, 429, err('Too many wrong keys. Wait a minute.', 'rate_limit')); return true; }
    const no = doorRefusal(cfg, req, { remote });
    if (no) { if (no.code === 401) tries.push(t); json(res, no.code, err(no.msg, no.code === 401 ? 'invalid_api_key' : 'forbidden')); return true; }
    if (req.method === 'GET' && p === '/v1/models') {
      json(res, 200, { object: 'list', data: appModels(brain).map((m) => ({ id: m.id, object: 'model', created: 0, owned_by: 'bob', name: m.name })) });
      return true;
    }
    if (req.method === 'GET' && p === '/v1/bob/status') {
      const s = currentSession(cfg);
      const chat = chatBrain(cfg).model;
      json(res, 200, { bob: true, version, session: s.label || s.id, brain: chat ? { id: 'bob', model: chat, name: label(brain, chat) } : null, card: brain.gate?.flags?.()?.card || 'free', busy: Boolean(brain.turns?.size), models: appModels(brain).length });
      return true;
    }
    if (req.method === 'POST' && (p === '/v1/chat/completions' || p === '/v1/embeddings')) {
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) { json(res, 415, err('Send JSON (content-type: application/json).', 'invalid_request_error')); return true; }
      let b;
      try { b = await body(req); } catch { json(res, 400, err('That wasn\'t JSON Bob could read (or it was over 32 MB).', 'invalid_request_error')); return true; }
      if (p === '/v1/embeddings') await embedRoute(brain, res, b);
      else await chatRoute(brain, req, res, b);
      return true;
    }
    json(res, 404, err(`Bob doesn't answer ${req.method} ${p}. He knows /v1/models, /v1/chat/completions and /v1/embeddings.`, 'not_found'));
    return true;
  };
}
