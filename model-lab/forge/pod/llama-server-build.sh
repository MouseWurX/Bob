#!/bin/bash
# Builds a CUDA llama-server in $1/llama.cpp/build-cuda (llama.cpp tag $2) for the benchmark phase (build 18). Runs in the background
# during training; never fatal: writes $1/llama-server-ready or $1/llama-server-failed. The source is the one llama-tools.sh fetched.
W=$1; TAG=${2:-b11669}; L=$W/llama.cpp; B=$L/build-cuda/bin
rm -f $W/llama-server-ready $W/llama-server-failed
for i in $(seq 1 90); do [ -f $L/CMakeLists.txt ] && break; sleep 10; done
[ -f $L/CMakeLists.txt ] || { echo "no llama.cpp source yet (llama-tools.sh fetches it)"; touch $W/llama-server-failed; exit 1; }
if [ -x $B/llama-server ]; then echo "CUDA llama-server already built"; touch $W/llama-server-ready; exit 0; fi
command -v cmake >/dev/null || pip install -q cmake 2>&1 | tail -1
command -v nvcc >/dev/null || export PATH=$PATH:/usr/local/cuda/bin
ARCH=$(python3 -c "import torch; print(''.join(map(str, torch.cuda.get_device_capability())))" 2>/dev/null || echo 90)
( cd $L && cmake -B build-cuda -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=$ARCH -DLLAMA_CURL=OFF -DBUILD_SHARED_LIBS=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=ON > $W/llama-server-cmake.log 2>&1 \
  && cmake --build build-cuda --target llama-server -j $(nproc) >> $W/llama-server-cmake.log 2>&1 )
if [ -x $B/llama-server ]; then echo "CUDA llama-server ready (sm_$ARCH)"; touch $W/llama-server-ready
else echo "CUDA llama-server build failed (see llama-server-cmake.log)"; tail -5 $W/llama-server-cmake.log; touch $W/llama-server-failed; fi
