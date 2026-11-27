// 27 Nov 2026: bits by part (model-lab/forge/pod/part_bits.py) and bits by word (word_bands.py + engine patch 0150),
// two NariQ ideas on stock GGUF types. The Python needs llama.cpp's tools (and torch for the Fisher estimate), so it was
// proved on tiny brains in the cloud (engine/tests/output-bands.py, app/docs/test-results/2026-11-27-bits-by-word-tiny.md);
// this suite checks what Node can: the exact-size pick in bits_pick.py (ported line for line and run here), the band
// layout the patch reads, the rules (held-out text refused, rows checked after writing), the credit and Help.
import fs from 'node:fs';
import { HELP } from '../public/help-content.js';
import { LAB_WORDS } from '../public/lab-words.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pickPy = read('model-lab/forge/pod/bits_pick.py');
const part = read('model-lab/forge/pod/part_bits.py');
const word = read('model-lab/forge/pod/word_bands.py');
const patch = read('engine/patches/0150-output-bands.patch');

// ---- the pick, the same steps as bits_pick.py, on small made-up parts with a brute-force check ----
const clean = (opts) => { const s = [...opts].sort((a, b) => a.bytes - b.bytes || a.err - b.err); const o = [s[0]];
  for (const x of s.slice(1)) if (x.bytes > o.at(-1).bytes && x.err < o.at(-1).err) o.push(x); return o; };
const hull = (l) => { const h = [0]; for (let i = 1; i < l.length; i++) { while (h.length >= 2) { const a = l[h.at(-2)], b = l[h.at(-1)], c = l[i];
  if ((a.err - c.err) * (b.bytes - a.bytes) >= (a.err - b.err) * (c.bytes - a.bytes)) h.pop(); else break; } h.push(i); } return h; };
function pick(parts, budget) {
  parts.forEach((p) => { p.pick = 0; }); let used = parts.reduce((s, p) => s + p.ladder[0].bytes, 0);
  if (used > budget) return used;
  const H = parts.map((p) => hull(p.ladder)), pos = parts.map(() => 0);
  for (;;) { let best = -1, g = 0; parts.forEach((p, i) => { const h = H[i], k = pos[i]; if (k + 1 >= h.length) return;
      const x = p.ladder[h[k + 1]].bytes - p.ladder[h[k]].bytes; if (used + x > budget) return; const gain = (p.ladder[h[k]].err - p.ladder[h[k + 1]].err) / x; if (gain > g) { g = gain; best = i; } });
    if (best < 0) break; const h = H[best], k = pos[best]; used += parts[best].ladder[h[k + 1]].bytes - parts[best].ladder[h[k]].bytes; pos[best] = k + 1; parts[best].pick = h[k + 1]; }
  for (;;) { let best = -1, to = -1, d = 0; parts.forEach((p, i) => { const c = p.ladder[p.pick]; for (let j = p.pick + 1; j < p.ladder.length; j++) {
      const o = p.ladder[j]; if (used + o.bytes - c.bytes > budget) break; if (c.err - o.err > d) { d = c.err - o.err; best = i; to = j; } } });
    if (best < 0) break; used += parts[best].ladder[to].bytes - parts[best].ladder[parts[best].pick].bytes; parts[best].pick = to; }
  for (let r = 0; r < 50; r++) { let best = null, bd = 1e-12 * (1 + parts.reduce((s, p) => s + p.ladder[p.pick].err, 0));
    parts.forEach((p) => { for (let j = 0; j < p.pick; j++) { const freed = p.ladder[p.pick].bytes - p.ladder[j].bytes, cost = p.ladder[j].err - p.ladder[p.pick].err;
      parts.forEach((q) => { if (q === p) return; const cq = q.ladder[q.pick]; for (let k = q.pick + 1; k < q.ladder.length; k++) { const o = q.ladder[k];
        if (used - freed + o.bytes - cq.bytes > budget) break; const d = cq.err - o.err - cost; if (d > bd) { bd = d; best = [p, j, q, k]; } } }); } });
    if (!best) break; const [p, j, q, k] = best; used += p.ladder[j].bytes - p.ladder[p.pick].bytes + q.ladder[k].bytes - q.ladder[q.pick].bytes; p.pick = j; q.pick = k; }
  return used;
}
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
let worst = 0, over = 0;
for (let trial = 0; trial < 200; trial++) {
  const parts = Array.from({ length: 4 }, () => ({ ladder: clean(Array.from({ length: 4 }, (_, k) => ({ bytes: 10 * (k + 1) + Math.floor(rnd() * 8), err: 100 / (k + 1) ** (1 + rnd()) + rnd() * 5 }))) }));
  const budget = parts.reduce((s, p) => s + p.ladder[0].bytes, 0) + Math.floor(rnd() * 80);
  const used = pick(parts, budget); if (used > budget) over++;
  const got = parts.reduce((s, p) => s + p.ladder[p.pick].err, 0);
  let best = Infinity; const rec = (i, b, e) => { if (b > budget) return; if (i === parts.length) { best = Math.min(best, e); return; } for (const o of parts[i].ladder) rec(i + 1, b + o.bytes, e + o.err); }; rec(0, 0, 0);
  worst = Math.max(worst, (got - best) / best);
}
check('the pick never goes over the budget (200 made-up cases)', over === 0, `${over} over`);
check('the pick is within 15% of the best possible drift on every case (brute force)', worst < 0.15, `worst ${(100 * worst).toFixed(1)}%`);
check('the Node copy follows bits_pick.py (hull test, hull walk, fill, swaps)', /# swaps: one part down, another up/.test(pickPy) && /\(a\['err'\] - c\['err'\]\) \* \(b\['bytes'\] - a\['bytes'\]\) >= \(a\['err'\] - b\['err'\]\) \* \(c\['bytes'\] - a\['bytes'\]\)/.test(pickPy) && /# fill: best err drop that still fits/.test(pickPy));
check('bands: log-spaced, 32 at most, the top band 64 words', /n_bands = max\(1, min\(n_bands, 32\)\)/.test(pickPy) && /def band_edges\(n_rows, n_bands, first=64\)/.test(pickPy));

// ---- word_bands.py writes what 0150 reads ----
check('band names match the engine', /f'output\.band\{i\}\.weight'/.test(word) && /"output\.band0\.weight"|output\.band0\.weight/.test(patch) && /"band31\.weight"/.test(patch) && /output\.band32\.weight/.test(patch));
check('positions are F32 and the engine casts them', /w\.add_tensor\('output\.band_pos', pos\.astype\(np\.float32\)\)/.test(word) && /ggml_cast\(ctx0, model\.output_band_pos, GGML_TYPE_I32\)/.test(patch));
check('the engine refuses bands that do not add up or are the wrong width', /the output head's bands hold %lld rows, the vocabulary has %lld/.test(patch) && /wrong shape for a band of the output head/.test(patch));
check('every plain head multiply in the brains goes through the band-aware step', !/\+.*ggml_mul_mat\(ctx0, model\.output, cur\)/.test(patch) && (patch.match(/\+\s+cur = build_output_mm\(/g) || []).length >= 15);
check('the written file is read back, row by row', /written file check FAILED/.test(word) && /every row checked/.test(word));
check('every word exactly once, else nothing is written', /the bands do not hold every word exactly once/.test(word) && /repeats a word/.test(word));
check('heads with a per-tensor scale are refused', /NO_ROW_CUT = \(Q\.NVFP4,\)/.test(word) && /this head has its own scales: not supported/.test(word));
check('unband puts a plain head back for other apps', /def cmd_unband/.test(word) && /loads in every app/.test(word));
check('word counts never come from held-out jobs', /refusing: --calib looks like a held-out set/.test(word));

// ---- part_bits.py ----
check('the Fisher estimate uses the brain\'s own sampled answers (true Fisher), per word', /torch\.multinomial\(torch\.softmax\(logits, -1\), 1\)/.test(part) && /\(v \/ n_tok\)/.test(part));
check('drift estimate = 1/2 sum F x squared change', /0\.5 \* float\(\(Fw \* d \* d\)\.sum\(\)\)/.test(part));
check('the teacher is never changed: only gradients are read', /p\.grad = None/.test(part) && !/optim/.test(part));
check('held-out text is refused', /Held-out jobs are never used to shape a brain/.test(part));
check('a part with no estimate is kept at the biggest type and listed', /no_estimate_kept_big/.test(part));
check('bands need KL units (Fisher), never mixed with rounding error', /--bands needs --loss fisher/.test(part));
check('same-size budgets for fair tests', /--same-size-as/.test(part) && /--same-as/.test(word));
check('ideas credited, numbers marked unproven', /NariQ/.test(part) && /NariQ/.test(word) && /unproven in our lab, as we have yet to test/.test(part) && /SqueezeLLM/.test(part));

// ---- the pilot rental kit ----
const kit = read('model-lab/forge/pod/bits-pilot.sh');
check('the kit pins Bob by full commit and refuses without one', /git -C "\$W\/bob" rev-parse HEAD\)" = "\$BOB_SHA"/.test(kit) && /BOB_SHA not set/.test(kit));
check('the kit applies every Lamplight patch, so banded heads load', /for p in "\$BOB_DIR"\/app\/engine\/patches\/\*\.patch/.test(kit));
check('the kit reads the card\'s CUDA number and logs GPU temperature and clocks', /compute_cap/.test(kit) && /temperature\.gpu,clocks\.sm/.test(kit));
check('the kit compares the 4-bit files people ship at the 4-bit budget', ['IQ4_XS', 'IQ4_NL', 'MXFP4_MOE', 'STOCK-no-imatrix', 'UD_REPO', 'STOCK-imatrix-healed', 'PART-healed'].every((w) => kit.includes(w)));
check('the kit uploads nothing and never reads held-out jobs', !/upload|hf_api\.create|push_to_hub/i.test(kit.replace(/Uploads nothing/g, '')) && /never Bob's held-out jobs/.test(kit));

// ---- Help ----
const faq = HELP.find((h) => h.id === 'faq-bits-by-word');
check('Help has the FAQ in my voice, with where it loads and the limits', !!faq && /my engine \(Lamplight 0150\)/.test(faq.html) && /Windows, Mac, Linux and Android/.test(faq.html) && /unproven in our lab/.test(faq.html) && /Ollama and LM Studio can't open it/.test(faq.html) && /behind Turbo/.test(faq.html));
const gl = HELP.find((h) => h.id === 'glossary')?.html || '';
check('the glossary explains both', /<dt>Bits by part<\/dt>/.test(gl) && /<dt>Bits by word<\/dt>/.test(gl));
check('Lab words for both', !!LAB_WORDS['bits by word'] && !!LAB_WORDS['bits by part']);
check('the engine README lists 0150', /`0150-output-bands\.patch`/.test(read('engine/README.md')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
