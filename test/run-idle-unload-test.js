// 1.5.2: Bob's own engine (llama.cpp) unloads its brain after the shared keep-alive, so a quiet Bob frees the
// graphics card. Uses the fake llama-server and a fake clock (engine.now), so nothing waits for real minutes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LlamaCpp, keepAliveMs } from '../src/llamacpp.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

check('keep-alive: "10m" is 10 minutes, "30m", "1h", "-1" never, and junk or nothing falls back to 5 minutes',
  keepAliveMs({ ollamaKeepAlive: '10m' }) === 600000 && keepAliveMs({ ollamaKeepAlive: '30m' }) === 1800000 && keepAliveMs({ ollamaKeepAlive: '1h' }) === 3600000 && keepAliveMs({ ollamaKeepAlive: '-1' }) === Infinity && keepAliveMs({ ollamaKeepAlive: 'soon' }) === 300000 && keepAliveMs({}) === 300000);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-idle-'));
const models = path.join(tmp, 'models');
const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', 'gemma4');
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
fs.writeFileSync(path.join(models, 'blobs', 'sha256-aaa111'), 'GGUF');
fs.writeFileSync(path.join(dir, '26b'), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: 'sha256:aaa111' }] }));
const dataDir = path.join(tmp, 'inn', 'bob'); fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir: tmp, dataDir, ollamaKeepAlive: '10m', llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 18093, args: [] } };

const eng = new LlamaCpp(cfg);
let t = 1_000_000;
eng.now = () => t;
const alive = () => Boolean(eng.child && eng.child.exitCode === null);
await eng.preload('gemma4:26b');
check('the brain loads', alive() && await eng.isLoaded('gemma4:26b'));
const l = await eng.loaded();
check('/api/idle gets the loaded brain; its graphics memory is filled in or left out cleanly (0, shown as unknown)', l.length === 1 && l[0].name === 'gemma4:26b' && Number.isFinite(l[0].vram) && l[0].vram >= 0);

t += 9 * 60_000;
check('9 minutes quiet with a 10-minute keep-alive: still loaded', !(await eng.idleTick()) && alive());
let busy = true;
eng.isBusy = () => busy;
t += 30 * 60_000;
check('while a turn or queued job is working, it is never unloaded, however long', !(await eng.idleTick()) && alive());
busy = false;
t += 5 * 60_000;
check('the busy time counts as use: 5 minutes after the job, still loaded', !(await eng.idleTick()) && alive());
eng.active = 1;
t += 60 * 60_000;
check('never mid-chat', !(await eng.idleTick()) && alive());
eng.active = 0;
eng.lastUse = t;
t += 10 * 60_000 + 1000;
const pid = eng.child.pid;
check('over 10 minutes idle: unloaded, the graphics card is free', await eng.idleTick() && !alive() && eng.current === null && (await eng.loaded()).length === 0);
await new Promise((r) => setTimeout(r, 300));
let gone = false; try { process.kill(pid, 0); } catch { gone = true; }
check('the llama-server process is really gone', gone);
check('the next chat loads it again, as today', !(await eng.isLoaded('gemma4:26b')) && (await eng.preload('gemma4:26b')) >= 0 && alive());

cfg.ollamaKeepAlive = '-1';
t += 24 * 3600_000;
check('"Never" keeps it loaded', !(await eng.idleTick()) && alive());
cfg.ollamaKeepAlive = '5m';
t += 5 * 60_000 + 1;
check('the setting applies straight away (5 minutes)', await eng.idleTick() && !alive());
check('nothing to do when nothing is loaded', !(await eng.idleTick()));
check('the check runs every minute and does not keep Bob open on its own', eng.idleTimer && eng.idleTimer.hasRef?.() === false);

// The brain tells the engine when it's busy; the setting is in Advanced, Speed & memory.
const brain = fs.readFileSync(path.join(here, '..', 'src', 'brain.js'), 'utf8');
const ui = fs.readFileSync(path.join(here, '..', 'public', 'cellar.js'), 'utf8');
check('the brain wires isBusy: a running turn or a working queue job', /this\.engine\.isBusy = \(\) => this\.turns\.size > 0 \|\| this\.queue\.some\(\(j\) => j\.state === 'working'\)/.test(brain));
check('one setting for both engines, in Settings, Show advanced settings, Speed & memory: 1, 2, 2½, 5, 10, 15, 30 minutes, 1 hour, no Never (the chat-page switch covers that)', /data-set="keepAlive"/.test(ui) && /\['1m', '1 minute'\], \['2m', '2 minutes'\], \['150s', '2½ minutes'\], \['5m', '5 minutes'\], \['10m', '10 minutes'\], \['15m', '15 minutes'\], \['30m', '30 minutes'\], \['1h', '1 hour'\]\]/.test(ui) && !/Never \(keep/.test(ui) && /ollamaKeepAlive: el\.value/.test(ui));
check('2½ minutes ("150s") works for Bob\'s own engine too', keepAliveMs({ ollamaKeepAlive: '150s' }) === 150000 && keepAliveMs({ ollamaKeepAlive: '1m' }) === 60000);

clearInterval(eng.idleTimer);
await eng.stopServer();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
