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
| 5 Nov 2026, morning to night | 1x H200 141 GB SXM | 13.6 h | $5.29/h | **Line B session.** The full model wrote 717 coding and software-engineering lessons; teacher pass; 24Bob Riker v2 full pass (524 of 524 steps, 4.8 h); 18Bob Bill v2 cut from Riker v2, full pass; exports and adapters. $71.94 of card time plus the 350 GB working disk and the first hours of the rented network drive. **Lesson learned:** the run reused the v1 keep list unchecked (it had kept only 92% of coding's routing, with no rule protecting any skill), and 37% of the coding lessons taught the model to hand code off rather than write it, so the run could not lift coding (see [What went wrong with the first cut](BOBS-OWN-MODELS.md#what-went-wrong-with-the-first-cut)). Both Bobs will be re-cut; the healed weights and adapters are kept. | $72.67 |
| 6 Nov 2026, morning | 1x H200 141 GB SXM + the rented network drive | 1.70 h | $5.29/h | **Failed attempt 4.** A counts-only run: write the new lesson sets, then count which experts each skill uses. A bug in the lesson writer gave the new skill jobs a weight of zero, so they wrote nothing, and the Forge stopped the card to limit the loss. 2,329 improved coding lessons from the run were kept after cleaning. Card time plus the drive's share. | $9.27 |
| 6 Nov 2026, midday | 1x H200 141 GB SXM + the rented network drive | 1.66 h | $5.29/h | **Lessons and counts for v3.** The bug fixed, the run wrote 2,898 lessons across 14 skill sets and counted which experts each of 24 skills uses in the full model. Those counts set the coverage cut for every Bob from here on. Card time plus the drive's share. | $8.88 |
| 6 Nov 2026, morning to evening | 1x H200 141 GB SXM, no drive (none free in the drive's data centre) | 9.7 h | $5.29/h | **Line B v3, first half.** Teacher pass (125 min, 26,628 pieces); 28Bob Riker v3 (208 experts) cut and healed in a full pass (929 steps, 5.9 h); Q4, Q3 and adapter home. Then a shell bug in the plan reader stopped 20Bob Bill v3 at its keep list and the machine deleted itself as designed, taking the full-precision Riker and the teacher's scores with it, because there was no drive. Both fixed in Forge build 15; the drive rule is now hard. Card time plus the working disk; from the balance, to the cent on the next statement. | about $51 |
| | | **about 37 h of card time** | | **Four failed attempts: $15.81, plus the half-run above. Five Bobs made; the current plan keeps Riker v3 and needs Bill v3.** | **about $183** |

The total is taken from the rental service's statement; the lines above are rounded to the cent. A 100 GB network drive rented from the same service (it keeps the teacher weights, general text and adapters between sessions, so a session needs no re-download) costs about $7 a month while it exists.

### Tools and subscriptions

| What | Cost |
|---|---|
| Claude subscription (Anthropic): Claude is a contributor to the project and writes much of Bob's code, docs and Help alongside the owner | $200 a month |
| Claude extra usage bought in November 2026 to finish the models and the app work together | $800 so far |
| Code signing | $0 so far (SignPath Foundation application declined in Nov 2026 for lack of public visibility; builds stay unsigned) |
| Code and release hosting (GitHub) and, later, model hosting (Hugging Face) | $0 |
| Electricity for the lessons, counts and benchmarks on the owner's own PC | not counted |

## Projected: the rest of the family

> **Revised 6 November 2026.** The first cut rule protected no skill and the coding lessons were weak (see [What went wrong with the first cut](BOBS-OWN-MODELS.md#what-went-wrong-with-the-first-cut)), so Riker and Bill are cut and healed again before Homer, with new lessons, and the keep lists of every rung below them change. The re-run is estimated from the line B session it repeats; the final figure replaces it when that session is paid for.

These are estimates. They assume one full-pass heal with nothing trimmed at the 16k lesson length, about 5 to 5.5 hours of card time per rung, at by-the-hour rental rates from November 2026 that move weekly; each line is re-checked on the day it is rented.

### Line B (Bob lessons + coding lessons), the line being built now

| Rung | Nickname | Experts kept per layer | Card | Projected |
|---|---|---|---|---|
| 24Bob v3 | Riker | coverage cut, likely about 208 (the owner picks the size) | H200, re-run of the line B session | $70 to $75 (with Bill) |
| 18Bob v3 | Bill | coverage cut, cut from Riker v3 | same session | included above |
| 12Bob | Homer | 80 | H200 | $29 |
| 10Bob | Milo | 64 | H100 | $20 |
| 8Bob | Mario | 48 | H100 | $20 |
| 6Bob | Luke | 32 | H100 | $20 |
| 5Bob | Calvin | 24 | H100 | $20 |
| 4Bob | Goku | 16 | H100 | $20 |
| 2Bob | Bender | 8, plus depth and width cuts | H100, longest heal | $30 to $40 |
| | **Line B, remaining rungs** | | | **$229 to $244** |

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
| 24Bob Riker A and 18Bob Bill A, re-healed with full passes | | H100 or H200 | $60 |
| 12Bob Homer A | Homer | H200 | $29 |
| 10Bob Milo A | Milo | H100 | $20 |
| 8Bob Mario A | Mario | H100 | $20 |
| 6Bob Luke A | Luke | H100 | $20 |
| 5Bob Calvin A | Calvin | H100 | $20 |
| 4Bob Goku A | Goku | H100 | $20 |
| 2Bob Bender A | Bender | H100 | $30 to $40 |
| | **Line A, total if kept** | | **$219 to $229** |

### Other projected costs

| What | Projected |
|---|---|
| Rented network drive, about 2 more months | about $14 |
| Benchmarks, exports and the Hugging Face upload | $0 (done on the owner's PC) |
| Re-runs: one per rung if a heal scores badly | up to $20 each |
| Code signing, when the project is visible enough | $0 (reapply to the SignPath Foundation, a free signing service for open-source projects), or about $10 a month for a cloud code-signing service, or $100 to $400 a year for a code-signing certificate |

### Totals

**Spent so far, everything included**

| | |
|---|---|
| GPU servers rented by the hour (every session above, failures included) | $132.11 |
| Rented network drive so far | included in the line B session line above |
| Claude subscription, November 2026 | $200.00 |
| Claude extra usage, November 2026 so far | $800.00 |
| Code signing, hosting | $0.00 |
| **Total spent so far** | **$1,132.11** |

**Projected, whole plan**

| | Low | High |
|---|---|---|
| Spent so far (above) | $1,132.11 | $1,132.11 |
| Line B remaining rungs (Homer to Bender) | $159 | $169 |
| Riker and Bill re-cut and healed again (coverage cut) | $70 | $75 |
| Specialists (four, with their lessons) | $100 | $100 |
| Rented network drive, about 2 more months | $14 | $14 |
| Re-runs allowed (one per rung if a heal scores badly) | $0 | $60 |
| Claude subscription while the family is finished, about 1 more month | $200 | $200 |
| **Projected total, line B complete** | **about $1,675** | **about $1,750** |
| Line A as well, if the comparison after Homer earns it | +$219 | +$229 |
| **Projected total, both lines** | **about $1,894** | **about $1,979** |
