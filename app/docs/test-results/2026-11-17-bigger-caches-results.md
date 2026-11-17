# Bigger caches and bigger reading steps (Nov 17 2026), and the first cube-fix try

Method: `2026-11-16-speed-test-method.md`, Addenda 19 and 20. Card 16 GB, 32 GB RAM, stock Qwen3.6 35B A3B (Q4),
Brain Engine 10 (b12359 + patches to 0021), installed as Brain Engine 9's files with Brain Engine 10's laid over
them (the Brain Engine zip carries only the llama files; 0021 changes only those). Both runs were started from one
script on the owner's go, at 8:33 AM Mountain. Medians of 5 loads, with min and max. Read and write are tokens a second.

## Bigger caches and steps (Addendum 20): complete, 45 loads

| Row | Prompt | First word s | Read | Write |
|---|---|---|---|---|
| Y0 | start | 3.27 | 1190 (1157-1243) | 91.1 (85.8-91.3) |
| Y0 | 16K | 12.40 | 1326 (1260-1341) | 86.4 (82.9-87.2) |
| Y0 | 32K | 25.82 | 1271 (1231-1307) | 81.3 (77.7-81.8) |
| F4c | start | 1.76 | 2209 (2191-2283) | 109.1 (107.9-111.4) |
| F4c | 16K | 6.76 | 2436 (2300-2456) | 95.4 (92.0-95.8) |
| F4c | 32K | 14.26 | 2303 (2245-2372) | 102.3 (98.3-103.3) |
| F5c | start | 1.88 | 2071 (2053-2136) | 112.2 (109.3-114.2) |
| F5c | 16K | 7.19 | 2291 (2280-2358) | 90.4 (88.5-91.0) |
| F5c | 32K | 14.76 | 2225 (2218-2290) | 95.5 (93.6-96.3) |
| F6c | start | 1.99 | 1962 (1917-2047) | 112.4 (111.9-113.9) |
| F6c | 16K | 7.34 | 2243 (2212-2267) | 93.5 (91.5-94.5) |
| F6c | 32K | 15.22 | 2158 (2118-2196) | 90.9 (87.8-91.2) |
| X4c, X5c, X6c | all | failed: spilled | | |
| S5kc, S6kc | all | failed: spilled at every size | | |

**The spill rule, and what the data shows.** As recorded, the rule marked a run failed when shared GPU memory rose by
more than 512 MB during its load. That failed every run of X4c, X5c, X6c, S5kc and S6kc. Read from runs.jsonl, the
rise follows the reading step and nothing else (median MB): Y0 144, step 2048 336 (F4c, F5c, F6c), step 4096 592
(X4c, X5c, X6c), 5120 720 and 6144 848 (at every cache size from 5 GB down to 2 GB). A card overflowing would grow
with the cache. This doesn't, so it is working memory the bigger step always keeps in RAM (about 0.125 MB per token
of step), not a spill. The rule as written was wrong, and the runs it failed all finished cleanly. They are reported
below, and the decision is made both ways. Calibrate now judges each try against its own baseline: a cache try
against the same step without the cache (more than 512 MB extra fails), any other try against Normal (more than
1 GB extra fails).

| Row | Prompt | Read | Write | Shared rise MB |
|---|---|---|---|---|
| X4c | start / 16K / 32K | 3330 / 3503 / 3380 | 107.4 / 94.7 / 95.3 | 592 |
| X5c | start / 16K / 32K | 3173 / 3320 / 3187 | 105.6 / 83.9 / 96.2 | 592 |
| X6c | start / 16K / 32K | 3026 / 3263 / 3114 | 106.9 / 89.3 / 97.4 | 592 |
| S5kc (2 GB) | start / 16K / 32K | 3660 / 3789 / 3904 | 91.2 / 81.3 / 77.7 | 720 |
| S6kc (2 GB) | start / 16K / 32K | 3598 / 4361 / 4148 | 91.3 / 68.8 / 75.1 | 848 |

S5kc and S6kc ran at 2 GB in every round, after 5, 4 and 3 GB were also judged spilled by the recorded rule.
Bob's own app was open during part of the S rows (up to 6% of the processor).

**Cache per round** (hits / misses / MB copied): F4c 148,472 / 12,428 / 22,749; F5c 178,833 / 14,127 / 25,818;
F6c 179,754 / 13,257 / 24,202; X4c 178,425 / 14,488 / 26,482; S5kc 133,811 / 27,357 / 50,093; S6kc 128,307 /
32,899 / 60,277. The processor's share was 0% everywhere.

**Conditions.** Card max 49 to 57.6 °C, lowest core clock 2865 to 2887 MHz, processor max 62 to 70 °C, free RAM
2.6 to 3.3 GB (medians). Throttled share was 0 to 6.3%. Y0, F4c, F5c and F6c each had more than one throttled run on
16K and 32K, so per the method they are flagged to run again. The throttled share was small and the same across
rows, so the comparison between rows stands.

**Predictions (written before the run):**
- F5c and F6c write within 3% of F4c: **held on the start prompt** (+2.8%, +3.0%). **Missed at 32K**: they wrote
  6.6% and 11.1% slower.
- X5c and X6c read 32K slower than X4c: **held** (3187 and 3114 against 3380).
- S5kc and S6kc read 32K at most 15% faster than X4c: **missed** (15.5% and 22.7% faster). They write slower than
  X4c: **held** (18.5% and 21.2% slower at 32K).
- S6kc can't run at 5 GB: as recorded, held, but by a rule that measured the step, not the cache.

**Decision.**
- *As recorded* (rows with no failed run): F4c is both picks.
- *With the corrected spill reading* (what Calibrate now does): chat pick F4c (F5c and F6c write about 3% faster on
  the start prompt but slower at 32K, and read slower). Coding pick **X4c**: within 10% of the fastest writer on every
  prompt, and it reads 32K 47% faster than F4c (3380 against 2303). The S rows read faster still, but write 19 to 28%
  slower than the fastest writer, so they're out. **X4c stays the coding pick, as the first calibration found.**
- No cache over 4 GB is offered: X5c and X6c are slower than X4c, and F5c and F6c are slower than F4c at 32K.

## Cube fix (Addendum 19): stopped in round 1

The run stopped at round 1 on FT (the trace on, with F4c's settings). Brain Engine 10 stopped itself right after
reading the start prompt: `llama-moe-cache.cpp:934: GGML_ASSERT(sel->op == GGML_OP_RESHAPE) failed`. 0021's trace
path and the expert cache don't fit together yet. Only Y0, U0, T1 and F4c finished, once each:

| Row | Prompt | Read | Write |
|---|---|---|---|
| Y0 | start / 32K | 1118 / 1139 | 86.0 / 76.1 |
| U0 (fusion off) | start / 32K | 1106 / 1204 | 78.5 / 71.0 |
| T1 (trace) | start / 32K | 1145 / 1213 | 84.0 / 74.5 |
| F4c | start / 32K | 2238 / 2222 | 110.7 / 89.4 |

T1 wrote 2.3% (start) and 2.1% (32K) slower than Y0, against a rule of within 2%, on one run each. Words weren't compared.
Nothing is decided until the fix is rebuilt and the run is complete.

## Cache sweep (Addendum 22): 1 round, 15 setups, 11:39 to 11:52 AM Mountain

All 15 ran; none failed or was cut. Single runs, so a shortlist, not a decision. Read / write, tokens a second.
Rows marked * ran while the Claude app was open on the test PC (0.6 to 1.6 GB of RAM free; the rest had 2.3 to 2.9 GB).
Card max 58.5 to 64 °C; throttled share 0 to 17% (mostly on 32K).

| Step | Cache MB | Start | 16K | 32K | Hit rate |
|---|---|---|---|---|---|
| 4096 * | 4096 | 3189 / 78.5 | 2733 / 84.2 | 3141 / 91.4 | 92.5% |
| 4096 * | 3968 | 3277 / 83.3 | 3413 / 80.6 | 3316 / 88.3 | 87.6% |
| 4096 * | 3840 | 3359 / 88.0 | 3456 / 83.5 | 3356 / 91.6 | 87.8% |
| 4096 * | 3712 | 3392 / 87.0 | 3348 / 72.7 | 3208 / 76.1 | 86.7% |
| 4096 * | 3584 | 2714 / 85.5 | 3365 / 80.5 | 3306 / 77.1 | 86.1% |
| 5120 | 4096 | 2541 / 73.7 | 3327 / 82.2 | 3501 / 80.8 | 87.4% |
| 5120 | 3584 | 3308 / 81.3 | 3515 / 75.7 | 3580 / 80.4 | 84.8% |
| 5120 | 3072 | 3399 / 95.7 | 3528 / 74.2 | 3605 / 83.7 | 85.5% |
| 5120 | 2560 | 3468 / 92.9 | 3610 / 72.2 | 3628 / 83.4 | 84.3% |
| 5120 | 2048 | 3535 / 86.3 | 3522 / 74.0 | 3631 / 73.7 | 83.0% |
| 6144 | 4096 | 2460 / 89.9 | 3776 / 78.5 | 3732 / 75.8 | 88.6% |
| 6144 | 3584 | 3281 / 101.0 | 3999 / 76.1 | 3816 / 86.4 | 88.4% |
| 6144 | 3072 | 3404 / 82.3 | 4045 / 73.8 | 3895 / 78.8 | 83.0% |
| 6144 | 2560 | 3379 / 75.6 | 4103 / 69.6 | 3938 / 74.1 | 79.4% |
| 6144 | 2048 | 3545 / 88.7 | 4237 / 66.1 | 4035 / 72.7 | 79.6% |

**Predictions (Addendum 22):** hit rate falls less than 1.5 points from 4096 to 3584 at step 4096: **missed** (6.4
points, on rows run with Claude open). Step 5120 with 4 GB reads 32K 5 to 15% faster than X4096 and writes within 5%:
read +11.5% **held**, write 32K -11.6% **missed** (step-4096 rows not comparable). Steps 5120 and 6144 write fastest
with the biggest cache: **missed** (no clear order). No row judged a spill: **held**.

**Seen:** bigger steps read faster (6144 best on 16K and 32K); smaller caches write slower on 32K, 2 GB the worst.
The first setup of each step read the start prompt slowly (2460 to 2714), most likely the first load warming up.
Writing was lower everywhere than this morning's 5-run medians. Next: the shortlist (Addendum 23).

## Cube fix on Brain Engine 11 (Addendum 19 rerun): complete, 25 loads, 1 to 1:23 PM Mountain

brain-engine-11b12359 (0021 fixed), installed as Brain Engine 9's files with the zip laid over them, in the speed-test
folder only. Every load ran; FT (trace + cache), which stopped Brain Engine 10 in round 1, ran clean every time.
Medians of 5, first word s / read / write. The Claude app was opened for a moment in round 3 (Y0 or U0); free RAM
there (3.6 to 4.3 GB) was within the other rounds' range (3.0 to 4.6 GB), so no run is dropped.

| Row | Start | 32K |
|---|---|---|
| Y0 (plain) | 3.37 / 1157 / 91.6 | 26.4 / 1245 / 81.1 |
| U0 (fusion off) | 3.35 / 1162 / 82.9 | 26.7 / 1231 / 74.1 |
| T1 (trace) | 3.31 / 1178 / 87.9 | 26.2 / 1255 / 77.9 |
| F4c (4 GB cache) | 2.07 / 1878 / 110.1 | 14.1 / 2330 / 96.7 |
| FT (cache + trace) | 2.05 / 1898 / 108.1 | 14.2 / 2313 / 95.7 |

- Trace cost without the cache (T1 against Y0): writing -4.0% start, -3.9% 32K; reading +1.9%, +0.8%. **Misses** the
  within-2% rule.
- Trace cost with the cache (FT against F4c): writing -1.8%, -1.0%; reading +1.1%, -0.7%. **Within 2%.**
- Same words: T1 wrote Y0's answers on both prompts, FT wrote F4c's. **The trace no longer changes the words.** U0
  (fusion off) wrote different answers, as before.

## Head to head (Addendum 23, cut down): step 4096 + 4096 MB against step 6144 + 3584 MB, Brain Engine 11

5 rounds each, 10 loads, the Claude app and Bob closed, none failed; every row within about 3% min to max.
Median (min to max).

| | Step 4096 + 4096 MB | Step 6144 + 3584 MB |
|---|---|---|
| Start: first word / done s | 1.5 / 4.5 | 1.5 / 4.6 |
| Start: read / write | 2666 (2586-2729) / 99.3 (98.7-100.8) | 2671 (2567-2696) / 95.2 (95.1-96.0) |
| 16K: first word / done s | 4.9 / 8.0 | 4.2 / 8.2 |
| 16K: read / write | 3401 (3374-3426) / 95.2 (94.4-96.1) | 3933 (3823-3952) / 76.6 (74.1-77.0) |
| 32K: first word / done s | 9.7 / 12.9 | 8.4 / 11.8 |
| 32K: read / write | 3377 (3340-3383) / 94.5 (94.3-95.4) | 3902 (3821-3914) / 88.5 (88.0-88.7) |
| Free RAM | 3.5-4.0 GB | 3.2-3.7 GB |

On the start prompt both wrote the same answer in all 10 runs, so that writing comparison is like for like: step
4096 wrote 4.3% faster. On 16K and 32K the answers differed.

**Predictions (Addendum 23):** step 6144 reads 32K at least 10% faster than step 4096: **held** (+15.5%). Step 4096
writes 32K at least 5% faster: **held** (+6.8%). No spill: **held**.

**Decision:** Calibrate's rule (fastest reader within 10% of the top writer on every prompt) keeps step 4096 + 4 GB:
step 6144 + 3.5 GB writes 19.5% slower at 16K. Step 6144 + 3.5 GB answers 32K about 1.1 s sooner. The owner called
it a trade-off; the coding pick stays step 4096 + 4 GB.
