# Live checks: Qwen3.6-35B-A3B as the chat and Coding brain at 128K (2026-11-03)

**Test machine:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5, NVMe SSD, Windows 11).
**Engine:** llama.cpp b12032, started by Bob itself on a separate test install (temporary home folder, its own ports), with its normal launch line:
`-c 131072 --jinja --mmproj mmproj-F16.gguf -fa on -ctk q8_0 -ctv q8_0 --fit on -np 1`
Model: Qwen3.6-35B-A3B UD-Q4_K_XL (22.4 GB) + mmproj-F16 (0.9 GB).

## 1. Speed check at 128K (app build 1.5.63)

One Low-effort coding reply in the Coding session, thinking off, then a direct streamed request to the same server.

| Measure | Result |
|---|---|
| Whole first job from cold, including the model load | 21.8 s |
| First token (loaded, short prompt) | 0.37 s |
| Writing speed | 75.1–75.6 tok/s |
| Context in use for the job | 4,353 tokens of 131,072 |
| VRAM peak | 15.0 GB of 16.3 GB |
| llama-server RAM | 21.2 GB (`--fit` keeps part of the experts in RAM) |
| Answer | correct, well-formed Python |

For comparison, the 114K-token needle in the coding race wrote at 50.9 tok/s after the long prompt.

## 2. One-load check and the thinking fixes (app builds 1.5.66 → 1.5.68)

Lineup under test: Qwen3.6 as both the chat brain (no thinking) and the Coding copy (thinking always on), all at 128K, so chat and coding should share one loaded model. Four messages in a row: "hi", a C++ coding hand-off, "hi again", and a request the assistant must decline (to trigger its "try again, thinking it through" retry).

| Build | Finding |
|---|---|
| 1.5.66 | Reload bug: after every job the chat brain was woken again at the default 32K, then reloaded at 128K for the next job (~9 s extra per job). |
| 1.5.67 | Reload fixed (one server, same process and 128K context throughout), but the always-thinking Coding copy looped: still thinking after 10 minutes and ~177K characters (~45K tokens) on a small helper. Thinking sampling had no presence penalty and there was no thinking budget or token cap. |
| 1.5.68 | Fixed: presence penalty 1.5 for Qwen3.6 thinking, a 12,288-token thinking budget for the Coding copy, max_tokens 32,768 on every request. |

1.5.68 live rerun (same server process at ctx 131072 for all four, no reload):

| Message | Time | Thinking | Result |
|---|---|---|---|
| "hi" (cold, includes model load) | 35.7 s | none | answered |
| C++ coding hand-off | 57.8 s | 12,628 characters (~3K tokens), finished on its own | answered with code |
| "hi again" | 2.6 s | none | answered |
| Request to decline, with retry | 13.3 s | 677 characters | retry shown, correct "can't, here's why" answer |

VRAM with the model loaded: ~15.0 GB. The thinking text of the coding job was a normal plan, not a loop.

## Conclusions

- Qwen3.6-35B-A3B at 128K with `--fit on` runs at ~75 tok/s for short replies on a 16 GB card, with ~21 GB of system RAM in use.
- One 128K load can serve both everyday chat and coding without reloads (from 1.5.67).
- An always-thinking copy needs a presence penalty, a thinking budget and a token cap (from 1.5.68); with them, a small coding job finishes in about a minute.
