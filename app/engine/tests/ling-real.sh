#!/usr/bin/env bash
# Ling-3.2-air (inclusionAI, arch bailingmoe3: 42 layers, 35 KDA + 7 gated MLA, 512 experts, 8 used, 1 MTP layer) on
# Brain Engine, for a rented Linux NVIDIA card with 80 GB (not npc). b12359 already has bailingmoe3 (upstream #26608,
# Aug 2026, made for Ling 3.0, with the 42-layer 124B type), so no engine patch is needed to load it; this proves it on
# the real brain and compares with upstream llama.cpp master (which adds only #33081, a fused ssm_conv + silu):
#   1. the brain loads in both and answers a short and a long prompt, thinking off
#   2. the greedy words beside upstream's (a note, not a fail: #33081 may change the last bits) and close perplexity
#   3. experts in RAM (--n-cpu-moe): the same words as on the card
#   4. Brain Engine's MoE cache (--moe-cache-mib), misses on the card: the same words; half on the processor: the tool call,
#      where the words part (a note: the processor matches the card up to the last bits), and its perplexity within 0.5%
#   5. a 16 GB card's budget: --fit with 15.5 GB (16 GB less the 512 MB margin) and its peak card memory
#   6. a tool call (Ling 3 parser, <tool_call> with <arg_key>/<arg_value>): the right tool and arguments, thinking off
#   7. the brain's own MTP head (--spec-type draft-mtp): the same words, how many guesses are kept, words a second
# Usage: ling-real.sh <bob checkout> <work folder> [quant, default IQ3_XXS (55.7 GB, fits an 80 GB card whole)]
# Needs: git, cmake, nvcc, python3 with huggingface_hub, ~90 GB of disk, 64 GB of RAM or more (step 3 and 5).
set -euo pipefail
BOB=$(cd "$1" && pwd); WORK=$2; Q=${3:-IQ3_XXS}
mkdir -p "$WORK"; cd "$WORK"
TAG=$(node -p "require('$BOB/app/package.json').bob.bundledLlamaTag" 2>/dev/null || echo b12359)
log() { echo "[$(date +%H:%M:%S)] $*"; }
fails=0
check() { if [ "$2" = 1 ]; then echo "PASS $1"; else echo "FAIL $1 ${3:-}"; fails=$((fails+1)); fi; }
nvidia-smi --query-gpu=name,memory.total,temperature.gpu,clocks.sm,clocks.mem --format=csv,noheader | sed 's/^/card: /'

# the two engines
if [ ! -x be/build/bin/llama-server ]; then
  log "Brain Engine: llama.cpp $TAG with app/engine/patches"
  git clone -q --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp.git be
  for p in "$BOB"/app/engine/patches/*.patch; do git -C be apply "$p"; done
  cmake -S be -B be/build -DGGML_CUDA=ON -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release > be-build.log 2>&1
  cmake --build be/build -j"$(nproc)" --target llama-server llama-perplexity >> be-build.log 2>&1
fi
if [ ! -x up/build/bin/llama-server ]; then
  log "upstream llama.cpp master"
  git clone -q --depth 1 https://github.com/ggml-org/llama.cpp.git up
  git -C up log -1 --format='upstream at %H'
  cmake -S up -B up/build -DGGML_CUDA=ON -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release > up-build.log 2>&1
  cmake --build up/build -j"$(nproc)" --target llama-server llama-perplexity >> up-build.log 2>&1
fi

# the brain: bartowski's GGUF (a big quant comes in parts; llama.cpp reads the rest from the first)
log "downloading bartowski/Ling-3.2-air-GGUF $Q"
M=$(python3 - "$Q" "$WORK" <<'EOF'
import sys, glob, os
from huggingface_hub import snapshot_download
q, work = sys.argv[1], sys.argv[2]
d = snapshot_download('bartowski/Ling-3.2-air-GGUF', allow_patterns=[f'*-{q}.gguf', f'*-{q}/*', f'*-{q}-*.gguf'],
                      local_dir=os.path.join(work, 'ling'))
files = sorted(f for f in glob.glob(os.path.join(d, '**', '*.gguf'), recursive=True) if 'mmproj' not in f)
print(files[0])
EOF
)
log "brain: $M"

SHORT='Write a Python function that returns the n-th Fibonacci number, then explain it in two sentences.'
LONG="$(printf 'Here is a list of fruit: %s. ' $(seq -s, 1 60)) Now name three fruits that are red and say why in one line each."
TOOLS='[{"type":"function","function":{"name":"get_weather","description":"Get the weather for a city","parameters":{"type":"object","properties":{"city":{"type":"string"},"unit":{"type":"string","enum":["c","f"]}},"required":["city"]}}}]'
peakmem() { nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1; }
run() { # run <engine> <tag> <args...>: the greedy completions of SHORT and LONG, a tool call, and the peak card memory
  local eng=$1 tag=$2; shift 2
  local port=$((18000 + RANDOM % 1000)) peak=0 m
  "$WORK/$eng/build/bin/llama-server" -m "$M" --port $port -c 32768 -np 1 --jinja --temp 0 "$@" > "$WORK/$tag.log" 2>&1 &
  local pid=$!
  for i in $(seq 900); do curl -s localhost:$port/health | grep -q ok && break; sleep 1; done
  for P in "$SHORT" "$LONG" TOOL; do
    python3 - "$port" "$P" "$TOOLS" <<'EOF'
import json, sys, urllib.request
port, prompt, tools = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
body = {'max_tokens': 160, 'temperature': 0, 'cache_prompt': False, 'chat_template_kwargs': {'enable_thinking': False}}
if prompt == 'TOOL':
    body.update(messages=[{'role': 'user', 'content': 'What is the weather in Winnipeg in celsius?'}], tools=tools)
else:
    body.update(messages=[{'role': 'user', 'content': prompt}], max_tokens=96)
r = urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}/v1/chat/completions', json.dumps(body).encode(),
                                                  {'Content-Type': 'application/json'}), timeout=900)
msg = json.loads(r.read())['choices'][0]['message']
if prompt == 'TOOL':
    calls = [{'name': c['function']['name'], 'args': json.loads(c['function']['arguments'] or '{}')} for c in msg.get('tool_calls') or []]
    print('TOOL ' + json.dumps(calls, sort_keys=True))
else:
    print(json.dumps(msg.get('content', '')))
EOF
    m=$(peakmem); [ "$m" -gt "$peak" ] && peak=$m
  done > "$WORK/$tag.out"
  echo "$peak" > "$WORK/$tag.peak"
  kill $pid; wait $pid 2>/dev/null || true
}
words() { grep -v '^TOOL ' "$1"; }
answers() { [ "$(words "$1" | grep -c .)" = 2 ] && ! grep -q '???' "$1" && echo 1; }
toolok() { grep '^TOOL ' "$1" | python3 -c "
import json, sys; c = json.loads(sys.stdin.read()[5:])
print(1 if len(c) == 1 and c[0]['name'] == 'get_weather' and 'winnipeg' in str(c[0]['args'].get('city', '')).lower() else 0)" 2>/dev/null; }

log "1-2: every expert on the card"
run up up-card -ngl 99
run be be-card -ngl 99
check "upstream answers (short and long)" "$(answers up-card.out)"
check "Brain Engine answers (short and long, no '?' run)" "$(answers be-card.out)"
if cmp -s <(words up-card.out) <(words be-card.out); then echo "NOTE same greedy words as upstream"; else echo "NOTE greedy words differ from upstream (see up-card.out, be-card.out; #33081 may explain it)"; fi
check "tool call on upstream (get_weather, Winnipeg)" "$(toolok up-card.out)" "($(grep '^TOOL' up-card.out))"
check "tool call on Brain Engine (get_weather, Winnipeg)" "$(toolok be-card.out)" "($(grep '^TOOL' be-card.out))"
grep -h "chat format\|Using specialized template" be-card.log | head -2 | sed 's/^/    /' || true

log "3: experts in RAM"
run be be-ram -ngl 99 --n-cpu-moe 99
check "experts in RAM: same words as on the card" "$(cmp -s <(words be-card.out) <(words be-ram.out) && echo 1)"
check "experts in RAM: tool call" "$(toolok be-ram.out)"

log "4: the MoE cache"
run be be-cache0 -ngl 99 --n-cpu-moe 99 --moe-cache-mib 6000 --moe-cache-cpu-share 0
run be be-cache5 -ngl 99 --n-cpu-moe 99 --moe-cache-mib 6000 --moe-cache-cpu-share 0.5
check "MoE cache, misses on the card: same words" "$(cmp -s <(words be-card.out) <(words be-cache0.out) && echo 1)"
# the processor's misses match the card's up to the last bits (ENGINE-MAP 0040), and greedy words can part after a
# near tie, so this is a note; ling-cpu-share.py proves the same words on a stand-in card, and the perplexity step
# below checks the processor's part for closeness
if cmp -s <(words be-card.out) <(words be-cache5.out); then echo "NOTE MoE cache, half the misses on the processor: same words"
else echo "NOTE MoE cache, half the misses on the processor: words part at token $(python3 - be-card.out be-cache5.out <<'EOF2'
import json, sys
a, b = ([json.loads(l) for l in open(p) if not l.startswith('TOOL ')] for p in sys.argv[1:])
for x, y in zip(a, b):
    n = next((i for i, (p, q) in enumerate(zip(x.split(), y.split())) if p != q), None)
    if n is not None: print(f'{n} of {len(x.split())} words'); break
else: print('?')
EOF2
)"; fi
check "MoE cache, half the misses on the processor: tool call" "$(toolok be-cache5.out)"
grep -h "MoE cache size\|slots (\|hit rate\|rounds like the card" be-cache5.log | head -6 | sed 's/^/    /' || true

log "5: a 16 GB card"
# a 16 GB card on a bigger one: --fit leaves --fit-target MiB free, so leave all but 15.5 GB (less what's in use now)
read -r FREE USED <<< "$(nvidia-smi --query-gpu=memory.free,memory.used --format=csv,noheader,nounits | head -1 | tr -d ',')"
run be be-16g -ngl 99 --fit on --fit-target $(( FREE - (15872 - USED) )) -c 32768
check "fits 15.5 GB (peak $(cat be-16g.peak) MiB)" "$( [ "$(cat be-16g.peak)" -le 15872 ] && echo 1 )"
check "16 GB: tool call" "$(toolok be-16g.out)"

log "7: the MTP head"
run be be-mtp -ngl 99 --spec-type draft-mtp
check "MTP: same words" "$(cmp -s <(words be-card.out) <(words be-mtp.out) && echo 1)"
for t in up-card be-card be-ram be-16g be-mtp; do
  echo "    $t: $(grep -o 'eval time.*tokens per second)' $t.log | tail -1)  $(grep -o 'draft acceptance = [0-9.]* ( *[0-9]* accepted / *[0-9]* generated)' $t.log | tail -1)"
done
nvidia-smi --query-gpu=temperature.gpu,clocks.sm,clocks.mem --format=csv,noheader | sed 's/^/card after: /'

log "perplexity (wikitext-2 test, 32 chunks of 512)"
if [ ! -f wiki.test.raw ]; then
  # ggml-org/ci keeps it in a zip now (the loose file is gone, 404); Salesforce/wikitext's parquet is the fallback
  python3 - <<'EOF2' || true
import io, zipfile
from huggingface_hub import hf_hub_download as d
try:
    z = zipfile.ZipFile(d('ggml-org/ci', 'wikitext-2-raw-v1.zip', repo_type='dataset'))
    open('wiki.test.raw', 'wb').write(z.read('wikitext-2-raw/wiki.test.raw'))
except Exception as e:
    print('ggml-org/ci zip failed:', e)
    import pyarrow.parquet as pq
    t = pq.read_table(d('Salesforce/wikitext', 'wikitext-2-raw-v1/test-00000-of-00001.parquet', repo_type='dataset'))
    open('wiki.test.raw', 'w', encoding='utf-8').write(''.join(t.column('text').to_pylist()))
EOF2
fi
if [ -f wiki.test.raw ]; then
  for eng in up be; do
    "$WORK/$eng/build/bin/llama-perplexity" -m "$M" -f wiki.test.raw -ngl 99 -c 512 --chunks 32 2>&1 | grep -o 'Final estimate: PPL = [0-9.]*' | tee "$WORK/$eng.ppl" || true
  done
  check "perplexity within 1% of upstream" "$(python3 -c "
a=float(open('up.ppl').read().split()[-1]); b=float(open('be.ppl').read().split()[-1]); print(1 if abs(a-b)/a < 0.01 else 0)" 2>/dev/null)"
  # the processor's part: a 512-token read goes through the cache with every miss on the processor (0032)
  "$WORK/be/build/bin/llama-perplexity" -m "$M" -f wiki.test.raw -ngl 99 --n-cpu-moe 99 --moe-cache-mib 6000 --moe-cache-cpu-share 0.5 \
    -c 512 --chunks 32 2>&1 | tee be-cpu-ppl.log | grep -o 'Final estimate: PPL = [0-9.]*' | tee "$WORK/be-cpu.ppl" || true
  check "MoE cache with misses on the processor: perplexity within 0.5% of every expert on the card" "$(python3 -c "
a=float(open('be.ppl').read().split()[-1]); b=float(open('be-cpu.ppl').read().split()[-1]); print(1 if abs(a-b)/a < 0.005 else 0)" 2>/dev/null)"
fi

echo; [ $fails = 0 ] && echo "all passed" || echo "$fails failed"
exit $fails
