#!/usr/bin/env bash
# Brain Engine's Linux build, used by .github/workflows/brain-engine.yml (Nov 26).
#   fetch: clone llama.cpp at $TAG and apply app/engine/patches (leaving out the numbers in $WITHOUT, space separated)
#   cpu:   inside ubuntu:22.04 (glibc 2.35, as upstream's Ubuntu downloads): the processor build and the static tools
#   cuda:  inside ubuntu:22.04: our own libggml-cuda.so with CUDA $CUDAVER (NVIDIA's redistributable parts only)
# Run from the repository's top folder.
set -euo pipefail
mode="${1:?fetch, cpu or cuda}"

deps() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq build-essential git curl ca-certificates python3 python3-pip libssl-dev xz-utils > /dev/null
  # CUDA 13 needs a newer CMake than Ubuntu 22.04's 3.22
  python3 -m pip install -q 'cmake>=3.28,<4' ninja
  cmake --version | sed -n 1p
  ldd --version | sed -n 1p
}

case "$mode" in
  fetch)
    tag="${TAG:?}"
    git clone --depth 1 --branch "$tag" https://github.com/ggml-org/llama.cpp.git llama.cpp
    # A one-commit clone counts "build 1"; say the tag's number instead, so --version reads like llama.cpp's own builds.
    sed -i "s/set(BUILD_NUMBER \${COUNT})/set(BUILD_NUMBER ${tag#b})/" llama.cpp/cmake/build-info.cmake
    skip="${WITHOUT:-}"
    for p in app/engine/patches/*.patch; do
      n=$(basename "$p" | cut -c1-4)
      case " $skip " in *" $n "*) echo "left out: $p"; continue;; esac
      git -C llama.cpp apply --verbose "../$p"
    done
    ;;
  cpu)
    deps
    cd llama.cpp
    cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON -DGGML_RPC=ON -DLLAMA_BUILD_EXAMPLES=ON -DLLAMA_BUILD_TESTS=ON
    cmake --build build -j4 --target llama-server llama-bench llama-gguf-split ggml-rpc-server llama-diffusion-cli test-llama-archs
    # upstream skips cvector-generator and export-lora when the backends load at run time, so it gets its own CPU-only, static build
    cmake -B build-cv -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DGGML_BACKEND_DL=OFF -DBUILD_SHARED_LIBS=OFF -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF
    cmake --build build-cv -j4 --target llama-cvector-generator llama-export-lora
    ;;
  cuda)
    deps
    want="${CUDAVER:?no CUDA version}"
    base=https://developer.download.nvidia.com/compute/cuda/redist/
    ver=$(curl -fsSL "$base" | grep -o "redistrib_${want//./\\.}\(\.[0-9]\+\)*\.json" | sed 's/redistrib_//; s/\.json$//' | sort -V | tail -1)
    [ -n "$ver" ] || { echo "No NVIDIA redistributable list for CUDA $want"; exit 1; }
    echo "CUDA $want -> $ver"
    cuda=/opt/cuda; mkdir -p "$cuda" parts
    curl -fsSL "$base/redistrib_$ver.json" -o redist.json
    # the compiler, the runtime and cuBLAS (and CCCL, whatever its part is called in this version)
    python3 - "$base" > parts.txt <<'PY'
import json, sys
j = json.load(open('redist.json'))
want = ['cuda_nvcc', 'cuda_crt', 'libnvvm', 'cuda_cudart', 'cuda_nvrtc', 'cuda_nvtx', 'cuda_profiler_api', 'libcublas', 'cuda_nvml_dev'] + [k for k in j if 'cccl' in k]
for n in want:
    rel = (j.get(n) or {}).get('linux-x86_64', {}).get('relative_path') if isinstance(j.get(n), dict) else None
    if rel: print(n, rel)
    else: print('skip', n, file=sys.stderr)
PY
    while read -r n rel; do
      echo "get $n"
      curl -fsSL "$base/$rel" -o part.tar.xz
      tar -xJf part.tar.xz -C parts
      rm part.tar.xz
    done < parts.txt
    for d in parts/*/; do cp -a "$d"* "$cuda/"; done
    [ -x "$cuda/bin/nvcc" ] || { echo "nvcc did not install"; exit 1; }
    export PATH="$cuda/bin:$PATH" CUDAToolkit_ROOT="$cuda" CUDA_PATH="$cuda"
    # the runtime's stub for linking (libcuda.so comes with the driver, not the toolkit)
    export LIBRARY_PATH="$cuda/lib/stubs:$cuda/lib64/stubs:${LIBRARY_PATH:-}"
    nvcc --version | tail -2
    cd llama.cpp
    cmake -S . -B build-cuda -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_BACKEND_DL=ON -DGGML_CPU=OFF -DGGML_CUDA=ON -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_TOOLS=OFF -DCMAKE_CUDA_COMPILER="$cuda/bin/nvcc"
    cmake --build build-cuda -j4 --target ggml-cuda
    ls -la build-cuda/bin/
    ;;
  *) echo "unknown mode: $mode"; exit 1 ;;
esac
