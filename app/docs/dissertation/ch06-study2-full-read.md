# Chapter 6. Study 2: what a full read finds

## 6.1 Introduction and research question

Chapter 5 found one fault by accident: a third of the first coding lessons taught the wrong habit, and no script had flagged it. That raises research question 1: how many faults does a synthetic agent lesson set really hold, and of which kinds?

This chapter answers it in three layers, from cheap to expensive.

1. **Scripts.** Rules that count: duplicates, lessons with no final answer, calls to tools that do not exist, loops, empty lessons.
2. **A quality pass on outside lesson sets.** Five published sets from other teacher models were checked before they went into Bob's mix.
3. **A full read.** A cheaper reader model (Haiku) sorted every tool lesson. A stronger reader (Opus) then read all 5,788 that were not held out, and its verdict replaced Haiku's.

The main result is a contrast. Scripts removed 231 of 9,059 lessons. The full read kept 189 of 5,788 tool lessons as written. The second figure is the one that decides how Bob's next training run should be built.

The chapter also asks what it means when two reviewers disagree. Opus changed 1,922 of Haiku's verdicts, so the answer shapes how much any single verdict can be trusted.

Two statuses need stating plainly. The full read sorts lessons; it does not by itself prove that the rewritten lessons train a better model. The decisive retrain on reviewed lessons has not been run. And no human has yet checked a sample of either reviewer's verdicts.

## 6.2 Related work

**Data quality over data volume.** LIMA argued that a small set of carefully chosen examples can align a pretrained model, because most knowledge comes from pretraining (Zhou et al., 2023). AlpaGasus used a strong model as a filter on the 52,000-example Alpaca set and trained on the 9,000 it kept, getting a model that beat the original Alpaca with about 5.7 times less training time (Chen et al., 2023). "Textbooks are all you need" made the same bet for code, using curated and synthetic textbook-style data (Gunasekar et al., 2023). Our study is a measurement of how much of one project's synthetic data would survive such a filter.

**Duplicates.** Lee et al. (2022) showed that removing near-duplicate and repeated text from language-model datasets makes models less likely to reproduce memorised text and lets them reach the same or better accuracy in fewer steps. Our first cleaning pass was a small version of this, and the held-out leaks in chapter 7 are a form of the same problem.

**Errors in labelled data.** Northcutt et al. (2021) found substantial label errors in the test sets of widely used datasets and showed that such errors can change which model looks best. Confident learning, from the same first author, gives a way to estimate which labels are wrong (Northcutt et al., 2019). Our reader models do a rough version of this for lessons: each verdict is a label on a lesson, and the labels disagree.

**Synthetic data and its author.** Self-Instruct showed that a model can write its own instruction data and that filtering makes it usable (Wang et al., 2023). Gudibande et al. (2023) found that a student trained on a stronger model's outputs copies its style faster than its facts. That is why faults in the author's lessons matter: they are copied along with the good parts.

**Models as reviewers.** Zheng et al. (2023) found that a strong LLM judge agrees with human preferences more than 80% of the time, about as often as humans agree with each other, and also documented position, verbosity and self-enhancement biases. Panickssery et al. (2024) found that models can recognise their own outputs and that stronger self-recognition goes with stronger self-preference. Both results shape the limits in section 6.9. They say a model reviewer is useful and that its agreement with another model is not a measure of truth.

**Tool-use data.** Toolformer, Gorilla and ToolLLM build tool-calling data at scale and mostly check form and choice of API (Schick et al., 2023; Patil et al., 2023; Qin et al., 2023). Several of the faults found here, such as a call that "succeeds" with the wrong argument names, sit in the gap between a well-formed call and a correct one.

## 6.3 Method

### 6.3.1 The lessons

Bob's lessons are written by the full Qwen3.6 model from Bob's real system prompt and tool list, with neutral names and no one's real chats (MAKING-SMALLER-MODELS.md). The public set is organised as sets by skill. The tool-lesson review covers 6,322 tool lessons across 20 set files, drawn from Bob's own sets and from the GPT-OSS 120B lesson runs (TALLY.md, tool-6500 sort). Of these, 534 are held-out test items. They were set aside by rule and are the subject of chapter 7. That leaves 5,788 lessons to be read.

### 6.3.2 Layer 1: script cleaning

The first cleaning pass was a script over Bob's first 16 lesson sets. It dropped lessons with a missing final answer, calls to tools that do not exist, repeated lessons, loops on one call and empty lessons (MAKING-SMALLER-MODELS.md). A second pass (version 4) added a check that a lesson does not call a tool its own tool list lacks, kept one copy of repeated first prompts, and moved lessons marked wrong by hand review to a separate file (FORGE-JOURNAL.md, forge README). Held-out lessons are never dropped by the script; problems in them are only reported (clean-lessons.mjs header).

### 6.3.3 Layer 2: outside sets

Five published answer sets from much larger models were converted to Bob's lesson format. Each trace was checked for four things: does it end with a real answer, does it loop on one call, does it carry anything that looks like injected instructions, piped installers, secrets or destructive commands (FORGE-JOURNAL.md, 8 November entry).

### 6.3.4 Layer 3: the full read

The read ran in four steps. The source is the final tally file of the tool-6500 sort (TALLY.md).

1. **Pre-set.** The 534 held-out items were discarded up front (marked `by: pre`). Opus did not read these.
2. **Haiku.** Haiku sorted the other 5,788 in 650 batches into keep, fix, repair or discard. Fix means a small change; repair means a rewrite.
3. **Opus.** Opus then read all 5,788: the earlier 290-lesson spot-check, the 582 lessons Haiku had kept (65 batches), and the 4,920 Haiku fix, repair and discard verdicts that no Opus had yet read (547 batches of about 9). Opus's verdict replaces Haiku's.
4. **Guard.** An automatic check moved 17 Opus-approved keeps to fix because they contained private data or teacher-note leaks.

The output is a sort, not a rewrite. The sorting files carry no Claude-written lesson text. The earlier tally, Haiku plus a 5% Opus spot-check, was kept in a separate folder (TALLY.md).

Opus was told about four known Haiku misreads before it read. Dates had been judged against today's real date. Builder "[... cut ...]" markers had been read as broken lessons. Real tools missing from a batch's list had been counted as faults. And an ask_together rule that the brief does not have had been applied. Opus did not use any of the four (TALLY.md). Two Opus batches (r377 and r434) read only the first 1,760 of 2,319 lines of the tool list; both said every tool their lessons used was in that part.

## 6.4 Results, layer 1: what scripts find

| Fault | Lessons removed |
|---|---|
| Duplicates | 73 |
| No final answer | 123 |
| Unknown tools | 28 |
| Loops | 6 |
| Empty | 1 |
| **Total removed** | **231** |

The set went from 9,059 to 8,828 lessons (MAKING-SMALLER-MODELS.md, checked-numbers.md). By our division, that is 2.5% removed, and 123 of the 231 (the missing final answers) are more than half of what the script found.

The version 4 pass, run later on the 9,059-lesson version 3, produced 8,992: 26 made-up tool calls, 33 repeats and 8 moved to the wrong side (forge README). The two passes are not comparable and not a sequence, and we do not add them.

The point is the scale. The scripts found a few percent. They could not find the hand-off fault of chapter 5, and, as section 6.6 shows, they could not find most of what a reader finds.

## 6.5 Results, layer 2: the outside sets

| Outside set | Traces | Outcome |
|---|---|---|
| GLM-5.1 agent | 758 | Dropped whole. Only 108 end with an answer. The rest stop mid tool-call, and tool outputs often do not match the task. |
| Kimi K2.5 agent | 1,207 | 1,171 kept. 36 dropped for never answering or looping on one command. |
| DeepSeek V4 Pro agent | 2,553 | Kept whole. Every trace ends with an answer, no loops. |
| GLM-4.7 | 864 | Kept whole. |
| DeepSeek V4 Flash chat | 6,290 | 4,471 kept, a seeded sample, to even the total. |

The GLM-5.1 set was dropped because the traces were broken, not because they were malicious: only 108 of 758 (14%, our division) ended in an answer, and in one trace a TypeScript repository listing appeared inside a TensorFlow job (FORGE-JOURNAL.md). A script check for a missing final answer was enough to catch this one.

The scan for injected instructions found nothing beyond ordinary Dockerfile lines such as `rm -rf /var/lib/apt/lists/*` and package sites. The journal is careful about what that shows: the absence of planted instructions, not the correctness of the content (FORGE-JOURNAL.md). The outside sets were checked by script and sampling, not by a full read. Whether a full read would find as many faults in them as in Bob's own tool lessons is not measured.

Two further notes from the journal affect how the outside sets are used. The sets were capped so that outside and Bob's own lessons were even by count, 9,059 each. And in the Forge every lesson is scored by one teacher, Qwen3.6-35B, including lessons another model wrote, so a Bob learns the outside author's words but Qwen's judgement of which words were likely (FORGE-JOURNAL.md).

## 6.6 Results, layer 3: the full read

### 6.6.1 The verdicts

| Verdict | Lessons | Share of 5,788 (our division) |
|---|---|---|
| Keep as written | 189 | 3.3% |
| Fix (small change) | 1,381 | 23.9% |
| Repair (rewrite) | 4,208 | 72.7% |
| Discard | 10 | 0.2% |

(TALLY.md, checked-numbers.md.) The discard line in the file is 544, which is the 534 held-out items plus the 10 that Opus confirmed as discards. Opus made no new discards of its own beyond those Haiku had marked.

So 3.3% of the lessons that were read were fit to teach as they stood. Almost three quarters needed a rewrite. Counted against all 6,322 tool lessons, 189 is 3.0%.

The `by` field of each verdict records how it was reached: `haiku+opus` for 3,706 lessons where Opus agreed, `spot-check` for 2,065 where Opus changed the verdict or gave its own reasons, `auto` for the 17 guard demotions, and `pre` for the 534 held-out items (TALLY.md). No lesson was left at a Haiku-only verdict.

### 6.6.2 What Opus changed

| Haiku verdict to final verdict | Lessons |
|---|---|
| fix to repair | 1,319 |
| keep to repair | 284 |
| keep to fix | 249 |
| repair to fix | 47 |
| fix to keep | 19 |
| repair to keep | 4 |
| keep to fix (automatic guard, after Opus said keep) | 17 |

Opus changed 1,922 of Haiku's verdicts, which is 33.2% of the 5,788 (our division). The 17 guard moves come on top. Three features of the table matter.

First, most changes are about degree. Fix to repair and repair to fix together are 1,366 of the 1,922 (71%, our division). The two reviewers mostly agreed that a lesson needed work and disagreed about how much.

Second, the changes run one way. Opus moved 533 Haiku keeps to a worse verdict (284 plus 249), and 23 lessons to a better one (19 plus 4). Opus is a stricter reader, and the repo does not say that it is a more accurate one.

Third, Opus did not discard anything new. The few lessons that were beyond repair were already caught.

### 6.6.3 The per-set table

Opus read every sorted lesson in every set. The table gives the counts as in TALLY.md, with a keep share added for the larger sets (our division).

| Set | Total | Held out | Sorted | Keep | Fix | Repair | Discard | Keep share of sorted |
|---|---|---|---|---|---|---|---|---|
| lessons (main set) | 1,708 | 82 | 1,626 | 71 | 432 | 1,121 | 84 | 4.4% |
| hf-upload-folded (full) | 1,105 | 0 | 1,105 | 38 | 296 | 769 | 2 | 3.4% |
| lessons-coding-2 (raw) | 569 | 5 | 564 | 0 | 53 | 511 | 5 | 0.0% |
| lessons-codefix-2 (rejected) | 427 | 0 | 427 | 7 | 121 | 298 | 1 | 1.6% |
| lessons-agent (rejected) | 406 | 0 | 406 | 9 | 100 | 297 | 0 | 2.2% |
| lessons-newtool | 359 | 0 | 359 | 16 | 75 | 266 | 2 | 4.5% |
| lessons-recover | 319 | 0 | 319 | 19 | 59 | 240 | 1 | 6.0% |
| lessons-coding | 304 | 0 | 304 | 15 | 129 | 160 | 0 | 4.9% |
| lessons-selfcheck | 175 | 0 | 175 | 4 | 20 | 151 | 0 | 2.3% |
| lessons-codefix | 174 | 0 | 174 | 0 | 20 | 154 | 0 | 0.0% |
| lessons-gptoss (full) | 148 | 0 | 148 | 9 | 39 | 99 | 1 | 6.1% |
| lessons-understand | 123 | 0 | 123 | 1 | 27 | 94 | 1 | 0.8% |
| lessons-gptoss (full, held-out file) | 66 | 66 | 0 | 0 | 0 | 0 | 66 | not read |
| hf-upload-folded (held-out file) | 73 | 73 | 0 | 0 | 0 | 0 | 73 | not read |
| Riker calibration questions | 308 | 308 | 0 | 0 | 0 | 0 | 308 | not read |
| GPT-OSS v5 rejected | 32 | 0 | 32 | 0 | 4 | 28 | 0 | 0.0% |
| lessons-codefix-2 | 16 | 0 | 16 | 0 | 3 | 13 | 0 | 0.0% |
| lessons-agent | 8 | 0 | 8 | 0 | 3 | 5 | 0 | 0.0% |
| GPT-OSS v5 bob lessons and needs-review | 2 | 0 | 2 | 0 | 0 | 2 | 0 | 0.0% |
| **All** | **6,322** | **534** | **5,788** | **189** | **1,381** | **4,208** | **544** | **3.3%** |

Set names are shortened from the folder names in the tally. Two readings stand out.

**No set is clean.** The best keep share in a set of any size is 6.1% (lessons-gptoss), and 6.0% for lessons-recover. The set written to teach Bob to recover from errors still needed a fix or a rewrite in 94% of its lessons (299 of 319, our sum).

**Coding sets are among the worst.** The raw coding-2 set kept none of 564, and the first codefix set kept none of 174. This echoes chapter 5, where a coding set was found faulty. The older lessons-coding set did better (4.9%) than the raw set, but its repair count (160 of 304) is the lowest repair share among the large sets, so more of its lessons needed only a small fix.

The two files named rejected (lessons-agent and lessons-codefix-2) are not a clean control. Opus still kept 9 of 406 and 7 of 427, a lower rate than the main sets but not zero. The files do not say how those lessons came to be rejected, so we draw no conclusion about that earlier step.

### 6.6.4 The fault types Haiku missed

TALLY.md groups the faults that Haiku passed and Opus caught. We quote the groups and describe them in general terms, with no lesson text.

| Group | What it is |
|---|---|
| Bad arguments that still "succeed" | A specialist call with the wrong argument name or a made-up role; a tool group that does not exist; file tools with bare names; a command with a missing field; picture, video, sound and music lengths outside their limits |
| Results no real tool returns | A search or a security check that "saves" files; an app look that returns prose or GPU facts instead of controls; a notice board or reminder result with fields the tool does not have; a forget step that finishes without its preview |
| Repeating the specialist | Bob rewrites an answer that already went straight to the user. A decision on 15 November counts this as repair |
| Needless calls | Tools used for stable knowledge; guessed folder listings when the user gave no path |
| Leaks, loops and private paths | Reasoning that loops or quotes the prompt; MouseWurX's user folder in calls and answers |
| Wrong facts | Many code and API facts (Unreal, Blender, Rust, Kotlin, Python) |

These groups have two things in common. They are invisible to a script that checks form, because the call parses and the result is well formed. And they need knowledge of the real system: what each tool actually returns, what fields it has, what its limits are. A likely cause is that the writer model had Bob's tool list but not Bob's real tool behaviour, so it invented plausible results. The files do not test this.

The fault of chapter 5 fits the same pattern. A pretend result from the coding tool is a result no real tool returns.

The private paths are a separate concern. They are a privacy fault, not only a quality one, and the public set has a scrub step and a recheck gate for them (MAKING-SMALLER-MODELS.md). The full read found them inside lessons that had passed earlier checks.

## 6.7 What reviewer disagreement means

Two reviewers gave different verdicts on 1,922 of 5,788 lessons. There are four ways to read this.

**It measures the boundary, not the substance.** Because 71% of the changes are between fix and repair, most of the disagreement is about whether a lesson can be patched or must be repaired. A rule can settle some of it. The 15 November decision that "repeating the specialist" counts as repair is an example: it removed a source of disagreement by making the rule explicit (TALLY.md). More such rules would shrink the figure, which suggests part of the 1,922 comes from an under-specified rubric.

**It shows a bias, not a truth.** Opus moved many more lessons to a worse verdict than to a better one. A stricter reader finds more faults, and some may be false alarms. Without a human sample we cannot say how many. The literature on model judges is consistent with this: agreement between a strong model and humans can be high, and the judge can still have systematic biases (Zheng et al., 2023).

**Shared blind spots remain.** Haiku and Opus are from one model family. Where both miss a fault, their agreement is not evidence that the fault is absent. Panickssery et al. (2024) found self-preference in models judging their own outputs; here neither reviewer wrote the lessons, so that bias applies less, but the family-level blind spot is not ruled out.

**It is also a measure of what a cheap reader costs.** Had the project stopped at Haiku, it would have kept 582 lessons as written. Of those, Opus moved 533 to fix or repair (the table in 6.6.2 also counts earlier spot-check lessons, so these two figures are not an exact pair). So the cheaper reader's keep verdict was wrong, by Opus's standard, in most cases it was given. The Haiku pass is still useful as a first sort, but a keep from Haiku is weak evidence.

Taken together, the right use of the disagreement is as a map of where to look. Where the reviewers agree on repair, a rewrite is almost certainly right. Where they differ on fix versus repair, either outcome is probably acceptable. Where Opus moved a Haiku keep, the lesson should be read by a person first.

## 6.8 Discussion

### 6.8.1 Counting is not reading

The headline contrast is 231 removed by script against 5,599 judged not fit as written by the read (5,788 minus 189, our subtraction). The scripts were right about what they found. They checked what a machine can check. The faults that matter for training are semantic: a plausible result that no tool would return, a call that parses and does the wrong job, a fact that is wrong. Detecting these needs a reader who knows what the system really does.

This supports the position of the data-quality literature that filtering with a strong model finds what rules do not (Chen et al., 2023). It adds that the amount found can be very large when the data is synthetic and the author did not have access to the real system's behaviour.

### 6.8.2 The cost of a clean set

A keep rate of 3.3% means that, with no repair, a clean set of a given size would need about thirty times as many lessons as it contains. In practice the project repairs instead: 4,208 lessons go to a rewrite and 1,381 to a small fix. The files do not record how many of those rewrites have been done and checked, and the next stage in chapter 11 reports early keep rates for rewritten rounds that are partly reported and not yet verified against a file. We do not repeat them here.

### 6.8.3 What this does not show

This study sorts lessons. It does not show that a model trained on the 189 kept, or on the rewrites, is better. That is the decisive retrain, and it has not been run. A sort that says 96.7% of lessons need work is a statement about the lessons, and the claim that those faults harm the trained model rests on chapter 5 and on the literature, not on this chapter.

## 6.9 Threats to validity and limits

- **One reader model per pass.** Haiku read once and Opus read once. There is no second Opus reading and no measured self-consistency. We do not have a number for how often Opus would give a different verdict to the same lesson on another run. This is not measured.
- **No human check yet.** No person has verified a sample of either reviewer's verdicts. The error rate of the reviewers is unknown.
- **Rubric drift.** The rubric changed during the read (the 15 November rule on repeating the specialist, and the four Haiku misreads). Verdicts made before and after a change are not strictly comparable.
- **Reading limits.** Two Opus batches saw only the first 1,760 of 2,319 lines of the tool list. The reviewers' view of each lesson is a batch of about nine, not a single lesson, and a batch read can affect what a reviewer notices.
- **Tool list as ground truth.** The reviewers judged results against the written tool list and Bob's source. A fault in either would pass through.
- **Scope.** The full read covers tool lessons only. The chat, thinking and other sets were not read in this way, so the 3.3% figure must not be applied to them.
- **Held-out items.** The 534 held-out items were set aside, not read here. They were sorted separately by Haiku with a 5% Opus spot-check (chapter 7).
- **Outside sets.** The outside sets were checked by script and sampling. A full read has not been done on them.
- **Status.** The decisive retrain on reviewed lessons has not been run, and the effect of the rewrites on the model has not been measured.

## 6.10 Summary

Scripts found 231 faults in 9,059 lessons, by type: 73 duplicates, 123 with no final answer, 28 unknown tools, 6 loops and 1 empty. A quality pass dropped one of five outside sets (GLM-5.1, where only 108 of 758 traces ended in an answer) and trimmed another (Kimi, 1,171 of 1,207 kept). A full Opus read of 5,788 tool lessons kept 189, marked 1,381 as small fixes, 4,208 as rewrites and 10 as discards, and changed 1,922 of Haiku's verdicts. The faults Haiku missed were the semantic ones: calls that succeed with wrong arguments, results no tool returns, repeated specialist answers, needless calls, leaks and private paths, and wrong facts.

Reviewer disagreement is mostly about the line between a fix and a rewrite, and it runs in one direction. It is best used to rank which lessons a person should read first. Whether the rewrites improve a trained model is the open question, and the next study asks how much the test itself can be trusted.

## References

Chen, L., Li, S., Yan, J., Wang, H., Gunaratna, K., Yadav, V., Tang, Z., Srinivasan, V., Zhou, T., Huang, H., Jin, H. (2023). AlpaGasus: Training A Better Alpaca with Fewer Data. arXiv:2307.08701. https://arxiv.org/abs/2307.08701

Gudibande, A., Wallace, E., Snell, C., Geng, X., Liu, H., Abbeel, P., Levine, S., Song, D. (2023). The False Promise of Imitating Proprietary LLMs. arXiv:2305.15717. https://arxiv.org/abs/2305.15717

Gunasekar, S., Zhang, Y., Aneja, J., et al. (2023). Textbooks Are All You Need. arXiv:2306.11644. https://arxiv.org/abs/2306.11644

Lee, K., Ippolito, D., Nystrom, A., Zhang, C., Eck, D., Callison-Burch, C., Carlini, N. (2022). Deduplicating Training Data Makes Language Models Better. ACL 2022; arXiv:2107.06499. https://arxiv.org/abs/2107.06499

Northcutt, C. G., Athalye, A., Mueller, J. (2021). Pervasive Label Errors in Test Sets Destabilize Machine Learning Benchmarks. NeurIPS 2021, Datasets and Benchmarks Track; arXiv:2103.14749. https://arxiv.org/abs/2103.14749

Northcutt, C. G., Jiang, L., Chuang, I. L. (2019). Confident Learning: Estimating Uncertainty in Dataset Labels. arXiv:1911.00068. https://arxiv.org/abs/1911.00068

Panickssery, A., Bowman, S. R., Feng, S. (2024). LLM Evaluators Recognize and Favor Their Own Generations. arXiv:2404.13076. https://arxiv.org/abs/2404.13076

Patil, S. G., Zhang, T., Wang, X., Gonzalez, J. E. (2023). Gorilla: Large Language Model Connected with Massive APIs. arXiv:2305.15334. https://arxiv.org/abs/2305.15334

Qin, Y., Liang, S., Ye, Y., et al. (2023). ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs. arXiv:2307.16789. https://arxiv.org/abs/2307.16789

Schick, T., Dwivedi-Yu, J., Dessì, R., Raileanu, R., Lomeli, M., Zettlemoyer, L., Cancedda, N., Scialom, T. (2023). Toolformer: Language Models Can Teach Themselves to Use Tools. arXiv:2302.04761. https://arxiv.org/abs/2302.04761

Wang, Y., Kordi, Y., Mishra, S., Liu, A., Smith, N. A., Khashabi, D., Hajishirzi, H. (2023). Self-Instruct: Aligning Language Models with Self-Generated Instructions. arXiv:2212.10560. https://arxiv.org/abs/2212.10560

Zheng, L., Chiang, W.-L., Sheng, Y., Zhuang, S., Wu, Z., Zhuang, Y., Lin, Z., Li, Z., Li, D., Xing, E. P., Zhang, H., Gonzalez, J. E., Stoica, I. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. NeurIPS 2023, Datasets and Benchmarks Track; arXiv:2306.05685. https://arxiv.org/abs/2306.05685

Zhou, C., Liu, P., Xu, P., Iyer, S., Sun, J., Mao, Y., Ma, X., Efrat, A., Yu, P., Yu, L., Zhang, S., Ghosh, G., Lewis, M., Zettlemoyer, L., Levy, O. (2023). LIMA: Less Is More for Alignment. arXiv:2305.11206. https://arxiv.org/abs/2305.11206
