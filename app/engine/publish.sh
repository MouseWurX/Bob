#!/usr/bin/env bash
# Puts one Brain Engine file on the test pre-release brain-engine-<tag> (made if it isn't there yet), with a
# .sha256 beside it. A pre-release is never GitHub's "latest", so Bob's own update check (releases/latest) never
# sees it. Run by .github/workflows/brain-engine.yml only when started by hand with "publish" ticked.
set -euo pipefail
tag="$1"; file="$2"
rel="brain-engine-$tag"
repo="$GITHUB_REPOSITORY"
sha256sum "$file" | awk '{print $1}' > "$file.sha256"
notes=$(cat <<NOTES
**Test build.** Brain Engine is a fork of [llama.cpp](https://github.com/ggml-org/llama.cpp), created to give better flexibility when using AI models. It is not an official llama.cpp build.

This is llama.cpp $tag with the patches in [app/engine/patches](https://github.com/$repo/tree/$GITHUB_SHA/app/engine/patches) (the expert switch: \`GET\`/\`POST /expert-mask\`). Only the llama and server files are here: put them over a copy of the official llama.cpp $tag download (zip or tar.gz) for your card (the card backends are not changed). Bob does this for you under Get models, Engines.

llama.cpp is MIT licensed: Copyright (c) 2023-2026 The ggml authors. The licence text is in every download as LICENSE-llama.cpp.
NOTES
)
for i in 1 2 3; do
  gh release view "$rel" -R "$repo" > /dev/null 2>&1 && break
  gh release create "$rel" --target "$GITHUB_SHA" --title "Brain Engine $tag (test build)" --notes "$notes" --prerelease --latest=false -R "$repo" && break || sleep 10
done
gh release upload "$rel" "$file" "$file.sha256" --clobber -R "$repo"
