# FNRI scans on the Bill publish rental (the owner, 10 November 2026: scan Bobert, Riker, Bill and stock Qwen on a rental)

Four folders, one per brain, made by app/model-lab/forge/aifeui-bundle.mjs (72 questions each: 12 skills x 6, 48 words of answer, temperature 0, same questions for every brain).
Upload this whole folder to the pod as /workspace/fnri-in (or anywhere; paths below assume that).

Before the scans: make stock Qwen's Q4_K_M from the teacher, the same way ours are made, at
/workspace/stock/Qwen3.6-35B-A3B-Q4_K_M.gguf (convert_hf_to_gguf.py /workspace/teacher -> F16/BF16, then llama-quantize Q4_K_M). Bill must be at /workspace/bobs/20Bob/gguf/20Bob-Q4_K_M.gguf. Riker comes from his public HF page.

Then, one after the other (the first builds Brain Engine = llama.cpp b12032 + engine-patches 0001-0004 in /workspace/aifeui-engine, ~10-15 min, the rest reuse it):

    for b in qwen riker bobert bill; do
      AIFEUI_IN=/workspace/fnri-in/$b AIFEUI_OUT=/workspace/out/fnri/$b bash /workspace/fnri-in/$b/pod/aifeui.sh || echo "FNRI $b failed"
    done

Each writes /workspace/out/fnri/<b>/recording.json (plus preflight.json, status.json, engine.log, engine-build.log). Bring /workspace/out/fnri/*/recording.json home; the FNRI thread turns them into videos. If one brain fails, go on with the next; a failed check stops before anything is downloaded or built.

Also wanted: Riker's 28Bob-keep.json from his HF page, copied to /workspace/out/fnri/riker/ (it lines his experts up with stock Qwen's).

Checked here: the whole aifeui.sh run (checks, load, trace selftest, 24 questions, recording, viewer) on a tiny brain on CPU with AIFEUI_IN/AIFEUI_OUT; all four engine patches apply to b12032. Not checked: the CUDA build on the pod.

In the Forge this folder is `plan.scan.from` (see plans/publish-bill.json): forge.mjs sends it as in/scan.tgz and run.sh runs the loop above after the rebuild, then brings every file under out/fnri/ home to out/fnri/<run>/.
