# What Bob costs to make

*Every dollar the project has spent and every dollar it expects to spend, itemized. US dollars. Updated as each line lands. Rented hardware is described by the kind of service and the card (a GPU server rented by the hour, an H100 or H200), not by the company it's rented from.*

Bob is a one-person project paid for out of the owner's pocket. Nothing here is a fundraiser; the page exists so that anyone can see what a family of custom models actually costs when it's done on rented cards by the hour, and so the plan on [Bob's own models](BOBS-OWN-MODELS.md) has a price tag next to every rung.

## Spent so far

### GPU servers rented by the hour (Bob's own models)

| Date | What | Card | Cost |
|---|---|---|---|
| 4 Nov 2026 | Lessons night: the full model writes 3,753 of Bob's lessons | H100, 1 hour | $3.98 |
| 5 Nov 2026 | Three failed build attempts (tooling and download problems, nothing made) | H100, minutes each | $6.54 |
| 5 Nov 2026 | Line A session: 24Bob Riker v1 and 18Bob Bill v1 (Bill clock-capped) | H100, one session | $30.35 |
| 5 Nov 2026 | Leftover minutes on the above | | $0.30 |
| 5 to 6 Nov 2026 | Line B session: 717 coding lessons, 24Bob Riker v2 and 18Bob Bill v2, plus the first hours of the rented network drive | H200 SXM, 13.6 hours at $5.29 an hour | $72.67 |
| | **Rented GPU time, total** | | **$113.96** |

Prepaid credit loaded with the rental service: $250.00. Balance after the above: $136.04. A 100 GB network drive rented from the same service (it keeps the teacher weights, general text and adapters between sessions, so a session needs no re-download) costs about $7 a month while it exists.

### Tools and subscriptions

| What | Cost |
|---|---|
| Claude subscription (Anthropic): Claude is a contributor to the project and writes much of Bob's code, docs and Help alongside the owner | $200 a month |
| Claude extra usage bought on 5 Nov 2026 to finish the models and the app work together | $350 one-off |
| Code signing | $0 so far (SignPath Foundation application declined in Nov 2026 for lack of public visibility; builds stay unsigned) |
| Code and release hosting (GitHub) and, later, model hosting (Hugging Face) | $0 |
| Electricity for the lessons, counts and benchmarks on the owner's own PC | not counted |

## Projected: the rest of the family

These are estimates. They assume one full-pass heal with nothing trimmed at the 16k lesson length, about 5 to 5.5 hours of card time per rung, at by-the-hour rental rates from November 2026 that move weekly; each line is re-checked on the day it is rented. Every rental is agreed in advance with its cost and a hard cap.

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
| Re-runs: one allowed per rung if a heal scores badly | up to $20 each, inside the cap below |
| Code signing, when the project is visible enough | $0 (reapply to the SignPath Foundation, a free signing service for open-source projects), or about $10 a month for a cloud code-signing service, or $100 to $400 a year for a code-signing certificate |

### Totals

| | Low | High |
|---|---|---|
| Spent on rented GPU time | $113.96 | |
| Line B remaining rungs | $159 | $169 |
| Specialists | $100 | $100 |
| Drive | $14 | $14 |
| **Line B complete, everything so far included** | **about $387** | **about $397** |
| Line A as well, if kept | +$219 | +$229 |
| **Both lines** | **about $606** | **about $626** |

The agreed cap for the models is $500 of rented time. Line B with specialists fits under it; line A would push past it and is only started if the comparison after Homer earns it. Spending is capped three ways: prepaid credit the rental service cannot spend past, a cap in hours and dollars in every plan file that the Forge enforces, and a yes from the owner before any card is rented.
