# Everyday and Office race: Qwen3.6-35B-A3B (thinking off / on) vs Gemma 4 26B (2026-11-03)

**Test machine:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5, NVMe SSD, Windows 11).
**Engine:** llama.cpp b12032, one server at a time. Bob's real system prompt, tool list and engine code were used for the routing and chat tests.

## Settings

| | Qwen3.6 thinking off | Qwen3.6 thinking on | Gemma 4 26B |
|---|---|---|---|
| Sampling | t 0.7, top_p 0.8, top_k 20, presence 1.5 | t 1.0, top_p 0.95, top_k 20, presence 1.5 (table job: t 0.6, presence 0) | t 1.0, top_p 0.95, top_k 64 |
| With tools offered | temperature capped at 0.6 | capped at 0.6 | capped at 0.6 |

Common flags: `-fa on`, `-ctk q8_0 -ctv q8_0`, `-t 8`, `-b/-ub 2048`, `-np 1`, `--jinja`, the model's own chat template, vision projector (mmproj) loaded at 32K. `--n-cpu-moe` fitted per brain and context.

## Everyday chat at 32K

| | Qwen3.6 off | Qwen3.6 on | Gemma 26B |
|---|---|---|---|
| Fit (`--n-cpu-moe`), VRAM | 20, 14.6 GB | same server | 10, 15.1 GB |
| Load (warm disk cache) | 5.4 s | | 15.5 s |
| Request routing: 16 real jobs × 3 tries, right every try | 15/16 (1.3 min) | 12/16 (19 min) | **16/16** (0.6 min) |
| Chat, first word | 0.12–0.16 s | **17–32 s** (thinks first) | 0.13–0.16 s |
| Chat, writing speed | 73–79 tok/s | 75 tok/s | 74–77 tok/s |
| Picture description | correct, 2.3 s | correct, 20.9 s | correct, 1.4 s |

Routing covers 25 request types (reminders, to-dos, files, web search, pictures, music, memory, hand-offs to specialist copies…); 9 were skipped as correct "can't" answers on this setup. Most of Qwen3.6's misses were switching to another session first instead of handing the job over, which the test counts as a miss.

Tone, judged on six everyday chats with the assistant's persona prompt: Qwen3.6 (thinking off) was the most in character, playful and warm, sometimes a little long; Qwen3.6 (thinking on) was careful but flatter; Gemma was tidy and shorter, with weaker jokes.

## Office at 64K

A made-up ~50K-token handbook with five facts hidden in it.

| | Qwen3.6 off | Qwen3.6 on | Gemma 26B |
|---|---|---|---|
| Fit, VRAM, RAM | 18, 14.5 GB, 22.5 GB | same, 23.2 GB | 8, 15.2 GB, 18.3 GB |
| Load | 10.7 s | | 15.2 s |
| Summarise (8 sections named) | 8/8, 26.3 s (reads 2,476 tok/s) | 8/8, 60.2 s | 8/8, **18.2 s** (reads 3,593 tok/s) |
| 5 questions on hidden facts | 5/5, 6.1 s | 5/5, 72.0 s | 5/5, **2.2 s** |
| Draft an email (5 checks) | 5/5, 2.5 s | 5/5, 19.4 s | 5/5, 2.4 s |
| Sales table: totals, order, grand total (6 checks) | 5/6, 4.2 s | **6/6**, 20.9 s | 5/6, 1.2 s |

Both table misses were the same sort-order slip (3,900 placed above 3,915).

## Swapping to the Coding brain at 128K

| From | To | Time (load + first token) |
|---|---|---|
| Qwen3.6 @32K | Qwen3.6 @128K (same file, longer memory) | 5.6 s |
| Qwen3.6 @32K | Qwen3 Coder @128K | 14.1 s |
| Gemma 26B @32K | Qwen3 Coder @128K | 16.0 s |

## Conclusions

- Everyday chat: Qwen3.6 with thinking off and Gemma 26B are equally fast. Qwen3.6 sounds more in character and loads ~3× faster; Gemma is the steadier tool-picker.
- Thinking on is unsuitable for everyday chat (17–32 s before every reply).
- Office: all three get the content right; Gemma reads long documents ~45% faster, answers follow-ups ~3× faster and uses ~4 GB less RAM.
- Chosen lineup: Qwen3.6 (thinking off) for everyday chat, Gemma 4 26B for Office and Deep, Qwen3.6 (thinking on) for Coding, with every Qwen3.6 copy at 128K so chat and coding share one load.

Caveats: small samples (3 tries per routing job, 6 chats, 4 office jobs); load times from a warm disk cache.
