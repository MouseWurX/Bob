# llama.cpp code map (b12359)

Lamplight, Bob's engine, is [llama.cpp](https://github.com/ggml-org/llama.cpp) **b12359** (llama.cpp 1.0,
commit `b1b770d90d94cad9e9ea5b993bdbc383a522fb28`, by the ggml authors, MIT licence) with our patches on top.
This page is the map of llama.cpp itself: what lives where, and which parts our patches touch.
[engine/ENGINE-MAP.md](../engine/ENGINE-MAP.md) is the other half: each patch, its hooks, and the rebase checklist.

Counts are from the engine branch's 101 patches (0001 to 0122; main carries 0001 to 0087 until the next release).
A patch is counted once per area it changes. b12359 has about 2,100 C, C++ and CUDA files.

## The layers, top to bottom

| Layer | Where | What it does | Our patches there |
|---|---|---|---|
| Server | `tools/server/` | `llama-server`: the HTTP API Bob talks to (OpenAI-style chat, completions, slots, tasks) | 18 |
| Command line and helpers | `common/` | Flags (`arg.cpp`), chat templates and tool-call parsers (`chat*.cpp`, `parsers/`), sampling, speculative drafts, `--fit` | 19 |
| Public API | `include/llama.h` | The C API every tool uses | 8 |
| Model runtime | `src/` | Loading a GGUF, building each step's compute graph, the chat memory (KV cache), the expert cache | 72 |
| Model families | `src/models/` | One file per architecture (177 files): how its layers are wired | 8 |
| Tensor library | `ggml/include/ggml.h`, `ggml/src/ggml.c` | ggml: tensor types, the list of operations (`GGML_OP_*`), graph building | 19 |
| Scheduler | `ggml/src/ggml-backend*.cpp` | Splits a graph between the card and the processor, moves tensors | 6 |
| Processor backend | `ggml/src/ggml-cpu/` | Every operation on the processor (`ops.cpp`, `ggml-cpu.c`) | 9 |
| CUDA backend | `ggml/src/ggml-cuda/` | Every operation on NVIDIA cards (171 files: flash attention `fattn*`, expert products, copies) | 16 |
| Vulkan backend | `ggml/src/ggml-vulkan/` | AMD, Intel and NVIDIA through Vulkan; shaders in `vulkan-shaders/` | 2 |
| Card sharing | `ggml/src/ggml-rpc/` | `ggml-rpc-server` and its wire protocol, so one computer can use another's card | 10 |
| Conversion | `convert_hf_to_gguf.py`, `conversion/`, `gguf-py/` | Hugging Face weights to GGUF | 8 |
| Tests | `tests/` | `test-backend-ops`, `test-llama-archs` and others | 10 |

Not touched by us: the other backends (`ggml-metal`, `ggml-sycl`, `ggml-hip`, `ggml-opencl`, `ggml-cann`, `ggml-musa`,
`ggml-webgpu` and the rest), `tools/` apart from the server, `examples/`, the web UI (`tools/ui`, which Bob's builds
switch off), `docs/`, `ci/`.

## The files that matter most

Lines are at b12359. "Patches" is how many of ours change the file.

| File | Lines | Patches | What it is |
|---|---:|---:|---|
| `src/llama-moe-cache.cpp` / `.h` | 916 | 39 / 17 | The expert copy cache: which experts sit on the card, what's fetched from RAM or the drive |
| `src/llama-context.cpp` / `.h` | 5,185 | 37 / 12 | One running context: decode, the chat memory, setters for live controls (mask, dials, trace) |
| `src/llama-graph.cpp` / `.h` | 4,639 | 22 / 11 | Builds each step's graph: `build_moe_ffn` (expert pick and sum), `build_ffn`, `build_attn_mha` |
| `tools/server/server-context.cpp` | 7,322 | 16 | Slots, tasks and routes of `llama-server` |
| `ggml/src/ggml-cuda/ggml-cuda.cu` | 6,964 | 12 | The CUDA backend's front door: picks a kernel per operation, fusions |
| `src/llama-model.cpp` / `.h` | 4,190 | 10 / 8 | Loads weights and places them (card, RAM, drive) |
| `src/llama-kv-cache.cpp` / `.h` | 3,130 | 10 / 7 | The chat memory (KV cache): cells, types, shifting |
| `common/arg.cpp` | 4,843 | 10 | Every command-line flag |
| `src/llama-cparams.h` | small | 9 | Context settings |
| `tools/server/server-task.h` | small | 9 | Server task types |
| `ggml/src/ggml-rpc/ggml-rpc.cpp` | 3,432 | 8 | Card sharing (protocol version, commands) |
| `ggml/src/ggml-cuda/fattn*.cu*` | | 8 | CUDA flash attention (our q3_0 and q2_kv chat memory types read here) |
| `include/llama.h` | 1,737 | 8 | Public API (our new calls are added here) |
| `ggml/include/ggml.h`, `ggml/src/ggml.c` | 2,814, 8,115 | 7, 5 | ggml types and operations (`GGML_TYPE_Q3_0`, `GGML_TYPE_Q2_KV`, `GGML_OP_MOE_DOORBELL`) |
| `ggml/src/ggml-cpu/ops.cpp`, `ggml-cpu.c` | 12,400 | 6, 6 | Processor flash attention and the expert product |
| `ggml/src/ggml-backend.cpp` | 2,991 | 6 | The scheduler |

## Files our patches add

These aren't in llama.cpp at all; they come only from our patches.

- `src/llama-expert-tiers.{h,cpp}`: expert tiers (card, RAM, drive).
- `src/llama-table-window.{h,cpp}`: reading a big word table through a window.
- `src/models/inkling2.cpp`, `inkling2-loop.cpp`, `raon1.cpp`, `raon1nano.cpp`, `tools/mtmd/models/inkling2v.cpp`: brain families.
- `common/parsers/inkling.cpp`: Inkling's tool-call parser.
- `ggml/src/ggml-cuda/moe-doorbell.{cu,cuh}`: the card and the processor working out experts at the same time.
- `ggml/src/ggml-cuda/wddm-budget.{cu,cuh}`: card memory planned by Windows' own budget.
- `ggml/src/ggml-cuda/template-instances/fattn-vec-instance-*q3_0*`, `*q2_kv*`: flash attention for our chat memory types.
- `ggml/src/ggml-rpc/scut.{h,cpp}`, `scut-seal.h`: SCUT, the faster card-sharing link.
- `ggml/src/ggml-vulkan/vulkan-shaders/` (4 files): Vulkan shaders.
- `conversion/raon.py`, `raon1_nano.py`, `models/templates/KRAFTON-Raon-1-mini-preview.jinja`: KRAFTON's Raon-1.

## How a reply flows through it

1. `tools/server/` takes the request, puts it in a slot, and turns the chat into a prompt (`common/chat.cpp`).
2. `src/llama-context.cpp` decodes it in batches. For each step, `src/llama-graph.cpp` (with the family's file in
   `src/models/`) builds the graph: attention reads and writes the chat memory (`src/llama-kv-cache.cpp`); a mixture-of-
   experts layer picks its experts in `build_moe_ffn`, where our mask, dials and trace hook in.
3. `ggml/src/ggml-backend.cpp` splits the graph between the card and the processor; `ggml-cuda/` or `ggml-cpu/` run it.
   The expert copy cache (`src/llama-moe-cache.cpp`) decides which experts are on the card for that step.
4. `common/sampling.cpp` picks the next token; `common/` parsers turn tool calls back into JSON for Bob.

## Where we get it from

Every build of Lamplight starts from b12359's source, and Bob lays Lamplight over llama.cpp's official b12359 zips
(the CUDA or Vulkan build and its CUDA runtime). Both came only from github.com/ggml-org/llama.cpp. We keep our own
saved copy too, so nothing stops if that repo is ever gone:

- **Our saved copy:** the pre-release [llama.cpp-b12359](https://github.com/MouseWurX/Bob/releases/tag/llama.cpp-b12359)
  on Bob's GitHub, made by `.github/workflows/llama-copy.yml` (run by hand). It holds the whole git history up to b12359
  as one bundle (`git clone llama.cpp-b12359.bundle` gives the same repo and commit as ggml-org's), the source alone as
  a tar.gz, every file of ggml-org's b12359 release (byte for byte, checked against GitHub's sha256), the MIT licence and
  `SHA256SUMS`. It's never marked latest, so Bob's own updates never see it.
- **Lamplight builds** (`.github/workflows/brain-engine.yml`) get the source through
  [`engine/fetch-llama.sh`](../engine/fetch-llama.sh): our copy first, ggml-org second, and the commit must be
  `bob.bundledLlamaSha` either way.
- **Rental pods** (`model-lab/forge/pod/llama-tools.sh`, `aifeui.sh`) try our copy first too.
- **The Android app** (`android/tools/fetch-llama.*`) uses ggml-org, and our bundle if ggml-org doesn't answer (its
  pinned commit is in b12359's history).
- **Bob on your computer** asks ggml-org for the tested llama.cpp release first, and our saved copy only if ggml-org
  doesn't answer (`src/engines.js`, `findRelease`). The files and checksums are the same.
- **Every Bob release** carries `Bob-<version>-llama.cpp-b12359-source.tar.gz` (`installer/make-llama-source.sh`):
  llama.cpp b12359 unchanged with this map inside, and `lamplight/` with our patches, ENGINE-MAP.md, and the source
  with every patch applied, so anyone can read or check exactly what we changed.

Still from ggml-org only: `engine/try-newer.sh` (it looks for newer llama.cpp builds, which only ggml-org has), the
Lab's model converter (`src/lab-teach.js`, pinned to b12032), and the CUDA pod image `ghcr.io/ggml-org/llama.cpp`
(`src/rental.js`). To save another tag, run the workflow with that tag.

## Moving to a newer llama.cpp

Follow [engine/README.md](../engine/README.md) and the checklist in ENGINE-MAP.md. Then set `bob.bundledLlamaTag`
and `bob.bundledLlamaSha` in `package.json` to the new tag and its full commit, run **Save our llama.cpp copy** for it,
and update the counts on this page.
