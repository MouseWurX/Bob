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
