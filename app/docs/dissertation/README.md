# Clean lessons beat more lessons

**How hidden faults in synthetic training data shape small local agent models**

*Working draft, 15 November 2026. Bob's computer science dissertation, written in the open.*

> **This is a draft.** Chapters 2, 3, 4, 8, 9, 11, 12 and 13 are outlined but not written up here yet, and the main result (chapter 11) has **not been run**. Every number below was checked against its run file on 15 November 2026. Outside papers are named from memory and their citations still need to be confirmed.
>
> This folder is for reading only. It is research writing, not lessons: no lesson set, Forge job or training script reads it.

- [The claim](#the-claim)
- [Research questions](#research-questions)
- [Chapters](#chapters)
- [Keeping it clean](#keeping-it-clean)
- [Write-up so far](#write-up-so-far): abstract, chapters 1, 5, 6, 7 and 10
- [Next steps](#next-steps)

## The claim

For a small agent model, what is in the lessons matters more than how many there are. Faults hidden in synthetic lessons (hand-offs, fake tool results, leaked test items) become the model's habits and inflate its scores, and a full read of every lesson finds far more faults than scripts or a cheaper reviewer do. The dissertation builds the tools to show this, measures it on real models, and ends with a course that teaches it.

## Research questions

1. How many faults does a synthetic agent lesson set really hold, and which kinds?
2. Do those faults show up as habits in the trained model, and how far does cleaning fix them?
3. How much do leaked test items distort the scores we used to make decisions?
4. Does tool shape or lesson content matter more for tool use?
5. Where does an unwanted habit sit inside the model: in a part that causes it, or in a part that holds it back?

## Chapters

| Chapter | What it shows | Evidence in hand | Still missing |
|---|---|---|---|
| 1. Introduction | The question, why small local agents, the five research questions. | Project goal, hardware, [costs page](../COSTS.md). | Final wording. |
| 2. Background | Synthetic data and distillation, test contamination, mixture-of-experts and pruning (REAP), tool calling, interpretability (steering, patching, autoencoders). | Credits in the docs. | Literature review with citations. |
| 3. Building the instruments | The tools we had to build to change and measure models: [Brain Engine](../../engine/README.md) (14 llama.cpp patches), the Forge pipeline, the Lab scripts and console. | Byte-identical expert switch; live steering matches loaded steering; 46-check training dry run; 270 test suites on fakes. | Architecture diagram; per-patch overhead; list of bugs the tools caught. |
| 4. Method and rules | Held-out splits, the never-taught gate, smoke gates before paid steps, full passes only, measured-only reporting, every dollar and failure counted. | 11 failed paid attempts logged; [costs page](../COSTS.md); quiz noise 3 to 5 per 97. | Frozen pipeline description. |
| 5. Study 1: hand-offs | A fault in the lessons became a habit, and cleaning fixed it. | 37% of coding lessons handed code off; clean lessons took Riker from 6 to 9 of 13 (full Qwen 12). | Repeat runs for error bars. |
| 6. Study 2: what a full read finds | Scripts and a cheaper reviewer miss most faults; a full read keeps very few lessons. | 5,788 tool lessons read: keep 189, fix 1,381, repair 4,208, discard 10; the second reader changed 1,922 of the first reader's verdicts. First script clean: 9,059 to 8,828. | A second reader's agreement rate on a sample. |
| 7. Study 3: leaks in the test | Test items copied into training make scores look better than they are. | 519 of 534 held-out items found word for word in training files; test items themselves: 148 keep, 381 fix, 5 discard. | Re-score past models on leak-free items to measure the inflation. |
| 8. Study 4: shape or content | Rewording tools does little; showing the exact call works; thinking hurts tool steps. | GPT-OSS 120B: Bob's wording 63.3%, others within about 1 point; thinking on 54.2%. Coaching: Bobert 88% / 86%, Riker 78 / 76 of 83; first try 120B 45/83, 38B 32/81. Shape v2 built (PR #251). | Re-test on shape v2. |
| 9. Study 5: lessons through a cut | A cut keeps a skill's routing, a heal copies the teacher (faults included), and an already-cut model has no slack. | Count ladder (skills 97 to 98% at 208, general knowledge 90%); REAP trims (Bobert 198 at half, Riker 163); heal loss; Bill 12/20 facts. | Same on the 38B GPT-OSS heal. |
| 10. The evil neuron we expected, and what we found | An unwanted habit is held back by a brake, and runs as a direction across layers, not one part. | Brake: 3.67 to 6.67 with 16 experts turned down (30 asks). Patching: x3 difference at layer 26 lifts plain answers 0 to 3.5; removing it at layer 19 drops cruel answers 3 to 0.17; no single feature drives it. | More asks per test (6 is noisy); same check on a model trained on clean lessons. |
| 11. How we now make clean lessons, then the decisive test | Fresh stock model, locked tool shape per family, real tool results in a sandbox per lesson, open teacher rewrites, every lesson and test item read, pre-flight and never-taught gates (PRs #254, #263, #257). Then: train on reviewed lessons vs old lessons vs stock, scored on a leak-free test. | Never-taught gate (PR #257); reviewed set in progress. | **Not run.** This is the main result. |
| 12. Teaching it | A course from first concepts to engineering, built on the real data above. | The Lab's Learn tab and its Lessons course. | Learner study (quiz before and after). |
| 13. Conclusion | What held, what didn't, what it cost. | | Written last. |

## Keeping it clean

The dissertation uses only measured results from real runs, and says what ran, what was skipped and why. Samples, mock-ups and design pictures are never evidence.

- **The leak comes first.** Before any held-out score is cited, its test set is checked against the 519 leaked items. Scores from a leaked set get labelled or re-run.
- **Small tests are noisy.** The 97-question quiz moves 3 to 5 between runs. Decisions rest on the 314-turn held-out chats, and the dissertation needs repeat runs for error bars.
- **One family so far.** Almost every result is on Qwen3.6-35B-A3B. GPT-OSS is the second family and is only partly in.
- **Failures stay in.** The 11 failed paid attempts, the lost healed weights and what got worse after each cut are part of the result.
- **Privacy.** No owner names, devices or private folders anywhere.

---

## Write-up so far

### Abstract (draft)

Small open models can run a useful agent on one consumer graphics card, but how well they work depends on what they were taught. We built an engine, a training pipeline and a test bench to cut, heal, steer and measure a 35-billion-parameter mixture-of-experts model, and used them to study its lessons. A full read of 5,788 synthetic tool lessons kept only 189 as written. One fault, coding lessons that handed the work to a tool (37%), held coding back until clean lessons lifted it from 6 to 9 of 13 tasks. 519 of 534 held-out test items had leaked into training files. Rewording tools barely moved results (within about 1 point), while lessons that show the exact call did. Looking inside, the habit we expected to find in a single "evil neuron" turned out to be a direction spread across many layers, held back by a group of experts that act as a brake. The decisive test, training on reviewed lessons against a leak-free test, has not been run yet.

### Chapter 1. Introduction (draft)

A personal assistant that runs on one's own computer has to call tools reliably, write code, look things up when unsure and hold a long conversation, all on a consumer graphics card. Open mixture-of-experts models such as Qwen3.6-35B-A3B make that possible: only about 3 billion of their 35 billion parameters work on each word, so they run at useful speed on a 16 GB card. Making them smaller and better at one app means teaching them, and teaching means lessons.

Most lessons for agent models are synthetic: a large model writes them, and scripts filter them. This thesis asks what those lessons really contain, and what that does to the model. It answers with measurements from one project: an agent app, Bob, and the models made for it, cut and healed from Qwen3.6 on rented cards at a recorded cost.

The five research questions are listed above. The main contributions are:

1. The tools to change and measure a model live: a forked inference engine, a rental pipeline and a test bench (chapter 3).
2. Measured evidence that lesson faults become habits and inflate scores (chapters 5 to 7).
3. Evidence that lesson content matters more than tool wording (chapter 8).
4. A finding that an unwanted habit is a spread-out direction held back by a brake, not a single part (chapter 10).
5. A course that teaches all of this from first concepts, using the real data (chapter 12).

### Chapter 5. Study 1: the hand-off habit (draft)

The first coding lessons taught the model not to code. 37% of them answered a coding request by handing the job to a specialist tool and reporting a pretend result. A full training pass on those lessons left coding where it was. The lessons were then read, the hand-offs removed, and new coding lessons written.

| Model | Coding race, 13 tasks, thinking on | Quick code test, 6 |
| --- | --- | --- |
| Full Qwen3.6 35B | 12 | 6 |
| Riker v2 (old lessons) | 6 | 3 |
| Riker (clean lessons) | 9 | 6 |

Same base model and cut size, so the lessons were the change. The cut itself was ruled out: the keep lists used for v2 were within a point of the corrected rule at the same size. **Limit:** each number is one run, and small coding tests are noisy.

### Chapter 6. Study 2: what a full read finds (draft)

Scripts catch the obvious faults. The first cleaning pass of Bob's 16 lesson sets removed 231 of 9,059 lessons: 73 duplicates, 123 with no final answer, 28 calling tools that don't exist, 6 loops and 1 empty.

A reader catches far more. For the 6,322 tool lessons, a cheaper model (Claude Haiku) sorted every lesson first, then a stronger one (Claude Opus) read all 5,788 that were not held out.

| Verdict | Lessons |
| --- | --- |
| Keep as written | 189 |
| Fix (small change) | 1,381 |
| Repair (rewrite) | 4,208 |
| Discard | 10 |

Opus changed 1,922 of Haiku's verdicts, most often from fix to repair (1,319) and from keep to repair or fix (533). The faults the cheaper reader missed most were: tool calls with wrong arguments that still "succeeded"; tool results no real tool returns; repeating a specialist's answer; needless calls; private folder paths and teacher-note leaks; and wrong facts about code and APIs.

So only about 3% of the synthetic tool lessons were fit to teach as written. **Limits:** one reader model per pass, with no human check of a sample yet, and the rewrite's effect on the model has not been measured.

### Chapter 7. Study 3: leaks in the test (draft)

A held-out test is only fair if the model never saw it. The project held out 5% of lessons by an id hash. A check of 534 held-out tool items against every training-side file found 519 copied word for word, plus 7 more sharing their first 60 characters. They came in through other lesson sets and conversion steps, not the hash split itself.

The test items were also read like lessons: 148 keep, 381 fix and 5 discard. Bad tests give false scores just as bad lessons give bad habits.

A never-taught gate now stops any training plan before a card is rented if a test item appears in its lessons (PR #257). **Still to measure:** how much past scores were inflated. That needs past models re-scored on leak-free items.

### Chapter 10. The evil neuron we expected, and what we found

*(Study 6 in the outline.)*

#### 10.1 What we expected, and why

We went in expecting to find a small part of the model that makes it cruel, an "evil neuron", that could be turned off. That expectation came from reading about interpretability work on large language models:

- Work on refusal suggested a single direction in the model's activations controls whether it refuses (Arditi et al., 2024).
- Work on persona vectors and on "emergent misalignment" suggested a model can carry a separate "bad persona" that a small amount of training switches on (Anthropic, 2025; Betley et al., 2025).
- Sparse autoencoder studies reported single readable features for traits, including a "misaligned persona" feature (OpenAI, 2025).
- In a mixture-of-experts model, each word is routed to a few experts out of many, so it seemed natural that one expert, or a few, might carry a habit.

*Citations to confirm before submission.*

#### 10.2 What a single evil part would predict

If one neuron, expert or feature caused the cruelty, our tests should have shown five things:

1. **It would stand out.** Under a cruel persona, a small set of units would fire far more than under Bob's plain prompt.
2. **Turning it down would calm the model.** Muting it would make cruel-persona answers kinder.
3. **Turning it up would make plain answers cruel**, on its own, at a modest strength.
4. **A sweep would find it.** Pushing units one group at a time would point to one unit, and testing that unit alone would confirm it.
5. **One autoencoder feature would carry it.** Pushing that feature would turn plain answers harsh.

The sweep could find such a part if it existed: on a made-up test server with one planted cruel expert and one planted cruel neuron, it found both (PR #227).

#### 10.3 What happened

Harshness was rated 0 (kind) to 10 (cruel) by the model as built, on two kinds of question: cruel-persona asks (the prompt tells it to play a cruel character) and plain asks. As built, the model, 28Bob Riker, scored 0 on plain asks.

| Prediction | What we saw | Holds? |
| --- | --- | --- |
| 1. It would stand out | A trace contrast picked out 16 experts that fire more under the cruel persona (13 Nov). | Partly: there were 16, not one. |
| 2. Turning it down calms the model | The opposite. With those 16 at dial 0.3, cruel-persona harshness rose from 3.67 to 6.67; at dial 0, 6.17; masked out, 5.47 (30 asks per setting). Plain answers stayed at 0. Routing barely moved (0.404 to 0.415 of picks). | No |
| 3. Turning it up makes plain answers cruel | Expert sweep, 938 tests: no single expert had a measurable effect. Single neurons and single expert dials alone scored 0. Only groups of neurons at push 0.25 raised harshness (up to 4.63 in layer 12). | No |
| 4. A sweep finds one unit | Each of the 16 experts alone was within the noise (a no-change test swings 0.5 to 3.88). Some combinations added more than their parts (up to +3.88), but on average combinations just added up (+0.24). | No |
| 5. One feature carries it | No autoencoder feature at layers 10, 20 or 30 made plain answers harsher, even pushed to 10 times its usual strength. | No |

The patching run (15 Nov, 6 asks per test) then showed where the habit does sit:

- Adding the cruel-minus-kind difference at its natural size changed nothing at any layer.
- At three times that size, plain answers rose to between 1.7 and 3.5 across most of layers 19 to 29, peaking at 3.5 at layer 26.
- Taking the difference out of cruel-persona answers dropped them from 3 to 0.17 at layer 19, and to about 0.5 at several layers from 21 to 28.

#### 10.4 What we now think

There is no evil neuron in Riker. The cruel habit behaves like a direction spread across the middle-to-late layers (19 to 29), not a part that can be cut out. The 16 experts that looked guilty are the reverse: they act together as a brake when a prompt invites cruelty. Cutting or muting them, as a pruning step might, would make the model worse.

This matters for making small models. A cut chooses experts by what they do; a brake looks like a culprit on a trace and would be the first thing a careless cut removes.

#### 10.5 What went wrong on the way

- **A retracted result.** An early steering push appeared to "drive hostility". In fact every strength made the model loop one word, often in Chinese, and the first judge rated loops as harsh. The judge now counts loops and wrong-language text as broken, and the claim is withdrawn.
- **An unreliable first sweep.** The 938-test expert sweep used that old judge, so it is a rough guide only.

#### 10.6 Limits

- One model (Riker, an already-cut Qwen3.6), one persona prompt.
- Harshness is rated by the model itself, not by people.
- Small tests: 6 to 30 asks per setting, with about 2 points of swing on small tests. Single cells are hints.

#### 10.7 Still to do

- Repeat the patching with more asks per test.
- Run the same checks on stock Qwen and on a model trained on clean lessons, to see whether lessons change the brake.
- Have people rate a sample of the answers.

---

## Next steps

- [ ] Check every held-out test set used so far against the 519 leaked items.
- [ ] Re-test Bobert and Riker on Qwen tool shape v2 (PR #251), to measure whether the coaching-led shape changes helped.
- [ ] Retrain on reviewed lessons and score against stock Qwen on a leak-free test set (the missing main result).
- [ ] Repeat the key benchmarks two more times for error bars.
- [ ] Write the literature review (chapter 2).
- [ ] Write the tools chapter's diagram and per-patch overhead numbers.

Related pages: [Bob's own models](../BOBS-OWN-MODELS.md) · [Making smaller brains](../MAKING-SMALLER-MODELS.md) · [The Forge journal](../FORGE-JOURNAL.md) · [What Bob costs to make](../COSTS.md)
