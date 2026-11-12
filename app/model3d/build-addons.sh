#!/usr/bin/env bash
# Builds the CUDA add-ons TRELLIS.2 (picture to 3D) needs, as wheels, from the exact commits in sources.json.
# Runs only in GitHub's build (.github/workflows/model3d-addons.yml), never on the user's computer.
# Needs: CUDA 12.8 (nvcc on the PATH), uv, git, node; on Windows, run from a VS 2022 x64 prompt through Git Bash.
# Out: wheels/*.whl and wheels/SHA256SUMS-<os>.txt
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src="$here/sources.json"
work="${WORK:-$PWD/model3d-build}"
out="${OUT:-$PWD/wheels}"
osname="${1:?say linux-x64 or win-x64}"
mkdir -p "$work" "$out"

j() { node -e "const s=require(process.argv[1]);const v=process.argv[2].split('.').reduce((o,k)=>o&&o[k],s);process.stdout.write(v==null?'':String(v))" "$src" "$1"; }

case "$osname" in
  win-x64)
    py="$work/venv/Scripts/python.exe"
    # Git Bash has its own /usr/bin/link (a Unix tool) ahead of Visual Studio's link.exe: put MSVC's folder first.
    cl_dir="$(dirname "$(command -v cl)")"
    export PATH="$cl_dir:$PATH"
    command -v link ;;
  *) py="$work/venv/bin/python" ;;
esac

uv venv --python "$(j python)" --seed "$work/venv"
uv pip install --python "$py" "torch==$(j torch)" "torchvision==$(j torchvision)" --index-url "$(j cudaIndex)"
uv pip install --python "$py" setuptools wheel ninja numpy
"$py" -c "import torch; print('torch', torch.__version__, 'cuda', torch.version.cuda)"

export TORCH_CUDA_ARCH_LIST="$(j cudaArchs)"
export MAX_JOBS="${MAX_JOBS:-4}"
export BUILD_TARGET=cuda
export DISTUTILS_USE_SDK=1

# fetch <name>: clone the pinned commit (and pinned submodules, outer ones listed before the ones inside them) into $work/<name>
fetch() {
  local name="$1" repo commit dir
  repo="$(j "code.$name.repo")"; commit="$(j "code.$name.commit")"; dir="$work/src-$name"
  if [ ! -d "$dir/.git" ]; then
    git init -q "$dir"
    git -C "$dir" remote add origin "$repo"
  fi
  git -C "$dir" fetch -q --depth 1 origin "$commit"
  git -C "$dir" checkout -q --force FETCH_HEAD
  test "$(git -C "$dir" rev-parse HEAD)" = "$commit"
  node -e "const s=require(process.argv[1]).code[process.argv[2]].submodules||{};for(const[p,v] of Object.entries(s))console.log(p+' '+v.repo+' '+v.commit)" "$src" "$name" |
  while read -r sub subrepo subcommit; do
    local base="$dir" subdir
    [ -z "$(j "code.$name.dir")" ] || base="$dir/$(j "code.$name.dir")"
    subdir="$base/$sub"
    rm -rf "$subdir"; mkdir -p "$subdir"
    git init -q "$subdir"
    git -C "$subdir" remote add origin "$subrepo"
    git -C "$subdir" fetch -q --depth 1 origin "$subcommit"
    git -C "$subdir" checkout -q --force FETCH_HEAD
    test "$(git -C "$subdir" rev-parse HEAD)" = "$subcommit"
  done
}

wheel() {
  local name="$1" dir
  fetch "$name"
  dir="$work/src-$name"
  [ -z "$(j "code.$name.dir")" ] || dir="$dir/$(j "code.$name.dir")"
  if [ "$name" = flex_gemm ]; then
    # Visual Studio needs "template" before data_ptr<T> where T comes from a generic lambda (gcc doesn't mind it)
    sed -i 's/\.data_ptr<T>()/.template data_ptr<T>()/g' "$dir/flex_gemm/kernels/cuda/spconv/sparse_neighbor_map.cu"
    grep -q 'template data_ptr<T>' "$dir/flex_gemm/kernels/cuda/spconv/sparse_neighbor_map.cu"
  fi
  if [ "$name" = o_voxel ]; then
    # 1e-6d and 0.0d are a gcc-only way to write a double; Visual Studio wants plain 1e-6 and 0.0
    sed -i -E 's/\b(1e-6|0\.0)d\b/\1/g' "$dir/src/convert/flexible_dual_grid.cpp"
    if grep -qE '\b(1e-6|0\.0)d\b' "$dir/src/convert/flexible_dual_grid.cpp"; then echo "o-voxel patch didn't take"; exit 1; fi
    # torch::zeros({N, C}) with size_t N and C is a narrowing error in Visual Studio: say int64_t
    sed -i -E 's/torch::zeros\(\{(\w+), (\w+)\}/torch::zeros({(int64_t)\1, (int64_t)\2}/g' "$dir/src/io/filter_neighbor.cpp" "$dir/src/io/filter_parent.cpp"
    if [ "$(grep -c 'torch::zeros({(int64_t)' "$dir/src/io/filter_neighbor.cpp" "$dir/src/io/filter_parent.cpp" | awk -F: '{s+=$2} END {print s}')" != 4 ]; then echo "o-voxel patch didn't take"; exit 1; fi
  fi
  echo "::group::building $name"
  "$py" -m pip wheel --no-build-isolation --no-deps -w "$out" "$dir"
  echo "::endgroup::"
}

# utils3d is plain Python, but a wheel saves the user's computer from needing git. It's the same file for every
# computer, so only the Linux build makes it (two copies with one name would clash on the release).
[ "$osname" != linux-x64 ] || wheel utils3d
for name in nvdiffrast nvdiffrec_render cumesh flex_gemm o_voxel; do wheel "$name"; done

cd "$out"
ls -la
if command -v sha256sum >/dev/null; then sha256sum *.whl > "SHA256SUMS-$osname.txt"; else shasum -a 256 *.whl > "SHA256SUMS-$osname.txt"; fi
cat "SHA256SUMS-$osname.txt"
