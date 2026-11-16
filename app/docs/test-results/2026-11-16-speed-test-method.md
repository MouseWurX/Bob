# Speed test method: reading steps, Brain Engine cost, job finish times (pre-registered)

Written 16 November 2026, **before any timed run**. This page fixes the method in advance. The results page will link back here, publish every raw number next to it, and list anything that ran differently from this plan, and why.

## Questions

1. **Reading steps.** How much faster does the brain read a prompt with bigger batches (`-b`/`-ub` 2048 and 4096 instead of Bob's 512), and what does it cost in writing speed and graphics memory?
2. **Brain Engine cost.** What does Brain Engine (llama.cpp plus Bob's patches) cost against plain llama.cpp of the same build, with every feature off, and with each feature on by itself?
3. **Job finish.** How long do real multi-step jobs take from start to finish at each reading step?
4. **Effort.** The same jobs at each effort level. This one runs only after the effort test on rentals reports, and on a separate night.

## Hardware and software

- The replicant matrix ([index](README.md)): Ryzen 7 9800X3D, RTX 5070 Ti 16 GB, 32 GB DDR5-6000, NVMe, Windows 11.
- Brain: stock Qwen3.6 35B A3B, the file Bob picks by default on a 16 GB card. Its file name and sha256 go on the results page before the first timed run.
- Engines:
  - **Plain:** the official llama.cpp **b12359** Windows CUDA release, which is the same base as Brain Engine 8. It is downloaded, not compiled.
  - **Brain Engine 8** (8b12359): b12359 plus patches 0001 to 0014, the build Bob ships.
  - Both sha256 prints are recorded.
- The NVIDIA driver version, Windows build and Bob version (1.5.244 or newer) are recorded.

## Fixed settings

- Bob's engine flags, as Bob 1.5.244 sends them: `--jinja -fa on -ctk q8_0 -ctv q8_0 --fit on -np 1 --cache-reuse 256`, at `-c 49152`. The exact command line of every run is saved.
- Speed runs (Questions 1 and 2) use temperature 0, seed 42, `ignore_eos`, and exactly 300 written tokens, with no prompt cache between runs.
- Job runs (Questions 3 and 4) use Bob's own word settings for this brain, as Bob sends them, and the request body is saved.
- The test runs on its own port and in its own folder. It takes the PC test lock, keeps its windows minimized and never touches live Bob.

## Prompts (same for every run)

- **Start:** Bob's real start (system prompt plus tools, about 4,000 tokens) followed by "hi". It is captured once from Bob, and its sha256 is recorded.
- **16K and 32K:** public-domain book text, cut to exactly 16,384 and 32,768 tokens with the brain's own tokenizer, plus one question about the text. The sha256 prints are recorded.
- **Jobs:** 6 local jobs from the lesson job set (files, code, a spreadsheet, a document). Each job gets its test world, and there is no web search, because search times vary too much. The job list and its sha256 are committed here before the first timed run.

## Runs

**Question 1, reading steps:** `-b`/`-ub` at 512/512 (Bob now), 2048/2048 and 4096/4096, each on Brain Engine 8 with every feature off.

**Question 2, Brain Engine cost:**

| Run | Engine | Features |
|---|---|---|
| P0 | Plain | llama.cpp's default flags and sampling |
| P1 | Plain | Bob's exact flags and sampling |
| E0 | Brain Engine 8 | everything off |
| E1 | Brain Engine 8 | experts per word set to the brain's own count (0013) |
| E2 | Brain Engine 8 | expert switch-off with one expert masked (0001) |
| E3 | Brain Engine 8 | one dial set (0003) |
| E4 | Brain Engine 8 | live expert trace with a reader attached, as the cube does (0002, 0007, 0009, 0010) |
| E5 | Brain Engine 8 | everything above on together |

P1 against E0 gives the cost of carrying the patches. E1 to E4 against E0 give each feature's cost. P0 against P1 shows how much is down to Bob's settings rather than the patches. SCUT and card sharing (0004, 0005, 0006, 0008, 0011, 0014) only act over a network link, so they are measured in the Bob-Net tests, not here.

**Question 3:** the 6 jobs at each of the three reading steps.

**Question 4:** the 6 jobs at Low, Medium, High and Max, at 512 and at the winning reading step.

## Order and repeats

- Each setting gets one untimed warm-up run after the brain loads.
- Each setting then gets **5 timed runs**. Settings are taken in turn (1, 2, 3, 1, 2, 3...), so heat and background load fall evenly across them.
- Reported: **median, with min and max**. Never a mean on its own.

## What is measured

- **Time to first word**, first and foremost: from the request sent to the first written token.
- Reading speed (prompt tokens per second) and writing speed (written tokens per second), from the engine's own timings.
- Peak graphics memory (nvidia-smi, sampled every 250 ms), and how many layers' experts the fit put in RAM.
- For jobs: wall time from the job sent to the final answer, steps, tool calls, and pass or fail. Pass or fail is judged the same way as the lesson job runs, and a run that fails still counts in the times.

## Conditions recorded with every run

- Graphics card temperature, power draw, power limit, core and memory clocks, and nvidia-smi's throttle reasons, sampled every 250 ms.
- Processor load and the top 5 other processes by processor and graphics use, at the start and end of each run.
- Whether a run was throttled. A throttled run is **kept and flagged**, not dropped. If more than one run of a setting is throttled, that setting is run again and both sets are published.

## Stop rules

- The test stops at once and frees the card if Gaming mode turns on or a game starts. Finished settings are kept and the rest are marked not run.
- There are no reboots and no compiling.

## Publishing

- The results page goes beside this one with the median, min and max tables, and a raw CSV with every run, every sample and every command line.
- Anything skipped or changed from this page is listed at the top of the results page, with the reason.
- Dissertation chapter 3 is updated from the results. It will also cite the 12 November trace cost ([cube Real experts](2026-11-12-cube-real-experts-cost.md)), which was measured on Brain Engine 5.

## Addendum 1: the new speed features (added 16 November 2026, before any timed run)

The same rules as above apply: warm-up, 5 runs in turn, median with min and max, and conditions logged with every run.

**Question 5, each new feature alone, then one combination,** all on Brain Engine with every expert feature off, at Reading speed Normal unless the row says otherwise:

| Run | What is on |
|---|---|
| N0 | Nothing new (same as E0) |
| N1 | Reading speed Fastest (4096) |
| N2 | Turbo for everyday brains, with the brain's own guesser if its file has one; otherwise marked not run |
| N3 | Lock brain memory |
| N4 | Hot experts on the card (fixed split from the mixed calibration reorder) |
| N5 | Prefetch for prompt reading |
| N6 | Turbo + hot experts together, the everyday combination |
| N7 | Everything new on together |

**Extra metrics for these rows:**

- **Kept guesses** (`draft_n_accepted` / `draft_n` from the engine's timings) for every Turbo row, reported beside writing speed. Writing speed with Turbo isn't comparable with plain writing speed without it.
- **Expert moves** between card and RAM during the run, for N4, N6 and N7. The placement is fixed at load, so this should be 0. Anything else is a bug and is reported as one.
- **All-hot share:** for hot-expert rows, the share of written tokens whose picks all fell on the card. Writing speed is reported for those tokens and for the rest separately, so the best case and the typical case aren't mixed.
- **Lock brain memory:** first word on the 4K prompt after a 10-minute idle with a 6 GB memory-filler app running, with and without the lock. A quick run can't show what locking is for.

**Known differences, stated in advance:**

- With hot experts, the card half and the RAM half are added after two separate multiplies, so sums happen in a different order than in one multiply. The last digits of the odds can differ from stock, and answers may differ by a word on rare ties. Perplexity on a fixed 32K text is reported for N0 and N4 so the size of that difference is visible.
- Temperature 0 with Turbo gives the same words as without it. That is checked word for word on the 300-token run and reported.

## Addendum 2: hot experts as a ranked fill of llama.cpp's own cache (added 16 November 2026, before any timed run)

Addendum 1 described hot experts as a split of each expert tensor into a card half and a RAM half. That design was dropped before any run: llama.cpp b12359 already has an expert cache on the card (`--moe-cache-mib`, `--moe-cache-cpu-share`), so Brain Engine patch 0016 only fills that cache at load from a ranking. Addendum 1 stays as written; where they differ, this one replaces it.

**What changes in Addendum 1:**

- **N4** is now: hot experts on, `--moe-cache-cpu-share 1`, the cache filled from the **mixed** ranking, room Auto (4 GB on a 16 GB card).
- **N5 (prefetch for prompt reading)** is not run as its own patch. Prompt reading in big batches already copies each piece's experts to the card once, which Reading speed (N1) makes rarer, and upstream does that copying without a separate patch. If N1 shows the copying still dominates, a prefetch patch is proposed separately, with its own addendum.
- **The rounding note no longer applies.** No multiply is split: a cached expert and a RAM expert use upstream's own kernels, as on stock llama.cpp with the cache on. Perplexity on the fixed 32K text is still reported for N0 and N4.

**Expected limit, stated before the run:** batches over 32 tokens skip the cache. Prompt reading goes in batches of 512 to 4,096, so **hot experts can't make prompt reading or the first word of a long prompt faster**. Any first-word gain in N4 would be noise or a side effect and is reported as such. Long-prompt first word belongs to Reading speed.

**New rows (cache sizes and shares):**

| Run | What is on |
|---|---|
| H1, H2, H3 | Stock cache, no ranking, share 1, at 2, 4 and 6 GB |
| H4, H5, H6 | Ranked fill (mixed), share 1, at 2, 4 and 6 GB |
| H7 | Stock cache, share 0 (upstream's default, the 1.5.193 setting), 4 GB |
| H8 | Stock cache, share 0.5, 4 GB |
| H9 | Ranked fill from each kind's own profile, on that kind's prompts (coding, office, research, chat), 4 GB |

**Extra metrics for every cache row:**

- The engine's own totals (`LLAMA_MOE_CACHE_LOG_EVERY` set, so they print while the server runs; a stopped server on Windows never prints them): hits, misses, misses worked out on the processor, **MB copied to the card**, for batches up to 8 tokens and for 9 to 32 apart.
- **The processor's share** of the expert picks (misses on the processor / all picks), per profile.
- **The first 1,000 written tokens apart from the rest**, so the stock cache's warm-up is visible next to the ranked fill, which has none.
- **The profile stamp** for every ranked row: the mix fingerprint, the brain file (name, size, date), the brain fingerprint the engine printed, the engine build and the list of Brain Engine patches.

**The "nothing moves" check (about 10 minutes, before the timed rows).** Until now "a ranked cache at share 1 never changes while writing" is read from the code (`plan()`), not measured. The check turns it into a measurement:

1. Writing only (Turbo off), ranked fill, share 1, 4 GB, the 300-token prompt 5 times. **Pass:** after the load, MB copied for batches up to 8 tokens stays at 0.00. If the ranking left slots empty (fewer experts ranked than slots), the first-come fill of those slots is copied once and then stops; the check then passes when the copying stops growing after the first answer.
2. The same with Turbo on (3 guesses, checked in batches of 4). **Expected:** MB copied small and not zero (the checks can run out of spare slots and copy a few in). Reported with the number of copies, not only MB.

If step 1 fails, the hot-expert rows are reported as "not fixed" and the patch goes back for a fix before any timing is published.

**Loud failures, checked once before the run:** start the engine with (a) no file at the path, (b) a file with a bad first line, (c) a ranking made on another brain, (d) one with an expert number past the brain's last. Each must print `!!! MoE cache ranking NOT USED` with its reason and fill the stock way. Bob's logbook must show the warning too. A ranking from the wrong weights quietly installed would taint every hot-expert number after it.

## Addendum 3: which effort levels (added 16 November 2026, before any timed run)

The effort test on rentals has reported (100 jobs per setting, graded blind). On the regrade of the answer Bob's window shows, failures went from 19 to 16 at the lowest level and from 24 to 14 at the high one, and 54 of 100 jobs failed at Max, on code from before its fixes. The owner decided all four levels are tested: **Minimus, Medius, Magnus and Maximus** (the levels' names from that work). Maximus runs on its fixed code, and the results page names the Bob commit each level ran on. If Maximus isn't fixed by the night of the run, it is marked not run, with the reason, and the other three go ahead.

## Addendum 4: the cube's live view, data against drawing (added 16 November 2026, before any timed run)

The 12 November test measured Real experts on Brain Engine 5 (writing 17 to 25% slower, reading 2%) and showed the cost was in collecting the picks, not in sending them live. It didn't separate collecting from drawing, and Brain Engine 6's once-a-word read (patch 0010) was never timed. Same rules as above (warm-up, 5 runs in turn, median with min and max), Brain Engine 8, the 300-token and 16K prompts:

| Run | What is on |
|---|---|
| C0 | Bob's window open, cube hidden |
| C1 | Cube showing, glow for show (drawing only, no trace asked) |
| C2 | Real experts on, the trace asked by a script with no page drawing it (collecting and sending only) |
| C3 | Real experts on, cube showing (collecting, sending and drawing) |
| C4 | C3 with Bob's window set to the built-in graphics (Windows: Settings, Display, Graphics, Power saving), only if the processor's graphics is switched on in the firmware; otherwise marked not run |
| C5 | Real experts switched off again after C3, cube showing (anything left hooked in shows here) |

C1 minus C0 is the drawing on the card; C2 minus C0 the collecting and sending; C3 against C2 and C1 shows whether they add up. C4 shows what moving the drawing off the card buys. C5 must match C1; if not, it's reported as a leak and fixed. The card's use and the engine process's processor time are logged with every run.

**Addendum 4, more (added the same day, before any run):**

- **Does copying dominate at fast writing?** Brain Engine 6 and later already copy each word's picks out once instead of once per layer (40 times on the 12 November brain), but the live view still waits for the card once per word to send that word's piece. C2 is run at three writing rates: Qwen3 4B (no experts, about 200 words a second), the 35B on the 300-token prompt (fast), and the 35B with a 32K chat behind it (slow). The cost is reported as a percent and as milliseconds per word. If the milliseconds per word stay the same across rates, the cost is per word, and the fix is to send the picks every N words or every screen tick instead of every word. That change (an engine request field for N) is then proposed and measured as its own row.
- **Low against high rates** come from the same three cases, with C3 too, so drawing (fixed per screen frame) and copying (per word) can be told apart: drawing should cost the same milliseconds a second at any rate, copying the same milliseconds a word.
- **The "off" check stays in every run night,** not only this one: C5 (Real experts switched off after use, cube still showing) must match C1, or the run is reported as a leak.
- **Stalls, not only averages.** Every C run streams its answer and logs the arrival time of each word, so the gaps between words are kept one by one. Reported with each row: the median gap and the 95th and 99th percentile and the longest gap, beside the words-a-second figure. A row whose average looks fine but whose 99th percentile jumps is reported as a stall problem.
- **The cube's real frame rate.** In C1, C3 and C4 the cube page counts the frames it actually draws (a test-only counter, read by the script), and the result gives frames a second beside the cost. If the frame rate falls under load, the per-second drawing cost is shown with it, so drawing less isn't mistaken for drawing cheaply.
- **The "off" check at the fastest rate.** C5 is also run with Qwen3 4B, the fastest writer, where a half-detached tap would fire most often.

## Addendum 5: prefetch is built after all (added 16 November 2026, before any timed run)

Addendum 2 said N5 (prefetch for prompt reading) would not run as its own patch. The owner chose to build it before testing: Brain Engine patch 0019 copies the next layer's experts while this one works (`LLAMA_PREFETCH_EXPERTS=1`). **N5 runs again** as written in Addendum 1, at Reading speed Normal and Fastest, on the 16K and 32K prompts, with the engine's closing count of tensors copied ahead and used, and peak card memory (it needs about one layer of experts more). If it can't set up on the card it says so and the rows are marked not run. Patch 0018 (live trace every N words) gets rows C2 and C3 at N = 1, 4 and 14.

## Addendum 6: the long prompts' text (added 16 November 2026, before any timed run)

The 16K and 32K prompts are cut from chapters 1 to 4 of Bob's own dissertation as they stood on 16 November 2026 (`model-lab/speed-plans/long-text.md`), not from a public-domain book: the book couldn't be fetched from the machine that wrote the plan, and a committed copy of our own published text is just as fixed and checkable. The runner cuts it to exactly 16,384 and 32,768 of the brain's own tokens and adds one fixed question. The start prompt is `model-lab/speed-plans/start.json`, made with the Lab's throwaway Bob. Both sha256 prints are in every result.

## Addendum 7 (Nov 16, before any timed run): every engine starts at `-lv 4`

The first setup run on the PC stopped at the ranking step: the engine printed no brain fingerprint. llama-server files the engine's own info lines (the fingerprint, the ranked fill, the cache totals, the prefetch count) at level 4 and shows only up to 3 by default. Warnings show at any level. So every engine in every row, plain llama.cpp included, now starts with `-lv 4`. It is the same for every row, so it can't favour one, and level 4 is not debug (5), so it adds no lines per word. No timed run had started; nothing measured is affected.

## Addendum 8 (Nov 16, before any timed run): Turbo with Bob's own sampling

Every other row samples at temperature 0. Bob's everyday Qwen3.5/3.6 setting sends temperature 0.7, top_p 0.8, top_k 20, min_p 0, presence_penalty 1.5 and repeat_penalty 1.0. A distill's model page warns that some other engines (Strata) switch MTP drafting off unless the request is at temperature 0 with no penalties. llama.cpp's `--spec-type draft-mtp` doesn't do that: it drafts at any temperature (above 0 it checks drafts by rejection sampling), and no Brain Engine patch touches sampling. To show what Turbo gives with the setting Bob really sends, two rows are added: **N0S** (Brain Engine 9, no Turbo) and **N2S** (Turbo, as N2), both with Bob's sampling in the request. The drafts-kept share is reported for every Turbo row. Night 1 is now 33 rows, 165 loads.

## Addendum 9 (Nov 16, before any timed run): what the first setup found

- **Rankings load twice.** With its expert cache on, Brain Engine 9 sent back no expert trace, so the first rankings counted 0 picks. They were set aside and not used. `hot-rank.mjs` now reads the brain's fingerprint on one load with the cache on, then counts the picks on a second load without it. The cache doesn't change which experts are picked. It now stops with a reason if any kind counts no picks.
- **The runner starts from a folder with a space.** `speed-test.mjs` compared its own path in a way that turned each space in a folder name into %20, so it did nothing and said nothing. Fixed and tested.
- **The setup's own health check now has a time limit.** b12359 opens its port before the brain has loaded. One check without a limit hung for about 50 minutes. No measured number came from that run.
- **Not affected:** the H rows time the cache and ask for no trace. The C rows ask for the trace but run without the cache. The trace-with-cache bug is noted in the engine README for the next Brain Engine.

## Addendum 10 (Nov 16, before any timed run): no Turbo rows on this brain

The quick checks found that the stock Qwen3.6 35B A3B file used on the PC has no MTP layers (nextn_predict_layers = 0), so `--spec-type draft-mtp` can't run on it. Rows N2, N2S, N6 and N7 (Turbo), and N0S (paired with N2S), are taken out of night 1. Night 1 is now 28 rows, 140 loads. Turbo gets its own rows later, on a copy of the brain that keeps its MTP layers. Addendum 8's question (how many drafts Bob's own sampling keeps) is still open.

Quick checks, all before any timed run: the ranked fill loaded 2,220 experts (4,060 MiB), and over 5 answers 0.00 MiB moved to the card (share 1). All four bad ranking files were refused loudly, each with its reason. Prefetch printed both its start-up and closing lines.
