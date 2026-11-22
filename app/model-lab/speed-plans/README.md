# Speed test plans

Plans for `model-lab/speed-test.mjs`, following the pre-registered method in
`docs/test-results/2026-11-16-speed-test-method.md`. Places on the test PC (the brain, the engines, the PC test lock,
the stop file, the hot-expert ranking) are never written here: they are given with `--var NAME=value` when the run
starts.

Since 20 November (Addendum 74) every plan waits for the card to cool to the idle card's own temperature plus 3 °C before each load
and each timed run, and the summary shows the card's start and top temperature and its clocks for every row. A plan can set
`"coolDown": {"cardC": N}` or turn it off with `"coolDown": false`.

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
- `mask-pos-be18.json`: Addendum 44 on Brain Engine 18 (BE17 is Linux only) plus `LLAMA_KQ_MASK_BUILD=1` rows at -ub 4096 (32K/128K/256K), 2 rounds, 36 loads; mask-pos-check.exe first; needs `BE18_SERVER` (Addendum 52).
- `copy-cache-long.json`: copy cache on vs off at 128K (step 5120) and 256K (step 6144): stock without, Brain Engine 15 with and without, q4, margin 512, unpinned, 3 rounds, 18 loads; needs `PLAIN_SERVER` and `BE15_SERVER` (Addendum 53).
- `be19-baseline.json`, `be19-where-time.json`, `be19-learn.json`, `be19-cpu-read.json`, `be19-spec-gate.json`, `be19-kv-split.json`: Brain Engine 19's new keys one at a time (89 loads in all; kv-split includes pinned-steps rows); `code-edit.md` is the code-edit prompt; need `BE18_SERVER`/`BE19_SERVER` (Addendum 54).
- `be19-lend-behind.json`: row 7b, lend vs lend + refill behind (32) with 4/6/8 GB copy caches at 32K, step 6144, plus no-lend references, 3 rounds, 27 loads (Addendum 55).
- `perplexity-mask-pos.json`: drift of `LLAMA_KQ_MASK_POS=1` on Brain Engine 18 (f16 and q4_0, with and without the switch, 4K x 4 and 8K x 2), 8 runs; needs `BE18_PERPLEXITY` (Addendum 56).
- `perplexity-mask-pos-ub1024.json`: the same at `-ub 1024`, so each chunk is read in pieces (Addendum 56).
- `mask-pos-fixed-placement.json`: table vs POS with `--fit off` and a fixed `--n-cpu-moe ${NCMOE}`, with and without cache reuse, 64 words, 8 loads (Addendum 58).
- `be19-learn-followup.json`: the learning copy cache with hit-rate counters on, share 0 ref, learn 16/8 at share 1, learn 16 at share 0.5 and 0, 15 loads (Addendum 59).
- `be20-cpu-read.json`, `be20-kv-split.json`: the two Brain Engine 19 crashes rerun on Brain Engine 20, 15 and 24 loads (Addendum 60).
- `perplexity-cpu-read.json`: answer drift of the processor read at 1024 on Brain Engine 20, share 0 and 1 each against its own base, 8 runs (Addendum 61).
- `coding-32k-64k.json`: the coding use (1,500 written tokens): stock vs 2x4, 4x4 and 4x0 at 32K and 64K, 24 loads (Addendum 63).
- `perplexity-kv3.json`, `needle-kv3.json`, `speed-kv3.json`: the 3-bit chat memory (q3_0) on Brain Engine 21: drift, needles, speed and memory, 10 runs, 20 and 36 loads (Addendum 64).
- `conductor-switch.json`: live `POST /context` switch cost at 32K on Brain Engine 21 (`model-lab/switch-cost.mjs`), 10 switches x 5 repeats on one load, plus fresh-start references (Addendum 65).
- `perplexity-progressive.json` (15 runs), `speed-progressive.json` (14 rows x 2 rounds), `needle-progressive.json` (6 rows x 5 rounds): Progressive Memory 3-step, 2-step and 8+3 on Brain Engine 22 against q8_0/q4_0/q3_0, need `BE22_PERPLEXITY`/`BE22_SERVER` (Addendum 71).
- `perplexity-progressive-16k.json` (7 runs): the perplexity half again at 16K x 2 with the windows scaled to a quarter (8+3 = q8_0:4096, 2-step q4_0:8192, 3-step both), step 2048 for every row; the first plan never engaged the tiers at 8K ("NOT USED: the context is not bigger than the biggest window") and its 32K x 1 needed a 64K-token text (Addendum 71, result note).
- `speed-progressive-be26.json` (17 rows x 2 rounds, with 8+4) and `perplexity-progressive-be26.json` (9 runs): the Progressive Memory rework (patch 0045) on Brain Engine 26, need `BE26_SERVER`/`BE26_PERPLEXITY`; each has a row with `LLAMA_KV_TIERS_EXPLICIT=1` (the old pass) as the before check (Addendum 73).
- `progressive-ring-be26.json` (13 rows x 2 rounds) and `perplexity-progressive-ring-be26.json` (9 runs): 8+3 and 8+4 with a smaller sharp ring (2,048 and 4,096 words at 32K/128K; 1,024 and 2,048 in the 16K accuracy plan) and 8+4 with slack 1,024, Brain Engine 26 (Addendum 75).
- `flip-read-write-32k.json` and `flip-read-write-128k.json` (for `switch-cost.mjs`, 5 switches x 3 repeats each): read the chat at the best reading step, switch to the writing settings (step 2048, with or without the learning cache, or the learning cache alone), write 600 words, against staying on one setting; the summary gains read s, writing t/s and the whole job time (Addendum 76).
- `flip-cache-32k.json` and `flip-cache-128k.json` (for `switch-cost.mjs`, 5 repeats): the owner's flip, reading at the big step with a smaller copy cache, then writing at step 2048 with a bigger one, against staying and the step-only flip (Addendum 81).
- `stay-bigcache-32k.json` (for `switch-cost.mjs`, 5 repeats): stay at step 6144 with a 4, 5 or 6 GB copy cache, no switch, against the moved-cache flip (Addendum 82).
- `conductor-grow-32k.json` (for `conductor-e2e.mjs`, Brain Engine 28): a 28K-token read, then one 2,000-token reply with thinking on; staying at step 6144 with 4 GB against the conductor growing the copy cache for the long reply from the engine's free-memory report (Addendum 83).
- `lend-bigcache-32k-r600.json`, `lend-bigcache-32k-r2000.json`, `lend-bigcache-128k-r600.json`, `lend-bigcache-128k-r2000.json` (for `conductor-e2e.mjs`, Brain Engine 28): a 28K-token read and one 600- or 2,000-token reply; step 6144 with 4 GB against step 6144 with 6 GB lent to the reading step (`LLAMA_MOE_CACHE_LEND=4096`), no switch (Addendum 84).
- `speed-8plus3-c4096-be26.json` (5 rounds): Progressive 8+3 against q3_0 and q4_0 at 32K and 128K, all at step 4096 with a 4 GB copy cache, replacing the 3.5 GB verdict (Addendum 85).
- `progressive-lend-128k-be28.json` (for `conductor-e2e.mjs`, Brain Engine 28): 8+3 and 8+4 with the 2,048 ring at 128K, staying, lending at the same step (answer-match check) and reading at step 8192 with 6 GB lent, beside plain q4_0 (Addendum 86).
- `perplexity-ring3072-be26.json`: 8+3 and 8+4 with a 3,072-word ring at 16K x 2, filling in the ring grid (Addendum 86).
- `perplexity-standins-decode-be26.json`: stand-in drift scored one token per step (`-ub 1`, the writing path), 4K x 4, with look-ahead 1 as the lossless control (Addendum 87).
- `fit-target-400-be28.json` (5 rounds, the last on a busy desktop): `--fit-target` 400 against 1,024 at 32K and 512 at 128K (Addendum 88).
- `speed-8plus2-be27.json` (15 rows x 2 rounds), `perplexity-8plus2-be27.json` (8 runs) and `needle-8plus2-be27.json` (3 rows at 128K): Progressive 8+2 with the 2-bit chat memory q2_kv (patch 0046, Turbo only), plain q2_kv, and K q4_0 + V q2_kv with the q8_0 ring, Brain Engine 27 (Addendum 77).
- `kv3-kernel-diag.json`: q4_0/q4_0, q3_0/q3_0, q4_0 K/q3_0 V and q3_0 K/q4_0 V at 8K and 32K, -lv 4 and GGML_SCHED_TIMING=1, 4 loads, Brain Engine 21: whether K or V reads slow the 3-bit memory (Addendum 70, diagnostic).
- `kv3-kernel-128k.json`: q4_0/q4_0, q3_0/q3_0 and q4_0 K/q3_0 V at 128K (122,880-token read) on the engine before and after patch 0044 (BE_BEFORE_SERVER, BE_AFTER_SERVER), GGML_SCHED_TIMING=1, 2 rounds, 6 loads: whether the faster q3_0 unpack closes the long-chat gap (Addendum 72).
- `kv3-gap-128k.json` (4 rows x 2 rounds): q4_0 and q3_0 at 128K with step 4096 / copy cache 4 GB and step 5120 / 3.5 GB, Brain Engine 25, timing on: why 3-bit memory trails q4_0 by 16% in the Progressive plans but 3% in the kernel test (Addendum 78).
- `conductor-e2e-64k.json` (for `conductor-e2e.mjs`, 4 ways x 5 rounds, round-robin): one fixed job at 64K (a 24K-token file read, then 5 follow-ups of 200 tokens, 300-word replies) at fixed step 2048, fixed 4096, the conductor (2048, switching live to 6144 for the big read and back), and stock llama.cpp b12359 at its own defaults; total time to the last word, per-turn speeds, switch seconds, same words (Addendum 79).
- `strata-tricks-be26.json` (18 rows x 2 rounds) and `perplexity-standins-be26.json` (3 runs): look-ahead 1 and 2, share 0.5 with and without the doorbell, share 1 + learn 16 with and without the doorbell, and stand-ins (rank, at most 1 or 2), at 32K and 128K on fixed placement beside the share-0 baseline; stand-ins also by KLD against off (Addendum 80).
- `overlap-ceiling.json`: where the time goes at processor share 1 (plain, learn 16, learn 16 at 128K) with GGML_SCHED_TIMING and GGML_SCHED_OVERLAP_LOG, 3 loads, Brain Engine 21: the doorbell overlap's ceiling (Addendum 69).
- `overlap-waitlog.json`: the same 3 rows with GGML_SCHED_OVERLAP_LOG alone, since the engine turns the who-waits log off when GGML_SCHED_TIMING is on (Addendum 69, result note).
- `spec-draft-length.json`: n-gram draft length 4/8/16/64 and n-max 8 with the pay gate, against no drafts, code edit and plain chat, Brain Engine 21, 2 rounds, 12 loads (Addendum 68).
- `conductor-switch-128k.json`: the same save, `POST /context` and restore timing at 128K (fixed placement `${NCMOE_128K}`, text laid 4 times end to end), step 5120 to 4096 and back, 3 repeats (Addendum 66).
- `perplexity-q3-vs-q4.json`: UD-Q3_K_XL against our UD-Q4_K_XL (f16 and q4_0 cache), 8 runs; needs `BRAIN_Q3`. `perplexity-q8-reference.json`: Q4 and Q3 against Q8_0, 6 runs; needs `BRAIN_Q8` (Addendum 57).
- `real-desktop.json`: the picks so far at margins 512/1024, run on a clean desktop and again with a busy browser, 8 loads per pass (Addendum 45).
- `cpu-share.json`: copy cache with processor share 0 / 0.25 / 0.5, 4x4 q4_0 margin 512, 32K and 128K, 6 loads (Addendum 46).
- `perplexity-grid.json`: for `model-lab/perplexity-grid.mjs`, not the speed runner. What each speed setting and cache type costs in answers: KL divergence and same-top-word rate against plain settings with an f16 cache, with Brain Engine 15's llama-perplexity, 2 groups, 18 runs (Addendum 33).
- `perplexity-120b-softcut.json`: for `model-lab/perplexity-grid.mjs`: GPT-OSS 120B with the soft cut (41 of 128) against the full brain, in two phases (`--phase base` with the cut off, `--phase rows` after it is switched on) (Addendum 34).
- `stock-vs-picks.json`: stock llama.cpp (its own defaults, and at Bob's steps and cache types) against Bob's picks at 32K/128K/256K, with load times, 2 rounds, 20 loads (Addendum 47).
- `step-pick-confirm.json`: steps 4096 to 8192 with 3.5 GB, q4_0, margin 512, at 128K (4) and 256K (5), 3 rounds, 27 loads, so the step pick doesn't rest on one load (Addendum 49).
- `needle-other-types.json`: the needle check for q5_1 and f8_e4m3 at 128K and 256K, 4 loads, so their quality gate isn't "not measured" (Addendum 50).
- `perplexity-cache-rerun.json`: for `perplexity-grid.mjs`: f16 vs q8_0 vs q4_0 on 4x4 at 4K x 4 and 8K x 2 chunks, so q4_0's quality gate doesn't rest on one 16K chunk (Addendum 50).
- `avalon-vs-be28-short.json`, `-32k`, `-64k`, `-128k`, `-256k` (for `conductor-e2e.mjs`, 3 rounds alternating, retry once): Avalon (plus Windows build-only fixes) on its own defaults and its Linux start-up keys against Brain Engine 28 on Bob's best settings, the same read and 5 follow-ups at five sizes, with peak card memory, shared-memory spill and the first differing word; round 3 at 128K on a normal desktop (`BUSY_CMD`) (Addendum 89).
- `gate1-borrow-e2e-64k-be29.json` (for `conductor-e2e.mjs`), `gate1-borrow-speed-be29.json`, `gate1-borrow-needle-be29.json` and `perplexity-gate1-borrow-be29.json`: Gate 1 for borrowed reading (patch 0048, `LLAMA_MOE_CACHE_BORROW=1`, `-b 16384 -ub 4096`) on Brain Engine 29 against fixed step 4096 (Addendum 90).
- `flashnext-q4kxl-32k-be29.json` (for `conductor-e2e.mjs`): Flash-Next UD-Q4_K_XL with mmap on, the 32K job, borrowing on against off, with drive reads and RAM logged alongside (Addendum 91).
- `flashnext-q4kxl-32k-be30.json`: the same Flash-Next job on Brain Engine 30, plain, drive tier, drive tier saving the hot set, then reading it as the ranking (Addendum 92).
- `gate1-borrow-e2e-64k-be31.json` and `gate1-borrow-speed-be31.json`: the Gate 1 rerun on Brain Engine 31 (0051), borrow against fixed with both at `-b 16384 -ub 4096` so the words match (Addendum 93).
