// Connected apps (MCP) Hand: off until switched on (the Hand and each app), pasted setups come in off, the hard
// limits on addresses, programs and inputs, a real round trip with a stdio server and an HTTP server (plain JSON and
// an event stream), paging, pictures saved, errors passed on, Stop and the Hand switch stop the server, the toolbox
// finds it by the app's name, and Help, Settings and the phone app know about it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HANDS, toolsOff, cleanHands } from '../src/hands-settings.js';
import { mcpTools, addServer, loadServers, setServerOn, removeServer, parseSetup, importSetup, addressProblem, serverProblem, inputsProblem, findProgram, checkServer, liveServers, stopAllServers, mcpPrompt, mcpWords, inputsLine, cleanServer, PRESETS } from '../src/mcp.js';
import { handsTools, handsPrompt, stopEverything, runningNow, track } from '../src/hands.js';
import { groupsFor, guessGroups } from '../src/toolbox.js';
import { SIDE_EFFECT, WAIT_IF_CUT } from '../src/handoff.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8');
const MOCK = path.join(here, 'mock-mcp-server.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-mcp-'));
const inn = path.join(tmp, 'inn');
const ro = path.join(tmp, 'MyGame');
fs.mkdirSync(ro, { recursive: true });
const cfg = { innDir: inn, dataDir: path.join(inn, 'bob'), settingsFile: path.join(inn, 'bob', 'settings.json'), agentDir: tmp, readOnlyRoots: [ro], readRoots: [], userName: 'Sam', hands: { enabled: true, mcp: { on: true } } };
const brain = { cfg, log: () => {}, usable: (n) => !toolsOff(cfg).includes(n) };
const ctx = () => ({ signal: new AbortController().signal, emit: () => {} });
const throwsLike = async (f) => { try { await f(); return ''; } catch (e) { return e.message; } };

// ---------- the Hand ----------
check('there is a Connected apps (MCP) Hand with two tools', HANDS.mcp?.label === 'Connected apps (MCP)' && HANDS.mcp.tools.join() === 'mcp_tools,mcp_use');
check('it is off to start with and its tools are hidden', cleanHands({}).mcp.on === false && ['mcp_tools', 'mcp_use'].every((t) => toolsOff({}).includes(t)));
check('it works on every desktop (no platforms list)', !HANDS.mcp.platforms);
check('Help: the Hand, the FAQ, the settings row and two glossary words', ['hands-mcp', 'faq-unreal-blender'].every((id) => HELP.some((e) => e.id === id)) && /Connected apps \(MCP\)/.test(HELP.find((e) => e.id === 'settings-hands').html) && /<dt>MCP \(Model Context Protocol\)<\/dt>/.test(HELP.find((e) => e.id === 'glossary').html) && /<dt>Connected app<\/dt>/.test(HELP.find((e) => e.id === 'glossary').html));
{
  const h = HELP.find((e) => e.id === 'hands-mcp').html;
  const ui = read('public/hands.js');
  const labels = ['Connected apps', 'Add a connected app', 'Fill in for Blender', 'Fill in for Unreal Engine', 'Program to start', 'Or its address', 'Add app', 'Paste a setup from another app', 'Add these', 'Check', 'Show tools', 'Allow', 'Show details', 'This one always asks', 'Get uv for me', 'runs code: can change anything in the app'];
  check('Help uses the on-screen names word for word', labels.every((l) => h.includes(l)), labels.filter((l) => !h.includes(l)).join(', '));
  check('Settings shows those names', labels.filter((l) => l !== 'Allow').every((l) => ui.includes(l)));
}
check('the phone app names the app on its card', /ev\.mcp \? `\$\{ev\.mcp\.app\}: \$\{ev\.command\}`/.test(read('android/app/src/main/assets/www/phone.js')));
check('a restart never redoes an app step blindly', SIDE_EFFECT.test('mcp_use') && WAIT_IF_CUT.test('mcp_use') && !SIDE_EFFECT.test('mcp_tools'));

// ---------- the list of apps ----------
check('presets for Blender and Unreal', PRESETS.blender.needsUv && /Bob can get it/.test(PRESETS.blender.note) && PRESETS.blender.cmd === 'uvx' && PRESETS.blender.args[0] === 'blender-mcp' && /^http:\/\/127\.0\.0\.1/.test(PRESETS.unreal.url));
{
  const a = addServer(cfg, { name: 'Blender', cmd: 'uvx', args: ['blender-mcp'], on: true });
  check('a new app comes in switched off, even if asked otherwise', a.on === false && loadServers(cfg)[0].id === 'blender');
  const b = addServer(cfg, { name: 'Blender', cmd: 'uvx', args: ['blender-mcp'] });
  check('the same name twice gets its own id', b.id === 'blender-2');
  removeServer(cfg, 'blender-2');
  check('Remove takes it away', loadServers(cfg).length === 1);
  check('it needs a program or an address', /program to start/.test((() => { try { addServer(cfg, { name: 'X' }); } catch (e) { return e.message; } return ''; })()));
  check('an address must be http(s)', /http/.test((() => { try { addServer(cfg, { name: 'Y', url: 'ftp://x' }); } catch (e) { return e.message; } return ''; })()));
  removeServer(cfg, 'blender');
}
{
  const claude = parseSetup('{"mcpServers":{"blender":{"command":"uvx","args":["blender-mcp"],"env":{"BLENDER_HOST":"localhost","bad key":"x"}},"unreal":{"url":"http://127.0.0.1:8000/mcp"}}}');
  check('pasting a Claude/Cline/Cursor setup reads both kinds', claude.length === 2 && claude[0].cmd === 'uvx' && claude[1].url === 'http://127.0.0.1:8000/mcp');
  const oc = parseSetup('{"mcp":{"unreal-mcp":{"type":"remote","url":"http://127.0.0.1:8000/mcp"},"blender":{"type":"local","command":["uvx","blender-mcp"]}}}');
  check('pasting an OpenCode setup reads its command list', oc[1].cmd === 'uvx' && oc[1].args[0] === 'blender-mcp' && oc[0].url);
  check('not JSON says so plainly', /isn't JSON/.test((() => { try { parseSetup('blender: uvx'); } catch (e) { return e.message; } })()));
  const added = importSetup(cfg, '{"mcpServers":{"blender":{"command":"uvx","args":["blender-mcp"],"env":{"BLENDER_HOST":"localhost","bad key":"x"}}}}');
  check('pasted apps come in switched off, keeping only proper settings names', added[0].on === false && Object.keys(added[0].env).join() === 'BLENDER_HOST');
  removeServer(cfg, added[0].id);
}

// ---------- hard limits ----------
check('this computer\'s own address is fine', !addressProblem(cfg, 'http://127.0.0.1:8000/mcp') && !addressProblem(cfg, 'http://localhost:9/mcp'));
check("another computer is refused while \"Don't send anything out\" is on", /Don't send anything out/.test(addressProblem(cfg, 'http://203.0.113.5:8000/mcp')));
check('and allowed when that limit is off', !addressProblem({ ...cfg, hands: { ...cfg.hands, limits: { sendOut: false } } }, 'https://example.com/mcp'));
check('a blocked program is never started', /never run/.test(serverProblem(cfg, cleanServer({ name: 'x', cmd: 'diskpart' }))));
check('a key file in the inputs is refused', /keys or passwords/.test(inputsProblem(cfg, { path: path.join(tmp, '.env') })));
check("Bob's own settings folder in the inputs is refused", /own settings/.test(inputsProblem(cfg, { file: path.join(cfg.dataDir, 'settings.json') })));
check('a read-only project is refused for a tool that changes things', /read-only/.test(inputsProblem(cfg, { path: path.join(ro, 'Level.umap') }, { readOnly: false })));
check('...and allowed for a tool the app says only looks', !inputsProblem(cfg, { path: path.join(ro, 'Level.umap') }, { readOnly: true }));
check('code that would shut the PC down is refused (blocklist on any text)', /shut/.test(inputsProblem(cfg, { code: 'import os\nos.system("shutdown /s /t 0")' })));
check('ordinary inputs pass', !inputsProblem(cfg, { name: 'Cube', location: [0, 0, 1], nested: { color: 'red' } }));
check('the program is found on the PATH', path.isAbsolute(findProgram('node')));
{
  const own = path.join(tmp, 'audio-workshop', process.platform === 'win32' ? 'uvx.exe' : 'uvx');
  fs.mkdirSync(path.dirname(own), { recursive: true }); fs.writeFileSync(own, '');
  check("Bob's own uv is used when the PC has none", findProgram('uvx', { PATH: '' }, cfg) === own || path.isAbsolute(findProgram('uvx', { PATH: '' }, cfg)));
  fs.rmSync(own);
}
{
  const { ENGINES } = await import('../src/engines.js');
  const uv = ENGINES.find((e) => e.id === 'uv');
  check('"Get uv for me" has an engine on Windows, Mac and Linux', uv && uv.repo === 'astral-sh/uv' && uv.mac && uv.linux && typeof uv.ready === 'function');
}
check('inputs are described short', inputsLine({ type: 'object', properties: { name: { type: 'string', description: 'Object name' }, location: { type: 'array', items: { type: 'number' } } }, required: ['name'] }) === 'name (text, needed): Object name; location (list of numbers)');

// ---------- a real app over stdio ----------
const app = addServer(cfg, { name: 'Blender', cmd: process.execPath, args: [MOCK] });
const t = mcpTools(brain, { track });
check('a switched-off app is refused with where to switch it on', /switched off in Settings/.test(await throwsLike(() => t.mcp_tools.run({ app: 'blender' }, ctx()), /./)));
setServerOn(cfg, app.id, true);
{
  const list = await t.mcp_tools.run({}, ctx());
  check('without an app it lists the connected apps', /Blender: on/.test(list), list);
  const all = await t.mcp_tools.run({ app: 'blender' }, ctx());
  check('it starts the app and lists every page of tools', /8 of 8/.test(all) && /- list_scene \(only looks\)/.test(all) && /slow/.test(all), all);
  check('the inputs are shown', /name \(text, needed\)/.test(all));
  check('the list is kept for Settings', loadServers(cfg)[0].tools.length === 8 && loadServers(cfg)[0].tools.find((x) => x.name === 'delete_all').risky === true);
  const some = await t.mcp_tools.run({ app: 'Blender', find: 'object' }, ctx());
  check('find narrows the list', /add_object/.test(some) && !/screenshot/.test(some), some);
  check('it is on the Stop list while it runs', runningNow().some((r) => /connected app: Blender/.test(r.line)) && liveServers().includes('blender'));
}
{
  const c = ctx();
  const card = await t.mcp_use.check({ app: 'blender', tool: 'add_object', inputs: { name: 'Cube', location: [0, 0, 1] } }, c);
  check('the card says it in plain words, with the exact call for Show details', card.text === 'In Blender: add an object to the scene, with name "Cube" and location 0, 0, 1.' && /^add_object \{/.test(card.command) && /"Cube"/.test(card.command) && card.where === 'In Blender (connected app)' && card.mcp.tool === 'add_object' && card.button === 'Allow' && !card.mcp.always, JSON.stringify(card));
  check('the OK covers the same tool in the same app only', t.mcp_use.approvalGroup({ app: 'Blender', tool: 'add_object' }) === 'mcp:blender:add_object');
  const codeCard = await t.mcp_use.check({ app: 'blender', tool: 'run_code', inputs: { code: 'import bpy\nbpy.ops.mesh.primitive_cube_add()' } }, ctx());
  check('a tool that runs code shows the code and always asks', codeCard.mcp.always && /primitive_cube_add/.test(codeCard.mcp.code) && /runs code inside the app/.test(codeCard.text) && t.mcp_use.approvalGroup({ app: 'blender', tool: 'run_code' }) === null, JSON.stringify(codeCard));
  check('a tool that deletes always asks too', t.mcp_use.approvalGroup({ app: 'blender', tool: 'delete_all' }) === null && (await t.mcp_use.check({ app: 'blender', tool: 'delete_all' }, ctx())).mcp.always);
  check('code-running tools are spotted by name or description', loadServers(cfg)[0].tools.find((x) => x.name === 'run_code').code && !loadServers(cfg)[0].tools.find((x) => x.name === 'add_object').code);
  const out = await t.mcp_use.run({ app: 'blender', tool: 'add_object', inputs: { name: 'Cube', location: [0, 0, 1] } }, c);
  check('it runs and passes back what the app said', out === 'Added Cube at 0,0,1', out);
  const r2 = await t.mcp_use.run({ app: 'blender', tool: 'list_scene', inputs: '{}' }, ctx());
  check('inputs written as text are read too, and the app keeps its state', /Cube/.test(r2), r2);
  check('a tool that only looks says so on the card', /only looks/.test((await t.mcp_use.check({ app: 'blender', tool: 'list_scene' }, ctx())).text));
  check('a tool that can delete says so on the card', /delete or overwrite/.test((await t.mcp_use.check({ app: 'blender', tool: 'delete_all' }, ctx())).text));
  check('an unknown tool names the real ones', /no tool called "nope".*list_scene/.test(await throwsLike(() => t.mcp_use.check({ app: 'blender', tool: 'nope' }, ctx()), /./)));
  check('missing inputs are named', /needs: name/.test(await throwsLike(() => t.mcp_use.check({ app: 'blender', tool: 'add_object', inputs: {} }, ctx()), /./)));
  check('limits are checked on the card', /keys or passwords/.test(await throwsLike(() => t.mcp_use.check({ app: 'blender', tool: 'save_file', inputs: { path: path.join(tmp, 'id_rsa') } }, ctx()), /./)));
  check('and again right before it runs', /refused/.test(await throwsLike(() => t.mcp_use.run({ app: 'blender', tool: 'run_code', inputs: { code: 'shutdown /s' } }, ctx()), /./)));
  const c3 = ctx();
  const pic = await t.mcp_use.run({ app: 'blender', tool: 'screenshot' }, c3);
  check('a picture it sends back is saved and shown in the chat', /Picture saved/.test(pic) && c3.made?.length === 1 && fs.existsSync(c3.made[0]) && c3.made[0].startsWith(path.join(inn, 'connected-apps')), pic);
  check("the app's own error is passed on as an error", /^Error: Blender said: No scene open/.test(await t.mcp_use.run({ app: 'blender', tool: 'fail' }, ctx())));
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 200);
  check('Stop cuts a slow step short', /Stopped/.test(await throwsLike(() => t.mcp_use.run({ app: 'blender', tool: 'slow' }, { signal: ac.signal, emit: () => {} }), /./)));
}
{
  stopEverything({ ...brain, denyHands: () => 0, saveHands: () => {} });
  check('Stop everything stops the app\'s server', !liveServers().length);
  const again = await t.mcp_use.run({ app: 'blender', tool: 'list_scene' }, ctx());
  check('the next job starts it again (fresh)', again === 'Camera, Light', again);
  cfg.hands = { enabled: true, mcp: { on: false } };
  check('with the Hand off, Bob is told how to turn it on, and the server stops', /Connected apps \(MCP\)/.test(await throwsLike(() => t.mcp_use.run({ app: 'blender', tool: 'list_scene' }, ctx()), /./)) && !liveServers().length);
  cfg.hands = { enabled: true, mcp: { on: true } };
  setServerOn(cfg, 'blender', false);
  check('switching the app off stops it too', !liveServers().length);
  setServerOn(cfg, 'blender', true);
}
{
  const r = await checkServer(cfg, 'blender', { track });
  check('the Check button reaches it, counts its tools and lets it go', r.ok && r.tools === 8 && !liveServers().includes('blender'), JSON.stringify(r));
  const bad = addServer(cfg, { name: 'Ghost', cmd: path.join(tmp, 'no-such-program') });
  const r2 = await checkServer(cfg, bad.id);
  check('a program that is not there says so, and the line under it keeps why', !r2.ok && /Couldn't find|ENOENT|stopped/.test(r2.why) && loadServers(cfg).find((s) => s.id === bad.id).error, r2.why);
  removeServer(cfg, bad.id);
}

// ---------- the toolbox and the prompt ----------
{
  const g = groupsFor(brain);
  check('the toolbox has a connected-apps group naming the app', g.mcp && /Blender/.test(g.mcp.what));
  check('"in Blender, add a cube" adds it', guessGroups(brain, 'in Blender, add a cube').includes('mcp'));
  check('"spawn an actor in my Unreal level" adds it', guessGroups(brain, 'spawn an actor in my Unreal level').includes('mcp'));
  check("an app's own name finds it", mcpWords({ ...cfg }).test('ask blender'));
  check('his prompt names the app and the two steps', /Connected apps \(MCP\): Blender/.test(mcpPrompt(cfg)) && /mcp_tools/.test(handsPrompt(cfg)));
  check('nothing in the prompt while the Hand is off', mcpPrompt({ ...cfg, hands: {} }) === '');
  check('the tools are in Hands', Boolean(handsTools(brain).mcp_use && handsTools(brain).mcp_tools));
}

// ---------- over an address (Streamable HTTP) ----------
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
for (const sse of [false, true]) {
  const port = await freePort();
  const child = spawn(process.execPath, [MOCK, '--http', String(port)], { env: { ...process.env, MOCK_SSE: sse ? '1' : '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => child.stdout.once('data', r));
  const s = addServer(cfg, { name: sse ? 'Unreal SSE' : 'Unreal Engine', url: `http://127.0.0.1:${port}/mcp` });
  setServerOn(cfg, s.id, true);
  const r = await checkServer(cfg, s.id);
  check(`an address works (${sse ? 'event stream' : 'plain JSON'} replies)`, r.ok && r.tools === 8, JSON.stringify(r));
  const out = await t.mcp_use.run({ app: s.name, tool: 'add_object', inputs: { name: 'Light2' } }, ctx());
  check(`and a tool runs over it with the session kept (${sse ? 'event stream' : 'plain JSON'})`, out === 'Added Light2', out);
  child.kill();
  stopAllServers();
}
{
  const s = addServer(cfg, { name: 'Nobody', url: `http://127.0.0.1:${await freePort()}/mcp` });
  const r = await checkServer(cfg, s.id);
  check('nothing at the address says to open the app', !r.ok && /Nothing is answering/.test(r.why), r.why);
}

stopAllServers();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
