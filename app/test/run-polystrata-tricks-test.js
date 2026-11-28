// Nov 27: the engine speed-ups taken from PolyStrata (Brain Engine 0140-0142, and the container's processor limit):
// off by default until a test shows a gain, same words, each with a way to turn it on, and Help, glossary and FAQ. Nothing here reads the real
// computer: the container's limit files, the processor count and the platform are fakes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { containerCpus, containerThreads, specGateEnv } from '../src/engine-extras.js';
import { TUNING_FIELDS, tuningArgs } from '../src/engine-tuning.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, why = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && why ? ` (${why})` : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');

// ---------- Off by default (Nov 27: not on, and not in Turbo, until a test shows a gain) ----------
const lc = read('src/llamacpp.js');
check('Bob sends no time gate, page warm-up or power key by himself', !/LLAMA_SPEC_GATE_TIME|LLAMA_PAGE_WARM|LLAMA_POWER_THROTTLING/.test(lc) && !/specGateTimeEnv|powerThrottleEnv/.test(lc));
{ const srcDir = path.join(app, 'src');
  const users = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js') && f !== 'engine-tuning.js' && /LLAMA_SPEC_GATE_TIME|LLAMA_PAGE_WARM|LLAMA_POWER_THROTTLING/.test(read(`src/${f}`).replace(/\/\/.*$/gm, '')));
  check('nor Turbo, nor any other part of Bob: only the Engine tuning boxes set them', users.length === 0, users.join(', ')); }
check('the share-kept gate is as before', specGateEnv({}).LLAMA_SPEC_GATE === '0.3');
const p140 = fs.readFileSync(path.join(app, 'engine', 'patches', '0140-power-throttling-off.patch'), 'utf8');
const p141 = fs.readFileSync(path.join(app, 'engine', 'patches', '0141-page-warm.patch'), 'utf8');
check('the engine itself leaves throttling to Windows unless LLAMA_POWER_THROTTLING_OFF=1', /getenv\("LLAMA_POWER_THROTTLING_OFF"\)/.test(p140) && /strcmp\(on, "1"\) == 0/.test(p140));
check('and warms pages only with LLAMA_PAGE_WARM=1', /warm_env && strcmp\(warm_env, "1"\) == 0/.test(p141));

// ---------- A container's processor limit ----------
const fake = (files) => (f) => { if (f in files) return files[f]; throw new Error('missing'); };
check('cgroup v2: 400000 of 100000 is 4 processors', containerCpus(fake({ '/sys/fs/cgroup/cpu.max': '400000 100000\n' }), 'linux') === 4);
check('cgroup v2: a part processor rounds down, never below 1', containerCpus(fake({ '/sys/fs/cgroup/cpu.max': '250000 100000' }), 'linux') === 2 && containerCpus(fake({ '/sys/fs/cgroup/cpu.max': '50000 100000' }), 'linux') === 1);
check('cgroup v2: "max" is no limit', containerCpus(fake({ '/sys/fs/cgroup/cpu.max': 'max 100000' }), 'linux') === null);
check('cgroup v1: quota and period', containerCpus(fake({ '/sys/fs/cgroup/cpu/cpu.cfs_quota_us': '600000', '/sys/fs/cgroup/cpu/cpu.cfs_period_us': '100000' }), 'linux') === 6);
check('cgroup v1: -1 is no limit', containerCpus(fake({ '/sys/fs/cgroup/cpu/cpu.cfs_quota_us': '-1', '/sys/fs/cgroup/cpu/cpu.cfs_period_us': '100000' }), 'linux') === null);
check('no files, or not Linux: no limit', containerCpus(fake({}), 'linux') === null && containerCpus(fake({ '/sys/fs/cgroup/cpu.max': '400000 100000' }), 'win32') === null);
const ON = { llamacpp: { containerThreads: true } };
check('threads: off by default, even under a limit', containerThreads({}, { cpus: 64, limit: 4 }) === null && containerThreads({ llamacpp: { containerThreads: 'yes' } }, { cpus: 64, limit: 4 }) === null);
check('threads: switched on, the limit when it is below the processors seen', containerThreads(ON, { cpus: 64, limit: 4 }) === 4);
check('threads: nothing when there is no limit, or it is not below', containerThreads(ON, { cpus: 16, limit: null }) === null && containerThreads(ON, { cpus: 8, limit: 8 }) === null && containerThreads(ON, { cpus: 8, limit: 16 }) === null);
check('Bob uses it only when no other thread rule or hand setting gave threads', /num\(lc\.threads, '-t'\)\.length \? num\(lc\.threads, '-t'\) : rentalThreads\(this\.cfg\) \? \['-t', String\(rentalThreads\(this\.cfg\)\)\] : \[\]/.test(lc));

// ---------- Engine tuning boxes ----------
const by = Object.fromEntries(TUNING_FIELDS.map((f) => [f.k, f]));
check('three boxes: the time gate, page warm-up, power throttling', by.draftTimeGate?.env === 'LLAMA_SPEC_GATE_TIME' && by.pageWarm?.env === 'LLAMA_PAGE_WARM' && by.powerThrottle?.env === 'LLAMA_POWER_THROTTLING_OFF');
const hand = (levers) => ({ engineTuning: { mode: 'hand', list: [{ model: 'big', ...levers }] } });
{ const t = tuningArgs(hand({ draftTimeGate: 1, pageWarm: 1, powerThrottle: 1 }), 'big', { cpu: true });
  check('turned on by hand they reach the engine, on the processor too', t.env.LLAMA_SPEC_GATE_TIME === '1' && t.env.LLAMA_PAGE_WARM === '1' && t.env.LLAMA_POWER_THROTTLING_OFF === '1', JSON.stringify(t.env)); }
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
check('Help says they are off by default', /off by default/.test(page?.html || ''));
check('Help names the Engine tuning boxes as shown', ['Guess only while it writes faster', 'Warm up the brain file after loading', 'Stop Windows slowing the engine'].every((t) => (page?.html || '').includes(t) && TUNING_FIELDS.some((f) => f.label.startsWith(t))));
check('FAQ', HELP.some((h) => h.id === 'faq-polystrata' && h.group === 'FAQ'));
const gl = HELP.find((h) => h.id === 'glossary')?.html || '';
check('glossary', ['Power throttling', 'Page warm-up', 'Time gate for guessing'].every((t) => gl.includes(`<dt>${t}</dt>`)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
