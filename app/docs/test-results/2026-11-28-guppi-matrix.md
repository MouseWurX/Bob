# GUPPI matrix: calibrating on rented cards (Nov 27 to 28 2026)

GUPPI's own calibration (the Settings button's code) ran on rented cards. Smaller cards were made by holding a bigger card down with a ballast, so their memory speed is the big card's. Lamplight 46, Linux, 32K context. A job here means a 16,384-token read and 300 tokens written, timed from the measured speeds. Rows are in `data/2026-11-28-guppi-matrix/` and in the shipped seed (`src/measured-seed.json`). Spend was about $1.40.

## Two bugs found and fixed first (PR #361, 0c8f242)

- **The copy cache filled the card to exactly GUPPI's margin.** The engine's fill leaves 512 MiB, which is the same as GUPPI's margin, so every cache try on a 16 GB card stopped at once. The fill now leaves 768 MiB, and a try that is still short leaves more.
- **A stopped engine held the card for about 5 minutes.** It finished a slow read after it was stopped, and later runs found the card full. A trip now ends the request, and stop waits for the engine to close.

M1, M2 and M3 runs from before the fix are left out, except the rows the bugs didn't touch.

## GUPPI against Bob's pick (after the fix)

| Card | Brain | Bob's pick | GUPPI | GUPPI's step |
|---|---|---|---|---|
| RTX A4000 16 GB | Qwen3.6 35B Q4 | 46.7 s | 16.5 s | 4096 |
| RTX A4000 16 GB | Qwen3.6 35B Q3 | 23.7 s | 15.4 s | 4096 |
| RTX 3090 held to 16 GB | Qwen3.6 35B Q4 | 60.6 s | 17.8 s | 4096 |
| RTX 3090 held to 16 GB | Qwen3.6 35B Q3 | 26.4 s | 14.7 s | 6144 |
| RTX 4000 Ada 20 GB | Qwen3.6 35B Q4 | 26.2 s | 17.8 s | 4096 |
| RTX 4000 Ada held to 12 GB | Qwen3.6 35B Q4 | 53.0 s | 20.4 s | 4096 |
| RTX 4000 Ada held to 12 GB | Qwen3.6 35B Q3 | 37.7 s | 18.1 s | 4096 |
| RTX A4000 held to 6 GB | Qwen3.6 35B Q4 | 95.1 s | 173.4 s (keeps Bob's pick) | - |
| RTX A4000 held to 6 GB | Qwen3.6 35B Q3 | 73.5 s | 151.0 s (keeps Bob's pick) | - |

- Where the whole brain fits the card (24 and 32 GB cards, and the 35B Q3 on 20 GB), there's no copy cache, so GUPPI keeps Bob's pick.
- At 6 GB the copy cache is slower than Bob's pick, so GUPPI keeps Bob's pick, as he should.
- The 3090 Q3 run logged sw-thermal slowdowns.

## Does the shared baseline make GUPPI's pick better? (`node src/measured-holdout.js`)

Each machine was left out in turn. GUPPI started from the other machines' rows and picked a step, and the pick was scored by that machine's own measured speeds. Without the baseline, he starts from his built-in table. Copy cache on:

- 8 checks: faster in 2 (by 1.5 s and 0.5 s), the same in 5, slower in 1 (by 0.5 s).
- The other machines' speeds were 10% to 185% off, 20% to 43% for most.
- His built-in table already picks 4096 or 6144, and those two steps are within about 1.5 s of each other on every card. So the baseline can only change a little.

So the baseline is a small help at best. It is not a certainty. What makes the big difference (2 to 3 times faster on 12 to 16 GB cards) is GUPPI calibrating the PC itself. The baseline matters most before someone calibrates and for the edge: which steps fit, and when to keep Bob's pick. The held-out check doesn't score those yet. Unproven in our lab, as we have yet to test that.

## Not yet measured

A real 12 GB card, real 6 to 8 GB cards (only held-down ones so far), the 16 GB unified-memory handheld, Windows rentals, and Inkling 2 Mini (it needs Lamplight 0151 on 6 GB). Phones don't run GUPPI.
