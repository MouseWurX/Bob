#!/bin/bash
# tool_tree.sh <shared dir>: prints "<llama.cpp source> <build dir>" for building an extra tool (x_dump, tensor_err) on a pod.
# 27 Nov 2026 (Bill rentals): llama.cpp/build-cuda/bin is a COPY of the Brain Engine build (llama-server-build.sh copies
# llama-be/build-cuda/bin there) with no cmake setup; configuring a tool into it made a fresh processor-only build that
# overwrote the CUDA libraries, so every later KLD, gate and served test ran on the processor. A tool now builds inside a
# tree whose own cmake setup has CUDA on (Brain Engine's, or the plain one), or in a fresh folder of its own; never the copy.
S=$1
for L in "$S/llama-be" "$S/llama.cpp"; do
  C=$L/build-cuda/CMakeCache.txt
  [ -f "$C" ] && grep -q '^GGML_CUDA:BOOL=ON' "$C" && { echo "$L $L/build-cuda"; exit 0; }
done
echo "$S/llama.cpp $S/llama.cpp/build-tools"
