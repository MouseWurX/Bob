// Forge build 23 (26 Nov 2026): the GPU tier sweep's pre-flight. Checks the plan (plans/tier-sweep.json) and the pod kit
// (pod/tier-run.sh and pod/tier/) on this PC, rents nothing, and prints each pod's run line, card choice and cap.
//   node forge.mjs --plan plans/tier-sweep.json --preflight   ->  ends "pre-flight OK: nothing rented"
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const KIT = ['pod/tier-run.sh', 'pod/tier/drive.mjs', 'pod/tier/table.mjs', 'pod/tier/nvsmi-shim.py', 'pod/tier/ballast.py', 'pod/tier/fake-engine.py', 'pod/tier/fake-nvsmi.py', 'pod/tier/long-text.md'];

// The problems with a plan, as plain lines ([] = fine). Pure: no files, no programs.
export function planProblems(plan) {
  const out = [];
  const tiers = plan.tiers || [], pods = plan.pods || [];
  const ids = new Set(tiers.map((t) => t.id));
  const never = new Set(plan.never_cards || []);
  if (!tiers.length) out.push('the plan has no tiers');
  if (!pods.length) out.push('the plan has no pods (which tiers run on which card)');
  if (!/^[0-9a-f]{40}$/.test(String(plan.bob_sha || ''))) out.push('bob_sha must be the release\'s full 40-character commit');
  const seen = new Map();
  for (const p of pods) {
    for (const t of p.tiers || []) { if (!ids.has(t)) out.push(`pod ${p.id}: ${t} is not a tier`); if (seen.has(t)) out.push(`${t} is on pods ${seen.get(t)} and ${p.id}`); seen.set(t, p.id); }
    if (!p.cpu_pod && !(p.gpus || []).length) out.push(`pod ${p.id}: no card listed`);
    for (const g of p.gpus || []) if (never.has(g)) out.push(`pod ${p.id}: ${g} is on the never list`);
    if (!(p.hours > 0) || !(p.dollars > 0)) out.push(`pod ${p.id}: needs hours and dollars caps`);
    for (const t of p.tiers || []) { const tt = tiers.find((x) => x.id === t); if (tt?.simulated && !(tt.card_gb > 0)) out.push(`${t}: a simulated tier needs card_gb`); if (tt?.simulated && p.cpu_pod) out.push(`${t}: a simulated tier needs a card`); }
  }
  for (const t of ids) if (!seen.has(t)) out.push(`${t} is on no pod`);
  const sum = pods.reduce((n, p) => n + (Number(p.dollars) || 0), 0);
  if (plan.dollars_max && sum > plan.dollars_max) out.push(`the pods' caps add up to $${sum.toFixed(2)}, more than the sweep's $${plan.dollars_max}`);
  return out;
}

// Expected cost of a pod at the plan's seen prices: [low, high] dollars, or null when a price isn't known.
export function podCost(plan, pod) {
  const prices = (pod.gpus || []).map((g) => plan.prices_seen?.[g]?.price).filter((x) => Number.isFinite(x));
  if (!prices.length) return null;
  const hoursLikely = Math.max(0.5, (pod.tiers || []).length * 1 + 0.25);
  return [Math.min(...prices) * hoursLikely, Math.max(...prices) * Math.min(pod.hours, hoursLikely)];
}

export function runLine(pod) {
  return `TIERS=${(pod.tiers || []).join(',')} HOURS_MAX=${pod.hours} nohup bash tier-run.sh > /workspace/tier-run.log 2>&1 &`;
}

export function tierPreflight(plan, { here, preflight = false, print = console.log, run = spawnSync, exists = fs.existsSync } = {}) {
  if (!preflight) {
    print('This is a GPU tier sweep plan: Forge does not rent for it. Each pod gets the kit (pod/tier-run.sh and pod/tier/) and runs its own tiers.');
    print('Check the kit first: node forge.mjs --plan plans/tier-sweep.json --preflight');
    return false;
  }
  const bad = planProblems(plan);
  for (const f of KIT) if (!exists(path.join(here, f))) bad.push(`missing ${f}`);
  if (!exists(path.join(here, 'pod', 'tier-sweep.json'))) bad.push('missing pod/tier-sweep.json (a copy of the plan for the pod)');
  for (const f of ['pod/tier/drive.mjs', 'pod/tier/table.mjs']) {
    const r = run(process.execPath, ['--check', path.join(here, f)], { encoding: 'utf8' });
    if (r.status !== 0) bad.push(`${f} does not parse: ${String(r.stderr || '').split('\n').slice(0, 2).join(' ')}`);
  }
  const sh = run('bash', ['-n', path.join(here, 'pod', 'tier-run.sh')], { encoding: 'utf8' });
  if (sh.error) print('note: no bash on this PC, so tier-run.sh was not syntax-checked here (the pod has bash)');
  else if (sh.status !== 0) bad.push(`tier-run.sh does not parse: ${String(sh.stderr || '').trim().slice(0, 200)}`);
  print(`Tier sweep ${plan.run}: Bob ${plan.bob_release} (${plan.bob_sha}), ${plan.tiers?.length || 0} tiers on ${plan.pods?.length || 0} pods, one pod at a time, cap $${plan.dollars_max} / ${plan.hours_max} h`);
  for (const p of plan.pods || []) {
    const c = podCost(plan, p);
    print(`  pod ${p.id}: ${p.cpu_pod ? `CPU pod ${p.cpu_pod.vcpus} vCPU / ${p.cpu_pod.ram_gb} GB` : (p.gpus || []).join(' or ')}; ${p.tiers.join(', ')}; cap ${p.hours} h / $${p.dollars}${c ? `; expected $${c[0].toFixed(2)}-${c[1].toFixed(2)}` : ''}`);
    print(`    ${runLine(p)}`);
  }
  if (bad.length) { for (const b of bad) print(`PROBLEM: ${b}`); print('pre-flight FAILED: nothing rented'); return false; }
  print('pre-flight OK: nothing rented');
  return true;
}
