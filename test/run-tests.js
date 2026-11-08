// End-to-end tests for Bob's brain against a fake Ollama. Run: npm test
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startMockOllama } from './mock-ollama.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OLLAMA_PORT = 11555, BOB_PORT = 7790;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-test-'));
const outside = path.join(tmp, 'Documents');
fs.mkdirSync(outside);
process.env.MOCK_OUTSIDE_FILE = path.join(outside, 'note.txt');
let earlyFailures = 0;
const checkEarly = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) earlyFailures++; };

const project = path.join(tmp, 'Game');
fs.mkdirSync(project);
process.env.MOCK_PROJECT_FILE = path.join(project, 'Main.cpp');
fs.writeFileSync(process.env.MOCK_PROJECT_FILE, 'int a = 1;\nint b = 2;\n');
// Tests start from the shipped example settings (the real config.json is never published or read here).
const cfg = { ...JSON.parse(fs.readFileSync(path.join(here, '..', 'config.example.json'), 'utf8')), userName: 'Sam', engine: 'ollama', models: { bob: 'gemma4:26b', tinker: 'qwen3-coder:30b', ledger: 'gemma4:26b', scout: 'gemma4:26b', painter: 'gemma4:26b', reviewer: 'gemma4:26b' }, stt: { provider: 'ollama', model: 'gemma4:e4b' } };
cfg.readRoots = [outside, project];
cfg.projects = { Game: project };
cfg.readOnlyRoots = [];
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify(cfg));

// Secrets guard (unit checks, no server needed)
{
  const { buildTools, isSensitive } = await import('../src/tools.js');
  const sdir = path.join(tmp, 'Secrets');
  fs.mkdirSync(sdir);
  for (const f of ['local.properties', 'release.jks', '.env', 'notes.txt', 'google-services.json']) fs.writeFileSync(path.join(sdir, f), 'needle');
  const gcfg = { readRoots: [sdir], readOnlyRoots: [], innDir: path.join(tmp, 'inn-x'), dataDir: path.join(tmp, 'inn-x', 'bob'), agentDir: path.join(tmp, 'Bob home'), projects: { Secrets: sdir }, timeZone: 'America/Edmonton' };
  const gt = buildTools(gcfg);
  const refused = async (fnc) => { try { await fnc(); return false; } catch (e) { return /off-limits/.test(e.message); } };
  const listing = await gt.list_folder.run({ path: sdir });
  checkEarly(/notes\.txt/.test(listing) && !/local\.properties|\.jks|\.env|google-services/.test(listing), 'list_folder hides secret files');
  checkEarly(await refused(() => gt.read_file.run({ path: path.join(sdir, 'local.properties') })), 'read_file refuses local.properties');
  checkEarly(await refused(() => gt.read_file.run({ path: path.join(sdir, 'release.jks') })), 'read_file refuses a keystore');
  checkEarly(await refused(() => gt.write_file.check({ path: path.join(sdir, '.env.local'), content: 'x' })), 'write_file refuses .env files');
  checkEarly(await refused(() => gt.edit_file.check({ path: path.join(sdir, 'local.properties'), find: 'needle', replace: 'y' })), 'edit_file refuses local.properties');
  const found = await gt.search_files.run({ project: 'Secrets', text: 'needle' });
  checkEarly(/notes\.txt/.test(found) && !/google-services/.test(found), 'search_files skips secret files');
  checkEarly(isSensitive(gcfg, path.join(here, '..', 'config.json')), "Bob's own config.json is off-limits");
  checkEarly(isSensitive(gcfg, path.join(gcfg.agentDir, 'open-webui-data', 'webui.db')), 'open-webui-data is off-limits');
  checkEarly(!isSensitive(gcfg, path.join(sdir, 'notes.txt')), 'ordinary files still readable');
  const { loadConfig } = await import('../src/config.js');
  process.env.BOB_AGENT_DIR = path.join(tmp, 'Bob home');
  const lc = loadConfig();
  delete process.env.BOB_AGENT_DIR;
  checkEarly(lc.readOnlyRoots.some((r) => path.resolve(r) === path.resolve(here, '..')) && lc.readOnlyRoots.some((r) => /backup$/.test(r)), "Bob's folder and backup are read-only");
  {
    const lt = buildTools(lc);
    let blocked = false;
    try { lt.write_file.check({ path: lc.settingsFile, content: '{"autostart":true}' }); } catch (e) { blocked = /read-only/.test(e.message); }
    checkEarly(blocked, 'Bob cannot write his own settings.json (autostart stays opt-in)');
  }
}

const { server: mock, calls: mockCalls } = await startMockOllama(OLLAMA_PORT);
const bob = spawn(process.execPath, [path.join(here, '..', 'src', 'server.js')], {
  env: { ...process.env, BOB_CONFIG: path.join(tmp, 'config.json'), BOB_AGENT_DIR: path.join(tmp, 'Bob home'), BOB_OLLAMA_URL: `http://127.0.0.1:${OLLAMA_PORT}`, BOB_PORT: String(BOB_PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});
bob.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((r) => bob.stdout.once('data', r));

const base = `http://127.0.0.1:${BOB_PORT}`;
const inn = path.join(tmp, 'Bob home', 'inn');
let failures = earlyFailures;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };

// Collect events from the SSE stream.
const events = [];
const ctrl = new AbortController();
(async () => {
  const res = await fetch(base + '/api/events', { signal: ctrl.signal });
  let buf = '';
  for await (const c of res.body) {
    buf += Buffer.from(c).toString();
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (line) events.push(JSON.parse(line.slice(6)));
    }
  }
})().catch(() => {});

const post = (p, body, headers = { 'x-bob': '1' }) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function turn(text, onApproval) {
  const start = events.length;
  const r = await post('/api/chat', { sessionId: 'test', text });
  const { turnId } = await r.json();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const mine = events.slice(start).filter((e) => e.turnId === turnId);
    const ap = mine.find((e) => e.type === 'approval' && !e.handled);
    if (ap && onApproval) { ap.handled = true; await post('/api/approve', { id: ap.id, allow: onApproval(ap) }); }
    if (mine.some((e) => e.type === 'done')) return mine;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('turn timed out: ' + text);
}
const textOf = (evs) => evs.filter((e) => e.type === 'token').map((e) => e.text).join('');

try {
  // Security checks
  check((await post('/api/chat', { text: 'hi' }, {})).status === 403, 'POST without x-bob header is refused');
  // Same-origin only (1.0.4): another website, another port on this PC, or a plain form body is refused.
  check((await post('/api/activity', {}, { 'x-bob': '1', origin: 'https://evil.example' })).status === 403, 'POST from another website (Origin) is refused');
  check((await post('/api/activity', {}, { 'x-bob': '1', origin: 'http://localhost:3000' })).status === 403, 'POST from another port on this PC is refused');
  check((await post('/api/activity', {}, { 'x-bob': '1', 'sec-fetch-site': 'cross-site' })).status === 403, 'POST marked cross-site is refused');
  check((await post('/api/activity', {}, { 'x-bob': '1', 'sec-fetch-site': 'same-site' })).status === 403, 'POST marked same-site (another port) is refused');
  check((await post('/api/open', {}, { 'x-bob': '1', 'content-type': 'text/plain' })).status === 415, 'a text/plain body is refused');
  check((await fetch(base + '/api/uninstall', { method: 'POST', headers: { 'x-bob': '1' }, body: '{"confirm":"remove"}' })).status === 415, 'a body with no content type is refused');
  check((await post('/api/activity', {}, { 'x-bob': '1', origin: base, 'sec-fetch-site': 'same-origin' })).status === 200, "Bob's own page still gets through");
  // Housekeeping (1.1.0): off by default, and its pages answer.
  const hkInfo = await (await fetch(base + '/api/hk')).json();
  check(hkInfo.settings?.enabled === false && Object.values(hkInfo.settings).filter((x) => typeof x === 'object').every((k) => k.mode === 'ask'), 'housekeeping is off by default and every kind asks first');
  check(Array.isArray(await (await fetch(base + '/api/topics')).json()), 'the Topics page answers');
  check(Array.isArray((await (await fetch(base + '/api/chats')).json()).chats), 'the past chats list answers');
  check((await post('/api/topics/forget', { id: 'nope' })).status === 409, 'forgetting an unknown topic is refused');
  const hostStatus = await new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: BOB_PORT, path: '/api/status', headers: { host: 'evil.example:7790' } }, (r) => { r.resume(); resolve(r.statusCode); }).on('error', () => resolve(0));
  });
  check(hostStatus === 403, 'wrong Host header is refused');
  check((await fetch(base + '/')).status === 200, 'panel is served');
  check((await fetch(base + '/icons/bob-192.png')).status === 200, 'icon is served');
  check((await fetch(base + '/../config.json')).status === 404, 'no path escape from public');

  // 1. Plain chat, with a model load announced first
  let evs = await turn('hello');
  check(evs.some((e) => e.type === 'announce' && /Back in about \d+ seconds/.test(e.text)), 'announces the brain swap with an estimate');
  check(/Idle Process/.test(textOf(evs)), 'streams Bob\'s reply');
  check(fs.existsSync(path.join(inn, 'logbook.md')), 'logbook written');

  // 2. Second turn: model already loaded, no announcement
  evs = await turn('hello again');
  check(!evs.some((e) => e.type === 'announce'), 'no announcement when the model is already loaded');

  // 3. Notice board: read then write
  evs = await turn('put shipping MouseHole on my board');
  check(fs.readFileSync(path.join(inn, 'notice-board.md'), 'utf8').includes('Ship MouseHole'), 'notice board written');

  // 4. Remember
  await turn('remember that I like pixel art');
  check(fs.readFileSync(path.join(inn, 'bob-memory.md'), 'utf8').includes('pixel art'), 'memory saved');

  // 5. Write outside the inn needs approval: deny, then allow
  evs = await turn('save a note to my documents', () => false);
  check(evs.some((e) => e.type === 'approval'), 'asks before writing outside the inn');
  check(!fs.existsSync(process.env.MOCK_OUTSIDE_FILE), 'denied write did not happen');
  evs = await turn('save a note to my documents', () => true);
  check(fs.existsSync(process.env.MOCK_OUTSIDE_FILE), 'approved write happened');

  // 6. Hat swap: coding goes to the coder model, announced
  evs = await turn('my game has a crash when the actor is destroyed');
  check(evs.some((e) => e.type === 'hat' && e.hat === 'tinker'), 'puts on the workbench hat');
  check(evs.some((e) => e.type === 'announce' && /qwen3-coder|Qwen3 Coder/i.test(e.text)), 'announces the switch to the coder brain');
  check(/IsValid/.test(textOf(evs)), 'coder answer streamed to the user');

  // 6a. Handoff: the coding copy sees the conversation so far, not just the task the front desk wrote.
  await turn('the actor is called Grimbold');
  evs = await turn('about that crash: what was the actor\'s name?');
    check(evs.some((e) => e.type === 'hat') && /Grimbold/.test(textOf(evs)), 'a helper copy can answer from an earlier message (handoff packet)');
  {
    const q = await (await fetch(base + '/api/queue')).json();
    const j = q.filter((x) => /actor's name/.test(x.text)).at(-1);
    const st = j?.steps?.[0];
    check(j?.status === 'completed' && j.doneAt && st?.hat === 'tinker' && st.state === 'completed' && st.copy && st.doneAt && !j.delegatedTo, 'the task shows it was delegated to a copy, then completed (with times)');
  }

  // 6b. A picture attached to the turn goes along when Bob hands the job to a hat that can see.
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const ref = await (await fetch(base + '/api/refs?name=crash-shot&kind=chat', { method: 'POST', headers: { 'x-bob': '1', 'content-type': 'application/octet-stream' }, body: png })).json();
  const callsBefore = mockCalls.length;
  {
    const start = events.length;
    const r = await post('/api/chat', { sessionId: 'test', text: 'why does my game crash here', refs: [ref.id] });
    const { turnId } = await r.json();
    for (let i = 0; i < 300 && !events.slice(start).some((e) => e.turnId === turnId && e.type === 'done'); i++) await new Promise((x) => setTimeout(x, 50));
  }
  const hatCall = mockCalls.slice(callsBefore).find((c) => c.path === '/api/chat' && c.body.model === 'qwen3-coder:30b' && c.body.stream !== false);
  const hatUser = hatCall?.body.messages.find((m) => m.role === 'user');
  check(Boolean(hatUser?.images?.length) && /crash-shot/.test(hatUser.content), 'the attached picture (and its note) goes along to the coding copy');

  // 6b. Coding with approvals: first edit "allow the rest of this job", second edit needs no prompt
  let prompts = 0;
  evs = await turn('rename a and b in my game', () => { prompts++; return 'all'; });
  const src = fs.readFileSync(process.env.MOCK_PROJECT_FILE, 'utf8');
  check(src.includes('int alpha = 1;') && src.includes('int bravo = 2;'), 'Bob edited the project file twice');
  check(prompts === 1, '"allow the rest of this job" covered the second edit');
  check(evs.some((e) => e.type === 'approval' && e.diff && e.diff.includes('+ int alpha')), 'approval card shows the change');
  check(fs.readdirSync(path.join(inn, 'bob', 'backups')).length === 1, 'backup kept before editing');
  const histRaw = JSON.parse(fs.readFileSync(path.join(inn, 'bob', 'sessions', 'test.json'), 'utf8'));
  const back = histRaw.filter((m) => m.role === 'tool' && m.tool_name === 'ask_specialist').at(-1)?.content || '';
  check(/What .* did: edit_file .*edit_file/.test(back), 'what the helper did (tools, files) comes back into the main conversation');
  check(!(await (await fetch(base + '/api/history?session=test')).text()).includes('did: edit_file'), 'the return-trip notes stay out of the chat the user sees');

  // 6c. Voice: WAV goes to Ollama on the CPU
  const wav = Buffer.alloc(3200);
  const tr = await (await fetch(base + '/api/transcribe', { method: 'POST', headers: { 'x-bob': '1', 'content-type': 'audio/wav' }, body: wav })).json();
  check(tr.text === 'hello Bob', 'speech turned into text through Ollama');

  // 7. History endpoint
  const hist = await (await fetch(base + '/api/history?session=test')).json();
  check(hist.length >= 10 && hist.every((m) => m.content), 'history returns the conversation');

  // 8. A message sent while Bob is busy waits its turn; Stop ends only the running one
  const r = await post('/api/chat', { sessionId: 'test', text: 'hello' });
  const first = await r.json();
  check(r.status === 200, 'turn started');
  const r2 = await post('/api/chat', { sessionId: 'test', text: 'second' });
  const second = await r2.json();
  check(r2.status === 200 && second.ahead >= 1, 'a message sent while busy is queued, not refused');
  await post('/api/stop', {});
  const sd = Date.now() + 10000;
  while (Date.now() < sd && !events.some((e) => e.turnId === second.jobId && e.type === 'done')) await new Promise((r) => setTimeout(r, 50));
  const ql = await (await fetch(base + '/api/queue')).json();
  check(ql.find((j) => j.id === first.jobId)?.state === 'cancelled' && ql.find((j) => j.id === second.jobId)?.state === 'done', 'stop ends only the running job; the queued one still runs');
  const st = await (await fetch(base + '/api/status')).json();
  check(!st.busy, 'stop ends the turn');

  // 9. Settings: opt-in by default, and protected
  const set = await (await fetch(base + '/api/settings')).json();
  check(set.autostart === false && set.setupDone === false, 'launch on start-up is off until turned on; first-run setup shows');
  const noHeader = await fetch(base + '/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"autostart":true}' });
  check(noHeader.status === 403, 'settings need the x-bob header');
  const shopList = await (await fetch(base + '/api/models')).json();
  check(shopList.categories.length === 8 && shopList.models.length >= 10 && shopList.packs.length === 7, 'model shop lists categories, models and starter sets');
  check((await post('/api/models/download', { id: 'does-not-exist' })).status === 409, 'unknown model download refused');
  check((await post('/api/settings', { setupDone: true })).status === 200 && (await (await fetch(base + '/api/settings')).json()).setupDone === true, 'finishing setup is remembered');
  // Every setting the app changes goes through the server both ways (keep-alive was once dropped).
  for (const [patch, ok] of [
    [{ ollamaKeepAlive: '30m' }, (g) => g.ollamaKeepAlive === '30m'],
    [{ catName: 'Patches' }, (g) => g.catName === 'Patches'],
    [{ look: 'f-3' }, (g) => g.look === 'f-3'],
    [{ look: 'pc-12' }, (g) => g.look === 'pc-12'],
    [{ style: { theme: 'midnight' } }, (g) => g.style.theme === 'nightside'], // 1.5.137: old theme names are migrated on save
    [{ tts: { voice: 'bm_george', speed: 1.2 } }, (g) => g.tts.voice === 'bm_george' && g.tts.speed === 1.2],
    [{ session: 'office' }, (g) => g.session.id === 'office'],
    [{ session: 'normal' }, (g) => g.session.id === 'normal'],
    [{ oneBrain: false }, (g) => g.oneBrain === false]
  ]) {
    const r = await post('/api/settings', patch);
    const g = await (await fetch(base + '/api/settings')).json();
    check(r.status === 200 && ok(g), `setting saved and read back: ${JSON.stringify(patch)}`);
  }
  const book = fs.readFileSync(path.join(inn, 'logbook.md'), 'utf8');
  check(/settings \| changed: ollamaKeepAlive/.test(book) && /settings \| changed: session/.test(book), 'every settings change is in the logbook with its keys');

  // Queue: three quick messages in a row all get answered, in order, none dropped.
  const qStart = events.length;
  const ids = [];
  for (const t of ['hello one', 'hello two', 'hello three']) ids.push((await (await post('/api/chat', { sessionId: 'test', text: t })).json()).jobId);
  const qDeadline = Date.now() + 20000;
  while (Date.now() < qDeadline && !ids.every((id) => events.slice(qStart).some((e) => e.turnId === id && e.type === 'done'))) await new Promise((r) => setTimeout(r, 50));
  const doneOrder = events.slice(qStart).filter((e) => e.type === 'done').map((e) => e.turnId);
  check(ids.every((id) => doneOrder.includes(id)) && doneOrder.indexOf(ids[0]) < doneOrder.indexOf(ids[1]) && doneOrder.indexOf(ids[1]) < doneOrder.indexOf(ids[2]), 'quick messages queue up and all get answered, in order');
  const q = await (await fetch(base + '/api/queue')).json();
  check(ids.every((id) => q.find((j) => j.id === id)?.state === 'done') && fs.existsSync(path.join(inn, 'bob', 'queue.json')), 'the queue is saved and shows each job as done');
  {
    await new Promise((r) => setTimeout(r, 1100));
    const before = await (await fetch(base + '/api/idle')).json();
    await post('/api/activity', {});
    const after = await (await fetch(base + '/api/idle')).json();
    check(before.quietForSeconds >= 1 && after.quietForSeconds === 0 && after.idle === false, 'clicking or typing in Bob\'s window counts as activity, so an update waits');
    check(Array.isArray(after.loaded) && after.engine === 'ollama', 'the idle check lists the models still loaded');
  }
} catch (e) {
  console.error(e);
  failures++;
} finally {
  ctrl.abort();
  bob.kill();
  mock.close();
}
console.log(failures ? `\n${failures} failed` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
