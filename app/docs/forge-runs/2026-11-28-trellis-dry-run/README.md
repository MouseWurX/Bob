# Trellis + YAQA maker, dry run (28 Nov 2026, cloud container, processor only, no card)

The owner, 28 Nov: "Small brains first, get it to work right, over multiple cards, even if it's smaller cards to get it to
split. Make sure it works before we send it for the full run." and "get yaqa and trellis ready for comparision".

Tools: `model-lab/forge/pod/trellis/` (our own maker for Nari's trellis format, Lamplight patch 0136).

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
