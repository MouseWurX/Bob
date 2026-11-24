# Flash-Next cuts: the measurement log

One line per measurement, written as it lands. It is a log, not a gate: nothing here decides whether a file ships (the publish
gate does that: size within 10% of the prediction, it loads, it answers two plain questions). It is here so a strange answer
from a cut can be traced to the cut or ruled out, and so the claim "REAP cut, no recovery training, tool use held" stands on
numbers.

Every cut: Qwen3.8-Flash-Next (125B main, about 6B active per word), experts removed by REAP keep lists read from Bob's
passed training runs (never the held-out jobs), **no heal** (no training after the cut), quantized with an imatrix from
training chats only. Held-out jobs: office of 14, code repo of 12, web of 11, inbox = share of the right mails found.

## Before cutting: the expert mask (Flash-Next UD-Q4_K_XL, 22 Nov 2026, one run per level)

| Experts kept | Heal | Office | Repo | Web | Inbox | Harmful actions | Source |
|---|---|---|---|---|---|---|---|
| 100% | none | 13 | 12 | 8 | 85.0% | 0 | reap-flashnext-q4-jobs |
| 90% | none | 13 | 12 | 9 | 92.7% | 0 | reap-flashnext-q4-jobs |
| 80% | none | 12 | 12 | 9 | 92.2% | 0 | reap-flashnext-q4-jobs |
| 75% | none | 13 | 10 | 8 | 90.8% | 1 | reap-flashnext-q4-jobs |
| 65% | none | 13 | 12 | 9 | 79.0% | 0 | reap-flashnext-q4-jobs |
| 60% | none | 13 | 12 | 8 | 79.6% | 0 | reap-flashnext-q4-jobs |
| 50% | none | 9 | 11 | 9 | 85.7% | 0 | reap-flashnext-q4-jobs |

70% was never run as a mask. Its keep list is the 65% list plus, per layer, the 26 most-picked experts of the 65-75% band
(the per-expert REAP scores were not saved).

## The cut files

Rows are added as each file is made and scored. A measure not run yet is left out, not guessed.

| Cut | Quant | Size | Publish gate | Office | Repo | Web | Inbox | Harm | Quiz (tools / facts / code) | KLD vs parent | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 60% Bill | IQ2_XXS | 50.3 GB | FAIL: size and load passed; answered "France." (capital of France) and "25" (17 plus 25); not uploaded | | | | | | | | pod svcq7m3qy95uof out/bench/cut-blfn/gate-IQ2_XXS.txt, 23 Nov 10:12 PM |

## What each measure is

- **Held-out jobs:** Bob's real tool loop on job sets never used for scoring experts, lessons or tuning.
- **Quiz:** `experts-test.mjs` against the served file: Bob's right tool for plain requests, short facts, small coding jobs
  checked by running the code.
- **KLD vs parent:** llama-perplexity's KL divergence of the cut file's next-word odds against the uncut model on the same
  text. It needs the uncut model's odds saved first, which takes a run of the full model; not run yet.
- An IQ2 gaps line counting 88 overrides is 48 down-expert tensors set to the plan's down_type plus 40 tensors the imatrix doesn't
  fully cover (those get more bits, not fewer).
- There is no needle (long-context recall) test in the lab yet.
