# Brain Engine map

This is the guide to what Brain Engine changes in llama.cpp, where each change hooks in, and what to re-check when moving to a newer llama.cpp. [README.md](README.md) says what each patch is for and how to build and move it. This page is the "where and how" for whoever does the rebase.

Brain Engine 8 (named 8b12359) is llama.cpp **b12359** (llama.cpp 1.0) plus patches 0001 to 0014 below; 0015 (prompt odds), 0016 (expert cache ranking), 0018 (live trace every N words), 0019 (expert prefetch), 0020 (expert tiers), 0021 (the trace read from kept copies), 0022 (the cache lent to long reads), 0023 (its refill behind the writing) and 0024 (the cache's read layout) are for the next Brain Engine (Brain Engine 4 had the first six, Brain Engine 5 the first eight, Brain Engine 6 the first twelve, Brain Engine 7 the first thirteen on b12282; 0007 is live expert picks, 0008 the link log and SCUT that retunes itself, 0009 the expert mass, 0010 the expert trace read once per word, 0011 one trip a word over a lent card, 0012 load progress, 0013 experts per word, live, 0014 card sharing across builds). Only 0004, 0005, 0006, 0008, 0011 and 0014 touch ggml, and only its card-sharing backend (`ggml/src/ggml-rpc`). No CUDA, Vulkan or Metal code is changed, so a llama.cpp update that only changes the card backends needs nothing from us. 0020 is the only patch in the CPU backend (`ggml/src/ggml-cpu`): one call after the expert grouping in each of the two mixture-of-experts products, plus its helper.

Bob's own code map lists these patches too: one line each, with the files they change, the lines they add and take out, and the main names they add.

## Rebase checklist, most fragile first

1. **The graph's expert and FFN builders** (`src/llama-graph.cpp`: `build_moe_ffn`, `build_ffn`, `build_attn_mha`). 0001 and 0003 put their mask and dials right where the experts are picked and their outputs summed. Upstream changes these often (new expert-routing modes, fused kernels, new archs). If a hunk moved, check that the mask still comes **before** the top-k pick (`ffn_moe_logits_masked`), and that the dials still multiply the expert weights and outputs (`ffn_moe_weights_dialed`, `ffn_moe_out_dialed`, `ffn_out_dialed`). A wrong placement still builds, but gives wrong answers.
2. **The server** (`tools/server/server-context.cpp`, `server-task.*`, `server.cpp`, `server-schema.cpp`). About 580 of our lines live in files upstream rewrites often (routes, task types, slot state, result JSON). Check that `/expert-mask` and `/dials` are still registered in `init_routes()` / `server_register_routes`, that the new task types are handled in the task switch, and that `expert_trace` still comes back in all three result shapes (plain, OpenAI chat, OpenAI chat stream).
3. **Layer counting with MTP layers.** Since b12282, `n_layer` = all layers minus the next-token (MTP) layers. The mask and dials take one row per layer that runs. Bob sends `engineLayers` rows (from `src/lab-gguf.js`); the Riker 41/40 bug was this. If upstream changes how `n_layer_nextn` counts, re-check `llama_model_n_layer` against Bob's `brainFacts().engineLayers`.
4. **The card-sharing protocol version** (`ggml-rpc.cpp`, `RPC_PROTO_*`). b12359 (llama.cpp 1.0) is version 10, b12282 was 9 and b12032 was 8; from Brain Engine 8, patch 0014 keeps protocol 9 numbering on the wire so builds 7 and up share (engine/README.md). Brain Engine 6 and older can't share with 7 and up. If the version changed, say so in the release note. Also check that 0004's `RPC_CMD_SET_TENSOR_HASH` path and `serialize_set_tensor` still match upstream's message layout.
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
### 0013-experts-per-word: more or fewer experts per word, live
- **Upstream files:** `include/llama.h`, `src/llama-cparams.h`, `src/llama-context.{h,cpp}`, `src/llama-graph.{h,cpp}`, `src/llama-model.cpp`, `tools/server/server-context.{h,cpp}`, `server-task.h`, `server.cpp`.
- **Hooks:**
  - `llama_cparams` carries a pointer to the context's live counts (`expert_used`, `expert_used_n`) and `expert_used_gen`, which `llm_graph_params::allow_reuse` compares, so a graph is never reused across a change.
  - `llm_graph_context::build_moe_ffn` swaps `n_expert_used` for the live count of that layer before the top-k pick, and the sum of the experts' outputs (`n_expert_used_il`) uses the same count. Not when `selected_experts_in` is given (llama.cpp 1.0 removed warmup, and with it the old "not during warmup" check), and only when `n_expert` is the brain's own.
  - `llama_context::set_expert_used` checks the counts (1 to `n_expert`, at most `LLAMA_MAX_EXPERTS`, no more than the expert mask keeps, no more than the brain's own with a MoE cache), then calls `sched_reserve()` at once inside a try; on failure it puts the old counts back and reserves again. `set_expert_mask` now remembers how many each layer keeps and refuses a mask narrower than a live count. `graph_max_nodes` adds two nodes per extra expert per layer.
  - The server's expert trace keeps `k_of` per layer instead of one `n_used` for all, in the collector (`ffn_moe_topk`), the mass (`ffn_moe_weighted`), the full trace and the streamed parts. Neuron and head traces set `k_of` to their own fixed count.
- **New API:** `llama_set_expert_used(ctx, used, n)` (0 done, -1 bad counts, -2 the mask keeps fewer, -3 not enough memory, -4 no experts or a shared router, -5 more than own with a MoE cache), `llama_get_expert_used(ctx, il)`, `llama_model_n_expert_used_layer(model, il)`.
- **Server:** `GET /experts-per-word`, `POST /experts-per-word` with `{"used": null | N | [N or null per layer]}`. A server task, so it waits its turn; refused while a slot is busy; clears the prompt caches.
- **Bob callers:** `src/experts-per-word.js` (cleaning, sending, the speed guess), `src/llamacpp.js` (`sendPerWord`: the per-brain count from Settings, Speed, before the brain's next answer), `src/lab-peek-jobs.js` (Peek inside: one question at a chosen count, then back).
- **Re-check on rebase:** checklist item 1: the swap must stay before `ggml_argsort_top_k` and match the views summed after it. If upstream starts passing per-layer counts from every model (it already reads `hparams.n_expert_used(il)` when summing), keep ours winning. If upstream changes how warmup sizes the graph, re-check that the worst case is still reserved after a change. Also check `router_layer` (shared routers) is still the only way a layer gets its picks from another.
- **Tests:** `engine/tests/experts-per-word.py <checkout>` builds a tiny brain and checks live against `--override-kv`, per layer through the trace, and the refusals. `test/run-experts-per-word-test.js` checks what Bob sends and when.

### 0014-rpc-any-version: card sharing across Brain Engine builds
- **Upstream files:** `ggml/src/ggml-rpc/ggml-rpc.cpp`.
- **Hooks:** `bob_wire_ops[]` is protocol 9's list of steps (llama.cpp b12282) written as this build's `GGML_OP_*` names, with -1 where llama.cpp dropped one (1.0 dropped ADD1, DIAG_MASK_INF, DIAG_MASK_ZERO). `serialize_tensor` sends the wire number, `deserialize_tensor` turns it back and refuses a number this build has no step for (instead of running the wrong math). HELLO says 9.0.0 both ways (`BOB_WIRE_*`), and the client checks that, not `RPC_PROTO_*`. A `static_assert` fails the build while any step has no wire number.
- **Why:** upstream renumbers the steps and raises `RPC_PROTO_MAJOR_VERSION`, so mismatched builds refuse each other. Nothing else in the messages changed between protocol 9 and 10. Brain Engine 7 needs no change; 6 and older (protocol 8) still can't share.
- **Re-check on rebase:** if the build stops at the `static_assert`, llama.cpp added a step: add it at the END of `bob_wire_ops`. A dropped step becomes -1 in place. If `rpc_tensor` or any message struct changes, or an op's `op_params` layout changes, the wire is really different: then raise `BOB_WIRE_MAJOR` and say so in the release note.
- **Tests:** `engine/tests/rpc-any-version.sh <old bin> <new bin> <gguf>` runs a brain with every layer on a lent card in all four pairings (old/new lender, old/new borrower) and checks the text matches a local run word for word. Nov 15 2026: all four matched on a tiny llama brain (CPU builds, Linux).

### 0015-prompt-odds: score the prompt itself
- **Turned on by:** `--prompt-odds-max N` on the server (default 0: requests asking for it are refused), then `"prompt_odds": K` (top K, 0 to 128) and optionally `"prompt_odds_from": i` on a request.
- **Upstream files:** `common/arg.cpp`, `common/common.h`; `tools/server/server-context.cpp`, `server-schema.cpp`, `server-task.{h,cpp}`.
- **What it does:** for every prompt token from `prompt_odds_from` on, the final result carries the log-probability the brain gave that token after reading the ones before it, and the K tokens it would have picked there (`prompt_odds`: from, n, k, ids, own, top_ids, top). Teacher-forced scoring for distillation and perplexity. It keeps room for N more outputs (N x vocabulary x 4 bytes on the card and in memory), so it costs memory only when the server is started with it.
- **Note:** it was in Brain Engine 9's build but missing from this folder until Nov 17; the copy here is byte-identical to the one Brain Engine 9 and 10 were built with.

### 0016-moe-cache-ranking: the expert cache filled at load
- **Environment keys (both off unless set):** `LLAMA_MOE_CACHE_RANKING=<path of a ranking file>` (a FILE PATH, not a number or a random seed) and `LLAMA_MOE_CACHE_LOG_EVERY=<N cache updates>`.
- **Upstream files:** `src/llama-moe-cache.cpp` only.
- **Hooks:** at the end of `llama_moe_cache::impl`'s constructor, after the banks and slot maps are allocated (never with `no_alloc`): `model_fingerprint()` (FNV-1a over each layer's expert tensors: index, type, `ne`, and 64 bytes at the start of the first expert and the end of the last, read with `ggml_backend_tensor_get`) is printed, then `fill_from_ranking()` reads the file. Everything is checked before a slot is touched: the header `bob-moe-ranking 2 <fingerprint> <stamp>`, the fingerprint against this brain, every line in range for this brain (layer < `n_layer`, expert < `n_expert`, count > 0), and the file read to its end. Any failure logs `!!! MoE cache ranking NOT USED: <why> (<path>). The cache fills the stock way instead.` and returns. Then per group it sorts by count, and for slot 0, 1, 2... sets `slot_map[il][e]`, `key_of`, `crf` (the top class), `last_use`, moves the slot to that class's LRU list, counts it in `n_filled`, and copies the expert's bytes from the host tensor into each bank with `ggml_backend_tensor_set`. `GGML_ASSERT`s stop the engine if a ranked layer has no slot map or a slot is already taken (internal faults, not bad files). In the cache update after the stats are counted, `log_stats()` runs every `LLAMA_MOE_CACHE_LOG_EVERY` updates.
- **Why:** upstream's cache is reactive: it fills on first use, and with the default `--moe-cache-cpu-share 0` it copies every miss to the card, which thrashed on 1.5.193 (writing 2.5 to 3 times slower; 1.5.198 took it out). Ranked, with the CPU share at 1, the cache holds a fixed set while writing. A ranking from the wrong weights would quietly install a bad placement, worse than none, so it is refused out loud instead.
- **What "fixed" means (read from `plan()`, not yet measured):** with the share at 1, a miss goes to the processor when one of the `n_zero` spare slots (up to `n_expert_used`) is free for every token that picked it. Writing one token at a time always finds one, so nothing is evicted. Batches of 2 to 32 tokens can run out and then copy a miss in, evicting the least-used slot. Batches bigger than 32 don't use the slot map at all, so **prompt reading never gains from a ranking**. The PC check (method addendum 2) turns this into a measurement: writing only, share 1, the `ubatch <= 8` uploaded MiB must stay 0 after the load; with Turbo, small and not zero.
- **Re-check on rebase:** the names `moe_cache_lru`, `slot_map`, `key_of`, `crf`, `last_use`, `move`, `class_of`, `n_filled`, `make_key`, `banks`, `experts`, `stats_small`, `log_stats`, `llama_moe_cache_layer_experts`; that `plan()` still leaves misses to the processor with share 1 and full slots; the `n_class`/`crf` meaning (the top class is `n_class - 1`); and the large-batch bypass (`max_batch`).
- **Tests:** none can run without a graphics card (the cache refuses to start without one). The CPU build compiles. The PC test reads `MoE cache brain fingerprint`, `ranked fill: N experts (... MiB)`, any `NOT USED` warning, and the `hits/misses/uploaded` lines.

### 0018-expert-trace-every: the live trace every N words
- **Upstream files:** `tools/server/server-task.h` (`expert_trace_every` in the task params), `server-schema.cpp` (the request field), `server-context.cpp` (`expert_trace_part`).
- **Hooks:** at the top of `expert_trace_part()`, after the asked-for checks and before `llama_synchronize`: with N > 1, no piece (and no wait) unless it's the first written word or `n_gen % N == 0`. N is clamped to 1 to `part_max_rows` (64) so a piece never drops rows.
- **Why:** each piece waits for the card (`llama_synchronize`) once a word. The 12 November test showed the trace's cost was in waiting, not sending.
- **Re-check on rebase:** `expert_trace_part`, `part_max_rows`, `slot.stats.n_gen`.
- **Tests:** `engine/tests/trace-every.py <checkout>`: pieces at N = 1 and N = 4, same rows, same full trace.

### 0019-expert-prefetch: the next layer's experts copied ahead
- **Environment key (off unless set):** `LLAMA_PREFETCH_EXPERTS=1`.
- **Upstream files:** `src/llama-context.cpp` and `src/llama-context.h` only.
- **Hooks:** `llama_context::sched_copy_experts`, the copy callback llama gives the scheduler for weights in RAM. After the MoE cache's own check: on first call, `llama_expert_prefetch::init()` maps each RAM expert tensor to the same kind (gate, up, down, gate_up) in the next layer in RAM, opens a second backend on the same device (`ggml_backend_dev_init`) and allocates one staging buffer per kind plus two events. `serve()`: if `src` was copied ahead, the card's stream waits for the `ready` event, copies staging to `dst` on its own stream (`ggml_backend_tensor_copy_async(backend, backend, ...)`), and records `consumed`. At the end of the callback, `ahead()`: when at least half of `src`'s experts were used, the second stream waits for the slot's last `consumed`, then `ggml_backend_tensor_set_async` copies the next tensor whole into staging and records `ready`.
- **Why:** prompt reading with experts in RAM is bound by those copies, which the card's stream does in line with the work. The stock scheduler's prefetch only moves results the other way.
- **Safety:** the staging buffers are ours, not the scheduler's, so no allocator lifetimes change. A staging buffer is never written before the card has moved its last contents out. Any failure to set up (no second stream, no events, no room) logs `!!! expert prefetch NOT USED` and leaves the stock path.
- **Re-check on rebase:** `sched_copy_experts` and `copy_experts_info`, the MoE cache check at its top, `ggml_backend_dev_init`, `ggml_backend_tensor_copy_async`, event support on CUDA and Vulkan.
- **Tests:** none can run without a graphics card. With it on, a CPU build and the trace test still pass (nothing in RAM is offloaded there). The PC test compares reading speed with it on and off and reads its closing line.

### 0020-expert-tiers: warm experts pinned in RAM, cold experts read whole
- **Environment keys (all off unless set):** `LLAMA_EXPERT_READ_WHOLE=1` (cold tier; only "1" turns it on), `LLAMA_EXPERT_READ_WINDOW=N` (default 64), `LLAMA_EXPERT_READ_LOG_EVERY=N`; `LLAMA_EXPERT_WARM_MIB=N` (warm tier) with `LLAMA_EXPERT_WARM_RANKING=<path of a ranking file>`, or `LLAMA_MOE_CACHE_RANKING` when that is unset.
- **Upstream files:** `ggml/src/ggml-cpu/ggml-cpu.c`, `ggml-cpu-impl.h`, `repack.cpp`; `src/llama-context.cpp`, `src/llama-mmap.{h,cpp}`, `src/CMakeLists.txt`; new `src/llama-expert-tiers.{h,cpp}`.
- **Hooks:** cold: in `ggml_compute_forward_mul_mat_id` (ggml-cpu.c) and `forward_mul_mat_id` (repack.cpp), on thread 0 right after the rows are grouped by expert (`matrix_row_counts` filled), `ggml_cpu_expert_read_whole(src0, matrix_row_counts, n_as)`. It keeps, per expert tensor (keyed by `src0->data`, in a fixed table of 4096 under `ggml_critical_section_start`), the product number when each expert was last used, and for a picked expert unused for `window` products asks for its whole slice (`src0->data + e*nb[2]`, `nb[2]` bytes, page-aligned) with `PrefetchVirtualMemory` (looked up at run time, Windows 8+) or `madvise(MADV_WILLNEED)`. Warm: in `llama_context`'s constructor right after the MoE cache is made (never with `no_alloc`), `llama_expert_tiers_pin_warm(model)`, once per brain. It computes the same fingerprint as 0016, reads and checks the ranking the same way, sorts busiest first (ties by layer, then expert), and for each ranked expert whose tensors sit in a host buffer (`ggml_backend_buffer_is_host`) locks its slices with one `llama_mlock` each until the MiB are used up or the system refuses (`llama_mlock::failed()`, added). The locks live until the engine stops.
- **Why:** a brain bigger than RAM is mapped, and the operating system drops and re-reads parts of it page by page as the processor touches them. Pinning keeps the busy RAM experts from being dropped; asking for a whole cold expert turns many small faults into a few large reads.
- **Safety:** neither tier changes a number: the products read the same bytes, only when they come into memory changes (the test checks words and odds are identical). A refused ranking pins nothing and says so (`!!! warm experts NOT PINNED`). Pinning more than the system allows stops early with llama_mlock's own warning. With the hot-experts cache on, the top-ranked experts are both on the card and pinned in RAM; the RAM copy is still read for prompt reading (big batches skip the cache).
- **Re-check on rebase:** the grouping loops and `matrix_row_counts` in both mul_mat_id paths; `llama_mlock`'s `failed_already`; that `tiers_fingerprint` still matches 0016's `model_fingerprint`, and `ffn_gate_up_exps`/`ffn_gate_exps`/`ffn_up_exps`/`ffn_down_exps` on `llama_layer`.
- **Tests:** `engine/tests/expert-tiers.py` (tiny made-up brain, CPU build): same words and odds with each tier on and both; the cold tier asks and skips; the warm tier pins the exact number that fit; refusals. It can't show a speed-up, because the tiny brain fits in RAM; that is the PC test on a brain bigger than RAM.

### 0021-expert-trace-kept: the trace read from kept copies, no callback
- **Turned on by:** `llama_set_keep_expert_ids(ctx, true)` (0010's call, same name); the server does it for a plain expert trace (not mass, neurons or heads) and then sets no eval callback.
- **Upstream files:** `include/llama.h`, `src/llama-context.{h,cpp}`, `src/llama-cparams.h`, `src/llama-graph.{h,cpp}`, `src/llama-moe-cache.{h,cpp}`, `tools/server/server-context.cpp`.
- **Hooks:** `build_moe_ffn` no longer calls `ggml_set_output` (0010's line is replaced). Right after `build_moe_cache_slots` (after the router's fused ops), when `cparams.expert_ids_keep` has a tensor for the layer and the layer gets no cache slots, `ggml_cpy(picks, view of it)` is added and expanded, and `{il, k, n_tokens}` goes in `llm_graph_result::ids_kept` (cleared in `reset`). `llama_context::ids_keep_ensure` makes the tensors (per device one `[k_max, n_slots, n_ubatch]` tensor, with each layer that has `ffn_gate_inp` a `[k, n_ubatch]` view of its slot, on the default buffer type of that router's device, k = the live 0013 count or the brain's own; plus a pinned stage for `n_batch` tokens from the device's host buffer type) and remakes them when the count grows or `n_ubatch` changes, bumping `cparams.expert_ids_keep_gen` (compared for graph reuse) and asking for a new reserve. In `decode`: ensure and `ids_keep_room(n_tokens_all)` before `sched_reserve`, and `ids_keep_read(res)` after each `process_ubatch`, which queues one `ggml_backend_tensor_get_async` per device of the first n tokens' block into the stage. `ids_keep_drain` (from `llama_get_kept_expert_ids`) waits once and sorts the queued blocks into per-layer host vectors in the order computed. A layer that does get cache slots has no copy: `llama_moe_cache::copy` passes the ids it has just read and waited for to `set_ids_sink`'s function (the slot map's call only, so once per layer and micro-batch), and `ids_keep_sink` queues them in the same list, so the order computed is kept. Server: after each decode with the trace on, `llama_get_kept_expert_ids` per layer fills `cols`, `n_cols` and `k_of` exactly as the callback did, then `llama_clear_kept_expert_ids`.
- **Why:** the eval callback splits the graph at the picks, inside the router's fused kernel, so on the card the router runs unfused and the words change; `ggml_set_output` on the sorted list also blocks the fusion. A copy placed after the fused ops keeps the graph's shape, and the copy out happens where the logits copy already does.
- **Safety:** the copy only reads the picks. Order is the order computed, as before; a batch with more than one request is still marked bad. A count that changes inside one read, or no room, marks that layer bad (the trace says so) instead of writing anywhere. If the tensors can't be made, the log says so and the trace comes back marked bad.
- **Re-check on rebase:** the order of nodes in `build_moe_ffn` (the copy must come after the weights' last node, or the CUDA top-k fusion pattern breaks); `ggml_cuda_topk_moe_fusion`'s patterns; the per-ubatch output copies in `decode`; `llm_graph_result::reset`.
- **Tests:** `engine/tests/trace-kept.py` (tiny made-up brain, CPU build, 16 checks); `experts-per-word.py` and `expert-tiers.py` still pass. On the card: the cube check rows (trace off vs on, words and speed) on the PC.


### 0022-lend-cache-to-reading: the cache lent to long reads, back for writing
- **Turned on by:** `LLAMA_MOE_CACHE_LEND=N` with the MoE cache on (`--moe-cache-mib`), N over 32 and under `n_ubatch`. Off unless set; a value out of range is refused with a `NOT USED` warning.
- **Upstream files:** `src/llama-context.cpp`, `src/llama-cparams.h`, `src/llama-moe-cache.{h,cpp}`.
- **Hooks:** the constructor reads the knob right after the MoE cache is made (in the `no_alloc` measuring pass too, so `--fit` sees the smaller step with the cache). `sched_reserve` lays the working memory out for `min(n_ubatch, N)` tokens while the cache is in place (`cparams.moe_cache_lent` false), for `n_ubatch` while lent. In `decode`, before `sched_reserve`: a batch of more than N tokens while not lent, or of 32 or fewer while lent, synchronizes, resets the graph results, frees the scheduler (its compute buffers go first), then `llama_moe_cache::lend()` (frees each device's bank buffer) or `restore()` (clears the tensors' data and buffer, allocates the banks again with `llama_memory_bufs::alloc_buf`, clears them, uploads every filled slot's expert from its host tensor, consecutive slots together, and waits), and reserves again. While lent, `get_slot_map` returns nullptr (no graph gets slots), `copy_experts` copies nothing (big batches upload from RAM), and `copy` asserts it isn't called.
- **Why:** batches over 32 tokens skip the cache (`max_batch`), so its memory is idle during a long read, and the bigger step that memory allows reads faster (the PC: step 6144 with 3.5 GB vs 4096 with 4 GB).
- **Safety:** the LRU state is untouched while lent, so the same experts come back to the same slots: the cache's contents and the words are as if it was never lent. A failed layout after a switch returns -2 from `decode` with the reason in the log. Unproven: the CUDA memory pool grows with the step and never shrinks, so if the bigger step's pool doesn't fit next to the cache, the cache's allocation on the way back fails and that decode returns -2 (the cache stays lent, and the next short write tries again).
- **Re-check on rebase:** `sched_reserve`'s worst-case `n_tokens`; `sched_new`'s reuse check (a null scheduler must make a new one); `max_batch` in the cache; that `ggml_backend_alloc_ctx_tensors_from_buft` still allocates tensors whose data is null and inits their views.
- **Tests:** none on the processor: the MoE cache needs a card. Here: it builds, and `trace-kept.py`, `expert-tiers.py` and `experts-per-word.py` still pass with it off. On the PC (Brain Engine 13, `results/lend-cache-be13`, 12 loads): no failures; words equal to step 6144's at 32K; lent in 78-99 ms, back in 274-286 ms; writing 92.8 vs 88.4 at step 6144 with 3.5 GB.


### 0023-lend-refill-behind: the lent cache refilled behind the writing
- **Turned on by:** `LLAMA_MOE_CACHE_LEND_BEHIND=K` (1 to 4096) together with 0022's `LLAMA_MOE_CACHE_LEND`. Off unless set; out of range is refused with a `NOT USED` warning.
- **Upstream files:** `src/llama-context.cpp`, `src/llama-cparams.h`, `src/llama-moe-cache.{h,cpp}`.
- **Hooks:** 0022's `restore()` is split into `alloc_banks()` and `upload_slots(backend_of)`. `restore_behind()` makes one extra backend per cache device on first use (`ggml_backend_dev_init` of the same device: its own stream), allocates the banks, sets `filling`, and starts a `std::thread` that queues every filled slot's upload on those backends, waits on them and sets `fill_done`. While `filling`, `get_slot_map` returns nullptr, `copy_experts` copies nothing and `copy` asserts it isn't called, exactly as while lent. `finish_fill()` joins the thread and clears `filling`; `lend()` calls it first. In `decode`, before 0022's switch: while filling, a batch over N, or the decode once `moe_cache_fill_seen` (tokens decoded since the refill started, counting the first) has reached K, synchronizes, calls `finish_fill()` and resets the graph results, so the next graph is built with slots; otherwise the batch's tokens are added to the count. In 0022's switch, the take-back calls `restore_behind()` when K is set (falling back to `restore()`).
- **Why:** on the PC the take-back cost 274 to 286 ms before the first word, which made the lent setup finish a 300-word answer about 0.25 s after step 6144 alone.
- **Safety:** no graph reads the banks while they are being written: they get no slots and no copies until the thread has been joined. The LRU isn't touched while filling (`copy` doesn't run), so the thread reads `key_of` alone. The switch is at a fixed token count, so the words are the same from run to run for the same K, not dependent on the upload's speed; they differ from 0022's (the first K tokens are computed without the cache, like a no-cache run). The destructor joins the thread and frees the extra backends.
- **Re-check on rebase:** that `ggml_backend_dev_init` still gives a CUDA backend its own stream and that `ggml_backend_tensor_set_async` on it accepts the cache's buffer type; the graph-reuse reset in `decode`.
- **Tests:** none on the processor (the MoE cache needs a card). Here: builds; `trace-kept.py`, `expert-tiers.py`, `experts-per-word.py` still pass with it off. On the PC (Brain Engine 14, 18 loads): clean, uploads 272-366 ms, no waits, words stable per K; slower than 0022 (K words at about 37 words a second in the cache's layout), first word unchanged. Off; not recommended.


### 0024-cache-read-layout: whole layers in the cache for long reads
- **Turned on by:** `LLAMA_MOE_CACHE_READ_LAYERS=N` (over 32) with the MoE cache on; ignored when `LLAMA_MOE_CACHE_LEND` is set. Off unless set.
- **Upstream files:** `src/llama-context.cpp`, `src/llama-cparams.h`, `src/llama-moe-cache.{h,cpp}`.
- **Hooks:** `begin_read_layout()` waits for the devices, saves each group's `key_of` and each cached layer's slot map, then per group gives layers, in order, slots `base .. base + n_expert - 1` while they fit (`resident`), writes the identity into their slot maps and uploads their expert tensors whole (one copy per tensor per layer), and sets `reading`. While reading: `get_slot_map` returns the slot map for resident layers at any batch size (none for a CPU part), nothing for the others; `copy_experts` copies nothing; `copy` for a resident layer only uploads the fixed map (reading the ids for the 0021 sink if one is set), with no plan and no stats. `end_read_layout()` puts `key_of` and the slot maps back and uploads every filled slot again (0023's `upload_slots`). In `decode`, before 0023's and 0022's switches: a batch over N while not reading, or of 32 or fewer while reading, synchronizes, resets the graph results and switches.
- **Why:** on the PC, with no cache the 6144 step read a 32K prompt at 4715 tokens a second, with the cache lent (0022) at about 3860: the cache's 4 GB is where `--fit` would otherwise keep whole layers. This puts whole layers there for the read without changing the load-time layout.
- **Safety:** the LRU isn't touched while reading (`copy` doesn't plan), and the saved placement is put back exactly, so writing starts with the cache it had. The graphs made in one layout are dropped at each switch. Unproven: the scheduler's split at the lookup for big batches (the same rule as small ones: `copy` aborts if the picks are in the lookup's split).
- **Re-check on rebase:** `get_slot_map`'s small-batch rule; `build_moe_cache_slots` (no batch-size limit of its own); `copy`'s lookup checks.
- **Tests:** none on the processor. Here: builds; the three engine tests still pass with it off. On the card: X4096 vs R1 (`-b 8192 -ub 4096`, 4 GB copy cache, N 4096) vs S6k0, on start (must not switch) and 32K: reading, first word, writing, the logged fill times, words.

## What's not covered yet

No patch is tested automatically against a real engine build. A Brain Engine build that compiles but put a hunk in the wrong place would only show up in the PC test. Proposed for a later Brain Engine build: a short engine test in `brain-engine.yml` (ready-for-review PRs and main only, never drafts). It would load a tiny MoE GGUF and check five things:
1. Mask: an expert switched off is never picked.
2. Trace: rows equal `n_layer`.
3. Dials: an expert's dial at 0 matches the mask.
4. RPC: HELLO works between two local processes.
5. SCUT off: plain link, same tokens.
