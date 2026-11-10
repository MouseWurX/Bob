# Brain Engine

Brain Engine is a fork of [llama.cpp](https://github.com/ggml-org/llama.cpp), created to give better flexibility when using AI models. It is not an official llama.cpp build.

It is llama.cpp at the tag in `package.json` (`bundledLlamaTag`) with the patches in `engine/patches/` applied in order:

- `0001-expert-mask.patch`: turn a mixture-of-experts brain's experts on or off without reloading it. Engine: `llama_set_expert_mask()`. Server: `GET /expert-mask` and `POST /expert-mask` with `{"keep": null}` (all on), `{"keep": [ids]}` (the same experts in every layer) or `{"keep": [[ids], null, ...]}` (one list per layer, null = all). Each layer keeps at least as many experts as the brain uses for each word. A change clears the cached prompts. It is refused while the server is answering.
- `0002-expert-trace.patch`: report which experts a mixture-of-experts brain picked. Server: `"expert_trace": true` on `POST /completion` adds `expert_trace` to the answer: `rows`, one for every token the brain read, in order, each `{"t": the token's text, "e": [[expert ids] for each layer]}`; `n_prompt`, how many of the rows are the prompt (the rest are the answer's own tokens read back, and the experts lit while reading a token are the ones that wrote the next); `last`, the final token written; and `n_layer`, `n_expert`, `n_expert_used`. The last layer is only worked out where an answer is wanted, so its list is empty for the prompt's earlier tokens. The trace is only given to a request that had the brain to itself (ask one at a time); with `stream` it comes with the final piece. While a request asks for it the brain is computed step by step, which is slower; nothing changes for requests that don't ask. Engine: `llama_set_eval_callback()`, to set or clear the eval callback of a live context. Bob's Lab uses it for Peek inside's live view and for aiFEUI.

The patches change only llama.dll / libllama and llama-server, never ggml or the card backends. So a Windows Brain Engine is the official CUDA or Vulkan zip for the same tag with `llama.dll`, `llama-server.exe` and the other `llama*`/`mtmd` files swapped for the ones built here. It also carries two tools the official zips leave out (upstream skips them when the card backends load at run time), each built CPU-only as one self-contained file:

- `llama-cvector-generator`: the Lab's "Take out the refusal habit".
- `llama-export-lora`: the Lab's teach step, to fold a taught adapter into a brain file.

And four tools Bob runs beside the server, built from the same tag in the main build (they use the llama files above):

- `llama-bench`: the standard speed test (the Lab's Challenges, "Add the standard speed test").
- `llama-gguf-split`: joins a brain that comes in parts into one file (the Lab's "Bring in a full-size brain"), and splits one for an upload over Hugging Face's 50 GB limit.
- `ggml-rpc-server`: Bob-Net's "Lend my graphics card", so one brain can spread over several of your Bobs' cards. Bob starts it only when a paired Bob asks through the passcode door, binds it to this machine's own Tailscale address only (never 0.0.0.0), and stops it when that Bob lets go, after 3 minutes with no word, or when Gaming starts. The RPC server has no passcode of its own, which is why it is never left open.
- `llama-diffusion-cli`: runs diffusion brains (Dream, LLaDA, RND1) in the Lab's Playground. The official llama.cpp downloads don't have it (their builds leave the examples out), so it needs `-DLLAMA_BUILD_EXAMPLES=ON`.

The build turns on `-DGGML_RPC=ON` so the card server exists; its `ggml-rpc` backend file is the official one (ggml files are never swapped).

The **Brain Engine** workflow (`.github/workflows/brain-engine.yml`) builds them when `engine/` changes, or by hand.

llama.cpp is MIT licensed: Copyright (c) 2023-2026 The ggml authors. Its licence text ships in every Brain Engine zip as `LICENSE-llama.cpp`.
