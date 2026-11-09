# Coding race: Qwen3.6-35B-A3B vs Qwen3 Coder 30B (2026-11-03)

**Test machine:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5, NVMe SSD, Windows 11).
**Engine:** llama.cpp b12032 (CUDA 13.4 build), one server at a time, nothing else on the card.

## Brains and settings

| | Qwen3.6-35B-A3B | Qwen3 Coder 30B |
|---|---|---|
| File | unsloth UD-Q4_K_XL GGUF, 22.4 GB (+ mmproj-F16 0.9 GB) | Q4_K_M GGUF, 18.6 GB |
| Kind | MoE, ~3B active, hybrid thinking, vision | MoE, ~3B active, no thinking, no vision |
| Fit at 32K (`--n-cpu-moe`, VRAM) | 18 expert layers on CPU, 15.2 GB, loads ~6 s | 14 on CPU, 15.2 GB, loads ~16 s |
| Fit at 128K | 20 on CPU, 14.7 GB | 30 on CPU, 15.2 GB |
| Sampling | thinking: t 0.6, top_p 0.95, top_k 20, min_p 0 · no-thinking: t 0.7, top_p 0.8, top_k 20, presence 1.5 | t 0.7, top_p 0.8, top_k 20, repeat 1.05 |
| Token cap | 16,000 (thinking) / 8,000 | 8,000 |

Common flags: `-c 32768` (131072 for the needle), `-fa on`, `-ctk q8_0 -ctv q8_0`, `-t 8`, `-b/-ub 2048`, `-np 1`, `--jinja`. The fit is the fewest expert layers on the CPU that load, answer and leave ≥ 900 MiB of VRAM free.

## Tasks

13 tasks, one try each (pass@1): 10 Python coding tasks scored by hidden unit tests, 3 multi-step tool chains with pretend tools (search, read a file, read a to-do board, add a to-do).

| Task | Qwen3.6 thinking | Qwen3.6 no-thinking | Qwen3 Coder |
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

`slugify` failed for all three the same way (accented letters not folded). No answer hit its token cap; thinking used at most 6,395 tokens.

## Speed and long context

| | Qwen3.6 thinking | Qwen3.6 no-thinking | Qwen3 Coder |
|---|---|---|---|
| Writing, short prompt | 81.3 tok/s | 70.5 tok/s | 70.2 tok/s |
| Reading a ~12K-token prompt | 2,905 tok/s | 3,355 tok/s | 4,293 tok/s |
| Writing after 12K | 81.9 tok/s | 72.0 tok/s | 66.4 tok/s |
| Single tool call | correct | correct | correct |
| Picture description | n/a | correct | no vision |
| 128K needle, 114K-token prompt | PASS: read 2,673 tok/s (43 s), write 50.9 tok/s, VRAM 14.8 GB, RAM 20.8 GB | | PASS: read 1,401 tok/s (81 s), write 21.2 tok/s, VRAM 15.3 GB, RAM 16.0 GB |

## Conclusions

- Coding quality is a tie with thinking off (11/13 each). Thinking on solved one more task at ~14× the time.
- At short context Qwen3 Coder answers faster and reads prompts ~30% faster.
- At 128K, Qwen3.6 keeps more of itself on the card (20 vs 30 expert layers on the CPU), so it reads long prompts ~1.9× faster and writes ~2.4× faster, and it can see pictures.
- Result: Qwen3.6-35B-A3B became the Coding brain at 128K; Qwen3 Coder stays available.

Caveats: one try per task on 13 tasks; a few early timings overlapped another CPU job; reloads after giving the card back to another app aren't counted in task times.
