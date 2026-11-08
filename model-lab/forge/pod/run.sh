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
plan() { python3 -c "import json,sys; p=json.load(open('$IN/plan.json')); v=p$1; print(json.dumps(v) if isinstance(v,(dict,list)) else ('' if v is None else v))" || echo "plan lookup failed: $1" >&2; }
plist() { plan "$1" | python3 -c "import json,sys; d=sys.stdin.read().strip(); print(','.join(json.loads(d)) if d else '')"; }   # a list field as a,b,c
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
[ -z "${FORGE_SETUP_ONLY:-}" ] && ! grep -q "kernels done 0" $OUT/kernels.log 2>/dev/null && ( kernels > $OUT/kernels.log 2>&1 ) &
KERN=$!
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
wl() { python3 -c "import json; w=json.load(open('$IN/plan.json'))['write_lessons']; w=w if isinstance(w,list) else [w]; print($1)"; }   # one set or a list of sets
if [ -z "$WL" ] && ls $IN/lessons-extra-*.jsonl >/dev/null 2>&1; then touch $IN/lessons-ready; fi   # only PC-side extra sets: nothing to write, just merge
if { [ -n "$WL" ] || [ -f $IN/lessons-ready ]; } && [ ! -f $IN/lessons-merged ]; then
  if [ ! -f $IN/lessons-ready ]; then
    status lessons "starting the full Qwen server for the lesson writer"
    ( vllm serve $S/teacher --served-model-name teacher --port 8001 --api-key "$FORGE_TOKEN" --max-model-len $(wl "max(x.get('ctx',32768) for x in w)") \
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

# --- counts only (no rungs): count every skill on the full Qwen, build the ladder table, send the count files back ---
if [ "$(plan "['rungs'].__len__()")" = "0" ] && [ -n "$(plan ".get('skills')")" ]; then
  mkdir -p $OUT/counts
  status count "counting the experts the full Qwen uses for every skill (one model load)"
  python3 countskills.py --model $S/teacher --lessons $IN --skills "$(plan "['skills']")" --out-dir $OUT/counts --prefix counts-teacher --pieces $(plan ".get('skill_pieces',300)") --cache $W/lessons-tok.pt --max-len $(plan ".get('max_len',8192)") $GEN || die "skill counts"
  CARGS=$(python3 -c "import json,os; p=json.load(open('$IN/plan.json')); print(','.join(f'{k}=$OUT/counts/counts-teacher-{k}.json' for k in p['skills'] if os.path.exists(f'$OUT/counts/counts-teacher-{k}.json')))")
  status count "building the ladder table"
  python3 keep.py --counts "$CARGS" --report $OUT/counts/ladder.md --name teacher --cover $(plan ".get('cover',0.95)") --strong "$(plist ".get('strong',[])")" --strong-cover $(plan ".get('strong_cover',0.99)") --ladder $(plan ".get('ladder','240,224,208,192,176,160,144,128,112,96,80,64,48,32')") || die "ladder"
  python3 - $OUT/counts <<'PY'
import json,os,sys,hashlib; d=sys.argv[1]; files=[]
for f in sorted(os.listdir(d)):
    if f.endswith("-files.json"): continue
    b=open(f"{d}/{f}","rb").read(); files.append({"file":f,"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()})
json.dump({"name":"counts","files":files},open(f"{d}/counts-files.json","w"))
PY
  [ "$S" != "$W" ] && mkdir -p $S/counts && cp $OUT/counts/*.json $OUT/counts/ladder.md $S/counts/ 2>/dev/null
  status done "counts finished"; exit 0
fi

# --- teacher pass (once per lesson set, build 15): what the full Qwen thinks at every answer word (loaded in this process, no server) ---
# The pass takes hours, so its two files are kept: on the network volume under teacher-cache/<key>/ (any later pod in this
# data centre skips the pass), and on the PC (out/teacher/<key>/, downloaded as soon as they exist; a later pod with a fresh
# volume gets them uploaded back instead of redoing the pass). The key names the lesson set exactly: the merged lessons +
# toolsets, the teacher, top, max_len and the general-text budget. Rental 2 lost 2.5 h of this when the card deleted itself.
KEY=$(python3 - $IN $TEACHER "$(plan ".get('top',32)")" "$(plan ".get('max_len',8192)")" "$GENERAL_TOKENS" <<'PY'
import hashlib,sys; h=hashlib.sha256()
for f in ("lessons.jsonl","toolsets.json"):
    h.update(open(f"{sys.argv[1]}/{f}","rb").read())
h.update("|".join(sys.argv[2:]).encode()); print(h.hexdigest()[:16])
PY
)
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
    status teacher "scoring every lesson with the full Qwen3.6"
    python3 teacher.py --model $S/teacher --lessons $IN --out $TPT --top $(plan ".get('top',32)") \
      --max-len $(plan ".get('max_len',8192)") --cache $CACHE --hours $(plan ".get('teacher_hours',2.0)") $GEN || die "teacher pass"
  fi
fi
[ -f $TPT ] && [ -f $CACHE ] || die "no teacher.pt after the teacher pass"
# keep them: volume first (the next pod here skips the pass), then the file list that makes the PC download them (out/teacher/<key>/)
if [ "$S" != "$W" ] && [ ! -f $TC/teacher.pt ]; then status teacher "saving the teacher's scores on the volume"; mkdir -p $TC && cp $TPT $TC/teacher.pt.part && mv $TC/teacher.pt.part $TC/teacher.pt && cp $CACHE $TC/lessons-tok.pt && echo "$(date -u +%FT%TZ) $TEACHER" > $TC/made.txt || echo "could not save the teacher cache on the volume (no room?)"; fi
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
  if [ "$FROM" = "teacher" ]; then SRC=$S/teacher; elif [[ "$FROM" == */* ]]; then SRC=$S/$FROM; [ -f $SRC/../counts-$(basename $FROM | sed s/healed-//).json ] && COUNTS=$SRC/../counts-$(basename $FROM | sed s/healed-//).json; else SRC=$W/healed-$FROM; [ -f $W/counts-$FROM.json ] && COUNTS=$W/counts-$FROM.json; fi
  [ -d "$SRC" ] || die "$NAME: source $FROM is missing"
  status cut "$NAME: keeping $KEEP of the experts in $FROM"   # "cover" = the coverage rule decides the number
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
    if [ "$KEEP" = "cover" ]; then
      # coverage cut: count every skill on the source model, then keep what each skill needs
      mkdir -p $OUT/$NAME
      status cut "$NAME: counting the experts used for every skill in $FROM"
      python3 countskills.py --model $SRC --lessons $IN --skills "$(plan "['skills']")" --out-dir $W --prefix counts-$NAME --pieces $(plan ".get('skill_pieces',300)") --cache $CACHE --max-len $(plan ".get('max_len',8192)") $GEN || die "$NAME skill counts"
      CARGS=$(python3 -c "import json,os; p=json.load(open('$IN/plan.json')); print(','.join(f'{k}=$W/counts-$NAME-{k}.json' for k in p['skills'] if os.path.exists(f'$W/counts-$NAME-{k}.json')))")
      status cut "$NAME: building the coverage keep list"
      python3 keep.py --counts "$CARGS" --out $W/keep-$NAME.json --report $OUT/$NAME/coverage.md --name $NAME \
        --cover $(plan "['rungs'][$i].get('cover',p.get('cover',0.95))") --strong "$(plist ".get('strong',[])")" --strong-cover $(plan ".get('strong_cover',0.99)") \
        --keep $(plan "['rungs'][$i].get('keep_n',0)") --max $(plan "['rungs'][$i].get('max',0)") || die "$NAME keep list"
      KEEP=$(python3 -c "import json; print(json.load(open('$W/keep-$NAME.json'))['experts'])"); KF=keep-$NAME.json; cp $W/keep-$NAME.json $IN/keep-$NAME.json
      status cut "$NAME: coverage cut keeps $KEEP of the experts (see coverage.md)"
    fi
    if [ -n "$KF" ]; then echo "cutting with the keep list $KF"; python3 prune.py --src $SRC --dst $W/cut-$NAME --keep-file $IN/$KF --name $NAME || die "$NAME cut"
    else python3 prune.py --src $SRC --dst $W/cut-$NAME --counts $COUNTS --keep $KEEP --name $NAME || die "$NAME cut"; fi
  fi
  status heal "$NAME: healing against the teacher"
  kernels_ready
  eval "$(python3 - $i <<'PY'
import json,sys,os; p=json.load(open(os.environ.get('FORGE_ROOT','/workspace')+'/in/plan.json')); r=p['rungs'][int(sys.argv[1])]; h=p.get('heal',{})
print(f"EXPERTS={r.get('experts',h.get('experts','lora'))}; HOURS={r.get('hours',h.get('hours',2.5))}; EPOCHS={h.get('epochs',1)}; MAXLEN={p.get('max_len',8192)}; QUANTS={p.get('quants','Q4_K_M')}")
PY
)"
  mkdir -p $OUT/$NAME
  if python3 heal.py --model $W/cut-$NAME --lessons $IN --teacher $TPT --save $W/healed-$NAME --cache $CACHE \
    --experts $EXPERTS --epochs $EPOCHS --hours $HOURS --max-len $MAXLEN --report $OUT/$NAME/heal-report.json $GEN; then
    rm -rf $W/cut-$NAME
  else
    # the heal is the newest code: if it breaks, keep the session useful by shipping the unhealed cut (REAP-style) and carrying on from it
    status heal "$NAME: heal FAILED, exporting the unhealed cut as $NAME-raw"
    rm -rf $W/healed-$NAME; mv $W/cut-$NAME $W/healed-$NAME; NAME_OUT="$NAME-raw"; RAW=1
  fi
  [ -z "${RAW:-}" ] && NAME_OUT="$NAME"
  status count "$NAME: counting which experts it uses now"
  python3 count.py --model $W/healed-$NAME --lessons $IN --out $W/counts-$NAME.json --cache $CACHE $GEN --lessons-max $( [ -n "${RAW:-}" ] && echo 300 || echo 600 ) || echo "count failed for $NAME (next rung will use the plan's counts)"
  cp $W/counts-$NAME.json $OUT/$NAME/ 2>/dev/null
  [ -f $W/healed-$NAME/adapter.pt ] && cp $W/healed-$NAME/adapter.pt $OUT/$NAME/$NAME-adapter.pt
  if [ "$S" != "$W" ]; then mkdir -p $S/bobs/$NAME && cp $W/healed-$NAME/adapter.pt $S/bobs/$NAME/adapter.pt 2>/dev/null; cp $W/healed-$NAME/bob-keep.json $S/bobs/$NAME/ 2>/dev/null; cp $W/counts-$NAME.json $S/bobs/$NAME/ 2>/dev/null; fi
  status export "$NAME: making the GGUF files"
  for i in $(seq 1 90); do [ -f $S/llama-ready ] || [ -f $S/llama-failed ] && break; sleep 20; done
  if [ -f $S/llama-ready ]; then
    python3 export.py --model $W/healed-$NAME --out $OUT/$NAME --name "$NAME_OUT" --nickname "$NICK" --teacher "$(plan "['teacher']")" --jobs "$(plan ".get('jobs','bob,deep,tinker,reviewer,office,ledger,scout')")" --llama $S/llama.cpp --quants $QUANTS || die "$NAME export"
  else
    echo "llama-quantize unavailable: exporting BF16 GGUF only (bigger download; quantize on the PC with llama-quantize)"
    python3 export.py --model $W/healed-$NAME --out $OUT/$NAME --name "$NAME_OUT" --nickname "$NICK" --teacher "$(plan "['teacher']")" --llama $S/llama.cpp --quants none --keep-bf16 || die "$NAME export"
  fi
  status ready "$NAME_OUT ready to download"; unset RAW
  # free disk: keep only the newest healed Bob (the next rung is cut from it)
  [ "$FROM" != "teacher" ] && [[ "$FROM" != */* ]] && [ -z "$(plan ".get('keep_healed','')")" ] && rm -rf $W/healed-$FROM   # keep_healed: every healed Bob stays (on a network volume, for the next session)
done
# every log and report of this run stays on the volume too
if [ "$S" != "$W" ]; then RT=$S/runs/$(plan ".get('run','run')")-$(date -u +%Y%m%dT%H%M); mkdir -p $RT; cp $OUT/*.log $OUT/*.json $OUT/*.txt $RT/ 2>/dev/null; for d in $OUT/*/; do [ -d "$d" ] && { mkdir -p $RT/$(basename $d); cp $d/*.json $d/*.md $d/*.txt $RT/$(basename $d)/ 2>/dev/null; }; done; echo "run files kept on the volume at $RT"; fi
status done "all rungs finished"
