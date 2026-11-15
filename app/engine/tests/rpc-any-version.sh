#!/usr/bin/env bash
# Patch 0014: card sharing between two Brain Engine builds (engine/ENGINE-MAP.md, 0014-rpc-any-version).
# Usage: bash engine/tests/rpc-any-version.sh OLD_BIN NEW_BIN BRAIN.gguf
#   OLD_BIN, NEW_BIN  build/bin folders of two Brain Engine builds (each with ggml-rpc-server and llama-completion)
#   BRAIN.gguf        any small brain; every layer runs on the lent card
# Runs the brain greedily on its own, then with every layer on a lent card in all four pairings, and checks that every
# run writes the same words. Exits 0 when they all match.
set -u
old=$1; new=$2; gguf=$3; tmp=$(mktemp -d); port=50170; bad=0
run() { "$1/llama-completion" -m "$gguf" -p "Once upon a time" -n 24 --temp 0 --seed 1 -no-cnv -c 256 "${@:2}" 2>> "$tmp/err.log"; }
want=$(run "$new")
for pair in "$old $old" "$old $new" "$new $old" "$new $new"; do
  set -- $pair; port=$((port + 1))
  "$1/ggml-rpc-server" -H 127.0.0.1 -p $port >> "$tmp/rpc.log" 2>&1 & pid=$!; sleep 2
  got=$(run "$2" --rpc 127.0.0.1:$port -ngl 99 -dev RPC0)
  kill $pid 2>/dev/null; wait $pid 2>/dev/null
  if [ "$got" = "$want" ]; then echo "PASS lender $1, borrower $2"; else echo "FAIL lender $1, borrower $2"; bad=1; fi
done
[ $bad = 0 ] && rm -rf "$tmp" || echo "logs in $tmp"
exit $bad
