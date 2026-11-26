#!/bin/bash
# build.sh <llama.cpp tree> <build dir>: adds tools/tensor_err to that tree and builds it (no CUDA needed; it runs on the processor).
# Prints the binary's path. 26 Nov 2026, RCO-style bit picker (pod/rco_pick.py).
set -e
LL=$1 B=${2:-$1/build}; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$LL/tools/tensor_err"; cp "$HERE/tensor_err.cpp" "$HERE/CMakeLists.txt" "$LL/tools/tensor_err/"
grep -q 'add_subdirectory(tensor_err)' "$LL/tools/CMakeLists.txt" || echo 'add_subdirectory(tensor_err)' >> "$LL/tools/CMakeLists.txt"
cmake -S "$LL" -B "$B" > "$B.tensor_err-cmake.log" 2>&1 || { tail -5 "$B.tensor_err-cmake.log"; exit 1; }
cmake --build "$B" -j"$(nproc)" --target tensor_err > "$B.tensor_err-build.log" 2>&1 || { tail -15 "$B.tensor_err-build.log"; exit 1; }
ls "$B/bin/tensor_err"
