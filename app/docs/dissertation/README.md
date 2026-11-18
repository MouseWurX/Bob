# Clean lessons beat more lessons

**How hidden faults in synthetic training data shape small local agent models**

*Bob's computer science dissertation, written in the open. Draft of 18 November 2026: all 13 chapters, fact-checked against their run files, with the after1 round, the home-PC speed tests (every setting tried, with perplexity, to 18 November) and the fNRI trace test added to chapters 2, 3, 4, 10, 11 and 13.*

> **Status.** The decisive test, training a fresh model on reviewed lessons and scoring it on a leak-free test, **has not been run yet**. Until it runs, the title is a claim the evidence points to, not a proven result. Each chapter ends with its limits and what is still to do.
>
> This folder is for reading only. It is research writing, not lessons: no lesson set, Forge job or training script reads it.

## Abstract

Small open models can run a useful agent on one consumer graphics card, but how well they work depends on what they were taught. We built an engine, a training pipeline and a test bench to cut, heal, steer and measure a 35-billion-parameter mixture-of-experts model, and used them to study its lessons. A full read of 5,788 synthetic tool lessons kept only 189 as written. One fault, coding lessons that handed the work to a tool (37%), held coding back until clean lessons lifted it from 6 to 9 of 13 tasks. 519 of 534 held-out test items had leaked into training files. Rewording tools barely moved results (within about 1 point), while lessons that show the exact call did. Looking inside, the habit we expected to find in a single "evil neuron" turned out to be a direction spread across many layers, held back by a group of experts that act as a brake.

## Research questions

1. How many faults does a synthetic agent lesson set really hold, and which kinds?
2. Do those faults show up as habits in the trained model, and how far does cleaning fix them?
3. How much do leaked test items distort the scores we used to make decisions?
4. Does tool shape or lesson content matter more for tool use?
5. Where does an unwanted habit sit inside the model: in a part that causes it, or in a part that holds it back?

## Chapters

| | Chapter | What it covers |
|---|---|---|
| 1 | [Introduction](ch01-introduction.md) | Why small local agents, the research questions, the rules the thesis keeps, and a summary of the findings. |
| 2 | [Background and related work](ch02-background-and-related-work.md) | Mixture-of-experts and pruning, quantization, synthetic data and distillation, test contamination, tool use, preference training, interpretability, local inference. |
| 3 | [Building the instruments](ch03-building-the-instruments.md) | Brain Engine's patches to llama.cpp, the Forge rental pipeline, the Lab scripts, and the bugs they caught. |
| 4 | [Method and rules](ch04-method-and-rules.md) | Held-out splits, the never-taught gate, smoke gates, full passes only, measured-only reporting, and every failure counted. |
| 5 | [Study 1: the hand-off habit](ch05-study1-hand-off-habit.md) | A fault in the coding lessons became a habit, and clean lessons fixed it. |
| 6 | [Study 2: what a full read finds](ch06-study2-full-read.md) | Scripts and a cheaper reviewer miss most faults; a full read keeps very few lessons. |
| 7 | [Study 3: leaks in the test](ch07-study3-test-leaks.md) | Test items copied into training files, and what that does to scores. |
| 8 | [Study 4: tool shape or lesson content](ch08-study4-tool-shape.md) | Rewording tools does little; showing the exact call works; thinking hurts tool steps. One working tool shape per brain family is locked (Qwen shape 4, GPT-OSS shape 3), not yet re-scored. |
| 9 | [Study 5: lessons through a cut](ch09-study5-lessons-through-a-cut.md) | What a cut keeps, what a heal copies, and why an already-cut model has no slack. |
| 10 | [The evil neuron we expected, and what we found](ch10-evil-neuron.md) | An unwanted habit runs as a direction across layers, held back by a brake, not one part. |
| 11 | [How we now make clean lessons](ch11-making-clean-lessons.md) | Fresh stock model, locked tool shapes, real tool results in a sandbox, every lesson read, and the decisive test still to run. |
| 12 | [Teaching it](ch12-curriculum.md) | A curriculum from first concepts to engineering: the Lab's Lessons course, 45 lessons in 17 units. |
| 13 | [Conclusion and future work](ch13-conclusion.md) | Answers to the research questions, what was not shown, contributions, and what comes next. |

## Keeping it clean

- **Measured results only.** Every number comes from a real run and was checked against its file. What ran, what was skipped and why are said in each chapter. Samples, mock-ups and design pictures are never evidence.
- **Failures stay in.** Failed paid attempts, lost weights and what got worse after each cut are part of the result.
- **Privacy.** No person, computer or private folder is named. The text says "the project", and the project's owner appears only as MouseWurX, the GitHub account the project is published under.

Related pages: [Bob's own models](../BOBS-OWN-MODELS.md) · [Making smaller brains](../MAKING-SMALLER-MODELS.md) · [The Forge journal](../FORGE-JOURNAL.md) · [What Bob costs to make](../COSTS.md)
