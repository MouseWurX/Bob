// Nov 27 2026 (the plan of Nov 23: "We claim privacy but I dont know how to prove it"). No internet (src/no-internet.js)
// and "which tool" in Where Bob connected (src/net-log.js, src/net-why.js). Off unless switched on; on, a connection
// that isn't allowed never starts (no name looked up, nothing sent), is written down as stopped with the tool that
// tried, and the tool's own answer says so. Commands, coding agents, Bob's browser and the phone app follow it.
// The live part runs against a server on this machine's own address and a made-up .invalid site only.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import { createRequire } from 'node:module';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const ni = await imp('src/no-internet.js');
const { NetLog, installNetLog, NET_LOG } = await imp('src/net-log.js');
const { withNetWhy } = await imp('src/net-why.js');
const ON = (more = {}) => ({ noInternet: { on: true, ...more } });

{ // the rules
  check('off unless switched on: with nothing set, nothing is stopped', ni.noInternetOn({}) === false && ni.blocks('huggingface.co', {}) === false && ni.noInternetOf({}).home === true && ni.noInternetOf({}).bobNet === true);
  check('on: a site on no list is stopped; this replicant matrix itself never is', ni.blocks('huggingface.co', ON()) && !ni.blocks('127.0.0.1', ON()) && !ni.blocks('localhost', ON()) && !ni.blocks('::1', ON()));
  check('your own Bobs and your home network are allowed while ticked, and stopped when unticked', !ni.blocks('100.101.2.3', ON()) && !ni.blocks('mypc.tail1234.ts.net', ON()) && !ni.blocks('172.16.1.20', ON()) && !ni.blocks('nas.local', ON()) && ni.blocks('100.101.2.3', ON({ bobNet: false })) && ni.blocks('172.16.1.20', ON({ home: false })) && ni.blocks('172.31.0.5', ON({ home: false })));
  check('an allowed site allows everything under it, and nothing that only ends the same way', !ni.blocks('example.com', ON({ allow: ['example.com'] })) && !ni.blocks('mail.example.com', ON({ allow: ['example.com'] })) && ni.blocks('notexample.com', ON({ allow: ['example.com'] })));
  check('sites are cleaned to a name: scheme, path, port, case and *. go', ni.cleanSite('https://Www.Example.com:8443/a?b') === 'www.example.com' && ni.cleanSite('*.example.org') === 'example.org' && ni.cleanSite('bad site!') === '' && ni.noInternetOf({ noInternet: { allow: ['A.com', 'a.com', ''] } }).allow.join() === 'a.com');
  check('addresses: Bob\'s own pages and data are never stopped; web addresses are', !ni.blocksUrl('file:///x', ON()) && !ni.blocksUrl('data:text/plain,hi', ON()) && ni.blocksUrl('https://cdn.example/x.png', ON()) && ni.blocksUrl('wss://gateway.discord.gg', ON()) && !ni.blocksUrl('http://127.0.0.1:7777/', ON()));
  check('the tool\'s answer names only the sites, and says what the person can do', /didn't connect to a\.example, which isn't on the allowed list/.test(ni.toolLine(['a.example', 'a.example'])) && /Settings, Online services, No internet/.test(ni.toolLine(['a.example'])) && ni.toolLine([]) === '');
  check('what stops is said plainly, commands and coding agents included', ni.STOPS.length >= 8 && ni.STOPS.some((s) => /sandbox/.test(s)) && ni.STOPS.some((s) => /Coding agents/.test(s)) && /Chatting with brains on this computer/.test(ni.KEEPS));
}

{ // the gate under net and tls, with fake modules: what's stopped never reaches the real connect
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no internet '));
  const cfg = ON({ allow: ['allowed.example'] });
  const log = new NetLog({ dir: tmp, cfg });
  const calls = [];
  const fakeNet = { Socket: net.Socket, connect: (...a) => { calls.push(a); return 'real'; }, createConnection: (...a) => { calls.push(a); return 'real'; } };
  const fakeTls = { connect: (...a) => { calls.push(a); return 'real'; } };
  installNetLog(log, { net: fakeNet, tls: fakeTls });
  const ok = fakeTls.connect({ host: 'allowed.example', port: 443 });
  const local = fakeNet.connect({ port: 7777 }); // no host: this replicant matrix
  const why = withNetWhy({ tool: 'fetch_page' }, () => fakeTls.connect({ host: 'tracker.example', port: 443 }));
  const err = await new Promise((r) => { why.result.on('error', r); setTimeout(() => r(null), 500); });
  check('an allowed site and this replicant matrix connect as asked', ok === 'real' && local === 'real' && calls.length === 2);
  check('a site that isn\'t allowed never reaches the real connect, and fails at once with the reason', calls.length === 2 && err?.code === 'EBOBNOINTERNET' && /No internet is on, and tracker\.example isn't on the allowed list/.test(err?.message || ''));
  check('the tool that tried is told which site was stopped', why.store.tool === 'fetch_page' && why.store.blocked.join() === 'tracker.example');
  const v = log.view();
  const stopped = v.recent.find((e) => e.host === 'tracker.example');
  check('Where Bob connected writes the stop down with the tool, and counts it', stopped?.blocked === true && stopped.tool === 'fetch_page' && v.noInternet.on === true && v.noInternet.stopped === 1 && v.recent.find((e) => e.host === 'allowed.example')?.blocked === false);
  const lines = fs.readFileSync(path.join(tmp, NET_LOG), 'utf8').replace(/\r\n/g, '\n').trim().split('\n').map((l) => JSON.parse(l));
  const bad = lines.find((l) => l.host === 'tracker.example');
  check('the file keeps the site, port, time, what for, tool and stopped only', bad && Object.keys(bad).join() === 'at,host,port,what,tool,blocked' && lines.find((l) => l.host === 'allowed.example') && !('tool' in lines.find((l) => l.host === 'allowed.example')));
  cfg.noInternet.on = false;
  fakeTls.connect({ host: 'tracker.example', port: 443 });
  check('switched off again, the same site connects as before (the settings object is read each time)', calls.length === 3);
  fs.rmSync(tmp, { recursive: true, force: true });
}

{ // live: the real net and tls under Node's own fetch and http, on this machine's own address and a made-up site
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no internet live '));
  const got = [];
  const srv = http.createServer((q, r) => { got.push(q.url); r.end('ok'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const cfg = ON();
  const log = installNetLog(new NetLog({ dir: tmp, cfg }), { net, tls });
  const t0 = Date.now();
  const f = await fetch('https://bob-no-internet-test.invalid/leak?secret=1').then(() => 'SENT', (e) => e.cause?.code || e.code || e.message);
  const h = await new Promise((r) => { const q = http.get('http://bob-no-internet-test.invalid/x', () => r('SENT')); q.on('error', (e) => r(e.code)); });
  const local = await fetch(`http://127.0.0.1:${srv.address().port}/here`).then((x) => x.text(), (e) => e.message);
  check('Node\'s own fetch and http are stopped before any name is looked up (no "not found", the No internet reason)', f === 'EBOBNOINTERNET' && h === 'EBOBNOINTERNET' && Date.now() - t0 < 3000, `${f} ${h}`);
  check('this replicant matrix\'s own server still answers with No internet on', local === 'ok' && got.join() === '/here');
  check('both stops are in Where Bob connected', log.view().recent.filter((e) => e.blocked && e.host === 'bob-no-internet-test.invalid').reduce((n, e) => n + e.count, 0) === 2);
  srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

{ // what follows the switch
  const { commandNet, noSandboxLine } = await imp('src/hands-run.js');
  check('commands run with no internet while it\'s on, whatever Web says, and say why when they can\'t', commandNet(ON()) === 'off' && commandNet({ ...ON(), webSearch: true }) === 'off' && commandNet({}) === 'open' && /^Not run: No internet is on/.test(noSandboxLine(ON())));
  const { urlProblem } = await imp('src/hands-browser.js');
  check('Bob\'s browser won\'t open a site that isn\'t allowed, and opens one that is', /No internet is on/.test(urlProblem(ON(), 'https://news.example/')) && urlProblem(ON({ allow: ['news.example'] }), 'https://news.example/') === '');
  const { CodingAgents, AGENTS_NO_INTERNET } = await imp('src/coding-agents.js');
  const ca = read('src/coding-agents.js');
  check('coding agents don\'t start or sign in while it\'s on', /Not started: No internet is on/.test(AGENTS_NO_INTERNET) && (ca.match(/if \(noInternetOn\(this\.cfg\)\) throw new Error\(AGENTS_NO_INTERNET\)/g) || []).length === 2 && typeof CodingAgents === 'function');
  const tools = read('src/brain-tool-runs.js');
  check('every tool call runs with its name for Where Bob connected, and a stop is named at the top of its answer', /netWhyFor\(name === 'use_my_tool'/.test(tools) && /inNetWhy\(netWhy, async \(\) => cachedLook/.test(tools) && /toolLine\(netWhy\.blocked\)/.test(tools));
  const { gateSession } = createRequire(import.meta.url)(path.join(app, 'electron/net-gate.cjs'));
  let handler = null; const ses = { webRequest: { onBeforeRequest: (f, h) => { handler = h; } } };
  gateSession(ses, (d) => d.url.includes('tracker'));
  const ask = (url) => new Promise((r) => handler({ url }, (x) => r(x.cancel)));
  const noted = [];
  globalThis.bobNetGate = { on: () => true, blocksUrl: (u) => ni.blocksUrl(u, ON({ allow: ['ok.example'] })), note: (u) => noted.push(u) };
  const a = await ask('https://elsewhere.example/'), b = await ask('https://ok.example/'), c = await ask('https://ok.example/tracker.js');
  delete globalThis.bobNetGate;
  const d = await ask('https://elsewhere.example/');
  check('Bob\'s browser windows: a site that isn\'t allowed is cancelled and noted, an allowed one goes, the tracker list still works, and without the server nothing is stopped', a === true && b === false && c === true && d === false && noted.join() === 'https://elsewhere.example/');
  const main = read('electron/main.cjs'), bw = read('electron/browser-window.cjs'), wr = read('electron/web-route.cjs');
  check('every one of the app\'s sessions gets the gate: Bob\'s window, his browser (both profiles) and Private web\'s route', /gateSession\(win\.webContents\.session\)/.test(main) && /gateSession\(s, \(d\) => d\.resourceType !== 'mainFrame' && isTracker\(d\.url\)\)/.test(bw) && /else gateSession\(s\)/.test(bw) && /gateSession\(ses\)/.test(wr) && !/onBeforeRequest/.test(bw));
  const server = read('src/server.js');
  check('the server hands the rules to the app and answers /api/no-internet from this replicant matrix only', /globalThis\.bobNetGate = \{/.test(server) && /noInternetRoute\(/.test(server));
  const { noInternetRoute } = await imp('src/no-internet-routes.js');
  let sent = null;
  await noInternetRoute({ req: { method: 'POST' }, res: {}, p: '/api/no-internet', isLocal: false, cfg: {}, body: async () => ({ on: false }), send: (res, st, j) => { sent = [st, j]; } });
  check('a phone or another Bob can\'t change it', sent?.[0] === 403);
  const { SETTING_KEYS } = await imp('src/config.js');
  check('it is a saved setting, cleaned on the way in', SETTING_KEYS.includes('noInternet') && /out\.noInternet = noInternetOf\(/.test(read('src/config.js')));
}

{ // Settings, Help and the phone
  const page = read('public/net-log.js');
  check('Settings, Online services: the switch, both ticks, the allowed list, what stops, and the Tool column', ['data-ni="on"', 'data-ni="bobNet"', 'data-ni="home"', 'data-ni-add', 'data-ni-remove', 'What stops while it', '<th>Tool</th>', 'Stopped'].every((w) => page.includes(w)));
  const help = read('public/help-content.js');
  check('Help: its own page, an FAQ, a glossary entry, and Where Bob connected mentions the tool', /id: 'no-internet'/.test(help) && /id: 'faq-no-internet'/.test(help) && /<dt>No internet<\/dt>/.test(help) && /which of my tools opened it/.test(help) && /'no-internet': 'privacy'/.test(help));
  const kt = path.join(app, 'android/app/src/main/java/ca/mousewurx/bob');
  const kts = fs.readdirSync(kt).filter((f) => f.endsWith('.kt'));
  const opens = kts.filter((f) => f !== 'PhoneNet.kt' && /openConnection\(/.test(fs.readFileSync(path.join(kt, f), 'utf8')));
  check('Android: every connection the app opens goes through PhoneNet (logged, and stopped when not allowed)', opens.length === 0 && kts.filter((f) => /PhoneNet\.open\(/.test(fs.readFileSync(path.join(kt, f), 'utf8'))).length >= 3, opens.join());
  const pn = fs.readFileSync(path.join(kt, 'PhoneNet.kt'), 'utf8');
  check('Android: off unless switched on, same ticks, redirects checked hop by hop while on', /getBoolean\("on", false\)/.test(pn) && /getBoolean\("home", true\)/.test(pn) && /getBoolean\("bobNet", true\)/.test(pn) && /instanceFollowRedirects = false/.test(pn) && /"privacy\.view"/.test(fs.readFileSync(path.join(kt, 'Bridge.kt'), 'utf8')));
  const www = path.join(app, 'android/app/src/main/assets/www');
  check('Android: Settings, Privacy has the switch and the list, and Help covers it', /id="ni-on"/.test(fs.readFileSync(path.join(www, 'index.html'), 'utf8')) && /id: 'privacy'/.test(fs.readFileSync(path.join(www, 'help.js'), 'utf8')));
}

{ // the iPhone app (built only on GitHub's Mac, so read here)
  const sw = read('ios/Bob/PhoneNet.swift'), br = read('ios/Bob/Bridge.swift'), nb = read('ios/Bob/NetBob.swift'), pb = read('ios/Bob/PhoneBrain.swift');
  check('iPhone: the same switch and ticks, every request checked (Bob-Net, downloads and each redirect hop)', /d\.bool\(forKey: "on"\)/.test(sw) && /forKey: "home"\) as\? Bool \?\? true/.test(sw) && /case "privacy\.view"/.test(br) && /PhoneNet\.check\(url/.test(nb) && (pb.match(/PhoneNet\.check\(/g) || []).length >= 2 && /willPerformHTTPRedirection/.test(pb));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
