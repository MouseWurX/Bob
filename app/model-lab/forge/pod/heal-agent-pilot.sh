#!/usr/bin/env bash
# Agent-session healing pilot rental (27 Nov 2026). Does healing a squeezed brain on its OWN agent sessions beat healing
# it on wikitext? the owner: "I think healing on agent sessions is fine" (27 Nov, NariQ thread).
# One brain (default Qwen/Qwen3-4B, Bob's 6 GB default), its stock imatrix Q4_K_M, and three files of exactly that size
# (healing changes only scale bytes and norms; every code stays the same):
#   STOCK          llama-quantize Q4_K_M with the imatrix (what people ship)
#   TEXT-healed    heal_scales.py on wikitext-2 train (the PR #352 heal, as in the bits pilot)
#   SESSION-healed heal_scales.py --sessions: the full-size brain's own replies to public tool, code and general tasks
#                  (agent_sessions.py: hermes-function-calling-v1, MBPP, dolly-15k), about 70:30 agent to general,
#                  scoring only the tokens the brain wrote
# Both heals get the same steps and time, each at two step sizes (HEAL_LRS). Every heal holds back a slice of its practice
# set, checks it every 50 steps and keeps its best step, so a heal is never worse than where it started. (First pilot,
# 27 Nov: the wikitext heal ran out of card memory at 4 x 512 tokens, now one chunk at a time; the session heal at the old
# step size 1e-3 overshot, drift 0.040 -> 0.118, and nothing was written.)
# Scored three ways, the same for every file:
#   - KLD against the BF16 brain on wikitext-2 test (llama-perplexity, as in the bits pilot)
#   - drift on the held-apart sessions (agent and general apart) and on wikitext-2 validation (heal_scales.py --measure)
#   - tool calls on held-apart public tool tasks: well formed, a known tool, the same call as BF16 (tool_check.py)
# Bob's held-out jobs are never used here (they are the real test, run after on the winner). No Claude-written text.
# One NVIDIA pod, 48 GB card, CUDA devel image with PyTorch, ~60 GB disk, internet to GitHub + Hugging Face (public, no keys).
#   BOB_SHA=<commit> bash heal-agent-pilot.sh   -> results in $OUT (default /workspace/heal-agent-results)
# Env: OUT, W, CUDA=1 (0 = processor-only dry run), HF_MODEL, HF_DIR, BOB_DIR / LL_DIR (dry runs), TEXT_TRAIN / TEXT_TEST /
#      TEXT_VALID, PROMPTS (a task jsonl instead of the public downloads: dry runs), N_SESSIONS (1200), MAX_NEW (768),
#      NEVER (Bob's never-taught files, copied from the PC: matching tasks are dropped), HEAL_HOURS (0.5 per heal), HEAL_STEPS (400), HEAL_LRS ("1e-4 3e-4": each arm at each step size), HEAL_ARMS ("TEXT SESSION"), KLD_CHUNKS (40), TOOL_N (40), KEEP_DIR (copy the files there for a
#      real-jobs run, e.g. the network volume; default: not kept), JOBS, BOB_SHA, BOB_BRANCH.
# Uploads nothing. Ends with "HEAL DONE" (or "HEAL FAILED <step>") in summary.txt.
set -uo pipefail
OUT=${OUT:-/workspace/heal-agent-results}; W=${W:-/workspace/heal-agent}; CUDA=${CUDA:-1}; JOBS=${JOBS:-$(nproc)}
HF_MODEL=${HF_MODEL:-Qwen/Qwen3-4B}; CTX=512; KLD_CHUNKS=${KLD_CHUNKS:-40}
N_SESSIONS=${N_SESSIONS:-1200}; MAX_NEW=${MAX_NEW:-768}; HEAL_HOURS=${HEAL_HOURS:-0.5}; HEAL_STEPS=${HEAL_STEPS:-400}; HEAL_LRS=${HEAL_LRS:-"1e-4 3e-4"}; HEAL_ARMS=${HEAL_ARMS:-"TEXT SESSION"}; TOOL_N=${TOOL_N:-40}
BOB_BRANCH=${BOB_BRANCH:-claude/project-thread-5o1p5l}
BOB_SHA=${BOB_SHA:-}
TAG=b12359
mkdir -p "$OUT" "$W"; S="$OUT/summary.txt"; : > "$S"
say() { echo "$*" | tee -a "$S"; }
fail() { say "HEAL FAILED $1"; exit 1; }
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
    cmake --build "$W/ll/build" -j "$JOBS" --target llama-quantize llama-perplexity llama-completion llama-imatrix >"$OUT/build.log" 2>&1 || fail build
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
REF0=$W/ref-bf16.gguf; REF=$REF0   # the file as people convert it (a tied head stays tied)
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
NG=(); [ "$CUDA" = 1 ] && NG=(-ngl 99); NGL=0; [ "$CUDA" = 1 ] && NGL=99
DEV=(); [ "$CUDA" = 1 ] || DEV=(--device cpu)

step "imatrix and STOCK Q4_K_M"
IM=$W/imatrix.gguf; STOCK=$W/Q4_K_M-imat.gguf
[ -s "$IM" ] || "$B/llama-imatrix" -m "$REF" -f "$TR" -o "$IM" -c $CTX --chunks 128 --process-output "${NG[@]}" > "$OUT/imatrix.log" 2>&1 || fail imatrix
[ -s "$STOCK" ] || "$B/llama-quantize" --imatrix "$IM" "$REF" "$STOCK" Q4_K_M "$JOBS" > "$OUT/quant-Q4_K_M.log" 2>&1 || fail "quant Q4_K_M"
KB=$W/base.kld
[ -s "$KB" ] || "$B/llama-perplexity" -m "$REF0" -f "$TE" -c $CTX --chunks "$KLD_CHUNKS" --kl-divergence-base "$KB" "${NG[@]}" > "$OUT/kld-base.log" 2>&1 || fail kld-base
printf 'file\tbytes\tmean_kld\tsame_top_pct\n' > "$OUT/kld.tsv"
FILES=()
kld() {   # kld <name> <path>
  "$B/llama-perplexity" -m "$2" -f "$TE" -c $CTX --chunks "$KLD_CHUNKS" --kl-divergence-base "$KB" --kl-divergence "${NG[@]}" > "$OUT/kld-$1.log" 2>&1 || { say "$1: KLD FAILED (see kld-$1.log)"; return; }
  local K T; K=$(grep -oP 'Mean\s+KLD:\s+\K[-0-9.]+' "$OUT/kld-$1.log"); T=$(grep -oP 'Same top p:\s+\K[0-9.]+' "$OUT/kld-$1.log")
  printf '%s\t%s\t%s\t%s\n' "$1" "$(stat -L -c %s "$2")" "$K" "$T" >> "$OUT/kld.tsv"
  say "$1: wikitext KLD $K, same top $T%, $(stat -L -c %s "$2") bytes   [GPU $(gpu)]"; FILES+=("$1=$2")
}
kld STOCK "$STOCK"

step "the full-size brain writes its sessions [GPU $(gpu)]"
SE=$W/sessions.jsonl
PR=(); [ -n "${PROMPTS:-}" ] && PR=(--prompts "$PROMPTS"); [ -n "${NEVER:-}" ] && PR+=(--never $NEVER)
[ -s "$SE" ] || python3 "$POD/agent_sessions.py" --teacher "$W/hf" --out "$SE" --n "$N_SESSIONS" --max-new "$MAX_NEW" "${PR[@]}" "${DEV[@]}" > "$OUT/sessions.log" 2>&1 || fail sessions
cp "${SE%.jsonl}-report.json" "$OUT/sessions-report.json"
say "sessions: $(python3 -c "import json,sys; r=json.load(open(sys.argv[1])); print(f\"{r['rows']} rows, {r['agent_rows']} agent, {r['tool_call_rows_with_a_call']} tool tasks answered with a call, {r['seconds']} s\")" "$OUT/sessions-report.json")"

step "healing: wikitext, then the brain's own sessions [GPU $(gpu)]"
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
heal_arm() {  # heal_arm <TEXT|SESSION> <lr>: one heal; scores the file if healing kept a better step, else says why not
  local N=$1-healed-lr$2 F=$W/Q4_K_M-$1-healed-lr$2.gguf IN
  if [ $1 = TEXT ]; then IN=(--calib "$TR"); else IN=(--sessions "$SE" --eval-text "$TV" --chunks 5000); fi
  [ -s "$F" ] || python3 "$POD/heal_scales.py" --teacher "$W/hf" --gguf "$STOCK" "${IN[@]}" --out "$F" --llama-cpp "$W/ll" \
      --lr "$2" --norm-lr "$2" --hours "$HEAL_HOURS" --steps "$HEAL_STEPS" "${DEV[@]}" --report "$OUT/heal-$N.json" > "$OUT/heal-$N.log" 2>&1
  local rc=$?
  if [ -s "$F" ]; then kld "$N" "$F"
  elif [ $rc -ne 0 ]; then say "$N: heal CRASHED (exit $rc): $(grep -E '^[A-Za-z_.]*(Error|Exception)' "$OUT/heal-$N.log" | tail -1 | head -c 160)"
  else say "$N: no step beat the start, no file ($(grep -m1 '^keeping step' "$OUT/heal-$N.log"))"; fi
}
for LR in $HEAL_LRS; do for ARM in $HEAL_ARMS; do heal_arm "$ARM" "$LR"; done; done

step "drift on the held-apart sessions and wikitext validation"
printf 'file\tsessions_kl\tagent_kl\tgeneral_kl\tsessions_same_top\twiki_valid_kl\n' > "$OUT/sessions-drift.tsv"
for nf in "${FILES[@]}"; do
  N=${nf%%=*} F=${nf#*=}
  python3 "$POD/heal_scales.py" --teacher "$W/hf" --gguf "$F" --sessions "$SE" --eval-text "$TV" --llama-cpp "$W/ll" --measure "${DEV[@]}" \
      --report "$OUT/measure-$N.json" > "$OUT/measure-$N.log" 2>&1 || { say "$N: measure failed (see measure-$N.log)"; continue; }
  python3 - "$OUT/measure-$N.json" "$N" >> "$OUT/sessions-drift.tsv" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))['drift']; b = d.get('by_kind', {})
print('\t'.join([sys.argv[2], f"{d['kl_topk']:.5f}", f"{b.get('agent', float('nan')):.5f}", f"{b.get('general', float('nan')):.5f}",
                 f"{100 * d['same_top']:.2f}", f"{d['text']['kl_topk']:.5f}" if 'text' in d else '']))
PY
  say "$N sessions/wiki-valid: $(tail -1 "$OUT/sessions-drift.tsv" | cut -f2-)"
done

step "tool calls on held-apart public tool tasks"
FA=(); for nf in "${FILES[@]}"; do FA+=(--file "$nf"); done
python3 "$POD/tool_check.py" --sessions "$SE" --teacher "$W/hf" --llama-bin "$B" --ref "$REF0" "${FA[@]}" --n "$TOOL_N" --ngl $NGL \
    --out "$OUT/tool-check.json" > "$OUT/tool-check.log" 2>&1 || say "tool check failed (see tool-check.log)"
[ -s "$OUT/tool-check.json" ] && say "tool calls: $(python3 -c "import json,sys; r=json.load(open(sys.argv[1])); print(f\"{r['tasks']} tasks, BF16 called {r['ref_calls']}; \" + '; '.join(f\"{k} {v['well_formed']} well formed, {v['known_tool']} known tool, {v['same_call_as_full_size']} same as BF16\" for k, v in r['files'].items()))" "$OUT/tool-check.json")"

if [ -n "${KEEP_DIR:-}" ]; then
  mkdir -p "$KEEP_DIR" && for nf in "${FILES[@]}"; do cp "${nf#*=}" "$KEEP_DIR/qwen3-4b-${nf%%=*}.gguf"; done && say "files kept in $KEEP_DIR for a real-jobs run"
fi
step "one greedy answer each"
for nf in "${FILES[@]}"; do
  N=${nf%%=*} F=${nf#*=}
  A=$("$B/llama-completion" -m "$F" -p "The capital of France is" -n 12 --temp 0 -no-cnv --no-display-prompt "${NG[@]}" 2>/dev/null | tr '\n' ' ' | head -c 120)
  say "$N: The capital of France is$A"
done
say "HEAL DONE"
