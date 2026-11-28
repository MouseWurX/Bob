#!/usr/bin/env bash
# Inkling 2 Mini in Nari's trellis format, sized for a 16 GB shared-memory handheld (file about 7 GB), 28 Nov 2026.
# The owner: "Can we try the nariq by part combo on our inkling 2 mini run?" and "We do the unabliterated model first".
# Three files at the same coded size, all from the stock (not abliterated) full-size brain:
#   TRL2-LDLQ   plain NariQ: every coded tensor 2 bits, LDLQ rounding (input side only)
#   PART-LDLQ   NariQ by part: 1, 2, 3 or 4 bits per tensor, picked by drift (trl_parts.py) within TRL2-LDLQ's bytes
#   PART-YAQA   by part + YAQA: the same widths, rounded with both sides of the Kronecker Hessian (per expert)
# plus STOCK-IQ2_XXS (llama-quantize with an imatrix, same token table and head) as the yardstick. All rows share the
# token table (EMB_TYPE) and head (HEAD_TYPE); only the attention and expert linears differ. Scored here by KLD against
# the BF16 brain on wikitext-2 test (the drift); Bob's held-out jobs run after, on the files this leaves in $KEEP.
# Source: thinkingmachines/Inkling-2-Mini (experts NVFP4, the rest MXFP8/BF16). transformers 5.24.1 unpacks it for the
# Hessian pass; llama.cpp's own converter (UPSTREAM_SHA) makes the BF16 GGUF; Lamplight (ENGINE_SHA) runs every file.
# Calibration = wikitext-2 train (never the test text, never Bob's held-out jobs, never text Claude wrote). Uploads nothing.
#   CANARY=1 bash inkling-trl.sh   -> every step once on two layers (0 and 6, one looped), few chunks, all timed
#   bash inkling-trl.sh            -> the whole brain
# Env: OUT, W, KEEP (where the finished files go, default /workspace/keep), CHUNKS x CTX (Hessian text), KLD_CHUNKS,
#      NGPU, EXPERT_GB (expert sums per card in the Hessian pass), EMB_TYPE (q4_K), HEAD_TYPE (q6_K), STOCK (1: the
#      IQ2_XXS row), STEP_MIN (hard minutes per long step). Ends with "INK DONE" (or "INK FAILED <step>") in summary.txt.
set -uo pipefail
CANARY=${CANARY:-0}
OUT=${OUT:-/workspace/ink-results}; W=${W:-/workspace/ink}; KEEP=${KEEP:-/workspace/keep}; JOBS=${JOBS:-$(nproc)}
HF_MODEL=${HF_MODEL:-thinkingmachines/Inkling-2-Mini}
if [ "$CANARY" = 1 ]; then CHUNKS=${CHUNKS:-8}; export KLD_CHUNKS=${KLD_CHUNKS:-8}; LAYERS=${LAYERS:-"0|6"}; STOCK=${STOCK:-0}
else CHUNKS=${CHUNKS:-128}; export KLD_CHUNKS=${KLD_CHUNKS:-64}; LAYERS=${LAYERS:-"[0-9]+"}; STOCK=${STOCK:-1}; fi
CTX=${CTX:-2048}; export KLD_CTX=${KLD_CTX:-2048}; STEP_MIN=${STEP_MIN:-240}; EXPERT_GB=${EXPERT_GB:-0}
EMB_TYPE=${EMB_TYPE:-q4_K}; HEAD_TYPE=${HEAD_TYPE:-q6_K}
BOB_SHA=${BOB_SHA:?set BOB_SHA to the MouseWurX/Bob commit with pod/trellis}
ENGINE_SHA=${ENGINE_SHA:-de773f034d040f8b46aad012672bae352d06c102}     # engine patches with coded experts (PR #387)
TAG=b12359; LLAMA_SHA=b1b770d90d94cad9e9ea5b993bdbc383a522fb28
UPSTREAM_SHA=${UPSTREAM_SHA:-8e23278c7c36f4429fb237467d50e2935a91e655}  # llama.cpp master, 27 Nov 2026: its converter knows Inkling 2 loop
mkdir -p "$OUT" "$W" "$KEEP"; S="$OUT/summary.txt"; : > "$S"
say() { echo "$*" | tee -a "$S"; }
fail() { say "INK FAILED $1"; exit 1; }
T0=$(date +%s); LAST=$T0
step() { local now; now=$(date +%s); echo "=== $(date -u +%H:%M:%S) (+$((now - LAST)) s, $((now - T0)) s total) $*" | tee -a "$OUT/steps.log"; LAST=$now; }
( while sleep 15; do nvidia-smi --query-gpu=index,temperature.gpu,clocks.sm,power.draw,utilization.gpu,memory.used,clocks_event_reasons.active --format=csv,noheader 2>/dev/null | sed "s/^/$(date -u +%H:%M:%S) /"; done >> "$OUT/gpu-log.csv" ) &
GL=$!; trap 'kill $GL 2>/dev/null' EXIT

step tools
command -v cmake >/dev/null && command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq cmake git build-essential >"$OUT/apt.log" 2>&1; } || fail tools
python3 -c 'import torch; assert torch.cuda.is_available()' 2>/dev/null || fail "torch with CUDA missing (use a PyTorch CUDA devel image)"
command -v nvcc >/dev/null || fail "no nvcc (use a CUDA devel image: the trellis kernel and the engine are compiled here)"
# keep the image's own torch (the first canary, 28 Nov: an unpinned pip pulled torch 2.15 for CUDA 13.2 onto a CUDA 12.4
# image, so the trellis kernel was built by one CUDA and run by another); the kernel is built by the image's nvcc
TV=$(python3 -c 'import torch; print(torch.__version__)'); echo "torch==$TV" > "$W/pip-keep.txt"
python3 -c 'import sys, torch; v = tuple(int(x) for x in torch.__version__.split("+")[0].split(".")[:2]); sys.exit(v < (2, 6) or sys.version_info < (3, 11))' ||
  fail "transformers 5.24.1 needs torch 2.6+ and Python 3.11+ (this image: torch $TV, $(python3 -V)); use a newer PyTorch CUDA devel image"
pip install -q -c "$W/pip-keep.txt" numpy sentencepiece protobuf safetensors "transformers==5.24.1" accelerate huggingface_hub hf_transfer ninja >"$OUT/pip.log" 2>&1 || { tail -5 "$OUT/pip.log"; fail "pip (with the image's torch $TV kept)"; }
NV=$(nvcc --version | grep -o 'release [0-9]*\.[0-9]*' | cut -d' ' -f2); TC=$(python3 -c 'import torch; print(torch.version.cuda)')
[ "${NV%%.*}" = "${TC%%.*}" ] || fail "nvcc is CUDA $NV but torch was built for CUDA $TC (use an image whose torch and nvcc match)"
python3 -c 'import torch, transformers, accelerate; print("torch", torch.__version__, "cuda", torch.version.cuda, "transformers", transformers.__version__, "accelerate", accelerate.__version__)' | tee -a "$S"
nvidia-smi --query-gpu=index,name,memory.total,driver_version,compute_cap --format=csv > "$OUT/gpu.txt" 2>&1 || true
NGPU=${NGPU:-$(nvidia-smi -L | wc -l)}; say "cards: $NGPU x $(sed -n 2p "$OUT/gpu.txt"), RAM $(free -g | awk '/Mem/{print $2}') GB, disk free $(df -BG --output=avail "$W" | tail -1)"
ARCH=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | head -1 | tr -d '. '); [[ "$ARCH" =~ ^[0-9]+$ ]] || fail "card arch"
NEED=$([ "$CANARY" = 1 ] && echo 140 || echo 320)   # source 20 + BF16 GGUF 53 + Q8 frame 28 + expert Hessians ~105 (bf16) + codes ~40 + files ~28 GB
[ "$(df -BG --output=avail "$W" | tail -1 | tr -dc 0-9)" -ge "$NEED" ] || fail "under $NEED GB free disk"

step "Bob tools ($BOB_SHA) + engine patches ($ENGINE_SHA) + llama.cpp converter ($UPSTREAM_SHA)"
for x in bob:$BOB_SHA eng:$ENGINE_SHA; do d=$W/${x%%:*}; sha=${x#*:}
  [ "$(git -C "$d" rev-parse HEAD 2>/dev/null)" = "$sha" ] && continue
  rm -rf "$d"; git init -q "$d" && git -C "$d" remote add origin https://github.com/MouseWurX/Bob.git &&
    git -C "$d" fetch -q --depth 1 origin "$sha" && git -C "$d" checkout -q FETCH_HEAD || fail "fetch $x"
  [ "$(git -C "$d" rev-parse HEAD)" = "$sha" ] || fail "sha $x"
done
U=$W/upstream
if [ "$(git -C "$U" rev-parse HEAD 2>/dev/null)" != "$UPSTREAM_SHA" ]; then
  rm -rf "$U"; git init -q "$U" && git -C "$U" remote add origin https://github.com/ggml-org/llama.cpp.git &&
    git -C "$U" fetch -q --depth 1 origin "$UPSTREAM_SHA" && git -C "$U" checkout -q FETCH_HEAD || fail "fetch llama.cpp converter"
fi
P=$W/bob/app/model-lab/forge/pod; TP=$P/trellis

step "trellis kernel self-test (first: the newest step), 1-4 bits (CUDA vs torch, timed)"
python3 "$TP/trl_selftest.py" --bits 1,2,3,4 --out "$OUT/selftest.json" --tune "$OUT/tune.json" 2>&1 | tee -a "$S" | tail -12; [ "${PIPESTATUS[0]}" = 0 ] || fail selftest
export TRL_TUNE="$OUT/tune.json"   # the fastest kernel shape per width that this card ran correctly

step "Lamplight build (llama.cpp $TAG + every patch, CUDA $ARCH)"
B=$W/ll/build/bin
if [ ! -x "$B/llama-perplexity" ]; then
  rm -rf "$W/ll"; git clone -q --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp.git "$W/ll" || fail llama-clone
  [ "$(git -C "$W/ll" rev-parse HEAD)" = "$LLAMA_SHA" ] || fail "llama.cpp $TAG is not $LLAMA_SHA"
  for p in "$W/eng/app/engine/patches/"*.patch; do git -C "$W/ll" apply "$p" || fail "patch $(basename "$p")"; done
  sed -i "s/set(BUILD_NUMBER \${COUNT})/set(BUILD_NUMBER ${TAG#b})/" "$W/ll/cmake/build-info.cmake"
  cmake -S "$W/ll" -B "$W/ll/build" -DCMAKE_BUILD_TYPE=Release -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DLLAMA_CURL=OFF \
    -DLLAMA_OPENSSL=OFF -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=$ARCH >"$OUT/cmake.log" 2>&1 &&
    cmake --build "$W/ll/build" -j "$JOBS" --target llama-quantize llama-perplexity llama-completion llama-imatrix >"$OUT/build.log" 2>&1 || { tail -20 "$OUT/build.log"; fail build; }
fi
export LD_LIBRARY_PATH=$B:${LD_LIBRARY_PATH:-}; export PYTHONPATH=$W/ll/gguf-py:${PYTHONPATH:-}
"$B/llama-perplexity" --list-devices 2>&1 | tee "$OUT/devices.txt" | grep -q CUDA || fail "the engine sees no CUDA card"
python3 -c "import gguf; gguf.GGMLQuantizationType.TRL1" || fail "gguf-py without trellis types"


step "full-size brain $HF_MODEL"
export HF_HUB_ENABLE_HF_TRANSFER=1
python3 - "$HF_MODEL" "$W/hf" > "$OUT/download.txt" 2>&1 <<'PY' || fail download
import sys
from huggingface_hub import HfApi, snapshot_download
sha = HfApi().model_info(sys.argv[1]).sha
snapshot_download(sys.argv[1], revision=sha, local_dir=sys.argv[2], allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model", "*.jinja", "LICENSE*"])
print(f"{sys.argv[1]} revision {sha}")
PY
say "$(tail -1 "$OUT/download.txt")"
REF=$W/ref-bf16.gguf
[ -s "$REF" ] || PYTHONPATH=$U/gguf-py python3 "$U/convert_hf_to_gguf.py" "$W/hf" --outtype bf16 --outfile "$REF" > "$OUT/convert.log" 2>&1 || { tail -5 "$OUT/convert.log"; fail convert; }
say "BF16 GGUF: $(du -BG "$REF" | cut -f1)"

step texts
TR=$W/wiki-train.txt; TE=$W/wiki-test.txt
[ -s "$TE" ] || python3 - "$W/wiki" "$TR" "$TE" > "$OUT/texts.txt" 2>&1 <<'PY' || fail texts
import os, sys, zipfile
from huggingface_hub import hf_hub_download
os.makedirs(sys.argv[1], exist_ok=True)
z = zipfile.ZipFile(hf_hub_download("ggml-org/ci", "wikitext-2-raw-v1.zip", repo_type="dataset", local_dir=sys.argv[1]))
for split, out in (("train", sys.argv[2]), ("test", sys.argv[3])):
    t = z.read(f"wikitext-2-raw/wiki.{split}.raw").decode("utf-8")
    if len(t) < 100000: sys.exit(f"{split} text is only {len(t)} characters")
    open(out, "w").write(t); print(split, len(t))
PY

step "Lamplight reads the BF16 brain (its next-word odds = the KLD reference, $KLD_CHUNKS x $KLD_CTX tokens of wikitext-2 test)"
bash "$P/kld_check.sh" "$REF" "$TE" "$OUT/kld" "$B/llama-perplexity" > "$OUT/kld-ref.log" 2>&1 && [ -s "$OUT/kld/base.kld" ] || { tail -5 "$OUT/kld-ref.log"; fail "BF16 in Lamplight"; }
say "BF16: $(grep -o 'Final estimate.*' "$OUT/kld/base.log")"

step "Hessians, both factors, every expert ($CHUNKS x $CTX tokens, layers over $NGPU cards)"
H=$W/hess
[ -s "$H/info.json" ] || timeout $((STEP_MIN * 60)) python3 "$TP/hess_hf.py" --model "$W/hf" --text "$TR" --out "$H" --chunks "$CHUNKS" --ctx "$CTX" \
  --devices "$NGPU" --match-gguf "$REF" --expert-gb "$EXPERT_GB" --only "^blk\.($LAYERS)\." > "$OUT/hess.log" 2>&1 || { tail -5 "$OUT/hess.log"; fail hessians; }
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); d.pop('names'); print(json.dumps(d))" "$H/info.json" | tee "$OUT/hess-info.json" | tee -a "$S"
grep -c "no GGUF tensor matches" "$OUT/hess.log" | xargs -I{} say "expert blocks with no match: {}"

MATCH="^blk\.($LAYERS)\.(attn_(q|k|v|output|gate)|ffn_(gate_up|down)_exps)\.weight\$"
step "frame: the BF16 brain at Q8_0 with token table $EMB_TYPE and head $HEAD_TYPE (the coded tensors are replaced)"
FRAME=$W/frame.gguf
[ -s "$FRAME" ] || "$B/llama-quantize" --token-embedding-type "$EMB_TYPE" --output-tensor-type "$HEAD_TYPE" "$REF" "$FRAME" Q8_0 "$JOBS" > "$OUT/frame.log" 2>&1 || fail frame
run() {  # run <codes dir> <bits> <mode> [--plan file]: one trl_run over every card
  local C=$1 k=$2 m=$3; shift 3
  timeout $((STEP_MIN * 60)) python3 "$TP/trl_run.py" --weights "$REF" --hess "$H" --out "$C" --bits "$k" --mode "$m" --devices "$NGPU" \
    --match "$MATCH" "$@" > "$OUT/$(basename "$C").log" 2>&1 || { tail -5 "$OUT/$(basename "$C").log"; fail "trellis $(basename "$C")"; }
  cp "$C/report.tsv" "$OUT/report-$(basename "$C").tsv"
  grep -h "tensors in" "$OUT/$(basename "$C").log" | while read -r l; do say "$l"; done   # where the time went: loading vs coding
  say "$(basename "$C"): $(awk -F'\t' '{n++; s+=$7; d+=$6; b+=$9} END{printf "%d tensors, %.0f s summed per tensor, drift estimate %.4g, %.3f GB", n, s, d, b/1e9}' "$C/report.tsv")"
}
for k in 1 2 3 4; do step "trellis $k bits, LDLQ, every coded tensor over $NGPU cards"; run "$W/codes-ldlq-$k" $k ldlq; done
step "bits by part: widths within TRL2-LDLQ's bytes"
python3 "$TP/trl_parts.py" --codes "$W"/codes-ldlq-{1,2,3,4} --same-as "$W/codes-ldlq-2" --out "$OUT/plan.tsv" --merge "$W/codes-part-ldlq" \
  --report "$OUT/parts.json" 2>&1 | tee -a "$S"; [ "${PIPESTATUS[0]}" = 0 ] || fail parts
step "by part + YAQA (the same widths)"; run "$W/codes-part-yaqa" 2 yaqa --plan "$OUT/plan.tsv"

ROWS=()
for nc in TRL2-LDLQ=codes-ldlq-2 PART-LDLQ=codes-part-ldlq PART-YAQA=codes-part-yaqa; do N=${nc%%=*}
  step "write $N"
  [ -s "$KEEP/$N.gguf" ] || python3 "$TP/trl_write.py" --base "$FRAME" --codes "$W/${nc#*=}" --out "$KEEP/$N.gguf" >> "$OUT/write.log" 2>&1 || fail "write $N"
  ROWS+=("$N=$KEEP/$N.gguf")
done
if [ "$STOCK" = 1 ]; then
  step "yardstick: llama-quantize IQ2_XXS with an imatrix (same token table and head)"
  IM=$W/imatrix.gguf
  [ -s "$IM" ] || "$B/llama-imatrix" -m "$REF" -f "$TR" -c 512 --chunks 128 -ngl 99 -o "$IM" > "$OUT/imatrix.log" 2>&1 || fail imatrix
  [ -s "$KEEP/STOCK-IQ2_XXS.gguf" ] || "$B/llama-quantize" --imatrix "$IM" --token-embedding-type "$EMB_TYPE" --output-tensor-type "$HEAD_TYPE" \
    "$REF" "$KEEP/STOCK-IQ2_XXS.gguf" IQ2_XXS "$JOBS" > "$OUT/quant-stock.log" 2>&1 || fail "quant stock"
  ROWS+=("STOCK-IQ2_XXS=$KEEP/STOCK-IQ2_XXS.gguf")
fi

step sizes
for nf in "${ROWS[@]}"; do N=${nf%%=*} F=${nf#*=}
  python3 - "$F" "$N" <<'PY' | tee -a "$S"
import os, re, sys, gguf
r = gguf.GGUFReader(sys.argv[1]); lin = re.compile(r"^blk\.\d+\.(attn_(q|k|v|output|gate)|ffn_(gate_up|down)_exps)\.(weight|trellis_s16|trellis_pre|trellis_post)$")
b = sum(int(t.n_bytes) for t in r.tensors if lin.match(t.name)); n = sum(int(t.n_elements) for t in r.tensors if lin.match(t.name) and t.name.endswith(".weight") and not t.tensor_type.name.startswith("TRL"))
n += sum(int(t.shape[1]) * int(t.shape[0]) * 8 // int(t.tensor_type.name[3:]) * (int(t.shape[2]) if len(t.shape) > 2 else 1) for t in r.tensors if t.tensor_type.name.startswith("TRL"))
print(f"{sys.argv[2]}: file {os.path.getsize(sys.argv[1]) / 1e9:.3f} GB, coded linears {8 * b / max(n, 1):.3f} bits a weight (sides counted)")
PY
done

step "KLD against BF16 (the same positions as the reference)"
bash "$P/kld_check.sh" "$REF" "$TE" "$OUT/kld" "$B/llama-perplexity" "${ROWS[@]}" > "$OUT/kld.log" 2>&1 || fail kld
cat "$OUT/kld/kld.tsv" | tee -a "$S"
step "one greedy answer each"
for nf in "${ROWS[@]}"; do N=${nf%%=*} F=${nf#*=}
  A=$("$B/llama-completion" -m "$F" -p "The capital of France is" -n 12 --temp 0 -no-cnv --no-display-prompt -ngl 99 2>/dev/null | tr '\n' ' ' | head -c 120)
  say "$N: The capital of France is$A"
done
(cd "$KEEP" && sha256sum *.gguf > "$OUT/keep-sha256.txt")
step done; say "INK DONE (files in $KEEP)"
