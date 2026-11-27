// Nov 27 GUPPI's test-results database (src/measured-db.js, src/measured-seed.json, installer/make-measured-seed.mjs).
// The owner: "a small database of all the test results so guppi can properly calibrate", "a baseline for people, and
// their own calibration step (if they choose to do it) would align all the features to their setup". Fakes only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanRow, readSeed, readLocal, readAll, append, localFile, speedsFor, settingsFromCmd, beOf, pcFromEnv, rowsFromRuns, rowFromTry, samePc } from '../src/measured-db.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { holdout, pcKey } from '../src/measured-holdout.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const appDir = fileURLToPath(new URL('..', import.meta.url));

// ---------- the seed that ships ----------
{
  const rows = readSeed();
  check('the seed ships with Bob and every row is clean', rows.length > 500 && rows.every((r) => cleanRow(r) && r.brain.file && r.pc), `${rows.length} rows`);
  check('only measured numbers: every row has a measured speed or a fit result', rows.every((r) => r.result.readTps > 0 || r.result.writeTps > 0 || r.fit));
  const text = read('src/measured-seed.json');
  check('the seed holds no names, folders or addresses', !/[A-Z]:\\\\|\/home\/|\/Users\/|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|@[a-z0-9-]+\.[a-z]{2,}/i.test(text));
  check('it is made from the raw files in the repository, by a script', /make-measured-seed/.test(read('src/measured-db.js')) && fs.existsSync(path.join(appDir, 'installer', 'make-measured-seed.mjs')));
}

// ---------- reading the speed test runner's raw files ----------
{
  const s = settingsFromCmd('-m x.gguf -c 49152 -ctk q8_0 -b 4096 -ub 4096 --moe-cache-mib 4096 --moe-cache-cpu-share 0', ['LLAMA_MOE_CACHE_FILL']);
  check('settings from the engine flags: step, cache, its kind, fill, chat memory type, context', s.step === 4096 && s.cacheMiB === 4096 && s.cacheShare === 0 && s.fill && s.kv === 'q8_0' && s.ctx === 49152 && !s.mtp);
  check('a guesser is noticed', settingsFromCmd('-m x --spec-type draft-mtp').mtp === true && settingsFromCmd('-m x -md d.gguf').mtp === true);
  check('engine builds: be9 and ll46 are builds, stock is 0, anything else unknown', beOf('be9') === 9 && beOf('LL46b2') === 46 && beOf('stock') === 0 && beOf('who') === null);
  const pc = pcFromEnv({ card: 'Test Card 16, 16303 MiB, 600.1', ramMB: 31862, cpu: 'Test CPU', os: 'Windows' });
  check('the PC from environment.json: card name, its MiB, RAM', pc.card === 'Test Card 16' && pc.cardMiB === 16303 && pc.ramMB === 31862);
  const lines = [JSON.stringify({ row: '2x4', round: 1, engine: 'be9', cmd: '-m /x/Brain-Q4.gguf -c 32768 -b 2048 -ub 2048 --moe-cache-mib 4096 --moe-cache-cpu-share 0', env: [], runs: [{ prompt: 'k16', promptN: 16000, readTps: 2300, writeTps: 99, firstWordMs: 7000, writtenN: 300, textSha: 'abc' }, { prompt: 'start', promptN: 40, readTps: 100, writeTps: 101 }] }), 'not json'];
  const rows = rowsFromRuns(lines, { card: 'Test Card 16, 16303 MiB', ramMB: 31862 }, 'night1');
  check('one row per prompt, the brain file name only (no folder)', rows.length === 2 && rows[0].brain.file === 'Brain-Q4.gguf' && rows[0].be === 9 && rows[0].result.firstWordS === 7 && rows[0].prompt.n === 16000 && /night1 row 2x4 round 1/.test(rows[0].source));
}

// ---------- the order GUPPI reads it in ----------
const PC16 = { card: 'Card 16', cardMiB: 16303, ramMB: 31862 }, PC6 = { card: 'Card 6', cardMiB: 6144, ramMB: 32768 }, PC12 = { card: 'Card 12', cardMiB: 12288, ramMB: 65536 };
const mk = (pc, be, step, read, write, extra = {}) => cleanRow({ brain: { file: 'B.gguf' }, pc, be, settings: { step, cacheMiB: 4096, cacheShare: 0, ctx: 32768, kv: 'q8_0', ...extra.settings }, prompt: { kind: extra.kind || 'k16', n: 16000 }, result: { readTps: read, writeTps: write }, ...(extra.fit ? { fit: extra.fit } : {}) });
{
  const rows = [mk(PC16, 46, 2048, 2000, 100), mk(PC16, 46, 4096, 3000, 90), mk(PC16, 40, 2048, 1500, 80), mk(PC12, 46, 2048, 1800, 70), mk(PC6, 46, 2048, 500, 20)];
  const q = (o) => speedsFor(rows, { file: '/some/folder/B.gguf', cache: true, ctx: 32768, kv: 'q8_0', ...o });
  const a = q({ pc: PC16, be: 46 });
  check('1. the same brain file on this PC with this engine build', a.write[2048] === 100 && a.read[4096] === 3000 && a.from.level === 'this PC, this engine build' && a.old.write.join() === '2048,4096');
  const b = q({ pc: PC16, be: 45 });
  check('2. else the nearest engine build on this PC', b.from.level === 'this PC, engine build 46' && b.write[2048] === 100);
  const c = q({ pc: { cardMiB: 12000, ramMB: 16000 }, be: 46 });
  check('3. else the same brain on the nearest card of a similar size', c.from.level === 'another PC (Card 12)' && c.write[2048] === 70);
  check('a card much smaller or bigger isn\'t used (a 16 GB card says little about a 4 GB one)', q({ pc: { cardMiB: 4096, ramMB: 8192 }, be: 46 }) === null || q({ pc: { cardMiB: 4096, ramMB: 8192 }, be: 46 }).from.cardMiB === 6144);
  check('4. else nothing: GUPPI uses his built-in table', q({ pc: { cardMiB: 80000, ramMB: 8192 }, be: 46 }) === null && speedsFor(rows, { file: 'Other.gguf', pc: PC16 }) === null);
  check('the same PC means the card within 512 MiB and RAM within 2 GB', samePc(PC16, { cardMiB: 16384, ramMB: 32768 }) && !samePc(PC16, { cardMiB: 16384, ramMB: 65536 }) && !samePc(PC16, { ...PC16, apu: true }));
}
{
  const rows = [mk(PC16, 46, 2048, 2000, 100), mk(PC16, 46, 2048, 9999, 999, { settings: { mtp: true } }), mk(PC16, 46, 4096, 9999, 999, { fit: { ok: false, why: 'spill' } }), mk(PC16, 46, 2048, 1, 1, { settings: { cacheMiB: 0 } }), mk(PC16, 46, 2048, 1, 1, { settings: { env: ['LLAMA_TEST_SWITCH'] } })];
  const a = speedsFor(rows, { file: 'B.gguf', pc: PC16, be: 46, cache: true, kv: 'q8_0' });
  check('only his own way counts: no guesser, no try that didn\'t fit, the copy cache as he loads, no test switch', a.write[2048] === 100 && !a.write[4096]);
  check('without the copy cache only rows without it', speedsFor(rows, { file: 'B.gguf', pc: PC16, be: 46, cache: false, kv: 'q8_0' }).write[2048] === 1);
}
{
  // like with like: the biggest cache measured, and the same kinds of prompt at every step
  const rows = [mk(PC16, 46, 512, 1000, 110, { kind: 'start', settings: { cacheMiB: 4096 } }), mk(PC16, 46, 2048, 2000, 100, { kind: 'start' }), mk(PC16, 46, 2048, 2100, 90, { kind: 'k32' }), mk(PC16, 46, 4096, 3000, 95, { kind: 'start' }), mk(PC16, 46, 4096, 3100, 85, { kind: 'k32' }), mk(PC16, 46, 2048, 1, 1, { settings: { cacheMiB: 1024 } })];
  const a = speedsFor(rows, { file: 'B.gguf', pc: PC16, be: 46, cache: true, kv: 'q8_0' });
  check('steps are compared on the same prompts and the same cache size', !a.write[512] && a.write[2048] === 95 && a.write[4096] === 90, JSON.stringify(a.write));
}
{
  const rows = readSeed();
  const a = speedsFor(rows, { file: 'Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf', pc: { cardMiB: 16384, ramMB: 31846 }, be: 46, cache: true, ctx: 32768, kv: 'q8_0' });
  check('the seed gives the 16 GB test PC\'s 35B its measured speeds with the copy cache', a && a.write[2048] > 50 && a.read[4096] > a.read[2048] && /^this PC/.test(a.from.level), JSON.stringify(a));
}

// ---------- this PC's own rows ----------
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-measured-'));
  const cfg = { dataDir: d };
  check('this PC\'s file lives in the conductor folder of the data folder', localFile(cfg) === path.join(d, 'conductor', 'measured.jsonl') && readLocal(cfg).length === 0);
  const r = rowFromTry({ at: 1795700000000, source: 'guppi-calibrate', gguf: 'C:\\Models\\B.gguf', fileBytes: 10, pc: { gpu: 'Card 16', cardMiB: 16303, cardGB: 16, ramGB: 31.1, os: 'windows' }, be: 46, extra: ['-b', '4096', '-ub', '4096', '--moe-cache-mib', '4096'], env: { LLAMA_MOE_CACHE_FILL: '1' }, ctx: 32768, promptN: 8000, result: { readTps: 3000, writeTps: 90, throttle: ['power-cap'] }, fit: { ok: true } });
  check('a try becomes a row: the file name, the PC, the step, the cache filled, the result', r.brain.file === 'B.gguf' && r.pc.cardMiB === 16303 && r.pc.ramMB === 31846 && r.settings.step === 4096 && r.settings.fill && r.result.throttle.join() === 'power-cap');
  check('it adds rows and reads them back first', append(cfg, [r, { junk: 1 }]) === 1 && readLocal(cfg).length === 1 && readAll(cfg)[0].source === 'guppi-calibrate' && readAll(cfg).length === readSeed().length + 1);
  fs.writeFileSync(localFile(cfg), fs.readFileSync(localFile(cfg), 'utf8').replace(/\n/g, '\r\n') + 'broken line\r\n');
  check('Windows line ends and a broken line are fine', readLocal(cfg).length === 1);
  // the command line: a rental's or a kit's raw runs go in by hand
  const runs = path.join(d, 'runs.jsonl.gz'), env = path.join(d, 'environment.json');
  fs.writeFileSync(runs, zlib.gzipSync(JSON.stringify({ row: 'a', engine: 'be46', cmd: '-m B.gguf -ub 2048 --moe-cache-mib 4096', runs: [{ prompt: 'k16', promptN: 16000, readTps: 2000, writeTps: 99 }] }) + '\n'));
  fs.writeFileSync(env, JSON.stringify({ card: 'Card 16, 16303 MiB', ramMB: 31862 }));
  const out = execFileSync(process.execPath, [path.join(appDir, 'src', 'measured-db.js'), 'add', runs, '--env', env, '--data', d], { encoding: 'utf8' });
  check('`node src/measured-db.js add` puts a raw runs file in', /1 rows added/.test(out) && readLocal(cfg).length === 2);
  // GUPPI at load reads it
  const e = new LlamaCpp({ agentDir: d, dataDir: d, gpuVramGB: 16, llamacpp: { models: {} } }); clearInterval(e.idleTimer);
  e.beNo = () => 46; e.totalRam = () => 31.1 * 2 ** 30; e.resolve = () => ({ gguf: path.join(d, 'B.gguf') }); e.condCacheBase = 4096; e.condLoadCtx = 32768; e.condKv = 'q8_0';
  const said = []; e.log = (_k, t) => said.push(t);
  const sp = e.condSpeedsFor('B');
  check('GUPPI starts from this PC\'s measured rows for a brain he has no speeds for, marked old, and says so', sp?.write?.[4096] === 90 && sp.old.write.includes(4096) && said.some((t) => /starts from the test-results database \(this PC, this engine build, \d+ measured runs/.test(t)), said.join(' | '));
  fs.rmSync(d, { recursive: true, force: true });
}

// ---------- the held-out check (the owner: "will doing this make guppi better? Is it a certainty?") ----------
{
  // on PC A and PC B (a similar card), step 4096 reads faster but writes so slowly that 2048 wins the job
  const A = { card: 'Card A', cardMiB: 16303, ramMB: 31862 }, B = { card: 'Card B', cardMiB: 14336, ramMB: 65536 };
  const rows = [mk(A, 46, 2048, 2000, 100), mk(A, 46, 4096, 2100, 40), mk(B, 46, 2048, 1900, 95), mk(B, 46, 4096, 2000, 38)];
  const h = holdout(rows, { cache: true });
  const b = h.checks.find((x) => x.pc === pcKey(B));
  check('leave one PC out: GUPPI from the rest picks the step that PC measured fastest, scored with its own speeds', b && b.without.step === 4096 && b.with.step === 2048 && b.gainS > 0 && b.best.step === 2048 && b.errPct < 10, JSON.stringify(b));
  check('it says how many checks the baseline made faster, the same or slower', /2 held-out checks: the baseline made GUPPI's pick faster in 2, the same in 0, slower in 0/.test(h.summary), h.summary);
  check('one PC alone can\'t be checked, and it says so plainly', /no other PC has the same brain measured.*Unproven in our lab, as we have yet to test/.test(holdout(rows.slice(0, 2)).summary) && /nothing can be checked yet/.test(holdout([]).summary));
}

// ---------- wiring, Help ----------
{
  const g = read('src/guppi-calibrate.js'), b = read('src/brain-calibrate.js'), l = read('src/llamacpp.js'), help = read('public/help-content.js');
  check('GUPPI calibrates this PC and the Brains page\'s Calibrate add their measurements', /measuredAdd\(lab\.cfg, rowFromTry\(/.test(g) && /measuredAdd\(lab\.cfg, rowFromTry\(/.test(b));
  check('nothing is sent anywhere: no network in the database', !/fetch\(|https?:\/\//.test(read('src/measured-db.js').replace(/^\/\/.*$/gm, '')));
  check('the order at load: his own, this PC\'s rows, the Brains page\'s Calibrate, then the baseline', /startsWith\('this PC'\)/.test(l) && /guppiCalSpeeds/.test(l));
  check('Help: the glossary entry, the FAQ and the speeds paragraph', /Test-results database/.test(help) && /faq-test-results-db/.test(help) && /held-out check/.test(help));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
