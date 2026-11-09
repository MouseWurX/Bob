# Small brains, tool use and gaming: what we measured

Measured 2026-11-02 on one replicant matrix. Everything here is a local measurement on it; your numbers will differ.

**Test machine:** replicant matrix (AMD Ryzen 7 9800X3D 8 cores/16 threads, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5, NVMe SSD, Windows 11).
**Engine:** llama.cpp build 12032 (0.8.0-dev, commit dde879bc4), `llama-server` with `--jinja -fa on -ctk q8_0 -ctv q8_0 -t 8 -b 2048 -ub 2048 -np 1`.
Timing runs used `-c 8192`; tool-use runs used `-c 16384` (first rounds) and `-c 32768` (later rounds). "On the card" means `--fit on` with no `-ngl`; "processor brain" means `-ngl 0`.

## Takeaways

1. **For a Gaming session brain, Qwen3 4B Instruct 2507 is the best all-rounder.** It answers in 2 to 7 seconds on the processor at idle, never stops to "think" first, and got 22 of 25 tool jobs right. Qwen3 1.7B is faster and smaller but a little less accurate (20 of 25).
2. **Avoid "thinking" models for quick chat.** Ollama's `qwen3:4b` is actually *Qwen3 4B Thinking 2507*. It ignores "don't think", spends 1,000 to 1,200 tokens thinking first, and takes 30 to 135 seconds per reply.
3. **When a game maxes out the processor, a processor brain is unusable.** With all 16 threads busy it produced 0 to 0.4 tokens a second and took minutes per reply (the game kept its full speed). The same small brain on the graphics card answered in about 2 seconds and cost the game only 2 to 4%.
4. **So the right choice depends on what is busy.** Processor busy: run the small brain on the card (needs about 2 to 4 GB of free VRAM). Card busy: run it on the processor. A small brain reloads in 1 to 2 seconds, so switching is cheap.
5. **Even a "processor" brain borrows the card a little.** llama.cpp's CUDA build still reads the prompt on the card with `-ngl 0` (about 0.6 GB VRAM, 2 GB with a vision projector). Hiding the card completely makes the first reply of a chat slow (12 to 80 seconds for a ~2K to 4K-token prompt); later replies stay fast because of the prompt cache.
6. **Context size matters more than anything for big brains on 16 GB.** Gemma 4 26B at 128K context spilled 7 GB into system RAM and crawled at about 5 tokens a second. At 32K with `--fit on` and no `-ngl`, only 0.3 GB spilled and it generated 71 to 75 tokens a second. A forced `-ngl 999` stops `--fit` from trimming.
7. **Tool-call failures were mostly not the model's fault.** The real causes we found:
   - an empty `enum: []` in one tool schema made llama.cpp reject *every* request for Qwen brains;
   - some model files from Ollama carry no chat template (gpt-oss), so llama.cpp fell back to a generic one and replies came out garbled;
   - some models write the call as plain text or bare JSON (Qwen2.5 Coder) instead of a real call;
   - and a prompt that let brains ask "what style?" or "which folder?" instead of acting with sensible defaults.
   Fixing those took gpt-oss 20B (old file plus a proper template) from 2 to 18 of its 22 failed jobs, and most brains to near-perfect on their old misses.
8. **The remaining misses are judgement calls,** mostly "which project?" for a code search when several projects exist, and "what mood?" for music.
9. **Gemma 4 E4B behaves the same on llama.cpp and Ollama** when given the same prompt. An earlier 24 vs 14 gap came from different prompt wording, not the engine.

## 1. Time to first word and full answer (idle machine)

Seconds: until the first token (thinking or answer) / until the answer is complete. *Cold* includes starting the brain; *warm* is the next message in the same chat. Each request carried a ~2.3K-token system prompt with 9 tools; the long chat was ~4K tokens.

**Processor brain (`-ngl 0`, the card helps read the prompt):**

| Brain | "hi" cold | "hi" warm | one-line question cold | warm | long chat cold | warm | tokens/s | RAM |
|---|---|---|---|---|---|---|---|---|
| Qwen3 1.7B | 1.7 / 2.1 | 0.1 / 0.5 | 1.7 / 2.0 | 0.1 / 2.5 | 1.9 / 10.1 | 0.1 / 1.6 | 24–29 | 2.1 GB |
| Qwen3 4B Instruct 2507 | 1.7 / 2.8 | 0.1 / 1.8 | 1.6 / 5.1 | 0.1 / 7.1 | 2.1 / 5.6 | 0.2 / 2.8 | 14–16 | 3.5 GB |
| Gemma 4 E4B | 6.7 / 7.6 | 0.3 / 1.0 | 6.6 / 7.5 | 0.4 / 6.9 | 7.1 / 28.6 | 0.4 / 19.3 | 13 | 3.9 GB |
| Qwen3 4B Thinking 2507 | 2.8 / 28.6 | 0.1 / 38.7 | 2.7 / 41.3 | 0.1 / 38.7 | 3.3 / 46.9 | 0.2 / 44 | 14–16 | 3.5 GB |

**Processor only (card hidden):** cold first replies are much slower (prompt reading at 55 to 220 tokens/s), warm replies stay quick.

| Brain | "hi" cold | warm | one-line cold | warm | long chat cold | warm | RAM |
|---|---|---|---|---|---|---|---|
| Qwen3 1.7B | 12.0 / 12.3 | 0.2 / 0.5 | 12.1 / 12.4 | 0.4 / 3.4 | 34.9 / 36.4 | 1.0 / 1.9 | 2.7 GB |
| Qwen3 4B Instruct 2507 | 25.9 / 27.1 | 0.3 / 1.7 | 26.0 / 28.8 | 0.6 / 9.1 | 80.8 / 86.3 | 1.0 / 4.6 | 5.1 GB |
| Gemma 4 E4B | 17.5 / 18.3 | 0.2 / 2.3 | 17.7 / 18.5 | 0.3 / 5.0 | 31.5 / 46.6 | 0.4 / 15.7 | 6.3 GB |

## 2. With the processor fully busy (a stand-in for a demanding game)

16 worker threads kept all 16 logical cores busy; "game kept" is how much of its own speed the load kept while the brain worked.

| Brain and placement | "hi" cold | "hi" warm | one-line cold | one-line warm | tokens/s | game kept | VRAM used |
|---|---|---|---|---|---|---|---|
| Qwen3 4B Instruct, processor (`-ngl 0`) | 8.2 / 55.9 | 3.6 / 82 | 7.2 / 132 | 2.7 / 257 | 0–0.4 | ~100% | 0.6 GB |
| Qwen3 4B Instruct, all on card | 1.8 / 1.9 | 0.0 / 0.2 | 1.7 / 2.1 | 0.0 / 0.7 | 171–178 | 96% | 3.6 GB |
| Qwen3 1.7B, all on card | 2.5 / 2.6 | 0.0 / 0.1 | 2.3 / 2.4 | 0.0 / 0.3 | 253–314 | 98% | 2.2 GB |

## 3. Big brains on a 16 GB card

| Brain | Context | Ready in | VRAM | Spilled to RAM | Tokens/s |
|---|---|---|---|---|---|
| Gemma 4 26B | 131072, `-ngl 999` | ~25 s | 14.5 GB | 7.0 GB | ~5 |
| Gemma 4 26B | 32768, `--fit on`, no `-ngl` | 23 s | 13.8 GB | 0.3 GB | 71–75 |

Loading Gemma 4 E4B took about 6 s and unloading 0.3 s; Gemma 4 26B took 22 to 29 s and 1.7 s. A 1024×1024 Z-Image Turbo picture (8 steps) took 28 to 31 s with a 13.5 GB peak.

## 4. Tool use: 25 everyday requests

Each request was sent the way Bob sends it (system prompt, tools, Bob's "add more tools" retry). Scores are right out of 25 on Bob's normal path, after the empty-enum fix, with Bob's earlier prompt wording. The re-test below adds the newer "act with sensible defaults" wording.

| Brain | Right / 25 | Avg time | Placement | Notes |
|---|---|---|---|---|
| Qwen3 4B Thinking 2507 | 23 | 54 s | processor | accurate but far too slow (forced thinking) |
| Qwen3 4B Instruct 2507 | 22 | 3.4 s | processor | best fast choice |
| Qwen 3.8 27B | 22 | 5.1 s | card | most consistent big brain |
| Gemma 4 26B | 20 | 1.2 s | card | |
| Qwen3 Coder 30B | 20 | 7.4 s | card | |
| Qwen3 1.7B | 20 | 1.9 s | processor | one call written as text |
| Gemma 4 E4B | 14 | 3.6 s | processor | asked questions instead of acting; much better with the new wording |
| Qwen2.5 Coder 7B | 2 | 0.6 s | card | writes calls as plain JSON; needs a text-call rescue |
| gpt-oss 20B (Ollama file) | 2 | 7 s | card | file has no chat template; with a proper template it fixed 18 of 22 misses |

**Re-test of only the failed jobs, on Bob's own code (3 tries each; "fixed" means right every time):**

| Brain | Pass 1 | Pass 2 | Still missing |
|---|---|---|---|
| Gemma 4 E4B | 4 of 10 | 3 of 7 | music (asks the mood), code search (asks which project) |
| Qwen3 4B Instruct 2507 | 2 of 3 | 0 of 1 | weather with web search off: says it can't, but not where the switch is |
| Qwen3 1.7B | 4 of 5 | 0 of 1 | same weather case (once invented the weather) |
| Qwen3 4B Thinking 2507 | 1 of 2 | 2 of 2 | none |
| Qwen3 Coder 30B | 4 of 5 | 2 of 3 | undo (wanders through folders first) |
| Gemma 4 26B | 4 of 4 | 1 of 1 | none |
| Qwen 3.8 27B | 2 of 2 | 1 of 1 | none |
| gpt-oss 20B + template | 18 of 22 | 3 of 6 | crash fix, music, code search (asks first) |

## 5. Chat templates found in the model files

| Model file | Has a chat template | Supports tools | Thinking switch |
|---|---|---|---|
| Gemma 4 26B / E4B (Ollama) | yes | yes | yes |
| Qwen3 1.7B (Ollama) | yes | yes | yes |
| Qwen3 4B (Ollama, actually Thinking 2507) | yes | yes | no |
| Qwen3 Coder 30B (Ollama) | yes | yes | no |
| Qwen 3.8 27B (Ollama) | yes | yes | yes |
| Qwen2.5 Coder 7B (Ollama) | yes | yes | no |
| gpt-oss 20B (Ollama) | **missing** | – | – |
| gpt-oss 20B (official GGUF) | yes | yes | no |
| Qwen3 4B Instruct 2507 (official GGUF) | yes | yes | no |

## Method notes

- Temperature 0 for timing and the first tool rounds; Bob's own sampling settings for the re-tests.
- The "busy processor" load was synthetic (math loops on every thread), not a real game; real games mix CPU and GPU load.
- Some runs overlapped other work (a large file checksum), which made one processor-under-load result slower; the conclusion did not change.
- Video and music makers were not installed, so jobs needing them were counted as right when the brain said it couldn't.

## Addendum: lighter and replacement brains with Bob's text-call rescue

Same 25 requests on llama.cpp (on the card, `-c 32768`), with Bob 1.5.30's "act with sensible defaults" wording and Bob's text-call rescue (a tool call the brain writes as plain text or JSON is turned into a real call, only for tools that were offered). "Rescued" counts right answers that came from such a written-out call.

| Brain | Right / 25 (Bob's normal path) | All tools at once | Core tools only | Rescued | Avg time |
|---|---|---|---|---|---|
| gpt-oss 20B, official GGUF (reasoning low) | **25** | 23 | 11 | 0 (makes real calls) | 0.3 s |
| Qwen2.5 Coder 7B | 16 (was 2) | 19 (was 2) | 5 | 14 of the 16 | 0.6 s |
| gpt-oss 20B, Ollama file (no template) | 2 | 2 | 2 | 0 | 11 s |
| gpt-oss 20B, Ollama file + Bob's bundled template (1.5.33+) | **25** | 23 | 11 | 0 (makes real calls) | 0.4 s |

- The official gpt-oss 20B file is the best tool user we measured: every everyday request right, in about a third of a second.
- Qwen2.5 Coder 7B goes from unusable to usable with the rescue. Almost all its correct answers were calls it wrote as text.
- The rescue cannot fix a model file that has no chat template. Giving the Ollama gpt-oss file Bob's bundled template (Bob 1.5.33 and later do this automatically) makes it exactly as good as the official file: 25 of 25.
