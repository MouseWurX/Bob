# GSQ pilot: cloud dry run (26 Nov 2026)

What ran: `model-lab/forge/pod/gsq/gsq-pilot.sh` end to end, processor only, llama.cpp b12359 (commit b1b770d), in a cloud
container. No download and no rental. The brain is a tiny made-up dense Qwen3 from llama.cpp's own
`test-llama-archs -a qwen3 -s 42 -d 0.5` (random weights, 4 MB, F32), used as the reference in place of BF16. Training text
was Bob's docs and test text the dissertation (the rental uses wikitext-2 train and test). GSQ ran 300 steps per tensor
(the rental runs 640, GSQ's production count).

Checked:

1. `x_dump` records every `ffn_up` / `ffn_down` input row (4,096 per tensor here), including the last layer.
2. **Our `stock` q2_0 writer gives llama-quantize's own file byte for byte** in both settings, so the three files differ
   only in rounding.
3. All files of a setting have the same size (A 926,176 bytes, B 618,976 bytes) and load.
4. KLD against the F32 brain, 48 chunks of 128 tokens, same positions for every file (`kld.tsv`):

| Setting | File | Mean KLD | Same top token |
|---|---|---|---|
| | Q8_0 (sanity) | 0.0026 | 96.0% |
| A: ffn_down at q2_0 | STOCK | 1.666 | 13.2% |
| | GPTQ (no learning) | 0.0687 | 78.8% |
| | **GSQ** | **0.0539** | **81.4%** |
| B: all ffn at q2_0 | STOCK | 5.060 | 13.8% |
| | GPTQ (no learning) | 0.1495 | 68.9% |
| | **GSQ** | **0.1223** | **71.6%** |

Read this as "the steps work", not as a result: the brain is random and tiny, so its text is noise in every file. The size of
the stock gap is partly explained by code, not by this brain: llama.cpp b12359's `quantize_row_q2_0_ref` sets the scale to
the group's largest |w|, so `round(w / d)` stays in -1..1 and the fourth level (+2) is never used, and q2_0 ignores the
imatrix. Real numbers come only from the rental.

Fixed on the way: `kld_check.sh` now runs a file once more when its log has no "Mean KLD" line (3 of 7 runs here ended
before the closing statistics were written; each passed on the second run).
