# GSQ pilot on Qwen3-1.7B: rental of 26-27 Nov 2026 (try 3)

One RTX 4090, `model-lab/forge/pod/gsq/gsq-pilot.sh` at Bob commit 44076c69, about $0.97 (tries 1 and 2 stopped early, $0.19
and $0.10; see [the dry-run notes](../2026-11-26-gsq-dry-run/)). Nothing uploaded. Reference: Qwen3-1.7B BF16 (revision
70d244cc), inputs from 128 x 512 tokens of wikitext-2 train, KLD on 32 x 512 tokens of wikitext-2 test. Every file of a
setting has the same size, and our stock writer equals llama-quantize's file byte for byte, so files differ only in rounding.

| Setting | File | Mean KLD | Same top token | PPL ratio |
|---|---|---|---|---|
| | Q8_0 (sanity) | 0.0031 | 97.6% | 1.02 |
| A: ffn_down at q2_0 (1.89 GB) | STOCK (llama-quantize) | 3.357 | 36.9% | 19.7 |
| | GPTQ (no learning) | 0.382 | 76.7% | 1.29 |
| | **GSQ** | **0.320** | **78.7%** | **1.17** |
| B: all ffn at q2_0 (1.34 GB) | STOCK | 12.33 | 0.2% | 88,352 |
| | GPTQ | 0.881 | 64.8% | 1.77 |
| | **GSQ** | **0.669** | **69.4%** | **1.44** |

Greedy answer to "The capital of France is": STOCK A loops ("the city of the city of"), STOCK B is noise; GPTQ and GSQ say
Paris in both settings (B-GPTQ then names New York as the US capital; B-GSQ says Washington).

What this shows, on this one brain and text:

1. **Stock q2_0 rounding is very weak**: about 9 times the drift of GPTQ in A and 14 times in B, at the same size. This is
   the code fact noted on 26 Nov (scale = group max, so the +2 level is never used, and no imatrix), now measured.
2. **GSQ beats GPTQ at the same size**: 16% lower KLD in A, 24% in B, and its per-layer loss is 21-23% lower.
3. Time on one 4090: GPTQ 3-5 min, GSQ 10-22 min for 28-84 tensors of 2048 x 6144.

Limits: one small dense brain, one text, KLD and one answer; no Bob jobs. Untested on Bill.

Next: the same tools on Bill's 48 down-expert tensors (all stock q2_0 in MX2_S and IQ2_XXS), written into MX2_S at the same
51.93 GB, scored by KLD and the gate. GPTQ first (no learning, a third of the time), GSQ after. Needs batching per expert
(14,784 small experts) and a price before it is asked for.
