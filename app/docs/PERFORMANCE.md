# How Bob stays fast and light

Bob runs AI models on your own PC, and your PC has other jobs too: games, a browser, maybe Unreal or Blender. So Bob was built with two goals that pull against each other:

1. **Answer quickly.**
2. **Get out of the way.** Hold as little graphics memory as possible, and let it go the moment he's done.

This page explains what we did about both, with the numbers we measured. It's written for curious people and programmers. You don't need any of this to use Bob, because the defaults already do the right thing.

**The replicant matrix** behind every number here: Ryzen 7 9800X3D, RTX 5070 Ti (16 GB), 32 GB DDR5, NVMe SSD, Windows 11. Your numbers will differ, so Bob has a built-in **Test Bob's speed** button to measure your own (see [Measure it yourself](#measure-it-yourself)).

A few words used below:

- **Brain**: a language model (an LLM). Bob uses different ones for different jobs.
- **Graphics memory (VRAM)**: the memory on the graphics card. Models are fastest when they fit entirely inside it.
- **Tokens**: pieces of words. Speeds are in tokens per second (tok/s); a token is roughly three quarters of a word.
- **First word**: time from pressing Enter to the first word of the reply appearing. **Full answer**: time until the reply is finished.
- **Cold / warm**: cold means the brain had to load first; warm means it was already loaded.

---

## The headline numbers

| What | Before | Now |
|---|---|---|
| Gaming session, "hi", brain already loaded | 38.7 s (Qwen3 4B Thinking 2507 thought first, and can't be told not to) | **0.1 s to the first word, 1.8 s to the full answer** (Qwen3 4B Instruct 2507) |
| Gaming session, "hi", brain not loaded yet | 28.6 s | **1.7 s / 2.8 s** |
| Gaming session, a 4,000-token chat, warm | (not usable) | **0.2 s / 2.8 s** |
| 26B main brain, generation speed | 5 tok/s (spilled out of the card at 131K context) | **71 to 75 tok/s** (32K context, fits on the card) |
| Quick replies on Low effort | about 200 tokens of thinking before the first word | no thinking step: the first word comes straight away |
| Prompt reading on the old 30B coding brain (Qwen3 Coder) | about 1,500 tok/s | **about 2,800 tok/s** (engine tuning) |
| Task queue file after a long day | 6.8 MB | **0.23 MB** |
| Graphics memory Bob holds while idle | a whole brain, all day | **nothing** (Free memory when Bob is idle, on by default) |

In the Gaming session the brain lives in system RAM and thinks on the processor. With **Gaming session: graphics card** on Automatic (the starting position), the engine borrows about 0.6 GB of graphics memory to read your message quickly, but only while your game leaves room; while the game needs the card, Bob stays off it entirely.

---

## Picking the main brains

The everyday, Coding, Office and Deep thinking brains were each picked in a race against the brain they'd replace, on the replicant matrix. Full tables, settings and caveats: **[Brain races](BRAIN-RACES.md)**.

## Picking the Gaming brain

The Gaming session's promise is simple: **the graphics card belongs to your game.** Bob's brain stays off it; at most he borrows about 0.6 GB to read messages quickly, and only while the game leaves room (1.5.32). If the processor is maxed out, his small brain moves onto the card when it fits with room to spare, because a maxed processor took 56 s to say hi. He still chats and listens, but on the processor (CPU), with a small brain in system RAM. Pictures, clips, music and anything at Medium effort or higher wait in Tasks until you switch back. Nothing is dropped.

A brain on the processor is much slower than on the card, so the choice of brain decides whether Gaming feels alive or broken.

### What we measured

Two things matter for a chat brain:

- **Time to first thought**: how long until Bob starts answering. This is what makes him feel responsive.
- **Time to full answer**: how long until he's done.

**How we tested.** llama.cpp (CUDA build b12032) with an 8K context, one chat slot, 8 threads and a compact (8-bit) memory for the chat. Every request carried Bob's real system prompt plus 9 tools, about 2,300 tokens, so these are honest numbers, not "hello world" numbers. "On the processor" means the brain sits in RAM and runs on the CPU, which is how Gaming runs it. Each test was run cold (brain not loaded, start-up included) and warm (already loaded, the earlier turn cached).

Seconds to the first word / to the full answer, on the processor:

| Brain | "hi" cold | "hi" warm | One-line question, warm | 4K-token chat cold | 4K-token chat warm | Writing speed | RAM |
|---|---|---|---|---|---|---|---|
| **Qwen3 4B Instruct 2507** (picked) | 1.7 / 2.8 | 0.1 / 1.8 | 0.1 / 7.1 | 2.1 / 5.6 | 0.2 / 2.8 | 14 to 16 tok/s | 3.5 GB |
| Qwen3 1.7B | 1.7 / 2.1 | 0.1 / 0.5 | 0.1 / 2.5 | 1.9 / 10.1 | 0.1 / 1.6 | 24 to 29 tok/s | 2.1 GB |
| Gemma 4 E4B | 6.7 / 7.6 | 0.3 / 1.0 | 0.4 / 6.9 | 7.1 / 28.6 | 0.4 / 19.3 | 13 tok/s | 3.9 GB |
| Qwen3 4B Thinking 2507 (what Ollama calls "qwen3:4b") | 2.8 / 28.6 | 0.1 / 38.7 | 0.1 / 38.7 | 3.3 / 46.9 | 0.2 / 44 | 14 to 16 tok/s | 3.5 GB |

The Thinking version starts quickly, then thinks to itself for half a minute before it says anything useful, even when told not to. That's the 29 to 39 s the 2507 version got rid of.

**What about hiding the graphics card completely?** We also ran every brain with the card hidden from the engine. Warm replies are about as fast, but a cold start is far slower, because the processor then has to read the whole 2,300-token prompt by itself: 2507 takes about **26 s** to its first word instead of 1.7 s, and a cold 4K chat about 81 s. Lending the engine about 0.6 GB of the card is what keeps Gaming chat feeling alive, so Automatic lends it whenever the game leaves room, and **Never use the card** is there if you'd rather wait.

### Can it use tools?

Speed isn't enough. Bob does things by calling tools (set a reminder, paint a picture, zip a folder), so a Gaming brain that fakes tool calls is worse than a slow one. We gave nine brains the same 25 everyday requests and checked whether each one picked the right tool.

"Bob's real path" is how Bob actually works: he starts with a small core set of tools, and if the brain says it can't do something, he offers every tool and asks again. We also tried offering every tool at once, and the core set only. A "faked" call means the brain wrote the tool call as plain text instead of actually making it.

| Brain | Runs on | Right, Bob's real path | All tools at once | Core tools only | Faked calls | Average time |
|---|---|---|---|---|---|---|
| Qwen3 4B Thinking 2507 | processor | **23** | 22 | 18 | 0 | 54 s |
| **Qwen3 4B Instruct 2507** (picked) | processor | **22** | 21 | 11 | 0 | **3.4 s** |
| Qwen 3.8 27B | card | **22** | 22 | 22 | 0 | 5.1 s |
| Gemma 4 26B | card | 20 | 19 | 16 | 1 | 1.2 s |
| Qwen3 Coder 30B | card | 20 | 20 | 15 | 0 | 7.4 s |
| Qwen3 1.7B | processor | 20 | 20 | 9 | 1 | 1.9 s |
| Gemma 4 E4B | processor | 14 | 15 | 13 | 0 | 3.6 s |
| Qwen2.5 Coder 7B | card | 2 | 2 | 2 | 16 | 0.6 s |
| GPT-OSS 20B (copy from Ollama, no template) | card | 2 | 2 | 2 | 4 | 7 s |

Two things jump out:

- **The fallback matters.** On core tools alone, the small brains often say "I can't do that yet" instead of asking for the tool they need. Bob's real path catches that and retries with every tool, which takes 2507 from 11 to 22.
- **Qwen2.5 Coder 7B and GPT-OSS 20B didn't fail at thinking, they failed at formatting.** Qwen2.5 Coder writes its tool calls as plain JSON text, and our copy of GPT-OSS had no chat template, so its calls came out as text in its own format. Once that was fixed, both became real contenders (see below).

After the fixes, we ran the full 25 jobs again for these two, on the card with Bob 1.5.30's wording (the round-1 fixes; these runs came before 1.5.33):

| Brain | Right, Bob's real path | All tools at once | Core tools only | Calls rescued from plain text | Average time |
|---|---|---|---|---|---|
| **GPT-OSS 20B** (official llama.cpp build) | **25** | 23 | 11 | 0 | **0.3 s** |
| Qwen2.5 Coder 7B (with the text-call rescue) | 16 (was 2) | 19 | 5 | 14 (of its 16 right) | 0.6 s |
| GPT-OSS 20B (copy from Ollama, no template) | 2 | | | | |

The official GPT-OSS build is the best tool user we measured: every job right, in about a third of a second each. It runs on the graphics card, so it's a candidate for Bob's card-based slots rather than for Gaming. Qwen2.5 Coder went from 2 to 16 purely because Bob 1.5.29 learned to read plain-text tool calls, which is good news for lighter PCs. (It scored higher with every tool offered up front, 19, than on Bob's real path; we're looking into why.) The copy without a template stays at 2: a rescue can't fix a file that doesn't describe its own conversation format, so get the official build.

### Who missed which job

11 of the 25 jobs were right for all seven working brains. These are the 14 that tripped at least one of them up. ✓ means right.

| Job (the tool it needs) | 2507 | 1.7B | E4B | Gemma 26B | Qwen 3.8 | Coder 30B | 4B Thinking |
|---|---|---|---|---|---|---|---|
| Make a chiptune song (music) | asked first | ✓ | asked first | asked first | empty reply | asked first | ✓ |
| Zip up a folder (files) | ✓ | ✓ | asked first | asked first | looked first | looked first | looked first |
| Fix a crash in a code project (coding copy) | asked which project | asked which project | wrong tool | wrong tool | ✓ | wrong tool | ✓ |
| Undo the last file move (undo) | ✓ | "nothing to undo" | "nothing to undo" | ✓ | ✓ | wrong tool | "nothing to undo" |
| Today's weather (web search) | "can't look it up" | "can't look it up" | ✓ | wrong tool | ✓ | ✓ | ✓ |
| Make a short video clip (video) | ✓ | ✓ | asked first | "can't make video" | empty reply | ✓ | ✓ |
| Tidy a folder by file type (files) | ✓ | ✓ | asked first | ✓ | ✓ | looked first | ✓ |
| Read a text file and sum it up (read file) | ✓ | wrong tool | ✓ | ✓ | ✓ | ✓ | ✓ |
| Remember a preference (memory) | ✓ | faked it | ✓ | ✓ | ✓ | ✓ | ✓ |
| Draw a picture (pictures) | ✓ | ✓ | said yes, didn't | ✓ | ✓ | ✓ | ✓ |
| Tidy a folder every day (schedules) | ✓ | ✓ | asked first | ✓ | ✓ | ✓ | ✓ |
| Save it as a spreadsheet (documents) | ✓ | ✓ | asked first | ✓ | ✓ | ✓ | ✓ |
| Search my project files (documents) | ✓ | ✓ | asked first | ✓ | ✓ | ✓ | ✓ |
| Click a button in an app (apps) | ✓ | ✓ | asked first | ✓ | ✓ | ✓ | ✓ |
| **Right out of 25** | **22** | **20** | **14** | **20** | **22** | **20** | **23** |

How to read the misses:

- **"Asked first"** isn't always wrong. "Which folder?" before zipping is a fair question; it just isn't what the test counted. Most of Gemma 4 E4B's misses (9 of 11) are this kind of politeness. On Ollama it scored 24/25 in an earlier test, so on Bob's engine it's simply more cautious.
- **"Asked which project"** is a fair question too: the request didn't name one.
- **"Looked first"** means the brain listed the folder before acting. Sensible, but an extra step.
- **"Nothing to undo"** was actually true in the test (there was no recent move), so those are arguably right.
- **"Can't look it up"** on the weather is now the *correct* answer when web search is off, which is the default since Bob 1.5.27.
- **Empty replies** from Qwen 3.8 came on the retry path and were probably timeouts.
- **Music, video, zip, undo and the code crash** were the hardest jobs for every brain. Those are also the jobs where Bob's approval cards and "I'll ask first" habits matter most, so a brain that checks before acting there isn't a disaster.

### Why Qwen3 4B Instruct 2507

- **Best tool score of the fast brains** (22/25), tied with Qwen 3.8 27B, which needs the graphics card.
- **No thinking delay.** The 2507 Instruct version is the same 4B family as the Thinking version, trained to answer directly. The Thinking version scored one more point but took 54 s per request on average; 2507 took 3.4 s.
- **About 2 s from cold and 0.1 to 0.2 s warm to the first word**, and most replies are finished in 2 to 7 s, on the processor.
- **3.5 GB of RAM**, which leaves plenty for a game on a 32 GB PC.
- Qwen3 1.7B is faster and lighter (2.1 GB) and a good choice for PCs with less RAM, but it scored 20 and once faked a tool call. Gemma 4 E4B is a fine brain on the card, but on the processor it is about 4 times slower to start and, on this engine, much more hesitant with tools.

You can change it: Settings, Brains, Session brains.

### The card or processor rule

Where each brain runs, in plain terms:

| Session | Chat brain runs on | Why |
|---|---|---|
| Normal | the graphics card | Fastest replies. Freed when idle. |
| Art | the processor | The card is kept for pictures, video and sound, so Bob can keep talking while a picture paints. |
| Coding | the graphics card | One big coding brain with a long memory. Small side jobs go to the processor. |
| Office | the graphics card | One all-rounder brain, no swaps. |
| Gaming | the processor (borrows a little of the card only when it's free) | The card belongs to your game. |

**Why not run everything on the processor all the time?** Because long prompts are where the processor hurts. With a 4,300-token prompt, Gemma 4 E4B takes about **31 s** to the first word on the processor and about **4.4 s** on the card. Short chats on a small instruct brain are fine on the processor; long ones on a bigger brain are not. So in Normal it's a choice: **Keep the graphics card free for quick answers** (Settings, Speed & memory) moves Low-effort replies to the processor, and it is off by default.

### Gaming and the graphics card

Borrowing 0.6 GB is great when the card is idle-ish, and rude when a game is using every bit of it. Hiding the card entirely is polite, but slow. And when the *processor* is flat out (a game hammering all 8 cores), running the brain there gets painful: on the replicant matrix, with a stand-in "game" keeping all 16 logical cores busy, the processor brain was starved:

| Gaming brain (2507) placed on | "hi" cold | "hi" warm | One-line question, warm | Writing speed | Game kept its speed | Graphics memory |
|---|---|---|---|---|---|---|
| Processor (card reads the prompt) | 8.2 / 55.9 s | 3.6 / 82 s | 2.7 / 257 s | 0 to 0.4 tok/s | about 100% | 0.6 GB |
| Graphics card | 1.8 / 1.9 s | 0.0 / 0.2 s | 0.0 / 0.7 s | 171 to 178 tok/s | 96% | 3.6 GB |

The game wins every fight for the processor, so a processor brain under full load is useless: over four minutes for a one-line answer. On the card, the same brain answers in about 2 seconds and costs the game 2 to 4%. When it's the card that's busy and the processor has room, the processor brain is fine (the idle tables above).

So since Bob 1.5.32, **Gaming session: graphics card** (Settings, Speed & memory) is a three-position switch:

| Position | What Bob does |
|---|---|
| **Automatic** (to start with) | Card busy (80% use or more, or under 1.5 GB free): processor only, and the card is hidden from the engine. Card has room: borrows about 0.6 GB to read messages. Processor at 90% or more and room on the card for the brain plus 2 GB: puts the whole small brain on the card (about 3.6 GB for the 2507 brain), because the processor would crawl. No NVIDIA card, or no reading: borrows, as before. |
| **Never use the card** | Processor only. The card is all yours; the first reply after loading is much slower (about 26 s cold on the replicant matrix). |
| **Always borrow a little** | About 0.6 GB, even while a game is using the card. How Gaming worked before 1.5.32. |

Automatic checks each time the Gaming brain loads and again every quiet minute. If the answer changes, Bob unloads the brain and the next chat loads it the new way (about 1.5 s). He never switches mid-reply.

---

## Keeping graphics memory free

### Bob lets go when he's quiet

**Free memory when Bob is idle** is on by default. After a quiet time you choose (1 minute to 1 hour, 5 minutes to start with), Bob unloads his Quick brain and holds **nothing** on the graphics card. Typing loads it again.

What that costs: the Quick brain (Gemma 4 E4B) loads in about **6 s** and uses 6.2 GB. Unloading takes **0.3 s**.

Optional, off by default: **Get Bob ready while you type** starts that load the moment you start typing, so most of the 6 s is hidden behind your typing.

### Big brains only for big jobs

The 26B brain (Medium effort and up) and the coding brain load **only for the job that needs them**, then go about 2 minutes later. The 26B takes 22 to 29 s to load and uses 15.6 GB, nearly the whole card, so keeping it around "just in case" would starve everything else.

### Back to the Quick brain after every job

After a big job or a picture, Bob goes straight back to the small Quick brain. Your next chat message gets a fast answer instead of waiting behind a reload.

### Pictures don't make you wait twice

A picture with Z-Image Turbo (1024 px, 8 steps) takes about 28 to 31 s in total on the replicant matrix: about 6 to 8 s to load, 8 to 9 s to read the prompt, 16 to 18 s to paint and 1.7 s to decode, peaking at 13.5 GB.

The painter and the chat brain can't share a 16 GB card, so Bob hands the card over. Three things keep that hand-off cheap:

- **Show pictures without waiting for Bob's brain** (on by default): the finished picture appears straight away with a short line. Bob doesn't reload his brain just to say "here it is". That reload was about 6 s on the Quick brain and 22 to 29 s on the 26B.
- **"Make another picture?"**: for about 10 seconds after a picture Bob asks. Say yes and the picture model stays ready for 2 minutes, so the next one skips the load. Say no (or ignore it) and it's freed at once.
- **Careful hand-offs**: the brain gives the card to the painter before it loads, and Bob checks free system RAM too, not just graphics memory.

An optional quick-load version of the picture model (Q8) is an 11 GB download instead of 20 GB, loads faster, and leaves room for the Quick brain alongside it.

We also measured whether merging the chat and picture engines into one process would help. On this PC the swap is about 6 s of a 36 s picture (17 to 20%), and both still can't fit on the card at once, so we kept them separate and made the hand-off cheaper instead.

---

## Engine tuning

Bob ships his own engine, **llama.cpp**, so he needs nothing else installed. (Ollama still works if you already use it.)

- **Fit to free graphics memory** (`--fit`, on): llama.cpp places the model's layers around whatever else is using the card right now, instead of a fixed split. We found that forcing every layer onto the card (`-ngl 999`) quietly switched this off, so Bob no longer sets it.
- **32K context by default.** At 131K, the 26B brain no longer fit on a 16 GB card. The overflow went to shared system memory, and speed fell to **5 tok/s**. At 32K it uses 13.8 GB on the card, runs at **71 to 75 tok/s** and is ready in about 23 s. For normal chats, 32K was also about 15% faster than 128K. Office keeps 64K, and Coding keeps the engine's full default. Each session can be changed in Settings, Brains.
- **One chat gets the whole context** (`-np 1`), instead of splitting it across parallel slots Bob never uses.
- **Threads and batch sizes**: 8 threads, batch and micro-batch 2048. Gemma 4 26B runs at about 74 tok/s, on a par with Ollama's 77. Prompt reading on the old 30B coding brain (Qwen3 Coder) went from about 1,500 to about 2,800 tok/s.
- **Compact memory for the chat history** (8-bit KV cache) and flash attention, so long chats take less graphics memory.
- **A thinking cap on Medium effort**: at most about 1,500 tokens of thinking, then Bob is told to answer.
- **No thinking on Low effort**: quick replies skip the thinking step entirely. Gemma 4 used to spend about 200 tokens thinking before the first word.
- **Speculative decoding** (off, experimental): a small draft brain guesses ahead and the big one checks. It's often 1.5 to 2 times faster with identical answers, but it depends on the pair, so measure it.

For tinkerers, every one of these is in Settings, Engines. The exact command Bob used is saved next to his notes, so you can see what ran.

---

## Shorter prompts, faster first words

Every word Bob sends to the brain has to be read before the reply starts. So:

- **Slim tools**: each chat starts with a small core of tools, and Bob adds the picture, file and Hands groups only when a message needs them. With every tool attached, a prompt is about 5,000 tokens; with the slim set it's about 2,000. On the processor, that difference is seconds.
- **Give Bob all his tools at once** (off) is there if a brain ever can't find a tool.
- **Slim task records**: finished jobs keep a short record instead of their whole transcript, which took the task queue from 6.8 MB to 0.23 MB and keeps start-up and the Tasks page snappy.

---

## Opt-in speed switches

These are all **off until you turn them on** (Settings, Speed & memory). Bob never changes your PC's settings by himself.

- **Get Bob ready while you type**: starts loading and reading his instructions as soon as you start typing. On the processor he also keeps a copy of that reading on disk, so the next start is quicker.
- **Let games go first**: when Bob works on the processor, he uses fewer cores at lower priority. His replies may be a little slower; your frame rate stays smooth. Worth turning on if you game with Bob open.
- **Match picture settings to my graphics card**: big cards keep the picture model in graphics memory (faster). Cards with 8 GB or less, and built-in graphics like a handheld's, make pictures at 768 px so they fit and come quicker. If a picture fails with these settings, Bob goes back to the usual ones.

---

## Measure it yourself

- **Test Bob's speed** (about a minute): Bob frees his brain, wakes it as if you'd started typing, and times the load, the first word, the full answer and a second reply. Your last 6 results are kept in a table along with the switches that were on, so you can test, change one thing, and test again.
- **Check this replicant matrix**: looks for things that slow AI down and explains how to fix each one. It checks for memory running below its rated speed (EXPO or XMP off in the BIOS), an old NVIDIA driver, a laptop on battery, models on a slow drive, and other apps holding graphics memory. It only reads; it never changes Windows or driver settings.

Neither one goes online.

---

## Reliability

Speed is no good if a job falls over halfway.

- **Pinned downloads**: every model and engine file has a known size and SHA-256 checksum. Bob checks each one after downloading and deletes anything that doesn't match. Downloads resume after a pause, a dropped connection or a restart, and nothing downloads until you confirm it.
- **Engine hiccups**: if the engine drops out during a hand-off, Bob reloads it and tries once more. If a chosen brain won't load at all, he falls back to the main brain.
- **Strict tool lists**: Bob never sends an empty choice list in a tool's description. llama.cpp rejected the whole request when that happened.

---

## What testing taught us

Measuring nine brains on a real PC turned up a few things we didn't expect. Some were Bob's bugs, some were the test's, and one was the brains being polite. Here's what we learned and what changed.

### A busy processor starves a brain completely

We assumed a brain on the processor would just get a bit slower while a game ran. It doesn't: with every core busy, the game wins every fight for the processor, and "hi" took anywhere from 56 seconds to over 4 minutes. The same brain on the graphics card answered in 0.2 to 2 seconds while the game kept 96 to 98% of its speed. That's why the Gaming session's graphics card switch has an **Automatic** position that moves the small brain onto the card when the processor is maxed out (see [Gaming and the graphics card](#gaming-and-the-graphics-card)).

### Judge a brain by when it starts and finishes

Tokens per second is the number everyone quotes, but it's not what you feel. What you feel is how long until Bob starts answering and how long until he's done. A 4B brain with no forced thinking (Qwen3 4B Instruct 2507) starts in 0.1 to 2 s and finishes in 2 to 7 s on the processor. A thinking model the same size and speed takes 30 to 50 s to say hi.

### Check what a model really is

The brain Ollama calls "qwen3:4b" turned out to be **Qwen3 4B Thinking 2507**, which thinks on every reply and can't be told not to. We'd been treating it as the older hybrid model that can switch thinking off. The name inside the model file told the truth; the short tag didn't, so check the file when picking a brain.

### Small brains are enough for everyday jobs

Qwen3 4B Instruct 2507 (3.5 GB) matched the 27B Qwen 3.8 on tool use (22/25), and Qwen3 1.7B (2.1 GB) scored 20/25, both on the processor alone. You don't need a big graphics card for Bob to be useful, which is good news for laptops and lighter PCs.

### "Asking first" was the wording, not the engine

Gemma 4 E4B scored 24/25 on Ollama in an early test and 14/25 on Bob's own engine, so we suspected the engine. A side-by-side test on the same replicant matrix showed E4B behaves the same on both. The real cause was Bob's instructions, which made brains cautious: most of E4B's misses were "which folder?" or "what style?" instead of just doing the job. Bob 1.5.30 tells his brains to get on with it using sensible defaults, say what they picked, and only ask when they truly can't guess. That alone turned 6 of E4B's 11 misses into real tool calls.

### Why tool calls failed, and the fixes

When we dug into every miss, three causes kept coming up:

- **No sampling settings.** Bob sent none, so every brain ran on the engine's loose defaults. Each brain now gets its maker's recommended settings, a little cooler when it's choosing a tool.
- **A missing chat template.** One older model file had no template describing how to lay out a conversation, so its tool calls came out as garbage. Bob now supplies the right template when a file lacks one.
- **Announcing a job, then stopping.** Brains would say "I'll draw it. What style?" and never make the call. Bob's instructions now say the tool call goes in the same reply as the announcement.

Two brains, Qwen2.5 Coder 7B and the copy of GPT-OSS 20B we had from Ollama, also wrote their tool calls as plain text instead of real calls. Since Bob 1.5.29, he recognises those and runs them anyway. The official GPT-OSS build carries its own template, so it doesn't need the rescue.

And one we'd fixed earlier: a tool description with an empty list of choices made llama.cpp refuse the whole request for the Qwen brains. Bob 1.5.26 leaves empty lists out.

### Test the real thing

Our first tool test was unfair. It told the brains "you can't make pictures, video or music" while handing them exactly those tools, and that's where the worst misses were. The new test uses Bob's real instructions and settings, lets a brain look at a folder before acting, and reruns only the jobs that failed, so a fix is measured where it matters.

### After the fixes

The scores earlier on this page are the first round, before any of these fixes. We then reran only the jobs each brain had failed, on Bob's own code, three tries each. A job only counts as fixed if the brain got it right all three times. Pass 1 used the new wording and settings. Pass 2 reran whatever was left, with one more safeguard added. (The video job was skipped, because no video maker was installed on the test PC.)

| Brain | Old misses retested | Fixed in pass 1 | Fixed in pass 2 (of what was left) | Still not right 3 times out of 3 |
|---|---|---|---|---|
| Gemma 4 E4B | 10 | 4 | 2 of 6 | zip (2/3), spreadsheet (2/3), music (0/3, asks the mood), code search (0/3, asks which project) |
| Qwen3 4B Instruct 2507 | 3 | 2 | 0 of 1 | weather with web search off (1/3): says it can't, but not where the switch is |
| Qwen3 1.7B | 5 | 4 | 0 of 1 | the same weather case (1/3; once it made the weather up) |
| Qwen3 4B Thinking 2507 | 2 | 1 | 1 of 1 | none |
| Qwen3 Coder 30B | 5 | 4 | 0 of 1 | undo (1/3, wanders through folders first) |
| Gemma 4 26B | 4 | 4 | nothing left | none |
| Qwen 3.8 27B | 2 | 2 | nothing left | none |
| GPT-OSS 20B, with the right template | 22 | 18 | 1 of 4 | crash fix, music, code search (0/3 each, asks first) |

In pass 2 we also re-ran the tidy and zip jobs that pass 1 had fixed, to make sure the new safeguard didn't undo them. It didn't: they all still passed.

Gemma 4 26B and Qwen 3.8 27B now get every job we tested right. GPT-OSS went from 2 out of 25 to fixing 18 of its 22 misses in one go, just by giving it the template it was missing. What's left are mostly judgement calls, like asking "which project?" before searching code, or "what mood?" before writing music. Those are fair questions, not broken tools.

The weather miss was on us: with web search off, a small brain correctly said it couldn't look it up but forgot to say where the switch is. Bob 1.5.33 now tells every brain to always say where the switch is. (Video and music makers weren't installed on the test PC, so for those jobs a brain that said it couldn't make one counted as right.) Full 25-job scores for the official GPT-OSS build (25/25) and Qwen2.5 Coder with the text-call rescue (16/25) are in [Can it use tools?](#can-it-use-tools).

### Check that a fix actually arrived

The 32K context speed-up (see [Engine tuning](#engine-tuning)) never reached existing installs: an older settings file still asked every brain to reserve a 128K memory window, so big brains on those PCs stayed slower than they should be. Nothing broke, which is exactly why nobody noticed. Since Bob 1.5.32, an old 128K setting left in config.json is set aside, so brains use their session's size again (32K for most, 64K for Office). A size you pick in Settings still wins. Lesson learned: measure on a PC that has been updated, not only on a fresh one.

### Downloads: trust the file, not the signpost

One video model's download failed with "different size than Bob expects", even though the file itself hadn't changed. Its folder on Hugging Face had been renamed, and Bob was reading the size from the "this has moved" notice instead of from the real file. Since Bob 1.5.32, he follows the site's redirects to the real file before judging its size, checks the site's file list before refusing anything, and the links use the new folder name. Since Bob 1.5.33, every download link is also pinned to an exact version (commit) of its repository, so a rename can't move a link again. The size and SHA-256 pins (a fingerprint of the exact file) did their job: Bob refused the mismatch rather than keeping a file he couldn't vouch for.

## What's next

Ideas we've measured but are holding for later:

- **A draft brain for the 26B** (multi-token prediction): about 1.25 to 1.3 times faster on code for about 1 GB more graphics memory. It needs engine support first, and it would be opt-in.
- **Keeping the picture engine loaded between pictures**: it could skip 13 to 17 s of loading and prompt reading on repeat pictures, but only on cards big enough to hold the painter and a brain together.

Numbers on this page come from Bob's own test runs. If yours look very different, run **Check this replicant matrix** first. It's usually memory speed or another app holding the card.
