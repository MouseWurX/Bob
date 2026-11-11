// 1.5.203 (PC test): Windows Smart App Control blocked Brain Engine 3's unsigned files. spawn() threw at once
// (code UNKNOWN, errno -4094, syscall spawn), every brain failed to wake, and Bob didn't go back on his own. Now he
// goes back to the build kept from before the update by himself, says so once, remembers it (no retry on every load,
// no fetching the same build again) and offers Try again in Settings, Engines. Fake folders and a faked spawn error
// only; nothing runs a real program.
// Run: node test/run-engine-blocked-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { windowsBlocked, fallBackIfBlocked, safeSpawn, engineOf, blockedSay, onEngineFallback, buildWords } from '../src/engine-blocked.js';
import { engineFor, ENGINES, engineBlocked, engineStatus, goBackEngine, installedMarker } from '../src/engines.js';
import { EngineKeeper } from '../src/engine-keeper.js';
import { HELP } from '../public/help-content.js';

let failures = 0, passed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) passed++; else failures++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-blocked-'));
const BE = engineFor(ENGINES.find((e) => e.id === 'brainengine'));
const put = (dir, version, at = new Date().toISOString()) => { const d = path.join(tmp, dir); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, BE.exe), version); fs.writeFileSync(path.join(d, 'bob-brainengine.json'), JSON.stringify({ version, print: 'sha256:' + version, at })); };
const cfg = { agentDir: tmp };
const exe = path.join(tmp, 'brain-engine', BE.exe);
// What Windows gave on the PC: spawn throws, no child.
const sac = Object.assign(new Error('spawn UNKNOWN'), { code: 'UNKNOWN', errno: -4094, syscall: 'spawn' });

check(windowsBlocked(sac), 'spawn UNKNOWN (errno -4094) counts as Windows blocking the program');
check(windowsBlocked(new Error('An Application Control policy has blocked this file.')), 'so does "An Application Control policy has blocked this file"');
check(windowsBlocked(Object.assign(new Error('x'), { errno: 4551 })), 'and error 4551');
check(!windowsBlocked(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT', syscall: 'spawn' })), 'a missing program is not "blocked"');
check(engineOf(cfg, exe) === 'brainengine' && engineOf(cfg, path.join(tmp, 'elsewhere', 'x.exe')) === '', 'the program is told apart as Brain Engine\'s');
check(buildWords('brain-engine-v3') === 'version 3' && /llama\.cpp b12282/.test(buildWords('brain-engine-b12282')), 'builds are named in plain words');

// safeSpawn: a throw comes back as an 'error' event, like a missing program.
{
  const child = safeSpawn(() => { throw sac; }, exe, [], {});
  const got = await new Promise((r) => { child.once('error', r); setTimeout(() => r(null), 500); });
  check(got === sac && child.pid === undefined && typeof child.stdout.on === 'function', 'a spawn that throws comes back as an error event, with no child');
  const ok = safeSpawn(() => ({ pid: 7 }), exe, [], {});
  check(ok.pid === 7, 'a spawn that works is passed through untouched');
}

// The PC case: Engine 3 is in, b12282 kept for Go back, Windows blocks Engine 3.
put('brain-engine', 'brain-engine-v3');
put('brain-engine.previous', 'brain-engine-b12282');
let told = [];
const off = onEngineFallback((r) => told.push(r.say));
const back = fallBackIfBlocked(cfg, exe, sac);
check(back && back.windows && back.version === 'brain-engine-v3' && back.previous === 'brain-engine-b12282', 'Windows blocking the new engine: Bob goes back to the one before by himself');
check(installedMarker(cfg, BE)?.version === 'brain-engine-b12282' && installedMarker(cfg, BE, path.join(tmp, 'brain-engine.previous'))?.version === 'brain-engine-v3', 'the old build is in use again, and the blocked one is kept for Try again');
check(told.length === 1 && /Windows blocked my new engine \(version 3\)/.test(told[0]) && /Smart App Control/.test(told[0]) && /Try again in Settings, Engines/.test(told[0]), 'he says so once, in plain words, with why and where Try again is');
check(engineBlocked(cfg, 'brainengine')?.version === 'brain-engine-v3', 'he remembers it');
check(fallBackIfBlocked(cfg, exe, sac) === null && installedMarker(cfg, BE)?.version === 'brain-engine-b12282' && told.length === 1, 'a second failure doesn\'t swap back again or say it twice');
const st = engineStatus(cfg).find((e) => e.id === 'brainengine');
check(st.blocked && st.blocked.windows && st.blocked.version === 'brain-engine-v3', 'Settings, Engines sees the blocked build');

// The update with Bob doesn't fetch the blocked build again.
{
  let asked = 0;
  const k = new EngineKeeper(cfg, { pin: { tag: 'brain-engine-v3', print: 'sha256:brain-engine-v3' }, check: async () => { asked++; return { latest: 'brain-engine-v3', print: 'sha256:brain-engine-v3' }; } });
  const r = await k.withBob();
  check(r === null && asked === 0, 'the engine update doesn\'t fetch the blocked build again');
}

// Try again: Go back swaps them, and the record goes.
goBackEngine(cfg, 'brainengine');
check(installedMarker(cfg, BE)?.version === 'brain-engine-v3' && !engineBlocked(cfg), 'Try again puts the new build back in and forgets the block');
off();

// Any start failure right after an update goes back too; an old install that fails for another reason doesn't.
{
  fs.rmSync(path.join(tmp, 'brain-engine'), { recursive: true, force: true }); fs.rmSync(path.join(tmp, 'brain-engine.previous'), { recursive: true, force: true });
  put('brain-engine', 'brain-engine-v3'); put('brain-engine.previous', 'brain-engine-b12282');
  const other = Object.assign(new Error('spawn EACCES'), { code: 'EACCES', syscall: 'spawn' });
  const r = fallBackIfBlocked(cfg, exe, other);
  check(r && !r.windows && /wouldn't start \(spawn EACCES\)/.test(blockedSay(r)), 'a start that fails right after an update goes back too, and says why');
  goBackEngine(cfg, 'brainengine');
  fs.rmSync(path.join(tmp, 'brain-engine'), { recursive: true, force: true });
  put('brain-engine', 'brain-engine-v3', new Date(Date.now() - 5 * 864e5).toISOString());
  check(fallBackIfBlocked(cfg, exe, other) === null && installedMarker(cfg, BE)?.version === 'brain-engine-v3', 'an engine updated days ago that fails for another reason is left alone');
  fs.rmSync(path.join(tmp, 'brain-engine.previous'), { recursive: true, force: true });
  check(fallBackIfBlocked(cfg, exe, sac) === null, 'with no build kept from before, there is nothing to go back to');
}

// Wiring: every engine start goes through safeSpawn; the brain loads again on the old engine; chat and Settings.
const lc = read('src/llamacpp.js'), emb = read('src/embedder.js'), sc = read('src/share-card.js'), server = read('src/server.js'), cellar = read('public/cellar.js');
check(/const child = safeSpawn\(spawn, exe, args,/.test(lc) && /const back = fallBackIfBlocked\(this\.cfg, exe, e\);/.test(lc) && /if \(e\.fellBack && !signal\?\.aborted\) \{[\s\S]{0,120}return this\.preload\(model, signal,/.test(lc), 'the brain (and the talker beside a job) goes back and loads again on the old engine');
check(/safeSpawn\(spawn, this\.exe\(\)/.test(emb) && /safeSpawn\(this\.spawnFn, t\.path/.test(sc), 'the memory helper and the card-sharing server don\'t throw either');
check(/onEngineFallback\(\(r\) => \{ try \{ brain\.log\('engine', r\.say\); broadcast\(\{ type: 'announce', text: r\.say \}\);/.test(server), 'the words go to the chat');
check(/e\.blocked \? `<button data-engineback="\$\{esc\(e\.id\)\}">Try again<\/button>`/.test(cellar) && /Windows blocked the new build/.test(cellar), 'Settings, Engines says Windows blocked it and offers Try again');
check(/Go back to the previous engine \(\$\{esc\(prevName\(e, e\.previous\)\)\}\)/.test(cellar) && /replace\(\/\^brain-engine-\(b\\d\+\)\$\/, 'llama\.cpp \$1'\)/.test(cellar), 'the undo button reads "Go back to the previous engine (llama.cpp b12282)"');
const h = HELP.find((x) => x.id === 'smart-app-control'), faq = HELP.find((x) => x.id === 'faq-smart-app-control'), g = HELP.find((x) => x.id === 'glossary');
check(h && /Try again/.test(h.html) && /never switch Smart App Control off/.test(h.html) && faq && /<dt>Smart App Control<\/dt>/.test(g.html), 'Help, FAQ and the glossary explain Smart App Control');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
