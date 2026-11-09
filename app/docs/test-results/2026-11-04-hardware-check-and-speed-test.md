# Hardware check and "Get Bob ready while you type" speed test (2026-11-04)

**Test machine:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5-6000 as 2 × 16 GB, NVMe SSD, Windows 11).
**Bob:** 1.5.82 on a separate test install (temporary home folder, its own ports). **Engine:** llama.cpp b12032.

## Check this PC

The read-only **Check this PC** button reported:

| Result | Line |
|---|---|
| fine | Memory runs at 6000 MT/s (its rated speed). |
| fine | NVIDIA driver is recent (2026-10-18). |
| fine | Models are on a fast drive. |
| fine | Graphics card: 16 GB, nothing big running alongside Bob. |
| tip | Optional: stop the graphics card from quietly borrowing RAM (NVIDIA Control Panel > Manage 3D settings > CUDA - Sysmem Fallback Policy = Prefer No Sysmem Fallback). |

The memory speed was also confirmed from Windows directly: configured clock 6000 MT/s, so the memory runs at its rated speed.

## Test Bob's speed

Everyday brain Qwen3.6-35B-A3B UD-Q4_K_XL, thinking off, 128K context, `--fit on -fa on -ctk q8_0 -ctv q8_0 -t 8 -b 2048 -ub 2048`. The test frees the brain, wakes it, waits 5 s as if typing, then asks one question (Q1, first after load) and a second one (Q2). Bob's instructions are about 3.2K tokens.

| Case | Run | Wake (load) | Q1 first word / full | Q2 first word / full | Writing |
|---|---|---|---|---|---|
| All switches off | 1 | 16.9 s | 27.3 / 28.5 s | 0.2 / 1.0 s | 49–58 tok/s |
| All switches off | 2 | 15.4 s | 27.3 / 28.6 s | 0.2 / 1.0 s | 52–61 tok/s |
| Only "Get Bob ready while you type" | 1 | 14.8 s | 22.3 / 23.3 s | 0.2 / 1.1 s | 48–59 tok/s |
| Only "Get Bob ready while you type" | 2 | 14.8 s | 23.1 / 24.4 s | 0.2 / 1.5 s | 54–62 tok/s |

VRAM peak 14.8 GB in every run; llama-server used 21.4–21.6 GB of RAM.

## Why the first reply is slow

The first request after each load pays a one-time warm-up of about 20 s. The same 3,386-token prompt, with prompt caching off, straight after a load:

| Request | Time | Reading speed |
|---|---|---|
| 1st after load | 21.9 s | 154 tok/s |
| 2nd | 1.5 s | 2,237 tok/s |
| 3rd | 1.4 s | 2,345 tok/s |

"Get Bob ready while you type" does this warm-up while you type. With only 5 s of typing in the test it saved about 4–5 s; with 20 s or more of typing it hides the whole warm-up.

## Conclusions

- Memory and driver are set up right on this machine; nothing to fix.
- The first-reply delay is a one-time warm-up after each load, not slow reading.
- The cause was found the same day: see [Why the first reply after a load is slow](2026-11-04-first-reply-warm-up.md).

Caveats: two runs per case; one machine.
