# GPU tier sweep: plan (24 Nov 2026)

Goal: turn the README's "unproven in our lab" hardware rows into tested rows, using Bob's defaults only.

## 1. What we already have

| Tier | Real numbers? | What they are |
|---|---|---|
| 16 GB card (RTX 5070 Ti, home PC, Windows) | **Yes, Bob's defaults** | Qwen3.6 35B-A3B, 256K, about 90 to 95 tokens/s in everyday chats |
| 6 GB card (RTX 3060 laptop, Windows) | **Partly** | GUPPI pass (25 s against 27 s for Bob's pick, no spill); Inkling 2 Mini 11.9 tokens/s. No plain "Get Bob ready, defaults only" run yet |
| Built-in graphics (16 GB AMD handheld) | **Yes, Bob's defaults** | Qwen3 4B 22 to 28, Gemma 4 E2B 42 to 46, Qwen3.5 2B about 50 tokens/s |
| 32 GB (rented RTX 5090, Linux) | Engine only | Qwen 35B UD-Q4_K_XL: reading 19,454 t/s at 4K, 16,921 at 32K; writing 287 t/s (FP4 study, ch04). Lab flags, not Bob's pick |
| 48 GB (A40, RTX A6000, L40S, RTX 6000 Ada) | Lab runs only | About 40 rentals: tool interviews, real jobs, lesson writing. All with lab flags (8 slots, 384K), not Bob's defaults; few speeds logged |
| 80 GB and up (A100, H100, H200, RTX PRO 6000) | Lab runs only | Training, cuts, scans. Not a home tier |
| 8 GB, 12 GB, 24 GB, processor only, Pi | **None** | |

So no past rental tested what a person gets after **Get Bob ready**. The sweep below does.

## 2. Two things found on the way

- **The README's 8 GB row is wrong.** In 1.5.254's `catalog.json`, the 8 GB set's everyday brain (the `bob` slot) is **Gemma 4 E4B**. The Qwen3.6 35B Q3 file is in that set too, but only as the coding brain (the `tinker` slot). PR #336's README row says the Q3 file is the everyday brain. Either the row or the set has to change before release. Sent to the README thread.
- **RunPod rents no 8, 12 or 16 GB card as a Pod** (12 Nov price page). The smallest are 24 GB: RTX A5000 $0.27/h, RTX 3090 $0.50/h, L4 $0.69/h, RTX 4090 $0.89/h. So 8 and 12 GB have to be **simulated** on a 24 GB card (below), or rented elsewhere.

## 3. The sweep

| Run | Card | Rate | Bob picks (1.5.254) | Cap |
|---|---|---|---|---|
| 8 GB, simulated | RTX A5000 24 GB (3090 if none) | $0.27/h | 8 GB set: Gemma 4 E4B | 1.5 h / $2.50 |
| 12 GB, simulated | RTX A5000 24 GB (3090 if none) | $0.27/h | 16 GB set: Qwen3.6 35B, part in memory | 1.5 h / $2.50 |
| 24 GB, older | RTX A5000 (3090 if none) | $0.27/h | 16 GB set | 1.5 h / $2.50 |
| 24 GB, newer | RTX 4090 | $0.89/h | 16 GB set | 1.5 h / $2.50 |
| 32 GB | RTX 5090 | $1.39/h | 16 GB set | 1.5 h / $2.50 |
| 48 GB | A40 (A6000 if none) | $0.59/h | 16 GB set | 1.5 h / $2.50 |
| Processor only | RunPod CPU pod, 8 vCPU / 32 GB | to read at launch | Gemma 4 E4B | 1.5 h / $1 |

No H200, B200 or B300 (one at a time, and Bobert's run has it). One pod at a time.

**Expected cost:** about 1 h a run, so about $0.27 x 3 + $0.89 + $1.39 + $0.59 + CPU pod, roughly **$4 to $6**. **Proposed cap: $12 for the whole sweep**, $2.50 a run, and the sweep stops after two failed runs in a row.

**What a simulated card is.** A small stand-in for `nvidia-smi` on the pod tells Bob the card is 8 GB (or 12 GB), and a ballast program holds the rest of the real card, so the engine really has only 8 GB to fit into. Bob's pick, fit, spill and crashes are then real. The speed is not (a 24 GB A5000 is not an 8 GB card), so simulated rows report fit and pass/fail only. The README would say "tested on a simulated 8 GB card" until a real one is measured.

**Each run.** A fresh Linux pod gets the newest published Bob release (`node src/server.js`, empty home), Bob's own hardware check and set, his own engine download and his own engine settings. Nothing is set by hand. Then, through Bob:
1. "hi" to warm up (not timed). Cool the card under 50 C, idle 60 s, before each timed step.
2. One short held-out tool job (repository set, first job, Medius) through Bob's real loop.
3. One long read: the 32K cut of `long-text.md` plus one question (16K where Bob's own context is smaller).
4. One everyday turn, 3 rounds, for writing speed.

Logged every second: card memory used, temperature, clocks, power, free RAM, plus Bob's logbook and the engine log (loads, reloads, exits, fit). Each row records card, real or simulated size, pod RAM, Bob release, engine build, the set and brain Bob picked, context, reading and writing tokens/s, card peak against card minus 512 MB, spill, reloads, crashes, tool job result and bad calls, minutes and dollars. **Pass** = loads, peak under card minus 512 MB, no crash, no reload during a job, no bad tool call, tool job right.

**Limits of the results.**
- These are Linux pods. Bob's Linux Brain Engine uses llama.cpp's own CUDA code (only the Windows build replaces it), so Windows speeds can differ. Fit and pick carry over.
- Pod RAM varies (often more than 32 GB). Each row records it. A 12 GB row that only fits because the pod had 60 GB of RAM doesn't count as a 32 GB PC.
- The Pi stays untested: RunPod has no ARM boards.

## 4. What still has to be built (before the launch phrase does anything)

Forge build 23, on the rentals branch:
- `pod/tier-run.sh`: install Node 20, fetch the release, start Bob headless, read his pick (`/api` hardware and set), run his download and equip, start his brain, sample the card.
- `nvidia-smi` stand-in and card ballast for simulated sizes (test-only, on the pod, never in Bob).
- CPU pods in `forge.mjs`, plus `tier_sweep` plans running one tier after another with per-run caps.
- Prices: the laptop key can't read RunPod's live card list, so the plan carries the 12 Nov prices; the pod's own rate is what's logged.
- Pre-flight on the laptop: `node forge.mjs --plan plans\tier-sweep.json --preflight` must end `pre-flight OK: nothing rented`.

Plan file: `app/model-lab/forge/plans/tier-sweep.json`.

## 5. Launch

Rentals start only from the laptop thread, on the owner's own words typed there:

> **go GPU tier sweep, cap $12**

That phrase covers the whole sweep above (7 runs, one pod at a time, $12 total, $2.50 a run) once build 23 passes pre-flight. Nothing is uploaded.

## 6. Afterwards

- Results to `bob-model-lab/out/tier-sweep/` on the laptop and a summary table `tier-sweep.md`. The table goes to the README thread and the dissertation thread (card, brain, reading and writing t/s, peak, pass rate, cost, engine build).
- Each failure gets its own fix plan in the report.
- Free extra: a defaults-only Get Bob ready run on the laptop would make the 6 GB row tested without a rental.
