#!/usr/bin/env bash
# Tier sweep (Forge build 23, Nov 26 2026): Bob's DEFAULTS on a rented card. One pod runs one or more tiers of
# plans/tier-sweep.json, one after another, each on a fresh Bob with an empty home:
#   the published release (pinned by full SHA), started headless (node src/server.js), his own hardware check and set,
#   his own downloads (brain + Lamplight engine), his own engine settings. Nothing is set by hand.
# A simulated tier (8 or 12 GB on a 24 GB card) runs a card ballast (tier/ballast.py) and puts a stand-in nvidia-smi
# (tier/nvsmi-shim.py) first on Bob's PATH, so Bob and his engine both have only that much card. Fit, pick, spill and
# crashes are then real; the speed is the bigger card's and is not reported as the tier's.
# The card is logged every second (memory, temperature, clocks, power, use, free RAM) to <tier>/card.csv.
#   TIERS=t08-sim,t12-sim,t24-ampere bash tier-run.sh       -> /workspace/tier-sweep/<tier>/row.md, summary.txt, zip
# Env:
#   TIERS        tier ids from the plan, run in order (one card type per pod)
#   PLAN         the plan (default: tier-sweep.json next to this script)
#   HOURS_MAX    backup delete: after this many hours the pod packs its results and deletes itself
#                (default: 1.5 h per tier + 0.25 h); the laptop's own caps are the first line
#   MOCK=1       cloud dry run: no card, no downloads (a stand-in engine and a made-up card)
#   FAKE_CARD    MOCK only: "name,MiB" of the made-up card ("none" = processor-only pod)
# Ends with "TIER SWEEP DONE" (each tier's PASS or FAIL above it) or "TIER SWEEP FAILED <step>" in summary.txt.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
W=${W:-/workspace/tier-work}; OUT=${OUT:-/workspace/tier-sweep}; MOCK=${MOCK:-0}
PLAN=${PLAN:-$HERE/tier-sweep.json}; TIERS=${TIERS:?set TIERS, e.g. TIERS=t24-ada}
BOB_TAG=${BOB_TAG:-v1.5.254}; BOB_SHA=${BOB_SHA:-50647155313c08c4cad226206a39d54106d6ee04}       # the newest published release on Nov 26
HARNESS_SHA=${HARNESS_SHA:-ced02c1c9facc937953afb476f07e828e197d919}                            # Lab harness + held-out sets (PR #275)
NODE_V=${NODE_V:-v22.23.5}; BOB_PORT=${BOB_PORT:-7811}
NT=$(echo "$TIERS" | tr ',' '\n' | grep -c .)
HOURS_MAX=${HOURS_MAX:-$(python3 -c "print(1.5*$NT+0.25)")}
mkdir -p "$OUT" "$W"; S="$OUT/summary.txt"; : > "$S"
say() { echo "$*" | tee -a "$S"; }
step() { echo "=== $(date -u +%H:%M:%S) $*" | tee -a "$OUT/steps.log"; }
pack() { ( cd "$(dirname "$OUT")" && rm -f "$OUT.zip" && (zip -qr "$OUT.zip" "$(basename "$OUT")" 2>/dev/null || tar czf "$OUT.tgz" "$(basename "$OUT")") ); }
BOBPID=""; SAMPLER=""; BALLAST=""
stop_tier() {
  [ -n "$BOBPID" ] && { kill "$BOBPID" 2>/dev/null; sleep 3; kill -9 "$BOBPID" 2>/dev/null; }
  pkill -f "$W/home" 2>/dev/null; pkill -f llama-server 2>/dev/null; pkill -f fake-engine.py 2>/dev/null
  [ -n "$SAMPLER" ] && kill "$SAMPLER" 2>/dev/null; [ -n "$BALLAST" ] && kill "$BALLAST" 2>/dev/null
  BOBPID=""; SAMPLER=""; BALLAST=""; sleep 2
}
fail() { say "TIER SWEEP FAILED $1"; stop_tier; pack; exit 1; }
trap 'stop_tier; pack' EXIT

# Backup delete: the pod packs and deletes itself at HOURS_MAX, whatever the laptop does (RUNPOD_POD_ID and a key are
# given to every RunPod pod; FORGE_RUNPOD_KEY wins when set). Off in MOCK.
if [ "$MOCK" != 1 ]; then
  ( sleep "$(python3 -c "print(int($HOURS_MAX*3600))")"; echo "$(date -u +%H:%M) backup delete after $HOURS_MAX h" >> "$OUT/watchdog.log"
    echo "TIER SWEEP FAILED backup delete at $HOURS_MAX h" >> "$S"; pack
    python3 -c "import os,urllib.request; r=urllib.request.Request('https://api.runpod.io/v2/pods/'+os.environ['RUNPOD_POD_ID'], method='DELETE', headers={'User-Agent':'bob-forge/1.0','Authorization':'Bearer '+os.environ.get('FORGE_RUNPOD_KEY', os.environ.get('RUNPOD_API_KEY',''))}); print(urllib.request.urlopen(r).read()[:200])" >> "$OUT/watchdog.log" 2>&1 ) &
  say "backup delete set: $HOURS_MAX h (pod ${RUNPOD_POD_ID:-unknown})"
fi

step tools
if [ "$MOCK" != 1 ]; then
  need=(); for c in git zip curl python3 xz; do command -v $c >/dev/null || need+=($c); done
  [ ${#need[@]} = 0 ] || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git zip curl python3 xz-utils >"$OUT/apt.log" 2>&1; } || fail tools
fi
if [ "$(node --version 2>/dev/null)" != "$NODE_V" ]; then   # always the pinned Node (22.11 crashes in the repo jobs' boxed runs)
  [ -x "$W/node-$NODE_V-linux-x64/bin/node" ] || { curl -fsSL "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-x64.tar.xz" -o "$W/node.tar.xz" && tar -xJf "$W/node.tar.xz" -C "$W"; } || fail node
  export PATH="$W/node-$NODE_V-linux-x64/bin:$PATH"
fi
NVSMI_REAL=$(command -v nvidia-smi || true)
if [ "$MOCK" = 1 ]; then
  mkdir -p "$W/fakebin"; FAKE_CARD=${FAKE_CARD:-NVIDIA RTX A5000,24564}; export FAKE_CARD FAKE_USED_FILE="$W/fake-used"; echo 0 > "$FAKE_USED_FILE"
  NVSMI_REAL=""; if [ "$FAKE_CARD" != none ]; then cp "$HERE/tier/fake-nvsmi.py" "$W/fakebin/nvidia-smi"; chmod +x "$W/fakebin/nvidia-smi"; NVSMI_REAL="$W/fakebin/nvidia-smi"; fi
  printf '#!/bin/sh\nexec python3 %s "$@"\n' "$HERE/tier/fake-engine.py" > "$W/fakebin/llama-server"; chmod +x "$W/fakebin/llama-server"
  export PATH="$W/fakebin:$PATH"
fi
export NVSMI_REAL
say "node $(node --version), python $(python3 --version | awk '{print $2}'), card: $([ -n "$NVSMI_REAL" ] && "$NVSMI_REAL" --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader || echo none)"
say "pod: $(nproc) vCPU, $(free -g | awk '/Mem:/{print $2}') GB RAM, disk free $(df -h "$W" | awk 'NR==2{print $4}'), rate \$${RUNPOD_COST_PER_HR:-?}/h"

step "Bob release + harness"
getsha() { # dir sha
  [ "$(git -C "$1" rev-parse HEAD 2>/dev/null)" = "$2" ] && return 0
  rm -rf "$1"; git init -q "$1" && git -C "$1" remote add origin https://github.com/MouseWurX/Bob.git &&
    git -C "$1" fetch -q --depth 1 origin "$2" && git -C "$1" checkout -q FETCH_HEAD && [ "$(git -C "$1" rev-parse HEAD)" = "$2" ]
}
getsha "$W/rel" "$BOB_SHA" || fail "bob-release ($BOB_TAG $BOB_SHA)"
REL_V=$(node -p "require('$W/rel/app/package.json').version"); say "Bob release $BOB_TAG = $REL_V at $BOB_SHA"
getsha "$W/harness" "$HARNESS_SHA" || fail "harness ($HARNESS_SHA)"
LAB=$W/harness/app/model-lab; JD=$W/jobs; mkdir -p "$JD"
( cd "$LAB" && node repo-jobs.mjs --held --check --out "$JD/repo.jsonl" ) >"$OUT/jobs-make.log" 2>&1 || { tail -20 "$OUT/jobs-make.log" >> "$S"; fail "job-set (repo --held)"; }
head -1 "$JD/repo.jsonl" > "$JD/repo-first.jsonl"
say "tool job: $(node -e "console.log(JSON.parse(require('fs').readFileSync('$JD/repo-first.jsonl','utf8')).id)") (first of $(wc -l < "$JD/repo.jsonl") held-out repo jobs)"

sampler() { # out.csv: the REAL card every second, and free RAM
  echo "time,used_mib,total_mib,temp_c,sm_mhz,mem_mhz,power_w,util_pct,ram_free_mib" > "$1"
  while :; do
    g=$([ -n "$NVSMI_REAL" ] && "$NVSMI_REAL" --query-gpu=memory.used,memory.total,temperature.gpu,clocks.sm,clocks.mem,power.draw,utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ' || echo ",,,,,,")
    echo "$(date -u +%H:%M:%S),$g,$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)" >> "$1"; sleep 1
  done
}

for T in $(echo "$TIERS" | tr ',' ' '); do
  read -r LABEL CARD_GB SIM < <(python3 - "$PLAN" "$T" <<'PY'
import json, sys
p = json.load(open(sys.argv[1])); t = next((x for x in p['tiers'] if x['id'] == sys.argv[2]), None)
print('MISSING 0 0' if not t else f"{t['label'].replace(' ', '_')} {t.get('card_gb', 0)} {1 if t.get('simulated') else 0}")
PY
)
  [ "$LABEL" = MISSING ] && { say "$T: not a tier of $(basename "$PLAN"): skipped"; continue; }
  LABEL=${LABEL//_/ }; TO="$OUT/$T"; rm -rf "$TO" "$W/home"; mkdir -p "$TO" "$W/home"
  step "tier $T ($LABEL)"
  cp "$W/rel/app/config.example.json" "$W/home/config.json"
  BPATH=$PATH; DRV=(); [ "$MOCK" = 1 ] && echo 0 > "$FAKE_USED_FILE"
  if [ "$SIM" = 1 ]; then
    [ -n "$NVSMI_REAL" ] || { say "$T: FAIL (a simulated tier needs a card)"; continue; }
    SIM_MIB=$((CARD_GB * 1024)); export SIM_MIB BALLAST_FILE="$TO/ballast.json" SHIM_LOG="$TO/shim.log"
    OTHER=$("$NVSMI_REAL" --query-gpu=memory.used --format=csv,noheader,nounits | head -1 | tr -d ' ')
    if [ "$MOCK" = 1 ]; then
      REALT=${FAKE_CARD##*,}; ( sleep 100000 ) & BALLAST=$!; export FAKE_BALLAST_PID=$BALLAST
      echo "{\"pid\": $BALLAST, \"held_mib\": $((REALT - SIM_MIB)), \"sim_mib\": $SIM_MIB}" > "$BALLAST_FILE"; echo $((REALT - SIM_MIB)) > "$FAKE_USED_FILE"
    else
      OTHER_USED_MIB=$OTHER python3 "$HERE/tier/ballast.py" "$SIM_MIB" "$BALLAST_FILE" > "$TO/ballast.log" 2>&1 & BALLAST=$!
      for i in $(seq 1 60); do [ -f "$BALLAST_FILE" ] && break; kill -0 $BALLAST 2>/dev/null || break; sleep 2; done
      [ -f "$BALLAST_FILE" ] || { say "$T: FAIL ballast did not start: $(tail -2 "$TO/ballast.log")"; stop_tier; continue; }
    fi
    mkdir -p "$W/shim"; printf '#!/bin/sh\nexec python3 %s "$@"\n' "$HERE/tier/nvsmi-shim.py" > "$W/shim/nvidia-smi"; chmod +x "$W/shim/nvidia-smi"
    BPATH="$W/shim:$PATH"; DRV=(--card-gb "$CARD_GB" --simulated --ballast-file "$BALLAST_FILE")
    say "$T: simulated $CARD_GB GB: $(cat "$BALLAST_FILE"); Bob's nvidia-smi says: $(PATH=$BPATH nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader,nounits)"
  fi
  sampler "$TO/card.csv" & SAMPLER=$!
  ( cd "$W/rel/app" && exec env PATH="$BPATH" BOB_AGENT_DIR="$W/home" BOB_CONFIG="$W/home/config.json" BOB_PORT=$BOB_PORT node src/server.js ) > "$TO/bob.log" 2>&1 & BOBPID=$!
  node "$HERE/tier/drive.mjs" --bob-url "http://127.0.0.1:$BOB_PORT" --rel "$W/rel/app" --harness "$W/harness/app" --jobs "$JD/repo-first.jsonl" \
    --long "$HERE/tier/long-text.md" --out "$TO" --tier "$T" --label "$LABEL" --data "$W/home/inn" "${DRV[@]}" $( [ "$MOCK" = 1 ] && echo --mock ) > "$TO/drive.out" 2>&1
  rc=$?
  # Bob's logbook and any engine failure he saved, for the row
  find "$W/home" -maxdepth 4 \( -name '*load-failed*.txt' -o -name 'logbook*' -o -name '*.log' \) -size -20M -exec cp {} "$TO/" \; 2>/dev/null
  stop_tier
  res=$(node -e "try{const r=require('$TO/row.json');console.log((r.result||'?').toUpperCase()+(r.failed_at?' at '+r.failed_at+': '+(r.why||''):''))}catch{console.log('NO ROW (drive exit $rc)')}")
  say "$T ($LABEL): $res"
  [ "$MOCK" = 1 ] || rm -rf "$W/home"   # disk: the next tier starts from an empty home and downloads again
done
node "$HERE/tier/table.mjs" "$OUT" > "$OUT/tier-sweep.md" 2>>"$OUT/steps.log" && say "table: tier-sweep.md"
say "TIER SWEEP DONE"
