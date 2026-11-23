#!/usr/bin/env bash
# Brain Engine 0090/0091 check on a real Inkling 2 Mini, for a rented Linux NVIDIA card (not npc). It compares Brain Engine
# with upstream llama.cpp (which has Inkling 2 Mini with the #32704 and #32807 fixes) on the same Mainline GGUF:
#   1. the brain loads in both and answers a short and a long prompt (over 96 tokens: upstream #32778 gave all '?')
#   2. the same greedy words and close perplexity, every expert on the card
#   3. experts in RAM (--n-cpu-moe): no NaN (upstream #32710), the same words as on the card
#   4. Brain Engine's MoE cache (--moe-cache-mib) with misses on the card and half on the processor: the same words
#   5. a 16 GB card's budget: --fit with 15.5 GB (16 GB less the 512 MB margin) and its peak card memory
#   6. DSpark guess-ahead (0092, Unsloth's dspark-Inkling-2-Mini-Q8_0 drafter), the guesses picked on the card and on the
#      host: the same greedy words as without it, how many guesses are kept, and the words a second with and without it
# Usage: inkling-real.sh <bob checkout> <work folder> [quant, default UD-Q4_K_M]
# Needs: git, cmake, nvcc (CUDA 12.8+ for Blackwell), python3 with huggingface_hub, ~60 GB of disk.
set -euo pipefail
BOB=$(cd "$1" && pwd); WORK=$2; Q=${3:-UD-Q4_K_M}
mkdir -p "$WORK"; cd "$WORK"
TAG=$(node -p "require('$BOB/app/package.json').bob.bundledLlamaTag" 2>/dev/null || echo b12359)
log() { echo "[$(date +%H:%M:%S)] $*"; }
fails=0
check() { if [ "$2" = 1 ]; then echo "PASS $1"; else echo "FAIL $1 ${3:-}"; fails=$((fails+1)); fi; }

# the two engines
if [ ! -x be/build/bin/llama-server ]; then
  log "Brain Engine: llama.cpp $TAG with app/engine/patches"
  git clone -q --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp.git be
  for p in "$BOB"/app/engine/patches/*.patch; do git -C be apply "$p"; done
  cmake -S be -B be/build -DGGML_CUDA=ON -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build be/build -j"$(nproc)" --target llama-server llama-perplexity >/dev/null
fi
if [ ! -x up/build/bin/llama-server ]; then
  log "upstream llama.cpp master"
  git clone -q --depth 1 https://github.com/ggml-org/llama.cpp.git up
  cmake -S up -B up/build -DGGML_CUDA=ON -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build up/build -j"$(nproc)" --target llama-server llama-perplexity >/dev/null
fi

# the brain: the Mainline layout (inkling2_loop), renamed from .gguf_file
M=$WORK/Inkling-2-Mini-$Q.gguf
if [ ! -f "$M" ]; then
  log "downloading Mainline_Support/Inkling-2-Mini-$Q.gguf_file"
  python3 - "$Q" "$WORK" <<'EOF'
import sys, os, shutil
from huggingface_hub import hf_hub_download
q, work = sys.argv[1], sys.argv[2]
p = hf_hub_download('unsloth/Inkling-2-Mini-GGUF', f'Mainline_Support/Inkling-2-Mini-{q}.gguf_file', local_dir=work)
shutil.move(p, os.path.join(work, f'Inkling-2-Mini-{q}.gguf'))
EOF
fi

D=$WORK/dspark-Inkling-2-Mini-Q8_0.gguf
if [ ! -f "$D" ]; then
  log "downloading dspark-Inkling-2-Mini-Q8_0.gguf"
  python3 -c "from huggingface_hub import hf_hub_download as d; d('unsloth/Inkling-2-Mini-GGUF', 'dspark-Inkling-2-Mini-Q8_0.gguf', local_dir='$WORK')"
fi

SHORT='Write a Python function that returns the n-th Fibonacci number, then explain it in two sentences.'
LONG="$(printf 'Here is a list of fruit: %s. ' $(seq -s, 1 60)) Now name three fruits that are red and say why in one line each."
run() { # run <engine> <tag> <args...>: prints the greedy completion of SHORT and LONG and the peak card memory
  local eng=$1 tag=$2; shift 2
  local port=$((18000 + RANDOM % 1000))
  "$WORK/$eng/build/bin/llama-server" -m "$M" --port $port -c 32768 -np 1 --jinja --temp 0 "$@" > "$WORK/$tag.log" 2>&1 &
  local pid=$! peak=0
  for i in $(seq 600); do curl -s localhost:$port/health | grep -q ok && break; sleep 1; done
  for P in "$SHORT" "$LONG"; do
    python3 - "$port" "$P" <<'EOF'
import json, sys, urllib.request
port, prompt = sys.argv[1], sys.argv[2]
body = {'messages': [{'role': 'user', 'content': prompt}], 'max_tokens': 96, 'temperature': 0, 'cache_prompt': False}
r = urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}/v1/chat/completions', json.dumps(body).encode(),
                                                  {'Content-Type': 'application/json'}), timeout=600)
print(json.dumps(json.loads(r.read())['choices'][0]['message'].get('content', '')))
EOF
    peak=$(( $(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1) > peak ? $(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1) : peak ))
  done > "$WORK/$tag.out"
  echo "$peak" > "$WORK/$tag.peak"
  kill $pid; wait $pid 2>/dev/null || true
}

log "1-2: every expert on the card"
run up up-card -ngl 99
run be be-card -ngl 99
check "upstream answers (short and long)" "$( [ $(grep -c . up-card.out) = 2 ] && ! grep -q '???' up-card.out && echo 1 )"
check "Brain Engine answers (short and long, no '?' run)" "$( [ $(grep -c . be-card.out) = 2 ] && ! grep -q '???' be-card.out && echo 1 )"
check "same words as upstream on the card" "$(cmp -s up-card.out be-card.out && echo 1)" "(see up-card.out, be-card.out)"

log "3: experts in RAM"
run be be-ram -ngl 99 --n-cpu-moe 99
check "experts in RAM: same words as on the card" "$(cmp -s be-card.out be-ram.out && echo 1)"

log "4: the MoE cache"
run be be-cache0 -ngl 99 --n-cpu-moe 99 --moe-cache-mib 6000 --moe-cache-cpu-share 0
run be be-cache5 -ngl 99 --n-cpu-moe 99 --moe-cache-mib 6000 --moe-cache-cpu-share 0.5
check "MoE cache, misses on the card: same words" "$(cmp -s be-card.out be-cache0.out && echo 1)"
check "MoE cache, half the misses on the processor: same words" "$(cmp -s be-card.out be-cache5.out && echo 1)"
grep -h "MoE cache size\|slots (\|hit rate" be-cache0.log | sed 's/^/    /'

log "5: a 16 GB card"
run be be-16g -ngl 99 --fit on --fit-target 512 -c 32768
check "fits 15.5 GB (peak $(cat be-16g.peak) MiB)" "$( [ "$(cat be-16g.peak)" -le 15872 ] && echo 1 )"

log "6: DSpark guess-ahead"
SPEC="-md $D --spec-type draft-dspark --spec-draft-n-max 3 -ngld 99"
run be be-dspark-card -ngl 99 $SPEC --spec-draft-backend-sampling
run be be-dspark-host -ngl 99 $SPEC --no-spec-draft-backend-sampling
check "DSpark, guesses picked on the card: same words" "$(cmp -s be-card.out be-dspark-card.out && echo 1)"
check "DSpark, guesses picked on the host: same words" "$(cmp -s be-card.out be-dspark-host.out && echo 1)"
check "DSpark: the Inkling drafter is used" "$(grep -q 'Inkling2 DSpark: block_size=8' be-dspark-card.log && echo 1)"
for t in be-card be-dspark-card be-dspark-host; do
  echo "    $t: $(grep -o 'eval time.*tokens per second)' $t.log | tail -1)  $(grep -o 'draft acceptance = [0-9.]* ( *[0-9]* accepted / *[0-9]* generated)' $t.log | tail -1)"
done

log "perplexity (wikitext-2 test, 32 chunks of 512)"
if [ ! -f wiki.test.raw ]; then
  python3 -c "from huggingface_hub import hf_hub_download as d; import shutil; shutil.copy(d('ggml-org/ci', 'wikitext-2-raw/wiki.test.raw', repo_type='dataset'), 'wiki.test.raw')" || true
fi
if [ -f wiki.test.raw ]; then
  for eng in up be; do
    "$WORK/$eng/build/bin/llama-perplexity" -m "$M" -f wiki.test.raw -ngl 99 -c 512 --chunks 32 2>&1 | grep -o 'Final estimate: PPL = [0-9.]*' | tee "$WORK/$eng.ppl" || true
  done
  check "perplexity within 1% of upstream" "$(python3 -c "
import re; a=float(open('up.ppl').read().split()[-1]); b=float(open('be.ppl').read().split()[-1]); print(1 if abs(a-b)/a < 0.01 else 0)" 2>/dev/null)"
fi

echo; [ $fails = 0 ] && echo "all passed" || echo "$fails failed"
exit $fails
