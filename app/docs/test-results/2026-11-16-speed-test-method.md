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

## Addendum 11 (Nov 16, before any timed run): a Turbo plan of its own

Turbo needs a copy of the brain that keeps its MTP layers: unsloth's `Qwen3.6-35B-A3B-MTP-GGUF`, in the same UD-Q4_K_XL quant as night 1's brain (22.9 GB against 20.8 GB). It is a different file, so its rows are compared only with each other. `speed-plans/turbo.json` has 5 rows, 25 loads, all on Brain Engine 9:
- **T0:** no Turbo.
- **T2 and T3:** Turbo with 2 and 3 drafted words.
- **T0S and T3S:** the same, with Bob's everyday sampling (addendum 8).

Each Turbo row reports the share of drafts kept. The download happens before any timed run, never during one. Hot experts with Turbo would need a ranking made on this file, because its fingerprint differs. That is left for later.

## Addendum 12 (Nov 16, before any timed run): every condition the method promises is now recorded

A check against the "Conditions recorded" list found that the runner sampled only the card. Now:
- **Once per test** (`environment.json`): the card name, driver, VBIOS, memory, power limit and top PCIe link; Windows version; the processor model and cores; RAM; node; each engine's sha256; and the brain file's size.
- **Every 250 ms during a timed run** (nvidia-smi): card temperature, power draw and limit, core and memory clocks, throttle reasons and memory, as before. Added: card busy %, fan %, memory temperature (blank when the card doesn't report one) and the PCIe link.
- **Each timed run:** processor busy share over all cores, and free RAM.
- **Before and after each load**, using only Windows' own tools, nothing installed:
  - the top 5 processes by processor use, and the top 5 by graphics use;
  - the power plan;
  - the processor temperature, if the firmware reports one. Many PCs report none, or only to an administrator, and then the page says so instead of guessing.
- `summary.md` gets a conditions table, and the processor temperature line.

Still worked out at write-up time from the saved data: same words with and without Turbo (every run's text sha256), and the layers whose experts sit in RAM (engine logs). Not built: perplexity on the 32K text for N0 and N4. It is listed as skipped on the results page unless it is added before the run.

## Addendum 13 (Nov 16, before any timed run): processor temperature from HWiNFO

Windows reports no processor temperature on the PC (checked: the ACPI thermal zone is empty). The owner chose to add HWiNFO, which they install and start themselves. HWiNFO's sensor log is a CSV file it adds a line to each second. The runner gets the log's path with `--hwinfo <csv>`. For each timed run it reads only the lines written during that run, and reports:
- the hottest processor temperature (Tctl/Tdie), and the median;
- the peak CPU Package Power.

Columns are found by name, and a comma decimal is read too. If the log is missing or has no new lines, the results say so for that run.

## Addendum 14 (Nov 16, before any laptop run): the laptop plan, heat and throttling

The owner expects the laptop (6 GB card) to throttle from heat. `speed-plans/laptop.json` has 6 rows, 30 loads, on the brain Bob picks for a 6 GB card (Qwen3 4B, which fits on the card whole, so the card works hardest):
- P1 (plain llama.cpp, Bob's settings) and N0 (Brain Engine 9, nothing new).
- R2048 and R4096: Reading speed Faster and Fastest.
- N3: brain locked in memory.
- SOAK: Brain Engine 9 writing 6,000 words in one go on the short prompt, to show what sustained heat does to writing speed.

Every row reads the short prompt, 16K and 32K (context 36,864), except SOAK. Two things are added to the runner for this, and work on any machine:
- **Cool-down before each load** (`coolDown` in the plan): the runner waits until the card is at or below 60 °C, checking every 5 seconds, for at most 5 minutes. Without it, a hot row hands its heat to the next one and the rows aren't compared fairly. The wait, the start temperature and any load that started above 60 °C after the longest wait are recorded and shown in the summary.
- **Time spent throttled**: for every run, the share of the 250 ms card samples in which the card slowed itself (heat or power cap), with the writing speed of the least and most throttled run of each row. Throttled runs are kept, as before.

The cool-down makes the rows fair to each other. SOAK shows the throttling anyone would see in real use. If the laptop runs on battery, the results say so; the owner is asked to plug it in. The summary-so-far.md table fills in between loads, as on the PC.

## Addendum 15 (Nov 16, 7:35 PM Mountain, during night 1, before any result was read): predictions

The owner asked what to expect. These predictions are written down while night 1 runs, before anyone has read a number from it. They are graded against the results page as they stand, right or wrong. Ranges are against the row named, on the same prompt.

| Rows | Prediction | Why |
|---|---|---|
| R2048, R4096 vs R512 | Reading 16K and 32K: 1.5x to 2.5x faster at 4096, less at 2048. First word at 32K falls by about the same share. Writing within 3%. Peak card memory up 1 to 2 GB. | Bigger batches copy each expert to the card fewer times; a 3060 report showed 2.5x to 2.9x on a dense brain. |
| E0 vs P1 | Within 2% on every number. | Brain Engine with everything off runs upstream's code paths. |
| E1, E2, E3 vs E0 | Each within 2%. | They change a few numbers per word, not the work. |
| E4 vs E0 | Writing 5% to 18% slower. Reading within 3%. | Brain Engine 5 cost 18% writing short; 6 and later copy the picks once per word, not once per layer. |
| E5 vs E4 | Within 3% of E4. | The trace is the only costly one. |
| N0 vs E0 | Within 2%. | Brain Engine 9's new parts are all off. |
| N3 | Medians within 2%, but fewer long word gaps (lower max gap). It may be refused if Windows won't lock that much RAM. | Locking stops paging, which shows in the worst gaps, not the median. |
| N4 (hot experts 4 GB, ranked) | Writing 0% to 15% faster. Reading and first word unchanged. | Stated limit: prompt reading skips the cache. The cache takes room that --fit would give to layers. |
| H4, H5, H6 vs H1, H2, H3 | Ranked at least as fast as stock at the same size, most gain at 2 GB. 6 GB may be slower than 4 GB. | The stock cache learns its experts during the first answers; a short run leaves it half learned. Too big a cache squeezes layers off the card. |
| H7 vs H2 | Writing 10% to 40% slower. | Share 0 copies a missed expert over the cable every time instead of working it out on the processor. |
| N5, N5F | Reading 0% to 10% faster at Normal; no change at Fastest. | Prefetch hides copying, which Fastest already makes rare. |
| C2-1, C2-4, C2-14 vs N0 | C2-1 costs about what E4 costs; C2-14 within 2%. | The cost is per word sent. |
| T2, T3 vs T0 (temperature 0) | Writing 20% to 60% faster, T3 a little ahead of T2. Same words as T0. | Qwen3.6's MTP layer guesses most next words right at temperature 0. |
| T3S vs T0S (Bob's sampling) | Writing 10% to 35% faster, with fewer guesses kept than T3. | Sampling at 0.7 rejects more guesses. |
| Laptop SOAK | The card throttles within the first 2 minutes. Writing settles 10% to 30% below the first minute. | Laptop cards run near their heat and power limit. |

**What would change Bob's defaults.** Fastest reading becomes the default on 16 GB cards if it is at least 1.5x faster at 32K with writing within 3%. Hot experts is offered as a setting only if N4 or H5 is at least 5% faster writing with no copying. Turbo is offered on brains with an MTP layer if T3S is at least 10% faster with the same quality. A patch costing more than 2% with its feature off is reported as a bug.

## Addendum 16 (Nov 17, after night 1's results, before this run): the calibration run

Night 1 measured reading steps and hot experts apart. They compete for the card: the cache takes room that `--fit` would give to layers, and bigger reading steps need bigger work buffers. `speed-plans/calibrate.json` measures them together to find the best pair, on the same brain and engine (Brain Engine 9), 18 rows, **5 rounds** (90 loads), as the method asks, so its numbers can be reported as final.

- **Y0:** Normal reading, no cache, as the same-night yardstick.
- **F0, X0:** Faster (2048) and Fastest (4096), no cache.
- **F1p, F2p, F4p / X1p, X2p, X4p:** each step with the stock cache at 1, 2 and 4 GB, missed experts worked out on the processor (`--moe-cache-cpu-share 1`).
- **F1c, F2c, F4c / X1c, X2c, X4c:** the same, missed experts copied to the card (`--moe-cache-cpu-share 0`, night 1's fastest writer).
- **G0:** no trace, CUDA graphs turned off (`GGML_CUDA_DISABLE_GRAPHS=1`).
- **G4:** the live trace on, as E4.
- **G2:** the live trace with `expert_trace_mass` on. Brain Engine 9 then takes 0002's old path: it stops at every layer and never marks the expert picks as graph outputs (0010's `keep_expert_ids` is off with mass). It is slower by design. It is here only for its words.

Every row reads the short prompt, 16K and 32K, except G0 and G4 (short and 32K). The cache is filled the stock way: night 1 found the ranking no faster. 6 GB is left out: it read slowest and wrote no faster than 4 GB.

**What decides "best":**
- First, writing on the short prompt within 3% of the best row.
- Among those, the fastest reading at 32K.
- A row that writes more than 3% slower than Y0 on any prompt can't win.

**What G0 decides:** if G0 writes within 3% of G4, the live trace's cost is CUDA graphs being turned off. If G0 writes within 3% of Y0, it isn't. If G0 writes the same words as Y0, the word change under the trace comes from somewhere other than the replay. If G2 writes the same words as Y0 while G4 doesn't, marking the picks as graph outputs (0010) is what changes the words. If G2's words differ too, the test can't separate the causes, because the mass reads more of each layer.

The runner now joins split nvidia-smi lines, so the card conditions are read from whole lines.

## Addendum 17 (Nov 17, during the calibration run, before any 120B result): a brain bigger than the RAM

The owner asked for hot, warm and cold experts to be built and tested. Hot is the card (the expert cache). Warm pins the busiest RAM experts so the operating system can't drop them to the disk. Cold asks for a whole expert at once from the disk when one that hasn't been used lately is picked. That is patch 0020 (`app/engine/README.md`), off unless asked. Neither tier changes a number, and the words are checked identical on a tiny brain. They can only matter when the brain doesn't fit in RAM. So the test brain is GPT-OSS 120B (63 GB) on the same PC (16 GB card, 32 GB RAM), with about 15 GB that can't fit.

`speed-plans/big-brain-tiers.json`: Brain Engine 10 (with 0020), the Nov 10 best placement (`--n-cpu-moe 28`, reading step 2048), a 2,048-token prompt, 300 words out, 6 rows × **5 rounds** (30 loads), interleaved, with a warm-up per load as before. New: each timed run also records how many MB the disks read (`"diskReads": true`), and MB per written word.

| Row | What | Why |
|---|---|---|
| B0 | Baseline | The number to beat (Nov 10: about 17 words a second, measured by another method) |
| K3 | 3 experts per word instead of 4 (`--override-kv`) | Estimated 20 to 30% faster, never measured. **Changes the words**, so a quality check is needed before it's offered |
| P1 | Prefetch (0019): the next layer's RAM experts copied to the card while reading (added at the owner's ask) | On the 35B too little sat in RAM for it to help; 120B has far more there |
| C1 | Cold tier | Whole-expert reads |
| W8 | Warm tier, 8 GB | Busiest RAM experts pinned. Needs a 120B ranking file (`RANK120`); if none exists by run time, W8 and CW are dropped and reported as not run |
| CW | Both | |

**Predictions, written before any run:** B0 reads a lot from the disk per word (several MB). C1 lowers the time per word only if B0's disk reads are large; otherwise it's within 3%. W8 lowers disk reads per word, and writing gets faster by a similar share. K3 is 15 to 25% faster at writing. P1 reads the prompt faster than B0 (no prediction of how much); writing is unchanged.

Turbo isn't in this plan. GPT-OSS has no built-in guesser, and a gpt-oss-20b guesser (about 12 GB) would push more of 120B onto the disk. It belongs with Flash-Next, which ships its own small guesser head.

**Rule:** a tier is worth offering only if it writes at least 5% faster than B0 on the median, with no run slower than B0's slowest. Gaming, the stop file and the test lock work as before. It needs the owner's card, and Brain Engine 10 built.

## Addendum 18 (Nov 17, after the calibration results, before this run): the cube check

The calibration showed that CUDA graphs alone don't change the words (G0) and that the live trace does (G4). The trace path does two things: it marks the router's sort as an output (`ggml_set_output`, when `keep_expert_ids` is on) and it adds the eval callback. The owner's programmer friend pointed out that the run can't tell those apart. In Brain Engine 9 the trace with its mass (`expert_trace_mass`) runs with `keep_expert_ids` off: no `ggml_set_output`, callback still on (and it stops at every layer, so it's slower).

`speed-plans/cube-check.json`: Y0, G4 and G2 on the start prompt and 32K, 5 rounds (15 loads), same engine, brain and settings as the calibration.

**Decided in advance:** if G2 writes the same words as Y0 on both prompts in all its runs, the fusion break from `ggml_set_output` is the cause and the planned fix is enough. If G2's words differ from Y0, the callback split changes the words too, and the fix must also drop the callback (the planned fix already does). Speed isn't judged here, since G2 stops at every layer.

## Addendum 19 (Nov 17, after the cube check, before the fix is built or run): the cube fix

The cube check found that the callback alone changes the words (G2 differed from Y0 and from G4), so the fix drops
both: patch 0021 copies each layer's picks into a small kept tensor after the router's fused kernel and reads them
after each micro-batch, with no eval callback and no `ggml_set_output`. It passes on the processor with the tiny
made-up brain (`engine/tests/trace-kept.py`). The card is the open question.

`speed-plans/cube-fix.json`, on Brain Engine 10: Y0 (no trace) and T1 (trace) at Normal, F4c and FT (trace) at F4c's
settings, on the start prompt and 32K, 5 rounds (20 loads), same brain and base settings as the calibration.

**Decided in advance:** the fix works when T1 writes the same words as Y0 and FT the same as F4c, on both prompts
in all their runs, and each traced row's median writing speed is within 2% of its untraced pair. If the words match
but the speed is more than 2% behind, the words are fixed and the speed isn't. If the words differ, the fix failed,
whatever the speed.

**Amendment to addendum 19 (Nov 17, before the run):** the builder can't check on a card that the fused top-k kernel
still runs with the trace on, so the run checks it. Row **U0** is Y0 with `GGML_CUDA_DISABLE_FUSION=1` (25 loads now).
If U0's words differ from Y0's and T1's match Y0's, T1 kept the fusion. If U0's words match Y0's, the words can't tell,
and the speed decides: T1 must be within 2% of Y0 and U0 measurably slower. Either way, U0 is reported, not judged.

**Amendment (Nov 17, before the Brain Engine 12 run):** U0 is dropped for Brain Engine 12 (plan `cube-fix-be12.json`, 20 loads). Fusion was already shown kept on Brain Engine 11, and T1 giving the same words as Y0 still proves it. Nothing else changes: Y0, T1, F4c and FT, 5 rounds, start and 32K. T1 passes if it stays within 2% of Y0 on both prompts with Y0's words, and FT must give the same words as F4c.

## Addendum 20 (Nov 17, after the cube fix, before this run): bigger caches and bigger reading steps

The calibration tried the copy cache at 1, 2 and 4 GB, and 4 GB was the only size that helped at every prompt, so where it peaks is unknown. The owner asked for more than 4 GB, and for reading steps of 5K and 6K. `speed-plans/calibrate-bigger.json`: same brain, prompts and base settings as the calibration, on Brain Engine 10 (Brain Engine 9 with the expert tiers, 0020, and the cube fix, 0021, both off unless asked; the cube-fix run, Addendum 19, checks that 0021 changes no speed or words), 9 rows, **5 rounds** (45 loads), interleaved.

| Row | Reading step | Copy cache | Why |
|---|---|---|---|
| Y0 | Normal (512) | none | Same-night yardstick |
| F4c, X4c | 2048, 4096 | 4 GB | The calibration's chat and coding picks, as same-night anchors |
| F5c, F6c | 2048 | 5, 6 GB | Does the chat pick keep gaining past 4 GB? |
| X5c, X6c | 4096 | 5, 6 GB | The same for the coding pick |
| S5kc | 5120 | 5 GB, stepping down | A bigger step with the biggest cache that runs beside it |
| S6kc | 6144 | 5 GB, stepping down | The same at 6144 |

All caches are the copy kind (`--moe-cache-cpu-share 0`). At the owner's ask ("it'll try 5gb, 4gb, 3gb, whatever works gets its test"), S5kc and S6kc start at 5 GB and step down to 4, 3, then 2 GB when the load doesn't start or a run fails (out of memory or a spill). Each load records the size it ran with and the sizes that failed, and the results page lists them. A stepped-down load is reported under its row with its size, never mixed silently with loads at another size.

It runs right after the cube-fix run (Addendum 19, with U0: 25 loads), from the same double-click, on the same engine file. It writes to its own results folder and has its own rules. Neither run's results decide anything in the other.

**Safety and failures:** each load is skipped if the card has under 14,000 MB free before it starts (something else is using it), written down as not run. On Windows the driver can put card memory in RAM when the card is full. So the runner reads shared GPU memory before each load and after each timed run, and a rise of more than 512 MB marks that run failed as a spill. A load that doesn't start, a run that runs out of memory and a spill are all failures. They are reported as failures and never counted as slow runs. Gaming, the stop file and the test lock work as before.

**Predictions, written before any run:** F5c and F6c write within 3% of F4c, because the busiest experts already fit in 4 GB and a bigger cache only takes room from layers. X5c and X6c read the 32K prompt slower than X4c. S5kc and S6kc read 32K at most 15% faster than X4c and write slower than X4c. S6kc can't run at 5 GB and steps down.

**What decides:** the same two rules as Bob's Calibrate, over rows with no failed run on any prompt. Chat pick: the fastest writer on the short prompt, and among rows within 3% of it, the fastest reader at 32K. Coding pick: among rows writing within 10% of the fastest writer, the fastest reader at 32K. A new row replaces F4c or X4c only if it wins over that night's F4c or X4c. Calibrate then tries that size or step on cards with room for it.

## Addendum 21 (Nov 17, after the bigger-caches results, before this run): in between, without a spill

X4c (step 4096 + 4 GB) read 43% faster at 32K than F4c but pushed about 0.6 GB of card memory into RAM. The owner
asked to "open a bit more room up on ram, but keep it towards the higher end". `speed-plans/calibrate-between.json`:
same brain, engine (Brain Engine 10 as installed for Addendum 20), settings, prompts and spill rule, 6 rows,
**5 rounds** (30 loads), interleaved.

| Row | Reading step | Copy cache |
|---|---|---|
| F4c | 2048 | 4 GB (anchor) |
| X4c | 4096 | 4 GB (anchor; expected to spill again) |
| X35c, X3c | 4096 | 3.5, 3 GB |
| M4c, M35c | 3072 | 4, 3.5 GB |

**Predictions, written before any run:** X4c spills again. X3c doesn't spill, reads 32K at least 30% faster than F4c,
and writes within 10% of it. M4c doesn't spill and reads 32K 15 to 30% faster than F4c.

**What decides:** Addendum 20's two rules, over rows with no failed run on any prompt. A row that spills on any run
can't win. If two rows are within 3% on what decides, the one with the lower shared-memory rise wins, so more RAM
stays free. The winning step and size become Calibrate's coding pick on 16 GB cards. Calibrate's own step-down stays
1 GB until this run says whether 0.5 GB steps matter.

**Addendum 21 withdrawn (Nov 17, before any run):** its premise was a spill, and the "spill" turned out to be the
engine's own staging buffer (below). It was never run.

## Addendum 22 (Nov 17, after the bigger-caches results, before this run): the cache sweep at step 4096

The engine logs show that what Addendum 20's rule called a spill is the engine's own pinned staging buffer in RAM
("CUDA_Host compute buffer"), -ub / 8 MiB: 64 at Normal, 256 at 2048, 512 at 4096. That matches the measured rises
less a fixed 80 MB, at every cache size. The runner now takes that buffer off before judging when the plan sets
`spillMinusStep`, and Bob's Calibrate judges each try against the same step without a cache.

The owner asked how speed changes as the cache shrinks from 4 GB to 3 GB at step 4096. `speed-plans/calibrate-sweep.json`:
the same brain, engine, settings and prompts as Addendum 20. As the owner set it before the run: 15 rows. Step 4096 at
4096 down to 3584 MB in 128 MB steps (X4096 to X3584, 5 rows); steps 5120 and 6144 at 4096, 3584, 3072, 2560 and 2048 MB
(S5k4096 to S5k2048 and S6k4096 to S6k2048, 10 rows: Addendum 20 never kept a 5120 or 6144 run with more than 2 GB), **1 round**
(15 loads; the owner: "1 round for preliminary analysis, and we cut anything if it breaks"). A setup that fails to
load or fails its run is cut, not stepped down. With 1 round this is reported as preliminary, not final. A finer pass, or 5 rounds around the knee, follows if the shape calls for it.

**Predictions, written before any run:** the cache hit rate falls slowly (less than 1.5 points from 4096 to 3584 at step 4096).
Writing at 32K falls less than 2% from X4096 to X3584, and reading doesn't change by more than 3%. No row is judged a
spill once the staging buffer is taken off. Step 5120 with 4 GB reads 32K 5 to 15% faster than X4096 and writes
within 5% of it. Steps 5120 and 6144 write faster with a bigger cache (2048 MB slowest), and at 4 GB each writes at least
10% faster at 32K than the same step did at 2 GB in Addendum 20.

**What it decides:** nothing is changed by itself. If a smaller size stays within 2% of X4096 on writing at every
prompt, it is noted as freeing card room at no cost (Calibrate's coding pick stays at 4 GB unless the owner says
otherwise).

## Addendum 23 (Nov 17, after the 1-round sweep, before this run): the shortlist

The 1-round sweep (Addendum 22) ran all 15 setups with none failed, but the five step-4096 rows ran while the
Claude app was open on the test PC (0.6 to 1.6 GB of RAM free, against 2.3 to 2.9 GB for the rest), so they aren't
compared with the others. `speed-plans/calibrate-shortlist.json`: the same settings and prompts, 6 setups: step 4096
at 4096 and 3840 MB, step 5120 at 3072 and 3584 MB, step 6144 at 3584, 4096, 5120 and 6144 MB (the owner asked for caches over 4 GB at step 6144). **3 rounds** (24 loads),
interleaved, with the Claude app closed on the test PC.

**Predictions, written before any run:** step 6144 reads 32K at least 10% faster than step 4096 at 4096 MB. Step 4096
at 4096 MB writes 32K at least 5% faster than every step-5120 and step-6144 setup. No setup is judged a spill. Step 6144 at 5120 and 6144 MB writes no faster than at 4096 MB (as at steps 2048 and 4096 this morning).

**Cut down before any run (the owner's two favourites):** only step 4096 at 4096 MB and step 6144 at 3584 MB, **5 rounds**
(10 loads), interleaved, with the Claude app and Bob closed. The predictions above that name these two still stand;
the others fall away with their rows.

**What it decides:** nothing by itself. Calibrate's coding pick moves off step 4096 with 4 GB only if a setup reads
32K faster and writes within 10% of the fastest writer on every prompt, the same rule Calibrate uses.

**Throttle count (changed before this run).** In the sweep, all 128 flagged card samples, and all 438 from the bigger
run, were the power cap alone, at a median 152 W of a 300 W limit, with clocks 0.2% under normal. From this run on, a
power-cap-only sample counts as throttled only when its clock is more than 3% under the run's busy, unflagged median.
Any other reason (heat, hardware slowdown, power brake) always counts. Earlier tables keep their old counts.

## Addendum 24 (Nov 17, before any run): how little cache reading needs

For the Speed thread's planned read/write switch (the reading work area borrows the hot-experts cache's card memory
while reading a prompt), the owner asked whether reading should drop the cache completely or keep a little. No run so
far has a big reading step with no cache. `speed-plans/read-cache.json`: step 6144 with the copy cache at 0, 512, 1024
and 2048 MB, the same prompts, **1 round** (4 loads), preliminary.

**Predictions, written before any run:** reading at 16K and 32K is fastest at 0 or 512 MB and within 5% across all
four. Writing falls as the cache shrinks, slowest at 0.

**What it decides:** nothing by itself. It sets the starting values Calibrate tries for the amount kept.

## Addendum 25 (Nov 17, before any run): lending the cache to reading

Brain Engine 13 (pre-release brain-engine-13b12359, patch 0022) can lend the hot-experts cache's card memory to the
reading work area while a big prompt is read, then fill the cache again by ranking when writing starts. It is off
unless `LLAMA_MOE_CACHE_LEND` is set (over 32 and under `-ub`, with `-b` at least `-ub`).

Plan `lend-cache.json`, 3 rounds, prompts start and 32K, answers saved:

- **L1**: step 6144, 4 GB copy cache, `LLAMA_MOE_CACHE_LEND=4096`.
- **L0**: the same without lending. If it fails to load, that is recorded as the reason lending exists.
- **X4096** (step 4096 + 4 GB) and **S6k3584** (step 6144 + 3.5 GB): today's picks, as baselines.

Each L1 engine log is searched for "MoE cache lent in" and "uploaded again in" (the switch times), and for
"while taking back the MoE cache" or decode -2 (the card's memory pool grew too much for the cache to come back).

**Predictions, written before any run:** L1 reads 32K within 3% of S6k3584 and writes within 3% of X4096. The
refill costs 0.2 to 0.4 s before the first word. L1's words match a step-6144 run. No take-back failures.

**What it decides:** whether lending becomes a Calibrate row on the Brains page. It stays off by default until it
beats both picks on the owner's card.

## Addendum 26 (Nov 17, before any run): the slower first short read, and reading with little cache

Brain Engine 12 read the start prompt with the 4 GB cache in 1737 t/s, against 2180 to 2209 on Brain Engine 10. Its
placement, cache and copies were identical, and 32K reading did not change. The engine thread finds no code path that
differs with the trace off, and suspects Windows' file cache: the first read after a load is the first time every
expert kept in RAM is touched.

Plan `first-read.json`: F4c on Brain Engine 10 and on Brain Engine 12, start prompt only, 3 rounds, run back to back
in shuffled order, so both engines see the same PC. It is followed in the same launch by `read-cache.json`
(Addendum 24), with its engine pointed at Brain Engine 13 with lending off.

**Predictions, written before any run:** the two engines read within 3% of each other, so the gap is the PC, not the
engine. Round 1 is the slowest for both.

**What it decides:** whether the engine thread looks for a cause in 0021, or the gap is put down to the PC.

## Addendum 27 (Nov 17, before any run): refilling the lent cache behind the writing

Brain Engine 14 (pre-release brain-engine-14b12359, patch 0023) refills the lent cache on a second stream while the
brain writes, and uses it again from written token K on (`LLAMA_MOE_CACHE_LEND_BEHIND=K`, together with
`LLAMA_MOE_CACHE_LEND=4096`). Plan `lend-behind.json`, 3 rounds, start and 32K, answers saved. Rows: S6k0 (step 6144, no cache: confirms Addendum 24), L1 (lending with
no refill behind), B8, B24 and B64 (K = 8, 24, 64), and S6k3584 as the reference. The engine logs are searched for
"uploaded again behind the writing in", "waited ... ms for the refill", "no second stream", take-back failures and
decode -2.

**Predictions, written before any run:** B24's and B64's 32K first word is within 2% of S6k3584's, with 0 ms waited.
B8 waits for part of the refill. Writing at 32K is at or above L1's for every B row. Each K writes the same words every
round.

**What it decides:** whether a B row replaces S6k3584 as the long-document setup in Calibrate's tries. It stays off
by default.

## Addendum 28 (Nov 17, before any run): a head to head we can stand behind publicly

The owner wants speed claims for Brain Engine that hold up in public: plain llama.cpp against Brain Engine, two
brains, two computers. Every run uses the same llama.cpp build (b12359) for both engines, the same brain file, the
same base flags (Bob's: flash attention, q8_0 KV, --fit, 48K context), 5 rounds in shuffled order, answers saved, and
Claude and Bob closed. A claim compares the best plain row with the best Brain Engine row, and the words must match where
the settings allow.

**Run 1, the PC (16 GB card), stock Qwen3.6 35B A3B:** plan `public-h2h-qwen35.json`.

- P0: plain llama.cpp with its default reading step, which is what a llama.cpp user gets.
- P4 and P6: plain llama.cpp at steps 4096 and 6144, which are Bob's tuned reading steps. llama.cpp's own default is `-b 2048 -ub 512`, which is P0.
- E4: Brain Engine 14 at step 4096 with nothing new on. It should equal P4, because the patches cost nothing when off.
- F4c, X4096 and S6k3584: Brain Engine 14's chat pick, work pick and step 6144 + 3.5 GB, with the hot-experts cache.

This plan is 7 rows and 35 loads. It supports two different claims. "Bob's settings against llama.cpp's defaults" compares the best row with P0, and credits the setting, not the engine. "Brain Engine against llama.cpp" compares each cache row with the plain row at the same step: X4096 with P4, and S6k3584 with P6.

**Run 2, the PC, a second brain from another model family:** the same rows on a second mixture-of-experts brain. The
owner picks it. The cache sizes are set from that brain's expert size, and the plan is written once it is chosen.

**Run 3, the laptop (6 GB card):** first P0 against Brain Engine on Qwen3 4B, which fits the card whole, as the
cost-of-patches check. Then a ladder of bigger mixture-of-experts brains with the cache at 1 and 2 GB, as far as the
laptop's RAM allows, to find the biggest brain over 6 GB that writes at a usable speed (at least 10 tokens/s). This is
unproven in our lab, as we have yet to test it.

**Predictions, written before any run:** E4 is within 1% of P4. X4096 writes at least 15% faster than P4 at every
length. On the laptop, a brain over 6 GB with the cache writes faster than the same brain on plain llama.cpp.

**What it decides:** which claims go in the README and Help. Each claim names the card, the brain, the setting and the
rounds.

## Addendum 29 (Nov 17, before any run): context sizes

The owner asked for runs at different context sizes. Plan `context-sizes.json`, Brain Engine 14, 1 round (preliminary).
Three setups at step 6144: S6k0 (no cache), L1 (4 GB cache, lending on) and S6k3584. Each runs at four context
sizes, `-c` 49152, 73728, 139264 and 262144, on the start prompt plus a prompt that nearly fills that context: 32K,
60K, 120K and 248K tokens. That is 12 loads. Qwen3.6 is native 256K, so YaRN is not used.

The long text is only about 37K tokens, so the runner gains `promptRepeat`, which lays a prompt file end to end N
times (2, 4 and 8 here) before the cut. A repeated text reads at the same speed as a fresh one, because the prompt cache
is off and every token is attended to. The answers are less meaningful, so this plan judges speed, not words. The load
timeout is raised to 15 minutes.

**Predictions, written before any run:** all 12 load. Reading speed falls as the prompt grows, by at least a third
from 32K to 248K. S6k0 stays the fastest reader at every size. At 256K, --fit moves layers to RAM for the cached
rows, and S6k3584 writes no faster than S6k0 there. Free RAM stays above 1 GB.

**What it decides:** how Calibrate sizes the cache by context at load, and whether a cached setup is worth it at 128K
and 256K.

## Addendum 30 (Nov 17, before any run): whole layers in the cache while reading

Brain Engine 15 (pre-release brain-engine-15b12359, patch 0024). During a read chunk bigger than N tokens
(`LLAMA_MOE_CACHE_READ_LAYERS=N`), it fills the cache's banks with about 7 whole layers' experts, so those layers read
from the card. It puts the hot experts back before writing. The switch is per chunk, so `-b` is set above N. Plan
`read-layout.json`, 3 rounds, start and 32K, answers saved. Rows: X4096 (baseline), R1 (`-b 8192 -ub 4096`, 4 GB,
N = 4096), R0 (the same with N unset, to separate `-b 8192` from the layout), and S6k0 (no cache) as the reference. The
engine logs are searched for "read layout:" (about 7 layers, and the time it took), "hot experts back after the read
layout", and any abort with "selected in the same split as their MoE cache lookup".

**Predictions, written before any run:** R1 reads 32K at least 10% faster than R0, and its first word is at least 0.5 s
sooner. R1 writes within 2% of R0. On start, R1 does not switch and gives R0's words. No aborts. The engine thread
warns the gain may be small: it uploads about the same bytes as reading through the cache.

**What it decides:** whether the read layout goes into Calibrate's tries for long prompts. It stays off by default.

## Addendum 31 (Nov 17, before any run): the read layout through the context sizes

The owner asked to try the read layout (Addendum 30) on their favourite setup, step 4096 + 4 GB, at every context
size. Plan `read-layout-contexts.json`, Brain Engine 15, 1 round, 12 loads. X4096, R0 (`-b 8192 -ub 4096`, 4 GB) and R1
(R0 with `LLAMA_MOE_CACHE_READ_LAYERS=4096`) each run at `-c` 49152, 73728, 139264 and 262144, on the start prompt
plus the 32K, 60K, 120K and 248K prompts of Addendum 29. Answers are compared only within one context size.

**Predictions, written before any run:** R1 reads faster than R0 at every size, by at least 10% at 32K and 64K. R1 writes
within 2% of R0. The 128K and 256K rows spill less than step 6144 did (a smaller reading step), but may still spill.

**What it decides:** whether the read layout is worth a place in Calibrate's tries, and at which context sizes.

## Addendum 32 (Nov 17, before any run): our speed settings on GPT-OSS 120B

The owner asked whether the settings that won on Qwen3.6 35B also work on GPT-OSS 120B (MXFP4, 63.4 GB). The brain is
bigger than npc's 32 GB of RAM, so part of it is read from disk while writing. Plan `gptoss120b-settings.json`, Brain
Engine 15, the 2K prompt of Addendum 17, 300 words written, 3 rounds, 6 rows, 18 loads. Disk reads are logged.

- **B0:** the Nov 10 best, `-b 2048 -ub 2048 --n-cpu-moe 28` (17.4 writing, about 30 reading then, on plain llama.cpp).
- **N0:** Bob's normal settings with `--fit on`.
- **F0 / X0:** `--fit on` with reading steps 2048 and 4096.
- **F2c / F4c:** F0 with a 2 GB or 4 GB hot-experts copy cache (`--moe-cache-cpu-share 0`).

**Predictions, written before any run:** B0 writes fastest or within 5% of the fastest. F0 reads at least 1.5x faster than
N0. X0 spills or loses writing to F0. The copy cache does not help writing here (on Nov 10, caches of 2 to 8 GB wrote about
3x slower with 36 layers' experts on the processor), because the 120B's picks change too much per word for 4 GB to hold.

**What it decides:** which settings Calibrate tries first for brains bigger than RAM, and whether the copy cache is
offered for them at all.

## Addendum 33 (Nov 18, before any run): smaller cache types, and what every setting costs in answers

The owner asked two things on Nov 18: try smaller cache types for long contexts, and run perplexity tests against all the
best settings. Every run so far used a q8_0 cache for keys and values (live Bob too). Brain Engine 15 offers f32, f16,
bf16, f8_e4m3, q8_0, q5_1, q5_0, q4_1, iq4_nl and q4_0; there is no q3 cache type without new engine code.

**Speed:** plan `cache-types-contexts.json`, Brain Engine 15, 1 round, 36 loads. 4x4 (`-b 4096 -ub 4096`, 4 GB copy cache)
and 6x3.5 (`-b 6144 -ub 6144`, 3.5 GB) each with q8_0, f8_e4m3, q5_1, iq4_nl, q4_0, and keys q8_0 with values q4_0, at
`-c` 73728, 139264 and 262144 on the start prompt plus the 60K, 120K and 248K prompts of Addendum 29.

**Answers:** `model-lab/perplexity-grid.mjs` with plan `perplexity-grid.json` and Brain Engine 15's `llama-perplexity`,
on the same `long-text.md`. Each group scores the text once with its base settings and saves every word's odds, then
scores it once per row and reports the KL divergence from the base, how often the top word matches, and the perplexity.
- **settings** (`-c 8192`, 2 chunks): base = plain `-b 2048 -ub 512` with an f16 cache. Rows: Bob normal (q8_0), steps
  2048 and 4096, F4c, 4x4, 6x3.5 and the read layout (R1), all with q8_0.
- **cache-types** (`-c 16384`, 1 chunk; the tool needs twice the context in tokens and the text holds about 37K):
  base = 4x4 with an f16 cache. Rows: 4x4 with each cache type above, plus q4_1 and keys q8_0 with values iq4_nl.

**Predictions, written before any run:** q8_0 and f8_e4m3 caches stay within a KL divergence of 0.005 of f16; q4_0 and
iq4_nl land between 0.01 and 0.05, with iq4_nl at or below q4_0; keys q8_0 with values q4_0 lands nearer q8_0 than q4_0.
q4 caches stop or shrink the 128K and 256K spills (Addendum 29) and read faster there than q8_0. The speed settings
(steps, caches, read layout) all differ from the plain base by less than q8_0's cache does, since they change only the
order of sums.

**What it decides:** whether Calibrate offers a smaller cache type for long contexts, which one, and from which size up;
and a measured answer to "do our speed settings change the answers", in place of the single-prompt word comparisons.
The 120B full against the soft cut is left out: changing the soft cut needs the owner's double-click on the test PC.

## Addendum 34 (Nov 18, before any run): the 120B soft cut against the full brain, in answers

The owner (Nov 18): "The soft cut absolutely needs perplexity testing." On Nov 17 the soft cut (41 of 128 experts per
layer switched on in the file, by router bias; the keep list picked for the 38B cut) made GPT-OSS 120B usable on the test
PC, and its first tool job failed with a garbled call. Plan `perplexity-120b-softcut.json`, Brain Engine 15's
`llama-perplexity`, `long-text.md`, `-c 8192`, 2 chunks, `--fit on -b 4096 -ub 4096`, q8_0 cache. It runs in two phases,
because only the owner switches the cut: `--phase base` with the cut off (the full brain's odds are saved), then the
owner switches the cut on, then `--phase rows` (the cut brain is compared with them).

**Predictions, written before any run:** the cut raises perplexity by 3% to 10% over the full brain, with a mean KL
divergence between 0.05 and 0.25 and the same top word 80% to 90% of the time. That is more than any speed setting or
cache type in Addendum 33. (The Nov 12 REAP quiz put this keep list at 192 of 204 of the full brain's score.)

**What it decides:** whether the soft cut is only a speed tool for trying the 120B at home or good enough to use, and
whether the keep list should be re-picked from GPT-OSS's own tool-job traces before anyone judges its tool use.

## Addendum 35 (Nov 18, during the Addendum 33 run): a bigger --fit margin at big contexts

Addendum 33's speed run, part way: the spill into shared memory is the same whatever the cache type (4x4: about 0.8 GB at
64K, 1.3 GB at 128K, 2.3 GB at 256K, with q8_0, f8_e4m3, q5_1, q4_0 and q8_0/q4_0 alike). So a smaller cache does not
stop the spill under `--fit`. The likely reason: `--fit` spends whatever a smaller cache frees on more of the brain, and
what overflows is working memory that grows with the context, which `--fit`'s margin does not cover. iq4_nl timed out
on every load (no fast attention path for it on this card, by the look of it) and is dropped.

Plan `fit-margin-contexts.json`, Brain Engine 15, 1 round, 18 loads: 4x4 and 6x3.5 with q8_0 and q4_0 caches and
`--fit-target` 2048 and 3072 MiB at 128K and 256K, plus 4096 MiB with q4_0 at 256K. Before it runs, the engine's own
help is checked for the flag's name; if it differs, the plan is corrected before any load.

**Predictions, written before any run:** a margin of 2048 MiB stops the spill at 128K and a margin of 3072 MiB stops it
at 256K. With no spill, q4_0 leaves more of the brain on the card than q8_0 at the same margin and writes at least 5%
faster than q8_0 at 256K. Reading changes by less than 5% between margins.

**What it decides:** the margin Calibrate sets by context size, and whether a q4 cache earns its place once the margin
stops the spill.

## Addendum 36 (Nov 18, before any run): the goldilocks reading step, with room on the card

The owner (Nov 18): if the bigger `--fit` margin opens room and helps writing, try bigger reading steps, or find the
goldilocks zone. Plan `step-sweep-q4.json`, Brain Engine 15, 1 round, 10 loads: steps (`-b` = `-ub`) 4096, 5120, 6144,
7168 and 8192, each with a q4_0 cache and a 3.5 GB copy cache, at 128K and 256K. The margin is filled in when it runs
(`--var FIT_MARGIN=...`) with the smallest `--fit-target` that ran with no spill in Addendum 35. It runs only if one did.

**Predictions, written before any run:** reading gets faster with each step up to 6144 and by less than 5% after that;
writing falls as the step grows, because the bigger working memory pushes brain layers off the card; the best step
for the time to the first word is 6144 at both sizes.

**What it decides:** the reading step Calibrate sets for long contexts.

**Change before the run (Nov 18, after Addendum 35's results):** no margin stopped the rise. All 18 loads rose
by the same amount (about 1.3 GB at 128K, 2.3 GB or 3.3 to 3.4 GB at 256K), whatever the margin or cache type, while
--fit left the free room it was asked to leave. So the rise is not the card overflowing. It is more likely a buffer
on the computer's side that Windows counts as shared graphics memory. This is unproven in our lab, as we have yet to
test it. Bigger margins only pushed layers off the card and cut writing. The sweep still runs, because the step
question stands on its own. It uses `FIT_MARGIN=2048`, which matched the default 1024 in Addendum 35. The rise is
recorded but does not decide anything. The predictions above stand unchanged.

**Change before the run (Nov 18):** two rows are added, `-b 8192 -ub 4096` at 128K and 256K. Two outside videos the owner
sent found that pair beat 2048/512 when experts sit in RAM. That makes 12 loads.

## Addendum 37 (Nov 18, before any run): MTP (Turbo) with bigger reading steps

The same videos found that guessing ahead (MTP) sped up writing a lot but slowed reading, and that it paid off only
with bigger reading steps, best at 3 ahead. Our Turbo test (Nov 17) used Bob's old step of 2048/512, where it came
out at -17% to +3%. Plan `mtp-big-steps.json`, Brain Engine 15, the MTP copy of the brain (`${BRAIN_MTP}`), 1 round,
9 loads: MTP off, 2 ahead and 3 ahead, at steps 2048/512, 4096/4096 and 8192/4096. Every load uses a q4_0 cache,
a 3.5 GB copy cache and `--fit-target 2048`, a 128K window, and the short, 32K and 120K prompts. Rows on this file are
compared only with each other, because the MTP copy is a different file.

**Predictions, written before any run:** MTP still slows reading at every step, by 10 to 20%. With the bigger steps,
3 ahead writes at least 10% faster than off on the short prompt. On the 120K prompt it writes no faster, because
the cache reads take most of the time there. MTP changes the words at temperature 0, as before.

**What it decides:** whether Turbo is offered for this brain on a 16 GB card, and at which step. The rule from the
Nov 17 test still holds: offer it only if it writes at least 10% faster with Bob's sampling.

**Result (Nov 18, 1:32 to 1:58 PM, 9 loads):** MTP sped up writing by 17 to 26% (32K: 64.7 to 76.0 at 4096/4096; 120K
at 2048/512: 59.2 to 74.6), slowed reading by 13 to 15% and added 6 to 8 s to the 120K first word. 2 ahead accepted
0.65 to 0.78 of its guesses on real text, 3 ahead 0.5 to 0.65, and 2 ahead was faster in every row but one. Every MTP
row at `-ub 4096` had a real spill: the shared rise was 2,488 MB, 1,272 MB past the pinned step buffer. The MTP head's
own memory isn't counted by `--fit`. So those rows read low. The off rows didn't spill. Against the predictions:
reading slowed as predicted, and writing at 120K did gain (predicted not to).

**Rerun before deciding (written before it runs):** plan `mtp-big-steps-room.json`, 6 loads: the same rows at
4096/4096 and 8192/4096 with a 2 GB copy cache instead of 3.5 GB (1.5 GB more room than the spill needed), MTP off,
2 and 3 ahead. Prediction: no spill; 2 ahead writes at least 15% faster than off at 32K and 120K; reading still
13 to 15% slower.

**Rerun result (Nov 18, 3:55 to 4:06 PM test-PC time, 6 of 6 loads):** the "spill" was not card overflow either. `--fit`
left 2.1 to 2.2 GB free on the card, and the engine log shows the MTP head's own context making a second pinned
buffer (1,152 MiB beside the main 1,216 MiB at 128K step 4096). That accounts for the 1.27 to 1.30 GB rise, so the
first run's "real spill" was this buffer too (the runner now adds it; `GGML_CUDA_NO_PINNED=1` should clear it). With
the 2 GB copy cache, MTP rows kept 34 expert layers in RAM against 29 without MTP. Writing at 32K: 64 to 65 with MTP
against 66 to 70 without; reading 15% slower. The one clear gain was 3 ahead at 120K, step 8192 (70.6 against 51.6),
where writing swings a lot between runs. Predictions: the no-spill one held (once the second buffer is counted), the
15% writing gain did not. MTP doesn't pay at big steps on this card.

## Addendum 38 (Nov 18, before any run): does a 4-bit context cache still find a needle?

The owner (Nov 18): one outside test puts a 4-bit context cache at 8 to 12% worse perplexity, with needle-in-a-haystack
recall still passing. Our perplexity grid (Addendum 33) gives the first number for this brain; this plan gives the
second. Plan `needle-q4-vs-q8.json`, Brain Engine 15, 4x4 settings, 1 round, 5 loads: the f16 cache at 128K (the
reference), then q8_0 and q4_0 at 128K and at 256K. Each load reads the long text five times, each time with one
made-up pass code hidden at 10, 30, 50, 70 or 90% of the way in, and asks for that code (40 words at most). The runner
checks the answer for the code (`placeNeedle` and `needles` in `speed-test.mjs`, tested with fakes). The codes do not
occur in the text.

**Predictions, written before any run:** f16 and q8_0 find all 5 at 128K. q4_0 finds at least 4 of 5 at 128K and at
256K. Any miss is at 256K and in the middle depths (30 to 70%).

**What it decides:** with Addendum 33's KL divergence, whether q4_0 can be Calibrate's long-context pick. Rule: it
can only if it finds as many needles as q8_0 at the same size.

## Addendum 39 (Nov 18, before any run): the context cache kept in RAM

A lever from the same outside video: keep the context cache in system RAM, so the card keeps more brain layers.
llama.cpp already has the whole-cache form of this (`-nkvo`: the cache and its attention stay on the processor). The
paged form (only recent pages on the card) would need an engine change and is scoped separately. Plan
`kv-in-ram.json`, Brain Engine 15, 1 round, 6 loads: 4x4 and 6x3.5, each with a q4_0 cache at 128K and 256K and a
q8_0 cache at 256K, all with `-nkvo`. Compare with the same settings in Addenda 33 and 35 (cache on the card).

**Predictions, written before any run:** this brain keeps a growing cache in only some of its layers, so its cache
is small (about 1.4 GB at 128K with q8_0) and moving it frees little. Writing gets slower at every size, by 20% or
more at 256K, because attention over the whole context runs on the processor. Reading gets slower too. The shared
memory rise does not shrink.

**What it decides:** whether `-nkvo` is offered in Calibrate for this brain (rule: only if it writes faster than the
same setting with the cache on the card), and whether the paged version is worth building.

**Result (Nov 18, 2:49 to 2:51 PM):** all 6 loads failed at warm-up. The engine stopped with "the experts of layer 13
are selected in the same split as their MoE cache lookup" (llama-moe-cache.cpp:964): `-nkvo` adds graph splits
(300 / 264) and the copy cache's split check trips. So `-nkvo` and the copy cache don't work together on Brain Engine 15
(sent to the builder). Before the stop, `--fit` had put the freed room into experts (29 layers' experts in RAM at 128K
against 31 with the cache on the card).

**Rerun before deciding (written before it runs):** plan `kv-in-ram-nocache.json`, 4 loads, no copy cache, step 4096,
q4_0 cache, the cache on the card vs in RAM, at 128K and 256K. The predictions above stand.

**Rerun result (Nov 18, 4:07 to 4:17 PM test-PC time, 4 of 4 loads, no aborts):** the predictions held, and the
writing loss was far bigger than 20%. 128K, card against RAM: first word 40.6 against 43.3 s, reading 3,034 against
2,845, writing 55.7 against 15.1 (-73%). 256K: 133.9 against 138.3 s, 1,899 against 1,839, writing 39.0 against 9.5
(-76%). Moving the cache freed only 2 to 3 expert layers' room, and the rise did not shrink. `-nkvo` is dropped.
Also seen: without the copy cache, only 22 to 26 expert layers sit in RAM (31 to 35 with the 4 GB cache), and the
first word is faster (128K 40.6 s against about 48 s; 256K 133.9 against about 150 s), while writing is lower
(55.7 against about 58 at 128K; 39.0 against about 45 at 256K). So at long contexts the copy cache trades reading for
writing.

## Addendum 40 (Nov 18, before any run): what the 128K and 256K "spill" is

The owner (Nov 18): stop the spill, and find its cause first. Addendum 35 showed that the rise in shared graphics
memory does not depend on the `--fit` margin or the cache type, and the card kept the free room it was asked for.
The rises measured so far: about 1.3 GB at 128K with `-ub 4096`, 2.26 GB at 256K with `-ub 4096`, and 3.34 to 3.44 GB
at 256K with `-ub 6144`.

**The suspect:** the attention mask. For each reading step the engine builds a table of which earlier words each new
word may look at: one f16 number per word in the context per word in the step. That is context × `-ub` × 2 bytes:
1,088 MiB at 128K with 4096, 2,048 MiB at 256K with 4096, and 3,072 MiB at 256K with 6144. It is made in pinned
(page-locked) RAM, which Windows counts as shared graphics memory, and copied to the card for every step. Those sizes
plus the engine's known staging buffer (about 500 MB) match all three rises within about 0.3 GB. So the "spill" would
be pinned RAM by design, not the card running out. It would cost reading time (the copy), not writing time.

**The test:** plan `spill-cause.json`, Brain Engine 15, 4x4 copy cache, q4_0 cache, `-b 4096`, 1 round, 5 loads:
`-ub` 1024 and 2048 at 128K, and 512, 1024 and 2048 at 256K. The spill check counts the whole rise here
(`spillMinusStep` off). The engine logs' buffer lines (`CUDA_Host compute buffer`, `CUDA0 compute buffer`, KV buffer)
are read for every load, including the loads already run in Addenda 33, 35 and 36.

**The ladder (added before any run, the owner asked whether one of our settings, or several together, cause it):**
8 more loads run first. From plain settings (`-b 2048 -ub 512`, f16 cache, `--fit` on), one of ours is added at a time:
q8_0 cache, q4_0 cache, step 4096/4096, the 4 GB copy cache, the read layout. All at 256K, and the plain and step-4096
rungs at 128K too. 13 loads in all.

**Predictions, written before any run:** on the ladder, the rise stays small (under 0.5 GB) until the step goes to
`-ub 4096`, jumps there by about 1.8 GB at 256K, and does not grow again with the copy cache or the read layout. The
cache type changes nothing. So no two settings fight; one setting (the big step) causes it alone. After that, the
rise is within 0.3 GB of context × `-ub` × 2 bytes plus the staging
buffer, so it halves each time `-ub` halves. At 256K, `-ub 1024` rises under 1 GB and `-ub 512` under 0.6 GB.
Writing speed stays the same at every `-ub`. Reading gets slower as `-ub` shrinks.

**What it decides:** if the prediction holds, the fix is a reading step that shrinks as the context grows (Calibrate
picks the biggest `-ub` whose mask fits a set amount of pinned RAM), and the spill check stops counting the mask as a
spill. An engine change that builds the mask on the card would remove it altogether; that is scoped separately. If
the prediction fails, the logs' buffer lines say where to look next.

**Found before the run (Nov 18, from the engine logs the runner keeps, every load from 32K to 256K):** the engine's
`CUDA_Host compute buffer` is context × `-ub` × 2 bytes plus about `-ub` / 32 MiB in every load (512 MiB at 32K,
1,216 at 128K and 2,176 at 256K with `-ub 4096`; 1,824 at 128K and 3,264 to 3,360 at 256K with 6144). The shared
rise is that buffer plus about 80 MB in every load. Nothing else tracks it: the card's model, cache and work buffers
move with the margin and the cache type, and the rise does not. So the cause is the attention mask in pinned RAM,
from one setting (the reading step) times the context. No card memory went to RAM, and the speeds measured in Addenda
33, 35 and 36 are real speeds. The runner's spill check now takes off the buffer the engine printed
(`pinnedStepMB`), not `-ub` / 8.

**So the plan narrows** to what the buffer costs and how to avoid it, 7 loads: plain settings at 256K (does plain
llama.cpp make it too?), then the 4x4 copy cache with a q4_0 cache at `-ub` 512, 1024, 2048 and 4096 at 256K (and 2048
at 128K), and 4096 at 256K with pinning switched off (`GGML_CUDA_NO_PINNED=1`, a llama.cpp switch: the buffer is then
ordinary RAM, which Windows does not count as shared).

**Predictions for the narrowed plan, written before it runs:** plain settings rise about 0.3 GB at 256K (`-ub 512`).
Pinning off removes the rise (under 0.2 GB) and slows reading by under 5%, with writing the same. Each halving of
`-ub` halves the rise and slows reading by 10 to 25%.

## Addendum 41 (Nov 18, before any run): smaller --fit margins

With the "spill" known to be the pinned step buffer (Addendum 40), the card always kept the free room `--fit` was
asked to leave. The owner (Nov 18): can the margin go the other way? Plan `fit-small-margin.json`, Brain Engine 15,
1 round, 11 loads: 4x4 with a q4_0 cache at 32K, 128K and 256K with `--fit-target` 1024 (the default), 512 and 256,
and 6x3.5 with a q4_0 cache at 256K with 512 and 256. The spill check takes off the buffer the engine printed, so a
real overflow (card memory going to RAM) still fails the run.

**Predictions, written before any run:** each 512 MB freed puts about one more layer's experts on the card (about 0.55
GB each in this brain) and writes 2 to 5% faster. Margin 256 has no real overflow at 32K or 128K. At 256K it may,
because the work buffers grow during the run. Reading is about the same.

**What it decides:** Calibrate's margin per context size: the smallest one that runs with no real overflow at that
size, plus a safety step chosen from what the run shows.

**Result (Nov 18, 12:36 to 1:07 PM, 7 loads):** the prediction held. At 256K: plain settings (`-ub 512`) rose 348 MB
with a 272 MiB buffer; `-ub` 512 / 1024 / 2048 / 4096 rose 353 / 623 / 1,168 / 2,257 MB, each the printed buffer plus
about 80 MB. First word 401 / 256 / 190 / 153 s, writing 43.5 to 44.6 at every step. With `GGML_CUDA_NO_PINNED=1` at
`-ub 4096` the rise was 76 MB at the same speed (154.1 s, read 1,650, write 45.1 against 152.7 s, 1,666, 43.7), the same
placement (35 layers' experts in RAM), and a card peak of 14,952 MB. The runner's check missed the buffer line in this
run because the engine prints two spaces after `CUDA_Host`; fixed, with a test.

## Addendum 42 (Nov 18, before any run): the step buffer in ordinary RAM, at every size

One load says pinning off costs nothing at 256K. Before Bob turns it on for everyone, plan `unpinned-check.json`,
Brain Engine 15, 2 rounds, 16 loads: F4c (the chat pick, q8_0 cache) at 32K, and 4x4 with a q4_0 cache at 32K, 128K
and 256K, each with and without `GGML_CUDA_NO_PINNED=1`.

**Predictions, written before any run:** with pinning off, the rise is under 150 MB at every size. Reading, writing
and first word are within 3% of pinned at every size, including the short start prompt.

**What it decides:** if both hold, Bob's engine runs with `GGML_CUDA_NO_PINNED=1` on cards that use CUDA, as a
reliability fix (on by default): the RAM stays pageable and no false spill shows. If any size reads more than 3%
slower, Bob keeps pinning and only the spill checks subtract the buffer.

**Result (Nov 18, 14:52 to 15:16 test-PC time, 16 of 16 loads, 2 rounds):** both predictions held. The answers were
identical word for word, pinned against unpinned, on every row and both rounds. Every speed was within 2%. Rise,
pinned to unpinned: F4c 32K 336 to 73 MB; 4x4 q4_0 32K 593 to 75; 128K 1,297 to 76; 256K 2,256 to 75. Bob now starts
its engine with `GGML_CUDA_NO_PINNED=1` (src/engine-care.js `unpinnedEnv`); `llamacpp.pinnedSteps: true` turns it off.

## Addendum 43 (Nov 18, before any run): the attention mask made on the card (patch 0025, Brain Engine 16)

Patch 0025 (`LLAMA_KQ_MASK_BUILD=1`, off by default) sends each cache cell's position (about 1 MB at 256K) and the
card builds the same 0 / minus-infinity table from it with stock operations. On the processor, 32 of 32
combinations gave bit-identical odds (engine/ENGINE-MAP.md, section 0025). Plan `mask-on-card-be16.json`, Brain
Engine 16, 4 GB copy cache, q4_0 cache, 2 rounds, 20 loads: the switch off and on at `-ub 4096` at 32K, 128K and 256K,
and at `-ub 6144` at 128K and 256K. Every answer is kept, so the words can be compared. The engine log must say
"attention mask made from positions, on CUDA0" on every load with the switch on.

**Predictions, written before any run:** the words are identical with the switch off and on at every size. With it
on, the pinned `CUDA_Host compute` buffer drops to under 300 MiB at every size, and the shared rise with it (under
400 MB). The card's compute buffer stays within 250 MiB of the switch-off figure. Reading is the same or up to 5%
faster at 128K and 256K (no copy each step), and writing is within 3%.

**What it decides:** whether patch 0025 becomes Bob's default on CUDA cards, against `GGML_CUDA_NO_PINNED=1`
(Addendum 42), which removes the rise without an engine change. It needs the owner's go to run.

**Result (Nov 18, 3:17 to 3:54 PM test-PC time, 20 of 20 loads, 2 rounds):** the words held (identical on all 5 pairs,
both rounds) and every switch-on load logged the made-on-card line. The memory prediction failed: the pinned
`CUDA_Host compute` buffer and the shared rise were the same size with the switch on and off at every size (for example
2,176 MiB and 2,256 MB at 256K step 4096), and speed was within 2%. Patch 0025 is harmless but frees nothing as built;
`GGML_CUDA_NO_PINNED=1` (Addendum 42) stays Bob's fix.

## Addendum 52 (Nov 18, before any run): Addendum 44 moves to Brain Engine 18, with the made-mask switch added

Brain Engine 17 shipped for Linux only, so Addendum 44 runs on Brain Engine 18 (pre-release `brain-engine-18b12359`),
which carries patches 0026 (`LLAMA_KQ_MASK_POS=1`, no table), 0027 (`-nkvo` loads without the copy cache) and 0028
(the made mask from patch 0025, `LLAMA_KQ_MASK_BUILD=1`, now fires on Qwen 3.6 text instead of falling back to the
table). It is laid over the official b12359 CUDA 13.5 build. Plan `mask-pos-be18.json` (2 rounds, 36 loads) is
Addendum 44's plan on Brain Engine 18 plus one row per size at `-ub 4096` with `LLAMA_KQ_MASK_BUILD=1`.

Order: `mask-pos-check.exe` must print ALL PASS first, then the plan, then the busy-desktop pass (Addendum 45) with
2 rounds on Brain Engine 18.

**Predictions, written before any run:** Addendum 44's predictions hold for the POS rows. With BUILD on, the words are
identical to off, the reserve line shows more nodes and input tensors than off, and CUDA_Host compute at 256K
`-ub 4096` falls by at least 1.8 GB against off. CUDA0 compute falls with POS but not with BUILD (BUILD still makes a
table, on the card). Speed with BUILD is within 3% of off at every size.

## Addendum 80 (Nov 20, before any run): look-ahead, doorbell and stand-ins on Brain Engine 26

Patches 0041 (look-ahead: fetch the next layers' likely experts while writing, LLAMA_MOE_LOOKAHEAD), 0042 (doorbell: the card and the
processor work on different experts at once, LLAMA_MOE_DOORBELL, share > 0) and 0043 (stand-ins: a missing expert is replaced by a
near one already on the card, LLAMA_MOE_STANDIN, lossy, Turbo only) are in Brain Engines 25 and 26 but were never run.
`speed-plans/strata-tricks-be26.json`: 32K and 128K, step 4096, copy cache 4 GB, q4_0 memory, fixed placement (so the words can be
compared), start chat, code edit and a long read, 2 rounds, cool-down on: share 0 baseline; look-ahead 1 and 2; share 0.5 alone and with
the doorbell; share 1 + learn 16 alone and with the doorbell; stand-ins rank with at most 1 and 2 per word.
`perplexity-standins-be26.json`: KLD of stand-ins (and look-ahead 1 as a lossless check) against off at 16K x 2. Bars: look-ahead and
the doorbell must give the same words as their own baseline and at least +5% writing to be worth defaulting; stand-ins are judged on
speed against KLD, with no default. Written before the run: look-ahead +5-15% writing at share 0 (a third of each word is copies,
section 28) with the same words; the doorbell +10-20% at share 1 with learn 16 (the overlap ceiling was 22-26%, section 40) and less at
share 0.5; stand-ins +15-30% writing with KLD 0.02-0.06 against off.

## Addendum 79 (Nov 20, before any run): the conductor end to end

The owner asked when the conductor itself is tested (only its switch cost was, sections 37-38). `model-lab/conductor-e2e.mjs` with
`speed-plans/conductor-e2e-64k.json`: Qwen3.6 35B, 64K context, one fixed job (a 24,576-token file pasted as a new read with a question,
then 5 follow-ups each adding 200 tokens of the same text further on, every reply 300 words, temperature 0, seed 42), four ways, 5 rounds
round-robin, a fresh load each time, the Addendum 74 cool-down before every load and turn (its waits left out of the job time):
(a) Brain Engine 26, fixed step 2048; (b) fixed 4096; (c) the conductor as Bob plans this job (readBig): start at 2048, POST /context to
6144 before the big read (the chat is empty then, so nothing to save), then save, POST /context back to 2048, restore, before the
follow-ups; (d) stock llama.cpp b12359, its own defaults (step 2048 / 512, f16 memory), only the placement flags. All Brain Engine ways
use q4_0 memory and the same fixed placement. Read: total time to the last word, the big read's reading speed and first word, the
follow-ups' reading and writing speeds, each switch's seconds, and the same words or not (against (a); (d) may differ, its memory type
differs). Pass, written before the run: (c) at least as fast as the better of (a) and (b), with the same words as (a). Expected: the big
read takes about 15 s at 2048, 11 s at 4096 and 9 s at 6144 (section 37's 32K reads scaled); (c) saves 4-6 s against (a) and 1-2 s
against (b) after its ~1 s switch back; (d) is the slowest, by its 512 micro-step on reading.

## Addendum 78 (Nov 20, before any run): why the 3-bit memory's gap depends on the settings

At 128K, q3_0 wrote 2.9% slower than q4_0 in the kernel test (section 47: step 4096, copy cache 4 GB) but 16% slower in the Progressive
plans (sections 49 and 51: step 5120, copy cache 3.5 GB), on engines with patch 0044. `speed-plans/kv3-gap-128k.json`: q4_0 and q3_0 at
128K in both settings on Brain Engine 25, GGML_SCHED_TIMING=1, 2 rounds, cool-down on. Written before the run: the gap follows the
settings, not the engine. With the 3.5 GB cache, --fit places q3_0 (a smaller chat memory) differently, and more of each word goes to
copying experts; the timing lines' "weights copied" share will show it. If the gap is the same in both settings, the q3_0 attention kernel
is slower at step 5120, and that goes back to the engine side.

## Addendum 77 (Nov 20, before any run): Progressive 8+2, the 2-bit chat memory (q2_kv, patch 0046), Turbo only

The owner approved an 8+2 test: a 2-bit main cache (q2_kv; upstream's q2_0 is a brain-file type) with the newest 8,192 words at q8_0.
Brain Engine 27 first passes the setup checks (moe-round-check now expected to pass with its fixed reference). Plans:
`perplexity-8plus2-be27.json` (16K x 2, ring a quarter scale as in section 50: q4_0, q3_0, 8+3, 8+4, plain q2_kv, 8+2, and K q4_0 +
V q2_kv with the ring), `needle-8plus2-be27.json` (128K, the five depths of needle-progressive, for 8+2, the K4/V2 mix and plain q2_kv),
`speed-8plus2-be27.json` (32K/128K/256K, plain q2_kv, 8+2 and the mix beside q4_0 and q3_0, 2 rounds, Addendum 74 cool-down). Bars:
perplexity within 3% of f16's group reference q4_0 (3-5% needs a real-jobs check, over 5% fails), every needle found, writing within 5%
of q4_0. Prediction written before any test by the engine side: bob-wip/engine-speed/progressive-8plus2-prediction.md (fast and small,
likely failing the 3% bar and missing some deep needles). If 8+2 fails, the K q4_0 + V q2_kv mix is the follow-up, already in each plan.

## Addendum 76 (Nov 20, before any run): does reading at one setting and writing at another beat one setting

The owner asked whether flipping to the best reading settings for the read and the best writing settings for the reply would beat
one setting. Only the switch's cost was measured so far (sections 37-38: about 0.9 s at 32K, 2.4 s at 128K; read 14.7 / 10.4 / 8.5 s
at step 2048 / 4096 / 6144 at 32K, writing 78 / 78 / 75 t/s). `speed-plans/flip-read-write-32k.json` and `-128k.json` (switch-cost.mjs,
Brain Engine 25, fixed placement, q4_0 memory throughout, since a memory change forces a re-read; cool-down per Addendum 74), each 3
repeats: stay at the best reading step (6144 at 32K, 5120 at 128K); stay at 2048; read at the best step then flip to 2048; then flip to
2048 with the learning cache (share 1, learn 16, margin 1.5); and the learning cache alone. Every reply is 600 words. Job time = the read
+ the switch (left out for "stay" rows) + the reply's first word and writing. Written before the run: at 32K, flipping the step alone
loses about 0.5 s against staying at 6144 (writing gains about 0.3 s, the switch costs 0.9 s); flipping to the learning cache is about
even at 600 words (writing about 10% faster saves about 0.8 s) and pays only for longer replies; every flip beats staying at 2048 by
5 s or more. At 128K every flip loses 1-2 s against staying at 5120, since the switch costs 2.4 s. If so, the conductor should read at
the best reading step and keep it, and flip only for replies of over about 1,000 words.

## Addendum 75 (Nov 20, before any run): how much speed a smaller sharp ring gives back

On Brain Engine 26 (section 49), 8+3 wrote 18% slower than q3_0 at 32K and 8+4 13-21% slower than q4_0. Likely cause (the engine
side's arithmetic, unproven): each word reads the main cache outside the window plus the whole 8-bit ring (8,192 + 4,096 slack slots
at 34 bytes per 32), 1.5x plain q3_0's attention bytes at 32K, 1.13x at 128K. `speed-plans/progressive-ring-be26.json`: 8+3 and 8+4
with a q8_0 ring of 2,048 and 4,096 words at 32K and 128K, and 8+4 at 32K with slack 1,024, beside plain q3_0/q4_0, 2 rounds, with the
Addendum 74 cool-down. `perplexity-progressive-ring-be26.json`: the 16K x 2 accuracy plan with rings of 1,024 and 2,048 (a quarter
scale) beside the full ring. Written before the run: at 32K a 4,096 ring brings 8+3 within 10% of q3_0 and a 2,048 ring within 5%;
at 128K every ring size is within 5%; slack 1,024 is within 3% of slack 4,096 (if it is much faster, unfilled slack slots are being
read and the engine should skip them). Each smaller ring's KLD against f16 lies between the full ring's and plain q3_0's (or q4_0's).

## Addendum 74 (Nov 20): every speed test cools the card to its own baseline and logs heat and clocks per row

The 3-bit memory looked 18% slower than q4_0 at 128K in section 39, but 6% in a same-day head-to-head (section 47): the long rows in
the first run were throttled 43-56% of the time. From now on `speed-test.mjs` and `switch-cost.mjs` read the idle card's temperature
before the first load and wait for the card to return to it plus 3 °C (at least 35 °C, at most 300 s per wait) before every load and
every timed run (switch-cost: before every switch). A plan can set its own target with "coolDown": {"cardC": N} or turn it off with
"coolDown": false. Each run records the card's temperature and clock at its start, its top temperature, its median and lowest clock,
and the summary table shows "Card °C start / max" and "Clock MHz median / min" for every row, beside the throttle count. Waits,
and any wait that hit its limit, are written in the summary; nothing is dropped. Comparisons across runs whose start temperatures
differ by more than 5 °C are flagged in the write-up, not averaged.

## Addendum 73 (Nov 20, before any run): the Progressive Memory rework (0045) on Brain Engine 26

On Brain Engine 22, Progressive Memory wrote 56-78% slower than plain q3_0 on long chats (section 44 of the results): each written
word worked out the main cache's log-sum-exp with a plain matrix multiply over the whole cache, beside flash attention. Patch 0045
takes it from flash attention itself (CUDA vector kernel, 1-2 query rows, head size 64/128/256, cache length a multiple of 256; other
shapes and LLAMA_KV_TIERS_EXPLICIT=1 take the old pass). `speed-plans/speed-progressive-be26.json`: q4_0, q3_0, 3-step and 8+3 at
32K/128K/256K as before, plus 3-step at 32K and 8+3 at 128K with the old pass forced, 2 rounds; `perplexity-progressive-be26.json`:
the 16K x 2 accuracy plan on Brain Engine 26 plus 8+3 with the old pass. Read the log for the fast merge line and the sharp rings' MiB
in the cache size line. Pass, written before the run: Progressive writing within 10% of plain q3_0 at 32K and 128K; the old-pass rows
as slow as section 44 (within 10%); the same words as Brain Engine 22's Progressive rows at temp 0 (start chat at 32K: 565bcff4);
perplexity of the fast and old pass equal to 4 decimals. Expected: 3-step and 8+3 within 5-10% of q3_0 at 32K, 5-15% at 256K.
Added before the run: Progressive 8+4 (q4_0 main, q8_0 for the newest 8,192; 4,096 in the 16K accuracy plan) beside q4_0 at each size. Its bar: writing within 5% of plain q4_0, and KLD against f16 below plain q4_0's in the same group.

## Addendum 72 (Nov 20, before any run): does patch 0044 close the 3-bit memory's long-chat gap

At 128K the 3-bit memory (q3_0 K and V) wrote 18% slower than q4_0 (47.3 against 58.0 t/s, section 39 of the results), while at
32K its attention cost only 0.1-0.5 ms more per word (Addendum 70). Patch 0044 unpacks q3_0's codes four at a time in the CUDA
vector kernel, for the K dot and the V unpack, with the same codes. `speed-plans/kv3-kernel-128k.json`: q4_0/q4_0, q3_0/q3_0 and
q4_0 K / q3_0 V at 128K (start chat, then a 122,880-token read), on the engine before 0044 and the one after, GGML_SCHED_TIMING=1,
fit placement as the speed-kv3 fit rows, 2 rounds, 6 loads. Written before the run: before 0044, q3/q3 writes 15-20% slower than q4/q4
after the long read, and the card's part per word is 1.5-3 ms larger; after 0044, q3/q3 within 5% of q4/q4 (pass), the same words as
before 0044 for each memory type (the codes are unchanged), and q4_0/q4_0 unchanged within 2%. If q3/q3 stays more than 10% slower,
the gap is not the unpack and the timing lines say where it is. The timing lines slow every row the same way, so only the ratios count.

## Addendum 71 (Nov 20, before any run): Progressive Memory on Brain Engine 22

Progressive Memory (patch 0039, `LLAMA_KV_TIERS`, slack 4096) keeps the newest words sharp and the older ones in q3_0. Types, as Bob
sets them: A 3-step at 32K (q3_0 main, `q8_0:8192,q4_0:16384`), B 3-step past 32K (`q8_0:8192,q4_0:65536`), C 2-step (`q4_0:16384` at
32K, `q4_0:65536` past it) and D 8+3 (`q8_0:8192`, no 4-bit step; the owner asked for it on Nov 19). Plans, in run order:
`perplexity-progressive.json` (f16 base vs q8_0, q4_0, q3_0, A, C, D at 8K x 2 and 32K x 1, plus A with -ub 8192 at 32K, which should
equal plain q3_0 since the batch passes the slack), `speed-progressive.json` (q8_0 at 32K/128K, q4_0, q3_0, 3-step and 8+3 at 32K,
128K and 256K, --fit, 2 rounds; the saved words at temperature 0 also give the same-words check against q8_0), `needle-progressive.json`
(B, C, D at 128K and 256K, 25 each).

Bar (Addendum 62 and the owner's Nov 19 rule): perplexity within 3% of q4_0 passes, 3-5% needs the real-jobs check, over 5% fails;
needles 25/25. The 3-step type becomes the default only if it is within 3% of q8_0 and passes the needles. Written before the run:
at 8K every Progressive type equals q8_0 (the whole text sits in the 8K q8_0 step, so 8K says little); at 32K, A and D sit between
q8_0 and q3_0, nearer q8_0; A with -ub 8192 equals plain q3_0; all needles found; writing 0-10% slower than plain q3_0 (one extra pass per
step), reading up to 15% slower (f16 copies per batch).

Result note on the perplexity half (Nov 20, after the run): void for Progressive Memory, a plan mistake. At 8K the engine said
"NOT USED: the context is not bigger than the biggest window" for 3-step, 2-step and 8+3 (all three equal plain q3_0), and the 32K x 1
group needs 64K tokens of text where long-text.md has 40,398, so its f16 base wrote no score. The plain rows stand (8K x 2 against f16:
q8_0 KLD 0.0037, q4_0 0.0095, q3_0 0.0259). `speed-plans/perplexity-progressive-16k.json` reruns it at 16K x 2 with the windows a
quarter of the 32K design (8+3 = q8_0 for the newest 4,096; 2-step q4_0 for 8,192; 3-step both) and step 2048 for every row. Written
before that run: 8+3, 2-step and 3-step each land between q3_0 and their sharper type, 3-step closest to q8_0; all three pass the 3% bar.

## Addendum 70 (Nov 20, before any run): which half of the 3-bit memory costs writing speed

For the engine side's q3_0 kernel work: `speed-plans/kv3-kernel-diag.json`, Brain Engine 21, 4x4 with --fit at a 48K context, one
load per memory type (q4_0/q4_0, q3_0/q3_0, q4_0 K with q3_0 V, q3_0 K with q4_0 V), start plus 8K and 32K prompts, -lv 4 for the
attention path lines and GGML_SCHED_TIMING=1. Diagnostic only, 1 round; speed claims come from speed-kv3 (Addendum 64), not from here.
Written before the run: if one half is slow, the row with only that half in q3_0 writes at least 5% slower than q4_0/q4_0 at 32K and
the other mixed row within 2% of it.

## Addendum 69 (Nov 20, before any run): how much the doorbell overlap could save

Strata's overlap lets the card and the processor work on different experts at once. Section 28's where-time was at processor share 0,
where the processor does almost nothing (0.1 ms against 3.3 ms of copies per word), so it says nothing about the overlap. The overlap
only pays where the processor takes misses: share 1, as with the learning cache. `speed-plans/overlap-ceiling.json`, Brain Engine 21,
1 round, 3 loads: 2x4 at 32K share 1, the same with LLAMA_MOE_CACHE_LEARN 16 / margin 1.5, and that at 128K (start, code edit; the
128K load also reads 122,880 tokens), each with GGML_SCHED_TIMING=64 and GGML_SCHED_OVERLAP_LOG=64. Read per written word: card ms
(expert part and the rest), processor ms, copy ms, and who waits on whom.

The ceiling per layer is about the smaller of the card's expert part and the processor's part. Written before the run: with learn 16
the processor part is 15-30% of a word's time, so the ceiling is 10-25% faster writing on code edits; under 8% means the overlap is
not worth its 1.5-2.5 weeks on the test PC. Diagnostic only: no speed claim is made from these loads (the logs slow the engine).

Result note (Nov 20, after the run): the engine turns GGML_SCHED_OVERLAP_LOG off when GGML_SCHED_TIMING is on ("NOT USED: GGML_SCHED_TIMING
waits for every piece, so nothing overlaps"), so the who-waits half of every row is void. The timing half stands: overlap ceiling
22-26% of each word (about 3 ms of 11-14 ms), inside the 10-25% prediction; no card split between experts and the rest is logged.
`speed-plans/overlap-waitlog.json` reruns the same 3 rows with the who-waits log alone.

## Addendum 68 (Nov 20, before any run): how long the n-gram drafts may be

N-gram drafts wrote code edits about 45% faster on Brain Engine 19 but left word gaps of 170-330 ms at p99 (Addendum 54 (D)).
Likely cause, unproven: each draft is checked in one batch, and on this card a batch of many tokens pulls many experts from RAM,
so a rejected draft costs about as much as a short read. `speed-plans/spec-draft-length.json` runs on Brain Engine 21, 4x4-style
settings at 32K (step 2048, q4_0 memory, margin 512, unpinned), code edit and plain chat, 2 rounds: no drafts, and ngram-mod with
`--spec-ngram-mod-n-max` 4, 8, 16 and 64, plus n-max 8 with the pay gate at 0.5 (LLAMA_SPEC_GATE, patch 0034).

Written before the run: the p99 word gap falls with the draft length (about 100 ms or less at 4-8) while most of the code-edit gain
stays (+25-40% at 8); plain chat gains little at any length. Pick: the longest n-max whose p99 gap is at most 100 ms on both
prompts and whose code-edit writing is at least 15% over no drafts; if none qualifies, drafts stay off.

## Addendum 67 (Nov 20, before any run): Q3 against Q4 on real-jobs lessons, Q8 as the reference (rental)

The owner's worry about the Q3 brain is coding and tool use, which whole-text perplexity hides. `model-lab/lesson-score.mjs` makes each
brain write exactly the right answer of 120 real-jobs lessons (picked by a hash of the idea from the 370 written by Qwen3.8 Flash-Next,
none by our 35B; every assistant turn, thinking off, the lesson's own system prompt and tools) through a grammar that allows only that
text, greedy, and reads back the brain's raw odds per token (before the grammar). Each token is marked tool name, JSON, path, code,
prose or other (think/tool marks). Plan `forge/plans/q3-fairness-lessons.json`: one L40S, stock llama.cpp b12359, Q8_0 then UD-Q4_K_XL
then UD-Q3_K_XL from unsloth's page, q8_0 chat memory for all three, cap 2.5 h / $3.

Reported per kind: mean right-token log-odds, how often the brain's own first pick is the right token, and against Q8 (only while both
wrote the same tokens) KLD over the top 20 and the same-first-pick rate.

Written before the run: Q4 sits close to Q8 everywhere (first pick within 1 point). Q3 loses most on tool names and paths, least on
prose. Pass for Q3 as a smaller option (Addendum 62's middle band): on tool names, JSON and paths its first-pick rate is no more than
2 points under Q4's, and its KLD against Q8 is no more than twice Q4's on every kind. Otherwise Q3 stays off for tool work. These are
odds on a given answer, not job results: the smaller real-jobs check still follows.

## Addendum 66 (Nov 20, before any run): the conductor's switch cost at 128K

The conductor (GUPPI design, bob-wip/engine-speed/guppi-conductor-design.md) needs the whole cost of a live change on a long chat, not
only at 32K: save the chat, change the setting, restore it. `speed-plans/conductor-switch-128k.json` runs the same five steps as
Addendum 65 at 128K with a fixed placement (`${NCMOE_128K}` from the speed-kv3 fit probe), q4_0 chat memory, the text laid 4 times end
to end and cut to 122,880 tokens, step 5120 to 4096 and back, 3 repeats, then a fresh start per switch for the words check.

Written before the run: save and restore each take longer at 128K than at 32K, roughly in step with the chat memory's size (about
4 times); the context change itself stays within 1 s of the 32K figure, since the brain stays loaded. A restore that is refused, or
words that differ from the fresh start, are counted and shown. Pass for the conductor: save + switch + restore under 10 s at 128K.

## Addendum 65 (Nov 19, before any run): what a live setting change costs the conductor

The owner wants the conductor (Bob changing engine settings per job step). It only pays if a change is cheap. Brain
Engine 21 has `POST /context` (patches 0035 and 0037), which changes the step, the chat memory type, the processor share
and the engine keys (learning, lending) with the brain kept loaded. New runner `model-lab/switch-cost.mjs`, plan
`conductor-switch.json`: one load at 32K, 4x4, q4_0, fixed placement (`--fit off -ngl 99 --n-cpu-moe ${NCMOE_32K}`, so
layers never move), 10 switches (step 2048 <-> 4096, 4096 <-> 6144; learning on/off at share 1 with learn 16; lending
on/off; chat memory q4_0 <-> q8_0), 5 repeats each. For each: set the `from` setting, read a 32K prompt, save the chat,
switch (timed, plus the engine's own seconds and its kept-loaded line), restore the chat (timed; a refusal is written
down), and ask a follow-up (first word, words). Then a fresh engine started at each `to` setting answers the same prompt
and follow-up, and the words are compared.

**Predictions, written before any run:** every switch logs "brain kept loaded". Step and key switches take under 1 s,
the chat memory switch under 2 s, and save plus restore of a 32K chat under 1 s; the restore is refused across chat
memory types (the saved cache is in the old type), so that switch must read the chat again (about 9 s at 32K). The
words after a switch match a fresh start at that setting, except where Section 25's placement effect applies (none
expected with the placement fixed).

## Addendum 64 (Nov 19, before any run): the 3-bit chat memory (q3_0) on Brain Engine 21

The owner asked for a 3-bit chat memory and approved its test (Speed thread card, 5:22 PM). Brain Engine 21
(`brain-engine-21b12359`) adds a `q3_0` cache type with card attention kernels. Three plans, run in this order:

1. `perplexity-kv3.json` (10 runs): f16 base against q8_0, q4_0, q4_0 keys with q3_0 values, and q3_0/q3_0, at 4K x 4
   and 8K x 2, 4x4 settings. Before it, a short chat with `-ctk q3_0 -ctv q3_0` must answer on the card's attention
   path (writing speed not processor-slow).
2. `needle-kv3.json` (20 loads): q4_0/q3_0 and q3_0/q3_0 at 128K and 256K, 5 depths x 5 rounds.
3. `speed-kv3.json` (36 loads, 2 rounds): q4_0, q4_0/q3_0 and q3_0/q3_0 at 32K (4x4), 128K (5x3.5) and 256K (6x3.5),
   each with `--fit on` and with a fixed placement (`--fit off -ngl 99 --n-cpu-moe ${NCMOE_<size>}`, read from the
   q4_0 `--fit` row's log at that size). Saved text gives the same-words check against q4_0.

**Bar, set before any run (the owner, Addendum 62):** perplexity within 3% of the q4_0 chat memory on both splits passes;
3 to 5% needs the real-jobs check; over 5% fails. KLD and same top are reported, not gated. The needle must be 25 of 25
at each size.

**Predictions, written before any run:** q3_0/q3_0 lands about +1 to 1.5% perplexity over q4_0 and passes; q4_0/q3_0
sits between. Needles 25/25 for q4_0/q3_0; q3_0/q3_0 may drop one at 256K. Memory saved about 0.17 GB at 128K and 0.34
GB at 256K; no writing speed gain with a fixed placement; with `--fit` the freed room may place a few more experts
(at most +3% writing).

## Addendum 63 (Nov 19, before any run): a coding use for the scorer

The docs thread asked for a coding use: a code answer is longer than an agent step and shorter than long-form writing.
The scorer (`score-settings.mjs`) gets `coding`: 1,500 written tokens, blended half at 32K and half at 64K (weights set
before any data, like Addendum 48's). Until now its pick (4x4) rested on one 2,000-token comparison at 32K (29.9 s
against 32.7 s). Plan `coding-32k-64k.json` (24 loads, 3 rounds, Brain Engine 18, q4_0 cache, 1,500 written tokens):
stock llama.cpp at step 4096 and the 2x4, 4x4 and 4x0 (no copy cache) settings at 32K (`-c 49152`) and 64K
(`-c 73728`, the 61,440-token prompt). The same gates apply.

**Predictions, written before any run:** 4x4 wins coding at 32K and 64K, by 3% or more over 2x4; 4x0 and stock tie
with each other within 3% and trail 4x4 at 32K (the copy cache pays on long answers), and the gap narrows at 64K.

## Addendum 62 (Nov 19, before any run): the quant ladder for big expert brains, and the bar for each step

The owner: "With larger moe models we can go to q2 or q1.25 ... As long as perplexity doesnt drift, +/-3 or +/-5 should
be checked for answer quality." For brains of 35B and up, each step down the ladder (Q4, Q3, Q2, and the 1-bit-class
files such as IQ1_M) is measured against the step above it, and against a Q8 reference where one fits on disk, with
llama-perplexity on both splits, at f16 and q4_0 cache:

- **Perplexity within 3% of the step above, KLD and same-top within Addendum 57's limits: passes.**
- **Between 3% and 5%: passes only after an answer-quality check on real jobs** (the held-out job test, graded as the
  lessons are, with no more than 2 fewer right of 200 than the step above), and it is offered as a "smaller, a bit less
  sharp" choice, never the default.
- **Over 5% worse: fails.** It is not offered.

Brains under 35B stay at Q4 (the owner, Nov 19). A step that fails is not tried further down. The pick for each device
stays the best step that fits; the quant level a person can choose is a Brains page setting (built separately, off
until tested).

**Predictions, written before any run:** on Qwen3.6 35B, Q3 lands at +2 to +5% (Addendum 57). Q2 lands past 5% for
the 35B; only the 120B-class brains have a chance of passing Q2 inside 5%.

## Addendum 61 (Nov 19, before any run): drift of the processor read for short prompts

On Brain Engine 20 the processor read (patch 0032, `LLAMA_MOE_CACHE_CPU_READ`) no longer crashes and gives the
300-token prompt its first word 28-33% sooner, with the best spread at N = 1024 (31% sooner at 300 tokens, 11% at 900).
It changes the answer whenever it engages (the misses are worked out by the processor's kernels). Before it can go near a
pick, plan `perplexity-cpu-read.json` measures the drift with llama-perplexity on Brain Engine 20: at share 0 and at
share 1, each against its own base without the read, f16 cache, 4K x 4 and 8K x 2 chunks, `-ub 1024` so every piece
takes the read, verbose log on (as in Addendum 56's rerun). 8 runs.

**Gate (the same as the no-table mask's, Addendum 56):** KLD 0.002 or less and the same top word 99% or more, at both
shares and both lengths. **Prediction, written before any run:** it passes at share 0 and at share 1 (processor and card
kernels both work in at least f32 for the expert sums, so the drift should be rounding-sized).

## Addendum 60 (Nov 19, before any run): the two Brain Engine 19 crashes, rerun on Brain Engine 20

The processor read for short prompts (patch 0032) and the KV split (0036) crashed on Brain Engine 19 (results section
28). The engine thread fixed both: 0032 now pins the gate, up and down steps; patch 0017-moe-cache-split-guard starts a
new split at every copy cache lookup (the KV split's processor attention had put layer 15's router and lookup in one
split; confirmed by a GGML_SCHED_DEBUG dump). Plans `be20-cpu-read.json` (15 loads) and `be20-kv-split.json` (24 loads)
are Addendum 54's plans unchanged except the engine. Each row whose log lacks its switch line is void; the runner now
records a crashed load with its exit code and goes on.

**Predictions, written before any run:** both run with no crash. Addendum 54's predictions stand: the 300-token first
word at least 10% sooner with the processor read, losing past 1024; the KV split loses writing past cell N and gains
no more than 5% reading, so it is not a win for the 35B on the test PC.

## Addendum 59 (Nov 19, before any run): the learning copy cache, with counters

In Addendum 54's L rows, learn 16 with margin 1.5 at share 1 wrote the code edit 12.9% faster than the share-0 pick
(102.2 against 90.5 t/s, same answer), but trailed it on start (-14%) and k32 (-2%). Those rows logged no hit-rate
counters, so the claim that learning raises the hit rate was not checked. Plan `be19-learn-followup.json` (15 loads,
3 rounds, start, k32 and the code edit) turns `LLAMA_MOE_CACHE_LOG_EVERY=4000` on in every row and runs: the share-0
reference; learn 16 at share 1; learn 8 at share 1; learn 16 at share 0.5; learn 16 at share 0.

The share-0 + learn row may never learn: as patch 0031 reads, the learning cache only fills when the share is above 0.
If its log says NOT USED, or shows no swaps, the row is void and dropped, not counted.

Switching between the chat setting (share 0) and the code-edit setting (learn 16) is a full reload on Brain Engine 19;
its cost is the load time logged in each row. Once a build has patch 0037, the switch will be timed with `POST /context`.

**Predictions, written before any run:** learn 16 at share 1 repeats its code-edit lead over share 0 within 3% of
Addendum 54's numbers, and its hit rate on the code edit is higher than share 0's. Learn 8 is no better than learn 16
(within 3%). Share 0.5 + learn 16 sits between share 0 and share 1 + learn on start and on the code edit. Share 0 +
learn 16 is void (NOT USED or no swaps).

## Addendum 58 (Nov 19, before any run): is the server's word change from the mask or from placement?

Section 27 found the no-table mask bit-identical to the table with the q4_0 cache in llama-perplexity, yet the Brain
Engine 18 speed rows (also q4_0) wrote different words from the first token. The likeliest cause is `--fit`: POS changes
the compute buffer sizes, so `--fit` can place a different number of experts on the card, and that changes the
arithmetic. Plan `mask-pos-fixed-placement.json` (8 loads): table vs POS at 32K, step 4096, q4_0, `--fit off` with the
same `-ngl 99 --n-cpu-moe ${NCMOE}` (NCMOE read from the table run's log), 4 GB copy cache, 64 words at temp 0, with and
without `--cache-reuse 256`.

**Predictions, written before any run:** with the placement fixed, table and POS write the same 64 words on both
prompts, with and without cache reuse. If so, POS is clean and the drift came from placement.

## Addendum 57 (Nov 19, before any run): a Q3 file of the 35B against our Q4

The owner's rule: brains under 35B stay at Q4; 35B and up may try lower. Asked to try a Q3 of stock Qwen3.6 35B "with
perplexity scoring". Files, all from unsloth/Qwen3.6-35B-A3B-GGUF at the revision Bob's catalogue pins:
UD-Q4_K_XL (ours, 22.4 GB), UD-Q3_K_XL (16.8 GB), and optionally Q8_0 (36.9 GB) as a reference.

- `perplexity-q3-vs-q4.json` (8 runs): base = Q4 with f16 cache; rows Q3 f16, Q4 q4_0, Q3 q4_0, at 4K x 4 and 8K x 2.
  KLD here is distance from our Q4, not from the full model.
- `perplexity-q8-reference.json` (6 runs, only if the owner downloads the Q8): base = Q8_0 with f16 cache; rows Q4 and
  Q3 with f16 cache. This is the true measure of what each file loses. The Q8 does not fit in RAM, so it runs partly
  from the SSD; its timings mean nothing.

**Gate (Q3 replaces Q4 only if all hold):** against Q8 where measured, Q3's mean KLD is at most 2 times Q4's and at
most 0.03, and its same top word is at least 92%. Without the Q8: Q3's mean KLD against Q4 is at most 0.03, same top at
least 92%, and its perplexity at most 2% above Q4's on both splits. With the q4_0 cache, Q3 q4_0 must still pass the
same limits. Only if it passes do the speed rows (2x4 and 4x4 at 32K, 128K and 256K) and job tests run.

**Amended Nov 19, 12:57 PM, before the Q3 run started:** the owner set the bar for one quant level down at a quality
change of 3% or less ("+/-3% per level is acceptable"). The perplexity limit above is 3% (was 2%), on both splits, with
the q4_0 cache too; the KLD and same-top limits stay. The same 3% bar applies to any lower cache format. Later the same day the owner added a middle band: between 3% and 5% passes only after an
answer-quality check on real jobs (Addendum 62); over 5% fails.

**Predictions, written before any run:** against Q4, Q3 lands at mean KLD 0.02-0.05, same top 90-94% and perplexity
+2 to +5%, so it fails or only just passes. Against Q8, Q4 sits at about 0.01-0.02 and Q3 at 2-3 times that.

## Addendum 56 (Nov 19, after the Brain Engine 18 mask run, before any drift run): does the no-table mask change the brain's choices?

On Brain Engine 18, `LLAMA_KQ_MASK_POS=1` gave different answers from the table on every prompt, deterministically
(identical across rounds), often from the first word, while Brain Engines 16 and 18 with the switch off agree exactly.
mask-pos-check.exe found 0 numbers different on its 13 shapes, so the difference shows only on the real brain. The
answers read as fluent near-tie choices, but that is not a measurement. Plan `perplexity-mask-pos.json` (8 runs):
f16 with the table as the base, against f16 POS, q4_0 with the table and q4_0 POS, at 4K x 4 and 8K x 2 chunks.

**Gate (stricter than Addendum 48's, since the switch is meant to change nothing):** POS passes if f16 POS has mean KLD at most 0.002 against f16 with the table (about
half of q8_0's 0.0037) and same top word at least 99%, and q4_0 POS is within 0.001 KLD of q4_0 with the table. If it
fails, POS stays off until the engine thread finds the cause.

**Added before the verbose rerun (Nov 19, 6:55 AM):** the first run logged too little to confirm the switch, and showed
f16 POS at exactly 0 KLD. With `-ub 4096` each 4K chunk is read in one piece, so it may never meet the case the server
does (a long prompt read in pieces after earlier ones). `perplexity-mask-pos-ub1024.json` repeats the check at `-ub 1024`.
Both run with `LLAMA_ARG_LOG_VERBOSITY=4` and count only if each POS row logs "attention mask as positions (no table)".

**Predictions, written before any run:** f16 POS lands at mean KLD 0.0005-0.002 and same top 98.5-99.7%, so it may
miss the 99% line; q4_0 POS is within 0.001 of q4_0 with the table.

## Addendum 55 (Nov 19, before any run): refill behind the writing, again (row 7b of the Brain Engine 19 plan)

The owner asked to retest patches 0022 (`LLAMA_MOE_CACHE_LEND`) and 0023 (`LLAMA_MOE_CACHE_LEND_BEHIND`), both already
in Brain Engine 19, now that cache and context sizes can change on the fly. Plan `be19-lend-behind.json` (27 loads):
at 32K, step 6144, q4 cache, margin 512, with 4, 6 and 8 GB copy caches: no lend, lend only (N 4096), and lend + refill
behind from written word 32. A 32K prompt, then 300 words, 3 rounds. Brain Engine 19 has no fixed refill row of its
own, so the no-lend row is the reference at each size. Where `--fit` cannot place a cache size at 32K, the row is
reported as not placed, not as a loss.

**Predictions, written before any run:** the refill takes under 0.5 s at 4 GB and under 1 s at 8 GB. Lend-behind does
not cut the time to 300 words by 3% or more against lend only at any size (as on Brain Engine 14), so it stays off.

## Addendum 54 (Nov 19, before any run): Brain Engine 19's new tricks, one at a time

Brain Engine 19 (pre-release `brain-engine-19b12359`, patches 0001-0036) is laid over the official b12359 CUDA 13.5
build. Each new key is off unless a row sets it, and a row whose log says NOT USED is void. It runs after Addendum 52
and before the 120B check, on the owner's go. Plans, all on the stock Qwen3.6 35B with q4_0 cache, margin 512 and
unpinned steps:

- `be19-baseline.json` (B0, 20 loads): 2x4 and 4x4 at 32K on Brain Engines 18 and 19, nothing new on.
- `be19-where-time.json` (T, 6 loads): `GGML_SCHED_TIMING=50`, and `GGML_SCHED_OVERLAP_LOG=50` at copy-cache share 1 and
  0.5. Diagnostic only; its speeds are not compared.
- `be19-learn.json` (L, 12 loads): share 1 with learning off, `LLAMA_MOE_CACHE_LEARN=64`, and 16 with margin 1.5,
  against 2x4 at share 0, on the start prompt, 32K and a code edit (`code-edit.md`).
- `be19-cpu-read.json` (R, 15 loads): `LLAMA_MOE_CACHE_CPU_READ` off, 256, 512, 1024, 2048 on 300-, 900- and
  2,000-token prompts at `-ub 2048`.
- `be19-spec-gate.json` (D, 12 loads): n-gram drafts (`--spec-type ngram-mod`) with `LLAMA_SPEC_GATE` off, 0.3, 0.5,
  and no drafts, on the start prompt and the code edit.
- `be19-kv-split.json` (K, 24 loads): `LLAMA_KV_SPLIT` off, 32768 and 65536 at 128K (5x3.5) and 256K (6x3.5) on 2K,
  32K and 100K or 250K prompts, and split 32768 again with pinned steps (`GGML_CUDA_NO_PINNED` unset), because 0036
  keeps the full K/V in the CUDA host buffer type, which falls back to plain RAM when unpinned. Record the CUDA_Host and
  shared-memory rise for both. (Added before any run.)

Not in plans yet: context change without reload (needs Bob or `POST /context`), the tiny Flash-Next brain, and the
combined winners (written after these results).

**Predictions, written before any run:** B0 matches Brain Engine 18 within 2% with the same words. Learning (L1, L2)
raises the copy-cache hit rate but does not beat share 0 on writing by 3% or more. `CPU_READ` makes the 300-token first
word at least 10% sooner and loses past 1024. The spec gate at 0.3 keeps the code-edit gain within 5% of gate-off and
lifts plain-chat writing by at least 3% over gate-off. The KV split loses writing past cell N and gains no more than 5%
reading, so it is not a win for the 35B on the test PC.

## Addendum 53 (Nov 18, after Addenda 47 and 49, before any run): does the copy cache earn its place at 128K and 256K?

Addendum 47 showed stock llama.cpp with Bob's step, q4 cache, margin 512 and unpinned steps, but no copy cache, doing
the 256K 2,000-token job 3% sooner than Bob's 6x3.5 pick, and within 4% at 128K. Addendum 49 then had most long rows
lightly throttled. Plan `copy-cache-long.json` (3 rounds, 18 loads) runs, at 128K (step 5120) and 256K (step 6144):
stock without the copy cache, Brain Engine 15 with the 3.5 GB copy cache, and Brain Engine 15 without it.

**Predictions, written before any run:** Brain Engine 15 without the copy cache matches stock within 3% on every number
(same code path). Without the copy cache, first word is at least 10% sooner and writing at least 8% slower than with
it. By Addendum 48 job time, no-copy-cache wins the 128K agent job (600 tokens) and ties or wins the 256K
2,000-token job.

**What it decides:** whether the 128K and 256K picks drop the copy cache. If they do, the gain over stock llama.cpp at
those sizes comes from settings alone, and the dissertation and README must say so.

## Addendum 44 (Nov 18, before any run): no mask table at all (patch 0026, Brain Engine 17)

Patch 0026 (`LLAMA_KQ_MASK_POS=1`, off by default, flash attention only) passes each cache cell's position and chat
to the attention kernels, which decide what each word may see, so there is no table on the card or in RAM. Brain
Engine 17 ships its own ggml files, so it is a full engine, not an overlay. Its CUDA kernels have not run on a card
before this test, so the order is fixed:

1. `mask-pos-check.exe` from the zip, with nothing else on the card. It must print ALL PASS for CUDA0 and CPU. If
   anything fails, nothing else runs.
2. Plan `mask-pos-be17.json`, 2 rounds, 30 loads, 4 GB copy cache, q4_0 cache:
   - Brain Engine 16 (switch off), Brain Engine 17 off, and Brain Engine 17 on, at `-ub 4096` at 32K, 128K and 256K.
   - Brain Engine 17 off and on at `-ub 6144` at 128K and 256K, and at `-ub 8192` at 256K.
   - Every answer is kept, and every load with the switch on must log "attention mask as positions (no table) on CUDA0".

**Predictions, written before any run:** the words are identical in all three at every size. With the switch on, the
card's compute buffer at 256K shrinks by at least 1.8 GB at `-ub 4096` (by at least 3.5 GB at 8192). `--fit` turns
that into at least 3 more layers' experts on the card at 256K, and writing at 256K gains at least 5%. At 8192 at 256K
it recovers to within 10% of `-ub 4096` writing (it was 20.6 against 42.5 tok/s). Reading is within 5% at 32K and 128K.

**What it decides:** whether patch 0026 becomes Bob's default on CUDA cards with flash attention, and whether the
step-per-context table (Addendum 36) moves to bigger steps. It needs the owner's go to run.

## Addendum 45 (Nov 18, before any run): the final picks on a busy desktop

The owner keeps many browser tabs open, so clean-desktop numbers are not real use. The owner (Nov 18): use a synthetic
load. Plan `real-desktop.json`, Brain Engine 15, 8 loads, run twice: once on a clean desktop, then with a browser
holding several heavy tabs and one muted playing video, opened before the first load and closed after the last. The
browser's card and RAM use is logged before each pass. The rows are the picks so far, each at margins 512 and 1024:
F4c with a q8_0 cache at 32K (chat), `-ub 5120` with a q4_0 cache at 128K and 256K (Addendum 36's balance point), and
6x3.5 with a q4_0 cache at 256K. The spill check takes off the pinned step buffer.

**Predictions, written before any run:** the browser takes 0.3 to 1 GB of card memory. `--fit` sees it at load and
moves about one more layer's experts to RAM, so writing drops 2 to 6% and nothing spills at margin 1024. At margin 512
a real spill shows in at least one 256K row, because the video's memory grows after the load.

**What it decides:** the margin Calibrate sets for a desktop in use: 512 if no busy-desktop row spills there, else 1024.

**Result (Nov 18, 16 loads):** the busy desktop cost first word +16 to 17%, reading -12 to 15% and writing -10 to 18%
(worst at 32K), with the same placement and no real spill. Margin 512 did as well as or better than 1024 under load,
so it stays the pick. Free RAM fell to 0.3 GB at 256K, so RAM, not the card, is what a busy desktop squeezes.

## Addendum 46 (Nov 18, before any run): sharing the expert work with the processor

Planned on Nov 17 and not yet run: with the copy cache, a missed expert can be worked on the card (copied) or on
the processor. `--moe-cache-cpu-share` sets the processor's part. Nov 17 measured only 0 (all copied) and 1 (all
processor); 0 won. Plan `cpu-share.json`, Brain Engine 15, 1 round, 6 loads: 4x4 with a q4_0 cache and a 512 MB
margin (Addendum 41's sweet spot), share 0, 0.25 and 0.5, at 32K and 128K.

**Predictions, written before any run:** share 0.25 writes within 3% of 0 at both sizes; 0.5 writes 3 to 8% slower.
Reading is the same at all three, because reading doesn't use the share.

**What it decides:** whether Calibrate tries a share above 0. It does only if 0.25 or 0.5 writes at least 3% faster.

**Result (Nov 18, 4:18 to 4:25 PM test-PC time, 6 of 6 loads):** reading was the same at all three, as predicted.
Writing fell with any share: 32K 100.4 (0), 92.8 (0.25, -8%), 91.3 (0.5, -9%); 128K 68.1, 54.7, 62.6 (noisy). The
0.25 prediction failed (it lost 8%, not under 3%). The processor stayed about 22% busy at every share. Calibrate keeps
the share at 0 and does not try others.

## Addendum 47 (Nov 18, before any run): stock llama.cpp against Bob's picks, with load times

The owner wants Bob's picks next to stock llama.cpp at every size, with load times. The table so far has only one
stock row (short prompt, Nov 16) and one plain-settings row at 256K. Plan `stock-vs-picks.json`, 2 rounds, 20 loads,
answers saved, run after the Brain Engine 17 rows. Each load is one context size, with the short start prompt and
one long prompt (32K, 120K or 250K tokens):

- **Stock defaults** (plain llama.cpp b12359): only `--jinja`, `-np 1` and the context size. Everything else is
  llama.cpp's own: `-b 2048 -ub 512`, an f16 cache, flash attention and `--fit` on auto, a 1 GB margin. This is what a
  llama.cpp user gets.
- **Stock at Bob's steps:** plain llama.cpp with the pick's step, cache type and 512 MB margin, and pinning off, but
  no copy cache. This splits the gain into "Bob's settings" and "Brain Engine".
- **Bob's pick** (Brain Engine 15, pinning off as Bob now runs): 4x4 q4_0 at 32K, step 5120 q4_0 + 3.5 GB at 128K,
  6x3.5 q4_0 at 256K, and F4c q8_0 at 32K (the chat pick). All have a 512 MB margin.

The runner now keeps each load's time from start to ready (`loadS` in runs.jsonl).

**Predictions, written before any run:** Bob's pick reaches the first word at least 2.5 times sooner than stock
defaults at every size. Writing is at least 10% faster at 32K and 128K, and within 10% at 256K (where the small
default step leaves more experts on the card). Stock at Bob's steps reads within 5% of Bob's pick. Bob's pick writes
at least 10% faster than it at 32K, from the copy cache. Load times are within 15% of each other at the same size,
and grow with the context.

## Addendum 48 (Nov 18, revised the same evening after review): how settings are scored

Code: `model-lab/score-settings.mjs`, tested in `test/run-score-settings-test.js`. **Score on job time, gate on
robustness**, with no weights to tune. (A first version used a weighted geometric mean of six ratios; the owner's
review pointed out that its weights were subjective and several measures fed each other, so it was dropped.)

**Job time** = seconds to the first word + answer length / writing speed. The answer length is fixed per use, because
at 256K the winner changes with it (at 100 tokens step 7168 wins, at 300 it's a tie, at 2,000 6x3.5 wins): chat 300
tokens, agent 600, long-form 2,000. A use that spans sizes gets one blended job time, the weighted sum of its per-size
job times (chat: short 0.6, 32K 0.4; agent: 32K 0.6, 128K 0.4; long-form: 128K 0.5, 256K 0.5), and the score is stock
llama.cpp's blended job time / ours x 100, worked out once (not an average of per-size ratios). Gaps under 3% are
reported as ties. The averaged table shows job time at 300 and 2,000 tokens.

**Gates**, hard limits, each pass, fail or "not measured" (never shown as failed). Only an all-pass setting is scored:
- no real spill: shared rise minus every pinned `CUDA_Host compute` buffer under 150 MB;
- the needle found at every depth;
- **mean** KL divergence against an f16 cache 0.01 or less (not the 99th percentile, where even q8_0 is 0.03), and the
  same top word at least 95% of the time. q4_0 passes both narrowly (0.00904 and 95.69%) on one perplexity run of one
  16K chunk, so a value from a single run is flagged;
- no aborts or failed prompts;
- a busy desktop costs at most 25% of job time (worst seen: 18%);
- at least 512 MiB of card memory free after load;
- load in 15 s or less for a 35B brain (5.3 to 7.4 s warm, 12.6 to 14 s cold).

Already out: iq4_nl (timeouts), the copy cache with the context cache in RAM (abort), a 256 MB margin (real spill).
Needle data exists only for f16, q8_0 and q4_0, so the other cache types read "not measured".

**Caveats.** The stock baseline (Addendum 47) is one build on one night; at 256K, writing swings 23 to 45 tokens/s
with needle depth alone, so the 2,000-token ranking there is the least certain; and every pick that rests on one load
is marked in the table until Addendum 49 has run. The scores are unproven in our lab until the stock comparison has run.

## Addendum 49 (Nov 18, before any run): confirming the step pick

A review of the tables (the owner, Nov 18) points out that the step pick rests on single loads. Step 5120 as the
balance point and step 8192 as the fastest first word each come from 1 load per size (Addendum 36), and the 128K
writing gap that favours 5120 (63.2 against 59.6 at step 4096) is inside the 5 to 10% a single load can swing. Plan
`step-pick-confirm.json`, Brain Engine 15, 3 rounds, 27 loads: steps 4096, 5120, 6144 and 8192 at 128K, and 4096
to 8192 in 1024 steps at 256K, all with a 3.5 GB copy cache, q4_0 cache, 512 MB margin and pinning off (as Bob now
runs). Every pick cell that rests on 1 load is now marked in the averaged
table.

**Predictions, written before any run:** first word falls with the step at both sizes (8x3.5 quickest, 4x3.5 slowest)
by more than the spread between rounds. Writing at 128K: 5x3.5 within 5% of 4x3.5, so the writing gap seen before is
not real. 8x3.5 at 256K writes at least 30% slower than 5x3.5 (layers pushed off the card).

**What it decides:** the step Calibrate uses for 128K and 256K. If 5x3.5's first-word gain over 4x3.5 is smaller than
the spread between rounds, Calibrate keeps 4x4.

## Addendum 50 (Nov 18, before any run): firming up the quality gate

Addendum 48's gate leaves two holes. q4_0 passes the drift gate narrowly on one perplexity run of one 16K chunk, and
q5_1 and f8_e4m3 have no needle data, so their gate reads "not measured". Two plans, both waiting on approval:
- `perplexity-cache-rerun.json` (with `perplexity-grid.mjs`): f16 against q8_0 and q4_0 on 4x4 at 4K x 4 chunks and 8K x 2
  chunks of the same text, 6 chunks in all, instead of one 16K chunk (perplexity is exact, so rerunning the same chunk
  would only repeat the number);
- `needle-other-types.json`: the needle check for q5_1 and f8_e4m3 at 128K and 256K, 4 loads.

**Predictions, written before any run:** q4_0's mean KLD stays between 0.007 and 0.011, and its same-top rate stays
between 94% and 97%, so it may land on either side of the gate. q5_1 and f8_e4m3 find all 5 needles at both sizes.

## Addendum 51 (Nov 18, before the busy-desktop rerun and the step recheck): how ties are settled

Written before any of the runs it applies to (Addenda 45's 2-round busy rows on Brain Engine 17, 47, 49 and 50), so
"best" is fixed before the numbers are seen. Under Addendum 48, settings whose job times are within 3% of the quickest
are tied (job times from medians of at least 2 loads where we have them). A tie is settled by these, in order, and the first that differs decides:

1. **More free RAM during the timed runs** (the higher of each setting's lowest free system RAM). RAM is what a busy desktop squeezes
   (0.3 GB free at 256K).
2. **More free card memory after load.**
3. **The sooner first word.**

A setting missing a value loses that step. Code: `rank` and `tieBreak` in `model-lab/score-settings.mjs`.

The case this was written for: at 32K with 2x4, margins 512 and 1 GB have the same job time clean (16.6 against 16.8 s)
and busy (19.4 s both), on single loads, and the two criteria point opposite ways (512 keeps one more expert layer on
the card, so it leaves more RAM free; 1 GB leaves about 460 MiB more card free). If the 2-round busy rows separate them
by more than 3%, job time decides; if not, this order does. The same margin question also flips by setup on single
loads (with 4x4 q4_0, 512 wrote faster), which is more reason not to pick it after seeing the numbers.

