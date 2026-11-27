# GSQ on Bill's down experts: cloud dry run of the forge step (27 Nov 2026)

What ran: the quant loop of `model-lab/forge/pod/run.sh`, cut out and run as the pod runs it, with the new `cut.gsq` step,
llama.cpp b12359 (commit b1b770d), processor only, in a cloud container. No download and no rental. The brain is a tiny
made-up MoE from llama.cpp's own `test-llama-archs -a qwen3moe -s 7 -d 0.5` (random weights, 2 experts a layer), made BF16
and then Q8_0 to stand in for Bill's cut Q8_0. The base recipe was a stand-in for MX2_S (Q4_K_M with `ffn_down_exps` at
q2_0), and the text a stand-in zip laid out like llama.cpp's wikitext-2 zip.

Checked:

1. **Batches:** `gsq_q2.py` now tunes `--batch` experts at once. GPTQ in batches of 2 gave the same bytes as one expert at a
   time. On the dense pilot brain, the layer losses matched the earlier serial code to every printed digit; KLD matched to
   the fourth digit (only the order of additions changed).
2. **Stock writer on experts:** our stock q2_0 rounding, from the Q8_0 weights, gave llama-quantize's own file byte for byte.
3. **The step:** MX2_S made, then x_dump recorded the down experts' inputs on MX2_S itself (8,192 rows a tensor), then
   MG2_S (GPTQ) and MQ2_S (GSQ) were written into copies of MX2_S. All three files are 953,216 bytes. KLD (`kld.tsv`):

| File | Mean KLD | Same top token |
|---|---|---|
| MX2_S stand-in (stock q2_0 downs) | 2.115 | 28.2% |
| MG2_S (GPTQ downs) | 0.231 | 67.1% |
| MQ2_S (GSQ downs) | 0.171 | 71.5% |

4. **Out of time:** with GSQ capped at 1 minute, it finished 1 of 2 tensors; MQ2_S was still written, with GPTQ's rounding for
   the other tensor, and the record says how many tensors GSQ did.
5. The gate refused all three files on answers: the brain is random, so that is expected.

Read this as "the steps work", not as a result. Real numbers come only from the rental (`forge/plans/gsq-bill.json`).

## Rental 1 and the fix (27 Nov 2026)

Rental 1 (RTX PRO 6000, about $14.49) made MX2_S again (KLD 1.00, same top token 63.7%, passed the gate), but MG2_S and
MQ2_S never came: `x_dump` reached 192 of 256 chunks in its one-hour limit and was stopped, and MQ2_S then ran it again for
another hour. Then the PC-side experts test took 2.4 h (1.2 tokens/s; not needed on a measure-only run). We first blamed
x_dump's small writes; that was a guess, and wrong (see "The real cause" below).

Fixed: each x_dump file writes through its own 32 MB buffer (on the tiny MoE: 3,088 writes became 2, same bytes);
`--x-seconds` stops recording on time and keeps what it has; a failed x_dump is marked so the next name skips at once; the
plan records fewer rows (128 chunks, at most 2,048 rows an expert, about 20 GB instead of 65 GB); and `benchmark.pc_tests:
false` skips the PC tests. The step ran again here end to end: MX2_S, MG2_S, MQ2_S all made, same size.

## The real cause (found 27 Nov, during the rerun)

The rerun's x_dump was slower still (53 chunks in 30 minutes, 34 s a chunk; KLD on the same pod ran 2,048 tokens in 1.3 s),
so the writes were not it. On a forge pod with Bob's engine patches, `llama-server-build.sh` builds in `llama-be/build-cuda`
and COPIES its `bin/` to `llama.cpp/build-cuda/bin`, with no cmake setup there. Our tool build (`gsq/build.sh`, and
`tensor_err/build.sh` on the RCO run) ran cmake into that copy: a fresh, processor-only build that overwrote the CUDA
libraries. From then on x_dump, every KLD, every gate and the served brain ran on the processor. That explains rental 1's
1.2 tokens/s and the RCO run's 33-46 minute "quantizing" steps. The numbers are still right (same arithmetic), just slow.

Fixed: `pod/tool_tree.sh` picks a tree whose own cmake setup has CUDA on (Brain Engine's, or the plain one), or a fresh
folder of its own; both build scripts refuse a folder with built files but no cmake setup, and a fresh folder gets CUDA on
when the machine has a card. After a tool build, run.sh checks that the serving `llama-server --list-devices` still shows a
CUDA card. Checked here: the three cases of `tool_tree.sh`, the refusal, and the whole step with a fresh tool folder.
