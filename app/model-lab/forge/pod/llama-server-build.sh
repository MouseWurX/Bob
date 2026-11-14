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
#
# Second build-19 fix: llama-tools.sh fetches the source as a GitHub archive tarball, which omits git submodules. On a tag
# whose CMakeLists.txt add_subdirectory()s a submodule path (vendor/), configure then dies with "source 'vendor' which is not
# an existing directory" before any compile. We detect a missing submodule dir and fill it from a complete recursive checkout
# of the same tag (installing git if the image lacks it), leaving the rest of the archive tree untouched.
W=$1; TAG=${2:-b11669}; PATCHES=${3:-}; L=$W/llama.cpp; B=$L/build-cuda/bin; CL=$W/llama-server-cmake.log
# 12 Nov: $3 = Bob's engine patches as URLs (Brain Engine for the benchmark: live expert switch, expert trace, REAP mass)
rm -f $W/llama-server-ready $W/llama-server-failed
for i in $(seq 1 90); do [ -f $L/CMakeLists.txt ] && break; sleep 10; done
[ -f $L/CMakeLists.txt ] || { echo "no llama.cpp source yet (llama-tools.sh fetches it)"; touch $W/llama-server-failed; exit 1; }
run_ok() { LD_LIBRARY_PATH="$B:${LD_LIBRARY_PATH:-}" "$B/llama-server" --version >/dev/null 2>&1; }
if [ -x $B/llama-server ] && run_ok && [ "$(cat $L/.bob-patches 2>/dev/null)" = "$PATCHES" ]; then echo "CUDA llama-server already built and runs"; touch $W/llama-server-ready; exit 0; fi
# The archive tarball omits submodules; fill any missing/empty submodule dir from a complete recursive checkout of the tag.
if [ ! -d $L/vendor ] || [ -z "$(ls -A $L/vendor 2>/dev/null)" ]; then
  echo "source tree is missing submodule dirs (the archive omits them); fetching a complete checkout of $TAG"
  command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; } >/dev/null 2>&1
  if command -v git >/dev/null 2>&1; then
    rm -rf $W/llfull
    if git clone --depth 1 --branch $TAG --recurse-submodules https://github.com/ggml-org/llama.cpp $W/llfull >> $CL 2>&1; then
      for d in $W/llfull/*/; do n=$(basename "$d"); { [ ! -d "$L/$n" ] || [ -z "$(ls -A "$L/$n" 2>/dev/null)" ]; } && cp -a "$d" "$L/$n"; done
      echo "filled submodule dirs from the complete checkout"
    else
      echo "complete checkout of $TAG failed (see the cmake log)"
    fi
  else
    echo "git unavailable and could not be installed"
  fi
fi
if [ ! -d $L/vendor ]; then echo "still missing vendor/ for $TAG; the server source is incomplete, not building"; touch $W/llama-server-failed; exit 1; fi
if [ -n "$PATCHES" ]; then
  # A fresh copy of the source for Brain Engine, so the llama tools built from $L in the background are left alone
  # 12 Nov: cp -r, not cp -a (a rented drive that refuses to keep permissions made cp -a fail, so the patches went on the shared tree)
  rm -rf $W/llama-be; cp -r --no-preserve=mode,ownership $L $W/llama-be 2>/dev/null || cp -r $L $W/llama-be
  [ -f $W/llama-be/CMakeLists.txt ] || { echo "couldn't copy the llama.cpp source for Brain Engine"; touch $W/llama-server-failed; exit 1; }
  L=$W/llama-be; B=$L/build-cuda/bin; rm -rf $L/build-cuda
  command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; } >/dev/null 2>&1
  for u in $PATCHES; do
    f=$W/$(basename $u); curl -fsSL "$u" -o "$f" || { echo "couldn't fetch $u"; touch $W/llama-server-failed; exit 1; }
    ( cd $L && git apply "$f" ) || { echo "Bob's engine patch $(basename $f) doesn't apply to llama.cpp $TAG"; touch $W/llama-server-failed; exit 1; }
    echo "applied $(basename $f)"
  done
fi
command -v cmake >/dev/null || pip install -q cmake 2>&1 | tail -1
command -v nvcc >/dev/null || export PATH=$PATH:/usr/local/cuda/bin
ARCH=$(python3 -c "import torch; print(''.join(map(str, torch.cuda.get_device_capability())))" 2>/dev/null || echo 90)
echo "building CUDA llama-server (tag $TAG, sm_$ARCH); nvcc: $(command -v nvcc || echo 'not on PATH, relying on cmake CUDA detection')"
# Upstream's documented CUDA server build: GGML_CUDA on, CURL off, nothing else forced. Building only the llama-server target
# means the examples/tests that configure still scans are never compiled, so leaving them enabled costs no compile time but
# avoids both the static-lib configure bug and any tag where the server lives under examples/ rather than tools/.
( cd $L && cmake -B build-cuda -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=$ARCH -DLLAMA_CURL=OFF > $CL 2>&1 \
  && cmake --build build-cuda --target llama-server -j $(nproc) >> $CL 2>&1 && { cmake --build build-cuda --target llama-cvector-generator llama-imatrix -j $(nproc) >> $CL 2>&1 || echo "llama-cvector-generator/llama-imatrix did not build (the evil check reads experts only, no imatrix)"; } )
SERVE=$W/llama.cpp/build-cuda/bin   # where run.sh serves from
if [ -x $B/llama-server ] && run_ok && [ "$B" != "$SERVE" ]; then
  rm -rf $W/llama.cpp/build-cuda; mkdir -p $SERVE; cp -r $B/. $SERVE/; B=$SERVE
fi
if [ -x $SERVE/llama-server ] && [ "$B" = "$SERVE" ] && run_ok; then
  echo "$PATCHES" > $W/llama.cpp/.bob-patches
  echo "CUDA llama-server ready (sm_$ARCH)${PATCHES:+, Brain Engine}"; touch $W/llama-server-ready
else
  echo "CUDA llama-server build failed; last 80 lines of the cmake log:"; tail -80 $CL 2>/dev/null
  touch $W/llama-server-failed
fi
