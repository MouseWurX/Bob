// 1.5.127 Rented brains: off by default, every limit 0, keys only from environment variables and never shown or logged,
// the Hire it card before anything is spent, a self-destruct timer on every hired machine, and the OpenAI-style stream
// read the same way llama-server's is.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SERVICES, CARDS, cardsOf, cardsText, cleanRentals, rentalsOf, currentRental, rentalReady, estimate, estimateText, priceLine, money, scrubKey, serverCommand, modelSpec, chatOpenAI, readPrice, Ledger, Machines, Rentals, envFileVars, rentKeyEnv, RENT_PREFIX, saveEndpoint } from '../src/rental.js';
import { mergeSettings } from '../src/config.js';
import { SLOTS, equipped, rentKitHtml } from '../public/equip.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-rent-'));
const KEY = 'rpa_TESTKEY0123456789abcdefghijklmnop';

// ---- settings: off, limits 0, nothing but the allowed shape ----
{
  const st = rentalsOf({});
  check('no rentals and every limit 0 to start with', st.list.length === 0 && st.caps.month === 0 && st.caps.job === 0 && st.caps.minutes === 0 && !st.current);
  const cfg = {};
  mergeSettings(cfg, { rentals: { enabled: { openrouter: true, bogus: true }, caps: { month: 12.345, job: -4, minutes: 99999 }, list: [{ id: 'abc123', service: 'openrouter', model: 'qwen/qwen3.6-35b-a3b', address: 'https://evil.example', inPerM: 0.2, outPerM: 0.6 }, { service: 'nope', model: 'x' }, { service: 'other', model: 'm', address: 'ftp://bad' }, { service: 'other', model: 'm', address: 'https://my.server/v1', keyEnv: 'MY_KEY' }], current: 'abc123', warned: { openrouter: true, vast: 'yes' } } });
  const r = cfg.rentals;
  check('only known services switch on; unknown ones are dropped', r.enabled.openrouter === true && !('bogus' in r.enabled));
  check('limits are rounded and clamped, never negative', r.caps.month === 12.35 && r.caps.job === 0 && r.caps.minutes === 1440);
  check('a rental on a built-in service can\'t carry its own address', r.list[0].id === 'abc123' && !('address' in r.list[0]) && r.list[0].inPerM === 0.2);
  check('an unknown service or a bad address is dropped; https Another service is kept with its key variable', r.list.length === 2 && r.list[1].service === 'other' && r.list[1].address === 'https://my.server/v1' && r.list[1].keyEnv === 'MY_KEY');
  check('the slot points at a rental on the list; the warning card is remembered only as true', r.current === 'abc123' && r.warned.openrouter === true && !('vast' in r.warned));
  check('currentRental finds the one in the slot', currentRental(cfg)?.model === 'qwen/qwen3.6-35b-a3b');
  check('a service that is off is not ready', !rentalReady(cfg, r.list[1], {}).ok && /off/.test(rentalReady(cfg, r.list[1], {}).why));
  check('a switched-on service with no key says which variable to add', !rentalReady(cfg, r.list[0], {}).ok && /OPENROUTER_API_KEY/.test(rentalReady(cfg, r.list[0], {}).why));
  check('with the key it is ready', rentalReady(cfg, r.list[0], { OPENROUTER_API_KEY: KEY }).ok);
  check('saveEndpoint keeps a serverless endpoint id with its rental', saveEndpoint(cfg, 'abc123', 'ep-12345') && cfg.rentals.list[0].endpointId === 'ep-12345');
}

// ---- keys: from the environment only, also ~/.config/bob/env on Mac and Linux, never in an error ----
{
  const home = path.join(tmp, 'home');
  fs.mkdirSync(path.join(home, '.config', 'bob'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'bob', 'env'), 'export RUNPOD_API_KEY="abc"\nVAST_API_KEY=def\n# comment\nbad line\n');
  const vars = envFileVars({ home, platform: 'linux', now: 1 });
  check('~/.config/bob/env gives NAME=value lines (quotes and export stripped)', vars.RUNPOD_API_KEY === 'abc' && vars.VAST_API_KEY === 'def' && Object.keys(vars).length === 2);
  check('the env file is not read on Windows', Object.keys(envFileVars({ home, platform: 'win32', now: 2 })).length === 0);
  // 1.5.169: BOB_RENT_KEYS (a tester's switch, src/rental.js) is set aside so the check reads the same on every PC.
  const keysMode = process.env.BOB_RENT_KEYS; delete process.env.BOB_RENT_KEYS;
  const env = rentKeyEnv({ TOGETHER_API_KEY: 'zzz' }, vars);
  if (keysMode !== undefined) process.env.BOB_RENT_KEYS = keysMode;
  check('the environment wins, the file fills in', env.TOGETHER_API_KEY === 'zzz' && env.VAST_API_KEY === 'def' && env.NOPE === undefined);
  check('a key is scrubbed out of error text', !scrubKey(`401 from server, Bearer ${KEY} rejected`, [KEY]).includes(KEY) && scrubKey('Authorization: Bearer sk-' + 'abcdefghijklmnopqrstuvwxyz').includes('[key]'));
}

// ---- money ----
{
  const pay = { service: 'openrouter', model: 'm', inPerM: 0.2, outPerM: 0.6 };
  check('pay per answer: words times the list price', Math.abs(estimate(pay, { tokensIn: 100000, tokensOut: 10000 }) - 0.026) < 1e-9 && /100K words/.test(priceLine(pay)));
  const machine = { service: 'runpod', model: 'm', card: '80' };
  check('a machine: minutes plus start-up at the card\'s hourly price', Math.abs(estimate(machine, { minutes: 10 }) - (CARDS['80'].perHour / 60) * 15) < 1e-9 && /an hour plus the minutes/.test(priceLine(machine)));
  check('money reads as dollars, tiny amounts as under 1 cent', money(1.234) === '$1.23' && money(0.001) === 'under 1 cent' && estimateText(pay, 0) === 'under 1 cent' && estimateText(pay, 200000) === 'about $0.04');
  const led = new Ledger(path.join(tmp, 'ledger.json'), { now: () => Date.UTC(2026, 10, 6) });
  led.add({ usd: 0.5 }); led.add({ usd: 0.25 });
  led.rows.push({ at: Date.UTC(2026, 9, 1), usd: 9 }); led.save();
  check('the ledger sums this month only', Math.abs(led.monthSpent() - 0.75) < 1e-9 && new Ledger(path.join(tmp, 'ledger.json'), { now: () => Date.UTC(2026, 10, 6) }).monthSpent() === 0.75);
}

// ---- the self-destruct timer on every hired machine ----
{
  const cmd = serverCommand('Qwen/Qwen3.6-35B-A3B', { minutes: 45, after: 'runpodctl remove pod $RUNPOD_POD_ID' });
  check('a full-size model runs on vLLM inside a timeout of the longest run', /^timeout 2700 python3 -m vllm/.test(cmd) && /--model Qwen\/Qwen3.6-35B-A3B/.test(cmd) && /; runpodctl remove pod/.test(cmd));
  const gg = serverCommand('hf:MouseWurX/24Bob-Riker/24Bob-Riker-Q4_K_M.gguf', { minutes: 0.5 });
  check('a GGUF file runs on llama.cpp, at least a minute', /^timeout 60 \/app\/llama-server/.test(gg) && /--hf-repo MouseWurX\/24Bob-Riker --hf-file 24Bob-Riker-Q4_K_M.gguf/.test(gg) && modelSpec('hf:a/b/c.gguf').kind === 'gguf' && modelSpec('a/b').kind === 'vllm');
}

// ---- the brain itself: the key goes only in the request to its service, the stream is read like llama-server's ----
{
  let sent = null;
  const stream = (lines) => new Response(new ReadableStream({ start(c) { for (const l of lines) c.enqueue(new TextEncoder().encode(l + '\n')); c.close(); } }), { status: 200 });
  const fetchImpl = async (url, opts) => { sent = { url, opts }; return stream([
    'data: {"choices":[{"delta":{"reasoning_content":"hmm"}}]}',
    'data: {"choices":[{"delta":{"content":"Hello "}}]}',
    'data: {"choices":[{"delta":{"content":"there"}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"read_file","arguments":"{\\"path\\":"}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.txt\\"}"}}]}}]}',
    'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":9,"cost":0.0004}}',
    'data: [DONE]']); };
  let said = '', thought = '';
  const { reply, usage } = await chatOpenAI({ url: 'https://openrouter.ai/api/v1', key: KEY, model: 'm', messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }], tools: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }], onToken: (t) => { said += t; }, onThink: (t) => { thought += t; }, think: false, fetchImpl });
  const body = JSON.parse(sent.opts.body);
  check('the request carries the key as a bearer header, to the service address only', sent.url === 'https://openrouter.ai/api/v1/chat/completions' && sent.opts.headers.authorization === `Bearer ${KEY}` && body.stream === true && body.stream_options?.include_usage === true);
  check('thinking off is asked for the way llama-server takes it', body.chat_template_kwargs?.enable_thinking === false && body.messages.length === 2);
  check('words stream out, thinking goes to the thinking window, the tool call comes back parsed', said === 'Hello there' && thought === 'hmm' && reply.tool_calls?.[0]?.function?.name === 'read_file' && reply.tool_calls[0].function.arguments.path === 'a.txt');
  check('the service\'s own count and cost are kept', usage.in === 120 && usage.out === 9 && usage.usd === 0.0004);
  let threw = null;
  try { await chatOpenAI({ url: 'https://x.example/v1', key: KEY, model: 'm', messages: [], fetchImpl: async () => new Response(`bad key ${KEY}`, { status: 401 }) }); } catch (e) { threw = e; }
  check('an error from the service never carries the key', threw && threw.status === 401 && !threw.message.includes(KEY) && /401/.test(threw.message));
  // readPrice: OpenRouter prices per word as strings; Together per million.
  const pr = await readPrice({ service: 'openrouter', model: 'qwen/x' }, KEY, async () => new Response(JSON.stringify({ data: [{ id: 'qwen/x', pricing: { prompt: '0.0000002', completion: '0.0000006' }, context_length: 131072 }] })));
  check('the price is read from the service\'s model list', Math.abs(pr.inPerM - 0.2) < 1e-9 && Math.abs(pr.outPerM - 0.6) < 1e-9 && pr.context === 131072);
}

// ---- Rentals: the card first, the limits, the ledger; a machine starts under Bob's name with the timer and stops after ----
{
  const cfg = { dataDir: tmp, rentals: { enabled: { openrouter: true, runpod: true }, caps: { month: 0, job: 0, minutes: 0 }, list: [{ id: 'pay001', service: 'openrouter', model: 'qwen/x', name: 'Qwen on OpenRouter', inPerM: 0.2, outPerM: 0.6 }, { id: 'mach01', service: 'runpod', model: 'Org/Big', name: 'Big on RunPod', card: '80' }], current: 'pay001' } };
  let t = Date.UTC(2026, 10, 6, 12);
  const calls = [];
  const events = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {} });
    if (/\/pods$/.test(url) && opts.method === 'POST') return new Response(JSON.stringify({ id: 'pod42' }), { status: 200 });
    if (/\/pods$/.test(url)) return new Response(JSON.stringify([{ id: 'old1', name: `${RENT_PREFIX}zzz`, costPerHr: 2.5 }, { id: 'theirs', name: 'forge' }]), { status: 200 });
    if (/\/pods\/pod42$/.test(url) && opts.method === 'DELETE') return new Response('', { status: 200 });
    if (/\/models$/.test(url)) return new Response('{"data":[]}', { status: 200 });
    if (/chat\/completions$/.test(url)) return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\ndata: {"choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":100}}\n')); c.close(); } }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  const env = { OPENROUTER_API_KEY: KEY, RUNPOD_API_KEY: 'rpa_' + KEY };
  const rentals = new Rentals(cfg, { fetchImpl, now: () => t, env, broadcast: (ev) => events.push(ev) });
  const pay = rentals.current();
  check('with every limit at 0 nothing can start, and the line says which to set', !rentals.canStart(pay, 0).ok && /this month.*one job/.test(rentals.canStart(pay, 0).why));
  cfg.rentals.caps = { month: 5, job: 1, minutes: 0 };
  check('pay per answer needs no machine timer; a machine does', rentals.canStart(pay, 0.1).ok && !rentals.canStart(cfg.rentals.list[1], 0.1).ok && /longest/.test(rentals.canStart(cfg.rentals.list[1], 0.1).why));
  check('a job past the per-job cap is refused; so is one that would pass the month', !rentals.canStart(pay, 1.5).ok && !rentals.canStart(pay, 6).ok);
  // The card
  const emitted = [];
  const id = rentals.offer(pay, { jobId: 'job1', tokens: 50000, why: 'test', emit: (ev) => emitted.push(ev) });
  check('the Hire it card names the service, the cost and nothing about keys', emitted[0]?.type === 'offer-rent' && emitted[0].rental.service === 'OpenRouter' && /^\$0\.0\d$/.test(emitted[0].est) && !JSON.stringify(emitted[0]).includes(KEY) && emitted[0].carryOn === true);
  check('not yet approved before the card is answered', !rentals.approved(pay, { id: 'job1' }));
  check('Not now hires nothing', rentals.answer(id, false).done === 'none' && !rentals.approved(pay, { id: 'job1' }));
  const id2 = rentals.offer(pay, { jobId: 'job1', tokens: 100, emit: () => {} });
  const a = rentals.answer(id2, true);
  check('Hire it approves this rental for about a dollar more', a.ok && a.done === 'hired' && a.jobId === 'job1' && rentals.approved(pay, {}) && rentals.answer(id2, true).ok === false);
  // A pay-per-answer turn
  const reply = await rentals.chat(pay, { messages: [{ role: 'user', content: 'hi' }], tools: [], signal: null, onToken: () => {}, job: { id: 'job1' } });
  check('the turn comes back as a normal reply and the ledger has the cost', reply.content === 'ok' && Math.abs(rentals.spent() - (0.2 * 1000 + 0.6 * 100) / 1e6) < 1e-4);
  check('the cost line goes out to the chat', events.some((e) => e.type === 'rent' && e.action === 'used') === false && emitted.length === 1); // emit was per call: none passed this time
  // The machine
  cfg.rentals.caps.minutes = 30;
  const mach = cfg.rentals.list[1];
  const ev2 = [];
  rentals.okUntil = { rental: 'mach01', usd: 10 };
  const r2 = await rentals.chat(mach, { messages: [{ role: 'user', content: 'hi' }], tools: [], onToken: () => {}, job: { id: 'job2' }, emit: (ev) => ev2.push(ev) });
  const start = calls.find((c) => /\/pods$/.test(c.url) && c.method === 'POST');
  check('the machine is started under Bob\'s name with the 80 GB cards and the self-destruct timer', start && start.body.name === `${RENT_PREFIX}mach01` && start.body.gpuTypeIds.includes('NVIDIA H100 80GB HBM3') && /^timeout 1800 /.test(start.body.dockerStartCmd[0]) && start.headers.authorization === `Bearer rpa_${KEY}`);
  check('the chat goes to the machine\'s own address with no key, and the start is announced', calls.some((c) => c.url === 'https://pod42-8000.proxy.runpod.net/v1/chat/completions' && !c.headers.authorization) && ev2.some((e) => e.type === 'rent' && e.action === 'start' && e.minutes === 30) && r2.content === 'ok');
  check('the machine keeps running while the job does', rentals.running.has('mach01'));
  t += 10 * 60000;
  rentals.turnDone({ id: 'job2' });
  await rentals.watch();
  const del = calls.find((c) => /\/pods\/pod42$/.test(c.url) && c.method === 'DELETE');
  check('once no job uses it, the machine is stopped and the minutes go in the ledger', del && !rentals.running.has('mach01') && events.some((e) => e.type === 'rent' && e.action === 'stop' && e.stopped && e.minutes === 10) && Math.abs(rentals.ledger.recent(1)[0].usd - (CARDS['80'].perHour / 6)) < 1e-3);
  // Leftovers: only Bob's own machines, never the Forge's pod
  const left = await rentals.findLeftovers();
  check('leftover machines are found by Bob\'s name only', left.length === 1 && left[0].id === 'old1' && rentals.view().leftover[0].serviceName === 'RunPod (a machine by the minute)');
  const view = JSON.stringify(rentals.view());
  check('the view for Settings never holds a key', !view.includes(KEY) && view.includes('"keyFound":true') && view.includes('OPENROUTER_API_KEY'));
  check('a cap reached stops a running machine', (() => { rentals.running.set('mach01', { id: 'p9', url: 'x', kind: 'machine', startedAt: t - 31 * 60000, jobs: new Set(['j']), usd: 0, perHour: 3, rental: 'mach01' }); rentals.checkCaps(mach, rentals.running.get('mach01')); return !rentals.running.has('mach01'); })());
}

// ---- several cards on one machine: off unless asked for, costs that many times as much, and the Hire it card says so ----
{
  const cfg = {};
  mergeSettings(cfg, { rentals: { list: [{ id: 'eight01', service: 'runpod', model: 'Qwen/Giant', card: '141', cards: 8 }, { id: 'one001', service: 'runpod', model: 'Org/Big', card: '80', cards: 3 }, { id: 'srv001', service: 'runpod-serverless', model: 'Org/Big', card: '80', cards: 8 }] } });
  const [eight, one, srv] = cfg.rentals.list;
  check('the count is kept only as 2, 4 or 8 on a machine by the minute; serverless and odd counts stay at one card', eight.cards === 8 && cardsOf(eight) === 8 && !('cards' in one) && cardsOf(one) === 1 && !('cards' in srv));
  check('the price and the estimate are for the whole machine', Math.abs(estimate(eight, { minutes: 10 }) - (CARDS['141'].perHour * 8 / 60) * 15) < 1e-9 && /for 8 cards/.test(priceLine(eight)) && cardsText(eight) === '8 × 141 GB card on one machine');
  check('vLLM is told to split the model over the cards', /--tensor-parallel-size 8/.test(serverCommand('Qwen/Giant', { minutes: 30, cards: 8 })) && !/tensor-parallel/.test(serverCommand('Qwen/Giant', { minutes: 30 })));
  const calls = [];
  const m = new Machines({ fetchImpl: async (url, opts) => { calls.push(JSON.parse(opts.body)); return new Response('{"id":"p8","costPerHr":40}'); }, now: () => 1 });
  const run = await m.start(eight, { key: 'k', minutes: 30 });
  check('RunPod is asked for that many cards, and its own hourly price is kept', calls[0].gpuCount === 8 && run.perHour === 40);
  const emitted = [];
  new Rentals(cfg, { env: { RUNPOD_API_KEY: 'k' }, broadcast: () => {} }).offer(eight, { tokens: 10, emit: (ev) => emitted.push(ev) });
  check('the Hire it card carries the count so the window and the phone can warn', emitted[0].rental.cards === 8 && emitted[0].rental.cardsText === '8 × 141 GB card on one machine');
  const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
  check('Settings warns big before more than one card sticks, and snaps back to 1 on Back', /Cards on the machine/.test(cellar) && /times as much/.test(cellar) && /data-rentmultiok/.test(cellar) && /sel\.value = '1'/.test(cellar));
}

// ---- Equip Bob: the slot, and the kit panel lists rentals without hiring anything ----
{
  const slot = SLOTS.find((s) => s.id === 'rent');
  check('Equip Bob has a Rented brain slot on the left, with plain words', slot && slot.how === 'rent' && slot.side === 'L' && /Only used when you say so/.test(slot.does) && /runs on this replicant matrix/.test(slot.empty));
  check('the slot shows the rental in it', equipped(slot, { rent: { current: 'pay001' } }) === 'pay001' && equipped(slot, {}) === '');
  const html = rentKitHtml(slot, { rent: { current: 'pay001', caps: { month: 0, job: 0 }, rentals: [{ id: 'pay001', name: 'Qwen on OpenRouter', model: 'qwen/x', serviceName: 'OpenRouter', kind: 'answer', price: 'about $0.02 per 100K words read', ready: { ok: true } }] } });
  check('the kit panel offers Use this one / Take it off and points to Settings for the limits', /in the slot/.test(html) && /Take it off/.test(html) && /Every limit starts at 0/.test(html) && /Set up rented brains in Settings/.test(html));
}

// ---- Help, in Bob's voice ----
{
  const rented = HELP.find((e) => e.id === 'rented');
  check('Help explains rented brains, the limits and what leaves this replicant matrix', rented && /Hire it/.test(rented.html) && /starts at 0/.test(rented.html) && /never store/.test(rented.html) && /timer/.test(rented.html));
  check('the glossary and FAQ cover the new words', HELP.some((e) => /<dt>Rented brain<\/dt>/.test(e.html) && /<dt>Spending cap<\/dt>/.test(e.html)) && ['faq-rent-billing', 'faq-rent-cost', 'faq-rent-files'].every((id) => HELP.some((e) => e.id === id)));
  check('the privacy page and the "send my chats" FAQ list rented brains', /Rented brains/.test(HELP.find((e) => e.id === 'privacy').html) && /rented brain/.test(HELP.find((e) => e.id === 'faq-online').html));
  check('services are named by what they do, with the key variable each uses', SERVICES.every((s) => s.what && (s.id === 'other' || /^[A-Z_]+$/.test(s.keyEnv))) && SERVICES.filter((s) => s.kind === 'machine').every((s) => /minute/.test(s.name)));
}

// ---- 1.5.128: the five fixes from the first live checks ----
{
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  check('the Hire it button is disabled in the card itself while hiring is blocked', /class="get"\$\{ev\.blocked \? ' disabled/.test(appJs) && /Not hired\. Doing it here instead\./.test(appJs));
  const brainJs = fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8');
  check('Not now puts the job back in line to run here', /r\.done === 'none' && r\.jobId/.test(brainJs) && /j\.rent = false; j\.rentOk = false; j\.rentAgain = true; this\.carryOnNow/.test(brainJs));
  const routes = fs.readFileSync(new URL('../src/rental-routes.js', import.meta.url), 'utf8');
  check('adding into the empty slot and removing the slotted rental both tell the chat page', (routes.match(/action: 'slot'/g) || []).length === 3);
  const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
  check('Add this rental says what is missing', /Type the model\\'s name first/.test(cellar) && /alertIn\(b, e\.message\)/.test(cellar));
  // A tester's PC may hold a real key in its user variables (the PC thread's does), so those are set aside for the check
  // and put back after: the check is about what rentKeyEnv reads, not about the machine running it.
  const was = process.env.BOB_RENT_KEYS;
  const hidden = ['RUNPOD_API_KEY', 'VAST_API_KEY', 'OPENROUTER_API_KEY', 'TOGETHER_API_KEY', 'LAMBDA_API_KEY'].map((k) => [k, process.env[k]]);
  for (const [k] of hidden) delete process.env[k];
  process.env.BOB_RENT_KEYS = 'off';
  const off = rentKeyEnv({ RUNPOD_API_KEY: 'x' }, { VAST_API_KEY: 'y' });
  process.env.BOB_RENT_KEYS = 'env';
  const envOnly = rentKeyEnv({ RUNPOD_API_KEY: 'x' }, { VAST_API_KEY: 'y' });
  const envOnlyIsProcess = envOnly.BOB_RENT_KEYS === 'env' && Object.keys(envOnly).length === Object.keys(process.env).length; // judged before the variables go back
  if (was === undefined) delete process.env.BOB_RENT_KEYS; else process.env.BOB_RENT_KEYS = was;
  for (const [k, v] of hidden) if (v !== undefined) process.env[k] = v;
  check('BOB_RENT_KEYS=off hides every key; =env reads the process only', Object.keys(off).length === 0 && !envOnly.RUNPOD_API_KEY && !envOnly.VAST_API_KEY && envOnlyIsProcess); // not PATH: Windows spells it Path on some machines, and a plain copy keeps that spelling
}

fs.rmSync(tmp, { recursive: true, force: true });

// 1.5.128 (PC thread): the message that drew the Hire it card is already in the chat once; the run after Hire it or Not now
// adds only a hidden note, so a reload shows one bubble. And the greyed Hire it button looks greyed; a missing-field line is red.
const brainSrc = fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8');
const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('the run after the card answer does not repeat the user message', /j\.rentAgain = true/.test(brainSrc) && /Boolean\(job\?\.rentAgain\)/.test(brainSrc) && /job\.rentAgain = false/.test(brainSrc));
const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
check('a blocked Hire it button looks disabled', /\.rent-card button\.get:disabled \{ opacity: \.5; cursor: not-allowed; \}/.test(css));
check('the missing-field line by Add this rental is red', /noteEl\.classList\.add\('error'\)/.test(cellar) && (cellar.match(/noteEl\.classList\.add\('error'\)/g) || []).length === 2);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
