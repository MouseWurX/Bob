# Chapter 5. Study 1: the hand-off habit

## 5.1 Introduction and research question

Bob is an agent app. When a user asks for code, Bob can write it himself, or he can pass the job to a coding specialist through a tool and report back. Both are legitimate in the app. The question in this chapter is what happens when the lessons overuse the second route.

The first coding lessons for Riker did exactly that. Looking at the 717 coding lessons after the fact, 263 of them (37%) answered by handing the job to Bob's coding tool with a pretend result (BOBS-OWN-MODELS.md, "What went wrong with the first cut"). A full pass of healing on those lessons left coding where it was. This chapter tells that story and tests it.

The chapter addresses research question 2 from the outline: do faults in a lesson set show up as habits in the trained model, and how far does cleaning fix them? It also gives the first concrete answer to question 1, because the 37% figure was the first fault we found by reading lessons rather than counting them.

The chapter makes three claims, and states how strong each one is:

1. The hand-off fault was real and large. This rests on a count of the lesson file, so it is the strongest of the three.
2. A full heal on the faulty lessons did not improve coding, and a heal on rewritten lessons did. This rests on single runs of small tests and is weaker.
3. The cut itself was not the cause. This rests on a measurement of what the keep lists covered, plus a confound that the later model also had more experts, which we discuss openly in section 5.7.

All numbers come from the project's checked-numbers file and the repo documents named inline. Nothing in this chapter was re-run for the write-up.

## 5.2 Related work

**Lessons as the lever.** Several papers argue that the content of training data matters more than its volume. LIMA fine-tuned a large base model on a small, carefully chosen set and argued that most of a model's knowledge comes from pretraining, so a little high-quality alignment data can be enough (Zhou et al., 2023). "Textbooks are all you need" trained a small code model on a curated and synthetic textbook-style corpus and reported strong coding results for its size (Gunasekar et al., 2023). AlpaGasus used a strong model to filter an instruction set and found that the filtered, much smaller set trained a better model than the full one (Chen et al., 2023). These works treat quality as a property to be filtered for. They say little about one specific, systematic fault that an author model introduces across a whole skill, which is our case.

**Synthetic lessons inherit their author's habits.** Self-Instruct showed that a model can write its own instruction data, and that the result is usable after filtering (Wang et al., 2023). That makes the author model's habits part of the data. Gudibande et al. (2023) studied imitation of a stronger model and found that the student picks up the teacher's style quickly but not its factual ability. Both points matter here. Bob's lessons were written by a large model that was itself prompted with Bob's tool list, and the hand-off tool was one of the most visible tools on that list. A student that imitates style will imitate the style of reaching for that tool.

**Tool-use data.** Toolformer, Gorilla and ToolLLM all build or evaluate tool-calling data at scale (Schick et al., 2023; Patil et al., 2023; Qin et al., 2023). They focus on whether the call is well formed and whether the right API is chosen. A call can be correct in form and still be the wrong thing to do: a coding request that is routed to a tool when the user wanted the code written is an example. This chapter is about that second kind of fault.

**Cutting and healing.** Bob's models are cut from Qwen3.6-35B-A3B by removing experts, then retrained so the cut model matches the full model's next-word odds. The ideas build on expert pruning such as REAP, which scores each expert by its router weight and the size of its output (Lasby et al., 2025), on pruning followed by distillation (Muralidharan et al., 2024), and on knowledge distillation itself (Hinton et al., 2015). The healing uses LoRA adapters (Hu et al., 2021). The base family is described in the Qwen3 technical report (Yang et al., 2025). Chapter 9 covers the cut in detail. Here it matters only as a possible alternative explanation for weak coding.

## 5.3 The instruments used

Four tests are used in this chapter. All of them run on the project's own PC, at Q4, with 8 experts per word and the same settings for every model (BOBS-OWN-MODELS.md).

| Test | What it is | Size |
|---|---|---|
| Coding race | A fixed set of coding tasks, run with thinking on and with thinking off | 13 tasks |
| Quick code test | Short coding tasks from the experts-per-word test, scored by whether the code runs | 6 tasks |
| Tool score | Held-out conversations replayed turn by turn; counts how often the model makes the same tool decision as the full model | 314 turns from 196 held-out conversations (FORGE-JOURNAL.md) |
| Facts | Short fact questions from the same quiz as the quick code test | 20 questions |

Two further numbers are used. "Lessons ce" is the model's cross-entropy on held-out lessons, which measures how close the cut model is to the teacher's words. Lower is better. It is a loss, not an error rate. "Tool phrasing test" is the 97-request quiz where Bob must pick the right tool; it is noisy, moving 3 to 5 between runs of the same model (MAKING-SMALLER-MODELS.md), so it is reported but not used for decisions.

A limit applies to every test here. Each cell is one run. The coding race has 13 tasks, so one task is about 8 percentage points. The repo's own note on Riker v1 and v2 says that 6 of 13 against 8 of 13 is "within one-try noise" (BOBS-OWN-MODELS.md). We apply the same standard to the later results.

## 5.4 Method

### 5.4.1 The three Riker builds

All three builds start from the same full model, Qwen3.6-35B-A3B, and are healed against its next-word odds. They differ in the cut and in the lessons.

| Build | Experts kept | Lessons | Training | Source |
|---|---|---|---|---|
| Riker v1 (24Bob, line A) | 176 of 256, the busiest overall | Bob's own lessons, 3,616 kept | 195 of 456 planned steps in 1.75 h, stopped by the clock | FORGE-JOURNAL.md |
| Riker v2 (24Bob, line B) | 176 of 256, the same keep list | Bob's lessons plus 717 coding and software-engineering lessons | full pass, 524 of 524 steps, 4.8 h, 35.5M tokens seen | FORGE-JOURNAL.md |
| Riker (28Bob, clean lessons) | 208 of 256, built per skill from counts | rewritten coding lessons and new skill sets (section 5.4.3) | full pass, 929 of 929 steps, 5.9 h, 63.4M tokens | FORGE-JOURNAL.md |

Two points about this table deserve care. First, v1 was stopped by the clock partway through. The owner's later rule, "no clock-capped heals, full passes", came from this run. So v1 is a partly healed model, and the comparison of v1 with v2 mixes the effect of more lessons with the effect of finishing the pass. Second, the last row differs from v2 in the cut as well as the lessons. We return to this in sections 5.6 and 5.7.

The v2 heal cost US $72.67 on an H200 card and the re-cut Riker cost $51.79 on the statement (BOBS-OWN-MODELS.md). Those figures are small enough that a second, cleaner experiment would have been affordable. We did not run one.

### 5.4.2 Reading the coding lessons

After v2 failed to improve coding, the 717 coding lessons were read. The process was a count and a read of the file by the project, not a trained classifier. It found the following (BOBS-OWN-MODELS.md):

| Property of the 717 lessons | Count |
|---|---|
| Answer hands the job to Bob's coding tool with a pretend result | 263 (37%) |
| Direct answer with code in it | 197 |
| Everything else, by subtraction | 257 |
| Requests shorter than 40 characters | 171 |

The spread of languages was reported as fine: C++ and Unreal 130, Python 112, Rust 80, JavaScript and TypeScript 70, Kotlin 66, plus Blender, SQL, shell, HTML and Git. Coding was about one lesson in six of the whole v2 heal.

The "257 everything else" row is our subtraction, not a number the file states, and we do not know what those lessons contained.

Two things follow from the audit. The faulty lessons outnumbered the good ones, 263 against 197. And the good ones were a small share of the training mix. Even without the fault, 197 direct answers inside a mix where coding was one lesson in six is a thin diet.

### 5.4.3 The replacement lessons

The replacement set was written by the full model on a rented card, with the hand-off tools switched off, so a lesson could not answer by delegating. The files report (BOBS-OWN-MODELS.md, FORGE-JOURNAL.md):

- 2,329 clean coding lessons, with requests of two to four sentences;
- 282 run-and-fix lessons;
- 2,616 lessons across 13 other skill sets that had none of their own, such as exact formats, game master turns, polite refusals, other languages, reasoning with thinking on, and the skills Bob needs to work on his own (recover from errors, ask when unclear, take notes, pick up a new tool, check his own work, read his own help, research and understand).

The journal gives a second tally for the same run: 2,898 lessons across 14 skill sets written on the card. We could not reconcile the two tallies from the files, so we quote both and use neither as a sum. The journal also records that the 2,329 coding lessons were "kept after cleaning (hand-off answers removed)" from a first attempt that failed because a skill weight of zero made the writer produce nothing for the new jobs.

So the change between v2 and the clean Riker is not only "hand-offs removed". It is also a larger coding set (2,329 against 717), more skill coverage, longer requests, and a training pass that saw about 1.8 times as many tokens (63.4M against 35.5M, our division). That is a bundle of changes, and the study cannot separate them.

## 5.5 Results

### 5.5.1 The benchmark table

The home-PC results for the full model and the three Rikers (FORGE-JOURNAL.md, BOBS-OWN-MODELS.md):

| Test | Full Qwen3.6 35B | Riker v1 | Riker v2 | Riker (clean lessons) |
|---|---|---|---|---|
| Coding race, 13 tasks, thinking on | 12 | 8 | 6 | 9 |
| Coding race, thinking off | 11 | 6 | 6 | 7 |
| Quick code test, 6 tasks | 6 | 4 | 3 | 6 |
| Facts, 20 questions | 20 | 20 | 20 | 18 |
| Tool score, held-out conversations | 67% | 66% | 66% | 65% |
| Tool phrasing test, 97 requests | 46% | 55% | 49% | 47% |
| Speed, tokens per second | 83 | 145 | 144 | 111 |

Reading the table row by row:

- **Coding race, thinking on.** The headline figure is 6 for v2 and 9 for the clean Riker, a gain of three tasks. Against v1 the gain is one task (8 to 9), which is inside the noise the repo itself describes. The full model scores 12, so the clean Riker closes half of the gap that v2 left, and a gap of three remains.
- **Coding race, thinking off.** The three Rikers score 6, 6 and 7. The change is one task.
- **Quick code test.** This is the clearest signal. v2 ran 3 of 6, v1 ran 4 of 6 and the clean Riker ran 6 of 6, level with the full model. The test is only six tasks, but the direction agrees with the race.
- **Facts.** The clean Riker lost two answers (18 against 20). The journal flags the two lost short-fact answers as something to watch on the smaller Bill.
- **Tool score.** The three Rikers are within 1 point of each other and of the full model, which scores 67%. Tool decisions survived every build. The lessons that changed coding did not hurt tool use.
- **Speed.** The clean Riker is slower than v1 and v2 because his larger file spills further off the 16 GB card (FORGE-JOURNAL.md). This is a cost of the bigger cut and is unrelated to the lessons.

### 5.5.2 Training losses

Held-out lesson cross-entropy before and after healing (FORGE-JOURNAL.md):

| Build | Before | After | Teacher |
|---|---|---|---|
| Riker v1 | 0.383 | 0.355 | 0.325 |
| Riker v2 | 0.389 | 0.356 | 0.324 (BOBS-OWN-MODELS.md) |
| Riker (clean lessons) | 0.401 | 0.362 | 0.324 |

All three healed to within about 0.03 to 0.04 of the teacher. These numbers do not tell the builds apart. They are also not comparable across rows: each build had its own lesson set and so its own held-out lessons. What they show is that the v2 heal worked as a heal. It matched the teacher about as well as the others. It simply matched lessons in which about one coding lesson in three showed a hand-off in place of code. A faulty lesson set would produce exactly this: low loss and no gain.

This is the first sign of a point we develop in chapter 9. Cross-entropy against a teacher measures how closely the student copies the lessons, and a copied fault scores well.

### 5.5.3 Long context was untouched

On the needle test, with one fact hidden at 25, 50 and 75% depth in windows of 8K, 32K, 64K and 128K tokens, the clean Riker, run at Q3 for this test, found it 12 of 12 times, the same as the full model at Q4 (FORGE-JOURNAL.md). This was expected, because long context lives in the attention layers, which an expert cut does not touch. It is included to show that the clean lessons did not buy coding by damaging something else that the benchmarks cover.

## 5.6 Was it the cut?

An obvious alternative is that Riker could not code because the cut removed the experts coding needs. The first Riker's keep list was the 176 busiest experts overall, counted over all of Bob's lessons in one pile. That rule protects no skill in particular, and we suspected it at first.

Two measurements bear on this.

**Coverage of the old keep list.** The expert counts, made on the PC for free, showed that the 176-expert keep list kept 92.0% of coding's routing, with the worst layers (0 to 2) at about 82%. It kept 93.2% of all of Bob's lessons and 89.6% of maths, knowledge and plans (BOBS-OWN-MODELS.md).

**The per-skill ladder.** A fuller measurement counted 24 skills separately on the full model. At 176 experts per layer, the per-skill rule gives coding 93% on average and 84% in the worst layer (ladder table, BOBS-OWN-MODELS.md; ladder.md). The old busiest-overall list kept 92.0% and about 82%. That is within about a point on the average, and within about two points on the worst layer.

The journal states the conclusion: "the v1 keep lists were within a point of the new rule at the same size, so the v2 coding gap was the lessons, not the cut" (FORGE-JOURNAL.md). In other words, at 176 experts the corrected rule would not have protected coding much better, so changing the rule could not have been what fixed it.

A second argument supports this. v2 had the same keep list as v1 and far more coding lessons, and coding did not move. If the cut had been the limit, more coding lessons would still have failed. If the lessons had been good, more of them would have helped. The result is consistent with the lessons being the limit, but it does not prove it, because v1 and v2 also differ in how far the heal ran (section 5.4.1).

The cut cost coding about 7% of its routing on average, as the project's own note put it. That is a small share compared with the failure of v2 to move at all.

## 5.7 Discussion

### 5.7.1 What the evidence supports

The evidence supports three statements. A large share of one skill's lessons taught a habit that the app wants only sometimes. A full heal on those lessons did not lift that skill. A heal on rewritten lessons for that skill, with the hand-off route closed, produced a Riker that was level with the full model on the quick code test and three tasks better than v2 on the race.

It also supports a narrower point about method. Counting would not have found this fault. The hand-off lessons were well formed, ended in an answer and called a real tool. Chapter 6 shows how many faults of this type a full read finds.

### 5.7.2 What it does not show

The result is weaker than the table makes it look, for four reasons.

1. **The cut changed too.** The clean Riker has 208 experts and v2 had 176. At 208, coding keeps 97% of its routing on average and 92% in the worst layer; at 176 it keeps 93% and 84% (ladder table). So the clean Riker had better coverage for coding, and some of his gain could be the bigger cut. The earlier argument says the old keep list was not badly cut. It does not say that 32 more experts per layer gain nothing.
2. **The lessons changed in more than one way.** The replacement set is larger, has longer requests, covers more skills and trained for more tokens. We cannot say which change mattered. A clean test would heal the old 717 lessons with the hand-offs removed, at 176 experts, and compare. That was not run.
3. **The habit itself was not measured in the model.** We counted hand-offs in the lessons. The files do not report how often v2 handed code off in its own answers. So the claim that the lesson fault "became a habit" is an inference from the failure to improve, not an observation of the habit. Chapter 10 shows one way to locate a habit inside a model, but that was not applied here.
4. **Small tests.** Each cell is one run of a small test. The race has 13 tasks and the quick test 6.

### 5.7.3 Why a small thing can stay hidden

The lessons were not bad in the ways a script checks. The hand-off lessons are valid tool calls with plausible results. The pretend result is the fault, and spotting it means reading the lesson and knowing that the specialist tool would not have returned that result, or that the user wanted the code in the chat. This fits a theme from the related work: filtering with a strong model finds faults that rules do not (Chen et al., 2023). It also fits the imitation result that a student copies the style first (Gudibande et al., 2023). A model trained on delegation-style answers learns to delegate.

### 5.7.4 What it changed in the project

The finding pushed the project to read lessons rather than only count them (chapter 6), and the later lesson pipeline reviews every lesson before use (chapter 11). The files do not say that this episode alone caused those rules, so we state only that it was the first case that motivated them.

## 5.8 Threats to validity and limits

- **Single runs.** Every number is one run. The project has no repeat of the coding race with a second seed in the files used here.
- **Confounded comparison.** Cut size, lesson count, lesson content and training length all differ between v2 and the clean Riker (section 5.7.2).
- **Same family only.** The test is on Qwen3.6-35B-A3B models. We do not know whether the same fault in the lessons would hurt a dense model in the same way.
- **Author-model effect.** The hand-off lessons were written by the full model from Bob's tool list. Another author or another list might make fewer. We did not test this.
- **Reader effect.** The audit of the 717 lessons was a count by the project, with no second reader. The 37% figure has not been checked by anyone else.
- **Benchmark coverage.** The coding race and the quick test are small and were designed by the project. Neither is a public benchmark.
- **Leaks in the tests.** The held-out items behind the tool score and the held-out cross-entropy are subject to the leaks described in chapter 7. If a model saw a copy of a test item, the tool score is inflated. The coding race and the quick code test use a fixed set of tasks, and we did not check them for leaks. The size of any inflation is not measured.
- **Status.** The decisive retrain on reviewed lessons has not been run. The 37% result concerns the first coding lessons only, and the new lessons have been tested only through the clean Riker's benchmark.

## 5.9 Summary

Thirty-seven percent of the first coding lessons taught Riker to hand code off instead of writing it. A full heal on them left coding at 6 of 13 on the race and 3 of 6 on the quick test. A heal on rewritten lessons with the hand-off route closed took the same family to 9 of 13 and 6 of 6. Tool use and long context were not hurt, facts lost two answers, and speed fell because the larger file spills further off the card.

The old keep list was within about a point of the corrected rule at the same size, so the cut is an unlikely cause of the v2 failure. But the clean Riker also has more experts and a larger, different lesson set, so the evidence for "lessons caused it" is strong in direction and weak in size. The chapter that follows asks how many faults of this kind a full read of the tool lessons finds.

## References

Chen, L., Li, S., Yan, J., Wang, H., Gunaratna, K., Yadav, V., Tang, Z., Srinivasan, V., Zhou, T., Huang, H., Jin, H. (2023). AlpaGasus: Training A Better Alpaca with Fewer Data. arXiv:2307.08701. https://arxiv.org/abs/2307.08701

Gudibande, A., Wallace, E., Snell, C., Geng, X., Liu, H., Abbeel, P., Levine, S., Song, D. (2023). The False Promise of Imitating Proprietary LLMs. arXiv:2305.15717. https://arxiv.org/abs/2305.15717

Gunasekar, S., Zhang, Y., Aneja, J., et al. (2023). Textbooks Are All You Need. arXiv:2306.11644. https://arxiv.org/abs/2306.11644

Hinton, G., Vinyals, O., Dean, J. (2015). Distilling the Knowledge in a Neural Network. arXiv:1503.02531 (NIPS 2014 Deep Learning Workshop). https://arxiv.org/abs/1503.02531

Hu, E. J., Shen, Y., Wallis, P., Allen-Zhu, Z., Li, Y., Wang, S., Wang, L., Chen, W. (2021). LoRA: Low-Rank Adaptation of Large Language Models. arXiv:2106.09685. https://arxiv.org/abs/2106.09685

Lasby, M., Lazarevich, I., Sinnadurai, N., Lie, S., Ioannou, Y., Thangarasa, V. (2025). REAP the Experts: Why Pruning Prevails for One-Shot MoE compression. arXiv:2510.13999. https://arxiv.org/abs/2510.13999

Muralidharan, S., Sreenivas, S. T., Joshi, R., Chochowski, M., Patwary, M., Shoeybi, M., Catanzaro, B., Kautz, J., Molchanov, P. (2024). Compact Language Models via Pruning and Knowledge Distillation. arXiv:2407.14679. https://arxiv.org/abs/2407.14679

Patil, S. G., Zhang, T., Wang, X., Gonzalez, J. E. (2023). Gorilla: Large Language Model Connected with Massive APIs. arXiv:2305.15334. https://arxiv.org/abs/2305.15334

Qin, Y., Liang, S., Ye, Y., et al. (2023). ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs. arXiv:2307.16789. https://arxiv.org/abs/2307.16789

Schick, T., Dwivedi-Yu, J., Dessì, R., Raileanu, R., Lomeli, M., Zettlemoyer, L., Cancedda, N., Scialom, T. (2023). Toolformer: Language Models Can Teach Themselves to Use Tools. arXiv:2302.04761. https://arxiv.org/abs/2302.04761

Wang, Y., Kordi, Y., Mishra, S., Liu, A., Smith, N. A., Khashabi, D., Hajishirzi, H. (2023). Self-Instruct: Aligning Language Models with Self-Generated Instructions. arXiv:2212.10560. https://arxiv.org/abs/2212.10560

Yang, A., Li, A., Yang, B., et al. (2025). Qwen3 Technical Report. arXiv:2505.09388. https://arxiv.org/abs/2505.09388

Zhou, C., Liu, P., Xu, P., Iyer, S., Sun, J., Mao, Y., Ma, X., Efrat, A., Yu, P., Yu, L., Zhang, S., Ghosh, G., Lewis, M., Zettlemoyer, L., Levy, O. (2023). LIMA: Less Is More for Alignment. arXiv:2305.11206. https://arxiv.org/abs/2305.11206
