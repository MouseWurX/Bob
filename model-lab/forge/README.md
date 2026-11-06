# The Forge

Cuts Bobs out of Qwen3.6-35B-A3B on a rented GPU and heals them against the full model. The method, the plan and the
results so far are on [Bob's own models](../../docs/BOBS-OWN-MODELS.md). The Forge needs the model lab's step 0 outputs in
`model-lab/out` (lessons and expert counts) and a RunPod API key in the environment variable `RUNPOD_API_KEY`.
No key is stored in this repository or in any file the Forge writes; it is read from the environment at start.

## One session

    node forge.mjs --plan plans\24-18.json

1. Shows the caps and asks you to type **yes** (that is the purchase; nothing is rented before it).
2. Rents one H100 80GB (H200 / H100 PCIe / A100 if none is free), with a 350 GB disk, on RunPod Secure Cloud.
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

## Tested

prune.py and the runner were first tested against a fake model and a fake pod. heal.py, lora.py, teacher.py, count.py and
export.py were proven on real rentals (see the results on the models page). If a run fails, forge.mjs prints the last log lines,
deletes the pod, and the loss is the time spent.

## Build 12: lessons written on the card, cut like an earlier Bob
- `write_lessons` in the plan: the pod serves the full Qwen with vLLM (port 8001) before the teacher pass; the PC's `write-lessons.mjs` writes the lessons through it (`--url`, `--parallel`), uploads them as lessons-extra, and the pod merges them (ids prefixed "x") and carries on. `min` lessons or the run stops.
- `keep_file` on a rung: cut with that exact expert list (an earlier Bob's `*-keep.json`) instead of the counts.
- `gpus` in the plan: card list in order of preference (default list in forge.mjs).
- Plan `plans/riker-v2.json`: Riker v2 + Bill v2 on the H200 NVL, nothing trimmed (max_len 16384).

## Build 13: network volume, adapters
- `volume` in the plan `{gb, name}`: one RunPod network volume, made once (`out/forge/volume.json` remembers it) in a data centre that has the wanted card in stock (`node forge.mjs --places` shows them). It mounts at /workspace and keeps the teacher weights, general text, llama tools and every Bob's adapter (`/workspace/bobs/<name>/`). This run's big working files live on the pod's own disk (/forge) and go with the pod.
- Every healed Bob also writes `<name>-adapter.pt` (LoRA + router, small) next to its GGUFs; it is downloaded to the PC. Adapter + keep list = the healed full-size Bob, rebuilt from the teacher in minutes (rebuild script: to do).
- `keep_healed`: healed Bobs are not deleted at the end of a rung.
- `run`: a name for this session's files.
