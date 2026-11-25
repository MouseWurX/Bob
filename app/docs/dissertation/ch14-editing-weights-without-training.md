# Chapter 14. Editing the weights without training: a registered loop sweep on a 35B mixture-of-experts model

**MouseWurX** · Draft, 25 November 2026 · Written to stand alone as a paper; it uses the instruments of [chapter 3](ch03-building-the-instruments.md) and the rules of [chapter 4](ch04-method-and-rules.md).

> **Status: registered report, results pending.** This chapter fixes the question, the method and the decision rules **before** the first run. No rental has finished, so every claim about our own model below is unproven in our lab, as we have yet to test. Results will be added as a dated section, without changing the rules.

---

## Abstract

In November 2026, MIT CSAIL showed that one strong model could improve a small open model by editing its weights directly, with no gradients and no training data (Takehi et al., 2026). On Qwen3.5-0.8B, MATH-500 rose from 7.9% to 48.1%. Most of the gain came from the model no longer looping: answers that ran out of room fell from 93.0% to 33.1%. We ask whether the same idea helps a much larger and healthier model: stock Qwen3.6 35B A3B, a mixture-of-experts model with 40 layers of 256 experts, which is Bob's default brain. Our edit is coarser and cheaper than MIT's. We find the experts the router picks more often on looped answers, turn them down live with the engine's dials, and keep a setting only if loops fall while right answers hold. The winner can then be written into the weights permanently. We register the practice and check sets, the trials, the decision rules and the cost cap (3 hours or $3.50 on one 48 GB card) before any run. We also say in advance what a null result would mean: a healthy 35B may simply not loop enough on grade-school problems to fix.

---

## 1. Introduction

Most ways to change a model's behaviour either train it, which needs data and a large card, or prompt it, which costs context on every turn. A third way is to edit the weights by hand. It is old in spirit: abliteration removes a refusal direction by projecting it out of the weights (Arditi et al., 2024). It became newly interesting in November 2026, when a frontier model did the editing itself. It read a small model's weights, diagnosed a failure, and wrote a tiny fix (Takehi et al., 2026).

This matters for a local assistant. Bob runs on one consumer card and cannot retrain its brain cheaply. MouseWurX's rule is that personality lives only in the app prompt and is never trained. A weight edit that removes a failure, without teaching anything, fits that rule better than any training run.

Two facts make us cautious. First, MIT's gain came from repairing a broken model: the 0.8B looped on 85 of its first 96 practice answers. A follow-up on Gemma 3 270M found no clear gain (Takehi et al., 2026). Second, in our own earlier work an unwanted habit ran as a direction across many layers, held back by a brake, and not as one part a cut could remove ([chapter 10](ch10-evil-neuron.md)). Turning down 16 suspect experts made cruel answers harsher, not milder. An edit aimed at "the loop experts" could fail the same way.

**Research question.** On stock Qwen3.6 35B A3B, can turning down the experts that fire more on looped answers cut loops on unseen practice problems without losing right answers?

**Contributions.** (1) A registered, cheap protocol for live expert-level edits on a 35B mixture-of-experts model, with the code and practice set published (`app/model-lab/loop-sweep.mjs`, `app/model-lab/practice/`). (2) Decision rules fixed before the data. (3) Results, positive or null, reported in the same chapter, with the cost.

---

## 2. Related work

Work on agents that rewrite themselves splits by what they rewrite. The further down this list, the larger the claimed gains and the harder the change is to check.

| What is rewritten | Work | Model | Reported result | Cost reported |
| --- | --- | --- | --- | --- |
| Notes (an itemized playbook) | ACE (Zhang et al., 2025) | DeepSeek-V3.1 671B | AppWorld 42.4 to 59.5, no labels | 86.9% less adapting time than rivals |
| Notes, with better editing steps | Reflective Context Learning (Vassilyev et al., 2026) | Small agents, Claude Opus 4.6 as reviewer | AppWorld 78.0 to 89.3 | Not stated |
| The agent's own code and tools | Self-Improving Coding Agent (Robeyns et al., 2025) | Claude 3.5 Sonnet | SWE-Bench subset 17% to 53% | About $7,000 for 15 rounds |
| The agent's own code and tools | Darwin Gödel Machine (Zhang et al., 2025) | Claude 3.5 Sonnet | SWE-bench Verified 20.0% to 50.0% | About 2 weeks per run |
| Another model's weights | Weight-space programming (Takehi et al., 2026) | GPT-6 Astra edits Qwen3.5-0.8B | MATH-500 7.9% to 48.1%; GSM8K 13.8% to 67.1% | 20.3 hours, 158 turns, 80 Python runs |
| The model's own weights | Fan et al. (2026) | An open 27B model | +6.6 points on unseen problems | "Only forward passes"; no figure |

Three lessons from this work shape our design.

**The judge must sit outside what is changed.** The Darwin Gödel Machine faked passing test logs and then removed the logging meant to catch it (Zhang et al., 2025; The Register, 2025). Our edits touch only expert dials. The scoring code, the practice set and the check set are files the edit cannot reach, and the held-out jobs are never seen by the sweep at all.

**Edits that work are small and targeted.** MIT's winning edit changed about 0.016% of the weights: 64 output columns in each of two layers' feed-forward blocks (131,072 weights), removing one direction tied to repetition. Budgets of 10 or 25 test runs barely moved the loops, and 50 did (Takehi et al., 2026).

**Size matters, in both directions.** Fan et al. (2026) report that only the largest model in their family improved itself; smaller ones made no edit or broke themselves. Takehi et al. (2026) needed a frontier model to edit a 0.8B. We do not know where a 35B mixture-of-experts model falls. We read only the abstract of Fan et al. (2026), so its method details are unproven in our lab, as we have yet to test.

---

## 3. Method

### 3.1 Model and engine

The subject is stock Qwen3.6 35B A3B as published (Unsloth's UD-Q4_K_XL file), with nothing inherited from our own cuts or heals. It has 40 layers of 256 experts, 8 of which the router picks per token, plus one shared expert per layer.

It is served by Bob's Brain Engine at build fcdf3955 on llama.cpp b12282, with two of its patches ([chapter 3](ch03-building-the-instruments.md)):

- **Expert trace (patch 0002)** reports, per request, how often each expert was picked in each layer. It is given only to a request that ran alone, so traces are read one at a time.
- **Dials (patch 0003)** multiply what one expert adds to the stream, after routing. A dial of 1 is the model as built and 0 is silent. A dial is the same as scaling that expert's output weights, so a winning dial can be written into the weights with Bob's surgery tool (`forge/pod/surgery.py`) and behave the same.

Before any trial, an engine check confirms that chat, thinking, dials and the trace all work. If any fails, the run stops and the card is released (exit 86).

### 3.2 Problems

All problems come from the GSM8K **train** split (Cobbe et al., 2021; MIT licence), shuffled with seed 7. The first 200 form the **find set** and the next 100 form the **check set**. Bob's held-out jobs are never used. They score only a finished winner, once, in a later step ([chapter 4](ch04-method-and-rules.md)).

### 3.3 Answering and labelling

Each problem is answered with thinking on and the sampling MIT used: temperature 0.6, top-p 0.95, top-k 20. Each problem has its own fixed seed, so every trial sees the same dice. Answers are capped at 8,192 tokens, with 6 answered at a time. An answer counts as **looped** if the limit cut it off, or if fewer than half of its 12-word runs are unique. It counts as **right** if the last number in the final answer matches the key.

### 3.4 Finding the experts

Every find-set answer is read back with the trace on. For each layer *l* and expert *e*, the **lift** is the expert's share of picks on looped answers divided by its share on finished ones (with one added to the finished count). Experts with fewer than 20 picks on looped answers are left out, so a rare expert cannot top the list by chance. Experts are ranked by lift across all layers.

### 3.5 Trials

A trial turns the top *N* experts down to scale *s*, with *N* ∈ {16, 64, 256} and *s* ∈ {0.5, 0.7, 0.85}: nine trials in all. Each trial answers the whole check set, and then the dials are reset. The check set is also answered once as built, which gives the baseline.

### 3.6 Cost

The run uses one A40 or A6000 (48 GB). The caps are 3 hours and $3.50. It is driven by the Forge (`forge/plans/loop-sweep-qwen35.json`), and the PC side is the sweep script.

---

## 4. Decision rules (fixed before the run)

1. **Too little to fix.** If fewer than 8 find-set answers loop, or fewer than 8 finish, the sweep stops before any trial. We report this as a null result: this model does not loop enough on these problems for this method to act on.
2. **Candidate.** A trial is a candidate only if its check-set loop rate is lower than the baseline's **and** its right-answer rate is at least the baseline's. Among candidates, the fewest loops wins, then the most right answers.
3. **Noise.** With 100 check problems, one standard error on a rate near 20% is about 4 points. A candidate whose loop drop is under 8 points (two standard errors) is reported as **within noise**. It is not baked into the weights unless a fresh run on 100 new practice problems repeats the drop.
4. **Ship gate.** No edit ships because of this sweep. A winner is baked, then scored once on Bob's held-out real jobs (no crashes, no bad tool calls, no broken files, same or better job scores). Even then it sits behind Turbo, off by default, because it changes the words the model writes.
5. **What would change our view.** A clear loop drop with right answers held would support the idea that looping has a few expert carriers in this model. A loop drop paid for with right answers, or none at all, would match [chapter 10](ch10-evil-neuron.md): habits are spread out and expert dials are too coarse. The next step would then be MIT's direction edit on single layers, which is drafted but not yet run.

---

## 5. Threats to validity

- **The problems may be too easy.** A 35B model may solve grade-school maths in a few hundred tokens and rarely loop. Rule 1 makes that a cheap, reported null, not a hidden failure.
- **A long answer is not always a loop.** With no thinking cap, a careful answer can hit 8,192 tokens and be counted as looped. The repeat test separates the two only roughly.
- **The lift mixes cause and effect.** Experts that fire on looped text may be reading the repetition, not causing it. Only the trials can tell, which is why rule 2 judges by behaviour, not by lift.
- **Dials are coarser than MIT's edit.** A dial scales a whole expert. MIT removed one direction from 64 columns. A null here does not rule out a finer edit.
- **One model, one quant, one seed set.** The results may not carry to other files or to Bob's real jobs, which is why rule 4 exists.
- **The quant.** The sweep runs on a 4-bit file. A winner baked into the full-precision weights could behave a little differently once quantized again. The held-out score is taken on the shipped file.

---

## 6. Results

*Pending.* The rental was approved on 25 November 2026 and handed to the Forge. This section will report the find-set loop rate, the lift table, the baseline, all nine trials, the noise verdict, the cost and the time, all measured, with the run files named.

---

## 7. Conclusion

Weight editing without training is now shown on small models by a frontier editor, and claimed for a 27B model editing itself. It is not yet shown on a healthy mixture-of-experts model of the size people run at home. This chapter sets out a cheap, pre-registered test of the simplest version, and the rules for reading it. Whatever the result, it will be reported here with its cost.

---

## References

Arditi, A., Obeso, O., Syed, A., Paleka, D., Panickssery, N., Gurnee, W., and Nanda, N. (2024). Refusal in Language Models Is Mediated by a Single Direction. arXiv:2406.11717. https://arxiv.org/abs/2406.11717

The Register (2025). Boffins found self-improving AI sometimes cheated. 2 June 2025. https://www.theregister.com/2025/06/02/self_improving_ai_cheat/

Cobbe, K., Kosaraju, V., Bavarian, M., et al. (2021). Training Verifiers to Solve Math Word Problems. arXiv:2110.14168. Data: https://github.com/openai/grade-school-math

Fan, J., He, N., Yang, C., Mao, A., Zhu, X., Cheng, C., Liang, K., Shen, S., Li, Z., Guo, R., and Liu, G. (2026). Language Models Can Rewrite Their Own Weights. arXiv:2611.21885 (abstract only read). https://arxiv.org/abs/2611.21885

Robeyns, M., Szummer, M., and Aitchison, L. (2025). A Self-Improving Coding Agent. arXiv:2504.15228. https://arxiv.org/abs/2504.15228

Takehi, R., Teoh, J., Zhang, A., and Khattab, O. (2026). Weight-space programming. MIT CSAIL. Blog: https://rikiyat.github.io/blog/weight-space-programming/ · Logs: https://github.com/RikiyaT/lm_understand-logs · Coverage: Franzen, C., VentureBeat, 2 November 2026, https://venturebeat.com/technology/like-gene-editing-for-neural-networks-mit-researchers-used-gpt-6-astra-to-edit-qwens-open-weights-directly-boosting-math-performance

Vassilyev, et al. (2026). Reflective Context Learning: Studying the Optimization Primitives of Context Space. arXiv:2604.03189. https://arxiv.org/abs/2604.03189

Zhang, J., Hu, S., Lu, C., Lange, R., and Clune, J. (2025). Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents. arXiv:2505.22954. https://arxiv.org/abs/2505.22954

Zhang, Q., et al. (2025). Agentic Context Engineering: Evolving Contexts for Self-Improving Language Models. arXiv:2510.04618. https://arxiv.org/abs/2510.04618
