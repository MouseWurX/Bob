#!/bin/bash
# The whole session on the rented GPU, driven by in/plan.json. Everything it makes lands in /workspace/out.
set -u
W=${FORGE_ROOT:-/workspace}; IN=$W/in; OUT=$W/out; POD=$IN/pod
# S: what every session shares on a network volume (teacher, general text, llama tools, HF cache); W: this run's own files
S=${FORGE_SHARED:-$W}
export HF_HOME=$S/hf HF_HUB_ENABLE_HF_TRANSFER=0 PYTHONUNBUFFERED=1 TOKENIZERS_PARALLELISM=false
mkdir -p $OUT $S/hf
cd $POD
fetch() { python3 -c "import sys,urllib.request,shutil; r=urllib.request.Request(sys.argv[1], headers={'User-Agent':'bob-forge/1.0'}); shutil.copyfileobj(urllib.request.urlopen(r, timeout=120), open(sys.argv[2],'wb'))" "$1" "$2"; }
status() { python3 - "$@" <<'PY'
import json,sys,time,os
p=os.environ.get("FORGE_ROOT","/workspace")+"/out/status.json"; st={}
try: st=json.load(open(p))
except Exception: pass
st.update({"phase":sys.argv[1],"detail":" ".join(sys.argv[2:]),"at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())})
st.setdefault("history",[]).append({"phase":st["phase"],"detail":st["detail"],"at":st["at"]})
json.dump(st,open(p,"w"))
PY
echo "== $(date -u +%H:%M:%S) $*"; }
die() { status failed "$*"; echo "FAILED: $*"; exit 1; }
# pod_delete: the pod removes itself through the rental service's API (the same call the time-cap watchdog makes)
pod_delete() { python3 -c "import os,urllib.request; r=urllib.request.Request('https://rest.runpod.io/v1/pods/'+os.environ['RUNPOD_POD_ID'], method='DELETE', headers={'User-Agent':'bob-forge/1.0','Authorization':'Bearer '+os.environ.get('FORGE_RUNPOD_KEY', os.environ.get('RUNPOD_API_KEY',''))}); print(urllib.request.urlopen(r).read()[:200])" >> $OUT/watchdog.log 2>&1; }
# run_done <detail>: the run's last word. 10 Nov: Bill's run finished at "done" and the PC's watcher window had died, so nobody deleted
# the pod and it billed for two idle hours. Now the pod deletes ITSELF: as soon as the PC says it has everything (in/pc-finished,
# which forge.mjs sends before its own delete), or after plan.done_grace_minutes (default 120, enough for a 13 GB download on a
# home line) if the PC never answers. The time-cap watchdog still stands behind both.
run_done() {
  status done "$*"
  local GRACE; GRACE=$(plan ".get('done_grace_minutes',120)")
  ( for i in $(seq 1 $(python3 -c "print(max(6, int($GRACE*6)))")); do [ -f $IN/pc-finished ] && break; sleep 10; done
    echo "== $(date -u +%H:%M:%S) done: $([ -f $IN/pc-finished ] && echo 'the PC has everything' || echo "no word from the PC in $GRACE minutes"); the pod deletes itself" >> $OUT/run.log 2>/dev/null
    pod_delete ) > /dev/null 2>&1 &
  disown $! 2>/dev/null || true
}
# drive_list: which Forge-made brains are REALLY usable as teacher_model on the volume (bobs/<name>/model/config.json present AND
# bobs/<name>/adapter.pt beside it; a dangling link to a dead pod disk does not count). Written to out/drive.json at setup and on
# every exit, so the PC's Lab only offers brains that exist (9 Nov: Bobert's full model never fit the 100 GB drive, only his adapter).
drive_list() { python3 - "$S" "$W" "$OUT/drive.json" <<'PY2' 2>/dev/null || true
import glob,json,os,sys,time; S,W,out=sys.argv[1:4]; models=[]
if S!=W:
    for d in sorted(glob.glob(os.path.join(S,"bobs","*"))):
        if os.path.isfile(os.path.join(d,"model","config.json")) and os.path.isfile(os.path.join(d,"adapter.pt")): models.append(f"bobs/{os.path.basename(d)}/model")
json.dump({"models":models,"volume":S!=W,"at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())},open(out,"w"))
PY2
}
# --- Hugging Face from the card (build 17). The owner's rules: every output is kept on the volume; the odds may go up as a PRIVATE
# dataset; NO Bob goes up until he has been tested at home and the owner lists him in plan.publish.models. Then the next run uploads
# him from the volume. The token comes from the PC as in/hf-token and is never written anywhere else. No owner name, host or path in a card.
hf_ok() { [ -n "$(plan ".get('publish')")" ] && [ -s $IN/hf-token ]; }
publish_dir() {   # <local dir> <repo> <what> <model|dataset> <path in repo> [include globs...]
  local D=$1 REPO=$2 WHAT=$3 TYPE=$4 SUB=$5; shift 5; local INC=(); for g in "$@"; do INC+=(--include "$g"); done
  # PUB_PRIVATE (True/False) overrides publish.private for one upload (a rebuild run sets it per Bob: a tested Bob public, an untested one private)
  local P="${PUB_PRIVATE:-$(plan "['publish'].get('private',True)")}"; local PRIV="" VIS=public; case "$P" in True|true|1) PRIV="--private"; VIS=private;; esac
  # the log goes to out/publish/ (9 Nov: a weights upload failed and its log, written beside the weights, was deleted with them; the
  # next upload's log overwrote the other copy). A failed upload is tried once more after a pause: big uploads fail on passing errors.
  mkdir -p $OUT/publish; local LOG=$OUT/publish/$(echo "$REPO-$SUB-$WHAT" | tr -c 'A-Za-z0-9\n' '-' | tr -s '-').log; : > $LOG
  # Hugging Face takes files up to 50 GB. A bigger GGUF goes up in parts (llama-gguf-split, 45 GB each, name-00001-of-0000N.gguf,
  # which llama.cpp and Bob's Lab read as one brain); the whole file stays on the volume and the parts are deleted after the upload.
  local EXC=() SPLITS=() SPLIT=$S/llama.cpp/build/bin/llama-gguf-split f
  for f in "$D"/*.gguf; do
    [ -f "$f" ] || continue; [[ "$(basename "$f")" =~ -[0-9]{5}-of-[0-9]{5}\.gguf$ ]] && continue
    [ "$(stat -c %s "$f")" -gt 49000000000 ] || continue
    if [ -x "$SPLIT" ] && ( cd "$(dirname "$SPLIT")" && LD_LIBRARY_PATH="$(dirname "$SPLIT"):${LD_LIBRARY_PATH:-}" "$SPLIT" --split --split-max-size 45G "$f" "${f%.gguf}" ) >> $LOG 2>&1; then
      EXC+=(--exclude "$(basename "$f")"); SPLITS+=("${f%.gguf}"); echo "$(basename "$f") is over 50 GB: going up in parts"
    else echo "$(basename "$f") is over 50 GB and couldn't be split (no llama-gguf-split): left out of the upload"; EXC+=(--exclude "$(basename "$f")"); fi
  done
  status publish "$WHAT: uploading to Hugging Face ($REPO, $VIS)"
  local OK=1 try; for try in 1 2; do
    if HF_TOKEN=$(cat $IN/hf-token) hf upload "$REPO" "$D" "$SUB" --repo-type $TYPE $PRIV "${INC[@]}" "${EXC[@]}" --commit-message "$WHAT from Bob's Forge" >> $LOG 2>&1; then OK=0; break; fi
    echo "$WHAT: upload failed (try $try; see out/publish/$(basename $LOG))"; tail -3 $LOG; [ $try = 1 ] && { cp $LOG $LOG.try1; sleep 30; }
  done
  for f in "${SPLITS[@]}"; do rm -f "$f"-[0-9][0-9][0-9][0-9][0-9]-of-[0-9][0-9][0-9][0-9][0-9].gguf; done
  [ $OK = 0 ] && { echo "$WHAT is on Hugging Face ($VIS): https://huggingface.co/$( [ $TYPE = dataset ] && echo datasets/ )$REPO"; return 0; }
  return 1
}
# set_visibility <repo> <model|dataset> <True|False = private>: "hf upload --private" only counts when a repo is CREATED, so a repo that
# already exists (Riker's, with his recipe) is flipped here. Best effort: a failure is said, not fatal.
set_visibility() {
  HF_TOKEN=$(cat $IN/hf-token) python3 - "$1" "$2" "$3" <<'PY' || echo "could not set the visibility of $1 (set it by hand on Hugging Face)"
import os,sys; from huggingface_hub import HfApi
repo,typ,priv=sys.argv[1:4]; api=HfApi(token=os.environ["HF_TOKEN"]); want=priv in ("True","true","1")
try: api.update_repo_settings(repo_id=repo, repo_type=typ, private=want)
except AttributeError: api.update_repo_visibility(repo_id=repo, repo_type=typ, private=want)
print(f"{repo} is now {'private' if want else 'PUBLIC'}")
PY
}
write_model_card() {   # <dir with .bob.json cards> <name> <nickname>
  python3 - "$1" "$2" "$3" "$(plan "['teacher']")" <<'PY'
import json,sys,glob; d,name,nick,teacher=sys.argv[1:5]
cards=[json.load(open(f)) for f in sorted(glob.glob(f"{d}/*.bob.json"))]; c=cards[0] if cards else {}
rows="\n".join(f"| `{x['file']}` | {x['bytes']/1e9:.1f} GB | about {x.get('vramGB','?')} GB of card memory |" for x in cards)
b=c.get("benchmark",{}); sc=b.get("scores",{}); base=b.get("baseline",{}).get("scores",{})
bench=("\n## Home benchmarks (" + b.get("date","") + ")\n\n| Test | " + name + " | " + b.get("baseline",{}).get("name","base") + " |\n|---|---|---|\n" +
       "\n".join(f"| {k} | {v} | {base.get(k,'')} |" for k,v in sc.items()) + "\n\nThe project's own tests on one machine, for comparing Bobs with each other and with the model they came from, not for leaderboards.\n") if sc else ""
md=f"""---
license: apache-2.0
base_model: {teacher}
tags: [bob, gguf, mixture-of-experts, tool-use]
---

# {name}{' ' + nick if nick else ''}

{c.get('what','A brain for the desktop assistant Bob.')}

Made by [Bob's Forge](https://github.com/MouseWurX/Bob/blob/main/app/docs/FORGE-JOURNAL.md) from [{teacher}](https://huggingface.co/{teacher})
({c.get('expertsKept','all')} experts kept per layer, about {c.get('params','?')} B parameters, {c.get('activeParams','?')} B active per word).
Method, numbers and logs are in the Forge journal.

## Files

| File | Size | Needs |
|---|---|---|
{rows}

Each GGUF has a `.bob.json` card beside it that Bob's catalogue reads when you add the file as your own brain.
{bench}
## Licence and credit

Apache 2.0, as the base model (Alibaba's Qwen team). The lessons it learned are Bob's own lesson sets (CC BY-SA 4.0) plus
openly licensed traces from other models, credited in the Forge journal. The Bob names are a tribute to Dennis E. Taylor's novels;
the project is not affiliated with the author.
"""
open(f"{d}/README.md","w").write(md)
PY
}
listed_for_publish() { python3 -c "import json,sys; sys.exit(0 if '$1' in (json.load(open('$IN/plan.json')).get('publish') or {}).get('models',[]) else 1)"; }
# keep_bob <out dir> <name> <nickname>: after export. GGUF files + cards go to the volume; quants not in plan.download_quants stay there
# (the PC skips them); the Bob is uploaded only if the owner listed him in publish.models (a tested Bob from an earlier run, or a redo).
keep_bob() {
  local D=$OUT/$1 NAME=$2 NICK=$3 FJ=$OUT/$1/$2-files.json.pending
  if [ "$S" != "$W" ]; then mkdir -p $S/bobs/$1/gguf && cp $D/*.gguf $D/*.bob.json $S/bobs/$1/gguf/ 2>/dev/null && echo "$NAME's GGUF files and cards kept on the volume (bobs/$1/gguf)"; fi
  [ -f "$FJ" ] && python3 - "$FJ" "$1" "$(plist ".get('download_quants',[])")" "$S" "$W" <<'PY'
import json,sys; p,d,dq,S,W=sys.argv[1:6]; j=json.load(open(p)); dq=[q for q in dq.split(",") if q]
for f in j["files"]:
    if f["file"].endswith(".gguf") and dq and S!=W and not any(f["file"].endswith(f"-{q}.gguf") for q in dq): f["volume"]=f"bobs/{d}/gguf/{f['file']}"
json.dump(j,open(p,"w"),indent=1)
PY
  if hf_ok && listed_for_publish "$NAME"; then
    write_model_card $D "$NAME" "$NICK"
    publish_dir $D "$(plan "['publish']['user']")/$NAME${NICK:+-$NICK}" "$NAME" model . "*.gguf" "*.bob.json" "README.md" && [ -f "$FJ" ] && python3 - "$FJ" "$(plan "['publish']['user']")/$NAME${NICK:+-$NICK}" <<'PY'
import json,sys; p=sys.argv[1]; j=json.load(open(p))
for f in j["files"]:
    if f["file"].endswith(".gguf"): f["published"]=f"https://huggingface.co/{sys.argv[2]}/blob/main/{f['file']}"
j["repo"]=sys.argv[2]; json.dump(j,open(p,"w"),indent=1)
PY
  fi
  return 0
}
# publish_tested: Bobs the owner listed in publish.models that sit on the volume from an earlier run (tested at home since) go up now
publish_tested() {
  hf_ok || return 0
  for n in $(plist "['publish'].get('models',[])" | tr , ' '); do
    [ -d $S/bobs/$n/gguf ] || continue; [ "$n" = "${TNAME:-}" ] && continue
    local NICK; NICK=$(python3 -c "import json,glob; c=sorted(glob.glob('$S/bobs/$n/gguf/*.bob.json')); print(json.load(open(c[0])).get('nickname','') if c else '')")
    write_model_card $S/bobs/$n/gguf "$n" "$NICK"
    publish_dir $S/bobs/$n/gguf "$(plan "['publish']['user']")/$n${NICK:+-$NICK}" "$n" model . "*.gguf" "*.bob.json" "README.md" || true
  done
}
# export.py writes <name>-files.json.pending; the PC only starts downloading once it is renamed, after keep_bob has marked the files
release_files() { [ -f $OUT/$1/$2-files.json.pending ] && mv $OUT/$1/$2-files.json.pending $OUT/$1/$2-files.json; return 0; }
plan() { python3 -c "import json,sys; p=json.load(open('$IN/plan.json')); v=p$1; print(json.dumps(v) if isinstance(v,(dict,list)) else ('' if v is None else v))" || echo "plan lookup failed: $1" >&2; }
# hf_get/resolve_in are used by the rebuild AND benchmark sections, so they live here (9 Nov: a run died with "resolve_in: command not found" when they sat below the rebuild block)
hf_get() {   # hf_get <repo> <path> <dir>: one file from Hugging Face with the pod's token (private repos too)
  HF_TOKEN=$(cat $IN/hf-token 2>/dev/null) hf download "$1" "$2" --local-dir "$3" > /dev/null 2>&1 && [ -f "$3/$2" ]; }
resolve_in() {   # resolve_in <spec> <dir> -> path: "hf:<repo>:<path>" is downloaded, anything else is a file in in/
  case "$1" in hf:*) local R P; R=$(echo "$1" | cut -d: -f2); P=$(echo "$1" | cut -d: -f3); hf_get "$R" "$P" "$2" && echo "$2/$P" ;; "") echo "" ;; *) echo "$IN/$1" ;; esac; }
plist() { plan "$1" | python3 -c "import json,sys; d=sys.stdin.read().strip(); print(','.join(json.loads(d)) if d else '')"; }   # a list field as a,b,c
# REAP scoring (plan "score": "reap" or "mass"; left out or "counts" = pick counts, as every Bob so far). With it the counting
# passes also record router weight x output size per expert (reap.py) and keep.py / prune.py judge the experts by that.
SCORE=$(plan ".get('score','counts')"); case "$SCORE" in reap|mass) REAP=--reap;; *) SCORE=counts; REAP=;; esac
# a plain cut can only use the score when its counts file carries the REAP table (one counted on the PC does not)
cutby() { [ "$SCORE" != counts ] && python3 -c "import json,sys; sys.exit(0 if json.load(open('$1')).get('mass') else 1)" 2>/dev/null && echo $SCORE || echo counts; }
HOURS_MAX=$(plan ".get('hours_max',9)")
# Self-destruct a little before the time cap, whatever happens (the PC-side watchdog is the main one).
# elapsed = container age (from the init process start), never the host's uptime, so a --restart keeps counting from the rent.
# 13 Nov: the cap is read again from in/plan.json every minute, so forge.mjs --send-plan with a new hours_max moves it on a
# live pod (both ways) without stopping the run. A plan that can't be read keeps the cap the run started with.
# plan.rented_at (the PC sends it): the age counts from the rent, also after a pod reset (a reset starts the container again)
RENTED=$(plan ".get('rented_at','')" 2>/dev/null); case "$RENTED" in ''|*[!0-9]*) RENTED=;; esac
age() { if [ -n "$RENTED" ]; then python3 -c "import time; print(max(0, int(time.time() - $RENTED)))"; else python3 -c "import os; up=float(open('/proc/uptime').read().split()[0]); st=int(open('/proc/1/stat').read().rsplit(')',1)[1].split()[19])/os.sysconf('SC_CLK_TCK'); print(int(up-st))" 2>/dev/null || echo 0; fi; }
ELAPSED=$(age)
( while :; do H=$(plan ".get('hours_max',$HOURS_MAX)" 2>/dev/null); case "$H" in ''|*[!0-9.]*) H=$HOURS_MAX;; esac
    python3 -c "import sys; sys.exit(0 if $(age) >= max($ELAPSED + 300, ($H*60-8)*60) else 1)" && break; sleep 60; done
  status failed "time cap reached, pod deleting itself"; \
  python3 -c "import os,urllib.request; r=urllib.request.Request('https://rest.runpod.io/v1/pods/'+os.environ['RUNPOD_POD_ID'], method='DELETE', headers={'User-Agent':'bob-forge/1.0','Authorization':'Bearer '+os.environ.get('FORGE_RUNPOD_KEY', os.environ.get('RUNPOD_API_KEY',''))}); print(urllib.request.urlopen(r).read()[:200])" >> $OUT/watchdog.log 2>&1 ) &
WD=$!; trap 'drive_list; kill $WD 2>/dev/null' EXIT 

status setup "installing tools"
pip install -q aiohttp gguf sentencepiece huggingface_hub pyarrow accelerate 2>&1 | tail -1
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || echo "no nvidia-smi"
df -h $W | tail -1; [ "$S" != "$W" ] && { echo "shared volume: $S"; ls $S; }
drive_list   # the PC learns right away which Forge-made brains the drive really holds
# fast kernels for the linear-attention layers (flash-linear-attention + causal-conv1d). Built in the background while the teacher
# downloads; the teacher pass and every heal WAIT for them (build 15: before this they ran without the kernels if the compile was late).
# causal-conv1d compiles for ~10 min, so the finished wheel is kept on the volume per card type and reused next time (seconds).
GPUTAG=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | tr -c 'A-Za-z0-9\n' '_'); WHEELS=$S/wheels/${GPUTAG:-unknown}
# FINDING (rental 2's log): "pip install causal-conv1d" reported success in every run, yet transformers said "causal_conv1d is not
# installed" at every model load, teacher pass and heal included. An isolated pip build compiles the kernel against a torch it
# downloads for the build, not the image's torch, so the import fails and transformers falls back to the slow path. So: build with
# --no-build-isolation against the image's own torch, and count the kernels as ready only when they IMPORT.
conv_ok() { python3 -c "from causal_conv1d import causal_conv1d_fn" >/dev/null 2>&1; }
kernels() {
  local rc=1
  pip install -q flash-linear-attention ninja packaging
  if pip install -q --no-index --no-deps --find-links $WHEELS causal-conv1d 2>/dev/null && conv_ok; then echo "causal-conv1d from the saved wheel ($WHEELS)"; rc=0
  else
    pip uninstall -q -y causal-conv1d 2>/dev/null; rm -f $WHEELS/causal_conv1d* 2>/dev/null; mkdir -p $WHEELS
    echo "building causal-conv1d against this image's torch (about 10 min)"
    if pip wheel -q --no-deps --no-build-isolation --no-binary causal-conv1d -w $WHEELS causal-conv1d && pip install -q --no-index --no-deps --find-links $WHEELS causal-conv1d && conv_ok; then echo "causal-conv1d built and imports"; rc=0
    else echo "causal-conv1d does not import after the build"; rm -f $WHEELS/causal_conv1d* 2>/dev/null; rc=1; fi
  fi
  python3 -c "import fla; print('fla', fla.__version__)" 2>&1 | tail -1
  echo "kernels done $rc"
}
LESSONS_ONLY=$(plan ".get('lessons_only','')")
TG=$(plan ".get('teacher_gguf','')")
BENCH_ONLY=$(plan ".get('benchmark_only','')")
# (14 Nov 2026: these kernels are for Qwen3.5/3.6's linear attention; a GPT-OSS run has none, so it does not build or wait for them)
QWEN_TEACHER=$(plan ".get('teacher','')" | grep -q '^Qwen/' && echo 1 || true)
if [ -z "${FORGE_SETUP_ONLY:-}" ] && [ -z "$LESSONS_ONLY" ] && [ "$BENCH_ONLY" != "True" ] && [ -n "$QWEN_TEACHER" ] && ! grep -q "kernels done 0" $OUT/kernels.log 2>/dev/null; then ( kernels > $OUT/kernels.log 2>&1 ) & KERN=$!; else echo "kernels done 0 (not needed)" >> $OUT/kernels.log; KERN=""; fi
# wait for the kernels (up to 30 min); a failed build is reported and the run goes on without them (slower, not wrong)
kernels_ready() {
  if [ -n "${KERN:-}" ] && kill -0 $KERN 2>/dev/null; then status setup "waiting for the fast kernels to finish building"; for i in $(seq 1 180); do kill -0 $KERN 2>/dev/null || break; sleep 10; done; fi
  if grep -q "kernels done 0" $OUT/kernels.log 2>/dev/null; then python3 -c "import causal_conv1d, fla; print('fast kernels ready: causal-conv1d', causal_conv1d.__version__, 'fla', fla.__version__)" 2>&1 | tail -1
  else echo "fast kernels NOT ready (see out/kernels.log); carrying on without them"; tail -3 $OUT/kernels.log 2>/dev/null; fi
}
# llama.cpp tools get ready in the background (needed only at export time); see llama-tools.sh
if [ -f $S/llama-ready ]; then echo "llama tools already built"; else
  rm -f $S/llama-failed; ( bash $POD/llama-tools.sh $S $(plan ".get('llama_tag','b11669')") > $OUT/llama-setup.log 2>&1 ) &
fi
# build 18: a CUDA llama-server for the benchmark phase, built in the background while the run trains (kept on the volume)
if [ -n "$(plan ".get('benchmark')")" ] || [ -n "$TG" ]; then
  # 12 Nov: benchmark.brain_engine {"ref": "<Bob commit>", "patches": ["0001-expert-mask", ...]} serves the brains with Brain Engine
  # (llama.cpp plus Bob's patches, fetched from Bob's public repo at that commit), for the live expert switch and REAP scores
  # 14 Nov: a patch named "pod:<name>" is a lab-only patch sent with the pod scripts ($POD/<name>.patch), not one of Bob's engine
  # patches (0014-live-control-vector: activation steering without reloads, for the Riker steering sweeps)
  BEP=$(plan ".get('benchmark',{}).get('brain_engine') or {}" | python3 -c "import json,sys; b=json.load(sys.stdin); pod=sys.argv[1]; print(' '.join(('file://%s/%s.patch' % (pod, n[4:])) if n.startswith('pod:') else 'https://raw.githubusercontent.com/MouseWurX/Bob/%s/app/engine/patches/%s.patch' % (b['ref'], n) for n in b.get('patches',[])) if b else '')" "$POD")
  if [ -f $S/llama-server-ready ] && [ -x $S/llama.cpp/build-cuda/bin/llama-server ] && [ "$(cat $S/llama.cpp/.bob-patches 2>/dev/null)" = "$BEP" ]; then echo "CUDA llama-server already built"; else rm -f $S/llama-server-ready $S/llama-server-failed; ( bash $POD/llama-server-build.sh $S $(plan ".get('llama_tag','b11669')") "$BEP" > $OUT/llama-server-build.log 2>&1 ) & fi
fi
[ -n "${FORGE_SETUP_ONLY:-}" ] && { kill $WD 2>/dev/null; wait; cat $OUT/llama-setup.log; status done "setup only"; exit 0; }
# --- benchmark on the card (build 18): the same brains, the same tests, a big card. The pod serves one brain at a time with a CUDA
# llama-server on port 8001 (the PC runs its own test scripts over the URL, so home and rental numbers come from identical tests);
# a brain can be rebuilt from the stock teacher + keep list + adapter (the owner's point, 8 Nov: no 17 GB upload from the PC).
# plan.benchmark: {"models":[{"name":"28Bob","nickname":"Riker","file":"rebuild","keep_file":"hf:MouseWurX/28Bob-Riker:28Bob-keep.json",
#   "adapter":"hf:MouseWurX/28Bob-Riker:28Bob-adapter.pt","cards":"hf:MouseWurX/28Bob-Riker","quant":"Q4_K_M","slots":1,"ctx":32768,"extra":""},
#   {"name":"35Bob","file":"volume:bobs/35Bob/gguf/35Bob-Q4_K_M.gguf"}, {"name":"20Bob","file":"out:20Bob/20Bob-Q4_K_M.gguf"}], "hours_each":2}
# file: rebuild | hf:<repo>:<path> | volume:<path on the drive> | out:<path in this run's out>. keep_file/adapter: hf:<repo>:<path> or a file the PC sent to in/.
run_bench() {
  for i in $(seq 1 120); do [ -f $S/llama-server-ready ] || [ -f $S/llama-server-failed ] && break; sleep 20; done
  LS=$S/llama.cpp/build-cuda/bin/llama-server; export LD_LIBRARY_PATH="$S/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}"
  [ -f $S/llama-server-cmake.log ] && cp -f $S/llama-server-cmake.log $OUT/ 2>/dev/null || true
  if [ -f $S/llama-server-ready ] && [ -x $LS ]; then
    declare -A GOT
    NB=$(plan "['benchmark']['models']" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"); mkdir -p $W/bench $OUT/bench
    for b in $(seq 0 $((NB-1))); do
      BN=$(plan "['benchmark']['models'][$b]['name']"); BF=$(plan "['benchmark']['models'][$b].get('file','')"); BQ=$(plan "['benchmark']['models'][$b].get('quant','Q4_K_M')"); BNICK=$(plan "['benchmark']['models'][$b].get('nickname','')")
      case "$BF" in
        rebuild)
          BFILE=$S/bobs/$BN/gguf/$BN-$BQ.gguf
          if [ ! -f "$BFILE" ]; then
            KFP=$(resolve_in "$(plan "['benchmark']['models'][$b].get('keep_file','')")" $W/bench/in-$BN); ADP=$(resolve_in "$(plan "['benchmark']['models'][$b].get('adapter','')")" $W/bench/in-$BN)
            [ -f $S/bobs/$BN/bob-keep.json ] && [ ! -f "$KFP" ] && KFP=$S/bobs/$BN/bob-keep.json; [ -f $S/bobs/$BN/adapter.pt ] && [ ! -f "$ADP" ] && ADP=$S/bobs/$BN/adapter.pt
            { [ -f "$KFP" ] && [ -f "$ADP" ]; } || { echo "bench $BN: keep list or adapter missing (plan keep_file/adapter, or volume bobs/$BN); skipped"; continue; }
            status bench "$BN: rebuilding from the stock teacher, his keep list and his adapter"
            python3 rebuild.py --teacher $TS --keep-file "$KFP" --adapter "$ADP" --dst $W/bench/rebuilt-$BN --name $BN > $OUT/bench/$BN-rebuild.log 2>&1 || { echo "bench $BN: rebuild failed (see out/bench/$BN-rebuild.log)"; continue; }
            mkdir -p $S/bobs/$BN && cp "$KFP" $S/bobs/$BN/bob-keep.json && cp "$ADP" $S/bobs/$BN/adapter.pt
            status export "$BN: making the GGUF files again"
            rm -rf "${OUT:?}"/"${BN:?}"; python3 export.py --model $W/bench/rebuilt-$BN --out $OUT/$BN --name "$BN" --nickname "$BNICK" --teacher "$TEACHER" --jobs "$(plan ".get('jobs','bob,deep,tinker,reviewer,office,ledger,scout')")" --llama $S/llama.cpp --quants $(plan ".get('quants','Q4_K_M')") --pending > $OUT/bench/$BN-export.log 2>&1 || { echo "bench $BN: export failed (see out/bench/$BN-export.log)"; continue; }
            rm -rf "${W:?}"/bench/rebuilt-"${BN:?}"
            # the home benchmark block comes from the scored cards (plan cards: hf:<repo> or cards the PC sent to in/); the rebuilt files get it
            CSRC=$(plan "['benchmark']['models'][$b].get('cards','')"); mkdir -p $W/bench/cards-$BN
            case "$CSRC" in hf:*) for f in $OUT/$BN/*.bob.json; do hf_get "${CSRC#hf:}" "$(basename $f)" $W/bench/cards-$BN || true; done ;; *) cp $IN/$BN-*.bob.json $W/bench/cards-$BN/ 2>/dev/null ;; esac
            python3 - $OUT/$BN $W/bench/cards-$BN <<'PY'
import json,glob,os,sys; d,c=sys.argv[1:3]
for f in glob.glob(f"{d}/*.bob.json"):
    o=os.path.join(c,os.path.basename(f))
    if os.path.exists(o):
        new=json.load(open(f)); old=json.load(open(o))
        if old.get("benchmark"): new["benchmark"]=old["benchmark"]; json.dump(new,open(f,"w"),indent=1); print("benchmark block kept for",os.path.basename(f))
PY
            keep_bob $BN "$BN" "$BNICK"
            # the PC already has this Bob: every file stays on the volume (nothing re-downloaded)
            [ -f $OUT/$BN/$BN-files.json.pending ] && python3 - $OUT/$BN/$BN-files.json.pending $BN <<'PY'
import json,sys; p,d=sys.argv[1:3]; j=json.load(open(p))
for f in j["files"]:
    if f["file"].endswith(".gguf") and not f.get("published"): f["volume"]=f"bobs/{d}/gguf/{f['file']}"
json.dump(j,open(p,"w"),indent=1)
PY
            release_files $BN "$BN"
          fi ;;
        hf:*) REPO=$(echo "$BF" | cut -d: -f2); FP=$(echo "$BF" | cut -d: -f3); status bench "$BN: downloading $FP from Hugging Face"
          # 12 Nov: a split GGUF (name-00001-of-0000N.gguf) brings all its parts; llama-server loads them from the first
          case "$FP" in *-00001-of-*.gguf) HF_TOKEN=$(cat $IN/hf-token 2>/dev/null) hf download "$REPO" --include "${FP%%-00001-of-*}-*-of-*.gguf" --local-dir $W/bench/hf-$BN > /dev/null 2>&1 && [ -f "$W/bench/hf-$BN/$FP" ] ;; *) hf_get "$REPO" "$FP" $W/bench/hf-$BN ;; esac || { echo "bench $BN: download failed"; continue; }
          BFILE=$W/bench/hf-$BN/$FP ;;
        same:*) BFILE=${GOT[${BF#same:}]:-}; [ -n "$BFILE" ] || { echo "bench $BN: no earlier brain called ${BF#same:} to reuse"; continue; } ;;   # 12 Nov: serve an earlier entry's file again (another expert count), no new download
        volume:*) BFILE=$S/${BF#volume:} ;;
        out:*) BFILE=$OUT/${BF#out:} ;;
        *) echo "bench $BN: unknown file spec '$BF'"; continue ;;
      esac
      [ -f "$BFILE" ] || { echo "bench $BN: $BFILE is missing; skipped"; continue; }
      GOT[$BN]=$BFILE
      # 13 Nov: evil_check true = before serving, llama-cvector-generator reads the brain on the evil-pairs.json contrast (the same ask
      # with a kind or a cruel persona) by the difference of means, three times (all pairs, first half, second half: how steady the
      # direction is per layer). Measure only: nothing is applied or written to the brain. The PC fetches out/bench/evil-<name>/ first.
      if [ "$(plan "['benchmark']['models'][$b].get('evil_check',False)")" = "True" ]; then
        CV=$S/llama.cpp/build-cuda/bin/llama-cvector-generator; ED=$OUT/bench/evil-$BN; mkdir -p $ED $W/bench/evil-$BN
        if [ -x "$CV" ] && [ -f $POD/evil-pairs.json ]; then
          status bench "$BN: evil check, reading the direction (measure only)"
          python3 - $POD/evil-pairs.json $W/bench/evil-$BN <<'PY'
import json,sys; src,d=sys.argv[1:3]; j=json.load(open(src)); t=j["template"]
pairs=[(t.format(persona=j["evil"][i%len(j["evil"])],ask=a), t.format(persona=j["kind"][i%len(j["kind"])],ask=a)) for i,a in enumerate(j["asks"])]
h=len(pairs)//2
for part,ps in (("all",pairs),("a",pairs[:h]),("b",pairs[h:])):
    open(f"{d}/pos-{part}.txt","w").write("\n".join(p for p,_ in ps)+"\n"); open(f"{d}/neg-{part}.txt","w").write("\n".join(n for _,n in ps)+"\n")
print(len(pairs),"pairs")
PY
          for part in all a b; do
            LD_LIBRARY_PATH="$S/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}" timeout 1800 $CV -m "$BFILE" --positive-file $W/bench/evil-$BN/pos-$part.txt --negative-file $W/bench/evil-$BN/neg-$part.txt -o $ED/direction-$part.gguf --method mean -ngl 999 > $ED/cvector-$part.log 2>&1 || echo "bench $BN: evil direction ($part) failed (see out/bench/evil-$BN/cvector-$part.log)"
          done
        else echo "bench $BN: no llama-cvector-generator or evil-pairs.json; the evil check reads experts only" | tee $ED/no-direction.txt; fi
      fi
      # 13 Nov: imatrix true = llama-imatrix on every text the PC sent (in/imatrix-<name>.tgz: all.txt and job-<job>.txt), before serving;
      # the importance data a job-tuned quant or adapter uses later. The PC fetches out/bench/imatrix-<name>/ first.
      if [ "$(plan "['benchmark']['models'][$b].get('imatrix',False)")" = "True" ]; then
        IM=$S/llama.cpp/build-cuda/bin/llama-imatrix; ID=$OUT/bench/imatrix-$BN; mkdir -p $ID $W/bench/imx-$BN
        if [ -x "$IM" ] && [ -f $IN/imatrix-$BN.tgz ] && tar xzf $IN/imatrix-$BN.tgz -C $W/bench/imx-$BN; then
          for t in $W/bench/imx-$BN/*.txt; do
            [ -f "$t" ] || continue; n=$(basename "$t" .txt); status bench "$BN: imatrix $n"
            LD_LIBRARY_PATH="$S/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}" timeout 1800 $IM -m "$BFILE" -f "$t" -o $ID/$n.imatrix.gguf -c 2048 -ngl 999 --chunks $(plan "['benchmark']['models'][$b].get('imatrix_chunks',200)") > $ID/$n.log 2>&1 || echo "bench $BN: imatrix $n failed (see out/bench/imatrix-$BN/$n.log)"
          done
        else echo "bench $BN: no llama-imatrix or no in/imatrix-$BN.tgz; imatrix skipped" | tee $ID/skipped.txt; fi
      fi
      # 14 Nov: @OUT@ in a model's extra is this pod's out folder (a steering entry's --control-vector-scaled names an earlier
      # entry's evil direction, out/bench/evil-<name>/direction-all.gguf, without knowing where the pod keeps it)
      BEXTRA=$(plan "['benchmark']['models'][$b].get('extra','')"); BEXTRA=${BEXTRA//@OUT@/$OUT}
      SLOTS=$(plan "['benchmark']['models'][$b].get('slots',1)"); CTX=$(plan "['benchmark']['models'][$b].get('ctx',32768)")
      status bench "$BN: loading on the card ($(basename $BFILE))"
      LD_LIBRARY_PATH="$S/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}" $LS -m "$BFILE" --host 0.0.0.0 --port 8001 --api-key "$FORGE_TOKEN" -c $CTX --jinja -fa on -ctk q8_0 -ctv q8_0 -np $SLOTS -ngl 999 $BEXTRA > $OUT/bench/$BN-server.log 2>&1 &
      BS=$!
      for i in $(seq 1 90); do curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/health 2>/dev/null | grep -q 200 && break; kill -0 $BS 2>/dev/null || break; sleep 10; done
      kill -0 $BS 2>/dev/null || { echo "bench $BN: llama-server died (see out/bench/$BN-server.log)"; tail -3 $OUT/bench/$BN-server.log; continue; }
      rm -f $IN/bench-done-$BN
      status bench "$BN ready: the PC runs the tests now (port 8001, $SLOTS slot(s), ctx $CTX)"
      BH=$(plan "['benchmark']['models'][$b].get('hours', p['benchmark'].get('hours_each',2))")   # 13 Nov: a model can have its own hours
      for i in $(seq 1 $(python3 -c "print(int($BH*120))")); do [ -f $IN/bench-done-$BN ] && break; kill -0 $BS 2>/dev/null || { echo "bench $BN: the server died during the tests"; break; }; sleep 30; done
      kill $BS 2>/dev/null; wait $BS 2>/dev/null; sleep 3
      if [ -f $IN/bench-done-$BN ]; then echo "bench $BN: the PC finished its tests"; else echo "bench $BN: time ran out (hours_each $BH)"; fi
    done
    status bench "finished: the reports are on the PC under out/bench"
  else echo "bench: no CUDA llama-server (see out/llama-server-build.log); skipped"; status bench "skipped: no CUDA llama-server"; fi
}
# --- benchmark only (10 Nov): plan.benchmark_only true = rent a card, serve the listed brains, let the PC run its tests, done.
# No teacher, no lessons, no odds, no volume needed: a brain given as hf:<repo>:<path> comes from Hugging Face with the pod's token
# (private repos too), so the card can be in any data centre, even while another run holds the drive. "rebuild" needs the teacher
# and is refused here. The pod's whole cost is the llama-server build (~10-15 min) plus the tests.
if [ "$(plan ".get('benchmark_only',False)")" = "True" ]; then
  [ -n "$(plan ".get('benchmark')")" ] || die "benchmark_only: plan.benchmark is missing"
  for f in $(plan "['benchmark']['models']" | python3 -c "import json,sys; print(' '.join(m.get('file','') for m in json.load(sys.stdin)))"); do
    case "$f" in rebuild|volume:*|out:*) die "benchmark_only: '$f' needs a teacher, a drive or a run; give the brain as hf:<repo>:<path>";; esac
  done
  run_bench
  rm -f $IN/hf-token
  run_done "benchmark finished: the reports are on the PC under out/bench"; exit 0
fi
TEACHER=$(plan "['teacher']")
# 14 Nov 2026, GPT-OSS in the Forge: a teacher that is not a Qwen gets its own folder on the drive (teachers/<org>_<name>), so the
# Qwen teacher already there is never mixed with it; OpenAI's repos also hold a second copy in their own format (original/, metal/)
# that the Forge never reads, so it is not downloaded (saves about 65 GB on the 120B).
case "$TEACHER" in Qwen/*) TS=$S/teacher; TEX=();; *) TS=$S/teachers/${TEACHER//\//_}; TEX=(--exclude "original/*" --exclude "metal/*");; esac
TREV=$(plan ".get('teacher_revision','')"); REV=(); [ -n "$TREV" ] && REV=(--revision "$TREV")   # pin the teacher to one HF revision (the Lab sets it when the owner gives one)
dl() { hf download "$@" >/dev/null 2>$OUT/hf-dl.log || { echo "download retry (plain)"; HF_HUB_ENABLE_HF_TRANSFER=0 hf download "$@" >/dev/null 2>>$OUT/hf-dl.log; }; }
TGF=""
if [ -n "$TG" ]; then
  # build 19: a GGUF teacher (any llama.cpp model on Hugging Face) that only writes lessons through llama-server; no scores, no heal
  TGR=$(plan "['teacher_gguf']['repo']"); TGP=$(plan "['teacher_gguf']['file']")
  status download "teacher GGUF ($TGR, $TGP${TREV:+ @ $TREV})"
  dl "$TGR" --include "$TGP" --local-dir $S/teacher-gguf "${REV[@]}" || die "teacher GGUF download (see out/hf-dl.log)"
  TGF=$(find $S/teacher-gguf -name "$TGP" -name '*.gguf' | sort | head -1)   # the first part of a split file loads the rest
  [ -f "$TGF" ] || die "no GGUF in $TGR matched $TGP"
  du -sh $S/teacher-gguf; echo "teacher GGUF: $(basename "$TGF")"
  GENERAL_TOKENS=0
else
status download "teacher weights ($TEACHER${TREV:+ @ $TREV})"
dl "$TEACHER" --local-dir $TS "${REV[@]}" "${TEX[@]}" || die "teacher download (see out/hf-dl.log)"
[ -f $TS/config.json ] && ls $TS/*.safetensors >/dev/null 2>&1 || die "teacher download incomplete"
du -sh $TS
[ "$S" != "$W" ] && echo "volume: $(df -h $S | awk 'NR==2{print $4" free of "$2}') (a trained teacher needs about 70 GB more; the odds about 20 GB)"
GENERAL_TOKENS=$(plan ".get('general_tokens',30000000)")
fi
if [ "$GENERAL_TOKENS" -gt 0 ] && [ ! -d $S/general ]; then
  status download "general text (FineWeb-Edu sample + Tulu 3 chats)"
  dl HuggingFaceFW/fineweb-edu --repo-type dataset --include "sample/10BT/000_00000.parquet" --local-dir $S/general/fineweb-edu || echo "FineWeb-Edu download failed (going on without it)"
  dl allenai/tulu-3-sft-mixture --repo-type dataset --include "data/train-00000-of-*.parquet" --local-dir $S/general/tulu3 || echo "Tulu 3 download failed (going on without it)"
  find $S/general -name '*.parquet' | head
fi
GEN="--general $S/general --general-tokens $GENERAL_TOKENS"
# several training targets in one run (plan.targets, 13 Nov): {name: {jobs: [...], weight: w}}; every report split by target
TGT=""; if [ -n "$(plan ".get('targets')")" ]; then plan ".get('targets')" > $IN/targets.json; TGT="--targets $IN/targets.json"; echo "targets: $(cat $IN/targets.json)"; fi
# right-vs-wrong answers for preference training (plan.pref, made on the PC by make-pairs.mjs): one folder the heal reads
if [ -f $IN/pref-pairs.jsonl ] || [ -f $IN/pref-kto.jsonl ]; then
  mkdir -p $IN/pref; for f in pairs.jsonl kto.jsonl toolsets.json; do [ -f $IN/pref-$f ] && mv $IN/pref-$f $IN/pref/$f; done
  echo "preference data: $(cat $IN/pref/pairs.jsonl 2>/dev/null | wc -l) pairs, $(cat $IN/pref/kto.jsonl 2>/dev/null | wc -l) marked answers"
fi

# --- extra lessons written on this card (plan.write_lessons): vLLM serves the full Qwen, the PC's lesson writer talks to it ---
WL=$(plan ".get('write_lessons')")
wl() { python3 -c "import json; w=json.load(open('$IN/plan.json'))['write_lessons']; w=w if isinstance(w,list) else [w]; print($1)"; }   # one set or a list of sets
if [ -z "$WL" ] && ls $IN/lessons-extra-*.jsonl >/dev/null 2>&1; then touch $IN/lessons-ready; fi   # only PC-side extra sets: nothing to write, just merge
if { [ -n "$WL" ] || [ -f $IN/lessons-ready ]; } && [ ! -f $IN/lessons-merged ]; then
  if [ ! -f $IN/lessons-ready ] && [ -n "$TGF" ]; then
    # build 19: wait for the CUDA llama-server (built in the background since setup), then serve the GGUF teacher on port 8001
    status lessons "waiting for the CUDA llama-server build (teacher GGUF $(basename "$TGF"))"
    for i in $(seq 1 240); do [ -f $S/llama-server-ready ] || [ -f $S/llama-server-failed ] && break; sleep 10; done
    LS=$S/llama.cpp/build-cuda/bin/llama-server; export LD_LIBRARY_PATH="$S/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}"
    [ -f $S/llama-server-cmake.log ] && cp -f $S/llama-server-cmake.log $OUT/ 2>/dev/null || true   # keep the build log where salvage can find it
    [ -x $LS ] || die "no CUDA llama-server for the GGUF teacher (see out/llama-server-build.log and out/llama-server-cmake.log)"
    TSLOTS=$(plan "['teacher_gguf'].get('slots',6)"); TCTX=$(plan "['teacher_gguf'].get('ctx',32768)")
    status lessons "loading the teacher GGUF on the card ($TSLOTS slots, $TCTX each)"
    ( LD_LIBRARY_PATH="$S/llama.cpp/build-cuda/bin:${LD_LIBRARY_PATH:-}" $LS -m "$TGF" --host 0.0.0.0 --port 8001 --api-key "$FORGE_TOKEN" --alias teacher -c $((TCTX * TSLOTS)) --jinja -fa on -ctk q8_0 -ctv q8_0 -np $TSLOTS -ngl 999 \
        $(plan "['teacher_gguf'].get('extra','')") > $OUT/teacher-server.log 2>&1 ) &
    VL=$!
    for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/health 2>/dev/null | grep -q 200 && break; kill -0 $VL 2>/dev/null || die "llama-server died (see out/teacher-server.log)"; sleep 10; done
    curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/health | grep -q 200 || die "llama-server never came up (see out/teacher-server.log)"
    status lessons "ready: the PC writes the lessons now (port 8001, GGUF teacher)"
    LW_MAX=$(python3 -c "print(int(($(wl "sum(x.get('hours',1.5) for x in w)")+0.5)*120))")
    for i in $(seq 1 $LW_MAX); do [ -f $IN/lessons-ready ] && break; kill -0 $VL 2>/dev/null || { status lessons "llama-server died while writing; waiting for the PC to finish or retry"; }; sleep 30; done
    [ -f $IN/lessons-ready ] || die "the PC never sent the extra lessons"
    kill $VL 2>/dev/null; sleep 3; pkill -9 -f "llama-server" 2>/dev/null; sleep 2
  elif [ ! -f $IN/lessons-ready ]; then
    status lessons "starting the full Qwen server for the lesson writer"
    ( vllm serve $TS --served-model-name teacher --port 8001 --api-key "$FORGE_TOKEN" --max-model-len $(wl "max(x.get('ctx',32768) for x in w)") \
        --gpu-memory-utilization 0.90 --max-num-seqs $(wl "max(x.get('seqs',32) for x in w)") --enable-auto-tool-choice --tool-call-parser qwen3_coder --reasoning-parser qwen3 \
        > $OUT/vllm.log 2>&1 ) &
    VL=$!
    for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $FORGE_TOKEN" http://127.0.0.1:8001/v1/models 2>/dev/null | grep -q 200 && break; kill -0 $VL 2>/dev/null || die "vLLM died (see out/vllm.log)"; sleep 10; done
    curl -s -H "Authorization: Bearer $FORGE_TOKEN" http://127.0.0.1:8001/v1/models | grep -q teacher || die "vLLM never came up (see out/vllm.log)"
    status lessons "ready: the PC writes the lessons now (port 8001)"
    LW_MAX=$(python3 -c "print(int(($(wl "sum(x.get('hours',1.5) for x in w)")+0.5)*120))")
    for i in $(seq 1 $LW_MAX); do [ -f $IN/lessons-ready ] && break; kill -0 $VL 2>/dev/null || { status lessons "vLLM died while writing; waiting for the PC to finish or retry"; }; sleep 30; done
    [ -f $IN/lessons-ready ] || die "the PC never sent the extra lessons"
    pkill -f "vllm serve" 2>/dev/null; sleep 5; pkill -9 -f "vllm" 2>/dev/null
    for i in $(seq 1 60); do U=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | head -1); [ "${U:-0}" -lt 4000 ] && break; sleep 5; done
  fi
  if [ -n "$LESSONS_ONLY" ]; then
    N=$(cat $IN/lessons-ready 2>/dev/null || echo 0)
    if [ "$S" != "$W" ]; then LD=$S/lessons/$(plan ".get('run','run')"); mkdir -p $LD; cp $IN/lessons-extra-*.jsonl $IN/toolsets-extra-*.json $LD/ 2>/dev/null; cp $OUT/*.log $LD/ 2>/dev/null; echo "lessons kept on the volume at $LD"; fi
    rm -f $IN/hf-token
    run_done "lessons only: $N lessons written; they are on the PC"
    exit 0
  fi
  status lessons "merging the extra lessons"
  python3 - $IN <<'PY' || die "lesson merge"
import json,sys,os,glob; d=sys.argv[1]
import hashlib
sets=json.load(open(f"{d}/toolsets.json")); n=0
# the tag is a hash of the set's CONTENT, not its upload slot, and the sets are merged in tag order: the same sets give the
# same merged file whether they came from the PC or were written on the card, so the teacher-score cache key and the piece ids match
extras=sorted((hashlib.sha256(open(lf,"rb").read()).hexdigest()[:8], lf) for lf in glob.glob(f"{d}/lessons-extra-*.jsonl"))
with open(f"{d}/lessons.jsonl","a") as f:
    for tag, lf in extras:
        slot=os.path.basename(lf)[len("lessons-extra-"):-len(".jsonl")]
        tf=f"{d}/toolsets-extra-{slot}.json"
        if os.path.exists(tf): sets.update(json.load(open(tf)))
        for line in open(lf):
            if not line.strip(): continue
            l=json.loads(line); l["idea"]=f"x{tag}-{l['idea']}"; f.write(json.dumps(l)+"\n"); n+=1   # ids prefixed so they never collide
json.dump(sets,open(f"{d}/toolsets.json","w"),sort_keys=True)
open(f"{d}/lessons-merged","w").write(str(n))
print(f"merged {n} extra lessons from {len(glob.glob(f'{d}/lessons-extra-*.jsonl'))} sets; toolsets {len(sets)}")
PY
fi

# the model code needs a current transformers (vLLM is not used any more, so this is safe at setup)
pip install -q "transformers==5.22.1" 2>&1 | tail -1
python3 -c "import transformers, torch; from transformers import Qwen3_5MoeForConditionalGeneration; print('transformers', transformers.__version__, 'torch', torch.__version__, 'grouped_mm', hasattr(torch, '_grouped_mm'))" || die "transformers 5.22.1 install failed"
cat $OUT/kernels.log 2>/dev/null | tail -2
# GPT-OSS teacher (14 Nov 2026): MXFP4 experts run on the card only with triton + the kernels package (Hopper or newer); without
# them family.py unpacks the teacher to BF16 across card and RAM, which works but is slow. The student is always unpacked to BF16.
TFAM=$(python3 -c "import sys; sys.path.insert(0,'$POD'); import family; print(family.family('$TS'))" 2>/dev/null || echo qwen)
if [ "$TFAM" = "gpt-oss" ]; then
  pip install -q kernels 2>&1 | tail -1
  python3 -c "import sys; sys.path.insert(0,'$POD'); import family; print('GPT-OSS teacher: MXFP4 on this card' if family.mxfp4_runs('cuda') else 'GPT-OSS teacher: no MXFP4 kernels here, it will be unpacked to BF16 (slow)')"
  for k in grpo fold surgery merge; do [ -n "$(plan ".get('$k')")" ] && echo "plan.$k is not built for GPT-OSS yet: that step is skipped or refuses, and the run goes on without it"; done
fi

# --- which model is the teacher (build 17) ---
# plan.teacher_model: a trained teacher saved on the volume by an earlier run (e.g. bobs/35Bob/model). plan.train_teacher: make one now.
# The teacher's identity goes into the lesson-set key, so scores from the stock Qwen and from a trained one never mix.
TEACHER_DIR=$TS; TEACHER_ID=$TEACHER
TM=$(plan ".get('teacher_model','')")
if [ -n "$TM" ]; then
  [ -f $S/$TM/config.json ] || die "teacher_model $TM is not on the volume"
  TEACHER_DIR=$S/$TM; TEACHER_ID="$TEACHER+$(sha256sum $S/$TM/../adapter.pt | cut -c1-16)"; echo "teacher: $TM (trained)"
fi
# --- blends (plan.merge, 13 Nov): a trained Bob mixed back toward its base on the CPU (merge.py), each made into GGUF files to test at home ---
MG=$(plan ".get('merge')")
if [ -n "$MG" ]; then
  for i in $(seq 0 $(( $(plan "['merge'].__len__()") - 1 ))); do
    MN=$(plan "['merge'][$i]['name']"); MB=$(plan "['merge'][$i].get('base','teacher')"); MT=$(plan "['merge'][$i]['tuned']")
    [ "$MB" = "teacher" ] && MB=$TS || MB=$S/$MB; MT=$S/$MT
    [ -f $MB/config.json ] && [ -f $MT/config.json ] || { echo "merge $MN: $MB or $MT is not on the volume, skipped"; continue; }
    status merge "$MN: blending $(plan "['merge'][$i].get('weight',0.7)") of $(basename $(dirname $MT)) with $(basename $MB) ($(plan "['merge'][$i].get('method','linear')"))"
    mkdir -p $OUT/$MN
    python3 merge.py --base $MB --tuned $MT --out $W/merged-$MN --method $(plan "['merge'][$i].get('method','linear')") --weight $(plan "['merge'][$i].get('weight',0.7)") \
      --density $(plan "['merge'][$i].get('density',0.5)") > $OUT/$MN/merge.log 2>&1 || { echo "merge $MN failed (out/$MN/merge.log)"; tail -3 $OUT/$MN/merge.log; continue; }
    cp $W/merged-$MN/merge-report.json $OUT/$MN/
    for j in $(seq 1 90); do [ -f $S/llama-ready ] || [ -f $S/llama-failed ] && break; sleep 20; done
    python3 export.py --model $W/merged-$MN --out $OUT/$MN --name "$MN" --teacher "$TEACHER" --llama $S/llama.cpp --quants $(plan ".get('quants','Q4_K_M')") --pending --what "$(plan "['merge'][$i].get('what','A blend of a trained Bob and the brain it came from, to test at home.')")" \
      > $OUT/$MN/export.log 2>&1 && { keep_bob $MN "$MN" ""; release_files $MN "$MN"; status ready "$MN ready to download"; } || { echo "merge $MN: export failed (out/$MN/export.log)"; tail -3 $OUT/$MN/export.log; }
    # kept on the volume (room permitting) so a later run can give the blend a short re-train if it tests worse at home (train_teacher.from)
    if [ "$S" != "$W" ] && [ "$(df -m $S | awk 'NR==2{print $4}')" -gt $(( $(du -sm $W/merged-$MN | cut -f1) + 2048 )) ]; then
      mkdir -p $S/bobs/$MN && rm -rf $S/bobs/$MN/model && mv $W/merged-$MN $S/bobs/$MN/model && echo "$MN kept on the volume: bobs/$MN/model"
    else rm -rf $W/merged-$MN; fi
  done
fi
# --- train the teacher (plan.train_teacher): the full Qwen learns every lesson by plain next-word training (no odds to copy, it IS the
# teacher), is kept as a Bob of its own (35Bob "Bobert": no cut, all experts) and becomes the teacher for the odds and the cuts below ---
# 13 Nov: train_teacher.from trains another model on the volume instead (a blend, or a Bob that already learned something:
# one target at a time, e.g. facts, then tools); train_teacher.pref and .grpo add the new ways on the full model, no cut needed ---
TT=$(plan ".get('train_teacher')")
if [ -n "$TT" ]; then
  TNAME=$(plan "['train_teacher'].get('name','35Bob')"); TNICK=$(plan "['train_teacher'].get('nickname','Bobert')"); THOURS=$(plan "['train_teacher'].get('hours',8)")
  mkdir -p $OUT/$TNAME $S/bobs/$TNAME
  if [ -f $S/bobs/$TNAME/model/config.json ] && [ -f $S/bobs/$TNAME/adapter.pt ] && [ -z "$(plan "['train_teacher'].get('redo','')")" ]; then
    status train "$TNAME is already on the volume: no training (train_teacher.redo to redo it)"
  else
    kernels_ready
    TFROM=$(plan "['train_teacher'].get('from','teacher')"); [ "$TFROM" = "teacher" ] && TFROM=$TS || TFROM=$S/$TFROM
    [ -f $TFROM/config.json ] || die "train_teacher.from $TFROM is not on the volume"
    TARGS=$(python3 - <<'PY'
import json,os; t=json.load(open(os.environ.get('FORGE_ROOT','/workspace')+'/in/plan.json'))['train_teacher']; pr=t.get('pref'); pd=os.environ.get('FORGE_ROOT','/workspace')+'/in/pref'
print(" ".join(["--pref",pd,"--pref-kind",str(pr.get('kind','orpo')),"--pref-beta",str(pr.get('beta',0.1)),"--pref-every",str(pr.get('every',4)),"--pref-hours",str(pr.get('hours',0.5))]) if pr and os.path.isdir(pd) else "")
PY
)
    status train "$TNAME: teaching $(basename $TFROM) every lesson ($THOURS h at most, plain next-word training${TARGS:+ + pairs})"
    python3 heal.py --model $TFROM --lessons $IN --save $W/healed-$TNAME --experts $(plan "['train_teacher'].get('experts','lora')") --alpha 0 \
      --epochs $(plan "['train_teacher'].get('epochs',1)") --hours $THOURS --max-len $(plan ".get('max_len',8192)") --cache $W/lessons-tok-train.pt \
      --report $OUT/$TNAME/train-report.json $GEN $TARGS $TGT || die "$TNAME training"
    echo "$(basename $TFROM)" > $S/bobs/$TNAME/base.txt   # the adapter rebuilds this Bob from this base, not always the stock Qwen
    if [ -n "$(plan "['train_teacher'].get('grpo')")" ]; then
      status train "$TNAME: reward pass on tool calls (GRPO)"
      if python3 grpo.py --model $W/healed-$TNAME --lessons $IN --save $W/grpo-$TNAME --report $OUT/$TNAME/grpo-report.json --max-len $(plan ".get('max_len',8192)") \
          --hours $(plan "['train_teacher']['grpo'].get('hours',1.5)") --steps $(plan "['train_teacher']['grpo'].get('steps',200)") --kl $(plan "['train_teacher']['grpo'].get('kl',0.02)") $TGT && \
         python3 -c "import json,sys; r=json.load(open(sys.argv[1])); sys.exit(0 if r['after']['reward']>=r['before']['reward'] and r.get('no_target_worse',True) else 1)" $OUT/$TNAME/grpo-report.json; then
        cp $W/healed-$TNAME/adapter.pt $W/grpo-$TNAME/heal-adapter.pt; rm -rf $W/healed-$TNAME; mv $W/grpo-$TNAME $W/healed-$TNAME; echo "$TNAME: reward pass kept"
      else rm -rf $W/grpo-$TNAME; echo "$TNAME: reward pass did not help on the held-out chats: the trained model stays"; fi
    fi
    cp $W/healed-$TNAME/adapter.pt $OUT/$TNAME/$TNAME-adapter.pt; cp $W/healed-$TNAME/adapter.pt $S/bobs/$TNAME/adapter.pt
    # the full model goes to the volume only if there is room (8 Nov: a 100 GB drive was reused); otherwise it stays on the pod disk
    # for this run and the adapter on the volume rebuilds it next time (heal.py --eval-only is not needed: stock teacher + adapter)
    NEED=$(du -sm $W/healed-$TNAME | cut -f1); FREE=$(df -m $S | awk 'NR==2{print $4}')
    if [ "$S" != "$W" ] && [ "${FREE:-0}" -gt $((NEED + 2048)) ]; then
      rm -rf $S/bobs/$TNAME/model; mv $W/healed-$TNAME $S/bobs/$TNAME/model || die "keeping $TNAME on the volume"
      echo "$TNAME kept on the volume ($(du -sh $S/bobs/$TNAME | cut -f1)); the next run can name it as teacher_model: bobs/$TNAME/model"
    elif [ "$S" != "$W" ]; then
      echo "WARNING: the volume has ${FREE} MB free and $TNAME needs ${NEED} MB: he stays on the pod disk for this run; his adapter is on the volume and the PC, so the next run can rebuild him (train_teacher with the same lessons finds the adapter)"
      status train "$TNAME trained; volume too small to keep him, adapter kept (enlarge the drive before Bill's run)"
      mkdir -p $S/bobs/$TNAME && ln -sfn $W/healed-$TNAME $S/bobs/$TNAME/model
    else mkdir -p $S/bobs/$TNAME && ln -sfn $W/healed-$TNAME $S/bobs/$TNAME/model; fi
  fi
  TEACHER_DIR=$(readlink -f $S/bobs/$TNAME/model); TEACHER_ID="$TEACHER+$(sha256sum $S/bobs/$TNAME/adapter.pt | cut -c1-16)"
  status export "$TNAME: making the GGUF files"
  for i in $(seq 1 90); do [ -f $S/llama-ready ] || [ -f $S/llama-failed ] && break; sleep 20; done
  if [ -f $S/llama-ready ]; then
    python3 export.py --model $TEACHER_DIR --out $OUT/$TNAME --name "$TNAME" --nickname "$TNICK" --teacher "$TEACHER" --pending \
      --what "The full Qwen taught every one of Bob's lessons, no cut: the biggest Bob and the teacher of every smaller one." --llama $S/llama.cpp --quants $(plan ".get('quants','Q4_K_M')") || die "$TNAME export"
    keep_bob $TNAME $TNAME "$TNICK"
  else echo "llama tools unavailable: $TNAME stays as safetensors on the volume (no GGUF this run)"; fi
  release_files $TNAME $TNAME
  status ready "$TNAME ready"
fi

# --- counts only (no rungs): count every skill on the full Qwen, build the ladder table, send the count files back ---
if [ "$(plan "['rungs'].__len__()")" = "0" ] && [ -n "$(plan ".get('skills')")" ]; then
  mkdir -p $OUT/counts
  status count "counting the experts the full Qwen uses for every skill (one model load)"
  python3 countskills.py --model $TS --lessons $IN --skills "$(plan "['skills']")" --out-dir $OUT/counts --prefix counts-teacher --pieces $(plan ".get('skill_pieces',300)") --cache $W/lessons-tok.pt --max-len $(plan ".get('max_len',8192)") $GEN $REAP || die "skill counts"
  CARGS=$(python3 -c "import json,os; p=json.load(open('$IN/plan.json')); print(','.join(f'{k}=$OUT/counts/counts-teacher-{k}.json' for k in p['skills'] if os.path.exists(f'$OUT/counts/counts-teacher-{k}.json')))")
  status count "building the ladder table"
  python3 keep.py --counts "$CARGS" --report $OUT/counts/ladder.md --name teacher --cover $(plan ".get('cover',0.95)") --strong "$(plist ".get('strong',[])")" --strong-cover $(plan ".get('strong_cover',0.99)") --ladder $(plan ".get('ladder','240,224,208,192,176,160,144,128,112,96,80,64,48,32')") --by $SCORE || die "ladder"
  python3 - $OUT/counts <<'PY'
import json,os,sys,hashlib; d=sys.argv[1]; files=[]
for f in sorted(os.listdir(d)):
    if f.endswith("-files.json"): continue
    b=open(f"{d}/{f}","rb").read(); files.append({"file":f,"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()})
json.dump({"name":"counts","files":files},open(f"{d}/counts-files.json","w"))
PY
  [ "$S" != "$W" ] && mkdir -p $S/counts && cp $OUT/counts/*.json $OUT/counts/ladder.md $S/counts/ 2>/dev/null
  run_done "counts finished"; exit 0
fi

# --- rebuild and publish (9 Nov): bring finished Bobs back from the stock teacher + keep list + adapter, make their GGUF files, and put
# EVERYTHING on Hugging Face: the full-size weights, the adapter, the keep list, the GGUFs and their cards. No training and no teacher
# pass (no lessons are needed), and NOTHING is copied to the volume: the owner wants the GGUFs off the drive now that Hugging Face hosts them.
# plan.rebuild: {"models":[{"name":"28Bob","nickname":"Riker","keep_file":"hf:MouseWurX/28Bob-Riker:28Bob-keep.json","adapter":"hf:MouseWurX/28Bob-Riker:28Bob-adapter.pt",
#   "cards":"hf:MouseWurX/28Bob-Riker","private":false}, {"name":"35Bob","nickname":"Bobert","adapter":"volume:bobs/35Bob/adapter.pt","private":true,"what":"..."}]}
# No keep_file = no cut (the adapter goes straight onto the stock teacher). keep_file/adapter: hf:<repo>:<path>, volume:<path on the drive>,
# or a file the PC sent to in/; the drive's bobs/<name>/ is the fallback. private is per Bob (a tested Bob public, an untested one private);
# publish.private is the fallback. The run ends here: a rebuild plan does nothing else.
if [ -n "$(plan ".get('rebuild')")" ]; then
  hf_ok || die "rebuild: plan.publish and the Hugging Face token are needed (everything goes up, nothing comes down)"
  NR=$(plan "['rebuild']['models']" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"); mkdir -p $W/rebuild $OUT/rebuild
  for b in $(seq 0 $((NR-1))); do   # every volume: input must be on this drive before anything else is waited for
    for K in adapter keep_file; do V=$(plan "['rebuild']['models'][$b].get('$K','')"); case "$V" in volume:*) [ -f "$S/${V#volume:}" ] || die "rebuild: $V is not on this drive (the pod must run in the data centre that holds it)";; esac; done
  done
  # weights_only (9 Nov): {"name","nickname","source":"volume:bobs/35Bob/model","weights_only":true,"private":true} uploads the full-size
  # weights of a Bob that is already on the drive, nothing else (no rebuild, no GGUF files, no llama tools): the repair for a failed weights upload.
  NEED_LLAMA=0; for b in $(seq 0 $((NR-1))); do [ "$(plan "['rebuild']['models'][$b].get('weights_only',False)")" = "True" ] || NEED_LLAMA=1; done
  if [ $NEED_LLAMA = 1 ]; then
    status rebuild "waiting for the llama.cpp tools (the GGUF files need them)"
    for i in $(seq 1 90); do [ -f $S/llama-ready ] || [ -f $S/llama-failed ] && break; sleep 20; done
    [ -f $S/llama-ready ] || die "rebuild: llama tools unavailable (see out/llama-setup.log)"
  fi
  RB_OK=0; RB_WFAIL=""
  for b in $(seq 0 $((NR-1))); do
    BN=$(plan "['rebuild']['models'][$b]['name']"); BNICK=$(plan "['rebuild']['models'][$b].get('nickname','')"); MP=$(plan "['rebuild']['models'][$b].get('private','')")
    if [ "$(plan "['rebuild']['models'][$b].get('weights_only',False)")" = "True" ]; then
      SRC=$(plan "['rebuild']['models'][$b].get('source','volume:bobs/$BN/model')"); case "$SRC" in volume:*) SRCD=$S/${SRC#volume:} ;; *) SRCD=$W/$SRC ;; esac
      [ -f "$SRCD/config.json" ] || die "rebuild $BN: no model at $SRC (config.json missing)"
      [ -f "$SRCD/adapter.pt" ] || { [ -f "$S/bobs/$BN/adapter.pt" ] && cp "$S/bobs/$BN/adapter.pt" "$SRCD/adapter.pt" 2>/dev/null || true; }
      REPO="$(plan "['publish']['user']")/$BN${BNICK:+-$BNICK}"
      if [ -n "$MP" ]; then export PUB_PRIVATE="$MP"; else unset PUB_PRIVATE; fi
      if publish_dir "$SRCD" "$REPO" "$BN full-size weights" model . "*.safetensors" "*.json" "*.jinja" "*.txt" "*.model" "adapter.pt"; then RB_OK=$((RB_OK+1)); else RB_WFAIL="$RB_WFAIL $BN"; fi
      [ -n "$MP" ] && set_visibility "$REPO" model "$MP"
      unset PUB_PRIVATE; echo "$BN${BNICK:+ $BNICK}: https://huggingface.co/$REPO"; continue
    fi
    KFS=$(plan "['rebuild']['models'][$b].get('keep_file','')"); ADS=$(plan "['rebuild']['models'][$b].get('adapter','')"); RIN=$W/rebuild/in-$BN; mkdir -p $RIN
    case "$ADS" in volume:*) ADP=$S/${ADS#volume:} ;; "") ADP=$S/bobs/$BN/adapter.pt ;; *) ADP=$(resolve_in "$ADS" $RIN) ;; esac
    case "$KFS" in volume:*) KFP=$S/${KFS#volume:} ;; "") KFP="" ;; *) KFP=$(resolve_in "$KFS" $RIN) ;; esac
    [ -f "$ADP" ] || { [ -f $S/bobs/$BN/adapter.pt ] && ADP=$S/bobs/$BN/adapter.pt; }
    [ -n "$KFS" ] && [ ! -f "$KFP" ] && [ -f $S/bobs/$BN/bob-keep.json ] && KFP=$S/bobs/$BN/bob-keep.json
    [ -f "$ADP" ] || die "rebuild $BN: adapter missing ($ADS) -- a volume: path needs the pod in the data centre that holds that drive"
    if [ -n "$KFS" ] && [ ! -f "$KFP" ]; then die "rebuild $BN: keep list missing ($KFS)"; fi
    KFARG=(); [ -n "$KFS" ] && KFARG=(--keep-file "$KFP")
    status rebuild "$BN: rebuilding from the stock teacher${KFS:+, his keep list} and his adapter"
    rm -rf $W/rebuild/$BN $W/rebuild/$BN-cut
    python3 rebuild.py --teacher $TS "${KFARG[@]}" --adapter "$ADP" --dst $W/rebuild/$BN --name $BN > $OUT/rebuild/$BN-rebuild.log 2>&1 || { echo "rebuild $BN failed (see out/rebuild/$BN-rebuild.log)"; tail -3 $OUT/rebuild/$BN-rebuild.log; status rebuild "$BN: rebuild FAILED"; continue; }
    status export "$BN: making the GGUF files"
    WHAT=$(plan "['rebuild']['models'][$b].get('what','')"); WARG=(); [ -n "$WHAT" ] && WARG=(--what "$WHAT")
    rm -rf "${OUT:?}"/"${BN:?}"; python3 export.py --model $W/rebuild/$BN --out $OUT/$BN --name "$BN" --nickname "$BNICK" --teacher "$TEACHER" --jobs "$(plan ".get('jobs','bob,deep,tinker,reviewer,office,ledger,scout')")" --llama $S/llama.cpp --quants $(plan ".get('quants','Q4_K_M')") --pending "${WARG[@]}" > $OUT/rebuild/$BN-export.log 2>&1 || { echo "export $BN failed (see out/rebuild/$BN-export.log)"; tail -3 $OUT/rebuild/$BN-export.log; status export "$BN: export FAILED"; continue; }
    # the home benchmark block from the scored cards (plan cards: hf:<repo>, or cards the PC sent to in/) goes onto the fresh cards
    CSRC=$(plan "['rebuild']['models'][$b].get('cards','')"); mkdir -p $W/rebuild/cards-$BN
    case "$CSRC" in hf:*) for f in $OUT/$BN/*.bob.json; do hf_get "${CSRC#hf:}" "$(basename $f)" $W/rebuild/cards-$BN || true; done ;; *) cp $IN/$BN-*.bob.json $W/rebuild/cards-$BN/ 2>/dev/null ;; esac
    python3 - $OUT/$BN $W/rebuild/cards-$BN <<'PY'
import json,glob,os,sys; d,c=sys.argv[1:3]
for f in glob.glob(f"{d}/*.bob.json"):
    o=os.path.join(c,os.path.basename(f))
    if os.path.exists(o):
        new=json.load(open(f)); old=json.load(open(o))
        if old.get("benchmark"): new["benchmark"]=old["benchmark"]; json.dump(new,open(f,"w"),indent=1); print("benchmark block kept for",os.path.basename(f))
PY
    # the small files sit in the repo root with everything else
    [ -n "$KFS" ] && cp "$KFP" $OUT/$BN/$BN-keep.json; cp "$ADP" $OUT/$BN/$BN-adapter.pt
    REPO="$(plan "['publish']['user']")/$BN${BNICK:+-$BNICK}"
    if [ -n "$MP" ]; then export PUB_PRIVATE="$MP"; else unset PUB_PRIVATE; fi
    write_model_card $OUT/$BN "$BN" "$BNICK"
    publish_dir $OUT/$BN "$REPO" "$BN GGUF files, cards, keep list and adapter" model . "*.gguf" "*.bob.json" "README.md" "$BN-keep.json" "$BN-adapter.pt" || echo "publish $BN (GGUF files) failed"
    publish_dir $W/rebuild/$BN "$REPO" "$BN full-size weights" model . "*.safetensors" "*.json" "*.jinja" "*.txt" "*.model" "adapter.pt" || { echo "publish $BN (weights) failed"; RB_WFAIL="$RB_WFAIL $BN"; }
    [ -n "$MP" ] && set_visibility "$REPO" model "$MP"
    unset PUB_PRIVATE
    # every GGUF is on Hugging Face: the PC downloads nothing (the file list says where each one is), then the list is released
    [ -f $OUT/$BN/$BN-files.json.pending ] && python3 - $OUT/$BN/$BN-files.json.pending "$REPO" <<'PY'
import json,sys; p=sys.argv[1]; j=json.load(open(p))
for f in j["files"]:
    if f["file"].endswith(".gguf"): f["published"]=f"https://huggingface.co/{sys.argv[2]}/blob/main/{f['file']}"
j["repo"]=sys.argv[2]; json.dump(j,open(p,"w"),indent=1)
PY
    release_files $BN "$BN"
    echo "$BN${BNICK:+ $BNICK}: https://huggingface.co/$REPO"
    rm -rf $W/rebuild/$BN $W/rebuild/$BN-cut $W/rebuild/cards-$BN; RB_OK=$((RB_OK+1))   # free the pod disk for the next Bob
    status ready "$BN is on Hugging Face"
  done
  rm -f $IN/hf-token
  [ "$RB_OK" -gt 0 ] || die "rebuild: no Bob was rebuilt"
  [ -z "$RB_WFAIL" ] || echo "FULL-SIZE WEIGHTS MISSING on Hugging Face for:$RB_WFAIL (see out/publish/*.log); a weights_only plan uploads them from the drive"
  # a rebuild run can benchmark too (10 Nov): the same block as the end of a training run, so Bill's missed head-to-head can be
  # made up on the publish run (file: hf:<repo>:<path> | volume:<path> | out:<name>/<file> for a Bob rebuilt just above)
  if [ -n "$(plan ".get('benchmark')")" ]; then run_bench; fi
  # --- FNRI scans (10 Nov): plan.scan {"from":"<PC folder>","brains":["qwen","riker","bobert","bill"],"stock":"Qwen3.6-35B-A3B",
  #   "keep":{"riker":"hf:MouseWurX/28Bob-Riker:28Bob-keep.json"}}. The PC sends the folder as in/scan.tgz (one sub-folder per brain, each
  # with pod/aifeui.sh, its plan, the engine patches and the viewer); the pod unpacks it onto the drive, makes the stock brain's Q4_K_M from
  # the teacher if asked (stock/<name>-Q4_K_M.gguf, kept on the drive), runs each brain's scan in turn (the first builds the traced engine
  # in aifeui-engine on the drive, the rest reuse it), and lists everything under out/fnri/ in out/fnri/files.json for the PC to bring home.
  # A failed brain is logged and the next one runs. The scan tool itself belongs to the FNRI thread; this only drives it.
  if [ -n "$(plan ".get('scan')")" ]; then
    # 11 Nov: the scan's engine build clones llama.cpp with git, which the rental image lacks (the first scan run stopped at its preflight)
    command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; } >/dev/null 2>&1 || echo "git could not be installed; the scans will say so"
    [ -f $IN/scan.tgz ] || die "scan: in/scan.tgz is missing (the PC sends plan.scan.from)"
    mkdir -p $S/fnri-in $OUT/fnri && tar xzf $IN/scan.tgz -C $S/fnri-in || die "scan: unpacking in/scan.tgz"
    STOCK=$(plan "['scan'].get('stock','')")
    if [ -n "$STOCK" ]; then
      if [ -f $S/stock/$STOCK-Q4_K_M.gguf ]; then echo "scan: stock $STOCK Q4_K_M already on the drive"; else
        status scan "making the stock $STOCK Q4_K_M from the teacher (for a fair comparison)"
        for i in $(seq 1 90); do [ -f $S/llama-ready ] || [ -f $S/llama-failed ] && break; sleep 20; done
        if [ -f $S/llama-ready ]; then python3 export.py --model $TS --out $S/stock --name "$STOCK" --teacher "$TEACHER" --llama $S/llama.cpp --quants Q4_K_M --what "The stock $STOCK, as released." > $OUT/fnri/stock.log 2>&1 || { echo "scan: stock GGUF failed (out/fnri/stock.log)"; tail -3 $OUT/fnri/stock.log; }
        else echo "scan: llama tools unavailable, no stock GGUF (out/llama-setup.log)"; fi
      fi
    fi
    for b in $(plist "['scan'].get('brains',[])" | tr , ' '); do
      [ -f $S/fnri-in/$b/pod/aifeui.sh ] || { echo "scan $b: no $b/pod/aifeui.sh in the bundle; skipped"; continue; }
      status scan "$b: FNRI scan on the card"
      mkdir -p $OUT/fnri/$b
      if FORGE_ROOT=$S AIFEUI_IN=$S/fnri-in/$b AIFEUI_OUT=$OUT/fnri/$b bash $S/fnri-in/$b/pod/aifeui.sh > $OUT/fnri/$b/run.log 2>&1; then echo "scan $b: done"
      else echo "scan $b FAILED (out/fnri/$b/run.log)"; tail -3 $OUT/fnri/$b/run.log; fi
      KS=$(plan "['scan'].get('keep',{}).get('$b','')"); [ -n "$KS" ] && { K=$(resolve_in "$KS" $OUT/fnri/$b); [ -f "$K" ] && echo "scan $b: keep list beside the recording" || echo "scan $b: keep list $KS not found"; }
    done
    python3 - $OUT/fnri <<'PY'
import json,os,sys; d=sys.argv[1]; files=[]
for r,_,fs in os.walk(d):
    for f in fs:
        p=os.path.join(r,f); rel=os.path.relpath(p,d).replace(os.sep,'/')
        if rel!='files.json' and not rel.endswith('.part'): files.append({"file":rel,"bytes":os.path.getsize(p)})
json.dump({"files":files},open(os.path.join(d,'files.json'),'w'),indent=1); print(len(files),"scan files listed")
PY
    status scan "finished: recordings under out/fnri"
  fi
  # plan.drive_delete ["bobs/35Bob/gguf", ...]: drive folders the owner wants gone once Hugging Face hosts them. Only when every upload in
  # this run succeeded, only under bobs/ or runs/ (never the teacher, the odds, an adapter or a keep list), and what was removed is listed.
  if [ -z "$RB_WFAIL" ] && [ "$RB_OK" = "$NR" ] && [ "$S" != "$W" ]; then
    for DD in $(plan ".get('drive_delete',[])" | python3 -c "import json,sys; print(' '.join(json.load(sys.stdin)))"); do
      case "$DD" in bobs/*/gguf|bobs/*/gguf/*|runs/*) [ -e "$S/$DD" ] && { du -sh "$S/$DD" | sed 's/^/drive_delete: removing /'; rm -rf "${S:?}/$DD"; } || echo "drive_delete: $DD was not on the drive";; *) echo "drive_delete: $DD refused (only bobs/<name>/gguf and runs/ may be removed)";; esac
    done
    drive_list
  fi
  run_done "rebuild finished: $RB_OK of $NR Bobs on Hugging Face${RB_WFAIL:+; full-size weights FAILED for$RB_WFAIL}"; exit 0
fi

# --- teach-it (9 Nov): plan.odds false with no rungs = an adapter-only fine-tune of the full teacher (train_teacher above) and nothing
# else. Without this, "no rungs" is the lessons-and-odds run type and the fresh brain would spend hours scoring every lesson for odds
# nobody asked for. The taught Bob (his GGUF files + adapter) is the whole result; he has come back or gone up in keep_bob already.
if [ "$(plan ".get('odds','')")" = "False" ] && [ "$(plan "['rungs'].__len__()")" = "0" ]; then
  echo "odds: false and no rungs: no teacher pass (a teach-it run; the taught Bob is the result)"
  publish_tested
  if [ "$S" != "$W" ]; then RT=$S/runs/$(plan ".get('run','run')")-$(date -u +%Y%m%dT%H%M); mkdir -p $RT; cp $OUT/*.log $OUT/*.json $OUT/*.txt $RT/ 2>/dev/null; for d in $OUT/*/; do [ -d "$d" ] && { mkdir -p $RT/$(basename $d); cp $d/*.json $d/*.md $d/*.txt $RT/$(basename $d)/ 2>/dev/null; }; done; echo "run files kept on the volume at $RT"; fi
  rm -f $IN/hf-token
  run_done "teach-it finished: ${TNAME:-the taught Bob} is ready"; exit 0
fi

# --- teacher pass (once per lesson set, build 15): what the full Qwen thinks at every answer word (loaded in this process, no server) ---
# The pass takes hours, so its two files are kept: on the network volume under teacher-cache/<key>/ (any later pod in this
# data centre skips the pass), and on the PC (out/teacher/<key>/, downloaded as soon as they exist; a later pod with a fresh
# volume gets them uploaded back instead of redoing the pass). The key names the lesson set exactly: the merged lessons +
# toolsets, the teacher, top, max_len and the general-text budget. Rental 2 lost 2.5 h of this when the card deleted itself.
# plan.lessons_set "<key>" (10 Nov): take the lesson set an earlier run kept on the drive (lessons/<key>/) instead of the PC's upload,
# so the key is the same by construction and the teacher scores under it are reused. A PC copy that drifted by one byte would
# otherwise cost a whole new teacher pass. The plan's teacher, top, max_len and general budget must still match: checked below.
LSET=$(plan ".get('lessons_set','')")
if [ -n "$LSET" ]; then
  if [ "$S" != "$W" ] && [ -f $S/lessons/$LSET/lessons.jsonl ] && [ -f $S/lessons/$LSET/toolsets.json ]; then
    cp $S/lessons/$LSET/lessons.jsonl $IN/lessons.jsonl && cp $S/lessons/$LSET/toolsets.json $IN/toolsets.json || die "copying lesson set $LSET from the drive"
    echo "lesson set $LSET taken from the drive ($(wc -l < $IN/lessons.jsonl) lessons); the PC's set is not used"
  else echo "lesson set $LSET is not on this drive (lessons/$LSET/): the PC's set is used and must give the same key"; fi
fi
KEY=$(python3 - $IN "$TEACHER_ID" "$(plan ".get('top',32)")" "$(plan ".get('max_len',8192)")" "$GENERAL_TOKENS" <<'PY'
import hashlib,sys; h=hashlib.sha256()
for f in ("lessons.jsonl","toolsets.json"):
    h.update(open(f"{sys.argv[1]}/{f}","rb").read())
h.update("|".join(sys.argv[2:]).encode()); print(h.hexdigest()[:16])
PY
)
[ -n "$LSET" ] && [ "$KEY" != "$LSET" ] && die "lessons_set $LSET was asked for but this plan's key is $KEY: the teacher, top, max_len or general_tokens differ from the run that made it (fix the plan; no pass was started)"
TDIR=$OUT/teacher; mkdir -p $TDIR; TPT=$TDIR/teacher.pt; CACHE=$TDIR/lessons-tok.pt; TC=$S/teacher-cache/$KEY
echo "$KEY" > $TDIR/teacher-key.txt
# keep the whole lesson set on the network volume beside its scores (the owner wants every input and output kept)
if [ "$S" != "$W" ] && [ ! -f $S/lessons/$KEY/lessons.jsonl ]; then
  mkdir -p $S/lessons/$KEY && cp $IN/lessons.jsonl $IN/toolsets.json $IN/plan.json $S/lessons/$KEY/ && cp $IN/lessons-extra-*.jsonl $IN/toolsets-extra-*.json $S/lessons/$KEY/ 2>/dev/null
  echo "lesson set $KEY kept on the volume ($(du -sh $S/lessons/$KEY | cut -f1))"
fi
# the PC watcher answers teacher-key.txt with in/teacher-answer ("have" + an upload, or "none")
if [ -f $TC/teacher.pt ] && [ -f $TC/lessons-tok.pt ]; then
  status teacher "the teacher's scores for this lesson set are on the volume ($KEY): no teacher pass"
  cp $TC/teacher.pt $TPT && cp $TC/lessons-tok.pt $CACHE || die "copying the teacher cache from the volume"
else
  status teacher "asking the PC for saved teacher scores ($KEY)"
  for i in $(seq 1 60); do [ -f $IN/teacher-answer ] && break; sleep 10; done   # the PC polls once a minute; 10 min is plenty
  if grep -q have $IN/teacher-answer 2>/dev/null; then
    status teacher "the PC has this lesson set's teacher scores: waiting for the upload"
    for i in $(seq 1 $(plan ".get('teacher_upload_minutes',150)")); do [ -f $IN/teacher-ready ] && break; sleep 60; done
    if [ -f $IN/teacher-ready ] && [ -f $IN/teacher.pt ] && [ -f $IN/lessons-tok.pt ]; then mv $IN/teacher.pt $TPT; mv $IN/lessons-tok.pt $CACHE; echo "teacher scores came from the PC"
    else echo "the upload never finished; doing the teacher pass"; fi
  fi
  if [ ! -f $TPT ]; then
    kernels_ready
    status teacher "scoring every lesson with the full $( [ "${TFAM:-qwen}" = gpt-oss ] && echo "GPT-OSS teacher ($TEACHER)" || echo Qwen3.6)"
    python3 teacher.py --model $TEACHER_DIR --lessons $IN --out $TPT --top $(plan ".get('top',32)") \
      --max-len $(plan ".get('max_len',8192)") --cache $CACHE --hours $(plan ".get('teacher_hours',2.0)") $GEN || die "teacher pass"
  fi
fi
[ -f $TPT ] && [ -f $CACHE ] || die "no teacher.pt after the teacher pass"
# keep them: volume first (the next pod here skips the pass), then the file list that makes the PC download them (out/teacher/<key>/)
if [ "$S" != "$W" ] && [ ! -f $TC/teacher.pt ]; then status teacher "saving the teacher's scores on the volume"; mkdir -p $TC && cp $TPT $TC/teacher.pt.part && mv $TC/teacher.pt.part $TC/teacher.pt && cp $CACHE $TC/lessons-tok.pt && echo "$(date -u +%FT%TZ) $TEACHER_ID" > $TC/made.txt || echo "could not save the teacher cache on the volume (no room?)"; fi
python3 - $TDIR $KEY <<'PY'
import json,os,sys,hashlib; d=sys.argv[1]; files=[]
for f in ("teacher.pt","lessons-tok.pt","teacher-key.txt"):
    h=hashlib.sha256(); n=0
    with open(f"{d}/{f}","rb") as fh:
        for b in iter(lambda: fh.read(1<<24), b""): h.update(b); n+=len(b)
    files.append({"file":f,"bytes":n,"sha256":h.hexdigest()})
json.dump({"name":"teacher","key":sys.argv[2],"files":files},open(f"{d}/teacher-files.json","w"))
PY
status teacher "teacher scores ready ($KEY); the PC downloads them while the rungs run"
# the odds may go to Hugging Face as a PRIVATE dataset (plan.publish.odds), one folder per lesson-set key
if hf_ok && [ "$(plan "['publish'].get('odds','')")" = "True" ]; then
  mkdir -p $W/odds-up && cp $TPT $CACHE $TDIR/teacher-key.txt $W/odds-up/ && python3 - $W/odds-up "$KEY" "$TEACHER_ID" "$(wc -l < $IN/lessons.jsonl)" <<'PY'
import sys; d,key,tid,n=sys.argv[1:5]
open(f"{d}/README.md","w").write(f"""# Teacher odds for lesson set {key}

What the teacher ({tid.split('+')[0]}{' , trained' if '+' in tid else ''}) thinks at every answer word of {n} lessons: the top-32 next-word
log-odds (`teacher.pt`) and the tokenised lessons they belong to (`lessons-tok.pt`). Bob's Forge heals a cut Bob against these
instead of redoing the teacher pass. Made by [Bob's Forge](https://github.com/MouseWurX/Bob/blob/main/app/docs/FORGE-JOURNAL.md).
The lessons themselves are in the `bob-lessons` dataset (CC BY-SA 4.0); the odds carry the base model's licence (Apache 2.0).
""")
PY
  publish_dir $W/odds-up "$(plan "['publish']['user']")/bob-odds" "teacher odds $KEY" dataset "$KEY" || true
  rm -rf $W/odds-up
fi

publish_tested
# --- the rungs ---
N=$(plan "['rungs'].__len__()")
for i in $(seq 0 $((N-1))); do
  NAME=$(plan "['rungs'][$i]['name']"); KEEP=$(plan "['rungs'][$i]['keep']"); NICK=$(plan "['rungs'][$i].get('nickname','')"); FROM=$(plan "['rungs'][$i].get('from','teacher')")
  COUNTS=$(plan "['rungs'][$i].get('counts','')"); [ -n "$COUNTS" ] && COUNTS=$IN/$COUNTS || COUNTS=$IN/$(plan "['counts']")
  RAW=; NAME_OUT=$NAME
  if [ -f $OUT/$NAME/$NAME-files.json ]; then
    MISSING=$(python3 - $OUT/$NAME/$NAME-files.json $NAME "$(plan ".get('quants','Q4_K_M')")" <<'PY'
import json,sys; have={f["file"] for f in json.load(open(sys.argv[1]))["files"]}; name=sys.argv[2]
print(",".join(q for q in sys.argv[3].split(",") if q and q.lower()!="none" and f"{name}-{q}.gguf" not in have))
PY
)
    if [ -n "$MISSING" ] && [ -d $W/healed-$NAME ] && [ -f $S/llama-ready ]; then
      status export "$NAME: adding the $MISSING files"
      python3 export.py --model $W/healed-$NAME --out $OUT/$NAME --name "$NAME" --nickname "$NICK" --teacher "$(plan "['teacher']")" --llama $S/llama.cpp --quants "$MISSING" --merge || echo "$NAME top-up failed (the earlier files stand)"
      status ready "$NAME: $MISSING added"
    fi
    echo "$NAME already done"; continue
  fi
  rm -rf $OUT/$NAME $W/healed-$NAME  # a restart redoes this rung from the cut (a raw export or a half heal is not kept)
  if [ "$FROM" = "teacher" ]; then SRC=$TEACHER_DIR; elif [[ "$FROM" == */* ]]; then SRC=$S/$FROM; [ -f $SRC/../counts-$(basename $FROM | sed s/healed-//).json ] && COUNTS=$SRC/../counts-$(basename $FROM | sed s/healed-//).json; else SRC=$W/healed-$FROM; [ -f $W/counts-$FROM.json ] && COUNTS=$W/counts-$FROM.json; fi
  [ -d "$SRC" ] || die "$NAME: source $FROM is missing"
  status cut "$NAME: keeping $KEEP of the experts in $FROM"   # "cover" = the coverage rule decides the number
  # a complete cut from an earlier run of this session is reused (a restart should not redo 14 minutes of cutting)
  # (a fold rung's cut only counts as finished once the fold has marked it; a half-folded cut is made again)
  if python3 - $W/cut-$NAME $KEEP "$(plan "['rungs'][$i].get('fold',p.get('fold',False))")" <<'PY'
import json,os,sys; d=sys.argv[1]
try:
    cfg=json.load(open(f"{d}/config.json")); idx=json.load(open(f"{d}/model.safetensors.index.json"))
    ok=cfg.get("bob",{}).get("experts_kept",None)==int(sys.argv[2]) and all(os.path.exists(f"{d}/{f}") for f in set(idx["weight_map"].values())) and os.path.exists(f"{d}/bob-keep.json") and (("folded" in cfg.get("bob",{})) == (sys.argv[3]=="True"))
except Exception: ok=False
print("reusing the finished cut" if ok else "cutting"); sys.exit(0 if ok else 1)
PY
  then :; else
    rm -rf $W/cut-$NAME
    KF=$(plan "['rungs'][$i].get('keep_file','')")
    if [ "$KEEP" = "cover" ]; then
      # coverage cut: count every skill on the source model, then keep what each skill needs
      mkdir -p $OUT/$NAME
      status cut "$NAME: counting the experts used for every skill in $FROM"
      python3 countskills.py --model $SRC --lessons $IN --skills "$(plan "['skills']")" --out-dir $W --prefix counts-$NAME --pieces $(plan ".get('skill_pieces',300)") --cache $CACHE --max-len $(plan ".get('max_len',8192)") $GEN $REAP || die "$NAME skill counts"
      CARGS=$(python3 -c "import json,os; p=json.load(open('$IN/plan.json')); print(','.join(f'{k}=$W/counts-$NAME-{k}.json' for k in p['skills'] if os.path.exists(f'$W/counts-$NAME-{k}.json')))")
      status cut "$NAME: building the coverage keep list"
      python3 keep.py --counts "$CARGS" --out $W/keep-$NAME.json --report $OUT/$NAME/coverage.md --name $NAME \
        --cover $(plan "['rungs'][$i].get('cover',p.get('cover',0.95))") --strong "$(plist ".get('strong',[])")" --strong-cover $(plan ".get('strong_cover',0.99)") \
        --keep $(plan "['rungs'][$i].get('keep_n',0)") --max $(plan "['rungs'][$i].get('max',0)") --by $SCORE || die "$NAME keep list"
      KEEP=$(python3 -c "import json; print(json.load(open('$W/keep-$NAME.json'))['experts'])"); KF=keep-$NAME.json; cp $W/keep-$NAME.json $IN/keep-$NAME.json
      status cut "$NAME: coverage cut keeps $KEEP of the experts (see coverage.md)"
    fi
    if [ -n "$KF" ]; then echo "cutting with the keep list $KF"; python3 prune.py --src $SRC --dst $W/cut-$NAME --keep-file $IN/$KF --name $NAME || die "$NAME cut"
    else python3 prune.py --src $SRC --dst $W/cut-$NAME --counts $COUNTS --keep $KEEP --by $(cutby $COUNTS) --name $NAME || die "$NAME cut"; fi
    # Fold instead of drop (rung or plan "fold": true): blend each dropped expert into the kept expert most like it, in
    # place in the cut model, before the heal. Weighed by the skill counts of a coverage cut, else by the rung's counts.
    if [ "$(plan "['rungs'][$i].get('fold',p.get('fold',False))")" = "True" ] && [ "${TFAM:-qwen}" = gpt-oss ]; then echo "$NAME: fold is not built for GPT-OSS yet; the dropped experts are dropped"
    elif [ "$(plan "['rungs'][$i].get('fold',p.get('fold',False))")" = "True" ]; then
      FOLDC="${CARGS:-}"; [ "$(plan "['rungs'][$i]['keep']")" = "cover" ] || FOLDC=""; [ -z "$FOLDC" ] && [ -f "$COUNTS" ] && FOLDC=$COUNTS
      status cut "$NAME: folding the dropped experts into the kept ones"
      python3 fold.py --src $SRC --cut $W/cut-$NAME --counts "$FOLDC" || die "$NAME fold"
    fi
  fi
  status heal "$NAME: healing against the teacher"
  kernels_ready
  eval "$(python3 - $i <<'PY'
import json,sys,os; p=json.load(open(os.environ.get('FORGE_ROOT','/workspace')+'/in/plan.json')); r=p['rungs'][int(sys.argv[1])]; h=p.get('heal',{})
print(f"EXPERTS={r.get('experts',h.get('experts','lora'))}; HOURS={r.get('hours',h.get('hours',2.5))}; EPOCHS={h.get('epochs',1)}; MAXLEN={p.get('max_len',8192)}; QUANTS={p.get('quants','Q4_K_M')}")
# 13 Nov: new ways to learn, each only when the plan asks (heal.pref needs plan.pref, the pairs folder the PC sent)
pr=r.get('pref',h.get('pref')); op=r.get('onpolicy',h.get('onpolicy'))
a=[]
if pr and os.path.isdir(os.environ.get('FORGE_ROOT','/workspace')+'/in/pref'): a+=["--pref",os.environ.get('FORGE_ROOT','/workspace')+"/in/pref","--pref-kind",str(pr.get('kind','orpo')),"--pref-beta",str(pr.get('beta',0.1)),"--pref-every",str(pr.get('every',4)),"--pref-hours",str(pr.get('hours',0.5))]
if op: a+=["--onpolicy-frac",str(op.get('frac',0.2)),"--onpolicy-new",str(op.get('new',256)),"--onpolicy-temp",str(op.get('temp',1.0))]
print("NEWARGS='"+" ".join(a)+"'; ONPOLICY="+("1" if op else ""))
g=p.get('grpo'); print("GRPO="+("1" if g and (not g.get('rungs') or r['name'] in g['rungs']) else ""))
PY
)"
  [ -n "$ONPOLICY" ] && NEWARGS="$NEWARGS --onpolicy-teacher $TEACHER_DIR"
  mkdir -p $OUT/$NAME
  if python3 heal.py --model $W/cut-$NAME --lessons $IN --teacher $TPT --save $W/healed-$NAME --cache $CACHE \
    --experts $EXPERTS --epochs $EPOCHS --hours $HOURS --max-len $MAXLEN --report $OUT/$NAME/heal-report.json $GEN $NEWARGS $TGT; then
    rm -rf $W/cut-$NAME
    # 13 Nov: plan.grpo, a reward pass on tool calls after the heal; kept only if its held-out grade is no worse than the heal's
    if [ -n "$GRPO" ]; then
      status heal "$NAME: reward pass on tool calls (GRPO)"
      if python3 grpo.py --model $W/healed-$NAME --lessons $IN --save $W/grpo-$NAME --report $OUT/$NAME/grpo-report.json --max-len $MAXLEN \
          --hours $(plan "['grpo'].get('hours',1.5)") --steps $(plan "['grpo'].get('steps',200)") --group $(plan "['grpo'].get('group',6)") \
          --chats $(plan "['grpo'].get('chats',4)") --kl $(plan "['grpo'].get('kl',0.02)") --lr $(plan "['grpo'].get('lr',5e-6)") $TGT && \
         python3 -c "import json,sys; r=json.load(open(sys.argv[1])); sys.exit(0 if r['after']['reward']>=r['before']['reward'] and r.get('no_target_worse',True) else 1)" $OUT/$NAME/grpo-report.json; then
        cp $W/healed-$NAME/adapter.pt $W/grpo-$NAME/heal-adapter.pt; rm -rf $W/healed-$NAME; mv $W/grpo-$NAME $W/healed-$NAME; echo "$NAME: reward pass kept"
      else rm -rf $W/grpo-$NAME; echo "$NAME: reward pass did not help on the held-out chats (or failed): the healed Bob stays"; fi
    fi
  else
    # the heal is the newest code: if it breaks, keep the session useful by shipping the unhealed cut (REAP-style) and carrying on from it
    status heal "$NAME: heal FAILED, exporting the unhealed cut as $NAME-raw"
    rm -rf $W/healed-$NAME; mv $W/cut-$NAME $W/healed-$NAME; NAME_OUT="$NAME-raw"; RAW=1
  fi
  [ -z "${RAW:-}" ] && NAME_OUT="$NAME"
  # 13 Nov: plan.surgery, edits a live sweep showed help and hurt nothing, baked into this brain (surgery.py, CPU); the owner's
  # press of the purchase card is the go. A failed bake keeps the brain as it was.
  if [ -z "${RAW:-}" ] && [ -n "$(plan ".get('surgery')")" ]; then
    plan ".get('surgery')" > $IN/surgery.json
    status heal "$NAME: baking $(python3 -c "import json; print(len(json.load(open('$IN/surgery.json'))['edits']))") surgery edits"
    if python3 surgery.py --model $W/healed-$NAME --edits $IN/surgery.json --out $W/surg-$NAME > $OUT/$NAME/surgery.log 2>&1; then
      cp $W/surg-$NAME/surgery-report.json $OUT/$NAME/; rm -rf $W/healed-$NAME; mv $W/surg-$NAME $W/healed-$NAME; echo "$NAME: surgery baked"
    else rm -rf $W/surg-$NAME; echo "$NAME: surgery failed (out/$NAME/surgery.log), the brain stays as it was"; tail -3 $OUT/$NAME/surgery.log; fi
  fi
  status count "$NAME: counting which experts it uses now"
  python3 count.py --model $W/healed-$NAME --lessons $IN --out $W/counts-$NAME.json --cache $CACHE $GEN $REAP --lessons-max $( [ -n "${RAW:-}" ] && echo 300 || echo 600 ) || echo "count failed for $NAME (next rung will use the plan's counts)"
  cp $W/counts-$NAME.json $OUT/$NAME/ 2>/dev/null
  [ -f $W/healed-$NAME/adapter.pt ] && cp $W/healed-$NAME/adapter.pt $OUT/$NAME/$NAME-adapter.pt
  if [ "$S" != "$W" ]; then mkdir -p $S/bobs/$NAME && cp $W/healed-$NAME/adapter.pt $S/bobs/$NAME/adapter.pt 2>/dev/null; cp $W/healed-$NAME/bob-keep.json $S/bobs/$NAME/ 2>/dev/null; cp $W/counts-$NAME.json $S/bobs/$NAME/ 2>/dev/null; fi
  status export "$NAME: making the GGUF files"
  for i in $(seq 1 90); do [ -f $S/llama-ready ] || [ -f $S/llama-failed ] && break; sleep 20; done
  if [ -f $S/llama-ready ]; then
    python3 export.py --model $W/healed-$NAME --out $OUT/$NAME --name "$NAME_OUT" --nickname "$NICK" --teacher "$(plan "['teacher']")" --jobs "$(plan ".get('jobs','bob,deep,tinker,reviewer,office,ledger,scout')")" --llama $S/llama.cpp --quants $QUANTS --pending || die "$NAME export"
    keep_bob $NAME "$NAME_OUT" "$NICK"
  else
    echo "llama-quantize unavailable: exporting BF16 GGUF only (bigger download; quantize on the PC with llama-quantize)"
    python3 export.py --model $W/healed-$NAME --out $OUT/$NAME --name "$NAME_OUT" --nickname "$NICK" --teacher "$(plan "['teacher']")" --llama $S/llama.cpp --quants none --keep-bf16 || die "$NAME export"
  fi
  release_files $NAME "$NAME_OUT"
  status ready "$NAME_OUT ready to download"; unset RAW
  # free disk: keep only the newest healed Bob (the next rung is cut from it)
  [ "$FROM" != "teacher" ] && [[ "$FROM" != */* ]] && [ -z "$(plan ".get('keep_healed','')")" ] && rm -rf $W/healed-$FROM   # keep_healed: every healed Bob stays (on a network volume, for the next session)
done
if [ -n "$(plan ".get('benchmark')")" ]; then run_bench; fi
# every log and report of this run stays on the volume too
if [ "$S" != "$W" ]; then RT=$S/runs/$(plan ".get('run','run')")-$(date -u +%Y%m%dT%H%M); mkdir -p $RT; cp $OUT/*.log $OUT/*.json $OUT/*.txt $RT/ 2>/dev/null; for d in $OUT/*/; do [ -d "$d" ] && { mkdir -p $RT/$(basename $d); cp $d/*.json $d/*.md $d/*.txt $RT/$(basename $d)/ 2>/dev/null; }; done; echo "run files kept on the volume at $RT"; fi
rm -f $IN/hf-token
run_done "all rungs finished"
