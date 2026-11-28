// 28 Nov 2026 (the owner: "get yaqa and trellis ready for comparision"; "Small brains first, get it to work right, over
// multiple cards"): our own maker for Nari's trellis format (Lamplight 0136) with LDLQ and YAQA rounding. Checks the kit's
// rules (pinned commits, card number from nvidia-smi, uploads nothing, train and test text kept apart, every step timed,
// the split over several cards) and, where numpy/torch are installed, that the packed words decode as the engine reads
// them, that the codes are tail-biting, that a coded file part decodes back to the maker's own weights, and that LDLQ and
// YAQA each beat plain rounding on their own loss. Nothing on the real computer is read: made-up weights only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const lab = fileURLToPath(new URL('../model-lab/', import.meta.url));
const dir = path.join(lab, 'forge/pod/trellis');
const read = (p) => fs.readFileSync(path.join(lab, p), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

const kit = read('forge/pod/trellis/trl-pilot.sh');
check('the kit pins the engine patches and llama.cpp to full commits and checks them', /ENGINE_SHA=\$\{ENGINE_SHA:-[0-9a-f]{40}\}/.test(kit) && /LLAMA_SHA=[0-9a-f]{40}/.test(kit) && kit.includes('rev-parse HEAD)" = "$sha"') && kit.includes('BOB_SHA=${BOB_SHA:?'));
check('the kit reads the card\'s CUDA number and never uses "native" (apt cmake 3.22)', /compute_cap/.test(kit) && !/CUDA_ARCHITECTURES=native/.test(kit));
check('the kit uploads nothing', !/hf upload|upload_file|upload_folder|curl -X POST|create_repo/.test(kit));
check('calibration is wikitext-2 train, scoring is wikitext-2 test', kit.includes('--text "$TR"') && kit.includes('"$REF" "$TE"'));
check('every step is timed and the cards are logged (temperature, clocks, throttle reasons)', kit.includes('s total)') && kit.includes('clocks_event_reasons.active'));
check('the work is split over every card: Hessians, trellis runs and the KLD reads', kit.includes('--devices "$NGPU"') && (kit.match(/--devices "\$NGPU"/g) || []).length >= 2 && /-ngl 999/.test(read('forge/pod/kld_check.sh')));
check('the CUDA Viterbi is checked against the torch one before any real work', kit.indexOf('"$TP/trl_selftest.py"') > 0 && kit.indexOf('"$TP/trl_selftest.py"') < kit.indexOf('"$TP/hess_hf.py"'));
check('a canary mode runs every new step once on a small brain', /CANARY=1/.test(kit) && kit.includes('Qwen/Qwen3-0.6B'));
check('every row keeps the same token table and head', kit.includes('--token-embedding-type q8_0 --output-tensor-type q8_0'));
const q = read('forge/pod/trellis/trl_quant.py');
check('YAQA and QTIP/EXL3 are credited with their licences', /arXiv 2505\.22988/.test(q) && /GPL-3/.test(q) && /exllamav3/.test(read('forge/pod/trellis/trl_cuda.py')) && /MIT/.test(read('forge/pod/trellis/trl_cuda.py')));
check('the writer marks the file as a trellis file and refuses a gguf-py without TRL types', /trellis\.version", 1/.test(read('forge/pod/trellis/trl_write.py')) && /no TRL types/.test(read('forge/pod/trellis/trl_write.py')));

const has = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0;
if (has) {
  const r = spawnSync('python3', ['-I', '-c', `
import sys; sys.path.insert(0, sys.argv[1]); import numpy as np, trl_codec as C
rng = np.random.default_rng(1); ok = True
for k in (2, 3, 4):
    N, K = 32, 48; bits = rng.integers(0, 2, (N // 16 * K // 16, 256 * k)); st = np.zeros((bits.shape[0], 256), np.int64)
    for p in range(256):
        idx = (np.arange(16) + (p + 1) * k - 16) % (256 * k); st[:, p] = (bits[:, idx] * (1 << np.arange(15, -1, -1))).sum(1)
    st = st.reshape(N // 16, K // 16, 256); w = C.tiles_to_words(st, k); s16 = rng.random(K // 16).astype(np.float32)
    # the engine's loop (ggml_trellis_decode_rows), written out here as the reference
    ref = np.zeros((N, K), np.float32); nw, total = 8 * k, 256 * k; ww = w.astype(np.uint64)
    for J in range(N // 16):
        for i in range(K // 16):
            t = ww[(J * (K // 16) + i) * nw:(J * (K // 16) + i + 1) * nw]
            for p in range(256):
                s0 = ((p + 1) * k - 16 + total) % total; a_, o = s0 >> 5, s0 & 31
                state = int(((int(t[a_]) << 32) | int(t[(a_ + 1) % nw])) >> (48 - o)) & 0xFFFF; x = (state * 0x83DCD12D) & 0xFFFFFFFF
                v = ((x >> 2) & 63) + ((x >> 10) & 63) + ((x >> 18) & 63) + ((x >> 26) & 63) - 126
                a, jj = p >> 3, p & 7; row = (a >> 2) + 8 * ((jj >> 2) & 1); col = 2 * (a & 3) + (jj & 1) + 8 * ((jj >> 1) & 1)
                ref[16 * J + row, 16 * i + col] = v * s16[i]
    ok &= bool(np.array_equal(ref, C.decode(w, k, K, N, s16))) and C.check_tail_biting(st, k)
print(int(ok), round(C.GRID_SD, 3))
`, dir], { encoding: 'utf8' });
  const [ok, sd] = r.stdout.trim().split(/\s+/).map(Number);
  check('packed words decode exactly as the engine reads them, at 2, 3 and 4 bits', r.status === 0 && ok === 1, r.stderr.slice(-400));
  check('Nari\'s INT8 grid has the spread the maker scales to (sd about 36.9)', Math.abs(sd - 36.949) < 0.01, String(sd));
} else console.log('SKIP the numpy checks (no numpy here)');

const torch = spawnSync('python3', ['-c', 'import torch, numpy'], { encoding: 'utf8' }).status === 0;
if (torch) {
  const r = spawnSync('python3', ['-I', '-c', `
import sys; sys.path.insert(0, sys.argv[1]); import numpy as np, torch, trl_quant as Q, trl_codec as C
torch.manual_seed(0); torch.set_num_threads(2); N, K, n = 32, 128, 1024
X = torch.randn(n, K) @ (torch.randn(K, K) * 0.3 + torch.eye(K)); Hin = X.T @ X / n
G = torch.randn(n, N) @ (torch.randn(N, N) * 0.3 + torch.eye(N)); Hout = G.T @ G / n; W = torch.randn(N, K) * 0.02
def loss(Wh, Ho=None):
    D = Wh.double() - W.double(); Ho = torch.eye(N).double() if Ho is None else Ho.double(); return float(torch.trace(Ho @ D @ Hin.double() @ D.T))
out = []
for ho, hin in ((None, torch.eye(K)), (None, Hin), (Hout, Hin)):
    r = Q.quantize_linear(W, 2, hin, ho); words = C.tiles_to_words(r["states"], 2)
    Wd = Q.dequantize(words, 2, K, N, r["s16"], r["pre"], r["post"], r["desc"])
    out.append((loss(r["W_hat"]), loss(r["W_hat"], Hout), float(np.abs(Wd - r["W_hat"].numpy()).max()), C.check_tail_biting(r["states"], 2)))
plain, ldlq, yaqa = out
print(int(ldlq[0] < plain[0]), int(yaqa[1] < ldlq[1]), int(max(o[2] for o in out) < 1e-6), int(all(o[3] for o in out)), plain[0], ldlq[0], ldlq[1], yaqa[1])
`, dir], { encoding: 'utf8' });
  const v = r.stdout.trim().split(/\s+/).map(Number);
  check('torch ran', r.status === 0, r.stderr.slice(-400));
  check('LDLQ beats plain trellis rounding on the input-Hessian loss', v[0] === 1, r.stdout);
  check('YAQA beats LDLQ on the full Kronecker loss (H_out x H_in)', v[1] === 1, r.stdout);
  check('a coded linear decodes (words, scales, signs, Hadamard sides) to exactly the maker\'s weights', v[2] === 1, r.stdout);
  check('every code is tail-biting (the last window joins the first)', v[3] === 1, r.stdout);
} else console.log('SKIP the torch checks (no torch here; the pods have it)');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
