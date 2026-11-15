// 14 Nov 2026: GPT-OSS in the Forge (model-lab/forge README "Build 23"). The Python side is proved by
// model-lab/forge/pod/selftest_gptoss.py on a tiny GPT-OSS (it needs torch, so it runs on the pod image, not here). This suite
// checks what Node can: the 38B heal plan is safe and complete, run.sh keeps the GPT-OSS teacher apart from the Qwen one and
// skips what GPT-OSS doesn't need, the scripts all go through family.py, and Help explains it.
import fs from 'node:fs';
import { HELP } from '../public/help-content.js';
import { LAB_WORDS } from '../public/lab-words.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pod = (f) => read(`model-lab/forge/pod/${f}`);

// ---- the 38B heal plan ----
const plan = JSON.parse(read('model-lab/forge/plans/heal-gptoss-38b.json'));
const rung = plan.rungs?.[0] || {};
check('the plan heals from the official 120B', plan.teacher === 'openai/gpt-oss-120b');
check('one rung, cut with the 38B\'s own keep list (41 of 128)', plan.rungs.length === 1 && rung.keep === 41 && /keep-32-v2\.json$/.test(rung.keep_file) && rung.from === 'teacher');
check('a LoRA heal, packed back to MXFP4 like the unhealed file', plan.heal?.experts === 'lora' && plan.quants === 'MXFP4_MOE');
check('only cards with room for the unpacked 38B (about 76 GB) are listed', plan.gpus.length && plan.gpus.every((g) => /H200|B200/.test(g)) && (plan.step_up || []).every((g) => /H200|B200/.test(g)));
check('nothing is uploaded and the caps are set', !plan.publish && plan.hours_max > 0 && plan.hours_max <= 13 && plan.dollars_max > 0 && plan.dollars_max <= 55);
check('the heal and teacher time fit inside the cap', plan.heal.hours + plan.teacher_hours < plan.hours_max && rung.hours <= plan.heal.hours);
check('the plan says it is not approved and what to check in the first minutes', /NOT APPROVED/.test(plan.note) && /MXFP4 on this card/.test(plan.note) && /stop the pod and report/.test(plan.note));

// ---- run.sh ----
const sh = pod('run.sh');
check('a non-Qwen teacher gets its own folder and skips OpenAI\'s second copies', /case "\$TEACHER" in Qwen\/\*\) TS=\$S\/teacher; TEX=\(\);; \*\) TS=\$S\/teachers\/\$\{TEACHER\/\/\\\/\/_\}; TEX=\(--exclude "original\/\*" --exclude "metal\/\*"\);; esac/.test(sh));
check('every use of the teacher folder goes through $TS', (sh.match(/\$S\/teacher(?![-\w])/g) || []).length === 1 && sh.includes('Qwen/*) TS=$S/teacher;') && /dl "\$TEACHER" --local-dir \$TS "\$\{REV\[@\]\}" "\$\{TEX\[@\]\}"/.test(sh) && /TEACHER_DIR=\$TS;/.test(sh));
check('a GPT-OSS run installs the MXFP4 kernels and says whether the card can use them', /if \[ "\$TFAM" = "gpt-oss" \]; then\n\s+pip install -q kernels/.test(sh) && /family\.mxfp4_runs\('cuda'\)/.test(sh));
check('a GPT-OSS run does not build or wait for Qwen\'s linear-attention kernels', /QWEN_TEACHER=\$\(plan "\.get\('teacher',''\)" \| grep -q '\^Qwen\/'/.test(sh) && /\[ -n "\$QWEN_TEACHER" \] && ! grep -q "kernels done 0"/.test(sh));
check('a fold rung is skipped, not fatal, for GPT-OSS', /\[ "\$\{TFAM:-qwen\}" = gpt-oss \]; then echo "\$NAME: fold is not built for GPT-OSS yet/.test(sh));

// ---- the scripts all ask family.py ----
const fam = pod('family.py');
check('family.py tells GPT-OSS from Qwen by the config', /mt == "gpt_oss" or "gptoss" in arch/.test(fam) && /return QWEN/.test(fam));
check('a student is always unpacked to BF16, a teacher keeps MXFP4 only when the card can run it', /Mxfp4Config\(dequantize=True\)/.test(fam) && /if teacher and not mxfp4_runs\(dev\)/.test(fam) && /get_device_capability\(\)\[0\] >= 9/.test(fam));
for (const f of ['heal.py', 'teacher.py', 'count.py', 'countskills.py', 'rebuild.py'])
  check(`${f} loads through family.py`, /import[^\n]*family as FAM/.test(pod(f)) && /FAM\.load\(/.test(pod(f)) && !/^from transformers import [^\n]*Qwen3_5MoeForConditionalGeneration/m.test(pod(f)));
check('the healed and rebuilt GPT-OSS are saved as plain BF16', /FAM\.clean_saved\(a\.save\)/.test(pod('heal.py')) && /FAM\.clean_saved\(a\.dst\)/.test(pod('rebuild.py')));
for (const [f, what] of [['grpo.py', 'the tool judge'], ['fold.py', 'fold'], ['surgery.py', 'surgery'], ['merge.py', 'merge']])
  check(`${f} refuses a GPT-OSS brain in plain words`, /FAM\.family\([^)]*\) != FAM\.QWEN/.test(pod(f)) && new RegExp(`not supported yet \\(${what}`).test(pod(f)));
const prune = pod('prune.py');
check('prune.py cuts GPT-OSS experts, packed or not, and its router rows', prune.includes('GPT_OSS_RE = re.compile(r"^model\\.layers\\.(\\d+)\\.mlp\\.(experts\\.(gate_up_proj|down_proj)(_bias|_blocks|_scales)?|router\\.(weight|bias))$")') && /e_key = "num_local_experts" if gpt_oss/.test(prune));
check('prune.py reads the Lab\'s {"keep": ...} lists as well as {"layers": ...}', /kf\.get\("layers"\) if isinstance\(kf\.get\("layers"\), list\) else kf\.get\("keep"\)/.test(prune));
const data = pod('data.py');
check('harmony lessons: one call per message, the brain\'s own words masked, low effort without thinking', /def to_harmony/.test(data) && /def harmony_mask/.test(data) && /"<\|end\|>", "<\|call\|>", "<\|return\|>"/.test(data) && /reasoning_effort="medium" if think else "low"/.test(data));
const lora = pod('lora.py');
check('LoRA knows GPT-OSS experts (biases, interleaved gate/up, clamped SwiGLU)', /class GptOssExpertsLoRA/.test(lora) && /gate_up\[\.\.\., ::2\], gate_up\[\.\.\., 1::2\]/.test(lora) && /\(up \+ 1\) \* \(gate \* torch\.sigmoid\(gate \* ex\.alpha\)\)/.test(lora));
check('a checkpoint recompute stopping early is never taken for a grouped-matmul failure', (lora.match(/except _CkptStop:\n\s+raise/g) || []).length === 2);
const exp = pod('export.py');
check('export never passes --no-mtp for GPT-OSS and credits OpenAI on the card', /return FAM\.family\(model\) == FAM\.QWEN and no_ghost_guesser\(model\)/.test(exp) && /"openai": "OpenAI"/.test(exp));
check('the CPU self-test exists and uses Bob\'s own GPT-OSS template', /src", "templates", "gpt-oss\.jinja"/.test(pod('selftest_gptoss.py')) && fs.existsSync(new URL('../src/templates/gpt-oss.jinja', import.meta.url)));
check('the template line the lesson renderer patches is still in Bob\'s GPT-OSS template', read('src/templates/gpt-oss.jinja').includes('and not future_final_message.found') && data.includes('COT_STOCK = "and not future_final_message.found"'));

// ---- Help ----
const faq = HELP.find((e) => e.id === 'faq-forge-gptoss'), gl = HELP.find((e) => e.id === 'glossary');
check('an FAQ says what the GPT-OSS heal does, that it waits for a go, and what is still Qwen-only', faq && /never healed and has no adapter/.test(faq.html) && /only when you give the go/.test(faq.html) && /still Qwen-only/.test(faq.html) && /Windows, Mac or Linux/.test(faq.html) && /phone/.test(faq.html));
check('the glossary and the Lab words explain Harmony', /<dt>Harmony \(GPT-OSS's chat format\)<\/dt>/.test(gl.html) && /harmony/.test(gl.words) && typeof LAB_WORDS.harmony === 'string');
check('the Forge README has the build note', /## Build 23 \(14 November 2026[^\n]*GPT-OSS in the Forge/.test(read('model-lab/forge/README.md')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
