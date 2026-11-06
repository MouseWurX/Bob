# Bob's own models

*Tested, not yet released. This page is the plan, the method and the results so far. It is updated as each model lands. No downloads yet: the whole family goes up together when it is complete.*

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
2. **Cut.** Keep the busiest N experts in every layer, by slicing the weight files; the router shrinks to match. Minutes.
3. **Heal.** Train the cut model to give the same next-word odds as the teacher on the lessons: low-rank adapters (LoRA) on every linear layer and on the experts, plus the router, with a loss that combines distance from the teacher's top-32 distribution and the real next word, answer tokens only, thinking on and off, tool calls included. Then fold the adapters back into the weights. One full pass over the lessons per rung.
4. **Score.** Held-out lessons are scored before and after healing, against the teacher's own score (the floor). Two numbers matter: how surprised the model is by the teacher's words (lower is better; this is a loss, not an error rate) and the distance from the teacher.
5. **Count again.** Which experts does the healed Bob use? The next rung is cut from *that* count, so each Bob is cut from the healed Bob above it ("step-down ladder"). Small steps lose less than one big cut, and every rung is a usable model on its own.
6. **Export.** GGUF files at Q4_K_M and Q3_K_M, checksummed and downloaded home, plus a small adapter file that, with the keep list, rebuilds the full-precision Bob from the teacher in minutes. The teacher, the general text and the adapters live on a 100 GB network volume so a session needs no re-download.

A plan file names the teacher, the lessons, the rungs (`keep` experts per layer, `from` the teacher or an earlier rung), the card wanted, the quants, and the caps in hours and dollars. The budget for the whole family is US $500; every rental is asked for first with its cost and cap.

### What the Forge is not

It is not a new architecture and not training from scratch. Published work prunes experts from other large mixture-of-experts models with modest loss at 25 to 50 percent removed; the Bob family cuts much further and relies on the healing to pay for it. 2Bob goes past what expert pruning can do and is also cut in depth (whole layers) and width (inside each layer), the way NVIDIA's Minitron models were made, which is why it is last and the riskiest.

## Results so far

### 24Bob Riker, line A (v1)

Cut straight from the teacher, 176 of 256 experts per layer, healed on a rented H100. The session's clock cap stopped his healing at about 175 of 456 steps (1.75 hours), so v1 is a part-healed Bob.

- Held-out loss 0.383 before healing, 0.355 after; the full Qwen scores 0.325.
- Files on the test machine: Q4 15.05 GB, Q3 11.95 GB.
- **Tool-calling score** (Bob's own benchmark, thinking off): Riker 66%, full Qwen 67%, Qwen3 Coder 30B 42%.
- **Routing race** (which brain should take the job): Riker 16 of 17, stock Qwen 15 of 16, Gemma 4 26B 16 of 16.
- **Short facts** 20 of 20 and **small coding tasks** 4 of 6 on the lab's quick quiz (the full model: 20 of 20 and 6 of 6).
- **Coding race** (13 tasks, fair settings): Riker 8 of 13 with thinking on and 6 of 13 off, at 130 tokens a second; full Qwen 12 and 11 of 13; Qwen3 Coder 30B 11 of 13. The misses were multi-step logic. Coding is where the cut shows.
- Speed on the test card: about 150 tokens a second against 85 for the full model, because more of Riker fits on the card.

Verdict: the best fit for a 16 GB card for everyday work and routing; coding goes to a bigger brain or to the specialists later.

### 18Bob Bill, line A (v1)

Cut from the healed Riker, 128 experts per layer. The session's clock cap stopped his healing at step 155 of 456, so he is under-healed.

- Held-out loss 0.585 before healing, 0.501 after (capped).
- Files: Q4 11.4 GB, Q3 9.1 GB. Fits a 16 GB card entirely.
- Tool-calling 65%, routing 17 of 17, short facts 12 of 20, small coding tasks 0 of 6, about 190 tokens a second.

Verdict: tools and routing survive a 50% cut almost untouched even half-healed; facts and coding do not. Bill is being remade with a full pass (below).

### 24Bob Riker, line B (v2)

Same cut as v1 (his exact keep list), healed for a complete pass of Bob's lessons plus the 717 coding and software-engineering lessons on a rented H200, 524 of 524 steps in 4.8 hours: the first full pass. So v1 against v2 is "part-healed on Bob lessons" against "fully healed on Bob plus coding lessons"; the held-out scores say the extra steps mostly made up for the harder mix.

- Held-out loss 0.389 before, 0.356 after (v1: 0.355; full Qwen 0.324).
- General-text loss 2.245 before, 2.221 after (v1: 2.224), so the coding lessons cost no general knowledge.
- Files: Q4 15.0 GB, Q3 11.9 GB, plus a 1.5 GB adapter.
- Tool, routing and coding races against v1 are next; v1 stays as the fallback, and v2 is dropped if tools or routing slip by more than a point or two.

### 18Bob Bill, line B (v2)

Cut from the healed Riker v2 with his v1 keep list, full pass. Healing now (6 November 2026); export and benchmarks follow.

### What each session cost

| Session | Card | Made | Cost |
|---|---|---|---|
| Lessons | H100, 1 hour | 3,753 lessons | US $3.98 |
| Line A | H100 | Riker v1, Bill v1 (capped) | US $30.35 |
| Line B | H200 SXM + 100 GB volume | 717 coding lessons, Riker v2, Bill v2 | about US $81 |

## What comes next

1. **Benchmark Riker v2 and Bill v2** against v1 and the stock models on the test machine: tool calls, routing, facts, coding, speed.
2. **12Bob Homer**, line B: count Bill v2's experts, cut to about 80 per layer, full-pass heal, export. About 5 hours on an H100, US $20 to 25. Then decide whether line A is worth continuing (its full-precision Riker was lost with its machine and would need one re-heal, about US $25).
3. **Down the ladder**: Milo, Mario, Luke, Calvin, Goku, each cut from the healed Bob above, then the four specialists, and 2Bob Bender last.
4. **In the app.** Bob's own models become the default brains: when Bob suggests a starter set, a Bob is picked before a stock model of the same size. The Forge and the model lab are in this repository under [`model-lab/`](../model-lab/) (GPL, like the rest of Bob); the lessons, counts and finished Bobs they make stay on the machine that made them. The engine will turn on expert-in-RAM offloading by itself when a Bob is bigger than the card. Every Bob gets the "experts per word" dial (4 to 8).
5. **Release.** All at once on Hugging Face, with model cards that say exactly what each Bob is cut from, how it was healed and how it scored, and pinned download links in Bob's catalogue. Until then: tested, not yet released.

## Expectations, honestly

- The top rungs (Riker, Bill) should be nearly as good as the teacher at Bob's own work and noticeably faster on a 16 GB card. Riker already is.
- Coding is the first thing to go when experts are cut. The coding lessons in line B and the Cypher specialists are the two bets on getting it back; if neither works, Bob keeps a stock coding brain in that slot.
- The small rungs (5Bob and below) will not match the teacher. The target is "a better 4B than the stock 4B at being Bob": right tool, right format, Bob's voice, on a phone.
- Healing above about 5Bob is not practical on home hardware, so the family depends on short rentals, which is why every session has caps and every step is scored before the next one is paid for.
- Numbers on this page are from the project's own benchmarks on one test machine (a 16 GB NVIDIA card). They are for comparing Bobs with each other and with the models they replace, not for comparing with published leaderboards.

## Credits

Made from Qwen3.6-35B-A3B by Alibaba Cloud's Qwen team (Apache 2.0). Healing uses PyTorch, Hugging Face transformers and PEFT, and llama.cpp for counting, quantizing and running. Expert pruning follows the idea in Cerebras' REAP work; depth-and-width pruning for 2Bob follows NVIDIA's Minitron. Bob is inspired by the wonderful books of Dennis E. Taylor. Not affiliated with or endorsed by the author.
