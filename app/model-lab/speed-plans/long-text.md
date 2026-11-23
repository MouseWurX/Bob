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
4. **Does tool shape or lesson content matter more for tool use?** "Tool shape" means the names, descriptions and argument layout that the model sees for each tool. "Lesson content" means what the lessons show. The question is which of the two moves tool-use scores more (Chapter 8).
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

**Privacy.** The thesis names no person, computer, folder on anyone's machine or account. It refers to "the project" and "the owner". Model names and paths inside the public repository are used freely.

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

- The status of the code matters. Pull requests #254 and #257 shipped in release 1.5.238, together with #251, #263 and #232. That release passed 276 of 276 tests on Windows in its lab-PC check on 15 November. Pull request #251 (a Qwen tool shape v2 and a GPT-OSS shape) has shipped but has not been re-tested on models, so we do not know whether it raises scores. Pull request #232, which covers patching and autoencoders, ran on 15 November.
- The 534 held-out test items were sorted by Haiku, with a 5% spot-check by Opus. On 15 November the owner chose to keep the held-out tests as they are while the full Opus re-sort of the lessons runs. The tests may therefore still hold faults and leaks, and Chapter 7 treats them as such.
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
# Chapter 2. Background and related work

This chapter reviews the work that the thesis stands on. It is the main literature review. It has eleven sections, each tied to a part of the project: the models (2.1), the ways they are made smaller (2.2), the ways they are taught (2.3), the data they are taught from (2.4), the tests that judge them (2.5), their use as agents (2.6), their reasoning (2.7), their later training (2.8), the methods used to look inside them (2.9) and the software that runs them (2.10). Section 2.11 sets out the gaps that this thesis addresses.

Every paper cited here was opened and read on its public page before it was cited. Where a statement rests on a paper's abstract and summary and not on a full reading of its method, we say "reports" and keep the claim to what that page states. Numbers inside the project's own studies come only from the checked numbers file and the project's run reports, and are cited by file name.

## 2.1 Transformers and mixture-of-experts language models

### 2.1.1 The transformer

Modern language models are built on the transformer, introduced by Vaswani et al. (2017) in "Attention Is All You Need". A transformer reads a sequence of tokens, which are word pieces. It turns each token into a vector and passes the vectors through a stack of layers. Each layer has two main parts: an attention step, in which each position looks at other positions, and a feed-forward step, which transforms each position on its own. Between layers, a running vector for each position carries information forward. This running vector is often called the residual stream, and it matters later in this thesis, because many interpretability methods read from it or write to it.

A language model of this kind predicts the next token. It is trained on very large text collections, and then often adjusted with further training to follow instructions and to use tools. Most of its parameters sit in the feed-forward steps and in the attention projections. Making a model smaller therefore means removing or compressing parts of these.

### 2.1.2 Sparse mixture of experts

A dense model uses all of its feed-forward parameters for every token. A mixture-of-experts (MoE) model replaces each feed-forward step with many smaller ones, the experts, and a small router that picks a few of them for each token. Shazeer et al. (2017) introduced the sparsely-gated mixture-of-experts layer for language models. Their title says what the idea buys: outrageously large networks, whose capacity grows with the number of experts while the work per token stays close to that of a few experts.

Fedus et al. (2021) simplified the routing in Switch Transformers by sending each token to a single expert, and reported scaling to models of a trillion parameters. Jiang et al. (2024) described Mixtral, an open model that routes each token to two of eight feed-forward experts. They report that it matches or beats Llama 2 70B and GPT-3.5 while using 13 billion active parameters per token. Dai et al. (2024) proposed DeepSeekMoE, which splits experts into smaller and more numerous ones and sets aside some shared experts that are always active. Their stated aim is to make each routed expert more specialized, and they report that a 16 billion parameter version matches LLaMA2 7B with about 40% of the computation.

The projects in this thesis use models of this family. Qwen3 is a family of dense and mixture-of-experts models, with sizes from 0.6 to 235 billion parameters, that combines a deep-reasoning mode and a fast-response mode in one model (Yang et al., 2025). The gpt-oss models are open-weight mixture-of-experts reasoning models, tuned for agentic work such as function calling and the use of Python tools (OpenAI, 2025). Bob's models start from Qwen3.6-35B-A3B, which activates about 3 billion of its 35 billion parameters per word (Write-up draft). We did not find a technical report for the Qwen3.6 release among the sources we opened. Where we describe it, we rely on the Qwen3 report for the family design and on the project's own measurements for the specifics.

### 2.1.3 Why mixture of experts matters for local use, and for this thesis

For a person with one consumer card, the active parameter count sets the speed, and the total parameter count sets the memory. A mixture-of-experts model gives a large total with a small active part. That trade is what makes a 35 billion parameter model usable on a 16 GB card, once it is made smaller. It also leads to the question that Section 2.2 takes up: if only a few experts fire for each token, can the rarely used ones be removed?

For the interpretability work in Chapter 10, the expert structure adds a second reason to care. A model whose computation is divided into named parts invites the hypothesis that a behavior lives in one part. The router and the expert indices give a natural vocabulary for such a hypothesis. We return to this in Section 2.9, where we ask whether the hypothesis is supported.

### 2.1.4 Summary of 2.1

The transformer and the sparse mixture of experts are the settings in which the thesis works. The review so far gives three points that later chapters use. Each token uses only a few experts. The number of experts per token is a dial that can be turned. The residual stream is a place where behavior can be read and changed.

## 2.2 Compressing models

Compression methods fall into three families that the project touched. Quantization stores weights with fewer bits. Pruning removes weights, experts or layers. Distillation, treated in Section 2.3, trains a small model to copy a large one. The project's models rely on all three, and so do most local setups.

### 2.2.1 Quantization

Quantization stores each weight in fewer bits, usually after training. Dettmers et al. (2022) proposed LLM.int8(), which runs the matrix multiplications of a transformer in 8 bits. Their method handles a small set of large-magnitude outlier dimensions separately in 16-bit precision. They report no measurable performance loss for models up to 175 billion parameters, which roughly halves the memory needed.

Frantar et al. (2022) proposed GPTQ, a one-shot method that uses approximate second-order information to lower weights to 3 or 4 bits with little accuracy loss. Lin et al. (2023) proposed AWQ, which finds the small fraction of weights that matter most by looking at activation statistics and protects them by scaling. It needs no backpropagation, and it received the MLSys 2024 Best Paper Award. Dettmers et al. (2023) proposed QLoRA, which fine-tunes adapters through a frozen 4-bit quantized model and lets a 65 billion parameter model be fine-tuned on a single 48 GB card.

For this thesis, quantization matters in two ways. It is how a model reaches a consumer card at all, as Section 2.10 describes. It is also a source of small, hard-to-see changes in model behavior. We did not study quantization error as a research question, and we treat it as a fixed condition of local inference.

### 2.2.2 Weight pruning

Pruning removes parts of a trained model. Frantar and Alistarh (2023) proposed SparseGPT, which prunes models of up to 175 billion parameters in one pass without retraining. They report small loss at 50% sparsity and negligible perplexity increase at 60% unstructured sparsity. The method also works with semi-structured patterns, and it can be combined with quantization.

Unstructured sparsity has a practical limit for local use. Zeros scattered through a weight matrix do not speed up a consumer card unless the software and hardware are built for the pattern. For that reason, the methods that interest a local project the most remove whole structures: experts, layers, channels or heads.

### 2.2.3 Structured pruning and the Minitron recipe

Muralidharan et al. (2024) asked whether an existing model can be pruned and then retrained on a small share of the original data, instead of training every size from scratch. They combined pruning along four axes (depth, width, attention and MLP) with knowledge distillation for retraining. They applied it to a 15 billion parameter Nemotron-4 model, and produced 8B and 4B models that they call Minitron. They report that the smaller models need up to 40 times fewer training tokens each than training from scratch, and that the family as a whole saves 1.8 times the compute. They also report up to a 16% improvement on MMLU over models of the same size trained from scratch.

Sreenivas et al. (2024) described the same approach in practice for Llama 3.1 8B and Mistral NeMo 12B. They compared depth pruning, which removes whole layers, with width pruning, which reduces the hidden, attention and feed-forward dimensions. They also report a practical point that bears on this thesis: when the original training data is not available, lightly fine-tuning the teacher model on the distillation data helps.

The Minitron recipe is a template for the "cut and heal" steps that Bob's models follow. A cut removes structure. A heal retrains the cut model, with the original as a teacher, until it recovers. The thesis differs from Minitron in two ways. The model is a mixture of experts, so the structure to cut is the expert, and the heal data is a project's own lessons, which brings the quality of those lessons into the heal. Chapter 9 takes this up.

### 2.2.4 Expert pruning and REAP

Lu et al. (2024) addressed expert pruning directly in "Not All Experts Are Equal". They propose post-training techniques for pruning and for skipping experts in mixture-of-experts models. Unlike weight pruning, removing whole experts needs no special hardware, and the authors report smaller models and faster inference with acceptable performance across a range of tasks.

Lasby et al. (2025) proposed REAP, router-weighted expert activation pruning. It scores each expert using both its router gate values and its activation norms, with a score chosen to minimize a bound on reconstruction error. They challenge earlier work that favored merging experts. Their finding is that expert pruning is better for generative tasks, because merging loses fine-grained control over routing. They report that REAP beats merging and other pruning methods on generative benchmarks across models from 20 billion to 1 trillion parameters, with the widest advantage at 50% compression. They report near-lossless code generation for two large models after half the experts were pruned.

REAP is the pruning rule behind the project's "REAP trims". These are cuts that keep a share of the experts without any healing step. On 314 held-out turns, at 100, 75, 50 and 35% kept, the REAP trims scored 204, 204, 198 and 145 for Bobert, 210, 204, 163 and 72 for Riker (which was already cut), and 204, 204 and 196 for GPT-OSS 120B at the first three levels (MAKING-SMALLER-MODELS.md). The pattern agrees in kind with the claim of Lasby et al. that pruning half the experts can be close to lossless on a generative task. It adds a caution: a model that was already cut loses more when cut again. The numbers come from the project's own tests, not from the REAP paper's benchmarks, so we do not claim that they replicate it.

The research question about where a habit sits connects here. REAP and similar methods choose experts by how much they matter to a score or a reconstruction. Chapter 10 reports a group of 16 experts that looked like a cause of a harsh habit on a trace and turned out to act as a brake. A pruning rule that keeps the active experts and drops the quiet ones does not tell these two roles apart. We return to this point in Section 2.11.

### 2.2.5 Summary of 2.2

Quantization is solved well enough for local use. Weight pruning is less useful on consumer cards than structured pruning. Structured pruning with distillation, in the style of Minitron, is a proven recipe for dense models. Expert pruning with REAP is a recent and strong rule for mixture-of-experts models. The literature measures compression mostly by public benchmark scores. It says less about what compression does to the habits that a model learned from its lessons.

## 2.3 Knowledge distillation and parameter-efficient fine-tuning

### 2.3.1 Knowledge distillation

Hinton et al. (2015) proposed compressing the knowledge of a large model or ensemble into one smaller model. In the usual form, the small model is trained to match the output probabilities of the large one, and not only the single correct label, so it also learns how the large model ranks the wrong answers. The authors report strong results on MNIST, and that distilling an ensemble into one model significantly improved the acoustic model of a heavily used commercial system.

Distillation takes several forms in the work reviewed so far. Minitron uses it to heal pruned models (Muralidharan et al., 2024). The Qwen3 report states that its smaller models are built using knowledge from the larger flagship models, which lowers training cost (Yang et al., 2025). The gpt-oss card states that the models were trained with large-scale distillation and reinforcement learning (OpenAI, 2025). In synthetic data work, a large model writes lessons that a small model learns from. That is also a form of distillation, with the large model's outputs as the signal, and it is the form this thesis studies most.

In Bob's heal step, the measured quantity is the cross-entropy of the cut model against held-out lesson text, with the teacher's own cross-entropy as a floor. For Riker the heal brought it from 0.401 to 0.362, with the teacher at 0.324. For Bill v1 it fell from 0.585 to 0.501 (FORGE-JOURNAL.md). These are measures of how closely the model copies the lessons. They do not measure whether the lessons were good. We come back to that distinction in Chapter 9.

### 2.3.2 Low-rank adaptation

Full fine-tuning updates every weight. Hu et al. (2021) proposed LoRA, which freezes the original weights and adds small trainable low-rank matrices to the transformer layers. They report that this cuts the number of trainable parameters by roughly 10,000 times against fully fine-tuning GPT-3 175B with Adam, and reduces memory needs about threefold. They also report that LoRA matches or exceeds full fine-tuning on the models they tested, and that it adds no inference latency, since the low-rank update can be merged into the weights.

Dettmers et al. (2023) combined LoRA with a 4-bit frozen base in QLoRA. They fine-tuned over 1,000 models and report that their Guanaco models reached about 99.3% of the performance of ChatGPT on the Vicuna benchmark. They also argue that GPT-4-based evaluation can be a cheap substitute for human evaluation, and that current chatbot benchmarks are not fully reliable. Both points return later in this chapter, in the sections on judges and on contamination.

Parameter-efficient fine-tuning matters here for practical reasons. A person with a consumer card can train small adapters where full training is out of reach. A rented card can train a larger model for fewer dollars. The project's own training pipeline works within hard limits on hours and dollars (Chapter 4), so methods that cut the cost of a pass are valuable. The project's own rule is that its comparisons use full passes, because a partial pass is hard to compare (Chapter 4).

### 2.3.3 What the literature does not say about distillation data

The distillation literature treats the teacher as a source of good signal. For synthetic lessons, the teacher is a model that can make mistakes, and its mistakes are copied. The Minitron practitioners note that the teacher may need a light fine-tune on the distillation data when the original data is not available (Sreenivas et al., 2024). That is a hint that the teacher's distribution matters. It does not tell us how often a teacher's lessons are wrong in ways a script cannot see.

This is the starting point for Section 2.4. If the lessons are the signal, then the quality of the lessons sets the ceiling on what a small model can learn.

## 2.4 Synthetic training data and data quality

### 2.4.1 Self-generated instruction data

Wang et al. (2023) proposed Self-Instruct, in which a pretrained model generates its own instructions, inputs and outputs. The generated examples are filtered to remove invalid or near-duplicate entries, and the model is then fine-tuned on them. Applied to GPT-3, the method gains 33 percentage points on Super-NaturalInstructions and roughly matches InstructGPT-001. In a human study on expert-written instructions for new tasks, the Self-Instruct model was judged better than models tuned on existing public instruction data, though it trailed InstructGPT-001 by about 5 points.

Self-Instruct is the template for most later synthetic pipelines, including Bob's. Its filter is the important part for our purpose. The filter removes invalid and near-duplicate examples. These are the faults that scripts can see. The faults that a script cannot see, such as a plausible but wrong claim or a tool result that no real tool would return, pass the filter.

### 2.4.2 "Textbooks" and small models

Gunasekar et al. (2023) trained phi-1, a 1.3 billion parameter code model, on about 6 billion tokens of web data filtered for "textbook quality" and about 1 billion tokens of textbooks and exercises generated with GPT-3.5. They report 50.6% pass@1 on HumanEval and 55.5% on MBPP, which is a strong result for the size. The paper's claim is that quality of data can stand in for size of model and size of data.

A careful reader should note two features of the study. The data is filtered and generated with a stronger model, so it carries both the strength and the faults of that model. And the evaluation is on public coding benchmarks, which are open to the contamination problem in Section 2.5. The thesis does not dispute the paper's finding. It asks a narrower question that the paper does not answer: when the lessons are for an agent, with tools and multi-step behavior, how good are they in fact, and how would one know?

### 2.4.3 Less is more

Zhou et al. (2023) fine-tuned a 65 billion parameter LLaMa model on just 1,000 carefully selected prompt and response pairs, using only standard supervised training. In a human study, the responses of this model, called LIMA, were rated equal to or better than GPT-4 in 43% of cases, and equal or better than Bard in 58% and DaVinci003 in 65%. The authors conclude that almost all knowledge in large language models is learned during pretraining, and that a small amount of instruction data is enough to teach the style and format of a good answer. This is the "superficial alignment" view.

The view suggests a prediction for a small, cut model that has lost some of its pretraining knowledge through compression: the cut model needs more from its lessons than LIMA's model did. Our results do not test this. They do show that a small lesson set can matter a great deal when it carries a fault, as with the 37% of coding lessons that handed the job to a tool (MAKING-SMALLER-MODELS.md).

### 2.4.4 Filtering for quality

Chen et al. (2023) argued that the 52,000 examples in the Alpaca dataset contain many low-quality entries, with wrong or off-topic answers. They used ChatGPT to score each example and kept about 9,000 higher-quality ones. The resulting model, AlpaGasus, beat the original Alpaca under GPT-4 and human judging. Their 7B version trained about 5.7 times faster. The paper supports two points that matter here. A strong model can be used as a reader of lessons. And fewer, better lessons can outperform more, noisier ones.

The project's full read follows the same idea at a larger scale and with a finer verdict. Instead of a score, each lesson gets one of four verdicts: keep, fix, repair or discard. A first, cheaper reader (Haiku) sorted every lesson, and a stronger reader (Opus) read all 5,788 non-held-out tool lessons (checked-numbers.md). It kept 189 as written, marked 1,381 as small fixes, 4,208 as rewrites and 10 as discards. It changed 1,922 of Haiku's verdicts. The comparison with AlpaGasus is limited. Their filter dropped most of the data and kept a subset. Ours found that dropping most of the data would leave very little, and so it rewrites. The effect of the rewriting on a trained model has not been measured (Chapter 6).

Deduplication is the other classic filter. Lee et al. (2021) found that common language modeling datasets contain many near-duplicate examples and long repeated passages. Models trained on deduplicated data memorize text about ten times less often and reach the same or better accuracy in fewer steps. They also show that deduplication reduces overlap between training and test data. The project's first cleaning pass was of this kind. It removed 73 duplicates, 123 lessons with no final answer, 28 that called tools that do not exist, 6 loops and 1 empty one, taking 9,059 lessons to 8,828 (MAKING-SMALLER-MODELS.md). That is exactly the class of fault that scripts can catch. It is also a small fraction of what the full read found.

Zheng et al. (2023) studied the use of strong models as judges. They document biases, including position, verbosity and self-enhancement, along with limited reasoning ability, and propose mitigations. They also report that GPT-4-level judges agree with human preferences about as often as humans agree with one another. The project's full read is a judge of lessons, so these cautions apply to it. One reader model made each pass, and no human has yet checked a sample. We say so in Chapters 6 and 7, and we treat the verdict counts as a measurement by an instrument with a known type of bias, not as ground truth.

### 2.4.5 Training on generated data

Shumailov et al. (2023) studied what happens when models are trained on text made by other models. They describe "model collapse", in which rare patterns in the original data gradually disappear, with, in their words, irreversible defects in the resulting models. They report the effect in several kinds of generative model, language models among them.

The finding is about repeated generations, which is a stronger condition than one round of lessons from a stronger teacher. It still supports a general point: synthetic data is not neutral. A generator has a narrower distribution than the world, and a model trained on it inherits that narrowness. In Bob's case the rule that "rounds never repeat" and the lesson ledger, which stores a fingerprint of every lesson ever taught, are partly a response to this (Chapter 11).

### 2.4.6 Summary of 2.4

The literature on synthetic data supports the claim that quality can beat quantity. It gives filters that catch invalid, duplicate and low-scored examples. It rests on score filters and on public benchmarks. It says little about the hidden faults of agent lessons: a tool call with wrong arguments that still "succeeds", a tool result no real tool returns, a repeated specialist answer, a needless call, a leaked private path or teacher note, and a wrong fact about code. These are the faults that Chapter 6 reports, and the literature leaves them mostly unmeasured.

## 2.5 Test contamination and benchmark leakage

### 2.5.1 What contamination is

A test is only fair if the model has not seen the answers. Contamination, also called leakage, is the case where test items, or close copies of them, are in the training data. A contaminated score measures memory, not skill. The problem is old in the field. The GPT-3 paper (Brown et al., 2020) notes in its abstract that on some datasets the model faces methodological issues related to training on large web corpora. We rely on that abstract only. The point to draw from it is that the concern was present from the early large models, since web-scale training data cannot be checked item by item by hand.

Xu et al. (2024) surveyed the problem as "benchmark data contamination". Their survey reviews how test benchmarks can leak into training data, which can make models look better than they are. It considers evaluation methods that depend less on static benchmarks, and discusses open challenges. The survey is the reference for the general picture. Our concern is a narrower and more local one, a project's own held-out set and its own lesson files.

### 2.5.2 Memorization

Carlini et al. (2022) measured how far language models reproduce parts of their training data word for word when prompted. They report three log-linear relationships: memorization rises with model capacity, with the number of times an example is duplicated in the training data, and with the amount of context in the prompt. They also find that these patterns do not hold across all model families, and that memorization is more prevalent than previously believed.

The result explains why a leak matters even when a test item is only one of thousands. An item that appears word for word in several training files is the kind of item that a model can learn to reproduce. The result also suggests that duplicates make the problem worse, which is a reason to run deduplication together with the leak check. Lee et al. (2021), in Section 2.4, found that deduplication also reduces overlap between training and test sets, which affected over 4% of the validation sets of the standard benchmarks they examined.

### 2.5.3 Exact match is not enough

Yang et al. (2023) argued that the common ways to remove contamination, which rely on string matching such as n-gram overlap, miss benchmark items that have been lightly reworded, translated or otherwise altered. They show that a 13 billion parameter model fine-tuned on such variations can overfit a benchmark and score near GPT-4 levels on MMLU, GSM8K and HumanEval. They propose a decontamination method based on a language model, and they report hidden overlap of roughly 8 to 18% of HumanEval in some pre-training sets. They also find contamination in synthetic data generated by GPT-3.5 and GPT-4.

Two features of this paper match the project's experience. First, synthetic data can itself carry the test. A teacher that has seen a benchmark may write lessons that echo it. Second, exact match undercounts. The project's check counted word-for-word copies and items sharing their first 60 characters. The never-taught gate that guards new plans also checks for test questions inside longer requests and for reworded near copies (Chapter 3). Even so, a rewording that keeps the idea and changes the surface would need the kind of model-based check that Yang et al. propose, and we have not run one.

### 2.5.4 What this thesis adds

The contamination literature is mostly about public benchmarks and pre-training corpora, since those are the hard cases at scale. A small project's held-out set is a different case. It is private, it is cut from the same lessons that train the model, and it moves through many conversion steps. The project held out 5% of lessons by an id hash. A check of 534 held-out tool items against every training-side file found 519 word for word, plus 7 more sharing their first 60 characters. The copies sit in other lesson sets and in the conversation files used for REAP scoring, and the ledger's never-list may drop them at training time (heldout-534 TALLY.md; Chapter 7).

The literature gives us the vocabulary and the warning. It does not give a measure of how much a leak inflates a particular model's scores. For that, a model must be re-scored on leak-free items, and the re-scoring has not been done. The thesis says "not measured" and does not estimate.

## 2.6 Tool use and agents

### 2.6.1 Models that call tools

Schick et al. (2023) introduced Toolformer, a model that teaches itself to use external tools through simple APIs, with only a few demonstrations per API. It decides which tools to call, when to call them, what inputs to give and how to use the results. The tools include a calculator, a question-answering system, two search engines, a translation system and a calendar. The authors report much better zero-shot results, often matching much larger models, without losing general language ability. The idea of self-supervised tool data is the ancestor of the synthetic tool lessons in this thesis.

Yao et al. (2022) proposed ReAct, which interleaves reasoning steps with actions. The reasoning helps the model plan and recover from surprises. The actions let it query outside sources. On question answering and fact checking, they report that ReAct reduces the hallucination and error propagation of chain-of-thought prompting. On two interactive benchmarks, ALFWorld and WebShop, they report absolute success-rate gains of 34% and 10% over imitation and reinforcement learning methods, using only one or two in-context examples. ReAct is the pattern behind most agent loops: think, act, observe, repeat. Bob's agent loop follows that pattern, and Chapter 8 asks what happens to a step when the "think" part is turned on or off.

### 2.6.2 Writing correct calls

Patil et al. (2023) observed that even strong models often produce wrong arguments or invent API usage, and introduced Gorilla, a LLaMA-based model fine-tuned for writing API calls. They report that it surpasses GPT-4 at writing API calls on their benchmark, APIBench, which covers APIs from HuggingFace, TorchHub and TensorHub. With a document retriever, Gorilla adapts to changed documentation at test time and reduces fabricated API use. The finding that hallucinated calls are a main failure is central. It matches the project's own list of faults that scripts miss, including tool calls with wrong arguments that still "succeed".

### 2.6.3 Large collections of tools

Qin et al. (2023) built ToolLLM, with a dataset called ToolBench. It was made with ChatGPT in three steps: collecting 16,464 RESTful APIs across 49 categories from RapidAPI Hub, generating single- and multi-tool instructions, and annotating valid chains of calls. They fine-tuned LLaMA into ToolLLaMA, with a neural retriever that picks APIs, and built an automatic evaluator. They report that it handles complex instructions and unseen APIs, and performs comparably to ChatGPT. ToolBench is the closest published case to Bob's pipeline: a strong model writes tool lessons, and a small model learns them. The difference lies in the checking. The ToolLLM paper's data is checked by the generating pipeline and its search. It was not, as far as the paper's abstract says, re-read in full by a stronger independent reader for the faults that the project found.

### 2.6.4 Evaluating tool use

Patil et al. (2025) introduced the Berkeley Function Calling Leaderboard (BFCL). It tests serial and parallel function calls across several programming languages. It uses an evaluation based on abstract syntax trees, which scales to thousands of functions, and it draws on expert-curated and user-contributed functions and prompts. It also tests whether models can abstain, and whether they can reason in stateful, multi-step agentic settings. The authors report that leading models handle single-turn calls well, while memory, dynamic decision-making and long-horizon reasoning remain open challenges. The benchmark has become a standard for function calling.

BFCL is a public benchmark, and Bob's tool set is not the public one. Bob's models must use Bob's tools, with Bob's names, descriptions and argument layouts. For that reason the project built its own judged tests, with held-out tool turns taken from its lessons (Chapter 4). A public score tells us how a model does on a general task. It does not tell us whether the model will call "write_file" correctly when the app's description of that tool is unclear. The thesis does not replace public benchmarks. It adds a project-local test, and asks how far that test can be trusted.

### 2.6.5 Tool shape

A tool's "shape" is the name, description and argument layout the model sees. The published tool-use work treats shape mostly as given. The benchmark supplies the functions and the model must cope. Our fourth question asks whether shape or lesson content matters more. On GPT-OSS 120B, 264 turns, thinking off, Bob's wording scored 63.3% and every other wording was within about 1 point, inside the 95% range (WORDING.md). The result suggests that, at least for this model and this tool set, rewording is a weak lever. We know of no published study that varies tool wording in this way for a small agent model, and we did not search exhaustively. The claim is limited to what we opened and read.

### 2.6.6 Summary of 2.6

The tool-use literature gives methods to generate tool data, models trained on it, and benchmarks that score it. Its common finding is that hallucinated or malformed calls are the main failure. It gives less attention to the quality of the generated tool lessons themselves, and to the sensitivity of a small model to tool shape.

## 2.7 Reasoning and when thinking hurts

### 2.7.1 Chain of thought

Wei et al. (2022) showed that prompting a language model with worked examples that include intermediate reasoning steps improves its performance on complex tasks. They report that the ability emerges in sufficiently large models, and that a 540 billion parameter model given eight such examples reached state-of-the-art accuracy on GSM8K, a benchmark of math word problems. This is the chain-of-thought result. Newer models are trained to produce such reasoning on their own, and a "thinking" mode is the product. Qwen3 has a thinking mode and a fast mode in one model, with a "thinking budget" that trades latency against answer quality (Yang et al., 2025). The gpt-oss models are reasoning models (OpenAI, 2025).

### 2.7.2 Where it helps

Sprague et al. (2024) reviewed over 100 studies and tested 20 datasets across 14 models. They report that chain of thought yields large gains mainly on math and logic tasks and much smaller gains elsewhere. On MMLU, direct answering performs nearly as well unless the question or response involves symbolic work. They conclude that chain of thought could be applied selectively to save inference cost.

The finding is important to an agent. Many agent steps are not math or logic. They are choices: which tool, with which arguments. If thinking helps mainly with symbolic work, it may give an agent step little and cost it a good deal.

### 2.7.3 Overthinking

Chen et al. (2024) studied "overthinking" in o1-style models, which spend far more compute than needed on simple problems. They propose efficiency metrics that look at compute use from both the outcome and the reasoning process, and they apply a self-training approach that shortens reasoning without hurting accuracy on GSM8K, MATH500, GPQA and AIME. Their title, "Do NOT think that much for 2+3=?", makes the point.

The project's results are on the same side of the question, and they are about tool steps and not math. On GPT-OSS 120B, 264 turns, tool calls with thinking on scored 54.2%, which is 9.1 points worse than thinking off (plus or minus 5.0) (WORDING.md). Bobert showed the same direction, 0.545 with thinking on against 0.591 off, but that study gives no range for this gap (bobert-35bob-tool-study.md, section 2). In Riker's coached steps, 18 tries with thinking on ended at the length limit, against none with thinking off (riker-28bob-tool-interview.md, section 3.2). The agreement in direction with the literature is encouraging. We note that the project's tests are small and single-run, and that we do not claim to have measured the mechanism. We do not know whether the loss with thinking on comes from overthinking, from the length limit, or from a mismatch between the thinking mode and the lessons.

### 2.7.4 Summary of 2.7

Reasoning helps where the task is symbolic, and it costs tokens everywhere. For an agent that must pick a tool on a small card, the cost of thinking is a live question. The literature supports asking it. It does not give an answer for the small, cut, locally run agent models that this thesis studies.

## 2.8 Preference and reward training

### 2.8.1 From human feedback to direct preference

Ouyang et al. (2022) trained InstructGPT in two stages. First, labelers wrote demonstrations, and the model was fine-tuned on them. Second, labelers ranked model outputs, and the model was tuned further with reinforcement learning from human feedback. They report that human raters preferred the outputs of the 1.3 billion parameter InstructGPT to those of the 175 billion parameter GPT-3, with better truthfulness and less toxic output.

Rafailov et al. (2023) proposed Direct Preference Optimization (DPO). It reparameterizes the reward model so that the best policy follows from a simple classification loss on preference pairs. DPO does not sample from the model during fine-tuning, and it needs little hyperparameter tuning. The authors report that it matched or beat PPO-based methods on sentiment control, summarization and single-turn dialogue, while being easier to implement.

### 2.8.2 Group relative policy optimization

Shao et al. (2024) introduced Group Relative Policy Optimization (GRPO) in DeepSeekMath. It is a reinforcement learning method derived from PPO that reduces memory cost. They credit the math ability of their 7 billion parameter model to a careful data selection pipeline and to GRPO. GRPO has since been widely used to train reasoning behaviors from verifiable rewards, though we rely here on the DeepSeekMath paper only for the method's definition and its first use.

### 2.8.3 Relevance and limits

Preference and reward training matter to the thesis in two ways. The project's lesson kit supports preference pairs next to lessons, and the never-taught gate checks both (Chapter 3). So the leak question applies to preference data as well as to lessons. And the quality question applies: a preference pair is only as good as the judgement that picked its winner. The studies in this thesis are of supervised lessons, not of preference or reward training. We did not run DPO or GRPO in the studies reported, and we make no claims about their effect on the faults we found.

## 2.9 Interpretability

Interpretability asks what is going on inside a model. The methods used in Chapter 10 come from five strands of work: features and superposition, sparse autoencoders, steering and refusal directions, persona vectors with emergent misalignment, and activation patching.

### 2.9.1 Features, neurons and superposition

Elhage et al. (2022) studied polysemanticity, where a single neuron responds to several unrelated concepts. In a toy model, they show that a network can store more sparse features than it has neurons by encoding them in superposition. They report a phase change in the model's behavior and a link to the geometry of uniform polytopes. The consequence for interpretability is that a neuron is not a natural unit of meaning. A behavior may be spread over many neurons, and a neuron may take part in many behaviors.

This is the first reason to doubt the "evil neuron" idea. If features are stored in superposition, a trait is unlikely to sit in one neuron.

### 2.9.2 Sparse autoencoders

Bricken et al. (2023) trained sparse autoencoders, a form of dictionary learning, on the MLP activations of a one-layer transformer. The dictionaries ranged from 512 to 131,072 features. Several features, such as those for Arabic script, DNA, base64 and Hebrew, show specific, causally relevant behavior and do not correspond to a single neuron. Human raters and automated tests judged the features more interpretable than neurons. The authors also state limits: their best run recovers about 79% of the MLP's loss reduction, and some polysemanticity may remain hidden at low activations.

Gao et al. (2024) scaled the method. They use k-sparse autoencoders, which set the sparsity directly, and they keep the number of dead latents low. They propose metrics for feature quality and report that these generally improve as autoencoders grow. They trained a 16 million latent autoencoder on GPT-4 activations over 40 billion tokens, and released code and autoencoders for open models.

An autoencoder feature is a candidate for a "single readable part". Our fifth prediction in Chapter 10 tests exactly this: that one feature carries the habit. We report that no autoencoder feature at layers 10, 20 or 30 made plain answers harsher, even pushed to 10 times its usual strength (INTERP-FEATURES.md). The Bricken et al. caveat about incomplete recovery applies. An autoencoder that explains only part of the activations can miss a direction that matters. We do not report how much of the activations our autoencoders explain, because that figure is not in the report files.

### 2.9.3 Steering vectors and representation engineering

Turner et al. (2023) proposed Activation Addition (ActAdd). It takes the difference between the activations produced by a pair of contrasting prompts, such as "Love" and "Hate", to form a steering vector. Adding the vector during the forward pass shifts the output. The authors report state-of-the-art results on sentiment shifting and detoxification, while largely keeping performance on unrelated tasks. The method needs no optimization and works from a single pair.

Zou et al. (2023) proposed representation engineering. It focuses on patterns across populations of neurons and not on single neurons or circuits, and lets researchers monitor and steer high-level concepts such as honesty, harmlessness and power-seeking. The "difference between two sets of activations" idea is the basis of the project's cruel-minus-kind direction. Brain Engine's live steering at 8 times strength matches loading the same vector at 8 times strength (PR #227), which gives the steering tool a basic check.

### 2.9.4 Refusal as a single direction

Arditi et al. (2024) examined refusal in 13 open-source chat models with up to 72 billion parameters. They report that refusal depends on a single direction in the activations. Removing the direction stops the model from refusing harmful prompts, and adding it causes refusals of harmless ones. They used it to build a white-box jailbreak, and suggest that current safety fine-tuning is fragile.

This is the strongest published support for the idea that a behavior can be one direction. It is the reason that we expected a harsh habit to have a simple form. We note that refusal is a particular behavior, strongly shaped by safety training and taught in a focused way. A habit like harshness, which a persona prompt invites, may differ. The thesis does not conclude that refusal is not one direction. Our result is only about the habit that we tested, in the model that we tested.

### 2.9.5 Persona vectors and emergent misalignment

Chen et al. (2025) identified persona vectors, directions in activation space linked to traits such as evil behavior, sycophancy and hallucination. They report that these vectors can track a model's personality shifts during deployment, and that shifts after fine-tuning correlate strongly with movement along them. They can predict and control such shifts, and can flag training data likely to cause them, at dataset and sample level. The extraction method is automated and works for any trait that can be described in natural language.

Betley et al. (2025) reported that fine-tuning a model on a narrow task, writing insecure code without telling the user, can make it act misaligned on unrelated prompts. They call it emergent misalignment. It appeared across several models, strongest in GPT-4o and Qwen2.5-Coder-32B-Instruct. The behavior was inconsistent, since the models sometimes answered aligned. It was absent when the dataset framed the insecure code as a request for a computer security class, and a backdoor version showed it only with a trigger. The authors say a full explanation is left for future work.

Both papers bear on this thesis from the same side. They show that what a model is taught can change its character in ways the lessons do not state, and that a data-level check can find risky training data. That is close to the thesis's central claim, that hidden faults in lessons shape models. The studies differ from ours. They are about alignment-relevant traits in larger or different models, and their data faults are deliberate. Ours are accidental and agent-related, and we run no such persona-vector extraction on lessons. A natural next step, which we mention in Chapter 13 and have not done, is to use persona vectors as a screen on lessons.

### 2.9.6 Activation patching and causal tracing

Meng et al. (2022) used a causal intervention, now called causal tracing, to find the activations that most strongly drive a model's factual predictions. They found a small set of middle-layer feed-forward steps that carry facts while the model processes the subject of a statement, and they edit those weights with ROME. The paper made the middle layers a standard place to look.

Zhang and Nanda (2023) reviewed activation patching, which replaces activations from one run with those from another to find the components responsible for a behavior. Because the literature uses many inconsistent variants, they tested how choices of metric and corruption method change results. In several localization and circuit-discovery experiments, these choices produced noticeably different conclusions. They give best practices.

The patching in Chapter 10 follows this family of methods, with a cruel-minus-kind difference added or removed at chosen layers. Their warning is a direct caution for our use. A patching result depends on the metric and on how the comparison is built. Our tests used 6 asks per test and have about 2 points of noise (INTERP-PATCH.md). The result that adding the difference at its natural size changes nothing, and at three times that size lifts plain answers to 1.7 to 3.5 across most of layers 19 to 29, is therefore a lead, not a proof.

### 2.9.7 Summary of 2.9

The literature offers a pull in two directions. Some work shows that behaviors can be single directions or named features (Arditi et al., 2024; Chen et al., 2025; Bricken et al., 2023). Other work shows that features are spread out and stored in superposition (Elhage et al., 2022), and that the choice of method alters conclusions (Zhang and Nanda, 2023). It is almost silent on mixture-of-experts models. We found no paper among those opened that tests whether a trait sits in a router's choice of experts, or whether a group of experts holds a trait back. Chapter 10 addresses that.

## 2.10 Local inference: llama.cpp and GGUF

llama.cpp is an open-source project for language model inference in plain C and C++ with no dependencies, built on the ggml library. Its stated goal is to run models with minimal set-up and strong performance on a wide range of hardware, locally and in the cloud (llama.cpp project, n.d.). Its page lists backends for Apple Metal, NVIDIA CUDA, AMD HIP, Intel SYCL, Vulkan, and others, along with CPU paths for x86 and RISC-V. It lists integer quantization from 1.5 bits to 8 bits, which cuts memory use and speeds inference. The breadth of hardware support explains why a local app can reach Windows, Mac, Linux and Android users with one engine design.

GGUF is the binary file format used with ggml-based tools. It succeeded the older GGML, GGMF and GGJT formats. It stores a header, metadata as typed key and value pairs (architecture, hyperparameters, tokenizer and general details), tensor information and the tensor data, aligned for memory mapping. The documented goals are single-file deployment, extensibility, mmap compatibility, ease of use and full information in one file (ggml project, n.d.). Models are usually trained in a framework such as PyTorch and then converted to GGUF.

These two pieces matter for the thesis in two ways. First, they set the deployment target. A model that the project makes must be convertible to GGUF and run at useful speed on a 16 GB card. The measured speeds of 82.7, 92.1 and 102.5 tokens per second at 8, 6 and 4 experts per word for full Qwen (experts-per-word-full-qwen-2026-11-04.md) are measured on this kind of stack. Second, the project's Brain Engine is a fork of llama.cpp. It adds an expert switch, steering and tracing to a stack that was built to run models, not to take them apart. Chapter 3 describes what was changed, and what its tests show.

We did not find a peer-reviewed paper for llama.cpp or GGUF among the sources we opened. The two cited pages are project documentation, and we treat them as such. They describe the software as it is, and not as a result that has been independently evaluated.

## 2.11 Gaps this thesis addresses

The review gives a good deal of ground to stand on. It also leaves gaps. We list six. For each we say what the thesis does and what it does not do.

**Gap 1: the hidden faults of synthetic agent lessons are not counted.** Synthetic data work shows that filters and scores can improve a lesson set (Wang et al., 2023; Chen et al., 2023). Tool-use work shows that models can learn from generated tool data (Schick et al., 2023; Qin et al., 2023). We found no study among those opened that reads every lesson of an agent set with a strong model and reports a fault count by kind. Chapter 6 does so for one set: 189 kept of 5,788, with the other verdicts in Section 2.4. It uses one reader model per pass, so the counts are an instrument's reading, not ground truth.

**Gap 2: the link from a lesson fault to a model habit is shown rarely and in small cases.** The persona-vector and emergent-misalignment papers show a link between training data and traits (Chen et al., 2025; Betley et al., 2025). They study alignment traits and deliberate faults. Chapter 5 gives a plain, accidental case in agent behavior: 37% of coding lessons handed work to a tool, and the re-cut Riker, healed on cleaner lessons, scored 9 of 13 on the coding race against 6 for Riker v2. The re-cut also kept 208 experts against 176, so it is one confounded case and one run (FORGE-JOURNAL.md).

**Gap 3: contamination work focuses on public benchmarks, not a project's own held-out set.** The surveys and the rephrasing study set out the problem and the limits of exact match (Xu et al., 2024; Yang et al., 2023). Chapter 7 measures a private case, 519 of 534 leaked, and reports as "not measured" the inflation of past scores. It does not use a model-based check for reworded copies.

**Gap 4: tool shape is treated as given.** Benchmarks supply tool definitions, and models cope (Patil et al., 2025). Chapter 8 varies the wording and finds a weak effect for one model, with a stronger effect from coaching hints that give the exact call. Hints are not lessons, so the lesson-content half is not yet tested. The result is for the models and tool set of one project. The re-test of the new tool shapes (PR #251) has not been run.

**Gap 5: compression is judged by scores, and not by what happens to habits.** Pruning and distillation papers report benchmark results (Muralidharan et al., 2024; Lasby et al., 2025). Chapter 9 asks what a cut keeps and what a heal teaches, with lesson quality in view. It argues for cleaning before cutting. The argument rests on the checked numbers above and not on a controlled experiment, because the decisive retrain on reviewed lessons has not been run.

**Gap 6: the interpretability of expert-routed models is thin on habits.** The literature has single directions and features (Arditi et al., 2024; Gao et al., 2024), but little on whether a group of experts can hold a habit back. Chapter 10 reports a brake of 16 experts. It is a result for one model and one persona prompt, with small tests and a model judge. It raises the risk that an expert-pruning rule, such as REAP, that keeps active experts and removes quiet ones may remove a brake. It does not show that REAP does so, and we did not test REAP on Riker's brake.

The gaps share a theme. Each asks what is really in the data, or in the test, or in the model, instead of what a score says about it. The thesis answers with measurements from one project. It does not claim that other projects will find the same numbers. It does claim that the questions are worth asking before the next round of training.

## References

Arditi, A., Obeso, O., Syed, A., Paleka, D., Panickssery, N., Gurnee, W., and Nanda, N. (2024). Refusal in Language Models Is Mediated by a Single Direction. arXiv:2406.11717. https://arxiv.org/abs/2406.11717

Betley, J., Tan, D., Warncke, N., Sztyber-Betley, A., Bao, X., Soto, M., Labenz, N., and Evans, O. (2025). Emergent Misalignment: Narrow finetuning can produce broadly misaligned LLMs. arXiv:2502.17424. https://arxiv.org/abs/2502.17424

Bricken, T., Templeton, A., Batson, J., Chen, B., Jermyn, A., et al. (2023). Towards Monosemanticity: Decomposing Language Models With Dictionary Learning. Transformer Circuits Thread (Anthropic). https://transformer-circuits.pub/2023/monosemantic-features/index.html

Brown, T. B., Mann, B., Ryder, N., et al. (2020). Language Models are Few-Shot Learners. arXiv:2005.14165. https://arxiv.org/abs/2005.14165

Carlini, N., Ippolito, D., Jagielski, M., Lee, K., Tramer, F., and Zhang, C. (2022). Quantifying Memorization Across Neural Language Models. arXiv:2202.07646. https://arxiv.org/abs/2202.07646

Chen, L., Li, S., Yan, J., Wang, H., Gunaratna, K., Yadav, V., Tang, Z., Srinivasan, V., Zhou, T., Huang, H., and Jin, H. (2023). AlpaGasus: Training A Better Alpaca with Fewer Data. arXiv:2307.08701. https://arxiv.org/abs/2307.08701

Chen, R., Arditi, A., Sleight, H., Evans, O., and Lindsey, J. (2025). Persona Vectors: Monitoring and Controlling Character Traits in Language Models. arXiv:2507.21509. https://arxiv.org/abs/2507.21509

Chen, X., Xu, J., Liang, T., He, Z., Pang, J., Yu, D., Song, L., Liu, Q., Zhou, M., Zhang, Z., Wang, R., Tu, Z., Mi, H., and Yu, D. (2024). Do NOT Think That Much for 2+3=? On the Overthinking of o1-Like LLMs. arXiv:2412.21187. https://arxiv.org/abs/2412.21187

Dai, D., Deng, C., Zhao, C., et al. (2024). DeepSeekMoE: Towards Ultimate Expert Specialization in Mixture-of-Experts Language Models. arXiv:2401.06066. https://arxiv.org/abs/2401.06066

Dettmers, T., Lewis, M., Belkada, Y., and Zettlemoyer, L. (2022). LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale. NeurIPS 2022; arXiv:2208.07339. https://arxiv.org/abs/2208.07339

Dettmers, T., Pagnoni, A., Holtzman, A., and Zettlemoyer, L. (2023). QLoRA: Efficient Finetuning of Quantized LLMs. arXiv:2305.14314. https://arxiv.org/abs/2305.14314

Elhage, N., Hume, T., Olsson, C., et al. (2022). Toy Models of Superposition. arXiv:2209.10652. https://arxiv.org/abs/2209.10652

Fedus, W., Zoph, B., and Shazeer, N. (2021). Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity. arXiv:2101.03961. https://arxiv.org/abs/2101.03961

Frantar, E., and Alistarh, D. (2023). SparseGPT: Massive Language Models Can Be Accurately Pruned in One-Shot. arXiv:2301.00774. https://arxiv.org/abs/2301.00774

Frantar, E., Ashkboos, S., Hoefler, T., and Alistarh, D. (2022). GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers. ICLR 2023; arXiv:2210.17323. https://arxiv.org/abs/2210.17323

Gao, L., Dupre la Tour, T., Tillman, H., Goh, G., Troll, R., Radford, A., Sutskever, I., Leike, J., and Wu, J. (2024). Scaling and evaluating sparse autoencoders. arXiv:2406.04093. https://arxiv.org/abs/2406.04093

ggml project (n.d.). GGUF file format specification. https://github.com/ggml-org/ggml/blob/master/docs/gguf.md

Gunasekar, S., Zhang, Y., Aneja, J., et al. (2023). Textbooks Are All You Need. arXiv:2306.11644. https://arxiv.org/abs/2306.11644

Hinton, G., Vinyals, O., and Dean, J. (2015). Distilling the Knowledge in a Neural Network. NIPS 2014 Deep Learning Workshop; arXiv:1503.02531. https://arxiv.org/abs/1503.02531

Hu, E. J., Shen, Y., Wallis, P., Allen-Zhu, Z., Li, Y., Wang, S., Wang, L., and Chen, W. (2021). LoRA: Low-Rank Adaptation of Large Language Models. arXiv:2106.09685. https://arxiv.org/abs/2106.09685

Jiang, A. Q., Sablayrolles, A., Roux, A., Mensch, A., et al. (2024). Mixtral of Experts. arXiv:2401.04088. https://arxiv.org/abs/2401.04088

Lasby, M., Lazarevich, I., Sinnadurai, N., Lie, S., Ioannou, Y., and Thangarasa, V. (2025). REAP the Experts: Why Pruning Prevails for One-Shot MoE Compression. arXiv:2510.13999. https://arxiv.org/abs/2510.13999

Lee, K., Ippolito, D., Nystrom, A., Zhang, C., Eck, D., Callison-Burch, C., and Carlini, N. (2021). Deduplicating Training Data Makes Language Models Better. ACL 2022; arXiv:2107.06499. https://arxiv.org/abs/2107.06499

Lin, J., Tang, J., Tang, H., Yang, S., Chen, W.-M., Wang, W.-C., Xiao, G., Dang, X., Gan, C., and Han, S. (2023). AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration. arXiv:2306.00978. https://arxiv.org/abs/2306.00978

llama.cpp project (n.d.). LLM inference in C/C++. https://github.com/ggml-org/llama.cpp

Lu, X., Liu, Q., Xu, Y., Zhou, A., Huang, S., Zhang, B., Yan, J., and Li, H. (2024). Not All Experts are Equal: Efficient Expert Pruning and Skipping for Mixture-of-Experts Large Language Models. arXiv:2402.14800. https://arxiv.org/abs/2402.14800

Meng, K., Bau, D., Andonian, A., and Belinkov, Y. (2022). Locating and Editing Factual Associations in GPT. NeurIPS 2022; arXiv:2202.05262. https://arxiv.org/abs/2202.05262

Muralidharan, S., Sreenivas, S. T., Joshi, R., Chochowski, M., Patwary, M., Shoeybi, M., Catanzaro, B., Kautz, J., and Molchanov, P. (2024). Compact Language Models via Pruning and Knowledge Distillation. arXiv:2407.14679. https://arxiv.org/abs/2407.14679

OpenAI (2025). gpt-oss-120b & gpt-oss-20b Model Card. arXiv:2508.10925. https://arxiv.org/abs/2508.10925

Ouyang, L., Wu, J., Jiang, X., et al. (2022). Training language models to follow instructions with human feedback. arXiv:2203.02155. https://arxiv.org/abs/2203.02155

Patil, S. G., Zhang, T., Wang, X., and Gonzalez, J. E. (2023). Gorilla: Large Language Model Connected with Massive APIs. arXiv:2305.15334. https://arxiv.org/abs/2305.15334

Patil, S. G., Mao, H., Yan, F., Ji, C. C.-J., Suresh, V., Stoica, I., and Gonzalez, J. E. (2025). The Berkeley Function Calling Leaderboard (BFCL): From Tool Use to Agentic Evaluation of Large Language Models. ICML 2025, PMLR 267:48371-48392. https://proceedings.mlr.press/v267/patil25a.html

Qin, Y., Liang, S., Ye, Y., et al. (2023). ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs. arXiv:2307.16789. https://arxiv.org/abs/2307.16789

Rafailov, R., Sharma, A., Mitchell, E., Ermon, S., Manning, C. D., and Finn, C. (2023). Direct Preference Optimization: Your Language Model is Secretly a Reward Model. arXiv:2305.18290. https://arxiv.org/abs/2305.18290

Schick, T., Dwivedi-Yu, J., Dessi, R., Raileanu, R., Lomeli, M., Zettlemoyer, L., Cancedda, N., and Scialom, T. (2023). Toolformer: Language Models Can Teach Themselves to Use Tools. arXiv:2302.04761. https://arxiv.org/abs/2302.04761

Shao, Z., Wang, P., Zhu, Q., Xu, R., Song, J., Bi, X., Zhang, H., Zhang, M., Li, Y. K., Wu, Y., and Guo, D. (2024). DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models. arXiv:2402.03300. https://arxiv.org/abs/2402.03300

Shumailov, I., Shumaylov, Z., Zhao, Y., Gal, Y., Papernot, N., and Anderson, R. (2023). The Curse of Recursion: Training on Generated Data Makes Models Forget. arXiv:2305.17493. https://arxiv.org/abs/2305.17493

Sprague, Z., Yin, F., Rodriguez, J. D., Jiang, D., Wadhwa, M., Singhal, P., Zhao, X., Ye, X., Mahowald, K., and Durrett, G. (2024). To CoT or not to CoT? Chain-of-thought helps mainly on math and symbolic reasoning. arXiv:2409.12183. https://arxiv.org/abs/2409.12183

Sreenivas, S. T., Muralidharan, S., Joshi, R., et al. (2024). LLM Pruning and Distillation in Practice: The Minitron Approach. arXiv:2408.11796. https://arxiv.org/abs/2408.11796

Turner, A. M., Thiergart, L., Leech, G., Udell, D., Vazquez, J. J., Mini, U., and MacDiarmid, M. (2023). Steering Language Models With Activation Engineering. arXiv:2308.10248. https://arxiv.org/abs/2308.10248

Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., and Polosukhin, I. (2017). Attention Is All You Need. arXiv:1706.03762. https://arxiv.org/abs/1706.03762

Wang, Y., Kordi, Y., Mishra, S., Liu, A., Smith, N. A., Khashabi, D., and Hajishirzi, H. (2023). Self-Instruct: Aligning Language Models with Self-Generated Instructions. arXiv:2212.10560. https://arxiv.org/abs/2212.10560

Wei, J., Wang, X., Schuurmans, D., Bosma, M., Ichter, B., Xia, F., Chi, E., Le, Q., and Zhou, D. (2022). Chain-of-Thought Prompting Elicits Reasoning in Large Language Models. arXiv:2201.11903. https://arxiv.org/abs/2201.11903

Xu, C., Guan, S., Greene, D., and Kechadi, M.-T. (2024). Benchmark Data Contamination of Large Language Models: A Survey. arXiv:2406.04244. https://arxiv.org/abs/2406.04244

Yang, A., Li, A., Yang, B., et al. (2025). Qwen3 Technical Report. arXiv:2505.09388. https://arxiv.org/abs/2505.09388

Yang, S., Chiang, W.-L., Zheng, L., Gonzalez, J. E., and Stoica, I. (2023). Rethinking Benchmark and Contamination for Language Models with Rephrased Samples. arXiv:2311.04850. https://arxiv.org/abs/2311.04850

Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., and Cao, Y. (2022). ReAct: Synergizing Reasoning and Acting in Language Models. ICLR 2023; arXiv:2210.03629. https://arxiv.org/abs/2210.03629

Zhang, F., and Nanda, N. (2023). Towards Best Practices of Activation Patching in Language Models: Metrics and Methods. arXiv:2309.16042. https://arxiv.org/abs/2309.16042

Zheng, L., Chiang, W.-L., Sheng, Y., et al. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. NeurIPS 2023 Datasets and Benchmarks; arXiv:2306.05685. https://arxiv.org/abs/2306.05685

Zou, A., Phan, L., Chen, S., et al. (2023). Representation Engineering: A Top-Down Approach to AI Transparency. arXiv:2310.01405. https://arxiv.org/abs/2310.01405
# Chapter 3. Building the instruments

## 3.1 Introduction and research question

A claim about training data is only as good as the tools that change a model and the tools that measure it. The studies in this dissertation ask how many faults a lesson set holds, whether those faults become habits in a trained model, and where such a habit sits inside the network (chapter 1). Each question needs a machine that can do something stock software does not. The project built three layers of its own, and this chapter describes them.

The layers are Brain Engine (a patched llama.cpp that can change and watch a mixture-of-experts model while it runs), the Forge (which cuts and teaches models on rented cards under hard caps on hours and dollars) and the Lab scripts (which write lessons, grade answers, sort and clean data).

This chapter asks what each instrument had to do, how it is built, and how far its output can be trusted. Chapter 4 sets the rules for using them.

Three points about status should be clear from the start. First, most checks described here were done on small stand-ins, not on a real large model. Second, several Forge builds were written and checked only by dry run, and the README says so. Third, the never-taught gate (section 3.6.7) shipped in release 1.5.238 on 15 November.

## 3.2 Related systems

### 3.2.1 Serving and running models

llama.cpp is an open-source C and C++ project for running language models locally on CPUs and on NVIDIA, AMD, Intel and Apple hardware. It supports integer quantization from 1.5 to 8 bits and is released under the MIT licence (llama.cpp project page, ggml-org). Brain Engine is built on it. vLLM is a different kind of server, built for high-throughput serving on data-centre cards. Its PagedAttention method stores the attention cache in pages in the way an operating system manages memory (Kwon et al., 2023). The Forge uses it to write lessons on a rented card, where many requests run in parallel.

Neither project was built to change a mixture-of-experts model live. In such a model a learned router sends each word to a few of many expert sub-networks (Shazeer et al., 2017). Mixtral sends each word to two of eight (Jiang et al., 2024), and Qwen3 and gpt-oss use the same family of designs (Yang et al., 2025; OpenAI, 2025). Brain Engine exists because the studies needed to switch experts off, count which fire, and scale them without reloading a 20 GB file.

### 3.2.2 Training and adaptation pipelines

The usual open route to fine-tune a large model is the Hugging Face stack. PEFT trains a small number of extra parameters (PEFT project page), and TRL offers trainers for supervised fine-tuning, DPO, KTO and GRPO (TRL project page). Each implements a published method: LoRA (Hu et al., 2021), DPO (Rafailov et al., 2023), KTO (Ethayarajh et al., 2024) and GRPO (Shao et al., 2024). ORPO folds a preference penalty into ordinary fine-tuning with no second model (Hong et al., 2024).

The Forge does not replace these libraries. It reuses the same published ideas on top of the Transformers library. What it adds is the work a one-person project cannot do by hand: renting a card, moving data, keeping costs under a cap, caching expensive scores, and deleting the card at the end.

### 3.2.3 Cutting and distilling

The Forge removes experts and then teaches the smaller model to match the original. Minitron showed that pruning a large model and retraining it with distillation on a small share of the data can be much cheaper than training each size from scratch (Muralidharan et al., 2024). Classic distillation trains a small model on the soft odds of a large one (Hinton et al., 2015). REAP, the scoring the Forge uses, ranks experts by router gate value and activation norm and argues that pruning beats merging for generative tasks (Lasby et al., 2025). The merge script also offers the linear blend, TIES (Yadav et al., 2023) and DARE (Yu et al., 2023), all off unless a plan asks. This chapter reports no merge results. Representation engineering steers groups of neurons, not single units (Zou et al., 2023); the dials and live control vector serve similar work, reported in chapter 10.

## 3.3 Architecture of the three layers

The layers are used in a fixed order for a new lesson set. The table lists the steps from an idea to a scored model. The step numbers are used in the rest of the chapter.

| Step | Where | What happens |
|---|---|---|
| 1. Idea | PC | A list of lesson ideas, each with a job (`write-lessons.mjs`). |
| 2. Pre-flight | PC | Ideas counted, finished ones skipped, room per slot checked (`forge.mjs`). |
| 3. Sample gate | Card | The first 10 ideas are written; too few saved stops the run with code 86. |
| 4. Write | Card or PC | The teacher writes each lesson from Bob's real prompt and tool list, a second model reviews it, a cut-off lesson gets one retry. |
| 5. Clean | PC | A new version is made; the old one is only read (`clean-lessons.mjs`). |
| 6. Never-taught gate | PC | Every user turn is checked against the test items (`never-gate.mjs`, PR #257, shipped in 1.5.238). |
| 7. Render and split | Card | Token ids with an answer mask; 5% held out by id hash (`pod/data.py`). |
| 8. Teacher pass | Card | Top-32 odds at every answer position, cached under a key (`pod/teacher.py`). |
| 9. Cut | Card | Experts removed by keep list (`prune.py`, `keep.py`, `reap.py`). |
| 10. Heal | Card | LoRA trained against the teacher odds and the real next word (`heal.py`). |
| 11. Export | Card | GGUF files and a brain card (`export.py`). |
| 12. Score | PC or card | Tool score, quiz, coding race, needle test, routing race (`tool-score.mjs` and others). |
| 13. Delete | Card | The card deletes itself when the PC has the files, or at the cap. |

Figure 3.1 is the same flow as a simple diagram. Brain Engine is used in steps 3, 4 and 12 and in the surgery studies. The Forge covers steps 2 to 13. The Lab scripts cover steps 1, 5, 6 and 12.

```
 idea list --> pre-flight --> sample gate --> write + review --> clean
                                                                   |
 score <-- export <-- heal <-- cut <-- teacher odds <-- render <-- never-taught gate
   |
 Brain Engine (live masks, dials, traces) serves the model while it is scored
```

*Figure 3.1. A lesson from idea to scored model.*

Two rules run through all three layers: nothing is rented without the owner's typed yes, under an hours cap and a dollars cap, and every new function is off unless the plan asks (model-lab/forge/README.md).

## 3.4 Brain Engine: a patched llama.cpp

### 3.4.1 What it is and why it exists

Brain Engine is llama.cpp at a pinned tag with fourteen patches applied in order (engine/README.md, ENGINE-MAP.md). At the time of writing the build is Brain Engine 8, on llama.cpp b12359. It is not an official llama.cpp build. The patches change only the model library and the server, with one exception: six patches touch the card-sharing backend of ggml, and no CUDA, Vulkan, Metal or CPU code is changed (ENGINE-MAP.md).

The patches fall into four groups: change a model live (0001, 0003, 0013), watch which parts fire (0002, 0007, 0009, 0010), share a card across machines (0004, 0005, 0006, 0008, 0011, 0014), and one small helper (0012). Only the first two matter for the studies.

### 3.4.2 Patches that change the model live

**0001, expert mask.** A new adapter, `llama_adapter_emask`, sits next to the control-vector adapter and holds one keep-row per layer. In the expert-layer builder, a very large negative number is added to the router logits of every switched-off expert before the top-k pick, so they are never chosen (ENGINE-MAP.md). The server exposes `GET` and `POST /expert-mask`, and refuses a mask narrower than the number of experts each word uses. It was needed to test a keep list without cutting a file. Placing the mask before the pick matters: a mask after the pick would silently change the weights.

**0003, dials.** A dial multiplies what one part adds to the stream, which is the same as scaling that part's output weights. The part can be one expert, one attention head, or a layer's attention or feed-forward block. A scale of 1 is as built, 0 is silent, and the maximum is 8. Switching off is a blunt test, and the evil-check and sweep scripts also turn parts up (chapter 10). A known risk is that a change to the head layout upstream would make the dial scale the wrong slice without failing loudly (ENGINE-MAP.md).

**0013, experts per word.** The model's own count (8 for Qwen3, 4 for gpt-oss) can be replaced live, per layer. The graph is rebuilt and the scheduler's memory laid out again before the call returns. A count that does not fit is refused and the old count restored. It was needed for the experts-per-word test, which compares 8, 6, 4, 3 and 2 on one file (docs/forge-runs/benchmarks/experts-per-word-full-qwen-2026-11-04.md). Without it, each setting is a separate load.

### 3.4.3 Patches that watch the model

**0002, expert trace.** A request with `expert_trace: true` returns the experts picked in every layer for every token. For a model without experts it reports the eight busiest of 256 neuron groups per layer instead (engine/README.md). The per-job and per-style maps of which experts a skill leans on come from this trace (model-lab/trace-read.mjs). One limit: the trace is dropped for every request when two share a batch, so the reading script runs one request at a time (model-lab/trace-read.mjs).

**0007, trace stream.** Each streamed piece of a reply carries the trace rows since the last piece, at most 64 per piece, so cost stays flat as the prompt grows. On a test build it was no slower than the trace alone at 32,000 and 128,000 tokens of prompt (engine/README.md).

**0009, expert mass.** With `expert_trace_mass`, the trace also reports, for every layer and expert, the sum of the router weight times the size of what the expert wrote. This is the numerator of the REAP score (Lasby et al., 2025). It lets a home scan produce the same numbers the Forge's `reap.py` produces on a rented card.

**0010, trace once.** With 0002 alone, a traced request stopped after every layer to copy the picks out, 40 to 48 stops a word. On a consumer card this cost about a fifth of word speed: 122.7 words a second fell to 99.2 (engine/README.md). The patch keeps each layer's picks on the card and fetches them together with one wait. The trace returned is the same, row for row.

### 3.4.4 Card sharing and the small helper

Patches 0004, 0005, 0006, 0008, 0011 and 0014 let one model spread over the cards of several computers. Patch 0004 offers a hash for every weight over 1 MiB, so a lent card that already has a weight skips the copy. Patch 0005 is SCUT, an experimental UDP link. Over a simulated Wi-Fi of 3 ms delay and 1% loss it raised speed from about 9 to about 15 words a second, with byte-identical output (engine/README.md). Patches 0006, 0008, 0011 and 0014 add signed packets, a link log, one trip a word and a frozen wire numbering. None is used in the studies. A numbering clash should be noted: the Forge's pod patch `0014-live-control-vector` adds a live steering vector, and only the neuron sweep uses it (section 3.6.6).

### 3.4.5 How Brain Engine was verified

The checks differ in strength, and the list is ordered from strongest to weakest.

- **Byte-identical output.** With no expert switched off, the expert-mask build gives the same bytes as the normal engine (Brain Engine PC trial, 8 November, on the 35B model; checked-numbers.md).
- **Live steering equals loading.** Steering at x8 live matches loading the same vector at x8. Sending an empty setting restores the same words as before (PR #227; checked-numbers.md).
- **Per-layer test for 0013.** `engine/tests/experts-per-word.py` builds a tiny model and compares the live setting with the engine's own override flag, layer by layer through the trace, and checks the refusals (ENGINE-MAP.md).
- **Cross-build card sharing for 0014.** `engine/tests/rpc-any-version.sh` runs a model with every layer on a lent card in all four old and new pairings. All four matched a local run word for word, on a tiny llama model with CPU builds on Linux, 15 November 2026 (ENGINE-MAP.md).
- **Timing.** On the full Qwen, 8, 6 and 4 experts per word ran at 82.7, 92.1 and 102.5 tokens a second (docs/forge-runs/benchmarks/experts-per-word-full-qwen-2026-11-04.md). This describes the model, not the cost of the patch.

### 3.4.6 What Brain Engine does not have

No patch is tested automatically against a real engine build. Placement errors are the dangerous kind: a mask after the top-k pick, or a dial on the wrong head slice, still builds and gives wrong answers without an error, and would show up only in the PC test (ENGINE-MAP.md). The map proposes a short engine test on a tiny mixture-of-experts file (mask, trace rows, dials against mask, card handshake, SCUT off). It is proposed and not built.

There are no clean overhead numbers per patch. Only a few patches have any timing, and none was taken in the full study configuration. The dissertation therefore makes no claim about what the patches cost in speed: not measured.

A weekly workflow replays the patches on the newest llama.cpp tag and opens an issue when they apply and build (engine/README.md). It checks that the patches go on, not that they are correct.

## 3.5 The Forge: a rental training pipeline

### 3.5.1 Purpose and shape

A 35-billion-parameter model cannot be cut and healed on a home 16 GB card. Renting by the hour is affordable only if a failed run cannot keep billing, so the Forge is built around cost controls and the training code is the smaller part.

It has a PC side and a pod side. The PC side, `forge.mjs`, shows the caps, asks the owner to type yes, rents one card, sends the scripts and lessons, watches the pod every minute, downloads each finished model, and deletes the card. The pod side starts a tiny upload and download door (`pod/bootstrap.py`), then runs `pod/run.sh`, driven by a plan file. The pod also deletes itself 8 minutes before the hours cap, in case the PC side has died (model-lab/forge/README.md).

### 3.5.2 Pod scripts

The pod scripts do these jobs. `teacher.py` records the full model's top-32 next-word log-probabilities at every answer position. `data.py` renders lessons and holds out 5% by id hash. `prune.py`, `keep.py`, `count.py` and `countskills.py` count which experts each skill uses, build a keep list that covers every skill, and cut the model by slicing weight bytes. `reap.py` scores experts by router weight times output size. `heal.py` and `lora.py` train a LoRA on every linear layer, the experts and the router. `pref.py`, `grpo.py` and `onpolicy.py` add preference pairs (ORPO, DPO, KTO), a reward pass and on-policy teaching, each off unless the plan asks. `merge.py`, `fold.py` and `surgery.py` blend, fold or bake in a tested change. `export.py` and `rebuild.py` write GGUF files and brain cards and rebuild a model from its keep list and adapter. `family.py` separates Qwen from GPT-OSS, and two self-test scripts dry-run everything on tiny models.

### 3.5.3 Data flow

`data.py` renders each lesson with the model's chat template, tools and thinking included, and marks as answer tokens everything between each assistant start and its end token. GPT-OSS needed its own path, since its harmony format ends an answer at an end, call or return token (model-lab/forge/README.md, Build 23).

The teacher pass runs the full model once over every lesson and stores, for each answer position, 32 word ids and their log-probabilities. The heal then needs no copy of the teacher in memory. The loss is 0.7 times the KL divergence from the teacher's top-32 odds plus 0.3 times the cross-entropy on the real next word, on answer tokens only (docs/MAKING-SMALLER-MODELS.md). This follows the classic soft-target idea of Hinton et al. (2015) and the prune-then-distil recipe of Muralidharan et al. (2024). A fixed share of general text (public web text and public chat data) is mixed into the teacher pass, the heal and the expert counts, so the cut model keeps general knowledge (model-lab/forge/README.md).

### 3.5.4 Caps, gates and cost controls

The Forge has five kinds of control. Both **caps** are read from the plan file every minute and count from the rent, also after a restart. **Self-delete** ends every run type: the pod waits for the PC's finished signal or a grace period, then deletes, with a time-cap watchdog behind it. **Pre-flight** runs in code before renting (section 3.6.2). The **sample gate** stops a run with exit code 86 if a small first batch saves too few lessons. **Card health** logs every start-up by card type and data centre; a pod that never answers is deleted and rented again with that type left out, and a type with 2 freezes in 7 days and no good start since goes to the back of the list (model-lab/forge/README.md).

A network volume holds the teacher weights, general text, compiled tools and every adapter, and a card is rented only in a data centre that has one.

### 3.5.5 The teacher-odds cache

A teacher pass over the lesson set can take hours. The first v3 pass took 125 minutes and was lost when the card was deleted (docs/FORGE-JOURNAL.md). The fix was to key the scores. The key is a 16-character hash of the merged lesson file, the tool sets, the teacher, the number of top words, the maximum length and the general-text budget. Scores and tokenised lessons are saved under that key on the volume and the PC, and a later run with the same lessons skips the pass.

The key includes the teacher's adapter hash when the teacher was itself trained, so stock-teacher and trained-teacher scores never mix. A cut model healed toward the wrong odds is pulled toward a brain that no longer exists. Build 16 made the merged lesson file byte-identical whether a set was written on the card or uploaded, so the key is the same either way. Bill reused Bobert's saved odds and skipped about six hours of card time (docs/MAKING-SMALLER-MODELS.md).

### 3.5.6 The failures that shaped it

COSTS.md lists every rental, failures included. At the time of writing it records eleven failed paid attempts, costing $22.40, inside a total of $484.39 and about 105 hours of card time (docs/COSTS.md). Two of the eleven are marked estimated, not yet billed. The failures that changed the design are these.

| Failure | Change made |
|---|---|
| Attempts 1 to 3 (4 Nov): no git on the image, a quantizer that would not run, a teacher server that died and a template that skipped 45% of tool-call lessons | Plain HTTP fetch, background tool builds, in-process teacher scoring. |
| Clock-capped heals (5 Nov): Riker v1 completed 195 of 456 steps, Bill v1 163 of 456 | A full pass or nothing. |
| Attempt 4 (6 Nov): new skill jobs had weight zero and wrote nothing | A job with no weight gets a share of 1. |
| Plan-reader bug (7 Nov): an empty argument ended the run; the full-precision model and 2.5 h of scores went with the pod | Scores cached under a key; a card is rented only where a drive is. |
| Idle card (10 Nov): the PC's window was closed and the card billed about $11 of idle time | Every run type ends with the card deleting itself. |
| False start (9 Nov): a card was taken where the adapter was not; $0.40 lost | A rebuild run never makes a drive. |
| Start-up freezes (14 Nov) | Card health log and re-rent with the type left out. |

One failure deserves a longer note, because it is the same kind of fault the dissertation studies. For several runs, Qwen's linear-attention layers silently used a slow fallback. A `pip install` of the fast kernels reported success, but the compiled module failed to import because it had been built against a different PyTorch, and Transformers quietly fell back. Building against the image's own PyTorch and refusing to start until the kernels import fixed it. Bobert's full pass then took about 10.3 hours instead of about 16 (docs/FORGE-JOURNAL.md). The fault cost time; a comparable fault in lessons costs quality.

### 3.5.7 GPT-OSS as a second family

Build 23 extended the Forge to GPT-OSS for the studies of the 120B and its 38B cut (model-lab/forge/README.md). `family.py` reads `config.json` and picks the model class, router module and stop tokens. The teacher keeps its MXFP4 weights when the card allows, and a student is always unpacked to BF16, since MXFP4 cannot be trained. Lessons use the harmony template, and LoRA is applied per expert in GPT-OSS's own layout. GRPO, fold, surgery and merge are skipped for GPT-OSS. The 38B heal plan exists but is not approved; it needs the owner's typed go.

### 3.5.8 How the Forge was verified

`pod/selftest_training.py` builds a tiny Qwen-style mixture-of-experts model on a CPU in about a minute, downloads nothing, and runs the teacher, heal, ORPO, DPO, KTO, on-policy, GRPO and merge steps as separate processes. It checks each writes its report and that the merge maths is right. The script says it proves the code runs end to end, not that it helps. `pod/selftest_gptoss.py` does the same for GPT-OSS. Other checks were on made-up data: `keep.py` for each scoring mode, the REAP scorer against a brute-force sum, and a prune then fold on a tiny model (README, Builds 20 and 21). The merged lesson file gave the same bytes from two folders with different names (Build 16). The Python and JavaScript tool judges are checked against one case file (`pod/tool_reward_cases.json`).

Not verified: several builds are marked "untested on a card", and a first paid run of new code is its test. The hook on the real model's expert module for REAP was untested until a run. Whether a folded and healed model beats a dropped and healed one is stated as unknown.

## 3.6 The Lab scripts

### 3.6.1 Overview

The scripts in `model-lab/*.mjs` run on the home PC or against a served model. They write lessons (`write-lessons.mjs`, `calib-prep.mjs`), clean and sort them (`clean-lessons.mjs`, `make-datasets.mjs`, `make-pairs.mjs`), judge answers (`tool-score.mjs`, `tool-judge.mjs`, `experts-test.mjs`, `loop-test.mjs`), probe tool use (`tool-wording.mjs`, `tool-coach.mjs`, `tool-interview.mjs`), look inside (`trace-read.mjs`, `expert-sweep.mjs`, `job-presets.mjs`, `evil-check.mjs`, `evil-sweep.mjs`), and gate or scrub (`smoke-gate.mjs`, `scrub-data.mjs`, `stamp-condition.mjs`).

### 3.6.2 Writing lessons and the pre-flight

`write-lessons.mjs` has the teacher write every lesson as a real Bob turn: Bob's own system prompt and tools, neutral names and a throwaway settings folder, so nothing from anyone's own chats or files goes in. Tool results are played by the teacher and nothing is run. A second pass reviews each lesson, and a failed lesson is retried once with the reviewer's reason shown to the writer. The reject is kept in a separate file as the wrong side of a possible preference pair.

The pre-flight runs in code before any rental. On the failed run lkt-fix3 it counted 211 rows in the ideas file, found 94 written and 117 to go, and checked the room per slot: 32,768 tokens, from a longest first request of about 10,838 tokens plus 16,384 to grow (forge-lkt-fix3-console.log).

### 3.6.3 The sample gate working

On lkt-fix3 the first 10 ideas were written and at least 6 had to be saved. Only 1 of 10 saved: 5 failed review twice, 2 had unreadable reviews, 1 ran out of steps and 1 ran out of room. The run stopped with exit code 86 and the card was deleted after about $0.31 (forge-lkt-fix3-console.log; checked-numbers.md). The gate is blunt. It cannot say whether the writer, the reviewer or the tool shape was at fault. It only says to look before paying more.

`smoke-gate.mjs` is the second gate. It checks whether the teacher odds cover the thinking words, whether enough lessons passed review and every tool-call argument parses, and whether the server can trace a finished lesson. A failure of the last two exits with code 86 (model-lab/smoke-gate.mjs).

### 3.6.4 Judging scripts

`tool-score.mjs` replays held-out lessons turn by turn with the full history, Bob's real system prompt and the tools loaded at that moment. Each assistant turn is one question. A turn is right if it makes the same tool calls with every recorded argument matching, or correctly makes no call. `tool-judge.mjs` holds that rule, and `pod/tool_reward.py` mirrors it for GRPO. Free-text arguments need only overlap by 60% (pod/tool_reward.py). The script states that the original answers came from the full Qwen3.6 itself, so the score measures agreement with the teacher, not truth (model-lab/tool-score.mjs). Chapter 4 returns to this.

`loop-test.mjs` runs the tool quiz through Bob's real turn loop with fake tools, since a bare first answer cannot show what the loop does next.

### 3.6.5 Probing scripts

`tool-wording.mjs` asks the same judged questions with different tool wordings and thinking modes and writes paired gaps against Bob's own wording. `tool-coach.mjs` walks a lesson step by step and, after a miss, gives up to three hints: a nudge, the tool name, then the exact call. `tool-interview.mjs` shows a model its own misses and its own saved thinking and asks why. The explanation is a lead, not proof. All three parse tool calls and never run them, and their output is evidence only, never training data.

### 3.6.6 Looking inside

`evil-check.mjs` is a measure-only check for a cruel direction. It reads the same asks under a cruel persona and under Bob's plain prompt, compares expert and head traces, turns candidates down with live dials, and has the model rate its own answers. It offers no tools. `evil-sweep.mjs` covers experts through dials and single neurons through the live control vector, using random halves in each layer. Each half and its complement are tested, so every unit is in exactly half of the mixes with different partners. A unit's effect is the mean harshness of mixes it was in minus mixes it was not in. The output is a surgery record only (model-lab/evil-sweep.mjs).

### 3.6.7 Cleaning, scrubbing and the never-taught gate

`clean-lessons.mjs` writes a new version of the lesson sets and only reads the old one. It drops lessons that call a tool their own list does not offer and repeated first prompts in the same thinking mode, and it keeps held-out lessons whatever their faults. v3 to v4 reduced 9,059 lessons to 8,992 (model-lab/forge/README.md). This is a different pass from the first cleaning in chapter 4, which took 9,059 to 8,828 (docs/MAKING-SMALLER-MODELS.md).

`scrub-data.mjs` replaces private details on a copy of any data that leaves the PC, then checks again and refuses to finish when anything is left. It was rewritten after a real miss, described in chapter 4.

The never-taught gate, `never-gate.mjs`, checks every user turn of a plan's lessons and preference pairs against the quiz items and the never-taught list. It counts exact copies, test questions inside longer requests and reworded near copies. `forge.mjs` runs it before renting and stops the plan on any match or a missing test file. It is tested on fakes (18 checks) in PR #257, stacked on the lesson kit in PR #254. Both shipped in release 1.5.238 on 15 November, which passed its Windows test (276 of 276) in its lab-PC check. Before that release the only guards were `notForTraining()` and a check in `src/lab-runs.js`. The file was not in the older checkout first read for this chapter; its behaviour is taken from the PR description and the file's header on main.

### 3.6.8 How the Lab scripts were verified

- **A planted cause.** The sweep found a planted cruel expert and a planted cruel neuron on a made-up server. This shows it can find a known cause, not that one exists in a real model.
- **Home-side dry runs.** Every home-side command runs against a stand-in server, with a folder name that has a space in it, before a card is rented. Three benchmark failures in a row came from home-side bugs.
- **A retracted result.** An early steering push seemed to drive hostility. Every strength actually made the model loop one word, often in Chinese, and the old judge rated loops as harsh. The claim was withdrawn, and the judge now counts loops and wrong-language text as broken (riker-28bob-tool-interview.md, section 5).
- **Condition stamps.** Saved answers carry the condition they were made under; an unmarked model is never called stock.

## 3.7 Discussion

The instruments were made because the questions demanded them: the mask, dials, experts-per-word and trace patches map one-to-one onto the experiments in chapters 5 to 10. The Forge's cost controls matter as much as its training code, since every costly mistake in section 3.5.6 came from a quiet default or a missing guard. And instruments fail like lesson sets fail: a fast-kernel fallback, a template that skipped 45% of tool lessons and a judge that rated loops as harsh each looked normal from outside. That is the theme of this dissertation and the reason for the gates in chapter 4.

## 3.8 Threats to validity and limits

- **Small stand-ins.** The strongest Brain Engine checks used tiny models, CPU builds or one trial on a 35B model. They show the code does what it claims, not that the instruments are unbiased on a real large model.
- **No automatic engine test.** A patch in the wrong place would be found only by the PC test.
- **Dry runs prove running, not helping.** The self-tests say so themselves, and most Forge builds after build 14 had no card test when the README was written.
- **Overhead not measured.** No clean with-and-without timing exists for the patches the studies use.
- **One builder.** The code was written and checked inside one project, with an AI assistant as a contributor (docs/COSTS.md). No outsider has reviewed it.
- **Judge limits.** The tool judge measures agreement with the teacher, and is blind to a call that is right in a way the teacher did not record.
- **Status.** The never-taught gate shipped in release 1.5.238. The decisive retrain on reviewed lessons has not been run, so no instrument here has yet been used on the lessons the dissertation finally recommends.

## 3.9 Summary

Three layers of instruments were built. Brain Engine adds live masks, dials, experts-per-word and traces to llama.cpp with fourteen patches. The Forge cuts and teaches models on rented cards under caps, with a pre-flight, a sample gate, a teacher-odds cache and a self-delete. The Lab scripts write, judge, clean and probe. Each was verified on a small stand-in, and the chapter lists what is not verified. The costliest lessons of the build were quiet defaults, including a silent slow kernel: with the fast kernels, Bobert's full pass took about 10.3 hours instead of about 16. The rules that came from them are the subject of chapter 4.

## References

- Hinton, G., Vinyals, O., and Dean, J. (2015). Distilling the Knowledge in a Neural Network. arXiv:1503.02531. https://arxiv.org/abs/1503.02531
- Hong, J., Lee, N., and Thorne, J. (2024). ORPO: Monolithic Preference Optimization without Reference Model. arXiv:2403.07691. https://arxiv.org/abs/2403.07691
- Hu, E. J., Shen, Y., Wallis, P., Allen-Zhu, Z., Li, Y., Wang, S., Wang, L., and Chen, W. (2021). LoRA: Low-Rank Adaptation of Large Language Models. arXiv:2106.09685. https://arxiv.org/abs/2106.09685
- Ethayarajh, K., Xu, W., Muennighoff, N., Jurafsky, D., and Kiela, D. (2024). KTO: Model Alignment as Prospect Theoretic Optimization. arXiv:2402.01306. https://arxiv.org/abs/2402.01306
- Jiang, A. Q., Sablayrolles, A., Roux, A., et al. (2024). Mixtral of Experts. arXiv:2401.04088. https://arxiv.org/abs/2401.04088
- Kwon, W., Li, Z., Zhuang, S., Sheng, Y., Zheng, L., Yu, C. H., Gonzalez, J. E., Zhang, H., and Stoica, I. (2023). Efficient Memory Management for Large Language Model Serving with PagedAttention. arXiv:2309.06180. https://arxiv.org/abs/2309.06180
- Lasby, M., Lazarevich, I., Sinnadurai, N., Lie, S., Ioannou, Y., and Thangarasa, V. (2025). REAP the Experts: Why Pruning Prevails for One-Shot MoE Compression. arXiv:2510.13999. https://arxiv.org/abs/2510.13999
- Muralidharan, S., Sreenivas, S. T., Joshi, R., Chochowski, M., Patwary, M., Shoeybi, M., Catanzaro, B., Kautz, J., and Molchanov, P. (2024). Compact Language Models via Pruning and Knowledge Distillation. arXiv:2407.14679. https://arxiv.org/abs/2407.14679
- OpenAI (2025). gpt-oss-120b and gpt-oss-20b Model Card. arXiv:2508.10925. https://arxiv.org/abs/2508.10925
- Rafailov, R., Sharma, A., Mitchell, E., Ermon, S., Manning, C. D., and Finn, C. (2023). Direct Preference Optimization: Your Language Model is Secretly a Reward Model. arXiv:2305.18290. https://arxiv.org/abs/2305.18290
- Shao, Z., et al. (2024). DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models (introduces GRPO). arXiv:2402.03300. https://arxiv.org/abs/2402.03300
- Shazeer, N., Mirhoseini, A., Maziarz, K., Davis, A., Le, Q., Hinton, G., and Dean, J. (2017). Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer. arXiv:1701.06538. https://arxiv.org/abs/1701.06538
- Yadav, P., Tam, D., Choshen, L., Raffel, C., and Bansal, M. (2023). TIES-Merging: Resolving Interference When Merging Models. arXiv:2306.01708. https://arxiv.org/abs/2306.01708
- Yang, A., et al. (2025). Qwen3 Technical Report. arXiv:2505.09388. https://arxiv.org/abs/2505.09388
- Yu, L., Yu, B., Yu, H., Huang, F., and Li, Y. (2023). Language Models are Super Mario: Absorbing Abilities from Homologous Models as a Free Lunch (DARE). arXiv:2311.03099. https://arxiv.org/abs/2311.03099
- Zou, A., Phan, L., Chen, S., et al. (2023). Representation Engineering: A Top-Down Approach to AI Transparency. arXiv:2310.01405. https://arxiv.org/abs/2310.01405
- llama.cpp project page (ggml-org), MIT licence. https://github.com/ggml-org/llama.cpp
- PEFT: Parameter-Efficient Fine-Tuning library (Hugging Face). https://github.com/huggingface/peft
- TRL: Transformers Reinforcement Learning library (Hugging Face). https://github.com/huggingface/trl
# Chapter 4. Method and rules

## 4.1 Introduction and research question

This chapter sets out how the studies were run and the rules the project adopted for itself. Each rule exists because a past result was wrong, wasted money or could not be trusted. Together they matter more than any single number in chapters 5 to 10.

The chapter serves all five research questions (chapter 1) but is closest to the third: how much do leaked test items distort the scores used to make decisions? A leak is a method fault. It cannot be seen in a result table. It can only be found by checking how the test and the lessons were made. For that reason the method is reported in full, including the parts that went wrong.

The chapter has four aims. First, to state the models, settings and benchmarks. Second, to describe the judges and their known faults. Third, to list the gates, caps and data rules. Fourth, to say plainly what the statistics can and cannot support. Section 4.12 collects the threats to validity.

## 4.2 Related work on evaluation method

### 4.2.1 Contamination and leaked tests

Benchmark scores are only meaningful if the model has not seen the test. Sainz et al. (2023) argue that contamination must be measured for each benchmark and each model, not assumed away. Golchin and Surdeanu (2023) describe a method that detects whether a model has seen test data, at the level of single examples and whole partitions. Magar and Schwartz (2022) ask whether seen data is memorised or actually exploited, by comparing performance on seen and unseen examples. Jacovi et al. (2023) propose practical defences, such as encrypting public test sets and asking providers for training-exclusion guarantees.

Most of this work concerns web-scale pre-training, where the question is whether a test appeared somewhere in the crawl. The leak in this dissertation is a smaller and more direct one. The test items were written by the same pipeline as the lessons, and copies of them sat in training-side files. Lee et al. (2021) show a related fact: standard text datasets hold many duplicated passages, and removing them changes what models memorise. The rules in sections 4.6 and 4.7 follow the same idea, that overlap between the test and the training side must be searched for and not assumed absent.

### 4.2.2 Faults in test sets and in judges

Northcutt et al. (2021) found that widely used test sets contain many mislabelled examples, enough to change benchmark rankings. This applies directly here. The 534 held-out tool items were themselves sorted for faults (section 4.7), and most carried one. Zheng et al. (2023) show that a language model used as a judge agrees with human preferences about as often as humans agree with each other, and also report position, verbosity and self-enhancement biases. Panickssery et al. (2024) find that evaluators can recognise and favour their own generations. Both bear on this work, because the teacher that wrote the lessons also wrote the answers that the tool score treats as correct.

### 4.2.3 Statistics for small evaluations

Dror et al. (2018) survey how to choose a significance test in natural language processing, and Card et al. (2020) show that many NLP comparisons lack the power to detect the differences they claim. Miller (2024) recommends that evaluation questions be treated as a sample from a larger population and that results carry error bars, with paired comparisons where the same questions are used in both conditions. The studies here use paired differences with a 95% range for this reason (section 4.10).

### 4.2.4 Tool-use evaluation

Tool use is studied with training sets and benchmarks. Toolformer teaches a model to call tools in a self-supervised way (Schick et al., 2023). Gorilla fine-tunes a model to write API calls and pairs it with a retriever to reduce invented calls (Patil et al., 2023). ToolLLM builds a large tool-use dataset from real APIs and an automatic evaluator (Qin et al., 2023). These works measure whether a model can call tools from a given library. This dissertation asks a different question: whether the lessons that taught a small model its tool habits carried faults, and whether cleaning them changes the habits. The tool score used here is therefore tied to Bob's own tools and uses a recorded teacher answer as its reference.

## 4.3 Models and settings

### 4.3.1 The models

The studies use these models.

| Name | What it is |
|---|---|
| Full Qwen | Qwen3.6-35B-A3B, the stock model and the lesson teacher (docs/FORGE-JOURNAL.md). |
| Bobert (35Bob) | The full model trained on every lesson, with all 256 experts. |
| Riker (28Bob) | Cut from the full model to 208 of 256 experts per layer, then healed. |
| Bill (20Bob) | Cut from Bobert to 144 experts per layer, then healed against Bobert's odds. |
| GPT-OSS 120B | OpenAI's open mixture-of-experts model (OpenAI, 2025), used as a second family. |
| GPT-OSS 38B cut | A REAP cut of the 120B, unhealed in the coaching study. |

The Qwen family is described in Yang et al. (2025). The cut models were made by the Forge (chapter 3).

### 4.3.2 Serving settings

Home benchmarks run on the owner's 16 GB card with Q4 files and 8 experts per word, with the same settings for every model in a comparison (docs/FORGE-JOURNAL.md, 8 November entry). Rented-card benchmarks serve the same Q4 files through Brain Engine with the same test scripts, so that home and rented numbers come from identical tests (model-lab/forge/README.md, Build 18). Where a study changed a setting, such as experts per word, a mask, or a dial, the saved answers carry the condition (section 4.9).

The Bobert wording study ran on a rented 48 GB A40 with 8 slots of 8,192 tokens each. The planned switch to 4 slots of 16k never happened, so 11 to 13 long turns per round overflowed their slot, and 11 to 31 answers per round were cut off at the length limit. Both kinds were scored as wrong, and the same turns were affected in every condition, so comparisons between conditions stay fair, but absolute scores are lower than they would otherwise be (bobert-35bob-tool-study.md).

## 4.4 Benchmarks

Each benchmark answers a different question. The table gives each one's size and what it measures. Chapters 5 to 9 report the results.

| Benchmark | Size | What it measures | Source |
|---|---|---|---|
| Tool score | 314 held-out turns from 196 conversations | Whether the model makes the same tool decision as the full Qwen did, replayed turn by turn with the full history, Bob's real prompt and the tools loaded at that moment | model-lab/tool-score.mjs; FORGE-JOURNAL.md |
| Quiz: tool phrasings | 97 questions | Picking the right tool for a plain request | experts-test.mjs |
| Quiz: facts | 20 questions | Short facts | experts-test.mjs |
| Quiz: code | 6 tasks, run and checked | Small coding jobs | experts-test.mjs |
| Coding race | 13 tasks, one try each | 10 Python tasks scored by hidden unit tests and 3 multi-step tool chains with pretend tools | BRAIN-RACES.md |
| Needle test | 12 cases | One fact placed at 25, 50 and 75% depth in 8K, 32K, 64K and 128K windows | FORGE-JOURNAL.md |
| Routing race | 17 or 25 jobs (two sets) | Which brain should take a job | BOBS-OWN-MODELS.md |
| Wording A/B | 264 judged turns per condition (from 308 questions) | Paired gaps between tool wordings and thinking modes | tool-wording.mjs |
| Coached steps | 83 steps | Steps a model gets right on its first try, and with up to three hints | tool-coach.mjs |

The tool score uses 5% of the lessons that the Forge holds out of training, by the same id hash as the training code. Every assistant turn is one question. Grading counts a turn as right if it makes the same tool calls as the recorded answer with every recorded argument matching, or correctly makes no call. "Right tool" counts the right tools with any arguments (model-lab/tool-score.mjs).

The full Qwen scored 211 of 314 (67%), including 72 of 123 for the right tool and 167 of 191 for correctly making no call (docs/FORGE-JOURNAL.md, 5 November table). Riker v1 and Bill v1 scored 206 and 205. These are the reference numbers that later comparisons use.

The wording A/B uses a different question set. It draws on 308 lesson turns across 14 jobs from held-out and reserved calibration lessons, never from training lessons. Of these, 264 were judged in every condition (bobert-35bob-tool-study.md). The two sets must not be mixed. The 314-turn tool score and the 264-turn wording study are different instruments with different reference numbers.

The coached steps are 83 steps taken from the lessons a model missed in the wording study. Each step gives up to three hints after a miss: a nudge, the tool name, then the exact call. The model then moves on along the lesson's own right path, so the next step is judged from a correct state (model-lab/tool-coach.mjs).

## 4.5 Judges and their faults

### 4.5.1 The tool judge

The tool judge is a rule, not a language model. A turn is right if it has the same tool names as the teacher's recorded answer and every recorded argument matches. Extra optional arguments are fine, and long free text needs only to overlap (60% in the Python version used for the reward pass). The Python and JavaScript versions are checked against one shared case file (model-lab/forge/pod/tool_reward.py).

This judge has a clear limit that every report repeats. The recorded answers came from the full Qwen3.6, so the score measures agreement with the teacher and not truth (model-lab/tool-score.mjs). A model that makes a better call than the teacher is scored wrong. The Riker report also notes that the step checker was strict on free-text inputs, so his first-try figures understate him (riker-28bob-tool-interview.md).

### 4.5.2 The harshness judge and the loop fault

The studies of a cruel direction (chapter 10) needed a judge for harshness. The model itself rated each of its own answers from 0 (kind) to 10 (cruel), with the model as built and all dials off (riker-28bob-tool-interview.md). This is a self-rating, not a human one, and the report says so.

The first version of this judge had a serious fault. An early steering push seemed to drive hostility from a strength of -20 to +40. In fact every strength made the model loop one word, often in Chinese, and the judge rated loops as harsh. That claim was withdrawn. The judge now counts loops and wrong-language text as broken, and a result that has a high "broken" count is not read as harshness (riker-28bob-tool-interview.md, section 5). The expert sweep of 938 tests had been scored with the old judge, so the report calls it a rough guide only.

The fault is a plain case of the problem Zheng et al. (2023) describe for model judges: a judge can reward or punish surface features that are not the property being measured. It also shows why a judge should be tested on the failure cases before its scores are used.

### 4.5.3 The model as its own explainer

The tool interview shows a model its own misses and asks why. The explanation is a lead, not proof. It is compared with the model's saved thinking and calls (riker-28bob-tool-interview.md). This guards against a model that gives a fluent but invented reason.

### 4.5.4 Lesson reviewers

Lessons were reviewed by language models at two points. The lesson writer's own reviewer rejected lessons at write time, and a separate sort by Haiku, then Opus, labelled each lesson keep, fix, repair or discard (section 4.7). Both reviewers are models, so both carry the biases noted above. The sort was checked by sampling. Chapters 6 and 7 report what the reviews found, and this chapter states only how they were run.

## 4.6 Held-out splits and the never-taught gate

### 4.6.1 The split

About 5% of lessons are held out by an id hash, `md5(idea) < 0.05` (docs/TOOL-LESSONS-PLAN.md, `pod/data.py`). The split follows the idea and not the file, so a lesson cannot move between sides by being copied under a new id. The public set was 14,586 training lessons and 831 held out (docs/MAKING-SMALLER-MODELS.md). The 534 held-out tool items counted in chapter 7 are the tool-lesson part of the held-out material, and are not the same number.

Benchmark chats, the quiz items, the "new" fact packs and the test turns of both tool interviews are held out too. A near match to any of them is meant to be dropped (docs/TOOL-LESSONS-PLAN.md).

### 4.6.2 Why the split was not enough

A split by id only helps if the same text does not appear under other ids. The check described in chapter 7 found that 519 of 534 held-out items appeared word for word in training-side files, with 7 more sharing their first 60 characters (checked-numbers.md). Copies of the test items sat in other lesson folders and in the conversation files used for REAP scoring (heldout-534 TALLY.md). The ledger's never-list may drop them at training time, but the copies are there, and whether any model trained on them is not measured.

The roadmap rule states the intent: "Test items join the never-taught list; lessons are new look-alikes only" (docs/ROADMAP-ONE-MODEL.md). The rule existed before the check enforced it.

### 4.6.3 The never-taught gate

The never-taught gate checks every user turn of a teaching plan's lessons and preference pairs against the quiz items and the never-taught list. It counts exact copies, test questions inside longer requests, and reworded near copies. The Forge runs it before renting and stops the plan on any match or a missing test file. Lessons written on the card are checked the same way (section 3.6.7).

Its status needs to be stated clearly. The gate is tested on fakes (18 checks) in PR #257, which is stacked on the lesson kit in PR #254. Both shipped in release 1.5.238 on 15 November, which passed 276 of 276 on Windows in its lab-PC check. Before that release the only guards were `notForTraining()` and a check in `src/lab-runs.js` that refuses never-train inputs. The copies of the 519 leaked items still sit in training-side files, so the gate, not the files, is what keeps them out of a training plan.

### 4.6.4 What was decided about the held-out tests

The 534 held-out tool items were sorted by Haiku, with a spot-check of 27 items (5%) by Opus. Opus agreed on 25 (93%) and changed 2 keeps to fix. An automatic check moved 3 more keeps to fix because they held the owner's user folder (heldout-534 TALLY.md). The sort gave 148 keep, 381 fix and 5 discard. On 15 November the owner chose to keep the held-out tests as they are while the full Opus re-sort of the lessons runs. Section 4.12 states the consequence: scores on these tests were made on items that mostly carry a fault, and they are not corrected.

## 4.7 Reviewing the lessons

### 4.7.1 The sort

Lessons were sorted into four verdicts. Keep means usable as it stands. Fix means a small edit would make it usable. Repair means a larger rewrite is needed. Discard means it should not be used. The sort is done by a language model reading each lesson in a batch, and the output is a verdict and a short note. No lesson text written by the sorting model is kept (tool-6500 TALLY.md).

For the tool-lesson set the sort ran in two stages. Haiku sorted the 5,788 non-held-out tool lessons in 650 batches. Opus then read all 5,788: a 290-lesson spot-check, the 582 Haiku keeps, and the 4,920 other verdicts that no Opus had read. Opus's verdict replaced Haiku's. An automatic check then moved 17 Opus-checked keeps that contained private data or teacher-note leaks to fix (tool-6500 TALLY.md).

### 4.7.2 Result of the second stage

The final tally for these lessons is 189 keep, 1,381 fix, 4,208 repair and 10 discard, as checked on 15 November (checked-numbers.md). Opus changed 1,922 of Haiku's verdicts. The largest change was 1,319 fix verdicts that became repair. The next largest was 284 keeps that became repair and 249 that became fix (tool-6500 TALLY.md). This shows why the second stage was run: a first-pass sort by a smaller model had been too lenient. The earlier tally from Haiku with a 5% Opus spot-check is kept in a separate folder.

### 4.7.3 First cleaning by rule

Before any model review, a cleaning script removed lessons by rule. The first cleaning took 9,059 lessons to 8,828: 73 duplicates, 123 with no final answer, 28 with unknown tools, 6 loops and 1 empty (docs/MAKING-SMALLER-MODELS.md). A later pass on a new version dropped lessons calling a tool their own list did not offer and repeated first prompts. The rule-based pass is cheap and exact, and the model-based review is slow and finds subtler faults. Chapter 6 shows how different the two results are.

## 4.8 Gates, caps, passes and cost

### 4.8.1 Gates before and during a paid rental

- **Pre-flight and sample gate.** Before a big paid write, the plan is checked in code and the first 10 ideas must save at least 60%, or the run stops with exit code 86 and the card is deleted. On lkt-fix3, 1 of 10 saved and the run stopped after about $0.31 (checked-numbers.md, forge-lkt-fix3-console.log).
- **Smoke gate.** A few lessons are made and checked: do the odds cover the thinking words, do the tool calls parse, does the trace work? A failure exits with code 86 (model-lab/smoke-gate.mjs).
- **First minutes.** Every rental must prove each step in its first minutes (docs/ROADMAP-ONE-MODEL.md). The first paid run of new code is its test, so it is kept short.
- **Caps and consent.** Every rental has an hours and a dollars cap, and nothing is rented without the owner's typed yes (model-lab/forge/README.md).
- **Home-side dry runs.** Home-side commands run against a stand-in server before any rental. Three benchmark failures in a row came from home-side bugs, including a benchmark that quietly tested the full model on the owner's own card instead of the rented one (docs/FORGE-JOURNAL.md, 10 to 11 November).

### 4.8.2 Full passes only

The first heals were stopped by the clock partway through. Riker v1 completed 195 of 456 planned steps, and Bill v1 163 of 456 (docs/FORGE-JOURNAL.md). Those models were half-healed, so comparing them with full-pass models would have been unfair. The rule from then on is a full training pass or nothing, with no clock-capped heals, no trimming of long lessons, and a bigger card when needed (docs/MAKING-SMALLER-MODELS.md). The old v1 models are retired (docs/COSTS.md).

### 4.8.3 Cost accounting

docs/COSTS.md lists every rental, failures included. At the time of writing it lists eleven failed paid attempts, costing $22.40, inside $484.39 of card time over about 105 hours. Two of the eleven are marked "estimated, not yet billed". The reasons include a machine image with no git, a prebuilt tool that would not run, a lesson-writer weight bug that produced empty jobs, and an export that crashed after good training. The total comes from the rental service's statement, and the lines are rounded.

A project that reports only successes cannot say what its method costs. The cost log is also evidence about method: a pipeline that needs eleven failed attempts is a pipeline whose early results deserve caution.

## 4.9 Data rules

### 4.9.1 Surgery and steering data never trains

The surgery data rule (model-lab/forge/README.md, 13 November 2026) has six points.

1. Anything made under surgery (dials, keep lists, masks, a steering direction, a changed expert count) carries its exact condition and is kept apart.
2. Only stock answers feed lessons and the teacher's odds.
3. Evil-check and fiction-check answers are evidence only, not even the wrong side of a pair.
4. Rejected lessons are for preference pairs only, not for job or expert maps.
5. No style expert maps from sets where the style was not applied.
6. Every cut or dial is a new version, kept only if it passes the held-out checks.

`notForTraining(row)` in `common.mjs` enforces points 1 to 3. The scoring scripts write a `condition` on every saved answer: "stock" or what was changed. A model served elsewhere without a stated condition is left unmarked and never called stock. This protects the studies from a quiet loop in which a changed model writes its own training data.

### 4.9.2 Scrubbing

Anything that leaves the home PC goes through `scrub-data.mjs`, on a copy and never on the raw folder. It replaces private details with stand-ins, checks the result again, and refuses to finish if anything is left. The check is repeated after the scrub and after the upload.

The rule exists because of a real miss. The first public scrub caught the user name only inside one path pattern. A bare name in folder listings and file names got through, and in saved odds a name came out split over two tokens. A stray folder name in one lesson was found only after the set went public (docs/MAKING-SMALLER-MODELS.md, model-lab/scrub-data.mjs). The script now also catches names inside any home-folder pattern, local-network addresses, e-mail addresses, keys, and names spread over odds tokens. The word list lives outside the repository.

This dissertation follows the same rule. It names no person, computer or folder on anyone's machine, and it contains no lesson text, model answers or prompts meant for training.

### 4.9.3 Naming

A name belongs to one model. Model names (Bob, Bobert, Riker, Bill) and job names (coding, recover, clarify) stay separate in plans, keep lists, logs and cards, so that a log never leaves it ambiguous which thing is meant (model-lab/forge/README.md). This is a small rule, but it removes a class of misreading from the records the studies rest on.

## 4.10 Statistics and noise

### 4.10.1 Paired gaps and 95% ranges

When two conditions use the same turns, the comparison is a paired difference with a 95% range. A gap counts as real only if it is larger than its range (bobert-35bob-tool-study.md). The wording tables report, for each condition, the share right and the gap against Bob's own wording. For example, on Bobert with thinking off, 264 judged turns each, the short "Use when" wording scored 0.587 against 0.591 for Bob's wording, a gap of -0.004 plus or minus 0.031. This follows the advice to use paired comparisons with error bars (Miller, 2024) and the caution that small samples have little power (Card et al., 2020).

The study files report the ranges but do not give the formula, so this chapter does not claim a particular method.

### 4.10.2 Quiz noise

A 97-question quiz moves by 3 to 5 between runs of the same model (docs/MAKING-SMALLER-MODELS.md). A small quiz gap is therefore not a result. Decisions rest on the held-out chat turns, and gaps are compared with their ranges.

For the patching and neuron tests, each setting used 6 or 8 asks, and a single 8-ask test swings about plus or minus 2 on the 0 to 10 scale. The "no change" cells at dial 1.0 ranged from 0.5 to 3.88 in one report (riker-28bob-tool-interview.md). With noise of that size, a single extra push is only a hint, and the reports label it so.

### 4.10.3 Sample sizes and single runs

The coached steps are 83 per mode and the judged turns 264 per condition, each run once. Small subsets, such as a job with 11 or 19 turns, give wide ranges. For example, with thinking on, Riker's file jobs rose from 0.368 with Bob's wording to 0.579 with the Use-when plus save-paths wording on 19 turns (+0.211, plus or minus 0.188), barely above its range, and the whole-set gain was +0.042 plus or minus 0.042, at the edge of its range (riker-28bob-tool-interview.md). The studies make no multiple-comparison correction across 14 jobs and many conditions, so a per-job gain should be read as a lead.

## 4.11 Related-systems note on evaluation practice

Public benchmarks for tool use measure model skill on a shared library, and public leaderboards compare models with each other (Patil et al., 2023; Qin et al., 2023). The numbers here are for comparing Bobs with each other on Bob's own tools, on one 16 GB card or a rented card (docs/MAKING-SMALLER-MODELS.md, section 7). They are not comparable with public leaderboards, and the dissertation does not claim they are.

## 4.12 Threats to validity and limits

**Leaked tests.** 519 of 534 held-out items appear word for word in training-side files. Scores on these tests may be inflated for any model that trained on those files. The size of the inflation is the subject of chapter 7, and it was not measured in a way that corrects past scores. The owner chose on 15 November to keep the held-out tests as they are while the full Opus re-sort of the lessons runs.

**Faulty tests.** Of the 534 items, 381 were sorted fix and 5 discard, so only 148 were sorted keep. The sort was by Haiku, with 5% checked by Opus, and a model sort carries its own errors. The tests were not repaired.

**Agreement is not truth.** The tool score and the coaching grades measure agreement with the teacher's recorded call. A model that disagrees may be wrong or may be better.

**Judge faults.** The harshness judge is a self-rating by the model under test, and its first version scored loops as harsh. The fixed version is better but has not been checked against human raters.

**Model reviewers.** Lessons were reviewed by language models. The Opus pass changed 1,922 of Haiku's verdicts, which shows the first pass was unreliable. The files read record no independent check of Opus's own verdicts.

**Small samples and single runs.** Most comparisons use one run of 264 turns or 83 steps, with no repeated seeds. A single 8-ask test has noise of about 2 points.

**Different question sets.** The 314-turn tool score and the 264-turn wording study use different questions. Numbers from the two must not be compared directly.

**Truncation.** In the Bobert wording study, 11 to 13 turns overflowed their slot and 11 to 31 answers were cut off. They are scored as wrong in every condition, which keeps comparisons fair but lowers absolute scores.

**Changed rules.** Some rules, such as the test-item gate, were adopted after a first run showed the problem, so earlier results were produced under weaker rules.

**One project.** The rules were written and followed by one project with one owner. No one outside has audited them.

**Status of the decisive test.** The decisive retrain on reviewed lessons has not been run. The Opus re-sort of the lessons is running, PR #254 and PR #257 shipped in release 1.5.238, PR #251 (Qwen tool shape v2 and the GPT-OSS shape) shipped but is not re-tested on models, and PR #232 (patching and autoencoders) ran on 15 November.

**Still to do.** Run an outside check of the held-out split. Repair the held-out tests after the Opus re-sort, and re-score the models that were chosen on the old tests.

## 4.13 Summary

The studies use a small set of benchmarks: a 314-turn tool score, a quiz, a 13-task coding race, a needle test, a routing race, a 264-turn wording A/B and 83 coached steps. They are graded by a rule that measures agreement with the teacher, and by a self-rating judge whose first version scored loops as harsh. The method relies on rules that came from failures: a split by id that a leak defeated, gates that stop paid runs early, full passes only, a cost log that includes every failed attempt, a surgery rule that keeps changed-model answers out of training, and a scrub that was rebuilt after a name got through. The statistics are paired gaps with 95% ranges, and the chapter says plainly where samples are too small to support more. The main open problem is that the held-out tests carry the faults described in chapter 7 and were kept as they are on 15 November while the full Opus re-sort runs. Chapters 5 to 10 should be read with that in mind.

## References

- Card, D., Henderson, P., Khandelwal, U., Jia, R., Mahowald, K., and Jurafsky, D. (2020). With Little Power Comes Great Responsibility. Proceedings of EMNLP 2020, pages 9263-9274. https://aclanthology.org/2020.emnlp-main.745/
- Dror, R., Baumer, G., Shlomov, S., and Reichart, R. (2018). The Hitchhiker's Guide to Testing Statistical Significance in Natural Language Processing. Proceedings of ACL 2018 (Volume 1: Long Papers), pages 1383-1392. https://aclanthology.org/P18-1128/
- Golchin, S., and Surdeanu, M. (2023). Time Travel in LLMs: Tracing Data Contamination in Large Language Models. arXiv:2308.08493. https://arxiv.org/abs/2308.08493
- Jacovi, A., Caciularu, A., Goldman, O., and Goldberg, Y. (2023). Stop Uploading Test Data in Plain Text: Practical Strategies for Mitigating Data Contamination by Evaluation Benchmarks. arXiv:2305.10160. https://arxiv.org/abs/2305.10160
- Lee, K., Ippolito, D., Nystrom, A., Zhang, C., Eck, D., Callison-Burch, C., and Carlini, N. (2021). Deduplicating Training Data Makes Language Models Better. arXiv:2107.06499 (ACL 2022). https://arxiv.org/abs/2107.06499
- Magar, I., and Schwartz, R. (2022). Data Contamination: From Memorization to Exploitation. arXiv:2203.08242. https://arxiv.org/abs/2203.08242
- Miller, E. (2024). Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations. arXiv:2411.00640. https://arxiv.org/abs/2411.00640
- Northcutt, C. G., Athalye, A., and Mueller, J. (2021). Pervasive Label Errors in Test Sets Destabilize Machine Learning Benchmarks. arXiv:2103.14749 (NeurIPS 2021). https://arxiv.org/abs/2103.14749
- OpenAI (2025). gpt-oss-120b and gpt-oss-20b Model Card. arXiv:2508.10925. https://arxiv.org/abs/2508.10925
- Panickssery, A., Bowman, S. R., and Feng, S. (2024). LLM Evaluators Recognize and Favor Their Own Generations. arXiv:2404.13076. https://arxiv.org/abs/2404.13076
- Patil, S. G., Zhang, T., Wang, X., and Gonzalez, J. E. (2023). Gorilla: Large Language Model Connected with Massive APIs. arXiv:2305.15334. https://arxiv.org/abs/2305.15334
- Qin, Y., Liang, S., Ye, Y., et al. (2023). ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs. arXiv:2307.16789. https://arxiv.org/abs/2307.16789
- Sainz, O., Campos, J. A., Garcia-Ferrero, I., Etxaniz, J., Lopez de Lacalle, O., and Agirre, E. (2023). NLP Evaluation in Trouble: On the Need to Measure LLM Data Contamination for Each Benchmark. arXiv:2310.18018. https://arxiv.org/abs/2310.18018
- Schick, T., Dwivedi-Yu, J., Dessi, R., Raileanu, R., Lomeli, M., Zettlemoyer, L., Cancedda, N., and Scialom, T. (2023). Toolformer: Language Models Can Teach Themselves to Use Tools. arXiv:2302.04761. https://arxiv.org/abs/2302.04761
- Yang, A., et al. (2025). Qwen3 Technical Report. arXiv:2505.09388. https://arxiv.org/abs/2505.09388
- Zheng, L., Chiang, W.-L., Sheng, Y., et al. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. arXiv:2306.05685. https://arxiv.org/abs/2306.05685
