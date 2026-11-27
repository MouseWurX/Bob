// Nov 27: the engine speed-ups taken from PolyStrata (Brain Engine 0140-0142, and the container's processor limit):
// on by default, same words, each with a way to turn it off, and Help, glossary and FAQ. Nothing here reads the real
// computer: the container's limit files, the processor count and the platform are fakes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { specGateTimeEnv, powerThrottleEnv, containerCpus, containerThreads, specGateEnv } from '../src/engine-extras.js';
import { TUNING_FIELDS, tuningArgs } from '../src/engine-tuning.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, why = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && why ? ` (${why})` : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');

// ---------- 0142 Guess only while it writes faster ----------
check('the time gate is on unless set by hand', specGateTimeEnv({}).LLAMA_SPEC_GATE_TIME === '1' && !specGateTimeEnv({ LLAMA_SPEC_GATE_TIME: '0' }).LLAMA_SPEC_GATE_TIME);
check('it sits next to the share-kept gate', specGateEnv({}).LLAMA_SPEC_GATE === '0.3' && specGateTimeEnv(undefined).LLAMA_SPEC_GATE_TIME === '1');
const lc = read('src/llamacpp.js');
check('Bob sends both gates where guessing is on', /specGateEnv\(this\.tuneEnv\), \.\.\.specGateTimeEnv\(this\.tuneEnv\)/.test(lc));

// ---------- 0140 Power throttling ----------
check('power throttling: the engine turns it off itself, so Bob sends nothing', Object.keys(powerThrottleEnv()).length === 0);
check('power throttling: left to Windows when the engine should yield (Games first, a helper engine)', powerThrottleEnv({ yieldToGames: true }).LLAMA_POWER_THROTTLING === '1');
check('Bob passes Games first and the helper engine to it, before Engine tuning (set by hand wins)',
  /powerThrottleEnv\(\{ yieldToGames: this\.role === BESIDE \|\| Boolean\(cpu && cpuPlan\(this\.cfg\)\?\.lowPriority\) \}\) \};[^\n]*\n\s*if \(this\.tuneEnv/.test(lc));

// ---------- A container's processor limit ----------
const fake = (files) => (f) => { if (f in files) return files[f]; throw new Error('missing'); };
check('cgroup v2: 400000 of 100000 is 4 processors', containerCpus(fake({ '/sys/fs/cgroup/cpu.max': '400000 100000\n' }), 'linux') === 4);
check('cgroup v2: a part processor rounds down, never below 1', containerCpus(fake({ '/sys/fs/cgroup/cpu.max': '250000 100000' }), 'linux') === 2 && containerCpus(fake({ '/sys/fs/cgroup/cpu.max': '50000 100000' }), 'linux') === 1);
check('cgroup v2: "max" is no limit', containerCpus(fake({ '/sys/fs/cgroup/cpu.max': 'max 100000' }), 'linux') === null);
check('cgroup v1: quota and period', containerCpus(fake({ '/sys/fs/cgroup/cpu/cpu.cfs_quota_us': '600000', '/sys/fs/cgroup/cpu/cpu.cfs_period_us': '100000' }), 'linux') === 6);
check('cgroup v1: -1 is no limit', containerCpus(fake({ '/sys/fs/cgroup/cpu/cpu.cfs_quota_us': '-1', '/sys/fs/cgroup/cpu/cpu.cfs_period_us': '100000' }), 'linux') === null);
check('no files, or not Linux: no limit', containerCpus(fake({}), 'linux') === null && containerCpus(fake({ '/sys/fs/cgroup/cpu.max': '400000 100000' }), 'win32') === null);
check('threads: the limit when it is below the processors seen', containerThreads({ cpus: 64, limit: 4 }) === 4);
check('threads: nothing when there is no limit, or it is not below', containerThreads({ cpus: 16, limit: null }) === null && containerThreads({ cpus: 8, limit: 8 }) === null && containerThreads({ cpus: 8, limit: 16 }) === null);
check('Bob uses it only when no other thread rule or hand setting gave threads', /num\(lc\.threads, '-t'\)\.length \? num\(lc\.threads, '-t'\) : containerThreads\(\) \? \['-t', String\(containerThreads\(\)\)\] : \[\]/.test(lc));

// ---------- Engine tuning boxes ----------
const by = Object.fromEntries(TUNING_FIELDS.map((f) => [f.k, f]));
check('three boxes: the time gate, page warm-up, power throttling', by.draftTimeGate?.env === 'LLAMA_SPEC_GATE_TIME' && by.pageWarm?.env === 'LLAMA_PAGE_WARM' && by.powerThrottle?.env === 'LLAMA_POWER_THROTTLING');
const hand = (levers) => ({ engineTuning: { mode: 'hand', list: [{ model: 'big', ...levers }] } });
{ const t = tuningArgs(hand({ draftTimeGate: 0, pageWarm: 0, powerThrottle: 1 }), 'big', { cpu: true });
  check('set by hand they reach the engine, on the processor too', t.env.LLAMA_SPEC_GATE_TIME === '0' && t.env.LLAMA_PAGE_WARM === '0' && t.env.LLAMA_POWER_THROTTLING === '1', JSON.stringify(t.env)); }
check('the card-only keys still stay off the processor', !('LLAMA_MOE_DOORBELL' in tuningArgs(hand({ doorbell: 1 }), 'big', { cpu: true }).env));

// ---------- The engine patches ----------
const pd = path.join(app, 'engine', 'patches');
const names = fs.readdirSync(pd);
for (const [n, key] of [['0140-power-throttling-off.patch', 'LLAMA_POWER_THROTTLING'], ['0141-page-warm.patch', 'LLAMA_PAGE_WARM'], ['0142-spec-gate-time.patch', 'LLAMA_SPEC_GATE_TIME']]) {
  check(`patch ${n} is there and reads ${key}`, names.includes(n) && fs.readFileSync(path.join(pd, n), 'utf8').includes(key));
}
const readme = read('engine/README.md');
check('the engine README lists 0140, 0141 and 0142', ['0140-power-throttling-off.patch', '0141-page-warm.patch', '0142-spec-gate-time.patch'].every((n) => readme.includes(n)));
check('their tests are there', ['page-warm.py', 'spec-gate-time.py'].every((n) => fs.existsSync(path.join(app, 'engine', 'tests', n))));

// ---------- Help, glossary, FAQ ----------
const page = HELP.find((h) => h.id === 'engine-always-on');
check('Help page in Bob\'s voice, naming the platforms and the Android app', !!page && /my engine/.test(page.html) && /Windows/.test(page.html) && /Linux/.test(page.html) && /Android app/.test(page.html));
check('Help says the speed is unproven until we test', /unproven in our lab, as we have yet to test/.test(page?.html || ''));
check('Help names the Engine tuning boxes as shown', ['Guess only while it writes faster', 'Warm up the brain file after loading', 'Let Windows slow the engine to save power'].every((t) => (page?.html || '').includes(t) && TUNING_FIELDS.some((f) => f.label.startsWith(t))));
check('FAQ', HELP.some((h) => h.id === 'faq-polystrata' && h.group === 'FAQ'));
const gl = HELP.find((h) => h.id === 'glossary')?.html || '';
check('glossary', ['Power throttling', 'Page warm-up', 'Time gate for guessing'].every((t) => gl.includes(`<dt>${t}</dt>`)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
