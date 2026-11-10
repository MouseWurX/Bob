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
| 9 Nov 2026, morning | 1x H200 141 GB SXM + the rented network drive | 1.0 h | $5.29/h | **Riker and Bobert rebuilt and published.** No training: each Bob was put back together from the stock model, his keep list and his adapter, exported to Q4 and Q3, and uploaded to Hugging Face with his cards, adapter and keep list. Riker (28Bob) went up public with his full-size weights as well ([MouseWurX/28Bob-Riker](https://huggingface.co/MouseWurX/28Bob-Riker)). Bobert (35Bob) went up private until his home test; his full-size weights did not upload and are being looked at. Card time plus the drive's share. | $5.44 |
| | | **about 58 h of card time** | | **Five failed attempts: $16.21, plus the stopped Bill step above. Six Bobs made; Riker (28Bob) and Bobert (35Bob) are kept, the first Riker and Bill (v1 and v2) are retired and deleted, and Bill is next.** | **$298.49** |

The total is taken from the rental service's statement; the lines above are rounded to the cent. Card time is paid from **prepaid credit**: the owner loads a balance onto the rental account in advance and each session draws it down, so that money is spent on the day it is loaded and used only when a card runs. The unused part is not shown here (no balances on these pages); it is already earmarked for the rungs still to make. A 100 GB network drive rented from the same service (it keeps the teacher weights, general text and adapters between sessions, so a session needs no re-download) costs about $7 a month while it exists; Bobert's run used it at 300 GB (about $21 a month), and Bill's run will need it again.

### Tools and subscriptions

| What | Cost |
|---|---|
| Claude subscription (Anthropic): Claude is a contributor to the project and writes much of Bob's code, docs and Help alongside the owner | $200 a month |
| Claude extra usage bought from 5 Nov 2026 on, to finish the models and the app work together | $800 so far |
| Code signing | $0 so far (SignPath Foundation application declined in Nov 2026 for lack of public visibility; builds stay unsigned) |
| Code and release hosting (GitHub) and, later, model hosting (Hugging Face) | $0 |
| Electricity for the lessons, counts and benchmarks on the owner's own PC | not counted |

## Projected: the rest of the family

> **Revised 9 November 2026.** The first cut rule protected no skill and the coding lessons were weak (see [What went wrong with the first cut](BOBS-OWN-MODELS.md#what-went-wrong-with-the-first-cut)), so Riker and Bill are cut and healed again before Homer, with new lessons. Riker and **35Bob Bobert** (the full model trained on every lesson, no cut) are both done and paid for ($51.79 and $108.75, above). Next, when the owner gives the word, is **20Bob Bill**, cut from Bobert and healed in its own run of about 5 to 5.5 hours. The rungs below follow the current plan, a ladder of six redrawn on 6 November after the coverage table: Mario and Goku are dropped and Luke moves to 7Bob.

These are estimates. They assume one full-pass heal with nothing trimmed at the 16k lesson length, about 5 to 5.5 hours of card time per rung, at by-the-hour rental rates from November 2026 that move weekly; each line is re-checked on the day it is rented.

### Line B (Bob lessons + coding lessons), the line being built now

| Rung | Nickname | Experts kept per layer | Card | Projected |
|---|---|---|---|---|
| 35Bob | Bobert | 256, no cut: trained on every lesson | done (above) | $0 |
| 28Bob | Riker | 208, coverage cut | done (above) | $0 |
| 20Bob | Bill | 144, coverage cut, cut from Bobert | its own run (planned), H200 or H100 | $50 to $55 |
| 14Bob | Homer | 96 | H200 | $29 |
| 10Bob | Milo | 64 | H100 | $20 |
| 7Bob | Luke | 40 | H100 | $20 |
| 5Bob | Calvin | 24, kept only if it beats a stock 4B model | H100 | $20 |
| 2Bob | Bender | 8, plus depth and width cuts (a stretch goal) | H100, longest heal | $30 to $40 |
| | **Line B, remaining rungs** | | | **$169 to $184** |

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
| Rented network drive, about 2 more months (100 GB at about $7 a month, or 300 GB at about $21 during the Bobert and Bill runs) | $14 to $42 |
| Benchmarks, exports and the Hugging Face uploads | about $6 a Bob when done on a card (Riker and Bobert, 9 Nov: $5.84 with the false start); $0 when done on the owner's PC |
| Re-runs: one per rung if a heal scores badly | up to $20 each |
| Code signing, when the project is visible enough | $0 (reapply to the SignPath Foundation, a free signing service for open-source projects), or about $10 a month for a cloud code-signing service, or $100 to $400 a year for a code-signing certificate |

### Totals

**Spent so far, everything included**

| | |
|---|---|
| GPU servers rented by the hour (every session above, failures included) | $298.49 |
| Rented network drive so far | included in the line B session line above |
| Claude subscription, November 2026 | $200.00 |
| Claude extra usage, bought from 5 Nov 2026 on | $800.00 |
| Code signing, hosting | $0.00 |
| **Total spent so far** | **$1,298.49** |

**Projected, whole plan**

| | Low | High |
|---|---|---|
| Spent so far (above) | $1,298.49 | $1,298.49 |
| Line B remaining rungs (Homer to Bender) | $119 | $129 |
| 20Bob Bill, its own run (planned, not yet approved) | $50 | $55 |
| Specialists (four, with their lessons) | $100 | $100 |
| Rented network drive, about 2 more months (100 to 300 GB) | $14 | $42 |
| Re-runs allowed (one per rung if a heal scores badly) | $0 | $60 |
| Claude subscription while the family is finished, about 1 more month | $200 | $200 |
| **Projected total, line B complete** | **about $1,782** | **about $1,885** |
| Line A as well, if the comparison after Homer earns it | +$179 | +$189 |
| **Projected total, both lines** | **about $1,961** | **about $2,074** |
