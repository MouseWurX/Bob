# Brain races: how Bob's brains were picked

Before a brain gets a slot in Bob's starter set, it races the brain it would replace, on the same PC, the same engine and the same jobs. This page has the full results of the races behind the current 16 GB lineup. The Gaming brain race is in [How Bob stays fast and light](PERFORMANCE.md#picking-the-gaming-brain).

**The reference PC** for every number here: Ryzen 7 9800X3D, RTX 5070 Ti (16 GB), 32 GB DDR5, NVMe SSD, Windows 11. **Engine:** Bob's own engine, llama.cpp b12032 (CUDA build), one brain at a time with nothing else on the card. Your numbers will differ; **Test Bob's speed** measures your own.

**The lineup these races chose (16 GB card):**

| Slot | Brain | Why |
|---|---|---|
| Brain (everyday chat) | Qwen3.6 35B-A3B, thinking off | As fast as Gemma 4 26B, stayed more in character in our tests, loads about 3 times faster |
| Coding | Qwen3.6 35B-A3B, thinking on | One more coding task solved; much faster than Qwen3 Coder at 128K; can see pictures |
| Office | Gemma 4 26B | Reads long documents about 45% faster and answers follow-ups about 3 times faster |
| Deep thinking | Gemma 4 26B in the starter set; Qwen 3.8 27B if you can wait | Qwen 3.8 solved planning tasks Gemma ran out of room on and handles 128K, but writes about 6 times slower |

Every Qwen3.6 copy runs at 128K context, so chat and coding share one load of the same file.

Words used below: **pass@1** means one try per task. **Thinking** is the brain working the problem through quietly before it answers. **`--n-cpu-moe`** is how many expert layers of a mixture-of-experts brain stay in system memory instead of on the card (lower is faster). **Cut off** means the brain was still thinking when it hit its token cap and never wrote an answer.

---

## 1. Coding: Qwen3.6 35B-A3B vs Qwen3 Coder 30B (2026-11-03)

### Brains and settings

| | Qwen3.6 35B-A3B | Qwen3 Coder 30B |
|---|---|---|
| File | Unsloth UD-Q4_K_XL GGUF, 22.4 GB (+ vision projector mmproj-F16, 0.9 GB) | Q4_K_M GGUF, 18.6 GB |
| Kind | Mixture of experts, about 3B active, thinking can be switched on or off, can see pictures | Mixture of experts, about 3B active, no thinking, no vision |
| Fit at 32K (`--n-cpu-moe`, VRAM) | 18, 15.2 GB, loads in about 6 s | 14, 15.2 GB, loads in about 16 s |
| Fit at 128K | 20, 14.7 GB | 30, 15.2 GB |
| Sampling | thinking: temperature 0.6, top_p 0.95, top_k 20, min_p 0 · no thinking: 0.7, 0.8, 20, presence penalty 1.5 | 0.7, top_p 0.8, top_k 20, repeat penalty 1.05 |
| Token cap | 16,000 (thinking) / 8,000 | 8,000 |

Common flags: `-c 32768` (131072 for the long-memory test), `-fa on`, `-ctk q8_0 -ctv q8_0`, `-t 8`, `-b/-ub 2048`, `-np 1`, `--jinja`. The fit is the fewest expert layers in system memory that load, answer and leave at least 900 MiB of the card free.

### Tasks

13 tasks, pass@1: 10 Python coding tasks scored by hidden unit tests, and 3 multi-step tool chains with pretend tools (search, read a file, read a to-do board, add a to-do).

| Task | Qwen3.6 thinking | Qwen3.6 no thinking | Qwen3 Coder |
|---|---|---|---|
| duration parser | PASS 78.5 s | fail 11.7 s | fail 2.6 s |
| roman numerals | PASS 25.6 s | PASS 3.2 s | PASS 2.4 s |
| merge intervals | PASS 25.8 s | PASS 2.5 s | PASS 1.9 s |
| LRU cache | PASS 32.7 s | PASS 6.9 s | PASS 2.2 s |
| slugify | fail 34.6 s | fail 3.4 s | fail 1.8 s |
| bug fix | PASS 21.5 s | PASS 2.2 s | PASS 0.9 s |
| CSV summary | PASS 57.2 s | PASS 4.5 s | PASS 2.6 s |
| plan order | PASS 55.5 s | PASS 7.1 s | PASS 3.2 s |
| plan schedule | PASS 68.8 s | PASS 7.4 s | PASS 5.0 s |
| word wrap | PASS 43.3 s | PASS 3.4 s | PASS 2.8 s |
| tools: find version | PASS 5.4 s | PASS 3.0 s | PASS 2.2 s |
| tools: to-do | PASS 5.0 s | PASS 1.6 s | PASS 2.5 s |
| tools: find a bug | PASS 9.3 s | PASS 5.1 s | PASS 3.1 s |
| **Total** | **12/13**, 463 s | **11/13**, 62 s | **11/13**, 33 s |

All three failed slugify the same way: accented letters weren't folded ("Café Déjà vu" should become "cafe-deja-vu"). No answer hit its token cap; thinking used at most 6,395 tokens.

### Speed and long context

| | Qwen3.6 thinking | Qwen3.6 no thinking | Qwen3 Coder |
|---|---|---|---|
| Writing, short prompt | 81.3 tok/s | 70.5 tok/s | 70.2 tok/s |
| Reading a 12K-token prompt | 2,905 tok/s | 3,355 tok/s | 4,293 tok/s |
| Writing after 12K | 81.9 tok/s | 72.0 tok/s | 66.4 tok/s |
| Single tool call | correct | correct | correct |
| Picture description | n/a | correct | no vision |
| 128K long-memory test (a hidden word in a 114K-token prompt) | PASS: reads 2,673 tok/s (43 s), writes 50.9 tok/s, VRAM 14.8 GB, RAM 20.8 GB | | PASS: reads 1,401 tok/s (81 s), writes 21.2 tok/s, VRAM 15.3 GB, RAM 16.0 GB |

### What it showed

- Coding quality is a tie with thinking off (11/13 each). Thinking on solved one more task, at about 14 times the time.
- At short context, Qwen3 Coder answers faster and reads prompts about 30% faster.
- At 128K, Qwen3.6 keeps more of itself on the card (20 vs 30 expert layers in system memory). It reads long prompts about 1.9 times faster, writes about 2.4 times faster, and can see pictures.
- So Qwen3.6 became the Coding brain at 128K. Qwen3 Coder is still in Get models to pick.

Caveats: one try per task on 13 tasks; a few early timings overlapped another processor job; reloads after giving the card back to another app aren't counted in task times.

---

## 2. Everyday chat and Office: Qwen3.6 35B-A3B vs Gemma 4 26B (2026-11-03)

Bob's real system prompt, tool list and engine code were used for the routing and chat tests.

### Settings

| | Qwen3.6 thinking off | Qwen3.6 thinking on | Gemma 4 26B |
|---|---|---|---|
| Sampling | temperature 0.7, top_p 0.8, top_k 20, presence penalty 1.5 | 1.0, 0.95, 20, presence penalty 1.5 (table job: 0.6, no penalty) | 1.0, top_p 0.95, top_k 64 |
| With tools offered | temperature capped at 0.6 | capped at 0.6 | capped at 0.6 |

Common flags: `-fa on`, `-ctk q8_0 -ctv q8_0`, `-t 8`, `-b/-ub 2048`, `-np 1`, `--jinja`, the brain's own chat template, vision projector loaded at 32K. `--n-cpu-moe` fitted per brain and context.

### Everyday chat at 32K

| | Qwen3.6 off | Qwen3.6 on | Gemma 26B |
|---|---|---|---|
| Fit (`--n-cpu-moe`), VRAM | 20, 14.6 GB | same server | 10, 15.1 GB |
| Load (warm disk cache) | 5.4 s | | 15.5 s |
| Picking the right tool or hand-off: 16 real jobs × 3 tries, right every try | 15/16 (1.3 min) | 12/16 (19 min) | **16/16** (0.6 min) |
| Chat, first word | 0.12–0.16 s | **17–32 s** (thinks first) | 0.13–0.16 s |
| Chat, writing speed | 73–79 tok/s | 75 tok/s | 74–77 tok/s |
| Picture description | correct, 2.3 s | correct, 20.9 s | correct, 1.4 s |

The routing test covers 25 kinds of request (reminders, to-dos, files, web search, pictures, music, memory, hand-offs to helper copies and more). 9 were skipped because "I can't do that here" was the right answer on this setup. Most of Qwen3.6's misses were switching to another session first instead of handing the job over, which the test counts as a miss.

Tone, judged on six everyday chats with Bob's persona: Qwen3.6 with thinking off was the most in character, playful and warm, sometimes a little long. With thinking on it was careful but flatter. Gemma was tidy and shorter, with weaker jokes.

### Office at 64K

A made-up handbook of about 50K tokens, with five facts hidden in it.

| | Qwen3.6 off | Qwen3.6 on | Gemma 26B |
|---|---|---|---|
| Fit, VRAM, RAM | 18, 14.5 GB, 22.5 GB | same, 23.2 GB | 8, 15.2 GB, 18.3 GB |
| Load | 10.7 s | | 15.2 s |
| Summarise (8 sections named) | 8/8, 26.3 s (reads 2,476 tok/s) | 8/8, 60.2 s | 8/8, **18.2 s** (reads 3,593 tok/s) |
| 5 questions on the hidden facts | 5/5, 6.1 s | 5/5, 72.0 s | 5/5, **2.2 s** |
| Draft an email (5 checks) | 5/5, 2.5 s | 5/5, 19.4 s | 5/5, 2.4 s |
| Sales table: totals, order, grand total (6 checks) | 5/6, 4.2 s | **6/6**, 20.9 s | 5/6, 1.2 s |

Both table misses were the same sort-order slip (3,900 placed above 3,915).

### Swapping to the Coding brain at 128K

| From | To | Load + first word |
|---|---|---|
| Qwen3.6 at 32K | Qwen3.6 at 128K (same file, longer memory) | 5.6 s |
| Qwen3.6 at 32K | Qwen3 Coder at 128K | 14.1 s |
| Gemma 26B at 32K | Qwen3 Coder at 128K | 16.0 s |

### What it showed

- Everyday chat: Qwen3.6 with thinking off and Gemma 26B are equally fast. Qwen3.6 sounds more like Bob and loads about 3 times faster; Gemma is the steadier tool-picker.
- Thinking on is wrong for everyday chat: 17 to 32 s before every reply.
- Office: all three get the content right. Gemma reads long documents about 45% faster, answers follow-ups about 3 times faster and uses about 4 GB less system memory.
- So: Qwen3.6 (thinking off) for everyday chat, Gemma 4 26B for Office, Qwen3.6 (thinking on) for Coding, with every Qwen3.6 copy at 128K so chat and coding share one load.

Caveats: small samples (3 tries per routing job, 6 chats, 4 office jobs); load times are from a warm disk cache.

---

## 3. Live checks: Qwen3.6 as chat and Coding brain at 128K (2026-11-03)

Run on a separate test install of Bob (its own folder and ports), with Bob's normal launch line:
`-c 131072 --jinja --mmproj mmproj-F16.gguf -fa on -ctk q8_0 -ctv q8_0 --fit on -np 1`

### Speed at 128K (Bob 1.5.63)

One Low-effort coding reply with thinking off, then a direct streamed request to the same server.

| Measure | Result |
|---|---|
| Whole first job from cold, including the load | 21.8 s |
| First word (loaded, short prompt) | 0.37 s |
| Writing speed | 75.1–75.6 tok/s |
| Context in use for the job | 4,353 tokens of 131,072 |
| VRAM peak | 15.0 GB of 16.3 GB |
| System memory (llama-server) | 21.2 GB (`--fit` keeps part of the experts in system memory) |
| Answer | correct, well-formed Python |

### One load for chat and coding (Bob 1.5.66 to 1.5.68)

Four messages in a row: "hi", a C++ coding hand-off, "hi again", and a request Bob must decline (to trigger his "trying again, thinking it through" retry).

| Build | What the check found |
|---|---|
| 1.5.66 | After every job the chat brain was woken again at 32K, then reloaded at 128K for the next job (about 9 s extra per job). |
| 1.5.67 | Reload fixed: one server, same 128K context throughout. But the always-thinking Coding copy looped: still thinking after 10 minutes and about 45K tokens on a small job. Its thinking had no presence penalty, and there was no thinking budget or token cap. |
| 1.5.68 | Fixed: presence penalty 1.5 for Qwen3.6 thinking, a 12,288-token thinking budget for the Coding copy, and a 32,768-token cap on every reply. |

The 1.5.68 rerun (same server process at 131,072 for all four, no reload):

| Message | Time | Thinking | Result |
|---|---|---|---|
| "hi" (cold, includes the load) | 35.7 s | none | answered |
| C++ coding hand-off | 57.8 s | about 3K tokens, finished on its own | answered with code |
| "hi again" | 2.6 s | none | answered |
| A request to decline, with the retry | 13.3 s | a short plan | retry shown, a correct "can't, and here's why" |

VRAM with the brain loaded: about 15.0 GB.

---

## 4. Deep thinking: Qwen 3.8 27B vs Gemma 4 26B (2026-11-02)

Bob 1.5.36's launch settings, 32K context, thinking on, temperature 0, a 6,000-token cap, Ollama off.

| Task | Qwen 3.8 27B | Gemma 4 26B |
|---|---|---|
| duration | PASS 313 s | fail 80 s (cut off) |
| roman | PASS 68 s | PASS 11 s |
| merge | PASS 40 s | PASS 13 s |
| lru | PASS 56 s | PASS 13 s |
| slug | fail 119 s | fail 11 s |
| bugfix | PASS 14 s | PASS 10 s |
| csvsum | fail 582 s (cut off) | PASS 50 s |
| plan_order | PASS 221 s | fail 80 s (cut off) |
| plan_sched | fail 569 s (cut off) | fail 80 s (cut off) |
| wordwrap | PASS 63 s | PASS 45 s |
| 3 tool chains | all pass (17–63 s) | all pass (3–7 s) |
| **Total** | **10/13**, 2,144 s (36 min) | **9/13**, 407 s (7 min) |

The only real wrong answer was slug, the same accent slip as above. Every other miss was a cut-off.

| Extras (32K, fully on the card) | Qwen 3.8 27B | Gemma 4 26B |
|---|---|---|
| Load | 23.3 s | 20.3 s |
| Writing speed | about 10 tok/s | about 62 tok/s |
| Reading a 12K-token prompt | 1,438 tok/s | 3,633 tok/s |
| Picture description | correct | correct |
| Single tool call | pass | pass |

Qwen 3.8 at 128K: a 114K-token prompt read in 196 s, writing at 5 tok/s, and it found the hidden word.

What it showed: the same tool reliability, with Gemma about 6 times faster; the score gap was the thinking cap, not skill. Qwen 3.8 suits Deep thinking, for jobs where waiting is fine: it solved two planning tasks Gemma ran out of room on, and it handles 128K.

---

## Not measured yet

- **The smaller Q3 file for 8 GB cards** (Qwen3.6 35B-A3B UD-Q3_K_XL, 16.8 GB). Only its download was checked: the size and checksum match the file pinned in Get models. It hasn't been run, so there are no speed, memory or quality numbers for it yet, and nothing has been tested on a card smaller than 16 GB.
- **256K context** on Qwen3.6: queued.
