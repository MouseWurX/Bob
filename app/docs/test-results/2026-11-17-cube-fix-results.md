# The cube fix: the expert trace no longer changes the words (Brain Engine 10, 11 and 12)

17 November 2026. Stock Qwen3.6 35B A3B (unsloth UD-Q4_K_XL, 22,360,456,160 bytes) on the 16 GB card. The plan is `speed-plans/cube-fix.json`, with the rule written in advance in [the speed test method](2026-11-16-speed-test-method.md), Addendum 19 and its amendment. Every prompt was timed once per load at temperature 0, with 300 words written.

**Rule:** the fix works when T1 writes the same words as Y0, and FT the same as F4c, on both prompts in all their runs, and each traced row's median writing speed is within 2% of its untraced pair. U0 (`GGML_CUDA_DISABLE_FUSION=1`) is the control, to show the fused kernel is still running.

Rows: **Y0** is Normal (reading step 512, no cache), **U0** is Y0 with fusion off, **T1** is Y0 with the trace, **F4c** is reading step 2048 + 4 GB copy cache, and **FT** is F4c with the trace.

## Results (median writing t/s, start / 32K; words hash)

| Row | Brain Engine 10, round 1 only (4 loads) | Brain Engine 11 (5 rounds, 25 loads) | Brain Engine 12 (3 rounds, 16 loads) | Words |
|---|---|---|---|---|
| Y0 | 86.0 / 76.1 | 91.6 / 81.1 | 92.2 / 81.2 | 892c17a2 / 7ffd9ac2 |
| U0 (fusion off) | 78.5 / 71.0 | 82.9 / 74.1 | 83.2 / 74.5 | **6c4b812a / c63a8ae7 (different)** |
| T1 (trace) | 84.0 / 74.5 | 87.9 / 77.9 | 90.4 / 81.2 | 892c17a2 / 7ffd9ac2 (same as Y0) |
| F4c | 110.7 / 89.4 | 110.1 / 96.7 | 110.6 / 95.7 | fc0f0b6e / c1273808 |
| FT (cache + trace) | crashed | 108.1 / 95.7 | 111.6 / 96.7 | fc0f0b6e / c1273808 (same as F4c) |

The trace's cost on writing, traced row against its pair:

| Pair | Brain Engine 11 | Brain Engine 12 | 2% rule |
|---|---|---|---|
| T1 vs Y0 | −4.0% / −3.9% | −1.95% / 0% | BE11 misses, BE12 passes |
| FT vs F4c | −1.8% / −1.0% | +0.9% / +1.0% | both pass |

- **Words:** every traced row wrote the same words as its pair, in every run of every engine. The words hashes are also the same across all three engines. Only U0 differs, so broken fusion is what changes the words, and the trace no longer breaks it.
- **Brain Engine 10:** the first build of the fix kept the words in round 1, then crashed with the trace and the hot-experts cache on together (FT), so the run stopped. Brain Engine 11 fixed the crash.
- **Brain Engine 12:** patch 0021 version 3 keeps one pinned copy per reading step. The run stopped after 3 of 5 rounds, when the stop file appeared, so its medians rest on fewer runs.
- **Reading** stayed within about 1% to 3% in all pairs, and nothing crashed on Brain Engine 11 or 12.

## Data

[data/2026-11-17-cube-fix/](data/2026-11-17-cube-fix/) holds the three summaries (with conditions and the environment) and `per-run-table.csv`, which lists all 88 runs with their speeds and a words hash. These are scrubbed copies from the test PC: the PC name, user, paths, IPs and keys are replaced. The complete `runs.jsonl`, `environment.json` and `plan-fingerprint.json` are packed as `cube-fix-public.tgz` (207,627 bytes, sha256 `b25d01625d1c8655aeee16001ed51ff20fcfccc7df9fc0e122e4fcb36707d8ae`). That pack is still on the test PC, waiting to be added here.
