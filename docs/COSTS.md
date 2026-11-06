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
| 5 Nov 2026, morning to night | 1x H200 141 GB SXM | 13.6 h | $5.29/h | **Line B session.** The full model wrote 717 coding and software-engineering lessons; teacher pass; 24Bob Riker v2 full pass (524 of 524 steps, 4.8 h); 18Bob Bill v2 cut from Riker v2, full pass; exports and adapters. $71.94 of card time plus the 350 GB working disk and the first hours of the rented network drive. | $72.67 |
| | | **24.0 h of card time** | | **Three failed attempts: $6.54. Four Bobs made.** | **$113.96** |

The total is taken from the rental service's statement; the lines above are rounded to the cent. A 100 GB network drive rented from the same service (it keeps the teacher weights, general text and adapters between sessions, so a session needs no re-download) costs about $7 a month while it exists.

### Tools and subscriptions

| What | Cost |
|---|---|
| Claude subscription (Anthropic): Claude is a contributor to the project and writes much of Bob's code, docs and Help alongside the owner | $200 a month |
| Claude extra usage bought on 5 Nov 2026 to finish the models and the app work together | $350 one-off |
| Code signing | $0 so far (SignPath Foundation application declined in Nov 2026 for lack of public visibility; builds stay unsigned) |
| Code and release hosting (GitHub) and, later, model hosting (Hugging Face) | $0 |
| Electricity for the lessons, counts and benchmarks on the owner's own PC | not counted |

## Projected: the rest of the family

These are estimates. They assume one full-pass heal with nothing trimmed at the 16k lesson length, about 5 to 5.5 hours of card time per rung, at by-the-hour rental rates from November 2026 that move weekly; each line is re-checked on the day it is rented.

### Line B (Bob lessons + coding lessons), the line being built now

| Rung | Nickname | Experts kept per layer | Card | Projected |
|---|---|---|---|---|
| 24Bob | Riker | 176 | done (above) | $0 |
| 18Bob | Bill | 128 | done (above) | $0 |
| 12Bob | Homer | 80 | H200 | $29 |
| 10Bob | Milo | 64 | H100 | $20 |
| 8Bob | Mario | 48 | H100 | $20 |
| 6Bob | Luke | 32 | H100 | $20 |
| 5Bob | Calvin | 24 | H100 | $20 |
| 4Bob | Goku | 16 | H100 | $20 |
| 2Bob | Bender | 8, plus depth and width cuts | H100, longest heal | $30 to $40 |
| | **Line B, remaining rungs** | | | **$159 to $169** |

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
| GPU servers rented by the hour (every session above, failures included) | $113.96 |
| Rented network drive so far | included in the line B session line above |
| Claude subscription, November 2026 | $200.00 |
| Claude extra usage, bought 5 Nov 2026 | $350.00 |
| Code signing, hosting | $0.00 |
| **Total spent so far** | **$663.96** |

**Projected, whole plan**

| | Low | High |
|---|---|---|
| Spent so far (above) | $663.96 | $663.96 |
| Line B remaining rungs (Homer to Bender) | $159 | $169 |
| Specialists (four, with their lessons) | $100 | $100 |
| Rented network drive, about 2 more months | $14 | $14 |
| Re-runs allowed (one per rung if a heal scores badly) | $0 | $60 |
| Claude subscription while the family is finished, about 1 more month | $200 | $200 |
| **Projected total, line B complete** | **about $1,137** | **about $1,207** |
| Line A as well, if the comparison after Homer earns it | +$219 | +$229 |
| **Projected total, both lines** | **about $1,356** | **about $1,436** |
