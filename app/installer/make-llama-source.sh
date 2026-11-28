#!/usr/bin/env bash
# Nov 26: the llama.cpp source that this Bob's Lamplight is built on, shipped with each Bob release together with
# its code maps and Lamplight's patches, so one release is enough to read or rebuild its engine.
# Usage: bash installer/make-llama-source.sh [OUT_DIR]   (run in app/; default OUT_DIR: dist)
# Makes OUT_DIR/Bob-<version>-llama.cpp-<tag>-source.tar.gz and its .sha256:
#   llama.cpp-<tag>/                 llama.cpp at bob.bundledLlamaTag (commit bob.bundledLlamaSha), unchanged, MIT
#   llama.cpp-<tag>/BOB-CODE-MAP.md  docs/llama-cpp-map.md: what's where in llama.cpp, and where Lamplight touches it
#   lamplight/ENGINE-MAP.md          engine/ENGINE-MAP.md: each patch, its hooks, the rebase checklist
#   lamplight/patches/               engine/patches: the patches themselves (git apply them in order)
#   lamplight/source/                llama.cpp-<tag> with every patch already applied: Lamplight's whole code as built
# The source comes from our saved copy (pre-release llama.cpp-<tag>) when it's there, else from ggml-org through
# engine/fetch-llama.sh; both end at the pinned commit.
set -euo pipefail
app=$(cd "$(dirname "$0")/.." && pwd)
cd "$app"
out=${1:-dist}
tag=$(node -p "require('./package.json').bob.bundledLlamaTag")
sha=$(node -p "require('./package.json').bob.bundledLlamaSha")
ver=$(node -p "require('./package.json').version")
copy=${LLAMA_COPY_URL:-https://github.com/MouseWurX/Bob/releases/download/llama.cpp-$tag}
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
src="$work/stage/llama.cpp-$tag"
mkdir -p "$work/stage" "$out"
if curl -fsSL --retry 3 -o "$work/src.tgz" "$copy/llama.cpp-$tag-src.tar.gz" && curl -fsSL --retry 3 -o "$work/SUMS" "$copy/SHA256SUMS" \
   && grep -q "^$(sha256sum "$work/src.tgz" | cut -d' ' -f1)  llama.cpp-$tag-src.tar.gz\$" "$work/SUMS"; then
  mkdir -p "$src" && tar xzf "$work/src.tgz" -C "$src" --strip-components=1
  echo "llama.cpp $tag source from our saved copy"
else
  bash engine/fetch-llama.sh "$tag" "$work/git"
  git -C "$work/git" archive --format=tar --prefix="llama.cpp-$tag/" "$sha" | tar x -C "$work/stage"
fi
[ -f "$src/CMakeLists.txt" ] && [ -f "$src/LICENSE" ] || { echo "the llama.cpp source is incomplete"; exit 1; }
cp docs/llama-cpp-map.md "$src/BOB-CODE-MAP.md"
mkdir -p "$work/stage/lamplight"
cp engine/ENGINE-MAP.md "$work/stage/lamplight/"
cp -r engine/patches "$work/stage/lamplight/patches"
# Lamplight's whole code: the same source with every patch applied, so it can be read or compared without applying
cp -r "$src" "$work/stage/lamplight/source"
rm -f "$work/stage/lamplight/source/BOB-CODE-MAP.md"
( cd "$work/stage/lamplight/source" && git init -q && for p in "$app"/engine/patches/*.patch; do git apply "$p" || { echo "$(basename "$p") doesn't apply"; exit 1; }; done && rm -rf .git )
cat > "$work/stage/README.txt" <<EOF
The source of the engine in Bob $ver.

llama.cpp-$tag/   llama.cpp $tag (commit $sha) by the ggml authors, unchanged. MIT licence: llama.cpp-$tag/LICENSE.
                  https://github.com/ggml-org/llama.cpp
                  BOB-CODE-MAP.md inside it is our map of where things are in llama.cpp.
lamplight/        Lamplight, Bob's engine:
  patches/        the patches we put on llama.cpp, in order
  ENGINE-MAP.md   what each patch changes, where it hooks in, and why
  source/         llama.cpp-$tag with every patch already applied: Lamplight's whole code, as we build it.
                  Compare it with llama.cpp-$tag/ (diff -ru llama.cpp-$tag lamplight/source) to see every change.

To build Lamplight: build lamplight/source/ like llama.cpp (cmake -B build && cmake --build build --config Release).
Bob itself is at https://github.com/MouseWurX/Bob (GPL-3.0-or-later).
EOF
name="Bob-$ver-llama.cpp-$tag-source.tar.gz"
tar czf "$out/$name" -C "$work/stage" .
(cd "$out" && sha256sum "$name" > "$name.sha256")
echo "made $out/$name ($(du -h "$out/$name" | cut -f1))"
