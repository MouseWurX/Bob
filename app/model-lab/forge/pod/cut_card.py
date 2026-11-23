#!/usr/bin/env python3
"""Model card for a REAP-cut brain's GGUF repo (Nov 23 2026, Bobert NBob Flash Next).

cut_card.py --dir <repo folder> --cut cut.json --name "Bobert 101Bob Flash Next" --base Qwen/Qwen3.8-Flash-Next
            --base-params 125 --source "unsloth/Qwen3.8-Flash-Next-GGUF Q8_0" --license-name qwen-community-1.0 [--scores scores.md]
Lists every .gguf in --dir with its size. Until --scores is given, the card says the brain is unproven. The LICENSE file in
--dir is the base model's own license, copied unchanged (its notice must go with every copy and derivative)."""
import argparse, glob, json, os

ap = argparse.ArgumentParser()
for a in ("--dir", "--cut", "--name", "--base", "--source", "--license-name"): ap.add_argument(a, required=True)
ap.add_argument("--base-params", type=float, required=True)
ap.add_argument("--scores", default="")
ap.add_argument("--extra", default="", help="more card text (markdown), put after the scores")
a = ap.parse_args()
c = json.load(open(a.cut))
left = a.base_params - c["removed_main_params"] / 1e9
# files.json remembers every quant made so far, so one deleted from the pod after its upload stays on the card
fj = os.path.join(a.dir, "files.json")
sizes = json.load(open(fj)) if os.path.exists(fj) else {}
for f in glob.glob(os.path.join(a.dir, "*.gguf")):
    n = os.path.basename(f)
    if not n.startswith("imatrix") and not __import__("re").search(r"-\d{5}-of-\d{5}\.gguf$", n): sizes[n] = os.path.getsize(f)
json.dump(sizes, open(fj, "w"), indent=1)
files = sorted(sizes)
rows = "\n".join(f"| `{n}` | {sizes[n] / 1e9:.1f} GB |" for n in files) or "| (uploading) | |"
scores = open(a.scores).read().strip() if a.scores and os.path.exists(a.scores) else ""
extra = open(a.extra).read().strip() + "\n" if a.extra and os.path.exists(a.extra) else ""
proof = f"## Results\n\n{scores}\n" if scores else "## Results\n\nUnproven in our lab, as we have yet to test. Pending: the held-out job scores of the cut files, and speed (reading and writing, words a second) and memory on the test systems below. They will be added here when they are in.\n"
md = f"""---
license: other
license_name: {a.license_name}
license_link: LICENSE
base_model: {a.base}
tags: [gguf, moe, reap, pruned, llama.cpp]
---
# {a.name} (GGUF)

{a.name} is [{a.base}](https://huggingface.co/{a.base}) with {c['experts_from'] - c['experts_kept']} of its {c['experts_from']} experts taken out of every layer
({c['experts_kept']} kept, {100 * c['experts_kept'] / c['experts_from']:.0f}%), about {left:.1f}B parameters left of {a.base_params:.0f}B
(not counting the n-gram embedding and the MTP layer, as the base model's card doesn't). Nothing was retrained or healed.

**How the experts were picked:** REAP-style scores (how often the router picks each expert, times its weight and the size of its
output) read from the full model doing MouseWurX's own everyday assistant jobs: mail, office files, code. The jobs used to judge it
afterwards were kept apart and never used to pick. The MTP layer keeps the experts kept most often across the other layers.

**How the files were made:** cut from {a.source} with gguf_cut_experts.py (whole expert slices copied, nothing changed inside
them), then quantized with llama.cpp's llama-quantize using the imatrix in this repo (`imatrix.gguf`, from MouseWurX's own
training chats, not the judging jobs). Because the cut started from Q8_0, these are re-quantized from Q8_0, not from BF16.

| File | Size |
|---|---|
{rows}

Runs on llama.cpp builds that run {a.base}. The keep list is `keep.json` (expert ids kept, per layer).

{extra}
{proof}
## License

This is a derivative of {a.base}, released under the {a.license_name} license. The license and its copyright notice are in
[LICENSE](LICENSE), unchanged, and must go with every copy. Read it before use: among other things, some commercial services need
a separate license from Qwen.
"""
open(os.path.join(a.dir, "README.md"), "w").write(md)
print(f"card written: {a.name}, {left:.1f}B left, {len(files)} file(s)")
