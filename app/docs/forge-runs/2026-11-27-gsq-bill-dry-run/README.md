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
