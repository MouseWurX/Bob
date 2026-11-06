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
plan() { python3 -c "import json,sys; v=json.load(open('$IN/plan.json'))$1; print(json.dumps(v) if isinstance(v,(dict,list)) else ('' if v is None else v))"; }
HOURS_MAX=$(plan ".get('hours_max',9)")
# Self-destruct a little before the time cap, whatever happens (the PC-side watchdog is the main one).
# elapsed = container age (from the init process start), never the host's uptime
ELAPSED=$(python3 -c "import os; up=float(open('/proc/uptime').read().split()[0]); st=int(open('/proc/1/stat').read().rsplit(')',1)[1].split()[19])/os.sysconf('SC_CLK_TCK'); print(int(up-st))" 2>/dev/null || echo 0)
( sleep $(python3 -c "print(max(300, int(($HOURS_MAX*60-8)*60) - $ELAPSED))"); status failed "time cap reached, pod deleting itself"; \
  python3 -c "import os,urllib.request; r=urllib.request.Request('https://rest.runpod.io/v1/pods/'+os.environ['RUNPOD_POD_ID'], method='DELETE', headers={'Authorization':'Bearer '+os.environ.get('FORGE_RUNPOD_KEY', os.environ.get('RUNPOD_API_KEY',''))}); print(urllib.request.urlopen(r).read()[:200])" >> $OUT/watchdog.log 2>&1 ) &
WD=$!; trap 'kill $WD 2>/dev/null' EXIT 

status setup "installing tools"
pip install -q aiohttp gguf sentencepiece huggingface_hub pyarrow accelerate 2>&1 | tail -1
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || echo "no nvidia-smi"
df -h $W | tail -1; [ "$S" != "$W" ] && { echo "shared volume: $S"; ls $S; }
# fast kernels for the linear-attention layers: built in the background (causal-conv1d compiles for ~10 min); heal.py uses them if they made it
[ -z "${FORGE_SETUP_ONLY:-}" ] && ! grep -q "kernels done 0" $OUT/kernels.log 2>/dev/null && ( pip install -q flash-linear-attention > $OUT/kernels.log 2>&1; pip install -q causal-conv1d >> $OUT/kernels.log 2>&1; echo "kernels done $?" >> $OUT/kernels.log ) &
# llama.cpp tools get ready in the background (needed only at export time); see llama-tools.sh
if [ -f $S/llama-ready ]; then echo "llama tools already built"; else
  rm -f $S/llama-failed; ( bash $POD/llama-tools.sh $S $(plan ".get('llama_tag','b11669')") > $OUT/llama-setup.log 2>&1 ) &
fi
[ -n "${FORGE_SETUP_ONLY:-}" ] && { kill $WD 2>/dev/null; wait; cat $OUT/llama-setup.log; status done "setup only"; exit 0; }
TEACHER=$(plan "['teacher']")
status download "teacher weights ($TEACHER)"
dl() { hf download "$@" >/dev/null 2>$OUT/hf-dl.log || { echo "download retry (plain)"; HF_HUB_ENABLE_HF_TRANSFER=0 hf download "$@" >/dev/null 2>>$OUT/hf-dl.log; }; }
dl "$TEACHER" --local-dir $S/teacher || die "teacher download (see out/hf-dl.log)"
[ -f $S/teacher/config.json ] && ls $S/teacher/*.safetensors >/dev/null 2>&1 || die "teacher download incomplete"
du -sh $S/teacher
GENERAL_TOKENS=$(plan ".get('general_tokens',30000000)")
if [ "$GENERAL_TOKENS" -gt 0 ] && [ ! -d $S/general ]; then
  status download "general text (FineWeb-Edu sample + Tulu 3 chats)"
  dl HuggingFaceFW/fineweb-edu --repo-type dataset --include "sample/10BT/000_00000.parquet" --local-dir $S/general/fineweb-edu || echo "FineWeb-Edu download failed (going on without it)"
  dl allenai/tulu-3-sft-mixture --repo-type dataset --include "data/train-00000-of-*.parquet" --local-dir $S/general/tulu3 || echo "Tulu 3 download failed (going on without it)"
  find $S/general -name '*.parquet' | head
fi
GEN="--general $S/general --general-tokens $GENERAL_TOKENS"

# --- extra lessons written on this card (plan.write_lessons): vLLM serves the full Qwen, the PC's lesson writer talks to it ---
WL=$(plan ".get('write_lessons')")
if [ -n "$WL" ] && [ ! -f $IN/lessons-merged ]; then
  if [ ! -f $IN/lessons-ready ]; then
    status lessons "starting the full Qwen server for the lesson writer"
    ( vllm serve $S/teacher --served-model-name teacher --port 8001 --api-key "$FORGE_TOKEN" --max-model-len $(plan "['write_lessons'].get('ctx',32768)") \
        --gpu-memory-utilization 0.90 --max-num-seqs $(plan "['write_lessons'].get('seqs',32)") --enable-auto-tool-choice --tool-call-parser qwen3_coder --reasoning-parser qwen3 \
        > $OUT/vllm.log 2>&1 ) &
    VL=$!
    for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $FORGE_TOKEN" http://127.0.0.1:8001/v1/models 2>/dev/null | grep -q 200 && break; kill -0 $VL 2>/dev/null || die "vLLM died (see out/vllm.log)"; sleep 10; done
    curl -s -H "Authorization: Bearer $FORGE_TOKEN" http://127.0.0.1:8001/v1/models | grep -q teacher || die "vLLM never came up (see out/vllm.log)"
    status lessons "ready: the PC writes the lessons now (port 8001)"
    LW_MAX=$(python3 -c "print(int(($(plan "['write_lessons'].get('hours',1.5)")+0.5)*120))")
    for i in $(seq 1 $LW_MAX); do [ -f $IN/lessons-ready ] && break; kill -0 $VL 2>/dev/null || { status lessons "vLLM died while writing; waiting for the PC to finish or retry"; }; sleep 30; done
    [ -f $IN/lessons-ready ] || die "the PC never sent the extra lessons"
    pkill -f "vllm serve" 2>/dev/null; sleep 5; pkill -9 -f "vllm" 2>/dev/null
    for i in $(seq 1 60); do U=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | head -1); [ "${U:-0}" -lt 4000 ] && break; sleep 5; done
  fi
  status lessons "merging the extra lessons"
  python3 - $IN <<'PY' || die "lesson merge"
import json,sys,os; d=sys.argv[1]
extra=[json.loads(l) for l in open(f"{d}/lessons-extra.jsonl") if l.strip()]
sets=json.load(open(f"{d}/toolsets.json")); sets.update(json.load(open(f"{d}/toolsets-extra.json")))
json.dump(sets,open(f"{d}/toolsets.json","w"))
with open(f"{d}/lessons.jsonl","a") as f:
    for l in extra: l["idea"]="x"+str(l["idea"]); f.write(json.dumps(l)+"\n")   # ids prefixed so they never collide with the Bob set
open(f"{d}/lessons-merged","w").write(str(len(extra)))
print(f"merged {len(extra)} extra lessons; toolsets {len(sets)}")
PY
  rm -f $OUT/teacher.pt $W/lessons-tok.pt   # the teacher pass must see the new lessons
fi

# the model code needs a current transformers (vLLM is not used any more, so this is safe at setup)
pip install -q "transformers==5.22.1" 2>&1 | tail -1
python3 -c "import transformers, torch; from transformers import Qwen3_5MoeForConditionalGeneration; print('transformers', transformers.__version__, 'torch', torch.__version__, 'grouped_mm', hasattr(torch, '_grouped_mm'))" || die "transformers 5.22.1 install failed"
cat $OUT/kernels.log 2>/dev/null | tail -2

# --- teacher pass (once): what the full Qwen thinks at every answer word (loaded in this process, no server) ---
if [ ! -f $OUT/teacher.pt ]; then
  status teacher "scoring every lesson with the full Qwen3.6"
  python3 teacher.py --model $S/teacher --lessons $IN --out $OUT/teacher.pt --top $(plan ".get('top',32)") \
    --max-len $(plan ".get('max_len',8192)") --cache $W/lessons-tok.pt --hours $(plan ".get('teacher_hours',2.0)") $GEN || die "teacher pass"
fi
[ -f $OUT/teacher.pt ] || die "no teacher.pt after the teacher pass"

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
      python3 export.py --model $W/healed-$NAME --out $OUT/$NAME --name "$NAME" --nickname "$NICK" --llama $S/llama.cpp --quants "$MISSING" --merge || echo "$NAME top-up failed (the earlier files stand)"
      status ready "$NAME: $MISSING added"
    fi
    echo "$NAME already done"; continue
  fi
  rm -rf $OUT/$NAME $W/healed-$NAME  # a restart redoes this rung from the cut (a raw export or a half heal is not kept)
  if [ "$FROM" = "teacher" ]; then SRC=$S/teacher; elif [[ "$FROM" == */* ]]; then SRC=$S/$FROM; [ -f $SRC/../counts-$(basename $FROM | sed s/healed-//).json ] && COUNTS=$SRC/../counts-$(basename $FROM | sed s/healed-//).json; else SRC=$W/healed-$FROM; [ -f $W/counts-$FROM.json ] && COUNTS=$W/counts-$FROM.json; fi
  [ -d "$SRC" ] || die "$NAME: source $FROM is missing"
  status cut "$NAME: keeping $KEEP of the experts in $FROM"
  # a complete cut from an earlier run of this session is reused (a restart should not redo 14 minutes of cutting)
  if python3 - $W/cut-$NAME $KEEP <<'PY'
import json,os,sys; d=sys.argv[1]
try:
    cfg=json.load(open(f"{d}/config.json")); idx=json.load(open(f"{d}/model.safetensors.index.json"))
    ok=cfg.get("bob",{}).get("experts_kept",None)==int(sys.argv[2]) and all(os.path.exists(f"{d}/{f}") for f in set(idx["weight_map"].values())) and os.path.exists(f"{d}/bob-keep.json")
except Exception: ok=False
print("reusing the finished cut" if ok else "cutting"); sys.exit(0 if ok else 1)
PY
  then :; else
    rm -rf $W/cut-$NAME
    KF=$(plan "['rungs'][$i].get('keep_file','')")
    if [ -n "$KF" ]; then echo "cutting with the keep list $KF"; python3 prune.py --src $SRC --dst $W/cut-$NAME --keep-file $IN/$KF --name $NAME || die "$NAME cut"
    else python3 prune.py --src $SRC --dst $W/cut-$NAME --counts $COUNTS --keep $KEEP --name $NAME || die "$NAME cut"; fi
  fi
  status heal "$NAME: healing against the teacher"
  eval "$(python3 - $i <<'PY'
import json,sys,os; p=json.load(open(os.environ.get('FORGE_ROOT','/workspace')+'/in/plan.json')); r=p['rungs'][int(sys.argv[1])]; h=p.get('heal',{})
print(f"EXPERTS={r.get('experts',h.get('experts','lora'))}; HOURS={r.get('hours',h.get('hours',2.5))}; EPOCHS={h.get('epochs',1)}; MAXLEN={p.get('max_len',8192)}; QUANTS={p.get('quants','Q4_K_M')}")
PY
)"
  mkdir -p $OUT/$NAME
  if python3 heal.py --model $W/cut-$NAME --lessons $IN --teacher $OUT/teacher.pt --save $W/healed-$NAME --cache $W/lessons-tok.pt \
    --experts $EXPERTS --epochs $EPOCHS --hours $HOURS --max-len $MAXLEN --report $OUT/$NAME/heal-report.json $GEN; then
    rm -rf $W/cut-$NAME
  else
    # the heal is the newest code: if it breaks, keep the session useful by shipping the unhealed cut (REAP-style) and carrying on from it
    status heal "$NAME: heal FAILED, exporting the unhealed cut as $NAME-raw"
    rm -rf $W/healed-$NAME; mv $W/cut-$NAME $W/healed-$NAME; NAME_OUT="$NAME-raw"; RAW=1
  fi
  [ -z "${RAW:-}" ] && NAME_OUT="$NAME"
  status count "$NAME: counting which experts it uses now"
  python3 count.py --model $W/healed-$NAME --lessons $IN --out $W/counts-$NAME.json --cache $W/lessons-tok.pt $GEN --lessons-max $( [ -n "${RAW:-}" ] && echo 300 || echo 600 ) || echo "count failed for $NAME (next rung will use the plan's counts)"
  cp $W/counts-$NAME.json $OUT/$NAME/ 2>/dev/null
  [ -f $W/healed-$NAME/adapter.pt ] && cp $W/healed-$NAME/adapter.pt $OUT/$NAME/$NAME-adapter.pt
  if [ "$S" != "$W" ]; then mkdir -p $S/bobs/$NAME && cp $W/healed-$NAME/adapter.pt $S/bobs/$NAME/adapter.pt 2>/dev/null; cp $W/healed-$NAME/bob-keep.json $S/bobs/$NAME/ 2>/dev/null; cp $W/counts-$NAME.json $S/bobs/$NAME/ 2>/dev/null; fi
  status export "$NAME: making the GGUF files"
  for i in $(seq 1 90); do [ -f $S/llama-ready ] || [ -f $S/llama-failed ] && break; sleep 20; done
  if [ -f $S/llama-ready ]; then
    python3 export.py --model $W/healed-$NAME --out $OUT/$NAME --name "$NAME_OUT" --nickname "$NICK" --llama $S/llama.cpp --quants $QUANTS || die "$NAME export"
  else
    echo "llama-quantize unavailable: exporting BF16 GGUF only (bigger download; quantize on the PC with llama-quantize)"
    python3 export.py --model $W/healed-$NAME --out $OUT/$NAME --name "$NAME_OUT" --nickname "$NICK" --llama $S/llama.cpp --quants none --keep-bf16 || die "$NAME export"
  fi
  status ready "$NAME_OUT ready to download"; unset RAW
  # free disk: keep only the newest healed Bob (the next rung is cut from it)
  [ "$FROM" != "teacher" ] && [[ "$FROM" != */* ]] && [ -z "$(plan ".get('keep_healed','')")" ] && rm -rf $W/healed-$FROM   # keep_healed: every healed Bob stays (on a network volume, for the next session)
done
status done "all rungs finished"
