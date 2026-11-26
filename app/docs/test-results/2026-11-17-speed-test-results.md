# Speed test results: night 1 and Turbo (Nov 16 to 17)

The method was written down before any timed run: [2026-11-16-speed-test-method.md](2026-11-16-speed-test-method.md), addenda 1 to 15. The predictions in addendum 15 were written during the run, before anyone read a result. They are graded below as written.

- **Machine:** the replicant matrix (Ryzen 7 9800X3D, RTX 5070 Ti 16 GB, driver 621.01, 32 GB RAM, Windows 11 Home 26200).
- **Brain:**
  - Night 1: stock Qwen3.6 35B A3B, unsloth UD-Q4_K_XL (22,360,456,160 bytes).
  - Turbo: the copy that keeps its MTP layer (unsloth Qwen3.6-35B-A3B-MTP-GGUF, same quant).
  - The two files differ, so Turbo rows are compared only with each other.
- **Engines:**
  - plain llama.cpp b12359 (official release).
  - Lamplight 8 (rows R, E).
  - Lamplight 9 (rows N, H, C, T).
  - sha256s are in the environment files.
- **What ran:** night 1 started at 6:42 PM Mountain and finished at 9:09 PM (140 loads). Turbo ran after it and finished at 9:42 PM (25 loads).
- **How each row ran:**
  - Every row was loaded 5 times, rows taking turns, with an untimed warm-up after each load.
  - Each prompt was timed once per load, at temperature 0, writing 300 words.
  - The T0S and T3S rows use Bob's own sampling instead of temperature 0.
- **Owner's conditions:** no games, browser and launchers closed. HWiNFO was logging the processor.
- **Not run:**
  - N3 (lock the brain in memory): the engine refused the option (`error: invalid argument: --mlock`).
  - Perplexity on the 32K text: not built. Listed as skipped, as the method said it would be.
- **Raw data:** [data/2026-11-16-speed/](data/2026-11-16-speed/) has every run, every word gap and every card sample (runs.jsonl.gz), plus the environment and the runner's own summaries. Folder paths are replaced with `<bob-home>` and `<speed-test>`; nothing else is changed.

Numbers are the median of 5, with the lowest and highest in brackets where they matter. "Short" is Bob's real start (a chat with tools, about 3,900 tokens), "16K" and "32K" are long texts cut to exactly that many tokens.

## A runner fault, and what it touched

The card readings in the runner's own summaries are wrong. nvidia-smi's output arrives in chunks, and a chunk can end in the middle of a line. The runner read those pieces as whole lines, which is how card temperatures of 13,801 °C appear in its tables. About 6% of samples were pieces.

- **Not touched:** speeds, first word, word gaps, kept guesses and the words themselves. These come from the engine's own stream, not from nvidia-smi.
- **Touched:** the card columns of the conditions table, and the Throttled column (it counted pieces too).
- **Here:** the card conditions below are worked out again from whole lines only, which are lines that start with a date.
- **Fixed in the runner:** lines are now joined before reading, and a piece of a line is refused. The engine-log reader had the same fault and is fixed too. Both are tested.

## Conditions (whole lines only)

| | Night 1 | Turbo |
|---|---|---|
| Hottest the card got | 63 °C (Fastest reading rows); 46 to 56 °C elsewhere | 55 °C |
| Most power drawn | 206 W of a 300 W limit | 151 W |
| Card slowed by heat | never | never |
| Card's "power cap" flag | 3% of samples on most rows, 11 to 16% on Faster and Fastest reading, 0 to 1% on hot experts rows | 2 to 3% |
| Processor hottest (HWiNFO) | 77 °C | 78 °C |
| Free RAM during runs | 1.2 to 3.3 GB | 1.5 to 3.5 GB |

The power-cap flag is nvidia-smi's "software power cap" reason, seen while the card was well under its limit. It shows on every setting, which rules it out as the cause of any difference between rows. By the method's rule (more than one flagged run), most rows would be run again. Instead, this is reported, and every row runs again with the fixed runner on the next PC night. Free RAM was tight: 32 GB holds the brain's RAM half plus Windows with 1 to 3 GB to spare.

## Results

### Reading speed (Lamplight 8, same settings otherwise)

| | Normal (512) | Faster (2048) | Fastest (4096) |
|---|---|---|---|
| Reading 32K, tokens/s | 1,238 | 3,094 (2.5x) | 4,161 (3.4x) |
| Reading 16K | 1,274 | 3,198 (2.5x) | 4,343 (3.4x) |
| Reading short | 1,162 | 3,027 (2.6x) | 4,225 (3.6x) |
| First word, 32K | 26.5 s | 10.6 s | 7.9 s |
| First word, 16K | 12.9 s | 5.2 s | 3.8 s |
| First word, short | 3.35 s | 1.29 s | 0.93 s |
| Writing short, words/s | 87.8 | 84.1 (-4.2%) | 80.1 (-8.8%) |
| Writing 16K | 82.6 | 80.0 (-3.1%) | 76.3 (-7.6%) |
| Writing 32K | 78.1 | 76.1 (-2.6%) | 73.8 (-5.5%) |
| Peak card memory | 14,975 MB | 14,899 MB | 15,071 MB |

Lamplight 9's N1 (Fastest) matches R4096 within 4% on every number, with the same words. The words change with the reading step: bigger steps add the numbers up in a different order. Within each step, all 5 runs wrote the same words.

### What Bob's settings and the Lamplight patches cost

| Row | Writing short / 16K / 32K | Reading short | Same words as plain? |
|---|---|---|---|
| P0 plain, its own defaults | 82.9 / 79.3 / 77.8 | 1,065 | (baseline for P1) |
| P1 plain, Bob's settings | 87.7 / 81.2 / 77.7 | 1,161 | yes |
| E0 Lamplight 8, all off | 87.9 / 82.7 / 78.2 | 1,168 | yes, word for word |
| E1 experts per word (8) | 89.2 / 84.0 / 78.6 | 1,175 | yes |
| E2 expert mask (one expert off) | 87.8 / 83.2 / 78.8 | 1,183 | changed, as it should |
| E3 dials (one expert at 0.9) | 88.4 / 82.4 / 78.1 | 1,171 | changed, as it should |
| E4 live expert trace (the cube) | 80.1 / 75.5 / 71.8 | 1,162 | **changed** |
| E5 all of them | 79.2 / 75.3 / 71.7 | 1,168 | changed |
| N0 Lamplight 9, all off | 88.4 / 83.3 / 78.8 | 1,171 | yes, word for word |

- **Bob's settings beat plain llama.cpp's defaults.** Compared with P0, P1 writes 6% faster on the short prompt, reads 9% faster, and gives the first word on 32K two seconds sooner.
- **The patches cost nothing while their features are off.** E0 and N0 are within 1% of P1 and write the same words.
- **The live trace costs about 9% of writing speed,** and nothing on reading.
- **The live trace also changes the words** at temperature 0. Watching shouldn't change what's written, so this is reported as a fault to find in the next Lamplight.

### Live trace every N words (Lamplight 9, patch 0018)

| Row | Writing short | Writing 32K |
|---|---|---|
| N0 (trace off) | 88.4 | 78.8 |
| C2-1 (every word) | 79.6 | 71.5 |
| C2-4 | 78.9 | 71.8 |
| C2-14 | 79.2 | 71.7 |

Sending less often makes no difference, so the cost is in recording the picks, not in sending them. 0018 doesn't help.

### Hot experts (Lamplight 9, expert cache on the card)

Short prompt only for H rows. Writing and reading are tokens per second, and "copied" is the total copied to the card during a load.

| Row | Cache | How it's filled | Missed expert goes to | Writing | Reading | First word | Copied |
|---|---|---|---|---|---|---|---|
| N0 | none | - | - | 88.4 | 1,171 | 3.3 s | - |
| H1 | 2 GB | learned | processor | 102.1 | 891 | 4.4 s | 2,014 MB |
| H4 | 2 GB | our ranking | processor | 98.6 | 907 | 4.3 s | 0 |
| H2 | 4 GB | learned | processor | 102.9 | 779 | 5.0 s | 4,060 MB |
| H5 | 4 GB | our ranking | processor | 99.2 | 814 | 4.8 s | 0 |
| N4 | 4 GB | our ranking | processor | 103.7 | 807 | 4.8 s | 5 MB |
| H3 | 6 GB | learned | processor | 101.0 | 667 | 5.8 s | 6,108 MB |
| H6 | 6 GB | our ranking | processor | 103.0 | 724 | 5.4 s | 0 |
| H7 | 4 GB | learned | card (copied) | **109.2** | 782 | 5.0 s | 6,145 MB |
| H8 | 4 GB | learned | half and half | 97.1 | 773 | 5.0 s | 5,184 MB |

N4 on the long prompts: writing 78.7 at 16K (-5.5% against N0) and 87.6 at 32K (+11%). Reading fell 29% to 30%, and the first word on 32K took 37.5 s against 26.4 s.

- **Writing gets 12% to 24% faster** with any cache on the short prompt. H7 is the fastest, +24%.
- **Prompt reading gets 24% to 43% slower,** more as the cache grows. The cache takes card memory, so `--fit` moves more of the brain to RAM, and reading works on that brain.
- **Our ranking is no faster than the cache learning on its own.** It fills the cache at once and copies nothing, but at 2 and 4 GB the learned cache wrote 3% to 4% faster.

### Prefetch (Lamplight 9, patch 0019)

| | Reading 16K | Reading 32K | Writing 16K | Peak card |
|---|---|---|---|---|
| N0 (Normal reading) | 1,280 | 1,242 | 83.3 | 14,974 MB |
| N5 (Normal + prefetch) | 1,118 (-12.7%) | 1,091 (-12.1%) | 83.2 | 15,475 MB |
| N1 (Fastest reading) | 4,387 | 4,233 | 78.3 | 15,070 MB |
| N5F (Fastest + prefetch) | 4,141 (-5.6%) | 3,950 (-6.7%) | 74.5 | 15,499 MB |

Prefetch makes reading slower and uses half a gigabyte more of the card. It writes the same words.

### Turbo (Lamplight 9, MTP brain)

| Row | Writing short / 16K / 32K | Kept guesses | Reading 32K | First word 32K |
|---|---|---|---|---|
| T0 no Turbo | 87.5 / 83.1 / 78.1 | - | 1,235 | 26.6 s |
| T2 two ahead | 85.8 / 89.3 / 85.1 (-2% / +7% / +9%) | 56% / 67% / 66% | 1,062 | 30.9 s |
| T3 three ahead | 69.2 / 99.3 / 81.2 (-21% / +19% / +4%) | 37% / 74% / 57% | 1,043 | 31.5 s |
| T0S no Turbo, Bob's sampling | 84.4 / 79.8 / 75.2 | - | 1,241 | 26.4 s |
| T3S three ahead, Bob's sampling | 70.0 / 77.4 / 77.7 (-17% / -3% / +3%) | 39% / 51% / 56% | 1,048 | 31.3 s |

- **Turbo slows prompt reading by 13% to 16%** and adds 4 to 5 seconds to the first word on 32K.
- **Writing goes either way, depending on the text.** With Bob's real sampling, three ahead is slower on Bob's own start prompt and about even on long texts.
- **Turbo changed the words at temperature 0.** Checking guesses in batches adds the numbers up in a different order.

## The predictions, graded

| Prediction (addendum 15) | Result | Grade |
|---|---|---|
| Fastest reading 1.5x to 2.5x on 16K and 32K | 3.4x (Faster 2.5x) | Wrong, low: better than predicted |
| Writing within 3% at Fastest | -5.5% to -8.8% (Faster: -2.6% to -4.2%) | Wrong |
| E0 within 2% of P1 | within 1%, same words | Right |
| E1, E2, E3 within 2% of E0 | within 1.5% | Right |
| E4 writing 5% to 18% slower | 8% to 9% slower | Right |
| E5 within 3% of E4 | within 1.2% | Right |
| N0 within 2% of E0 | within 1% | Right |
| N3 fewer long gaps, or refused | refused (option not accepted) | Not run |
| N4 writing 0% to 15% faster | +17% short, +11% at 32K, -5.5% at 16K | Mostly right |
| N4 reading and first word unchanged | reading 30% slower, first word 42% later | Wrong |
| Ranked at least as fast as learned | 3% to 4% slower at 2 and 4 GB, 2% faster at 6 GB | Wrong |
| H7 10% to 40% slower than H2 | 6% faster, the fastest row | Wrong |
| Prefetch reading 0% to 10% faster | 5.6% to 12.7% slower | Wrong |
| C2-14 within 2% of off | 10% slower, same as C2-1 | Wrong |
| T2 and T3 20% to 60% faster, same words | -21% to +19%, words changed | Wrong |
| T3S 10% to 35% faster | -17% to +3% | Wrong |

## Conclusions, by the rules written down before the run

1. **Reading speed (rule: Fastest becomes the 16 GB default if at least 1.5x faster at 32K with writing within 3%).**
   - Fastest is 3.4x faster but writes 5.5% to 8.8% slower, so it doesn't become the default.
   - Faster meets the reading part (2.5x) and is within 3% on the long prompts, but not on the short one (4.2%).
   - Reading speed stays an opt-in setting, as planned, with these numbers beside each step.
   - It's the biggest win in the test. A long paste or a big file answers 2.5x to 3.4x sooner.
2. **Lamplight patches (rule: more than 2% with their feature off is a bug).** None. Dissertation chapter 3's "overhead not measured" can now cite this page.
3. **The live trace** costs about 9% of writing while it's on, whatever the send rate, and it changes the words.
   - The Real experts tooltip should say about 9%.
   - The word change is a fault for the next Lamplight.
   - Patch 0018 can go.
4. **Hot experts (rule: offered as a setting only if N4 or H5 is at least 5% faster writing with no copying).**
   - N4 is 17% faster on the short prompt and copied 5 MB, so the rule is met.
   - It slows reading 30%, so it should be offered only with that trade said plainly.
   - It should be tested together with Faster reading before anything ships.
   - The ranking adds nothing over the cache learning, so Bob can use the stock cache and skip Calibrate's ranking for speed.
5. **Prefetch (0019)** is slower everywhere it was meant to help. It stays off and is dropped from the next Lamplight.
6. **Turbo (rule: offered if T3S is at least 10% faster).** It isn't: -17% to +3%. Not offered on this brain and card.
7. **N3** needs the right option name for this engine build, and runs again on the next PC night.

## Next

- Hot experts with Faster and Fastest reading, the stock cache and share 0 (H7's setting), on all three prompts.
- N3 with the right option.
- Every row again with the fixed runner, for the card conditions.
- The laptop plan (addendum 14).
- Lamplight 10:
  - Find why the trace changes the words.
  - Find why the trace comes back empty with the cache on.
  - Drop 0018 and 0019.
