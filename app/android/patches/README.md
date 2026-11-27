# Phone engine patches

`tools/fetch-llama.sh` (and `fetch-llama.ps1`) gets llama.cpp at the exact commit in `../llama.cpp.pin`, then applies these
in name order. They only add brain types the pinned llama.cpp lacks; every brain the phone already runs is untouched.

- `0001-dory.patch`: NVIDIA's looped Dory brain (Dory1.0 4B), from upstream pull request ggml-org/llama.cpp #30306 (head
  8481bd0, MIT), cut down to the C++ the phone builds and fitted to this pin (no per-layer RoPE settings here, so the graph
  picks the sliding layers' RoPE base itself). Same port as desktop patch `engine/patches/0126-dory.patch`. Test:
  `engine/tests/dory-words.py <this llama.cpp, built> <PR #30306, built>` gave the PR's words, 24 of 24 (Nov 27, processor).
  On a real phone: unproven in our lab, as we have yet to test.

Drop a patch when the pin moves to an upstream llama.cpp that has it.
