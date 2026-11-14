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

**Names (the owner's rule, 10 November 2026).** A name belongs to one model. A job, skill, lesson set, step or persona never
carries a model's name, and a model is never named after a job: model names (Bob, Bobert, Riker, Bill, any NBob) and job or
skill names (coding, codefix, recover, clarify, review, ...) stay disjoint, in plans, keep lists, logs, cards, Help and Bob's own
lines ("the reviewer checks the answer", never "Bobert checks the answer"). A shared name leaves a log or a plan ambiguous
about which thing is meant. Outside lesson sets keep their source's name, which must not be a model name either.

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
- **Hugging Face from the card, by the owner's rules.** `plan.publish` ({user, private, odds, models}). Every GGUF and card is kept on the volume (`bobs/<name>/gguf/`); `download_quants` names which quant files come down to the PC (the rest stay on the drive and the watcher skips them). `odds: true` uploads the teacher scores as a private dataset (`<user>/bob-odds/<key>/`). Leave it off unless the run's lessons are scrubbed and every set in them may be shared: the scores carry the lessons themselves as token ids. A Bob is uploaded only when the owner has tested him at home and listed his name in `models` (then the next run uploads him from the volume with a generated model card, private). The token is read from `HF_TOKEN`, or `forge/hf-token.txt` (one line, gitignored), which the Forge locks on first read into `forge/hf-token.locked` (Windows DPAPI, this account only; gitignored), and sent to the pod as `in/hf-token`; it is never in a plan, a log or the repo. `export.py --pending` holds the file list back until the files are marked.

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

## fNRI on a rented card

The Lab's fNRI scan (Playground) can also be made on a rented card, for a brain too big for the home card. Nothing in the app rents a card for this yet; these are the pieces.

- `node model-lab/forge/aifeui-bundle.mjs --brain hf:<repo>:<file.gguf> --out <folder>` packs one folder: the questions (`aifeui-plan.json`), the card scripts (`pod/`), Brain Engine as patches (`engine-patches/`) and Bob's viewer (`viewer/`). It rents and uploads nothing.
- On the card, with that folder as `/workspace/in`: `bash /workspace/in/pod/aifeui.sh`.
  1. **Checks first.** The tools, the card, the disk, the plan, both engine patches, every viewer file, and that the brain and the engine source can be reached. One failed check stops the run before anything is downloaded or built (`out/aifeui/preflight.json`).
  2. Builds Brain Engine: llama.cpp at the pinned tag with the patches applied. A patch that doesn't apply stops the run.
  3. Loads the brain and proves the trace with one word.
  4. Asks the questions and writes `out/aifeui/recording.json`, the same file the Lab writes.
  5. Puts the viewer beside it (`out/aifeui/viewer`, `watch.html?file=recording.json`; `AIFEUI_SERVE=1` serves it on port 7778).
- At home: the viewer's **Open a recording file** plays `recording.json`.

## 10 November 2026: a lesson set from the drive

`plan.lessons_set "<key>"` takes the lesson set an earlier run kept on the drive (`lessons/<key>/`) in place of the PC's upload, so the teacher-score key is the same by construction and the scores under it are reused; the run stops before any pass if the plan's teacher, top, max_len or general budget would give another key. With it set the PC's extra sets are not sent. `plan.data_centers` pins where a card may be taken, `plan.volume_new: false` (and every `plan.rebuild` run) never makes a new drive, `plan.drive_delete` removes `bobs/<name>/gguf` folders once Hugging Face hosts them, and `node forge.mjs --drop-volume <id>` deletes a drive Forge made by mistake. A `rebuild.models[]` entry with `weights_only: true` and `source: "volume:<path>"` uploads a Bob's full-size weights from the drive and nothing else.

**A benchmark on its own.** `plan.benchmark_only: true` rents a card, serves the brains in `plan.benchmark.models` and lets the PC run the test commands, then ends: no teacher, no lessons, no odds, no drive. Each brain is given as `hf:<repo>:<path>` and is fetched with the PC's Hugging Face token (so a private page works); `rebuild`, `volume:` and `out:` are refused, since they need a teacher, a drive or a run. Because no drive is needed the card can be in any data centre, even while another run holds ours. The cost is the llama-server build (10-15 minutes) plus the tests; `plans/bench-bobert.json` is the example (two files of one Bob on the cheapest 48 GB card, cap $12).

**FNRI scans on a rebuild run.** `plan.scan` ({from, brains, stock, keep}) adds the Lab's brain scans to the end of a `plan.rebuild` run: the PC sends the folder `from` (one sub-folder per brain with the scan tool's `pod/aifeui.sh`, its plan, the engine patches and the viewer) as `in/scan.tgz`; the pod makes the stock brain's Q4_K_M from the teacher (`stock/<name>-Q4_K_M.gguf`, kept on the drive), runs each brain in turn (the first builds the traced engine on the drive, the rest reuse it; a failed brain is logged and the next runs), fetches each `keep` list beside its recording, and lists `out/fnri/` in `files.json`, which forge.mjs brings home to `out/fnri/<run>/` and, with `zip`, bundles into one zip at that path. `plans/publish-bill.json` is the example.

**The pod deletes itself at the end.** Bill's run (10 November) reached "done" while the PC's Forge window had died, and the pod billed two idle hours waiting for a delete that never came. Now every run type ends with `run_done`: the pod marks the status, waits for the PC's `in/pc-finished` (forge.mjs sends it before its own delete) or `plan.done_grace_minutes` (default 120, room for the downloads on a home line), then deletes itself. The time-cap watchdog stands behind both.

**Making the scan bundle.** `fnri-bundle/` is made fresh before a scan run and is not kept in the repo (an old copy would
carry old engine patches and an old viewer). From `app/`:

    node model-lab/forge/aifeui-bundle.mjs --brain /workspace/stock/Qwen3.6-35B-A3B-Q4_K_M.gguf --name "Qwen 3.6 35B-A3B" --per 6 --out model-lab/forge/fnri-bundle/qwen
    node model-lab/forge/aifeui-bundle.mjs --brain hf:MouseWurX/28Bob-Riker:28Bob-Q4_K_M.gguf --name Riker --per 6 --out model-lab/forge/fnri-bundle/riker
    node model-lab/forge/aifeui-bundle.mjs --brain /workspace/bobs/35Bob/gguf/35Bob-Q4_K_M.gguf --name Bobert --per 6 --out model-lab/forge/fnri-bundle/bobert
    node model-lab/forge/aifeui-bundle.mjs --brain /workspace/bobs/20Bob/gguf/20Bob-Q4_K_M.gguf --name Bill --per 6 --out model-lab/forge/fnri-bundle/bill

## Build 22 (13 November 2026, dry-run only, untested on a card): more ways to teach, each off unless the plan asks

The owner asked whether we should train in other ways at the same time. Four new ways, each measured on the held-out chats before it replaces anything. `pod/selftest_training.py` runs all of them on a made-up tiny Qwen3.5-MoE on the CPU (about a minute, nothing downloaded): run it on a new pod image before the first real use.

| Plan key | What it does | Where |
| --- | --- | --- |
| `"pref": "out/pref-bob"` + `"heal": {"pref": {"kind": "orpo", "beta": 0.1, "every": 4, "hours": 0.5}}` | Right-vs-wrong answers. `orpo` mixes one pair into the heal every `every` lessons (no second model); `dpo` and `kto` are a `hours` pass after the heal with the healed Bob frozen as the reference. Held-out pairs are measured before and after (`pref_before`, `pref_after` in heal-report.json). | `pod/pref.py`, folder from `model-lab/make-pairs.mjs` |
| `"heal": {"onpolicy": {"frac": 0.2, "new": 256, "temp": 1.0}}` | For `frac` of the lesson steps the student writes its own answer (up to `new` words) and the teacher, loaded beside it, scores every word (KL over the teacher's top 32). Needs room for the teacher on the card: suits rungs of 20 GB and under on an H200. | `pod/onpolicy.py` |
| `"grpo": {"hours": 1.5, "steps": 200, "group": 6, "chats": 4, "kl": 0.02, "lr": 5e-6, "rungs": ["Luke"]}` | After a rung's heal: each lesson's first turn answered `group` times, graded by `pod/tool_reward.py` (the same rule as tool-score: right 1, wrong arguments 0.3, a tool on a plain chat -0.5), a LoRA nudged toward the above-average answers. Kept only if the held-out grade is no worse. Leave out `rungs` for every rung. | `pod/grpo.py` |
| `"merge": [{"name": "35Bob-facts1-m70", "base": "teacher", "tuned": "bobs/35Bob-facts1/model", "weight": 0.7, "method": "linear"}]` | Before the rungs: a trained Bob blended back toward its base on the CPU (`linear`, `ties`, `dare`, `dare_ties`; `density` for the last three), then GGUF files to test at home. A cut is blended expert by expert through its bob-keep.json. | `pod/merge.py` |

Making the pairs on the PC (CPU only, no card):

```
node model-lab/make-pairs.mjs --lessons out/lessons --datasets <make-datasets folder> --out out/pref-bob
```

It pairs a kept and a rejected lesson for the same idea, turns the benchmark's `pairs-right-vs-wrong.jsonl` into pairs, and every marked answer (kept / rejected / full set's `ok`) into `kto.jsonl`. Unsure answers (needs-review) are left out, style lessons never go into Bob's pairs, and tool-score's held-out chats are marked `holdout` so the heal measures on them and never learns from them. `pod/tool_reward_cases.json` holds cases the Python judge and `tool-judge.mjs` must agree on (the Lab's test checks the JS side, the self-test the Python side).

### Any target, as separate steps, several at once (the owner, 13 Nov)

The same steps serve any target: facts, skills, tools, bias, refusals, ways of thinking. Each step runs on its own, so a run can do one or several.

1. **Make data** (PC or a lessons rental): lessons with the teacher's odds, plus the wrong answers kept as pairs (`make-pairs.mjs`). Bob sets, style sets and distillation sets stay apart.
2. **Train** a full model: `train_teacher`, from the stock Qwen or `"from": "bobs/<name>/model"` (a Bob trained on an earlier target, or a blend). Add `"pref"` and `"grpo"` inside `train_teacher` for pairs and the reward pass on the full model.
3. **Cut and heal** if a smaller Bob is wanted (`rungs`, with `heal.pref`, `heal.onpolicy`, `grpo`).
4. **Blend** (`merge`): kept on the drive as `bobs/<name>/model`. If it tests worse at home, a later run gives it a short re-train with `train_teacher.from`.

`"targets": {"facts": {"jobs": ["straight-facts", "knowledge"], "weight": 2}, "tools": {"jobs": ["precise", "missed", "twins", "restraint"], "weight": 1}}` trains several at once: each target's lessons come up `weight` times per pass, and every report (heal and reward pass) is split by target. A reward pass is kept only if no target's grade dropped (`no_target_worse`), and the heal report says the same for held-out loss. At home, tool-score and the quiz are read per job too, before anything replaces today's Bob.

`merge.py --only <file>` ({"layers": {"12": [3, 7]}, "rest": "base"}) puts a trained change (a task vector) on chosen experts only, with their router rows, and `--weight` up to 2 pushes it further than training did. It goes with the per-target expert traces: find the experts a target leans on, then change only those.

### Probe and dial (13 Nov): find what helps or hinders each target, then make it permanent

- `model-lab/expert-sweep.mjs --url <Brain Engine> --lessons out/lessons --targets targets.json --used "-4,-2,+2,+4,+10" --layer-scale "0.5,0.8,1.2,1.5"` runs on the PC against the engine's live switches (experts per word 0013, dials 0003, expert mask 0001). It scores each target's held-out chats per trial, flags trials that help one target and hurt another, and puts the engine back at the end. `--trials` and `--dials-file` take hand-written trials, for example the experts a trace says a target leans on.
- `pod/surgery.py --model <dir> --edits edits.json --out <dir>` bakes a change that tested well into the weights, CPU only: one neuron (its column in the expert's down projection), a whole expert, the shared expert's neurons, or one attention head (full-attention layers only).
- `model-lab/make-checks.mjs` exports the taught Straight facts written questions (want / slanted-line patterns) for `grpo.py --checks`. Packs with "new" in their name are fair tests and are never exported or learned from.

### A new version of the lessons (13 Nov)

`model-lab/clean-lessons.mjs --from <lesson sets> --out <new folder> --review model-lab/reviews/lessons-v4.json` writes a new version and only reads the old one. It drops lessons that call a tool their own tool list does not offer and repeated first prompts in the same thinking mode (the held-out copy is kept). It moves the lessons the hand review marks wrong to `rejected.jsonl` (the wrong side for `make-pairs.mjs`). It moves other models' answers (`--distill`, default `kimi`) to `distill/`. It also writes `targets-train.json` (chat, languages and formats at weight 0.5) and `targets-heal.json` (all at 1). v3 → v4: 9,059 → 8,992 lessons, 26 made-up tool calls, 33 repeats, 8 to the wrong side, Kimi traces to distill (5 held-out lessons with a bad call are kept and listed, so the test stays the same). Copies of the same lesson (a mix's repeats) are kept; `--files` and `--sets` pick files and sets, and each file keeps its own name.

## Build 23 (14 November 2026, CPU self-test only, untested on a card): GPT-OSS in the Forge

The owner asked for the GPT-OSS 120B → 38B REAP cut's adapter; there was none, because the Forge only knew Qwen. Now the same pod scripts take GPT-OSS (OpenAI's 20B and 120B and cuts of them). Nothing changes for a Qwen run.

| Step | GPT-OSS | Where |
| --- | --- | --- |
| Which family | `config.json` `model_type: gpt_oss` → GPT-OSS; anything else stays Qwen | `pod/family.py` |
| Teacher download | a non-Qwen teacher gets its own folder (`teachers/openai_gpt-oss-120b`), never mixed with the Qwen in `teacher/`; OpenAI's `original/` and `metal/` copies are skipped (about 65 GB) | `pod/run.sh` |
| Lessons | rendered with the brain's own harmony template: parallel tool calls become call, answer, call, answer; thinking before a tool call in the last turn is kept (the stock template drops it); a lesson with no thinking asks for `Reasoning: low`. Answer tokens = everything after `<|start|>assistant` up to `<|end|>`, `<|call|>` or `<|return|>` | `pod/data.py` |
| Teacher odds | the 120B in MXFP4 on the card (about 65 GB) when triton + `kernels` run it (Hopper or newer); otherwise unpacked to BF16 over card and RAM (slow, said in the log) | `pod/family.py`, `pod/teacher.py` |
| Cut | by keep list, `{"layers": …}` or the Lab's `{"keep": …}` (keep-32-v2.json); MXFP4 blocks and scales, biases and router rows are sliced byte for byte | `pod/prune.py` |
| Heal | the cut is unpacked to BF16 (MXFP4 can't be trained; the 38B is about 76 GB, so an H200). LoRA on attention, LoRA per expert in GPT-OSS's own layout (biases, interleaved gate/up, clamped SwiGLU), trainable router with its bias; grouped matmul when the rank is a multiple of 8 | `pod/lora.py`, `pod/heal.py` |
| Count, rebuild | the router is `mlp.router`; REAP's mass switches itself off (counts only) | `pod/reap.py`, `pod/count.py`, `pod/rebuild.py` |
| Export | saved as plain BF16 (the MXFP4 note leaves config.json), converted without `--no-mtp` (b12282 stops on it for GPT-OSS), quantized as the plan says (`MXFP4_MOE` for the 38B); brain card: cut from gpt-oss-120b by OpenAI, sizes from the config | `pod/export.py` |
| Not yet | `grpo` (the tool judge reads Qwen calls only), `fold`, `surgery`, `merge`: each refuses or is skipped for GPT-OSS and the run carries on | |

Two fixes that help Qwen too: a recompute under gradient checkpointing stops early by raising inside the forward, and the expert code used to catch that as a "grouped matmul failure" and switch to the slow loop mid-step (now re-raised); and a GPT-OSS run no longer builds or waits for Qwen's linear-attention kernels.

`pod/selftest_gptoss.py` runs all of it on a made-up tiny GPT-OSS on the CPU with Bob's own `src/templates/gpt-oss.jinja` (a minute or two, nothing downloaded): run it on a new pod image before the first real use, beside `selftest_training.py`.

The 38B heal plan is `plans/heal-gptoss-38b.json`: H200, the 120B scores the lessons plus 10M words of general text, the 38B is cut with keep-32-v2.json, healed with a LoRA (6 h cap), exported as MXFP4_MOE, nothing uploaded; caps 13 h / $55. It is not approved: it needs the owner's typed go. First minutes on the card: the log must say `GPT-OSS teacher: MXFP4 on this card` and the teacher pass must move; if not, stop and report.

## The surgery data rule (13 November 2026)

The owner: "while doing the surgery, we may want to be careful with results we keep, at least for training data".

1. Everything made under surgery (dials, keep lists, masks, a direction, a changed expert count) carries its exact
   condition (`"condition"` on each row) and is kept apart. It's fine for analysis and benchmarks, never training data.
2. Only stock answers feed lessons and the teacher's odds.
3. Evil-check and fiction-check answers are evidence only: never training data, not even as the wrong side of a pair.
4. Rejected lessons are for preference pairs only, never for job or expert maps.
5. No style expert maps from sets where the style wasn't really applied. A style folder whose style score is near 0% is
   marked STYLE-NOT-APPLIED; prefilling the style line fixes the next run.
6. Every cut or dial is a new version, kept only if it passes the held-out checks (tool score, quiz, evil check,
   fiction check).

`notForTraining(row)` in `common.mjs` holds rules 1 to 3. `make-pairs.mjs` leaves such rows out of both sides, and
`clean-lessons.mjs` drops them from a new version (a held-out one is kept and flagged). The expert sweep and the
targets files read `lessons.jsonl` only, never `rejected.jsonl` (rule 4).

`tool-score.mjs` and `experts-test.mjs` write `"condition"` on every saved answer themselves: `"stock"`, or what was
changed (experts per word away from the brain's own, a direction or kv override in `--extra`, and `--condition` for what
the script can't see, like a cut brain or live dials). `--evidence` marks evil- and fiction-check runs. A brain served
elsewhere (`--url`) without `--condition` is left unmarked, never called stock. For answers saved before this,
`stamp-condition.mjs --dir <folder> --condition <what> [--evidence]` stamps every row that doesn't say yet.
## GPT-OSS lessons v5 with odds, style sets and expert maps (13 Nov, untested on a card)

Plan `plans/gptoss-lessons-v5.json` (benchmark-only, one H200, caps 6 h / $32; nothing rents without the owner's yes):
- **Writer:** GPT-OSS 120B writes a Bob distillation set (3,000) and four style sets (400 each). Each style set is its own set for its own model: the saved lessons keep Bob's plain prompt, the style text goes only to the writer, and there's no tag. Every lesson is reviewed. `write-lessons.mjs --odds K` saves the writer's own top-K odds per word in `odds.jsonl` beside the lessons, one row per kept lesson. `--effort` sets GPT-OSS's thinking depth, and `--sampling 1,1,0` uses its published sampling.
- **Readers:** `trace-read.mjs` has a Brain Engine server READ the new lessons with the expert trace on (one word out, cache off, never the held-out 5%). Thinking is included, since that's where a style lives. It writes `counts.json` ({target: {layer: {expert: picks}}}), `lift.json` (the experts each job or style leans on more or less than the rest) and `dials.json` (trials for `expert-sweep.mjs --dials-file`). The 120B, its 38B cut and Riker each read the same lessons, because a map is only valid for the brain it was measured on.
- **Carry-over:** `trace-carryover.mjs` maps the 120B's leaning experts onto the 38B through its keep list. Only experts the 38B's own trace confirms go into `dials-confirmed.json`.
- After the run: `clean-lessons.mjs --distill ""` into a new folder, then scrub. Hugging Face only on the owner's word. GPT-OSS odds only fit GPT-OSS-family students (the 38B). Qwen odds for these lessons need a scoring pass, which llama-server can't do.
- Check on the PC before renting: that the odds cover the thinking words (compare `odds` length with the answer's tokens), that the trace rows grow when thinking is included, and the Windows quoting of `{{out}}/../`.

### Lesson writing: teacher routing, tool notes, fix after review (13 Nov, from the v5 keep rates)

GPT-OSS 120B kept few lessons on the tool-heavy jobs (reminders 3/23, research 2/12, office 3/16, newtool 5/21, plans 5/19, schedules 2/7, knowledge 9/29), and the rejects were real tool mistakes. It did well on clarify (15/15), memory (8/8) and maths (10/13). So `write-lessons.mjs` now has:
- `--route general|tools` with the full `--jobs` list keeps only that teacher's share. The tool list defaults to the seven jobs above; `--tool-jobs a,b` overrides it. A plan runs the same command under each teacher, each into its own `--dir`, for example `--route general --teacher gpt-oss-120b --dir bob-gptoss` on the GPT-OSS brain and `--route tools --teacher qwen36 --dir bob-qwen` on the Qwen brain. Each set keeps its own teacher's odds.
- `--teacher <name> --kind bob|style|distill` is stamped on every lesson, reject and odds row. A folder holds one teacher and one kind (`set-info.json`); a run with another teacher or kind into it is refused.
- `--tool-effort high` (GPT-OSS): the routed tool jobs always think, at that effort. `--tool-note` shows the writer a short note on how Bob's tools work for those jobs. It is teacher-only: never in the saved lesson, its set key or Bob's start prompt.
- Style prefill (GPT-OSS ignores a style prompt in its thinking; a prefill works): `--think-prefix "<text>"`, or a `prefix:` line in the style file, is sent as a trailing assistant message with that `reasoning_content` on thinking turns. The saved thinking is the prefix plus what the writer added. The odds row carries `given: <prefix>`: those words are given, not scored, and the odds start after them. The style file can also carry `markers:` (style score = share of the markers in the thinking, saved as `style_score`; `--style-min 0.5` rejects below that) and `leak:` (a final answer whose first lines start with these is rejected, or stripped with `--leak-mode strip`). A prefill the server sends back at the start of the thinking (llama-server does) is not added twice; the odds row says `given_echoed`. A `\n` in a prefix is a line break, so a prefix can carry the style's whole first step. `prefix-later:` (or `--prefix-later`) sets the prefix for thinking turns after a tool result. `--teacher-prompt short` gives the writer a few lines in place of Bob's system prompt (tools still offered); the saved lesson keeps Bob's real prompt. GPT-OSS 120B held no style under Bob's full prompt and tools in live tests on 13 Nov (score 0 to 0.05 with any prefix or placement), so style sets need this or another teacher, and never low effort (Raider thought only 25 to 49 words). Every lesson, reject and odds row lists `teacher_context` (short-prompt, style-note, style-system, tool-note, act-nudge, review-fix, prefill): what the writer saw that the saved lesson does not hold. `--style-position user` sends the style text as a short teacher-only note just before the person's message instead of at the end of the system prompt (with Bob's full prompt and tools the style slid back by line 2). These lines never reach the writer. Sherlock v2 and Vulcan v2 carry them, plus a firmer "the final answer has no ... lines" sentence.
- After a failed review, the lesson is tried once more with the reviewer's reason shown to the writer (teacher-only). The fix is saved with `retry: "review"`. The reject stays in `rejected.jsonl` under the same idea, so `make-pairs.mjs` turns them into a right-vs-wrong pair. `--no-fix` turns this off.

### Riker's weights calibration and evil check (13 Nov)

**Rented-card fixes (13 Nov).**
- Chat calls to a rented server stream, so RunPod's proxy no longer cuts long answers at 100 s (error 524). `LAB_STREAM=0` turns this off.
- A call with tools and odds together goes unstreamed: llama-server (b12282 and newer) refuses logprobs with tools + stream. Any other 400 about streaming is tried once more unstreamed. Skipped ideas are written again on the next resume.
- Caps: the watcher reads `hours_max`/`dollars_max` from its plan file every minute. The pod's own self-delete reads them from its `in/plan.json` every minute, so `forge.mjs --send-plan <pod> --plan <file>` moves it without a restart. Pods started from this build on; an older pod keeps the cap it started with until a `--restart`.
- Both caps count from the rent, also after a `--restart` with another plan, so a second run on the same pod carries the total caps. `--restart` with another run name finds the pod's record by its id.
- `--skip-cmds name:index` leaves one benchmark command to a run by hand.
- Direct ports (`"direct": true`): the pod's door and brain are rented as plain TCP on its public address (8000/tcp, 8001/tcp), so no proxy sits between: no 524 at all. The PC reads ip:port from the pod's record, uses it when `/health` answers, else the proxy. `forge.mjs --urls <pod> --plan <file>` prints the brain's direct address for a hand-run writer's `LAB_URL`. `--restart` on a pod rented without these ports first resets it with them (RunPod restarts the container; the drive keeps the built engine and the downloads; the caps still count from the rent via `rented_at`). Plain http: the tokens still guard both, but the traffic is not encrypted.
- `LAB_TOOL_ODDS=stream`: tool turns with odds stream too, asking for the odds with llama.cpp's `n_probs`. Words that don't change the shown answer may come without odds; each odds turn then carries `gaps` (0 = complete).

**On the v5 pod (Riker's step, after his trace-read).** That pod's Brain Engine (787c2b8) has no live experts-per-word switch, so everything runs at his own 8. `--send-plan` can't add brains to a running benchmark (run.sh counts them once), and the PC's watcher keeps the plan in memory, so the new commands need the watcher restarted: after "gpt-oss-38b done" and before "riker ready", `forge.mjs --resume <pod> --plan <plan> --skip-bench gpt-oss-120b,gpt-oss-38b`.
- `calib-prep.mjs` (PC only): at least 45 judged questions per job, every held-out lesson there is, then a reserved slice of the new bob set (`--reserve-from bob`, lowest id hash first). The reserved ids go in `calib/calib-ids.json`, and `clean-lessons.mjs --exclude-ids` keeps them out of training. It also writes imatrix texts per job.
- `trace-read.mjs --mass --keep 0.75,0.5`: per-job and per-style REAP mass (patch 0009) and keep lists over the PC's lesson sets plus the new ones. Folders that share a name pool their jobs.
- `tool-score.mjs` and the quiz at 8, then again with the keep-75 mask (`set-live.mjs`, live, patch 0001).
- `job-presets.mjs`: per job, the brain as built, its keep 75/50 lists, then its leaning experts dialled to 0.8 and 1.2 (patch 0003). It uses the first turn of each judged lesson, with tool calls only parsed, and thinking off. A setting is picked only when its paired gap over as-built beats the 95% range. It writes `riker-calibration/<job>.json` (keep list, N, dials, score ± range, tok/s), `presets.json` and `PRESETS.md`. With `--student` it also saves his own answers + top-8 odds on 1,000 of the new lessons. Every answer is kept with top-8 odds, and make-datasets sorts them.
- `evil-check.mjs` last (measure only). The same 100 asks are read with a cruel persona and with Bob's plain prompt (`forge/pod/evil-pairs.json`); only the ask's own words count. The experts and heads that fire much more under the cruel persona are the candidates. 30 dark-but-allowed asks (villains, dark fiction, security explained) sort them into "evil intent" and "dark topic". Then 100 held-out answers are scored by routing. The intent parts are turned down live with dials, and the cruel-persona answers, 5 harmful asks (declined or not; answers never kept), the dark asks, facts and 40 tool turns run again. The brain rates its cruel-persona answers 0-10 with the dials off. `EVIL-CHECK.md` is written on the PC as soon as it's done.
- **No hands** (`no_hands: true`): the evil runs offer no tools, tool calls are only parsed, and `--no-run` skips the quiz's code questions (grading them runs the code). Nothing any brain writes is run.

**Then, on the same pod: `plans/riker-calib.json`.** When v5 reaches done (the pod waits up to 2 h for the PC), the PC stops its watcher and runs `forge.mjs --restart <pod> --plan plans/riker-calib.json`. This sends the new pod scripts, the plan and the imatrix texts, and Brain Engine 7b12282 is rebuilt (~15 min) with llama-cvector-generator and llama-imatrix built after the server, so a failure there never blocks it. Then: Riker's cvector cruel-vs-kind direction (`evil_check: true`: all pairs and each half, so every layer shows how steady the direction is; `evil-check.mjs --direction-only`, since his full check ran in v5), and stock Qwen3.6's full evil check, compared with Riker's answers and direction. After that comes Riker's `llama-imatrix`, overall and per job (`imatrix: true`, from v5's `calib/imatrix`), before he is served. Then the live sweep at 3, 4, 6 and 12 experts per word (8 ran in v5), keep-75 at 3 and the best N of both runs, and job-presets' per-job N passes. A per-answer projection onto the direction needs a hidden-state readout the engine doesn't have. Neuron names need a neuron trace for brains with experts. So the report gives experts and heads.

**Next lesson runs:** `smoke-gate.mjs` checks a few lessons before a big write: do the odds cover the thinking, do the tool calls parse, does the trace work? If not, it exits 86 and the Forge deletes the pod. `write-lessons` now marks every turn's odds `think+answer`, `answer-only` or `answer`, and `--split calib` marks a calibration set.

## Card types that freeze at start-up (14 Nov 2026)

The owner: "if its always the same card type freezing up change to a different card type". Every rent's start-up goes in
`out/forge/startup-log.jsonl` (card type, data centre, started or froze). When a pod this run rented never answers its door,
`forge.mjs` deletes it and rents again with that card type left out, up to `plan.startup_retries` times (default 2, at most
5). It's the same rental: no second yes, the same caps, counted from the first rent. A run on an existing pod (`--resume`,
`--restart`) never re-rents. A type with 2 freezes in 7 days and no good start since goes to the back of the list
(`card-health.mjs`).
