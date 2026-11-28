# Scale healing and mixed-bit squeezes on a tiny brain (25 Nov 2026)

Cloud check of `model-lab/forge/pod/heal_scales.py` and `mixed_bits.py`. They're based on two ideas from llamAmpere (JakeATX, Nov 2026), done with stock GGUF types.
**Tiny test brain only. Unproven in our lab on a real brain, as we have yet to test one.**

## Setup

- **Brain:** Qwen3 layout, 4 layers, 256 wide, GPT-2 tokenizer, about 29M weights. It was trained on the CPU for 12 minutes (587 steps, loss 3.69) on Bob's own docs, so it has real odds to match.
- **Engine:** stock llama.cpp b12359, CPU build: `llama-imatrix --process-output`, `llama-quantize --pure --token-embedding-type q4_k`, `llama-perplexity --kl-divergence`.
- **Calibration text:** the first 85% of the docs text. **Eval text:** the last 15%, never used for tuning. Both are the same kind of text, so this does not show how well healing carries to other kinds.
- **Heal settings:** 300 steps, 4 x 256 tokens, lr 1e-3, top-64 KL. About 4.5 minutes on 4 CPU cores.
- **Drift:** every number below is stock `llama-perplexity` measured on the written file against the f32 file, over 150 chunks of 256 tokens.

## Results

| File | Size | KLD | Same top token |
|---|---:|---:|---:|
| IQ2_XXS | 13.1 MB | 0.0620 | 79.1% |
| IQ2_XXS, scale-healed | 13.1 MB | **0.0319** | **87.8%** |
| Q2_K | 14.3 MB | 0.0386 | 85.3% |
| Q2_K, scale-healed | 14.3 MB | **0.0176** | **91.7%** |
| Mixed bits, 2.6 bpw target (mixed_bits.py) | 14.2 MB | 0.0293 | 85.4% |
| Mixed bits, scale-healed | 14.2 MB | 0.0180 | 91.6% |

## Checks

- **Healed IQ2_XXS file:** 0 code bytes changed. 62,463 blocks got a new scale, and 17 norms changed. No other byte changed.
- **Read-back check:** every healed tensor equals what the tuner used, to 2e-7.
- **What lined up:** all 29 matrices and all 17 norms lined up with the HF teacher. The token table stayed frozen, which is the default.

## What this does and doesn't show

- **Healing worked here:** it cut drift about in half on this tiny brain. The developer reports about 12% on a 27B. A tiny brain with few weights per block may gain more than a big one.
- **Mixed bits helped alone:** they beat Q2_K at the same size (KLD 0.029 vs 0.039).
- **Together, no extra gain here:** after healing, the mix and Q2_K landed in the same place.
- **Not yet tested:** Qwen3.5 (gated-delta layers) and fused MoE experts. Tensors whose layout the converter changes are counted as "not lined up" and left alone.
- **Next:** a real small brain (Qwen3.5-2B at IQ2) on the laptop or a rental. Then a check that Bill also fails at Q4, before healing Bill.

## Qwen3.5 layout (26 Nov 2026)

Qwen3.5's converter merges and reorders the gated-delta tensors on the way to GGUF: `in_proj_qkv` with `in_proj_z` (and the V heads reordered), `in_proj_b` with `in_proj_a`, and `out_proj`'s columns. Matching by name missed all of them, so the student kept them at full precision. That made its numbers look better than the real file.

**Fix:**
- `gguf_layout.py` runs llama.cpp's own converter (`--llama-cpp <checkout>`) on stand-in tensors whose values are their own addresses, then reads back where every value landed.
- Any tensor the converter changes by arithmetic is left out. The norms already line up by value.
- Now every squeezed tensor lines up: 26 healable, 0 left out (before the fix, 17 lined up).

**Stand-in brain:** Qwen3.5 text layout, 3 gated-delta layers and 1 full-attention layer, 256 wide, heads of 128. It was trained 8 minutes on Bob's docs. Each run takes 200 steps of 4 x 256 tokens, on the processor.

| File | KLD | Same top token |
|---|---:|---:|
| IQ2_XXS | 0.0797 | 79.5% |
| IQ2_XXS, healed by name only (old) | 0.0570 | 83.9% |
| IQ2_XXS, healed with the converter's layout | **0.0533** | **84.8%** |
| Q2_K | 0.0493 | 85.5% |
| Q2_K, healed with the converter's layout | **0.0299** | **89.0%** |

Every number above is stock `llama-perplexity --kl-divergence` on the written file, against the f32 file, over 150 chunks of 256. **On a real Qwen3.5 brain: unproven in our lab, as we have yet to test.**
