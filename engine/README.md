# Brain Engine

Brain Engine is a fork of [llama.cpp](https://github.com/ggml-org/llama.cpp), created to give better flexibility when using AI models. It is not an official llama.cpp build.

It is llama.cpp at the tag in `package.json` (`bundledLlamaTag`) with the patches in `engine/patches/` applied in order:

- `0001-expert-mask.patch`: turn a mixture-of-experts brain's experts on or off without reloading it. Engine: `llama_set_expert_mask()`. Server: `GET /expert-mask` and `POST /expert-mask` with `{"keep": null}` (all on), `{"keep": [ids]}` (the same experts in every layer) or `{"keep": [[ids], null, ...]}` (one list per layer, null = all). Each layer keeps at least as many experts as the brain uses for each word. A change clears the cached prompts. It is refused while the server is answering.

The patches change only llama.dll / libllama and llama-server, never ggml or the card backends. So a Windows Brain Engine is the official CUDA or Vulkan zip for the same tag with `llama.dll`, `llama-server.exe` and the other `llama*`/`mtmd` files swapped for the ones built here. It also carries two tools the official zips leave out (upstream skips them when the card backends load at run time), each built CPU-only as one self-contained file:

- `llama-cvector-generator`: the Lab's "Take out the refusal habit".
- `llama-export-lora`: the Lab's teach step, to fold a taught adapter into a brain file.

The **Brain Engine** workflow (`.github/workflows/brain-engine.yml`) builds them when `engine/` changes, or by hand.

llama.cpp is MIT licensed: Copyright (c) 2023-2026 The ggml authors. Its licence text ships in every Brain Engine zip as `LICENSE-llama.cpp`.
