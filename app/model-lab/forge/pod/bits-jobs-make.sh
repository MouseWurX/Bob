#!/usr/bin/env bash
# Make the improved Qwen3-4B files for Bob's real jobs (28 Nov 2026; the owner: "All new tests go").
# Four files, all the size of the usual stock imatrix Q4_K_M (2.50 GB), written to $FILES for brain-jobs-pod.sh:
#   qwen3-4b-stock.gguf    llama-quantize Q4_K_M with the imatrix (what people ship; tied head as shipped)
#   qwen3-4b-heal.gguf     stock, scale-healed on wikitext-2 train (heal_scales.py, lr 1e-4: -23% drift in rerun 2)
#   qwen3-4b-session.gguf  stock, scale-healed on the full-size brain's own agent sessions (lr 1e-4: -31% agent drift)
#   qwen3-4b-part.gguf     bits by part (part_bits.py, Fisher), head untied and squeezed inside the same whole-file size
#                          (-38% drift in the bits pilot at the untied Q4_K_M size)
# Each file's wikitext KLD against BF16 is measured too (the same 40 chunks as the pilots). Uploads nothing.
#   BOB_SHA=<commit> bash bits-jobs-make.sh   -> files in $FILES (default /workspace/bits-files), log in $OUT/summary.txt
# Env: OUT, W, FILES, CUDA=1, HF_MODEL, HF_DIR, BOB_DIR / LL_DIR / TEXT_TRAIN / TEXT_TEST / TEXT_VALID / PROMPTS (dry runs),
#      NEVER, N_SESSIONS, MAX_NEW, HEAL_HOURS, HEAL_STEPS, HEAL_LR, FISHER_CHUNKS, KLD_CHUNKS, JOBS, BOB_SHA.
# Ends with "FILES DONE" or "FILES FAILED <step>".
set -uo pipefail
OUT=${OUT:-/workspace/bits-files-log}; W=${W:-/workspace/bits-make}; FILES=${FILES:-/workspace/bits-files}; CUDA=${CUDA:-1}; JOBS=${JOBS:-$(nproc)}
HF_MODEL=${HF_MODEL:-Qwen/Qwen3-4B}; CTX=512; KLD_CHUNKS=${KLD_CHUNKS:-40}; FISHER_CHUNKS=${FISHER_CHUNKS:-128}
N_SESSIONS=${N_SESSIONS:-1200}; MAX_NEW=${MAX_NEW:-768}; HEAL_HOURS=${HEAL_HOURS:-0.5}; HEAL_STEPS=${HEAL_STEPS:-400}; HEAL_LR=${HEAL_LR:-1e-4}
BOB_BRANCH=${BOB_BRANCH:-claude/project-thread-5o1p5l}
BOB_SHA=${BOB_SHA:-}
TAG=b12359
mkdir -p "$OUT" "$W" "$FILES"; S="$OUT/summary.txt"; : > "$S"
say() { echo "$*" | tee -a "$S"; }
fail() { say "FILES FAILED $1"; exit 1; }
step() { echo "=== $(date +%H:%M:%S) $*" | tee -a "$OUT/steps.log"; }
gpu() { nvidia-smi --query-gpu=temperature.gpu,clocks.sm,memory.used --format=csv,noheader 2>/dev/null | head -1; }

step tools
command -v cmake >/dev/null && command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq cmake git build-essential >"$OUT/apt.log" 2>&1; } || fail tools
python3 -c 'import torch' 2>/dev/null || fail "torch missing (use a PyTorch image)"
pip install -q numpy sentencepiece protobuf safetensors "transformers>=4.51" huggingface_hub hf_transfer datasets >"$OUT/pip.log" 2>&1 || fail pip
nvidia-smi --query-gpu=name,memory.total,driver_version,temperature.gpu,clocks.sm,compute_cap --format=csv > "$OUT/gpu.txt" 2>&1 || true
say "card: $(tail -n +2 "$OUT/gpu.txt" | head -1)"
CMK=(-DCMAKE_BUILD_TYPE=Release -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DLLAMA_CURL=OFF -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF)
if [ "$CUDA" = 1 ]; then
  ARCH=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | head -1 | tr -d '. '); [[ "$ARCH" =~ ^[0-9]+$ ]] || fail "no compute_cap"
  CMK+=(-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=$ARCH); say "CUDA architecture: $ARCH"
fi

step "Bob $BOB_SHA + llama.cpp $TAG with Lamplight's patches"
if [ -n "${BOB_DIR:-}" ]; then say "Bob from $BOB_DIR (dry run) at $(git -C "$BOB_DIR" rev-parse HEAD)"; else
  [ -n "$BOB_SHA" ] || fail "BOB_SHA not set (the full commit of $BOB_BRANCH the kit was checked with)"
  if [ ! -d "$W/bob/.git" ] || [ "$(git -C "$W/bob" rev-parse HEAD 2>/dev/null)" != "$BOB_SHA" ]; then
    rm -rf "$W/bob"; git init -q "$W/bob" && git -C "$W/bob" remote add origin https://github.com/MouseWurX/Bob.git &&
      git -C "$W/bob" fetch -q --depth 1 origin "$BOB_SHA" && git -C "$W/bob" checkout -q FETCH_HEAD || fail bob-fetch
  fi
  [ "$(git -C "$W/bob" rev-parse HEAD)" = "$BOB_SHA" ] || fail bob-sha
  say "Bob $BOB_BRANCH at $BOB_SHA"; BOB_DIR=$W/bob
fi
POD=$BOB_DIR/app/model-lab/forge/pod
[ -n "${LL_DIR:-}" ] && ln -sfn "$LL_DIR" "$W/ll"
if [ ! -x "$W/ll/build/bin/llama-perplexity" ]; then
  rm -rf "$W/ll"; git clone -q --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp.git "$W/ll" || fail llama-clone
  for p in "$BOB_DIR"/app/engine/patches/*.patch; do git -C "$W/ll" apply "$p" >>"$OUT/patches.log" 2>&1 || fail "patch $(basename "$p")"; done
  cmake -S "$W/ll" -B "$W/ll/build" "${CMK[@]}" >"$OUT/cmake.log" 2>&1 &&
    cmake --build "$W/ll/build" -j "$JOBS" --target llama-quantize llama-perplexity llama-completion llama-imatrix llama-tokenize >"$OUT/build.log" 2>&1 || fail build
fi
B=$W/ll/build/bin; export PYTHONPATH=$W/ll/gguf-py:${PYTHONPATH:-}
say "engine: $(ls "$BOB_DIR"/app/engine/patches/*.patch | wc -l) patches on $TAG, build logged in build.log"

step "brain $HF_MODEL"
if [ -n "${HF_DIR:-}" ]; then ln -sfn "$HF_DIR" "$W/hf"; say "brain from $HF_DIR (no download)"; else
export HF_HUB_ENABLE_HF_TRANSFER=1
python3 - "$HF_MODEL" "$W/hf" > "$OUT/download.txt" 2>&1 <<'PY' || fail download
import sys
from huggingface_hub import HfApi, snapshot_download
sha = HfApi().model_info(sys.argv[1]).sha
snapshot_download(sys.argv[1], revision=sha, local_dir=sys.argv[2], allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model", "merges.txt", "vocab.json", "LICENSE"])
print(f"{sys.argv[1]} revision {sha}")
PY
say "$(tail -1 "$OUT/download.txt")"
fi
REF0=$W/ref-bf16.gguf; REF=$REF0   # the file as people convert it (a tied head stays tied): stock and the heals
[ -s "$REF0" ] || python3 "$W/ll/convert_hf_to_gguf.py" "$W/hf" --outtype ${OUTTYPE:-bf16} --outfile "$REF0" > "$OUT/convert.log" 2>&1 || fail convert
say "reference: $(stat -L -c %s "$REF") bytes"

step texts
if [ -n "${TEXT_TRAIN:-}" ]; then TR=$TEXT_TRAIN; TE=${TEXT_TEST:-$TEXT_TRAIN}; TV=${TEXT_VALID:-$TE}
else
  TR=$W/wiki-train.txt; TE=$W/wiki-test.txt; TV=$W/wiki-valid.txt
  python3 - "$W/wiki" "$TR" "$TE" "$TV" > "$OUT/texts.txt" 2>&1 <<'PY' || fail texts
import os, sys, zipfile
from huggingface_hub import hf_hub_download
os.makedirs(sys.argv[1], exist_ok=True)
z = zipfile.ZipFile(hf_hub_download("ggml-org/ci", "wikitext-2-raw-v1.zip", repo_type="dataset", local_dir=sys.argv[1]))
for split, out in (("train", sys.argv[2]), ("test", sys.argv[3]), ("valid", sys.argv[4])):
    t = z.read(f"wikitext-2-raw/wiki.{split}.raw").decode("utf-8")
    if len(t) < 100000: sys.exit(f"{split} text is only {len(t)} characters")
    open(out, "w").write(t); print(split, len(t))
PY
fi
NG=(); [ "$CUDA" = 1 ] && NG=(-ngl 99)
DEV=(); [ "$CUDA" = 1 ] || DEV=(--device cpu)
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

step "imatrix and stock Q4_K_M"
IM=$W/imatrix.gguf; STOCK=$FILES/qwen3-4b-stock.gguf
[ -s "$IM" ] || "$B/llama-imatrix" -m "$REF0" -f "$TR" -o "$IM" -c $CTX --chunks 128 --process-output "${NG[@]}" > "$OUT/imatrix.log" 2>&1 || fail imatrix
[ -s "$STOCK" ] || "$B/llama-quantize" --imatrix "$IM" "$REF0" "$STOCK" Q4_K_M "$JOBS" > "$OUT/quant-stock.log" 2>&1 || fail "quant stock"
KB=$W/base.kld
[ -s "$KB" ] || "$B/llama-perplexity" -m "$REF0" -f "$TE" -c $CTX --chunks "$KLD_CHUNKS" --kl-divergence-base "$KB" "${NG[@]}" > "$OUT/kld-base.log" 2>&1 || fail kld-base
printf 'file\tbytes\tmean_kld\tsame_top_pct\tsha256\n' > "$OUT/files.tsv"
kld() {   # kld <name> <path>
  "$B/llama-perplexity" -m "$2" -f "$TE" -c $CTX --chunks "$KLD_CHUNKS" --kl-divergence-base "$KB" --kl-divergence "${NG[@]}" > "$OUT/kld-$1.log" 2>&1 || { say "$1: KLD FAILED (see kld-$1.log)"; return 1; }
  local K T H; K=$(grep -oP 'Mean\s+KLD:\s+\K[-0-9.]+' "$OUT/kld-$1.log"); T=$(grep -oP 'Same top p:\s+\K[0-9.]+' "$OUT/kld-$1.log"); H=$(sha256sum "$2" | awk '{print $1}')
  printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$(stat -L -c %s "$2")" "$K" "$T" "$H" >> "$OUT/files.tsv"
  say "$1: wikitext KLD $K, same top $T%, $(stat -L -c %s "$2") bytes, sha256 $H   [GPU $(gpu)]"
}
kld stock "$STOCK" || fail "kld stock"

step "bits by part [GPU $(gpu)]"
REFU=$W/ref-untied-bf16.gguf; PART=$FILES/qwen3-4b-part.gguf
if [ ! -s "$REFU" ]; then
  if python3 -c "import sys,gguf; r=gguf.GGUFReader(sys.argv[1]); sys.exit(0 if any(t.name=='output.weight' for t in r.tensors) else 1)" "$REF0"
  then ln -sf "$REF0" "$REFU"; else python3 "$POD/word_bands.py" untie --gguf "$REF0" --out "$REFU" > "$OUT/untie.log" 2>&1 || fail untie; fi
fi
CANDS=(); for T in iq2_xxs iq2_s q2_k iq3_xxs q3_k iq4_xs q4_k q5_k q6_k q8_0; do
  F=$W/cand-$T.gguf
  [ -s "$F" ] || "$B/llama-quantize" --pure --token-embedding-type q6_k --imatrix "$IM" "$REFU" "$F" "${T^^}" "$JOBS" > "$OUT/quant-$T.log" 2>&1 || fail "quant $T"
  CANDS+=(--cand "$F")
done
# The budget is the shipped stock file's tensors except the word table, so the untied head has to fit inside it too:
# the whole file comes out the size of the stock file people download.
BUDGET=$(python3 -c "import sys,numpy as np,gguf; r=gguf.GGUFReader(sys.argv[1]); print(sum(int(np.asarray(t.data).nbytes) for t in r.tensors if len(t.shape)>=2 and t.name!='token_embd.weight'))" "$STOCK")
ET=$(python3 -c "import sys,gguf; r=gguf.GGUFReader(sys.argv[1]); print(next(t.tensor_type.name.lower() for t in r.tensors if t.name=='token_embd.weight'))" "$STOCK")
say "part budget: $BUDGET bytes without the word table (kept $ET, as in the stock file)"
[ -s "$W/part.types" ] || python3 "$POD/part_bits.py" --teacher "$W/hf" --calib "$TR" --chunks "$FISHER_CHUNKS" --ctx $CTX --base "$REFU" "${CANDS[@]}" \
    --target-bytes "$BUDGET" --exclude-type "$ET" --llama-cpp "$W/ll" --out "$W/part.types" --report "$OUT/part.json" > "$OUT/part.log" 2>&1 || fail part_bits
[ -s "$PART" ] || "$B/llama-quantize" --imatrix "$IM" --tensor-type-file "$W/part.types" "$REFU" "$PART" Q4_K "$JOBS" > "$OUT/quant-part.log" 2>&1 || fail "quant part"
kld part "$PART" || fail "kld part"
rm -f "$W"/cand-*.gguf "$REFU"   # disk

step "the full-size brain writes its sessions [GPU $(gpu)]"
SE=$W/sessions.jsonl
PR=(); [ -n "${PROMPTS:-}" ] && PR=(--prompts "$PROMPTS"); [ -n "${NEVER:-}" ] && PR+=(--never $NEVER)
[ -s "$SE" ] || python3 "$POD/agent_sessions.py" --teacher "$W/hf" --out "$SE" --n "$N_SESSIONS" --max-new "$MAX_NEW" "${PR[@]}" "${DEV[@]}" > "$OUT/sessions.log" 2>&1 || fail sessions
cp "${SE%.jsonl}-report.json" "$OUT/sessions-report.json"

step "healing [GPU $(gpu)]"
for ARM in heal session; do
  F=$FILES/qwen3-4b-$ARM.gguf
  if [ $ARM = heal ]; then IN=(--calib "$TR"); else IN=(--sessions "$SE" --eval-text "$TV" --chunks 5000); fi
  [ -s "$F" ] || python3 "$POD/heal_scales.py" --teacher "$W/hf" --gguf "$STOCK" "${IN[@]}" --out "$F" --llama-cpp "$W/ll" \
      --lr "$HEAL_LR" --norm-lr "$HEAL_LR" --hours "$HEAL_HOURS" --steps "$HEAL_STEPS" "${DEV[@]}" --report "$OUT/heal-$ARM.json" > "$OUT/heal-$ARM.log" 2>&1
  rc=$?
  if [ -s "$F" ]; then kld $ARM "$F"
  elif [ $rc -ne 0 ]; then say "$ARM: heal CRASHED (exit $rc): $(grep -E '^[A-Za-z_.]*(Error|Exception)' "$OUT/heal-$ARM.log" | tail -1 | head -c 160)"
  else say "$ARM: no step beat the start, no file"; fi
done
ls -la "$FILES" >> "$OUT/steps.log"
say "FILES DONE"
