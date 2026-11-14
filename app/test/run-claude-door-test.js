// Tests "Hands for Claude" (src/claude-door.js): Bob as an MCP server for the Claude app and Claude Code.
// A pretend Bob, pretend settings files in a temporary folder, and the real stdio helper talking to a door on
// 127.0.0.1. Nothing reads the real computer's Claude settings.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  loadDoor, setDoor, makeKey, removeKey, appForKey, offeredNames, toolList, handleRpc, doorRoute, callTool,
  sessionFor, claudeFiles, entryFor, planConnect, connect, disconnect, connectedState, doorView, DOOR_GROUPS, NEVER, BRIDGE, stopAll
} from '../src/claude-door.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-door-'));
const cfg = { dataDir: path.join(dir, 'inn'), painterDir: path.join(dir, 'made'), port: 7777, userName: 'Robin' };

// ---- a pretend Bob ----
const fnS = (name, description) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: { x: { type: 'string' } }, required: [] } } });
let answer = true;
const brain = {
  cfg, events: [], logs: [], approvals: [], ran: [],
  tools: {
    file_hands: { schema: fnS('file_hands', 'Move files {{USER}} allowed.'), check: () => ({ text: 'Move 2 files' }), approvalGroup: 'files', summary: () => 'files: move' },
    make_image: { schema: fnS('make_image', 'Paint a picture.'), summary: ({ prompt }) => `paint: ${prompt}` },
    read_file: { schema: fnS('read_file', 'Read a file.'), summary: ({ path: p }) => `read ${p}` },
    run_command: { schema: fnS('run_command', 'Run a command.'), check: () => ({ text: 'Run this command', command: 'npm test' }) },
    ask_cloud: { schema: fnS('ask_cloud', 'Costs money.') },
    notice_board: { schema: fnS('notice_board', 'Notes.') }
  },
  off: new Set(['run_command']), // the Run Hand is off in this Bob
  usable(n) { return Boolean(this.tools[n]) && !this.off.has(n); },
  toolSchemas(names) { return names.map((n) => JSON.parse(JSON.stringify(this.tools[n].schema).replaceAll('{{USER}}', 'Robin'))); },
  broadcast(ev) { this.events.push(ev); },
  log(k, t) { this.logs.push(`${k}: ${t}`); },
  async approve(text, emit, signal, group) { this.approvals.push({ text, group }); emit({ type: 'approval', text }); return answer; },
  async runTool(name, args, ctx) {
    this.ran.push({ name, args, via: ctx.via, alwaysAsk: ctx.alwaysAsk, allowAll: ctx.allowAll });
    if (name === 'make_image') { const f = path.join(cfg.painterDir, 'pic.png'); fs.mkdirSync(cfg.painterDir, { recursive: true }); fs.writeFileSync(f, Buffer.from([137, 80, 78, 71])); ctx.emit({ type: 'image', file: f, url: '/images/pic.png' }); return { text: `Painted ${f}` }; }
    return { text: `did ${name}` };
  },
  async recall(sid, about) { return sid === null ? `Memory about ${about}` : ''; }
};

// ---- settings: off by default, keys as fingerprints only ----
{
  const d = loadDoor(cfg);
  check('the door starts off', d.on === false);
  check('every group starts ticked (the door itself is the switch)', Object.keys(DOOR_GROUPS).every((g) => d.groups[g] === true));
  const { key, id } = makeKey(cfg, { name: 'Test app' });
  check('a key looks like bob_ and 43 more', /^bob_[A-Za-z0-9_-]{43}$/.test(key) && id === 'test-app');
  const saved = fs.readFileSync(path.join(cfg.dataDir, 'claude-door.json'), 'utf8');
  check('only the fingerprint is saved, never the key', !saved.includes(key) && /"hash": "[a-f0-9]{64}"/.test(saved));
  check('the key finds its app', appForKey(cfg, key)?.id === 'test-app');
  check('a wrong or empty key finds nothing', !appForKey(cfg, key + 'x') && !appForKey(cfg, '') && !appForKey(cfg, null));
  const again = makeKey(cfg, { name: 'Test app' });
  check('a new key for the same app stops the old one', !appForKey(cfg, key) && appForKey(cfg, again.key)?.id === 'test-app');
  check('Remove stops it at once', removeKey(cfg, 'test-app') && !appForKey(cfg, again.key));
  setDoor(cfg, { on: 'yes' });
  check('only true turns it on', loadDoor(cfg).on === false);
  setDoor(cfg, { on: true, groups: { media: false } });
  check('on, and a group unticked', loadDoor(cfg).on === true && loadDoor(cfg).groups.media === false && loadDoor(cfg).groups.hands === true);
  setDoor(cfg, { groups: { media: true } });
}

// ---- which tools Claude sees ----
{
  const names = offeredNames(brain);
  check('tools switched on in Bob are offered', ['file_hands', 'make_image', 'read_file', 'notice_board', 'recall_memory'].every((n) => names.includes(n)), names.join(','));
  check('a Hand that is off in Bob stays off for Claude', !names.includes('run_command'));
  check('nothing that costs money or loops is ever offered', !names.includes('ask_cloud') && ['ask_cloud', 'hire_brain', 'mcp_use', 'mcp_tools'].every((n) => NEVER.has(n)));
  check('no voice set up: no say_aloud', !names.includes('say_aloud'));
  setDoor(cfg, { groups: { hands: false } });
  check('an unticked group is not even listed', !offeredNames(brain).includes('file_hands'));
  setDoor(cfg, { groups: { hands: true } });
  const list = toolList(brain);
  const fh = list.find((t) => t.name === 'file_hands');
  check('tools go out in MCP shape with the owner\'s name filled in', fh && fh.inputSchema?.type === 'object' && fh.description === 'Move files Robin allowed.');
}

// ---- the MCP conversation ----
const app = { id: 'claude-app', name: 'Claude app' };
const session = sessionFor('session-one', app);
{
  const init = await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai' } } });
  check('initialize answers with tools and Bob\'s name', init.result.protocolVersion === '2025-06-18' && init.result.capabilities.tools && init.result.serverInfo.name === 'bob' && /card/.test(init.result.instructions));
  const old = await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  check('an unknown protocol version gets Bob\'s newest', old.result.protocolVersion === '2025-06-18');
  check('notifications get no answer', (await handleRpc(brain, app, session, { jsonrpc: '2.0', method: 'notifications/initialized' })) === null);
  check('ping', (await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 3, method: 'ping' })).result !== undefined);
  check('an unknown method is an error', (await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 4, method: 'nope' })).error.code === -32601);
  check('not JSON-RPC is an error', (await handleRpc(brain, app, session, { id: 5, method: 'ping' })).error.code === -32600);
  const tl = await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 6, method: 'tools/list' });
  check('tools/list lists them', tl.result.tools.some((t) => t.name === 'make_image'));

  // A tool without its own card gets the door's card, named after the app.
  brain.approvals.length = 0; brain.ran.length = 0;
  const pic = await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'make_image', arguments: { prompt: 'a cat' } } });
  check('a picture asks on Bob\'s card first, with the app\'s name', brain.approvals[0]?.text === 'Claude app (through Bob): paint: a cat' && brain.approvals[0].group === 'door:claude-app:make_image');
  check('then Bob paints, told it is from another app and must always ask', brain.ran[0]?.name === 'make_image' && brain.ran[0].via === 'Claude app' && brain.ran[0].alwaysAsk === true);
  check('the picture goes back to Claude as a picture too', pic.result.content[0].type === 'text' && pic.result.content[1]?.type === 'image' && pic.result.content[1].mimeType === 'image/png' && !pic.result.isError);
  check('Bob\'s window events carry the app\'s name', brain.events.some((e) => e.type === 'approval' && e.via === 'Claude app'));

  // A tool with its own card (files, commands) uses that card; brain.runToolNow names the app on it.
  brain.approvals.length = 0; brain.ran.length = 0;
  await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'file_hands', arguments: { action: 'move' } } });
  check('a Hand with its own card is passed to Bob (his card, his limits)', !brain.approvals.length && brain.ran[0]?.name === 'file_hands' && brain.ran[0].via === 'Claude app' && brain.ran[0].allowAll === session.allowAll);

  answer = false; brain.ran.length = 0;
  const no = await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'x' } } });
  check('Deny: nothing runs and Claude is told not to try again', !brain.ran.length && no.result.isError && /said no/.test(no.result.content[0].text));
  answer = 'all';
  await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'x' } } });
  brain.approvals.length = 0;
  await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'y' } } });
  check('Allow the rest of this job holds for that Claude chat', !brain.approvals.length && brain.ran.filter((r) => r.name === 'read_file').length === 2);
  const other = sessionFor('session-two', app);
  answer = true;
  await handleRpc(brain, app, other, { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'y' } } });
  check('but not for another chat', brain.approvals.length === 1);

  const mem = await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'recall_memory', arguments: { about: 'cats' } } });
  check('Bob\'s memory can be looked in (after a card)', mem.result.content[0].text === 'Memory about cats' && brain.approvals.length === 2);
  const off = await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'run_command', arguments: {} } });
  check('a tool that is not offered is refused, and nothing runs', off.result.isError && !brain.ran.some((r) => r.name === 'run_command'));
  const money = await handleRpc(brain, app, session, { jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'ask_cloud', arguments: {} } });
  check('a tool that costs money is refused even by name', money.result.isError);

  // A call waiting on the card stops when ✋ Hands (stopAll) is pressed.
  session.allowAll.clear();
  brain.approve = (text, emit, signal) => new Promise((r) => { signal.addEventListener('abort', () => r(false), { once: true }); });
  const waiting = handleRpc(brain, app, session, { jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'z' } } });
  await new Promise((r) => setTimeout(r, 10));
  check('a waiting call is counted', session.calls.size === 1);
  const stopped = stopAll();
  const w = await waiting;
  check('✋ Hands stops waiting calls (the card answers No)', w.result.isError && session.calls.size === 0, String(stopped));
  brain.approve = async (text, emit) => { brain.approvals.push({ text }); emit({ type: 'approval', text }); return answer; };

  setDoor(cfg, { on: false });
  const shut = await callTool(brain, app, session, 'read_file', {}, {});
  check('switched off: calls are refused', shut.isError && /switched off/.test(shut.content[0].text));
  setDoor(cfg, { on: true });
}

// ---- the door itself: who gets in ----
const fakeReq = (o) => { const body = o.body === undefined ? '' : JSON.stringify(o.body); const r = { method: o.method || 'POST', headers: o.headers || {}, socket: { remoteAddress: o.addr || '127.0.0.1' }, async *[Symbol.asyncIterator]() { if (body) yield body; } }; return r; };
const fakeRes = () => { const r = { code: 0, headers: {}, body: '', on() {}, writableFinished: false, writeHead(c, h) { r.code = c; Object.assign(r.headers, h || {}); }, write(t) { r.body += t; }, end(t) { if (t) r.body += t; r.writableFinished = true; } }; return r; };
{
  const { key } = makeKey(cfg, { id: 'claude-code', name: 'Claude Code', kind: 'code' });
  const auth = { authorization: `Bearer ${key}`, accept: 'application/json, text/event-stream' };
  const go = async (o, isLocal = true) => { const res = fakeRes(); await doorRoute({ req: fakeReq(o), res, brain, isLocal }); return res; };
  check('another computer is turned away', (await go({ addr: '100.64.1.2', headers: auth, body: {} }, false)).code === 403);
  check('a web page is turned away', (await go({ headers: { ...auth, origin: 'https://example.com' }, body: {} })).code === 403);
  check('no key: 401', (await go({ headers: {}, body: {} })).code === 401);
  setDoor(cfg, { on: false });
  check('off: 403 even with a key', (await go({ headers: auth, body: {} })).code === 403);
  setDoor(cfg, { on: true });
  const init = await go({ headers: auth, body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } } });
  check('initialize: 200 with a session id', init.code === 200 && /^[0-9a-f-]{36}$/.test(init.headers['mcp-session-id']) && JSON.parse(init.body).result.serverInfo.name === 'bob');
  const note = await go({ headers: { ...auth, 'mcp-session-id': init.headers['mcp-session-id'] }, body: { jsonrpc: '2.0', method: 'notifications/initialized' } });
  check('a notification: 202', note.code === 202);
  check('GET is not offered', (await go({ method: 'GET', headers: auth })).code === 405);
  const bad = await go({ headers: auth, body: undefined });
  check('rubbish is a parse error', bad.code === 400);
  const sse = await go({ headers: { ...auth, 'mcp-session-id': init.headers['mcp-session-id'] }, body: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'q' }, _meta: { progressToken: 'p1' } } } });
  check('a call asking for progress gets an event stream with the answer', sse.code === 200 && /text\/event-stream/.test(sse.headers['content-type']) && /"id":2/.test(sse.body));
}

// ---- where the Claude app and Claude Code keep their settings (pretend computers) ----
{
  const win = claudeFiles({ platform: 'win32', env: { APPDATA: 'C:\\Users\\you\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\you\\AppData\\Local' }, home: 'C:\\Users\\you', exists: () => false, list: () => [] });
  check('Windows: the Claude app in AppData\\Roaming\\Claude', win.desktop.file === 'C:\\Users\\you\\AppData\\Roaming\\Claude\\claude_desktop_config.json' && win.desktop.found === false);
  const store = claudeFiles({ platform: 'win32', env: { APPDATA: 'C:\\R', LOCALAPPDATA: 'C:\\L' }, home: 'C:\\H', exists: (p) => p.includes('Packages'), list: () => ['Other_1', 'Claude_pzs8sxrjxfjjc'] });
  check('Windows: the Microsoft Store version\'s own folder', store.desktop.file === 'C:\\L\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Roaming\\Claude\\claude_desktop_config.json');
  check('Windows: Claude Code in the home folder', win.code.file === 'C:\\Users\\you\\.claude.json');
  const mac = claudeFiles({ platform: 'darwin', env: {}, home: '/Users/sam', exists: () => true, list: () => [] });
  check('Mac: Application Support', mac.desktop.file === '/Users/sam/Library/Application Support/Claude/claude_desktop_config.json' && mac.code.file === '/Users/sam/.claude.json');
  const lin = claudeFiles({ platform: 'linux', env: { XDG_CONFIG_HOME: '/home/sam/.cfg' }, home: '/home/sam', exists: () => false, list: () => [] });
  check('Linux: the config folder', lin.desktop.file === '/home/sam/.cfg/Claude/claude_desktop_config.json');
  const cc = claudeFiles({ platform: 'linux', env: { CLAUDE_CONFIG_DIR: '/opt/cc' }, home: '/home/sam', exists: () => false, list: () => [] });
  check('Claude Code: its own config folder when set', cc.code.file === '/opt/cc/.claude.json');
}

// ---- Connect: shown first, backed up, only "bob" changes ----
{
  const files = { desktop: { file: path.join(dir, 'Claude', 'claude_desktop_config.json'), found: true }, code: { file: path.join(dir, '.claude.json'), found: true } };
  fs.mkdirSync(path.dirname(files.desktop.file), { recursive: true });
  fs.writeFileSync(files.desktop.file, JSON.stringify({ mcpServers: { blender: { command: 'uvx', args: ['blender-mcp'] } }, globalShortcut: 'Ctrl+Space' }));
  fs.writeFileSync(files.code.file, '\uFEFF' + JSON.stringify({ numStartups: 4, projects: { a: 1 } }));
  const opts = { files, execPath: '/apps/Bob', bridge: '/apps/bob/src/claude-door-bridge.cjs' };
  const plan = planConnect(cfg, 'desktop', opts);
  check('the plan names the file and what is already there', plan.file === files.desktop.file && plan.others.join() === 'blender' && plan.before === null);
  check('the plan never shows a real key', /bob_••••/.test(JSON.stringify(plan.after)) && plan.after.env.ELECTRON_RUN_AS_NODE === '1');
  check('planning changes nothing', JSON.parse(fs.readFileSync(files.desktop.file, 'utf8')).mcpServers.bob === undefined);
  const r = connect(cfg, 'desktop', opts);
  const after = JSON.parse(fs.readFileSync(files.desktop.file, 'utf8'));
  check('a copy of the file is saved first', r.backup && fs.existsSync(r.backup) && JSON.parse(fs.readFileSync(r.backup, 'utf8')).mcpServers.bob === undefined);
  check('Bob is added, and the other app and settings stay', after.mcpServers.bob.command === '/apps/Bob' && after.mcpServers.bob.args[0] === opts.bridge && after.mcpServers.blender.command === 'uvx' && after.globalShortcut === 'Ctrl+Space');
  check('the Claude app gets a key that works', appForKey(cfg, after.mcpServers.bob.env.BOB_MCP_KEY)?.id === 'claude-app' && after.mcpServers.bob.env.BOB_MCP_URL === 'http://127.0.0.1:7777/mcp');
  check('it shows as connected', connectedState(cfg, 'desktop', opts).connected && !connectedState(cfg, 'desktop', opts).stale);
  check('Bob moved: connected but old', connectedState(cfg, 'desktop', { ...opts, execPath: '/elsewhere/Bob' }).stale === true);
  connect(cfg, 'code', opts);
  const code = JSON.parse(fs.readFileSync(files.code.file, 'utf8'));
  check('Claude Code: an address with the key in a header, and its own settings kept (even after a BOM)', code.mcpServers.bob.type === 'http' && code.mcpServers.bob.url === 'http://127.0.0.1:7777/mcp' && /^Bearer bob_/.test(code.mcpServers.bob.headers.Authorization) && code.numStartups === 4 && code.projects.a === 1);
  check('each app has its own key', code.mcpServers.bob.headers.Authorization.slice(7) !== after.mcpServers.bob.env.BOB_MCP_KEY);
  const view = doorView(cfg, brain, opts);
  check('Settings sees both connected and both apps listed, without keys', view.claude.desktop.connected && view.claude.code.connected && view.apps.some((a) => a.id === 'claude-code') && !JSON.stringify(view).includes('bob_'));
  const d = disconnect(cfg, 'desktop', opts);
  const gone = JSON.parse(fs.readFileSync(files.desktop.file, 'utf8'));
  check('Take Bob out: only his line goes, with a copy saved, and his key stops', !gone.mcpServers.bob && gone.mcpServers.blender && fs.existsSync(d.backup) && !appForKey(cfg, after.mcpServers.bob.env.BOB_MCP_KEY));
  fs.writeFileSync(files.desktop.file, '{ not json');
  const p2 = planConnect(cfg, 'desktop', opts);
  let threw = false; try { connect(cfg, 'desktop', opts); } catch { threw = true; }
  check('a file Bob can\'t read is never touched', Boolean(p2.error) && threw && fs.readFileSync(files.desktop.file, 'utf8') === '{ not json');
  const fresh = { desktop: { file: path.join(dir, 'New', 'claude_desktop_config.json'), found: false }, code: files.code };
  const r3 = connect(cfg, 'desktop', { ...opts, files: fresh });
  check('no file yet: a new one, no copy needed', !r3.backup && JSON.parse(fs.readFileSync(fresh.desktop.file, 'utf8')).mcpServers.bob);
  check('the Claude Code entry needs no program', !('command' in entryFor('code', { key: 'k', port: 1 })));
}

// ---- the real helper the Claude app starts, against a real door on 127.0.0.1 ----
{
  check('the helper ships next to the door', fs.existsSync(BRIDGE) && BRIDGE.endsWith('claude-door-bridge.cjs'));
  setDoor(cfg, { on: true });
  const { key } = makeKey(cfg, { id: 'claude-app', name: 'Claude app', kind: 'desktop' });
  const server = http.createServer((req, res) => doorRoute({ req, res, brain, isLocal: true }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const child = spawn(process.execPath, [BRIDGE], { env: { BOB_MCP_URL: `http://127.0.0.1:${port}/mcp`, BOB_MCP_KEY: key }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  let buf = '';
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const wait = async (n) => { for (let i = 0; i < 200 && lines.length < n; i++) await new Promise((r) => setTimeout(r, 10)); };
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
  await wait(1);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await wait(2);
  check('through the helper: initialize', lines[0]?.result?.serverInfo?.name === 'bob');
  check('through the helper: tools/list (and notifications get nothing back)', lines.length === 2 && lines[1]?.id === 2 && lines[1].result.tools.length > 0);
  child.kill();
  const bad = spawn(process.execPath, [BRIDGE], { env: { BOB_MCP_URL: 'http://example.com/mcp', BOB_MCP_KEY: key }, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  bad.stdout.on('data', (d) => { out += d; });
  bad.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n');
  for (let i = 0; i < 100 && !out; i++) await new Promise((r) => setTimeout(r, 10));
  check('the helper never sends the key off this computer', /on this computer/.test(out));
  bad.kill();
  server.close();
}

// ---- wiring, Help, glossary, FAQ ----
{
  const brainSrc = brainText();
  check('Bob\'s own cards name the app that asked', /if \(need && ctx\.via\) need = /.test(brainSrc));
  check('"work without asking" never skips the card for another app', /!ctx\.alwaysAsk && (!afterOutside && )?freeOn\(this\.cfg\)/.test(brainSrc));
  const server = read('src/server.js');
  check('the door is only at /mcp, before the page checks', server.indexOf("if (p === '/mcp') return doorRoute") > 0 && server.indexOf("if (p === '/mcp') return doorRoute") < server.indexOf("req.headers['x-bob'] !== '1'"));
  check('✋ Hands and Stop everything stop Claude\'s calls too', (read('src/hands.js').match(/stopDoorCalls\(\)/g) || []).length === 2);
  const ui = read('public/claude-door.js');
  check('Settings has the switch and both Connect buttons', ['Hands for Claude', 'Connect Bob to the Claude app', 'Connect Bob to Claude Code', 'Make a key for another app', 'Make this change'].every((l) => ui.includes(l.replace(/'/g, "\\'")) || ui.includes(l)));
  check('it sits in Settings, Other apps', /claudeDoorHtml\(\)/.test(publicText('cellar.js')) && /mountClaudeDoor/.test(publicText('cellar.js')));
  const topic = HELP.find((e) => e.id === 'claude-door');
  check('Help has the topic, in Bob\'s voice, with the platforms', topic && /I can be its hands/.test(topic.html) && /Windows, Mac and Linux/.test(topic.html) && /Not on the Android app/.test(topic.html));
  check('Settings: Other apps explains every new setting', ["Hands for Claude", 'What Claude may ask Bob for', 'Connect Bob to the Claude app', 'Connect Bob to Claude Code', 'Make a key for another app'].every((l) => HELP.find((e) => e.id === 'settings-apps').html.includes(l)));
  check('the glossary has it', /MCP door/.test(HELP.find((e) => e.id === 'glossary').html));
  check('the FAQ has it', HELP.some((e) => e.id === 'faq-claude-door' && e.group === 'FAQ' && /\?$/.test(e.title)));
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
