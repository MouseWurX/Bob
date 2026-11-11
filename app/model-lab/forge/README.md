# The Forge

Cuts Bobs out of Qwen3.6-35B-A3B on a rented GPU and heals them against the full model. The method, the plan and the
results so far are on [Bob's own models](../../docs/BOBS-OWN-MODELS.md). The Forge needs the model lab's step 0 outputs in
`model-lab/out` (lessons and expert counts) and an API key for the by-the-hour GPU rental service the Forge talks to, in the environment variable `RUNPOD_API_KEY`.
No key is stored in this repository or in any file the Forge writes; it is read from the environment at start.

## The lessons

The lesson sets the Forge sends to the card are not in this repository (112 MB that every clone would download). They are a release asset: [lessons-v3](https://github.com/MouseWurX/Bob/releases/tag/lessons-v3), a zip with 16 folders of `lessons.jsonl` + `toolsets.json` and a checksum. Unzip it into `model-lab/out/` and the plan files' `lessons` and `extra_lessons` paths line up.

## One session

    node forge.mjs --plan plans\24-18.json

1. Shows the caps and asks you to type **yes** (that is the purchase; nothing is rented before it).
2. Rents one H100 80GB (H200 / H100 PCIe / A100 if none is free), with a 350 GB disk, from the rental service's secure tier.
3. Waits for the pod's door (a tiny upload/download server, `pod/bootstrap.py`, started by the pod itself).
4. Sends the pod scripts, lessons.jsonl, toolsets.json, the expert counts and the plan, and starts `pod/run.sh`.
5. Watches: prints the pod's phase and last log lines every minute into `out\forge\forge-<time>.log`.
6. Downloads each Bob as soon as it is ready into `out\bobs\<name>\` (GGUF + heal-report.json + counts), checksum checked.
7. Deletes the pod when every Bob is on the PC, when the run fails, or at the cap (hours_max / dollars_max in the plan),
   whichever comes first. The pod also deletes itself 8 minutes before hours_max, in case the PC side dies.

`--resume <podId>` reconnects to a running pod (token in out\forge\pod-token.json). `--status` lists pods. `--kill` deletes
every bob-forge pod. `--keep-on-fail` keeps a failed pod up for a look (it keeps costing money; kill it after).

## What the pod does (pod/run.sh)

- Installs tools, builds llama-quantize, downloads the teacher (BF16, 72 GB).
- Teacher pass (once per session): `teacher.py` loads the teacher with transformers and records its top-32 words and
  log-probabilities at every answer position of every lesson (`out/teacher.pt`).
- Fetches general text (one FineWeb-Edu file and one Tulu 3 chat file, public) and mixes `general_tokens` of it
  (default 30M, half text, half chats) into the teacher pass, the healing and the expert counts, so the Bobs keep
  general knowledge, not only Bob's work. heal-report.json scores lessons and general text separately.
- Per rung: `prune.py` keeps the busiest N experts per layer (from the expert counts) by slicing the safetensors
  bytes; `heal.py` trains LoRA on every linear layer and on the experts, plus the router, against the teacher
  (KL on the teacher's top-32 + cross-entropy on the real next word, answer tokens only), then folds the LoRA back in;
  `count.py` counts which experts the healed Bob uses (the next rung is cut from that); `export.py` makes the GGUF.
- Held-out numbers before and after healing are in heal-report.json (`ce` = how surprised it is by the teacher's
  words, lower is better; `kd` = distance from the teacher; `teacher_ce` = the teacher's own score, the floor).

## Plan file

See plans\24-18.json. `rungs[].from` is `teacher` or an earlier rung's name; `keep` is experts per layer
(176 = 24Bob, 128 = 18Bob, 80 = 12Bob, 64 = 10Bob, 48 = 8Bob, 32 = 6Bob, 24 = 5Bob, 16 = 4Bob).
`heal.experts`: `lora` (default), `full` (small Bobs only; 8-bit AdamW) or `frozen`.
Specialists: point `counts` at the coding or thinking counts file and name the rung e.g. `8Bob Cypher`.

## Untested until the first pod

prune.py and the runner were tested here (fake model, fake pod). heal.py, lora.py, teacher.py, count.py and
export.py need a real GPU: the first session is also their test. If it fails, forge.mjs prints the last log lines,
deletes the pod, and the loss is the time spent (a few dollars).

## Build 12: lessons written on the card, cut like an earlier Bob
- `write_lessons` in the plan: the pod serves the full Qwen with vLLM (port 8001) before the teacher pass; the PC's `write-lessons.mjs` writes the lessons through it (`--url`, `--parallel`), uploads them as lessons-extra, and the pod merges them (ids prefixed "x") and carries on. `min` lessons or the run stops.
- `keep_file` on a rung: cut with that exact expert list (an earlier Bob's `*-keep.json`) instead of the counts.
- `gpus` in the plan: card list in order of preference (default list in forge.mjs).
- Plan `plans/riker-v2.json`: Riker v2 + Bill v2 on the H200 NVL, nothing trimmed (max_len 16384).

## Build 13: network volume, adapters
- `volume` in the plan `{gb, name}`: one network volume, made once (`out/forge/volume.json` remembers it) in a data centre that has the wanted card in stock (`node forge.mjs --places` shows them). It mounts at /workspace and keeps the teacher weights, general text, llama tools and every Bob's adapter (`/workspace/bobs/<name>/`). This run's big working files live on the pod's own disk (/forge) and go with the pod.
- Every healed Bob also writes `<name>-adapter.pt` (LoRA + router, small) next to its GGUFs; it is downloaded to the PC. Adapter + keep list = the healed full-size Bob, rebuilt from the teacher in minutes (rebuild script: to do).
- `keep_healed`: healed Bobs are not deleted at the end of a rung.
- `run`: a name for this session's files.

## Build 14 (the coverage cut)

- `pod/keep.py`: builds a keep list that protects every skill. Per layer and per skill it keeps the experts covering `cover` (95%) of that skill's routing, 99% for the skills in `strong`; union over skills; every layer padded to one size with the most-used experts overall. Writes `coverage.md` (kept share per skill, worst layer) next to the Bob's files; `--check` reports an old keep list the same way.
- Rung `"keep": "cover"`: the pod counts every skill in `plan.skills` on the rung's source model (`count.py --jobs ...`, `"general"` = general text, `"thinking"` = lessons written with thinking on; `skill_pieces` per skill), runs keep.py, then cuts with the result. `max` caps the size, `keep_n` forces one.
- `plan.write_lessons` may be a list of sets, each with its own jobs/think/count/dir; `drop_tools` removes tools from the lessons (e.g. `ask_specialist,pick_session`, so coding lessons answer with code instead of handing off). `plan.extra_lessons` uploads lesson folders already on the PC. All extra sets are merged on the pod with idea ids prefixed `x<set>-`.
- `write-lessons.mjs`: new jobs `formats`, `gamemaster`, `refusals`, `languages` (weight 0, run only when named), `--drop-tools`, coding ideas now ask for 2 to 4 sentence requests with the language named.
- `count.py`: `--general-only`, `--think`.
- `plans/riker-v3.json`: line B v3 (Riker + Bill with the coverage cut, one rental).
- Counts-only run (`plans/counts-v3.json`, `rungs: []` + `skills`): the pod writes the lesson sets, counts every skill on the full Qwen, builds `ladder.md` (kept share per skill at every size in `ladder`) and sends the count files back to `out/counts/<run>/`. No teacher pass, no cut. Build the keep list on the PC with `python pod/keep.py --counts skill=file,... --keep N --out out/counts/<run>/keep-24Bob.json --report ...` and point the rung's `keep_file` at it. Lesson jobs `codefix` and `recover` get a failing first tool result so the student learns to read errors; `clarify`, `notes`, `newtool` teach asking, remembering and discovering tools.
- `pod/countskills.py`: counts every skill with one model load (run.sh uses it for the counts-only run and for `"keep": "cover"` rungs); `count.py` stays for the per-rung count after the heal.
- Build 14f (after the 06 Nov counts-v3 failure): a job named with no `:weight` now gets a share of 1 (the weight-0 jobs produced no ideas, so the set was empty); a lesson set that comes back too small is skipped and the run carries on, and only a too-small total ends the run. The 2,632 coding lessons from that attempt are reused through `extra_lessons`.
- Build 14h: `rent()` keeps asking for a card once a minute for `rent_minutes` (default 90); with a network volume, after `volume_wait_minutes` (default 20) of "no instances" it takes a card in any data centre without the volume unless `volume_fallback` is false (the teacher then downloads again).

## Build 14i (2026-11-06)
- `--send-plan` now sends the plan in the same shape as a fresh start: each rung's `keep_file` is reduced to its bare file name, which is how the keep list lives on the pod. Before this, a plan sent mid-run would have pointed the next cut at a PC path and failed.

## Build 14j (2026-11-07)
- run.sh: the `plan` helper now exposes the whole plan as `p`, so rung expressions such as `['rungs'][i].get('cover', p.get('cover', 0.95))` work. Before this, the coverage cut of a later rung called keep.py with an empty `--cover` and the run died (this ended rental 2 after Riker v3; Bill v3 was not made). New `plist` helper turns a list field into `a,b,c`; the `--strong` list was silently empty before, so the counts-only ladder and any on-pod coverage cut used 95% for every skill. Keep lists built on the PC with an explicit `--strong` are unaffected.
- plans/bill-v3.json: Bill v3 alone, cut from the teacher with a PC-built keep list (144 experts), full heal, caps in the plan.

## Build 15 (2026-11-07): keep the teacher's scores, kernels first, volume rules, step-up card
- The teacher pass (2.5 h on rental 2, lost with the card) is now kept twice. run.sh names the lesson set with a key (sha256 of the merged lessons.jsonl + toolsets.json + teacher + top + max_len + general_tokens, 16 hex chars) and writes `out/teacher/teacher-key.txt`, `teacher.pt`, `lessons-tok.pt` and `teacher-files.json`. (1) On the network volume under `teacher-cache/<key>/`: a later pod in that data centre finds it and skips the pass. (2) On the PC under `out/teacher/<key>/`: the watcher downloads the two files as soon as `teacher-files.json` appears (about 10-15 GB, while the first rung heals). On a later run the pod writes the key first and waits up to 10 min for `in/teacher-answer`; the PC answers `have` and uploads the two files (then `in/teacher-ready`, waited for up to `teacher_upload_minutes`, default 150) or `none`, and only then does the pod score the lessons itself. Any change to the lessons changes the key, so an old score file is never used for a new set.
- The fast kernels (flash-linear-attention + causal-conv1d) still build in the background during the teacher download, but the teacher pass and every heal now call `kernels_ready` and wait for them (up to 30 min), then print whether they are loaded. The built causal-conv1d wheel is kept on the volume under `wheels/<card name>/` and reused in seconds next time on the same card type. A failed build is reported and the run goes on without them (slower, not wrong). Whether they make the heal faster, and by how much, is unknown until a run has them: the log line "fast kernels ready" + the heal's tok/s will tell.
- Renting (the owner's rules): a card is only ever taken in a data centre that has one of our network volumes. `out/forge/volume.json` now holds a list (`volumes`, one per data centre; the old single-volume file still reads). Order each minute: our volumes' data centres first, then any other data centre with network storage where a wanted card is listed in stock, where a new volume is made (about $7 a month each) before the pod is asked for. After `volume_wait_minutes` with no card, the step-up card(s) (`plan.step_up`, default from the table in forge.mjs: H200 -> B200) are asked for too, same rules. The old "any data centre, no volume" fallback only happens with `"volume_fallback": true` in the plan, and then only after twice the wait. The yes prompt lists the volumes we have, the cards and the step-up card with `step_up_note`; the rented line says which card, which data centre, which volume and whether it was the step-up.
- plans/bill-v3.json: step_up B200, volume_fallback false, teacher_upload_minutes 150; caps unchanged (the step-up card costs more an hour and should finish sooner; the costs page carries the real number afterwards).
- Untested on a real pod (no rental until the owner says "run Bill"): the whole build. bash -n and node --check pass (the small Python pieces were run on their own).

## Build 16 (2026-11-08): one lesson file whichever way a set arrives, scores-only runs, everything kept on the drive
- The merge of extra lesson sets on the pod now tags each set with a hash of its content (not its upload slot) and merges the sets in tag order, and toolsets.json is written with sorted keys. The merged lessons.jsonl is therefore byte-identical whether a set was written on the card or came up from the PC, so the teacher-score key and the piece ids match across runs. Before this, the same lessons written on the card and later uploaded from the PC would have missed the cache.
- A plan with no rungs and no skills is a scores-only run: write the extra lessons, one teacher pass, done. forge.mjs ends such a run when the scores are on the PC. plans/lessons-and-odds.json is one; plans/bill-v3.json then heals Bill from those scores without a pass.
- Kept on the network volume as well as the PC: the whole merged lesson set and its parts (`lessons/<key>/`), every log and report of the run (`runs/<run>-<time>/`), beside the teacher scores (`teacher-cache/<key>/`) and the saved kernel wheels. The owner's rule: every input and output of a run is kept.
- `extra_lessons` entries may name a `.jsonl` file instead of a folder (the toolsets.json beside it is used), for sets whose chosen file is not `lessons.jsonl`.
- Untested on a pod, like build 15. bash -n and node --check pass; the merge was run on two folders with the same sets under different file names and gave the same bytes.

- **Brain cards.** `export.py` writes a `<file>.bob.json` beside every GGUF (what the brain is, where it was cut from, experts kept, jobs, size), with no paths or names in it. `bob-card.mjs` adds the home benchmark block afterwards. Bob's catalogue reads the card when the GGUF is added as an own brain and files it under its jobs.

## Build 17 (8 November 2026, untested on a card)

- **Train the teacher.** `plan.train_teacher` ({name, nickname, hours, experts, epochs}) trains the full teacher on every lesson by plain next-word training (heal.py with alpha 0 and no odds file) before anything else, keeps the result on the volume as `bobs/<name>/model` plus its adapter, exports its GGUF files and brain cards, and makes it the teacher for the odds and the cuts. The lesson-set key includes the trained teacher's adapter hash, so stock-teacher scores and trained-teacher scores never mix. A later plan names him with `teacher_model: "bobs/35Bob/model"`.
- **Hugging Face from the card, by the owner's rules.** `plan.publish` ({user, private, odds, models}). Every GGUF and card is kept on the volume (`bobs/<name>/gguf/`); `download_quants` names which quant files come down to the PC (the rest stay on the drive and the watcher skips them). `odds: true` uploads the teacher scores as a private dataset (`<user>/bob-odds/<key>/`). A Bob is uploaded only when the owner has tested him at home and listed his name in `models` (then the next run uploads him from the volume with a generated model card, private). The token is read from `forge/hf-token.txt` (one line, gitignored) or `HF_TOKEN` on the PC and sent to the pod as `in/hf-token`; it is never in a plan, a log or the repo. `export.py --pending` holds the file list back until the files are marked.

## Build 18 (8 November 2026, untested on a card)

- **Hand a token to a running pod.** `node forge.mjs --send-token <podId> --plan <plan>` puts `forge/hf-token.txt` on the pod after the fact; the pod reads it only when it uploads.
- **A cut-off lesson gets a second try.** The lesson writer used to drop a lesson whose turn ran past its word budget (about one idea in ten). Now it tries once more, with thinking off, or with twice the room if thinking was already off, and the set summary counts the skipped and the rescued. An idea that needs pages of thinking is still dropped after the second try, on purpose.
- **Benchmark on the card.** `plan.benchmark` ({models, commands, hours_each}). After the rungs the pod builds a CUDA llama-server (in the background during training, kept on the volume) and serves each listed brain in turn on port 8001 with the lab's canonical flags; the PC runs the plan's test commands against it (`{{url}}`, `{{name}}`, `{{out}}` are filled in) with the same scripts it uses at home, saves their output under `out/bench/<run>/<name>/` and tells the pod to move on. Home and rental numbers then come from identical tests; speed comes from llama-server's own timings. `common.mjs` honours `LAB_URL` (the scripts' `--url`), so any lab script that starts a server can run against a served brain instead.
- **A brain rebuilt from his recipe.** A benchmark model with `file: "rebuild"` is made again on the card from the stock teacher, his keep list and his adapter (`rebuild.py`: prune, attach the adapter, merge, save), then exported with the same quants; the keep list, adapter and scored cards may come from Hugging Face (`hf:<repo>:<path>`) or from the PC. A rebuilt Bob listed in `publish.models` goes to Hugging Face from the drive with his cards and model card, and nothing is downloaded again to the PC. This is how a Bob the owner has already tested at home is uploaded without pushing a 17 GB file up a home line.

## Build 19

A teacher that only writes lessons can be any GGUF model on Hugging Face (`plan.teacher_gguf: {repo, file, slots, ctx, extra}`): the pod builds its CUDA llama-server, downloads the file (a split file loads from its first part), serves it on port 8001, and the PC's lesson writer talks to it exactly as it talks to vLLM. `plan.lessons_only: true` ends the run once the lessons are on the PC: nothing is scored, cut or healed, and the run is held to its own caps. The lesson writer takes `--persona <file>` (a `persona` key on a `write_lessons` set), appended after Bob's own system prompt. Two Forge windows can run side by side: each run keeps its own pod record (`out/forge/pod-token-<run>.json`), the pod carries the run's name, and `--kill <podId>` deletes one pod instead of every Forge pod. A cold pod with no network volume gets a longer door wait (`plan.door_minutes`, default 25 without a volume) since it must pull its image before it can answer.

## Build 20 (11 November 2026, untested on a card): REAP scoring, off unless the plan asks

Every Bob so far was cut by counting how often the router picks each expert. REAP (Router-weighted Expert Activation Pruning, arXiv 2510.13999) also weighs how hard an expert pushes: the router's weight for it times the size of what it wrote.

- `plan.score`: `"counts"` (default, nothing changes), `"reap"` (the paper's score: that product averaged over the expert's picks) or `"mass"` (the same product summed, so how often and how hard both count).
- `pod/reap.py`: one scorer shared by `count.py` and `countskills.py`. With `--reap` (run.sh adds it when `score` is not `counts`) each count file also carries a `mass` table beside `layers`; the counts are unchanged. A count file made before this has no `mass`, and is counted again when a scored run needs it. The scorer runs each picked expert a second time to measure its output, about twice the expert work of the counting pass. If the model's expert weights are not laid out as one tensor per layer it says so once in the log, switches itself off and the counts carry on.
- `pod/keep.py --by counts|reap|mass`: what the keep list is built from. The report's kept shares stay shares of the routing counts whichever is chosen, so a REAP list and a counted list can be read side by side. `--by reap` ranks experts but does not size the cut, so the rung needs `keep_n`; `--by mass` works with the coverage rule's own size. The keep file records `by`.
- `pod/prune.py --by`: the same choice for a plain `keep: N` rung. run.sh only passes the score when that rung's counts file has a `mass` table (one counted on the PC does not) and otherwise cuts by counts.
- `keep.py` and `countskills.py`, which run.sh has called since build 14, are now in this folder; they were missing from the repository.
- Checked without a card: `keep.py` on made-up count files (each `--by`, the refusals), and the scorer against a brute-force sum on a tiny made-up model. The hook on the real model's expert module is untested until a run.

## Build 21 (11 November 2026, untested on a card): fold instead of drop

- A rung (or the plan) with `"fold": true` runs `pod/fold.py` straight after the cut and before the heal. It goes back to the uncut model for the experts the cut dropped and blends each into the kept expert most like it, in place in the cut model: the target is the kept expert with the most alike router row (cosine); the neurons are lined up first (greedy, the most alike pair first, on a sample of 128 in and 128 out weights each); then a weighted average, each expert weighing what it's used. A coverage rung weighs by its skill counts (every skill the same); any other rung by its counts file; with none, the kept expert weighs half. The router row is blended the same way.
- The same rule as the Lab's `src/lab-fold.js`, which folds a full-size GGUF at home for free. The Lab's goal **Fold instead of drop** and template **Merge experts** print a rung with `fold: true`.
- A cut that was folded is marked in its `config.json` (`bob.folded`). A restart reuses a finished cut only when that mark matches what the rung asks for, so a half-folded cut is made again.
- Needs the experts as one tensor per layer; otherwise it stops the rung and says so (it does not quietly fall back to a plain cut, since the plan asked for a fold).
- Checked without a card: `prune.py` then `fold.py` on a tiny made-up model (a shuffled copy folded back in leaves the expert as it was; use-weighted blend; router rows; other tensors and the number type untouched).
- Unknown until it is tried: whether a folded and healed brain beats a dropped and healed one. The first use should make one rung both ways and compare.

## FNRI on a rented card

The Lab's FNRI scan (Playground) can also be made on a rented card, for a brain too big for the home card. Nothing in the app rents a card for this yet; these are the pieces.

- `node model-lab/forge/aifeui-bundle.mjs --brain hf:<repo>:<file.gguf> --out <folder>` packs one folder: the questions (`aifeui-plan.json`), the card scripts (`pod/`), Brain Engine as patches (`engine-patches/`) and Bob's viewer (`viewer/`). It rents and uploads nothing.
- On the card, with that folder as `/workspace/in`: `bash /workspace/in/pod/aifeui.sh`.
  1. **Checks first.** The tools, the card, the disk, the plan, both engine patches, every viewer file, and that the brain and the engine source can be reached. One failed check stops the run before anything is downloaded or built (`out/aifeui/preflight.json`).
  2. Builds Brain Engine: llama.cpp at the pinned tag with the patches applied. A patch that doesn't apply stops the run.
  3. Loads the brain and proves the trace with one word.
  4. Asks the questions and writes `out/aifeui/recording.json`, the same file the Lab writes.
  5. Puts the viewer beside it (`out/aifeui/viewer`, `watch.html?file=recording.json`; `AIFEUI_SERVE=1` serves it on port 7778).
- At home: the viewer's **Open a recording file** plays `recording.json`.
