#!/usr/bin/env bash
# Trellis + YAQA vs GPTQ vs stock, small dense brain, two cards (28 Nov 2026). The owner: "Small brains first, get it to
# work right, over multiple cards, even if it's smaller cards to get it to split. Make sure it works before we send it for
# the full run." and "get yaqa and trellis ready for comparision".
# Every row is the same brain with the same token table and head (q8_0); only the attention + feed-forward linears differ:
#   STOCK-Q2_K  STOCK-q2_0  GPTQ-q2_0 (pod/gsq)  TRL2-LDLQ  TRL2-YAQA     (about 2 bits a weight)
#   STOCK-Q3_K  TRL3-LDLQ   TRL3-YAQA                                     (about 3 bits a weight)
# TRL = Nari's trellis format (Lamplight 0136) made by our own maker (pod/trellis): LDLQ = GPTQ-style feedback on the input
# Hessian; YAQA = two-sided feedback on the Kronecker Hessian of the full model's KL (hess_hf.py, a backward pass).
# Scored by KLD against the BF16 brain on wikitext-2 test, file sizes, one greedy answer each. Calibration = wikitext-2
# train (never the test text, never Bob's held-out jobs, never text Claude wrote). Uploads nothing.
# The split: hess_hf.py spreads the brain's layers over the cards, trl_run.py deals the linears out to one worker per
# card, and the KLD runs split the layers over both cards too (the trellis ops on two cards).
#   CANARY=1 bash trl-pilot.sh   -> Qwen3-0.6B, 2 bits only, fewer chunks: every new step once, all timed (~$0.50)
#   bash trl-pilot.sh            -> Qwen3-1.7B, both widths
#   CANARY=1 CHUNKS=128 YAQA_DAMPS="0.01 0.1 0.3 1" bash trl-pilot.sh -> the YAQA sweep on the 0.6B
#   CANARY=1 CHUNKS=128 YAQA_DAMPS="1 3 10" SEEDS="0 1" bash trl-pilot.sh -> sweep 3: more damping, each row twice, and
#     llama.cpp's own imatrix 2-bit files beside them
#   CANARY=1 CHUNKS=128 BITS="2 3" YAQA_DAMPS=1 bash trl-pilot.sh -> 3 bits too: Q3_K, llama.cpp's imatrix 3-bit mixes, TRL3
# Env: OUT, W, HF_MODEL, CHUNKS (Hessian chunks x CTX), KLD_CHUNKS, BITS ("2 3"), NGPU (default: every card), JOBS, YAQA_DAMPS,
#      STEP_MIN (hard minutes per trellis run, default 90). Ends with "TRL DONE" (or "TRL FAILED <step>") in summary.txt.
set -uo pipefail
CANARY=${CANARY:-0}
OUT=${OUT:-/workspace/trl-results}; W=${W:-/workspace/trl}; JOBS=${JOBS:-$(nproc)}
if [ "$CANARY" = 1 ]; then HF_MODEL=${HF_MODEL:-Qwen/Qwen3-0.6B}; CHUNKS=${CHUNKS:-16}; BITS=${BITS:-2}; export KLD_CHUNKS=${KLD_CHUNKS:-8}
else HF_MODEL=${HF_MODEL:-Qwen/Qwen3-1.7B}; CHUNKS=${CHUNKS:-128}; BITS=${BITS:-2 3}; export KLD_CHUNKS=${KLD_CHUNKS:-32}; fi
CTX=${CTX:-512}; export KLD_CTX=${KLD_CTX:-512}; STEP_MIN=${STEP_MIN:-90}
# YAQA_DAMPS: one YAQA row per damping of the output side (H_out + d x mean(diag) I); "0.01" is the plain row. The 0.6B
# canary (28 Nov) had YAQA lose to LDLQ (KLD 1.44 vs 1.16) while its own drift estimate was 2.4x lower: it fits a noisy
# H_out from 16 x 512 tokens. A sweep (more CHUNKS, more damping) shows which fixes it.
YAQA_DAMPS=${YAQA_DAMPS:-0.01}
# SEEDS: the trellis rows again with other random rotations (rows -S<seed>), to see how much one coding's luck moves the
# KLD (sweep 2, 28 Nov: YAQA damping 0.01/0.1/0.3/1 gave 1.24/0.97/1.22/0.81, not in order, each +-0.03)
SEEDS=${SEEDS:-0}
STOCK_IQ=${STOCK_IQ:-1}   # llama.cpp's own 2-bit rows with an importance matrix (Q2_K and IQ2_XXS/XS/S, its mix and pure)
BOB_SHA=${BOB_SHA:?set BOB_SHA to the MouseWurX/Bob commit with pod/trellis}           # this branch
ENGINE_SHA=${ENGINE_SHA:-de773f034d040f8b46aad012672bae352d06c102}                       # engine patches 0001-0136 with coded experts (PR #387)
TAG=b12359; LLAMA_SHA=b1b770d90d94cad9e9ea5b993bdbc383a522fb28
mkdir -p "$OUT" "$W"; S="$OUT/summary.txt"; : > "$S"
say() { echo "$*" | tee -a "$S"; }
fail() { say "TRL FAILED $1"; exit 1; }
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
pip install -q -c "$W/pip-keep.txt" numpy sentencepiece protobuf safetensors "transformers>=4.51,<5" accelerate huggingface_hub hf_transfer ninja >"$OUT/pip.log" 2>&1 || { tail -5 "$OUT/pip.log"; fail "pip (with the image's torch $TV kept)"; }
NV=$(nvcc --version | grep -o 'release [0-9]*\.[0-9]*' | cut -d' ' -f2); TC=$(python3 -c 'import torch; print(torch.version.cuda)')
[ "${NV%%.*}" = "${TC%%.*}" ] || fail "nvcc is CUDA $NV but torch was built for CUDA $TC (use an image whose torch and nvcc match)"
python3 -c 'import torch, transformers, accelerate; print("torch", torch.__version__, "cuda", torch.version.cuda, "transformers", transformers.__version__, "accelerate", accelerate.__version__)' | tee -a "$S"
nvidia-smi --query-gpu=index,name,memory.total,driver_version,compute_cap --format=csv > "$OUT/gpu.txt" 2>&1 || true
NGPU=${NGPU:-$(nvidia-smi -L | wc -l)}; say "cards: $NGPU x $(sed -n 2p "$OUT/gpu.txt")"
[ "$NGPU" -ge 2 ] || say "WARNING: one card only, so the split is not tested"
ARCH=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | head -1 | tr -d '. '); [[ "$ARCH" =~ ^[0-9]+$ ]] || fail "card arch"
say "CUDA architecture $ARCH, cmake $(cmake --version | head -1)"

step "Bob tools ($BOB_SHA) + engine patches ($ENGINE_SHA)"
for x in bob:$BOB_SHA eng:$ENGINE_SHA; do d=$W/${x%%:*}; sha=${x#*:}
  [ "$(git -C "$d" rev-parse HEAD 2>/dev/null)" = "$sha" ] && continue
  rm -rf "$d"; git init -q "$d" && git -C "$d" remote add origin https://github.com/MouseWurX/Bob.git &&
    git -C "$d" fetch -q --depth 1 origin "$sha" && git -C "$d" checkout -q FETCH_HEAD || fail "fetch $x"
  [ "$(git -C "$d" rev-parse HEAD)" = "$sha" ] || fail "sha $x"
done
P=$W/bob/app/model-lab/forge/pod; TP=$P/trellis
say "engine patches: $(ls "$W/eng/app/engine/patches/"*.patch | wc -l), last $(basename "$(ls "$W/eng/app/engine/patches/"*.patch | tail -1)")"

step "trellis kernel self-test (first: the newest step) (CUDA vs torch, timed)"
python3 "$TP/trl_selftest.py" --bits "$(echo $BITS | tr ' ' ,)" --out "$OUT/selftest.json" --tune "$OUT/tune.json" 2>&1 | tee -a "$S" | tail -10; [ "${PIPESTATUS[0]}" = 0 ] || fail selftest
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
[ -x "$B/llama-imatrix" ] || cmake --build "$W/ll/build" -j "$JOBS" --target llama-imatrix >>"$OUT/build.log" 2>&1 || fail "build llama-imatrix"
export LD_LIBRARY_PATH=$B:${LD_LIBRARY_PATH:-}; export PYTHONPATH=$W/ll/gguf-py:${PYTHONPATH:-}
"$B/llama-perplexity" --list-devices 2>&1 | tee "$OUT/devices.txt" | grep -q CUDA || fail "the engine sees no CUDA card"
python3 -c "import gguf; gguf.GGMLQuantizationType.TRL2" || fail "gguf-py without trellis types"


step "reference brain $HF_MODEL"
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

step "Hessians, both factors ($CHUNKS x $CTX tokens, layers over $NGPU cards)"
H=$W/hess
[ -s "$H/info.json" ] || timeout $((STEP_MIN * 60)) python3 "$TP/hess_hf.py" --model "$W/hf" --text "$TR" --out "$H" --chunks "$CHUNKS" --ctx "$CTX" \
  --devices "$NGPU" --gguf-arch qwen3 > "$OUT/hess.log" 2>&1 || { tail -5 "$OUT/hess.log"; fail hessians; }
cp "$H/info.json" "$OUT/hess-info.json"; say "hessians: $(cat "$H/info.json" | tr -d '\n ')"

LIN='(attn_(q|k|v|output)|ffn_(gate|up|down))\.weight'
q() {  # q <name> <ftype> [extra llama-quantize options]: same token table and head (q8_0) for every row
  local n=$1 f=$2; shift 2; [ -s "$W/$n.gguf" ] && return 0
  "$B/llama-quantize" --token-embedding-type q8_0 --output-tensor-type q8_0 "$@" "$REF" "$W/$n.gguf" "$f" "$JOBS" > "$OUT/quant-$n.log" 2>&1 || fail "quant $n"
}
IM=$W/imatrix.gguf
imat() { [ -s "$IM" ] || "$B/llama-imatrix" -m "$REF" -f "$TR" -o "$IM" -c "$CTX" --chunks "$CHUNKS" -ngl 99 > "$OUT/imatrix.log" 2>&1 || { tail -5 "$OUT/imatrix.log"; fail imatrix; }; }
KL=()
for k in $BITS; do
  if [ "$k" = 2 ]; then
    step "stock 2-bit rows"
    q STOCK-Q2_K Q2_K --pure; q STOCK-q2_0 Q8_0 --tensor-type "attn_(q|k|v|output)=q2_0" --tensor-type "ffn_(gate|up|down)=q2_0"
    KL+=("STOCK-Q2_K=$W/STOCK-Q2_K.gguf" "STOCK-q2_0=$W/STOCK-q2_0.gguf")
    # llama.cpp's own 2-bit files with an importance matrix from the same training text (the owner, 28 Nov: "Stock llama
    # settings?"): its usual mixes (-MIX: llama-quantize picks the type per tensor) and every linear one type (-PURE, the
    # same layout as the trellis rows). Same q8_0 token table and head as every row here, so only the linears differ.
    if [ "$STOCK_IQ" = 1 ]; then
      step "stock llama.cpp 2-bit with importance matrix"; imat
      for t in Q2_K IQ2_XXS IQ2_XS IQ2_S; do
        q "LLAMA-$t-MIX" $t --imatrix "$IM"; q "LLAMA-$t-PURE" $t --imatrix "$IM" --pure
        KL+=("LLAMA-$t-MIX=$W/LLAMA-$t-MIX.gguf" "LLAMA-$t-PURE=$W/LLAMA-$t-PURE.gguf")
      done
    fi
    step "GPTQ q2_0 (same Hessians)"
    C=$W/codes-gptq
    [ -s "$W/GPTQ-q2_0.gguf" ] || { timeout $((STEP_MIN * 60)) python3 "$P/gsq/gsq_q2.py" --model "$REF" --hess "$H" --match "$LIN" --mode gptq --out "$C" > "$OUT/gptq.log" 2>&1 &&
      python3 "$P/gsq/q2_0_patch.py" --base "$W/STOCK-q2_0.gguf" --codes "$C" --out "$W/GPTQ-q2_0.gguf" >> "$OUT/patch.log" 2>&1 || { tail -5 "$OUT/gptq.log"; fail gptq; }; }
    KL+=("GPTQ-q2_0=$W/GPTQ-q2_0.gguf"); BASE=$W/STOCK-q2_0.gguf
  else
    step "stock $k-bit row"; q STOCK-Q${k}_K Q${k}_K --pure; KL+=("STOCK-Q${k}_K=$W/STOCK-Q${k}_K.gguf"); BASE=$W/STOCK-Q${k}_K.gguf
    if [ "$STOCK_IQ" = 1 ] && [ "$k" = 3 ]; then  # llama.cpp's own 3-bit files with the importance matrix, and its Q2_K mix (2.95 bits) is beside them
      step "stock llama.cpp 3-bit with importance matrix"; imat
      for t in Q3_K_S Q3_K_M IQ3_XXS IQ3_S; do q "LLAMA-$t-MIX" $t --imatrix "$IM"; KL+=("LLAMA-$t-MIX=$W/LLAMA-$t-MIX.gguf"); done
    fi
  fi
  for row in $(for sd in $SEEDS; do echo "ldlq:0.01:$sd"; for d in $YAQA_DAMPS; do echo "yaqa:$d:$sd"; done; done); do
    m=${row%%:*}; d=${row#*:}; sd=${d#*:}; d=${d%%:*}
    M=$(echo $m | tr a-z A-Z); [ "$m" = yaqa ] && [ "$d" != 0.01 ] && M="$M-D$d"; [ "$sd" != 0 ] && M="$M-S$sd"
    C=$W/codes-trl$k-$M; LG=$OUT/trl$k-$M.log
    step "trellis $k bits, $M, linears over $NGPU cards"
    [ -s "$W/TRL$k-$M.gguf" ] || { timeout $((STEP_MIN * 60)) python3 "$TP/trl_run.py" --weights "$REF" --hess "$H" --out "$C" --bits $k --mode $m \
        --damp-out "$d" --seed "$sd" --devices "$NGPU" --match "^blk\.[0-9]+\.$LIN\$" > "$LG" 2>&1 || { tail -5 "$LG"; fail "trellis $k $M"; }
      cp "$C/report.tsv" "$OUT/report-trl$k-$M.tsv"
      grep -h "tensors in" "$LG" | while read -r l; do say "$l"; done   # where the time went: loading vs coding
      python3 "$TP/trl_write.py" --base "$BASE" --codes "$C" --out "$W/TRL$k-$M.gguf" >> "$OUT/write.log" 2>&1 || fail "write $k $M"; }
    say "TRL$k-$M: $(awk -F'\t' '{n++; s+=$7; d+=$6} END{printf "%d linears, %.0f s summed per tensor, drift estimate %.4g", n, s, d}' "$OUT/report-trl$k-$M.tsv")"
    KL+=("TRL$k-$M=$W/TRL$k-$M.gguf")
  done
done

step "sizes"
for nf in "${KL[@]}"; do N=${nf%%=*} F=${nf#*=}
  python3 - "$F" "$N" <<'PY' | tee -a "$S"
import re, sys, gguf
r = gguf.GGUFReader(sys.argv[1]); lin = re.compile(r"^blk\.\d+\.(attn_(q|k|v|output)|ffn_(gate|up|down))\.(weight|trellis_s16|trellis_pre|trellis_post)$")
b = sum(int(t.n_bytes) for t in r.tensors if lin.match(t.name)); n = sum(int(t.n_elements) for t in r.tensors if lin.match(t.name) and t.name.endswith(".weight"))
import os; print(f"{sys.argv[2]}: file {os.path.getsize(sys.argv[1]) / 1e9:.3f} GB, linears {8 * b / n:.3f} bits a weight (sides counted)")
PY
done

step "KLD against BF16 ($KLD_CHUNKS x $KLD_CTX tokens of wikitext-2 test), layers over both cards"
rm -rf "$OUT/kld"; bash "$P/kld_check.sh" "$REF" "$TE" "$OUT/kld" "$B/llama-perplexity" "${KL[@]}" > "$OUT/kld.log" 2>&1 || fail kld
cat "$OUT/kld/kld.tsv" | tee -a "$S"
step "one greedy answer each"
for nf in "${KL[@]}"; do N=${nf%%=*} F=${nf#*=}
  A=$("$B/llama-completion" -m "$F" -p "The capital of France is" -n 12 --temp 0 -no-cnv --no-display-prompt -ngl 99 2>/dev/null | tr '\n' ' ' | head -c 120)
  say "$N: The capital of France is$A"
done
step done; say "TRL DONE"
