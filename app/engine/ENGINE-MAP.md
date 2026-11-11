# Brain Engine map

This is the guide to what Brain Engine changes in llama.cpp, where each change hooks in, and what to re-check when moving to a newer llama.cpp. [README.md](README.md) says what each patch is for and how to build and move it. This page is the "where and how" for whoever does the rebase.

Brain Engine 3 is llama.cpp **b12282** plus the five patches below, about +1,900/-6 lines across 20 files. Only 0004 and 0005 touch ggml, and only its card-sharing backend (`ggml/src/ggml-rpc`). No CUDA, Vulkan, Metal or CPU code is changed, so a llama.cpp update that only changes the card backends needs nothing from us.

Bob's own code map lists these patches too: one line each, with the files they change, the lines they add and take out, and the main names they add.

## Rebase checklist, most fragile first

1. **The graph's expert and FFN builders** (`src/llama-graph.cpp`: `build_moe_ffn`, `build_ffn`, `build_attn_mha`). 0001 and 0003 put their mask and dials right where the experts are picked and their outputs summed. Upstream changes these often (new expert-routing modes, fused kernels, new archs). If a hunk moved, check that the mask still comes **before** the top-k pick (`ffn_moe_logits_masked`), and that the dials still multiply the expert weights and outputs (`ffn_moe_weights_dialed`, `ffn_moe_out_dialed`, `ffn_out_dialed`). A wrong placement still builds, but gives wrong answers.
2. **The server** (`tools/server/server-context.cpp`, `server-task.*`, `server.cpp`, `server-schema.cpp`). About 580 of our lines live in files upstream rewrites often (routes, task types, slot state, result JSON). Check that `/expert-mask` and `/dials` are still registered in `init_routes()` / `server_register_routes`, that the new task types are handled in the task switch, and that `expert_trace` still comes back in all three result shapes (plain, OpenAI chat, OpenAI chat stream).
3. **Layer counting with MTP layers.** Since b12282, `n_layer` = all layers minus the next-token (MTP) layers. The mask and dials take one row per layer that runs. Bob sends `engineLayers` rows (from `src/lab-gguf.js`); the Riker 41/40 bug was this. If upstream changes how `n_layer_nextn` counts, re-check `llama_model_n_layer` against Bob's `brainFacts().engineLayers`.
4. **The card-sharing protocol version** (`ggml-rpc.cpp`, `RPC_PROTO_*`). b12282 is version 9 and b12032 was 8. Every Bob that shares a card needs the same Brain Engine. If the version changed, say so in the release note. Also check that 0004's `RPC_CMD_SET_TENSOR_HASH` path and `serialize_set_tensor` still match upstream's message layout.
5. **SCUT and RDMA sharing the HELLO caps field** (`ggml/src/ggml-rpc/transport.cpp`: `get_caps` / `update_caps`). 0005 claims one caps bit. If upstream adds caps (RDMA or anything new), make sure our bit doesn't collide, and that a peer without SCUT still connects on the plain link.

Then run `engine/try-newer.sh <tag>`. Every patch must go on, and the Linux build must pass. Then do the PC test: the Lab's Peek (trace), switching experts off (mask), the fNRI dials, and Bigger Bobs with and without SCUT.

## The patches

### 0001-expert-mask: switch experts off without reloading
- **Upstream files:** `include/llama.h`, `src/llama-adapter.{h,cpp}`, `src/llama-context.{h,cpp}`, `src/llama-graph.{h,cpp}`, `src/llama-model.cpp`, `tools/server/server-context.{h,cpp}`, `server-task.h`, `server.cpp`.
- **Hooks:**
  - A new adapter `llama_adapter_emask`, next to the control vector (`llama_adapter_cvec`), holds one keep-row per layer.
  - `llm_graph_context::build_moe_ffn` adds -inf to the router logits of switched-off experts **before** the top-k pick, so they're never chosen (`ffn_moe_logits_masked`).
  - `llama_context` holds the mask and rebuilds the graph params when it changes.
- **New API:** `llama_model_n_expert()`, `llama_model_n_expert_used()`, `llama_set_expert_mask(ctx, keep, len)`.
- **Server:** `GET /expert-mask` and `POST /expert-mask` with `{"keep": null | [ids] | [[ids per layer]]}`. It runs as a server task, so it waits for running slots.
- **Bob callers:** `src/lab.js` (Cut, Try it without), `src/lab-watch.js` (fNRI).
- **Re-check on rebase:** checklist items 1, 2 and 3. Also check that `llama_set_adapter_cvec` still sits where 0001 and 0003 add their setters next to it.
- **Tests:** `test/run-lab-test.js` and `test/run-lab-watch-test.js` check what Bob sends. The PC checks against a real engine: switch some experts off in the Lab and the answer changes, with no reload in the log.

### 0002-expert-trace: report which experts (or neurons) fired
- **Upstream files:** `include/llama.h`, `src/llama-context.{h,cpp}`, `tools/server/server-context.cpp` (most of it), `server-schema.cpp`, `server-task.{h,cpp}`.
- **Hooks:**
  - `llama_set_eval_callback()` sets or clears the graph eval callback on a live context. It waits for pending work first.
  - The server's slot gets a trace collector, `server_expert_trace`. It reads the `ffn_moe_topk` tensor per layer for MoE brains, or groups of FFN neurons for dense ones (`"kind": "neurons"`).
  - Results are added to the final completion JSON.
- **New API:** `llama_set_eval_callback(ctx, cb, user_data)`.
- **Server:** request fields `expert_trace: true` and `expert_trace_heads`. The reply's `expert_trace` holds `kind`, `n_layer`, `n_expert`, `n_expert_used`, `n_ff`, `n_prompt`, `rows` and `last` (the final token written, which no step read). It is in all three result shapes.
- **Bob callers:** `src/lab-peek.js` (Peek inside), `src/lab-watch.js` (fNRI), `src/llamacpp.js`.
- **Re-check on rebase:** checklist item 2. Also check the tensor name `ffn_moe_topk` (if upstream renames it, the trace comes back empty, not broken). With a trace on, the graph runs step by step and is slower; that is expected.
- **Tests:** `test/run-lab-watch-test.js` (the trace shape Bob reads). PC: Peek inside on Riker shows its 40 layers lighting up.

### 0003-dials: turn a part up or down without reloading
- **Upstream files:** the same set as 0001, plus `build_ffn` and `build_attn_mha` in `src/llama-graph.cpp`.
- **Hooks:**
  - A dials adapter next to the expert mask.
  - The graph multiplies:
    - one expert's weight and output (`ffn_moe_weights_dialed`, `ffn_moe_out_dialed`);
    - a dense FFN's output (`ffn_out_dialed`);
    - one attention head;
    - a whole attention or FFN block.
  - 1 = as built, 0 = silent.
- **New API:** `llama_set_dials(ctx, dials, n)` with `llama_dial` {kind, layer, index, scale} and `llama_dial_kind`.
- **Server:** `GET /dials`, and `POST /dials` with `{"dials": [{"kind": "expert" | "head" | "attn" | "ffn", "layer", "index", "scale": 0..8}]}`. `{"dials": null}` or `[]` puts everything back to 1.
- **Bob callers:** `src/lab-watch.js` (fNRI's dials).
- **Re-check on rebase:** checklist items 1 and 3. If `build_attn_mha`'s head layout changes (head-major vs token-major), the head dial scales the wrong slice and doesn't fail loudly.
- **Tests:** `test/run-lab-watch-test.js`. PC: turning an expert's dial to 0 matches switching it off with the mask.

### 0004-rpc-wifi: card sharing re-sends almost nothing
- **Upstream files:** `ggml/src/ggml-rpc/ggml-rpc.cpp`, `tools/rpc/rpc-server.cpp`.
- **Hooks:**
  - `serialize_set_tensor` / the set-tensor path offers a weight's hash first (`RPC_CMD_SET_TENSOR_HASH`) above a lower size threshold (`GGML_RPC_HASH_MIN`). A lender with `-c` (cache) that already has the weight skips the copy.
  - `ggml-rpc-server --seed FILE.gguf` fills the lender's cache from a brain file on that machine, then exits, so even the first load sends little.
- **Server flags and environment:** `rpc-server --seed`, `GGML_RPC_HASH_MIN`.
- **Bob callers:** `src/share-card.js` (starts `ggml-rpc-server -c` behind the passcode gate), `src/llama-tools.js`.
- **Re-check on rebase:** checklist item 4. If upstream changes the cache file layout, a lender's old cache is ignored (slower, not wrong).
- **Tests:** `test/run-share-brains-test.js` and `test/run-llama-tools-test.js` (how Bob starts the lender). There's no automatic check of the resend path against a real build yet; the PC check is a second load over Bob-Net in seconds, not minutes.

### 0005-scut: Bob's own fast link over Wi-Fi (experimental)
- **Upstream files:** `ggml/src/ggml-rpc/CMakeLists.txt` (adds `scut.cpp`), new `ggml/src/ggml-rpc/scut.{h,cpp}`, `ggml/src/ggml-rpc/transport.cpp`.
- **Hooks:**
  - `transport.cpp`'s `get_caps` / `update_caps` offer SCUT in the RPC HELLO.
  - `send_data` and the receive path switch to SCUT's paced framing when both ends agreed.
  - `socket_t::accept()` hands off to it.
  - `scut.h` explains the framing.
- **Environment:** `GGML_RPC_SCUT=1` on both ends (off by default). Also `GGML_RPC_SCUT_MBPS`, `GGML_RPC_SCUT_AWAKE`, `GGML_RPC_SCUT_PUBLIC_PORT`, and the test-only `GGML_RPC_SCUT_TEST_DROP` / `GGML_RPC_SCUT_TEST_UDP_PORT`. `GGML_RPC_DEBUG` adds logging.
- **Bob callers:** `src/share-card.js` (`scutEnv`), `src/share-brains.js`, `src/llamacpp.js`, `src/brain.js`, `src/firewall.js`.
- **Re-check on rebase:** checklist item 5. A peer without SCUT must still connect on the plain link, and answers must stay identical with SCUT on or off.
- **Tests:** `test/run-llama-tools-test.js` (env and workflow wiring). The PC/Go real test is Bigger Bobs over Wi-Fi with SCUT on and off: same answer, faster with it on.

## What's not covered yet

No patch is tested automatically against a real engine build. A Brain Engine build that compiles but put a hunk in the wrong place would only show up in the PC test. Proposed for a later Brain Engine build: a short engine test in `brain-engine.yml` (ready-for-review PRs and main only, never drafts). It would load a tiny MoE GGUF and check five things:
1. Mask: an expert switched off is never picked.
2. Trace: rows equal `n_layer`.
3. Dials: an expert's dial at 0 matches the mask.
4. RPC: HELLO works between two local processes.
5. SCUT off: plain link, same tokens.
