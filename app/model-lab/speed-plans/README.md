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
