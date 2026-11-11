# Bob model lab

Step 0 of [Bob's own models](../docs/BOBS-OWN-MODELS.md): the free work done at home before anything is rented. Node only, no Python.
It expects to sit next to Bob's source tree, llama.cpp and a `models` folder in one parent folder (or set `BOB_AGENT_DIR`). Everything it makes goes to `model-lab/out` (ignored by git).

Rules: one GPU job at a time. Each script refuses to start while any llama-server is running (Bob's brain, or a test one);
unload Bob's brain first or wait. Not while gaming. Create `out\PAUSE` to pause the lesson writer, delete it to carry on.

Needs: Bob's source tree (`<parent>/bob`, with src/ and test/), llama.cpp (`<parent>/llama.cpp`, llama-server + llama-imatrix),
Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf and its mmproj under `<parent>/models` (found by name; or pass --model / --mmproj / --bob / --llama).

1. `node experts-test.mjs` — the quiz at 8, 6, 4, 3, 2 experts per word (about 1 to 2 hours; `--quick` for a quarter of the tool quiz).
   Report: out\experts-test-*.md. Checkpoint A reads this.
2. `node write-lessons.mjs --count 4000 --hours 10` — overnight; run again to carry on. `--images <folder>` adds picture lessons.
   Output: out\lessons\ideas.jsonl, lessons.jsonl, toolsets.json (Bob's prompt + tool sets, stored once).
3. `node count-experts.mjs` — llama-imatrix over the lessons (about 30 to 60 minutes). Report: out\experts\expert-counts-*.md,
   with the busiest 48/32/16/8 experts per layer in the .json (the cut lists for 8Bob/6Bob/4Bob/2Bob).

4. `node loop-test.mjs --model <brain.gguf>` — the tool quiz through Bob's real turn loop (his toolbox, checks and retries), with
   stand-in tools that touch nothing, plus 8 jobs that take several steps. Add `--plain` for a second run without the loop helps
   (src/loop-help.js) to compare. `--quick` runs a quarter of the quiz. Report: out\loop-test-*.md.

The scripts were first tested against a fake llama-server and a fake llama-imatrix (flow, files and parsing), then for real on the project's test machine. What they found is on the models page.

Lesson results: use_tools and bob_help are Bob's own answers. The cards he shows (offer_setup, pick_session, show_plan,
ask_together) get fixed answers. Every other tool's result is made up by the teacher. Web search is on in the lesson
Bob. Lessons are not filtered yet: before training, drop the ones where the tool doesn't fit the job (a later step).
