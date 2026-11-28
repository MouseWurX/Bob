// 25 Nov 2026: scale healing and mixed-bit squeezes (model-lab/forge/pod/heal_scales.py and mixed_bits.py), the two
// llamAmpere ideas Bob can use with stock GGUF types. The Python needs torch and llama.cpp's tools, so it was proved on a
// tiny trained Qwen3 in the cloud (results in the FAQ); this suite checks what Node can: the scripts keep every code,
// only touch scale bytes at the right places, refuse held-out text, re-check the written file, credit the idea, and Help
// explains it.
import fs from 'node:fs';
import { HELP } from '../public/help-content.js';
import { LAB_WORDS } from '../public/lab-words.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const heal = read('model-lab/forge/pod/heal_scales.py');
const mix = read('model-lab/forge/pod/mixed_bits.py');

// ---- heal_scales.py ----
// Scale byte offsets must match ggml-common.h (block layouts in llama.cpp b12359).
const want = { Q4_0: [0], Q5_0: [0], Q8_0: [0], Q4_1: [0, 2], Q5_1: [0, 2], Q2_K: [80, 82], Q3_K: [108], Q4_K: [0, 2], Q5_K: [0, 2], Q6_K: [208],
  IQ2_XXS: [0], IQ2_XS: [0], IQ2_S: [0], IQ3_XXS: [0], IQ3_S: [0], IQ1_S: [0], IQ4_NL: [0], IQ4_XS: [0] };
const table = heal.match(/SCALE_OFFSETS = \{([\s\S]*?)\n\}/)?.[1] || '';
const got = Object.fromEntries([...table.matchAll(/Q\.(\w+): \[([\d, ]+)\]/g)].map((m) => [m[1], m[2].split(',').map(Number)]));
check('every healable type has its scale bytes where ggml keeps them', Object.keys(want).every((k) => JSON.stringify(got[k]) === JSON.stringify(want[k])) && Object.keys(got).length === Object.keys(want).length, JSON.stringify(got));
check('types with no plain block scale are left out (IQ1_M, MXFP4, NVFP4, TQ)', !/Q\.(IQ1_M|MXFP4|NVFP4|TQ1_0|TQ2_0):/.test(table));
check('the split into fixed parts is proved to rebuild the file before anything learns', /rebuilt = sum\(s\[:, None\] \* a for s, a in zip\(scales, terms\)\)/.test(heal) && /if healable and err < 1e-3:/.test(heal));
check('only scales and norms learn: the optimiser gets nothing else', /groups = \[\{'params': \[t for h in healed for t in h\.t\], 'lr': a\.lr\}\]/.test(heal) && /groups\.append\(\{'params': \[n\.u for n in norms\], 'lr': a\.norm_lr\}\)/.test(heal) && /for p in model\.parameters\(\): p\.requires_grad_\(False\)/.test(heal));
check('only scale bytes are written into the copy', /blocks\[:, o:o \+ 2\] = s\.reshape\(-1, 1\)\.cpu\(\)\.numpy\(\)\.view\(np\.uint8\)/.test(heal) && /shutil\.copyfile\(a\.gguf, a\.out\)/.test(heal));
check('scales are rounded to fp16 before the after-numbers, so they describe the real file', heal.indexOf('round_fp16()') < heal.indexOf("after = evaluate()"));
check('the written file is read back and must match', /written file check/.test(heal) && /if worst > 1e-2: sys\.exit/.test(heal));
check('nothing is written when drift did not drop', /kept = after\['kl_topk'\] < before\['kl_topk'\]/.test(heal) && /writing nothing/.test(heal));
check('held-out text is refused (calibration, sessions or eval text)', /for f in \(a\.calib, a\.sessions, a\.eval_text\)/.test(heal) && /refusing: that file looks like a held-out set/.test(heal));
check('a tensor must line up with its HF twin before it is touched', /cos < a\.min_cos/.test(heal) && /does not line up with HF/.test(heal));
check('the idea is credited and the rules are stated', /llamAmpere/.test(heal) && /JakeATX/.test(heal) && /never the\nheld-out job sets, and never text written by Claude/.test(heal) && /adds no personality/.test(heal));
check('the report says what to run next with stock llama.cpp, and that drift alone never decides', /--kl-divergence-base base\.kld --kl-divergence/.test(heal) && /real-jobs run; drift numbers alone never decide/.test(heal));

// ---- gguf_layout.py: merged and reordered tensors (Qwen3.5 gated-delta layers) ----
const lay = read('model-lab/forge/pod/gguf_layout.py');
check('the layout comes from llama.cpp\'s own converter, fed values that are their own addresses', /m\.modify_tensors\(ids, name, bid\)/.test(lay) && /float\(number\[name\] \* SHIFT\)/.test(lay) && /dry_run=True/.test(lay));
check('a tensor the converter changes by arithmetic is left out, not guessed', /flat == np\.round\(flat\)/.test(lay) && /isfinite/.test(lay));
check('heal_scales follows the layout when given a llama.cpp checkout, and builds the HF tensors from the file\'s values', /if a\.llama_cpp:/.test(heal) && /trace_layout\(a\.llama_cpp, a\.teacher/.test(heal) && /flat\.index_put\(\(hp,\), w\(s_\)\.reshape\(-1\)\[gp\]\)/.test(heal));
check('an HF tensor only partly built from the file is listed in the report', /'partly_from_teacher': partial/.test(heal));

// ---- mixed_bits.py ----
check('mixed_bits writes anchored names, so blk.1 never catches blk.10', /lines\.append\(f"\^\{re\.escape\(t\['name'\]\)\}\$=\{typ\}"\)/.test(mix));
check('mixed_bits upgrades the best error drop per byte inside the budget', /gain = \(cur\['err'\] - nxt\['err'\]\) \/ extra/.test(mix) && /if extra > room: continue/.test(mix));
check('mixed_bits weighs errors by the importance matrix', /s2 \/ np\.maximum\(cnt, 1\)\[:, None\]/.test(mix) && /weights \* \(as_f32\(ct, rows\) - w\) \*\* 2/.test(mix));
check('mixed_bits keeps only steps that are bigger and better', /if o\['err'\] < clean\[-1\]\['err'\] and o\['bytes'\] > clean\[-1\]\['bytes'\]/.test(mix));
check('mixed_bits says the pick still needs the drift check and real jobs', /llama-perplexity --kl-divergence, the publish gate\nand the real-jobs run/.test(mix));

// ---- Help ----
const faq = HELP.find((h) => h.id === 'faq-scale-heal');
check('Help has the FAQ, in my voice, with the limits', !!faq && /my <code>heal_scales\.py<\/code>/.test(faq.html) && /can't bring back experts a cut removed/.test(faq.html) && /unproven in our lab/.test(faq.html) && /Windows, Mac, Linux and Android/.test(faq.html));
const gl = HELP.find((h) => h.id === 'glossary')?.html || '';
check('the glossary explains scale healing and mixed-bit squeezes', /<dt>Scale healing<\/dt>/.test(gl) && /<dt>Mixed-bit squeeze<\/dt>/.test(gl));
check('the Lab word for scale healing is there', /nothing new is taught/i.test(LAB_WORDS['scale healing'] || ''));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
