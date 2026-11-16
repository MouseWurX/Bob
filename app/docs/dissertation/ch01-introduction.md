# Chapter 1. Introduction

## 1.1 Motivation: agents that run on one's own computer

A personal assistant that lives on one's own computer has a hard job. It must call tools reliably, such as a file reader, a calendar or a web search. It must write and run code. It must look things up when it is unsure, and it must hold a long conversation without losing the thread. A cloud service can lean on very large models for all of this. A local assistant has to do it on a consumer graphics card, with no network and no per-word bill.

Two trends make that goal reachable. The first is open-weight mixture-of-experts language models. In such a model, each word is routed to only a few of many small sub-networks called experts (Shazeer et al., 2017). The model holds many parameters but uses only a fraction of them per word. Qwen3.6-35B-A3B is an example: about 3 billion of its 35 billion parameters work on each word, so it runs at useful speed on a 16 GB card (Write-up draft, 15 Nov 2026). The Qwen3 family and the gpt-oss family are public models of this kind (Yang et al., 2025; OpenAI, 2025).

The second trend is local inference software. Projects such as llama.cpp run quantized models on a wide range of consumer hardware, from desktop graphics cards to mobile chips, with minimal set-up (the llama.cpp project; see Chapter 2). Together, the two trends mean that a capable agent model can sit inside an ordinary app.

A general model is not yet a good agent for one particular app, though. An app has its own tools, its own wording for them, and its own idea of what a good answer looks like. Making a model smaller and better at one app means changing it, and changing it means teaching it. Teaching means lessons: examples of a request, the steps a good agent would take, and the final answer. This thesis is about those lessons.

The thesis comes from one project. Bob is an open-source local AI agent app. Its own models, Riker 28Bob, Bobert 35Bob and Bill 20Bob, are cut and healed from Qwen3.6-35B-A3B. "Cut" means that experts are removed to make the model smaller. "Healed" means that the cut model is trained for a while so that it recovers. A second family in the project starts from GPT-OSS 120B and a 38B cut of it. The project made these models on rented cards at a recorded cost, and it kept a journal of every run, including the failures. That record makes it possible to ask careful questions about what went wrong and why.

## 1.2 The problem: synthetic lessons hide their faults

Almost no one writes agent lessons by hand at the scale a model needs. Most agent lessons are synthetic. A large model writes them, and scripts filter them. The method has a strong pedigree. Self-instruct showed that a model can write its own instruction data (Wang et al., 2023). Work on small code models showed that a modest amount of generated "textbook" material can train a capable model (Gunasekar et al., 2023). Work on LIMA showed that a thousand carefully chosen examples can go a long way (Zhou et al., 2023). The common lesson from these papers is that data quality matters more than data quantity.

The hard part is knowing the quality. A script can check that a lesson has a final answer, that its tool calls parse and that it is not a copy of another lesson. A script cannot check that the arguments of a tool call make sense, that a tool result looks like what the real tool would return, or that a claim about an API is true. These faults are quiet. A lesson that has them still looks like a lesson. If the model is trained on it, the fault can become a habit.

We met this problem in a concrete form. Early coding lessons taught Bob's models not to code. 37% of them answered a coding request by handing the job to a specialist tool and reporting a pretend result (MAKING-SMALLER-MODELS.md). A full training pass on those lessons left the model's coding where it was. The model improved only after the lessons were read, the hand-offs removed and new coding lessons written, and that step also used a new cut that kept more experts (FORGE-JOURNAL.md). The lesson set had looked fine to the scripts. It took a reader to see the fault.

That episode raises a general question. If a script-cleaned set can hold a fault as large as 37%, how many other faults does it hold, and of what kinds? A second question follows from it. Test items are written the same way as lessons, by the same pipelines, so they may carry the same faults. They may also leak into training. If so, the scores that guided earlier decisions may have been wrong.

The thesis title states the position we reached: clean lessons beat more lessons. The title is a claim that the evidence supports in part and does not yet fully test. Section 1.7 says exactly how far it goes.

## 1.3 Research questions

The thesis asks five questions. Each one is taken up by one or more studies, and each study has its own chapter.

1. **How many faults does a synthetic agent lesson set really hold, and of which kinds?** A script-level cleaning pass is the baseline. A full read by a strong model gives a better count. The question is how large the gap is and what the missed faults look like (Chapters 5 and 6).
2. **Do those faults show up as habits in the trained model, and how far does cleaning fix them?** A fault in a lesson set is only a problem if the model learns it. The question is whether a fault found in the lessons can be seen in the trained model's behavior, and whether removing it changes that behavior (Chapter 5, and Chapter 9 for the effect of a cut).
3. **How much do leaked test items distort the scores we used to make decisions?** Part of this question can be answered now: how many test items leaked. Part cannot: how much past scores were inflated (Chapter 7).
4. **Does tool shape or lesson content matter more for tool use?** "Tool wording" means the text of a tool's description. "Tool shape" means the tool set itself: which tools a brain is offered, how they divide the work, their names and inputs, and the format the brain writes its calls in. "Lesson content" means what the lessons show. The question is which of the two moves tool-use scores more (Chapter 8).
5. **Where does an unwanted habit sit inside the model: in a part that causes it, or in a part that holds it back?** This is an interpretability question. We expected to find a small part that causes a harsh habit. What we found was different (Chapter 10).

The questions are ordered from the data, through the model, to the instruments that measure it. Questions 1 to 3 concern how we know what is in the lessons and the tests. Question 4 concerns what the model needs from them. Question 5 concerns what the model does with them.

## 1.4 Contributions

The thesis makes six contributions. Some are measurements and some are tools. We separate them because a tool is only as good as the use it has been put to.

**1. Instruments to change and measure a model live.** The project forked llama.cpp into an inference engine called Brain Engine. It can switch experts on and off, steer activations and trace routing while a model runs. A rental pipeline, called the Forge, trains and heals models on rented cards under hard limits on hours and dollars. A set of Lab scripts runs the judged tests. The engine's expert switch with nothing switched off gives byte-identical output, and live steering at 8 times strength matches loading the same vector at 8 times strength (PR #227). Chapter 3 describes these tools and Chapter 4 describes the rules for using them.

**2. A measured count of faults in a synthetic tool lesson set.** Opus read all 5,788 non-held-out tool lessons. It kept 189 as written, marked 1,381 as small fixes, 4,208 as rewrites and 10 as discards. It changed 1,922 of the verdicts that a cheaper reader, Haiku, had given first (checked-numbers.md). Only about 3% of the lessons were fit to teach as written. Chapter 6 reports this.

**3. One case where a lesson fault became a habit, and cleaning helped.** The hand-off fault in the coding lessons is the clearest case. On the coding race, Riker v2 scored 6 of 13 and Riker v1 8 of 13. The re-cut Riker, healed on cleaner lessons, scored 9 of 13, where full Qwen scores 12. The re-cut Riker also keeps 208 experts against 176 for v1 and v2, so the gain is not from the lessons alone (FORGE-JOURNAL.md). Chapter 5 reports this.

**4. A measurement of test leakage.** Of 534 held-out tool test items, 519 appear word for word in training-side files, and 7 more share their first 60 characters. Reading the test items like lessons gave 148 keep, 381 fix and 5 discard (checked-numbers.md). A never-taught gate now stops a training plan before a card is rented if a test item appears in its lessons (PR #257). Chapter 7 reports this.

**5. Evidence that tool wording is a weak lever.** On GPT-OSS 120B, rewording the tools moved scores by about 1 point, inside the noise. Coaching hints that give the exact call lifted step completion much more (checked-numbers.md). Hints are not lessons, so this points to lesson content but does not test it. Chapter 8 reports this.

**6. A finding about where an unwanted habit sits.** In Riker, a harsh habit is not carried by a single neuron, expert or autoencoder feature. It behaves like a direction spread across the middle-to-late layers. A group of 16 experts that looked guilty acts as a brake instead. Chapter 10 reports this.

Two further products are not research results in the same sense. Chapter 11 describes the clean-lesson pipeline that the project now uses. Chapter 12 describes a course that teaches the whole subject from first concepts to engineering, using the project's real data. They are reported as designs and shipped code, not as tested outcomes.

## 1.5 Scope, and what is deliberately left out

The thesis is a case study of one project, and its claims are limited to it. Several choices of scope matter for reading the results.

**One app, two model families.** Most of the evidence comes from the Qwen3.6-35B-A3B family and its cuts. The second family is GPT-OSS 120B and a 38B cut of it. We do not claim that the findings carry over to dense models, to other languages of tools, or to larger scales. Where a result rests on one model, the chapter says so.

**Tool use, coding and a persona habit.** The behaviors studied are tool calling, coding and one unwanted persona habit, harshness. We did not study long-document reading beyond a needle test, nor vision, speech or image tools. A needle test is a check that a fact planted in a long text can be found again. Riker passed it 12 of 12 at 8K, 32K, 64K and 128K, the same as full Qwen (FORGE-JOURNAL.md).

**Training is off the table for tests and for surgery data.** The project's rules forbid teaching a model from its own test items or from the data used for surgery and steering. This is a design rule of the method (Chapter 4).

**Safety and alignment in the wide sense.** The harshness study uses an unwanted persona habit as a controlled test of where a habit sits. It is not a study of safety training, red-teaming or misuse. The related work on refusal, persona vectors and emergent misalignment is relevant to the method, but the thesis does not make claims about the safety of any model.

**Not a benchmark paper.** The tests are built for the project's decisions. They are not offered as a public benchmark. Chapter 2 reviews public benchmarks such as the Berkeley Function Calling Leaderboard (Patil et al., 2025), and Chapter 4 explains why the project's own tests were still needed.

**Not a training-data release.** The thesis does not publish lesson text, model answers or prompts meant for training. Where a model's words are quoted, they are a few words of evidence, not material for others to train on.

**Privacy.** The thesis names no person, computer or folder on anyone's machine. It refers to "the project", and the project's owner appears only as MouseWurX, the GitHub account the project is published under. Model names and paths inside the public repository are used freely.

## 1.6 Summary of the findings

This section gives the headline results, using only the checked numbers. Each is developed, with its limits, in its own chapter.

**Cutting is cheap when done well.** Removing experts costs little until a threshold. In full Qwen, keeping 8, 6 or 4 experts per word holds tool use at 45 of 97, facts at 20 of 20 and code at 6 of 6. Three experts per word drops tools to 26 of 97 and code to 4 of 6, and two collapses to 1 of 97 and 0 of 6. Speed rises from 82.7 to 92.1 and 102.5 tokens per second at 8, 6 and 4 experts (experts-per-word-full-qwen-2026-11-04.md). On a count ladder, at 208 of 256 experts, skills keep 97 to 98% of routing and general knowledge 90%. At 144 experts, skills keep 87 to 90% and general knowledge 66% (ladder.md).

**A cut without a heal mostly holds, and a heal helps further.** On 314 held-out turns, a REAP trim without healing at 100, 75, 50 and 35% kept scored 204, 204, 198 and 145 for Bobert. For Riker, which was already cut, it scored 210, 204, 163 and 72. For GPT-OSS 120B it scored 204, 204 and 196 at the first three levels (MAKING-SMALLER-MODELS.md). A heal brought Riker's held-out lesson cross-entropy from 0.401 to 0.362, against a teacher at 0.324. Bill v1 moved from 0.585 to 0.501 (FORGE-JOURNAL.md). Chapter 9 reads these results together.

| Result | Figure | Source |
|---|---|---|
| Hand-off habit in first coding lessons | 37% of lessons | MAKING-SMALLER-MODELS.md |
| Coding race, Riker v2 (176 experts) to re-cut Riker on cleaner lessons (208 experts); full Qwen 12 | 6 to 9 of 13 | MAKING-SMALLER-MODELS.md; FORGE-JOURNAL.md |
| First cleaning pass | 9,059 to 8,828 lessons | MAKING-SMALLER-MODELS.md |
| Full read of tool lessons: keep, fix, repair, discard | 189, 1,381, 4,208, 10 (of 5,788) | TALLY.md (tool-6500) |
| Haiku verdicts changed by Opus | 1,922 | TALLY.md (tool-6500) |
| Held-out items found word for word in training-side files | 519 of 534 (+7 sharing 60 characters) | TALLY.md (heldout-534) |
| Test items: keep, fix, discard | 148, 381, 5 | TALLY.md (heldout-534) |
| Quiz noise, 97 questions | 3 to 5 between runs | MAKING-SMALLER-MODELS.md |

**The first cleaning pass missed most faults.** The scripts removed 231 of 9,059 lessons: 73 duplicates, 123 with no final answer, 28 calling unknown tools, 6 loops and 1 empty (MAKING-SMALLER-MODELS.md). The full read found far more. Of the tool lessons that Opus read, only 189 of 5,788 were kept as they stood.

**The test leaked.** 519 of 534 held-out tool items were in training-side files. The copies sit in other lesson sets and in the conversation files used for REAP scoring (TALLY.md, heldout-534). The ledger's never-list may drop them at training time, so whether any model trained on them is not measured. Until the leak is cleaned and models are re-scored, we cannot say how much past scores were inflated. Chapter 7 says "not measured".

**Wording is not the lever.** On GPT-OSS 120B, 264 turns, thinking off, Bob's own tool wording scored 63.3%, and every other wording was within about 1 point, inside the 95% range. With thinking on, the score was 54.2%, which is 9.1 points worse (plus or minus 5.0) (WORDING.md). Coaching with up to three hints, the last being the exact call, lifted Bobert to 88% with thinking off and 86% with it on. Riker solved 78 and 76 of 83 steps. On a first try with thinking off, GPT-OSS 120B was right on 45 of 83 steps and the unhealed 38B cut on 32 of 81 (bob-studies interviews; COACH.md).

**There is no evil neuron in Riker.** Harshness was 3.67 out of 10 on a cruel-persona prompt as built. With 16 experts at dial 0.3 it rose to 6.67. At dial 0 it was 6.17, and with the experts masked it was 5.47. Plain answers stayed at 0, and each of the 16 experts alone was within the noise (riker-28bob-tool-interview.md, section 6a). Patching at three times the natural size raised plain answers to between 1.7 and 3.5 across most of layers 19 to 29, peaking at layer 26. Removing the cruel direction lowered cruel-persona answers from 3 to 0.17 at layer 19. No single autoencoder feature made plain answers harsher, even at ten times strength (INTERP-PATCH.md; INTERP-FEATURES.md). The tests used 6 to 30 asks per setting, so single cells are hints, not proof.

## 1.7 An honest note on what has not been done

The title's claim has two halves. The first half is that faults in synthetic lessons are many and are hard to find with scripts. The evidence for it is strong: a full read, a leak count and one clear case where a fault became a habit. The second half is that training on cleaned lessons gives a better model. The evidence for that is a single case, the coding lessons, where one fault was removed and one score moved from 6 to 9 of 13. It is one run on a small test, and small coding tests are noisy. The same step also changed the cut, from 176 to 208 experts, so the case does not isolate the lessons (FORGE-JOURNAL.md).

The decisive experiment has not been run. It would train a model on the full set of reviewed lessons and score it on a test that is leak-free. It would compare that model with one trained on the script-cleaned set, with the same base model, the same cut and the same budget. Until it runs, the claim "clean lessons beat more lessons" is a strong hypothesis, supported by one case and by a full-read count, not a result.

Several other limits should be stated at the start.

- The status of the code matters. Pull requests #254 and #257 shipped in release 1.5.238, together with #251, #263 and #232. That release passed 276 of 276 tests on Windows in its lab-PC check on 15 November. Pull request #251 (Qwen tool shape 2) has shipped but has not been re-tested on models, so we do not know whether it raises scores. The GPT-OSS shape was locked later, in pull request #271 (release 1.5.240), together with the Qwen fixes from the coached runs: Qwen brains use tool shape 4 and GPT-OSS brains tool shape 3 (Chapter 8, section 8.10). Neither locked shape has been re-scored. Pull request #232, which covers patching and autoencoders, ran on 15 November.
- The 534 held-out test items were sorted by Haiku, with a 5% spot-check by Opus. On 15 November MouseWurX chose to keep the held-out tests as they are while the full Opus re-sort of the lessons runs. The tests may therefore still hold faults and leaks, and Chapter 7 treats them as such.
- The reviewers are models. One reader model made each pass, and no person has checked a sample yet. The effect of the rewritten lessons on a trained model has not been measured.
- The clean-lesson pipeline is slow and strict, and its keep rates are low so far (Chapter 11). A recent round kept 17 of 215 lessons as they stood, but that figure was reported in the project notes and not yet checked against a file, so we do not rely on it.
- The harshness tests are small and the judge is a model, not people. An earlier claim that a steering push "drives hostility" was withdrawn, because the model was looping a single word and the first judge rated loops as harsh. The judge now counts loops and wrong-language text as broken.

We state these limits here because the rest of the thesis depends on them. A result that is single-run, small-sample or judged by a model is still a result, but it is not proof. The chapters mark each one.

## 1.8 Roadmap

The thesis has 13 chapters. This one is the first.

**Chapter 2, Background and related work,** reviews the literature the thesis stands on. It covers transformers and mixture-of-experts models, model compression, distillation and parameter-efficient fine-tuning, synthetic data and its quality, test contamination, tool use, reasoning, preference training, interpretability and local inference. It ends with the gaps this thesis addresses.

**Chapter 3, Building the instruments,** describes Brain Engine, the Forge and the Lab scripts, and what is still missing from them.

**Chapter 4, Method and rules,** sets out the rules that make the later measurements trustworthy: the held-out split, gates before and during a paid rental, full passes only, measured-only reporting, a ledger of cost and failures, and the quiz-noise level.

**Chapter 5, Study 1: the hand-off habit,** reports the coding lessons that taught a model not to code, and the recovery after cleaning (research questions 1 and 2).

**Chapter 6, Study 2: what a full read finds,** reports the full Opus read of the tool lessons and the kinds of fault it found (question 1).

**Chapter 7, Study 3: leaks in the test,** reports the leak between training-side files and the held-out items, and what it means for earlier scores (question 3).

**Chapter 8, Study 4: tool shape or lesson content,** reports the wording, thinking and coaching experiments (question 4).

**Chapter 9, Study 5: lessons through a cut,** reports what a cut keeps, what a heal does, and the argument for cleaning before cutting (question 2).

**Chapter 10, The evil neuron we expected, and what we found,** reports the interpretability study of a harsh habit (question 5).

**Chapter 11, How we now make clean lessons,** describes the pipeline built in response to Studies 1 to 3.

**Chapter 12, Teaching it,** describes a course that goes from first concepts to engineering, using the project's real results.

**Chapter 13, Conclusion and future work,** returns to the five questions, states what is supported and what is not, and lists the experiments that would settle the open points, the decisive retrain first among them.

A reader who wants the main argument in the shortest path can read Chapters 5, 6, 7 and 13. A reader who cares about interpretability can go straight to Chapter 10 after the review of that area in Section 2.9. A reader who wants to repeat the work should read Chapters 3 and 4 first.

## References

Gunasekar, S., Zhang, Y., Aneja, J., et al. (2023). Textbooks Are All You Need. arXiv:2306.11644. https://arxiv.org/abs/2306.11644

OpenAI (2025). gpt-oss-120b & gpt-oss-20b Model Card. arXiv:2508.10925. https://arxiv.org/abs/2508.10925

Patil, S. G., Mao, H., Yan, F., Ji, C. C.-J., Suresh, V., Stoica, I., and Gonzalez, J. E. (2025). The Berkeley Function Calling Leaderboard (BFCL): From Tool Use to Agentic Evaluation of Large Language Models. Proceedings of the 42nd International Conference on Machine Learning, PMLR 267, 48371-48392. https://proceedings.mlr.press/v267/patil25a.html

Shazeer, N., Mirhoseini, A., Maziarz, K., Davis, A., Le, Q., Hinton, G., and Dean, J. (2017). Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer. arXiv:1701.06538. https://arxiv.org/abs/1701.06538

Wang, Y., Kordi, Y., Mishra, S., Liu, A., Smith, N. A., Khashabi, D., and Hajishirzi, H. (2023). Self-Instruct: Aligning Language Models with Self-Generated Instructions. arXiv:2212.10560. https://arxiv.org/abs/2212.10560

Yang, A., Li, A., Yang, B., et al. (2025). Qwen3 Technical Report. arXiv:2505.09388. https://arxiv.org/abs/2505.09388

Zhou, C., Liu, P., Xu, P., et al. (2023). LIMA: Less Is More for Alignment. arXiv:2305.11206. https://arxiv.org/abs/2305.11206

llama.cpp project (ggml-org). LLM inference in C/C++. https://github.com/ggml-org/llama.cpp
