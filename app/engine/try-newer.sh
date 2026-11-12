#!/usr/bin/env bash
# Tries Brain Engine's patches on a newer llama.cpp release (app/engine/README.md, "Moving to a newer llama.cpp").
# Usage: bash app/engine/try-newer.sh [NEW_TAG] [OUT_DIR]
#   NEW_TAG  the llama.cpp tag to try (default: the newest bNNNN tag on ggml-org/llama.cpp)
#   OUT_DIR  where the work goes (default: ./try-newer)
# It puts the patches on the tag in package.json (bob.bundledLlamaTag) as one commit each, then replays those commits
# on NEW_TAG with git's three-way merge, so a patch whose surrounding lines only moved still goes on. When every patch
# goes on, OUT_DIR/patches holds the moved patches (same names, same order), OUT_DIR/llama.cpp is NEW_TAG with them
# applied, ready to build. Prints "result=..." lines for the workflow; exits 0 when the patches went on, 3 when one
# needs a hand (OUT_DIR/conflict.txt says which), 4 when there is nothing newer.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
app=$(cd "$here/.." && pwd)
url=https://github.com/ggml-org/llama.cpp.git
old=$(node -p "require('$app/package.json').bob.bundledLlamaTag")
new=${1:-$(git ls-remote --tags "$url" 'b*' | sed -n 's#.*refs/tags/\(b[0-9]*\)$#\1#p' | sort -V | tail -1)}
out=${2:-try-newer}
echo "result.old=$old"
echo "result.new=$new"
if [ "${old#b}" -ge "${new#b}" ] 2>/dev/null; then echo "result=nothing-newer"; exit 4; fi
rm -rf "$out"; mkdir -p "$out/patches"
src="$out/llama.cpp"
# just enough history to join the two tags
git -c advice.detachedHead=false clone -q --branch "$new" --shallow-exclude="$old" "$url" "$src"
git -C "$src" fetch -q --deepen=2 origin
git -C "$src" fetch -q origin tag "$old"
g() { git -C "$src" -c user.name="Brain Engine" -c user.email=brain-engine@localhost -c advice.detachedHead=false "$@"; }
g checkout -q -b be-old "$old"
for p in "$here"/patches/*.patch; do
  g apply "$p"; g add -A; g commit -q -m "$(basename "$p")"
done
g checkout -q -b be-new "$new"
prev=$(g rev-parse HEAD)
for c in $(g rev-list --reverse "$old..be-old"); do
  name=$(g log -1 --format=%s "$c")
  if ! g cherry-pick "$c" > /dev/null 2>&1; then
    { echo "$name does not go onto llama.cpp $new on its own. These files need a hand:"; g diff --name-only --diff-filter=U; } > "$out/conflict.txt"
    g cherry-pick --abort || true
    cat "$out/conflict.txt"
    echo "result=needs-a-hand"
    echo "result.patch=$name"
    exit 3
  fi
  g diff --no-color "$prev" HEAD > "$out/patches/$name"
  prev=$(g rev-parse HEAD)
done
echo "result=applied"
