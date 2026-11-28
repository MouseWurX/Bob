# Bits by part and bits by word on a tiny brain (27 Nov 2026)

Cloud check of `model-lab/forge/pod/part_bits.py` (bits by part), `word_bands.py` (bits by word) and engine patch
`0150-output-bands.patch`. Both ideas are NariQ's (Nari Labs, Nov 2026), done with stock GGUF types.
**Tiny test brain only. Unproven in our lab on a real brain, as we have yet to test one.**

## Setup

- **Brain:** Llama layout, 4 layers, 256 wide, 2,048-word sentencepiece vocabulary, separate head, about 3.4M weights.
  Trained on the CPU for 600 steps (loss 0.93) on the public licence texts in `/usr/share/common-licenses`, so it has real
  odds to match.
- **Engine:** llama.cpp b12359 with every Lamplight patch on this branch (0150 included), CPU build.
- **Calibration text** (imatrix, Fisher, word counts): every licence except GPL-3 and Apache-2.0. **Eval text:** GPL-3
  and Apache-2.0, never used for picking.
- **Candidates:** `llama-quantize --pure --imatrix` at q2_k, q3_k, q4_k, q5_k, q6_k and q8_0.
- **Budget:** every pick gets exactly the bytes of the plain q3_k file's tensors (word table excluded and kept at q6_k by
  every picker), 1,239,040 bytes. Fisher: 48 chunks of 128 tokens, labels drawn from the brain's own odds.
- **Drift:** stock `llama-perplexity --kl-divergence` on the written file against the f32 file, 128-token chunks of the
  eval text.

## Results

| File | Size (bytes) | KLD | Same top token |
|---|---:|---:|---:|
| plain q3_k (smaller: its word table is q3_k) | 1,522,240 | 0.0807 | 85.95% |
| mixed_bits.py (imatrix rounding error, old greedy pick) | 1,726,272 | 0.0553 | 88.63% |
| part_bits.py --loss imatrix (same measure, new exact-size pick) | 1,727,040 | 0.0495 | 88.80% |
| part_bits.py (Fisher): **bits by part** | 1,727,040 | 0.0435 | 89.25% |
| part_bits.py (Fisher) --bands 8: **bits by part + bits by word** | 1,727,616 | **0.0372** | **90.58%** |
| plain q3_k with its head in 8 bands, same head size: **bits by word alone** (word counts, no teacher) | 1,521,888 | 0.0736 | 86.99% |
| plain q4_k (for scale) | 1,974,848 | 0.0191 | 92.93% |

At the same size: the new pick alone cut drift by 10% against mixed_bits.py, the Fisher estimate by another 12%, and the
banded head by another 15% (33% in all against mixed_bits.py). Re-banding only the head of the plain q3_k file cut its
drift by 9% for 352 fewer bytes. The Fisher estimate of the drift was close to what was measured (0.039 estimated,
0.0435 measured; 0.031 and 0.0372 with bands). The re-banded q3_k head put the 64 commonest words at q5_k, the next
219 at q4_k, 965 at q3_k and the 800 rarest at q2_k.

Scripts and numbers: `data/2026-11-27-bits/` (`tiny_train.py`, `dry_run.py`, `results.json`).

## Checks (engine/tests/output-bands.py, tiny made-up qwen3 with the 151,936-word qwen2 vocabulary)

- Bands all of one type give the same KLD, same-top and greedy words as the plain file of that type, reading many words
  at once and writing one word at a time, on the processor and on the RPC stand-in card.
- A mixed plan the size of a q4_k head stays inside it, loads and answers.
- `unband` gives the plain file's drift back, with no bands left.
- A missing band and a band of the wrong width are refused with a message; a banded file is not banded again.
- `word_bands.py apply` re-reads what it wrote and checks every row against its candidate, byte for byte.

## The rental kit, run end to end on the same tiny brain (processor)

`model-lab/forge/pod/bits-pilot.sh` with `CUDA=0` and the tiny brain (`data/2026-11-27-bits/kit-dry-run-*`), every file
the same whole-file size as the stock imatrix file at its budget (the word table kept at the stock file's own type):

| Budget | Stock imatrix | mixed_bits | new pick (imatrix) | bits by part | part + word | part, scale-healed |
|---|---:|---:|---:|---:|---:|---:|
| Q3_K_M size | 0.151 | 0.114 | 0.113 | 0.103 | **0.101** | |
| Q4_K_M size | 0.0398 | 0.0389 | 0.0302 | 0.0265 | 0.0259 | **0.0211** |

At the 4-bit size the other shipped files did worse or were bigger: Q4_K_M without imatrix 0.0415, IQ4_XS 0.0521
(8% smaller), IQ4_NL 0.0497 (4% smaller), Q4_K_S 0.0401 (3% smaller); scale healing alone took stock Q4_K_M to 0.0285.
MXFP4_MOE squeezes only experts, so on this dense brain it is mostly Q8_0 (68% bigger) and not a 4-bit file. Banding a
head that is already q6_k (WORD) changed almost nothing here. Mechanics only: a 3.4M-weight brain.

## Limits

- A tiny brain on licence text is a mechanics check. NariQ's own figure (12% less drift from bands at 3.0 bits) and ours
  here are both unproven on Bob's brains; the pilot rental (`model-lab/forge/pod/bits-pilot.sh`, Qwen3-4B, KLD on
  wikitext-2 against BF16) is the next step, then real jobs on the winner.
- The Fisher sums take 4 bytes a weight: fine for small and mid brains on a 48 GB card, too much for Bill or Qwen3.6
  35B on one card. Those can still use bits by word (word counts and the imatrix only).
- A banded file loads in Lamplight 0150 only; plain llama.cpp, Ollama and LM Studio refuse it.
