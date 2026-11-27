# The Instrument Changed the Answer

### Watching Without Perturbing: Diagnosing Observer Effects in Instrumented Mixture-of-Experts Inference

**MouseWurX** · Draft, 23 November 2026 · Drawn from chapter 3 of the dissertation ([ch03](../dissertation/ch03-building-the-instruments.md))

> **Status: draft for review.** Every number below is taken from the dissertation and checked against the run summaries, engine notes and cost ledger named in Appendix B. Where a number could not be traced to a published file, Appendix B says so.

---

## Abstract

We built a tracing patch for llama.cpp that reports which experts a mixture-of-experts model picks for every token. It was meant only to read. On one consumer 16 GB card, with stock Qwen3.6 35B A3B at temperature 0, turning it on changed the words the model wrote. Each setting was steady with itself (5 of 5 runs gave the same words), so this was not ordinary run-to-run noise: the instrument had changed the computation it was meant to watch.

We diagnosed the cause by ablation, with decision rules written before each run. Turning CUDA graphs off cost 38 to 42% of writing speed but kept the words, so graphs were not the cause. Removing the output mark on the router's sort still changed the words, so the mark was not the only cause: the evaluation callback changed them too. The likely mechanism is that both split the graph piece in which the card fuses the router's softmax, sort, top-k and weighting into one kernel. A control that switched fusion off by hand changed the words in the same way, which supports it. The fix (patch 0021) copies the picks from kept tensors after the fused kernel, with no callback and no output mark. Output became byte-identical with tracing on and off. The writing cost fell from about −11% (different words) to −4% (same words) to −2% or less (same words) across three engine builds.

We place this result inside a ladder of verification rungs, from byte-identical output down to dry runs, and show which rung caught the fault and which rungs could not have. We also report a failure inventory of a one-person rental training pipeline as a design method: every costly mistake came from a quiet default or a missing guard. Finally, we admit what is still missing. No patch is tested automatically against a real card build, and a mask placed after the top-k pick would give wrong answers without any error.

---

## 1. Introduction

Interpretability work on mixture-of-experts (MoE) models often starts with a simple question: which experts fire for this input? In a MoE layer a learned router sends each token to a few of many expert sub-networks (Shazeer et al., 2017). Qwen3-family models pick 8 of 256 per layer (Yang et al., 2025). Recording those picks during real serving looks harmless, because it only reads integers the engine already computes.

This paper reports a case where it was not harmless. A read-only trace changed the model's output at temperature 0. That matters well beyond our project. Any expert map or routing statistic taken with such a trace describes the traced model, not the one users talk to. In our own work, every expert map taken before 17 November 2026 describes a slightly different brain.

We make three contributions.

1. **An observer effect in a fused-kernel MoE pipeline, diagnosed and fixed.** We show how a tracing path changed temperature-0 output. We show by ablation which parts of the path did it, and we fix it with byte-identical output and a measured cost of 2% or less (Section 3).
2. **A verification ladder.** We order the checks a self-built inference toolchain can run by how much each one proves. We show that the observer effect slipped past a check on a lower rung, which compared the trace's rows rather than the model's words. We also list the rungs our own toolchain still skips (Section 4).
3. **A failure inventory as a design method.** We logged every failed paid rental with its cost and cause. Turning each failure into a guard shaped the training pipeline more than any up-front design did (Section 5).

The tooling is a patched llama.cpp ("Brain Engine") and a rental training pipeline ("the Forge"). Appendix A says what they are in one sentence each; the dissertation describes them in full.

## 2. Setting

**Engine.** Brain Engine is llama.cpp at the pinned tag b12359, with the project's patches applied in order (ENGINE-MAP.md). The patches that matter here are:

- **0002** returns the experts picked in every layer for every token when a request asks for it.
- **0010** keeps each layer's picks on the card and fetches them with one wait. Before it, the trace stopped after every layer.
- **0021** is the fix described in Section 3.5.

Bob's live expert view (the "fNRI" view) and its brain scans both rest on this trace.

**Hardware and model.** All card measurements in Section 3 come from one desktop PC with one 16 GB consumer NVIDIA card (RTX 5070 Ti). They use stock Qwen3.6 35B A3B in the unsloth UD-Q4_K_XL quantization (22,360,456,160 bytes).

**Protocol.** Each row was loaded 5 times, with rows taking turns. Each load had an untimed warm-up, then each prompt was timed once at temperature 0 with 300 tokens written. There were two prompts: a short start prompt and a 32K-token prompt, each fixed by its sha256. Card temperature, clocks, throttling and free RAM were logged for every run (docs/test-results/2026-11-16-speed-test-method.md). Each rule below was written down before its run.

## 3. The observer effect

### 3.1 Detection

The first night of speed tests (16 November) and a calibration run the next morning (17 November, 85 loads) compared a row with the live trace on (G4) to the untraced baseline (Y0). Every row wrote the same words in all 5 of its own runs. G4's words differed from Y0's. Its writing speed was −11% on the short prompt and −8% at 32K (docs/test-results/2026-11-17-calibration-results.md).

Each row was steady with itself, so neither run-to-run noise nor batching can explain the difference. The difference came from the trace path.

### 3.2 What the trace path changes

The trace path changes two things in the compute graph:

1. **An output mark.** Patch 0010 marks the router's sorted list as a graph output (`ggml_set_output`), so all layers can be read at once.
2. **An evaluation callback.** The scheduler calls it at each traced node, which splits each step's graph at that node.

The calibration could not separate the two. A third row was planned for that: the trace with its mass (patch 0009, row G2). In Brain Engine 9, G2 takes a path without `ggml_set_output` but keeps the callback.

**Rule written in advance:** if G2 writes the same words as Y0, the output mark is the cause. If not, the callback changes the words too, and the fix must drop both (docs/test-results/2026-11-16-speed-test-method.md, Addendum 18).

### 3.3 Ablation results

The cube check ran Y0, G4 and G2 on both prompts. It took 5 rounds (15 loads) in the same engine, brain and settings, on 17 November. CUDA graphs off (G0) comes from the calibration run that morning.

| Row | What changes | Writing, short (t/s) | Writing, 32K (t/s) | Words compared with no trace |
|---|---|---|---|---|
| Y0 | No trace | 85.3 | 77.1 | baseline |
| G0 | CUDA graphs off, no trace | −42% | −38% | **same** |
| G4 | Trace: output mark and callback | 78.8 (−8%) | 70.2 (−9%) | **different** |
| G2 | Trace with mass: callback, no output mark | 62.6 (−27%) | 58.8 (−24%) | **different, and different again from G4** |

*Table 1. Ablation of the trace path. Medians of 5 runs. Sources: docs/test-results/data/2026-11-16-speed/cube-check-summary.md, and docs/test-results/2026-11-17-calibration-results.md for G0.*

Two conclusions follow, and one question stays open.

- **Graphs are not the cause.** Turning graphs off cost far more speed than the trace did, but kept the words. So the trace does not simply disable graphs, and graphs alone do not change the words.
- **The output mark is not the only cause.** G2 has no output mark, and its words still changed. So the callback changes the words too.
- **The open question.** G2 also asks the callback for a second node per layer (`ffn_moe_weighted`, for the mass). So this run cannot say whether the top-k callback alone changes the words. That does not change the decision: any callback in the expert path has to go.

### 3.4 Mechanism

Our hypothesis is a common cause. The CUDA backend fuses the router's softmax, sort, top-k and weighting into one kernel, but only when those operations sit in one graph piece. An output mark or a callback on a node in the middle of that chain splits the piece. The unfused route computes the same maths in a different order, so the router weights can differ in the last bits. At temperature 0 that is enough to flip a token sooner or later, and the reply then diverges from that point on.

We did not inspect the kernels directly. The evidence is indirect but specific. The fused path is the one place where both perturbations meet. And the control in Section 3.5, which turned fusion off by hand with no trace at all, changed the words in the same way.

### 3.5 The fix and its measured cost

Patch 0021 copies each layer's picks into a small kept tensor right after the router's fused kernel. The tensor is `[k_max, layers, n_ubatch]` int32, about 640 KB for 40 layers at a reading step of 512. The picks are read after each micro-batch, with no evaluation callback and no `ggml_set_output`, so the fused kernel and CUDA graphs stay on (engine/README.md).

On the processor, a tiny made-up model passed 16 checks (`engine/tests/trace-kept.py`). They covered the same words and odds with the trace on and off, and picks identical to the callback's, token by token and layer by layer.

**Rule written in advance** (Addendum 19): the fix works when each traced row writes the same words as its untraced pair, on both prompts, in all runs, and its median writing speed is within 2% of the pair. If the words differ, the fix fails whatever the speed. An amendment added a control row, U0: no trace, with fusion switched off by hand (`GGML_CUDA_DISABLE_FUSION=1`), to check that the fused kernel still runs.

The build history matters here. The first build of the fix (Brain Engine 10) crashed when the trace and the hot-experts cache were on together. Brain Engine 11 fixed the crash.

**Brain Engine 11 (17 November):** 5 rounds, 25 loads, all clean.

- With the trace on, the words were the same as with it off, on both prompts, at both settings below, in every run.
- The control U0 wrote *different* words. So broken fusion is what changes the words, and the fixed trace no longer breaks it.

| Setting | Writing cost with the trace, short / 32K | Before the fix | 2% rule |
|---|---|---|---|
| Reading step 2048 + 4 GB copy cache | −1.8% / −1.0% | crashed | passes |
| Normal (reading step 512, no cache) | −4.0% / −3.9% | −9% to −11% | misses |

*Table 2. Brain Engine 11. Reading speed stayed within about 1%.*

**Brain Engine 12 (17 November):** patch 0021, version 3, keeps one pinned copy per reading step instead of one copy per layer per token.

| Setting | Writing, trace off, short / 32K | Writing, trace on, short / 32K | Cost |
|---|---|---|---|
| Normal (reading step 512, no cache) | 92.2 / 81.2 | 90.4 / 81.2 | −1.95% / 0% |
| Reading step 2048 + 4 GB copy cache | 110.6 / 95.7 | 111.6 / 96.7 | none measured (slightly faster) |

*Table 3. Brain Engine 12. The words were byte-identical with the trace on and off, on both prompts, at both settings. Reading speed was equal, and nothing crashed.*

| Engine | Trace cost on writing (Normal) | Words |
|---|---|---|
| Brain Engine 9/10, old trace | about −8% to −11% | different |
| Brain Engine 11, kept copies | about −4% | identical |
| Brain Engine 12, one pinned copy per step | −2% or less | byte-identical |

*Table 4. The cost across three engines.*

Speeds in Table 3 are not comparable with Table 1, because the engine builds differ. Only the on/off pairs within one run are compared.

### 3.6 Why an earlier check missed it

Patch 0010 was checked before it shipped, and the check passed: "the trace it gives is the same, row for row" on a test build, with short and long prompts, in pieces and whole (engine/README.md). That check compared the instrument's readings. It never compared the model's output with and without the instrument. It also ran on a build where the fused CUDA kernel was not in play.

The perturbation was invisible to the observation by construction. Only a with-and-without comparison of the words on the real card could see it. We return to this in Section 4.

### 3.7 Consequences

Expert maps and live views made with a trace from before Brain Engine 11 describe the traced model. From Brain Engine 11 on the words match, and from Brain Engine 12 the cost on the 35B is 2% or less. We have not re-taken the earlier maps, and the dissertation marks them as made under the old trace (chapter 3, section 3.8).

## 4. Verification is a ladder

The checks used on the engine differ in strength. We order them from strongest to weakest (dissertation section 3.4.5):

| Rung | What it shows | What it cannot see | Example in this project |
|---|---|---|---|
| 1. Byte-identical output | A feature that is switched on but has nothing to do leaves output unchanged, on the real model | Effects that appear only when the feature is doing something | Expert-mask build with no expert switched off gives the same bytes as the normal engine (8 November, 35B) |
| 2. Live equals loaded | Changing a setting live matches loading the same setting from the start, and clearing it restores the old words | Errors shared by both routes | Live steering at ×8 matches loading the same vector at ×8 |
| 3. Per-layer test on a tiny model | The feature does what it claims, layer by layer, and refuses bad input | Card kernels, fusion, real model scale | `experts-per-word.py`; `trace-kept.py` (16 checks) |
| 4. Cross-build pairing | Old and new builds interoperate word for word | Anything beyond the tiny model and CPU builds | Card sharing in all four old/new pairings, tiny llama, CPU, Linux |
| 5. With-and-without timing on the real card | Speed cost and same-words on the real brain | Other cards, brains and quants | Section 3; features-off builds within 1% of plain llama.cpp |
| 6. Dry run only | The code runs end to end | Whether it helps or is correct | Pipeline self-tests on tiny models; several "untested on a card" builds |

*Table 5. The verification ladder.*

**Where the observer effect sat on the ladder.** The original check of patch 0010 was a rung-3-style check of the trace against itself. It could not see a change in the model's words. The fault surfaced on rung 5, because the speed protocol also compared the words at temperature 0, row against row. The fix then had to pass rung 3 (on the processor) and rung 5 (on the card, under a rule written in advance), and it had a positive control (U0) showing that the rung could detect the fault at all.

**The rungs we skip.** Our toolchain admits these gaps:

- **No patch is tested automatically against a real engine build.** The processor-side tests in `engine/tests/` are run by hand. The engine's build workflow compiles and publishes, and runs none of them. A weekly workflow replays the patches on the newest llama.cpp tag and opens an issue when they apply and build. That checks that the patches go on, not that they are correct.
- **Placement errors fail silently.** The expert mask (patch 0001) adds a large negative number to switched-off experts' router logits *before* the top-k pick. A mask placed *after* the pick would still build and still run, but would silently change the kept experts' weights. A dial on the wrong attention-head slice after an upstream layout change would do the same. Either error would show up only in a with-and-without comparison on the real card (ENGINE-MAP.md). A short engine test on a tiny MoE file has been proposed (mask, trace rows, dials against mask, card handshake), and it has not been built.
- **No clean per-patch overhead numbers.** With their features off, the patches cost nothing measurable on one PC, one brain and one quant (rung 5). Other cards are unproven in our lab, as we have yet to test.

The lesson we draw is general. A self-built toolchain tends to verify its instruments against themselves (rungs 3 and 6), because those checks are cheap and run anywhere. An observer effect lives in the gap between the instrument and the thing it observes, so it can be caught only by a rung that compares the observed system with the instrument on and off, on the hardware where it really runs.

## 5. Failure inventory as a design method

The training side of the project rents data-centre cards by the hour. Every rental, failed ones included, is logged with its cost and cause. As of 23 November 2026 the ledger records twenty failed paid attempts, costing $24.97, within $549.26 of rental-card spending and about 149 hours of card time (docs/COSTS.md). The dissertation's chapter 3 was written from an earlier snapshot: eleven failures, $22.40, within $484.39 and about 105 hours.

None of the failures was dramatic. Each looked normal from outside: a quiet default or a missing guard. Each one became a rule in code.

| Failure | Why it was quiet | Guard it became |
|---|---|---|
| The chat template skipped 45% of tool-call lessons, and the teacher server died (4 Nov) | The run went on with a smaller, skewed set | Teacher scored in-process; tool-call arguments parsed |
| Heals stopped by the clock: 195 of 456 steps for one model, 163 of 456 for another (5 Nov) | The models exported and looked finished | A full pass or nothing |
| New lesson jobs had weight zero and wrote nothing (6 Nov) | No error, just no output | A job with no weight gets a share of 1 |
| The PC-side window closed mid-run; the card sat idle about two hours, about $11 (10 to 11 Nov) | The pod finished its own work and waited | Every run type ends with the card deleting itself |
| A card was rented where the data drive was not; $0.40 lost (9 Nov) | Renting succeeded | A rebuild run never makes a drive; cards only where a drive is |
| Cards froze at start-up (14 to 16 Nov) | A pod that never answers still bills | A card-health log, and re-rent with that card type left out |
| The fast linear-attention kernels "installed" but never loaded | `pip install` reported success, then the library fell back silently | Build against the image's own PyTorch, and refuse to start until the kernels import |

*Table 6. Selected entries from the failure inventory (sources: docs/COSTS.md, docs/FORGE-JOURNAL.md).*

The last row is the same kind of fault as the observer effect, in a different layer. The compiled kernel module had been built against a different PyTorch, so it failed to import, and the training library quietly fell back to the slow path. After the fix, one full training pass took about 10.3 hours instead of about 16. The same pattern appeared on the measuring side. A judge rated one-word loops as harsh, which made a steering push look as if it drove hostility. The claim was withdrawn, and the judge now counts loops and wrong-language text as broken.

The method is simple. Log every failure with its cost, find the default that hid it, and turn that default into a guard that fails loudly. Its value comes from completeness, not cleverness: a failure that is not logged cannot become a guard.

## 6. Limitations

- **One machine, one brain, one quant.** All card results come from one 16 GB consumer card with Qwen3.6 35B A3B at Q4. The trace on GPT-OSS 120B, on other cards and on other backends is unproven in our lab, as we have yet to test.
- **A shortened final run.** The Brain Engine 12 run stopped after 3 rounds (16 loads), not the 5 set beforehand, by MouseWurX's choice. Its medians rest on fewer runs, and its short-prompt cost (−1.95%) sits right at the 2% line.
- **The mechanism is supported, not proven.** The fused-kernel explanation rests on the ablation and on the fusion-off control, not on inspecting the kernels. G2 confounds the top-k callback with a second callback node.
- **Raw data for the fix runs.** The night-1, calibration and cube-check runs are published with raw data (docs/test-results/data/2026-11-16-speed/). The Brain Engine 11 and 12 summaries behind Tables 2 to 4 are reported in the dissertation, but their raw files are not yet in the repository's test-results folder. They should be published before submission.
- **The experts-per-word patch uses a weighting known to be worse.** Patch 0013 changes how many experts each token uses, live. llama.cpp's Qwen3 MoE graph rescales the kept experts' weights to add up to 1. On the same base model, Chen and Yao (2026) report that going from 8 to 4 experts costs 4.65 MMLU points under that standard renormalization, but only 0.35 points when the kept weights are normalized against the top 16 instead. So the patch's default is measurably suboptimal at reduced counts. Our own 4-expert test held tools, facts and code level, but on far fewer questions and different tasks. The other weighting is not built.
- **Small stand-ins.** The strongest engine checks below rung 5 used tiny models and CPU builds. They show the code does what it claims, not that the instruments are unbiased on a large model.
- **One builder.** The code was written and checked inside one project, with an AI assistant as a contributor. No outsider has reviewed it.

## 7. Related work

**Measurement perturbation in systems.** Profilers can disagree with each other and perturb the program they measure (Mytkowicz et al., 2010). Seemingly harmless setup changes can bias performance results (Mytkowicz et al., 2009). A "Heisenbug" is a fault that changes or vanishes when you observe it (Gray, 1985). Our case is the reverse direction: the observer *creates* the change in output, through a compiler-level optimization (kernel fusion) that the instrument disables.

**Nondeterminism in LLM inference.** Temperature-0 output can differ between runs because kernels are not batch-invariant (He and Thinking Machines Lab, 2025). We rule that out here, because each row was steady with itself across 5 runs and all requests ran one at a time. The difference is between graph configurations, not between runs.

**MoE routing analysis and pruning.** Expert-activation statistics feed pruning methods such as REAP, which ranks experts by gate value and activation norm (Lasby et al., 2025). Statistics gathered under a perturbing trace would feed such methods a slightly different model.

## 8. Conclusion

A trace that only reads changed what the model wrote, because reading from the middle of a fused kernel broke the fusion. Ablation with rules written in advance found the cause, and a positive control confirmed it. Reading kept copies after the kernel fixed it, with byte-identical output at 2% or less of writing speed. The instrument's earlier check had compared the trace with itself, so it could not see the change. Only a with-and-without comparison of the words on the real card could. We think that applies to any self-built inference toolchain: the instrument has to be verified against the system it observes, on the hardware where that system runs, and the toolchain should say plainly which rungs it still skips.

---

## Appendix A. Out of scope, in one sentence each

- **The Forge** is the project's rental training pipeline: it cuts and heals MoE models on hourly cards under hard hour and dollar caps, with a pre-flight, a sample gate, a cached teacher-odds pass and a card that deletes itself (dissertation 3.5).
- **The patch catalogue**: beyond the trace patches, Brain Engine adds a live expert mask, per-part dials, live experts per token, and card sharing across machines; only the first two and the trace are relevant to the studies (dissertation 3.4).
- **GPT-OSS**: the pipeline was extended to a second MoE family with its own chat format and router layout, and its heal rules are checked only on a tiny stand-in so far (dissertation 3.5.7).

## Appendix B. Where each number comes from

| Claim | Source | Checked |
|---|---|---|
| G4 −11% short / −8% 32K, different words; G0 −42% / −38%, same words | docs/test-results/2026-11-17-calibration-results.md | yes |
| Y0 85.3 / 77.1; G4 78.8 / 70.2; G2 62.6 / 58.8; 5 of 5 steady | docs/test-results/data/2026-11-16-speed/cube-check-summary.md | yes |
| Decision rules for G2 and for the fix, U0 control | docs/test-results/2026-11-16-speed-test-method.md (Addenda 18, 19) | yes |
| 0021 design, 640 KB kept tensor, 16 processor checks | engine/README.md; ENGINE-MAP.md | yes |
| 0010 check "same, row for row" | engine/README.md | yes |
| Brain Engine 11 and 12 results (Tables 2 to 4) | dissertation chapter 3, section 3.4.3 | **raw summaries not in the repository yet** |
| Brain model and file size | calibration results | yes |
| Twenty failures, $24.97, $549.26, about 149 h | docs/COSTS.md (23 Nov) | yes; the row costs add to $24.63, and the ledger's total is from the rental statement |
| 45% template skip; 195 and 163 of 456 steps; 10.3 h vs about 16 h; $11 idle | docs/FORGE-JOURNAL.md; docs/COSTS.md | yes; COSTS.md gives the second heal's stop as step 155, the journal 163 |
| Chen and Yao: 4.65 vs 0.35 MMLU, Qwen3.6-35B-A3B, 8 to 4 experts | arXiv:2609.04575, abstract and introduction | yes (0.35 is at k2 = 16, a partial renormalization) |
| No engine tests in CI | .github/workflows/brain-engine.yml | yes |

## References

- Chen, X., and Yao, H. (2026). Training-Free Halving of Activated Experts in Fine-Grained Mixture-of-Experts Models. arXiv:2609.04575.
- Gray, J. (1985). Why Do Computers Stop and What Can Be Done About It? Tandem Technical Report 85.7.
- He, H., and Thinking Machines Lab (2025). Defeating Nondeterminism in LLM Inference. Thinking Machines Lab: Connectionism.
- Lasby, M., Lazarevich, I., Sinnadurai, N., Lie, S., Ioannou, Y., and Thangarasa, V. (2025). REAP the Experts: Why Pruning Prevails for One-Shot MoE Compression. arXiv:2510.13999.
- llama.cpp project (ggml-org), MIT licence. https://github.com/ggml-org/llama.cpp
- Mytkowicz, T., Diwan, A., Hauswirth, M., and Sweeney, P. F. (2009). Producing Wrong Data Without Doing Anything Obviously Wrong! ASPLOS.
- Mytkowicz, T., Diwan, A., Hauswirth, M., and Sweeney, P. F. (2010). Evaluating the Accuracy of Java Profilers. PLDI.
- Shazeer, N., et al. (2017). Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer. arXiv:1701.06538.
- Yang, A., et al. (2025). Qwen3 Technical Report. arXiv:2505.09388.
