# Bob's own models: the proposal

*A plan written the way a business proposal is written: what is being made, why, how, what it has cost so far, what the rest is expected to cost, what could go wrong, and how it is measured. It is public so that anyone can read the whole plan before deciding whether the project deserves their time, and so that the numbers can be checked against [What Bob costs to make](COSTS.md), [Bob's own models](BOBS-OWN-MODELS.md) and [the Forge journal](FORGE-JOURNAL.md). **This is not a request for money.** Nothing is for sale and no pot is open. If the project ever opens one, this page will say so plainly, and the rules for it are already written in section 10.*

*Prepared 8 November 2026 by the owner of Bob with Claude, who writes much of Bob's code and documents. Revised as the work moves.*

## 1. In one page

Bob is a local AI assistant that runs on a person's own computer, handheld or phone, with no cloud. Today he borrows his brains from other people's open models. The best of them for a 16 GB graphics card, Alibaba's Qwen3.6-35B-A3B (Apache 2.0), is too big for most of the devices Bob runs on.

The proposal is to give Bob a family of his own brains: **the same big model with its least-used parts cut away, then retrained with the big model as its teacher**, at six sizes from 28 billion parameters down to 5, plus a stretch goal at 2. Every size keeps Bob's tool calls, his thinking switch and his eyes. Each one is called a Bob (28Bob, 20Bob, 14Bob, 10Bob, 7Bob, 5Bob), with a crew nickname as a label.

What is true today, 8 November 2026:

- The method works at the top of the ladder. The first attempts (v1 and v2, now struck from the plan) matched the full model on Bob's own work (tool calls 66% against 67%, routing 16 of 17 against 15 of 16) and ran almost twice as fast on a 16 GB card. They taught the cut rule and the lesson rules that v3 uses.
- **28Bob Riker v3 is the first viable candidate for the family, pending its benchmarks.** Every rung below it is cut from it, in order: Bill, Homer, Milo, Luke, Calvin, then the stretch goal Bender.
- Coding and general knowledge are where a cut shows. The first cut rule and the first coding lessons were both weak; both have been measured, written up and replaced.
- Five Bobs have been made on rented cards for about $183 of card time, failures included. Only Riker v3 is in the plan; the four earlier ones are kept as a control group and nothing more.
- The whole family is expected to cost about $165 more in card time, about $1,400 in total with the tools that made it. Every dollar so far is itemised on the costs page.
- Nothing is released. The family goes out together, on Hugging Face, under Apache 2.0, with model cards that say exactly what each Bob is and how it scored.

## 2. The problem

Bob runs on five kinds of machine: a gaming PC with a 16 GB card, a gaming handheld with about 8 GB to spare, a laptop with a 6 GB card, a phone, and a Raspberry Pi. One model does not fit all of them, so today each device gets a different stock model, and the small ones are not Bob: they do not know his tools, his voice or his habits, and they were never taught to say "I will hand this to the big brain".

Published small models are also made for everyone, which means for no one. Bob needs a model that is very good at a narrow job: picking the right tool, calling it with the right arguments, answering in Bob's voice, knowing when to think and when not to, and reading a picture. A model half the size that is better at exactly that is worth more to Bob than a bigger one that is average at everything.

## 3. The product

### 3.1 The ladder

Qwen3.6-35B-A3B is a mixture-of-experts model: each of its 40 layers holds 256 small networks, and for every word a router picks 8 of them. Many are rarely picked for Bob's work. Keep only the busiest and the model shrinks a lot while the parts that matter stay. The ladder was redrawn on 6 November from a measured table of what every size keeps:

| Rung | Nickname | Experts kept per layer (of 256) | File at Q4, about | Meant for | State |
|---|---|---|---|---|---|
| 28Bob | Riker | 208 | 17.5 GB | a 16 GB card with experts spilling into RAM, or the Q3 file | v3 made, being benchmarked |
| 20Bob | Bill | 144 | 12.7 GB | a 16 GB card entirely: the everyday desktop Bob | next |
| 14Bob | Homer | 96 | 9 GB | 8 GB cards and gaming handhelds | planned |
| 10Bob | Milo | 64 | 6.6 GB | small cards, big phones | planned |
| 7Bob | Luke | 40 | 4.6 GB | phones | planned |
| 5Bob | Calvin | 24 | 3.3 GB | phones, the quick brain | planned, kept only if it beats a stock 4B |
| 2Bob | Bender | 8, then cut in depth and width too | ~1.3 GB | anything, including a Raspberry Pi | stretch goal, last |

Each rung below Riker is cut from the healed Bob above it, so small steps lose less than one big cut and every rung is a usable model on its own. Every Bob ships at two compressions (Q4 and Q3), shares the teacher's 0.9 GB vision file, and gets an "experts per word" dial in Bob (4 to 8) so a person can trade a little skill for speed at any time.

### 3.2 Two lines and the specialists

Every rung is made on **line B**: Bob's lessons plus coding and software-engineering lessons. **Line A** (Bob's lessons only) is kept as a comparison and continues only if the comparison after Homer says it is worth it. Specialists at the small sizes (Cypher for coding, Ponder for deep thinking, Audit for reviewing, Relay for routing) are the same cut with a different heal mix, made only after the general rung at that size has proven itself.

### 3.3 Thoth: the uncensored line, on paper

The community publishes "uncensored" remixes of the same Qwen models, with the refusals cut out. Bob lists them behind an opt-in switch, the naughty list, never as a default and never recommended. **Thoth** is the plan for a Bob cut from one of those remixes, with the same method, under stricter rules: healed against the uncensored remix itself (a stock teacher would quietly put the refusals back), on a lesson set with every refusal removed, named by the cut (18Thoth, 12Thoth), listed only behind the naughty-list switch, never starred, with its remixer credited on the tag and the licence of the remix it came from. For the small sizes, teaching a small uncensored student is likely better than cutting the big one far down. Thoth is a named route, not a scheduled one; it waits behind the ladder.

### 3.4 In the app

When the family is complete, Bob's own models become his default brains: when Bob suggests a starter set, a Bob is picked before a stock model of the same size. The Forge and the model lab are already in this repository under `model-lab/` (GPL-3.0-or-later, like the rest of Bob). Nothing turns on by itself; the catalogue stays opt-in and every download asks first with the size.

## 4. The method, in brief

1. **Lessons.** The full model writes Bob's lessons from Bob's real system prompt and tool list, with neutral names and never anyone's real chats or files: chat, every tool, thinking on and off, pictures, coding, formats, refusals, other languages and the skills a Bob needs to work on his own. The v3 set is 9,059 lessons across 16 sets, published as a release asset (CC BY-SA 4.0).
2. **Count.** Run each skill's lessons through the model and record which experts each layer picked.
3. **The coverage cut.** For each skill, keep enough experts in every layer to cover about 95% of that skill's routing (99% for tools, coding and formats); keep the union. A coverage table is published for every Bob before anything is rented, and no skill may fall under its target in any layer.
4. **Teacher pass.** The full model records its top-32 next words and their odds at every answer position, plus a sample of general text so the Bobs keep general knowledge.
5. **Heal.** Train the cut model to give the same odds as the teacher (low-rank adapters on every layer, plus the router, one pass), then fold the adapters in. Each Bob is kept as an adapter plus a keep list too, so it can be rebuilt from the teacher in minutes and healed again later.
6. **Score and export.** Held-out lessons before and after, against the teacher's own score; then Bob's own benchmarks (tool score, routing race, coding race, speed) on a real 16 GB card and on the devices the rung is for.

The full method, with the numbers behind every claim, is on [Bob's own models](BOBS-OWN-MODELS.md). The day-by-day record is [the Forge journal](FORGE-JOURNAL.md).

## 5. Progress and evidence

| Date | What was made | What it showed |
|---|---|---|
| 4 Nov | Free tests at home; 3,832 lessons (one rented hour, $3.98) | Quality holds at 8, 6 and 4 experts per word; the work is spread wide across experts, so the small rungs lean on the heal |
| 4 to 5 Nov | Three failed rentals ($6.54), then line A: Riker v1 and Bill v1, both stopped by the clock cap ($30.35). **Struck from the plan** | Even half-healed, tools and routing survive a 50% cut almost untouched; facts and coding do not |
| 5 Nov | Line B: 717 coding lessons, Riker v2 and Bill v2 with full passes ($72.67). **Struck from the plan** | The coding lessons did not lift coding (6 of 13 against 12 of 13 for the full model). 37% of them taught the model to hand code off instead of writing it |
| 6 Nov | 24 skill sets counted, 5,227 new lessons ($18.15, one failed try) | Twenty-three of twenty-four skills move together under a cut; general knowledge breaks first; the worst layer is always layer 2. The ladder was redrawn from this table |
| 6 to 7 Nov | **Riker v3** at 208 experts, a full pass ($51): the first viable candidate, pending benchmarks. Bill v3 lost to a bug and a machine without a drive | The cut rule is fixed; the renting rules are now hard in code (a drive always, or no card) |
| 7 Nov | Forge build 15, on paper | The teacher's scores are kept between runs; the fast kernels, never loaded in any run so far, are built properly |
| 8 Nov | Thoth named; this proposal | |

The honest reading: the method is proven at the top rungs, the middle rungs are a reasonable bet because the heal recovered most of a 128-expert cut, and the small rungs are an experiment that will be judged by the benchmarks and dropped if a stock small model beats them.

## 6. Plan and milestones

| Milestone | What it needs | Expected card time | Done when |
|---|---|---|---|
| 1. Riker v3 benchmarked at home | the PC, no rental | 0 | tool score, routing race, coding race and the long-document checks are on the models page |
| 2. Bill v3 made from the teacher with the PC-built keep list | one rental | about 6 h | Bill's scores beat Bill v2's on the same tests |
| 3. Homer and Milo | one rental | about 9 h | both score above the stock models they replace on their devices |
| 4. Luke and Calvin | one rental | about 8 h | Luke equipped on a phone; Calvin kept or dropped by the benchmarks |
| 5. The by-the-word teacher test | a small hosted spend | 0 card hours | a Bob healed with a few hundred lessons from a much bigger teacher is raced against one without |
| 6. Specialists and line A | only if 3 and 5 earn them | about 4 h each | each specialist beats the general rung at its own job |
| 7. Release | the PC and Hugging Face | 0 | every Bob on Hugging Face with a model card, pinned in Bob's catalogue, Bob's starter sets prefer them |
| Later | Bender (2Bob) another way; Thoth; expert merging for the small rungs | | each gets its own entry here first |

No dates are promised. Rentals happen when the owner says so, one at a time, each with a plan file that names its caps in hours and dollars.

## 7. Costs

Every dollar spent, including the runs that made nothing, is on [What Bob costs to make](COSTS.md), with the rate and the hours. In short, as of 8 November 2026:

| | |
|---|---|
| Card time rented so far, about 37 hours over 10 rentals, 4 of them failures | about $183 |
| Of which wasted on failed attempts | about $16, plus the half-run of 6 to 7 November |
| Tools: Claude subscription and extra usage, November 2026 | $1,000 (Claude is a contributor and writes much of Bob's code and documents) |
| Code and release hosting, model hosting | $0 |
| Card time still expected for the ladder (Bill, Homer, Milo, Luke, Calvin) | about $165, plus about $7 a month for the network drive while it exists |
| Allowed for re-runs if a heal scores badly | up to $20 a rung |
| Specialists and line A, only if earned | about $25 a specialist; about $220 for line A |

The whole family, at the cheapest route, comes to about $1,400 including the tools that made it. That is the cost of making a custom model family on rented cards by the hour, done by one person with an assistant, with the mistakes left in.

## 8. What is invested, and what is already in hand

A proposal usually asks for everything up front. This one does not, because most of the fixed work is already done and paid for. The table separates money from the time and the things that money bought.

### 8.1 Invested so far

| | Amount | Notes |
|---|---|---|
| Card time rented by the hour | about $183 | 10 rentals, 4 of them failures; every line on the costs page |
| Claude subscription and extra usage, November 2026 | $1,000 | the assistant that wrote the Forge, the lesson writer, the benchmarks and these pages |
| Prepaid card credit | loaded in advance, amount not shown | the rental account is paid up front and drawn down by each session; the card time above came out of it, and the unused part is already earmarked for the rungs still to make |
| Owner's time | 4 to 8 November, not counted in dollars | lessons, counts and benchmarks on the home PC; every rental watched by hand |
| Hosting, signing, model storage | $0 | GitHub and Hugging Face are free for a public project |
| **Total cash in** | **about $1,183** | |

### 8.2 Assets in hand

Everything below exists today, is on the owner's machine or on GitHub, and would not have to be paid for again.

| Asset | What it is | Replacement cost if lost |
|---|---|---|
| **The Forge** (build 15) | the cut-and-heal program: rents a card, writes lessons, counts experts, builds the keep list, runs the teacher pass, heals, exports and brings each Bob home, under hard caps. GPL-3.0-or-later, in this repository under `model-lab/forge/` | about four weeks of writing and ten rentals of lessons learned |
| **Lesson set v3** | 9,059 lessons in 16 skill sets, 5% held out, written by the full model from Bob's real tools and prompt; published as the `lessons-v3` release asset under CC BY-SA 4.0 | about $35 of card time and two days of cleaning |
| **Expert counts for 24 skills** | which of the 10,240 experts each skill uses in the full model; the table every keep list is built from | $9 and a short rental |
| **28Bob Riker v3** | the first Bob of the current plan: Q4 (17.5 GB) and Q3 (13.9 GB) files and the 1.7 GB adapter that rebuilds the full-precision model from the teacher in minutes | about $51 |
| **Four struck Bobs** | Riker v1 and v2, Bill v1 and v2, with the v2 adapters (1.5 GB and 1.1 GB). Not in the family and never will be; kept only as the control group for comparisons and as proof that tools and routing survive a cut | not replaced if lost |
| **Benchmarks** | the experts-per-word test, the tool score (314 turns), the coding race and the routing race, all runnable for free on a 16 GB card, with results for the full model and every Bob so far | a week of writing |
| **Keep lists and coverage tables** | the per-skill cut rule and the keep lists for every planned rung, built on the PC from the counts, no rental needed | free to rebuild from the counts |
| **The written record** | the method, results, costs and the day-by-day journal, public and checkable | |
| **Qwen3.6-35B-A3B weights and general text** | the teacher and its outside text, downloaded once per session; the rented drive that would keep them between sessions is about $7 a month | a download, not a cost |

What is **not** in hand, and is the first thing the next rental buys: the **teacher's scores** for the v3 lessons (the full model's top-32 next words at every answer position, a few gigabytes). They were made on 6 November and lost with the machine because no drive was attached. Forge build 15 keeps them on the drive and on the PC from now on, so this cost is paid once more and never again for the same lesson set.

## 9. Risks, and what is done about them

| Risk | How likely | What it would mean | What is done |
|---|---|---|---|
| Small rungs lose too much | likely below 10Bob | a size is not worth shipping | every rung is benchmarked against the stock model it replaces, and dropped if it loses; Bender is made another way |
| Coding stays weak | medium | Bob keeps a stock coding brain in that slot | the coverage cut protects coding's experts; the clean coding set replaces the weak one; the specialist Cypher is the second bet |
| A rental is wasted | has happened four times | $1 to $51 lost | the Forge now refuses a card without a drive, keeps the teacher's scores between runs, deletes the machine at the cap, and every plan carries hard caps |
| General knowledge fades | certain under a deep cut | a small Bob is vaguer about the wide world | general text is a third of the heal mix and scored separately; the models page says so plainly |
| Licence or credit problems | very low | cannot share | Apache 2.0 allows it; every Bob ships with the licence, a "modified" note and "made from Qwen3.6-35B-A3B"; the Qwen name is never used as a brand |
| The uncensored line misused | only if Thoth is made | a model that does not refuse | opt-in switch, never a default, never recommended, remixer credited, documented here before anything is cut |
| Privacy | very low | personal data in a model | lessons use neutral names written by the model; the public lesson set has the owner's machine details replaced; nobody's chats are used |

## 10. How others could take part, later

Nothing is open yet. When the first Bobs are on Hugging Face, the project intends to open three ways to help, in this order, each solo-safe (with nobody joining, the plan is exactly this one):

1. **Benchmarks on real devices.** Run a Bob on your handheld, laptop or phone and send the scores. Two devices of the same class must agree.
2. **Home cards for the small rungs.** The teacher's odds for a lesson set are a few gigabytes; a 16 to 24 GB card can heal a 7Bob or 5Bob from them. A second person re-heals from the same plan and the scores must match.
3. **Prompt ideas and one-click reviews**, never written answers: Bob is trained to call tools on people's computers, so every answer in the training set comes from a named teacher through the published script.

If money is ever asked for, it will be for items already on this plan, with every spend on the costs page, and this section will say so first. Today it is not.

## 11. People and credits

Bob is a one-person project with an assistant: the owner decides, pays and tests on real hardware; Claude (Anthropic) writes much of the code, the documents and this proposal. Community contributors are credited in the release notes and on GitHub.

Made from Qwen3.6-35B-A3B by Alibaba Cloud's Qwen team (Apache 2.0). Healing uses PyTorch, Hugging Face transformers and PEFT, and llama.cpp for counting, quantizing and running. Expert pruning follows the idea in Cerebras' REAP work; depth-and-width pruning for 2Bob follows NVIDIA's Minitron. Bob is inspired by the wonderful books of Dennis E. Taylor. Not affiliated with or endorsed by the author.
