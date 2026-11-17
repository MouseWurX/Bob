# Speed test results: calibration, reading step × hot experts (Nov 17)

The plan and the rule for "best" were written before the run: [2026-11-16-speed-test-method.md](2026-11-16-speed-test-method.md), addendum 16. Night 1's results are in [2026-11-17-speed-test-results.md](2026-11-17-speed-test-results.md).

- **Machine:** the replicant matrix (Ryzen 7 9800X3D, RTX 5070 Ti 16 GB, driver 621.01, 32 GB RAM, Windows 11 Home 26200).
- **Brain:** stock Qwen3.6 35B A3B, unsloth UD-Q4_K_XL (22,360,456,160 bytes). **Engine:** Brain Engine 9 (sha256 in the environment file).
- **What ran:** 4:51 to 6:04 AM Mountain, 17 rows × 5 rounds = **85 loads**, rows taking turns, an untimed warm-up after each load, each prompt timed once per load at temperature 0 with 300 words written.
- **Not run:** G2 (the trace with its mass). npc picked up the plan from before G2 was added, so the plan had 17 rows, not 18.
- **Owner's conditions:** no games. The Claude app was open (about 1 GB of RAM). HWiNFO was off, so there is no processor temperature.
- **Raw data:** [data/2026-11-16-speed/](data/2026-11-16-speed/) `calibrate-*`. Folder paths are replaced with `<bob-home>` and `<speed-test>`; nothing else is changed.

Row names: **Y0** Normal. **F** reading step 2048, **X** 4096. The digit is the hot-experts cache in GB (0 = none). **p** means a missed expert is worked out on the processor (`--moe-cache-cpu-share 1`), **c** means it's copied to the card (share 0). **G0** is Normal with CUDA graphs off. **G4** is Normal with the live expert trace (the cube).

## All rows (median of 5; % and × against Y0)

| Row | Writing short | Writing 16K | Writing 32K | Reading short | Reading 32K | First word 32K (s) | Same words as Y0 |
|---|---|---|---|---|---|---|---|
| Y0 | 87.7 | 82.0 | 77.3 | 1,154 | 1,232 | 26.6 | yes |
| F0 | 83.9 (-4%) | 80.3 (-2%) | 75.2 (-3%) | 2,287 (1.98x) | 3,074 (2.50x) | 10.7 | no |
| F1p | 83.6 (-5%) | 78.9 (-4%) | 75.4 (-2%) | 2,637 (2.29x) | 2,808 (2.28x) | 11.7 | no |
| F1c | 81.3 (-7%) | 65.1 (-21%) | 72.5 (-6%) | 2,521 (2.18x) | 2,723 (2.21x) | 12.1 | no |
| F2p | 95.6 (+9%) | 77.5 (-5%) | 73.3 (-5%) | 2,497 (2.16x) | 2,573 (2.09x) | 12.8 | no |
| F2c | 99.7 (+14%) | 73.3 (-11%) | 72.9 (-6%) | 2,486 (2.15x) | 2,565 (2.08x) | 12.8 | no |
| F4p | 102.4 (+17%) | 75.4 (-8%) | 73.6 (-5%) | 1,852 (1.60x) | 2,284 (1.85x) | 14.4 | no |
| F4c | 109.2 (+25%) | 93.4 (+14%) | 99.2 (+28%) | 2,180 (1.89x) | 2,290 (1.86x) | 14.3 | no |
| X0 | 80.1 (-9%) | 75.6 (-8%) | 73.3 (-5%) | 3,052 (2.64x) | 4,173 (3.39x) | 7.9 | no |
| X1p | 76.4 (-13%) | 73.3 (-11%) | 69.9 (-10%) | 2,856 (2.48x) | 3,840 (3.12x) | 8.6 | no |
| X1c | 73.4 (-16%) | 59.9 (-27%) | 66.0 (-15%) | 2,826 (2.45x) | 3,804 (3.09x) | 8.6 | no |
| X2p | 89.0 (+1%) | 72.6 (-11%) | 69.8 (-10%) | 2,893 (2.51x) | 3,603 (2.93x) | 9.1 | no |
| X2c | 83.8 (-4%) | 69.8 (-15%) | 81.7 (+6%) | 2,865 (2.48x) | 3,589 (2.91x) | 9.2 | no |
| X4p | 95.5 (+9%) | 75.3 (-8%) | 71.0 (-8%) | 2,566 (2.22x) | 3,304 (2.68x) | 9.9 | no |
| X4c | 102.0 (+16%) | 93.7 (+14%) | 91.9 (+19%) | 3,212 (2.78x) | 3,276 (2.66x) | 10.0 | no |
| G0 | 50.9 (-42%) | - | 48.0 (-38%) | 1,148 (1.00x) | 1,218 (0.99x) | 27.0 | yes |
| G4 | 78.3 (-11%) | - | 71.2 (-8%) | 1,118 (0.97x) | 1,212 (0.98x) | 27.1 | no |

Every row wrote the same words in all 5 of its runs. Rows with a different reading step or cache write different words from Y0, because a different batch shape adds up the numbers in a different order. That's expected, and it means a quality check is due before a new default, not that the words are worse.

## The best pair

The rule (addendum 16): writing on the short prompt within 3% of the best row, then the fastest reading at 32K; a row more than 3% slower than Y0 at writing on any prompt can't win.

- The fastest short-prompt writer is **F4c**, at 109.2. No other row is within 3% of it (X4c is 6.6% behind), so **F4c wins**. It is faster than Y0 at writing on every prompt (+25%, +14%, +28%) and reads 1.9 times as fast. The first word at 32K drops from 26.6 s to 14.3 s.
- **X4c is the runner-up.** It writes +14 to +19% faster and reads 2.7 to 2.8 times as fast, with the first word at 32K in 10.0 s. It's the better choice for long documents. By the rule set in advance it doesn't win, and that's reported as the rule says.
- **Copying beats working out on the processor** (c over p) at 4 GB on every prompt, and on the short prompt at 2 GB. The 1 GB and 2 GB caches often lose to no cache on the long prompts. Only the 4 GB copy cache helps everywhere.
- 4 GB was the biggest cache tried. A bigger one may do better still; that's untested.

## The cube check (G0 and G4)

- **G0, CUDA graphs off:** writing −42% short and −38% at 32K, and **the same words as Y0**. So CUDA graphs don't change the words.
- **G4, the live trace:** writing −11% short and −8% at 32K, and **different words**. The card's core clock also dropped to 457 to 630 MHz during G4's 32K runs, which fits the card sitting idle while it waits on the processor between pieces.
- **What it means:** the trace's cost is far smaller than turning graphs off, so the trace doesn't simply switch graphs off. The word change comes from the trace's own change to the graph. That supports the first explanation in the cube bug write-up: `ggml_set_output` on the router's sort stops the fused top-k kernel, so the gating weights are summed in a different order. The planned fix (the fused kernel writes the picks to a fixed buffer, read after the step) stands. G2 would have added the mass path and didn't run.

## Conditions

- **Card:** max 64 °C. The power-cap flag showed on 0 to 16% of samples (most on long prompts with big reading steps), and in 42 of 49 row-and-prompt pairs the *most* throttled run wrote faster than the least throttled one, so throttling didn't slow the results. (The cap shows up when the card is working hardest, which is also when it's fastest.)
- **RAM:** free RAM during runs was mostly about 2.7 to 3.6 GB. The three slowest single runs (X4c 32K at 82.6, Y0 16K at 77.5, Y0 short at 76.6) had the lowest free RAM (255 to 435 MB), so brief paging probably cost those runs a little. The medians aren't affected.
- **Processor:** 22 to 52% busy. Temperature not measured.

## Next

- Offer F4c's settings (reading step Faster + hot experts 4 GB, copy) as a tested option, with X4c's as the long-document option. Both stay opt-in until a quality check on Bob's jobs shows the different words aren't worse.
- Try a 6 GB copy cache with steps 2048 and 4096 (four rows) to see where it peaks.
- Build the cube fix (fused kernel writes the picks), then test it on the 35B against G4.
