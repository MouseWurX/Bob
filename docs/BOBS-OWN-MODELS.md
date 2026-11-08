# Bob's own models

*The day-by-day record, every run's numbers and the routes not taken yet are in [the Forge journal](FORGE-JOURNAL.md); the raw run files are in [forge-runs/](forge-runs/).*

*Tested, not yet released. This page is the plan, the method and the results so far, including the mistakes. It is updated as each model lands. No downloads yet: the whole family goes up together when it is complete.*

*The plan as a business proposal, with milestones, what has been invested and what is already in hand, is on [Bob's own models: the proposal](PROPOSAL.md).*

> **6 November 2026: the first four Bobs will be re-cut and re-healed.** Two findings: the coding lesson set mostly taught the model to hand code off rather than write it (the main cause of the v2 coding gap), and the cut rule protected no skill in particular, which turned out to matter less than feared but is fixed anyway, with a measured table below of what every size keeps. What happened, why, and the corrected rule are in [What went wrong with the first cut](#what-went-wrong-with-the-first-cut). The costs page carries the price of doing it again.

Bob borrows his brains from other people's models. The best of them for a 16 GB graphics card, Qwen3.6-35B-A3B, is also too big for most of the devices Bob runs on: a gaming handheld with 8 GB to spare, a laptop with a 6 GB card, a phone, a Raspberry Pi. So we are making Bob a family of his own: **the same big model with its least-used parts cut away, then retrained with the big model as its teacher**, at nine sizes from 24 billion parameters down to 2. Every size keeps Bob's tool calls, his thinking on/off switch and his eyes (vision), and every size is called a Bob.

The models are made from [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) by Alibaba's Qwen team, released under the Apache 2.0 licence, and each one will ship with that licence and a note saying it was modified. The Qwen name is not used as a brand: the models are called 24Bob, 18Bob and so on, "made from Qwen3.6-35B-A3B".

The family's names come from a reading habit. Bob is inspired by the wonderful books of Dennis E. Taylor. Not affiliated with or endorsed by the author.

## The family

Qwen3.6-35B-A3B is a mixture-of-experts model: each of its 40 layers holds 256 small networks ("experts"), and for every word it writes a router picks 8 of them. That is why it has 35 billion parameters but only about 3 billion working at once, and why it is fast. Many experts are rarely picked for the work Bob does. Keep only the busiest, and the model shrinks a lot while the parts that matter stay. The about-2-billion non-expert parts (word list, attention, router) stay in every Bob, and each expert kept per layer adds about 0.12 billion. That sets the ladder:

| Model | Nickname | Experts kept per layer (of 256) | File at Q4 | Meant for |
|---|---|---|---|---|
| Qwen3.6-35B-A3B (the teacher) | | 256 | 22.4 GB | a 16 GB card with experts spilling into RAM |
| **24Bob** | Riker | 176 | 15 GB | a 16 GB card, most of it on the card: the everyday brain |
| **18Bob** | Bill | 128 | 11.4 GB | a 16 GB card entirely, with room for long chats |
| **12Bob** | Homer | 80 | ~7.5 GB | 8 GB cards and gaming handhelds |
| **10Bob** | Milo | 64 | ~6.3 GB | 8 GB cards with room to spare |
| **8Bob** | Mario | 48 | ~5 GB | handhelds, laptops, the PC's Gaming slot (on the processor) |
| **6Bob** | Luke | 32 | ~4 GB | laptops and phones |
| **5Bob** | Calvin | 24 | ~3.2 GB | phones and the quick brain |
| **4Bob** | Goku | 16 | ~2.5 GB | phones and a Raspberry Pi |
| **2Bob** | Bender | 8, then also cut in depth and width | ~1.3 GB | anything, including the Pi (the hardest cut, made last) |

Sizes for the models not yet made are estimates. Each Bob also comes at Q3 (a smaller compression of the same model, for cards of 8 GB and under) and shares the teacher's 0.9 GB vision file, downloaded once.

**Specialists.** Counting which experts Bob's jobs use showed that coding and deep thinking lean on partly different experts (the busiest 48 for coding overlap the general top 48 by only 80%, deep thinking by 73%). So at 8Bob and below, where every expert counts, a Bob can be cut for one job and keep more of what that job needs. Specialists carry a plain name after the size: **Cypher** (coding), **Ponder** (deep thinking), **Audit** (reviewing) and **Relay** (the quick router brain). "8Bob Cypher" is the 8-billion coder; plain "8Bob" is the everyday one. Planned first: 8Bob Cypher, 8Bob Ponder, 5Bob Cypher and 5Bob Audit.

**Two family lines.** Every rung is being made twice, with the same cut and different lessons: **line A** is healed on Bob's own lessons only, **line B** on Bob's lessons plus coding and software-engineering lessons. The two lines are compared at the end to see which tasks the extra lessons help, and which don't improve at all. Line B is the one being built right now.

## The Forge: how a Bob is made

The Forge is the project's cut-and-heal program. One command rents a data-centre graphics card by the hour, sends it the lessons and a plan (which rungs, how many experts, the spending caps), watches it, brings each finished Bob home as soon as it is ready, and deletes the machine. Nothing is rented until the owner types "yes" at the prompt, and the machine deletes itself near the time cap in case the home side dies. The PC side is Node.js; the pod side is Python with PyTorch, transformers and llama.cpp's tools.

### Step 0: free work at home

1. **Experts-per-word test.** The full model answers a fixed set of Bob questions (picking the right tool, short facts, small coding tasks) with 8, 6, 4, 3 and 2 experts per word. Result: quality held at 8, 6 and 4; 3 hurt; 2 collapsed. So cutting looked promising, and Bob's per-brain "experts per word" setting gets the range 4 to 8.
2. **Lessons.** The full model writes Bob's lessons: chat, every one of Bob's tool calls (using Bob's real tool list and system prompt, with neutral names, never anyone's real chats or files), thinking on and off, and picture questions. About 3,800 were written, 3,616 kept after filtering. Line B adds 717 coding and software-engineering lessons, written on the rented card by the full model before the first teacher pass.
3. **Expert count.** llama.cpp's importance counter runs the lessons through the full model and records how often each of the 10,240 experts was picked. The work is spread wide: the busiest 48 experts per layer cover 51.5% of picks (32: 39.6%, 16: 24.3%), and 90% coverage needs 155 of 256. Meaning: the top rungs lose little, the small Bobs lean on the healing, and specialists are worth it at small sizes.

### Each session, on the rented card

1. **Teacher pass** (once per session). The full model, in full precision, reads every lesson and records its top 32 candidate words and their probabilities at every answer position. This is what the cut model is trained to match. About a third of the training mix is general text (public web text and public chat data), so the Bobs keep general knowledge and not only Bob's work; it is scored separately.
2. **Cut.** Keep N experts in every layer, by slicing the weight files; the router shrinks to match. Minutes. The first four Bobs kept the N busiest overall, which protected no skill in particular (see [What went wrong with the first cut](#what-went-wrong-with-the-first-cut)); from Homer on, and for the re-cut Riker and Bill, the keep list is built per job (the "coverage cut").
3. **Heal.** Train the cut model to give the same next-word odds as the teacher on the lessons: low-rank adapters (LoRA) on every linear layer and on the experts, plus the router, with a loss that combines distance from the teacher's top-32 distribution and the real next word, answer tokens only, thinking on and off, tool calls included. Then fold the adapters back into the weights. One full pass over the lessons per rung.
4. **Score.** Held-out lessons are scored before and after healing, against the teacher's own score (the floor). Two numbers matter: how surprised the model is by the teacher's words (lower is better; this is a loss, not an error rate) and the distance from the teacher.
5. **Count again.** Which experts does the healed Bob use? The next rung is cut from *that* count, so each Bob is cut from the healed Bob above it ("step-down ladder"). Small steps lose less than one big cut, and every rung is a usable model on its own.
6. **Export.** GGUF files at Q4_K_M and Q3_K_M, checksummed and downloaded home, plus a small adapter file that, with the keep list, rebuilds the full-precision Bob from the teacher in minutes. The teacher, the general text and the adapters live on a 100 GB network volume so a session needs no re-download.

A plan file names the teacher, the lessons, the rungs (`keep` experts per layer, `from` the teacher or an earlier rung), the card wanted, the quants, and the caps in hours and dollars. Every dollar spent and every rung still to pay for is itemized on [What Bob costs to make](COSTS.md).

### What the Forge is not

It is not a new architecture and not training from scratch. Published work prunes experts from other large mixture-of-experts models with modest loss at 25 to 50 percent removed; the Bob family cuts much further and relies on the healing to pay for it. 2Bob goes past what expert pruning can do and is also cut in depth (whole layers) and width (inside each layer), the way NVIDIA's Minitron models were made, which is why it is last and the riskiest.

## Results so far

### 24Bob Riker, line A (v1): tested, not released, to be re-cut

Cut straight from the teacher, 176 of 256 experts per layer, healed on a rented H100. The session's clock cap stopped his healing at about 175 of 456 steps (1.75 hours), so v1 is a part-healed Bob.

- Held-out loss 0.383 before healing, 0.355 after; the full Qwen scores 0.325.
- Files on the test machine: Q4 15.05 GB, Q3 11.95 GB.
- **Tool-calling score** (Bob's own benchmark, thinking off): Riker 66%, full Qwen 67%, Qwen3 Coder 30B 42%.
- **Routing race** (which brain should take the job): Riker 16 of 17, stock Qwen 15 of 16, Gemma 4 26B 16 of 16.
- **Short facts** 20 of 20 and **small coding tasks** 4 of 6 on the lab's quick quiz (the full model: 20 of 20 and 6 of 6).
- **Coding race** (13 tasks, fair settings): Riker 8 of 13 with thinking on and 6 of 13 off, at 130 tokens a second; full Qwen 12 and 11 of 13; Qwen3 Coder 30B 11 of 13. The misses were multi-step logic. Coding is where the cut shows.
- Speed on the test card: about 150 tokens a second against 85 for the full model, because more of Riker fits on the card.

Verdict: the best fit for a 16 GB card for everyday work and routing; coding goes to a bigger brain or to the specialists later.

### 18Bob Bill, line A (v1): tested, not released, to be re-cut

Cut from the healed Riker, 128 experts per layer. The session's clock cap stopped his healing at step 155 of 456, so he is under-healed.

- Held-out loss 0.585 before healing, 0.501 after (capped).
- Files: Q4 11.4 GB, Q3 9.1 GB. Fits a 16 GB card entirely.
- Tool-calling 65%, routing 17 of 17, short facts 12 of 20, small coding tasks 0 of 6, about 190 tokens a second.

Verdict: tools and routing survive a 50% cut almost untouched even half-healed; facts and coding do not. Bill is being remade with a full pass (below).

### 24Bob Riker, line B (v2): tested, not released, to be re-cut

Same cut as v1 (his exact keep list), healed for a complete pass of Bob's lessons plus the 717 coding and software-engineering lessons on a rented H200, 524 of 524 steps in 4.8 hours: the first full pass. So v1 against v2 is "part-healed on Bob lessons" against "fully healed on Bob plus coding lessons".

- Held-out loss 0.389 before, 0.356 after (v1: 0.355; full Qwen 0.324); distance from the teacher 0.060 (v1: 0.063).
- General-text loss 2.245 before, 2.221 after (v1: 2.224), so the coding lessons cost no general knowledge.
- Files: Q4 15.0 GB, Q3 11.9 GB, plus a 1.5 GB adapter.
- **Tool-calling score** 66% (206 of 314: 62 right tool, 40 right arguments, 166 correctly no tool), 151 tokens a second. Same as v1.
- **Routing race** 16 of 17. Same as v1.
- **Quick quiz**: tools 48 of 97 (v1: 53), facts 20 of 20, code 3 of 6 (v1: 4).
- **Coding race**: 6 of 13 with thinking on (v1: 8) and 6 of 13 off (v1: 6), at 135 tokens a second.

Verdict: v2 matches v1 on Bob's own work, with slightly better training scores, but the 717 coding lessons did not improve the coding race (6 of 13 against 8 of 13 is within one-try noise, but there is no gain). The likely limit is the expert cut itself, not the lessons: the experts coding needs were partly cut away, and lessons can't teach what isn't there. Next step before Homer is a coding-aware expert count, so the cut keeps what coding uses.

### 18Bob Bill, line B (v2): tested, not released, to be re-cut

Cut from the healed Riker v2 with his v1 keep list, healed for a complete pass on the same H200.

- Held-out loss 0.487 after healing (v1, clock-capped: 0.501).
- **Tool-calling score** 66% (208 of 314: 63 right tool, 38 right arguments, 170 correctly no tool), 190 tokens a second, all on the card.
- **Routing race** 17 of 17.
- **Quick quiz**: tools 45 of 97, facts 11 of 20, code 0 of 6.

Verdict: a fully healed Bill keeps tools and routing level with Riker and the full model at a size that fits a 16 GB card entirely; facts and coding are where half the experts show. He is the Bob to beat for the everyday slot on a 16 GB card if the longer chats matter more than facts.

### What each session cost

The full itemized list, including every rung still to come, is on [What Bob costs to make](COSTS.md).

| Session | Card | Made | Cost |
|---|---|---|---|
| Lessons | H100, 1 hour | 3,753 lessons | US $3.98 |
| Line A | H100 | Riker v1, Bill v1 (capped) | US $30.35 |
| Line B | H200 SXM + 100 GB drive | 717 coding lessons, Riker v2, Bill v2 | US $72.67 |

## What went wrong with the first cut

The four Bobs above are good at Bob's own work and fast, and they are still being re-cut. Here is why, in plain words, because the mistakes cost real money and the plan below depends on not repeating them.

**What the first cut did.** Riker's keep list was the 176 most-used experts in every layer, counted over all of Bob's lessons at once: chat, tool calls, facts, planning and a little coding, all in one pile. Bill was cut from Riker the same way. That rule is simple and it is what most published expert-pruning does.

**What the count showed afterwards.** Measured on the PC from the same expert counts, free: Riker's 176-expert keep list kept 92.0% of coding's routing (the worst layers, 0 to 2, about 82%), 93.2% of all of Bob's lessons, and 89.6% of maths, knowledge and plans. So the rule protected no skill in particular, and it hurt coding only a little more than everything else. The fuller measurement with 24 skills (the table below) then showed that the old keep lists sit within a point of the new per-skill rule at the same size: the first Riker and Bill were not badly cut for coding. The rule still changes, because nothing in the old one stopped a skill from losing its experts, and whatever a cut drops is what healing cannot replace: healing trains the experts that are left, it cannot grow back one that was removed.

**Why v2 did not code better.** Line B added 717 coding and software-engineering lessons and a complete pass of healing on an H200 (US $72.67), and coding did not move: 6 of 13 on the coding race for both v1 and v2, against 12 of 13 for the full model, and the coding quick test went down rather than up. Tool calls, routing and facts stayed near the teacher. With the cut costing coding only about 7% of its routing on average, the cause is the lesson set itself, below. Worse, v2 reused v1's exact keep list without first checking what any skill needed from it. That check costs nothing and should have come first.

**The coding lessons were weak too.** Looking at the 717 coding lessons after the fact: 263 of them (37%) answer by handing the job to Bob's coding tool with a pretend result, so the student learned to delegate code rather than write it; only 197 are direct answers with code in them; 171 of the requests are under 40 characters; and coding was about one lesson in six of the whole v2 heal. The spread of languages was fine (C++ and Unreal 130, Python 112, Rust 80, JavaScript and TypeScript 70, Kotlin 66, plus Blender, SQL, shell, HTML and Git). Even with the right experts kept, that set could not have taught much coding. The replacement is written: 2,329 clean coding lessons with the hand-off tools switched off and requests of two to four sentences, 282 run-and-fix lessons, and 2,616 lessons across 13 other skill sets that had none of their own (exact formats, game master turns, polite refusals, other languages, reasoning with thinking on, and the skills a Bob needs to work on his own: recover from errors, ask when unclear, take notes, pick up a new tool, check his own work, read his own help, research and understand).

**The corrected rule: the coverage cut.** Count which experts each *job* uses, separately: chat, tool calls, coding, knowledge, maths, planning. For each job, keep enough experts in every layer to cover a set share of that job's routing (the proposal is 95%, and 99% for tool use, coding and exact formats). Then keep the union of those lists, padded to one size for every layer because the model file needs that. A coverage table is published for every Bob before anything is rented, and no job may fall under its target in any layer. No job loses its specialists just because it is a small share of the whole. Measured on the full model with 24 skills counted separately (6 November): at 208 experts per layer a typical skill keeps 97 to 98% of its routing (worst layer 92 to 93%); at 176 it keeps 93 to 95% (worst 84 to 86%); at 128 it keeps 83 to 87% (worst about 70%). The outlier is general knowledge outside Bob's own jobs (counted on the web articles and open chats on random topics that are mixed into the heal): 90% at 208, 78% at 176, 60% at 128 (worst layers 84, 68 and 51%), so a cut hurts broad knowledge first, and that is the skill to watch at every rung. Context length itself was not measured; it lives mostly in the attention layers, which the cut does not touch. The ladder table below is that measurement in full.

**What every size keeps.** Measured on the full model with the 24 skill sets (about 300 lessons each). Each cell is the share of that skill's expert traffic that survives when every layer keeps only that many experts: average over the 40 layers, then the worst single layer. Under about 85% in the worst layer the skill feels the cut; healing softens it but cannot grow an expert back.

| Experts per layer | Size at Q4 (about) | Typical skill | Coding | Tools | General knowledge |
|---|---|---|---|---|---|
| 248 | 20.7 GB | 100 / 99 | 100 / 99 | 100 / 99 | 100 / 98 |
| 224 | 18.6 GB | 99 / 96 | 98 / 95 | 99 / 95 | 95 / 91 |
| 208 | 17.5 GB | 98 / 93 | 97 / 92 | 98 / 92 | 90 / 84 |
| 192 | 16.3 GB | 96 / 89 | 95 / 88 | 96 / 89 | 84 / 78 |
| 176 (Riker today) | 15.1 GB | 94 / 85 | 93 / 84 | 94 / 84 | 78 / 68 |
| 160 | 13.9 GB | 92 / 81 | 91 / 79 | 92 / 80 | 72 / 63 |
| 144 | 12.7 GB | 89 / 77 | 88 / 75 | 89 / 75 | 66 / 56 |
| 128 (Bill today) | 11.4 GB | 85 / 72 | 84 / 70 | 85 / 70 | 60 / 51 |
| 112 | 10.2 GB | 81 / 66 | 79 / 64 | 81 / 65 | 54 / 43 |
| 96 | 9.0 GB | 76 / 60 | 74 / 58 | 76 / 59 | 48 / 38 |
| 80 | 7.8 GB | 70 / 54 | 68 / 51 | 69 / 52 | 42 / 32 |
| 64 | 6.6 GB | 62 / 46 | 60 / 44 | 62 / 44 | 36 / 26 |
| 48 | 5.4 GB | 53 / 37 | 51 / 35 | 53 / 36 | 28 / 20 |
| 32 | 4.2 GB | 42 / 27 | 40 / 25 | 41 / 26 | 19 / 14 |
| 16 | 2.9 GB | 27 / 16 | 25 / 14 | 27 / 15 | 10 / 6 |

Q3 files are about 80% of the Q4 size. What the table says:

1. **Twenty-three of the twenty-four skills move together**, within two points of each other at every size. The experts are shared, not owned by one skill, so the cut rule is now right (nothing is starved), but no clever keep list can make a small Bob good at one thing and bad at another: the size itself decides.
2. **General knowledge breaks first.** This column means knowledge outside Bob's own jobs (web articles and open chats on random topics, pieces capped near 1,500 words), not reading long documents or context length. At 208 experts it already sits where the others sit at 176; at 128 it keeps 60%. A small Bob stays good at being Bob and gets vaguer about the wide world, which is what the specialists and the stock brains are for.
3. **The worst layer is layer 2 for every skill**, an early layer with very spread-out routing, so a bigger keep list pays off there most.
4. **The recommendation to the owner** (the size is the owner's call): Riker v3 at 208 experts (every skill but general knowledge above 92% in its worst layer; needs experts in RAM on a 16 GB card at Q4, or the Q3 file) and Bill v3 at 144 instead of 128 (four points everywhere and six on general knowledge for 1.3 GB, still fits a 16 GB card whole). The smaller rungs will lose half their routing or more in the worst layers whatever the rule; they are still worth making because healing recovers a lot (Bill v2 recovered most of the way from a 128 cut), but they are judged by the benchmarks after healing and nobody should expect them to know the wide world the way the full model does. Merging two similar experts within a layer is the next lever for the small rungs, worth a test after Homer.

Bill, Homer and the rest are cut from the re-cut Bob above them, and each Bob's own coverage numbers are published with it.

**What it costs.** Riker and Bill have to be cut and healed again on line B before Homer can be made from them. About US $70 to $75 on an H200, the same shape as the line B session. The new lessons and the per-skill counts are already done ($18.15 across two short rentals, one of them a failed first try). The costs page lists the wasted run as a lesson learned, the re-run as a new line, and the projected total raised to match.

## What comes next

1. **Benchmarks of Riker v2 and Bill v2**: done (above). Line B is the line that continues.
2. **The coverage cut, measured at home first.** Per-job expert counts on the owner's PC, free, before anything is rented again. The sizes and the per-rung costs go on this page and on the costs page when they are in.
3. **Riker and Bill, re-cut and healed again** on line B with the coverage cut, then **12Bob Homer** cut from the new Bill. Each rung is about 5 hours on an H200. Then decide whether line A is worth continuing at all.
4. **Down the ladder**: Milo, Mario, Luke, Calvin, Goku, each cut from the healed Bob above, then the four specialists, and 2Bob Bender last.
5. **In the app.** Bob's own models become the default brains: when Bob suggests a starter set, a Bob is picked before a stock model of the same size. The Forge and the model lab are in this repository under [`model-lab/`](../model-lab/) (GPL, like the rest of Bob); the lessons, counts and finished Bobs they make stay on the machine that made them. The engine will turn on expert-in-RAM offloading by itself when a Bob is bigger than the card. Every Bob gets the "experts per word" dial (4 to 8).
6. **Release.** All at once on Hugging Face, with model cards that say exactly what each Bob is cut from, how it was healed and how it scored, and pinned download links in Bob's catalogue. Until then: tested, not yet released.

## Expectations, honestly

- The top rungs (Riker, Bill) should be nearly as good as the teacher at Bob's own work and noticeably faster on a 16 GB card. Riker already is.
- Coding is the first thing to go when experts are cut, and the first cut proved that lessons cannot bring back an expert that was removed. The coverage cut is the fix at every size; the Cypher specialists are the second bet at small sizes. If neither works, Bob keeps a stock coding brain in that slot.
- The small rungs (5Bob and below) will not match the teacher. The target is "a better 4B than the stock 4B at being Bob": right tool, right format, Bob's voice, on a phone.
- Healing above about 5Bob is not practical on home hardware, so the family depends on short rentals, and every step is scored before the next one is made.
- Numbers on this page are from the project's own benchmarks on one test machine (a 16 GB NVIDIA card). They are for comparing Bobs with each other and with the models they replace, not for comparing with published leaderboards.

## Lesson sets by others we find interesting

Bob's published lesson sets hold only the lessons this project wrote and paid for. Other people have published answer sets from much bigger teachers. We find them interesting and will consider their use. They are not part of Bob's lesson release, so please get them from their makers and check each one's licence yourself:

- [lambda/hermes-agent-reasoning-traces](https://huggingface.co/datasets/lambda/hermes-agent-reasoning-traces): tool-using conversations from Kimi K2.5 and GLM-5.1 (Apache 2.0).
- [TeichAI/DeepSeek-v4-Pro-Agent](https://huggingface.co/datasets/TeichAI/DeepSeek-v4-Pro-Agent): agent work from DeepSeek V4 Pro.
- [TeichAI/DeepSeek-v4-Flash-Chat](https://huggingface.co/datasets/TeichAI/DeepSeek-v4-Flash-Chat): chat answers from DeepSeek V4 Flash.
- [TeichAI/glm-4.7-2000x](https://huggingface.co/datasets/TeichAI/glm-4.7-2000x) and [TeichAI/glm-4.7-350x](https://huggingface.co/datasets/TeichAI/glm-4.7-350x): answers from GLM-4.7.

Thank you to their makers for sharing them.

## Credits

Made from Qwen3.6-35B-A3B by Alibaba Cloud's Qwen team (Apache 2.0). Healing uses PyTorch, Hugging Face transformers and PEFT, and llama.cpp for counting, quantizing and running. Expert pruning follows the idea in Cerebras' REAP work; depth-and-width pruning for 2Bob follows NVIDIA's Minitron. Bob is inspired by the wonderful books of Dennis E. Taylor. Not affiliated with or endorsed by the author.
