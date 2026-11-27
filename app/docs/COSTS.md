# What Bob costs to make

*Every dollar the project has spent and every dollar it expects to spend, itemized. US dollars. Updated as each line lands. Rented hardware is described by the kind of service and the card (a GPU server rented by the hour, an H100 or H200), not by the company it's rented from.*

Bob is a one-person project. Nothing here is a fundraiser; the page exists so that anyone can see what a family of custom models actually costs when it's done on rented cards by the hour, and so the plan on [Bob's own models](BOBS-OWN-MODELS.md) has a price tag next to every rung.

## Spent so far

### GPU servers rented by the hour (Bob's own models)

Every rental, including the ones that made nothing. Times are the owner's local time.

| Date | Card | Ran for | Rate | What happened | Cost |
|---|---|---|---|---|---|
| 4 Nov 2026, afternoon | 1x H100 80 GB SXM | 1.03 h | $3.99/h | **Lessons night.** The full model, served by vLLM, wrote 3,753 of Bob's lessons (the owner's PC had written 79 overnight before). Success. | $3.98 |
| 4 Nov 2026, evening | 1x H100 80 GB SXM | 16 min | $3.99/h | **Failed attempt 1.** Setup: the machine image had no git, so the tool download broke. Nothing made. | $1.08 |
| 4 Nov 2026, evening | 1x H100 80 GB SXM | 8 min | $3.99/h | **Failed attempt 2.** The prebuilt llama-quantize would not run on the image. Nothing made. | $0.55 |
| 4 Nov 2026, late evening | 1x H100 80 GB SXM | 1.4 h | $3.99/h | **Failed attempt 3.** The teacher server died during the teacher pass, nearly half the tool lessons were being skipped by the chat template, and the teacher download was slow in that data centre. Nothing made; both bugs fixed afterwards. | $4.91 |
| 4 to 5 Nov 2026, overnight | 1x H100 80 GB SXM | 7.53 h | $3.99/h | **Line A session.** Teacher pass (71 min). 24Bob Riker v1: one crash in the heal (fixed, restarted), then 195 steps in 1.75 h, stopped by the clock cap; Q4 and Q3 exports. 18Bob Bill v1 cut from Riker, heal stopped by the clock cap at step 155 of 456 (1.5 h); Q4 and Q3 exports. Two Bobs home. $30.05 of card time plus the working disk. | $30.35 |
| 5 Nov 2026 | none | | | A tail of working-disk minutes billed after that machine was deleted. | $0.30 |
| 5 Nov 2026, morning to night | 1x H200 141 GB SXM | 13.6 h | $5.29/h | **Line B session.** The full model wrote 717 coding and software-engineering lessons; teacher pass; 24Bob Riker v2 full pass (524 of 524 steps, 4.8 h); 18Bob Bill v2 cut from Riker v2, full pass; exports and adapters. $71.94 of card time plus the 350 GB working disk and the first hours of the rented network drive. **Lesson learned:** the run reused the v1 keep list unchecked (it had kept only 92% of coding's routing, with no rule protecting any skill), and 37% of the coding lessons taught the model to hand code off rather than write it, so the run could not lift coding (see [What went wrong with the first cut](BOBS-OWN-MODELS.md#what-went-wrong-with-the-first-cut)). Both were replaced by the re-cut Riker and deleted on 8 Nov 2026. | $72.67 |
| 6 Nov 2026, morning | 1x H200 141 GB SXM + the rented network drive | 1.70 h | $5.29/h | **Failed attempt 4.** A counts-only run: write the new lesson sets, then count which experts each skill uses. A bug in the lesson writer gave the new skill jobs a weight of zero, so they wrote nothing, and the Forge stopped the card to limit the loss. 2,329 improved coding lessons from the run were kept after cleaning. Card time plus the drive's share. | $9.27 |
| 6 Nov 2026, midday | 1x H200 141 GB SXM + the rented network drive | 1.66 h | $5.29/h | **Lessons and counts for the re-cut.** The bug fixed, the run wrote 2,898 lessons across 14 skill sets and counted which experts each of 24 skills uses in the full model. Those counts set the coverage cut for every Bob from here on. Card time plus the drive's share. | $8.88 |
| 6 Nov 2026, morning to evening | 1x H200 141 GB SXM, no drive (none free in the drive's data centre) | 9.7 h | $5.29/h | **28Bob Riker.** Teacher pass (125 min, 26,628 pieces); 28Bob Riker (208 experts) cut and healed in a full pass (929 of 929 steps, 5.9 h); Q4, Q3 and adapter home. Benchmarked on 8 Nov and kept (see [Bob's own models](BOBS-OWN-MODELS.md#28bob-riker-the-one-that-stays)). Then a shell bug in the plan reader stopped 20Bob Bill v3 at its keep list and the machine deleted itself as designed, taking the full-precision Riker and the teacher's scores with it, because there was no drive. Both fixed in Forge build 15; the drive rule is now hard. Card time plus the working disk, from the rental service's statement. | $51.79 |
| 8 to 9 Nov 2026, overnight | 1x H200 141 GB SXM + the rented network drive (300 GB) | ~20 h | $5.29/h | **35Bob Bobert.** The full model wrote about 9,000 new lessons; teacher pass; 35Bob Bobert (256 experts, no cut — the full model trained on every lesson) in a full pass of 2,018 of 2,018 steps, 10.3 h at about 3,400 words a second with the fast kernels; Q4, Q3 and adapter home. Then the teacher-scoring pass, held to a 6 h budget, scored about 53% of the pieces (none skipped, no errors) and saved. About $105 of card time plus the 300 GB drive's share, from the rental service's statement. | $108.75 |
| 9 Nov 2026, morning | 1x H200 141 GB SXM, wrong data centre | 5 min | $5.29/h | **Failed attempt 5.** The rebuild-and-publish run below, first try. The renter could not get a card where the drive is, so it made two empty drives elsewhere (deleted the same hour) and took a card in one of them, where Bobert's adapter is not; a shell ordering bug then stopped it in its first minute. Nothing made. Both fixed in Forge before the second try. | $0.40 |
| 9 Nov 2026, morning | 1x H200 141 GB SXM + the rented network drive | 1.0 h | $5.29/h | **Riker and Bobert rebuilt and published.** No training: each Bob was put back together from the stock model, his keep list and his adapter, exported to Q4 and Q3, and uploaded to Hugging Face with his cards, adapter and keep list. Riker (28Bob) went up public with his full-size weights as well ([MouseWurX/28Bob-Riker](https://huggingface.co/MouseWurX/28Bob-Riker)). Bobert (35Bob) went up private until his home test; his full-size weights did not upload (see the next row). Card time plus the drive's share. | $5.44 |
| 9 Nov 2026, afternoon | 1x H100 80 GB SXM + the rented network drive | 8 min | $3.99/h | **Bobert's full-size weights, second try.** An upload-only run from the drive; Hugging Face refused both tries: the account's private storage limit was reached (public repos such as Riker's are not counted). The weights stay safe on the drive; they go up once Bobert is public after his home test, or if the account gets more private room. The card deleted itself. | $0.34 |
| 10 to 11 Nov 2026 | 1x H200 141 GB SXM + the rented network drive | 18.2 h | $5.29/h | **20Bob Bill, made and published.** Cut from Bobert (144 experts per layer, the keep list built on the owner's PC) and healed against Bobert's saved next-word odds in one full pass (2,018 steps, 11.3 h): the odds from the Bobert run were reused, so no teacher pass. His Q4 and Q3 went to Hugging Face public ([MouseWurX/20Bob-Bill](https://huggingface.co/MouseWurX/20Bob-Bill)). Two things went wrong on the PC side: the Forge window there was closed from outside mid-heal, so the benchmark the card served was never measured, and the card then sat idle at the end for about two hours (about $11 of this row) until a new window deleted it. The Forge now deletes the card itself when a run ends. | $96.27 |
| 10 Nov 2026, morning | 1x H100 80 GB SXM + the rented network drive | 7 min | $3.99/h | **Bobert's full-size weights, third try: up.** The owner made the page public, which lifted the private storage limit, and the same upload-only run put all 21 shards on [MouseWurX/35Bob-Bobert](https://huggingface.co/MouseWurX/35Bob-Bobert). The card deleted itself; Bill's run on the same drive was not touched. | $0.44 |
| 11 Nov 2026, night | 1x H200 141 GB SXM + the rented network drive | 1.3 h | $5.29/h | **Bill's full-size weights published; benchmark and scans missed.** Bill was rebuilt from Bobert, his keep list and his adapter, and his full-size weights, adapter and cards went up to [MouseWurX/20Bob-Bill](https://huggingface.co/MouseWurX/20Bob-Bill). The head-to-head benchmark the card served failed on the PC side (a missing import, then the install folder's space cutting a path, then the PC's test files being older than the Forge's), and the four brain scans stopped at their checks because the rental image had no git. All fixed before the next run. The card deleted itself. | $6.84 |
| 11 Nov 2026, night | 1x A40 48 GB, no drive | 1.5 h | $0.59/h | **Riker, Bobert and Bill benchmarked side by side.** A benchmark-only run: each Bob's Q4 was served straight from his public page and the owner's PC ran the same two tests against each (results on [Bob's own models](BOBS-OWN-MODELS.md#the-three-side-by-side)). Both test commands were tried on the PC with a stand-in server before the card was rented. The card deleted itself. | $0.86 |
| 12 Nov 2026, early morning | 1x A40 48 GB, no drive | 2.7 h | $0.59/h | **Riker's experts per word.** A benchmark-only run of 28Bob Riker at 9 to 13 experts per word: 12 beat his built-in 8. The card deleted itself. | $1.65 |
| 12 Nov 2026, morning | 1x A40 48 GB, no drive | 0.5 h | $0.59/h | **Failed attempt 7.** The first brain-scan run for Riker and Bobert: the rental image had no card-ready engine, so the benchmark step was skipped. Fixed before the retry below. | $0.29 |
| 12 Nov 2026, morning | 1x A100 80 GB SXM, no drive | 0.75 h | about $1.83/h | **Failed attempt 8.** The first brain scan of gpt-oss-120b: the scan step crashed. Fixed before the next run. | $1.37 |
| 12 Nov 2026, morning to midday | 1x A40 48 GB, no drive | 3.1 h | $0.59/h | **Brain scans of Riker and Bobert.** Each was scanned at 12 experts per word to find which experts every job leans on. Worked. | $1.89 |
| 12 Nov 2026, afternoon to evening | 1x A100 80 GB PCIe, no drive | 6.3 h | about $1.81/h | **Brain scans of gpt-oss-120b and gpt-oss-20b.** Both scans finished, which gave the size curve for the 38B cut. The run's done signal failed, so the card kept running until it was deleted by hand (about $3 of idle time). | $11.35 |
| 12 Nov 2026, afternoon to evening | 1x H200 141 GB SXM, no drive | 4.4 h | $5.29/h | **New lessons and odds.** The large teacher wrote about 1,700 lessons across 10 sets, with its next-word odds for teaching. Worked. | $23.35 |
| 13 Nov 2026, early morning | 1x A100 80 GB PCIe, no drive | 0.8 h | about $2.11/h | **The 38B cut, second version.** gpt-oss-120b's last layer was re-scored and the 38B was re-cut and published. Worked. The card deleted itself. | $1.67 |
| 13 Nov 2026, early morning | 1x H200 141 GB SXM + the rented network drive | 0.7 h | $5.29/h | **Failed attempt 9.** The first facts round for Bobert: training worked, but the export to Q4 crashed. Fixed before the retry below. | $3.70 |
| 13 Nov 2026, morning | 1x H200 141 GB SXM + the rented network drive | 0.8 h | $5.29/h | **Bobert's facts round.** A short training pass on corrected facts, benchmarked against stock Qwen: facts improved and nothing else dropped. Not published. The card deleted itself. | $4.32 |
| 13 Nov 2026, morning to afternoon | 1x H200 141 GB SXM, no drive | 5.8 h | $5.29/h | **New lessons and Riker's checks.** The large teacher wrote a new round of lessons. Then Riker was interviewed on every tool group and scored job by job at his stock settings, with an evidence-only safety check that is never used for training. Three of Riker's steps stopped with errors, and the planned sweep of his dials and keep lists did not run. The card deleted itself. | $31.07 |
| 14 Nov 2026, night | 1x A40 48 GB, no drive | 0.4 h | $0.59/h | **Failed attempt 10.** Riker's tool interview, first try: its safety gate stopped the run because the engine returned no expert traces. Nothing kept. | $0.23 |
| 14 Nov 2026, night | 1x A40 48 GB, no drive | 0.45 h | $0.59/h | **Failed attempt 11.** Bobert's tool interview, first try: the card never opened, so it was deleted. Nothing run. | $0.28 |
| 14 Nov 2026, night | 1x A40 48 GB, no drive | 0.2 h | $0.59/h | **Failed attempt 12.** Bobert's tool interview, second try: the card stuck the same way and was deleted. | $0.11 |
| 14 Nov 2026, early morning to evening | 1x A40 48 GB, no drive | 13.3 h | $0.59/h | **Riker's and Bobert's tool interviews, and a patching study.** One card ran three jobs in turn. Riker's tool interview took about 5 h: stock Riker gets about 58% of Bob's tool jobs right with thinking off, and no rewording, dial or experts-per-word setting beat him. The patching study took about 2.3 h: steering runs and an expert sweep found no single expert or neuron group that makes him cruel. Then came about 2.3 h of Riker redos after plan restarts, and Bobert's tool interview took the last 3.7 h. Both interviews finished. The card deleted itself. Evidence only, never used for training. | $8.06 |
| 14 Nov 2026, early morning | 1x A40 48 GB, no drive | 0.5 h | $0.59/h | **Failed attempt 13.** A Riker study run: the card never opened, so it was deleted. | $0.31 |
| 14 Nov 2026, early morning | 1x L40S 48 GB, no drive | 0.2 h | $1.09/h | **Failed attempt 14.** The same run, retried on another card: it never answered within 10 minutes, so it was deleted. | $0.21 |
| 14 Nov 2026, morning | 1x A40 48 GB, no drive | 2.3 h | $0.59/h | **Lesson-kit trial.** Stock Qwen3.6-35B-A3B wrote two trial lesson sets for the new lesson kit. Worked. The card deleted itself. | $1.39 |
| 15 Nov 2026, early morning | 1x A40 48 GB, no drive | 2.1 h | $0.59/h | **Riker's cruelty study.** The 16 experts that lean towards a cruel persona were muted one test at a time: they turn out to act as a shared brake, and muting them made cruel-persona answers 2 to 3 points harsher. Evidence only, never used for training. The card deleted itself. From the rental service's statement. | $1.29 |
| 15 Nov 2026, early morning to morning | 1x A100 80 GB, no drive | 5.5 h | about $2.14/h | **GPT-OSS 20B tool coaching.** The smaller GPT-OSS was coached and scored on Bob's tool jobs. Finished. The card deleted itself. | $11.75 |
| 15 Nov 2026, morning | 2x A40 48 GB, no drive | 0.35 h and 0.34 h | $0.59/h | **Failed attempts 15 and 16.** Two cards for the first lesson rewrite never answered, so both were deleted. Nothing run. | $0.41 |
| 15 Nov 2026, morning | 1x RTX A6000 48 GB, no drive | 0.8 h | $0.69/h | **Lesson rewrite, round 1.** Stock Qwen as the teacher rewrote failed tool lessons. Opus then sorted them, and most still needed work. | $0.56 |
| 15 Nov 2026, morning | 1x A40 48 GB, no drive | 0.6 h | $0.59/h | **Failed attempt 17.** Riker's feature study, first try: the card never answered and was deleted by hand. | $0.35 |
| 15 Nov 2026, morning | 1x RTX A6000 48 GB, no drive | 1.2 h | $0.69/h | **Lesson rewrite, round 2.** 94 lessons saved before it was stopped by hand, none reviewed yet. 39 failed their review twice. | $0.84 |
| 15 Nov 2026, morning | 1x A40 48 GB, no drive | 0.4 h | $0.59/h | **Failed attempt 18.** Riker's feature study, second try: its gate stopped it because the feature dictionary explained less than half of what it was meant to. | $0.26 |
| 15 Nov 2026, morning | 1x L40S 48 GB, no drive | 0.7 h | about $1.09/h | **Riker's feature study.** The third try finished. Research only, never used for training. | $0.76 |
| 15 Nov 2026, morning | 1x RTX A6000 48 GB, no drive | 0.45 h | $0.69/h | **Lesson rewrite, round 3.** Its quality gate stopped it at 1 good lesson in the first 10. | $0.32 |
| 15 Nov 2026, morning | 1x RTX A6000 48 GB, no drive | 0.5 h | $0.69/h | **Lesson-kit sample.** The quality gate stopped it at 2 good lessons in 10. | $0.36 |
| 15 Nov 2026, morning | 1x A40 48 GB, no drive | 0.8 h | $0.59/h | **Failed attempt 19.** A tool-shape retest: the connection kept failing at the end, and the card was deleted before its logs were saved. | $0.49 |
| 15 Nov 2026, late morning | 1x RTX A6000 48 GB, no drive | 0.5 h | $0.69/h | **Lesson-kit sample, with step redo.** The gate stopped it at 0 in 10. **Lesson learned:** stock Qwen writes about 1 lesson in 10 at Opus's bar as a teacher, so lessons now come from brains doing real jobs instead (see [How we test brains](TESTING.md)). | $0.36 |
| 15 Nov 2026, midday | 1x H200 141 GB SXM, no drive | 0.45 h | $5.29/h | **Lesson-kit sample with a bigger teacher.** Finished. | $2.42 |
| 15 Nov 2026, evening | 1x H200 141 GB SXM, no drive | 0.45 h | $5.29/h | **Real jobs, trial 1.** 45 real jobs in Bob's real loop, read by Opus: 8 keep, 28 fix, 3 discard, 6 decided by a broken test world. | $2.39 |
| 16 Nov 2026, early morning | 1x H200 141 GB SXM, no drive | 0.33 h | $5.29/h | **Real jobs, trial 2.** 45 of 45 answered: 14 keep, 28 fix, 1 discard, 2 cut off. | $1.77 |
| 16 Nov 2026, early morning | 1x L40S 48 GB, no drive | 2.15 h | about $1.09/h | **Distilled Qwen on 100 real jobs, five settings.** 500 runs, 0 runner errors, graded blind by Opus. The card deleted itself. | $2.38 |
| 16 Nov 2026, early morning | 1x H200 141 GB SXM, no drive | 0.43 h | $5.29/h | **Real jobs, trial 3, first try.** 45 of 45 clean. Then the privacy gate stopped the long run on a false alarm, an ordinary word holding a private name. The gate now warns instead. | $2.27 |
| 16 Nov 2026, morning | 1x H200 141 GB SXM, no drive | 3.65 h | $5.29/h | **The 800-job run.** 402 keep, 315 fix, 36 discard, and 47 runs decided by the test world, not the brain. That led to the harness fixes and the self-test (see [How we test brains](TESTING.md)). | $19.42 |
| 16 Nov 2026, morning to midday | 1x L40S 48 GB, no drive | 2.2 h | about $1.09/h | **Effort levels, Minimus to Maximus, on 100 real jobs.** Finished, but the card couldn't delete itself, because the rental service had retired the address it used. It sat idle for about 33 minutes until it was deleted by hand. | $2.44 |
| 16 Nov 2026, afternoon | 1x L40S 48 GB, no drive | 0.37 h | about $1.09/h | **Failed attempt 20.** The Maximus rerun's first card froze while starting up and was deleted. | $0.41 |
| 16 Nov 2026, afternoon | 1x A100 80 GB, no drive | 0.36 h | about $2.10/h | **GPT-OSS 120B, 45 real jobs.** 45 of 45 answered, 0 errors: 33 keep, 11 fix, 1 discard. The first rental on the rental service's new address. The card deleted itself. | $0.76 |
| 16 Nov 2026, afternoon | 1x RTX 6000 Ada 48 GB, no drive | 1.5 h | $1.09/h | **The inbox test.** 30 mail jobs at all four effort levels, 120 runs, graded blind: 10 right, 41 partly, 67 failed. This led to the mail catalog. | $1.68 |
| 16 Nov 2026, afternoon | 1x RTX 6000 Ada 48 GB, no drive | 1.0 h | $1.09/h | **Maximus again, with the fixes.** 100 of 100, 0 errors. The card deleted itself. | $1.10 |
| | | **about 149 h of card time** | | **Twenty failed attempts: $24.97, plus the stopped Bill step above. Seven Bobs made; Riker (28Bob), Bobert (35Bob) and Bill (20Bob) are kept, the first Riker and Bill (v1 and v2) are retired and deleted.** | **$549.26** |

The total is taken from the rental service's statement; the lines above are rounded to the cent. Card time is paid from **prepaid credit**: the owner loads a balance onto the rental account in advance and each session draws it down, so that money is spent on the day it is loaded and used only when a card runs. The unused part is not shown here (no balances on these pages); it is already earmarked for the rungs still to make. A 100 GB network drive rented from the same service (it keeps the teacher weights, general text and adapters between sessions, so a session needs no re-download) costs about $7 a month while it exists, and more as it grows: Bobert's run used it at 300 GB (about $21 a month) and Bill's at 500 GB (about $35 a month). It is 500 GB now, and it draws on the same prepaid credit every day it exists, run or no run: about $1.17 a day. That is counted as its own line in the totals below.

### 16 to 23 Nov 2026: from the run write-ups

> **Not from the statement.** These costs come from each run's own write-up in [the dissertation](dissertation/README.md) (chapters 4 and 11), not from the rental service's bill. Where a write-up didn't name the card, it says "one rented card". Rentals from these days with no cost in a write-up are not listed yet: the Linux expert-RAM test (patch 0109), the REAP keep-level runs and the 16 GB crash rounds of 24 and 25 Nov.

| Date | Card | What happened | Cost |
|---|---|---|---|
| 16 to 17 Nov 2026 | 1x RTX 6000 Ada 48 GB | **after1, stock Qwen3.6 35B:** 200 real jobs at Minimus, 30 mail jobs at three effort levels, 17 Office jobs. | about $1.06 |
| 16 to 17 Nov 2026 | 1x A100 80 GB | **after1, GPT-OSS 120B:** the same 200 real jobs at Minimus. | about $1.04 |
| 21 Nov 2026 | one rented card | **after2:** the after1 mail jobs at two effort levels plus 36 Office jobs, 96 runs. | about $0.40 |
| 21 Nov 2026 | one rented card | **Failed attempt.** 300 everyday jobs stopped after 41: the web search was blocked. Rerun in steps40. | about $0.41 |
| 21 Nov 2026 | one rented card | **steps40:** 66 after2 jobs and about 260 everyday jobs, with a keyed search service and no 10-minute cutoff. | about $0.69 |
| 21 Nov 2026 | one rented card | **repo1:** 33 jobs on a throwaway copy of Bob's own code, scored by code. | about $0.41 |
| 21 Nov 2026 | one rented card | **Harness comparison:** the same 33 jobs in two open coding harnesses, scored by the same code. | about $0.62 |
| 21 to 22 Nov 2026 | one rented card | **Flash-Next IQ3 file in Bob,** on the job sets. | $3.22 |
| 21 to 22 Nov 2026 | one rented card | **Flash-Next Q2 file in Bob,** on the job sets. It also found a real Bob bug (an edit with several changes reported the file missing), fixed. | $2.74 |
| 22 Nov 2026 | one rented card | **held1:** stock Qwen on the new held-out jobs, written once and never tuned on. | $0.61 |
| 22 to 23 Nov 2026 | one rented card | **Redirecting cut experts to kept ones,** two tries. Tied on Office, lost clearly on inbox finding. | $7.55 |
| 23 Nov 2026 | 1x RTX 5090 32 GB | **FP4 experts on Qwen 35B.** Failed its gate; dropped for squeezed brains. | about $2.55 |
| 23 Nov 2026 | H200 NVL, then RTX PRO 6000 96 GB | **The three Flash-Next cuts** (Bobert, Riker, Bill) and the mixed-bit retest: Bobert $23.86, Bill and Riker $17.87, retest $7.14. | $48.87 |
| | | **13 rentals with a written-up cost** | **about $70.17** |

### 24 to 27 Nov 2026: from the rental logs

> **Estimates, not billed.** Each cost is the pod's listed hourly rate times the time from rent to delete, from the rental tool's own logs. The real bill can differ a little (per-second billing, the container disk). The key the rentals use can't read the bill, so the billed figures need the owner to check the rental service's billing page. "Ran for" is worked back from the cost and the rate. Times are the owner's local time.

| Date | Card | Ran for | Rate | What happened | Cost |
|---|---|---|---|---|---|
| 25 to 26 Nov 2026 | 1x RTX A6000 48 GB | about 11 min | $0.69/h | Hard maths loop sweep (easy maths), first try. | $0.13 |
| 25 to 26 Nov 2026 | 1x A40 48 GB | about 45 min | $0.59/h | Hard maths loop sweep (easy maths). | $0.44 |
| 26 Nov 2026, morning | 1x RTX A4500 20 GB | about 2 min | $0.25/h | Ternary Bonsai check, first try. | $0.01 |
| 26 Nov 2026, morning | 1x RTX 4090 24 GB | about 26 min | $0.89/h | **Ternary Bonsai 2.5 27B check.** Same words as the reference build on 3 of 3 prompts for both files. | $0.39 |
| 26 Nov 2026, morning | 1x A40 48 GB | about 7.6 h | $0.59/h | **Hard maths sweep rerun.** Includes about 34 minutes idle after the session stopped. | $4.51 |
| 26 Nov 2026, morning | 1x L4 24 GB | about 44 min | $0.69/h | **Saluki 27B check.** Same words as stock on 3 of 3 prompts; long recall at 103K passed; 11 of 12 quick tool jobs. | $0.51 |
| 26 Nov 2026, morning | 1x RTX 6000 Ada 48 GB | about 3 min | $1.09/h | Brain jobs, first try. | $0.06 |
| 26 Nov 2026, morning | 1x L40S 48 GB | about 2 min | $1.09/h | Brain jobs, a 17-brain launch deleted at once. | about $0.04 |
| 26 Nov 2026, morning | 1x L40S 48 GB | about 3.1 h | $1.09/h | **Brain jobs, 8 brains** on the held-out jobs (results in [How we test](TESTING.md)). | $3.39 |
| 26 Nov 2026, afternoon | 1x L40S 48 GB | about 3.6 h | $1.09/h | Abliterated brains on the held-out jobs. | $3.88 |
| 26 Nov 2026, afternoon | 1x L40S 48 GB | about 50 min | $1.09/h | Office jobs add-on for the brain jobs. | $0.90 |
| 26 Nov 2026, afternoon | 1x RTX 4090 24 GB |  | $0.89/h | Turbo matrix, first try, restarted. | not logged |
| 26 Nov 2026, afternoon | 1x RTX 4090 24 GB | about 9.0 h | $0.89/h | **Turbo matrix.** Every Turbo trick tried for speed and answers. | $8.00 |
| 26 Nov 2026, afternoon | 1x L40S 48 GB | about 32 min | $1.09/h | Upstream fixes A/B, round 1. | $0.58 |
| 26 Nov 2026, afternoon | 1x RTX 4090 24 GB | about 13 min | $0.89/h | GSQ pilot, first try. | $0.19 |
| 26 Nov 2026, afternoon | 1x L40S 48 GB | about 39 min | $1.09/h | **Failed start.** Upstream A/B round 2: the card never came up. | about $0.70 |
| 26 Nov 2026, afternoon | 1x RTX 4090 24 GB | about 47 min | $0.89/h | **Failed start.** GSQ pilot: the card never came up. | about $0.70 |
| 26 Nov 2026, afternoon | 1x RTX PRO 6000 96 GB | about 3.0 h | $2.69/h | **Failed attempt.** Bill rerun: stopped because Bob's source was missing on the card. | $7.96 |
| 26 Nov 2026, afternoon | 1x RTX A5000 24 GB | about 22 min | $0.27/h | GSQ pilot, second try. | $0.10 |
| 26 Nov 2026, afternoon | 1x L40S 48 GB | about 1.1 h | $1.09/h | Upstream fixes A/B, round 2. | $1.22 |
| 26 Nov 2026, afternoon | 1x L4 24 GB | about 35 min | $0.69/h | **1.5.255 release check, try 1.** The engine never came up. | $0.40 |
| 26 Nov 2026, afternoon | 1x RTX 4090 24 GB | about 1.1 h | $0.89/h | **GSQ pilot, third try.** Worked: learned 2-bit rounding drifted far less than stock. | $0.97 |
| 26 Nov 2026, afternoon | 1x H200 141 GB | about 4.7 h | $5.29/h | **Untested brains, wave 1:** Flash-Next and its cuts. | $24.73 |
| 26 Nov 2026, afternoon | 1x L40S 48 GB | about 1.4 h | $1.09/h | Untested brains, wave 1, lane 1. | $1.52 |
| 26 Nov 2026, afternoon | 1x L40S 48 GB | about 1.3 h | $1.09/h | Untested brains, wave 1, lane 2. | $1.40 |
| 26 Nov 2026, afternoon | 1x L40S 48 GB | about 2.3 h | $1.09/h | Untested brains, wave 1, lane 3. | $2.55 |
| 26 Nov 2026, afternoon | 1x RTX 6000 Ada 48 GB | about 2.2 h | $1.09/h | Untested brains, wave 1, lane 4. | $2.39 |
| 26 Nov 2026, evening | 1x RTX 4090 24 GB | about 1.9 h | $0.89/h | Untested brains, wave 1, small lane 1. | $1.72 |
| 26 Nov 2026, evening | 1x RTX 4090 24 GB | about 1.5 h | $0.89/h | Untested brains, wave 1, small lane 2. | $1.33 |
| 26 Nov 2026, evening | 1x RTX 4090 24 GB | about 1.3 h | $0.89/h | Untested brains, wave 1, small lane 3. | $1.19 |
| 26 Nov 2026, evening | 1x A40 48 GB | about 5.3 h | $0.59/h | Hard maths dial confirm. | $3.15 |
| 26 Nov 2026, evening | 1x RTX 2000 Ada 16 GB | about 25 min | $0.24/h | **1.5.255 release check, try 2.** Found a real Linux bug: the engine's own files weren't found outside its build folder. Fixed. | $0.10 |
| 26 Nov 2026, evening | 1x RTX PRO 6000 96 GB | about 5.4 h | $2.69/h | **Failed attempt.** Bill GSQ, first try. Cause fixed before the rerun. | $14.49 |
| 26 Nov 2026, evening | 1x L40S 48 GB | about 3.3 h | $1.09/h | Uncensored brains, wave 2, lane 4. | $3.59 |
| 26 Nov 2026, evening | 1x L40S 48 GB | about 1.3 h | $1.09/h | Uncensored brains, wave 2, lane 1. | $1.47 |
| 26 Nov 2026, evening | 1x L40S 48 GB | about 2.0 h | $1.09/h | Uncensored brains, wave 2, lane 2. | $2.14 |
| 26 Nov 2026, evening | 1x L40S 48 GB | about 14 min | $1.09/h | Wave 2, lane 3, paused to make room for the release check. | about $0.25 |
| 26 Nov 2026, evening | 1x RTX 2000 Ada 16 GB | about 15 min | $0.24/h | **1.5.255 release check, try 3**, through Bob's own installer. Found a second Linux bug: the install broke the engine's file links. Fixed. | $0.06 |
| 26 Nov 2026, evening | 1x L40S 48 GB | about 2.2 h | $1.09/h | Uncensored brains, wave 2, lane 3. | $2.36 |
| 26 Nov 2026, evening | 2x RTX 4090 24 GB |  | $0.89/h | Wave 2, small lane 1, paused twice for the release check. | about $0.35 |
| 26 Nov 2026, evening | 1x RTX A4000 16 GB | about 14 min | $0.25/h | **1.5.255 release check, try 4.** The engine was stopped while loading the brain (Bob said there wasn't enough free memory). | $0.06 |
| 26 Nov 2026, night | 1x RTX 4090 24 GB | about 1.2 h | $0.89/h | Phone brains, first check. | $1.11 |
| 26 Nov 2026, night | 1x RTX 2000 Ada 16 GB | about 1.4 h | $0.24/h | 1.5.255 release check, try 5, stopped. | $0.33 |
| 26 Nov 2026, night | 1x RTX 4090 24 GB | about 2.5 h | $0.89/h | Uncensored brains, wave 2, small lane 1. | $2.22 |
| 26 Nov 2026, night | 1x RTX 4090 24 GB | about 1.1 h | $0.89/h | Turbo Office rerun. | $1.01 |
| 26 Nov 2026, night | 1x RTX 4090 24 GB | about 1.3 h | $0.89/h | Uncensored brains, wave 2, small lane 2. | $1.19 |
| 26 Nov 2026, night | 1x RTX 2000 Ada 16 GB | about 33 min | $0.24/h | 1.5.255 release check, try 6: a test-side stop (no tool call on the repo jobs). | $0.13 |
| 27 Nov 2026, early morning | 1x RTX 2000 Ada 16 GB | about 52 min | $0.24/h | **1.5.255 release check, try 7: passed.** No engine crashes; every held-out set ran (mail 28 of 28, Office 14 of 14, repo 11 of 12, web 11 of 11). 1.5.255 shipped after it. | $0.21 |
| 27 Nov 2026, morning | 1x RTX 4090 24 GB | about 1.7 h | $0.89/h | **Phone brains with Dory**, tool jobs and the phone engine check. | $1.52 |
| 27 Nov 2026, morning | 1x L40S 48 GB | about 3 min | $1.09/h | Photo test, first try, stopped. | about $0.05 |
| | | | | **50 rentals. Logged: $105.61; the rows marked "about", plus one not logged, add about $2.50.** | **about $108** |

**Still running when this was written (27 Nov 2026, morning), not counted:** the Bill GSQ rerun (RTX PRO 6000, $2.69/h), the photo test on 10 brains (L40S, $1.09/h) and the Ling 3.2 Air check (A100 80 GB, $2.09/h). **Also not counted:** the first Bill pod, left idle for about 1.6 h (about $4.35, counted in the totals below), and the GPU tier sweep, which never rented ($0).

**What the 1.5.255 release check bought.** Seven tries on rented Linux cards (the first on a 24 GB card, the rest on 16 GB cards) cost about $1.29 in all, and found four real bugs before the release shipped: the engine's own files weren't found outside its build folder, Bob's engine install broke the engine's file links, the copy cache left no room for the picture reader, and the chat cache in RAM counted only part of the brain (and not a container's memory limit). All four are fixed in 1.5.255.

### Tools and subscriptions

| What | Cost |
|---|---|
| Claude subscription (Anthropic): Claude is a contributor to the project and writes much of Bob's code, docs and Help alongside the owner | $200 a month |
| Claude extra usage bought from 5 Nov 2026 on, to finish the models and the app work together | $2,000 so far |
| Code signing | $0 so far (SignPath Foundation application declined in Nov 2026 for lack of public visibility; builds stay unsigned) |
| Code and release hosting (GitHub) and, later, model hosting (Hugging Face) | $0 |
| Electricity for the lessons, counts and benchmarks on the owner's own PC | not counted |

## Projected: the rest of the family

> **Revised 12 November 2026.** The first cut rule protected no skill and the coding lessons were weak (see [What went wrong with the first cut](BOBS-OWN-MODELS.md#what-went-wrong-with-the-first-cut)), so the ladder was started again with new lessons. **28Bob Riker**, **35Bob Bobert** (the full model trained on every lesson, no cut) and **20Bob Bill** (cut from Bobert) are all done, published and paid for ($51.79, $108.75 and $96.27, above). Next, when the owner gives the word, is **14Bob Homer**. The rungs below follow the current plan, a ladder of six redrawn on 6 November after the coverage table: Mario and Goku are dropped and Luke moves to 7Bob.

These are estimates. They assume one full-pass heal with nothing trimmed at the 16k lesson length, about 5 to 5.5 hours of card time per rung, at by-the-hour rental rates from November 2026 that move weekly; each line is re-checked on the day it is rented.

### Line B (Bob lessons + coding lessons), the line being built now

| Rung | Nickname | Experts kept per layer | Card | Projected |
|---|---|---|---|---|
| 35Bob | Bobert | 256, no cut: trained on every lesson | done (above) | $0 |
| 28Bob | Riker | 208, coverage cut | done (above) | $0 |
| 20Bob | Bill | 144, coverage cut, cut from Bobert | done (above) | $0 |
| 14Bob | Homer | 96 | H200 | $29 |
| 10Bob | Milo | 64 | H100 | $20 |
| 7Bob | Luke | 40 | H100 | $20 |
| 5Bob | Calvin | 24, kept only if it beats a stock 4B model | H100 | $20 |
| 2Bob | Bender | 8, plus depth and width cuts (a stretch goal) | H100, longest heal | $30 to $40 |
| | **Line B, remaining rungs** | | | **$119 to $129** |

### Specialists (line B, each cut from the general Bob one size up with its own expert count)

| Model | Job | Lessons for the job | Heal | Projected |
|---|---|---|---|---|
| 8Bob Cypher | coding | $5 | $20 | $25 |
| 8Bob Ponder | deep thinking | $5 | $20 | $25 |
| 5Bob Cypher | coding | $5 | $20 | $25 |
| 5Bob Audit | reviewing | $5 | $20 | $25 |
| | **Specialists, total** | | | **$100** |

### Line A (Bob lessons only), only if the comparison after Homer says it's worth keeping

Line A's full-precision Riker was lost with its machine, so line A starts with two re-heals.

| Rung | Nickname | Card | Projected |
|---|---|---|---|
| 28Bob Riker A and 20Bob Bill A, healed with full passes | | H100 or H200 | $60 |
| 14Bob Homer A | Homer | H200 | $29 |
| 10Bob Milo A | Milo | H100 | $20 |
| 7Bob Luke A | Luke | H100 | $20 |
| 5Bob Calvin A | Calvin | H100 | $20 |
| 2Bob Bender A | Bender | H100 | $30 to $40 |
| | **Line A, total if kept** | | **$179 to $189** |

### Other projected costs

| What | Projected |
|---|---|
| Rented network drive, about 2 more months at 500 GB (about $35 a month, from the prepaid credit, whether or not a card is running) | about $70 |
| Benchmarks, exports and the Hugging Face uploads | about $6 a Bob when done on a card (Riker and Bobert, 9 Nov: $5.84 with the false start; Bill, 11 Nov: $6.84); $0 when done on the owner's PC |
| Re-runs: one per rung if a heal scores badly | up to $20 each |
| Code signing, when the project is visible enough | $0 (reapply to the SignPath Foundation, a free signing service for open-source projects), or about $10 a month for a cloud code-signing service, or $100 to $400 a year for a code-signing certificate |

### Totals

**Spent so far, everything included**

| | |
|---|---|
| GPU servers rented by the hour, 4 to 16 Nov 2026 (from the rental service's statement, failures included) | $549.26 |
| GPU servers, 16 to 23 Nov 2026 (from the run write-ups, not billed) | about $70.17 |
| GPU servers, 24 to 27 Nov 2026 (from the rental logs, not billed) | about $108 |
| The first Bill pod, left idle about 1.6 h (from the rental logs) | about $4.35 |
| Rented network drive between sessions, 5 to 16 Nov 2026 (100 GB, then 300, then 500; from its size and rate, then the statement from 13 Nov) | about $7.36 |
| Rented network drive since 16 Nov 2026 | not counted yet (the rentals' key can't read it) |
| Claude subscription, November 2026 | $200.00 |
| Claude extra usage, bought from 5 Nov 2026 on | $2,000.00 |
| Code signing, hosting | $0.00 |
| **Total spent so far** | **about $2,940** |

Not in that total yet: the three rentals still running on 27 Nov, the 16 to 23 Nov rentals with no written-up cost, the drive since 16 Nov, and any Claude extra usage bought since 16 Nov. The figures since 16 Nov are estimates until they are checked against the statement.

**Projected, whole plan**

| | Low | High |
|---|---|---|
| Spent so far (above) | $2,940 | $2,940 |
| Test rentals already planned: the mail and real-jobs run on all the fixes, and GPT-OSS on the same jobs (about 3 h each) | $6 | $10 |
| Line B remaining rungs (Homer to Bender) | $119 | $129 |
| Four brain scans (stock Qwen, Riker, Bobert, Bill) on one short rental (planned) | $10 | $14 |
| Specialists (four, with their lessons) | $100 | $100 |
| Rented network drive, about 2 more months at 500 GB | $70 | $70 |
| Re-runs allowed (one per rung if a heal scores badly) | $0 | $60 |
| Claude subscription while the family is finished, about 1 more month | $200 | $200 |
| **Projected total, line B complete** | **about $3,445** | **about $3,523** |
| Line A as well, if the comparison after Homer earns it | +$179 | +$189 |
| **Projected total, both lines** | **about $3,624** | **about $3,712** |
