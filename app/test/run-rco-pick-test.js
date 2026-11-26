// 26 Nov 2026 (the owner: "If their research can benefit us we should attempt to implement it", ISTA DASLab's GSQ-RCO
// quants): our own RCO-style exact-size bit picker. Checks that pod/rco_pick.py lands on the byte budget it is given, only
// names stock llama.cpp types, spends bits where the measured error is largest, keeps fixed tensors, and that the rental
// plan is held, capped and uploads nothing. Nothing on the real computer is read: made-up errors in a temp folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const lab = fileURLToPath(new URL('../model-lab/', import.meta.url));
const read = (p) => fs.readFileSync(path.join(lab, p), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const STOCK = new Set(['f32', 'f16', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'q5_0', 'q5_1', 'iq4_nl', 'q2_0', 'q2_k', 'q3_k', 'q4_k', 'q5_k', 'q6_k', 'iq2_xxs', 'iq2_xs', 'iq2_s', 'iq3_xxs', 'iq3_s', 'iq1_s', 'iq1_m', 'iq4_xs']);

const plan = JSON.parse(read('forge/plans/rco-bill.json')), cut = plan.benchmark.models[0].cut;
check('the rental plan is held for the owner\'s own yes, uploads nothing, capped 5 h / $14, one non-H200 card', /HELD: not to be rented until the owner says so in their own words in the laptop thread/.test(plan.note) && cut.publish === false && plan.hours_max <= 5 && plan.dollars_max <= 14 && !plan.gpus.some((g) => /H200|B200|B300/.test(g)) && plan.benchmark.models.length === 1);
check('the plan remakes the two files it is compared with and makes the two picks, each with KLD and a gate range (RC2_B dropped 26 Nov to fit the money left)', ['IQ2_XXS', 'MX2_S', 'RC2_A', 'RC2_S'].every((q) => cut.quants.includes(q) && cut.expect_gb[q] && cut.predict_gb[q]) && !cut.quants.includes('RC2_B') && cut.kld === true && cut.rco.length === 2 && plan.dollars_max <= 9.65 && cut.rco.every((r) => cut.quants.includes(r.name) && (r.target_recipe || r.target_ftype)));
check('ISTA DASLab\'s paper is named and nothing claims their code', /arXiv 2605\.00649/.test(plan.note) && /no code published/.test(plan.note) && /[Oo]ur own/.test(read('forge/pod/rco_pick.py')));
check('the plan pins its keep list by checksum, and pre-flight refuses a missing or changed keep list before renting', /^[0-9a-f]{64}$/.test(cut.keep_sha256 || '') && /keep list \$\{kp\} is missing/.test(read('forge/forge.mjs')) && /keep_sha256/.test(read('forge/forge.mjs')));
const sh = read('forge/pod/run.sh');
check('the KLD text comes from llama.cpp\'s plain-text zip first (no pyarrow), the parquet copy after', sh.indexOf('ggml-org/ci wikitext-2-raw-v1.zip') > 0 && sh.indexOf('ggml-org/ci wikitext-2-raw-v1.zip') < sh.indexOf('Salesforce/wikitext'));
check('run.sh: the picks are written before the quant loop, only when the plan asks, from the cut\'s own Q8_0 and imatrix', sh.indexOf('rco_pick.py --err') > 0 && sh.indexOf('rco_pick.py --err') < sh.indexOf('for q in $(plist "$CJ[\'quants\']"') && /\$CJ\.get\('rco',\[\]\)/.test(sh) && /tensor_err\/build\.sh/.test(sh) && /-m \$CUTQ8 --imatrix \$RQIMX/.test(sh));
check('tensor_err only reads the model (opened read-only, mapped read-only)', /O_RDONLY/.test(read('forge/pod/tensor_err/tensor_err.cpp')) && /PROT_READ, MAP_SHARED/.test(read('forge/pod/tensor_err/tensor_err.cpp')) && !/O_RDWR|O_WRONLY|PROT_WRITE/.test(read('forge/pod/tensor_err/tensor_err.cpp')));
check('no plan or script names the books', !/Bobiverse/i.test(read('forge/plans/rco-bill.json') + read('forge/pod/rco_pick.py') + read('forge/pod/tensor_err/tensor_err.cpp')));

const py = spawnSync('python3', ['--version'], { encoding: 'utf8' });
if (py.status === 0) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-rco-')), err = path.join(tmp, 'err.tsv'), rc = path.join(tmp, 'r.json');
  fs.copyFileSync(path.join(lab, 'forge/pod/recipes/flashnext-mixed.json'), rc);
  // made-up errors on the built-in Bill layout: error falls 4x per bit; the hyper-connection mixers count 50x
  const gen = spawnSync('python3', ['-I', '-c', `
import sys; sys.path.insert(0, sys.argv[1]); import quant_recipe as qr
bits = {"iq1_m": 1.75, "iq2_xxs": 2.06, "q2_0": 2.25, "iq2_xs": 2.31, "iq2_s": 2.56, "q2_k": 2.63, "iq3_xxs": 3.06, "iq3_s": 3.44, "q3_k": 3.44, "q4_0": 4.5, "iq4_xs": 4.25, "q4_k": 4.5, "q5_k": 5.5, "q6_k": 6.56, "q8_0": 8.5}
out = open(sys.argv[2], "w"); out.write("# name\\ttype\\tbytes\\terr\\tref\\trows_sampled\\trows_total\\n")
for n, s, _ in qr.flashnext(308):
    if not qr.allows_quant(n, s) or n.startswith("per_layer_token_embd"): continue
    rows = 1
    for d in s[1:]: rows *= d
    w = 50.0 if "hc_" in n else 1.0
    for t, b in bits.items():
        if s[0] % qr.QS[t][0]: continue
        out.write(f"{n}\\t{t}\\t{qr.nbytes(s, t)}\\t{w * rows * s[0] * 4.0 ** (-b):.6e}\\t{rows * s[0]:.6e}\\t512\\t{rows}\\n")
`, path.join(lab, 'forge/pod'), err], { encoding: 'utf8' });
  check('made-up error table written', gen.status === 0, gen.stderr);
  const pick = (name, target, extra = []) => spawnSync('python3', ['-I', path.join(lab, 'forge/pod/rco_pick.py'), '--err', err, '--cut', 'bill', '--name', name, '--target-recipe', target, '--recipe', rc, '--write', ...extra], { encoding: 'utf8' });
  const a = pick('RC2_A', 'IQ2_XXS'), s = pick('RC2_S', 'MX2_S');
  check('two picks run', a.status === 0 && s.status === 0, a.stderr + s.stderr);
  const sizes = Object.fromEntries(JSON.parse(spawnSync('python3', ['-I', path.join(lab, 'forge/pod/quant_recipe.py'), '--recipe', rc, '--cut', 'bill', '--json'], { encoding: 'utf8' }).stdout).map((r) => [r.name, r.gb]));
  check('each pick is the size of the file it is set against, to 0.01 GB (IQ2_XXS 50.30, MX2_S 51.93)', Math.abs(sizes.RC2_A - sizes.IQ2_XXS) <= 0.01 && Math.abs(sizes.RC2_S - sizes.MX2_S) <= 0.01 && sizes.RC2_S > sizes.RC2_A, JSON.stringify(sizes));
  const under = (o) => Number((o.match(/\(([\d.]+) MB under\)/) || [])[1]);
  check('and never over it, within 50 MB under', under(a.stdout) >= 0 && under(a.stdout) <= 50 && under(s.stdout) >= 0 && under(s.stdout) <= 50, a.stdout.split('\n')[1]);
  const got = JSON.parse(fs.readFileSync(rc, 'utf8')), ra = got.recipes.find((r) => r.name === 'RC2_A');
  check('a pick only names stock types, anchors every rule to one tensor, and has no common rules mixed in', ra.rules.every((r) => STOCK.has(r.type) && /^\^.*\$$/.test(r.match)) && ra.no_common === true && ra.ftype === 'IQ2_XXS');
  const hc = ra.rules.filter((r) => /hc_/.test(r.match)).map((r) => r.type), ex = ra.rules.filter((r) => /ffn_(gate|up)_exps/.test(r.match)).map((r) => r.type);
  const avg = (ts) => ts.reduce((x, t) => x + ({ iq1_m: 1.75, iq2_xxs: 2.06, q2_0: 2.25, iq2_xs: 2.31, iq2_s: 2.56, q2_k: 2.63, iq3_xxs: 3.06, iq3_s: 3.44, q3_k: 3.44, q4_0: 4.5, iq4_xs: 4.25, q4_k: 4.5, q5_k: 5.5, q6_k: 6.56, q8_0: 8.5 }[t] || 0), 0) / ts.length;
  check('bits go where the measured error is largest (the 50x mixers get more bits than the experts)', avg(hc) > avg(ex) + 1, `${avg(hc)} vs ${avg(ex)}`);
  const fx = path.join(tmp, 'fixed.txt'); fs.writeFileSync(fx, '--tensor-type\n^blk\\.5\\.hc_attn_down\\.weight$=q2_k\n');
  const f = pick('RC2_F', 'IQ2_XXS', ['--fixed', fx]);
  const rf = JSON.parse(fs.readFileSync(rc, 'utf8')).recipes.find((r) => r.name === 'RC2_F');
  check('a tensor a fixed rule names is left out of the pick (the imatrix gap rules stay first on the pod)', f.status === 0 && !rf.rules.some((r) => r.match.includes('blk\\.5\\.hc_attn_down')), f.stderr);
  const bad = spawnSync('python3', ['-I', path.join(lab, 'forge/pod/rco_pick.py'), '--err', err, '--cut', 'bill', '--name', 'X', '--target-gb', '30'], { encoding: 'utf8' });
  check('a budget smaller than the smallest file is refused, not guessed', bad.status !== 0 && /over the budget/.test(bad.stderr + bad.stdout));
  fs.rmSync(tmp, { recursive: true, force: true });
} else console.log('SKIP the Python checks (no python3 here; the pods and npc have it)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
