// 24 Nov 2026 (the owner: integrate llamAmpere's tricks, "learn from it", "PROPERLY scope the project and dont miss details"):
// mixed-bit quant recipes for the Flash-Next cuts, stock llama.cpp types only. This checks the size predictor against the five
// files the pods really made, that every recipe uses only stock types, that the rental plan is held and capped, and that the pod
// hooks are in run.sh. Nothing on the real computer is read: Python runs on the repo's own files and a temp folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const lab = fileURLToPath(new URL('../model-lab/', import.meta.url));
const read = (p) => fs.readFileSync(path.join(lab, p), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

const recipe = JSON.parse(read('forge/pod/recipes/flashnext-mixed.json'));
const STOCK = new Set(['f32', 'f16', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'q5_0', 'q5_1', 'iq4_nl', 'q2_0', 'q2_k', 'q3_k', 'q4_k', 'q5_k', 'q6_k', 'iq2_xxs', 'iq2_xs', 'iq2_s', 'iq3_xxs', 'iq3_s', 'iq1_s', 'iq1_m', 'iq4_xs']);
const allRules = [...recipe.common.rules, ...recipe.recipes.flatMap((r) => r.rules)];
check('every rule names a stock llama.cpp type (files load on any llama.cpp; no AI+ or other fork-only type)', allRules.every((r) => STOCK.has(r.type)), allRules.filter((r) => !STOCK.has(r.type)).map((r) => r.type).join());
check('every rule is a valid pattern and every layer pick is top:N or bottom:N', allRules.every((r) => { try { new RegExp(r.match); } catch { return false; } return !r.layers || /^(top|bottom):\d+$/.test(r.layers); }));
check('the word table stays at q4_0 (160 wide: nothing smaller fits) and the hyper-connections are guarded', recipe.common.rules[0].match.includes('per_layer_token_embd') && recipe.common.rules[0].type === 'q4_0' && recipe.common.rules.some((r) => r.match === 'hc_' && r.type === 'q8_0'));
check('the placeholder layer order holds each of the 48 layers once', recipe.layer_rank.placeholder.length === 48 && new Set(recipe.layer_rank.placeholder).size === 48 && recipe.layer_rank.placeholder.every((l) => l >= 0 && l < 48));
check('llamAmpere and Unsloth are credited, and nothing claims their idea', /llamAmpere \(MIT, v0\.7\.4/.test(recipe.note) && /Unsloth/.test(recipe.note));

const plan = JSON.parse(read('forge/plans/mixed-bit-bill.json')), cut = plan.benchmark.models[0].cut;
check('the rental plan names the owner\'s yes, uploads nothing, capped, one non-H200 card, measure-and-publish only', /HELD: not to be rented until the owner says so in their own words in the laptop thread/.test(plan.note) && /bill test rental is a go/.test(plan.note) && cut.publish === false && plan.hours_max <= 6 && plan.dollars_max <= 17 && !plan.gpus.some((g) => /H200|B200|B300/.test(g)) && plan.benchmark.models.length === 1 && plan.benchmark.models[0].commands.length === 0);
check('Bill\'s plan makes the two baselines again and the three recipes, with KLD, the recipe file and a gate range for each', ['IQ2_XXS', 'IQ2_M', 'MX2_S', 'MX2_M', 'MX3_S'].every((q) => cut.quants.includes(q) && cut.expect_gb[q] && cut.predict_gb[q]) && cut.kld === true && cut.recipe_file === 'flashnext-mixed.json' && cut.recipe_cut === 'bill' && cut.keep_file.endsWith('all-keep-60.json') && /^hf:MouseWurX\/Bill-77Bob-A6B-Flash-Next-REAP60-GGUF:imatrix\.gguf$/.test(cut.imatrix_from));
check('every gate range holds its own prediction', cut.quants.every((q) => { const [lo, hi] = cut.expect_gb[q].split('-').map(Number); return lo <= cut.predict_gb[q] && cut.predict_gb[q] <= hi; }));
check('no plan, recipe or script names the books', !/Bobiverse/i.test(read('forge/plans/mixed-bit-bill.json') + read('forge/pod/recipes/flashnext-mixed.json') + read('forge/pod/quant_recipe.py') + read('forge/pod/kld_check.sh') + read('forge/pod/layer_rank.py')));

const sh = read('forge/pod/run.sh');
check('run.sh: a recipe quant gets its base type and rules; the imatrix gap rules come first; the base type picks the gap step', /quant_recipe\.py --recipe \$POD\/recipes\/\$RCF --name \$q --ftype-of/.test(sh) && /"\$\{TT\[@\]\}" "\$\{RT\[@\]\}" \$CUTQ8 \$QF\.part \$FT/.test(sh) && /case "\$FT" in IQ1\*\|IQ2\*\)/.test(sh));
check('run.sh: KLD runs before the gate (a failed file still gets its number), only when the plan asks', sh.indexOf('kld_check.sh $CUTQ8') > 0 && sh.indexOf('kld_check.sh $CUTQ8') < sh.indexOf('bash $POD/quant_gate.sh') && /\$CJ\.get\('kld',False\)/.test(sh));
check('run.sh: a layer order already in the recipe is kept; only a missing one is read from the imatrix', /get\('layer_rank',\{\}\)\.get\(sys\.argv\[2\]\)/.test(sh) && /layer_rank\.py --imatrix \$IMX --cut \$RCC/.test(sh));
check('run.sh: publish false leaves the repo, its visibility and its card alone', /CPUB=\$\(plan "\$CJ\.get\('publish',True\)"\)/.test(sh) && /\[ "\$CPUB" = "True" \] && set_visibility/.test(sh) && /\[ "\$CPUB" = "True" \] && \{ PYTHONPATH= python3 \$POD\/cut_card\.py/.test(sh));
const kld = read('forge/pod/kld_check.sh');
check('kld_check.sh only measures: no upload, no delete of the reference, writes a .part then renames', !/publish|hf upload|rm -f "\$REF"/.test(kld) && /base\.kld\.part/.test(kld) && /mv -f "\$OUT\/base\.kld\.part" "\$OUT\/base\.kld"/.test(kld));
check('the pod builds llama-perplexity for the KLD step', /--target llama-perplexity/.test(read('forge/pod/llama-server-build.sh')));

const py = spawnSync('python3', ['--version'], { encoding: 'utf8' });
if (py.status === 0) {
  const run = (args) => spawnSync('python3', ['-I', path.join(lab, 'forge/pod/quant_recipe.py'), ...args], { encoding: 'utf8' });
  const st = run(['--selftest']);
  check('the built-in Flash-Next layout matches the pods: 1224 tensors, their types, the cut\'s bytes, the source size', st.status === 0, st.stdout + st.stderr);
  const sizes = (c) => Object.fromEntries(JSON.parse(run(['--recipe', path.join(lab, 'forge/pod/recipes/flashnext-mixed.json'), '--cut', c, '--json']).stdout).map((r) => [r.name, r.gb]));
  const bill = sizes('bill'), bob = sizes('bobert');
  const near = (a, b) => Math.abs(a - b) <= 0.05;
  check('the predictor reproduces the files the pods made (Bill IQ2_XXS 50.3, IQ2_M 53.56, Q3_K_M 69.16; Bobert IQ2_XXS 56.75, IQ2_M 61.0 GB)', near(bill.IQ2_XXS, 50.3) && near(bill.IQ2_M, 53.56) && near(bill.Q3_K_M, 69.16) && near(bob.IQ2_XXS, 56.75) && near(bob.IQ2_M, 61.0), JSON.stringify({ bill, bob }));
  check('the plan\'s predictions are the predictor\'s', cut.quants.every((q) => near(cut.predict_gb[q], bill[q])));
  check('Bobert-only recipe stays off the other cuts', bob.MX1_S > 0 && bill.MX1_S === undefined);
  const args = run(['--recipe', path.join(lab, 'forge/pod/recipes/flashnext-mixed.json'), '--cut', 'bill', '--name', 'MX2_M', '--args']).stdout.trim().split('\n');
  check('--args gives llama-quantize pairs (--tensor-type, pattern=type), first match first, layer picks as anchored patterns', args.length % 2 === 0 && args.filter((_, i) => i % 2 === 0).every((x) => x === '--tensor-type') && args.some((x) => /^\^blk\\\.\(([0-9]+\|){7}[0-9]+\)\\\.\.\*\(\?:ffn_down_exps\)=q4_0$/.test(x)));
  const ft = run(['--recipe', path.join(lab, 'forge/pod/recipes/flashnext-mixed.json'), '--name', 'MX3_S', '--ftype-of']), base = run(['--recipe', path.join(lab, 'forge/pod/recipes/flashnext-mixed.json'), '--name', 'IQ2_M', '--ftype-of']);
  check('--ftype-of names a recipe\'s base type and refuses a stock quant name (run.sh treats those as before)', ft.stdout.trim() === 'IQ2_M' && base.status === 1);
  // layer order from a made-up KLD block sweep, written into a temp copy of the recipe
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-mx-')), rc = path.join(tmp, 'r.json'), tsv = path.join(tmp, 'kld.tsv');
  fs.writeFileSync(rc, JSON.stringify({ recipes: [] }));
  fs.writeFileSync(tsv, '# name\tmean_kld\n' + ['base\t0.30', ...Array.from({ length: 6 }, (_, i) => `block${i * 8}-${i * 8 + 7}\t${(0.29 - (i === 2 ? 0.05 : 0.01 * i)).toFixed(3)}`)].join('\n') + '\n');
  const lr = spawnSync('python3', ['-I', path.join(lab, 'forge/pod/layer_rank.py'), '--kld', tsv, '--cut', 'bill', '--recipe', rc, '--write'], { encoding: 'utf8' });
  const got = JSON.parse(fs.readFileSync(rc, 'utf8'));
  check('a KLD block sweep ranks the block that helps most first and is written into the recipe', lr.status === 0 && got.layer_rank.bill.slice(0, 8).join() === '16,17,18,19,20,21,22,23' && got.layer_rank.bill.length === 48 && got.layer_rank_source.bill === 'kld', lr.stdout + lr.stderr);
  fs.rmSync(tmp, { recursive: true, force: true });
} else console.log('SKIP the Python checks (no python3 here; the pods and npc have it)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
