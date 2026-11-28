#!/usr/bin/env bash
# Gets llama.cpp's source at a tag into DEST, from our own saved copy first and from ggml-org second.
# Usage: bash app/engine/fetch-llama.sh [TAG] [DEST]
#   TAG   default: bob.bundledLlamaTag in app/package.json (b12359)
#   DEST  default: ./llama.cpp (must not exist yet, or be empty)
# Our saved copy is the pre-release llama.cpp-<TAG> on MouseWurX/Bob, made by .github/workflows/llama-copy.yml:
# the whole history up to the tag as one git bundle (so DEST is a real git checkout, exactly like a clone from
# ggml-org, with the same commit and build number). If that copy isn't there (another tag, or not made yet), it
# clones ggml-org/llama.cpp at the tag instead, as every build did before. Either way, for the tag Bob pins, the
# commit must be bob.bundledLlamaSha, or it stops. See app/docs/llama-cpp-map.md.
# LLAMA_COPY_ONLY=1 never asks ggml-org (to prove our copy works on its own).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
app=$(cd "$here/.." && pwd)
# read from app/ itself: on Windows (Git Bash) node can't open a /d/a/... path
pin_tag=$(cd "$app" && node -p "require('./package.json').bob.bundledLlamaTag")
pin_sha=$(cd "$app" && node -p "require('./package.json').bob.bundledLlamaSha || ''")
tag=${1:-$pin_tag}
dest=${2:-llama.cpp}
want=''; [ "$tag" = "$pin_tag" ] && want=$pin_sha
copy=${LLAMA_COPY_URL:-https://github.com/MouseWurX/Bob/releases/download/llama.cpp-$tag}
upstream=${LLAMA_UPSTREAM_URL:-https://github.com/ggml-org/llama.cpp.git}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
got=''
dl() { curl -fsSL --retry 3 --retry-delay 5 -o "$2" "$1"; }
if dl "$copy/llama.cpp-$tag.bundle" "$tmp/l.bundle" && dl "$copy/SHA256SUMS" "$tmp/SHA256SUMS"; then
  sum=$(sha256sum "$tmp/l.bundle" | cut -d' ' -f1)
  if grep -q "^$sum  llama.cpp-$tag.bundle\$" "$tmp/SHA256SUMS" \
     && git -c advice.detachedHead=false clone -q --branch "$tag" "$tmp/l.bundle" "$dest"; then
    git -C "$dest" remote set-url origin "$upstream" # later fetches (try-newer) go to ggml-org, not a deleted temp file
    got=ours
  else
    echo "our saved copy of llama.cpp $tag didn't check out (checksum or clone); trying ggml-org" >&2
    rm -rf "$dest"
  fi
else
  echo "no saved copy of llama.cpp $tag on MouseWurX/Bob; trying ggml-org" >&2
fi
if [ -z "$got" ]; then
  [ "${LLAMA_COPY_ONLY:-}" = 1 ] && { echo "LLAMA_COPY_ONLY=1 and our copy failed" >&2; exit 1; }
  git -c advice.detachedHead=false clone -q --depth 1 --branch "$tag" "$upstream" "$dest"
  got=ggml-org
fi
head=$(git -C "$dest" rev-parse HEAD)
if [ -n "$want" ] && [ "$head" != "$want" ]; then
  echo "llama.cpp $tag from $got is commit $head, but Bob pins $want. Stopped." >&2
  exit 1
fi
echo "llama.cpp $tag at $head (from $got)"
