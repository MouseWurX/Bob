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
