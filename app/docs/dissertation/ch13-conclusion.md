# Chapter 13. Conclusion and future work

## 13.1 Introduction

This thesis asked whether, for a small local agent model, what is in the training lessons matters more than how many there are. It built tools to change and measure models (Chapter 3), set rules for honest measurement (Chapter 4), and ran five studies (Chapters 5 to 10). It then described how the project now makes clean lessons (Chapter 11) and a course that teaches the result (Chapter 12).

This chapter does four things. It answers each research question with the checked evidence and says how strong that evidence is. It lists what was not shown. It states the contributions and the threats to validity that cut across the thesis. It then sets out the future work, led by the one experiment that would settle the main claim.

Status first, because it limits every answer below. The decisive retrain on reviewed lessons has not been run. The 534 held-out test items were sorted by a cheaper reviewer (Haiku), with a 5% spot-check by a stronger one (Opus). On 15 November MouseWurX chose to keep the held-out tests as they are while the full Opus re-sort of the lessons runs. Pull requests #254 and #257 shipped in release 1.5.238, with #251, #263 and #232; the release passed 276 of 276 checks on Windows in its lab-PC check on 15 November. Pull request #251, Qwen tool shape 2, has shipped but has not been re-tested on models. Pull request #271 then locked one working shape per family, shape 4 for Qwen brains and shape 3 for GPT-OSS brains, in release 1.5.240; neither has been re-scored. Pull request #232, on patching and autoencoders, ran on 15 November.

All numbers in this chapter come from the checked list of 15 November 2026 or from the chapters that cite their run files. This chapter introduces no new measurement.

*Added 22 November.* Section 13.2.7 gathers every main result of the thesis, including the speed and harness results of Chapters 4 and 11, in one table with what each means. Section 13.6.12 adds a possible cause to re-test, and section 13.7 sets out where the work is heading. These also add no new measurement: each number is cited from the chapter that reports it.

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

### 13.2.7 Every result in one table, and what each means (added 22 November)

The answers above cover the five research questions. The thesis also measured how the brain runs on a home PC and how well Bob's harness does real jobs. This table puts all the main results side by side. Strength uses the same plain scale as above. Each row's chapter holds the run, its limits and its source file.

**Lessons and tests**

| Result | Measured | What it means | Strength | Ch. |
|---|---|---|---|---|
| Faults in the tool lessons | 189 of 5,788 kept as written (3.3%); 4,208 needed a rewrite; scripts had found 231 of 9,059 | Synthetic lessons are mostly unfit to teach as written, and scripts miss most faults | Strong (count) | 6 |
| Leaked test items | 519 of 534 word for word in training-side files | Scores on that set can't be trusted until models are re-scored; the inflation is unmeasured | Strong (leak), none (effect) | 7 |
| The hand-off habit | 37% of coding lessons handed code off; Riker's coding race went from 6 to 9 of 13 on clean lessons (full Qwen 12); quick code test 3 to 6 of 6 | A lesson fault can become a habit and cleaning can undo it, but the re-cut also kept more experts (208 against 176) | Weak to moderate | 5 |

**Tools**

| Result | Measured | What it means | Strength | Ch. |
|---|---|---|---|---|
| Rewording tools | GPT-OSS 120B 63.3% with Bob's wording; every other wording within about 1 point | Wording is not the lever | Moderate | 8 |
| Thinking on tool steps | 54.2%, 9.1 points worse (plus or minus 5.0) | Tool steps think off | Moderate | 8 |
| Showing the exact call | Coached completion: Bobert 88% / 86%, Riker 78 / 76 of 83 steps (thinking off / on) | A hint with the exact call lifts completion; shape against content is still open | Weak | 8 |

**Inside the model and through a cut**

| Result | Measured | What it means | Strength | Ch. |
|---|---|---|---|---|
| Where a habit sits | Harshness 3.67 of 10 as built, 6.67 with 16 experts dialled to 0.3; no single feature made plain answers harsh | A brake and a direction across layers, not one "evil neuron" | Weak | 10 |
| Experts per word | 8 to 4: 82.7 to 102.5 tokens a second, quality level; 3 falls; 2 collapses (Figure 9.1) | About 4 is the floor on this brain, on small tests | Weak (one run) | 9 |
| What a cut keeps | Riker (208 kept) 205 of 314 held-out, level with uncut Bobert's 205; Bill (144 kept) 213 of 314 but 12 of 20 facts and 1 of 6 code | A cut keeps the narrow trained task and loses wide skills | Weak (inside noise) | 9 |

**Real jobs and the harness**

| Result | Measured | What it means | Strength | Ch. |
|---|---|---|---|---|
| Two brains on 200 real jobs | Qwen3.6 35B 133 right, GPT-OSS 120B 107 right; no harms (Figure 11.1) | Stock Qwen stays the default brain | Moderate (one run, one grader) | 11 |
| Mail by effort | Minimus 9, Medius 12, Magnus 7 of 30; Maximus 0 of 4 (Figure 11.2) | More effort did not help; a review argued right answers away | Weak to moderate | 11 |
| Office | 14 of 17 (after1); 27 of 36 (after2, and again in steps40) | Office mostly works; misses are finding and saving files | Moderate | 11 |
| Bob on his own code | 19 and 20 of 33 passed, 26 and 28 right; never pushed | Most failures are good work that skipped its own check | Weak (one run) | 11 |
| Other harnesses, same brain | Qwen Code 21 passed / 30 right; mini-swe-agent 21 / 29 (Figure 11.3) | Bob's extra rules did not buy right answers on coding; his lead is safety | Weak (one run) | 11 |
| Steps per job | Median 2 everyday, 4 Office, 9 coding; longest 29; the old caps cost 5 of 96 runs (Figure 11.4) | Fixed step caps cut real work; they are removed | Moderate (518 runs) | 11 |
| Broken tools | 1,650 calls read: none crashed or hung; Office file lookup failed 30% to 40% | The breakage was in finding files, not in the tools | Moderate | 11 |
| Flash-Next 125B in Bob (cloud) | Repo 29 to 32 of 33 against Qwen's 19 to 20; inbox 89% to 93% against 57% to 73%; bad calls 2 in 1,254 against 21 in 937 | A bigger brain does far better in the same harness | Moderate (one run per set) | 11 |
| Smaller Flash-Next files (cloud) | IQ3 and Q2 within a job or two of Q4 on Office and repo; inbox 82% against 86% | The smaller files lose little on pass rates; quality of work is still to be judged | Weak (one run each) | 11 |
| Held-out jobs (held1) | Office 11 against 13 of 14, repo 8 against 12 of 12, web 4 against 8 of 11 (Qwen against Flash-Next Q4) | Flash-Next's lead holds on jobs nobody tuned on | Weak (few jobs) | 11 |
| A first REAP cut of Flash-Next | 90% of experts kept: 13/14, 12/12, 9/11, inbox 93%, no harms, same as or above all experts | A light cut costs nothing measurable; deeper levels were still running | Weak (few jobs, no heal) | 11 |
| Every REAP keep level (Flash-Next, masked) | 100 to 60% kept: Office 12 to 13 of 14, repo 10 to 12 of 12, web 8 to 9 of 11; one harm at 75%; inbox drops at 65 and 60%; Office 9 of 14 at 50% (Figure 11.5) | 80% is the floor; the cut keeps 410 of 512 experts per layer | Weak (one run per level, few jobs) | 11 |
| Redirecting cut experts | Inbox finding 64 of 117 against 85 (mask) and 90 (all experts) | Dropped; cut experts are removed outright | Weak (one run) | 11 |
| Bob Routines on the home PC | 18 of 18 live checks, 103 of 103 tests; n8n import on 361 workflows, no crashes, median 56% of steps converted | Clerk work can run without the brain; effect on jobs untested | Moderate (checks), none (jobs) | 13 |

**Speed on the home PC** (every speed result in one table: section 4.3.4; method in section 4.3.3.1 and section 4.3.3.10; the tests of 22 November in section 4.3.3.11)

| Result | Measured | What it means | Strength | Ch. |
|---|---|---|---|---|
| Bob's settings against stock defaults | 64K job 37.4 s against 70.2 s; first word 10.1 s against 36.8 (Figure 4.3) | Most of the gain is settings any llama.cpp user can pass, not the engine | Moderate (5 rounds) | 4 |
| Answers under the speed settings | Perplexity moves only in the last digits; q4_0 chat memory a borderline pass on mean KLD | The speed settings do not change the answers in a way the screens can see | Moderate | 4 |
| The cost of the engine's patches | Features off: nothing measurable; the fNRI trace 2% or less after the fix | The instruments can be left in without slowing Bob | Moderate (3 rounds) | 3 |
| The 256K cliff | Step 8192 leaves only 30 of 41 layers on the card; writing collapses (Figure 4.1) | Don't go past about 6144 at 256K | Strong (mechanism) | 4 |
| The "spill" | It is the attention mask in pinned RAM, matched to the MiB in every load | No card memory went to RAM; the earlier speeds stand | Strong | 4 |
| 3-bit and Progressive chat memory | q3_0 saves 22% of chat memory at 256K and passes perplexity; Progressive 8+4 beats q4_0 on every drift measure | Long chats can use less card memory at a measured speed cost | Provisional | 4 |
| Sharing misses with the processor | 24 against 82 to 88 t/s with patch 0040 on and off, Brain Engine 22 to 28 (Figure 4.5) | 0040 is the whole slowdown; a fast rewrite (0055) awaits its home-PC run | Moderate (one round per row) | 4 |
| Borrowed reading, Brain Engine 29 (Gate 1) | 64K job 42.1 against 44.5 s; writing 3.8% slower at 32K, 18% at 128K; step stuck at 4096 | Failed the gate; the 128K drop was a different answer from a bigger batch, not borrowing | Moderate (5 rounds) | 4 |
| Lending from every bank, Brain Engine 31 | Wrote "3333…" on every borrow run | A layout bug, fixed in Brain Engine 32; all its borrow numbers void | Strong (every run) | 4 |
| Flash-Next 125B on the home PC | Borrow: job 2,090 against 2,697 s, reading 36 against 22 t/s, writing 1.75 against 1.3 t/s; then a lock-up at 76 MB free RAM | Borrow helps reading; writing waits on RAM and the drive; Flash-Next stopped until a RAM floor is tested | Provisional (2 rounds) | 4 |
| Brain Engine 32 and 33 word checks | BE32 borrow on matches borrow off at 32K and 128K; BE33 matches BE28 word for word | The lending garbage is fixed; Gate 1 rerun under way | Strong (word match) | 4 |
| GUPPI release gate (Brain Engine 43) | 58.4 s, then 52 to 54 s, against plain 36.2 to 36.5 s; third try 36.3 against 37.0 s; words match | GO: GUPPI holds still within a job and shipped; MTP stays off (247 MB spill) | Moderate (2 rounds) | 4 |
| GUPPI per machine (Brain Engine 44) | Home PC 35B 45.9 against 46.2 s; dense 4B 42.0 against 32.9 s, then 33.3 s with the one-try rule; laptop 25.2 against 27.3 s with no spill | Switching pays only where the brain stays loaded and the chat is cheap to save; small brains try once and stay. Through Bob's own code it was still slower than pick (34.6 against 33.3 s on the 35B), so default-on waits on a rerun | Moderate | 4 |
| Flash-Next cuts (Bobert, Riker, Bill) | First 2-bit file 65.8 GB (down experts fell back to 4.5 bits); with Q2_0, IQ2_XXS 56.75 / 53.53 / 50.30 GB, all within 2% of prediction; Bill's IQ2_XXS failed the gate (mixers squeezed to 2 bits); mixed bits fix the screens | Check sizes and answers before publishing; job scores of the cut files to come (the pod runs were a test fault) | Weak (screens only) | 11 |
| FP4 experts on Qwen 35B | Read about 4% faster, write the same, KLD 0.063 against 0.011; 33/36 Office, 1 inbox harm | Fails the gate; dropped for squeezed brains | Moderate (one rental) | 4 |
| Registering expert RAM with the card (0109) | Writing 7% faster, reading 1% to 2%, same words, on a rented Linux card | A lossless gain, on by default on Linux; the Windows run is still to come | Weak (one rental, 3 rounds) | 4 |
| Inkling 2 Mini on small machines | Laptop 11.9 and Legion Go 10.6 t/s writing at Q2 | Fits the 6 GB laptop; not a fit for the Go (processor only, under 1 GB spare); job quality untested | Weak (single runs) | 4 |
| Avalon's own Windows build | Crashed or hung at its own steps; 20 against 44 tokens a second with fusion off | Rebuild its ideas inside Brain Engine instead | Moderate (one session) | 4 |

**What the table adds up to.** The lesson results (RQ1 to RQ3) are the best measured part of the thesis, and the decisive retrain is still missing. The speed results are many small, careful runs on one PC: they settle the defaults for that PC and say little about other machines. The harness results are new and single runs, but they changed the work: since 21 November the main task is making the stock brain finish real jobs reliably, before any more training or cutting.

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

### 13.6.10 Gaps left open by the after1 round (added 17 November)

The after1 round (Chapter 11, section 11.7.5) adds one finding and leaves several gaps. The finding is that higher effort did not help mail. Medius passed 12 of 30, Minimus 9 and Magnus 7, and Maximus passed none of the 4 it finished. At the higher levels, a review that misread a shortened tool result talked a right answer out of being right.

The gaps still open are:

- paging through long mail lists
- searching mail older than a year
- drafts by sender
- unsubscribing without moving mail
- three scorer fixes

The fixes made after the round have checks and pass the suite. Whether they raise the pass rate is unproven in our lab, as we have yet to test. The same jobs will be run again to find out.

### 13.6.11 The fNRI trace fix, and quality checks for the faster settings (added 17 November)

Before Brain Engine 11, tracing for the fNRI system changed the words the brain writes (Chapter 3, section 3.4.3). The fix keeps the router's fused kernel whole, and on 17 November traced and untraced words matched in every run. Brain Engine 12 brought the cost to 2% or less on the 35B, over 3 rounds rather than the planned 5. A full 5-round run, and the same test on GPT-OSS 120B and other cards, are unproven in our lab, as we have yet to test. The expert readings in Chapter 10 can now be rerun with the fixed trace.

The faster serving settings in Chapter 4 (section 4.3.3), a bigger reading step with a 4 GB hot-experts cache, also write different words from the default. They need a quality check on Bob's jobs, and timing on other cards, other brains and a bigger cache.

### 13.6.12 Re-cutting on a clean harness (added 22 November)

A possible cause, not a result. Riker's and Bill's keep lists were chosen from expert counts over lessons made with the older harness, and both were healed on lessons from it. That harness had known faults: 37% of the coding lessons handed the work off (Chapter 5), and section 11.7.6 found broken file lookup, lost text calls and caps that cut jobs short. If a lesson spends its turns on errors and retries, the counts favour the experts that handle failure and undercount the ones real work needs. Bill fits that picture: 12 of 20 facts and 1 of 6 code tasks, where Riker kept 18 of 20 and 6 of 6 (section 9.9). But the cut's size also explains it, since Bill kept 144 experts to Riker's 208, and the two causes have not been separated.

The test is to fix the harness first, have the full brain pass its own jobs cleanly, score the experts with REAP over those clean real jobs, cut again, and judge the new cuts against stock Qwen on jobs they never saw. Since 21 November no expert scoring or cut is made before the harness is clean (section 4.3.3.10). That the old cuts were harmed this way is unproven in our lab, as we have yet to test.

## 13.7 Where the work is heading (added 22 November)

<a id="direction"></a>

The project's goal is a reliable personal assistant on one consumer PC: mail, research, small projects and code, without crashes or bad tool calls. The thesis's results point the work in five directions. None of the plans below has a result yet, and each will be reported in full however it comes out.

**1. The harness first.** The 21 November runs (section 11.7.6) showed that the stock brain does most jobs right and loses passes on habits the harness can catch: not checking its own work, not finding files, writing calls as text. The fixes are made and tested in the suite, and the next run of the same jobs is their test. Each results report now ranks failures by count against the last round, with a fix for each. MouseWurX's aim is for Bob to work on his own code reliably; if he can't, a local harness that gates every change on the repository's own tests is the fallback.

**2. Bigger brains, tried in Bob before anything is built for them.** Two rentals were prepared and passed pre-flight on 21 November. Both wait for MouseWurX's go.

- **Qwen3.8-Flash-Next** (125B, 512 experts, 10 used per word): one H200, capped at 2.1 hours and $11. It runs the inbox, Office and repo jobs at Minimus and Medius, plus a repo run with thinking on every step, and counts bad tool calls by type against stock Qwen.
- **What came of it (added 23 November).** The Flash-Next rental ran on 21 November and did far better than the stock 35B in the same harness, and the smaller IQ3 and Q2 files scored close to Q4 the next day. On held-out jobs its lead held, and keeping 90% of its experts lost nothing (section 11.7.7). On the home PC it runs, but slowly, and one run locked the PC up (section 4.3.3.11).
- **DeepSeek V4.1 Flash**: two H200 NVL cards, the 3-bit file (395 GB), capped at 3 hours and $25. The 4-bit file was skipped because its memory table gives wrong answers on current llama.cpp, with no error.
- **Both map which experts each kind of job uses,** in a separate phase after the jobs so the trace can't skew the scores. That map is the starting data for any cut and for the engine's cache.
- **GPT-OSS 120B is no longer the planned bigger brain** (MouseWurX, 21 November). It stays as a reference that every engine change must still run.

**3. The engine: borrowing, inside Brain Engine.** Avalon's own build was not usable on this PC (section 4.3.3.9), so its ideas are to be rebuilt as Brain Engine patches on Brain Engine 28, with credit:

- the expert copy cache owns all the card's spare memory
- each reading step borrows the cache's coldest slots and fits its step to what can be lent, with no restart
- unused chat-memory cells lend room to the cache until the chat reaches them
- the reserve is measured on this PC, not copied

Each step is off by default and must pass Gate 1 (section 4.3.3.10) or be dropped. After that come the levers that today need a restart (chat-memory type by length, Turbo levers per phase), a sweep of 1 to 8 draft words for a brain with a built-in draft head, a RAM tier on Windows for brains bigger than RAM, a rule to run one-time misses on the processor and copy only the experts used again soon, and a lossless reorder of the brain file so hot experts sit together on the drive. All of this is planned and not built.

**4. Fitting a big brain on 16 GB of card and 32 GB of RAM.** By the engine work's estimate, not a measurement, Windows, the chat memory and working memory leave about 35 to 38 GB of the 48 GB for the brain file. So Flash-Next would need to keep a bit under half its experts to fit, and DeepSeek V4.1 Flash, 233 GB even at 1 bit, would keep about 15%, far deeper than any cut tested in this thesis. The method is to be proved on Flash-Next first:

- score experts with REAP over clean real jobs of every kind (13.6.12)
- set how many experts each layer uses; Brain Engine already takes one count per layer, live, while a cut file with a different count per layer needs a new patch
- judge on jobs it never saw with the absolute real-jobs gate (section 4.3.3.10)
- publish only what passes

<a id="routines"></a>

**6. Routines: less work for the brain (added 23 November).** The harness results say the brain fails most on clerk work it should not have to think about: finding files, following a fixed order, repeating the same steps. Bob Routines moves that work out of the brain. A routine is a trigger plus steps (tools, conditions, loops, and a brain step only where judgement is needed), built by hand in a node editor like Unreal's Blueprints, with execution wires and typed data wires. The person OKs a routine once, on a card that lists its exact steps and targets; after that it runs in plain code with no brain unless a step asks for one. Runs keep their state so they can resume, retry with time limits, take an error path and roll back to an earlier version. A brain may draft a routine into the editor, but only on a button that is off by default. Routines can also be brought in from n8n workflow files, by conversion and never by running n8n itself.

- **Measured.** On the home PC (real Windows, headless): 18 of 18 live checks and 103 of 103 tests passed (23 November). Steps checked include a routine refused before its OK, run after it, a change needing a new OK, and going back to an older version. One mismatch was found: after a rollback, the logbook says the routine needs a new OK while the routine stayed OK'd. The n8n importer was tried on 361 community workflows: none crashed, a median of 56% of each one's steps converted, and 3 converted as they stood. Most of the rest need a code, web-post or online-service step replaced.
- **Not measured.** The editor window on the home PC (screen control was refused), and whether routines cut harness failures on real jobs. Both are unproven in our lab, as we have yet to test. Routines ship in PR #320 with the next release.

**5. Lessons wait.** Training is parked until the harness is clean. The decisive retrain of section 13.6.1 is still the test of the headline claim, and a new Bobert is to start from fresh stock Qwen. Stock Qwen stays the default unless a trained or cut brain beats it on held-out jobs.

What would change this plan: if Flash-Next in Bob does no better than the stock 35B on the same jobs, the case for fitting a bigger brain at home weakens and the effort goes to the harness and the 35B. If the harness fixes do not lift passes, the comparison with plain harnesses (Figure 11.3) says to use fewer rules, not more.

## 13.8 Closing

The thesis began with a small model that handed work off to a tool when it should have done the work itself. Looking for the cause led to the lessons, and then to the test. The lessons held far more faults than scripts had found. The test held items that were also in the training files. The tools built along the way were needed to see either of these.

What the thesis shows is therefore a method and a warning more than a final answer. The method is to read everything, count honestly, and report what failed. The warning is that a score is only as good as the separation between the test and the lessons. The claim that clean lessons beat more lessons is supported in part. It is not proved, because the decisive retrain is still to run. That is the next piece of work, and it should be reported in full whichever way it comes out.

## References

This chapter cites one paper beyond the project's own run files and the checked list: Chen and Yao (2026), listed in Chapter 2. The literature for the thesis is in Chapter 2, and the references for the course design are in Chapter 12.
