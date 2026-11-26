# Exact-size bit picker: cloud dry run (26 Nov 2026)

What ran: llama.cpp b12359 (commit b1b770d, the pods' build), processor only, in a cloud container. The brain is a tiny
made-up Flash-Next (qwen4exp) from llama.cpp's own `test-llama-archs -a qwen4exp` (random weights, 18 MB, F32), with an
imatrix from 40 chunks of Bob's docs. No download and no rental. Purpose: check the steps before a paid card runs them.

Steps checked:

1. `pod/tensor_err/build.sh` adds the tool to a llama.cpp tree and builds it (also from the pod path, as run.sh calls it).
2. `tensor_err` measures 41 tensors at 15 stock types in 6 s (466 rows of `err.tsv`). Error falls as bits rise for every
   tensor (sample: `err-sample.tsv`).
3. `rco_pick.py` picks three recipes and writes them into a copy of `flashnext-mixed.json`: RC2_A and RC2_B at the size of
   stock IQ2_XXS, RC2_S at the size of stock IQ2_M (standalone run) or MX2_S (the run.sh hook, `pick-RC2_A-from-pod-hook.txt`).
4. `llama-quantize` makes each one with the picked rules. Tensor bytes match the pick exactly; whole files land 32 to 64
   bytes under the stock file they are set against (`sizes.txt`).
5. `kld_check.sh` scores them against the F32 brain on the same text and positions (24 chunks of 128).

| File | Size (bytes) | Mean KLD | Same top token |
|---|---|---|---|
| IQ2_XXS (stock) | 9,572,032 | 0.000082 | 57.5% |
| **RC2_A** (abs error) | 9,572,000 | **0.000004** | **89.7%** |
| RC2_B (rel error) | 9,571,968 | 0.000051 | 67.1% |
| IQ2_M (stock) | 9,718,784 | 0.000034 | 72.2% |
| RC2_S (abs error) | 9,718,720 | 0.000003 | 90.0% |

Read this as "the steps work", not as a result: the brain is random and tiny. Bill's real numbers come only from the rental (`forge/plans/rco-bill.json`).

One thing it did show that matters for Bill: on this brain's tensors where both fit, stock `q2_0` (round to nearest, the only 2-bit type that fits
Flash-Next's 640-wide down experts) had 6x the error of `iq2_xxs` at a similar size. Bill's down experts are all `q2_0`.
