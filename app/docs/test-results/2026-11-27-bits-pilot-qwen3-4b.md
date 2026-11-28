# Bits by part and bits by word on Qwen3-4B (27 Nov 2026 rental)

First real-brain test of `part_bits.py` (bits by part), `word_bands.py` (bits by word, Lamplight 0150) and the old
`mixed_bits.py`. Kit `model-lab/forge/pod/bits-pilot.sh` at Bob 96cdc0e, one L40S, $2.83 (the first try stopped early;
this is the second). Data: `data/2026-11-27-bits-pilot/`.

- **Brain:** Qwen/Qwen3-4B revision 1cfa9a7, BF16, head untied so it can be squeezed on its own (the same for every file).
- **Drift:** stock `llama-perplexity --kl-divergence` against BF16 on wikitext-2 test, 40 chunks of 512 tokens. The
  imatrix, the Fisher estimate and the word counts used wikitext-2 train only.
- **Same size:** at each budget every made file has the same whole-file size as the stock imatrix file, within 0.02%.
  The other 4-bit files people ship keep their own sizes (bytes column).
- These are drift numbers only. Bob's real jobs and speed have not been run on any of these files yet.

## Results

| Budget | File | Bytes | KLD | Same top | vs stock |
|---|---|---:|---:|---:|---:|
| Q3_K_M size | stock imatrix Q3_K_M | 2,242,747,584 | 0.155 | 84.7% | |
| | mixed_bits.py (old pick) | 2,242,706,624 | 0.296 | 79.4% | 91% worse |
| | part_bits.py, imatrix measure | 2,242,742,464 | 0.102 | 87.5% | 34% less |
| | **bits by part** (Fisher) | 2,242,739,904 | 0.0821 | 89.1% | **47% less** |
| | **bits by part + word** | 2,242,747,552 | **0.0800** | **90.0%** | **48% less** |
| | bits by word alone (stock body) | 2,242,371,232 | 0.154 | 84.9% | 0.4% less |
| Q4_K_M size | stock imatrix Q4_K_M | 2,716,068,544 | 0.0473 | 91.7% | |
| | Q4_K_M without imatrix | 2,716,068,352 | 0.0742 | 90.3% | 57% worse |
| | mixed_bits.py (old pick) | 2,715,996,864 | 0.123 | 87.6% | 160% worse |
| | part_bits.py, imatrix measure | 2,716,050,624 | 0.0429 | 91.6% | 9% less |
| | **bits by part** (Fisher) | 2,716,050,624 | **0.0295** | 93.4% | **38% less** |
| | bits by part + word | 2,716,041,984 | 0.0360 | **93.9%** | 24% less |
| | bits by word alone (stock body) | 2,715,692,192 | 0.0469 | 91.7% | 1% less |
| other 4-bit files | IQ4_XS | 2,477,384,384 | 0.0637 | 90.8% | (9% smaller) |
| | IQ4_NL | 2,600,131,264 | 0.0633 | 90.9% | (4% smaller) |
| | Q4_K_S | 2,602,097,344 | 0.0535 | 91.2% | (4% smaller) |
| | Q5_K_S | 3,091,118,784 | 0.0149 | 95.3% | (14% bigger) |
| | MXFP4_MOE (a dense brain: mostly Q8_0) | 4,693,671,104 | 0.0017 | 98.2% | (73% bigger) |

Every file gave the same greedy answer to "The capital of France is" (Paris).

## What it says

- **Bits by part works on a real brain.** At the Q4_K_M size it cut drift by 38% and raised the same-top-word share from
  91.7% to 93.4%; at the Q3_K_M size it nearly halved drift. Its own drift estimate was close: 0.0287 estimated, 0.0295
  measured at Q4.
- **The 4-bit question** (the owner, 27 Nov): stock Q4_K_M with the imatrix was already the best of the shipped 4-bit
  files at its size; IQ4_XS and IQ4_NL drift a third more for 4 to 9% less size. Without the imatrix Q4_K_M drifts 57%
  more. Bits by part at the Q4_K_M size closes more than half the gap to Q5_K_S without the 14% extra size.
- **Bits by word helped at 3 bits and not at 4.** With the body it took 48% off at Q3 (2.5% better than bits by part
  alone), but at Q4 it was worse than bits by part alone (0.0360 against 0.0295). Its estimate was far off at Q4 (0.0176
  estimated, 0.0360 measured). The pick put the 1,400 commonest words at q8_0 and the 140,000 rarest at iq2_xxs: the
  Fisher sums come from the brain's own sampled words, which are almost never rare ones, so they rate rare words' rows as
  nearly free to squeeze. Banding a stock head alone (word counts, no Fisher) changed almost nothing.
- **The old mixed_bits.py pick is bad on a real brain:** it put some whole tensors (for example the first layers'
  ffn_down and attn_v) at iq2_xxs and doubled or tripled the drift. part_bits.py with the same imatrix measure does not
  do this. mixed_bits.py should not be used for picks any more; part_bits.py replaces it.
- **Healing rows don't count:** the heal steps in this kit used the old healing, which runs out of a 48 GB card on a 4B
  brain (fixed in PR #388), so "healing did not lower drift" here was a crash.

## Next

1. Bob's real jobs and a speed test (tokens a second, with GPU temperature and clocks) on bits by part at the Q4_K_M
   size against stock Q4_K_M, the same Qwen3-4B. Only a win there moves anything; it stays off by default and out of
   Turbo until then.
2. Fix the band estimate: give rare words a floor (no band below the stock head's type minus one step), or measure a
   band plan's drift before taking it; then retest bits by word at 4 bits.
3. Point Lab users to part_bits.py instead of mixed_bits.py.
4. Then the main brains (Qwen3.6 35B, Inkling, Saluki); the Fisher sums for a 35B need a big-memory pod
   (`--fisher-on-cpu`).
