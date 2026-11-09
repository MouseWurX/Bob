// 1.5.72: the Memory slot's embedding model runs on Bob's own engine (a small llama-server with --embedding),
// and every catalogue brain can be downloaded without Ollama. Run: node test/run-embed-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LlamaCpp } from '../src/llamacpp.js';
import { Housekeeper } from '../src/housekeeping.js';
import { embedArgs } from '../src/embedder.js';
import { enginesFor, starterPlan } from '../public/equip.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };
const cat = JSON.parse(fs.readFileSync(path.join(here, '..', 'catalog.json'), 'utf8'));

// Every model in the shop has a direct, pinned download (Ollama is never the only way to get one).
const ollamaOnly = cat.models.filter((m) => m.ollama && !(m.files || []).length).map((m) => m.id);
check(ollamaOnly.length === 0, `no catalogue model comes only through Ollama (${ollamaOnly.join(', ') || 'none'})`);
for (const id of ['gemma4-e4b', 'gemma4-26b', 'qwen3.8-27b', 'qwen2.5-coder-7b', 'qwen2.5-vl-7b', 'nomic-embed-text']) {
  const m = cat.models.find((x) => x.id === id);
  const ok = m.files.every((f) => /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/resolve\/[0-9a-f]{40}\/[\w.-]+\.gguf$/.test(f.url) && /^[0-9a-f]{64}$/.test(f.sha256) && f.bytes > 1e8) && m.files.some((f) => f.role === 'gguf');
  check(ok, `${id}: pinned Hugging Face commit, sha256 and size`);
}
// Bob finds a model file by its name, so two .gguf files with one name must be the same file (one checksum).
const byName = new Map();
for (const m of cat.models) for (const f of m.files || []) { const n = (f.saveAs || f.url.split('/').pop()).toLowerCase(); if (n.endsWith('.gguf')) byName.set(n, new Set([...(byName.get(n) || []), f.sha256])); }
const clash = [...byName].filter(([, s]) => s.size > 1).map(([n]) => n);
check(!clash.length, `.gguf files that share a name are the same file (${clash.join(', ') || 'all are'})`);

// The welcome button also fetches the engines: llama.cpp for brain files, a model's own `needs` (pictures, voice).
const engines = [{ id: 'llamacpp', name: 'llama.cpp', installed: false }, { id: 'sdcpp', name: 'stable-diffusion.cpp', installed: false }, { id: 'whispercpp', name: 'whisper.cpp', installed: true }];
const e4b = cat.models.find((m) => m.id === 'gemma4-e4b');
const zimg = cat.models.find((m) => m.needs === 'stable-diffusion.cpp');
check(JSON.stringify(enginesFor([e4b, zimg, e4b], engines)) === '["engine:llamacpp","engine:sdcpp"]', 'first-time setup adds llama.cpp and stable-diffusion.cpp once each');
check(enginesFor([e4b], [{ ...engines[0], installed: true }]).length === 0, 'an engine already here is not downloaded again');
check(enginesFor([e4b], [{ ...engines[0], available: false }]).length === 0, 'an engine not made for this computer is skipped');
const plan = starterPlan({ models: ['gemma4-e4b', 'nomic-embed-text'] }, cat.models, engines, new Set(['gemma4-e4b', 'nomic-embed-text']));
check(plan.ids.join() === 'gemma4-e4b,engine:llamacpp,nomic-embed-text', `starter plan: models plus llama.cpp once (${plan.ids.join()})`);

// The embedding server itself.
check(embedArgs('x.gguf', 9).join(' ').includes('--embedding --pooling mean') && embedArgs('x.gguf', 9).includes('-ngl'), 'embedding server: --embedding, mean pooling, no card layers');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-embed-'));
const own = path.join(tmp, 'Bob home', 'models', 'bob', 'embed');
fs.mkdirSync(own, { recursive: true });
fs.writeFileSync(path.join(own, 'nomic-embed-text-v1.5.f16.gguf'), 'GGUF');
const cfg = { agentDir: path.join(tmp, 'Bob home'), dataDir: tmp, llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], port: 18391 } };
const eng = new LlamaCpp(cfg);
const v = await eng.embed('nomic-embed-text', ['abc', 'hello']);
check(JSON.stringify(v) === '[[3,1,0],[5,1,0]]', `vectors come back in input order (${JSON.stringify(v)})`);
const a = await (await fetch(`http://127.0.0.1:${18391 + 2}/test-args`)).json();
check(a.cuda === '-1' && a.argv.includes('--embedding'), 'runs on its own port, on the processor only (card hidden)');
check(eng.current === null, 'the chat brain is not touched');
const ee = eng.embedder();
ee.lastUse = Date.now() - 200_000;
const pid = ee.child.pid;
ee.now = () => Date.now();
if (ee.child && ee.now() - ee.lastUse > 120_000) ee.stop();
await new Promise((r) => setTimeout(r, 300));
let alive = true; try { process.kill(pid, 0); } catch { alive = false; }
check(!alive && !ee.child, 'let go after two minutes unused');
const v2 = await eng.embed('nomic-embed-text', 'again');
check(v2.length === 1 && v2[0][0] === 5, 'starts again on the next use');
let gamingErr = null;
cfg.session = 'light';
try { await eng.embed('nomic-embed-text', 'x'); } catch (e) { gamingErr = e; }
check(Boolean(gamingErr), 'never runs in the Gaming session');
cfg.session = undefined;
await eng.unloadAll();
check(!ee.child, 'Unload everything stops it too');

// The housekeeper: a miss (not downloaded yet) is tried again later, not never.
const cfg2 = { ...cfg, agentDir: path.join(tmp, 'none'), llamacpp: { ...cfg.llamacpp, port: 18491 } };
const eng2 = new LlamaCpp(cfg2);
const hk = new Housekeeper(cfg2, { engine: eng2 });
check((await hk.embed(['x'])) === null && hk.noEmbed, 'no model file: Topics fall back to words');
let t = Date.now();
hk.now = () => t;
hk.noEmbedAt = t;
fs.mkdirSync(path.join(cfg2.agentDir, 'models', 'bob', 'embed'), { recursive: true });
fs.copyFileSync(path.join(own, 'nomic-embed-text-v1.5.f16.gguf'), path.join(cfg2.agentDir, 'models', 'bob', 'embed', 'nomic-embed-text-v1.5.f16.gguf'));
check((await hk.embed(['x'])) === null, 'not asked again within 10 minutes');
t += 601e3;
const v3 = await hk.embed(['xy']);
check(Array.isArray(v3) && v3[0][0] === 2 && !hk.noEmbed, 'after 10 minutes the downloaded model is used');
hk.stop();
await eng2.unloadAll();

// With Ollama as the engine, a downloaded file still works through Bob's own llama-server.
const hk3 = new Housekeeper({ ...cfg, llamacpp: { ...cfg.llamacpp, embedPort: 18595 } }, { engine: { embed: async () => { throw new Error('not in Ollama'); } } });
const v4 = await hk3.embed(['abcd']);
check(Array.isArray(v4) && v4[0][0] === 4, 'Ollama engine without the model: Bob\'s own file is used');
hk3.ownEmbed?.stop(); hk3.stop();

// Settings review: the Welcome size counts the programs too, since the click is the OK.
{
  const cellarSrc = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
  const { engineStatus, ENGINE_GB } = await import('../src/engines.js');
  check(/About <strong>\$\{gb\(order\.sizeGB\)\}<\/strong> to download/.test(cellarSrc) && /<h4>Programs I run on<\/h4>/.test(cellarSrc), 'Welcome: "About X GB to download", the programs listed with the models, and X counts them (1.5.91)');
  check(ENGINE_GB.llamacpp > 0 && engineStatus({ agentDir: '/nowhere' }).every((e) => e.sizeGB > 0), 'every engine has a download size');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failures ? failures + ' failed' : 'all passed'}`);
process.exit(failures ? 1 : 0);
