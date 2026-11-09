# Engine check: every Bob engine and brain (2026-11-04)

**Test machine:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5-6000, NVMe SSD, Windows 11).
**Bob:** 1.5.90 code, normal session. **Engines:** llama.cpp b12032 (CUDA 13.4), sd.cpp master-1031-c6dfa9d, whisper.cpp, Piper, Kokoro.

**Result: 26 OK, 0 failed, 5 skipped.**

## Engines start

llama.cpp, sd.cpp (painter and sd-server), whisper.cpp and Piper all start.

## Brains (llama.cpp; load time, answer)

| Brain | Used for | Load | Answer | Pictures |
|---|---|---|---|---|
| Qwen3.6-35B-A3B | everyday, Coding | 25.6 s | OK | OK |
| Gemma 4 26B | Office, Deep | 18.4 s | OK | OK |
| Qwen 3.8 27B | | 23.4 s | answered with a tool call | OK |
| Qwen3 Coder 30B | | 13.8 s | OK | |
| GPT-OSS 20B | Reviewer | 10.7 s | OK | |
| Gemma 4 E4B | quick, eyes | 8.7 s | OK | OK |
| Qwen3 4B Instruct | Gaming | 2.6 s card / 2.1 s processor | OK | |
| Qwen2.5 Coder 7B | | 4.1 s | OK | |
| Qwen2.5-VL 7B | | 4.1 s | OK | |
| Qwen3 4B | | 5.1 s | OK | |
| Qwen3 1.7B | | 2.1 s | OK | |
| Qwen2.5 Coder 1.5B base | autocomplete | 1.6 s | completion text (expected for a base model) | |

The Qwen3.6 load (at 8K context here) includes `--load-mode none` from 1.5.90.

## Pictures, hearing and voice

| Job | Model | Time |
|---|---|---|
| Make a picture | Z-Image Turbo | 36.6 s |
| Edit a picture | Qwen-Image-Edit-2509 Q4_K_M | 24.2 s |
| Hearing | whisper base.en / large-v3-turbo q5_0 | 0.7 s / 6.1 s |
| Voice | Piper (3 voices) / Kokoro | 0.4–0.5 s / 2.6 s |

## Skipped

A duplicate model entry (same file), the bundled llama.cpp (not in this install), the embedder (no own copy), Ollama (not running) and Chatterbox (not set up).
