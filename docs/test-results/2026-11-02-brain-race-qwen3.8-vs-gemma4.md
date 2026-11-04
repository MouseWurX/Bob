# Brain race: Qwen 3.8 27B vs Gemma 4 26B (2026-11-02)

Run on Bob's own engine (llama.cpp b12032, Bob 1.5.36 buildArgs, 32K context, thinking on, temperature 0, max 6000 tokens), Ollama off. Test machine: replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5, Windows 11).

## Scores (10 coding tasks + 3 Bob tool chains)
| Model | Passed | Total time |
|---|---|---|
| Qwen 3.8 27B | 10 / 13 | 2,144 s (36 min) |
| Gemma 4 26B | 9 / 13 | 407 s (7 min) |

| Task | Qwen 3.8 | Gemma 4 |
|---|---|---|
| duration | pass 313 s | fail 80 s (cut off) |
| roman | pass 68 s | pass 11 s |
| merge | pass 40 s | pass 13 s |
| lru | pass 56 s | pass 13 s |
| slug | fail 119 s | fail 11 s |
| bugfix | pass 14 s | pass 10 s |
| csvsum | fail 582 s (cut off) | pass 50 s |
| plan_order | pass 221 s | fail 80 s (cut off) |
| plan_sched | fail 569 s (cut off) | fail 80 s (cut off) |
| wordwrap | pass 63 s | pass 45 s |
| 3 tool chains | all pass (17-63 s) | all pass (3-7 s) |

"Cut off" = the brain was still thinking when it hit the 6000-token cap and never wrote code. The only real wrong answer is slug (both missed folding accents: "Café Déjà vu" -> "cafe-deja-vu").

## Extras (32K, fully on the card)
| | Qwen 3.8 27B | Gemma 4 26B |
|---|---|---|
| Load | 23.3 s | 20.3 s |
| Writing speed | ~10 tokens/s | ~62 tokens/s |
| Reading a 12K-token prompt | 1,438 tokens/s | 3,633 tokens/s |
| Picture description | correct | correct |
| Single tool call (add_todo) | pass | pass |

Qwen 128K long-memory test: 114K-token prompt read in 196 s, writes at 5 tokens/s, found the hidden word (PASS).

## Recommendation
- Everyday brain: Gemma 4 26B. Same tool reliability, about 6x faster; the gap in score is the thinking budget, not skill.
- Deep thinking / Review slot: Qwen 3.8 27B, for jobs where waiting is fine (it solved two planning tasks Gemma ran out of room on, and handles 128K).
- Optional: rerun the 5 cut-off tasks with a 16K token budget to measure skill without the cap.
