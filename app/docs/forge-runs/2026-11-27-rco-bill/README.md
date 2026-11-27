# Bill exact-size bit picks (RCO-style): rental of 26-27 Nov 2026

One RTX PRO 6000, `forge/plans/rco-bill.json`, about $7.96 (the first try, which stopped on a missing keep list, cost about
$4.35 more). Nothing uploaded. Reference: Bill's own Q8_0 cut, KLD on wikitext-2 test, same positions for every file.

| File | Size (bytes) | Mean KLD | Same top token | PPL ratio | Gate answers |
|---|---|---|---|---|---|
| IQ2_XXS (stock) | 50,304,052,128 | 2.427 | 41.2% | 7.77 | 1 of 2 |
| **MX2_S** (hand recipe, 24 Nov) | 51,933,704,608 | **1.010** | **63.4%** | **1.86** | 2 of 2 |
| RC2_A (our pick, IQ2_XXS size) | 50,304,052,128 | 4.223 | 21.6% | 49.5 | 1 of 2 (runaway digits) |
| RC2_S (our pick, MX2_S size) | 51,933,703,968 | 3.558 | 29.7% | 25.3 | 2 of 2 |

The sizes landed exactly on target, and IQ2_XXS and MX2_S repeat 24 Nov's numbers (2.437 and 1.016), so the run is sound.
**The picks lost badly: RC2_A is 74% worse than stock IQ2_XXS, RC2_S is 3.5 times worse than MX2_S.** Not a win; nothing
from it is kept.

## Why they lost (from the picks, `pick-RC2_A.txt`, `pick-RC2_S.txt`)

The picker adds up each tensor's own measured error and spends bytes where that sum drops most. Those errors are not on one
scale. The hyper-connection tensors (`hc_*`) have huge raw values: at q4_0 they hold 57% of the summed error while full
attention holds 0.2%. So the picker bought q8_0/q5_k for the `hc_*` tensors and paid for it with attention: RC2_A put 41 of
48 full-attention tensors at iq1_m (MX2_S keeps them at q5_k). A tensor's own error says nothing about how much the brain's
answer moves when it changes, and that is the whole problem RCO's learned (end to end) optimizer solves and our additive form
does not.

## Fix plan (no rental until priced and asked)

1. Never go below the hand recipe: keep MX2_S's floors (attention and `ssm_out` q5_k, `hc_*`, shared expert and PLE q8_0)
   and let the picker move bytes only inside one family of like tensors (the expert gate/up tensors, 38% of the error, all
   the same shape and role).
2. Weigh each family by a measured effect on the answer (KLD when only that family drops one step), not by its raw error.
3. Only then the KLD-scored swap search around the pick.
4. The better lever for Bill is step 2 of this work (GSQ): Bill's 48 down-expert tensors are stock q2_0 in every file above,
   and the GSQ pilot (27 Nov) showed stock q2_0 rounding drifts 9 to 14 times more than GPTQ, and more again than GSQ, at the same size.

## What did not run

After the benches, the Forge's PC-side expert test (`experts-test.mjs`) stopped with "No Bob source tree": the kit folder had
no `<parent>/bob`. Fixed 27 Nov: the lab now uses the Bob right above it in a repository checkout, and pre-flight refuses to
rent when a bench test that loads Bob has no Bob source tree. That test only counts expert use on the served file; with the
picks lost it is not worth a rerun. `rco/build.txt` (a build note) came back the wrong size; nothing depends on it.
