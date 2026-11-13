// Reliability items 218-228: engine and memory care (src/engine-care.js, wired in src/llamacpp.js).
// Run: node test/run-engine-care-test.js. Uses the fake llama-server; never reads the real card, RAM or folders.
import { brainText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CrashBudget, plainEngineError, memoryFailure, shrinkCtx, memCheck, settingsOnly, sameSettings, settingsDiff, pickPort, portFree,
  SpeedWatch, speedBucket, checkBrainFile, recordBrainFile, brainFilesPath, TextCallWatch, readJson
} from '../src/engine-care.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { templateFor } from '../src/model-family.js';

process.setMaxListeners(100); // each engine adds its own exit handlers
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
let failures = 0, passes = 0;
const check = (ok, name, more = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !more ? '' : `  [${more}]`}`); if (ok) passes++; else failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return false; };

// ---------- pure parts ----------
{
  let t = 0;
  const b = new CrashBudget({ now: () => t });
  b.note('m'); t += 60_000; b.note('m');
  check(!b.spent('m'), '218: two crashes in ten minutes still restart');
  t += 60_000; b.note('m');
  check(b.spent('m') && b.waitMs('m') === 8 * 60_000, '218: the third crash in ten minutes stops the restarts, until the first one is ten minutes old');
  t += 8 * 60_000 + 1;
  check(!b.spent('m') && !b.spent('other'), '218: the window passes, and other brains have their own count');
}
check(plainEngineError('foo\ncudaMalloc failed: out of memory\n') === 'there wasn\'t enough free memory for it' && memoryFailure('ErrorOutOfDeviceMemory'), '226: running out of card memory, in plain words');
check(/too old/.test(plainEngineError("llama_model_load: error loading model: unknown model architecture: 'qwen9'")), '226: an engine too old for the brain');
check(/damaged or unfinished/.test(plainEngineError('gguf_init_from_file_impl: invalid magic characters')), '226: a damaged brain file');
check(plainEngineError('error: invalid argument: --spec-type') === 'the engine didn\'t accept a setting (--spec-type)', '226: a setting the engine refused is named');
check(/port/.test(plainEngineError('couldn\'t bind HTTP server socket')) && plainEngineError('all fine') === '', '226: a taken port; nothing made up when the words are unknown');
check(shrinkCtx(131072) === 65536 && shrinkCtx(12000) === 8192 && shrinkCtx(8192) === null, '221: half the chat memory, never under 8K');
{
  const GB = 1024 ** 3;
  const kvFor = (c) => c * 100_000; // 100 KB a token
  const fits = memCheck({ fileBytes: 10 * GB, kvFor, ctx: 32768, cardFreeMB: 16000, ramFreeBytes: 8 * GB });
  check(fits.ok, '220: a brain that fits the memory free now loads');
  const tight = memCheck({ fileBytes: 10 * GB, kvFor, ctx: 131072, cardFreeMB: 8000, ramFreeBytes: 8 * GB });
  check(!tight.ok && tight.fitsCtx === 32768, '220: too little free now: the biggest smaller chat memory that fits is worked out', JSON.stringify(tight));
  const never = memCheck({ fileBytes: 30 * GB, kvFor, ctx: 32768, cardFreeMB: 4000, ramFreeBytes: 4 * GB });
  check(!never.ok && never.fitsCtx === null, '220: a brain that can\'t fit at any size says so');
  check(memCheck({ fileBytes: 10 * GB, ctx: 32768, cardFreeMB: null }).ok, '220: no card reading (no NVIDIA card, a Mac): nothing is decided');
  check(!memCheck({ fileBytes: 10 * GB, ctx: 8192, cardFreeMB: 8000, ramFreeBytes: 64 * GB, cardOnly: true }).ok, '220: a brain that must sit on the card alone only counts the card');
}
{
  const a = ['-m', 'x.gguf', '--port', '8091', '-c', '32768', '--spec-type', 'draft-mtp'];
  const b = ['-m', 'x.gguf', '--port', '8101', '-c', '32768', '--rpc', '1.2.3.4:50052'];
  check(!settingsOnly(a).includes('--port') && !settingsOnly(b).includes('--rpc'), '222: the port and lent cards aren\'t part of a brain\'s settings');
  check(sameSettings(['-c', '1', '--port', '1'], ['-c', '1', '--port', '2']) && !sameSettings(a, b), '222: same settings on another port are the same settings');
  check(settingsDiff(a, ['-m', 'x.gguf', '-c', '16384']) === '-c 16384 -> 32768; added --spec-type draft-mtp', '222: the logbook names what changed', settingsDiff(a, ['-m', 'x.gguf', '-c', '16384']));
}
{
  const taken = new Set([9000, 9010]);
  check(await pickPort(9000, { isFree: async (p) => !taken.has(p) }) === 9013, '224: a taken port moves to the next free spare (every third, clear of the neighbours)');
  check(await pickPort(9000, { isFree: async () => true }) === 9000 && await pickPort(9000, { isFree: async () => false }) === null, '224: the usual port when free; none free says so');
  const s = net.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  check(!(await portFree(p)), '224: a port another program listens on is seen as taken');
  await new Promise((r) => s.close(r));
  check(await portFree(p), '224: ...and free once it lets go');
}
{
  const w = new SpeedWatch();
  for (let i = 0; i < 5; i++) w.add('m|card|32768', 0, 100, 200);
  check(w.add('m|card|32768', 0, 30, 200) === null, '225: one slow reply is not enough');
  const hit = w.add('m|card|32768', 0, 30, 200);
  check(hit?.slow && hit.usual === 100 && hit.now === 30, '225: two slow replies in a row (under 40% of usual) are spotted');
  check(w.add('m|card|32768', 0, 30, 10) === null && w.add('m|card|32768', 3, 30, 200) === null, '225: short replies and a much longer chat aren\'t judged against short chats');
  check(speedBucket(1000) === 0 && speedBucket(40000) === 4, '225: speeds are grouped by how much the chat holds');
}
{
  const w = new TextCallWatch();
  const r1 = w.note('m', { offered: true, rescued: true }), r2 = w.note('m', { offered: true, rescued: true });
  w.note('m', { offered: false, rescued: true }); w.note('m', { offered: true }); // no tools, or a plain answer: no change
  check(!r1 && !r2 && w.note('m', { offered: true, rescued: true }), '228: three replies in a row with tool calls written as text');
  w.note('m', { offered: true, rescued: true }); w.note('m', { offered: true, real: true });
  check(!w.note('m', { offered: true, rescued: true }), '228: a real tool call starts the count again');
}

// ---------- the engine itself, with the fake llama-server ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-care-'));
const models = path.join(tmp, 'models');
const blob = (name, tag, hex, body = 'GGUF') => {
  const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', name);
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
  const f = path.join(models, 'blobs', `sha256-${hex}`);
  fs.writeFileSync(f, body);
  fs.writeFileSync(path.join(dir, tag), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: `sha256:${hex}` }] }));
  return f;
};
blob('alpha', 'latest', 'a1');
const betaFile = blob('beta', 'latest', 'b2');
blob('junk', 'latest', 'c3', 'NOPE this is not a brain');
let n = 0;
const make = (over = {}) => {
  const dataDir = path.join(tmp, `data-${++n}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const cfg = { dataDir, agentDir: tmp, llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 18400 + n * 20, ...over } };
  const e = new LlamaCpp(cfg);
  e.logs = []; e.log = (k, t) => e.logs.push(t);
  e.cardReaders = { card: async () => null }; e.freeRam = () => 0; // no real card or RAM readings
  e.restartDelayMs = 50;
  clearInterval(e.idleTimer);
  return e;
};
const all = [];
const fresh = (over) => { const e = make(over); all.push(e); return e; };

try {
  // 223
  {
    const e = fresh();
    let starts = 0; const real = e.startEngine.bind(e); e.startEngine = (...a) => { starts++; return real(...a); };
    await Promise.all([e.preload('alpha'), e.preload('alpha')]);
    check(starts === 1 && await e.isLoaded('alpha'), '223: two jobs that both find the brain missing load it once', `starts ${starts}`);
    await Promise.all([e.preload('beta'), e.preload('alpha')]);
    check(starts === 3 && e.current === 'alpha' && await e.isLoaded('alpha'), '223: two different brains load one after the other, not over each other');
    await e.stopServer();
  }
  // 224
  {
    const e = fresh();
    const s = net.createServer((c) => c.end('HTTP/1.1 200 OK\r\n\r\n')); await new Promise((r) => s.listen(e.basePort, '127.0.0.1', r));
    await e.preload('alpha');
    check(e.port !== e.basePort && await e.isLoaded('alpha') && e.logs.some((t) => /is taken by another program/.test(t)), '224: another program on the port: the engine starts on a spare one', `${e.port}`);
    const args = fs.readFileSync(path.join(e.cfg.dataDir, 'llama-server-args.txt'), 'utf8');
    check(args.includes(`--port ${e.port}`), '224: ...and is told that port');
    await e.stopServer(); await new Promise((r) => s.close(r));
    await e.preload('alpha');
    check(e.port === e.basePort, '224: the usual port again once it\'s free');
    await e.stopServer();
  }
  // 221 + 226
  {
    const e = fresh();
    process.env.MOCK_OOM_ABOVE = '16384';
    await e.preload('alpha', undefined, { ctx: 32768 });
    check(e.currentCtx === 16384 && await e.isLoaded('alpha', { ctx: 32768 }), '221: out of memory at 32K: loaded once more at 16K, and it counts as the brain asked for', `${e.currentCtx}`);
    check(e.realCtx('alpha', 32768) === 16384, '221: the chat is fitted to the memory it really has');
    const notes = e.takeNotes();
    check(notes.length === 1 && /too full .* at 32K, so I loaded it with a 16K chat memory/.test(notes[0]) && e.takeNotes().length === 0, '221: the chat is told once, in one line', notes.join(' | '));
    await e.stopServer();
    await e.preload('alpha', undefined, { ctx: 32768 });
    check(e.currentCtx === 16384 && e.logs.filter((t) => /trying once more at/.test(t)).length === 1, '221: the next load goes straight to the size that worked');
    await e.stopServer();
    let err = null;
    try { await e.preload('alpha', undefined, { ctx: 8192, cpu: true }); } catch (x) { err = x; }
    check(!err, '221: a size that fits loads as usual', err?.message);
    await e.stopServer();
    process.env.MOCK_OOM_ABOVE = '1000';
    const e2 = fresh();
    err = null;
    try { await e2.preload('alpha', undefined, { ctx: 8192 }); } catch (x) { err = x; }
    check(err && /wouldn't start: there wasn't enough free memory for it/.test(err.message) && err.noRetry === true && /stopped while loading alpha/.test(err.message), '226: out of memory with nothing smaller to try: the plain reason, and the gate doesn\'t load it again and again', err?.message);
    delete process.env.MOCK_OOM_ABOVE;
  }
  // 222 + 226
  {
    const e = fresh();
    let err = null;
    e.cfg.llamacpp.modelArgs = { alpha: ['--bad-flag'] };
    try { await e.preload('alpha'); } catch (x) { err = x; }
    check(err && /wouldn't start: the engine didn't accept a setting \(--bad-flag\)/.test(err.message), '226: a refused setting is named in the reason', err?.message);
    delete e.cfg.llamacpp.modelArgs;
    await e.preload('alpha');
    const saved = readJson(path.join(e.cfg.dataDir, 'engine-care.json'), {});
    check(saved.lastGood?.['alpha|0']?.args?.includes('-m'), '222: the settings that started a brain are kept');
    await e.stopServer();
    e.cfg.llamacpp.modelArgs = { alpha: ['--bad-flag'] };
    err = null;
    try { await e.preload('alpha'); } catch (x) { err = x; }
    const notes = e.takeNotes();
    check(!err && await e.isLoaded('alpha') && notes.some((t) => /wouldn't start with its newest engine settings, so I started it with the ones that worked last time/.test(t)), '222: a failed start goes back to the last good settings once, and says so', err?.message || notes.join(' | '));
    check(e.logs.some((t) => /trying the settings that worked on .*added --bad-flag/.test(t)), '222: the logbook names the setting that broke it');
    await e.stopServer();
    delete e.cfg.llamacpp.modelArgs;
  }
  // 218
  {
    const e = fresh();
    await e.preload('alpha');
    for (let i = 1; i <= 2; i++) {
      await fetch(e.url + '/test-crash').catch(() => {});
      const back = await until(async () => (await e.isLoaded('alpha')) && e.logs.filter((t) => /back up after the crash/.test(t)).length === i);
      check(back, `218: crash ${i}: the engine restarts by itself`);
    }
    await fetch(e.url + '/test-crash').catch(() => {});
    await until(async () => e.logs.some((t) => /not restarting it again/.test(t)));
    await sleep(300);
    check(!(await e.isLoaded('alpha')) && e.logs.some((t) => /the engine stopped by itself \(code 3\): .*illegal memory access|the engine stopped by itself \(code 3\)/.test(t)), '218: the third crash in ten minutes: no more restarts');
    const notes = e.takeNotes();
    check(notes.some((t) => /crashed 3 times in 10 minutes .* so I've stopped restarting it for now/.test(t)), '218: ...and the chat says so plainly', notes.join(' | '));
    let err = null;
    try { await e.preload('alpha'); } catch (x) { err = x; }
    check(err?.code === 'crash_hold' && err.noRetry === true, '218: a job asking for it meanwhile gets the plain reason (and another brain can take the job)');
    let busy = null; const e2 = fresh();
    await e2.preload('alpha'); e2.active = 1;
    await fetch(e2.url + '/test-crash').catch(() => {});
    await sleep(600); busy = e2.logs.some((t) => /restarting the engine by itself/.test(t));
    check(!busy, '218: a crash during a reply is left to the reply\'s own reload (no second load beside it)');
    e2.active = 0;
  }
  // 219
  {
    const e = fresh();
    await e.preload('alpha');
    const real = e.health.bind(e); e.health = async () => false;
    check(!(await e.isLoaded('alpha')) && e.logs.some((t) => /running but didn't answer its health check/.test(t)), '219: a running engine that doesn\'t answer the health check is started fresh');
    e.health = real;
    check(/if \(await this\.health\(\)\) return true;/.test(read('src/llamacpp.js')) && /isReady\(m, o\)/.test(read('src/handoff.js')), '219: the health check runs before each job (the gate asks isLoaded)');
    await e.stopServer();
  }
  // 220
  {
    const e = fresh();
    e.cardReaders = { card: async () => ({ util: 0, freeMB: 100 }) };
    let err = null;
    try { await e.preload('alpha'); } catch (x) { err = x; }
    check(err?.code === 'no_room' && /isn't enough free memory to load the alpha brain right now/.test(err.message) && err.noRetry, '220: the card\'s real free memory now is too little: said before the engine starts', err?.message);
    e.cardReaders = { card: async () => ({ util: 0, freeMB: 2000 }) };
    err = null;
    try { await e.preload('alpha'); } catch (x) { err = x; }
    check(!err && e.logs.some((t) => /card has 2000 MB free/.test(t)), '220: with room, it loads, and the logbook has the reading', err?.message);
    await e.stopServer();
    let cpuErr = null;
    e.cardReaders = { card: async () => ({ util: 0, freeMB: 1 }) };
    try { await e.preload('alpha', undefined, { cpu: true }); } catch (x) { cpuErr = x; }
    check(!cpuErr, '220: a brain on the processor isn\'t judged by the card');
    await e.stopServer();
  }
  // 227
  {
    const e = fresh();
    let err = null;
    try { await e.preload('junk'); } catch (x) { err = x; }
    check(!err || err.code !== 'bad_file', '227: a file Bob didn\'t download is left to the engine to judge');
    await e.stopServer();
    const junk = e.resolve('junk').gguf; const jr = {}; jr[path.resolve(junk)] = { bytes: fs.statSync(junk).size, mtimeMs: Math.round(fs.statSync(junk).mtimeMs) };
    fs.writeFileSync(brainFilesPath(e.cfg), JSON.stringify(jr));
    err = null;
    try { await e.preload('junk'); } catch (x) { err = x; }
    check(err?.code === 'bad_file' && /doesn't start like a brain file/.test(err.message), '227: a file that isn\'t a brain file is stopped before loading', err?.message);
    fs.rmSync(brainFilesPath(e.cfg));
    recordBrainFile(e.cfg, betaFile, { bytes: 4 }); // only .gguf files are recorded
    check(!fs.existsSync(brainFilesPath(e.cfg)), '227: only brain files are recorded');
    const g = path.join(tmp, 'gamma.gguf'); fs.writeFileSync(g, 'GGUF1234');
    recordBrainFile(e.cfg, g, { bytes: 8, sha256: 'a'.repeat(64) });
    let hashed = 0; const hash = async () => { hashed++; return 'a'.repeat(64); };
    check(await checkBrainFile(e.cfg, g, { hash }) === '' && hashed === 0, '227: unchanged since its download: no slow checksum');
    fs.appendFileSync(g, 'xx');
    check(/wrong size/.test(await checkBrainFile(e.cfg, g, { hash })), '227: a different size from the download is caught');
    fs.writeFileSync(g, 'GGUF5678'); const later = new Date(Date.now() + 5000); fs.utimesSync(g, later, later);
    check(await checkBrainFile(e.cfg, g, { hash }) === '' && hashed === 1, '227: changed since its download: the checksum is checked once');
    check(await checkBrainFile(e.cfg, g, { hash }) === '' && hashed === 1, '227: ...and not again once it matched');
    fs.utimesSync(g, new Date(Date.now() + 9000), new Date(Date.now() + 9000));
    check(/checksum no longer matches/.test(await checkBrainFile(e.cfg, g, { hash: async () => 'b'.repeat(64) })), '227: a checksum that no longer matches is caught');
    check(/recordBrainFile\(this\.cfg, final, \{ bytes: got, sha256: digest \}\)/.test(read('src/models.js')), '227: every checked download is recorded');
  }
  // 225
  {
    const e = fresh();
    await e.preload('alpha');
    for (let i = 0; i < 5; i++) e.speedNote('alpha', { predicted_per_second: 120, predicted_n: 300 }, 500);
    e.speedNote('alpha', { predicted_per_second: 20, predicted_n: 300 }, 500); e.speedNote('alpha', { predicted_per_second: 20, predicted_n: 300 }, 500);
    const notes = e.takeNotes();
    check(notes.some((t) => /answering at about 20 words a second, well under its usual 120/.test(t)), '225: a slow engine is spotted and the chat says so', notes.join(' | '));
    check(!(await e.isLoaded('alpha')) && !(await e.isLoaded('alpha')), '225: it counts as not loaded until it is loaded fresh');
    await e.preload('alpha');
    check(await e.isLoaded('alpha') && e.logs.some((t) => /loading it fresh, as planned/.test(t)), '225: ...then it is loaded fresh once, before the next job');
    await e.stopServer();
  }
  // 228
  {
    const fam = path.join(tmp, 'oss.gguf');
    const kv = (k, v) => { const kb = Buffer.from(k); const vb = Buffer.from(v); const h = Buffer.alloc(8); h.writeBigUInt64LE(BigInt(kb.length)); const t = Buffer.alloc(4); t.writeUInt32LE(8); const l = Buffer.alloc(8); l.writeBigUInt64LE(BigInt(vb.length)); return Buffer.concat([h, kb, t, l, vb]); };
    const head = Buffer.alloc(24); head.write('GGUF', 0, 'latin1'); head.writeUInt32LE(3, 4); head.writeBigUInt64LE(0n, 8); head.writeBigUInt64LE(3n, 16);
    fs.writeFileSync(fam, Buffer.concat([head, kv('general.architecture', 'gpt-oss'), kv('general.name', 'gpt-oss 20b'), kv('tokenizer.chat_template', '{{ own }}')]));
    const own = templateFor({}, 'gpt-oss:20b', fam), forced = templateFor({}, 'gpt-oss:20b', fam, { force: true });
    check(own === null && /gpt-oss\.jinja$/.test(forced || ''), '228: a file with its own template can be given its family\'s', `${own} ${forced}`);
    check(templateFor({ templates: { 'gpt-oss:20b': 'own' } }, 'gpt-oss:20b', fam, { force: true }) === null, '228: a template set by hand still wins');
    const e = fresh({ models: { 'gpt-oss:20b': fam } });
    for (let i = 0; i < 3; i++) e.textCallNote('gpt-oss:20b', { offered: true, rescued: true });
    check(e.careData.templates.includes('gpt-oss:20b') && e.reloadWanted.has('gpt-oss:20b') && e.templateArgs('gpt-oss:20b', fam).some((a) => /gpt-oss\.jinja$/.test(a)), '228: three text tool calls in a row: its family\'s template from its next load');
    check(e.takeNotes().some((t) => /kept writing its tool calls as plain text/.test(t)), '228: ...and the chat says so');
    for (let i = 0; i < 3; i++) e.textCallNote('gpt-oss:20b', { offered: true, rescued: true });
    check(!e.careData.templates.includes('gpt-oss:20b') && e.templateArgs('gpt-oss:20b', fam).length === 0, '228: still text after the swap: back to its own template');
    for (let i = 0; i < 3; i++) e.textCallNote('gpt-oss:20b', { offered: true, rescued: true });
    check(!e.careData.templates.includes('gpt-oss:20b'), '228: it is only tried once (no flip-flopping)');
    const e2 = fresh();
    for (let i = 0; i < 3; i++) e2.textCallNote('alpha', { offered: true, rescued: true });
    check(!e2.careData.templates.length && e2.logs.some((t) => /no family template to try/.test(t)), '228: no family template: nothing changes (Bob still reads those calls)');
  }
  // Wiring and the start-of-job prompt
  {
    const brain = brainText(), care = read('src/engine-care.js');
    check(/engineNotes\(emit\) \{[\s\S]{0,400}type: 'announce', text/.test(brain) && /this\.engineNotes\(emit\);\n    return used;/.test(brain), 'the engine\'s notes are one line in the chat (announcements), shown when a job starts or a reply ends');
    check(!/systemPrompt|role: 'system'/.test(care), 'nothing here adds words to what the brain reads');
    check(/e\.noRetry\) break;/.test(read('src/handoff.js')), 'the gate doesn\'t repeat a load the engine already tried every way');
  }
} finally {
  for (const e of all) { try { e.restartDelayMs = 1e9; await e.stopServer(); } catch {} }
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
