#!/bin/bash
# quant_gate.sh <gguf> <quant> <expected-gb-range "lo-hi" or ""> <llama-server> <report file>
# 24 Nov 2026 (the owner: "we can't have a broken file go up"): nothing goes to Hugging Face unless it passes all three:
#  1. size: inside the plan's expected range for this quant (a 65.8 GB IQ2_XXS planned at ~44 GB stopped here);
#  2. it loads in llama-server on this card;
#  3. it answers two plain questions sensibly (greedy): not empty, not one repeated word or '?' rubbish, and at least one right.
# Exit 0 = pass. Every check is written to the report, which the PC brings back.
F=$1 Q=$2 RANGE=$3 LS=$4 REP=$5
say() { echo "$*" | tee -a "$REP"; }
B=$(stat -c %s "$F"); GB=$(python3 -c "print(round($B/1e9,2))")
say "== $Q $(basename "$F") $GB GB"
if [ -n "$RANGE" ]; then
  python3 -c "import sys; lo,hi=map(float,'$RANGE'.split('-')); sys.exit(0 if lo <= $GB <= hi else 1)" || { say "FAIL size: $GB GB is outside the expected $RANGE GB"; exit 1; }
  say "PASS size: $GB GB inside $RANGE GB"
else say "FAIL size: no expected range for $Q in the plan (cut.expect_gb)"; exit 1; fi
PORT=8099
LD_LIBRARY_PATH="$(dirname "$LS"):${LD_LIBRARY_PATH:-}" "$LS" -m "$F" --host 127.0.0.1 --port $PORT -c 4096 -np 1 -ngl 999 --jinja > "$REP.server.log" 2>&1 &
P=$!
for i in $(seq 1 120); do curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/health 2>/dev/null | grep -q 200 && break; kill -0 $P 2>/dev/null || break; sleep 10; done
if ! kill -0 $P 2>/dev/null || ! curl -s http://127.0.0.1:$PORT/health | grep -q ok; then say "FAIL load: llama-server didn't come up"; tail -5 "$REP.server.log" | tee -a "$REP"; kill $P 2>/dev/null; wait $P 2>/dev/null; exit 1; fi
say "PASS load"
ask() { curl -s -m 300 http://127.0.0.1:$PORT/v1/chat/completions -H 'Content-Type: application/json' -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$1\"}],\"max_tokens\":400,\"temperature\":0,\"chat_template_kwargs\":{\"enable_thinking\":false}}" | python3 -c "import json,sys; j=json.load(sys.stdin); print((j['choices'][0]['message'].get('content') or '').strip())" 2>/dev/null; }
A1=$(ask "What is the capital of France? Answer in one word."); A2=$(ask "What is 17 plus 25? Answer with the number only.")
kill $P 2>/dev/null; wait $P 2>/dev/null
say "answer 1: ${A1:0:200}"; say "answer 2: ${A2:0:200}"
python3 - "$A1" "$A2" <<'PY' >> "$REP" || { echo "FAIL answers: rubbish or both wrong" | tee -a "$REP"; exit 1; }
import sys,re
a1,a2=sys.argv[1],sys.argv[2]
def junk(t):
    w=t.split()
    return not t or t.count('?')>len(t)/3 or (len(w)>=6 and len(set(w))<=2)
if junk(a1) or junk(a2): sys.exit(1)
right=("paris" in a1.lower()) + bool(re.search(r"\b42\b",a2))
if right < 1: sys.exit(1)
print(f"PASS answers: {right} of 2 right")
PY
tail -1 "$REP"; exit 0
