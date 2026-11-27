#!/bin/bash
# build.sh <llama.cpp tree> <build dir>: adds tools/x_dump to that tree and builds it. Prints the binary's path.
# 26 Nov 2026, GSQ-style learned rounding (pod/gsq/gsq_q2.py).
set -e
LL=$1 B=${2:-$1/build}; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$LL/tools/x_dump"; cp "$HERE/x_dump.cpp" "$HERE/CMakeLists.txt" "$LL/tools/x_dump/"
grep -q 'add_subdirectory(x_dump)' "$LL/tools/CMakeLists.txt" || echo 'add_subdirectory(x_dump)' >> "$LL/tools/CMakeLists.txt"
# 27 Nov 2026: never configure into a folder that holds built files but no cmake setup (the pod's serving copy, see
# pod/tool_tree.sh); a fresh folder gets CUDA on when the machine has a card (arch from nvidia-smi, cmake 3.22 has no "native")
if [ ! -f "$B/CMakeCache.txt" ]; then
  [ -d "$B/bin" ] && { echo "build.sh: $B has built files but no cmake setup (a copied folder); refusing to build into it" >&2; exit 1; }
  ARCH=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | head -1 | tr -d ' .')
  CUDA_FLAGS=(); [ -n "$ARCH" ] && CUDA_FLAGS=(-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=$ARCH)
  CFG=(-DLLAMA_CURL=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF "${CUDA_FLAGS[@]}")
else CFG=(); fi
cmake -S "$LL" -B "$B" "${CFG[@]}" > "$B.x_dump-cmake.log" 2>&1 || { tail -5 "$B.x_dump-cmake.log"; exit 1; }
cmake --build "$B" -j"$(nproc)" --target x_dump > "$B.x_dump-build.log" 2>&1 || { tail -15 "$B.x_dump-build.log"; exit 1; }
ls "$B/bin/x_dump"
