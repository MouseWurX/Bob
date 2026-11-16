# Chapter 13. Conclusion and future work

## 13.1 Introduction

This thesis asked whether, for a small local agent model, what is in the training lessons matters more than how many there are. It built tools to change and measure models (Chapter 3), set rules for honest measurement (Chapter 4), and ran five studies (Chapters 5 to 10). It then described how the project now makes clean lessons (Chapter 11) and a course that teaches the result (Chapter 12).

This chapter does four things. It answers each research question with the checked evidence and says how strong that evidence is. It lists what was not shown. It states the contributions and the threats to validity that cut across the thesis. It then sets out the future work, led by the one experiment that would settle the main claim.

Status first, because it limits every answer below. The decisive retrain on reviewed lessons has not been run. The 534 held-out test items were sorted by a cheaper reviewer (Haiku), with a 5% spot-check by a stronger one (Opus). On 15 November MouseWurX chose to keep the held-out tests as they are while the full Opus re-sort of the lessons runs. Pull requests #254 and #257 shipped in release 1.5.238, with #251, #263 and #232; the release passed 276 of 276 checks on Windows in its lab-PC check on 15 November. Pull request #251, Qwen tool shape 2, has shipped but has not been re-tested on models. Pull request #271 then locked one working shape per family, shape 4 for Qwen brains and shape 3 for GPT-OSS brains, in release 1.5.240; neither has been re-scored. Pull request #232, on patching and autoencoders, ran on 15 November.

All numbers in this chapter come from the checked list of 15 November 2026 or from the chapters that cite their run files. This chapter introduces no new measurement.

## 13.2 Answers to the research questions

Each answer gives the finding, the evidence, a strength rating, and the main reason for doubt. The ratings are plain: strong means a large, directly measured count; moderate means a real measurement with a known weakness; weak means a single run or a small test; none means not shown.

### 13.2.1 RQ1: How many faults does a synthetic agent lesson set hold, and of which kinds?

**Answer.** Far more than scripts find. A full read of the tool lessons by Opus covered all 5,788 non-held-out tool lessons. It kept 189 as they stood, said 1,381 needed a fix, said 4,208 needed repair, and discarded 10. It also changed 1,922 of the cheaper reviewer's verdicts. A first script-based cleaning had removed only 231 of 9,059, leaving 8,828: 73 duplicates, 123 with no final answer, 28 with unknown tools, 6 loops and 1 empty (MAKING-SMALLER-MODELS.md; lesson-review tally).

| Evidence | Figure |
|---|---|
| Tool lessons read in full | 5,788 |
| Kept as they stood | 189 |
| Fix | 1,381 |
| Repair | 4,208 |
| Discard | 10 |
| Haiku verdicts Opus changed | 1,922 |
| Script cleaning | 9,059 to 8,828 |

**Strength: strong for the count, moderate for the kinds.** The count is large and comes from a full pass, not a sample. The weak point is that one reader decided each verdict, and the thesis has no second reader's agreement rate on a sample. The categories "fix" and "repair" are the reviewer's own, so the numbers show how often a strong reader objects, not how often a lesson would harm a trained model. Chapter 6 gives the fault types; they are not repeated here.

### 13.2.2 RQ2: Do those faults appear as habits in the trained model, and how far does cleaning fix them?

**Answer.** In one case, the evidence points that way. 37% of the coding lessons handed code off to a tool. On the coding race Riker v1 took 8 of 13 and Riker v2 6 of 13. The re-cut Riker, healed on cleaner lessons, took 9 of 13, against 12 for full Qwen. The re-cut also kept 208 experts against 176 for v1 and v2, so the gain cannot be put on the lessons alone (FORGE-JOURNAL.md).

**Strength: weak to moderate.** It is one fault, one model and one race of 13 items, and the cut changed at the same time. The project has not repeated the run to get error bars. The race is a different test from the 97-question quiz, whose noise of 3 to 5 per run cannot be carried over to it, so the size of the noise on the race is not known. The result fits the claim. It does not prove it. The wider claim, that the faults found in the full read (RQ1) become habits and that cleaning them all fixes them, has not been tested. That is the decisive retrain of section 13.6.1.

### 13.2.3 RQ3: How much do leaked test items distort the scores used to make decisions?

**Answer.** The leak is large, but the distortion has not been measured. 519 of the 534 held-out items appear word for word in training-side files, and 7 more share their first 60 characters. The held-out items themselves were sorted as 148 keep, 381 fix and 5 discard (lesson-review tally of the 534 held-out items).

| Evidence | Figure |
|---|---|
| Held-out items | 534 |
| Found word for word in training-side files | 519 |
| Sharing the first 60 characters | 7 more |
| Test items: keep / fix / discard | 148 / 381 / 5 |

**Strength: strong for the leak, none for the inflation.** The word-for-word match is a hard fact about files. But the question asked how much scores were distorted, and no past model has been re-scored on leak-free items. A reader should not conclude that earlier scores were inflated by any particular amount. They should conclude that earlier scores on those items cannot be trusted without a re-score. Section 13.6.2 describes it. The thesis rule that a held-out score is cited only after checking the test set against the leaked items follows from this finding.

### 13.2.4 RQ4: Does tool shape or lesson content matter more for tool use?

**Answer.** On the evidence so far, rewording the tool descriptions does little, showing the exact call helps, and thinking hurts tool steps.

| Evidence | Figure |
|---|---|
| GPT-OSS 120B, 264 turns, thinking off, Bob's wording | 63.3% |
| Every other wording | within about 1 point, inside the 95% range |
| Thinking on | 54.2%, 9.1 points worse (plus or minus 5.0) |
| Coaching, 83 steps, thinking off / on | Bobert 88% / 86%; Riker solved 78 / 76 |
| First try right, thinking off | GPT-OSS 120B 45 of 83; unhealed 38B 32 of 81 |

(WORDING.md and COACH.md run reports; the Bobert and Riker interview write-ups.)

**Strength: moderate for wording, weak for shape against content.** The wording result is a measured null on 264 turns, with a stated range. The coaching result shows that a last hint with the exact call lifts completion, which is evidence about what the model needs at the step. It does not compare shape with content directly. The shapes built to act on that evidence, shape 2 (PR #251) and the locked per-family shapes (PR #271), have not been re-scored, so the thesis cannot say whether a better shape beats better lessons. The honest answer is that wording is not the lever, and that shape against content is open.

**What the project now holds to.** From these results MouseWurX locked one working tool shape per brain family: shape 4 for Qwen brains and shape 3 for GPT-OSS brains. Every family keeps Bob's tool names and inputs; a family's set differs only in the tools left out and one-line notes on a pair it confuses. Lessons are written per family on that family's shape and never cross families, tools are tested only on the newest shape, tool steps think off (low for GPT-OSS), and any stricter call format may only hold a brain to its working shape (section 8.10). These are design rules grounded in the coaching evidence. That they raise scores is unproven in our lab, as we have yet to test.

### 13.2.5 RQ5: Does an unwanted habit sit in a part that causes it, or in a part that holds it back?

**Answer.** Within the limits of the tests, it looks like a brake and a direction across layers, not a single cause. On Riker, harshness scored 3.67 of 10 as built across 30 persona asks per setting. With 16 experts at dial 0.3 it rose to 6.67, at dial 0 to 6.17 and masked to 5.47. Plain answers stayed at 0, and each expert alone was within the noise. In patching, with 6 asks per test (about plus or minus 2 noise), adding the cruel gap at x1 changed nothing at any layer. At x3, plain answers rose to 1.7 to 3.5 across most of layers 19 to 29, peaking at 3.5 at layer 26. Removing the gap took cruel answers from 3 to 0.17 at layer 19 and to 0.5 at several of layers 21 to 28. No single autoencoder feature made plain answers harsher, even at x10 (Riker interview section 6a; INTERP-PATCH.md; INTERP-FEATURES.md).

**Strength: weak.** The brake result rests on 30 asks per setting and the patching on 6, with noise of about 2 on a 10-point scale. The patching run is from 15 November and has not been repeated. The reported pattern is consistent, but the sample is too small to rule out other explanations. It is one model, one habit and one family. Two older figures from a 13 November run were not confirmed and are excluded. The thesis does not claim that the finding holds for other habits or models.

### 13.2.6 What the answers add up to

| Question | Direction of the evidence | Strength |
|---|---|---|
| RQ1 faults in a lesson set | Many more than scripts find | Strong (count), moderate (kinds) |
| RQ2 faults become habits; cleaning helps | One case, confounded by the cut, supports it | Weak to moderate |
| RQ3 leaks distort scores | Leak is large; effect unmeasured | Strong (leak), none (effect) |
| RQ4 shape or content | Wording is not the lever; the rest is open | Moderate (wording), weak (rest) |
| RQ5 cause or brake | A brake and a direction across layers | Weak |

The headline claim, that clean lessons beat more lessons, is therefore supported in part and not proved. RQ1 and the leak half of RQ3 are well measured. The link from faults to habits (RQ2) rests on one case. The step that would tie it all together, training on reviewed lessons and scoring on a leak-free test, has not been done.

## 13.3 What was not shown

This list is deliberately plain. Each item is a claim a reader might assume the thesis made and that it did not.

1. **The main claim is not shown end to end.** No model was trained on fully reviewed lessons and compared with one trained on the old lessons and with stock Qwen on a leak-free test.
2. **The inflation from leaked items is not shown.** The leak is counted. The score distortion is not measured.
3. **Fault kinds are not shown to be causes.** The full read says a lesson has a fault. It does not show that each fault kind becomes a habit. Only the hand-off fault has a trained-model result.
4. **Repeatability is not shown.** The key benchmarks have not been run again for error bars. The project's own quiz moves 3 to 5 between runs on 97 questions, so small differences on small tests should be read with care.
5. **A second reader's agreement is not shown.** Opus's verdicts were not compared with a second independent reader on a sample. A 5% Opus spot-check of the held-out items agreed with Haiku on 25 of 27 (heldout-534 TALLY.md), too small a sample to give an agreement rate for the lessons.
6. **The locked tool shapes are not shown to help.** Shape 2 (PR #251) and the locked shapes, Qwen shape 4 and GPT-OSS shape 3 (PR #271), were built from coaching evidence and not re-scored. The planned shape-4 rerun stopped when its rented card froze at start-up.
7. **A second model family is only partly in.** Almost every result is on Qwen3.6-35B-A3B. GPT-OSS 120B and the 38B cut are partial. The thesis does not show the same lesson-cleaning effect on the second family.
8. **The evil-neuron question is not settled.** The brake and the direction are reported at small sample sizes. A model trained on clean lessons has not been checked the same way.
9. **Human judgement is not shown.** Persona harshness was scored on a 10-point scale, and no human ratings were collected.
10. **The course is not shown to teach.** The learner study of Chapter 12 has not been run.
11. **Released behaviour is not shown.** PRs #254 and #257 shipped in release 1.5.238 on 15 November; the thesis reports what passed checks, not how users fare with them.

## 13.4 Contributions

The thesis makes five contributions. Each is stated with the strength given above, and none is larger than its evidence.

1. **Instruments.** Brain Engine with a switch for experts that gives byte-identical output when nothing is switched off, and live steering at x8 that matches loading the vector at x8 (PR #227; Chapter 3). These let the project change and read a model without guessing whether the tool itself had altered it.
2. **A measurement discipline.** Held-out splits, a never-taught gate, smoke gates before paid steps, full passes only, measured-only reporting, and a count of every failure including the failed paid attempts (Chapter 4). The discipline caught problems that the numbers alone would have hidden, notably the leak.
3. **A count of faults and of leaks.** A full read of 5,788 tool lessons and 534 held-out items, with the verdict tallies of sections 13.2.1 and 13.2.3 (Chapters 6 and 7).
4. **A set of negative and partial results.** Wording is not the lever on GPT-OSS 120B; thinking costs tool accuracy; a heal trains toward the teacher, so by design it would copy the teacher's faults (not measured separately); an already-cut model has little slack; the habit pattern looks like a brake (Chapters 8 to 10). Negative results are reported at the same length as positive ones.
5. **A clean-lesson pipeline and a course.** Pre-flight checks in code, a sample gate, real tool results in a sandbox per lesson, and a 42-lesson, 17-unit course, shipped in release 1.5.239 and off by default, that teaches the lessons of the thesis (Chapters 11 and 12). The sample gate worked on one real run. On the lkt-fix3 run only 1 of 10 sample ideas saved, the run stopped, and the pod was deleted after about $0.31 (forge console log).

## 13.5 Threats to validity across the thesis

Each chapter lists its own threats. This section gathers those that cross chapters.

### 13.5.1 Internal validity

- **Test leakage.** The largest threat, and the thesis's own finding. Any score on the 534 held-out items may be inflated by training-side copies. Held-out scores quoted in earlier chapters should be read with that warning.
- **The sorter is a model.** The lessons and test items were sorted by language models. Haiku did the first pass; Opus read all the tool lessons and changed 1,922 verdicts. The held-out items were sorted by Haiku with a 5% Opus spot-check. Reviewer error is possible in both directions, and MouseWurX chose to keep the held-out tests as they are while the full Opus re-sort runs.
- **Noise.** Small tests move between runs. The 97-question quiz moves 3 to 5. The persona and patching runs use 30 and 6 asks. Conclusions that rest on a few points of difference on such tests are weak.
- **One run per condition.** Most comparisons are a single run, without repeats.
- **Confounds in a cut and heal.** A healed model differs from its parent in size, in data and in training steps. Chapter 9 reports what the cut changed; it cannot separate the cause of every difference.

### 13.5.2 Construct validity

- **What the scores measure.** A held-out lesson cross-entropy, a coding race of 13 items and a tool-step rate each measure part of what "agent ability" means. None measures it as a whole.
- **Harshness rating.** The persona score is a 10-point scale with no human ratings behind it. It may not match human views of harshness.
- **Faults as habits.** A fault in a lesson is judged by a reader. A habit in a model is judged by a test. Showing that the first becomes the second for each fault kind is the missing link of RQ2.

### 13.5.3 External validity

- **One family.** Nearly all results are on Qwen3.6-35B-A3B and its cuts. The GPT-OSS results are partial.
- **Small local models.** The claim is about small local agents. It is not shown for larger or hosted models.
- **One toolset.** Tool lessons are tied to Bob's own tools and its shape. Another toolset might show other faults.
- **One hardware and software stack.** The measurements use Bob's modified llama.cpp engine and its own lab machine.

### 13.5.4 Conclusion validity

- **No error bars.** Without repeats, the project cannot say how often a difference of this size appears by chance.
- **No multiple-comparison control.** Several wordings, settings and layers were compared. A few apparent effects may be chance.
- **Selection of what to report.** The thesis uses a checked-numbers list and excludes unconfirmed figures. This protects against overclaiming but also means some interesting but unchecked results do not appear.

### 13.5.5 Process threats

The thesis was written inside the project, by the people and process that built the tools. Every number was checked against a run file on 15 November. That check makes a number traceable but does not remove errors in the run itself. An outside replication would be the stronger test.

## 13.6 Future work

The items below are ordered by how much each would change what the thesis can claim.

### 13.6.1 The decisive retrain on reviewed lessons

Train on the fully reviewed lessons, on the old lessons, and use stock Qwen as a baseline. Score all three on a leak-free test. Report the result whichever way it falls. This directly answers RQ2 and the headline claim. The pipeline (Chapter 11) is built for this, with its pre-flight checks and sample gate, but the run has not been done and the review of the lessons is still in progress. A report from the round in progress says Opus kept 17 of 215 as they stand; this is reported, not yet checked against a file, and is not used as evidence.

### 13.6.2 Re-scoring past models on leak-free items

Build a leak-free item set, then re-score the models that were scored on the leaked set. The gap between old and new scores is the answer to RQ3 that the thesis lacks. The project's own rule, to check the test set against the leaked items before any held-out score is cited, applies from the start.

### 13.6.3 Re-testing the locked tool shapes

Re-test Riker and Bobert on Qwen shape 4, and GPT-OSS on shape 3, with the same wording and coaching turns (model-lab/forge/plans/shape4-retest.json). This would show whether the coaching-led changes helped, and would let RQ4's shape-versus-content question be answered directly.

### 13.6.4 More asks per patching test

Raise the number of asks per test above 6, so the noise of about plus or minus 2 shrinks. Repeat the patching on a model trained on clean lessons. If the same brake and direction appear, RQ5 becomes stronger. If not, the earlier result may be an artefact of a small sample or of the training data.

### 13.6.5 A second model family

Repeat the cleaning, the cut and heal, and the habit checks on the GPT-OSS family, including the 38B cut. The count ladder, the REAP trims and the heal were run mainly on Qwen. The GPT-OSS 120B REAP trims (204, 204 and 196 at 100, 75 and 50% kept) are a start, not a replication.

### 13.6.6 Human ratings

Collect human ratings of persona answers and of lesson quality, and compare them with the scores and verdicts already used. This would test whether the harshness scores and the reviewer verdicts agree with people. It would also supply the second-reader agreement rate that RQ1 lacks.

### 13.6.7 A learner study

Run the pre/post study of Chapter 12, with a reading-only comparison group, leak-free quiz items and full reporting. It would show whether the course teaches what the thesis found. The course is built on the thesis, so a failure there would also point to places where the thesis explains itself poorly.

### 13.6.8 Smaller items

Several smaller tasks follow from the limits above: repeat the key benchmarks for error bars; add a second reader on a sample of lessons; check every held-out set used so far against the leaked items; and keep the course's Real result panels in step with new results.

### 13.6.9 The router rules on a real heal

The router rules of section 4.12.1 come from reading, not from a run. So does the finding that the GPT-OSS router sat outside the heal's low-rate group: it is unproven in our lab, as we have yet to test it on a real brain, and the router gate in the first minutes of the first GPT-OSS heal is that test. Three more tests would settle the rules. First, one heal with the routing record on, so that the share of picks a heal changes is known for the first time. Second, the same cut healed with the router learning and with it frozen, scored on the same held-out lessons. Third, a Brain Engine option that keeps fewer experts at their share of a wider group, as Chen and Yao (2026) propose, tested against today's weighting at 4 and 6 experts per word on the tool score, the quiz and the coding race. None of these has been run, and each rental is waiting on approval.

### 13.6.10 Real jobs after the loop fixes (added 16 November)

The 800-job run of section 11.7.5 showed that Bob's own checks caused most of the repeated answers (section 4.5.5). The checks were narrowed and a whole-job test was added that runs every Effort level through the real loop with a scripted brain. That test passed, and it found one more fault: at the Maximus level, the final answer was told a file had not been saved after an earlier step had saved it. The next test is the same real jobs, read the same way, on the fixed loop. The effect of the fixes on a real brain is unproven in our lab, as we have yet to test it. A run of a distilled model at all four Effort levels on the first part of the fixes had started when this was written, and its read will give the first count.

## 13.7 Closing

The thesis began with a small model that handed work off to a tool when it should have done the work itself. Looking for the cause led to the lessons, and then to the test. The lessons held far more faults than scripts had found. The test held items that were also in the training files. The tools built along the way were needed to see either of these.

What the thesis shows is therefore a method and a warning more than a final answer. The method is to read everything, count honestly, and report what failed. The warning is that a score is only as good as the separation between the test and the lessons. The claim that clean lessons beat more lessons is supported in part. It is not proved, because the decisive retrain is still to run. That is the next piece of work, and it should be reported in full whichever way it comes out.

## References

This chapter cites one paper beyond the project's own run files and the checked list: Chen and Yao (2026), listed in Chapter 2. The literature for the thesis is in Chapter 2, and the references for the course design are in Chapter 12.
