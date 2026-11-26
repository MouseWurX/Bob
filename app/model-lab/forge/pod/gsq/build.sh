#!/bin/bash
# build.sh <llama.cpp tree> <build dir>: adds tools/x_dump to that tree and builds it. Prints the binary's path.
# 26 Nov 2026, GSQ-style learned rounding (pod/gsq/gsq_q2.py).
set -e
LL=$1 B=${2:-$1/build}; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$LL/tools/x_dump"; cp "$HERE/x_dump.cpp" "$HERE/CMakeLists.txt" "$LL/tools/x_dump/"
grep -q 'add_subdirectory(x_dump)' "$LL/tools/CMakeLists.txt" || echo 'add_subdirectory(x_dump)' >> "$LL/tools/CMakeLists.txt"
cmake -S "$LL" -B "$B" > "$B.x_dump-cmake.log" 2>&1 || { tail -5 "$B.x_dump-cmake.log"; exit 1; }
cmake --build "$B" -j"$(nproc)" --target x_dump > "$B.x_dump-build.log" 2>&1 || { tail -15 "$B.x_dump-build.log"; exit 1; }
ls "$B/bin/x_dump"
