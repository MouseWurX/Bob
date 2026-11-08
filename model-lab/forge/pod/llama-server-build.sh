#!/bin/bash
# Builds a CUDA llama-server in $1/llama.cpp/build-cuda (llama.cpp tag $2) for the benchmark phase (build 18) and the GGUF
# teacher (build 19). Runs in the background during setup; never fatal: writes $1/llama-server-ready or $1/llama-server-failed.
# The source is the one llama-tools.sh fetched.
#
# Build 19 fix: the old flags forced -DBUILD_SHARED_LIBS=OFF, which on a recent llama.cpp makes cmake fail at CONFIGURE with
# "install TARGETS given target 'llama' which does not exist" (the static-lib target isn't defined where the install() rule
# runs), so the compile never started. We now use the upstream-recommended minimal CUDA flags (shared libs on, nothing extra
# forced off), build just the llama-server target, and verify the binary actually runs before declaring it ready. On failure
# we print the tail of the cmake log to stdout so it is captured in out/llama-server-build.log even after the pod is deleted.
W=$1; TAG=${2:-b11669}; L=$W/llama.cpp; B=$L/build-cuda/bin; CL=$W/llama-server-cmake.log
rm -f $W/llama-server-ready $W/llama-server-failed
for i in $(seq 1 90); do [ -f $L/CMakeLists.txt ] && break; sleep 10; done
[ -f $L/CMakeLists.txt ] || { echo "no llama.cpp source yet (llama-tools.sh fetches it)"; touch $W/llama-server-failed; exit 1; }
run_ok() { LD_LIBRARY_PATH="$B:${LD_LIBRARY_PATH:-}" "$B/llama-server" --version >/dev/null 2>&1; }
if [ -x $B/llama-server ] && run_ok; then echo "CUDA llama-server already built and runs"; touch $W/llama-server-ready; exit 0; fi
command -v cmake >/dev/null || pip install -q cmake 2>&1 | tail -1
command -v nvcc >/dev/null || export PATH=$PATH:/usr/local/cuda/bin
ARCH=$(python3 -c "import torch; print(''.join(map(str, torch.cuda.get_device_capability())))" 2>/dev/null || echo 90)
echo "building CUDA llama-server (tag $TAG, sm_$ARCH); nvcc: $(command -v nvcc || echo 'not on PATH, relying on cmake CUDA detection')"
# Upstream's documented CUDA server build: GGML_CUDA on, CURL off, nothing else forced. Building only the llama-server target
# means the examples/tests that configure still scans are never compiled, so leaving them enabled costs no compile time but
# avoids both the static-lib configure bug and any tag where the server lives under examples/ rather than tools/.
( cd $L && cmake -B build-cuda -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=$ARCH -DLLAMA_CURL=OFF > $CL 2>&1 \
  && cmake --build build-cuda --target llama-server -j $(nproc) >> $CL 2>&1 )
if [ -x $B/llama-server ] && run_ok; then
  echo "CUDA llama-server ready (sm_$ARCH)"; touch $W/llama-server-ready
else
  echo "CUDA llama-server build failed; last 80 lines of the cmake log:"; tail -80 $CL 2>/dev/null
  touch $W/llama-server-failed
fi
