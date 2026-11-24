// 23 Nov 2026 (the owner: "cut away", "Bobert NBob Flash Next", quants "on huggingface right away"): the pod cuts a brain's
// experts by a REAP keep list, quantizes it, and uploads each quant with the base model's license. This checks the plan, the
// pod step's guards (no license, no upload; training chats only for the imatrix; a quant is deleted only once it is up), that
// the PC sends the keep list, and, where Python has the gguf package, runs the cutter's own self-test on a tiny made-up brain.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const lab = fileURLToPath(new URL('../model-lab', import.meta.url));
const read = (f) => fs.readFileSync(path.join(lab, f), 'utf8').replace(/\r\n/g, '\n');

const plan = JSON.parse(read('forge/plans/cut-bobert-flashnext.json'));
const m = plan.benchmark.models[0], c = m.cut;
check('one brain, cut on the pod from the Q8_0, by the 80% keep list', plan.benchmark.models.length === 1 && m.file === 'cut' && /Q8_0-00001-of-00006\.gguf$/.test(c.src) && /all-keep-80\.json$/.test(c.keep_file));
check('named as the owner said, N filled in from what the cut leaves', c.name === 'Bobert {N}Bob A6B Flash-Next REAP80' && c.repo === 'MouseWurX/Bobert-{N}Bob-A6B-Flash-Next-REAP80-GGUF' && c.base_params === 125);
check('several quants, the 16 GB-card size served for the tests', JSON.stringify(c.quants) === JSON.stringify(['IQ2_XXS', 'IQ2_M', 'Q3_K_M', 'IQ4_XS', 'Q4_K_M']) && c.serve === 'IQ2_XXS');
check('the base model\'s own license goes with it', c.license_from === 'hf:Qwen/Qwen3.8-Flash-Next:LICENSE' && c.license_name === 'qwen-community-1.0');
check('it is judged on the held-out jobs only, with no expert mask', m.commands.some((x) => /mail-jobs\.mjs --catalog --held/.test(x)) && m.commands.some((x) => /office-jobs\.mjs --held/.test(x)) && m.commands.some((x) => /repo-jobs\.mjs --held/.test(x)) && !m.commands.some((x) => /expert-mask/.test(x)));
check('the imatrix texts come from calib-prep (training lessons only)', m.imatrix_from === 'out/bnfn-calib/imatrix' && plan.prep.some((x) => /calib-prep\.mjs/.test(x) && /TRAINING/.test(x)));
check('caps are set (no $0 run, no open-ended one)', plan.hours_max > 0 && plan.hours_max <= 9 && plan.dollars_max > 0 && plan.dollars_max <= 40 && plan.disk_gb >= 400);

const sh = read('forge/pod/run.sh');
const block = sh.slice(sh.indexOf('        cut)\n'), sh.indexOf('        hf:*) REPO=', sh.indexOf('        cut)\n')));
check('the pod has a cut step', block.length > 500 && /gguf_cut_experts\.py/.test(block));
check('no license, no upload', /NOUP=1/.test(block) && (block.match(/\[ -z "\$\{NOUP:-\}" \]/g) || []).length >= 2);
check('the ~190 GB source is deleted once the cut is written, and the cut Q8_0 at the end', /rm -rf "\$\{W:\?\}"\/bench\/src-/.test(block) && /rm -f \$CUTQ8/.test(block));
check('a quant is deleted only after it is on Hugging Face, and never the served one', /\[ "\$q" != "\$SQ" \] && grep -q "\^\$q " .*published\.txt.* && rm -f \$QF/.test(block));
check('the imatrix runs on the training chats the PC sent', /imatrix-\$BN\.tgz/.test(block) && /all\.txt/.test(block));
check('a quant over 50 GB goes up in parts (its parts are named in the upload)', /-\*-of-\*\.gguf/.test(block));
check('a quant counts only when finished: written as .part, renamed, listed in sizes.txt; left-overs removed', /\$QF\.part \$q/.test(block) && /mv -f \$QF\.part \$QF/.test(block) && /rm -f \$CD\/\*\.gguf\.part/.test(block) && /sizes\.txt/.test(block));
check('a cut brain that fails to load holds the pod for a fix, then fails (never "done")', /status hold/.test(sh) && /die "\$BN didn't load/.test(sh));
check('IQ2 gaps: small tensors q8_0, experts and embeddings q2_k; unseen experts filled', /'_exps' in n or 'token_embd' in n/.test(read('forge/pod/imatrix_gaps.py')) && /imatrix_fill\.py/.test(block));
check('the second run reuses the imatrix from the repo', /imatrix_from/.test(block) && /imatrix\.gguf$/.test(c.imatrix_from));
check('publish gate: size range per quant, a load, two sensible answers; only passed files are uploaded and listed on the card', Object.keys(c.expect_gb || {}).length === c.quants.length && /quant_gate\.sh/.test(block) && /FAILED the publish gate/.test(block) && /gated\.txt/.test(read('forge/pod/cut_card.py')) && /FAIL size/.test(read('forge/pod/quant_gate.sh')) && /FAIL load/.test(read('forge/pod/quant_gate.sh')) && /FAIL answers/.test(read('forge/pod/quant_gate.sh')));
const forge = read('forge/forge.mjs');
check('the PC sends the keep list by its file name', /m\.file === 'cut' && m\.cut\?\.keep_file/.test(forge) && /upload\(path\.basename\(kp\), kp\)/.test(forge));
const card = read('forge/pod/cut_card.py');
check('the card has the owner\'s sections (Bob project, expert choice, every keep level, tools and shape, dissertation links)', (() => { const x = read('forge/cards/bobert-flashnext.md'); return /## Part of the Bob project/.test(x) && /github\.com\/MouseWurX\/Bob/.test(x) && /How the experts were chosen/.test(x) && ['100%','90%','80%','75%','65%','60%','50%'].every((l) => x.includes('| ' + l + ' |')) && /shape 4/.test(x) && /dissertation\/ch08/.test(x) && plan.benchmark.models[0].cut.card_extra === 'cards/bobert-flashnext.md' && !/Bobiverse/i.test(x); })());
check('the card says unproven until the scores are in, and points at the license', /Unproven in our lab, as we have yet to test/.test(card) && /license_link: LICENSE/.test(card) && !/Bobiverse/i.test(card + block));

const py = spawnSync('python3', ['-c', 'import gguf, numpy'], { encoding: 'utf8' });
if (py.status === 0) {
  const r = spawnSync('python3', [path.join(lab, 'forge/pod/selftest_cut.py')], { encoding: 'utf8' });
  check('the cutter\'s self-test passes (tiny brain: exact slices, F32 and Q8_0, MTP layer, uneven list refused)', r.status === 0, (r.stdout + r.stderr).slice(-500));
} else console.log('SKIP the cutter\'s self-test (no Python gguf package here; the pod has it)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
