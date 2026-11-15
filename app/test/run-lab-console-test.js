// The Forge console (15 Nov 2026): the command line's rules, what reaches a script, the relay's record of every request
// and reply, Hold each request, the readouts' channels, buttons, logs followed from elsewhere, and the routes.
// Everything runs in a temp folder with a fake model-lab, a fake brain server on this computer and fake engines: no
// card, no real brain, no rental, no key store, no real folders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseLine, channelOf, cleanEnv, checkCommand, killTree, hideHeaders, hidePaths, LabConsole, consoleRoute, HELP, cleanSetup, chatBody, makeRentalPlan, rentalChoices } from '../src/lab-console.js';

let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${more ? ` ${more}` : ''}`); } };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(25); } return fn(); };

// ---- the command line: words, never a shell ----
check('words split on spaces, quotes keep spaces', JSON.stringify(parseLine('node a.mjs --name "two words" \'x y\'')) === JSON.stringify(['node', 'a.mjs', '--name', 'two words', 'x y']));
check('a backslash stays a letter (Windows paths)', parseLine('node C:\\lab\\a.mjs')[1] === 'C:\\lab\\a.mjs');
check('shell signs are only letters', JSON.stringify(parseLine('node a.mjs ; rm -rf x && y | z')) === JSON.stringify(['node', 'a.mjs', ';', 'rm', '-rf', 'x', '&&', 'y', '|', 'z']));
check('an empty quoted word is kept', parseLine('a "" b').length === 3);
check('an open quote, two lines or a very long line is refused', throws(() => parseLine('a "b'), /quote/) && throws(() => parseLine('a\nb'), /One line/) && throws(() => parseLine('x'.repeat(1001)), /too long/));

// ---- which readout a line goes to ----
check('a brain server\'s own lines are always the server', channelOf('anything at all', 'server') === 'server');
check('the Forge\'s renting, door and download lines are the server', ['10:00:01 rented A40: pod abc123, $0.44/h, in EU', '10:01:00 waiting for the pod door at https://x', '10:05:00 downloaded bobs/20Bob/model.gguf -> C:/x'].every((l) => channelOf(l, 'forge') === 'server'));
check('the card\'s own training lines are the model', channelOf('  step 120/900 loss 1.234', 'forge') === 'model' && channelOf('  heal: epoch 1', 'forge') === 'model');
check('a script\'s plain lines are the tool, its scores the model', channelOf('wrote 40 files', 'tool') === 'tool' && channelOf('score 71 of 100', 'tool') === 'model');

// ---- what reaches a script ----
const env = cleanEnv({ PATH: '/bin', RUNPOD_API_KEY: 'x', HF_TOKEN: 'y', MY_SECRET: 'z', DB_PASSWORD: 'p', HOME: '/h', OPENAI_API_KEY: 'k' }, { LAB_URL: 'http://127.0.0.1:1' });
check('no key, token, secret or password reaches a script', !('RUNPOD_API_KEY' in env) && !('HF_TOKEN' in env) && !('MY_SECRET' in env) && !('DB_PASSWORD' in env) && !('OPENAI_API_KEY' in env) && env.PATH === '/bin' && env.LAB_URL);

// ---- what a command may run ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob lab console-')); // a space in the path on purpose
const dir = path.join(tmp, 'model-lab'); fs.mkdirSync(path.join(dir, 'forge'), { recursive: true }); fs.mkdirSync(path.join(dir, 'out', 'forge'), { recursive: true });
fs.writeFileSync(path.join(dir, 'forge', 'forge.mjs'), "console.log('forge ' + process.argv.slice(2).join(' ') + ' key ' + (Object.keys(process.env).some((k) => /RUNPOD/.test(k)) ? 'yes' : 'no'));\n");
fs.writeFileSync(path.join(dir, 'echo.mjs'), [
  "console.log('hello from echo ' + process.argv.slice(2).join(' '));",
  "console.log('key ' + (Object.keys(process.env).some((k) => /KEY|TOKEN/.test(k)) ? 'leaked' : 'none') + ' url ' + (process.env.LAB_URL || 'none'));",
  "process.stdout.write('Type something: ');",
  "process.stdin.once('data', (d) => { console.log('got ' + String(d).trim()); process.exit(0); });"
].join('\n'));
fs.writeFileSync(path.join(dir, 'sleep.mjs'), "console.log('sleeping'); setInterval(() => {}, 1000);\n");
fs.writeFileSync(path.join(dir, 'renter.mjs'), "const k = process.env.RUNPOD_API_KEY; fetch('https://rest.runpod.io/v1/pods');\n");
fs.writeFileSync(path.join(dir, 'check.py'), 'print(1)\n');
const cc = (line, o = {}) => checkCommand(parseLine(line), { dir, ...o });
check('node runs a model-lab script, as a word list', (() => { const c = cc('node echo.mjs --x 1'); return c.args[0] === path.join(dir, 'echo.mjs') && c.args[1] === '--x' && c.cwd === dir && !c.forge; })());
check('a script outside model-lab is refused', throws(() => cc('node ../outside.mjs'), /Only scripts in the model-lab/) && throws(() => cc(`node ${path.join(tmp, 'x.mjs')}`), /Only scripts in the model-lab/));
check('a missing script, or the wrong kind, says so', throws(() => cc('node nope.mjs'), /isn't in the model-lab/) && throws(() => cc('node check.py'), /isn't a/));
check('a script that can rent a card is refused', throws(() => cc('node renter.mjs'), /can rent a card/));
check('forge.mjs by its path is refused: the Forge has its own word', throws(() => cc('node forge/forge.mjs --plan p.json'), /never rents from here/));
check('python runs python on Windows, python3 elsewhere', cc('python check.py', { platform: 'win32' }).exe === 'python' && cc('python check.py', { platform: 'linux' }).exe === 'python3');
check('forge --status and --places run, on the server side, with the key', (() => { const a = cc('forge --status'), b = cc('forge --places A40'); return a.forge && a.ch === 'server' && a.args.at(-1) === '--status' && b.args.includes('A40'); })());
check('forge --kill needs the pod\'s own id', throws(() => cc('forge --kill'), /bare --kill would delete every Forge card/) && throws(() => cc('forge --kill ../x'), /isn't a pod id/) && cc('forge --kill abc123def').args.join(' ').endsWith('--kill abc123def'));
check('forge never rents or restarts from the command line', ['forge --plan p.json', 'forge --resume abc123 --plan p.json', 'forge --restart abc123', 'forge --send-token abc123', 'forge --drop-volume v1', 'forge'].every((l) => throws(() => cc(l), /purchase card/)));
check('{url} is the relay, and needs a server loaded', throws(() => cc('node echo.mjs --url {url}'), /\{url\} is the server loaded here/) && cc('node echo.mjs --url {url}', { url: 'http://127.0.0.1:9' }).args.includes('http://127.0.0.1:9'));
check('any other first word is refused', throws(() => cc('cmd /c dir'), /isn't a command here/) && throws(() => cc('powershell -c x'), /isn't a command here/) && throws(() => cc('bash -c x'), /isn't a command here/));

// ---- stopping everything a command started ----
{
  const calls = []; const fake = (cmd, args) => { calls.push([cmd, ...args]); return { on() {} }; };
  check('on Windows, Stop ends the whole tree (taskkill /T /F)', killTree(4321, { platform: 'win32', spawnFn: fake }) && calls[0].join(' ') === 'taskkill /pid 4321 /T /F');
  const killed = []; killTree(77, { platform: 'linux', kill: (pid, sig) => { killed.push([pid, sig]); } });
  check('elsewhere, Stop ends the process group', killed[0][0] === -77 && killed[0][1] === 'SIGTERM');
  check('pid 0 is never killed (that would be every process in the group)', !killTree(0, { platform: 'linux', kill: () => { throw new Error('no'); } }));
}
check('header values that are keys are hidden', (() => { const h = hideHeaders({ authorization: 'Bearer abc', 'x-forge-token': 't', 'content-type': 'application/json' }); return h.authorization === '[hidden]' && h['x-forge-token'] === '[hidden]' && h['content-type'] === 'application/json'; })());

// ---- a fake brain server on this computer ----
const got = [];
const brain = http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c; got.push({ url: req.url, body: b, auth: req.headers.authorization || '' });
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"status":"ok"}'); return; }
  const j = b ? JSON.parse(b) : {};
  if (j.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const w of ['Hel', 'lo ', 'there']) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`); await wait(5); }
    res.end('data: [DONE]\n\n'); return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: `answer to ${j.messages?.[0]?.content || ''}`, tool_calls: j.tools ? [{ function: { name: 'web_search', arguments: '{"q":"x"}' } }] : [] } }] }));
});
await new Promise((r) => brain.listen(0, '127.0.0.1', r));
const brainUrl = `http://127.0.0.1:${brain.address().port}`;

// ---- the console ----
const cfg = { dataDir: path.join(tmp, 'data'), agentDir: tmp, forgeDir: dir, labConsole: false };
let pre = null;
const fakeLab = {
  cfg, brains: () => [{ id: 'qwen3-4b', name: 'Qwen3 4B', gguf: path.join(tmp, 'q.gguf') }],
  tools: () => ({ server: { path: path.join(tmp, 'llama-server'), found: true } }),
  preflight: async ({ unload }) => (pre && !unload ? pre : null), forgeKeys: () => ({ RUNPOD_API_KEY: 'rk' }),
  forgeLive: () => null, forgeLiveFile: () => path.join(tmp, 'none.json'), saveSetting: (x) => Object.assign(cfg, x)
};
let started = null, stopped = 0;
const c = new LabConsole({ lab: fakeLab, startServerFn: async (o) => { started = o; o.log('llama-server -m q.gguf --fit on'); return { url: brainUrl, stop: () => { stopped++; }, where: 'card' }; } });
const text = (ch) => c.entries.filter((e) => !ch || e.ch === ch).map((e) => e.text + (e.nl ? '\n' : '')).join('');
const sendOk = async (side, t) => { try { return await c.send({ side, text: t }); } catch (e) { return { error: e.message }; } };

check('help works with the switch off, running does not', (await sendOk('server', 'help')).ok && text('server').includes('load <brain>') && /Let the Lab run commands here/.test((await sendOk('tool', 'node echo.mjs')).error || ''));
check('the switch starts off and turns on', c.allowed() === false && c.allow(true).allowed === true && cfg.labConsole === true);
check('the terminal\'s help lists its commands, scripts and stop too', HELP.server.some((l) => /hold on/.test(l)) && HELP.server.some((l) => /node <script/.test(l)) && HELP.server.some((l) => /stop .*never a rental/.test(l)));

// a command runs, shows its lines, takes typed input, and finishes
await sendOk('tool', 'node echo.mjs one');
await until(() => text('tool').includes('Type something:'));
check('a command\'s lines show as they come, a question waiting for an answer too', text('tool').includes('hello from echo one') && text('tool').includes('Type something:'));
check('no key reached the script', text('tool').includes('key none'));
check('one command at a time', throws(() => c.runCommand(['forge', '--status']), /One command at a time/));
await sendOk('tool', 'yes please');
await until(() => !c.job);
check('what you type goes to the running command', text('tool').includes('> yes please') && text('tool').includes('got yes please') && /Finished \(exit 0\)/.test(text('tool')));

// Stop ends it
await sendOk('tool', 'node sleep.mjs');
await until(() => text('tool').includes('sleeping'));
const s1 = await sendOk('tool', 'stop');
await until(() => !c.job, 6000);
check('Stop ends a running command', s1.stopped === true && c.job === null && /Stopped\./.test(text('tool')));

// the Forge's own word gets the key, and its lines go to the server side
await sendOk('server', 'pods');
await until(() => !c.job);
check('"pods" runs forge --status with the rental key, on the server side', /forge --status key yes/.test(text('server')));
check('"kill" without a pod id is refused', /Name the pod/.test((await sendOk('server', 'kill')).error || ''));

// loading a brain here
cfg.session = 'light';
check('Gaming blocks loading a brain', /Gaming is on/.test((await sendOk('server', 'load qwen')).error || ''));
cfg.session = 'normal'; pre = { needUnload: true, names: ['Bob brain'] };
check('Bob\'s brain on the card: load asks for --unload first', /--unload/.test((await sendOk('server', 'load qwen')).error || ''));
pre = null;
check('a brain nobody has is refused by name', /No brain here is called/.test((await sendOk('server', 'load nothing')).error || ''));
const ld = await sendOk('server', 'load qwen --ctx 16384');
check('load starts the Lab engine for the brain, with the context asked', ld.loaded === 'Qwen3 4B' && started.ctx === 16384 && started.gguf.endsWith('q.gguf') && c.view().server.state === 'up');
check('the server line shows the engine\'s command', text('server').includes('$ llama-server -m q.gguf'));
const relay = c.relay.url;
check('the relay starts with the brain, on this computer only', /^http:\/\/127\.0\.0\.1:\d+$/.test(relay));

// the relay: a tool's request and the reply, both on the record
const r1 = await fetch(relay + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer abcdefabcdef' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }], tools: [{}] }) });
const j1 = await r1.json();
check('a tool gets the server\'s real reply through the relay', j1.choices[0].message.content === 'answer to ping' && got.at(-1).auth === 'Bearer abcdefabcdef');
check('what was sent is on the record', /→ #\d+ POST \/v1\/chat\/completions from a tool \(with a key, hidden\)/.test(text('traffic')) && text('traffic').includes('"content": "ping"'));
check('what came back is on the record, and the key never shows', /← #\d+ 200/.test(text('traffic')) && text('traffic').includes('answer to ping') && !text().includes('abcdefabcdef'));
check('a tool\'s reply shows in the Chat, marked as to a tool, its tool calls too', (() => { const t = c.talk.find((x) => x.to); return t && t.text === 'answer to ping' && t.calls[0]?.name === 'web_search' && !t.live; })() && text('traffic').includes('[calls web_search({"q":"x"})]'));
check('the whole record is written to the traffic log', (() => { const f = fs.readdirSync(c.dir()).find((x) => x.startsWith('traffic-')); return f && fs.readFileSync(path.join(c.dir(), f), 'utf8').includes('"dir":"back"'); })());

// Hold each request: read it, fix it, send it
await sendOk('server', 'hold on');
const held = fetch(relay + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'wrong' }] }) }).then((r) => r.json());
await until(() => c.view().pending.length === 1);
const p1 = c.view().pending[0];
check('a held request waits, with its body shown', p1 && p1.method === 'POST' && JSON.parse(p1.body).messages[0].content === 'wrong' && !got.some((g) => g.body.includes('"wrong"')));
check('a fix that isn\'t JSON is refused', throws(() => c.decide(p1.id, { send: true, body: '{oops' }), /readable JSON/));
c.decide(p1.id, { send: true, body: JSON.stringify({ messages: [{ role: 'user', content: 'fixed' }] }) });
const hj = await held;
check('the fixed request is what the server got, and the tool its reply', hj.choices[0].message.content === 'answer to fixed' && got.at(-1).body.includes('fixed') && text('traffic').includes('sent as edited'));
const dropped = fetch(relay + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"messages":[]}' }).then((r) => r.status);
await until(() => c.view().pending.length === 1);
c.decide(c.view().pending[0].id, { send: false });
check('a dropped request never reaches the server', (await dropped) === 499 && /dropped/.test(text('traffic')));
await sendOk('server', 'hold off');

// the server side asks the server, through the relay
await sendOk('server', 'health');
check('"health" goes through the relay and shows both ways', /→ #\d+ GET \/health from you/.test(text('traffic')) && text('traffic').includes('"status": "ok"'));
check('post needs readable JSON', /readable JSON/.test((await sendOk('server', 'post /tokenize {bad')).error || ''));

// the Chat: Set up's dials go with each request, the reply streams into its turn
check('Set up keeps every number in its range, and the rest at the usual', (() => { const x = cleanSetup({ temperature: 9, top_k: -4, max_tokens: 'lots', tools: 'evil', think: 'yes' }); return x.temperature === 2 && x.top_k === 0 && x.max_tokens === 2048 && x.tools === 'none' && x.think === false && x.stream === true; })());
check('the request body carries the dials, and the seed only when set', (() => { const b = chatBody({ temperature: 0.2, seed: -1, system: 'S' }, [{ role: 'user', content: 'x' }]); const b2 = chatBody({ seed: 7 }, []); return b.temperature === 0.2 && !('seed' in b) && b.messages[0].role === 'system' && b2.seed === 7 && !('tools' in b); })());
c.saveSetup({ system: 'Be brief.', temperature: 0.3 });
check('Set up is saved for next time', JSON.parse(fs.readFileSync(path.join(c.dir(), 'setup.json'), 'utf8')).temperature === 0.3);
const rev0 = c.talkRev;
await sendOk('chat', 'hi');
await until(() => !c.reply);
const lastBrain = () => [...c.talk].reverse().find((x) => x.who === 'brain' && !x.to);
check('the Chat shows what you said and its streamed reply, and keeps the chat', c.talk.some((x) => x.who === 'you' && x.text === 'hi') && lastBrain()?.text === 'Hello there' && c.chat.messages.length === 2 && c.chat.messages[1].content === 'Hello there' && c.talkRev > rev0);
check('its instructions and dials went with it', (() => { const j = JSON.parse(got.at(-1).body); return j.messages[0].content === 'Be brief.' && j.temperature === 0.3 && j.stream === true; })());
check('the page gets the chat only when it changed', Array.isArray(c.view({ talk: -1 }).talk) && !('talk' in c.view({ talk: c.talkRev })));
// a tool call: the Chat never runs it; what you type next is the tool's answer, and it carries on
c.saveSetup({ stream: false, tools: 'practice' });
await sendOk('chat', 'weather in Paris?');
await until(() => !c.reply);
const call = lastBrain()?.calls?.[0];
check('a tool call shows as a card and waits for its answer', call?.name === 'web_search' && c.waitingCalls().length === 1 && JSON.parse(got.at(-1).body).tools.length === 4);
await sendOk('chat', 'sunny, 21 degrees');
await until(() => !c.reply);
check('the typed answer goes back as the tool\'s, and the brain carries on', (() => { const m = c.chat.messages; const t = m.find((x) => x.role === 'tool'); return t?.content === 'sunny, 21 degrees' && t.tool_call_id === call.id && m.some((x) => x.role === 'assistant' && x.tool_calls?.[0]?.function.name === 'web_search'); })() && JSON.parse(got.at(-1).body).messages.some((x) => x.role === 'tool'));
c.saveSetup({ stream: true, tools: 'none' });
c.newChat();
check('New chat starts again', c.talk.length === 0 && c.chat.messages.length === 0);

// a script gets {url} = the relay, and LAB_URL
await sendOk('tool', 'node echo.mjs {url}');
await until(() => text('tool').includes(`url ${relay}`));
check('a script gets the relay as {url} and LAB_URL', text('tool').includes(`hello from echo ${relay}`) && text('tool').includes(`url ${relay}`));
await sendOk('tool', 'x'); await until(() => !c.job);

// secrets never show, even when a script prints one
c.push('tool', `token=${'a1b2c3d4'.repeat(4)}`);
check('a printed key shape is hidden', text('tool').includes('[hidden]') && !text('tool').includes('a1b2c3d4a1b2c3d4'));

// buttons
check('a button needs a name and a command', throws(() => c.addButton({ label: '', line: 'x' }), /name/) && throws(() => c.addButton({ label: 'x', line: '' }), /command/));
c.addButton({ label: 'Health', side: 'server', line: 'health' });
const before = c.reqSeq; await c.pressButton(0);
check('a button runs its command on its side, and is kept', c.reqSeq === before + 1 && c.buttons()[0].label === 'Health' && fs.existsSync(c.buttonsFile()));
c.removeButton(0); check('a button can be removed', c.buttons().length === 0);

// target: a server somewhere else
check('a target is an https link, or http on this computer', /https link/.test((await sendOk('server', 'target http://example.com')).error || '') && (await sendOk('server', 'target https://abc-8001.proxy.example.net')).ok);
await sendOk('server', 'target off');

// unload
await sendOk('server', 'unload');
check('unload stops the brain loaded here', stopped === 1 && c.view().server.state === 'off');
check('with nothing loaded, the Chat says how to load one', /Load model locally/.test((await sendOk('chat', 'hello')).error || ''));

// logs written elsewhere: a Forge run started from a terminal shows here too
const flog = path.join(dir, 'out', 'forge', 'forge-2026-11-15T10-00-00.log');
fs.writeFileSync(flog, '10:00:01 rented A40: pod abc123, $0.44/h, in EU\n  step 10/900 loss 2.1\n');
c.view();
check('a Forge run started anywhere shows its lines, server and model apart', text('server').includes('rented A40') && text('model').includes('step 10/900 loss 2.1') && text('tool').includes('following Forge run'));
fs.appendFileSync(flog, '  step 20/900 loss 1.9\n'); c.view();
check('and keeps following it as it grows', text('model').includes('step 20/900 loss 1.9'));
check('"watch" lists other logs changed lately', (await sendOk('server', 'watch')).logs >= 1);

// the view for other devices: watch only, no paths, nothing held
c.push('tool', `wrote ${path.join(tmp, 'secret-folder', 'file.txt')}`);
const remote = c.view({ since: 0, remote: true });
// 1.5.236: Windows paths with spaces (written as strings, so Linux catches it too)
for (const [inp, want] of [
  ['C:\\Game Projects\\secret-folder\\file.txt', '…/file.txt'],
  ['C:\\Program Files\\Some App\\inner\\run.log done', '…/run.log done'],
  ['saved to D:\\a b\\c d\\x.gguf.', '…/x.gguf.'],
  ['/home/someone/secret-folder/file.txt', '…/file.txt'],
  ['"C:\\Users\\you\\My Lab\\out.json"', '"…/out.json"'],
]) check(`hidePaths hides every folder of ${JSON.stringify(inp)}`, hidePaths(inp).endsWith(want) && !/secret|Game Projects|Program|Some App|inner|a b|c d|someone|Users|My Lab/.test(hidePaths(inp)));
check('another device sees the readouts without folder paths', remote.lines.some((l) => l.text.includes('…/file.txt')) && !remote.lines.some((l) => l.text.includes('secret-folder')) && remote.relay === '' && remote.brains.length === 0);

// routes
const res = () => { const r = { code: 0, body: null }; return r; };
const sendFn = (r, code, body) => { r.code = code; r.body = body; };
const lab = { labConsole: () => c };
{
  const r = res(); await consoleRoute({ req: { method: 'POST' }, res: r, p: '/api/lab/console/send', isLocal: false, lab, body: async () => ({ side: 'tool', text: 'help' }), send: sendFn });
  check('another device can\'t send commands', r.code === 403);
  const r2 = res(); await consoleRoute({ req: { method: 'GET', url: '/api/lab/console?since=0' }, res: r2, p: '/api/lab/console', isLocal: false, lab, body: async () => ({}), send: sendFn });
  check('another device can watch', r2.code === 200 && Array.isArray(r2.body.lines) && r2.body.local === false);
  const r3 = res(); await consoleRoute({ req: { method: 'POST' }, res: r3, p: '/api/lab/console/send', isLocal: true, lab, body: async () => ({ side: 'tool', text: 'cmd /c dir' }), send: sendFn });
  check('a refused command answers in words, and shows in the terminal', r3.code === 400 && /isn't a command here/.test(r3.body.error) && text('server').includes("isn't a command here"));
  const r4 = res(); await consoleRoute({ req: { method: 'POST' }, res: r4, p: '/api/lab/console/send', isLocal: true, lab, body: async () => ({ side: 'chat', text: 'hello' }), send: sendFn });
  check('a Chat that can\'t ask says why in the Chat', r4.code === 400 && c.talk.at(-1).who === 'error' && /Load model locally/.test(c.talk.at(-1).text));
  const r5 = res(); await consoleRoute({ req: { method: 'GET', url: '/api/lab/console/choices' }, res: r5, p: '/api/lab/console/choices', isLocal: false, lab, body: async () => ({}), send: sendFn });
  check('another device gets no brains, engines or plans', r5.code === 200 && r5.body.brains.length === 0 && r5.body.rental.brains.length === 0);
}

// the switch: off by default, in settings, safe start and backups
check('the switch is a setting, off unless switched on', /'labConsole'/.test(read('src/config.js')) && /out\.labConsole = out\.labConsole === true/.test(read('src/config.js')));
check('safe start and restored backups turn it off', /'labConsole'/.test(read('src/crash-catch.js')) && /out\.labConsole = false/.test(read('src/backup.js')));

// the page: one window, two sides, each with its own input; theme colours only
const pg = read('public/lab-console.js'), css = read('public/style.css'), lcCss = css.split('\n').filter((l) => /^\.lc|lc-/.test(l)).join('\n');
check('three panels, any on either side: Server, Chat, Set up', /\['server', 'Server'\], \['chat', 'Chat'\], \['setup', 'Set up'\]/.test(pg) && /data-lcslot/.test(pg) && /if \(ui\[other\] === b\.value\) ui\[other\] = ui\[side\]/.test(pg));
check('server on the left and chat on the right to start', /pick\('left', 'server'/.test(pg) && /pick\('right', 'chat'/.test(pg));
check('either side alone, or one side wider', /'leftonly'/.test(pg) && /'rightonly'/.test(pg) && /\.lc-win\[data-size="left"\]/.test(css) && /\.lc-win\[data-size="leftonly"\]/.test(css) && /data-lconly/.test(pg));
check('only the Server panel is a terminal; the Chat is a chat', /role="log" aria-live="off" aria-label="Server readout"/.test(pg) && /class="lc-msg lc-you"/.test(pg) && /lc-in-chat/.test(pg) && /<details class="lc-think"/.test(pg));
check('Set up has sliders, tick boxes and Lab jobs', /type="range"/.test(pg) && /data-lctick/.test(pg) && /data-lcjobrun/.test(pg) && /id: 'sweep'/.test(read('public/lab-console-jobs.js')) && /data-lcpage/.test(pg));
check('LOAD MODEL LOCALLY and OPEN RENTAL each open a window to set them up', /data-lcopen="local"/.test(pg) && /data-lcopen="rental"/.test(pg) && /showModal\(\)/.test(pg) && /Rent it and start/.test(pg));
check('a clear STOP, and END RENTAL only while a rental is up, both asked first when it matters', /lc-stopall" data-lcstopall/.test(pg) && /v\?\.rental \? `<button type="button" class="lc-big lc-endrent"/.test(pg) && /ask === 'end'/.test(pg) && /ask === 'stop'/.test(pg));
check('the server panel shows its log, the requests and replies, the scripts, each on or off', /toggleChip\('server', 'Server log'\)/.test(pg) && /toggleChip\('traffic', 'Requests and replies'\)/.test(pg) && /toggleChip\('scripts', 'Scripts'\)/.test(pg));
check('a held request can be edited, sent or dropped on the page', /lc-held-body/.test(pg) && /data-lcdecide/.test(pg));
check('buttons can be edited before they run', /data-lcedit/.test(pg));
check('the console uses the theme\'s colours only', lcCss.length > 500 && !/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/.test(lcCss));
check('the Forge tab places the console and fills it after a redraw', /con\.html\(\)/.test(read('public/lab-forge.js')) && /fg\.mounted\(\)/.test(read('public/lab.js')));
check('the Lab page leaves the console\'s events, and its set-up window\'s, to it', (read('public/lab.js').match(/closest\??\.?\(['"]#lab-console, #lc-dialog['"]\)/g) || []).length >= 3);

// Help, glossary, FAQ
const help = read('public/help-content.js');
check('Help explains the console in Bob\'s voice', /id: 'lab-console'/.test(help) && /Hold each request/.test(help));
check('the glossary has the console, the relay and Hold each request', ['<dt>Console (Lab)', '<dt>Relay (Lab console)', '<dt>Hold each request'].every((w) => help.includes(w)));
check('there is an FAQ on where a run\'s output went', /id: 'faq-lab-console'/.test(help));

// STOP stops what runs here and never ends a rental; END RENTAL is the Forge's own stop, by its pod
{
  const did = [];
  Object.assign(fakeLab, { stepStop: () => { did.push('step'); return { stopped: true }; }, protocolStop: () => ({ stopped: false }), forgeHalt: () => { did.push('halt'); return { halted: true, pod: true }; }, forgeStop: async () => { did.push('end'); return { stopped: true, pod: true }; } });
  const r = c.stopHere();
  check('STOP stops the Lab step and the Forge here, and says the card is still up', r.stopped.includes('the Lab step') && r.stopped.includes('the Forge run') && r.cardUp && did.join() === 'step,halt' && /still up, and costs money/.test(text('server')));
  check('STOP never ends a rental', !did.includes('end'));
  fs.writeFileSync(c.doorFile(), JSON.stringify({ url: 'http://127.0.0.1:5999', name: '28Bob', pid: process.pid }));
  check('a rented brain\'s door is used when nothing is loaded here', c.door()?.name === '28Bob' && c.targetUrl() === 'http://127.0.0.1:5999');
  const e = await c.endRental();
  check('END RENTAL ends it the Forge\'s way, and closes the door', e.pod && did.at(-1) === 'end' && !fs.existsSync(c.doorFile()) && c.targetUrl() === '');
  fs.writeFileSync(c.doorFile(), JSON.stringify({ url: 'http://example.com:80', name: 'x', pid: process.pid }));
  check('a door that isn\'t on this computer is never used', c.door() === null);
  fs.writeFileSync(c.doorFile(), JSON.stringify({ url: 'http://127.0.0.1:5999', name: 'x', pid: 99999999 }));
  check('a door whose script ended is put away', c.door() === null && !fs.existsSync(c.doorFile()));
}
// Open rental: the window's choices become a benchmark-only Forge plan whose one command is the door
{
  const pd = path.join(dir, 'forge', 'plans'); fs.mkdirSync(pd, { recursive: true });
  fs.writeFileSync(path.join(pd, 'bench-bobert.json'), JSON.stringify({ run: 'bench-bobert', benchmark_only: true, teacher: 'T', lessons: 'out/lessons', gpus: ['NVIDIA A40', 'NVIDIA RTX A6000'], step_up: ['NVIDIA H100 80GB HBM3'], disk_gb: 80, rungs: [], hours_max: 4, dollars_max: 12, benchmark: { models: [{ name: '35Bob', nickname: 'Bobert', file: 'hf:MouseWurX/35Bob-Bobert:35Bob-Q4_K_M.gguf' }], commands: ['node experts-test.mjs --url {{url}}'] } }));
  fs.writeFileSync(path.join(pd, 'riker-x.json'), JSON.stringify({ run: 'riker-x', gpus: ['NVIDIA A40'], hours_max: 2, dollars_max: 1.5, llama_tag: 'b1', benchmark: { brain_engine: { ref: 'abc', patches: ['0001-expert-mask', 'pod:0015-act-dump'] }, models: [] } }));
  const ch = rentalChoices(dir);
  check('the window offers the brains, cards and engines the Forge already used', ch.brains[0]?.nickname === 'Bobert' && ch.cards.includes('NVIDIA H100 80GB HBM3') && ch.usual.join() === 'NVIDIA A40,NVIDIA RTX A6000' && ch.engines.map((x) => x.id).join() === 'brainengine,plain' && ch.plans.length === 2);
  const lp = path.join(tmp, 'lab-plans'), door = path.join(tmp, 'door dir', 'rental-door.json');
  const bad = makeRentalPlan({ brain: 'https://x', cards: [], hours: 0, dollars: 900 }, { dir, door, labPlans: lp });
  check('no brain, no card or no caps: no plan', bad.problems.length >= 3 && !fs.existsSync(path.join(lp, 'console-rental.json')) && bad.problems.some((x) => /lab-door\.mjs/.test(x)));
  fs.writeFileSync(path.join(dir, 'lab-door.mjs'), '// stand-in\n');
  const ok = makeRentalPlan({ brain: 'hf:MouseWurX/35Bob-Bobert:35Bob-Q4_K_M.gguf', engine: 'brainengine', cards: ['NVIDIA A40', 'bad<card>'], ctx: 16384, slots: 2, hours: 1.5, dollars: 3 }, { dir, door, labPlans: lp });
  const plan = JSON.parse(fs.readFileSync(path.join(lp, 'console-rental.json'), 'utf8'));
  check('a rental plan: one brain served, caps as typed, the door its one command', !ok.problems.length && plan.benchmark_only === true && plan.hours_max === 1.5 && plan.dollars_max === 3 && plan.gpus.join() === 'NVIDIA A40' && plan.benchmark.models[0].ctx === 16384 && plan.benchmark.commands.length === 1 && plan.benchmark.commands[0].startsWith('node lab-door.mjs --file "') && plan.benchmark.commands[0].includes('door dir'));
  check('Brain Engine on the card comes from a plan that used it, without the lab-only patches', plan.benchmark.brain_engine.ref === 'abc' && plan.benchmark.brain_engine.patches.join() === '0001-expert-mask' && plan.llama_tag === 'b1');
  check('the card never names a key', !/RUNPOD|API_KEY|TOKEN|"rk"/.test(JSON.stringify(plan)));
  makeRentalPlan({ kind: 'plan', plan: 'riker-x', hours: 1, dollars: 1 }, { dir, door, labPlans: lp });
  const p2 = JSON.parse(fs.readFileSync(path.join(lp, 'console-rental.json'), 'utf8'));
  check('one of the Forge\'s plans goes as it is, with the caps typed here', p2.run === 'riker-x' && p2.hours_max === 1 && p2.dollars_max === 1 && p2.benchmark.brain_engine.patches.length === 2);
  check('a Forge plan that isn\'t there is refused', makeRentalPlan({ kind: 'plan', plan: 'nope', hours: 1, dollars: 1 }, { dir, door, labPlans: lp }).problems.some((x) => /Pick one/.test(x)));
}
// Load model locally: the window's brain, engine, context and processor choice
{
  started = null;
  const lf = await c.loadForm({ brain: 'qwen3-4b', ctx: 4096, engine: '', cpuOk: false });
  check('Load model locally starts the brain with what the window said', lf.loaded === 'Qwen3 4B' && started.ctx === 4096 && started.cpuOk === false && c.setup.ctx === 4096);
  c.unload();
  check('a brain that isn\'t here, or an engine that isn\'t, is refused', throws(() => c.loadForm({ brain: 'nope' }), /Pick a brain/) && /engine isn't on this computer/.test(await c.loadForm({ brain: 'qwen3-4b', engine: 'llamacpp' }).then(() => '', (e) => e.message)));
}
check('the card\'s door script adds the key itself and answers only on this computer', (() => { const d = read('model-lab/lab-door.mjs'); return /authorization = `Bearer \$\{key\}`/.test(d) && /listen\(0, '127\.0\.0\.1'/.test(d) && /process\.env\.LAB_API_KEY/.test(d) && !/console\.log\([^)]*key\b/.test(d); })());
check('STOP on the Forge stops it here and leaves the card; END RENTAL kills only its pod', (() => { const f = read('src/lab-forge-jobs.js'); return /forgeHalt\(\)/.test(f) && /halted: Boolean\(pod\), podLeft: pod/.test(f) && /'--kill', pod\]/.test(f); })());

// ---- 15 Nov stage 2: the whole Lab in Set up, Bob's own brain, Lab jobs followed, rentals taken over or ended ----
{
  const J = await import('../public/lab-console-jobs.js');
  const routes = read('src/lab-routes.js') + read('src/lab-console.js');
  const L = { lab: { brains: [{ id: 'a', name: 'A', facts: { experts: 128, used: 8, fullSize: true } }, { id: 'b', name: 'B', facts: { experts: 0, fullSize: false } }], lessonSets: [{ id: 's', name: 'S', count: 3 }], lessonSkills: [{ id: 'tools', label: 'Tools' }], packs: [{ id: 'quiz', title: 'Quick quiz' }], myPacks: [], types: ['Q4_K_M'], ladderSteps: [{ type: 'Q4_K_M', label: 'Q4' }], mixWays: [{ id: 'slerp', label: 'Smooth' }], layerChoices: [{ id: 'strongest', label: 'Strongest' }] }, forge: { plans: [{ id: 'p1', rungs: ['24Bob'] }], brains: [{ name: '28Bob' }], lessonSets: [] }, proto: { pairs: [] } };
  check('every Set up job is in a section, and every section has jobs', J.JOBS.every((j) => J.GROUPS.some(([g]) => g === j.group)) && J.GROUPS.every(([g]) => J.JOBS.some((j) => j.group === g)));
  const urls = J.JOBS.flatMap((j) => { const f = Object.fromEntries(j.fields.map((fd) => [fd.k, J.fieldDefault(fd, L)])); return [j.check?.call(j, f), j.run.call(j, f), j.alt?.req(f)].filter(Boolean).map(([u]) => u); });
  check('every Set up job calls a Lab route that is really there', urls.length > 20 && urls.every((u) => routes.includes(`'${u}'`)), urls.filter((u) => !routes.includes(`'${u}'`)).join(' '));
  check('the forms cover the whole Lab: lessons, cuts, mixes, stacking, refusals, benchmarks, dials and rented runs', ['write', 'mistakes', 'cut', 'ladder', 'mix', 'stack', 'refusals', 'challenge', 'sweep', 'forge', 'clean', 'pairs'].every((id) => J.JOBS.some((j) => j.id === id)));
  check('a rented run only saves its plan; the purchase card starts it', J.JOBS.filter((j) => j.group === 'rent').every((j) => j.rented && j.run({})[0] === '/api/lab/forge/save') && !J.JOBS.some((j) => /forge\/start/.test(String(j.run))));
  check('brains to make are read from "name:keep" and cover', JSON.stringify(J.parseRungs('24Bob:128, 20Bob:cover').map((r) => [r.name, r.how, r.keep])) === JSON.stringify([['24Bob', 'number', 128], ['20Bob', 'cover', 0]]) && J.parseRungs('a:1,b:2,c:3,d:4,e:5').length === 4);
  check('layers to stack are read from "a 0-23, b 8-31"', JSON.stringify(J.parseRanges('a 0-23, b 8-31, 3-4')) === JSON.stringify([{ brain: 'a', start: 0, end: 23 }, { brain: 'b', start: 8, end: 31 }, { brain: 'a', start: 3, end: 4 }]) && J.parseRanges('x').every((r) => r.start === -1));
  const rec = J.recipeOf({ name: 'N', from: 'a', how: 'cover', keep: 96, cover: '0.99', fold: true, set: 's', files: ['Q4_K_M'], compare: true });
  check('the cut form makes the Make a brain page\'s recipe', rec.smaller.cut.how === 'cover' && rec.smaller.cut.keep === 96 && rec.smaller.cut.cover === 0.99 && rec.smaller.cut.fold === true && rec.lessons.kind === 'set' && rec.smaller.files[0] === 'Q4_K_M' && J.recipeOf({ how: 'none' }).smaller.cut === null);
  const cutJob = J.JOBS.find((j) => j.id === 'cut'), cf = { from: 'a' }; cutJob.onChange('from', cf, L);
  check('picking a brain to cut starts at three quarters of its experts, and names it', cf.keep === 96 && cf.name === 'A Lab');
  check('full-size-only fields list only full-size brains', J.brainsOf(L, 'full').map((b) => b.id).join() === 'a' && J.brainsOf(L).length === 2);
  const { makeForgePlan } = await import('../src/lab-forge.js');
  const fp = makeForgePlan(J.forgeFormOf({ run: 'try one', rungs: '24Bob:128', quants: ['Q4_K_M', 'Q5_K_M'], experts: 'full', epochs: 2, pref: 'off', grpo: true, grpoHours: 2, hours: 30, dollars: 20 }), { base: {} });
  check('the rented-run form makes a Forge plan the Forge reads', fp.plan.rungs[0].keep === 128 && fp.plan.quants === 'Q4_K_M,Q5_K_M' && fp.plan.heal.experts === 'full' && fp.plan.heal.epochs === 2 && fp.plan.grpo.hours === 2 && fp.plan.hours_max === 30 && fp.plan.dollars_max === 20, JSON.stringify(fp.problems));
  check('the plan\'s own brain stays when none is picked', !('brain' in J.forgeFormOf({})) && J.forgeFormOf({ brain: 'forge:28Bob' }).brain.pick === 'forge:28Bob');
  const pg2 = read('public/lab-console.js');
  check('Set up has Pipelines and Rented cards, and a way to refresh its lists', /sec\('pipes', 'Pipelines'/.test(pg2) && /sec\('cards', 'Rented cards'/.test(pg2) && /data-lclists/.test(pg2));
  check('Take over and End it each ask first', /data-lcrenttakego/.test(pg2) && /data-lcrentendgo/.test(pg2) && /rentAsk = \{ kind: 'take'/.test(pg2) && /rentAsk = \{ kind: 'end'/.test(pg2));
  check('a job that needs the card says to tick Unload, never unloads by itself', /r\?\.needUnload/.test(pg2) && J.JOBS.filter((j) => j.fields.some((fd) => fd.k === 'unload')).every((j) => j.fields.find((fd) => fd.k === 'unload').d === false));

  // Bob's own brain
  const bobLab = { ...fakeLab, brain: { engine: { url: brainUrl + '/', current: 'qwen3-4b', child: { exitCode: null } }, brainLabel: () => 'Qwen3 4B' } };
  const cb = new LabConsole({ lab: bobLab });
  cfg.labConsole = true;
  const ub = await cb.useBob(true);
  check('Use Bob\'s brain points the Chat and tools at the brain Bob has loaded', ub.bob && cb.targetUrl() === brainUrl && /Bob's brain, Qwen3 4B/.test(cb.view().target) && cb.view().bob.on);
  bobLab.brain.engine.current = '';
  check('when Bob\'s brain unloads, the console says so instead of sending anywhere', cb.targetUrl() === '' && /not loaded now/.test(cb.view().target) && /no brain loaded/.test(cb.view().bob.why));
  check('Bob\'s brain can\'t be picked while he has none loaded', await cb.useBob(true).then(() => false, (e) => /no brain loaded/.test(e.message)));
  bobLab.brain.engine = { url: 'https://far.example', current: 'x' };
  check('a brain on another engine is never reached', cb.bobBrain().url === '' && /another engine/.test(cb.bobBrain().why));
  await cb.useBob(false); cb.stopAll();

  // a Lab job's log and its steps, followed
  const jdir = path.join(cfg.dataDir, 'lab', 'models', 'cut-one'); fs.mkdirSync(jdir, { recursive: true });
  const run = { id: 'lab-1', name: 'Cut one', at: Date.now(), stepLabel: 'Count the experts' };
  const jobLab = { ...fakeLab, job: { run }, runs: [run] };
  const cj = new LabConsole({ lab: jobLab });
  fs.writeFileSync(path.join(jdir, 'lab.log'), 'counting experts 10%\n');
  cj.follow(); run.stepLabel = 'Cut'; fs.appendFileSync(path.join(jdir, 'lab.log'), 'cutting layer 3\n'); cj.follow();
  jobLab.job = null; run.state = 'done'; cj.follow();
  const jt = cj.entries.map((e) => e.text).join('\n');
  check('a Lab job\'s own log shows in the Server panel', /following Lab job Cut one/.test(jt) && /counting experts 10%/.test(jt) && /cutting layer 3/.test(jt));
  check('each step a Lab job moves to, and how it ended, shows as a line', /Lab job Cut one: Count the experts/.test(jt) && /Lab job Cut one: Cut/.test(jt) && /Lab job Cut one: done\./.test(jt));
  cj.stopAll();

  // rentals: what the Forge knows, read without its tokens
  const { podRecords, findRunPlan, parseForgeStatus, forgeWatching } = await import('../src/lab-forge.js');
  const fo = path.join(dir, 'out', 'forge');
  fs.writeFileSync(path.join(fo, 'pod-token-riker-interp.json'), JSON.stringify({ pod: 'abc123def456', token: 'SECRET-TOKEN', started: 1000, price: 0.44, run: 'riker-interp', gpu: 'NVIDIA A40' }));
  fs.writeFileSync(path.join(fo, 'pod-token-local.json'), JSON.stringify({ pod: 'local', token: 't' }));
  const recs = podRecords(dir);
  check('the pod records are read without their tokens, and a local run is left out', recs.length === 1 && recs[0].run === 'riker-interp' && !JSON.stringify(recs).includes('SECRET'));
  const plansHere = path.join(dir, 'forge', 'plans'); fs.mkdirSync(plansHere, { recursive: true });
  fs.writeFileSync(path.join(plansHere, 'riker-interp.json'), JSON.stringify({ run: 'riker-interp', hours_max: 2, dollars_max: 1.5, rungs: [] }));
  fs.writeFileSync(path.join(plansHere, 'other.json'), JSON.stringify({ run: 'other', hours_max: 1, dollars_max: 1 }));
  const fr = findRunPlan('riker-interp', [path.join(tmp, 'nope'), plansHere]);
  check('a run\'s plan is found by its run name', fr && fr.hours === 2 && fr.dollars === 1.5 && path.basename(fr.file) === 'riker-interp.json' && findRunPlan('none', [plansHere]) === null);
  check('the Forge\'s pod list is read line by line', parseForgeStatus('10:00:00 abc123def456 bob-forge-x RUNNING NVIDIA A40 $0.44/h\n10:00:00 no pods\n10:00:00 zz9zz9zz9zz9 mine EXITED  $0.1/h').map((p) => [p.pod, p.forge, p.gpu]).join('|') === 'abc123def456,true,NVIDIA A40|zz9zz9zz9zz9,false,');
  const tl = path.join(fo, 'forge-2026-11-15T10-00-00.log'); fs.writeFileSync(tl, 'x\n');
  check('a Forge window that wrote in the last two minutes counts as still watching; an old one doesn\'t', forgeWatching(dir, Date.now()) > 0 && forgeWatching(dir, Date.now() + 5 * 60e3) === 0);
  fs.utimesSync(tl, new Date(Date.now() - 10 * 60e3), new Date(Date.now() - 10 * 60e3));

  // Take over and End it, with a fake Forge (nothing is rented or ended)
  const { forgeJobs } = await import('../src/lab-forge-jobs.js');
  const spawned = [];
  const fakeSpawn = (cmd, args, opts) => {
    spawned.push(args.slice(1));
    const ev = {}, out = args.includes('--status') ? '10:00:00 abc123def456 bob-forge-riker RUNNING NVIDIA A40 $0.44/h\n10:00:00 ccc111ccc111 bob-forge-gone RUNNING NVIDIA A40 $0.44/h\n' : args.includes('--kill') ? '10:00:01 deleted ccc111ccc111\n' : '';
    const c = { pid: 4242, stdout: { on: (e, fn) => { if (e === 'data' && out) setTimeout(() => fn(out), 1); } }, stderr: { on: () => {} }, on: (e, fn) => { ev[e] = fn; if (e === 'exit') setTimeout(() => fn(0), 5); }, unref: () => {} };
    return c;
  };
  const fcfg = { ...cfg, labForgeStart: true };
  const flab = Object.assign(Object.create(null), forgeJobs, { cfg: fcfg, now: () => Date.now(), forgeSpawn: fakeSpawn, forgeKeys: () => ({ RUNPOD_API_KEY: 'rk' }), forgeLiveFile: () => path.join(cfg.dataDir, 'lab', 'forge-live.json'), forgeAlive: (pid) => pid === 4242 });
  fs.mkdirSync(path.join(cfg.dataDir, 'lab'), { recursive: true });
  await wait(1100); // the window's log was made before the look (logs made by the look itself are the console's own)
  const look = await flab.forgeLook();
  const rk = look.pods.find((p) => p.pod === 'abc123def456'), gone = look.pods.find((p) => p.pod === 'ccc111ccc111');
  check('Look for rented cards lists the Forge\'s cards with their runs, and only reads', look.pods.length === 2 && rk.run === 'riker-interp' && rk.canTake && rk.plan.hours === 2 && !rk.plan.file && spawned.at(-1).join(' ') === '--status');
  check('a card this computer has no record of can only be ended', gone && !gone.canTake && /only be ended/.test(gone.why));
  check('Take over needs the caps the list showed', throws(() => flab.forgeResume({ pod: 'abc123def456', hours: 3, dollars: 1.5 }), /caps changed/));
  check('Take over is refused while a Forge window may still be watching', (() => { fs.utimesSync(tl, new Date(), new Date()); const r = throws(() => flab.forgeResume({ pod: 'abc123def456', hours: 2, dollars: 1.5 }), /may still be watching/); fs.utimesSync(tl, new Date(Date.now() - 10 * 60e3), new Date(Date.now() - 10 * 60e3)); return r; })());
  check('Take over is refused with "Let the Lab start Forge runs" off', (() => { fcfg.labForgeStart = false; const r = throws(() => flab.forgeResume({ pod: 'abc123def456', hours: 2, dollars: 1.5 }), /Starting Forge runs from the Lab is off/); fcfg.labForgeStart = true; return r; })());
  const tk = flab.forgeResume({ pod: 'abc123def456', hours: 2, dollars: 1.5 });
  const live = JSON.parse(fs.readFileSync(flab.forgeLiveFile(), 'utf8'));
  check('Take over carries on watching that card (--resume <pod>), never rents', tk.started && spawned.at(-1).slice(0, 2).join(' ') === '--resume abc123def456' && spawned.at(-1).includes('--plan') && !spawned.some((a) => a.includes('--yes')) && live.pod === 'abc123def456' && live.resumed && live.hours === 2);
  check('a taken-over card shows as the console\'s rental, and a second take over is refused', flab.forgeLive().running && throws(() => flab.forgeResume({ pod: 'abc123def456', hours: 2, dollars: 1.5 }), /already going/));
  const ended = await flab.forgeEndPod({ pod: 'ccc111ccc111' });
  check('End it deletes only that card, by its id', ended.ended && spawned.at(-1).join(' ') === '--kill ccc111ccc111' && !spawned.some((a) => a.length === 1 && a[0] === '--kill'));
  flab.forgeKill = () => {}; await flab.forgeStop();
  check('END RENTAL on a taken-over card names its own pod', spawned.at(-1).join(' ') === '--kill abc123def456');
  check('a card not in the last look can\'t be ended or taken over', await flab.forgeEndPod({ pod: 'zzz999zzz999' }).then(() => false, (e) => /isn't in the list/.test(e.message)));
  for (const f of fs.readdirSync(fo)) if (/^pod-token|^forge-/.test(f)) fs.unlinkSync(path.join(fo, f));
}

c.stopAll(); brain.close();
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
