#!/usr/bin/env bash
# GSQ pilot rental (26 Nov 2026): does ISTA DASLab's learned rounding (GSQ, arXiv 2604.18556), ported to stock q2_0 GGUF and
# one card, beat llama.cpp's own q2_0 rounding on a small dense brain? the owner: "If their research can benefit us we should
# attempt to implement it"; "Healing is not training" (26 Nov, the OK for light tuning of rounding).
# Two settings, each as three files of the same size that differ only in how the q2_0 tensors are rounded:
#   A: ffn_down at q2_0, the rest Q8_0 (like Bill, whose down experts are all q2_0)      B: all of ffn (gate, up, down) at q2_0
#   STOCK = llama-quantize's q2_0   GPTQ = GPTQ with searched scales (no learning)   GSQ = GPTQ, then GSQ's learned rounding
# Scored by KLD against the BF16 brain on wikitext-2 test (same text and positions for every file), and one greedy answer.
# Calibration text is wikitext-2 train (never the test text, never Bob's held-out jobs, never text Claude wrote).
# One NVIDIA pod, 24 GB+ card, CUDA devel image with PyTorch, ~60 GB disk, internet to GitHub + Hugging Face (public).
#   bash gsq-pilot.sh   -> results in $OUT (default /workspace/gsq-results), summary in $OUT/summary.txt
# Env: OUT, W, CUDA=1 (0 = processor-only dry run), MODEL=<gguf> (skip the download and convert: use this file as the
#      reference), HF_MODEL (default Qwen/Qwen3-1.7B), TEXT_TRAIN / TEXT_TEST (skip the wikitext download), CHUNKS (x_dump,
#      default 128 x 512 tokens), KLD_CHUNKS (default 32), STEPS (GSQ steps per tensor, default 640), JOBS.
# Uploads nothing. Ends with "GSQ DONE" (or "GSQ FAILED <step>") in summary.txt.
set -uo pipefail
OUT=${OUT:-/workspace/gsq-results}; W=${W:-/workspace/gsq}; CUDA=${CUDA:-1}; JOBS=${JOBS:-$(nproc)}
HF_MODEL=${HF_MODEL:-Qwen/Qwen3-1.7B}; CHUNKS=${CHUNKS:-128}; CTX=${CTX:-512}; STEPS=${STEPS:-640}
export KLD_CHUNKS=${KLD_CHUNKS:-32} KLD_CTX=${KLD_CTX:-512}
BOB_SHA=${BOB_SHA:-2b2d24ce68f68715066630935029216d37eb3ea3}   # MouseWurX/Bob commit with pod/gsq (branch claude/project-thread-9my3wr)
TAG=b12359
mkdir -p "$OUT" "$W"; S="$OUT/summary.txt"; : > "$S"
say() { echo "$*" | tee -a "$S"; }
fail() { say "GSQ FAILED $1"; exit 1; }
step() { echo "=== $(date -u +%H:%M:%S) $*" | tee -a "$OUT/steps.log"; }

step tools
command -v cmake >/dev/null && command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq cmake git build-essential >"$OUT/apt.log" 2>&1; } || fail tools
python3 -c 'import torch' 2>/dev/null || fail "torch missing (use a PyTorch image)"
pip install -q numpy sentencepiece protobuf safetensors "transformers>=4.51" huggingface_hub hf_transfer >"$OUT/pip.log" 2>&1 || fail pip
nvidia-smi --query-gpu=name,memory.total,driver_version,temperature.gpu,clocks.sm --format=csv > "$OUT/gpu.txt" 2>&1 || true
say "card: $(tail -n +2 "$OUT/gpu.txt" | head -1)"
CMK=(-DCMAKE_BUILD_TYPE=Release -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DLLAMA_CURL=OFF -DLLAMA_OPENSSL=OFF)
if [ "$CUDA" = 1 ]; then   # apt's cmake 3.22 has no "native": read the card's number
  ARCH=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | head -1 | tr -d '. '); [[ "$ARCH" =~ ^[0-9]+$ ]] || ARCH=86
  CMK+=(-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=$ARCH); say "CUDA architecture: $ARCH, cmake $(cmake --version | head -1)"
fi

step "Bob tools + llama.cpp $TAG"
if [ -z "${POD_GSQ:-}" ]; then
  rm -rf "$W/bob"; git init -q "$W/bob" && git -C "$W/bob" remote add origin https://github.com/MouseWurX/Bob.git &&
    git -C "$W/bob" fetch -q --depth 1 origin "$BOB_SHA" && git -C "$W/bob" checkout -q FETCH_HEAD || fail bob-fetch
  [ "$(git -C "$W/bob" rev-parse HEAD)" = "$BOB_SHA" ] || fail bob-sha
  POD_GSQ=$W/bob/app/model-lab/forge/pod/gsq; KLD=$W/bob/app/model-lab/forge/pod/kld_check.sh
else KLD=$POD_GSQ/../kld_check.sh; fi
if [ ! -x "$W/ll/build/bin/x_dump" ]; then
  rm -rf "$W/ll"; git clone -q --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp.git "$W/ll" || fail llama-clone
  sed -i "s/set(BUILD_NUMBER \${COUNT})/set(BUILD_NUMBER ${TAG#b})/" "$W/ll/cmake/build-info.cmake"
  cmake -S "$W/ll" -B "$W/ll/build" "${CMK[@]}" >"$OUT/cmake.log" 2>&1 &&
    cmake --build "$W/ll/build" -j "$JOBS" --target llama-quantize llama-perplexity llama-completion >"$OUT/build.log" 2>&1 || fail build
  bash "$POD_GSQ/build.sh" "$W/ll" "$W/ll/build" >"$OUT/x_dump-build.txt" 2>&1 || fail x_dump-build
fi
B=$W/ll/build/bin; export PYTHONPATH=$W/ll/gguf-py:${PYTHONPATH:-}
say "llama.cpp $("$B/llama-completion" --version 2>&1 | grep -m1 -i version)"

step "reference brain"
if [ -n "${MODEL:-}" ]; then REF=$MODEL; say "reference: $REF (no download)"
else
  export HF_HUB_ENABLE_HF_TRANSFER=1
  python3 - "$HF_MODEL" "$W/hf" > "$OUT/download.txt" 2>&1 <<'PY' || fail download
import sys
from huggingface_hub import HfApi, snapshot_download
sha = HfApi().model_info(sys.argv[1]).sha
snapshot_download(sys.argv[1], revision=sha, local_dir=sys.argv[2], allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model", "merges.txt", "vocab.json", "LICENSE"])
print(f"{sys.argv[1]} revision {sha}")
PY
  say "$(tail -1 "$OUT/download.txt")"
  REF=$W/ref-bf16.gguf
  [ -s "$REF" ] || python3 "$W/ll/convert_hf_to_gguf.py" "$W/hf" --outtype bf16 --outfile "$REF" > "$OUT/convert.log" 2>&1 || fail convert
fi
say "reference file: $(stat -c %s "$REF") bytes"

step texts
if [ -n "${TEXT_TRAIN:-}" ]; then TR=$TEXT_TRAIN; TE=${TEXT_TEST:-$TEXT_TRAIN}
else
  TR=$W/wiki-train.txt; TE=$W/wiki-test.txt
  python3 - "$W/wiki" "$TR" "$TE" > "$OUT/texts.txt" 2>&1 <<'PY' || fail texts
import os, subprocess, sys, zipfile
from huggingface_hub import hf_hub_download
# llama.cpp's own copy of wikitext-2 raw (scripts/get-wikitext-2.sh): a zip of plain text, so no pyarrow (pyarrow wants
# NumPy 2, the PyTorch 2.4 image has 1.26; try 1 of 26 Nov stopped here). The parquet copy is the fallback, with a pyarrow
# that still takes NumPy 1.
os.makedirs(sys.argv[1], exist_ok=True)
try:
    z = zipfile.ZipFile(hf_hub_download("ggml-org/ci", "wikitext-2-raw-v1.zip", repo_type="dataset", local_dir=sys.argv[1]))
    got = {s: z.read(f"wikitext-2-raw/wiki.{s}.raw").decode("utf-8") for s in ("train", "test")}
    print("source: ggml-org/ci wikitext-2-raw-v1.zip")
except Exception as e:
    print("zip failed:", repr(e)[:300])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "pyarrow==14.0.2"])
    import glob, pyarrow.parquet as pq
    from huggingface_hub import snapshot_download
    d = snapshot_download("Salesforce/wikitext", repo_type="dataset", allow_patterns=["wikitext-2-raw-v1/*"], local_dir=sys.argv[1])
    got = {s: "".join(t for f in sorted(glob.glob(f"{d}/wikitext-2-raw-v1/{s}-*.parquet")) for t in pq.read_table(f).column("text").to_pylist()) for s in ("train", "test")}
    print("source: Salesforce/wikitext parquet")
for split, out in (("train", sys.argv[2]), ("test", sys.argv[3])):
    if len(got[split]) < 100000: sys.exit(f"{split} text is only {len(got[split])} characters")
    open(out, "w").write(got[split]); print(split, len(got[split]))
PY
fi
NG=(); [ "$CUDA" = 1 ] && NG=(-ngl 99)

step "record inputs (x_dump, $CHUNKS x $CTX tokens of the training text)"
X=$W/x; if [ ! -s "$X/info.json" ]; then rm -rf "$X"; mkdir -p "$X"
  "$B/x_dump" -m "$REF" --x-text "$TR" --x-match 'ffn_(up|down)' --x-out "$X" --x-chunks "$CHUNKS" --x-rows 32768 -c "$CTX" "${NG[@]}" > "$OUT/x_dump.log" 2>&1 || fail x_dump
fi
cp "$X/info.json" "$OUT/x-info.json"; say "inputs: $(python3 -c "import json,sys; t=json.load(open(sys.argv[1]))['tensors']; print(len(t), 'tensors,', min(v['rows'] for v in t.values()), 'rows or more each')" "$X/info.json")"

step "Q8_0 sanity file"
[ -s "$W/Q8_0.gguf" ] || "$B/llama-quantize" "$REF" "$W/Q8_0.gguf" Q8_0 "$JOBS" > "$OUT/quant-Q8_0.log" 2>&1 || fail q8
KL=("Q8_0=$W/Q8_0.gguf")
for SET in A B; do
  if [ "$SET" = A ]; then MATCH='ffn_down'; else MATCH='ffn_(gate|up|down)'; fi
  step "setting $SET ($MATCH at q2_0): stock file"
  BASE=$W/$SET-STOCK.gguf
  [ -s "$BASE" ] || "$B/llama-quantize" --tensor-type "$MATCH=q2_0" "$REF" "$BASE" Q8_0 "$JOBS" > "$OUT/quant-$SET.log" 2>&1 || fail "quant $SET"
  say "$SET: $(stat -c %s "$BASE") bytes"
  for MODE in stock gptq gsq; do
    step "setting $SET: $MODE rounding"
    C=$W/codes-$SET-$MODE
    [ -s "$C/report.tsv" ] && [ "$(grep -vc '^#' "$C/report.tsv")" -gt 0 ] || {
      rm -rf "$C"; python3 "$POD_GSQ/gsq_q2.py" --model "$REF" --x "$X" --match "$MATCH" --mode $MODE --out "$C" --steps "$STEPS" \
        $([ "$CUDA" = 1 ] || echo --device cpu) > "$OUT/gsq-$SET-$MODE.log" 2>&1 || { tail -5 "$OUT/gsq-$SET-$MODE.log"; fail "gsq $SET $MODE"; }; }
    cp "$C/report.tsv" "$OUT/report-$SET-$MODE.tsv"
    F=$W/$SET-$(echo $MODE | tr a-z A-Z)-W.gguf
    python3 "$POD_GSQ/q2_0_patch.py" --base "$BASE" --codes "$C" --out "$F" >> "$OUT/patch.log" 2>&1 || fail "patch $SET $MODE"
    [ "$(stat -c %s "$F")" = "$(stat -c %s "$BASE")" ] || fail "size $SET $MODE"
    if [ $MODE = stock ]; then
      # our writer must reproduce llama-quantize's own q2_0 byte for byte, or the comparison is not fair
      cmp -s "$F" "$BASE" && say "$SET: our stock q2_0 writer = llama-quantize, byte for byte" || fail "writer differs from llama-quantize ($SET)"
    else KL+=("$SET-$(echo $MODE | tr a-z A-Z)=$F"); fi
    say "$SET $MODE: layer loss (share of output, stock -> $MODE) $(awk -F'\t' '!/^#/{s+=$4; m+=$5; n++} END{printf "%.4g -> %.4g over %d tensors", s/n, m/n, n}' "$C/report.tsv")"
  done
  KL+=("$SET-STOCK=$BASE")
done

step "KLD against the BF16 brain ($KLD_CHUNKS x $KLD_CTX tokens of wikitext-2 test)"
rm -rf "$OUT/kld"; bash "$KLD" "$REF" "$TE" "$OUT/kld" "$B/llama-perplexity" "${KL[@]}" > "$OUT/kld.log" 2>&1 || fail kld
cat "$OUT/kld/kld.tsv" | tee -a "$S"

step "one greedy answer each"
for nf in "${KL[@]}"; do
  N=${nf%%=*} F=${nf#*=}
  A=$("$B/llama-completion" -m "$F" -p "The capital of France is" -n 12 --temp 0 -no-cnv --no-display-prompt "${NG[@]}" 2>/dev/null | tr '\n' ' ' | head -c 120)
  say "$N: The capital of France is$A"
done
say "GSQ DONE"
