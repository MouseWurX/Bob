# Every speed setting tried, averaged (Qwen3.6 35B on the test PC)

Stock Qwen3.6 35B A3B, 16 GB card, 32 GB RAM, Nov 16 to 18 2026, Brain Engines 8 to 15. Each number is the average over the test runs counted in its row; each run is itself the median of its timed loads (1 to 5). **Bold** = best in that column for that context size. Speeds are tokens per second.

**Setting codes:** step (`-ub`) in thousands × copy cache in GB, so 2x4 is step 2048 with a 4 GB copy cache and 4x0 is step 4096 with none.

**Old codes, for earlier messages:** F4c = 2x4, X4c = 4x4, S6k3584 = 6x3.5, Y0 (Normal) = 0.5x0, F0 = 2x0, X0 = 4x0, S6k0 = 6x0, L1 = 6x4 lend, R1 = 4x4 R1, ub5120/7168/8192 = 5x3.5/7x3.5/8x3.5, ub512/1024/2048 (spill run) = 0.5x4/1x4/2x4, P0 and L0 = plain, MTP rerun = 4x2.

- **First word:** seconds until the first word appears.
- **Job time:** first word + the answer at the writing speed, in seconds. Shown for a 300-token answer (chat) and a 2,000-token one (long-form); the winner can change with the length, e.g. at 256K. Lower is better; **bold** is the quickest at 300 tokens. Gaps under 3% are ties.
- **Score:** baseline job time / this job time x 100, so 100 = the baseline and 250 = two and a half times faster. Baseline: stock llama.cpp b12359 with its own defaults (Addendum 47, Nov 18 evening) at 32K, 128K and 256K; Normal (0.5x0) at short; none at 64K. Settings that fail the quality gate (perplexity drift over 0.5%, a missed needle, or a load that aborts) should not be picked, whatever their score.
- **Reading / Writing:** tokens per second.
- **Experts in RAM:** of 41 layers, how many keep their experts in system RAM (fewer is better for writing).
- **Locked RAM:** the attention-mask buffer Windows shows as "shared GPU memory" (not a real spill; it was the "spill").
- **Perplexity change:** against the full-size f16 cache. Our speed settings themselves change nothing.
- **Load s:** seconds from engine start to ready, from the engine logs (Nov 18). Every Qwen3.6 35B load was 5.3 to 7.4 s at every size; '~6' means not measured for that row but the same brain. The first load after the file leaves memory takes 12.6 to 14 s. A busy desktop adds about 1 s.
- **Picks:** what we would choose today. Different engines and days are averaged together, so treat 1 to 3% gaps as noise.

## Short (Bob start prompt)

| Setting [code] | First word s | Reading | Writing | Experts in RAM | Locked RAM GB | Perplexity change | Load s | Job s (300 tokens) | Job s (2,000) | Score | Test runs averaged | Pick / note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Plain llama.cpp, its own defaults [plain] | - | 1,065 | 82.9 | - | - | 0% (reference build) | ~6 | - | - | - | 1 | Nov 16, Brain Engine 8 |
| Normal reading, Bob settings [0.5x0] | 3.3 | 1,167 | 90.7 | - | - | ~0% (q8 cache) | ~6 | 6.6 | 25.4 | 100 | 4 |  |
| Faster reading (step 2048) [2x0] | 1.3 | 2,657 | 84.0 | - | - | ~0% (q8 cache) | ~6 | 4.9 | 25.1 | 135 | 2 |  |
| Fastest reading (step 4096) [4x0] | **0.9** | 3,638 | 80.1 | - | - | ~0% (q8 cache) | ~6 | 4.6 | 25.9 | 143 | 2 |  |
| Faster reading + 4 GB copy cache [2x4] | 1.9 | 2,001 | **109.8** | - | - | ~0% (q8 cache) | ~6 | 4.6 | 20.1 | 143 | 4 | **CHAT PICK** |
| Fastest reading + 4 GB copy cache [4x4] | 1.4 | 3,005 | 96.1 | 29 | - | ~0% (q8 cache) | ~6 | 4.5 | 22.2 | 147 | 4 |  |
| Step 6144 + 3.5 GB copy cache [6x3.5] | 1.4 | 2,944 | 99.0 | - | - | ~0% (q8 cache) | ~6 | 4.4 | 21.6 | 150 | 3 |  |
| Step 6144, no copy cache [6x0] | 1.1 | **3,724** | 81.7 | - | - | not measured | ~6 | 4.8 | 25.6 | 138 | 2 |  |
| Lending the cache to reading [6x4 lend] | 1.3 | 2,998 | 104.2 | - | - | not measured | ~6 | **4.2** | 20.5 | 157 | 2 | shelved (refill cost) |
| Read layout [4x4 R1 (b8192)] | 1.2 | 3,380 | 82.1 | 29 | - | ~0% (q8 cache) | ~6 | 4.9 | 25.6 | 135 | 1 |  |
| MTP 2 ahead, step 4096 + 2 GB copy cache [4x2 MTP2] | 1.5 | 2,642 | 54.3 | 34 | - | +0.35% (q4 cache) | ~6 | 7.0 | 38.3 | 94 | 1 | MTP rerun |
| MTP 3 ahead, b8192/ub4096 + 2 GB copy cache [4x2 b8192 MTP3] | 1.3 | 3,040 | 64.9 | 34 | - | +0.35% (q4 cache) | ~6 | 5.9 | 32.1 | 112 | 1 | MTP rerun |
| No MTP, b8192/ub4096 + 2 GB copy cache [4x2 b8192 MTP off] | 1.1 | 3,414 | 66.8 | 29 | - | +0.35% (q4 cache) | ~6 | 5.6 | 31.0 | 118 | 1 | MTP rerun |

## 32K

| Setting [code] | First word s | Reading | Writing | Experts in RAM | Locked RAM GB | Perplexity change | Load s | Job s (300 tokens) | Job s (2,000) | Score | Test runs averaged | Pick / note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Normal reading, Bob settings [0.5x0] | 26.3 | 1,250 | 79.8 | - | - | ~0% (q8 cache) | ~6 | 30.1 | 51.4 | 100 | 5 |  |
| Faster reading (step 2048) [2x0] | 10.6 | 3,084 | 75.7 | - | - | ~0% (q8 cache) | ~6 | 14.6 | 37.0 | 207 | 2 |  |
| Fastest reading (step 4096) [4x0] | 7.9 | 4,167 | 73.5 | - | - | ~0% (q8 cache) | ~6 | 12.0 | 35.1 | 252 | 2 |  |
| Step 6144, no copy cache [6x0] | **7.2** | **4,593** | 74.5 | - | - | not measured | ~6 | **11.2** | 34.0 | 270 | 3 | fastest first word |
| Faster reading + 4 GB copy cache [2x4] | 14.1 | 2,323 | 98.3 | - | - | ~0% (q8 cache) | 6.3 | 17.2 | 34.4 | 176 | 5 | **CHAT PICK** |
| Fastest reading + 4 GB copy cache, q8 cache [4x4] | 10.2 | 3,222 | 94.0 | 29 | 0.6 | ~0% (q8 cache) | ~6 | 13.4 | 31.5 | 225 | 4 |  |
| 4x4, q4 cache, margin 1 GB [4x4 q4 fit1024] | 9.5 | 3,469 | 84.3 | 28 | 0.5 | +0.35% (q4 cache) | ~6 | 13.1 | 33.2 | 231 | 2 |  |
| 4x4, q4 cache, margin 512 MB [4x4 q4 fit512] | 9.3 | 3,541 | **100.6** | 27 | 0.5 | +0.35% (q4 cache) | 6.2 | 12.3 | 29.2 | 246 | 2 | **NEW CANDIDATE** |
| 2x4, pinning off [2x4 unpinned] | 13.6 | 2,411 | 97.0 | - | - | ~0% (q8 cache) | ~6 | 16.7 | 34.2 | 181 | 1 | same words as pinned |
| 4x4, q4 cache, margin 1 GB, pinning off [4x4 q4 unpinned] | 9.7 | 3,404 | 83.5 | 28 | 0.08 | +0.35% (q4 cache) | ~6 | 13.3 | 33.7 | 227 | 1 | same words as pinned |
| 4x4 q4 fit512, a quarter of misses on the processor [4x4 q4 fit512 share 0.25] | 9.3 | 3,539 | 92.8 | 27 | - | +0.35% (q4 cache) | ~6 | 12.5 | 30.9 | 242 | 1 |  |
| 4x4 q4 fit512, half of misses on the processor [4x4 q4 fit512 share 0.5] | 9.2 | 3,566 | 91.3 | 27 | - | +0.35% (q4 cache) | ~6 | 12.5 | 31.1 | 242 | 1 |  |
| Step 6144 + 3.5 GB copy cache [6x3.5] | 8.6 | 3,842 | 88.1 | - | - | ~0% (q8 cache) | ~6 | 12.0 | 31.3 | 252 | 4 |  |
| Lending the cache to reading [6x4 lend] | 9.0 | 3,688 | 92.6 | - | - | not measured | ~6 | 12.2 | 30.6 | 248 | 3 | shelved |
| Read layout [4x4 R1 (b8192)] | 10.0 | 3,293 | 92.5 | 29 | 0.6 | ~0% (q8 cache) | ~6 | 13.2 | 31.6 | 229 | 1 |  |
| MTP 2 ahead, step 4096 + 2 GB copy cache [4x2 MTP2] | 11.7 | 2,815 | 64.8 | 34 | - | +0.35% (q4 cache) | ~6 | 16.3 | 42.6 | 185 | 1 | MTP rerun |
| MTP 3 ahead, b8192/ub4096 + 2 GB copy cache [4x2 b8192 MTP3] | 13.0 | 2,535 | 58.4 | 34 | - | +0.35% (q4 cache) | ~6 | 18.1 | 47.2 | 167 | 1 | MTP rerun |
| No MTP, step 4096 + 2 GB copy cache [4x2 MTP off] | 10.1 | 3,273 | 69.5 | 29 | - | +0.35% (q4 cache) | ~6 | 14.4 | 38.9 | 210 | 1 | MTP rerun |
| 2x4, margin 512, clean desktop [2x4 fit512 clean] | 13.2 | 2,492 | 88.1 | 26 | - | ~0% (q8 cache) | 6.3 | 16.6 | 35.9 | 182 | 1 | real-desktop pass |
| 2x4, margin 1 GB, clean desktop [2x4 fit1024 clean] | 13.7 | 2,397 | 98.0 | 27 | - | ~0% (q8 cache) | 6.3 | 16.8 | 34.1 | 180 | 1 | real-desktop pass |
| 2x4, margin 512, BUSY desktop [2x4 fit512 busy] | 15.3 | 2,147 | 72.5 | 26 | - | ~0% (q8 cache) | 7.1 | 19.4 | 42.9 | 156 | 1 | browser + video open |
| 2x4, margin 1 GB, BUSY desktop [2x4 fit1024 busy] | 15.9 | 2,071 | 85.4 | 27 | - | ~0% (q8 cache) | 7.1 | 19.4 | 39.3 | 156 | 1 | browser + video open |
| Stock llama.cpp, its own defaults (f16 cache) [stock] | 26.6 | 1,234 | 83.8 | - | - | 0% (f16 cache) | 7.1 | 30.2 | 50.5 | 100 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads |
| Stock llama.cpp with Bob's settings, no copy cache [stock 4x0 q4 fit512] | 7.6 | 4,369 | 79.8 | - | - | +0.35% (q4 cache) | 7.1 | 11.4 | 32.7 | 265 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads |
| 4x4 q4, margin 512 (same run) [4x4 q4 fit512 (stock run)] | 9.6 | 3,440 | 98.5 | - | - | +0.35% (q4 cache) | 7.1 | 12.6 | 29.9 | 240 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads |
| 2x4 q8, margin 512 (same run) [2x4 fit512 (stock run)] | 13.5 | 2,434 | 84.2 | - | - | ~0% (q8 cache) | 7.1 | 17.1 | 37.3 | 177 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads |

## 64K

| Setting [code] | First word s | Reading | Writing | Experts in RAM | Locked RAM GB | Perplexity change | Load s | Job s (300 tokens) | Job s (2,000) | Score | Test runs averaged | Pick / note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4x4, q8 cache [4x4] | 20.3 | 3,037 | 74.3 | 30 | 0.8 | ~0% (q8 cache) | ~6 | 24.3 | 47.2 | - | 2 |  |
| 4x4, q4 cache [4x4 q4] | 19.7 | 3,126 | 68.5 | 29 | 0.8 | +0.35% (q4 cache) | ~6 | 24.1 | 48.9 | - | 1 |  |
| 4x4, q5_1 cache [4x4 q5_1] | 19.6 | 3,145 | 66.0 | 29 | 0.8 | +0.12% | ~6 | 24.1 | 49.9 | - | 1 |  |
| 4x4, f8 cache [4x4 f8_e4m3] | 19.8 | 3,116 | 71.1 | 30 | 0.8 | -0.12% | ~6 | 24.0 | 47.9 | - | 1 |  |
| 6x3.5, q8 cache [6x3.5] | 17.3 | 3,560 | 81.7 | 30 | 1.1 | ~0% (q8 cache) | ~6 | 21.0 | 41.8 | - | 2 | **BEST 64K** |
| 6x3.5, q4 cache [6x3.5 q4] | 16.6 | 3,725 | 72.9 | 29 | 1.1 | +0.35% (q4 cache) | ~6 | 20.7 | 44.0 | - | 1 |  |
| Step 6144, no copy cache [6x0] | **15.0** | **4,114** | 67.5 | - | - | not measured | ~6 | **19.4** | 44.6 | - | 1 |  |
| Lending the cache to reading [6x4 lend] | 17.6 | 3,503 | **86.7** | - | - | not measured | ~6 | 21.1 | 40.7 | - | 1 | shelved |
| Read layout [4x4 R1 (b8192)] | 18.0 | 3,422 | 85.6 | 30 | 0.8 | ~0% (q8 cache) | ~6 | 21.5 | 41.4 | - | 1 |  |

## 128K

| Setting [code] | First word s | Reading | Writing | Experts in RAM | Locked RAM GB | Perplexity change | Load s | Job s (300 tokens) | Job s (2,000) | Score | Test runs averaged | Pick / note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4x4, q8 cache [4x4] | 50.0 | 2,465 | 62.6 | 33 | 1.3 | ~0% (q8 cache) | ~6 | 54.8 | 81.9 | 253 | 3 |  |
| 4x4, f16 cache (full size) [4x4 f16] | 52.0 | 2,384 | 54.9 | - | - | 0% (reference) | ~6 | 57.5 | 88.4 | 241 | 1 |  |
| 4x4, q4 cache, margin 1 GB [4x4 q4] | 48.4 | 2,547 | 58.0 | 31 | 1.3 | +0.35% (q4 cache) | ~6 | 53.6 | 82.9 | 259 | 5 |  |
| 4x4, q4 cache, pinning off [4x4 q4 unpinned] | 48.4 | 2,543 | 57.8 | 31 | 0.08 | +0.35% (q4 cache) | ~6 | 53.6 | 83.0 | 259 | 1 | same words as pinned |
| 4x4 q4 fit512, a quarter of misses on the processor [4x4 q4 fit512 share 0.25] | 47.2 | 2,608 | 54.7 | 30 | - | +0.35% (q4 cache) | ~6 | 52.7 | 83.8 | 263 | 1 |  |
| 4x4 q4 fit512, half of misses on the processor [4x4 q4 fit512 share 0.5] | 47.3 | 2,605 | 62.6 | 30 | - | +0.35% (q4 cache) | ~6 | 52.1 | 79.2 | 266 | 1 |  |
| Step 4096, q4 cache, no copy cache [4x0 q4] | 40.6 | 3,034 | 55.7 | 22 | 1.2 | +0.35% (q4 cache) | ~6 | 46.0 | 76.5 | 302 | 1 | faster first word, lower writing |
| Step 4096, q4 cache, context cache in RAM [4x0 q4 nkvo] | 43.3 | 2,845 | 15.1 | 20 | 1.3 | +0.35% (q4 cache) | ~6 | 63.2 | 175.8 | 220 | 1 | dropped |
| 4x4, q4 cache, mask made on card (BE16) [4x4 q4 BE16 mask] | 48.4 | 2,545 | 57.9 | 31 | 1.2 | +0.35% (q4 cache) | ~6 | 53.6 | 82.9 | 259 | 1 | same words; no memory change |
| 4x4, q4 cache, margin 512 MB [4x4 q4 fit512] | 47.8 | 2,582 | 68.3 | 30 | 1.3 | +0.35% (q4 cache) | 6.0 | 52.2 | 77.1 | 266 | 2 | **BEST WRITING** |
| 4x4, q4 cache, margin 2 GB [4x4 q4 fit2048] | 50.4 | 2,442 | 57.2 | 32-33 | 1.3 | +0.35% (q4 cache) | ~6 | 55.6 | 85.4 | 250 | 2 | one of the 2 runs was 4x3.5 (step sweep) |
| Step 5120, q4 cache (margin 2 GB) [5x3.5 q4] | 45.5 | 2,706 | 63.2 | 33 | 1.6 | +0.35% (q4 cache) | 6.1 | 50.2 | 77.1 | 276 | 1 | **BALANCE PICK** (1 load only, recheck queued) |
| 6x3.5, q4 cache [6x3.5 q4] | 41.8 | 2,947 | 61.8 | 32-34 | 1.9 | +0.35% (q4 cache) | ~6 | 46.7 | 74.2 | 297 | 3 |  |
| 6x3.5, q8 cache [6x3.5] | 42.8 | 2,881 | 60.1 | 33 | 1.9 | ~0% (q8 cache) | ~6 | 47.8 | 76.1 | 290 | 3 |  |
| Step 7168, q4 cache [7x3.5 q4] | 41.6 | 2,961 | 58.3 | 35 | 2.2 | +0.35% (q4 cache) | ~6 | 46.7 | 75.9 | 297 | 1 |  |
| Step 8192, q4 cache [8x3.5 q4] | 40.8 | 3,019 | 54.1 | 36 | 2.5 | +0.35% (q4 cache) | ~6 | 46.3 | 77.8 | 300 | 1 | **FASTEST FIRST WORD** (1 load only, recheck queued) |
| Step 2048, q4 cache [2x4 q4] | 67.6 | 1,822 | 67.9 | 29 | 0.7 | +0.35% (q4 cache) | ~6 | 72.0 | 97.1 | 193 | 1 |  |
| 4x4, q5_1 cache [4x4 q5_1] | 48.8 | 2,523 | 46.0 | 32 | 1.3 | +0.12% | ~6 | 55.3 | 92.3 | 251 | 1 |  |
| 4x4, f8 cache [4x4 f8_e4m3] | 48.6 | 2,534 | 55.8 | 32 | 1.3 | -0.12% | ~6 | 54.0 | 84.4 | 257 | 1 |  |
| 4x4, K q8 / V q4 cache [4x4 q8/q4] | 49.2 | 2,501 | 49.9 | 32 | 1.3 | 0.0% | ~6 | 55.2 | 89.3 | 251 | 1 |  |
| Step 6144, no copy cache [6x0] | 37.9 | 3,248 | 53.1 | - | - | not measured | ~6 | 43.5 | 75.6 | 319 | 1 |  |
| Lending the cache to reading [6x4 lend] | 41.7 | 2,954 | 57.1 | - | - | not measured | ~6 | 47.0 | 76.7 | 295 | 1 | shelved |
| Read layout [4x4 R1 (b8192)] | 44.5 | 2,771 | 55.2 | 33 | 1.3 | ~0% (q8 cache) | ~6 | 49.9 | 80.7 | 278 | 1 |  |
| MTP 2 ahead, step 4096 + 2 GB copy cache [4x2 MTP2] | 55.3 | 2,225 | 54.9 | 34 | - | +0.35% (q4 cache) | ~6 | 60.8 | 91.7 | 228 | 1 | MTP rerun, 120K prompt |
| MTP 3 ahead, b8192/ub4096 + 2 GB copy cache [4x2 b8192 MTP3] | 54.7 | 2,252 | **70.6** | 34 | - | +0.35% (q4 cache) | ~6 | 58.9 | 83.0 | 236 | 1 | MTP rerun, 120K prompt |
| No MTP, b8192/ub4096 + 2 GB copy cache [4x2 b8192 MTP off] | 46.4 | 2,655 | 51.6 | 29 | - | +0.35% (q4 cache) | ~6 | 52.2 | 85.2 | 266 | 1 | MTP rerun, 120K prompt |
| Step 5120 q4, margin 512, clean desktop [5x3.5 q4 fit512 clean] | 42.1 | 2,929 | 65.9 | 30 | - | +0.35% (q4 cache) | 6.1 | 46.7 | 72.4 | 297 | 1 | real-desktop pass |
| Step 5120 q4, margin 1 GB, clean desktop [5x3.5 q4 fit1024 clean] | 42.7 | 2,882 | 59.8 | 31 | - | +0.35% (q4 cache) | 6.1 | 47.7 | 76.1 | 291 | 1 | real-desktop pass |
| Step 5120 q4, margin 512, BUSY desktop [5x3.5 q4 fit512 busy] | 49.0 | 2,515 | 57.8 | 30 | - | +0.35% (q4 cache) | 7.0 | 54.2 | 83.6 | 256 | 1 | browser + video open |
| Step 5120 q4, margin 1 GB, BUSY desktop [5x3.5 q4 fit1024 busy] | 50.3 | 2,451 | 51.0 | 31 | - | +0.35% (q4 cache) | 7.0 | 56.2 | 89.5 | 247 | 1 | browser + video open |
| Stock llama.cpp, its own defaults (f16 cache) [stock] | 134.1 | 918 | 63.6 | - | - | 0% (f16 cache) | 7.1 | 138.8 | 165.5 | 100 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads |
| Stock llama.cpp with Bob's settings, no copy cache [stock 5x0 q4 fit512] | 36.8 | 3,350 | 55.8 | - | - | +0.35% (q4 cache) | 7.1 | 42.2 | 72.6 | 329 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads; card throttled lightly, rerun queued |
| 5x3.5 q4, margin 512 (same run) [5x3.5 q4 fit512 (stock run)] | 43.7 | 2,822 | 63.9 | - | - | +0.35% (q4 cache) | 7.1 | 48.4 | 75.0 | 287 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads; card throttled lightly, rerun queued |
| Step 4096 recheck, q4, margin 512 [4x3.5 q4 fit512 (recheck)] | 47.0 | 2,619 | 60.4 | - | - | +0.35% (q4 cache) | 7.1 | 52.0 | 80.1 | 267 | 3 | step recheck (Addendum 49), median of 3 loads; light throttling, rerun queued |
| Step 5120 recheck, q4, margin 512 [5x3.5 q4 fit512 (recheck)] | 43.5 | 2,832 | 66.6 | - | - | +0.35% (q4 cache) | 6.1 | 48.0 | 73.5 | 289 | 3 | step recheck (Addendum 49), median of 3 loads; light throttling, rerun queued |
| Step 6144 recheck, q4, margin 512 [6x3.5 q4 fit512 (recheck)] | 40.9 | 3,010 | 56.5 | - | - | +0.35% (q4 cache) | 6.1 | 46.2 | 76.3 | 300 | 3 | step recheck (Addendum 49), median of 3 loads; light throttling, rerun queued |
| Step 8192 recheck, q4, margin 512 [8x3.5 q4 fit512 (recheck)] | 39.7 | 3,102 | 49.5 | - | - | +0.35% (q4 cache) | 6.1 | 45.8 | 80.1 | 303 | 3 | step recheck (Addendum 49), median of 3 loads; light throttling, rerun queued |
| Stock llama.cpp with Bob's settings, no copy cache (Addendum 53) [stock 5x0 q4 fit512 (A53)] | **36.1** | **3,417** | 56.6 | - | - | +0.35% (q4 cache) | 7.1 | **41.4** | 71.4 | 335 | 3 | copy-cache-long (Addendum 53), median of 3 loads; throttled lightly, rerun queued |
| 5x3.5 q4, margin 512 (Addendum 53) [5x3.5 q4 fit512 (A53)] | 42.3 | 2,914 | 66.3 | - | - | +0.35% (q4 cache) | 6.1 | 46.8 | 72.5 | 297 | 3 | copy-cache-long (Addendum 53), median of 3 loads; throttled lightly, rerun queued |
| 5x0 q4, margin 512, no copy cache (Addendum 53) [5x0 q4 fit512 (A53)] | 36.1 | 3,414 | 55.7 | - | - | +0.35% (q4 cache) | 7.1 | 41.5 | 72.0 | 334 | 3 | copy-cache-long (Addendum 53), median of 3 loads; throttled lightly, rerun queued |

## 256K

| Setting [code] | First word s | Reading | Writing | Experts in RAM | Locked RAM GB | Perplexity change | Load s | Job s (300 tokens) | Job s (2,000) | Score | Test runs averaged | Pick / note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4x4, q8 cache [4x4] | 156.1 | 1,630 | 35.4 | 38 | 2.3 | ~0% (q8 cache) | 5.5 | 164.6 | 212.6 | 232 | 3 |  |
| 4x4, q4 cache, margin 1 GB [4x4 q4] | 151.7 | 1,678 | 42.7 | 35 | 2.3 | +0.35% (q4 cache) | ~6 | 158.7 | 198.5 | 241 | 6 |  |
| 4x4, q4 cache, pinning off [4x4 q4 unpinned] | 152.6 | 1,666 | 45.3 | 35 | 0.08 | +0.35% (q4 cache) | ~6 | 159.2 | 196.8 | 240 | 2 | spill fix, Bob default on a branch |
| Step 4096, q4 cache, no copy cache [4x0 q4] | 133.9 | 1,899 | 39.0 | 26 | 2.2 | +0.35% (q4 cache) | ~6 | 141.6 | 185.2 | 270 | 1 | faster first word, lower writing |
| Step 4096, q4 cache, context cache in RAM [4x0 q4 nkvo] | 138.3 | 1,839 | 9.5 | 23 | 2.2 | +0.35% (q4 cache) | ~6 | 169.9 | 348.8 | 225 | 1 | dropped |
| 4x4, q4 cache, mask made on card (BE16) [4x4 q4 BE16 mask] | 150.8 | 1,687 | 45.8 | 35 | 2.2 | +0.35% (q4 cache) | ~6 | 157.4 | 194.5 | 243 | 1 | same words; no memory change |
| 4x4, q4 cache, margin 512 MB [4x4 q4 fit512] | 150.5 | 1,690 | 41.3 | 34 | 2.3 | +0.35% (q4 cache) | ~6 | 157.8 | 198.9 | 242 | 1 |  |
| Step 5120, q4 cache (margin 2 GB) [5x3.5 q4] | 127.9 | 1,989 | 39.5 | 37 | 2.8 | +0.35% (q4 cache) | 5.9 | 135.5 | 178.5 | 282 | 1 | **BALANCE PICK** (1 load only, recheck queued) |
| 6x3.5, q4 cache, margin 1 GB [6x3.5 q4] | 128.1 | 1,986 | 42.5 | 36 | 3.3 | +0.35% (q4 cache) | ~6 | 135.2 | 175.2 | 282 | 1 |  |
| 6x3.5, q4 cache, margin 512 MB [6x3.5 q4 fit512] | 128.7 | 1,977 | 43.1 | 35 | 3.3 | +0.35% (q4 cache) | 5.6 | 135.7 | 175.1 | 281 | 1 | **BEST ALL-ROUND** (1 load only, recheck queued) |
| 6x3.5, q4 cache, margin 2 GB [6x3.5 q4 fit2048] | 132.1 | 1,927 | 36.9 | 38 | 3.3 | +0.35% (q4 cache) | ~6 | 140.2 | 186.3 | 272 | 2 |  |
| 6x3.5, q8 cache [6x3.5] | 134.1 | 1,896 | 40.2 | 39 | 3.3 | ~0% (q8 cache) | ~6 | 141.6 | 183.9 | 270 | 2 |  |
| Step 7168, q4 cache [7x3.5 q4] | 123.5 | 2,060 | 33.6 | 40 | 3.9 | +0.35% (q4 cache) | ~6 | 132.4 | 183.0 | 288 | 1 | **FASTEST FIRST WORD** (1 load only, recheck queued) |
| Step 8192, q4 cache [8x3.5 q4] | 137.1 | 1,855 | 20.6 | 30 of 41 layers on card | 4.4 | +0.35% (q4 cache) | ~6 | 151.7 | 234.2 | 252 | 1 | too big |
| Step 2048, q4 cache [2x4 q4] | 189.5 | 1,342 | 43.6 | 32 | 1.2 | +0.35% (q4 cache) | ~6 | 196.4 | 235.4 | 194 | 1 |  |
| Step 1024, q4 cache [1x4 q4] | 255.7 | 994 | 43.5 | 30 | 0.6 | +0.35% (q4 cache) | ~6 | 262.6 | 301.7 | 145 | 1 |  |
| Step 512, q4 cache [0.5x4 q4] | 401.2 | 633 | 44.6 | 30 | 0.35 | +0.35% (q4 cache) | ~6 | 407.9 | 446.0 | 94 | 1 |  |
| Plain settings (step 512, f16 cache) [plain] | 368.9 | 689 | 47.9 | 28 | 0.35 | 0% (reference) | ~6 | 375.2 | 410.7 | 102 | 1 | best writing, slowest reading |
| 4x4, q5_1 cache [4x4 q5_1] | 153.0 | 1,662 | 26.6 | 36 | 2.3 | +0.12% | ~6 | 164.3 | 228.2 | 232 | 1 |  |
| 4x4, f8 cache [4x4 f8_e4m3] | 155.0 | 1,640 | 31.8 | 38 | 2.3 | -0.12% | ~6 | 164.4 | 217.9 | 232 | 1 |  |
| 4x4, K q8 / V q4 cache [4x4 q8/q4] | 155.1 | 1,639 | 28.0 | 36 | 2.3 | 0.0% | ~6 | 165.8 | 226.5 | 230 | 1 |  |
| Step 6144, no copy cache [6x0] | 118.5 | 2,147 | 37.7 | - | - | not measured | ~6 | 126.5 | 171.6 | 302 | 1 |  |
| Lending the cache to reading [6x4 lend] | 131.1 | 1,940 | 42.5 | - | - | not measured | ~6 | 138.2 | 178.2 | 276 | 1 | shelved |
| Read layout [4x4 R1 (b8192)] | 143.2 | 1,777 | 38.5 | 38 | 2.3 | ~0% (q8 cache) | ~6 | 151.0 | 195.1 | 253 | 1 |  |
| Step 5120 q4, margin 512, clean desktop [5x3.5 q4 fit512 clean] | 123.2 | 2,064 | 41.2 | 34 | - | +0.35% (q4 cache) | 5.9 | 130.5 | 171.7 | 293 | 1 | real-desktop pass |
| Step 5120 q4, margin 1 GB, clean desktop [5x3.5 q4 fit1024 clean] | 123.9 | 2,053 | 42.4 | 35 | - | +0.35% (q4 cache) | 5.9 | 131.0 | 171.1 | 292 | 1 | real-desktop pass |
| 6x3.5 q4, margin 512, clean desktop [6x3.5 q4 fit512 clean] | 127.1 | 2,002 | 43.0 | 35 | - | +0.35% (q4 cache) | 5.6 | 134.1 | 173.6 | 285 | 1 | real-desktop pass |
| 6x3.5 q4, margin 1 GB, clean desktop [6x3.5 q4 fit1024 clean] | 129.3 | 1,967 | 42.4 | 36 | - | +0.35% (q4 cache) | 5.6 | 136.4 | 176.5 | 280 | 1 | real-desktop pass |
| Step 5120 q4, margin 512, BUSY desktop [5x3.5 q4 fit512 busy] | 144.4 | 1,762 | 37.1 | 34 | - | +0.35% (q4 cache) | 7.2 | 152.5 | 198.3 | 250 | 1 | browser + video open |
| Step 5120 q4, margin 1 GB, BUSY desktop [5x3.5 q4 fit1024 busy] | 143.0 | 1,779 | 37.2 | 35 | - | +0.35% (q4 cache) | 7.2 | 151.1 | 196.8 | 253 | 1 | browser + video open |
| 6x3.5 q4, margin 512, BUSY desktop [6x3.5 q4 fit512 busy] | 145.2 | 1,751 | 37.4 | 35 | - | +0.35% (q4 cache) | ~6 | 153.2 | 198.7 | 249 | 1 | browser + video open |
| 6x3.5 q4, margin 1 GB, BUSY desktop [6x3.5 q4 fit1024 busy] | 145.6 | 1,747 | 37.2 | 36 | - | +0.35% (q4 cache) | ~6 | 153.7 | 199.4 | 248 | 1 | browser + video open |
| Stock llama.cpp, its own defaults (f16 cache) [stock] | 375.7 | 677 | **48.1** | - | - | 0% (f16 cache) | 6.0 | 381.9 | 417.3 | 100 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads |
| Stock llama.cpp with Bob's settings, no copy cache [stock 6x0 q4 fit512] | 117.7 | 2,162 | 38.5 | - | - | +0.35% (q4 cache) | 7.1 | 125.5 | 169.6 | 304 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads; card throttled lightly, rerun queued |
| 6x3.5 q4, margin 512 (same run) [6x3.5 q4 fit512 (stock run)] | 127.8 | 1,991 | 42.3 | - | - | +0.35% (q4 cache) | 7.1 | 134.9 | 175.1 | 283 | 2 | stock-vs-picks, Nov 18 evening, median of 2 loads; card throttled lightly, rerun queued |
| Step 4096 recheck, q4, margin 512 [4x3.5 q4 fit512 (recheck)] | 148.4 | 1,713 | 41.7 | - | - | +0.35% (q4 cache) | 7.1 | 155.6 | 196.4 | 245 | 3 | step recheck (Addendum 49), Nov 18 evening, median of 3 loads |
| Step 5120 recheck, q4, margin 512 [5x3.5 q4 fit512 (recheck)] | 126.3 | 2,014 | 40.3 | - | - | +0.35% (q4 cache) | 6.1 | 133.7 | 175.9 | 286 | 3 | step recheck (Addendum 49), median of 3 loads; light throttling, rerun queued |
| Step 6144 recheck, q4, margin 512 [6x3.5 q4 fit512 (recheck)] | 127.6 | 1,994 | 42.2 | - | - | +0.35% (q4 cache) | 6.1 | 134.7 | 175.0 | 284 | 3 | step recheck (Addendum 49), median of 3 loads; light throttling, rerun queued |
| Step 7168 recheck, q4, margin 512 [7x3.5 q4 fit512 (recheck)] | 119.3 | 2,131 | 35.4 | - | - | +0.35% (q4 cache) | 6.1 | 127.8 | 175.8 | 299 | 3 | step recheck (Addendum 49), median of 3 loads; light throttling, rerun queued |
| Step 8192 recheck, q4, margin 512 [8x3.5 q4 fit512 (recheck)] | 133.1 | 1,911 | 37.2 | - | - | +0.35% (q4 cache) | 6.1 | 141.2 | 186.9 | 270 | 3 | step recheck (Addendum 49), Nov 18 evening, median of 3 loads |
| Stock llama.cpp with Bob's settings, no copy cache (Addendum 53) [stock 6x0 q4 fit512 (A53)] | **117.2** | **2,170** | 38.7 | - | - | +0.35% (q4 cache) | 6.1 | **125.0** | 168.9 | 306 | 3 | copy-cache-long (Addendum 53), median of 3 loads; throttled lightly, rerun queued |
| 6x3.5 q4, margin 512 (Addendum 53) [6x3.5 q4 fit512 (A53)] | 126.7 | 2,008 | 42.4 | - | - | +0.35% (q4 cache) | 6.1 | 133.8 | 173.9 | 285 | 3 | copy-cache-long (Addendum 53), median of 3 loads; throttled lightly, rerun queued |
| 6x0 q4, margin 512, no copy cache (Addendum 53) [6x0 q4 fit512 (A53)] | 117.7 | 2,162 | 38.8 | - | - | +0.35% (q4 cache) | 6.1 | 125.4 | 169.2 | 305 | 3 | copy-cache-long (Addendum 53), median of 3 loads; throttled lightly, rerun queued |

## Not in the table yet

- Brain Engine 17 (no mask table, with the fix that lets it work on this brain) and a busy-desktop pass on it: queued.
- Stock llama.cpp at 32K/128K/256K against the picks, with load times (Addendum 47): queued after Engine 17.
- 120B soft cut: paused, waiting on approval.

Sources: results/2026-11-18-calibrate-results.md and all-speed-tables.txt in this folder; method in the repo's speed-test method doc (Addenda 1 to 47).
