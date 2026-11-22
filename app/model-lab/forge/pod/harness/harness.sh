#!/bin/bash
# Harness compare on the pod (21 Nov 2026). Two parts, both started by run.sh when plan.benchmark.pod_harness is set:
#   harness.sh install   while llama-server builds: Node.js, Qwen Code, mini-swe-agent (own venv), user "hc"
#   harness.sh run <BN>  once the brain answers: a smoke ask per harness, then the 33 repository jobs in each, side by
#                        side; out/bench/harness/<run>-<harness>/runs.jsonl + transcripts, leftovers-<harness>.tgz, done.json
# The harnesses run as user hc with a clean environment (no forge or RunPod keys); the brain's key is passed as HC_API_KEY.
set -u
NODE_V=v22.21.1
QWEN_V=0.28.3
MINI_V=2.4.6
HERE=$(cd "$(dirname "$0")" && pwd)
W=${FORGE_ROOT:-/workspace}; IN=$W/in; HO=$W/out/bench/harness; R=/srv/hc
NODE_DIR=/opt/hc-node; QWEN_DIR=/opt/hc-qwen; MINI_DIR=/opt/hc-mini
mkdir -p "$HO"
stamp() { date -u +%H:%M:%S; }
cfg() { python3 -c "import json; p=json.load(open('$IN/plan.json')); h=p.get('benchmark',{}).get('pod_harness') or {}; v=h.get('$1','$2'); print(','.join(v) if isinstance(v,list) else v)"; }

install() {
  rm -f "$HO/install-ok" "$HO/install-failed"
  fail() { echo "$(stamp) install FAILED: $1"; echo "$1" > "$HO/install-failed"; exit 1; }
  echo "$(stamp) install: git"
  command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git >/dev/null; } || fail "no git"
  echo "$(stamp) install: Node.js $NODE_V"
  mkdir -p $NODE_DIR
  curl -fsSL "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-x64.tar.xz" | tar xJ -C $NODE_DIR --strip-components=1 || fail "Node.js download"
  $NODE_DIR/bin/node --version || fail "node does not start"
  $NODE_DIR/bin/node --permission --allow-fs-read='*' -e 0 || fail "this node cannot box a program in (--permission)"
  echo "$(stamp) install: Qwen Code $QWEN_V"
  PATH=$NODE_DIR/bin:$PATH $NODE_DIR/bin/npm install -g --prefix $QWEN_DIR --no-audit --no-fund "@qwen-code/qwen-code@$QWEN_V" > "$HO/install-qwen.log" 2>&1 || { tail -5 "$HO/install-qwen.log"; fail "Qwen Code install"; }
  QE=$QWEN_DIR/lib/node_modules/@qwen-code/qwen-code/cli-entry.js
  [ -f "$QE" ] || QE=$(PATH=$NODE_DIR/bin:$PATH $NODE_DIR/bin/node -e "const p=require('$QWEN_DIR/lib/node_modules/@qwen-code/qwen-code/package.json'); const b=typeof p.bin==='string'?p.bin:p.bin.qwen; console.log(require('path').join('$QWEN_DIR/lib/node_modules/@qwen-code/qwen-code', b))")
  [ -f "$QE" ] || fail "Qwen Code's entry file is not where it should be"
  echo "$QE" > "$HO/qwen-entry.txt"
  PATH=$NODE_DIR/bin:$PATH $NODE_DIR/bin/node "$QE" --version || fail "qwen does not start"
  echo "$(stamp) install: mini-swe-agent $MINI_V (own venv)"
  { python3 -m venv $MINI_DIR 2>/dev/null || { pip install -q virtualenv && python3 -m virtualenv -q $MINI_DIR; }; } > "$HO/install-mini.log" 2>&1 || fail "no venv for mini-swe-agent"
  $MINI_DIR/bin/pip install -q "mini-swe-agent==$MINI_V" >> "$HO/install-mini.log" 2>&1 || { tail -5 "$HO/install-mini.log"; fail "mini-swe-agent install"; }
  [ -x $MINI_DIR/bin/mini ] || fail "no mini command after the install"
  MSWEA_CONFIGURED=true $MINI_DIR/bin/mini --help > /dev/null 2>&1 || echo "$(stamp) note: mini --help did not end cleanly (see the smoke test)"
  echo "$(stamp) install: user hc"
  id hc >/dev/null 2>&1 || useradd -m -s /bin/bash hc || fail "useradd hc"
  mkdir -p $R && chmod 755 $R
  chmod -R a+rX $NODE_DIR $QWEN_DIR $MINI_DIR "$HERE"
  touch "$HO/install-ok"; echo "$(stamp) install OK"
}

run() {
  BN=${1:-brain}
  for i in $(seq 1 120); do [ -f "$HO/install-ok" ] || [ -f "$HO/install-failed" ] && break; sleep 10; done
  if [ ! -f "$HO/install-ok" ]; then echo "$(stamp) the install did not finish: $(cat "$HO/install-failed" 2>/dev/null || echo 'time out')"; echo '{"done":true,"ok":false,"why":"install"}' > "$HO/done.json"; exit 1; fi
  # the harnesses run as hc: they may not read the forge's inputs or the door's environment
  chmod 700 "$IN" 2>/dev/null || true
  RUN=$(cfg run hc); HS=$(cfg harnesses qwen-code,mini-swe-agent); PAR=$(cfg parallel 4); MIN=$(cfg job_minutes 8); TURNS=$(cfg turns 40); HRS=$(cfg hours 0.5); MODEL=$(cfg model_name qwen3.6)
  QE=$(cat "$HO/qwen-entry.txt")
  echo "$(stamp) harness compare: $HS on $BN; $PAR at a time each, $MIN min / $TURNS turns a job, $HRS h"
  PIDS=""
  for h in ${HS//,/ }; do
    (
      O="$HO/$RUN-$h"; mkdir -p "$O"
      A=(--jobs "$HERE/jobs.jsonl" --harness "$h" --root "$R" --out "$O" --user hc --node $NODE_DIR/bin/node --qwen "$QE" --mini $MINI_DIR/bin/mini --url http://127.0.0.1:8001/v1 --model "$MODEL")
      if HC_API_KEY="${FORGE_TOKEN:-none}" $NODE_DIR/bin/node "$HERE/harness-run.mjs" "${A[@]}" --smoke; then
        HC_API_KEY="${FORGE_TOKEN:-none}" $NODE_DIR/bin/node "$HERE/harness-run.mjs" "${A[@]}" --parallel "$PAR" --job-minutes "$MIN" --turns "$TURNS" --hours "$HRS"
      else echo "$(stamp) [$h] the smoke ask failed: no jobs run in $h (see $O/smoke.txt)"; echo "smoke failed" > "$O/skipped.txt"; fi
      tar czf "$HO/leftovers-$h.tgz" -C "$R" "$h" ".work/$h" 2>/dev/null || true
    ) > "$HO/run-$h.log" 2>&1 &
    PIDS="$PIDS $!"
  done
  while true; do
    alive=0; for p in $PIDS; do kill -0 $p 2>/dev/null && alive=1; done
    for h in ${HS//,/ }; do echo "$h: $(grep -c '' "$HO/$RUN-$h/runs.jsonl" 2>/dev/null || echo 0) run(s)"; done > "$HO/progress.txt"
    [ $alive = 1 ] || break; sleep 20
  done
  wait
  for h in ${HS//,/ }; do tail -2 "$HO/run-$h.log"; done
  python3 - "$HO" <<'PY'
import json, os, sys
ho = sys.argv[1]
files = [os.path.relpath(os.path.join(d, f), ho) for d, _, fs in os.walk(ho) for f in fs]
json.dump({"done": True, "ok": True, "files": sorted(files)}, open(os.path.join(ho, "done.json"), "w"), indent=1)
PY
  echo "$(stamp) harness compare finished"
}

case "${1:-}" in install) install ;; run) shift; run "$@" ;; *) echo "harness.sh install | run <brain>"; exit 2 ;; esac
