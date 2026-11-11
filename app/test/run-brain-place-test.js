// 1.5.205 where one brain sits, set by hand (src/brain-place.js) and what it adds to the engine's start arguments.
// A fake brain file in a temp folder; no real engine, card or settings are read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanBrainPlace, placeArgs, MAX_LAYERS } from '../src/brain-place.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { LlamaCpp } from '../src/llamacpp.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));

{
  const c = cleanBrainPlace({ a: { mode: 'hand', cpuMoe: 12 }, b: { mode: 'weird', cpuMoe: 3 }, c: { mode: 'hand', cpuMoe: -1 }, d: { mode: 'hand', cpuMoe: 9999 }, e: 'x', ['bad\u0001']: { mode: 'hand', cpuMoe: 1 }, f: { mode: 'hand', cpuMoe: 2.5, extra: '--log-file' } });
  check('only Auto or By hand, and a whole number of layers in range', JSON.stringify(c) === JSON.stringify({ a: { mode: 'hand', cpuMoe: 12 }, b: { mode: 'auto', cpuMoe: 3 }, c: { mode: 'hand' }, d: { mode: 'hand' }, f: { mode: 'hand' } }), JSON.stringify(c));
  check('junk becomes nothing', JSON.stringify(cleanBrainPlace(null)) === '{}' && JSON.stringify(cleanBrainPlace([1])) === '{}' && MAX_LAYERS === 200);
  check('the number is kept in Auto, so it can be set before By hand is switched on', cleanBrainPlace({ a: { mode: 'auto', cpuMoe: 7 } }).a.cpuMoe === 7);
  check('it is a setting Bob saves, cleaned on the way in', SETTING_KEYS.includes('brainPlace') && JSON.stringify(mergeSettings({}, { brainPlace: { a: { mode: 'hand', cpuMoe: 4, x: 1 } } }).brainPlace) === JSON.stringify({ a: { mode: 'hand', cpuMoe: 4 } }));
}
{
  const cfg = { brainPlace: { big: { mode: 'hand', cpuMoe: 28 }, auto: { mode: 'auto', cpuMoe: 28 }, bare: { mode: 'hand' } } };
  check('By hand adds --n-cpu-moe with the number', placeArgs(cfg, 'big').join(' ') === '--n-cpu-moe 28');
  check('Auto adds nothing, even with a number saved', placeArgs(cfg, 'auto').length === 0 && placeArgs(cfg, 'nobody').length === 0 && placeArgs({}, 'big').length === 0);
  check('By hand with no number adds nothing', placeArgs(cfg, 'bare').length === 0);
  check('on the processor it adds nothing', placeArgs(cfg, 'big', { cpu: true }).length === 0);
  check('a number past the file\'s layers comes down to them', placeArgs(cfg, 'big', { layers: 24 }).join(' ') === '--n-cpu-moe 24' && placeArgs(cfg, 'big', { layers: 36 }).join(' ') === '--n-cpu-moe 28');
}
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob place '));
  const models = path.join(tmp, 'models');
  const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', 'qwen3');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(models, 'blobs'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
  fs.writeFileSync(path.join(models, 'blobs', 'sha256-ddd444'), 'GGUF');
  fs.writeFileSync(path.join(dir, '4b'), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: 'sha256:ddd444' }] }));
  const mk = (extra = {}, lc = {}) => new LlamaCpp({ dataDir: path.join(tmp, 'data'), agentDir: tmp, llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 18096, fit: true, ...lc }, ...extra });
  const auto = mk().buildArgs('qwen3:4b', {});
  check('Auto: the engine starts exactly as before (it fits the brain itself)', auto.includes('--fit') && !auto.includes('--n-cpu-moe'));
  const hand = mk({ brainPlace: { 'qwen3:4b': { mode: 'hand', cpuMoe: 10 } } }).buildArgs('qwen3:4b', {});
  check('By hand: the number goes in, and the engine no longer fits by itself', hand[hand.indexOf('--n-cpu-moe') + 1] === '10' && !hand.includes('--fit') && hand.includes('-ngl'), hand.join(' '));
  check('By hand never applies on the processor', !mk({ brainPlace: { 'qwen3:4b': { mode: 'hand', cpuMoe: 10 } } }).buildArgs('qwen3:4b', { cpu: true }).includes('--n-cpu-moe'));
  const pinned = mk({ brainPlace: { 'qwen3:4b': { mode: 'hand', cpuMoe: 10 } } }, { nCpuMoe: { 'qwen3:4b': 3 } }).buildArgs('qwen3:4b', {});
  check('a number already in the settings file wins, and is not doubled', pinned.filter((a) => a === '--n-cpu-moe').length === 1 && pinned[pinned.indexOf('--n-cpu-moe') + 1] === '3');
  check('a file whose layers can\'t be read gives no by-hand control', mk().placeInfo('qwen3:4b') === null && mk().placeInfo('nope:1b') === null);
  fs.rmSync(tmp, { recursive: true, force: true });
}
{
  const server = fs.readFileSync(path.join(here, '..', 'src', 'server.js'), 'utf8').replace(/\r\n/g, '\n');
  check('the page can read each brain\'s layers and save one brain at a time', /p === '\/api\/brain-place'\) return send\(res, 200, brainPlaceView\(\)\)/.test(server) && /brainPlace: \{ \.\.\.\(cfg\.brainPlace \|\| \{\}\), \.\.\.b\.brainPlace \}/.test(server));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
