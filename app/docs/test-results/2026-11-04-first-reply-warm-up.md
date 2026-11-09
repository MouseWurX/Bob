# Why the first reply after a load is slow (2026-11-04)

**Test machine:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5-6000, NVMe SSD, Windows 11). NVIDIA driver 621.01.
**Engine:** llama.cpp b12032, Windows CUDA 13.4 build. **Brain:** Qwen3.6-35B-A3B UD-Q4_K_XL with mmproj-F16.
**Launch line:** `-c 131072 --jinja --mmproj mmproj-F16.gguf -fa on -ctk q8_0 -ctv q8_0 -t 8 -b 2048 -ub 2048 --fit on -np 1`
**Prompt:** 3,386 tokens, prompt caching off, thinking off. One server at a time, nothing else on the card.

## Question

After every load, the first request took about 27 s, and the same request a second time took about 1.5 s. Two possible causes were tested: the CUDA driver compiling kernels for this card on first use (JIT), or the model file being read from disk on first use (mmap).

## Results

| Run | Load | 1st request | 2nd request | RAM in use |
|---|---|---|---|---|
| Default, start 1 | 14.7 s | 27.09 s (125 tok/s) | 1.52 s (2,221 tok/s) | ~21 GB |
| Default, start 2 | 14.9 s | 26.80 s (126 tok/s) | | |
| CUDA JIT cache raised to 4 GB, start 1 | 14.1 s | 26.83 s | | |
| CUDA JIT cache raised to 4 GB, start 2 | 13.7 s | 20.96 s | | |
| `--load-mode none`, start 1 | 25.8 s | **1.44 s** (2,355 tok/s) | 1.18 s | **11.9 GB** |
| `--load-mode none`, start 2 | 23.5 s | **1.43 s** | | 11.9 GB |

VRAM was 14.7 GB in every case.

## Findings

- **Not JIT.** The driver's compute cache did not grow during any run, and a bigger cache barely helped.
- **It is mmap.** `--fit` keeps some expert tensors in system RAM. With the file memory-mapped, those pages are only read from disk when first used, which is during the first request. llama-server itself warns about this: tensor overrides to CPU with mmap enabled.
- **`--load-mode none` fixes it.** Loading takes about 10 s longer, but the first answer is ready about 15 s sooner overall (about 25 s from start instead of about 41 s), and RAM in use drops by about 9 GB. Later replies are unchanged.

Caveats: two starts per case; one machine.
