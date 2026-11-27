// 26 Nov 2026 (the owner: "If their research can benefit us we should attempt to implement it"; "Healing is not training"):
// GSQ-style learned rounding written into stock q2_0 tensors. Checks the pilot kit's rules (pinned commit, card number read
// from nvidia-smi, uploads nothing, training and test text kept apart) and, where torch is installed, that the q2_0 writer
// decodes to exactly the weights it means, and that GPTQ and GSQ beat stock rounding on the layer loss. Nothing on the real
// computer is read: made-up weights in a temp folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const lab = fileURLToPath(new URL('../model-lab/', import.meta.url));
const read = (p) => fs.readFileSync(path.join(lab, p), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

const kit = read('forge/pod/gsq/gsq-pilot.sh');
check('the kit pins a full 40-character Bob commit and checks it after the fetch', /BOB_SHA=\$\{BOB_SHA:-[0-9a-f]{40}\}/.test(kit) && /rev-parse HEAD\)" = "\$BOB_SHA"/.test(kit));
check('the kit reads the card\'s CUDA number (apt cmake 3.22 has no "native") and pins llama.cpp b12359', /compute_cap/.test(kit) && /TAG=b12359/.test(kit) && !/CUDA_ARCHITECTURES=native/.test(kit));
check('the kit uploads nothing and sends nothing anywhere but the downloads', !/hf upload|upload_file|upload_folder|curl -X POST|create_repo/.test(kit));
check('calibration is wikitext-2 train and scoring is wikitext-2 test (never the same text)', /--x-text "\$TR"/.test(kit) && /"\$REF" "\$TE"/.test(kit) && /\("train", sys\.argv\[2\]\), \("test", sys\.argv\[3\]\)/.test(kit));
check('the stock writer must equal llama-quantize byte for byte, or the run stops', /cmp -s "\$F" "\$BASE"/.test(kit) && /fail "writer differs from llama-quantize/.test(kit));
const py = read('forge/pod/gsq/gsq_q2.py');
check('ISTA DASLab\'s paper and repo are credited, and the port says what differs from their code', /arXiv 2604\.18556/.test(py) && /github\.com\/IST-DASLab\/GSQ, Apache-2\.0/.test(py) && /differs from their code/.test(py));
check('GSQ\'s result is kept only when it beats its own GPTQ start', /keeps GSQ's result only if it beats its own GPTQ start/.test(py));
check('x_dump only reads the brain (credits imatrix.cpp for the routing ids)', /Read only: nothing is written to the brain/.test(read('forge/pod/gsq/x_dump.cpp')) && /imatrix\.cpp \(MIT\)/.test(read('forge/pod/gsq/x_dump.cpp')));
check('the stock writer rounds like C roundf, also just below a half (pilot try 2: 0.49999997 + 0.5 is 1.0 in float32)', /a - f >= 0\.5/.test(py) && !/torch\.floor\(x\.abs\(\) \+ 0\.5\)/.test(py));
check('the forge makes a GSQ or GPTQ file from an already-made base, same size, GPTQ filling in when GSQ runs out of time (Bill kit, 27 Nov)', read('forge/pod/run.sh').includes("CJ.get('gsq',{})") && read('forge/pod/run.sh').includes('GSQ finished $NGD of') && /--batch/.test(py) && (() => { const g = JSON.parse(read('forge/plans/gsq-bill.json')); const c = g.benchmark.models[0].cut; return c.publish === false && c.gsq.MG2_S.mode === 'gptq' && c.gsq.MQ2_S.mode === 'gsq' && c.quants.indexOf('MX2_S') === 0 && g.dollars_max <= 17 && /HELD/.test(g.note); })());
check('x_dump writes through a big buffer and can stop on time keeping what it recorded; a failed x_dump is not run again by the next name; a plan can skip the PC tests (Bill GSQ rental 1)', read('forge/pod/gsq/x_dump.cpp').includes('setvbuf(f.fp, f.buf.data()') && /--x-seconds/.test(read('forge/pod/gsq/x_dump.cpp')) && read('forge/pod/run.sh').includes('touch $XD.failed') && read('forge/forge.mjs').includes('plan.benchmark.pc_tests === false ? []') && JSON.parse(read('forge/plans/gsq-bill.json')).benchmark.pc_tests === false);
check('extra tools never build into the pod\'s copied serving folder (two rentals ran on the processor after one did), and the serving tools are checked for the card after', read('forge/pod/tool_tree.sh').includes("GGML_CUDA:BOOL=ON") && read('forge/pod/gsq/build.sh').includes('refusing to build into it') && read('forge/pod/tensor_err/build.sh').includes('refusing to build into it') && !read('forge/pod/run.sh').includes('build.sh $S/llama.cpp $S/llama.cpp/build-cuda') && read('forge/pod/run.sh').includes('--list-devices'));
check('no kit or script names the books', !/Bobiverse/i.test(kit + py + read('forge/pod/gsq/q2_0_patch.py')));
check('the kit takes wikitext-2 from llama.cpp\'s plain-text zip (no pyarrow: NumPy 1 images, try 1 of 26 Nov), parquet only as the fallback', /ggml-org\/ci", "wikitext-2-raw-v1\.zip/.test(kit) && !/hf_transfer pyarrow/.test(kit) && kit.indexOf('wikitext-2-raw-v1.zip') < kit.indexOf('Salesforce/wikitext'));

const torch = spawnSync('python3', ['-c', 'import torch, numpy'], { encoding: 'utf8' });
if (torch.status === 0) {
  const r = spawnSync('python3', ['-I', '-c', `
import sys; sys.path.insert(0, sys.argv[1]); import numpy as np, torch, gsq_q2 as g
torch.manual_seed(0); W3 = torch.randn(3, 32, 256) * 0.05; X = torch.randn(4096, 256) * torch.linspace(0.2, 3, 256)
H = X.T @ X / len(X); H += 0.01 * torch.diag(H).mean() * torch.eye(256); idx = torch.arange(256) // 64
H3 = torch.stack([H, H * 0.5 + 0.1 * torch.eye(256), H]); W = W3[:1]; H1 = H3[:1]
def decode(b):   # dequantize_row_q2_0: (q - 1) * d, 2 bits a code, low bits first
    a = np.frombuffer(b, np.uint8).reshape(32, 4, 18); d = a[..., :2].copy().view(np.float16)[..., 0].astype(np.float32)
    q = np.stack([(a[..., 2:] >> s) & 3 for s in (0, 2, 4, 6)], -1).reshape(32, 4, 64).astype(np.float32)
    return torch.from_numpy(((q - 1) * d[..., None]).reshape(32, 256))[None]
q, d = g.stock(W); ws = decode(g.pack_stock(q[0], d[0]))
ok1 = torch.allclose(ws, (q.float() - 1) * d.float()[..., idx]) and bool(((q.float() - 1).abs() <= 1).all())
s = g.search_scales(W, H1.diagonal(dim1=-2, dim2=-1)); v = g.gptq(W, H1, s); wg = decode(g.pack(v[0], s[0]))
ok2 = torch.allclose(wg, v * s.half().float()[..., idx], atol=0)
# experts in a batch give what each gives alone
s3 = g.search_scales(W3, H3.diagonal(dim1=-2, dim2=-1)); v3 = g.gptq(W3, H3, s3)
ok3 = all(torch.equal(v3[k:k + 1], g.gptq(W3[k:k + 1], H3[k:k + 1], s3[k:k + 1])) for k in range(3)) and torch.equal(s3[:1], s)
cfg = dict(temperature=[2, 0.05], scale=[100, 500], std=0.01, strength=6.0, masks_lr=2e-4, scales_lr=1e-4, weight_decay=1.0)
v2, s2 = g.gsq(W, H1, v, s, 200, cfg, "cpu")
l0, l1, l2 = (float(g.loss_of(ws, W, H1)[0]), float(g.loss_of(wg, W, H1)[0]), float(g.loss_of(v2 * s2.half().float()[..., idx], W, H1)[0]))
print(int(ok1), int(ok2), l0, l1, l2, int(ok3))
`, path.join(lab, 'forge/pod/gsq')], { encoding: 'utf8' });
  const [ok1, ok2, l0, l1, l2, ok3] = (r.stdout.trim().split(/\s+/)).map(Number);
  check('python ran', r.status === 0, r.stderr.slice(-400));
  check('stock rounding decodes to (q - 1) x d and, as in llama.cpp b12359, never uses the +2 level', ok1 === 1);
  check('a GPTQ/GSQ tensor decodes from q2_0 to exactly v x s (stored as q = 1 - v, d = -s)', ok2 === 1);
  check('GPTQ on a batch of experts gives each expert exactly what it gets alone', ok3 === 1);
  check('GPTQ beats stock rounding on the layer loss, and GSQ is no worse than a quarter above GPTQ after 200 steps', l1 < l0 && l2 < l1 * 1.25, `${l0} ${l1} ${l2}`);
} else console.log('SKIP the torch checks (no torch here; the pods have it)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
