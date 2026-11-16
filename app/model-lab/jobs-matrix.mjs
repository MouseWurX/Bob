// Jobs matrix (16 Nov 2026, the owner: test the distilled A3B "both before and after our effort changes", "the small brain
// gets a 100 real job trial run"). One served brain, the same jobs, several ways of running them at once: each variant is
// its own do-jobs.mjs run (its own folder <prefix>-<name>, its own effort flags), all started together, so a Tavily
// budget that runs out stops them all at about the same job. First the brain writes every job's test world once
// (--scenes-only), and then every variant starts from those very worlds (--scene reuse), so the only difference
// between two variants is the way they were run.
//
// node jobs-matrix.mjs --prefix <dir prefix> --variants <name>=<do-jobs flags>;<name>=<flags>... [--no-scenes]
//      <every other flag is handed to each do-jobs run as it is: --url, --bob, --jobs, --never, --count, --hours,
//       --search tavily, --search-cap, --search-ledger, --search-cache, --slot-ctx, --preflight ...>
// A variant's own flags come last, so they win (e.g. stock=--lora-scale 0 --effort low). --parallel is per variant.
// --search-cap is split evenly between the variants, or with --search-group <name> shared by them all. --stagger S: variant k starts k x S seconds after the first, so a query
// the first one searched is usually in the shared cache (--search-cache) by the time the others ask it. Exit: 1 when any pre-flight fails, else 0.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { locate } from './common.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const take = (k) => { const i = argv.indexOf(`--${k}`); if (i < 0) return undefined; const v = argv[i + 1]; const flag = v === undefined || v.startsWith('--'); argv.splice(i, flag ? 1 : 2); return flag ? true : v; };
const prefix = String(take('prefix') || 'matrix');
const variantsArg = take('variants');
const noScenes = take('no-scenes') === true;
const stagger = Number(take('stagger') || 0);
const capArg = take('search-cap');
const grouped = argv.includes('--search-group'); // one cap shared by every variant (do-jobs --search-group)
const say = (t) => console.log(t);
if (!variantsArg || variantsArg === true) { say('PRE-FLIGHT FAIL: --variants name=flags;name=flags is needed'); process.exit(1); }
// Windows quoting: split on spaces, keep "quoted parts" together
const words = (t) => (String(t).match(/"[^"]*"|\S+/g) || []).map((w) => w.replace(/^"|"$/g, ''));
const variants = String(variantsArg).split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const at = x.indexOf('='); return { name: (at < 0 ? x : x.slice(0, at)).trim(), flags: at < 0 ? [] : words(x.slice(at + 1)) }; });
const names = new Set();
for (const v of variants) {
  if (!/^[\w-]{1,40}$/.test(v.name)) { say(`PRE-FLIGHT FAIL: variant name "${v.name}" (letters, digits, - and _ only)`); process.exit(1); }
  if (names.has(v.name)) { say(`PRE-FLIGHT FAIL: variant ${v.name} is named twice`); process.exit(1); }
  if (v.flags.includes('--dir')) { say(`PRE-FLIGHT FAIL: variant ${v.name} sets --dir (the matrix names each folder ${prefix}-<name>)`); process.exit(1); }
  names.add(v.name);
}
if (!variants.length) { say('PRE-FLIGHT FAIL: no variants'); process.exit(1); }
if (argv.includes('--dir')) { say('PRE-FLIGHT FAIL: --dir is set by the matrix (--prefix)'); process.exit(1); }
const capEach = capArg !== undefined && capArg !== true ? (grouped ? Number(capArg) : Math.floor(Number(capArg) / variants.length)) : null;
if (capArg !== undefined && !(capEach >= 0)) { say(`PRE-FLIGHT FAIL: --search-cap ${capArg}: give a number of searches`); process.exit(1); }
const preflight = argv.includes('--preflight');
const scenesDir = `${prefix}-scenes`;

function run(tag, args) {
  return new Promise((ok) => {
    const ch = spawn(process.execPath, [path.join(here, 'do-jobs.mjs'), ...args], { cwd: here, env: process.env, windowsHide: true });
    let rest = '';
    const out = (d) => { rest += d; const lines = rest.split(/\r?\n/); rest = lines.pop(); for (const ln of lines) say(`[${tag}] ${ln}`); };
    ch.stdout.on('data', out); ch.stderr.on('data', out);
    ch.on('exit', (code) => { if (rest) say(`[${tag}] ${rest}`); ok(code ?? 1); });
    ch.on('error', (e) => { say(`[${tag}] ${e.message}`); ok(1); });
  });
}
// where do-jobs keeps its folders (common.mjs locate: --out, else the Lab's out folder)
const scenesFile = (dir) => { const i = argv.indexOf('--out'); return path.join(locate(i >= 0 ? { out: argv[i + 1] } : {}).out, dir, 'scenes.jsonl'); };
const common = argv.filter((a, i) => !(a === '--scene' || argv[i - 1] === '--scene'));
const capFlags = capEach !== null ? ['--search-cap', String(capEach)] : [];
// --search-probe spends a search: only the first variant probes (the others share its PC and its key)
const probeOnce = (k) => (k === 0 ? common : common.filter((a) => a !== '--search-probe'));

say(`jobs matrix ${prefix}: ${variants.length} variant(s): ${variants.map((v) => `${v.name} (${v.flags.join(' ') || 'as is'})`).join('; ')}${capEach !== null ? (grouped ? `; ${capEach} Tavily searches shared by all` : `; ${capEach} Tavily searches each`) : ''}`);
if (preflight) {
  let bad = 0;
  for (const [k, v] of variants.entries()) { const code = await run(v.name, [...probeOnce(k), ...capFlags, '--dir', `${prefix}-${v.name}`, ...(noScenes ? [] : ['--scene', 'reuse']), ...v.flags]); if (code) bad++; }
  say(bad ? `PRE-FLIGHT FAIL: ${bad} variant(s) failed pre-flight` : 'pre-flight OK: every variant');
  process.exit(bad ? 1 : 0);
}
let sceneArgs = [];
if (!noScenes) {
  // the worlds are written once, by the first variant's brain settings (its --lora-scale), with no search
  const first = variants[0].flags.filter((f, i, a) => f === '--lora-scale' || a[i - 1] === '--lora-scale');
  const noSearch = common.filter((a, i) => !/^--search/.test(a) && !/^--search/.test(common[i - 1] || ''));
  const code = await run('scenes', [...noSearch, '--dir', scenesDir, '--scene', 'make', '--scenes-only', ...first]);
  if (code) { say(`the test worlds weren't written (exit ${code}): stopping`); process.exit(code); }
  const f = scenesFile(scenesDir);
  // the run folders' own scenes.jsonl stays empty: every variant reads the one set of worlds
  sceneArgs = ['--scene', 'reuse', '--scenes', f];
}
const codes = await Promise.all(variants.map((v, k) => new Promise((r) => setTimeout(r, k * stagger * 1000)).then(() => run(v.name, [...probeOnce(k), ...capFlags, '--dir', `${prefix}-${v.name}`, ...sceneArgs, ...v.flags]))));
say(`jobs matrix ${prefix} done: ${variants.map((v, i) => `${v.name} exit ${codes[i]}`).join(', ')}`);
process.exit(0);
