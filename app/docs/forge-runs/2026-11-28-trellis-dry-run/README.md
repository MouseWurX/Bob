# Trellis + YAQA maker, dry run (28 Nov 2026, cloud container, processor only, no card)

The owner, 28 Nov: "Small brains first, get it to work right, over multiple cards, even if it's smaller cards to get it to
split. Make sure it works before we send it for the full run." and "get yaqa and trellis ready for comparision".

Tools: `model-lab/forge/pod/trellis/` (our own maker for Nari's trellis format, Lamplight patch 0136).

Credits: the methods are other people's research, written again as our own code. LDLQ and incoherence processing come from
QuIP (Chee, Cai, Kuleshov, De Sa 2023, https://arxiv.org/abs/2307.13304). Hadamard incoherence comes from QuIP# (Tseng,
Chee, Sun, Kuleshov, De Sa 2024, https://arxiv.org/abs/2402.04396). The trellis code and Viterbi search come from QTIP
(Tseng, Sun, Hou, De Sa 2024, https://arxiv.org/abs/2406.11235). Two-sided rounding comes from YAQA (Tseng, Sun, De Sa
2026, https://arxiv.org/abs/2505.22988). Error-feedback rounding comes from GPTQ (Frantar et al. 2022,
https://arxiv.org/abs/2210.17323).

What was checked here:
- **Codec = the engine.** Our packed words decode bit for bit as Lamplight's `ggml_trellis_decode_rows` reads them, at 2, 3
  and 4 bits (its loop compiled as `trl_check.c` and run on random tail-biting streams).
- **Viterbi quality.** Relative error on Gaussian tiles at 2 bits: 0.073, the level QTIP reports for its 2-bit codes.
- **Feedback.** On a test matrix with correlated inputs: LDLQ 41% less layer error than no feedback; YAQA 31% less error
  than LDLQ on the full Kronecker loss (H_out x H_in), the "about a third" YAQA's paper reports over LDLQ.
- **A real file in Lamplight.** A small Qwen3 (2 layers, 256 wide, BF16, trained a few minutes on wikitext so its weights
  have structure; `trellis/tiny_hf.py`), both Hessians from `hess_hf.py`, 10 of its 14 linears coded at 2 bits with LDLQ,
  written by `trl_write.py`, loaded and run by Lamplight (all 113 patches, processor build):
  - KLD against the BF16 file: 0.0856, same top token 89.0% (16 x 256 tokens of wikitext-2 test).
  - Against a float file holding our maker's own decoded weights: KLD 0.000000 (max 0.000035), same top 100%. So the
    engine computes exactly the weights we meant: signs, Hadamard sides, scales and tile order all agree.
- **The split.** `trl_run.py --devices 2` dealt the linears to two workers (processor stand-ins here).
- **CUDA kernel.** `trl_cuda.py` compiles through NVRTC for sm_80, sm_89 and sm_120. It has not run on a card yet: the
  kit's first step (`trl_selftest.py`) compares it with the torch Viterbi and times both, and stops the run on a mismatch.

Not shown here (needs a card): speed, the multi-card Hessian pass (`device_map`), the KLD numbers of a real brain. The tiny
brain is overfit to its short training text (its own test PPL is about 5,600), so its KLD values only show that the
pipeline works, not how good trellis is.

Speed on the processor: 7-25 s per small linear with one worker, minutes with four competing for four cores. The torch
Viterbi walks 256 steps of [tiles, 65,536] arrays, which is why the card version is a kernel.

## Inkling 2 Mini path, tiny Inkling dry run (28 Nov 2026, processor only, no card)

For the Inkling 2 Mini NariQ kit (`pod/trellis/inkling-trl.sh`: plain trellis vs bits by part vs by part + YAQA at one
size). A tiny random Inkling 2 loop brain (6 layers, layers 2-3 looped 3 times, 8 experts) made with transformers 5.24.1,
converted with llama.cpp master's converter (8e23278c, the one the kit pins):
- Lamplight (de773f03 patches) reads it and agrees with transformers: PPL 276.854 vs 276.850 on the same 4 chunks.
- hess_hf.py --match-gguf matched all 80 weights to their GGUF names by value; the experts' recorder leaves the logits
  unchanged (max difference 0.0) and counts the looped layers' rows three times.
- trl_run.py coded blk.2's attn_q and fused ffn_gate_up_exps / ffn_down_exps at 1, 2, 3 and 4 bits (LDLQ) and at the
  picked widths with YAQA; trl_parts.py kept all three at 2 bits within the 2-bit bytes (3 tensors leave no room to
  trade); trl_write.py wrote both files.
- Lamplight reads the YAQA file exactly as made: KLD 0.000000 (max 0.000001), same top 100% against a float copy of the
  maker's own weights. Against the F32 brain: YAQA 0.000995 (same top 84.5%), LDLQ 0.001050 (80.0%). A random brain, so
  these prove the mechanics only.
- The drift estimate (1/2 n tr(H_out dW H_in dW^T) per word) said 3.3e-5 for the LDLQ file, about 30 times under the
  measured 0.00105; its scale is unproven, the canary compares it with the measured KLD on the real brain. The pick
  only uses it to rank parts.
