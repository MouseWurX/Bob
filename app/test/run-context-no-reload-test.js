// Lamplight 0035: "Resize chat memory without reloading" (src/llamacpp.js resizeInPlace, off unless switched on).
// Run: node test/run-context-no-reload-test.js. Uses the fake llama-server; never reads the real card, RAM or folders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LlamaCpp, sameExceptCtx } from '../src/llamacpp.js';
import { cleanHarness, harnessView, HARNESS_LABELS } from '../src/harness.js';
import { OPT_IN } from '../src/crash-catch.js';

process.setMaxListeners(100);
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
let failures = 0, passes = 0;
const check = (ok, name, more = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !more ? '' : `  [${more}]`}`); if (ok) passes++; else failures++; };

// ---------- the pieces ----------
check(sameExceptCtx(['-m', 'a', '-c', '8192', '-fa', 'on'], ['-m', 'a', '-c', '32768', '-fa', 'on']), 'settings that differ only in -c count as the same');
check(!sameExceptCtx(['-m', 'a', '-c', '8192', '-ub', '512'], ['-m', 'a', '-c', '32768', '-ub', '2048']), 'any other difference does not');
check(!sameExceptCtx(['-m', 'a', '-c', '8192'], null), 'no earlier settings: not the same');
check(cleanHarness('contextNoReload', undefined) === false && cleanHarness('contextNoReload', 'yes') === false && cleanHarness('contextNoReload', true) === true, 'the switch is off unless set to true');
check(harnessView({}).contextNoReload === false, 'off in a fresh config');
check(OPT_IN.includes('contextNoReload'), 'Safe start turns it off with the other opt-in switches');
check(Boolean(HARNESS_LABELS.contextNoReload), 'it has a plain name for Settings undo and the readout');
const help = read('public/help-content.js');
check(/id: 'context-no-reload'/.test(help) && /id: 'faq-ctx-reload'/.test(help) && /<dt>Chat memory resize<\/dt>/.test(help), 'Help, an FAQ and a glossary entry');
check(/contextNoReload: \['Resize chat memory without reloading'/.test(read('public/harness.js')) && /sw\('contextNoReload'/.test(read('public/harness.js')), 'the switch shows in Settings');

// ---------- the engine, with the fake llama-server ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ctxnr-'));
const models = path.join(tmp, 'models');
const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', 'alpha');
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
fs.writeFileSync(path.join(models, 'blobs', 'sha256-c1'), 'GGUF');
fs.writeFileSync(path.join(dir, 'latest'), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: 'sha256:c1' }] }));
let n = 0;
const all = [];
const make = (cfgOver = {}) => {
  const dataDir = path.join(tmp, `data-${++n}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const cfg = { dataDir, agentDir: tmp, gpuVramGB: 16, llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 19700 + n * 20 }, ...cfgOver };
  const e = new LlamaCpp(cfg);
  e.logs = []; e.log = (k, t) => e.logs.push(t);
  e.cardReaders = { card: async () => null }; e.freeRam = () => 64 * 1024 ** 3;
  clearInterval(e.idleTimer);
  all.push(e);
  return e;
};
const state = async (e) => (await fetch(`${e.url}/test-ctx`)).json();

try {
  process.env.MOCK_CONTEXT = '1';
  {
    const e = make({ contextNoReload: true });
    await e.preload('alpha', null, { ctx: 8192 });
    const a = await state(e);
    await e.preload('alpha', null, { ctx: 16384 });
    const b = await state(e);
    check(a.pid === b.pid, 'switch on: the same engine keeps running (no restart)', `${a.pid} vs ${b.pid}`);
    check(b.n_ctx === 16384 && b.changes === 1, 'switch on: the engine was asked for the new chat memory', JSON.stringify(b));
    check(e.currentCtx === 16384, 'Bob knows the new chat memory');
    check(await e.isLoaded('alpha', { ctx: 16384 }), 'the brain counts as loaded at the new size');
    check(e.logs.some((t) => /chat memory 8192 -> 16384 without loading the brain again/.test(t)), 'the logbook says so', e.logs.join(' | '));
    await e.stopServer();
  }
  {
    const e = make({});
    await e.preload('alpha', null, { ctx: 8192 });
    const a = await state(e);
    await e.preload('alpha', null, { ctx: 16384 });
    const b = await state(e);
    check(a.pid !== b.pid && b.changes === 0, 'switch off: the engine restarts, as before');
    await e.stopServer();
  }
  process.env.MOCK_CONTEXT = '0';
  {
    const e = make({ contextNoReload: true });
    await e.preload('alpha', null, { ctx: 8192 });
    const a = await state(e);
    await e.preload('alpha', null, { ctx: 16384 });
    const b = await state(e);
    check(a.pid !== b.pid && b.n_ctx === 16384, 'an engine without it (404): restarts at the new size');
    check(e.logs.some((t) => /can't change its chat memory in place \(404\)/.test(t)), 'and the logbook says why');
    await e.stopServer();
  }
} finally {
  for (const e of all) { try { await e.stopServer(); } catch {} }
  delete process.env.MOCK_CONTEXT;
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
