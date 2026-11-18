# Speed test plans

Plans for `model-lab/speed-test.mjs`, following the pre-registered method in
`docs/test-results/2026-11-16-speed-test-method.md`. Places on the test PC (the brain, the engines, the PC test lock,
the stop file, the hot-expert ranking) are never written here: they are given with `--var NAME=value` when the run
starts.

- `night1.json`: reading steps (Question 1), Brain Engine cost (Question 2), each new feature alone and together
  (Addenda 1 and 5), the expert cache at sizes and shares (Addendum 2), and the live trace every N words (Addendum 4).
- `start.json`: Bob's real start (system prompt and tools for the Qwen 3.5/3.6 family, as a throwaway Bob with every
  tool set up sends them) followed by "hi". Made with `model-lab/bob-kit.mjs` on 16 November 2026; its sha256 goes
  in every result.
- `long-text.md`: the text the 16K and 32K prompts are cut from: chapters 1 to 4 of Bob's dissertation as they stood
  on 16 November 2026 (our own published text; the public-domain book named in the method couldn't be fetched from
  the cloud machine, see the method's Addendum 6). The runner cuts it to exactly 16,384 and 32,768 of the brain's own
  tokens and adds one fixed question.
- `calibrate-bigger.json`: the copy cache at 5 and 6 GB, and reading steps 5120 and 6144 with the biggest cache that runs (5, 4, 3, then 2 GB), beside
  Y0, F4c and X4c (Addendum 20). Skips a load when the card isn't nearly free, and fails a run that spills card
  memory into RAM.
- `calibrate-between.json` (withdrawn, never run): step 4096 with 3 and 3.5 GB caches, and step 3072 with 3.5 and 4 GB, beside F4c and X4c,
  to find the biggest pair that doesn't spill into RAM (Addendum 21).
- `calibrate-sweep.json`: the copy cache at step 4096 from 4096 down to 3584 MB by 128 MB, and at steps 5120 and 6144
  from 4096 down to 2048 MB by 512 MB: 15 setups, 1 round (Addendum 22). Takes the engine's own staging buffer off before judging a spill.
- `calibrate-shortlist.json`: head to head: step 4096 + 4 GB against step 6144 + 3.5 GB, 5 rounds, with the Claude app closed (Addendum 23).
- `cube-fix-be12.json`: `cube-fix.json` without U0, for Brain Engine 12: 4 rows, 5 rounds, 20 loads (Addendum 19 amendment).
- `read-cache.json`: step 6144 with the cache at 0, 512, 1024 and 2048 MB, 1 round (Addendum 24): how little cache reading needs.
- `lend-cache.json`: Brain Engine 13 lends the cache to reading (LLAMA_MOE_CACHE_LEND=4096) at step 6144 + 4 GB, against the same without lending and the two picks, start and 32K, 3 rounds, answers saved (Addendum 25).
- `first-read.json`: step 2048 + 4 GB on Brain Engine 10 against 12, start prompt only, 3 rounds (Addendum 26): is the slower first short read the engine or the PC?
- `lend-behind.json`: Brain Engine 14 refills the lent cache behind the writing (LLAMA_MOE_CACHE_LEND_BEHIND 8, 24, 64) against lending alone and step 6144 + 3.5 GB, start and 32K, 3 rounds, answers saved (Addendum 27).
- `public-h2h-qwen35.json`: public head to head on the 16 GB card: plain llama.cpp (its defaults, steps 4096 and 6144) against Brain Engine 14 (step 4096 no cache, chat pick, work pick, step 6144 + 3.5 GB), start, 16K and 32K, 5 rounds, answers saved (Addendum 28).
- `context-sizes.json`: no cache, lending and step 6144 + 3.5 GB at 32K, 64K, 128K and 256K context (Brain Engine 14), start plus a prompt that nearly fills each, 1 round (Addendum 29). The long text is laid end to end (`promptRepeat`) to reach 256K.
- `read-layout.json`: Brain Engine 15 puts whole layers in the cache during big reads (LLAMA_MOE_CACHE_READ_LAYERS=4096, -b 8192 -ub 4096) against the same without it, step 4096 + 4 GB and step 6144 with no cache, start and 32K, 3 rounds, answers saved (Addendum 30).
- `read-layout-contexts.json`: Brain Engine 15 read layout on step 4096 + 4 GB (X4096, R0 at -b 8192, R1 with READ_LAYERS=4096) at 32K, 64K, 128K and 256K, 1 round (Addendum 31).
- `gptoss120b-settings.json`: our speed settings on GPT-OSS 120B on Brain Engine 15: B0 (Nov 10 best, `--n-cpu-moe 28`), N0 (Bob normal with `--fit`), F0/X0 (steps 2048/4096), F2c/F4c (2/4 GB copy cache), 2K prompt, 3 rounds, 18 loads (Addendum 32).
- `cache-types-contexts.json`: cache types (q8_0, f8_e4m3, q5_1, iq4_nl, q4_0, and keys q8_0 with values q4_0) on 4x4 and 6x3.5 at 64K, 128K and 256K, Brain Engine 15, 1 round, 36 loads (Addendum 33).
- `fit-margin-contexts.json`: a bigger `--fit-target` margin (2048, 3072, 4096 MiB) for 4x4 and 6x3.5 with q8_0 and q4_0 caches at 128K and 256K, Brain Engine 15, 1 round, 18 loads (Addendum 35).
- `step-sweep-q4.json`: reading steps 4096 to 8192 with a q4_0 cache, 3.5 GB copy cache and `--fit-target ${FIT_MARGIN}` (the margin Addendum 35 found), at 128K and 256K, plus -b 8192 -ub 4096, 12 loads (Addendum 36).
- `mtp-big-steps.json`: MTP off, 2 ahead and 3 ahead at steps 2048/512, 4096/4096 and 8192/4096 on the MTP copy of the brain, q4_0 cache, 128K window, 9 loads (Addendum 37).
- `mtp-big-steps-room.json`: the MTP rows at 4096/4096 and 8192/4096 again with a 2 GB copy cache, so the MTP head fits, 6 loads (Addendum 37).
- `needle-q4-vs-q8.json`: needle-in-a-haystack recall, f16 (128K), q8_0 and q4_0 cache at 128K and 256K, five depths each, 5 loads (Addendum 38).
- `kv-in-ram.json`: 4x4 and 6x3.5 with the context cache kept in RAM (`-nkvo`), q4_0 at 128K and 256K, q8_0 at 256K, 6 loads (Addendum 39).
- `kv-in-ram-nocache.json`: the same question without the copy cache (Brain Engine 15 stops when `-nkvo` meets the copy cache), 4 loads (Addendum 39).
- `spill-cause.json`: the 128K/256K pinned step buffer (the attention mask, Addendum 40): plain settings, then `-ub` 512 to 4096 at 256K with the 4x4 copy cache and a q4_0 cache, and 4096 with pinning off, 7 loads.
- `fit-small-margin.json`: `--fit-target` 1024/512/256 at 32K, 128K and 256K (4x4, q4_0) and 512/256 at 256K (6x3.5), 11 loads (Addendum 41).
- `unpinned-check.json`: the step buffer pinned vs in ordinary RAM (`GGML_CUDA_NO_PINNED=1`), F4c at 32K and 4x4 q4_0 at 32K/128K/256K, 2 rounds, 16 loads (Addendum 42).
- `mask-on-card-be16.json`: patch 0025's mask built on the card, off vs on, -ub 4096 at 32K/128K/256K and 6144 at 128K/256K, 2 rounds, 20 loads; needs Brain Engine 16 (Addendum 43).
- `mask-pos-be17.json`: patch 0026, no mask table: Brain Engine 16 off vs 17 off vs 17 on at -ub 4096 (32K/128K/256K), plus 6144 and 8192, 2 rounds, 30 loads; run mask-pos-check.exe first (Addendum 44).
- `real-desktop.json`: the picks so far at margins 512/1024, run on a clean desktop and again with a busy browser, 8 loads per pass (Addendum 45).
- `cpu-share.json`: copy cache with processor share 0 / 0.25 / 0.5, 4x4 q4_0 margin 512, 32K and 128K, 6 loads (Addendum 46).
- `perplexity-grid.json`: for `model-lab/perplexity-grid.mjs`, not the speed runner. What each speed setting and cache type costs in answers: KL divergence and same-top-word rate against plain settings with an f16 cache, with Brain Engine 15's llama-perplexity, 2 groups, 18 runs (Addendum 33).
- `perplexity-120b-softcut.json`: for `model-lab/perplexity-grid.mjs`: GPT-OSS 120B with the soft cut (41 of 128) against the full brain, in two phases (`--phase base` with the cut off, `--phase rows` after it is switched on) (Addendum 34).
- `stock-vs-picks.json`: stock llama.cpp (its own defaults, and at Bob's steps and cache types) against Bob's picks at 32K/128K/256K, with load times, 2 rounds, 20 loads (Addendum 47).
- `step-pick-confirm.json`: 4x3.5 / 5x3.5 / 8x3.5, q4_0, margin 512, at 128K and 256K, 3 rounds, 18 loads, so the step pick doesn't rest on one load (Addendum 49).
