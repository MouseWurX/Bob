# Every test rig so far: speeds, settings and job scores (Nov 16 to 27, 2026)

One page for every machine Bob's engine has run on: the test PC, rented cloud cards, a 6 GB laptop and a handheld.
Each row gives the card, the engine build, the brain and its quant, the context, the chat memory (KV cache) type,
the reading step (`-b` / `-ub`), the speed, the job scores, any crash, and the card's heat and clock where we logged them.

**Rules for this page**

- Only numbers we measured. Anything estimated says so. Blank or "not logged" means we don't have it.
- **Lamplight** is our build of llama.cpp: upstream **b12359** plus our patches. A build is named LL&lt;N&gt;b12359.
  With its features off, Lamplight gives the same words and speed as plain llama.cpp (within 1%, [Nov 17](2026-11-17-speed-test-results.md)).
  **We don't claim Lamplight is faster than llama.cpp.** The speed-ups below come from settings, and plain llama.cpp
  with the same settings is just as fast (see the test PC table).
- Speeds are **tokens per second**. *Read* = reading the prompt. *Write* = writing the answer.
- Rented runs used RunPod. Pod ids, paths, keys and personal details are left out.
- "Unproven in our lab, as we have yet to test" means exactly that.

## The rigs

| Rig | Card (memory) | Where | What ran on it |
|---|---|---|---|
| Test PC ("replicant matrix") | RTX 5070 Ti (16 GB), Ryzen 7 9800X3D, 32 GB DDR5 | home, Windows 11 | speed settings, Nov 16 to 18 |
| L40S | 48 GB | rented | Bob's held-out jobs for 8 brains; upstream picks A/B |
| L4 | 24 GB | rented | Saluki 27B check; first release test |
| RTX 4090 | 24 GB | rented | Ternary Bonsai check; GSQ rounding pilot; Turbo matrix (results not back yet) |
| RTX 5090 | 32 GB | rented | FP4 experts screen |
| RTX PRO 6000 | 96 GB | rented | Flash-Next "Bill" cut file sizes (quality only) |
| H200 NVL | 141 GB | rented | Flash-Next cut "redirect" study (jobs only) |
| RTX 2000 Ada | 16 GB | rented | second release test |
| Laptop | RTX 3060 Laptop (6 GB), 32 GB RAM | home, Windows | small-card brains; chat cache check |
| Handheld | Legion Go, Ryzen Z1 Extreme, 780M graphics, 16 GB shared | home, Windows | processor and Vulkan runs |

An A40 and an A100 were rented earlier in November for cut-making only. They gave no speed numbers, so they aren't below.

---

## 1. Test PC: Qwen3.6 35B speed settings (RTX 5070 Ti 16 GB)

- **Brain:** stock Qwen3.6 35B A3B, unsloth **UD-Q4_K_XL** (22.4 GB, so part of the experts sit in RAM).
- **Engine:** Lamplight LL8 to LL15 (b12359), and plain llama.cpp b12359 for the yardstick.
- **Setting codes:** reading step (`-ub`, in thousands) × copy cache (GB of hot experts kept on the card). `2x4` = `-b 2048 -ub 2048` with a 4 GB copy cache.
  `q4` = q4_0 chat memory (q8_0 otherwise), `fit512` = 512 MB spare on the card.
- Each number is an average of 1 to 5 runs; each run is the median of its timed loads. Full tables:
  [calibration](2026-11-17-calibration-results.md), [speed test](2026-11-17-speed-test-results.md).
- **Heat:** card peak 64 °C in the 85-load calibration; light throttling is marked in those pages. Nov 18 rows
  marked "throttled" there have reruns queued. Throttle reasons were not logged yet (that rule started Nov 26).

| Context | Setting | Chat memory | Read | Write | First word (s) | Note |
|---|---|---|---|---|---|---|
| short | plain llama.cpp, its own defaults | f16 | 1,065 | 82.9 | - | 1 run |
| short | 2x4 | q8_0 | 2,001 | **109.8** | 1.9 | chat pick |
| short | 6x0 | q8_0 | **3,724** | 81.7 | 1.1 | fastest reading |
| 32K | plain llama.cpp, its own defaults | f16 | 1,234 | 83.8 | 26.6 | yardstick |
| 32K | **plain llama.cpp** with Bob's settings, 4x0 q4 fit512 | q4_0 | 4,369 | 79.8 | 7.6 | same settings, no Lamplight |
| 32K | 2x4 | q8_0 | 2,323 | 98.3 | 14.1 | chat pick |
| 32K | 4x4 q4 fit512 | q4_0 | 3,541 | **100.6** | 9.3 | candidate |
| 32K | 6x0 | q8_0 | **4,593** | 74.5 | 7.2 | fastest first word |
| 128K | plain llama.cpp, its own defaults | f16 | 918 | 63.6 | 134.1 | yardstick |
| 128K | **plain llama.cpp** with Bob's settings, 5x0 q4 fit512 | q4_0 | 3,350 | 55.8 | 36.8 | light throttling |
| 128K | 4x4 q4 fit512 | q4_0 | 2,582 | **68.3** | 47.8 | best writing |
| 128K | 5x3.5 q4 | q4_0 | 2,706 | 63.2 | 45.5 | balance pick, 1 load |
| 128K | 8x3.5 q4 | q4_0 | **3,019** | 54.1 | 40.8 | fastest first word, 1 load |

- **Chat memory cost:** perplexity against f16 chat memory: q8_0 ~0%, q5_1 +0.12%, q4_0 +0.35%.
- **Crashes:** none. The live expert trace (G4) changed words and cost 11% writing, so it was dropped.
- **What it shows:** the big win is reading speed from a larger step (2.5x to 3.4x). The copy cache helps writing
  by 12 to 28% when the brain doesn't fit the card. Plain llama.cpp with the same step reads just as fast.

## 2. Bob's held-out jobs, 8 brains (rented L40S 48 GB)

- **Engine:** Lamplight LL46 + patches 0123 to 0125 (104 patches on b12359). Built on the pod with CUDA arch 89.
- **Same for every brain:** 4 slots of 32K each (131,072 total; Raon 1 mini 4 × 64K), `-ngl 99`,
  `-b 2048 -ub 512` (llama-server defaults), no MTP. Thinking off for the speed reading.
- **Jobs:** Bob's own held-out sets: inbox 28, office 14, repo 12, web 11 (65 in all). Never trained or tuned on.
  Office ran on a second L40S rental after a harness fix (office jobs ran 0 of 14 on the first pod; that was our kit, not the brains).
- **Speed:** one 512-token answer, temperature 0, thinking off, first pod.
- **Heat:** card 44 to 65 °C and 2,520 MHz after each brain, 100 to 122 W. Throttle reasons not logged in this kit.

| Brain | Quant (file size) | Chat memory | Read | Write | Inbox | Office | Repo | Web | **Total /65** | Bad tool calls (shape) | Crashes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Inkling 2 Mini | UD-Q4_K_M (16.6 GB) | f16 | 127.0 | 67.8 | 24 | 14 | 12 | 9 | **59** | 2 | none |
| ISTA Qwen3.8 27B GSQ-RCO | IQ2_XS (8.4 GB) | q8_0 | 104.2 | 64.4 | 25 | 14 | 11 | 8 | **58** | 2 | none |
| Ternary Bonsai 2.5 27B | PTQ1_0 (6.0 GB) | q8_0 | 147.7 | 78.9 | 25 | 14 | 10 | 8 | **57** | 0 | none |
| Ternary Bonsai 2.5 27B | Q2_0 (7.7 GB) | q8_0 | 156.8 | 68.5 | 23 | 14 | 12 | 8 | **57** | 1 | none |
| Underdog Saluki 27B | IQ2 mix (7.9 GB) | q8_0 | 133.4 | 67.0 | 23 | 14 | 9 | 10 | **56** | 5 | none |
| Qwen3.6 35B A3B (Bob's default) | UD-Q4_K_XL (22.9 GB) | f16 | 206.8 | 151.9 | 22 | 13 | 8 | 6 | **49** | 6 | 1 job error, no crash |
| Raon 1 mini | Q4_K_M (19.7 GB) | f16 | 152.0 | 110.0 | 21 | 10 | 5 | 9 | **45** | 15 | none |
| Raon 1 nano | Q4_K_M (2.1 GB) | f16 | 151.7 | 45.4 | 7 | 4 | 1 | 3 | **15** | 2 | none |

- No brain caused harm in the inbox jobs (harm 0 for all).
- The speeds are on a 48 GB card where every brain fits. They are not what a 6, 12 or 16 GB card gets.

## 3. Upstream llama.cpp picks, A/B (rented L40S 48 GB)

- **Engine:** Lamplight LL46 + 0123 to 0134 (110 patches). **Brain:** Qwen3.6 35B A3B MTP, UD-Q4_K_XL, `--spec-type draft-mtp`.
- 4 slots × 32K, f16 chat memory, `-b 2048 -ub 512`. Card 54 to 55 °C, 2,520 MHz.

| Row | Read | Write | Inbox | Office | Repo | Web | Total /65 | Shape faults | Repeat-guard stops | MTP accepted |
|---|---|---|---|---|---|---|---|---|---|---|
| A, new keys off | 108.3 | 177.5 | 18 | 13 | 8 | 4 | 43 | 6 | 2 | 81% |
| B, 4 new keys on | 101.6 | 177.5 | 21 | 13 | 6 | 6 | 46 | 4 | 10 | 84% |

- No crashes and no broken tool calls in either row. MTP wrote 17% faster than the no-MTP row in section 2 (177.5 against 151.9), but read about half as fast.
- The scores are level (inside the spread of three runs). Row B had 5 times as many repeat-guard stops, so **the new keys stay off**. Round 2 splits the keys to find which one does it.

## 4. Saluki 27B and ISTA 27B checks (rented L4 24 GB)

- **Engine:** Lamplight LL46 (101 patches) against plain llama.cpp b12359. **Brain:** Underdog Saluki 27B, IQ2 mix (7.9 GB).
- **Same words:** 3 of 3 prompts gave the same text in both engines. Perplexity (8 × 512): Lamplight 9.0439, plain 9.0311 (+0.14%, cause not found yet).
- **Speed** (`llama-bench`, `-ngl 99 -fa 1`, f16 chat memory, default `-b 2048 -ub 512`, 3 repeats). Card 49 °C before, 66 °C and 2,040 MHz after:

| Depth already in the chat | Read (pp512) | Write (tg128) |
|---|---|---|
| 0 | 809 | 24.4 |
| 16K | 710 | 22.1 |
| 64K | 505 | 17.9 |

- **Long recall:** a code word in the middle of 103,066 tokens, 128K context, q8_0 chat memory: found. Read 536, write 12.1 t/s.
- **Tool jobs:** 12 of 12 for Saluki and for ISTA IQ2_XS (32K, q8_0). The kit scored one "round trip" as a fail, but the grader missed a Unicode minus sign.
- **What fits a 16 GB card** (15,360 MB budget, measured on the card):

| Context | f16 | q8_0 | q4_0 |
|---|---|---|---|
| 64K | 11,930 MB, fits | 10,230 MB, fits | 9,206 MB, fits |
| 128K | 16,090 MB, too big | 12,726 MB, fits | 10,678 MB, fits |
| 256K | won't load on 24 GB | 17,718 MB, too big | 13,622 MB, fits |

## 5. Ternary Bonsai 2.5 27B check (rented RTX 4090 24 GB)

- **Engine:** Lamplight with patch 0124 (104 patches), against PrismML's own llama.cpp fork.
- **Same words:** 3 of 3 prompts gave the same greedy text as the fork, for both PTQ1_0 and Q2_0.
- **Card kernels:** PTQ1_0 on the card matches the processor (MUL_MAT 16 of 16, GET_ROWS 10 of 10).
- **Perplexity** (8 × 512): PTQ1_0 9.9818 (fork 9.9736); Q2_0 9.9818 (fork 9.9837).
- Speed here was a 5-token check only, so it isn't a speed result. Use section 2.

## 6. FP4 experts screen (rented RTX 5090 32 GB)

- **Engine:** llama.cpp b12359, built on the pod. **Brain:** Qwen3.6 35B A3B in four files. `-ngl 99 -fa 1 -ub 2048`, f16 chat memory.
- **Quality:** KL divergence against Q8_0 (lower is better) and how often the top word matches.

| File | Size | KLD vs Q8_0 | Same top word | Read (4K) | Read (32K) | Write |
|---|---|---|---|---|---|---|
| UD-Q4_K_XL (shipped) | 20.8 GiB | **0.011** | **95.9%** | 19,454 | 16,921 | 287 |
| Q4_K_M | 19.7 GiB | 0.036 | 92.2% | 18,752 | 16,324 | **334** |
| MXFP4 experts, 8-bit activations | 18.4 GiB | 0.030 | 93.3% | 18,651 | 16,319 | 284 |
| MXFP4 experts, stock 4-bit activations | 18.4 GiB | 0.063 | 89.8% | **20,287** | **17,602** | 284 |

- Needle test: 3 of 3 for MXFP4 and Q4_K_M. Heat logged once: 45 °C, 2,917 MHz.
- **Verdict:** MXFP4 failed Bob's real-jobs gate (office 33 of 36, and one harmful inbox step). We kept UD-Q4_K_XL.

## 7. Cut files and rounding (rented RTX PRO 6000, RTX 4090, H200)

These are quality runs on files we make, not speed runs.

- **Bill (Flash-Next cut) mixed-bit sizes, RTX PRO 6000:** KLD against Bill's Q8_0 (wikitext-2).
  IQ2_XXS 50.30 GB: 2.44, fails our gate. IQ2_M 53.56 GB: 1.34. **MX2_S 51.93 GB: 1.02, passes** (smaller and better than IQ2_M).
  MX2_M 54.08 GB: 0.82. MX3_S 58.68 GB: 0.59.
- **Exact-size bit picker (RCO-style), RTX PRO 6000, Nov 27:** RC2_A 4.22 against IQ2_XXS 2.43; RC2_S 3.56 against MX2_S 1.01. **Lost.** MX2_S stays.
- **GSQ rounding pilot, RTX 4090, Qwen3-1.7B:** smarter 2-bit rounding, same file size. KLD against the full brain:

| What was rounded to q2_0 | Stock rounding | GPTQ | GSQ |
|---|---|---|---|
| down layers only | 3.357 | 0.382 | **0.320** |
| every feed-forward layer | 12.33 | 0.881 | **0.669** |

  Stock q2_0 at every layer wrote nonsense; GSQ kept answers on track ("The capital of France is Paris…").
- **Flash-Next 80% cut with "redirect", H200 NVL:** 15 slots, 720K context in all. Office: full 13, 80% cut 12, cut with redirect 13 of 14.
  Inbox items found: full 90 of 117, cut 85, redirect 64. Redirect lost, so it isn't used.

## 8. Laptop (RTX 3060 Laptop 6 GB, 32 GB RAM)

- **Inkling 2 Mini, Lamplight LL90:**

| Quant | Settings | Read | Write | Card peak | Note |
|---|---|---|---|---|---|
| Q2_K_XL | `--fit on --fit-target 512 --no-op-offload -ub 256` | 29 | 11.9 | 5.02 GB | best on this card |
| IQ3_XXS | `--cpu-moe --no-op-offload -ub 256` | 12 to 28 | 9 to 10 | 4.46 GB | clean words |
| IQ3_XXS | `--cpu-moe` only | - | - | 5.9 GB | the reading buffer took 8.4 GB; always add `--no-op-offload -ub 256` |

  Q4_K_M didn't fit in RAM; `-ub 512` and 128K didn't fit on the card. Context and chat memory type for these rows weren't recorded.
- **Per-chat engine cache check, Bob 1.5.255, LL45, Qwen3 4B, 32K, a 20K-token chat:** cold read 20.4 s. Next question in the same chat:
  14.7 s with the cache off, **0.8 to 1.6 s on**. After a Bob restart: 4.8 s including the brain load. Same words both ways. Free RAM stayed above 9.2 GB.
- Heat and clocks weren't logged for the laptop rows.

## 9. Handheld (Legion Go, Z1 Extreme, 780M graphics, 16 GB shared)

- **Inkling 2 Mini Q2_K_XL, LL90, processor only** (`-ngl 0 --cache-ram 0 -ub 128`, Claude app closed): **read 15.8, write 10.6**, clean answer.
  Lowest free RAM 0.81 GB, 92 °C. On the graphics (`-ngl 8`): 7 t/s and 7 GB of shared memory, so Inkling stays on the processor here.
- **Vulkan, LL102 test build, whole brain on the graphics (`-ngl 99`):** gemma4 E2B about 1,850 read / 42 write; Qwen3.5 2B 1,147 / 53.
  The two Vulkan speed patches (0102, 0103) gave identical words; speed changes were within noise, except +6% reading at 4K with `-ngl 12`.
- **`--load-mode mmap`:** lossless saving: shared graphics memory 3.49 → 1.22 GB on gemma4 E2B at 12 layers, same speed and words.
- **Saluki 27B (LL46, Vulkan):** loads, but needs about 8.2 GB, and only 7.7 to 8.4 GB was free with the Claude app open. All 3 placements stopped at our memory floor. No speed yet.
- **Inkling + DSpark drafter:** not run. 8.72 GB free, under the 9 GB the run needs.
- Safe range we measured: keep 1.5 GB of RAM free, stop under 1.0 GB, stop above 95 °C, never `--fit` or `--no-host` on built-in graphics.

## 10. Release test: Bob 1.5.255 starting its own engine (rented L4, then RTX 2000 Ada 16 GB)

- **What it tests:** Bob 1.5.255 on a clean machine, with its own default settings, starting Lamplight LL46 on Qwen3.6 35B UD-Q4_K_XL.
  Bob's chosen settings were: 256K context, q8_0 chat memory, `--fit on`, `-b 6144 -ub 6144`, a 4 GB copy cache, 1 slot, an 8 GB RAM prompt cache.
- **Result: failed, twice.** The engine stopped while loading (exit code 127), and no jobs ran.
  The engine said a library file it needs (`libllama-server-impl.so`) was missing. No memory kill was logged, and turning off patch 0109 didn't change it.
- **Cause, found Nov 27:** a real Linux bug. LL46's Linux engine looked for its libraries only in the folder it was built in,
  and Bob started it without pointing it at its own folder. The shipped engine fails the same way from any other folder.
- **Fix:** in the 1.5.255 release, Bob puts the engine's own folder first on `LD_LIBRARY_PATH` for every engine start on Linux and Android.
  The third try installs the engine through Bob's own installer, exactly as a Linux user gets it.
- The 1.5.255 release waits until the third try passes.

---

## What's missing

- **Results not back yet:** the Turbo matrix (RTX 4090), the GPU tier sweep (simulated 8 and 12 GB cards, A5000, 4090, 5090, A40, processor-only),
  wave 1 and wave 2 brain jobs (more catalog brains), the hard maths dial and direction runs, and upstream A/B round 2.
- **Real 8 and 12 GB cards:** RunPod doesn't rent them, so they are unproven in our lab, as we have yet to test. The only 16 GB speeds are from the test PC; the rented 16 GB card ran only the release test, which failed before any jobs.
- **Heat:** the rentals logged the card's heat and clock before and after each run. Throttle reasons are only logged from Nov 26 kits on.
  The laptop rows have no heat or clock data.
- **Settings not recorded:** context and chat memory type for the laptop and handheld Inkling rows. The quant for the handheld gemma4 E2B and Qwen3.5 2B rows.
- **Same brain, every card:** Bob's default brain hasn't run the held-out jobs on the test PC, the laptop or the handheld yet. The test PC has been away since Nov 24.
- **Not tested at all:** AMD and Intel desktop cards, Mac, Android phones with big brains, and the Raspberry Pi. All unproven in our lab, as we have yet to test.
