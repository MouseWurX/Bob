# Flash-Next cuts: mixed-bit files (scope and plan, 24 Nov 2026)

The owner asked to integrate llamAmpere's tricks, "learn from it", and scope it properly. This is the scope for the mixed-bit
trick on the three Flash-Next REAP cuts (Bobert 80%, Riker 70%, Bill 60%). Sizes are dry runs of
`model-lab/forge/pod/quant_recipe.py`; the Bill rental of 24 Nov (results below) checked them against real files.

## What we learned from llamAmpere (read at the source, tag v0.7.4, MIT)

- **Their AI+ types can't be made by anyone else.** In their ggml the AIT types have no from-float function
  (`ggml/src/ggml.c`: `.from_float_ref = NULL`), so llama-quantize only copies them. Their files are CUDA-only. We use stock types.
- **Their own Flash-Next head recipe** (`docs/flash-next-mtp-quants.md`) keeps the hyper-connection and indexer tensors at
  BF16 and the hidden-state projection at Q8_0, and notes the 640-wide expert down rows fall back from Q2_K to Q4_0.
- **Their ATX recipe** (`QWEN_AMPERE.md`) keeps the bulk at one type and raises the structural tensors: attention K/V and
  output, `ssm_out`, `output.weight`, the gated-delta-net alpha/beta.
- **Their quality measure** (v0.6.3 release notes): KLD against an 8-bit reference on fixed positions, two runs, paired
  tests, and the note that KLD measures drift, not task accuracy. We copy the method, not their numbers.
- **Their overlay loader** (`LLAMA_MODEL_OVERLAY_PATCH`, `src/llama-model-loader.cpp`) swaps same-named tensors from a small
  patch file at load time, so one recipe change is scored without baking a whole file. Not ported: it is an engine change.
  Phase 3 below says when it would pay.

## What the real tensors are (checked, not guessed)

The built-in Flash-Next layout in `quant_recipe.py` comes from llama.cpp b12359 (commit b1b770d, the pods' build:
`src/models/qwen4exp.cpp`, `src/llama-quant.cpp`) and the pod logs in `cut-iq2-logs.zip`. `--selftest` checks it: 1224
tensors; 389 f32, 24 bf16, 811 q8_0, as the loader counted; the 80% cut's 25,619,005,440 bytes exactly; the source within
~10 MB of its 188.2 GB. One number is an estimate: the word table's exact row count (~320.0 million); `--model` reads it from a
real file.

The predictor then reproduces every file the pods made, to 0.01 GB:

| File | Real | Predicted |
|---|---|---|
| Bill IQ2_XXS | 50.3 GB | 50.30 |
| Bill IQ2_M | 53.56 GB | 53.55 |
| Bill Q3_K_M | 69.16 GB | 69.16 |
| Bobert IQ2_XXS | 56.75 GB | 56.74 |
| Bobert IQ2_M | 61.0 GB | 61.00 |

What it found inside today's IQ2_XXS (both from llama.cpp's own rules for this architecture):

- **The hyper-connection mixers are at 2 bits.** llama.cpp keeps `hc_` tensors unquantized for glm5-next and xing4_0, but
  not for qwen4exp, so `hc_attn_down`, `hc_attn_inject`, `hc_ffn_down` and `hc_ffn_inject` in all 48 layers got iq2_xxs.
  llamAmpere keeps these at BF16 in its own Flash-Next head. Raising them to q8_0 costs about 0.25 GB.
- **The gated-delta-net gates** (`ssm_alpha`, `ssm_beta`), the attention gate and `ssm_out` are also at iq2_xxs.
- Fixed by shape: the word table is 160 wide, so nothing under q4_0 (4.5 bits, 28.8 GB) fits. The down experts are 640 wide,
  so the only types are q2_0 (2.25 bits) or q4_0/iq4_nl (4.5 bits), nothing between.

Bill's IQ2_XXS failed the gate ("France.", "25") while his IQ2_M and Q3_K_M passed. So the 60% cut can answer; the damage is
in the 2-bit file. That is the study's "cheap check", answered by files we already have, though the gate is only two questions.

## The recipes (sensitivity data, sizes per cut)

Sensitivity data, in order of strength:

1. **KLD against the cut's own Q8_0** (on the pod, from the plan): the decider. Not run yet.
2. **A KLD block sweep** (Phase 2): six files, each raising one block of 8 layers; `layer_rank.py --kld` turns it into the order.
3. **The imatrix** (free, already on each cut's Hugging Face page): `layer_rank.py --imatrix` ranks layers by the size of
   their expert inputs. It is a proxy only. Until it runs, the recipes use llama.cpp's own more-bits pattern. **A file's size
   doesn't depend on the order**, only on how many layers are raised, so the sizes below hold whatever the order turns out to be.

Common guards in every MX recipe: `hc_*` q8_0, `ssm_alpha/beta` q8_0, shared expert q8_0, layer-1 word-table mixer q8_0,
full-attention K/V q8_0, word table q4_0.

| Recipe | What changes | Bobert 80% | Riker 70% | Bill 60% |
|---|---|---|---|---|
| IQ2_XXS (made) | baseline | 56.74 | 53.52 | 50.30 |
| **MX2_S** | guards, attention q5_k, token_embd q4_k; experts as IQ2_XXS | 58.37 | 55.15 | 51.93 |
| IQ2_M (made) | baseline | 61.00 | 57.28 | 53.55 |
| **MX2_M** | MX2_S + gate/up iq2_s in 16 layers + down q4_0 in 8 layers | 61.23 | 57.65 | 54.08 |
| **MX3_S** | gate/up iq3_xxs in 16 layers, iq2_s elsewhere, down q4_0 in 16, attention q6_k | 67.21 | 62.94 | 58.67 |
| Q3_K_M (made) | baseline | 81.65 | 75.40 | 69.16 |
| MX1_S (Bobert only) | MX2_S with 16 layers' gate/up at iq1_m | 57.53 | | |

GB, including the 28.8 GB word table that stays in RAM or on disk. MX1_S saves only 0.84 GB, so it is not in the run plan.

## Bill results (rental of 24 Nov 2026, one RTX PRO 6000, about $7.14, nothing uploaded)

Raw files: [forge-runs/2026-11-24-mixed-bit-bill/](forge-runs/2026-11-24-mixed-bit-bill/). KLD is against Bill's own
Q8_0 on wikitext-2 (24 chunks, context 512), same text and positions for every file. Lower is better.

| File | Size | Mean KLD | Same top token | Perplexity ratio | Gate (Paris / 42) |
|---|---|---|---|---|---|
| IQ2_XXS (stock) | 50.30 GB | 2.437 ± 0.028 | 43.1% | 7.64 | FAIL ("France.", "25") |
| IQ2_M (stock, public) | 53.56 GB | 1.336 ± 0.020 | 57.2% | 2.44 | pass |
| **MX2_S** | **51.93 GB** | **1.016 ± 0.017** | **63.4%** | **1.84** | pass |
| MX2_M | 54.08 GB | 0.818 ± 0.015 | 67.4% | 1.53 | pass |
| MX3_S | 58.68 GB | 0.593 ± 0.011 | 72.5% | 1.27 | pass |

- **MX2_S fixes the failed IQ2_XXS for +1.63 GB and beats the public IQ2_M while 1.6 GB smaller.**
- **The predictor matched all five real quant logs tensor by tensor** (1224 tensors each, 0 differences) and to 0.002 GB
  after one fix: b12359 sends every `ffn_down` tensor in layers 0-2 (down experts, shared expert and `hc_ffn_down`) to
  q2_k (iq3_s for IQ2_M/IQ2_S).
- **The hc_ finding is now seen in a real file:** stock IQ2_XXS turned `blk.N.hc_attn_down` / `hc_attn_inject` (and the
  ffn twins) from q8_0 to iq2_xxs. Types per tensor: `real-types.json`.
- **Layer rank** came from Bill's imatrix (top layers 47, 46, 45, 42, 39, 41, 44, 40); stored as `layer_rank.bill`.
- **Limits:** absolute KLD values are high for all 2-bit files, so read the table as a ranking. The gate is two
  questions; the held-out jobs on npc are still to run before any file is called good.

## Gate tests and done criteria

A recipe file is done when all of these hold:

1. Its size is within 5% of the dry run (the publish gate's range).
2. It loads, and answers the two gate questions.
3. Its KLD against the cut's Q8_0 is lower than the stock file of about the same size, on the same text and positions:
   MX2_S against IQ2_XXS, MX2_M against IQ2_M, MX3_S against IQ2_M. Report it as the mean with its range, and "same top token".
4. For Bill, the decisive one: MX2_S passes where IQ2_XXS failed. If it doesn't, the guards aren't the cause, and MX2_M/MX3_S
   decide whether more expert bits are.
5. The winner then gets npc's quiz (`experts-test --quick`) and the held-out jobs: no bad tool calls, no broken files, no crashes.
   Until then its card says "unproven in our lab, as we have yet to test".

The KLD text is wikitext-2 (public, neutral). Never the held-out jobs, never text Claude wrote.

## Ready-to-run plan

- **Phase 0, free, no rental:** on npc or the laptop, download Bill's `imatrix.gguf` from his repo and run
  `layer_rank.py --imatrix imatrix.gguf --cut bill --recipe pod/recipes/flashnext-mixed.json --write`. Optional:
  `quant_recipe.py --check <a downloaded Bill IQ2_M> --cut bill --ftype IQ2_M` compares every tensor's type with the real file.
- **Phase 1, one rental (held):** `plans/mixed-bit-bill.json`. One RTX PRO 6000: download the Q8_0, cut to Bill, take his
  imatrix from Hugging Face, remake IQ2_XXS and IQ2_M, make MX2_S, MX2_M and MX3_S, KLD for each, gate. It uploads nothing
  (`cut.publish` false) until the owner decides on going public; `forge.mjs --send-plan` can switch it on mid-run. Estimate 4-5 h at the forge table price of $2.69/h, about $11-14. Caps 6 h / $17. The quantize and KLD
  times are estimates; the 190 GB download has taken 30-80 min on past pods.
  The owner said "bill test rental is a go" in the laptop thread (24 Nov). Start: `node forge.mjs --plan plans/mixed-bit-bill.json`.
- **Phase 2, only if Phase 1 shows a win:** the same plan for Riker and Bobert with the winning recipe (copy the plan, change
  keep list, repo, `recipe_cut`), about the same cost each. A KLD block sweep for a real layer order adds six files, about 3 h.
- **Phase 3, only if many recipes need scoring:** port the overlay loader (MIT, credit llamAmpere) as a lab-only engine patch,
  off by default, so each change is a small patch file instead of a 50 GB remake.

## Decisions for the owner

1. The Phase 1 rental: approved 24 Nov ("bill test rental is a go"), caps 6 h / $17.
2. Gated MX files go to the cuts' public repos (as "Go public now" did for the cuts), or stay off Hugging Face.

Out of scope here: healing (scales and norms) is the study's separate item and needs its own yes; AI+ types; any change to
Bob's defaults. The predictor knows qwen4exp only.
