# Chapter 9. Study 5: lessons through a cut

## 9.1 Introduction and research question

Bob's smaller models are made in two steps. First a large model is cut: experts are removed from it. Then the cut model is healed: it is trained to match the large model as a teacher, using Bob's lessons and general text. The question for this chapter is about the order of work and about what a cut does to what lessons taught.

The question is: if a model is cut smaller, what happens to what its lessons taught it, and does that mean lessons must be clean before the cut? This bears on research questions 2 and 4 of the dissertation. If a heal copies the teacher's habits, then a fault in the lessons that made the teacher is carried into every cut. If the cut also removes the slack that let a large model absorb faults, a fault that was harmless at full size can break a small model.

The chapter reports five measurements. They are expert counts and the coverage rule that decides which experts a cut keeps; the count ladder that says what each size keeps; trims with no heal, which show how much slack a model has; five heal reports; and a three-model comparison. It adds a long-context check. It then sets out the argument for cleaning first, and says plainly which parts of that argument are measured and which rest on how the heal is built.

Two facts about status frame everything below. The decisive test, a retrain on reviewed lessons with the same cut, has not been run. And the held-out test items that other chapters use were sorted by Haiku with a 5% Opus spot-check; on 15 November MouseWurX chose to keep them as they are while the full Opus re-sort of the lessons runs (chapter 7).

## 9.2 Related work

**Mixture of experts.** Shazeer et al. (2017) introduced a layer of thousands of feed-forward experts with a learned gate that activates only a few per input, which let models grow in parameters without a matching rise in computation. Switch Transformers (Fedus et al., 2021) simplified the routing to one expert per token to reach very large sparse models. Mixtral (Jiang et al., 2024) is a sparse model that routes each token to two of eight experts per layer and matches larger dense models with about 13B active parameters. Qwen3.6-35B-A3B, the base of Bob's models, and GPT-OSS 120B are in this family. Bob's base has 40 layers of 256 experts with 8 chosen per word (FORGE-JOURNAL.md, BOBS-OWN-MODELS.md).

**What experts specialise in.** OpenMoE (Xue et al., 2024) analysed routing in open sparse models and reported that routing decisions are predominantly based on token identity, with little sensitivity to context, and that token-to-expert assignments form early in pre-training and then stay largely fixed. This agrees with our measurement in section 9.4 that experts follow word patterns, not topics. We did not test token identity directly.

**Expert pruning.** Lu et al. (2024) proposed post-training methods that prune or skip experts in mixture-of-experts models, both task-agnostic and task-specific. REAP (Lasby et al., 2025) argues that pruning prevails over merging for one-shot compression of sparse models for generative tasks, and scores each expert by the router's gate value times the size of its output. Bob's forge has both: a REAP score and a fold option that blends dropped experts into kept ones (model-lab/forge/README.md, builds 20 and 21). The first four Bobs and the current ones were cut by pick counts and the coverage rule, not by REAP. REAP was used in the no-heal trims of section 9.7. Lasby et al.'s result favours dropping over folding, so our untested fold option goes against their evidence and should be tried only as a comparison.

**Depth and width pruning with distillation.** Minitron (Muralidharan et al., 2024) shrank a 15B model to 8B and 4B by pruning and then retraining with knowledge distillation on a small share of the original data, at a fraction of the cost of training from scratch. Sreenivas et al. (2024) describe the practice in more detail, compare depth and width pruning, and find that lightly fine-tuning the teacher helps when the original data is not available. Bob's plan follows this "prune then distil" pattern for experts and names Minitron as the method for the smallest rung, which would also be cut in depth and width (BOBS-OWN-MODELS.md).

**Distillation.** Hinton et al. (2015) proposed compressing a model by training a smaller one on the larger model's output probabilities. Bob's heal does this: the loss weights the teacher's top-32 next-word odds at 0.7 and the real next word at 0.3, on answer tokens only (MAKING-SMALLER-MODELS.md, FORGE-JOURNAL.md). The heal's trainable part is low-rank adapters (LoRA; Hu et al., 2021) on every linear layer, on the experts and on the router, folded back into the weights after training.

**Long context.** RULER (Hsieh et al., 2024) extends the simple needle-in-a-haystack test, finding that most long-context models score near-perfectly on the simple test but degrade sharply on harder tasks as input length grows. Our long-context check (section 9.10) is the simple kind.

**What this study adds.** The cited work compresses a model and reports how much benchmark quality it keeps. We ask a different question: when the data that made the teacher holds faults, what does compression do to those faults? That question depends on the lessons. The other chapters count the faults. This chapter explains why they matter for the order of work.

## 9.3 Method

### 9.3.1 Models and the cut

All cuts are of Qwen3.6-35B-A3B, which has 40 layers and 256 experts per layer, with 8 chosen per word. The non-expert parts of about 2 billion parameters (word list, attention, router) stay in every Bob. Each expert kept per layer adds about 0.12 billion (BOBS-OWN-MODELS.md). The models are:

| Model | Experts kept per layer | Cut from | Note |
|---|---|---|---|
| Bobert (35Bob) | 256 (no cut) | Qwen3.6-35B-A3B | trained on all of Bob's lessons; teacher of the others |
| Riker (28Bob) | 208 | the teacher, with the coverage keep list | kept as the everyday brain |
| Bill (20Bob) | 144 | Bobert, healed against Bobert's odds | published |
| First Riker v1, v2 | 176 | the teacher, by busiest experts overall | retired and deleted 8 November |
| First Bill v1, v2 | 128 | the healed first Riker | retired and deleted 8 November |

### 9.3.2 Counts and the coverage rule

A count records how often each expert is picked while the full model reads a set of lessons. The first cuts kept the busiest experts overall. The coverage rule replaced that. Experts are counted separately for each of 24 skills (chat, tools, coding, knowledge, maths, plans, writing, formats, thinking, longtext, gamemaster, help, refusals, pictures, languages, recover, clarify, notes, newtool, selfcheck, codefix, selfhelp, research and understand). For each skill, enough experts are kept in every layer to cover a set share of that skill's routing, and the union over skills is kept. Every layer is padded to one size with the most-used experts overall, because the model file needs equal layers.

The documented rule is 95% for every skill and 99% for tools, coding and exact formats (MAKING-SMALLER-MODELS.md, BOBS-OWN-MODELS.md). A bug in the forge meant Riker's keep list used 95% for every skill. The ladder table is the real measurement of what 208 experts keep, and the bug is fixed for Bill's list (BOBS-OWN-MODELS.md). A separate run of the rule for the teacher, reported in the count ladder file, kept 250 of 256 experts per layer, with a minimum union of 202, an average of 235.0 and a maximum of 250.

### 9.3.3 The heal

The heal trains the cut model with LoRA adapters at rank 32 (rank 8 on the experts), a learning rate of 0.0001 (0.00002 for the router), one epoch, 65,536 tokens per step, and a weight alpha of 0.7 on the teacher's distribution (heal-report.json files). About a third of the mix is general text, 10 million tokens, so that the model keeps general knowledge. Heals that ran to the end are called full passes. The first heals were stopped by a clock cap partway through and are called part-healed. Each report gives, before and after, `ce` (how surprised the model is by the words of held-out lessons; lower is better), `kd` (its distance from the teacher's odds) and `teacher_ce` (the teacher's own score, the floor). The same three numbers are given for general text.

`ce` is a loss, not an error rate, and it measures closeness to the teacher, not truth.

### 9.3.4 The trims, the ladder and the checks

The trims switch experts off in place by setting their router bias very low, with no retraining, and score the model on 314 held-out chat turns from 196 held-out Bob conversations. A turn counts as correct for the same tool decision as the full model made (BOBS-OWN-MODELS.md; the "overall" score combines right tool, right arguments and correctly no tool). The ladder is a free calculation on the full model: for each size, which share of each skill's routing do the kept experts cover. The experts-per-word test uses Bob's real prompt and tools, 97 plain requests, 20 short facts and 6 small coding tasks, with thinking off.

## 9.4 Results: what experts do, and the coverage rule

**Experts follow word patterns, not topics.** Any job's top 96 experts cover another job's routing about as well as that job's own top 96, 72 to 76% (MAKING-SMALLER-MODELS.md). So there is no clean "coding experts" set. Twenty-three of the twenty-four skills move together within two points at every size (BOBS-OWN-MODELS.md). The exception is "longtext", the column that BOBS-OWN-MODELS.md labels general knowledge outside Bob's own jobs, which falls faster (section 9.5).

**The work is spread wide.** The busiest 48 experts per layer cover 51.5% of picks, 32 cover 39.6% and 16 cover 24.3%. Ninety percent coverage needs 155 of 256 (BOBS-OWN-MODELS.md). There is a small amount of separation: the busiest 48 experts for coding overlap the general top 48 by only 80%, and for deep thinking by 73%.

**The rule protects skills; it does not make specialists.** The old keep list of 176 experts kept 92.0% of coding's routing, 93.2% of all lessons and 89.6% of maths, knowledge and plans (BOBS-OWN-MODELS.md). The coverage rule's own numbers at the same size are close, so the first Riker and Bill were not badly cut for coding. The rule still changed, because nothing in the old one stopped a skill from losing its experts. Since skills move together, "no clever keep list can make a small Bob good at one thing and bad at another: the size itself decides" (BOBS-OWN-MODELS.md).

## 9.5 Results: the count ladder

The count ladder (docs/forge-runs/2026-11-06-counts-v3/ladder.md) gives, for each size, the share of each skill's routing that survives, as average over 40 layers and worst single layer. The table picks five of the 24 columns.

| Experts kept (of 256) | chat | tools | coding | knowledge | longtext |
|---|---|---|---|---|---|
| 248 | 100 / 99 | 100 / 99 | 100 / 99 | 100 / 99 | 100 / 98 |
| 208 | 98 / 93 | 98 / 92 | 97 / 92 | 97 / 92 | 90 / 84 |
| 176 | 94 / 85 | 94 / 84 | 93 / 84 | 93 / 85 | 78 / 68 |
| 144 | 89 / 77 | 89 / 75 | 88 / 75 | 87 / 76 | 66 / 56 |
| 128 | 85 / 72 | 85 / 70 | 84 / 70 | 83 / 71 | 60 / 51 |
| 96 | 76 / 60 | 76 / 59 | 74 / 58 | 73 / 59 | 48 / 38 |
| 64 | 62 / 46 | 62 / 44 | 60 / 44 | 60 / 45 | 36 / 26 |

Each cell is average / worst layer, in percent.

At 208 experts a typical skill keeps 97 to 98% of its routing. At 144 it keeps 87 to 90%. The column with the lowest values is longtext: 90% at 208, 66% at 144 and 60% at 128. The checked-numbers file calls this "general knowledge". BOBS-OWN-MODELS.md explains that this column means knowledge outside Bob's own jobs, counted on web articles and open chats on random topics mixed into the heal, and not reading long documents or context length. In the ladder file the same column is named longtext. We use both names for the same numbers, matched by value, and we have not checked the naming in the code.

Layer 2 is the worst layer for every skill. At the 250-expert list the worst layer is also layer 2, with 99.2 to 99.4% for most skills and 98.9% for longtext. The ladder file's guide is that a skill whose worst layer drops under about 85% "will feel the cut there; the heal softens but cannot undo it".

**Reading.** A cut Bob stays good at being Bob and gets vaguer about the wide world. The ladder is a measurement of routing coverage on the full model, not of answer quality. It predicts where quality might fall. The next sections measure quality.

## 9.6 Results: experts per word

Experts per word is a separate setting from the cut: how many of the experts that remain the router uses for each word. On the full model (Qwen3.6-35B-A3B, thinking off; experts-per-word-full-qwen-2026-11-04.md):

| Experts per word | Right tool (of 97) | Facts (of 20) | Code runs (of 6) | Speed (tokens/s) |
|---|---|---|---|---|
| 8 | 45 | 20 | 6 | 82.7 |
| 6 | 45 | 20 | 6 | 92.1 |
| 4 | 44 | 20 | 6 | 102.5 |
| 3 | 26 | 19 | 4 | 106.7 |
| 2 | 1 | 11 | 0 | 106.0 |

Quality held at 8, 6 and 4 and fell at 3. At 2 it collapsed to 1 of 97 right tool and 0 of 6 code tasks. The same test on four healed cuts at the default 8 per word:

| Model | Experts kept | Right tool (of 97) | Facts (of 20) | Code runs (of 6) |
|---|---|---|---|---|
| Riker v1 | 176 | 53 | 20 | 4 |
| Riker v2 | 176 | 48 | 20 | 3 |
| Bill v1 | 128 | 45 | 12 | 0 |
| Bill v2 | 128 | 45 | 11 | 0 |

(forge-runs/benchmarks/experts-test-*.md.) Here is a pattern to note. The tool quiz stays near the full model's 45 even at 128 experts, but facts and code fall. A cut protects the narrow task Bob is trained on and loses the wide skills. The tool quiz is a plain-request quiz, so this is not a claim that tool calls survive a cut in general (chapter 8 shows how Riker and Bill do on held-out chats).

Experts per word interacts with the cut. For Riker, an earlier test found 12 per word best, 68% on held-out chats against 65% at 8 (MAKING-SMALLER-MODELS.md). The tool study of 14 November did not reproduce that (chapter 8): 175 of 308 at 12 against 178 at 8. The two tests used different questions. We leave the default at 8.

## 9.7 Results: trims with no heal (REAP)

REAP trims with experts switched off and no retraining, 314 held-out turns (MAKING-SMALLER-MODELS.md). Each cell is the number of turns correct.

| Model | 100% kept | 75% | 50% | 35% |
|---|---|---|---|---|
| Bobert (uncut) | 204 | 204 | 198 | 145 |
| Riker (already cut to 208) | 210 | 204 | 163 | 72 |
| GPT-OSS 120B (uncut) | 204 | 204 | 196 | not run |

An uncut model has slack. Bobert and GPT-OSS 120B lose almost nothing down to half of their experts: 198 and 196 against 204. Riker, who is already a cut, drops from 210 to 163 at half, mostly by calling tools when he should not. Bobert at 35% falls to 145, which is a larger loss than at half. So an already-cut model has much less slack than an uncut one, and below about half the experts a cut alone is not enough.

The source says an earlier community 48-expert cut of GPT-OSS 120B made by pick counts alone "fell apart" (MAKING-SMALLER-MODELS.md). We did not reproduce that cut and we cite the claim from the project's own notes.

**Limits.** One run per model. The trim is not a heal result. The 100% column for Riker (210) is above Bobert's (204), which shows how much these totals depend on which turns each model gets right and not on a fixed ceiling. The held-out turns come from real Bob conversations by id. We did not check whether they share the leak found in the tool test items (chapter 7).

## 9.8 Results: heal reports

The five heal reports are JSON files in docs/forge-runs/. All numbers below are from them, except the "gap to teacher" columns, which we computed as `ce` minus `teacher_ce`.

| Model | Experts | Steps done / planned | Minutes | Lessons `ce` before | after | Teacher `ce` | Gap before | Gap after |
|---|---|---|---|---|---|---|---|---|
| Riker v1 (line A) | 176 | 195 / 456 | 105.0 | 0.3831 | 0.3547 | 0.3246 | 0.0585 | 0.0301 |
| Bill v1 (line A) | 128 | 163 / 456 | 90.0 | 0.5851 | 0.5006 | 0.3246 | 0.2605 | 0.1760 |
| Riker v2 (line B) | 176 | 524 / 524 | 289.0 | 0.3889 | 0.3562 | 0.3244 | 0.0646 | 0.0318 |
| Bill v2 (line B) | 128 | 524 / 524 | 272.6 | 0.5861 | 0.4868 | 0.3244 | 0.2617 | 0.1624 |
| Riker (28Bob) | 208 | 929 / 929 | 355.3 | 0.4011 | 0.3622 | 0.3244 | 0.0768 | 0.0378 |

The distance from the teacher (`kd`) fell in every run: 0.0678 to 0.0629 (Riker v1), 0.2872 to 0.1966 (Bill v1), 0.0733 to 0.0601 (Riker v2), 0.2865 to 0.1858 (Bill v2) and 0.0867 to 0.0666 (Riker). General text `ce` moved from 2.2446 to 2.2242, 2.3240 to 2.3076, 2.2447 to 2.2205, 2.3189 to 2.2996 and, for Riker, from 2.1543 to 2.1584, against a teacher floor of 2.1005. So outside knowledge held level in Riker's case and improved slightly in the others.

Four readings follow.

1. **A heal closes part of the gap and never all of it.** For Riker, the gap to the teacher goes from 0.0768 to 0.0378, about half. For Bill v2 it goes from 0.2617 to 0.1624, and a gap of 0.1624 remains. The count ladder file puts it the same way: the heal "softens but cannot undo" a cut.
2. **A bigger cut starts further from the teacher.** Bill at 128 started at 0.26 and Riker at 176 or 208 at 0.06 to 0.08. A half-cut starts far further away than a quarter-cut. After the heal the Bills are still far from the teacher.
3. **A part-healed model is part of the story.** The line A runs were stopped by the clock at 195 of 456 and 163 of 456 steps. The prose in BOBS-OWN-MODELS.md gives about 175 and 155. We use the reports' step counts and note the difference.
4. **The reports are not directly comparable.** The held-out lessons changed between rounds. The v1 reports score 86,112 answer tokens and later reports 88,841, and the teacher's own `ce` differs a little (0.3246 against 0.3244). Compare rows by their own gap to teacher, not by raw `ce` across rounds.

The published Riker report is the 28Bob row. Its lessons were the clean set of 8,635 plus 424 held out, with 10 million tokens of general text (BOBS-OWN-MODELS.md). "Clean" here means the first cleaning (section 9.11.3), not the full Opus read.

## 9.9 Results: the three Bobs side by side

On 11 November all three kept Bobs were scored on one rented A40 with the same tests, served from their public Q4 files, at a cost of US $0.86 (BOBS-OWN-MODELS.md).

| Q4 | Riker (28Bob) | Bobert (35Bob) | Bill (20Bob) |
|---|---|---|---|
| Experts kept per layer | 208 of 256 | 256, no cut | 144 of 256 |
| File | 17.5 GB | 21 GB | 12.7 GB |
| Quiz: right tool (of 97) | 47 (48%) | 46 (47%) | 42 (43%) |
| Quiz: facts (of 20) | 18 | 20 | 12 |
| Quiz: code runs (of 6) | 6 | 6 | 1 |
| Held-out chats: right tool (of 123) | 63 | 65 | 68 |
| Held-out chats: right arguments (of 123) | 39 | 38 | 41 |
| Held-out chats: correctly no tool (of 191) | 166 | 167 | 172 |
| Held-out chats overall (of 314) | 205 (65%) | 205 (65%) | 213 (68%) |

Riker matches Bobert across the board at a size that fits a 16 GB card far better. Bill is best on Bob's own tool decisions (68 of 123 and 213 of 314) and weakest on facts and code: 12 of 20 facts and 1 of 6 code tasks. This is the narrow-skill pattern of section 9.6. A heal on the same lessons cannot bring back what the cut removed. The route proposed for a better Bill is a gentler cut (about 176 experts) or a heal with fact and code lessons, and that would also need a test (BOBS-OWN-MODELS.md).

Riker against the full model on code, from the same source: coding race 9 of 13 with thinking on against the full model's 12, and 6 of 6 on the quick code test (full model 6). After the first Riker's coding lessons were found faulty (section 9.11.2), clean ones raised the race score from 6 to 9. The coding race is 13 tasks and its noise is about one try (BOBS-OWN-MODELS.md).

**Caveats.** These are held-out chats of 314 turns scored against full Qwen's own choices, so "right" means the same as the teacher. The three models were cut and healed at different times by different keep rules. The 97-question quiz moves 3 to 5 between runs. The differences between Riker and Bobert are inside that noise. Bill's lead on tool decisions (68 against 63 and 65 of 123) is also small, and we do not call it real.

## 9.10 Results: long context

A fact was hidden at a quarter, half and three quarters of the way into windows of 8K, 32K, 64K and 128K tokens (prompts of about 7,100, 27,900, 55,900 and 111,600 tokens). Riker at Q3 found it 12 times out of 12, the same as full Qwen at Q4 (FORGE-JOURNAL.md, BOBS-OWN-MODELS.md). A 128K window fits a 16 GB card with part of the model in RAM.

This is expected. Long context lives mostly in the attention layers, which an expert cut does not touch. BOBS-OWN-MODELS.md says the same, and notes that the count ladder did not measure context length.

RULER (Hsieh et al., 2024) shows that a model can pass a simple needle test and still degrade on harder long-context tasks. Our test is the simple kind, 12 trials with one fact. We read it as "an expert cut did not break retrieval of a single fact" and not as "context is unharmed". Bill's long-context behaviour was not measured.

## 9.11 Why lessons must be clean before a cut

### 9.11.1 The argument

A heal copies the teacher's odds, faults included. If the teacher holds a wrong fact, a slanted answer or a lazy habit, the student is pulled toward it with 70% of the heal's weight. The project's own rule is: fix the full model first, check it with held-out questions, then cut (MAKING-SMALLER-MODELS.md, section 1). If a fact lesson must go into a heal from an unfixed teacher, train on the written words only, without the teacher's odds.

Three reasons put cleaning before cutting.

1. **The student inherits the odds.** Bill was healed against Bobert's odds, so Bobert's habits go down with them. The odds were scored by Bobert for about half of the training pieces in his run (22,000 of 41,727, FORGE-JOURNAL.md), and were reused for Bill. A fault in Bobert cannot be removed from the student without a new teacher pass, which cost about six hours and $30 to skip (MAKING-SMALLER-MODELS.md).
2. **A cut removes slack.** An uncut model survives a trim to half. An already-cut one does not (section 9.7). A faulty lesson that a large model could absorb can break a small one.
3. **A heal cannot repair what the cut dropped.** It trains the experts that remain. If fixing a fault needs experts that were removed, no heal restores them. Bill's facts and code are the example (section 9.9).

### 9.11.2 The measured case: coding lessons

Line B added 717 coding and software-engineering lessons and a full heal of 4.8 hours on an H200, and the coding race did not improve: v2 scored 6 of 13 with thinking on, against 8 for the part-healed v1 and 12 for the full model, and 6 with thinking off, the same as v1 (FORGE-JOURNAL.md). The prose of BOBS-OWN-MODELS.md says 6 for both, which matches only the thinking-off row. Reading the lessons afterwards: 263 (37%) answered by handing the job to Bob's coding tool with a pretend result, so the student learned to delegate code and not write it. Only 197 were direct answers with code in them, and 171 of the requests were under 40 characters (BOBS-OWN-MODELS.md).

The first reading was that the cut had removed the experts coding needs. The count showed otherwise: the cut cost coding about 7% of its routing on average. The cause was the lessons. After a clean coding set was written, with the hand-off tools switched off, Riker went from 6 to 9 of 13 on the coding race (full Qwen: 12; MAKING-SMALLER-MODELS.md, FORGE-JOURNAL.md). That is a case where the fault was in the lessons, the heal copied it and a clean set fixed part of it.

Two cautions. The comparison confounds lesson cleanliness with a new cut: the re-cut Riker was cut at 208 by the coverage rule and healed on the new set, so the change is not a single-variable test. And 6 against 9 on 13 tasks is a small difference, with the project's own note that one try is noise.

### 9.11.3 The size of the problem in the lessons

The first cleaning of Bob's first 16 sets took 9,059 lessons to 8,828: 73 duplicates, 123 with no final answer, 28 unknown tools, 6 loops and 1 empty. That cleaning looked for gross faults. The full read in chapter 6 found far more. Opus read all 5,788 non-held-out tool lessons and kept 189 as they stand, fixed 1,381, repaired 4,208 and discarded 10, and changed 1,922 of Haiku's verdicts (checked numbers, lab-PC TALLY.md). The held-out test items were also affected: 519 of 534 appear word for word in training-side files (chapter 7).

We did not check whether the tool lessons in that read are the same lessons Bobert and Riker were healed on, so we do not claim that Bobert holds 4,208 faulty lessons. We claim that a lesson set judged clean by the first cleaning can still be mostly unfit under a full read, and that every cut so far was healed from lessons that had had only the first cleaning.

### 9.11.4 What is measured and what is not

| Claim | Status |
|---|---|
| A cut keeps narrow skills better than wide ones | Measured: ladder, experts-per-word tests, three-Bob table |
| An uncut model has slack that an already-cut one lacks | Measured once per model: trims |
| A heal closes part of the gap to the teacher | Measured: five heal reports |
| Clean coding lessons raised Riker's coding race from 6 to 9 of 13 | Measured once; confounded with a new cut |
| A heal copies teacher faults into the student | Rests on how the heal is built and on the coding example; no direct test |
| Cleaning before cutting gives a better small model than cutting first | Not tested. The decisive retrain on reviewed lessons has not been run |

So the thesis that clean lessons beat more lessons stands on the lesson-side evidence of chapters 5 to 7 and on the coding case here. The step that would test it through a cut is the same cut, healed once on faulty lessons and once on reviewed ones, with the same teacher. That is the next planned run.

## 9.12 Discussion

**Order of work.** The evidence supports an order, with a caution. Fixing the large model first costs one fix and every cut inherits it. Cutting first multiplies the fix by the number of models. The caution is that "clean" must mean a full read. The first cleaning passed lessons that a full read later sent to repair.

**More lessons.** The project's early reflex, when coding did not improve, was to add 717 more lessons. Their content was the problem. More lessons from the same faulty source add more faults. The heal weights lesson text by its answer tokens, so a lesson set that repeats a habit trains that habit more.

**Fold and REAP.** Two levers are built and unused in the shipped models. REAP ranks experts better than pick counts in the paper's results. We used it in trims but not in a heal. Fold blends dropped experts into kept ones; whether it beats dropping is unknown until a rung is made both ways. The paper by Lasby et al. suggests dropping may win, so fold is a comparison, not an expected gain.

**Link to later chapters.** Chapter 10 asks whether an unwanted habit sits in a part that causes it or in a part that holds it back. A result there is that 16 experts once marked "cruel-leaning" act together as a brake. A cut that removes experts could remove a brake without anyone noticing. That is a further reason for cutting by coverage and not by "cruel-leaning" or any other label.

## 9.13 Threats to validity and limits

- **One run per condition.** Each trim is one run per model. Each heal is one run per rung.
- **The REAP table is a trim with no heal,** not a heal result.
- **The cuts are not a controlled comparison.** Riker and Bill were cut and healed by different keep rules at different times. Riker's list used 95% for all skills by mistake. Line A and line B differ in lessons and in how far the heal ran.
- **Cross-entropy on held-out lessons measures closeness to the teacher,** not truth. A copied fault scores well. Reports differ in held-out token counts between rounds, so raw `ce` should not be compared across rounds.
- **Held-out leaks.** Chapter 7 reports that 519 of 534 held-out tool items appear in training-side files. The sorting of those items used Haiku with a 5% Opus spot-check, and MouseWurX chose on 15 November to keep them as they are while the full Opus re-sort of the lessons runs. The held-out sets used here (the 314 held-out chat turns and the held-out lessons in the heal reports) are separate sets from the 534 tool items, and we did not check them for leaks. Scores from them may be too high.
- **The claim "faults are copied" is not directly tested.** It rests on how the heal is built and on the coding example.
- **Naming.** The ladder file's longtext column and the docs' general knowledge column are matched by value.
- **Long context** was a 12-trial simple needle test on one model.
- **Teacher quality caveat.** The teacher in several rounds was Bobert, who was himself trained on lessons that have since been found to hold many faults.
- **Cost.** Each rental step is itemised on the project's costs page (COSTS.md). The three-model test cost US $0.86. Bobert's rental was US $108.75 and Bill's US $96.27 (BOBS-OWN-MODELS.md).

## 9.14 Summary and still to do

A cut keeps what a model needs for narrow work and loses breadth: at 208 experts a typical skill keeps 97 to 98% of its routing and general knowledge 90%; at 144, 87 to 90% and 66%. An uncut model loses almost nothing down to half its experts, an already-cut one collapses. A heal closes about half the gap to the teacher for Riker and leaves a large gap for the half-cut Bills. Long-context retrieval of one fact survived the cut. The evidence on lessons is that a heal copies what the teacher knows, and the coding example shows a lesson fault surviving a full heal and a clean set improving it. The direct test is not run.

Still to do:

1. Run the direct test: same cut, same teacher, faulty and reviewed lessons.
2. Make one rung both ways, dropped and folded, and compare.
3. Test long context harder than a single needle, and on Bill.
4. Check whether the held-out sets used for heals and trims share the leak.
5. Re-run the three-model comparison after the decisive retrain, and after the full Opus re-sort.

## References

- Fedus, W., Zoph, B., Shazeer, N. (2021). Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity. arXiv:2101.03961. https://arxiv.org/abs/2101.03961
- Hinton, G., Vinyals, O., Dean, J. (2015). Distilling the Knowledge in a Neural Network. arXiv:1503.02531. https://arxiv.org/abs/1503.02531
- Hsieh, C.-P., Sun, S., Kriman, S., et al. (2024). RULER: What's the Real Context Size of Your Long-Context Language Models? arXiv:2404.06654. https://arxiv.org/abs/2404.06654
- Hu, E. J., Shen, Y., Wallis, P., et al. (2021). LoRA: Low-Rank Adaptation of Large Language Models. arXiv:2106.09685. https://arxiv.org/abs/2106.09685
- Jiang, A. Q., Sablayrolles, A., Roux, A., et al. (2024). Mixtral of Experts. arXiv:2401.04088. https://arxiv.org/abs/2401.04088
- Lasby, M., Lazarevich, I., Sinnadurai, N., Lie, S., Ioannou, Y., Thangarasa, V. (2025). REAP the Experts: Why Pruning Prevails for One-Shot MoE Compression. arXiv:2510.13999. https://arxiv.org/abs/2510.13999
- Lu, X., Liu, Q., Xu, Y., et al. (2024). Not All Experts are Equal: Efficient Expert Pruning and Skipping for Mixture-of-Experts Large Language Models. arXiv:2402.14800. https://arxiv.org/abs/2402.14800
- Muralidharan, S., Sreenivas, S. T., Joshi, R., et al. (2024). Compact Language Models via Pruning and Knowledge Distillation. arXiv:2407.14679. https://arxiv.org/abs/2407.14679
- Shazeer, N., Mirhoseini, A., Maziarz, K., et al. (2017). Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer. arXiv:1701.06538. https://arxiv.org/abs/1701.06538
- Sreenivas, S. T., Muralidharan, S., Joshi, R., et al. (2024). LLM Pruning and Distillation in Practice: The Minitron Approach. arXiv:2408.11796. https://arxiv.org/abs/2408.11796
- Xue, F., Zheng, Z., Fu, Y., et al. (2024). OpenMoE: An Early Effort on Open Mixture-of-Experts Language Models. arXiv:2402.01739. https://arxiv.org/abs/2402.01739
