// Hot experts on the card (src/hot-experts.js, engine patch 0016): the ranking file the engine reads, the profile
// stamps, which profile a brain loads, the flags and environment, the refusals said out loud, and the engine's own
// cache lines. Nothing here reads the real computer: files, sizes and dates are fakes, and the data folder is a temp one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOT_KINDS, RANKING_ENV, rankingFile, profileFile, mixFor, mixHash, hotCacheMB, cleanHotGB, kindFor, addMass, rankingText,
  profileStamp, stampId, saveProfile, loadProfile, profilesFor, hotArgs, parseCacheLog, brainId
} from '../src/hot-experts.js';
import { HOT_MIX } from '../src/hot-experts-mix.js';
import { HELP } from '../public/help-content.js';
import { WANTS } from '../public/wants.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-hot-'));
const FP = '0123456789abcdef';
const fakeStat = (size = 21e9, mtimeMs = 1700000000000) => () => ({ size, mtimeMs });

// ---------- The mix and its fingerprint ----------
check('four kinds of work plus mixed', HOT_KINDS.join() === 'mixed,coding,office,research,chat' && HOT_KINDS.slice(1).every((k) => HOT_MIX[k]?.length === 5));
check('mixed is every kind\'s questions, in order', mixFor('mixed').length === 20 && mixFor('mixed')[0] === HOT_MIX.coding[0]);
check('the mix fingerprint is fixed and differs by kind', mixHash('coding') === mixHash('coding') && mixHash('coding') !== mixHash('office') && /^[0-9a-f]{64}$/.test(mixHash()));
check('the mix names no person, folder or address', !/[A-Z]:\\|\/home\/|@\w+\.\w|https?:/.test(JSON.stringify(HOT_MIX)));

// ---------- Room on the card ----------
check('room: a quarter of the card, at most 4 GB', hotCacheMB({ gpuVramGB: 16 }) === 4096 && hotCacheMB({ gpuVramGB: 8 }) === 2048 && hotCacheMB({ gpuVramGB: 24 }) === 4096);
check('room: set by hand wins, 1 to 12 GB', hotCacheMB({ gpuVramGB: 16, hotExpertsGB: 6 }) === 6144 && hotCacheMB({ gpuVramGB: 16, hotExpertsGB: 40 }) === 4096);
check('room: no card known, no cache', hotCacheMB({}) === 0);
check('the dial keeps half steps from 1 to 12 GB only', cleanHotGB(2.3) === 2.5 && cleanHotGB(0.5) === null && cleanHotGB(13) === null && cleanHotGB('x') === null);

// ---------- Which profile ----------
check('a coder brain loads the coding profile', kindFor({ models: { coder: 'qwen' } }, 'qwen') === 'coding');
check('Bob\'s own slots map too: workbench coding, scouting research, ledger office', kindFor({ models: { tinker: 'q' } }, 'q') === 'coding' && kindFor({ models: { scout: 'q' } }, 'q') === 'research' && kindFor({ models: { ledger: 'q' } }, 'q') === 'office');
check('a brain doing several kinds of job loads mixed', kindFor({ models: { coder: 'qwen', bob: 'qwen' } }, 'qwen') === 'mixed' && kindFor({}, 'qwen') === 'mixed');

// ---------- Counting and the ranking file ----------
{ const acc = [];
  addMass(acc, { layers: [[3, 0, 1], [0, 5]] }); addMass(acc, { layers: [[1, 2], 'junk', [null, -4]] }); addMass(acc, null);
  check('counts add up per layer and expert, junk skipped', acc[0][0] === 4 && acc[0][1] === 2 && acc[0][2] === 1 && acc[1][1] === 5 && !(acc[2] || []).length);
  const t = rankingText(acc, FP, 'mixed.mix-abc.b12359');
  const lines = t.trim().split('\n');
  check('the ranking starts with its kind, version and brain fingerprint', lines[0] === `bob-moe-ranking 2 ${FP} mixed.mix-abc.b12359`);
  check('busiest first, ties by layer then expert', lines.slice(1).join('|') === '1 1 5|0 0 4|0 1 2|0 2 1');
  let threw = false; try { rankingText(acc, '', 'x'); } catch { threw = true; }
  check('no ranking without the brain\'s fingerprint', threw); }

// ---------- Stamps and saving ----------
const cfg = { dataDir: tmp, hotExperts: true, gpuVramGB: 16, models: { coder: 'qwen3.6-35b' } };
const stamp = profileStamp({ kind: 'coding', gguf: '/fake/qwen.gguf', fingerprint: FP, engine: 'b12359', patches: ['0001-expert-mask', '0016-moe-cache-ranking'], statImpl: fakeStat() });
check('the stamp names the mix, brain file, fingerprint, engine and patches', stamp.mix === mixHash('coding').slice(0, 16) && stamp.brain === 'qwen.gguf:21000000000:1700000000000' && stamp.fingerprint === FP && stamp.engine === 'b12359' && stamp.patches.length === 2);
check('the stamp id has no spaces', !/\s/.test(stampId(stamp)) && stampId(stamp).startsWith('coding.mix-'));
saveProfile(cfg, 'qwen3.6-35b', [[4, 2, 1]], stamp);
check('a profile saves beside its ranking file', fs.existsSync(profileFile(cfg, 'qwen3.6-35b', 'coding')) && fs.readFileSync(rankingFile(cfg, 'qwen3.6-35b', 'coding'), 'utf8').startsWith('bob-moe-ranking 2 '));
check('it loads back, and only under its own kind', loadProfile(cfg, 'qwen3.6-35b', 'coding')?.picks === 7 && loadProfile(cfg, 'qwen3.6-35b', 'office') === null && profilesFor(cfg, 'qwen3.6-35b').join() === 'coding');
check('the ranking file name says what it is', rankingFile(cfg, 'x', 'mixed').endsWith('x-mixed.ranking') && RANKING_ENV === 'LLAMA_MOE_CACHE_RANKING');

// ---------- Flags and environment ----------
const fit = ['--fit', 'on'];
const base = { args: fit, build: 12359, gguf: '/fake/qwen.gguf', statImpl: fakeStat() };
{ const h = hotArgs(cfg, 'qwen3.6-35b', base);
  check('on: the cache, the CPU share at 1, and the coding ranking', h.args.join(' ') === '--moe-cache-mib 4096 --moe-cache-cpu-share 1 -lv 4' && h.env[RANKING_ENV] === rankingFile(cfg, 'qwen3.6-35b', 'coding') && h.seeded && h.kind === 'coding'); }
check('off by default', hotArgs({ ...cfg, hotExperts: undefined }, 'qwen3.6-35b', base).args.length === 0);
check('a brain Calibrate found faster with the copy kind gets share 0; other brains keep share 1', hotArgs({ ...cfg, hotExpertsCopy: { 'qwen3.6-35b': true } }, 'qwen3.6-35b', base).args.join(' ') === '--moe-cache-mib 4096 --moe-cache-cpu-share 0 -lv 4' && hotArgs({ ...cfg, hotExpertsCopy: { other: true } }, 'qwen3.6-35b', base).args.includes('1'));
check('never on the processor, or an engine older than b12359', hotArgs(cfg, 'qwen3.6-35b', { ...base, cpu: true }).args.length === 0 && hotArgs(cfg, 'qwen3.6-35b', { ...base, build: 12000 }).args.length === 0);
check('not for a brain wholly on the card', hotArgs(cfg, 'qwen3.6-35b', { ...base, args: ['-ngl', '99'] }).args.length === 0);
check('a verbosity set by hand is kept (no second -lv)', hotArgs(cfg, 'qwen3.6-35b', { ...base, args: [...fit, '-lv', '5'] }).args.join(' ') === '--moe-cache-mib 4096 --moe-cache-cpu-share 1');
check('a cache set by hand is left alone', hotArgs(cfg, 'qwen3.6-35b', { ...base, args: [...fit, '--moe-cache-mib', '1000'] }).args.length === 0);
{ const h = hotArgs(cfg, 'other-brain', base);
  check('no profile yet: the cache runs and fills as it goes, with no ranking', h.args.length === 6 && !h.env[RANKING_ENV] && !h.seeded && !h.stale); }
{ const h = hotArgs(cfg, 'qwen3.6-35b', { ...base, statImpl: fakeStat(21e9, 1800000000000) });
  check('the brain file changed since: the ranking is NOT passed, and Bob says why', h.args.length === 6 && !h.env[RANKING_ENV] && /changed since/.test(h.stale)); }
{ fs.writeFileSync(profileFile(cfg, 'old-brain', 'mixed'), JSON.stringify({ stamp: { kind: 'mixed', brain: 'qwen.gguf:21000000000:1700000000000' } }));
  fs.writeFileSync(rankingFile(cfg, 'old-brain', 'mixed'), 'bob-moe-seed 1 x\n');
  const h = hotArgs(cfg, 'old-brain', base);
  check('a profile with no fingerprint (made before) is not passed either', !h.env[RANKING_ENV] && /no brain fingerprint/.test(h.stale)); }

// ---------- The engine's own words ----------
{ const load = `llama_moe_cache: MoE cache brain fingerprint = ${FP}\nllama_moe_cache: ranked fill: 1204 experts (3987.50 MiB) from x.ranking (5120 lines, mixed.mix-ab)\n`;
  const c = parseCacheLog(load);
  check('reads the fingerprint and the ranked fill', c.fingerprint === FP && c.filled === 1204 && c.filledMiB === 3987.5 && !c.refused); }
{ const c = parseCacheLog(`fill_from_ranking: !!! MoE cache ranking NOT USED: made on another brain (fingerprint ffffffffffffffff, this brain ${FP}) (C:/x/y.ranking). The cache fills the stock way instead.\n`);
  check('reads a refusal and its reason', /made on another brain/.test(c.refused) && c.filled === null); }
{ const c = parseCacheLog('llama_moe_cache: ubatch <= 8: hits = 900, misses = 100 (100 on the CPU), hit rate = 90.00%, uploaded = 0.00 MiB\nllama_moe_cache: ubatch  > 8: hits = 50, misses = 50 (40 on the CPU), hit rate = 50.00%, uploaded = 12.50 MiB\n');
  check('reads the totals, small and large batches apart', c.small.hits === 900 && c.small.uploadedMiB === 0 && c.large.uploadedMiB === 12.5 && c.large.cpu === 40);
  check('the processor\'s share of the picks (the tail)', c.small.cpuShare === 10); }

// ---------- The engine patch says it loudly ----------
{ const p = read('engine/patches/0016-moe-cache-ranking.patch');
  check('the patch reads LLAMA_MOE_CACHE_RANKING, not a "seed"', /getenv\("LLAMA_MOE_CACHE_RANKING"\)/.test(p) && !/LLAMA_MOE_CACHE_SEED/.test(p));
  check('the patch refuses before touching a slot, out loud', /!!! MoE cache ranking NOT USED/.test(p) && p.indexOf('refuse("not a bob-moe-ranking 2 file")') < p.indexOf('g.lru.slot_map[kl][ke] = s'));
  check('the patch checks the brain fingerprint', /fp != fingerprint/.test(p) && /MoE cache brain fingerprint = /.test(p));
  check('the patch says prompt reading never gains', /never speeds up prompt reading/.test(p));
  check('the engine map names the key as a file path', /LLAMA_MOE_CACHE_RANKING=<path of a ranking file>/.test(read('engine/ENGINE-MAP.md'))); }

// ---------- Settings, Help, glossary, FAQ ----------
{ const ui = read('public/cellar-engines.js');
  check('a switch and a room dial in Speed & memory', /sswitch\('hotExperts'/.test(ui) && /data-set="hotExpertsGB"/.test(ui));
  const ex = HELP.find((h) => h.id === 'engine-extras')?.html || '';
  check('Help says what it can\'t do (prompt reading)', /Hot experts on the card/.test(ex) && /not the wait before my first word/.test(ex));
  check('an FAQ, and a glossary entry', HELP.some((h) => h.id === 'faq-hot-experts') && HELP.some((h) => /<dt>Hot experts<\/dt>/.test(h.html || '')));
  check('a want, under its setting\'s name', WANTS.some((w) => w.key === 'hotExperts' && w.setting === 'Hot experts on the card')); }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
