# Turbo matrix: does each Turbo trick still add speed, and does it keep the answers right? (method, Nov 26 2026)

Asked by the owner on Nov 26: "We need to test all the turbo features to make sure they still add speed with the other
tricks, that guppi can compensate and optimize those tricks too if possible" and "Also to see if they affect answer
quality". Written before the run. Results go in the dissertation. Untested claims are "unproven in our lab, as we have
yet to test". This is a comparison inside Lamplight. It is not a claim that Lamplight beats llama.cpp.

## What is tested

Bob's default brain, Qwen3.6 35B A3B (unsloth MTP copy, UD-Q4_K_XL, about 22 GB), on one 16 GB NVIDIA card. That mirrors
npc's 5070 Ti, so the brain is bigger than the card and GUPPI's expert copy cache is on. Every row's engine start comes
from Bob's own code (`LlamaCpp.buildArgs` and `startEnv`, through `model-lab/turbo-start.mjs`), so the matrix tests
what Bob would really start. `starts.md` in the results lists each row's exact flags and engine keys.

| row | what | compared with |
|---|---|---|
| stock | Bob on plain llama.cpp b12359 | - |
| lossless | Lamplight (b12359, 0001-0127) with every default-on trick, no Turbo | stock |
| lossless-mtp | lossless plus the brain's own guesser (the Lab's MTP pick, exact) | lossless |
| t-mem-small / smallest / p83 / p84 / p82 | Turbo chat memory: 4-bit, 3-bit, Progressive 8+3, 8+4, 8+2 | lossless |
| t-experts4 | 4 experts per word (Turbo's default) | t-mem-small |
| t-standins | stand-ins (0043) | t-mem-small |
| t-drive | never wait on the drive (0053) | t-mem-small |
| t-mtp | 4-bit memory plus exact MTP | t-mem-small |
| t-keep | keep more guesses (0120, mb-MTP) | t-mtp |
| t-sink | sharp start (0122) | t-mem-small |
| t-sealed | sealed blocks 3/3 (0123, engine key only, no Bob setting yet) | t-mem-p83 |
| up-keys | lossless-mtp plus the upstream keys from 0128-0134 (CUDA M-RoPE fusion, MTP replay, async inputs, YaRN keys), for the upstream ports thread | lossless-mtp |
| all-on | every Turbo trick: 4-bit memory, 4 experts, stand-ins, keep more guesses with MTP, sharp start | lossless-mtp |

Each lone trick sits on the smallest Turbo base it needs, so its own effect is what is measured.

## Stage 1: speed

`model-lab/speed-test.mjs`: every row at depth 0 (Bob's real start prompt), 16K and 64K tokens, 300 tokens written,
3 rounds with the rows interleaved, so heat and background load fall evenly. Bob's sampling (temperature 0.7) with a fixed
seed (42) for every row, because keep more guesses does nothing at temperature 0. Before every load the card cools to
idle + 3 C, at least 35 s and at most 5 min. The card's temperature, clocks, power and throttle reasons are sampled every
250 ms. Throttled runs are counted and flagged, not dropped.

A trick still adds speed when it makes one job (read the prompt, write 300 tokens) at least 3% faster than its base at
some depth, with no failed run. That is the same rule GUPPI's Turbo pass uses on each PC.

## Stage 2: answer quality

Bob's held-out jobs, never tuned on: inbox 28, office 14, repo 12, web 11 (Lab harness `do-jobs.mjs` at `ced02c1c`, tool
shape 4, Effort medium on one brain). One job at a time with `-np 1`, as Bob runs (Progressive memory and the sharp start
refuse more than one slot). Each set is scored by its own scorer, and `tool-faults.mjs` counts tool-call faults.

Rows, in order: lossless (the yardstick), all-on, then each trick that still added speed, biggest gain first. A trick that
adds no speed isn't worth its risk to the answers, so it isn't run. Rows run until the pod's time is nearly used. Any row
that didn't fit is listed as not run.

The gate is absolute (the owner, Nov 21): every job done correctly, no crash, no bad tool call, no broken file. Lossless is
shown beside it for comparison only. Different words are fine when the work is right.

## Stage 3: GUPPI

GUPPI's Turbo pass (Settings, Engine tuning, GUPPI calibrates this PC, only with Turbo on) does the speed half of this on
any PC. It times each switched-on trick with and without it at his own step, and leaves out, for that brain on that PC,
any trick that doesn't add 3% or that does nothing on that start. The matrix checks his rule against the full
measurements. For each trick, results.md says what GUPPI would decide on this card.

## Limits, said up front

- The harness's own Bob (1.5.244) runs the jobs, so GUPPI's step switching during a chat doesn't happen there. Each row
  runs at the step it loads with.
- Speeds on a rented card are that card's, not npc's. If a 24 GB card stands in (`HOLD_GB=8`), its free memory matches
  but its speed doesn't.
- 64K uses the long text three times over. That's for speed only, and that answer isn't judged.
- One brain only. Other brains are unproven in our lab, as we have yet to test.

## Failure means a fix plan

Every row that fails the speed rule or the gate gets a fix plan in the results: what broke, the likely cause, the next
change, and how to check it.
