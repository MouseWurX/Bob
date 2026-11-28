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
# Nov 26: if ggml-org doesn't answer, our saved copy (MouseWurX/Bob pre-release llama.cpp-b12359) holds the whole
# history up to b12359, this commit included (app/docs/llama-cpp-map.md)
if ! git fetch -q --depth 1 origin "$PIN"; then
  echo "ggml-org didn't answer; using our saved copy of llama.cpp"
  curl -fsSL --retry 3 -o ../llama.bundle https://github.com/MouseWurX/Bob/releases/download/llama.cpp-b12359/llama.cpp-b12359.bundle
  git fetch -q ../llama.bundle refs/tags/b12359
  rm -f ../llama.bundle
fi
git checkout -q --force "$PIN"
echo "llama.cpp at $(git rev-parse HEAD)"
[ "$(git rev-parse HEAD)" = "$PIN" ] || { echo "Got the wrong commit"; exit 1; }
