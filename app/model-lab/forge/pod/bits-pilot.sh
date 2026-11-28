#!/usr/bin/env bash
# Bits pilot rental (27 Nov 2026): do NariQ's two ideas, ported to stock GGUF types, cut drift at the same file size?
# the owner: "Bits by word and bits by part, interesting, we should try it too" (27 Nov).
# One brain (default Qwen/Qwen3-4B, Bob's 6 GB default) and two budgets: the counted tensors of a stock imatrix Q3_K_M
# (~3.9 bits) and of a stock imatrix Q4_K_M (~4.9 bits). At each budget, every file below gets exactly those bytes:
#   STOCK-imatrix  llama-quantize Q3_K_M / Q4_K_M with the imatrix (what people ship)
#   MIX            mixed_bits.py (rounding error weighted by the imatrix, the old greedy pick)
#   PART-IMAT      part_bits.py --loss imatrix (the same measure, the new exact-size pick)
#   PART           part_bits.py --loss fisher: bits by part (drift estimate from the brain's own gradients)
#   PART-WORD      the same with --bands 16: bits by part and bits by word in one budget (needs Lamplight 0150)
#   WORD           STOCK with its head cut into 16 bands, the same head size (word counts, no teacher; needs 0150)
# At the 4-bit budget, also the other 4-bit files people ship (their own sizes: see the bytes column): Q4_K_M without
# the imatrix, IQ4_XS, IQ4_NL, Q4_K_S, Q5_K_S, MXFP4_MOE (if llama-quantize takes it for this brain), an Unsloth dynamic
# file when UD_REPO and UD_FILE are set, and scale-healed STOCK and PART (heal_scales.py, PR #352).
# Scored by KLD against the BF16 brain on wikitext-2 test (same text and positions for every file), and one greedy
# answer each. Calibration text is wikitext-2 train (never the test text, never Bob's held-out jobs, never Claude's text).
# One NVIDIA pod, 48 GB card (the Fisher sums need 4 bytes a weight on the card), CUDA devel image with PyTorch,
# ~80 GB disk, internet to GitHub + Hugging Face (public, no keys).
#   bash bits-pilot.sh   -> results in $OUT (default /workspace/bits-results), summary in $OUT/summary.txt
# Env: OUT, W, CUDA=1 (0 = processor-only dry run), HF_MODEL, HF_DIR (a local HF folder: no download), BOB_DIR / LL_DIR
#      (local Bob checkout / built patched llama.cpp, dry runs only), TEXT_TRAIN / TEXT_TEST (skip the wikitext download),
#      UD_REPO + UD_FILE,
#      FISHER_CHUNKS (default 128 x 512 tokens), KLD_CHUNKS (default 40), BANDS (16), JOBS, BOB_SHA, BOB_BRANCH.
# Uploads nothing. Ends with "BITS DONE" (or "BITS FAILED <step>") in summary.txt.
set -uo pipefail
OUT=${OUT:-/workspace/bits-results}; W=${W:-/workspace/bits}; CUDA=${CUDA:-1}; JOBS=${JOBS:-$(nproc)}
HF_MODEL=${HF_MODEL:-Qwen/Qwen3-4B}; FISHER_CHUNKS=${FISHER_CHUNKS:-128}; CTX=512; KLD_CHUNKS=${KLD_CHUNKS:-40}; BANDS=${BANDS:-16}
BOB_BRANCH=${BOB_BRANCH:-claude/project-thread-5o1p5l}
BOB_SHA=${BOB_SHA:-}
TAG=b12359
mkdir -p "$OUT" "$W"; S="$OUT/summary.txt"; : > "$S"
say() { echo "$*" | tee -a "$S"; }
fail() { say "BITS FAILED $1"; exit 1; }
step() { echo "=== $(date +%H:%M:%S) $*" | tee -a "$OUT/steps.log"; }
gpu() { nvidia-smi --query-gpu=temperature.gpu,clocks.sm,memory.used --format=csv,noheader 2>/dev/null | head -1; }

step tools
command -v cmake >/dev/null && command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq cmake git build-essential >"$OUT/apt.log" 2>&1; } || fail tools
python3 -c 'import torch' 2>/dev/null || fail "torch missing (use a PyTorch image)"
pip install -q numpy sentencepiece protobuf safetensors "transformers>=4.51" huggingface_hub hf_transfer >"$OUT/pip.log" 2>&1 || fail pip
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
REF0=$W/ref-bf16.gguf; REF=$W/ref-untied-bf16.gguf
[ -s "$REF0" ] || python3 "$W/ll/convert_hf_to_gguf.py" "$W/hf" --outtype ${OUTTYPE:-bf16} --outfile "$REF0" > "$OUT/convert.log" 2>&1 || fail convert
if [ ! -s "$REF" ]; then   # a tied head gets its own output.weight, so it can be squeezed and banded on its own
  if python3 -c "import sys,gguf; r=gguf.GGUFReader(sys.argv[1]); sys.exit(0 if any(t.name=='output.weight' for t in r.tensors) else 1)" "$REF0"
  then ln -sf "$REF0" "$REF"; else python3 "$POD/word_bands.py" untie --gguf "$REF0" --out "$REF" > "$OUT/untie.log" 2>&1 || fail untie; fi
fi
say "reference: $(stat -L -c %s "$REF") bytes"

step texts
if [ -n "${TEXT_TRAIN:-}" ]; then TR=$TEXT_TRAIN; TE=${TEXT_TEST:-$TEXT_TRAIN}
else
  TR=$W/wiki-train.txt; TE=$W/wiki-test.txt
  python3 - "$W/wiki" "$TR" "$TE" > "$OUT/texts.txt" 2>&1 <<'PY' || fail texts
import os, sys, zipfile
from huggingface_hub import hf_hub_download
os.makedirs(sys.argv[1], exist_ok=True)
z = zipfile.ZipFile(hf_hub_download("ggml-org/ci", "wikitext-2-raw-v1.zip", repo_type="dataset", local_dir=sys.argv[1]))
for split, out in (("train", sys.argv[2]), ("test", sys.argv[3])):
    t = z.read(f"wikitext-2-raw/wiki.{split}.raw").decode("utf-8")
    if len(t) < 100000: sys.exit(f"{split} text is only {len(t)} characters")
    open(out, "w").write(t); print(split, len(t))
PY
fi
NG=(); [ "$CUDA" = 1 ] && NG=(-ngl 99)

step "imatrix"
IM=$W/imatrix.gguf
[ -s "$IM" ] || "$B/llama-imatrix" -m "$REF" -f "$TR" -o "$IM" -c $CTX --chunks 128 --process-output "${NG[@]}" > "$OUT/imatrix.log" 2>&1 || fail imatrix

step "candidates (one stock type each, with the imatrix) and STOCK Q3_K_M"
CANDS=(); for T in iq2_xxs iq2_s q2_k iq3_xxs q3_k iq4_xs q4_k q5_k q6_k q8_0; do
  F=$W/cand-$T.gguf
  [ -s "$F" ] || "$B/llama-quantize" --pure --token-embedding-type q6_k --imatrix "$IM" "$REF" "$F" "${T^^}" "$JOBS" > "$OUT/quant-$T.log" 2>&1 || fail "quant $T"
  CANDS+=(--cand "$F")
done
"$B/llama-tokenize" -m "$REF" -f "$TR" --ids --log-disable --no-bos > "$W/train-ids.txt" 2>/dev/null || fail tokenize
python3 - "$W/train-ids.txt" "$W/counts.json" <<'PY' || fail counts
import json, re, sys, collections
ids = [int(x) for x in re.findall(r'\d+', open(sys.argv[1]).read())]
json.dump({str(k): v for k, v in collections.Counter(ids).items()}, open(sys.argv[2], 'w')); print(len(ids))
PY
KB=$W/base.kld
[ -s "$KB" ] || "$B/llama-perplexity" -m "$REF0" -f "$TE" -c $CTX --chunks "$KLD_CHUNKS" --kl-divergence-base "$KB" "${NG[@]}" > "$OUT/kld-base.log" 2>&1 || fail kld-base
printf 'budget\tfile\tbytes\tmean_kld\tsame_top_pct\n' > "$OUT/kld.tsv"
FILES=()
kld() {   # kld <budget name> <file name> <path>
  "$B/llama-perplexity" -m "$3" -f "$TE" -c $CTX --chunks "$KLD_CHUNKS" --kl-divergence-base "$KB" --kl-divergence "${NG[@]}" > "$OUT/kld-$1-$2.log" 2>&1 || { say "$1 $2: KLD FAILED (see kld-$1-$2.log)"; return; }
  local K T; K=$(grep -oP 'Mean\s+KLD:\s+\K[-0-9.]+' "$OUT/kld-$1-$2.log"); T=$(grep -oP 'Same top p:\s+\K[0-9.]+' "$OUT/kld-$1-$2.log")
  printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$(stat -L -c %s "$3")" "$K" "$T" >> "$OUT/kld.tsv"
  say "$1 $2: KLD $K, same top $T%, $(stat -L -c %s "$3") bytes   [GPU $(gpu)]"; FILES+=("$1-$2=$3")
}
heal() {  # heal <in> <out>: scale healing (PR #352), only if it lowers drift; prints the file to score or nothing
  [ -s "$2" ] || python3 "$POD/heal_scales.py" --teacher "$W/hf" --gguf "$1" --calib "$TR" --out "$2" --llama-cpp "$W/ll" --hours 0.5 \
      --report "$OUT/heal-$(basename "$2" .gguf).json" > "$OUT/heal-$(basename "$2" .gguf).log" 2>&1
  [ -s "$2" ] && echo "$2"
}

# Two budgets: about 3.9 bits (the size of a stock imatrix Q3_K_M) and about 4.9 bits (a stock imatrix Q4_K_M), the 4-bit
# question (the owner, 27 Nov: "the standard 4 bit quant is pretty lossy. There might be other better 4 bit quants").
for BN in Q3_K_M Q4_K_M; do
  step "budget $BN"
  STOCK=$W/$BN-imat.gguf
  [ -s "$STOCK" ] || "$B/llama-quantize" --imatrix "$IM" "$REF" "$STOCK" $BN "$JOBS" > "$OUT/quant-$BN.log" 2>&1 || fail "quant $BN"
  BUDGET=$(python3 -c "import sys,numpy as np,gguf; r=gguf.GGUFReader(sys.argv[1]); print(sum(int(np.asarray(t.data).nbytes) for t in r.tensors if len(t.shape)>=2 and t.name!='token_embd.weight'))" "$STOCK")
  NW=$(python3 -c "import sys,numpy as np,gguf; r=gguf.GGUFReader(sys.argv[1]); print(sum(int(np.prod([int(x) for x in t.shape])) for t in r.tensors if len(t.shape)>=2 and t.name!='token_embd.weight'))" "$STOCK")
  BPW=$(python3 -c "print(round(8*$BUDGET/$NW, 4))")
  ET=$(python3 -c "import sys,gguf; r=gguf.GGUFReader(sys.argv[1]); print(next(t.tensor_type.name.lower() for t in r.tensors if t.name=='token_embd.weight'))" "$STOCK")
  say "budget $BN: $BUDGET bytes, $BPW bits a weight; the word table stays $ET as in the stock file, so whole files match in size"
  kld $BN STOCK-imatrix "$STOCK"
  if [ $BN = Q4_K_M ]; then   # other 4-bit files people ship, for the comparison (sizes differ: see the bytes column)
    [ -s "$W/Q4_K_M-plain.gguf" ] || "$B/llama-quantize" "$REF" "$W/Q4_K_M-plain.gguf" Q4_K_M "$JOBS" > "$OUT/quant-Q4_K_M-plain.log" 2>&1 || fail "quant Q4_K_M plain"
    kld $BN STOCK-no-imatrix "$W/Q4_K_M-plain.gguf"
    for T in IQ4_XS IQ4_NL Q4_K_S Q5_K_S MXFP4_MOE; do   # MXFP4_MOE squeezes only experts: on a dense brain it is mostly Q8_0
      [ -s "$W/$T.gguf" ] || "$B/llama-quantize" --imatrix "$IM" "$REF" "$W/$T.gguf" $T "$JOBS" > "$OUT/quant-$T.log" 2>&1 || { say "$T: llama-quantize refused (see quant-$T.log)"; continue; }
      kld $BN $T "$W/$T.gguf"
    done
    if [ -n "${UD_REPO:-}" ]; then   # an Unsloth dynamic file of the same brain, e.g. UD_REPO=unsloth/Qwen3-4B-GGUF UD_FILE=Qwen3-4B-UD-Q4_K_XL.gguf
      python3 -c "import sys; from huggingface_hub import hf_hub_download as d; print(d(sys.argv[1], sys.argv[2], local_dir=sys.argv[3]))" "$UD_REPO" "$UD_FILE" "$W/ud" > "$OUT/ud.txt" 2>&1 &&
        kld $BN UD "$(tail -1 "$OUT/ud.txt")" || say "UD download failed (see ud.txt)"
    fi
  fi
  T0=$BN-MIX; [ -s "$W/$T0.types" ] || python3 "$POD/mixed_bits.py" --base "$REF" --imatrix "$IM" "${CANDS[@]}" --target-bpw "$BPW" --exclude-type "$ET" --out "$W/$T0.types" > "$OUT/$T0.log" 2>&1 || fail $T0
  T0=$BN-PART-IMAT; [ -s "$W/$T0.types" ] || python3 "$POD/part_bits.py" --loss imatrix --imatrix "$IM" --base "$REF" "${CANDS[@]}" --target-bytes "$BUDGET" --exclude-type "$ET" --out "$W/$T0.types" --report "$OUT/$T0.json" > "$OUT/$T0.log" 2>&1 || fail $T0
  step "$BN: Fisher picks [GPU $(gpu)]"
  T0=$BN-PART; [ -s "$W/$T0.types" ] || python3 "$POD/part_bits.py" --teacher "$W/hf" --calib "$TR" --chunks "$FISHER_CHUNKS" --ctx $CTX --fisher-cache "$W/fisher.npz" --base "$REF" "${CANDS[@]}" --target-bytes "$BUDGET" --exclude-type "$ET" --llama-cpp "$W/ll" --out "$W/$T0.types" --report "$OUT/$T0.json" > "$OUT/$T0.log" 2>&1 || fail $T0
  T0=$BN-PART-WORD; [ -s "$W/$T0.types" ] || python3 "$POD/part_bits.py" --teacher "$W/hf" --calib "$TR" --chunks "$FISHER_CHUNKS" --ctx $CTX --fisher-cache "$W/fisher.npz" --bands "$BANDS" --base "$REF" "${CANDS[@]}" --target-bytes "$BUDGET" --exclude-type "$ET" --llama-cpp "$W/ll" --out "$W/$T0.types" --report "$OUT/$T0.json" > "$OUT/$T0.log" 2>&1 || fail $T0
  for N in MIX PART-IMAT PART PART-WORD; do
    F=$W/$BN-$N.gguf
    [ -s "$F" ] || "$B/llama-quantize" --imatrix "$IM" --tensor-type-file "$W/$BN-$N.types" "$REF" "$F" Q4_K "$JOBS" > "$OUT/quant-$BN-$N.log" 2>&1 || fail "quant $BN $N"
  done
  python3 "$POD/word_bands.py" apply --gguf "$W/$BN-PART-WORD.gguf" --plan "$W/$BN-PART-WORD-bands.json" "${CANDS[@]}" --out "$W/$BN-PART-WORD-banded.gguf" > "$OUT/apply-$BN-part-word.log" 2>&1 || fail "apply $BN part-word"
  HEADT=$(python3 -c "import sys,gguf; r=gguf.GGUFReader(sys.argv[1]); print(next(t.tensor_type.name.lower() for t in r.tensors if t.name=='output.weight'))" "$STOCK")
  python3 "$POD/word_bands.py" plan --base "$REF" "${CANDS[@]}" --imatrix "$IM" --counts "$W/counts.json" --bands "$BANDS" --same-as "$HEADT" --out "$W/$BN-WORD-plan.json" > "$OUT/$BN-word-plan.log" 2>&1 || fail "word plan $BN"
  python3 "$POD/word_bands.py" apply --gguf "$STOCK" --plan "$W/$BN-WORD-plan.json" "${CANDS[@]}" --out "$W/$BN-WORD.gguf" > "$OUT/apply-$BN-word.log" 2>&1 || fail "apply $BN word"
  say "$BN WORD: head $HEADT -> $(python3 -c "import json,sys; p=json.load(open(sys.argv[1])); print(' '.join(f\"{b['words']}:{b['type']}\" for b in p['bands']))" "$W/$BN-WORD-plan.json")"
  kld $BN MIX "$W/$BN-MIX.gguf"; kld $BN PART-IMAT "$W/$BN-PART-IMAT.gguf"; kld $BN PART "$W/$BN-PART.gguf"
  kld $BN PART-WORD "$W/$BN-PART-WORD-banded.gguf"; kld $BN WORD "$W/$BN-WORD.gguf"
  if [ $BN = Q4_K_M ]; then   # scale healing (frozen codes, only scales and norms move) on the stock file and on bits by part
    step "$BN: scale healing [GPU $(gpu)]"
    H=$(heal "$STOCK" "$W/$BN-STOCK-healed.gguf"); [ -n "$H" ] && kld $BN STOCK-imatrix-healed "$H" || say "$BN STOCK: healing did not lower drift"
    H=$(heal "$W/$BN-PART.gguf" "$W/$BN-PART-healed.gguf"); [ -n "$H" ] && kld $BN PART-healed "$H" || say "$BN PART: healing did not lower drift"
  fi
done

step "one greedy answer each"
for nf in "${FILES[@]}"; do
  N=${nf%%=*} F=${nf#*=}
  A=$("$B/llama-completion" -m "$F" -p "The capital of France is" -n 12 --temp 0 -no-cnv --no-display-prompt "${NG[@]}" 2>/dev/null | tr '\n' ' ' | head -c 120)
  say "$N: The capital of France is$A"
done
cp "$W"/*.types "$W"/*-bands.json "$W"/*-WORD-plan.json "$OUT/" 2>/dev/null
say "BITS DONE"
