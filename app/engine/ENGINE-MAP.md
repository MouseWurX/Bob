# Brain Engine map

This is the guide to what Brain Engine changes in llama.cpp, where each change hooks in, and what to re-check when moving to a newer llama.cpp. [README.md](README.md) says what each patch is for and how to build and move it. This page is the "where and how" for whoever does the rebase.

Brain Engine 6 (named 6b12282) is llama.cpp **b12282** plus the twelve patches below (Brain Engine 4 had the first six, Brain Engine 5 the first eight; 0007 is live expert picks, 0008 the link log and SCUT that retunes itself, 0009 the expert mass, 0010 the expert trace read once per word, 0011 one trip a word over a lent card, 0012 load progress). Only 0004, 0005, 0006, 0008 and 0011 touch ggml, and only its card-sharing backend (`ggml/src/ggml-rpc`). No CUDA, Vulkan, Metal or CPU code is changed, so a llama.cpp update that only changes the card backends needs nothing from us.

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

### 0006-scut-seal: every SCUT packet signed and scrambled
- **Upstream files:** new `ggml/src/ggml-rpc/scut-seal.h` (header-only ChaCha20-Poly1305 from RFC 8439, plus HChaCha20; no OpenSSL), `ggml/src/ggml-rpc/scut.cpp`, `ggml/src/ggml-rpc/scut.h`. Sits on top of 0005, so it only touches SCUT's own files.
- **Hooks:**
  - The SCUT offer gets version 2 with the `OF_SEAL` flag. Engines without 0006 only take version 1, so they never switch to a link they can't read and stay on the plain link.
  - Each direction gets its own key, made with HChaCha20 from Bob's key and both offers.
  - Every datagram is the readable 20-byte header, an 8-byte counter (the nonce), the scrambled body and a 16-byte tag. The receive path checks the seal (`unseal`) before anything in the datagram is used; forged, damaged, wrong-key and replayed packets are dropped.
- **Environment:** `GGML_RPC_SCUT_KEY` (64 hex digits, the lending side, or one key for all), `GGML_RPC_SCUT_KEYS="host:port=hex,host=hex"` (the borrowing side, one per lender; `=off` means no SCUT with that one). Also `GGML_RPC_SCUT_FEC`.
- **Bob callers:** `src/scut-seal.js` (link keys, kept locked with `src/secret-box.js`), `src/bob-net-pair.js` (a key made at pairing), `src/share-card.js` and `src/share-brains.js` (pass the keys), `src/tools.js` (the key file is on the never-touch list).
- **Re-check on rebase:** 0005 must go on first. A sealed Bob and an unsealed one must fall back to the plain link, never a link one side can't read. Same answers sealed or not.
- **Tests:** `test/run-scut-seal-test.js` (keys, pairing, locked key file). The PC test is Bigger Bobs over Wi-Fi with SCUT on, sealed (the default) and unsealed.

### 0007-expert-trace-stream: the trace while the reply is written

- `tools/server/server-task.h`: `expert_trace_stream` in the request params; `expert_trace_part` (json, null unless asked) on a streamed partial result.
- `tools/server/server-schema.cpp`: the `expert_trace_stream` field.
- `tools/server/server-context.cpp`: `server_expert_trace` remembers how far the pieces sent so far reach (`sent_tag`, `sent_out`, `sent_rows`, reset in `clear()`). `send_partial_response()` fills `expert_trace_part` from the new `expert_trace_part(slot)`, which builds the rows since the last piece the same way `expert_trace_end()` builds all of them, and waits for the next piece when a layer is behind. Running counts (`seen_tag`, `seen_out`, `seen_prompt`) keep each piece's cost the same at any context length, and a piece carries at most `part_max_rows` (64) rows: a long prompt arrives as one piece, so only its end is sent and `from` says where it starts (the full trace at the end is unchanged). Only on top of 0002.
- `tools/server/server-task.cpp`: the piece goes into the plain and the chat-stream JSON of a partial result.

### 0008-scut-live: the link log, and SCUT that retunes itself
- **Upstream files:** `ggml/src/ggml-rpc/ggml-rpc.cpp`, `transport.{h,cpp}`, and SCUT's own `scut.{h,cpp}`.
- **Hooks:**
  - `rpc_dispatcher::work()` times every command, writes the `[link]` lines every `GGML_RPC_STATS` seconds, and wakes from its queue wait (`message_queue::pop_for`) to write the last one when commands stop.
  - `rpc_serve_client()` does the same on the lending side (a guard object, so the last lines are written however the loop ends); `send_msg` and `rpc_server::sync_all_backends` add up sending and card time.
  - `socket_t` gains `bytes_sent`, `bytes_received`, `link_name` and `link_note`; `impl::get_caps` / `update_caps` keep the reason SCUT isn't in use (`scut_why()`).
  - `scut.cpp`: counters and `note()`; receive reports (`T_RXR`, offer flag `OF_TUNE`), `on_report()` (the tuning), `flush()` sends a repair per `fec_k` packets, `judge()` only slows for lateness when the line was being filled.
- **Environment:** `GGML_RPC_STATS` (seconds, default 10, 0 = off), `GGML_RPC_SCUT_TUNE` (default 1).
- **Bob callers:** `src/link-log.js` (keeps the lines in `bob-net-link.log` and the logbook), `src/share-card.js` (`linkEnv`, the lender's output), `src/llamacpp.js` (the borrower's output), `src/server.js` (`/api/share-brains/link-log`), `public/share-brains.js` (Watch the link live, Link log).
- **Re-check on rebase:** 0005 and 0006 first. If upstream changes `rpc_dispatcher::work()` or the `rpc_serve_client` loop, the timing hooks move with them; the probe uses `RPC_CMD_GET_ALIGNMENT` for device 0, which must stay a command the server answers without touching the card.
- **Tests:** `test/run-link-log-test.js`. SCUT alone can be built without llama.cpp (scut.cpp, scut.h, scut-seal.h and a four-line stand-in for log.h) and run through a pretend Wi-Fi; do that after any change to the tuning. The PC test is Bigger Bobs over Wi-Fi with the Link log open on both Bobs.

### 0009-expert-mass: how much each expert really wrote (REAP)
- **Upstream files:** `tools/server/server-context.cpp`, `tools/server/server-task.h`, `tools/server/server-schema.cpp`. Server only; no ggml or card backend change. Sits on top of 0002's expert trace.
- **Hooks:**
  - New request field `expert_trace_mass` (with `expert_trace`). The trace's eval callback also reads each layer's `ffn_moe_weighted-<layer>` node (w · f(x)) and adds up the L2 norm of every picked expert's row.
  - Every expert trace now carries `experts` and `layers` (picks per expert per layer); with mass on, `mass` laid out the same. That is the Forge's counts file shape, so `pod/keep.py` reads it as it is.
  - A brain that weighs the experts' input instead of their output (llama4) gets `"mass": null` and `mass_why`.
- **Bob callers:** none in the app yet. The Forge's `pod/reap.py` and `pod/keep.py` (`--by counts`, `mass` or `reap`) use the same numbers on a rented card; this lets a home scan make them too.
- **Re-check on rebase:** the node name `ffn_moe_weighted` in `llama-graph.cpp` (`build_moe_ffn`), and that w there is the weight after the brain's own renormalising. Requests that don't ask must be unchanged.
- **Tests:** none automatic (see below). The PC check is one `expert_trace_mass` request on Riker: `mass` has one list per layer, and every expert with picks has mass above 0.

### 0010-expert-trace-once: the trace read once per word

- **Upstream files:** `include/llama.h`, `src/llama-context.{h,cpp}`, `src/llama-cparams.h`, `src/llama-graph.{h,cpp}`, `tools/server/server-context.cpp`.
- **Hooks:**
  - `llama_cparams::keep_expert_ids`, set by `llama_set_keep_expert_ids()` (marks the scheduler for a new memory layout, `sched_need_reserve`); `llm_graph_params::allow_reuse` compares it, so the graph is rebuilt when it changes.
  - `llm_graph_context::build_moe_ffn()`: with it on, `ggml_set_output()` on the node `ffn_moe_topk` views, so no later layer is given its memory.
  - `llama_get_tensors()`: queues every copy with `ggml_backend_tensor_get_async()` on the tensor's own backend, then one `ggml_backend_synchronize()` per backend used.
  - `server_expert_trace::cb_eval()`: while asked, it remembers every `ffn_moe_topk-<layer>` it passes (`pending`) and only asks to stop at the last layer with experts (`last_moe_il`, learned on each request's first step); there it reads all of them with `llama_get_tensors()`. `expert_trace_begin()` turns `keep` on for expert traces only; the end of a trace turns it off.
- **Bob callers:** none new; the same `expert_trace` requests (`src/llamacpp.js`) get it.
- **Only on top of 0002, 0007 and 0009** (with `expert_trace_mass` the trace keeps the old way, since the mass reads every layer's outputs anyway).

### 0011-rpc-read-ahead: one trip a word instead of several
- **Upstream files:** `ggml/src/ggml-rpc/ggml-rpc.cpp` only (the client half).
- **Hooks:**
  - `rpc_dispatcher::graph_compute()` calls `ahead_learn()` before it sends a graph (the reads since the last graph are what follows that graph) and `ahead_ask()` after (one message carrying every read foreseen for this graph).
  - `rpc_dispatcher::get_tensor()` is what `ggml_backend_rpc_buffer_get_tensor` and `ggml_backend_rpc_get_tensor_async` now call: it takes the answer from what was asked ahead when there is one, and sends the read as before when there isn't.
  - `rpc_dispatcher::work()`: a message with `ahead` items sends every `GET_TENSOR` request first, then reads the answers in order.
  - `send()` / `send_async()` call `ahead_forget()` for anything that isn't a read or a graph.
- **Environment:** `GGML_RPC_AHEAD` (default 1, 0 = off).
- **Bob callers:** none; `src/link-log.js` keeps the `[link]   read ahead: ...` line like any other.
- **Re-check on rebase:** it leans on graphs keeping their `uid` from one word to the next (that is what makes upstream send `GRAPH_RECOMPUTE`), and on the card server answering commands in the order they arrive. If upstream changes either, or adds its own batching of reads, drop this patch rather than port it.
- **Tests:** `engine/tests/rpc-ahead.cpp` (build it against the engine's libraries; run it against `ggml-rpc-server` with `GGML_RPC_AHEAD` 0 and 1, straight and through a slow link). `test/run-link-log-test.js` checks the patch is listed.

### 0012-load-progress: how far a brain has loaded
- **Upstream files:** `tools/server/server.cpp` only.
- **Hooks:** `server_run_instance()`: when the server is not run by a router, `ctx_server.set_state_callback()` prints `load_progress: <stage> <percent>` for each loading sample (upstream throttles them to one per 200 ms). Under a router, upstream's own callback is kept.
- **Bob callers:** `loadDots()` in `src/llamacpp.js` reads the lines while a brain loads; `src/brain.js` broadcasts `load-progress` and `src/server.js` sends `cube-load` to the cube.
- **Re-check on rebase:** that `set_state_callback` and the `value` / `current` fields of the loading payload are still there.

## What's not covered yet

No patch is tested automatically against a real engine build. A Brain Engine build that compiles but put a hunk in the wrong place would only show up in the PC test. Proposed for a later Brain Engine build: a short engine test in `brain-engine.yml` (ready-for-review PRs and main only, never drafts). It would load a tiny MoE GGUF and check five things:
1. Mask: an expert switched off is never picked.
2. Trace: rows equal `n_layer`.
3. Dials: an expert's dial at 0 matches the mask.
4. RPC: HELLO works between two local processes.
5. SCUT off: plain link, same tokens.
