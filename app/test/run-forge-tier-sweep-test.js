// Forge build 23 (Nov 26 2026): the GPU tier sweep's pre-flight, plan and results table.
// Fakes only: no card, no RunPod, no Bob; the plan and kit are read from this repo, rows written to a temporary folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { planProblems, podCost, runLine, tierPreflight, KIT } from '../model-lab/forge/tier-preflight.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const forge = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'model-lab', 'forge');
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const plan = JSON.parse(read(path.join(forge, 'plans', 'tier-sweep.json')));

check('the tier sweep plan has no problems', planProblems(plan).length === 0, planProblems(plan).join('; '));
check('the pod copy of the plan is the same as the plan', read(path.join(forge, 'pod', 'tier-sweep.json')) === read(path.join(forge, 'plans', 'tier-sweep.json')));
check('every tier is on exactly one pod', plan.tiers.every((t) => plan.pods.filter((p) => p.tiers.includes(t.id)).length === 1));
check('no pod uses an H200-class card', plan.pods.every((p) => (p.gpus || []).every((g) => !/H200|B200|B300/.test(g))));
check('the pods\' caps fit the sweep\'s $12', plan.pods.reduce((n, p) => n + p.dollars, 0) <= 12 && plan.dollars_max === 12);
check('the release is pinned by its full commit', /^[0-9a-f]{40}$/.test(plan.bob_sha));
check('a tier on two pods is caught', planProblems({ ...plan, pods: [...plan.pods, { id: 'X', tiers: ['t32'], gpus: ['NVIDIA GeForce RTX 5090'], hours: 1, dollars: 1 }] }).some((x) => /t32 is on pods/.test(x)));
check('a never-list card is caught', planProblems({ ...plan, pods: plan.pods.map((p) => p.id === 'C' ? { ...p, gpus: ['NVIDIA H200'] } : p) }).some((x) => /never list/.test(x)));
check('caps over the sweep\'s are caught', planProblems({ ...plan, dollars_max: 5 }).some((x) => /add up to/.test(x)));
check('a simulated tier on a CPU pod is caught', planProblems({ ...plan, pods: plan.pods.map((p) => p.id === 'E' ? { ...p, tiers: ['tcpu', 't08-sim'] } : p.id === 'A' ? { ...p, tiers: ['t12-sim', 't24-ampere'] } : p) }).some((x) => /needs a card/.test(x)));
const a = plan.pods.find((p) => p.id === 'A');
check('the run line names the pod\'s tiers and its backup delete', runLine(a) === 'TIERS=t08-sim,t12-sim,t24-ampere HOURS_MAX=4.75 nohup bash tier-run.sh > /workspace/tier-run.log 2>&1 &');
const c = podCost(plan, a);
check('pod A is expected to cost under its cap', c && c[0] > 0 && c[1] <= a.dollars, JSON.stringify(c));
check('a CPU pod has no seen price', podCost(plan, plan.pods.find((p) => p.cpu_pod)) === null);

// pre-flight with fakes: every kit file there, programs parse
const lines = [];
const ok = tierPreflight(plan, { here: forge, preflight: true, print: (l) => lines.push(l), exists: () => true, run: () => ({ status: 0 }) });
check('pre-flight passes and ends "pre-flight OK: nothing rented"', ok && lines.at(-1) === 'pre-flight OK: nothing rented', lines.slice(-2).join(' | '));
const lines2 = [];
const ok2 = tierPreflight(plan, { here: forge, preflight: true, print: (l) => lines2.push(l), exists: (f) => !f.endsWith('ballast.py'), run: () => ({ status: 0 }) });
check('a missing kit file fails pre-flight', !ok2 && lines2.some((l) => /missing pod\/tier\/ballast\.py/.test(l)) && lines2.at(-1) === 'pre-flight FAILED: nothing rented');
const lines3 = [];
check('without --preflight Forge rents nothing for a tier plan', tierPreflight(plan, { here: forge, print: (l) => lines3.push(l) }) === false && /does not rent/.test(lines3[0]));
check('every kit file is in the repo', KIT.every((f) => fs.existsSync(path.join(forge, f))));
check('every new thing in the kit is test-only: the shim and ballast say so', /TEST ONLY, never part of Bob/.test(read(path.join(forge, 'pod', 'tier', 'nvsmi-shim.py'))) && /TEST ONLY, never part of Bob/.test(read(path.join(forge, 'pod', 'tier', 'ballast.py'))));
const sh = read(path.join(forge, 'pod', 'tier-run.sh'));
check('the pod script pins Node 22.23.5 and the release by full SHA', /NODE_V=\$\{NODE_V:-v22\.23\.5\}/.test(sh) && new RegExp(plan.bob_sha).test(sh));
check('the pod script has a backup delete', /backup delete/.test(sh) && /api\.runpod\.io\/v2\/pods/.test(sh));

// the table, from fake rows
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-tier-'));
fs.mkdirSync(path.join(tmp, 'a', 't08-sim'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'b', 't32'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'a', 't08-sim', 'row.json'), JSON.stringify({ tier: 't08-sim', label: '8 GB card (simulated)', simulated: true, card_gb_sim: 8, card: { name: 'NVIDIA RTX A5000' }, result: 'pass', steps: { long_read: { read_tps: 999 } }, engine: {}, card_log: { peak_mib: 7000, budget_mib: 7680 }, hardware: { suggestedPack: 'mid' }, brain: { name: 'Gemma 4 E4B' } }));
fs.writeFileSync(path.join(tmp, 'b', 't32', 'row.json'), JSON.stringify({ tier: 't32', label: '32 GB card', card: { name: 'NVIDIA GeForce RTX 5090' }, result: 'fail', failed_at: 'download', why: 'no answer', steps: {}, engine: {}, notes: [] }));
const t = spawnSync(process.execPath, [path.join(forge, 'pod', 'tier', 'table.mjs'), tmp], { encoding: 'utf8' });
const md = String(t.stdout || '');
check('the table has one row per tier, simulated first', md.indexOf('8 GB card (simulated)') > 0 && md.indexOf('8 GB card (simulated)') < md.indexOf('32 GB card |'));
check('a simulated row shows no speed', /\(as 8 GB\)[^\n]*\| \(sim\) \| \(sim\) \|/.test(md) && !/999/.test(md));
check('a failed row says where it stopped', /32 GB card: stopped at download: no answer/.test(md));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
