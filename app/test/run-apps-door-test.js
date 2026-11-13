// Let other apps use Bob's brains (src/apps-door.js) and the command line (src/bob-cli.js). Off unless switched on,
// key always, no web pages, OpenAI's shapes in and out. A fake brain stands in: nothing real is loaded or read.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appsDoor, appsDoorOn, saveAppsDoor, cleanAppsDoorPatch, keyOk, doorRefusal, fromOpenAI, toOpenAICalls, thinkFrom, pickBrain, appModels, makeAppsRoute, KEY_RE, newKey } from '../src/apps-door.js';
import { main as cli, parseArgs, where, findConfig } from '../src/bob-cli.js';
import { appsDoorBody } from '../public/apps-door.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const KEY = 'bob-' + 'a'.repeat(32);

// ---- settings: off by default, key in config.json only ----
{
  check('off by default', appsDoorOn({}) === false && appsDoor({}).network === false);
  check('a key looks like bob-<32 hex>', KEY_RE.test(newKey()) && !KEY_RE.test('bob-xyz'));
  check('only the switches and New key can change', JSON.stringify(cleanAppsDoorPatch({ enabled: true, key: 'mine', network: 'yes', newKey: true })) === '{"enabled":true,"newKey":true}');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-apps-'));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ port: 7777, remote: { enabled: false } }));
  const cfg = { configFile: file, port: 7777 };
  const on = saveAppsDoor(cfg, { enabled: true }, { rand: () => Buffer.alloc(16, 0xab) });
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('switching on makes a key and saves it in config.json', on.enabled && on.key === 'bob-' + 'ab'.repeat(16) && raw.appsDoor.key === on.key && raw.port === 7777);
  const again = saveAppsDoor(cfg, { network: true });
  check('changing another switch keeps the key', again.key === on.key && again.network === true);
  const fresh = saveAppsDoor(cfg, { newKey: true });
  check('New key replaces it', fresh.key !== on.key && KEY_RE.test(fresh.key));
  const off = saveAppsDoor(cfg, { enabled: false });
  check('switching off keeps the key and the other switch (always fillable)', !off.enabled && off.key === fresh.key && off.network === true);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- the door: key, web pages, other devices ----
{
  const cfg = { appsDoor: { enabled: true, key: KEY } };
  const req = (h = {}, method = 'GET') => ({ method, headers: h });
  check('the key is checked', keyOk(`Bearer ${KEY}`, KEY) && !keyOk('Bearer nope', KEY) && !keyOk('', KEY) && !keyOk(`Bearer ${KEY}`, ''));
  check('off: not found', doorRefusal({}, req({ authorization: `Bearer ${KEY}` }))?.code === 404);
  check('no key: 401', doorRefusal(cfg, req())?.code === 401);
  check('a web page (Origin) is refused even with the key', doorRefusal(cfg, req({ origin: 'https://evil.example', authorization: `Bearer ${KEY}` }))?.code === 403);
  check('preflight is never answered', doorRefusal(cfg, req({ authorization: `Bearer ${KEY}` }, 'OPTIONS'))?.code === 403);
  check('another device needs its own switch', doorRefusal(cfg, req({ authorization: `Bearer ${KEY}` }), { remote: true })?.code === 403
    && doorRefusal({ appsDoor: { ...cfg.appsDoor, network: true } }, req({ authorization: `Bearer ${KEY}` }), { remote: true }) === null);
  check('this replicant matrix with the key: in', doorRefusal(cfg, req({ authorization: `Bearer ${KEY}` })) === null);
}

// ---- OpenAI shapes ----
{
  const m = fromOpenAI([
    { role: 'developer', content: 'Be brief.' },
    { role: 'user', content: [{ type: 'text', text: 'What is this?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }, { type: 'image_url', image_url: { url: 'https://example.com/x.png' } }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.js"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'hello' },
    { role: 'robot', content: 'skip me' }
  ]);
  check('developer becomes system', m[0].role === 'system' && m[0].content === 'Be brief.');
  check('text parts are joined, data: pictures kept, web pictures never fetched', m[1].content === 'What is this?' && m[1].images?.length === 1 && m[1].images[0] === 'iVBORw0KGgo=');
  check('tool calls get their arguments as objects', m[2].tool_calls[0].function.name === 'read_file' && m[2].tool_calls[0].function.arguments.path === 'a.js');
  check('tool results are matched to their call by id', m[3].role === 'tool' && m[3].tool_name === 'read_file');
  check('unknown roles are dropped', m.length === 4);
  const calls = toOpenAICalls([{ function: { name: 'x', arguments: { a: 1 } } }], (i) => `id${i}`);
  check('Bob\'s calls go back with ids and string arguments', calls[0].id === 'id0' && calls[0].type === 'function' && calls[0].function.arguments === '{"a":1}');
  check('reasoning_effort maps to thinking', thinkFrom('none') === false && thinkFrom('high') === 'high' && thinkFrom(undefined, 'low') === 'low' && thinkFrom('bogus') === undefined);
}

// ---- a fake Bob behind a real http server ----
function fakeBrain({ session = 'normal' } = {}) {
  const calls = [];
  const brain = {
    cfg: { engine: 'llamacpp', port: 7777, models: { bob: 'qwen-chat', tinker: 'qwen-coder', painter: 'flux' }, sessionBrains: { small: 'qwen-chat', gaming: 'qwen-chat', coding: 'qwen-coder', office: 'qwen-chat', deep: 'qwen-chat' }, session: session === 'light' ? 'light' : undefined, appsDoor: { enabled: true, key: KEY } },
    engine: { resolve: (m) => (['qwen-chat', 'qwen-coder', 'flux'].includes(m) ? { gguf: `/fake/${m}.gguf` } : null) },
    brainLabel: (m) => `Label ${m}`,
    fitCtx: async (m, c) => c,
    ensureModel: async (m, emit, signal, who, opts) => { calls.push({ load: m, opts }); return m; },
    chatSafe: async (o) => {
      calls.push({ chat: o.model, think: o.think, tools: o.tools?.length || 0, messages: o.messages });
      if (o.tools?.length) return { role: 'assistant', content: '', tool_calls: [{ function: { name: o.tools[0].function.name, arguments: { q: 1 } } }] };
      o.onToken?.('Hel'); o.onToken?.('lo');
      return { role: 'assistant', content: 'Hello' };
    },
    gate: { done: (s) => calls.push({ done: Boolean(s) }), flags: () => ({ card: 'free' }) },
    settle: async () => {},
    housekeeper: { embed: async (t) => t.map((x) => [x.length, 0.5]) },
    turns: new Map(),
    log: (k, t) => calls.push({ log: t })
  };
  return { brain, calls };
}

async function withServer(brain, fn, { remote = false } = {}) {
  const route = makeAppsRoute({ brain, cfg: brain.cfg, version: '9.9.9' });
  const srv = http.createServer(async (req, res) => { const p = new URL(req.url, 'http://x').pathname; if (!(await route({ req, res, p, remote }))) { res.writeHead(418); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { srv.close(); }
}
const auth = { authorization: `Bearer ${KEY}` };
const post = (base, p, b, h = auth) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });

{
  const { brain, calls } = fakeBrain();
  const models = appModels(brain);
  check('/v1/models: bob first, then his talking brains, never the painter', models[0].id === 'bob' && models.some((m) => m.id === 'qwen-coder') && !models.some((m) => m.id === 'flux'), models.map((m) => m.id).join(','));
  check('a brain he doesn\'t have is a 404', pickBrain(brain, 'gpt-4o').code === 404);
  const g = fakeBrain({ session: 'light' }).brain;
  check('Gaming: only bob answers, on the processor', pickBrain(g, 'bob').cpu === true && pickBrain(g, 'qwen-coder').code === 503);
  await withServer(brain, async (base) => {
    let r = await fetch(base + '/v1/models');
    check('no key: 401 with an OpenAI-style error', r.status === 401 && (await r.json()).error?.type === 'invalid_api_key');
    r = await fetch(base + '/v1/models', { headers: auth });
    const list = await r.json();
    check('the list is OpenAI\'s shape', r.status === 200 && list.object === 'list' && list.data[0].id === 'bob' && list.data[0].object === 'model');
    r = await post(base, '/v1/chat/completions', { model: 'bob', messages: [{ role: 'user', content: 'hi' }] });
    const j = await r.json();
    check('a plain answer', r.status === 200 && j.object === 'chat.completion' && j.choices[0].message.content === 'Hello' && j.choices[0].finish_reason === 'stop' && j.usage.total_tokens > 0);
    check('the graphics card is handed back after', calls.some((c) => c.done));
    check('the words are never logged', !calls.some((c) => c.log && /hi|Hello/.test(c.log)) && calls.some((c) => c.log && /answered another app/.test(c.log)));
    r = await post(base, '/v1/chat/completions', { model: 'bob', stream: true, reasoning_effort: 'none', stream_options: { include_usage: true }, messages: [{ role: 'user', content: 'hi' }] });
    const text = await r.text();
    const evs = text.split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]').map((l) => JSON.parse(l.slice(6)));
    check('streamed: role, words, stop, usage, [DONE]', r.headers.get('content-type').startsWith('text/event-stream') && evs[0].choices[0].delta.role === 'assistant' && evs.map((e) => e.choices[0]?.delta?.content || '').join('') === 'Hello' && evs.some((e) => e.choices[0]?.finish_reason === 'stop') && evs.at(-1).usage && text.trim().endsWith('data: [DONE]'));
    check('reasoning_effort none means no thinking', calls.filter((c) => c.chat).at(-1).think === false);
    r = await post(base, '/v1/chat/completions', { model: 'qwen-coder', stream: true, tools: [{ type: 'function', function: { name: 'search', parameters: { type: 'object' } } }], messages: [{ role: 'user', content: 'find it' }] });
    const t2 = await r.text();
    const tc = t2.split('\n').filter((l) => l.startsWith('data: {')).map((l) => JSON.parse(l.slice(6))).find((e) => e.choices?.[0]?.delta?.tool_calls);
    check('tool calls stream back for the app to run', tc?.choices[0].delta.tool_calls[0].function.name === 'search' && tc.choices[0].delta.tool_calls[0].function.arguments === '{"q":1}' && /"finish_reason":"tool_calls"/.test(t2));
    check('a named brain is the one loaded', calls.filter((c) => c.load).at(-1).load === 'qwen-coder');
    r = await post(base, '/v1/chat/completions', { model: 'nope', messages: [{ role: 'user', content: 'hi' }] });
    check('an unknown brain: 404 model_not_found', r.status === 404 && (await r.json()).error.type === 'model_not_found');
    r = await post(base, '/v1/chat/completions', { messages: [] });
    check('nothing to answer: 400', r.status === 400);
    r = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'text/plain', ...auth }, body: '{}' });
    check('only JSON', r.status === 415);
    r = await post(base, '/v1/embeddings', { input: ['abc', 'de'] });
    const e = await r.json();
    check('embeddings from his Memory brain', r.status === 200 && e.data.length === 2 && e.data[0].embedding[0] === 3 && e.data[1].index === 1);
    r = await post(base, '/v1/embeddings', { input: [1, 2] });
    check('embeddings take text only', r.status === 400);
    r = await fetch(base + '/v1/bob/status', { headers: auth });
    const s = await r.json();
    check('status says who answers', s.bob === true && s.version === '9.9.9' && s.brain.model === 'qwen-chat' && s.card === 'free');
    r = await fetch(base + '/v1/files', { headers: auth });
    check('anything else under /v1: 404', r.status === 404);
    // The command line, against the same fake Bob.
    let out = '', err = '';
    const io = { env: {}, config: { port: 1, appsDoor: { key: KEY } }, stdin: null, out: (x) => { out += x; }, err: (x) => { err += x; } };
    let code = await cli(['ask', 'hi', '--url', base], io);
    check('bob ask streams the answer', code === 0 && out === 'Hello\n', JSON.stringify(out + err));
    out = ''; code = await cli(['status', '--url', base], io);
    check('bob status', code === 0 && /running/.test(out) && /Label qwen-chat/.test(out));
    out = ''; code = await cli(['models', '--url', base], io);
    check('bob models', code === 0 && out.split('\n')[0].startsWith('bob'));
    out = ''; err = ''; code = await cli(['ask', 'hi', '--url', base, '--key', 'bob-wrong'], io);
    check('a wrong key says how to fix it', code === 3 && /Settings, Other apps/.test(err));
  });
  // Bad keys are counted: the eleventh in a minute waits.
  await withServer(brain, async (base) => {
    for (let i = 0; i < 10; i++) await fetch(base + '/v1/models', { headers: { authorization: 'Bearer bob-bad' } });
    const r = await fetch(base + '/v1/models', { headers: auth });
    check('too many wrong keys: wait a minute', r.status === 429);
  });
}
{
  const { brain } = fakeBrain();
  brain.cfg.appsDoor.enabled = false;
  await withServer(brain, async (base) => {
    const r = await fetch(base + '/v1/models', { headers: auth });
    check('switched off: 404, even with the key', r.status === 404);
    let err = '';
    const code = await cli(['models', '--url', base, '--key', KEY], { env: {}, config: null, out: () => {}, err: (x) => { err += x; } });
    check('bob says the switch is off', code === 3 && /is off/.test(err));
  });
  await withServer({ ...brain, cfg: { ...brain.cfg, appsDoor: { enabled: true, key: KEY } } }, async (base) => {
    const r = await fetch(base + '/v1/models', { headers: auth });
    check('from another device without its switch: 403', r.status === 403);
  }, { remote: true });
}

// ---- command line bits ----
{
  const o = parseArgs(['ask', 'two', 'words', '--think=high', '--model', 'qwen-coder']);
  check('arguments', o.cmd === 'ask' && o.words.join(' ') === 'two words' && o.think === 'high' && o.model === 'qwen-coder');
  let bad = ''; try { parseArgs(['ask', '--think', 'lots']); } catch (e) { bad = e.message; }
  check('a bad --think says the choices', /none, low, medium or high/.test(bad));
  check('where: flag, then env, then config.json', where({ url: 'http://h:1/v1/' }, { env: {} }).url === 'http://h:1' && where({}, { env: { BOB_URL: 'http://e:2' } }).url === 'http://e:2' && where({}, { env: {}, config: { port: 8000, appsDoor: { key: KEY } } }).url === 'http://localhost:8000' && where({}, { env: {}, config: { appsDoor: { key: KEY } } }).key === KEY);
  const cfgFile = findConfig({ env: {}, here: '/b/app/src', exists: (f) => f === path.join('/b/app/src', '..', '..', 'config.json'), read: () => '﻿{"port":7}' });
  check('findConfig finds the source copy\'s config.json (BOM and all)', cfgFile?.port === 7);
  let out = '';
  const code = await cli([], { env: {}, config: null, out: (x) => { out += x; }, err: () => {} });
  check('no command: the help, exit 2', code === 2 && /bob ask/.test(out));
  let err = '';
  const c2 = await cli(['status', '--url', 'http://127.0.0.1:9'], { env: {}, config: null, out: () => {}, err: (x) => { err += x; }, fetchFn: async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } });
  check('Bob not running: says so, exit 3', c2 === 3 && /isn't answering/.test(err));
}

// ---- Settings, Help, platforms ----
{
  const off = appsDoorBody({ enabled: false, network: false, key: '', url: 'http://localhost:7777/v1', doorOpen: false });
  check('every control is drawn while off (rule 14)', /data-ad="enabled"/.test(off) && /data-ad="network"/.test(off) && /data-ad-new/.test(off) && !/disabled/.test(off));
  const on = appsDoorBody({ enabled: true, network: false, key: KEY, url: 'http://localhost:7777/v1', doorOpen: true });
  check('the key is hidden until Show the key', !on.includes(KEY) && appsDoorBody({ enabled: true, key: KEY, url: 'u' }, { shown: true }).includes(KEY));
  const cellar = publicText('cellar.js');
  check('the panel sits in Settings, Other apps', cellar.includes('${appsDoorHtml()}') && cellar.includes("mountAppsDoor(dlg.querySelector('.apps-door-box'))"));
  const help = HELP.map((h) => `${h.title} ${h.html}`).join(' ');
  check('Help explains it', HELP.some((h) => h.id === 'apps-door') && help.includes('Let other apps use Bob\'s brains') && help.includes('Let apps on my other devices in too') && help.includes('Key for other apps'));
  check('glossary and FAQ', /<dt>OpenAI-compatible/.test(help) && HELP.some((h) => h.id === 'faq-apps-door' && h.group === 'FAQ'));
  check('the guide has it too', read('docs/USER-GUIDE.md').includes('Let other apps use Bob\'s brains'));
  const cmd = fs.readFileSync(path.join(here, '..', 'installer', 'bob.cmd'), 'utf8');
  check('Windows: bob.cmd runs the Node inside Bob.exe', /ELECTRON_RUN_AS_NODE=1/.test(cmd) && /src\\bob-cli\.js/.test(cmd));
  check('Mac and Linux: bob.sh', /node "\$here\/\.\.\/src\/bob-cli\.js"/.test(read('installer/bob.sh')));
  check('the command line needs nothing else of Bob\'s', !/from '\.\//.test(read('src/bob-cli.js')));
  check('it\'s in the test list', JSON.parse(read('package.json')).testSuites.includes('test/run-apps-door-test.js'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
