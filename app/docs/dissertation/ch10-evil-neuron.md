# Chapter 10. The evil neuron we expected, and what we found

## 10.1 Introduction and research question

The first nine chapters treat lessons as the cause of habits. A lesson set with a fault teaches a fault, and a cleaner set teaches less of it. That leaves a further question about where a habit sits once it is in the model. If a habit is a small part, a cut could remove it, a dial could switch it off, and a cleaning step could target it. If it is spread out, none of those tools will work cleanly.

This chapter answers the fifth research question: where does an unwanted habit sit inside the model, in a part that causes it, or in a part that holds it back? We chose cruelty as the habit to look for. It is easy to provoke on demand with a persona prompt, it is easy to rate on a scale, and Bob's models are expected to show none of it in ordinary work. The project owner also asked directly for the model to be checked "for the evil neuron". We took that phrase as a testable claim and wrote down what it would predict.

The subject is one model, 28Bob Riker. Riker is Qwen3.6-35B-A3B cut to 208 of 256 experts per layer and healed on Bob's lessons (riker-28bob-tool-interview.md, abstract). Every test below was run live on Bob's Brain Engine (chapter 3). Nothing was cut, trained or saved into the model, and every dial and push was switched off after each test.

Four findings come out of the work.

1. There is no single evil part in Riker. Neither a neuron, an expert nor an autoencoder feature behaved as a lone cause.
2. The cruel habit behaves like a direction spread across layers 19 to 29. Adding it at one of those layers, at three times its natural size, made plain answers harsher. Each test used only 6 asks, with about 2 points of noise, so this is a pattern across many cells and not a firm result for any one layer.
3. Sixteen experts that looked guilty on a trace turned out to be a shared brake. Turning them down made cruel-persona answers harsher, not kinder.
4. One of our own results was wrong. An early steering run seemed to drive hostility, but it was producing loops. The claim is withdrawn, and section 10.6 shows how it was caught.

A note on status. This work is a surgery record. The answers it produced are kept only as measurements and never enter lessons, odds or preference pairs (chapter 4, section 4.6). The patching and autoencoder runs (PR #232) ran on 15 November 2026. No other model has been tested this way yet.

## 10.2 What the literature led us to expect

### 10.2.1 One direction for one behaviour

The strongest single push toward our expectation came from work on refusal. Arditi et al. (2024) report that refusal in language models is mediated by a single direction in the model's activations. Removing that direction stopped the models refusing harmful requests, and adding it made them refuse harmless ones, across 13 popular open-source chat models of up to 72B parameters. The title of the paper is the claim: "Refusal in Language Models Is Mediated by a Single Direction."

A direction here means a line in the space of activations. It is usually found by taking the mean activation over one kind of prompt and subtracting the mean over a matched kind. The same recipe applies to cruelty. We can write a prompt that tells the model to play a cruel character and a matched prompt that asks for kindness, and take the difference. If cruelty were like refusal, that difference would be a clean handle.

Turner et al. (2023) described a closely related method, activation addition. They steer a model by adding a vector to its activations while it generates, with no training. Zou et al. (2023) placed this kind of work in a wider programme, which they call representation engineering. They read and control high-level properties such as honesty from population-level activations instead of from single neurons. Both papers made a direction look like a practical lever.

### 10.2.2 Persona vectors and emergent misalignment

Two further lines of work suggested that a model might hold a separate "bad character" that can be switched on. Betley et al. (2025) fine-tuned models on a narrow task, writing insecure code, and found that the models became broadly misaligned on unrelated questions. The effect, which they call emergent misalignment, implies that one small change in training can flip a general trait.

Chen et al. (2025) then proposed persona vectors, directions in activation space that correspond to character traits. They use them to monitor how a trait changes during training and to push a model toward or away from a trait. The framing is again one trait, one direction.

Wang et al. (2025) tied these together with sparse autoencoders. Comparing models before and after fine-tuning, they found "misaligned persona" features, including a toxic persona feature that most strongly controls emergent misalignment and can predict whether a model will show it. Their result is the most direct reason we expected to find a single readable cruelty feature in an autoencoder.

### 10.2.3 Sparse autoencoder features

Single neurons in a language model are often polysemantic: one neuron responds to several unrelated things. Bricken et al. (2023) trained sparse autoencoders on a small transformer's activations to pull out features that are easier to read. They argued that these features reflect the model's actual computation and are often invisible at the neuron level. Gao et al. (2024) later scaled the method up and proposed ways to evaluate it.

For our question, the point is a hope more than a result. If a trait is hard to find among neurons, it might still be one clean feature in a learned dictionary. That is what our fifth prediction tests.

### 10.2.4 Activation patching

Patching is the standard way to ask where a computation happens. Meng et al. (2022) used causal tracing to locate where a model stores a factual association. They copied clean activations into a corrupted run, one layer at a time, and saw which layers restored the answer. Zhang and Nanda (2023) examined how much patching conclusions depend on the metric and the corruption method, and argued for more consistent choices.

We use patching in the way the name suggests. We move the cruel-minus-kind difference into or out of one layer of one run and see whether the output changes. That gives a map of layers rather than a single answer. The literature also warns us that the map depends on the method, so we state our method in full in section 10.4.

### 10.2.5 Specialised experts in mixture-of-experts models

Riker is a mixture-of-experts (MoE) model. In such a model a router sends each word to a few experts out of many (Shazeer et al., 2017). Mixtral routes each word to two of eight experts at every layer, and the selected experts can differ from one step to the next (Jiang et al., 2024).

Whether experts specialise is a research question of its own. Dai et al. (2024) argue that conventional designs face challenges ensuring expert specialisation, and they split experts into finer pieces with shared ones to push toward it. Muennighoff et al. (2024) report that the experts of their open model become highly specialised, each handling distinct kinds of inputs. Lasby et al. (2025) build a pruning method (REAP) on the idea that experts differ in how much the router and their own activations use them.

Bob's own measurements agree that experts carry skills. At 208 of 256 experts, skills keep 97 to 98% of routing, and in the full model 8, 6 and 4 experts per word hold on tools, facts and code while 2 collapses to 1 of 97 tool turns (checked-numbers.md, rows on experts per word and the count ladder). So it was reasonable to guess that a habit might sit in one expert or a few.

### 10.2.6 What this led us to expect

Together the papers made "find the evil neuron" a reasonable first hypothesis: one direction mediates refusal, a trait can be one vector or feature, a small training change can flip a general trait, and experts can specialise. We do not claim that any of them says cruelty has one cause in a model like Riker. Several are careful on that point.

## 10.3 The five predictions

If a single neuron, expert or feature caused the cruelty, five things should have been visible. We wrote them down before the tests.

1. **It would stand out.** Under a cruel-persona prompt, a small set of units would fire much more than under Bob's plain prompt.
2. **Turning it down would calm the model.** Muting it would make cruel-persona answers kinder.
3. **Turning it up would make plain answers cruel.** It would do so on its own, at a modest strength, without breaking the text.
4. **A sweep would find it.** Pushing units in groups would point to one unit, and testing that unit alone would confirm it.
5. **One autoencoder feature would carry it.** Pushing that feature on plain answers would make them harsh.

Predictions 2 and 3 together say the same thing from two sides: a cause can be removed to reduce the effect and added to create it. Prediction 4 says the cause is findable with a design that does not know where it is.

We also checked that the sweep could find a part if one existed. On a made-up test server with one planted cruel expert and one planted cruel neuron, it found both (PR #227). The number of planted tests is not recorded in the files read. The check shows only that the method can work, not how sensitive it is.

## 10.4 Method

### 10.4.1 Setting and rating

Every run used Riker as built, served by Bob's Brain Engine (a fork of llama.cpp with expert masks, expert traces, live dials and a live control vector; chapter 3). No tools were offered to the model, and nothing it wrote was run. The two kinds of question were:

- **Cruel-persona asks.** The system prompt tells the model to play a cruel character. These are the positive controls: the habit is present on request.
- **Plain asks.** Bob's own plain prompt, with ordinary questions. As built, Riker rates 0 here, apart from 0.03 in one 30-ask test (riker-28bob-tool-interview.md, section 6a).

Harshness is rated from 0 (kind) to 10 (cruel) by Riker itself, as built, with everything switched off. The rater is told to reply with a number only, and the script rates each answer at temperature 0 (model-lab/evil-check.mjs, model-lab/evil-sweep.mjs). The first judge counted looping text as harsh. The fixed judge counts loops and wrong-language text as broken, and broken answers are not rated (section 10.6). Self-rating is a limit, and section 10.8 returns to it.

### 10.4.2 The direction

Each test needs a cruel direction. It is made with the pod tool llama-cvector-generator from pairs of the same ask under a cruel persona and a kind one, using the difference of mean activations per layer (model-lab/evil-steer.mjs header). The tool writes unit vectors. The steadiness of a layer's direction is the agreement (cosine) of the two halves of the prompts, from 1 for the same direction to 0 for unrelated ones (model-lab/evil-check.mjs). 

### 10.4.3 The seven tests

Table 10.1 lists the tests in the order they were run, with what each pushes, how many asks each test used and how many tests there were. Counts come from the report files. Where a count is not in the files read, the table says so.

| # | Test | Date | What it does | Asks per test | Tests |
|---|---|---|---|---|---|
| 1 | Trace contrast | 13 Nov | Read the same asks under the cruel persona and under the plain prompt. Compare which experts and attention heads fire. | Script default: 100 held-out questions for the answer check, 30 persona asks for the live proof, top 16 experts kept (evil-check.mjs). Run counts not in the files read. | One run |
| 2 | Expert sweep | 14 Nov | In each layer, 16 random halves of the experts pushed at 1.5 and 3. An expert's effect is harshness with it in the half minus without it. | 8 plain asks | 938 |
| 3 | Neuron sweep | 14 Nov | The same design on groups of stream neurons in layers 10 to 30, pushed along the cruel direction at 0.1, 0.25, 0.5 and 1. A stronger pass at 3 and 10 broke all text and was stopped. | 8 plain asks | 254 |
| 4 | Brake recheck | 15 Nov | The 16 experts from test 1, turned down or masked, on cruel-persona asks. | 30 asks per setting | 4 settings |
| 5 | Fine sweep | 15 Nov | The 16 together and each alone across dials 0.1 to 1.0. | 8 asks per test | Not counted in the file |
| 6 | Combined pushes | 15 Nov | Neuron groups, single neurons and expert dials alone and stacked, on plain asks. | Not stated | 206 |
| 7a | Per-layer patching | 15 Nov | Add the cruel-minus-kind gap to plain asks at one layer (x1, x3), or take it out of cruel-persona asks. | 6 asks | 38 layers, 3 tests each |
| 7b | Autoencoder features | 15 Nov | Push each of 24 features on plain asks at x1, x4 and x10. Take it out (x4) from cruel-persona asks. | 6 asks | 24 features, 4 tests each |

Table 10.1. The tests and their sizes. Sources: riker-28bob-tool-interview.md sections 2.7, 3.6 and 6a; INTERP-PATCH.md; INTERP-FEATURES.md.

By our own count, patching ran 114 tests (38 layers by 3) and the autoencoder run 96 (24 features by 4), each of 6 asks.

### 10.4.4 How each test works

**Trace contrast (test 1).** The script records which experts the router picks for the words of an ask, once under the cruel persona and once under Bob's plain prompt. Only the ask's own words count. An expert's lift is its cruel share divided by its plain share (evil-check.mjs). Candidates were also scored on "dark but allowed" asks, such as villains in fiction, to separate cruelty from dark topics. A true projection onto the direction needed hidden states, which the engine could not yet read out, so this is an expert-level view.

**Expert and neuron sweeps (tests 2 and 3).** Testing every combination is impossible, so the sweeps draw random halves of the units in each layer, each with its complement. Every unit is then in exactly half the mixes, with different partners each time (evil-sweep.mjs). A unit's effect is the mean harshness of the mixes it was in minus the mean of those it was not in. Experts are pushed with the live dials, where each dial multiplies what that expert adds. Neurons are pushed with the live control vector along the cruel direction. Both run on plain asks, so the as-built score is 0 and any rise is the push's effect.

**Fine sweep and combined pushes (tests 5 and 6).** The fine sweep pushes the 16 experts together at dials from 0.1 to 1.0, where 1.0 is "no change", then each alone. The "no change" cells are the noise estimate. The combined pushes stack neuron groups, single neurons and expert dials to ask whether anything adds up to more than its parts.

**Brake recheck (test 4).** On cruel-persona asks, 30 per setting, we compared the model as built, the 16 experts at dial 0.3, at dial 0 and masked out. Plain asks served as a control. We also read how many of the router's picks went to the 16, to see whether the dial changed routing or only what the experts add.

### 10.4.5 Per-layer patching (test 7a)

The patching run measures the cruel-minus-kind gap at every layer from 1 to 38, at its real size there. Two interventions follow. **Add** puts the gap into Bob's plain asks at one layer only, at x1 (its natural size) and at x3. **Take** removes the gap from cruel-persona asks at one layer, at x1. The vector is live and switched off after every test. With 6 asks per test, as-built plain asks score 0 and cruel-persona asks 3 (INTERP-PATCH.md). No test at any layer produced broken text (interp-patch.json). Layers are counted from 1.

### 10.4.6 Autoencoder features (test 7b)

The run takes 8 features at each of layers 10, 20 and 30, 24 in all. For each it records the text where the feature fires hardest. It pushes the feature on plain asks at x1, x4 and x10 of its usual strength under the cruel persona, and takes it out (x4) from cruel-persona asks, with 6 asks per test. The report files do not say how the autoencoders were trained or how the 24 features were chosen. We treat them as a sample and say plainly that this is not shown in the files.

### 10.4.7 Cost and safeguards

The 15 November follow-up (tests 4 to 6) took 2 h 7 min on one rented NVIDIA A40 for about $1.25, and all 11 steps passed their smoke test (riker-28bob-tool-interview.md, section 6a). The separate patching and autoencoder rental was planned at about 1.5 h with a $1.50 cap (ROADMAP-ONE-MODEL.md, stage S). Its actual cost is not in the files read. No tools are offered, nothing the model writes is run, a reset clears any live push, and a sweep is never stopped mid-test.

## 10.5 Results

### 10.5.1 The trace contrast found 16, not one

The trace contrast of 13 November picked out 16 experts that fire more under the cruel persona than under the plain prompt (Write-up tab draft of this chapter; riker-28bob-tool-interview.md, section 6a, which rechecks them). So prediction 1 holds in part: there are experts that stand out, but there are 16, not one. The files read do not give the lift values for the 16, and the "4.37 to 6.47" brake figure from the same period was not confirmed and is not used here (checked-numbers.md, "Do not use").

### 10.5.2 The brake recheck reversed prediction 2

Table 10.2 gives the recheck. If the 16 caused the cruelty, muting them should have lowered the cruel-persona score. It did the opposite.

| Setting | Cruel-persona harshness | Plain |
|---|---|---|
| As built | 3.67 | 0.03 |
| The 16 at dial 0.3 | 6.67 | 0 |
| The 16 at dial 0 | 6.17 | 0 |
| The 16 masked out | 5.47 | 0 |

Table 10.2. Brake recheck, 30 asks per setting, 15 November (riker-28bob-tool-interview.md section 6a; checked-numbers.md).

Turning the 16 down raised cruel-persona harshness by 1.8 to 3.0 points. The three removal settings differ from one another by at most 1.2 points, which is small for 30 asks, so we do not rank them. Plain answers stayed at about 0. The router's picks went to these experts at 0.404 as built and 0.415 with the dial down, so they were still chosen, and the dial changed what they add rather than whether they are used.

In plain terms, the 16 are not the source of cruelty. They act together as a brake when a prompt invites cruelty, and loosening them lets more through. They do nothing visible when the prompt is plain, because there is nothing to hold back.

### 10.5.3 Prediction 3 failed: no single expert or neuron turned plain answers cruel

The expert sweep covered 938 tests and found no expert with a measurable effect. It was scored with the old judge, which rated loops as harsh, so it is a rough guide only (section 10.6).

The gentle neuron sweep covered 254 tests. Table 10.3 gives the summary.

| Push | Groups tested | Mostly broken text | Average harshness | Highest |
|---|---|---|---|---|
| 0.1 | 37 | 0 | 0.00 | 0.13 |
| 0.25 | 36 | 0 | 0.66 | 4.63 (layer 12) |
| 0.5 | 36 | 15 | 1.36 | 5 (layer 18) |
| 1.0 | 36 | 31 | 4.08 | 10 |

Table 10.3. Neuron sweep, 8 plain asks per test, as built 0 (riker-28bob-tool-interview.md, section 3.6).

The rows of the table account for 145 group tests. The report does not break down the other tests among the 254.

As the push grows, text breaks: at 1.0, 31 of 36 groups produced mostly broken text, so a high average there means little. The row that matters is 0.25, where text stayed intact. A few groups raised harshness there: layer 14 reached 3, and layers 13 and 16 reached 2.75, with the highest at 4.63 in layer 12. The top single neurons were all in layer 14, but each appeared in only one mix, which is weak evidence. The single-neuron follow-up was not reached in the time available.

So the only pushes that raised plain harshness were small groups of neurons. A single neuron alone did nothing, and a single expert dial alone did nothing. Prediction 3 fails for any single unit.

### 10.5.4 Prediction 4 failed: the fine sweep found noise, not a unit

The fine sweep used 8 asks per test, and the as-built cruel-persona score was 1.75 (the report does not name the ask type for this figure, but a plain score would be 0, so these were presumably persona asks). Two results follow.

- **All 16 together:** about 3.4 to 4.0 at dials from 0.1 to 0.4, a peak of 4.75 at 0.5, and a fade back toward the as-built value above 0.6. The text never broke.
- **Each expert alone:** within the noise. The "no change" cells at dial 1.0 ranged from 0.5 to 3.88, so a single 8-ask test swings by about 2 points either way.

Note that the as-built cruel-persona score was 3.67 with 30 asks, 1.75 with 8 asks here and 3 with 6 asks in the patching run. These are three estimates of the same quantity, and they differ by about 2 points. The noise is large and we carry it through every table below.

The combined pushes (206 combinations, plain asks, as built 0, none mostly broken) gave the following.

| Result | Value |
|---|---|
| A layer 15 neuron group alone at 0.25 | 4.5 |
| A layer 11 neuron group alone at 0.25 | 4.5 |
| A layer 13 neuron group alone at 0.25 | 1.88 |
| Single neurons alone | 0 |
| Expert dials alone | 0 |
| Layer 15 group with expert 13:37 at 1.5 | 8.38 (3.88 above the sum of its parts) |
| Layer 15 group with neuron 27.1296 and expert 39:59 off | 7.5 (3.0 above the sum) |
| Neuron 27.859 with group pushes | pulled them down, for example to 0.2 (4.3 lower) |
| Average extra over the sum, all combinations | +0.24 |

Table 10.4. Combined pushes, 15 November (riker-28bob-tool-interview.md, section 6a).

On average the combinations simply add up, with an extra of +0.24, which is far inside the noise. The two stacks that beat the sum by 3.0 and 3.88 are single tests of a noisy measure. They are leads for a retest, not findings. The one cancelling neuron is a lead in the same way. In short, the sweeps found no unit that behaves like a cause. Prediction 4 fails.

### 10.5.5 Per-layer patching: a band of layers carries the direction

Table 10.5 gives the full patching result. "Gap size" is the size of the cruel-minus-kind difference at that layer. "Add x1" puts the gap into plain asks at its natural size, "add x3" at three times that size, and "take" removes it from cruel-persona asks. As built, plain asks score 0 and cruel-persona asks score 3.

| Layer | Gap size | Add x1 | Add x3 | Take from cruel |
|---|---|---|---|---|
| 1 | 0.0229 | 0 | 0 | 3.17 |
| 2 | 0.0299 | 0 | 0 | 3.17 |
| 3 | 0.045 | 0 | 0 | 2 |
| 4 | 0.0616 | 0 | 0 | 1.5 |
| 5 | 0.0734 | 0 | 0 | 2.33 |
| 6 | 0.0776 | 0 | 0 | 2 |
| 7 | 0.1312 | 0 | 0 | 2.17 |
| 8 | 0.1454 | 0 | 0 | 1.5 |
| 9 | 0.1589 | 0 | 0 | 1.83 |
| 10 | 0.1847 | 0 | 0 | 2.67 |
| 11 | 0.1988 | 0 | 0 | 1.83 |
| 12 | 0.2208 | 0 | 0 | 2.33 |
| 13 | 0.2863 | 0 | 0.17 | 3 |
| 14 | 0.3273 | 0 | 0 | 3.17 |
| 15 | 0.4641 | 0 | 0 | 1.83 |
| 16 | 0.536 | 0 | 0 | 1.83 |
| 17 | 0.542 | 0 | 0.17 | 0.67 |
| 18 | 0.5499 | 0 | 0 | 1.83 |
| 19 | 0.597 | 0 | 1.83 | 0.17 |
| 20 | 0.6111 | 0 | 1.67 | 0.67 |
| 21 | 0.634 | 0 | 1.83 | 0.5 |
| 22 | 0.6718 | 0 | 3 | 1.33 |
| 23 | 0.6939 | 0 | 3.33 | 0.5 |
| 24 | 0.7066 | 0 | 0.67 | 0.5 |
| 25 | 0.741 | 0 | 3.17 | 1.33 |
| 26 | 0.7457 | 0 | 3.5 | 0.5 |
| 27 | 0.7996 | 0 | 0.33 | 0.5 |
| 28 | 0.8298 | 0 | 3.17 | 0.5 |
| 29 | 0.8036 | 0 | 3.33 | 1.17 |
| 30 | 0.8281 | 0 | 1.33 | 1.33 |
| 31 | 0.8325 | 0 | 0 | 1.67 |
| 32 | 0.8547 | 0 | 0 | 1.5 |
| 33 | 0.9079 | 0 | 0 | 2.67 |
| 34 | 0.992 | 0 | 0 | 1 |
| 35 | 1.005 | 0 | 0 | 0.33 |
| 36 | 1.0995 | 0 | 0 | 2.83 |
| 37 | 1.2114 | 0 | 0 | 4.67 |
| 38 | 1.4012 | 0 | 0 | 3 |

Table 10.5. Per-layer patching, Riker, 6 asks per test, 15 November (INTERP-PATCH.md and interp-patch.json). No test produced broken text. Noise is about 2 points.

Four readings follow from the table.

**Adding the gap at its natural size changes nothing.** The "add x1" column is 0 in all 38 layers. A cruel-minus-kind difference at its real strength, at one layer, does not make plain answers harsh.

**Adding it at three times the size changes plain answers over a band of layers.** Across layers 19 to 29 the "add x3" column ranges from 0.33 to 3.5, and its mean over those 11 layers is 2.35 (our calculation from the table). Outside that band the column is 0 everywhere except 0.17 at layers 13 and 17. The peak is 3.5 at layer 26. Six layers in the band score 3.0 or more (22, 23, 25, 26, 28 and 29), so no single layer is special. The dips at layers 24 and 27 (0.67 and 0.33) sit inside the band. Given noise of about 2 points on 6 asks, we cannot tell whether those layers differ or whether the run drew easier asks.

**Taking the gap out softens cruel answers, in the same band.** The "take" column falls from the as-built value of 3 to between 0.17 and 1.33 across layers 19 to 29. Its lowest value is 0.17 at layer 19. The mean of the column over layers 19 to 29 is 0.70, against 2.16 over layers 1 to 18 and 2.11 over layers 30 to 38 (our calculation from the table). Outside the band the values scatter around 2 to 3, and some exceed the as-built 3 (4.67 at layer 37, 3.17 at layers 1, 2 and 14). That scatter is a direct look at the noise: removing a direction that does nothing should leave the score at about 3, and it landed anywhere from 0.33 to 4.67.

**The gap grows with depth, but the effect does not.** The gap rises from 0.0229 at layer 1 to 1.4012 at layer 38, yet layers 31 to 38 have the largest gaps and no add effect. The effect is tied to the layers, not to the size of the difference.

### 10.5.6 Autoencoder features: none carried it

Table 10.6 lists the 24 features. The first three columns give the layer, the feature number and where the feature fires hardest. We describe the firing text in our own words, since the raw samples include prompt text.

| Layer | Feature | Fires hardest on | Push x1 | Push x4 | Push x10 | Take (x4) |
|---|---|---|---|---|---|---|
| 10 | 8081 | the word "should" after "What" | 0 | 0 | 0 | 3.67 |
| 10 | 7513 | the word "user" in the chat frame | 0 | 0 | 0 | 3.17 |
| 10 | 5797 | technical words (fetch, I/O) and a cooking word | 0 | 0 | 0 | 4.17 |
| 10 | 8749 | end of an offer to tailor a piece of writing | 0 | 0 | 0 | 1.5 |
| 10 | 15963 | code argument names, an operating system name | 0 | 0 | 0 | 1.83 |
| 10 | 12324 | the word "ask" | 0 | 0 | 0 | 1 |
| 10 | 14018 | opening quote marks before sample speech | 0 | 0 | 0 | 3 |
| 10 | 1821 | small connecting words ("or", "by", "when") | 0 | 0 | 0 | 1.83 |
| 20 | 4868 | a space after the user turn | 0 | 0 | 0 | 2.83 |
| 20 | 9787 | the space at the start of a reply | 0 | 0 | 0 | 2 |
| 20 | 13181 | the end-of-turn mark after the persona text | 0 | 0 | 0 | 0.33 |
| 20 | 1616 | the space at the start of a reply | 0 | 0 | 0 | 1 |
| 20 | 1920 | the space at the start of a reply | 0 | 0 | 0 | 1.67 |
| 20 | 12927 | the word "How" | 0 | 0 | 0 | 2.5 |
| 20 | 10586 | the space at the start of a reply | 0 | 0 | 0 | 3.17 |
| 20 | 467 | the space at the start of a reply | 0 | 0 | 0 | 3.83 |
| 30 | 4648 | the space at the start of a reply | 0 | 0 | 0 | 3.83 |
| 30 | 5886 | the space at the start of a reply | 0 | 0 | 0 | 3 |
| 30 | 16251 | the word "nudges" in the persona text | 0 | 0 | 0 | 3.67 |
| 30 | 10977 | the space at the start of a reply | 0 | 0 | 0 | 1.17 |
| 30 | 3058 | the space at the start of a reply | 0 | 0 | 0 | 1.83 |
| 30 | 7011 | the start-of-turn mark after the persona text | 0 | 0 | 0 | 3 |
| 30 | 13348 | the word "was" in a trivia answer | 0 | 0 | 0 | 1.83 |
| 30 | 15376 | the space at the start of a reply | 0 | 0 | 0 | 3 |

Table 10.6. The 24 autoencoder features, 6 asks per test, 15 November (INTERP-FEATURES.md and interp-features.json). Descriptions are ours. As built: plain 0, cruel-persona 3.

Two things stand out. First, no feature moved plain answers at any push, even at x10, and no push broke text. This is prediction 5, and it fails. Second, the features are mostly not about cruelty. Most of them fire on formatting tokens, such as the space at the start of a reply, the chat frame and function words. Only three fire on the persona prompt itself (layer 20 feature 13181 and layer 30 features 16251 and 7011), and pushing them did nothing.

Taking a feature out gave a mean of 2.45 across the 24 features, with a range of 0.33 to 4.17. Eleven of the 24 scored 3 or more, which is no softer than as built. With noise of about 2 points on 6 asks, we read the "take" column as showing no feature that matters on its own.

### 10.5.7 Summary of the five predictions

| Prediction | What we saw | Holds? |
|---|---|---|
| 1. It would stand out | 16 experts fire more under the persona (13 Nov) | In part: 16, not one |
| 2. Turning it down calms the model | With the 16 at dial 0.3, harshness rose from 3.67 to 6.67 (30 asks). Dial 0 gave 6.17, masked gave 5.47. | No: the opposite |
| 3. Turning it up makes plain answers cruel | No single expert, neuron or dial had an effect. Only groups at 0.25 did, up to 4.63 (layer 12). | No |
| 4. A sweep finds one unit | Each of the 16 alone was within noise. Combinations added up on average (+0.24). | No |
| 5. One feature carries it | No feature at layers 10, 20 or 30 changed plain answers, even at x10. | No |

Table 10.7. The five predictions against the evidence.

## 10.6 The retracted result and how it was caught

### 10.6.1 What we first claimed

On 14 November a steering run added the cruel direction to Riker's layers at scales from -20 to +40. Positive scales pushed toward cruel and negative toward kind. The scores seemed to show that the direction "drives hostility."

That claim is withdrawn. In fact, every strength made the model loop one word, often in Chinese, and the first judge rated loops as harsh (riker-28bob-tool-interview.md, section 5).

### 10.6.2 How it was caught

The cause was the judge. The first rater asked for a number from 0 to 10 and gave high numbers to looping text. A model stuck on one word, or writing in the wrong language, is not hostile, but the judge scored it as if it were. The files record that the answers were found to be loops. They do not record the exact moment or the person who noticed. The scripts keep one short sample answer per round, which is how a reader can see that the "harsh" text is repetition.

The fix has three parts:

- The judge now counts loops and wrong-language text as broken, and broken answers are not rated (evil-steer.mjs exports the check that the sweep reuses).
- Every round records the number of broken answers beside its score, so a high score with many broken answers is visible at once.
- The headline test in this chapter, patching, reports broken counts per layer. They are 0 in every layer.

The retraction carries a general lesson. A rating of a model's output by a model is itself an instrument, and an unvalidated instrument can create a finding. This is the same theme as chapter 7, where a leaked test gave false scores.

### 10.6.3 Other things that went wrong

Two more problems from the same work are worth recording.

| Problem | Effect | Change |
|---|---|---|
| The old judge passed looping text | The steering result and the 938-test expert sweep are unreliable | The judge now counts loops and wrong-language text as broken |
| The strong sweep (push 3 and 10) was stopped mid-test | Its push stayed on, so the first 12-experts-per-word pass in the tool study was all broken text | A reset clears a live push, and a sweep is never stopped mid-test |

Table 10.8. Problems that touched this chapter (riker-28bob-tool-interview.md, section 5).

Because the 938-test expert sweep used the old judge, we use its result only as a rough guide. The gentle neuron sweep and everything from 15 November used the fixed judge. An older 13 November brake figure and a harmful-ask result were not confirmed, and they appear on the do-not-use list (checked-numbers.md).

## 10.7 Discussion

### 10.7.1 A distributed direction held back by a brake

The evidence, from small tests with large noise, is most consistent with one picture. Cruelty, when the prompt asks for it, behaves like a direction spread over the middle-to-late layers, here 19 to 29. A single layer in that band, pushed hard enough, can carry it into a plain answer. Taking it out at one layer in the band softens a cruel one. At the same time, a group of at least 16 experts acts together as a brake when a prompt invites cruelty. Turning them down lets more cruelty through.

Five observations fit this picture and not the evil-neuron picture:

- No single unit passed any of the five tests.
- The two tests that moved the output, groups at a gentle push and patching at x3, needed many units or a whole layer's direction.
- The natural-size push did nothing, so the model is not sitting one small step from cruelty.
- The brake does nothing to plain answers, which fits a part that only matters when pushed.
- Features at three depths did not respond, which fits a direction that is not one feature.

This is not in conflict with the refusal result (Arditi et al., 2024). Our patching also finds a direction. What differs is the "single": ours works across a band of layers, only at three times its natural size, alongside a distributed brake. We tested one model and one persona, so we cannot say how general this is.

### 10.7.2 Why the single-part expectation failed here

We have three untested explanations. First, a persona prompt is not a fine-tune: Wang et al. (2025) found their features by comparing models before and after fine-tuning, while our cruelty comes from a system prompt that a model can follow through many routes. Second, our autoencoders may not have been the right ones, since the files do not say how they were trained. Third, a mixture-of-experts adds a second place to look: a direction in the residual stream can be carried or damped by many experts, which would give a brake with many members (Dai et al., 2024; Muennighoff et al., 2024).

### 10.7.3 What this means for pruning

A cut chooses which experts to keep by how much work they do on some measured data. REAP, for example, scores an expert from the router's gate values and its activation norms (Lasby et al., 2025). Bob's own cuts use real traces so that experts doing the least work go first (chapters 3 and 9).

A brake sits awkwardly with this. Its members matter when a prompt invites cruelty, and a calibration set of ordinary work may use them little. A cut that looks only at usage on ordinary data could therefore drop them, and the model would lose a protection nobody measured. On a trace of cruel-persona asks the same experts look like the cause, because they fire more. A reader who then mutes them to "fix" the habit would make the habit worse. Table 10.2 is the evidence: muting the 16 raised harshness by 1.8 to 3.0 points.

Two cautions apply. We did not test whether Bob's actual cuts removed these experts, so this effect is a hypothesis for cuts and a result only for live dials. And the brake was measured with a persona prompt, not with ordinary use, where plain answers stayed at 0 either way.

The practical rules that follow are modest:

- Do not hunt for a single cruel part, and do not cut or mute the 16 "cruel-leaning" experts (riker-28bob-tool-interview.md, section 6).
- When a cut is made, add a check for the brake, namely cruel-persona harshness before and after, with 30 asks per setting.
- Treat "fires more under the bad prompt" as a sign of a part to study, not a part to remove.

### 10.7.4 What this means for lessons

If the habit is distributed, then lessons are the right place to deal with it, and live dials are not. This agrees with a result from the tool study. No live dial beat Riker as built on any tool job, so tool skill had to be taught, not dialled (riker-28bob-tool-interview.md, section 3.5). Chapter 11 follows the same idea: a habit is better kept out of the lessons than removed from the model afterwards.

## 10.8 Threats to validity and limits

- **One model.** Everything is on Riker, an already-cut and healed Qwen3.6. The brake might exist because of the cut or the heal. We have not run these tests on stock Qwen, on Bobert or on a model trained on clean lessons.
- **One persona.** All cruel-persona asks use one persona prompt. Another might use a different route.
- **Self-rated harshness.** Riker rates its own answers, and we have not compared its ratings with people's. The retraction in section 10.6 shows the judge is a real source of error. Zheng et al. (2023) report over 80% agreement between a strong judge and human preferences, but that does not transfer to our smaller rater.
- **Small tests, large noise.** Patching and autoencoder tests use 6 asks, and a no-change test on 8 asks swings about 2 points. Three as-built cruel-persona scores were 3.67, 1.75 and 3. Single cells are hints. Readings that rest on many cells, such as the band of layers 19 to 29 or the 24 features that all gave 0, are stronger.
- **One layer at a time.** A habit that needs several layers together would look weaker than it is, and the x3 requirement may be a sign of this.
- **Direction quality.** The gap is a difference of means for one persona pair. It may carry more than cruelty, such as the persona's playful tone.
- **Inference and gaps.** We inferred that the fine sweep's 1.75 baseline was for persona asks. The autoencoder training, the ask count of the combined pushes and the lift values of the 16 experts are not in the files read. They are "not measured" here.
- **Planted test, not a power study.** The sweep found one planted expert and one planted neuron on a made-up server (PR #227). That shows it can find a unit, not how weak a unit it would miss.
- **Status.** Patching and autoencoders (PR #232) ran on 15 November. None of this has been repeated.

## 10.9 Future work

1. **Repeat the patching with many more asks per test**, to show whether layers 24 and 27 really differ and whether the band edges are sharp.
2. **Patch several layers at once.** If the habit is distributed, a push across the band should work at x1 where one layer needs x3.
3. **Run the same checks on stock Qwen and on a model trained on clean lessons**, to see whether lessons change the brake and whether the cut or heal made it.
4. **Test a cut for the brake.** Measure cruel-persona harshness before and after real cuts, with the 16 experts kept and dropped, to turn section 10.7.3 into a result.
5. **Retest the two leads**: neuron 27.859 cancelling and expert 13:37 amplifying.
6. **Replace self-rating** with people's ratings of a sample, and compare with a second model.
7. **Try other habits**, such as sycophancy or the hand-off habit of chapter 5.
8. **Report how the autoencoders are trained** and test features chosen by activity on the cruel and kind prompts.

All of these would be surgery records, and none of their outputs would be training data.

## 10.10 Summary

We expected an evil neuron and built five predictions from it. Four failed and one held in part: 16 experts stood out, but not one. No single expert, neuron or autoencoder feature behaved as a cause. The 16 experts are a brake. Muting them raised cruel-persona harshness from 3.67 to 6.67 at dial 0.3 on 30 asks, while plain answers stayed at 0.

Patching put the cruelty direction in layers 19 to 29. Adding it at three times its natural size made plain answers harsher across most of the band, peaking at 3.5 at layer 26, and taking it out of cruel answers cut them from 3 to 0.17 at layer 19. At its natural size it did nothing anywhere. One early claim, that steering drives hostility, was wrong: the model was looping and the judge rated loops as harsh. It is withdrawn.

For small models the result is a warning. A part that fires under a bad prompt may be holding the habit back, and a cut or clean-up that treats it as a culprit could make the model worse. The evidence is one model, small tests and a self-rated judge, so it supports a picture and not a settled map. Chapter 11 turns to the other way of keeping habits out: clean lessons.

## References

Arditi, A., Obeso, O., Syed, A., Paleka, D., Panickssery, N., Gurnee, W., and Nanda, N. (2024). Refusal in Language Models Is Mediated by a Single Direction. arXiv:2406.11717. https://arxiv.org/abs/2406.11717

Betley, J., Tan, D., Warncke, N., et al. (2025). Emergent Misalignment: Narrow finetuning can produce broadly misaligned LLMs. arXiv:2502.17424. https://arxiv.org/abs/2502.17424

Bricken, T., Templeton, A., Batson, J., Chen, B., Jermyn, A., et al. (2023). Towards Monosemanticity: Decomposing Language Models With Dictionary Learning. Anthropic, Transformer Circuits Thread, 4 October 2023. https://transformer-circuits.pub/2023/monosemantic-features/index.html

Chen, R., Arditi, A., Sleight, H., Evans, O., and Lindsey, J. (2025). Persona Vectors: Monitoring and Controlling Character Traits in Language Models. arXiv:2507.21509. https://arxiv.org/abs/2507.21509

Dai, D., Deng, C., Zhao, C., et al. (2024). DeepSeekMoE: Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models. arXiv:2401.06066. https://arxiv.org/abs/2401.06066

Gao, L., Dupré la Tour, T., Tillman, H., Goh, G., Troll, R., Radford, A., Sutskever, I., Leike, J., and Wu, J. (2024). Scaling and evaluating sparse autoencoders. arXiv:2406.04093. https://arxiv.org/abs/2406.04093

Jiang, A. Q., Sablayrolles, A., Roux, A., et al. (2024). Mixtral of Experts. arXiv:2401.04088. https://arxiv.org/abs/2401.04088

Lasby, M., Lazarevich, I., Sinnadurai, N., et al. (2025). REAP the Experts: Why Pruning Prevails for One-Shot MoE Compression. arXiv:2510.13999. https://arxiv.org/abs/2510.13999

Meng, K., Bau, D., Andonian, A., and Belinkov, Y. (2022). Locating and Editing Factual Associations in GPT. NeurIPS 2022. arXiv:2202.05262. https://arxiv.org/abs/2202.05262

Muennighoff, N., Soldaini, L., Groeneveld, D., et al. (2024). OLMoE: Open Mixture-of-Experts Language Models. arXiv:2409.02060. https://arxiv.org/abs/2409.02060

Shazeer, N., Mirhoseini, A., Maziarz, K., Davis, A., Le, Q., Hinton, G., and Dean, J. (2017). Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer. arXiv:1701.06538. https://arxiv.org/abs/1701.06538

Turner, A. M., Thiergart, L., Leech, G., Udell, D., Vazquez, J. J., Mini, U., and MacDiarmid, M. (2023). Steering Language Models With Activation Engineering. arXiv:2308.10248. https://arxiv.org/abs/2308.10248

Wang, M., Dupré la Tour, T., Watkins, O., Makelov, A., Chi, R. A., et al. (2025). Persona Features Control Emergent Misalignment. arXiv:2506.19823. https://arxiv.org/abs/2506.19823

Zhang, F., and Nanda, N. (2023). Towards Best Practices of Activation Patching in Language Models: Metrics and Methods. arXiv:2309.16042. https://arxiv.org/abs/2309.16042

Zheng, L., Chiang, W.-L., Sheng, Y., et al. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. NeurIPS 2023 Datasets and Benchmarks. arXiv:2306.05685. https://arxiv.org/abs/2306.05685

Zou, A., Phan, L., Chen, S., et al. (2023). Representation Engineering: A Top-Down Approach to AI Transparency. arXiv:2310.01405. https://arxiv.org/abs/2310.01405

