#!/bin/bash
# FNRI on a rented card: scan a brain there and bring the recording home. Driven by in/aifeui-plan.json.
#   Step 0 checks EVERYTHING the run needs before anything is downloaded or built: the tools, the card, the disk, the
#   plan, Bob's engine patches, Bob's viewer, and that the brain can be reached. One failed check stops the run there.
#   Step 1 gets Brain Engine: llama.cpp at the pinned tag with Bob's patches applied (the expert mask and the trace).
#   Step 2 loads the brain and proves the trace works with one word before any question is asked.
#   Step 3 asks the questions (aifeui_scan.py) and writes the recording, the same file the Lab writes at home.
#   Step 4 puts Bob's viewer beside the recording, so the question, thinking and answer can be watched from the card
#          (AIFEUI_SERVE=1 serves it on port 7778) or at home (the viewer's "Open a recording file").
# Made by: node model-lab/forge/aifeui-bundle.mjs (it packs this folder, the patches, the viewer and the plan).
set -u
W=${FORGE_ROOT:-/workspace}; IN=$W/in; OUT=$W/out/aifeui; POD=$(cd "$(dirname "$0")" && pwd)
PLAN=$IN/aifeui-plan.json; PATCHES=$IN/engine-patches; VIEWER=$IN/viewer
mkdir -p "$OUT"
say() { echo "[aifeui] $*"; }
status() { python3 -c "import json,sys,time; json.dump({'state':sys.argv[1],'note':sys.argv[2],'at':int(time.time())}, open(sys.argv[3],'w'))" "$1" "$2" "$OUT/status.json" 2>/dev/null; }
die() { status failed "$*"; say "FAILED: $*"; exit 1; }
plan() { python3 -c "import json,sys; v=json.load(open(sys.argv[1])).get(sys.argv[2]); print('' if v is None else v)" "$PLAN" "$1"; }

# ---- step 0: every dependency, before anything else ----
status checking "checking everything the scan needs"
python3 "$POD/aifeui_scan.py" preflight --plan "$PLAN" --patches "$PATCHES" --viewer "$VIEWER" --work "$W" --out "$OUT/preflight.json"
rc=$?
[ $rc -eq 0 ] || { status failed "a check failed before anything was downloaded or built; see preflight.json"; say "Stopped at the checks. Nothing was downloaded or built."; exit 2; }

# ---- step 1: Brain Engine ----
TAG=$(plan llama_tag); SRV=${AIFEUI_SERVER:-}
if [ -n "$SRV" ]; then
  say "using the Brain Engine already here: $SRV"
else
  status engine "building Brain Engine (llama.cpp $TAG with Bob's patches)"
  L=$W/aifeui-engine; SRV=$L/build/bin/llama-server
  if [ ! -x "$SRV" ] || [ "$(cat "$L/.bob-patches" 2>/dev/null)" != "$(cat "$PATCHES"/*.patch | sha256sum | cut -d' ' -f1)" ]; then
    rm -rf "$L"
    git clone --depth 1 --branch "$TAG" --recurse-submodules https://github.com/ggml-org/llama.cpp "$L" > "$OUT/engine-build.log" 2>&1 || die "couldn't fetch llama.cpp $TAG (engine-build.log)"
    for p in $(ls "$PATCHES"/*.patch | sort); do
      ( cd "$L" && git apply "$p" ) >> "$OUT/engine-build.log" 2>&1 || die "Bob's engine patch $(basename "$p") doesn't apply to llama.cpp $TAG"
      say "applied $(basename "$p")"
    done
    command -v cmake >/dev/null || pip install -q cmake >> "$OUT/engine-build.log" 2>&1
    command -v nvcc >/dev/null || export PATH=$PATH:/usr/local/cuda/bin
    CUDA=ON; [ "${AIFEUI_ALLOW_CPU:-}" = 1 ] && ! command -v nvidia-smi >/dev/null && CUDA=OFF
    ( cd "$L" && cmake -B build -DGGML_CUDA=$CUDA -DLLAMA_CURL=OFF >> "$OUT/engine-build.log" 2>&1 && cmake --build build --target llama-server -j "$(nproc)" >> "$OUT/engine-build.log" 2>&1 ) || { tail -40 "$OUT/engine-build.log"; die "Brain Engine didn't build (engine-build.log)"; }
    cat "$PATCHES"/*.patch | sha256sum | cut -d' ' -f1 > "$L/.bob-patches"
  fi
fi
LD_LIBRARY_PATH="$(dirname "$SRV"):${LD_LIBRARY_PATH:-}" "$SRV" --version >/dev/null 2>&1 || die "Brain Engine is there but doesn't run"
export LD_LIBRARY_PATH="$(dirname "$SRV"):${LD_LIBRARY_PATH:-}"

# ---- step 2: the brain, loaded, and the trace proven ----
status brain "getting the brain"
GGUF=$(python3 "$POD/aifeui_scan.py" fetch --plan "$PLAN" --work "$W") || die "couldn't get the brain"
PORT=${AIFEUI_PORT:-8795}
status loading "loading the brain on Brain Engine"
"$SRV" -m "$GGUF" --port "$PORT" -c 4096 -np 1 --jinja ${AIFEUI_SERVER_ARGS:--ngl 999} > "$OUT/engine.log" 2>&1 &
SPID=$!
trap 'kill $SPID 2>/dev/null' EXIT
python3 "$POD/aifeui_scan.py" wait --url "http://127.0.0.1:$PORT" --pid $SPID || { tail -20 "$OUT/engine.log"; die "the brain didn't load (engine.log)"; }
python3 "$POD/aifeui_scan.py" selftest --url "http://127.0.0.1:$PORT" || die "this Brain Engine doesn't report the trace, so there is nothing to record"

# ---- step 3: the questions ----
status scanning "asking the questions"
python3 "$POD/aifeui_scan.py" scan --plan "$PLAN" --url "http://127.0.0.1:$PORT" --gguf "$GGUF" --gguf-py "${AIFEUI_GGUF_PY:-$W/aifeui-engine/gguf-py}" --out "$OUT/recording.json" --status "$OUT/status.json" || die "the scan stopped (see above)"
kill $SPID 2>/dev/null; trap - EXIT

# ---- step 4: the viewer beside the recording ----
mkdir -p "$OUT/viewer" && cp -r "$VIEWER"/. "$OUT/viewer/" && cp "$OUT/recording.json" "$OUT/viewer/recording.json" || die "couldn't put the viewer beside the recording"
status done "the recording is in out/aifeui/recording.json; the viewer is in out/aifeui/viewer (watch.html?file=recording.json)"
say "done: $OUT/recording.json"
if [ "${AIFEUI_SERVE:-}" = 1 ]; then say "serving the viewer on port 7778: /watch.html?file=recording.json"; cd "$OUT/viewer" && exec python3 -m http.server 7778; fi
