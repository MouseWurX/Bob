#!/bin/bash
# kld_check.sh <reference.gguf> <text file> <out dir> <llama-perplexity> <name>=<candidate.gguf> ...
# 24 Nov 2026 (mixed-bit recipes; method learned from llamAmpere v0.6.3's release notes: drift against an 8-bit reference
# on a fixed set of positions, lower is better, two runs, paired). The reference is the cut's own Q8_0 (the file every quant
# is made from), so this measures what quantizing costs, not what cutting cost. Its next-word odds are saved once
# (<out>/base.kld), then each candidate is read on the same text and the same positions.
# Writes <out>/kld.tsv: name, mean KLD, its +-, same top token %, PPL ratio. Measure only: nothing is changed or uploaded.
# Text: neutral public text (wikitext-2 test), never Bob's held-out jobs, never text Claude wrote.
REF=$1 TXT=$2 OUT=$3 LP=$4; shift 4
CH=${KLD_CHUNKS:-24} CTX=${KLD_CTX:-512}
[ -x "$LP" ] || { echo "kld: no llama-perplexity at $LP; KLD skipped"; exit 0; }
mkdir -p "$OUT"; TSV=$OUT/kld.tsv; [ -f "$TSV" ] || printf '# name\tmean_kld\tkld_pm\tsame_top_pct\tppl_ratio\n' > "$TSV"
LDP="$(dirname "$LP"):${LD_LIBRARY_PATH:-}"
if [ ! -s "$OUT/base.kld" ]; then
  # the Q8_0 cut is bigger than one card: experts stay in system RAM, the rest on the card
  LD_LIBRARY_PATH="$LDP" timeout 7200 "$LP" -m "$REF" -f "$TXT" -c $CTX --chunks $CH -ngl 999 --n-cpu-moe 999 \
    --kl-divergence-base "$OUT/base.kld.part" > "$OUT/base.log" 2>&1 && mv -f "$OUT/base.kld.part" "$OUT/base.kld" \
    || { echo "kld: the reference run failed (see $OUT/base.log)"; tail -3 "$OUT/base.log"; exit 1; }
fi
for nc in "$@"; do
  N=${nc%%=*} F=${nc#*=}
  grep -q "^$N	" "$TSV" && { echo "kld: $N already measured"; continue; }
  # 26 Nov: a run can end before llama.cpp's log thread writes the closing statistics (seen in 3 of 7 runs on a tiny brain,
  # processor only), so a log with no "Mean KLD" line gets one more run
  for try in 1 2; do
    LD_LIBRARY_PATH="$LDP" timeout 3600 "$LP" -m "$F" -c $CTX --chunks $CH -ngl 999 --kl-divergence-base "$OUT/base.kld" \
      --kl-divergence > "$OUT/kld-$N.log" 2>&1 || { echo "kld: $N failed (see $OUT/kld-$N.log)"; continue 2; }
    grep -Eq "Mean +KLD:" "$OUT/kld-$N.log" && break
  done
  python3 - "$OUT/kld-$N.log" "$N" >> "$TSV" <<'PY'
import re, sys
t = open(sys.argv[1], errors="replace").read()
k = re.search(r"Mean\s+KLD:\s+([\d.]+)\s+±\s+([\d.]+)", t); s = re.search(r"Same top p:\s+([\d.]+)", t)
r = re.search(r"Mean PPL\(Q\)/PPL\(base\)\s+:\s+([\d.]+)", t)
if not k: sys.exit(f"{sys.argv[2]}: no Mean KLD line")
print("\t".join([sys.argv[2], k.group(1), k.group(2), s.group(1) if s else "", r.group(1) if r else ""]))
PY
  tail -1 "$TSV"
done
