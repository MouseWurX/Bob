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
| 80% Bobert | IQ2_XXS | 56.75 GB (2 parts on Hugging Face) | PASS: size inside 51.1-62.5 GB, loads, answered Paris and 42; public | | | | | | | | pod 35un7hx2k2gdsd out/bench/cut-bnfn/gate-IQ2_XXS.txt, reported 23 Nov 10:34 PM |
| 60% Bill | IQ2_M | 53.56 GB | PASS: size inside 49.1-60.1 GB, loads, answered Paris and 42; public | | | | | | | | pod svcq7m3qy95uof out/bench/cut-blfn/gate-IQ2_M.txt, reported 23 Nov 10:34 PM |
| 60% Bill | Q3_K_M | 69.16 GB (2 parts on Hugging Face) | PASS: size inside 61.5-75.1 GB, loads, answered Paris and 42; public | | | | | | | | pod svcq7m3qy95uof out/bench/cut-blfn/gate-Q3_K_M.txt, reported 23 Nov 10:48 PM |
| 80% Bobert | IQ2_M | 61.0 GB (2 parts on Hugging Face) | PASS: size inside 55.7-68.1 GB, loads, answered Paris and 42; public | | | | | | | | pod 35un7hx2k2gdsd out/bench/cut-bnfn/gate-IQ2_M.txt, reported 23 Nov 11:08 PM |
| 60% Bill | IQ4_XS | 71.3 GB (2 parts on Hugging Face) | PASS: size inside 63.4-77.4 GB, loads, answered Paris and 42; public | | | | | | | | pod svcq7m3qy95uof out/bench/cut-blfn/gate-IQ4_XS.txt, reported 23 Nov 11:15 PM |
| 80% Bobert | Q3_K_M | 81.65 GB (2 parts on Hugging Face) | PASS: size inside 72.5-88.7 GB, loads, answered Paris and 42; public | | | | | | | | pod 35un7hx2k2gdsd out/bench/cut-bnfn/gate-Q3_K_M.txt, reported 23 Nov 11:28 PM |
| 60% Bill | Q4_K_M | 86.96 GB (2 parts on Hugging Face) | PASS: size inside 79.6-97.2 GB, loads, answered Paris and 42; public | | | | | | | | pod svcq7m3qy95uof out/bench/cut-blfn/gate-Q4_K_M.txt, reported 23 Nov 11:35 PM |
| 80% Bobert | IQ4_XS | | PASS, then lost: the 450 GB pod disk filled before the upload; the pod deleted itself at 12:54 AM; not on Hugging Face | | | | | | | | laptop watcher, reported 24 Nov 12:55 AM |
| 80% Bobert | Q4_K_M | | not made: pod disk full | | | | | | | | laptop watcher, reported 24 Nov 12:55 AM |
| 70% Riker | IQ2_XXS | 53.53 GB (2 parts on Hugging Face) | PASS: size inside 48.2-59.0 GB, loads, answered Paris and 42; public | | | | | | | | pod svcq7m3qy95uof out/bench/cut-rkfn/gate-IQ2_XXS.txt, reported 24 Nov 1:17 AM |
| 70% Riker | IQ2_M | 57.28 GB (2 parts on Hugging Face) | PASS: size inside 52.5-64.1 GB, loads, answered Paris and 42; public | | | | | | | | pod svcq7m3qy95uof out/bench/cut-rkfn/gate-IQ2_M.txt, reported 24 Nov 1:44 AM |
| 70% Riker | Q3_K_M | 75.4 GB (2 parts on Hugging Face) | PASS: size inside 67.0-81.8 GB, loads, answered Paris and 42; public | | | | | | | | pod svcq7m3qy95uof out/bench/cut-rkfn/gate-Q3_K_M.txt, reported 24 Nov 1:58 AM |
| 70% Riker | IQ4_XS | 77.85 GB (2 parts on Hugging Face) | PASS: size inside 69.2-84.6 GB, loads, answered Paris and 42; public | | | | | | | | pod svcq7m3qy95uof out/bench/cut-rkfn/gate-IQ4_XS.txt, reported 24 Nov 2:28 AM |
| 70% Riker | Q4_K_M | 95.01 GB (3 parts on Hugging Face) | PASS: size inside 86.1-105.3 GB, loads, answered Paris and 42; public | | | | | | | | pod svcq7m3qy95uof out/bench/cut-rkfn/gate-Q4_K_M.txt, reported 24 Nov 2:52 AM |

## Bill 2-bit retest with mixed bits (24 Nov 2026, not published)

The failed Bill IQ2_XXS used llama.cpp b12359's stock IQ2_XXS types. Its quant log shows the hyper-connection mixers
(`blk.N.hc_attn_down`, `hc_attn_inject`, `hc_ffn_down`, `hc_ffn_inject`) going to iq2_xxs (q2_k for `hc_ffn_down` in layers 0-2):
b12359 keeps hc_ tensors at higher precision for some architectures but not for qwen4exp. A test rental (about $7.14, nothing
uploaded) rebuilt Bill's 2-bit files with those mixers and other small tensors kept higher (the MX recipes). KLD is against
Bill's own cut Q8_0 on wikitext-2 (24 chunks, context 512); lower is closer.

| File | Size | Publish gate | KLD | Same top word | PPL ratio |
|---|---|---|---|---|---|
| IQ2_XXS (stock) | 50.30 GB | FAIL ("France.", "25") | 2.437 | 43.1% | 7.64 |
| IQ2_M (stock, the public one) | 53.56 GB | PASS | 1.336 | 57.2% | 2.44 |
| MX2_S | 51.93 GB | PASS | 1.016 | 63.4% | 1.84 |
| MX2_M | 54.08 GB | PASS | 0.818 | 67.4% | 1.53 |
| MX3_S | 58.68 GB | PASS | 0.593 | 72.5% | 1.27 |

So the hc_ mixers at 2 bits are the likely cause of the IQ2_XXS failure (not the imatrix gaps). MX2_S is 1.6 GB smaller than
the public IQ2_M and closer to the Q8_0. None of the MX files has held-out job scores yet. Source: forge-runs/2026-11-24-mixed-bit-bill/
(kld.tsv, gate-*.txt, sizes.txt, real-types.json) on PR #347, commit c6ebf49.

## What each measure is

- **Held-out jobs:** Bob's real tool loop on job sets never used for scoring experts, lessons or tuning.
- **Quiz:** `experts-test.mjs` against the served file: Bob's right tool for plain requests, short facts, small coding jobs
  checked by running the code.
- **KLD vs parent:** llama-perplexity's KL divergence of the cut file's next-word odds against the uncut model on the same
  text. It needs the uncut model's odds saved first, which takes a run of the full model; not run yet.
- An IQ2 gaps line counting 88 overrides is 48 down-expert tensors set to the plan's down_type plus 40 tensors the imatrix doesn't
  fully cover (those get more bits, not fewer).
- There is no needle (long-context recall) test in the lab yet.
