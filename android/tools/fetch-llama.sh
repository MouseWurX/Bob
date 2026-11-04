#!/usr/bin/env sh
# Gets llama.cpp at the exact commit in llama.cpp.pin, into android/third_party/llama.cpp.
# Run once before opening android/ in Android Studio. GitHub's build runs it too.
set -eu
cd "$(dirname "$0")/.."
PIN=$(tr -d ' \r\n' < llama.cpp.pin)
DIR=third_party/llama.cpp
mkdir -p "$DIR"
cd "$DIR"
[ -d .git ] || git init -q
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/ggml-org/llama.cpp
git fetch -q --depth 1 origin "$PIN"
git checkout -q --force FETCH_HEAD
echo "llama.cpp at $(git rev-parse HEAD)"
[ "$(git rev-parse HEAD)" = "$PIN" ] || { echo "Got the wrong commit"; exit 1; }
