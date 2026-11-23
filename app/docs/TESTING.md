# How we test brains, and how that changed

*16 Nov 2026. How the lab checks whether a brain does real work well, and what each run taught us about the testing itself. The run-by-run detail is in the [harness log](../model-lab/harness-log.md). The money is on [What Bob costs to make](COSTS.md).*

The short version: early scores were partly wrong because the test bench was broken, so the bench now has to prove itself before a card is rented. Every run is graded blind on what the user actually sees. Every mistake that keeps coming back gets a code check.

**What has shipped and what hasn't.** The end-of-turn checks shipped in Bob 1.5.248. The effort levels, the job self-tests, the Office jobs and the mail catalog are lab work on branches. They are not in Bob yet and are off by default when they land. Results marked "unproven" have not been run on a real rental yet.

## 1. Real jobs, not quiz questions

The old tests asked a brain one question about one tool. Now a brain does a **real job** in Bob's real loop with Bob's real tools, inside a small made-up test world: a home folder with real files, a made-up inbox, and pages to search. That world is built fresh for every job, and every brain and setting gets the same one. A job is a plain ask, like "tidy my downloads" or "find the invoice from last month and tell me what's owed".

## 2. The early harness was broken

The first runs on 15 and 16 Nov said as much about the test bench as about the brain.

- **Trial 1** (45 jobs): 8 keep, 28 fix, 3 discard and 6 runner errors.
- **Trial 2** (45 jobs): 14 keep, 28 fix, 1 discard and 2 cut off.
- **The 800-job run**: 402 keep, 315 fix and 36 discard. **47 runs were decided by the test world, not the brain**, in 8 kinds of fault. Files the world couldn't make were the biggest kind (32). Then came world replies cut off mid-way (9), OK cards that came back "no" (6), scripts outside a project (6), "I'll type it" picks (3), half an emoji the engine refused (2), diagrams with no window to draw in (2) and one folder that wasn't allowed.

Each kind was fixed, and each now has a check that names it. A replay of all 47 in the fixed world came out clear.

**The rule since then (MouseWurX, 16 Nov):** after every run, read why runs failed or were thrown out. Fix whatever is the bench's fault before the next run, add a check that would catch it again, and write it in the [harness log](../model-lab/harness-log.md).

## 3. Self-tests: every job must be fair

A job is fair only if a correct brain could pass it in that world. If the file a job asks about was never made, even a perfect brain fails, and the score blames the wrong thing.

So before every rental, the bench runs its **self-test**: a handful of tiny jobs, offline, in about 2 seconds. It checks that the world makes what each kind of job needs. If one misses, nothing is rented. The old bench fails all 8 of the first self-test jobs. More are added as runs find new gaps: a folder named in quotes, mail and Office files. A rental also stops itself when 3 runs in 10 are the world's fault.

## 4. Blind grading by Opus

Every run is read by Claude Opus 5.5 against a written rubric: right, partly right or failed, plus keep, fix or discard as a lesson. Opus sees one job's runs side by side with the labels shuffled, so it doesn't know which brain or setting made which answer. The labels are matched up only after the grades are in.

**Lesson learned: grade what the user sees.** The first blind read (500 runs, five settings) graded every message joined together. Bob's window shows only the answer, though, and folds his working and reviews away. So the 312 runs not graded right were graded again on the shown answer alone, and the bench now saves the shown answer separately.

## 5. Effort levels: Minimus to Maximus

Bob can spend more or less work on a job: **Minimus, Medius, Magnus and Maximus**. The higher levels add a plan, reviews and second looks, all with one brain. They were tested on the same 100 jobs.

| Run | Failed: Minimus | Medius | Magnus | Maximus |
|---|---|---|---|---|
| First test (100 jobs each) | 21 | 14 | 12 | 27 of 63 (stopped early) |
| Maximus again, with fixes | | | | 23 of 100 |

Maximus failed most, and the blind read showed why. The real answer was often hidden in the folded steps, while the shown answer said "see above", "already done", or showed review notes. It also wrote tool calls as text that never ran, and sometimes looped. Most of those are fixed or have a check now.

**The goal for Maximus (MouseWurX, 16 Nov):** it shouldn't take more than about 4 times Minimus's time, but it should have the most checks and do the best work. It isn't there yet.

## 6. The foolproof loop: checks from real mistakes

Every mistake that kept coming back in the graded runs became a code check at the end of Bob's turn. When a check fires, Bob gets one more go to put it right. It never loops.

The checks catch:

- asking where a file is without looking
- saying something was done when no tool did it
- pointing at tool output the user never saw
- answers cut off mid-list
- research answered after only one search
- sums done in his head
- mail jobs done with file or web tools
- "I already gave you that above" when he didn't

Bob also won't move his own working folder, and he repairs a garbled link before reading it.

Replayed over the 800 runs, the checks fire on about 27 fix or discard runs and about 10 keep runs, mostly a harmless "look first". Each new run is replayed against the checks to count misses and false alarms before the next rental. Shipped in 1.5.248. Unproven on live runs, as we have yet to test.

## 7. Coverage, one category at a time

Across the first 900 runs, many tools were never called at all: running commands, apps, the calendar, spreadsheets, Office files, the calculator, spelling and news, among others. Untested is not the same as working. So the plan now adds **one category of untested features per rental**, each with its own jobs, test world and self-test checks.

**Office files are first:** 16 jobs that read, convert, compare and edit Word, Excel and PowerPoint files. Building them found a bench bug straight away: two Office tools' file paths were never moved into the test world. Half of the 16 need LibreOffice on the test computer to make the old-format files. Unproven, as we have yet to test.

## 8. Mail: code does the clerk work, the brain writes the rules

The inbox test (30 mail jobs at each of the 4 levels, 120 runs, graded blind) went badly:

| | Right | Partly | Failed | Runner error | Harmful |
|---|---|---|---|---|---|
| All 120 runs | 10 | 41 | 67 | 2 | 16 |

More effort did not help, and Maximus did the most harm, because it acts more. The patterns were:

- reading the newest 15 messages and answering for the whole inbox
- not using the mail tools at all
- saying more was done than was
- writing drafts in chat without saving them

A brain is bad at clerk work: paging through hundreds of messages, counting and moving them in bulk. Code is good at it. So the **mail catalog** splits the job:

- **Code** keeps a local list of the mail and does the paging, counting, lists, "needs a reply" and bulk moves.
- **Code** also holds back what must never be swept up by a rule: people you write to, flagged mail, recent mail and scams.
- **The brain** reads the ask and writes the rule, like "archive everything from this shop older than a month", then reports what code did.

On the same branch, the mail tools also say when only the newest 15 of many messages are shown. The catalog is built and tested, and off by default. Its after number waits on the next rental. Unproven, as we have yet to test.

## 9. Other brains on the same bench

Stock GPT-OSS 120B did 45 real jobs: 33 keep, 11 fix and 1 discard, with 0 errors. Those were different jobs from Qwen's, so the two can't be compared yet. The next GPT-OSS run uses the same jobs and the same world as Qwen's after-run, graded blind with the same rubric, so that comparison will be fair.

## What's next

1. The loop checks are evaluated again on the graded mail run before any more rentals.
2. One rental runs the mail jobs and 200 of the real jobs on all the fixes. A second card runs GPT-OSS on the same 200 jobs.
3. Both are graded blind and compared with the runs before. Whatever went wrong is fixed in the bench, gets a check and goes in the log. Then the next category.
