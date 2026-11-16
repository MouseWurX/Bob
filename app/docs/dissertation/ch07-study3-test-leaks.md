# Chapter 7. Study 3: leaks in the test

## 7.1 Introduction and research question

A held-out test is only fair if the model never saw it. This chapter asks research question 3: how much do leaked test items distort the scores we used to make decisions?

We can only answer the first half of that question so far. We can say how many of the project's held-out tool items leaked into lesson files, where they came from, what the items themselves are like, why the project's split rule let them through, and what now stops it. We cannot yet say how much any past score was inflated, because the re-scoring that would show it has not been done. The chapter says so wherever it matters, and ends with a design for that measurement.

The reader should keep the status of each piece in mind:

- The leak count and the item sort are finished measurements on the lab PC's files (heldout-534 TALLY.md).
- The never-taught gate is built and tested. PR #257 shipped in release 1.5.238 on 15 November, whose pre-release check passed 276 of 276 test suites (1.5.238-PC-CHECKS.md).
- The test items were sorted by Haiku, with a 5% Opus spot-check. On 15 November MouseWurX chose to keep the held-out tests as they are while the full Opus re-sort of the lessons runs.
- The size of the inflation is not measured.

## 7.2 Related work

**Contamination as a threat to evaluation.** Sainz et al. (2023) argued in a position paper that benchmark scores of models trained on web-scale data are at risk, because test data may have been in the training data, and that contamination should be measured for each benchmark. Xu et al. (2024) surveyed the field and described how benchmark content can be absorbed during training and distort measured performance. Kapoor and Narayanan (2022) looked at the same failure across applied machine learning and found that leakage is a widespread cause of results that do not reproduce.

**Does contamination change scores?** Magar and Schwartz (2022) trained models with controlled contamination and found that models sometimes exploit contaminated data to improve task scores and sometimes only memorise it, depending on factors such as how often the item was duplicated and the model size. That result matters for us because it says that a leak does not always inflate a score, and that the answer has to be measured. Lewis et al. (2020) found that many test answers, and about 30% of test questions, overlap with training data in open-domain question-answering datasets, and that models perform much worse on the questions they cannot memorise. Zhang et al. (2024) built a new grade-school arithmetic test (GSM1k) matched to an old one and found that some models score noticeably lower on the new one, which suggests partial memorisation of the old.

**Detecting contamination.** When the training data is unknown, contamination has to be inferred. Golchin and Surdeanu (2023) proposed a two-level method that detects memorised test data and reported 92% to 100% agreement with human experts. Oren et al. (2023) proposed a test that can prove contamination in a black-box model by checking whether a benchmark's canonical ordering is much more likely than shuffled orderings. Deng et al. (2024) showed that some commercial models can guess masked answer options in benchmark test sets, with exact matches on 52% and 57% of the missing options for two models, which suggests contamination. Xu et al. (2024, "Benchmarking Benchmark Leakage") used perplexity and n-gram accuracy on 31 models and found substantial evidence of misuse of test sets. We are in a different position: we hold both the test items and the training files, so we do not need to infer. We can search.

**Duplicates and memorisation.** Lee et al. (2022) showed that removing near-duplicate text from training data reduces memorised output and does not cost accuracy. Carlini et al. (2022) found that memorisation grows with model capacity, with the number of times an example is duplicated, and with the length of the prompt context. These results explain why even a small number of copies in a lesson set may matter: a model trained for a full pass on a set that repeats an item sees it more than once.

**Preventing leaks.** Jacovi et al. (2023) proposed practical measures: encrypting and restricting released test data, requiring training-exclusion controls from closed API providers, and documenting web-sourced data that appears with its answers. Their recommendations target public benchmarks. Our leak is internal: the same project wrote the tests and the lessons, so the fix is a gate inside the project's own pipeline.

**Errors in the tests themselves.** Northcutt et al. (2021) found substantial label errors in the test sets of widely used datasets and showed that these errors can change which model looks best. We sorted the test items by the same fault types as lessons, and found the same kind of problem (section 7.5).

## 7.3 Method

### 7.3.1 What the test is

The project holds out part of its lessons to score models on. The rule, in the Forge's data module, is: a fixed 5% of lessons, chosen by the MD5 hash of the lesson's idea id, is held out and never trained on (pod/data.py). The rule follows the id, not the text. Benchmark chats and quiz items are held out in addition (TOOL-LESSONS-PLAN.md).

The set studied here is the 534 held-out tool items collected for the tool-lesson review. They come from five sources (heldout-534 TALLY.md and tool-6500 TALLY.md):

| Source of held-out items | Items |
|---|---|
| Riker calibration questions (GPT-OSS v5 lesson-run folder) | 308 |
| hf-upload-folded, held-out file | 73 |
| lessons-gptoss, full, held-out file | 66 |
| main lessons set | 82 |
| lessons-coding-2, raw | 5 |
| **All** | **534** |

The tally lists the main lessons set and lessons-coding-2 as held out "on never.jsonl", a never-taught list, while the other three sources are held-out files. We did not find that list among the files we read, so how those 87 items were chosen is taken from the tally's wording only.

### 7.3.2 The leak check

The check is a script, not a reader. It takes each held-out request and searches every training-side lesson file for the same request. It records two kinds of match:

- **Exact.** The request appears word for word.
- **Same first 60 characters.** The request shares its opening but differs later.

The output, near-copies.jsonl, has one row per item and records the first file where a match was found. We re-counted it for this chapter: 526 rows, one per distinct held-out item, 519 exact and 7 near. So the file does not list every copy of an item. It says that at least one copy exists, and names one of them.

"Training-side file" means any lesson file in the lab's output folders, not only the files that a given training plan used. That distinction matters in section 7.7 and is a limit on every claim about past scores.

### 7.3.3 Sorting the test items

The 534 items were also read as if they were lessons. Haiku read all 534 in 57 batches and sorted each as keep, fix or discard with a plain note. Opus spot-checked 27 items, which is 5% (heldout-534 TALLY.md). An automatic check then moved 3 keeps to fix because they held MouseWurX's user folder.

## 7.4 Results: how many items leaked, and from where

### 7.4.1 The count

| Held-out source | Items | Exact copy | Same first 60 only | No match found |
|---|---|---|---|---|
| Riker calibration questions | 308 | 307 | 0 | 1 |
| hf-upload-folded, held-out file | 73 | 73 | 0 | 0 |
| lessons-gptoss, full, held-out file | 66 | 52 | 7 | 7 |
| main lessons set | 82 | 82 | 0 | 0 |
| lessons-coding-2, raw | 5 | 5 | 0 | 0 |
| **All** | **534** | **519** | **7** | **8** |

(From near-copies.jsonl; the "no match found" column is 534 minus the matched items, our subtraction.) So 519 of 534 items (97.2%, our division) appear word for word in a training-side file. Counting the 7 with the same opening, 526 of 534 (98.5%) have a copy or a near copy. Only 8 items have no match, and 7 of those are in one source.

The check was run against every training-side file, so these are not rare accidents. In four of the five sources, essentially every item has a copy.

### 7.4.2 Where the first match was found

The first file where each item matched falls into a few families. Counts are of items, one per item.

| Held-out source | Where the first copy was found | Items |
|---|---|---|
| Riker calibration questions (307) | other own lesson sets (lessons-recover, lessons-newtool, lessons-research and similar) | 171 |
| | GPT-OSS v5 lesson-run output | 68 |
| | hf-stage-1113 lessons-gptoss | 55 |
| | the lesson-kit trial seeds | 13 |
| hf-upload-folded held-out file (73) | the thinking-style sets (lessons-think-*, including their rejected files) | 66 |
| | the scrubbed style-set uploads (hf-lessons-styles-scrubbed) | 7 |
| lessons-gptoss held-out file (59 matched) | GPT-OSS v5 lesson-run output | 47 |
| | the lesson-kit trial seeds | 12 |
| main lessons set (82) | the 12 November REAP run's conversation files (review, clean and preference-pair files) | 81 |
| | another own lesson set (lessons-reasoning) | 1 |
| lessons-coding-2, raw (5) | the same set's own lessons file | 5 |

Two points stand out.

First, 81 of the 82 held-out items in the main lessons set were first found in the conversation files of the 12 November REAP run (its review, clean and preference-pair files). The likely mechanism is the one in section 7.6: the same request, re-created in a new file under a new id, was hashed again and fell on the training side. The near-copies file does not record ids, so this is an inference from the data module's rule and not a per-item check.

Second, some first matches are in files that a training plan may not use at all: seed files for the lesson kit, and files named rejected or needs-review. Of the 526 first matches, 56 are in rejected, needs-review or audited files (45, 10 and 1), by our count of the file names. We cannot say how many of the 519 exact copies sit in files that any past training run actually read. The script's own note says the ledger's never-list "may drop them at training time, but the copies are there" (heldout-534 TALLY.md).

### 7.4.3 The path by which requests got in

The record points to reuse of requests, not to carelessness inside one set. The plan document says that requests from failed GPT-OSS runs "may be reused" as lesson requests, while quiz items are "test only" (TOOL-LESSONS-PLAN.md). The Riker calibration questions share a folder name with the GPT-OSS v5 lesson runs, and 68 of their first copies are in that run's output. Two rules over overlapping pools of requests is a plausible way for a test item to become a lesson. The files do not trace it item by item, so we label this as likely and not shown.

## 7.5 Results: the test items are not clean either

### 7.5.1 The sort

| Held-out source | Keep | Fix | Discard |
|---|---|---|---|
| Riker calibration questions | 96 | 208 | 4 |
| hf-upload-folded held-out file | 22 | 51 | 0 |
| lessons-gptoss full held-out file | 17 | 49 | 0 |
| main lessons set | 13 | 66 | 1 |
| lessons-coding-2 raw | 0 | 5 | 0 |
| **Total as reported** | **148** | **381** | **5** |

(heldout-534 TALLY.md.) The reported total is 148 keep, 381 fix and 5 discard, which sums to 534. The five rows as printed sum to 148, 379 and 5, which is 532. The main lessons row shows 80 items where the tally of the lessons elsewhere shows 82 held out, so the two missing items are most likely in that row. We quote the reported totals and flag the gap. The sort is a Haiku sort with a spot-check, so it is weaker than the Opus read of chapter 6.

So 27.7% of test items were judged fit as they stand (148 of 534, our division), and 71.3% needed a fix.

### 7.5.2 What the checks found

Opus spot-checked 27 items. It agreed with Haiku on 25 (93%) and changed 2 keeps to fix, for needless or repeated calls. The automatic check changed 3 more keeps to fix (heldout-534 TALLY.md).

The most common reasons for a fix were:

- MouseWurX's user folder in calls or answers;
- teacher-note leaks;
- tool results that a tool cannot produce, such as a search that "saves" files;
- invented or stale facts and dates;
- claimed steps that never ran.

These are the same fault types as in chapter 6. A test item with one of them gives a wrong key. A model that gives the right answer is marked down, or a model that copies a wrong habit is marked up. This is the problem Northcutt et al. (2021) described for labelled test sets, in a smaller form.

A spot-check of 27 items is small. The 93% agreement has a wide range, and the figure is not a measure of Haiku's accuracy on all 534.

## 7.6 Why an id-hash split fails

The rule is simple. A lesson is held out if the hash of its id, read as a number from 0 to 1, is below 0.05 (pod/data.py). The same id always lands on the same side, so the split is stable and reproducible. That is its strength.

It also has a weakness. The hash sees the id and not the request. If the same request is written again, converted into another format, folded into a merged set or taken into a conversation file, it gets a new id. That id is hashed on its own. Each such copy has a 5% chance of being held out and a 95% chance of being trained on. This is arithmetic from the 5% rate, not a measurement. A held-out request with one re-created copy therefore has a 95% chance of having a copy on the training side, and with two independent copies, about 99.75%.

The Forge's cleaning script already tried to reduce this: it keeps one copy of repeated first prompts and keeps the held-out copy when there is one (forge README). But it works on the sets it is given, and a copy in a set that was not part of the cleaning run is not seen. Our data show copies in the thinking-style sets, the lesson-kit seeds, the GPT-OSS runs and the REAP run's conversation files, which are different sets made at different times.

So the problem is structural. A split by id protects against copies that carry the same id. It does not protect against copies that carry a different one. Any pipeline that writes the same request in more than one place needs a check on the text.

## 7.7 What past scores may be inflated, and how to measure it

### 7.7.1 What is exposed

The files say that copies exist. They do not say which trained model read which file. So a score is exposed only if the model that produced it was trained or healed on a file with a copy, or if the REAP calibration used a copy to choose experts. The test results the project has used to decide things are:

| Result | Held-out basis | What leaks could do |
|---|---|---|
| Heal cross-entropy on held-out lessons (chapter 5) | the held-out split of the run's own lessons | Lower the reported loss for items the student saw in training |
| Tool score, 314 turns from 196 held-out conversations (chapter 5) | held-out conversations | Raise agreement with the teacher on items seen |
| REAP trims and calibration, judged on held-out turns (chapter 9) | held-out turns | Make the calibration look more reliable than it is |

The files do not say how many of the 196 held-out conversations are among the 534 items, so we cannot say how much of the tool score is exposed. The coding race and the quick code test use fixed tasks and are not part of the 534. Whether they leaked into lessons has not been checked.

### 7.7.2 Direction, not size

We can predict the direction. If a model saw a copy, its score on that item is expected to be at least as high as without, though not always. The effect is bigger for models trained longer or more often on the copies, and Magar and Schwartz (2022) warn that it can also be nil. Comparisons between models healed on the same lessons share the same exposure, so the inflation partly cancels in the difference. Comparisons across different lesson sets, such as the old and the clean Riker in chapter 5, do not cancel. Of the figures in chapter 5, the tool score differences of 1 point are already inside the noise, so leaks cannot be what makes them real. The coding results are the least likely to be affected, since coding tasks are outside the 534 tool items.

We give no number for the inflation, because none has been measured.

### 7.7.3 A design for measuring it

None of the following has been run.

| Step | What it does | Cost |
|---|---|---|
| 1. Exposure audit | For each past model, list the lesson files its plan used, and intersect them with near-copies.jsonl. Gives, per model, how many test items it could have seen. | PC work, no rental |
| 2. Exposed against unexposed | Per model, split the items into seen and not seen, and compare scores, with a bootstrap range. Needs enough unexposed items, and there are only 8 with no match, so this works only if step 1 finds many files unused by a model. | PC work, a re-score |
| 3. Fresh items | Write new look-alike items that pass the gate, re-score the same models and compare with the old score on the same model. A gap above the noise (a 97-question quiz moves 3 to 5 between runs) is a measure of inflation. | Writing and a re-score |
| 4. Retrain pair | Heal twice from the same start on the same lessons, once with the copies removed, same settings. The difference isolates the effect of training on a copy. Each heal of this size cost US $51.79 to $72.67 in the records (BOBS-OWN-MODELS.md). | Two rentals |

Step 1 is free and should come first, because it says whether steps 2 to 4 are needed. Step 4 is the cleanest and the most expensive. The decisive retrain on reviewed lessons, against a leak-free test, would also serve as step 4.

Methods from the contamination literature that infer exposure from model behaviour (Golchin and Surdeanu, 2023; Oren et al., 2023) are for the case where the training data is unknown. Here the files are known, so a direct audit is stronger.

## 7.8 The never-taught gate

### 7.8.1 Design

PR #257 added a gate that runs before any card is rented (PR #257 description). It is lab-only, changes nothing in Bob's app, and nothing was rented to make it. The gate:

- applies to any plan that teaches, meaning one with rungs, a teacher pass, a heal, a GRPO step or preference pairs;
- reads every user turn of the main lessons, the extra lessons and the preference pairs;
- compares them with the quiz items, a never-taught list (the 534 held-out items at top level and the Riker calibration questions) and any list named in the plan itself;
- counts a match if the text is the same, if a test question sits inside a longer request, or if the text is a reworded near copy by the ledger's word-overlap check.

The plan stops, with nothing rented and nothing sent, if any match is found, if a listed test file is missing, if no test files are found at all, or if the plan uses a lesson set that is already on the rented drive, which the PC cannot check. Lessons written on the card during a training run are checked in the same way, and any that hold a test item are dropped and kept apart in a separate file before the set goes up. The result is saved per run, and the gate can run alone from the command line.

The gate builds on the lesson ledger from PR #254 (PR #257 description). It is stacked on that PR and uses its word-overlap check.

### 7.8.2 Design choices worth noting

Three choices follow from the findings above.

The gate compares text and not ids, which answers the failure in section 7.6. It matches near copies and not only exact ones, because 7 items shared only their first 60 characters. And it fails closed: a missing test file or an unverifiable lesson set stops the plan. Older plans that use a lesson set already on the drive will stop until those sets are checked on the PC (PR #257 description).

The PR reports that its new test file has 18 checks, run on fakes, in a suite of 270 that all passed, and that the release check passed. The release that shipped it, 1.5.238, passed 276 of 276 test suites in its pre-release check (1.5.238-PC-CHECKS.md). This tests that the gate behaves. It does not test that it catches everything, because its reach is the files the plan names.

### 7.8.3 What the gate does not do

The gate looks forward. It does not repair past scores, and it does not clean the 519 copies in the existing files. It does not check text outside the training plan, so a copy added by hand later would still pass if no plan read it. It also depends on the never-taught list being complete. A test set that is not on the list is not protected.

## 7.9 Discussion

The finding is not that the project was careless. It is that a fair-looking rule, 5% by id hash, gave almost no protection once the same requests were written into several sets. Near-total overlap (97.2% exact) is higher than the 30% question overlap Lewis et al. (2020) found in open-domain question answering, which suggests this is not a mild case. We caution against reading too much into that comparison: their datasets were public benchmarks collected independently, and ours were generated by one project that reused its own requests.

Three consequences follow for the decisions in the thesis.

First, the decisions most at risk are those that rely on small differences. If two models differ by a point on the tool score, leaks make the difference harder to trust, though that difference was inside the noise anyway.

Second, the lessons and the tests need the same care. Chapter 6 found that 96.7% of the tool lessons needed work. Section 7.5 found that 71.3% of the test items needed a fix. A model trained on flawed lessons and scored on flawed items can agree with itself while being wrong.

Third, the gate should be treated as a first defence. A text check can be beaten by a rewording that keeps the meaning and shares few words, and the near-copy check is word overlap. A semantic check would catch more, and the cost of one is not measured.

## 7.10 Threats to validity and limits

- **Exposure is not shown.** The count shows copies in files. It does not show that any past model trained on a copy. This is the largest limit on RQ3.
- **First match only.** The near-copies file records one file per item. The true number of copies is higher, and the count of copies in unused files is unknown.
- **A script defines the leak.** "Word for word" and "same first 60 characters" are rules. A reworded copy that shares fewer words would be missed. Section 7.8's gate adds a word-overlap check, but that check has not been measured against a human reading.
- **The test sort is weak.** Haiku sorted the items and Opus checked 27. MouseWurX chose on 15 November to keep the tests as they are while the full Opus re-sort of the lessons runs, so the sort of test items is not yet at the standard of chapter 6.
- **A table does not add up.** The per-source sort totals 532, not 534, in the printed rows. We quote the reported totals and flag the gap.
- **Which scores.** Several of the project's results do not use these 534 items, so the effect on them is unknown, not zero.
- **No size for the inflation.** No re-score has been run. The thesis does not claim that any result is wrong because of the leaks.
- **Status of the gate.** The gate shipped in 1.5.238 and has passed its checks, but the files read show no paid run made through it yet.

## 7.11 Summary

Of 534 held-out tool items, 519 appear word for word in training-side lesson files, and 7 more share their first 60 characters. The copies come from other own sets, the GPT-OSS runs, the thinking-style sets, the lesson-kit seeds and the REAP run's conversation files. The items themselves needed work too: Haiku sorted 148 as keep, 381 as fix and 5 as discard. An id-hash split cannot stop a request that is rewritten under a new id, which is how most of these copies arose.

The never-taught gate, built in PR #257 and shipped in release 1.5.238, now compares text before any card is rented and stops the plan on a match. It does not measure past inflation. That needs an exposure audit, a re-score on fresh items and ideally a retrain pair, none of which has been run. Until then, the scores in this thesis that rest on these items should be read as possibly flattering, and by an unknown amount.

## References

Carlini, N., Ippolito, D., Jagielski, M., Lee, K., Tramèr, F., Zhang, C. (2022). Quantifying Memorization Across Neural Language Models. arXiv:2202.07646. https://arxiv.org/abs/2202.07646

Deng, C., Zhao, Y., Tang, X., Gerstein, M., Cohan, A. (2024). Investigating Data Contamination in Modern Benchmarks for Large Language Models. NAACL 2024; arXiv:2311.09783. https://arxiv.org/abs/2311.09783

Golchin, S., Surdeanu, M. (2023). Time Travel in LLMs: Tracing Data Contamination in Large Language Models. arXiv:2308.08493. https://arxiv.org/abs/2308.08493

Jacovi, A., Caciularu, A., Goldman, O., Goldberg, Y. (2023). Stop Uploading Test Data in Plain Text: Practical Strategies for Mitigating Data Contamination by Evaluation Benchmarks. arXiv:2305.10160. https://arxiv.org/abs/2305.10160

Kapoor, S., Narayanan, A. (2022). Leakage and the Reproducibility Crisis in ML-based Science. arXiv:2207.07048. https://arxiv.org/abs/2207.07048

Lee, K., Ippolito, D., Nystrom, A., Zhang, C., Eck, D., Callison-Burch, C., Carlini, N. (2022). Deduplicating Training Data Makes Language Models Better. ACL 2022; arXiv:2107.06499. https://arxiv.org/abs/2107.06499

Lewis, P., Stenetorp, P., Riedel, S. (2020). Question and Answer Test-Train Overlap in Open-Domain Question Answering Datasets. arXiv:2008.02637. https://arxiv.org/abs/2008.02637

Magar, I., Schwartz, R. (2022). Data Contamination: From Memorization to Exploitation. arXiv:2203.08242. https://arxiv.org/abs/2203.08242

Northcutt, C. G., Athalye, A., Mueller, J. (2021). Pervasive Label Errors in Test Sets Destabilize Machine Learning Benchmarks. NeurIPS 2021, Datasets and Benchmarks Track; arXiv:2103.14749. https://arxiv.org/abs/2103.14749

Oren, Y., Meister, N., Chatterji, N., Ladhak, F., Hashimoto, T. B. (2023). Proving Test Set Contamination in Black Box Language Models. arXiv:2310.17623. https://arxiv.org/abs/2310.17623

Sainz, O., Campos, J. A., García-Ferrero, I., Etxaniz, J., Lopez de Lacalle, O., Agirre, E. (2023). NLP Evaluation in trouble: On the Need to Measure LLM Data Contamination for each Benchmark. arXiv:2310.18018. https://arxiv.org/abs/2310.18018

Xu, C., Guan, S., Greene, D., Kechadi, M.-T. (2024). Benchmark Data Contamination of Large Language Models: A Survey. arXiv:2406.04244. https://arxiv.org/abs/2406.04244

Xu, R., Wang, Z., Fan, R.-Z., Liu, P. (2024). Benchmarking Benchmark Leakage in Large Language Models. arXiv:2404.18824. https://arxiv.org/abs/2404.18824

Zhang, H., Da, J., Lee, D., et al. (2024). A Careful Examination of Large Language Model Performance on Grade School Arithmetic. NeurIPS 2024, Datasets and Benchmarks Track; arXiv:2405.00332. https://arxiv.org/abs/2405.00332
