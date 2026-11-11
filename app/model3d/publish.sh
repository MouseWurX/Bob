#!/usr/bin/env bash
# Puts the 3D workshop add-on wheels (and their SHA256SUMS) on the pre-release model3d-addons-<n>, made if it
# isn't there yet. A pre-release is never GitHub's "latest", so Bob's own update check never sees it.
# Run by .github/workflows/model3d-addons.yml only when started by hand with "publish" ticked.
# After it's up: node installer/pin-model3d.js <release> fills in app/model3d/addons-pins.json.
set -euo pipefail
rel="$1"; shift
repo="$GITHUB_REPOSITORY"
notes=$(cat <<NOTES
**Add-ons for Bob's 3D workshop (picture to 3D).** Compiled by GitHub from the exact commits in [app/model3d/sources.json](https://github.com/$repo/blob/$GITHUB_SHA/app/model3d/sources.json), for CUDA 12.8, Python 3.12 and PyTorch 2.7.1, so nothing is compiled on your computer. Bob downloads these for you under Settings, Engines, 3D workshop, and checks each one against SHA256SUMS.

Licences: TRELLIS.2, o-voxel, CuMesh, FlexGEMM and utils3d are MIT (Microsoft, Jianfeng Xiang, Ruicheng Wang). nvdiffrast and nvdiffrec are under the NVIDIA Source Code License, which allows non-commercial use only.
NOTES
)
for i in 1 2 3; do
  gh release view "$rel" -R "$repo" > /dev/null 2>&1 && break
  gh release create "$rel" --target "$GITHUB_SHA" --title "3D workshop add-ons ($rel)" --notes "$notes" --prerelease -R "$repo" && break || sleep 10
done
gh release upload "$rel" "$@" --clobber -R "$repo"
