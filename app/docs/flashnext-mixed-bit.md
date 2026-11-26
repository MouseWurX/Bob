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

## ISTA DASLab's GSQ-RCO ideas (26 Nov 2026)

The owner (26 Nov): "If their research can benefit us we should attempt to implement it." ISTA DASLab published GSQ-RCO quants
(their Qwen3.8-27B IQ2_XS is under the Saluki 27B brain). Two papers, two different ideas:

- **RCO** (Helcig and Alistarh, arXiv 2605.00649): choose a type per tensor so the file lands on an **exact size** with the
  least loss. No code is published. Their optimizer learns the choice end to end on the model's loss (Gumbel sampling, a
  budget-constrained step); the simpler "measure each part, then solve the budget" methods are what it is compared with.
- **GSQ** (Dadgarnia et al., arXiv 2604.18556, github.com/IST-DASLab/GSQ, Apache-2.0): **learn the rounding** of each
  weight and the group scales from sample text, one linear layer at a time, so a 2-bit file loses less than rounding to the
  nearest step does. Their public code writes vLLM INT files; it has no GGUF writer and no Flash-Next (qwen4exp) model code
  (checked at commit 03fc1648). Its 2-bit grid is 4 levels times one scale per group.

### Step 1: our own exact-size picker (built, dry-run passed, rental held)

- `pod/tensor_err/` (C++, links llama.cpp b12359's ggml): for every tensor and every stock type, quantize a sample of rows
  exactly as llama-quantize does (same imatrix row), turn them back into numbers and add up the imatrix-weighted squared
  change. Experts are weighted by how often the router picks them. Reads the cut's Q8_0 through a read-only map.
- `pod/rco_pick.py`: treats those errors as adding up and picks one type per tensor under a byte budget (each tensor's lower
  convex hull, best gain per byte first, then fills what is left). The budget is "the same tensor bytes as" a stock file or
  recipe, so a pick is the size of the file it is set against.
- run.sh: `cut.rco` in a plan measures once and writes each pick into the recipe file before the quant loop; the loop then
  makes, scores (KLD) and gates it like any MX recipe.
- Dry run (cloud, tiny made-up Flash-Next): [forge-runs/2026-11-26-rco-dry-run/](forge-runs/2026-11-26-rco-dry-run/).
- Rental plan `forge/plans/rco-bill.json` (HELD for the owner's yes, caps 5 h / $14, uploads nothing): IQ2_XXS and MX2_S made
  again, plus RC2_A (abs error) and RC2_B (rel error) at IQ2_XXS's size, and RC2_S at MX2_S's size. Done criteria as above:
  RC2_A or RC2_B must pass the gate where IQ2_XXS failed, and beat MX2_S's KLD at MX2_S's size (RC2_S) to count as a win.
- Honest limit: this is the additive form, not RCO's learned optimizer. If the picks lose to the hand recipe, the next step is
  a KLD-scored search around the pick (a few swaps scored by real KLD), which is closer to what RCO does.

### Step 2: GSQ on one card (built, dry-run passed, pilot rental held)

The owner, 26 Nov: "Healing is not training" (the OK for light tuning of rounding).

- **Found while checking types:** stock `q2_0` stores 64 weights as 2-bit codes {-1, 0, 1, 2} times one f16 scale
  (`ggml-quants.c`, `dequantize_row_q2_0`). That is GSQ's 2-bit grid ({-2, -1, 0, 1} times a scale; the same set with the
  scale's sign flipped) at group 64. So GSQ's learned codes are written straight into a stock `q2_0` tensor (q = 1 - v,
  d = -s), with no Lamplight change. Bill's 48 down-expert tensors are all `q2_0` (640 wide: no 2-bit K or IQ type fits).
- **And stock q2_0 rounding is weak by construction:** b12359's `quantize_row_q2_0_ref` sets the scale to the group's
  largest |w|, so `round(w / d)` stays in -1..1: the +2 level is never used (in effect 3 levels), and `quantize_q2_0`
  ignores the imatrix. Any better rounding of the same format is free in size.
- **Tools** (`model-lab/forge/pod/gsq/`): `x_dump` (llama.cpp tool: records the input rows each chosen weight sees, per
  expert for MoE, from the GGUF itself), `gsq_q2.py` (three roundings to q2_0: stock, GPTQ with searched scales, and GSQ's own
  2-bit quantizer, same init and anneal, Lion, on the per-layer loss trace((Wq - W) H (Wq - W)^T) with H = X^T X / n),
  `q2_0_patch.py` (writes the codes into a copy of a llama-quantize file: same size, same header).
- **Why one card is enough:** the loss needs only each layer's H, not stored activations or the model's Python code (their
  repo has none for Flash-Next). This differs from their repo, which scores whole MLP blocks; ours is the per-layer form
  their README states.
- **Dry run** (cloud, tiny made-up Qwen3): our stock writer equals llama-quantize byte for byte; KLD stock 1.67, GPTQ 0.069,
  GSQ 0.054 with ffn_down at q2_0 ([forge-runs/2026-11-26-gsq-dry-run/](forge-runs/2026-11-26-gsq-dry-run/)). Mechanics
  only: the brain is random.
- **Pilot kit** `pod/gsq/gsq-pilot.sh` (HELD for the owner's yes, cap $2 / 2 h): Qwen3-1.7B (Apache-2.0), one 24 GB+ card,
  wikitext-2 train for inputs and test for KLD, settings A (ffn_down at q2_0) and B (all ffn at q2_0), STOCK vs GPTQ vs GSQ at
  identical sizes, one greedy answer each. Uploads nothing.
- **Then Bill:** the same tools on Bill's down experts (x_dump on the Q8_0 cut, per-expert H from routed tokens, GSQ per
  expert), written into the MX2_S or RC pick's q2_0 down experts, then KLD and the publish gate. Priced after the pilot.
