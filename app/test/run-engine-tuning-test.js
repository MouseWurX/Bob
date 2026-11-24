// Settings, Engine tuning (src/engine-tuning.js): every speed lever set by hand per brain, off unless "I'll set them
// myself" is picked, flags typed by hand win, the processor-only load gets no card levers, a cleared brain stays
// cleared when saved, and the Settings box, Help, FAQ and glossary are there. Nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeSettings } from '../src/config.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { TUNING_FIELDS, cleanLevers, cleanTuning, savedTuning, mergeTuning, handTuningOn, tuningArgs, savedHotFile, doorbellEnv } from '../src/engine-tuning.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-tuning-'));

// ---------- The levers ----------
check('twenty-three levers, each a flag or an engine key with a range', TUNING_FIELDS.length === 23 && TUNING_FIELDS.every((f) => (f.flags || f.env) && f.min < f.max && f.label));
check('levers: unknown keys, out of range, fractions where whole numbers go and blanks are dropped',
  JSON.stringify(cleanLevers({ step: 2048, cacheMB: 100, learn: 2.5, lookahead: '4', cpuShare: '', junk: 3, draftGate: true })) === JSON.stringify({ step: 2048, lookahead: 4 }));
check('levers: not an object gives none', Object.keys(cleanLevers(null)).length === 0 && Object.keys(cleanLevers([1])).length === 0);

// ---------- Off by default, saving ----------
check('a fresh Bob lets the Conductor drive', !handTuningOn({}) && cleanTuning(undefined).mode === 'conductor' && !handTuningOn(mergeSettings({}, {})));
check('only "hand" turns it on', cleanTuning({ mode: 'yes' }).mode === 'conductor' && cleanTuning({ mode: 'hand' }).mode === 'hand');
{ let t = mergeTuning(undefined, { mode: 'hand' });
  t = mergeTuning(t, { model: 'big', levers: { step: 4096, cacheMB: 4096 } });
  t = mergeTuning(t, { model: 'small', levers: { lookahead: 4 } });
  check('saved as a list, one row a brain', t.mode === 'hand' && Array.isArray(t.list) && t.list.length === 2 && t.list[0].model === 'big' && t.list[0].step === 4096);
  const cleared = mergeTuning(t, { model: 'big', levers: {} });
  check('clearing a brain removes its row', cleared.list.length === 1 && cleared.list[0].model === 'small');
  const m1 = mergeSettings({}, { engineTuning: t }), m2 = mergeSettings(m1, { engineTuning: cleared });
  check('a cleared brain stays cleared through a settings save', cleanTuning(m2.engineTuning).brains.big === undefined && cleanTuning(m2.engineTuning).brains.small?.lookahead === 4, JSON.stringify(m2.engineTuning));
  check('the old object form is still read', cleanTuning({ mode: 'hand', brains: { big: { step: 1024 } } }).brains.big.step === 1024 && savedTuning(cleanTuning({ brains: { a: { step: 512 } } })).list[0].model === 'a'); }

// ---------- The flags and keys ----------
const hand = (levers) => ({ engineTuning: { mode: 'hand', list: [{ model: 'big', ...levers }] } });
check('nothing while Bob picks', tuningArgs({ engineTuning: { mode: 'bob', list: [{ model: 'big', step: 4096 }] } }, 'big').args.length === 0);
check('nothing for a brain with no boxes filled', tuningArgs(hand({ step: 4096 }), 'small').args.length === 0);
{ const r = tuningArgs(hand({ step: 4096, cacheMB: 4096, lookahead: 4 }), 'big');
  const a = r.args.join(' ');
  check('step sets -b and -ub, cache sets the cache with share 0 and its log lines', /-b 4096 -ub 4096/.test(a) && /--moe-cache-mib 4096/.test(a) && /--moe-cache-cpu-share 0/.test(a) && /-lv 4/.test(a), a);
  check('engine keys go in the start keys', r.env.LLAMA_MOE_LOOKAHEAD === '4' && /set by hand/.test(r.said)); }
check('Brain Engine 0109: locking the experts in RAM is its own key, off unless set, and skipped on the processor-only load',
  tuningArgs(hand({ registerRam: 1 }), 'big').env.LLAMA_MOE_REGISTER_RAM === '1' && !('LLAMA_MOE_REGISTER_RAM' in tuningArgs(hand({ step: 512 }), 'big').env) &&
  !('LLAMA_MOE_REGISTER_RAM' in tuningArgs(hand({ registerRam: 1 }), 'big', { cpu: true }).env));
check('a processor share alone does nothing', !tuningArgs(hand({ cpuShare: 1 }), 'big').args.includes('--moe-cache-cpu-share'));
check('flags typed by hand win', (() => { const r = tuningArgs(hand({ step: 4096, cacheMB: 4096 }), 'big', { handArgs: ['--ubatch-size', '512', '--moe-cache-mib', '2048'] }); return !r.args.includes('-ub') && !r.args.includes('--moe-cache-mib'); })());
check('the processor-only load gets the step but no card levers', (() => { const r = tuningArgs(hand({ step: 1024, cacheMB: 4096, lookahead: 4 }), 'big', { cpu: true }); return r.args.join(' ') === '-b 1024 -ub 1024' && !Object.keys(r.env).length; })());

// ---------- Brain Engine 30/31: borrow, shelf, drive, saved hot set (Nov 22, off by default) ----------
check('the new switches are off unless set, and only 0 or 1', JSON.stringify(cleanLevers({ borrow: 2, shelf: 0.5, drive: 1, hotSave: 1 })) === JSON.stringify({ drive: 1, hotSave: 1 }));
{ const cfg = { dataDir: tmp, ...hand({ borrow: 1, shelf: 1, drive: 1, hotSave: 1 }) };
  const r = tuningArgs(cfg, 'big', { exists: () => false });
  check('borrow, shelf and drive set their engine keys', r.env.LLAMA_MOE_CACHE_BORROW === '1' && r.env.LLAMA_MOE_CACHE_TAIL === '1' && r.env.LLAMA_MOE_DRIVE === '1', JSON.stringify(r.env));
  check('the hot set is saved in Bob\'s own folder, per brain', r.env.LLAMA_MOE_CACHE_SAVE === savedHotFile(cfg, 'big') && savedHotFile(cfg, 'big').startsWith(path.join(tmp, 'hot-experts')) && !r.env.LLAMA_MOE_CACHE_RANKING);
  const again = tuningArgs(cfg, 'big', { exists: (f) => f === savedHotFile(cfg, 'big') });
  check('a saved hot set is loaded next time', again.env.LLAMA_MOE_CACHE_RANKING === savedHotFile(cfg, 'big'));
  check('drive stand-ins set the stand-in way to drive', tuningArgs({ dataDir: tmp, ...hand({ driveStandin: 1 }) }, 'big').env.LLAMA_MOE_STANDIN === 'drive' && !('LLAMA_MOE_STANDIN' in tuningArgs({ dataDir: tmp, ...hand({ driveStandin: 0, step: 1024 }) }, 'big').env));
  check('the RAM floor is a number of MB', tuningArgs({ dataDir: tmp, ...hand({ ramFloor: 1024 }) }, 'big').env.LLAMA_MOE_RAM_FLOOR_MIB === '1024');
  check('0 saves nothing', !tuningArgs({ dataDir: tmp, ...hand({ hotSave: 0, step: 1024 }) }, 'big').env.LLAMA_MOE_CACHE_SAVE);
  check('the processor-only load gets none of them', !Object.keys(tuningArgs(cfg, 'big', { cpu: true }).env).length); }

// ---------- In a real start line ----------
const big = path.join(tmp, 'big.gguf'), small = path.join(tmp, 'small.gguf');
fs.writeFileSync(big, 'x'); fs.writeFileSync(small, 'x');
const engineOf = (extra = {}, lc = {}) => { const e = new LlamaCpp({ agentDir: tmp, dataDir: tmp, ...extra, llamacpp: { models: { big, small }, ...lc } }); clearInterval(e.idleTimer); return e; };
{ const off = engineOf().buildArgs('big').join(' ');
  check('the start line has no hand levers while Bob picks', !/--moe-cache-mib/.test(off), off);
  const e = engineOf({ readingSpeed: 'fastest', ...hand({ step: 4096, cacheMB: 4096, lookahead: 4 }) });
  const a = e.buildArgs('big');
  check('the start line has the hand levers, one -ub only', a.filter((x) => x === '-ub').length === 1 && a[a.indexOf('-ub') + 1] === '4096' && a.includes('--moe-cache-mib'), a.join(' '));
  check('the engine keys are kept for the start', e.tuneEnv?.LLAMA_MOE_LOOKAHEAD === '4');
  const other = engineOf(hand({ step: 4096 })).buildArgs('small').join(' ');
  check('another brain is left alone', !/-ub 4096/.test(other), other); }

// ---------- Settings, Help, FAQ, glossary ----------
{ const t = read('public/cellar-engines.js');
  check('Settings has the box with both choices and a clear button', /data-tunemode="\$\{v\}"/.test(t) && /radio\('bob'/.test(t) && /radio\('hand'/.test(t) && /data-tuneclear/.test(t)); }
check('Settings Help names the box and its default', /Engine tuning/.test(HELP.find((h) => h.id === 'settings-speed')?.html || ''));
check('the FAQ answers it', HELP.some((h) => h.id === 'faq-engine-tuning' && h.group === 'FAQ'));
for (const [name, id] of [['Long reads borrow the cache', 'faq-moe-borrow'], ['Empty chat memory holds experts', 'faq-moe-borrow'], ['Read missed experts straight from the drive', 'faq-moe-drive'], ['Remember the busy experts', 'faq-moe-drive'], ['Experts on the drive: use the next best', 'faq-moe-drive-standin'], ['Keep RAM free for the computer', 'faq-moe-drive-standin']]) {
  check(`Help names "${name}"`, (HELP.find((h) => h.id === 'settings-speed')?.html || '').includes(name));
  check(`the FAQ ${id} answers it`, HELP.some((h) => h.id === id && h.group === 'FAQ')); }
check('the glossary has the shelf, the drive tier and the saved hot set', ['Borrowed reading', 'Expert shelf', 'Drive tier', 'Saved hot set', 'Drive stand-in', 'RAM floor'].every((w) => (HELP.find((h) => h.id === 'glossary')?.html || '').includes(`<dt>${w}`)));
check('the glossary explains it', /<dt>Engine tuning/.test(HELP.find((h) => h.id === 'glossary')?.html || ''));

// Nov 22: the doorbell's safety keys for Windows, added only when it's on and only where nothing set them already
check('the doorbell on adds EAGER loading and a 1.5 s wait', JSON.stringify(doorbellEnv({ LLAMA_MOE_DOORBELL: '1' })) === JSON.stringify({ CUDA_MODULE_LOADING: 'EAGER', LLAMA_MOE_DOORBELL_TIMEOUT_MS: '1500' }));
check('the doorbell off or unset adds nothing', !Object.keys(doorbellEnv({})).length && !Object.keys(doorbellEnv({ LLAMA_MOE_DOORBELL: '0' })).length && !Object.keys(doorbellEnv({ LLAMA_MOE_DOORBELL: '' })).length && !Object.keys(doorbellEnv({ CUDA_MODULE_LOADING: 'LAZY' })).length);
check('keys already set win', (() => { const d = doorbellEnv({ LLAMA_MOE_DOORBELL: '1', CUDA_MODULE_LOADING: 'LAZY', LLAMA_MOE_DOORBELL_TIMEOUT_MS: '5000' }); return !Object.keys(d).length; })());
check('one key set: only the other is added', JSON.stringify(doorbellEnv({ LLAMA_MOE_DOORBELL: '1', LLAMA_MOE_DOORBELL_TIMEOUT_MS: '800' })) === JSON.stringify({ CUDA_MODULE_LOADING: 'EAGER' }));
check('Engine tuning\'s doorbell lever turns it on', (() => { const r = tuningArgs({ dataDir: tmp, ...hand({ cacheMB: 4096, cpuShare: 1, doorbell: 1 }) }, 'big'); return doorbellEnv(r.env).CUDA_MODULE_LOADING === 'EAGER'; })());
check('the engine start adds them after every other key', (() => { const src = fs.readFileSync(fileURLToPath(new URL('../src/llamacpp.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n'); const at = src.indexOf('doorbellEnv(env)'); return at > src.indexOf('...this.tuneEnv') && at > src.indexOf('tiersEnv(') && at < src.indexOf('const child = safeSpawn('); })());
check('Help says why, in the lever and the glossary', /1\.5 seconds/.test(HELP.map((h) => h.html).join(' ').match(/Card and processor at once[\s\S]{0,1200}/g)?.join(' ') || ''));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
