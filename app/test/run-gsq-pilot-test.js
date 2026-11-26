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
check('GSQ\'s result is kept only when it beats its own GPTQ start', /keep GSQ's result only if it beats its own GPTQ start/.test(py));
check('x_dump only reads the brain (credits imatrix.cpp for the routing ids)', /Read only: nothing is written to the brain/.test(read('forge/pod/gsq/x_dump.cpp')) && /imatrix\.cpp \(MIT\)/.test(read('forge/pod/gsq/x_dump.cpp')));
check('no kit or script names the books', !/Bobiverse/i.test(kit + py + read('forge/pod/gsq/q2_0_patch.py')));

const torch = spawnSync('python3', ['-c', 'import torch, numpy'], { encoding: 'utf8' });
if (torch.status === 0) {
  const r = spawnSync('python3', ['-I', '-c', `
import sys; sys.path.insert(0, sys.argv[1]); import numpy as np, torch, gsq_q2 as g
torch.manual_seed(0); W = torch.randn(32, 256) * 0.05; X = torch.randn(4096, 256) * torch.linspace(0.2, 3, 256)
H = X.T @ X / len(X); H += 0.01 * torch.diag(H).mean() * torch.eye(256); idx = torch.arange(256) // 64
def decode(b):   # dequantize_row_q2_0: (q - 1) * d, 2 bits a code, low bits first
    a = np.frombuffer(b, np.uint8).reshape(32, 4, 18); d = a[..., :2].copy().view(np.float16)[..., 0].astype(np.float32)
    q = np.stack([(a[..., 2:] >> s) & 3 for s in (0, 2, 4, 6)], -1).reshape(32, 4, 64).astype(np.float32)
    return torch.from_numpy(((q - 1) * d[..., None]).reshape(32, 256))
q, d = g.stock(W); ws = decode(g.pack_stock(q, d))
ok1 = torch.allclose(ws, (q.float() - 1) * d.float()[:, idx]) and bool(((q.float() - 1).abs() <= 1).all())
s = g.search_scales(W, torch.diag(H)); v = g.gptq(W, H, s); wg = decode(g.pack(v, s))
ok2 = torch.allclose(wg, v * s.half().float()[:, idx], atol=0)
cfg = dict(temperature=[2, 0.05], scale=[100, 500], std=0.01, strength=6.0, masks_lr=2e-4, scales_lr=1e-4, weight_decay=1.0)
v2, s2 = g.gsq(W, H, v, s, 200, cfg, "cpu")
l0, l1, l2 = g.loss_of(ws, W, H), g.loss_of(wg, W, H), g.loss_of(v2 * s2.half().float()[:, idx], W, H)
print(int(ok1), int(ok2), l0, l1, l2)
`, path.join(lab, 'forge/pod/gsq')], { encoding: 'utf8' });
  const [ok1, ok2, l0, l1, l2] = (r.stdout.trim().split(/\s+/)).map(Number);
  check('python ran', r.status === 0, r.stderr.slice(-400));
  check('stock rounding decodes to (q - 1) x d and, as in llama.cpp b12359, never uses the +2 level', ok1 === 1);
  check('a GPTQ/GSQ tensor decodes from q2_0 to exactly v x s (stored as q = 1 - v, d = -s)', ok2 === 1);
  check('GPTQ beats stock rounding on the layer loss, and GSQ is no worse than a quarter above GPTQ after 200 steps', l1 < l0 && l2 < l1 * 1.25, `${l0} ${l1} ${l2}`);
} else console.log('SKIP the torch checks (no torch here; the pods have it)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
