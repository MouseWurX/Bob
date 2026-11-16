# Chapter 3. Building the instruments

## 3.1 Introduction and research question

A claim about training data is only as good as the tools that change a model and the tools that measure it. The studies in this dissertation ask how many faults a lesson set holds, whether those faults become habits in a trained model, and where such a habit sits inside the network (chapter 1). Each question needs a machine that can do something stock software does not. The project built three layers of its own, and this chapter describes them.

The layers are Brain Engine (a patched llama.cpp that can change and watch a mixture-of-experts model while it runs), the Forge (which cuts and teaches models on rented cards under hard caps on hours and dollars) and the Lab scripts (which write lessons, grade answers, sort and clean data).

This chapter asks what each instrument had to do, how it is built, and how far its output can be trusted. Chapter 4 sets the rules for using them.

Three points about status should be clear from the start. First, most checks described here were done on small stand-ins, not on a real large model. Second, several Forge builds were written and checked only by dry run, and the README says so. Third, the never-taught gate (section 3.6.7) shipped in release 1.5.238 on 15 November.

## 3.2 Related systems

### 3.2.1 Serving and running models

llama.cpp is an open-source C and C++ project for running language models locally on CPUs and on NVIDIA, AMD, Intel and Apple hardware. It supports integer quantization from 1.5 to 8 bits and is released under the MIT licence (llama.cpp project page, ggml-org). Brain Engine is built on it. vLLM is a different kind of server, built for high-throughput serving on data-centre cards. Its PagedAttention method stores the attention cache in pages in the way an operating system manages memory (Kwon et al., 2023). The Forge uses it to write lessons on a rented card, where many requests run in parallel.

Neither project was built to change a mixture-of-experts model live. In such a model a learned router sends each word to a few of many expert sub-networks (Shazeer et al., 2017). Mixtral sends each word to two of eight (Jiang et al., 2024), and Qwen3 and gpt-oss use the same family of designs (Yang et al., 2025; OpenAI, 2025). Brain Engine exists because the studies needed to switch experts off, count which fire, and scale them without reloading a 20 GB file.

### 3.2.2 Training and adaptation pipelines

The usual open route to fine-tune a large model is the Hugging Face stack. PEFT trains a small number of extra parameters (PEFT project page), and TRL offers trainers for supervised fine-tuning, DPO, KTO and GRPO (TRL project page). Each implements a published method: LoRA (Hu et al., 2021), DPO (Rafailov et al., 2023), KTO (Ethayarajh et al., 2024) and GRPO (Shao et al., 2024). ORPO folds a preference penalty into ordinary fine-tuning with no second model (Hong et al., 2024).

The Forge does not replace these libraries. It reuses the same published ideas on top of the Transformers library. What it adds is the work a one-person project cannot do by hand: renting a card, moving data, keeping costs under a cap, caching expensive scores, and deleting the card at the end.

### 3.2.3 Cutting and distilling

The Forge removes experts and then teaches the smaller model to match the original. Minitron showed that pruning a large model and retraining it with distillation on a small share of the data can be much cheaper than training each size from scratch (Muralidharan et al., 2024). Classic distillation trains a small model on the soft odds of a large one (Hinton et al., 2015). REAP, the scoring the Forge uses, ranks experts by router gate value and activation norm and argues that pruning beats merging for generative tasks (Lasby et al., 2025). The merge script also offers the linear blend, TIES (Yadav et al., 2023) and DARE (Yu et al., 2023), all off unless a plan asks. This chapter reports no merge results. Representation engineering steers groups of neurons, not single units (Zou et al., 2023); the dials and live control vector serve similar work, reported in chapter 10.

## 3.3 Architecture of the three layers

The layers are used in a fixed order for a new lesson set. The table lists the steps from an idea to a scored model. The step numbers are used in the rest of the chapter.

| Step | Where | What happens |
|---|---|---|
| 1. Idea | PC | A list of lesson ideas, each with a job (`write-lessons.mjs`). |
| 2. Pre-flight | PC | Ideas counted, finished ones skipped, room per slot checked (`forge.mjs`). |
| 3. Sample gate | Card | The first 10 ideas are written; too few saved stops the run with code 86. |
| 4. Write | Card or PC | The teacher writes each lesson from Bob's real prompt and tool list, a second model reviews it, a cut-off lesson gets one retry. |
| 5. Clean | PC | A new version is made; the old one is only read (`clean-lessons.mjs`). |
| 6. Never-taught gate | PC | Every user turn is checked against the test items (`never-gate.mjs`, PR #257, shipped in 1.5.238). |
| 7. Render and split | Card | Token ids with an answer mask; 5% held out by id hash (`pod/data.py`). |
| 8. Teacher pass | Card | Top-32 odds at every answer position, cached under a key (`pod/teacher.py`). |
| 9. Cut | Card | Experts removed by keep list (`prune.py`, `keep.py`, `reap.py`). |
| 10. Heal | Card | LoRA trained against the teacher odds and the real next word (`heal.py`). |
| 11. Export | Card | GGUF files and a brain card (`export.py`). |
| 12. Score | PC or card | Tool score, quiz, coding race, needle test, routing race (`tool-score.mjs` and others). |
| 13. Delete | Card | The card deletes itself when the PC has the files, or at the cap. |

Figure 3.1 is the same flow as a simple diagram. Brain Engine is used in steps 3, 4 and 12 and in the surgery studies. The Forge covers steps 2 to 13. The Lab scripts cover steps 1, 5, 6 and 12.

```
 idea list --> pre-flight --> sample gate --> write + review --> clean
                                                                   |
 score <-- export <-- heal <-- cut <-- teacher odds <-- render <-- never-taught gate
   |
 Brain Engine (live masks, dials, traces) serves the model while it is scored
```

*Figure 3.1. A lesson from idea to scored model.*

Two rules run through all three layers: nothing is rented without typed approval, under an hours cap and a dollars cap, and every new function is off unless the plan asks (model-lab/forge/README.md).

## 3.4 Brain Engine: a patched llama.cpp

### 3.4.1 What it is and why it exists

Brain Engine is llama.cpp at a pinned tag with fourteen patches applied in order (engine/README.md, ENGINE-MAP.md). At the time of writing the build is Brain Engine 8, on llama.cpp b12359. It is not an official llama.cpp build. The patches change only the model library and the server, with one exception: six patches touch the card-sharing backend of ggml, and no CUDA, Vulkan, Metal or CPU code is changed (ENGINE-MAP.md).

The patches fall into four groups: change a model live (0001, 0003, 0013), watch which parts fire (0002, 0007, 0009, 0010), share a card across machines (0004, 0005, 0006, 0008, 0011, 0014), and one small helper (0012). Only the first two matter for the studies.

### 3.4.2 Patches that change the model live

**0001, expert mask.** A new adapter, `llama_adapter_emask`, sits next to the control-vector adapter and holds one keep-row per layer. In the expert-layer builder, a very large negative number is added to the router logits of every switched-off expert before the top-k pick, so they are never chosen (ENGINE-MAP.md). The server exposes `GET` and `POST /expert-mask`, and refuses a mask narrower than the number of experts each word uses. It was needed to test a keep list without cutting a file. Placing the mask before the pick matters: a mask after the pick would silently change the weights.

**0003, dials.** A dial multiplies what one part adds to the stream, which is the same as scaling that part's output weights. The part can be one expert, one attention head, or a layer's attention or feed-forward block. A scale of 1 is as built, 0 is silent, and the maximum is 8. Switching off is a blunt test, and the evil-check and sweep scripts also turn parts up (chapter 10). A known risk is that a change to the head layout upstream would make the dial scale the wrong slice without failing loudly (ENGINE-MAP.md).

**0013, experts per word.** The model's own count (8 for Qwen3, 4 for gpt-oss) can be replaced live, per layer. The graph is rebuilt and the scheduler's memory laid out again before the call returns. A count that does not fit is refused and the old count restored. It was needed for the experts-per-word test, which compares 8, 6, 4, 3 and 2 on one file (docs/forge-runs/benchmarks/experts-per-word-full-qwen-2026-11-04.md). Without it, each setting is a separate load.

### 3.4.3 Patches that watch the model

**0002, expert trace.** A request with `expert_trace: true` returns the experts picked in every layer for every token. For a model without experts it reports the eight busiest of 256 neuron groups per layer instead (engine/README.md). The per-job and per-style maps of which experts a skill leans on come from this trace (model-lab/trace-read.mjs). One limit: the trace is dropped for every request when two share a batch, so the reading script runs one request at a time (model-lab/trace-read.mjs).

**0007, trace stream.** Each streamed piece of a reply carries the trace rows since the last piece, at most 64 per piece, so cost stays flat as the prompt grows. On a test build it was no slower than the trace alone at 32,000 and 128,000 tokens of prompt (engine/README.md).

**0009, expert mass.** With `expert_trace_mass`, the trace also reports, for every layer and expert, the sum of the router weight times the size of what the expert wrote. This is the numerator of the REAP score (Lasby et al., 2025). It lets a home scan produce the same numbers the Forge's `reap.py` produces on a rented card.

**0010, trace once.** With 0002 alone, a traced request stopped after every layer to copy the picks out, 40 to 48 stops a word. On a consumer card this cost about a fifth of word speed: 122.7 words a second fell to 99.2 (engine/README.md). The patch keeps each layer's picks on the card and fetches them together with one wait. The trace returned is the same, row for row.

### 3.4.4 Card sharing and the small helper

Patches 0004, 0005, 0006, 0008, 0011 and 0014 let one model spread over the cards of several computers. Patch 0004 offers a hash for every weight over 1 MiB, so a lent card that already has a weight skips the copy. Patch 0005 is SCUT, an experimental UDP link. Over a simulated Wi-Fi of 3 ms delay and 1% loss it raised speed from about 9 to about 15 words a second, with byte-identical output (engine/README.md). Patches 0006, 0008, 0011 and 0014 add signed packets, a link log, one trip a word and a frozen wire numbering. None is used in the studies. A numbering clash should be noted: the Forge's pod patch `0014-live-control-vector` adds a live steering vector, and only the neuron sweep uses it (section 3.6.6).

### 3.4.5 How Brain Engine was verified

The checks differ in strength, and the list is ordered from strongest to weakest.

- **Byte-identical output.** With no expert switched off, the expert-mask build gives the same bytes as the normal engine (Brain Engine PC trial, 8 November, on the 35B model; checked-numbers.md).
- **Live steering equals loading.** Steering at x8 live matches loading the same vector at x8. Sending an empty setting restores the same words as before (PR #227; checked-numbers.md).
- **Per-layer test for 0013.** `engine/tests/experts-per-word.py` builds a tiny model and compares the live setting with the engine's own override flag, layer by layer through the trace, and checks the refusals (ENGINE-MAP.md).
- **Cross-build card sharing for 0014.** `engine/tests/rpc-any-version.sh` runs a model with every layer on a lent card in all four old and new pairings. All four matched a local run word for word, on a tiny llama model with CPU builds on Linux, 15 November 2026 (ENGINE-MAP.md).
- **Timing.** On the full Qwen, 8, 6 and 4 experts per word ran at 82.7, 92.1 and 102.5 tokens a second (docs/forge-runs/benchmarks/experts-per-word-full-qwen-2026-11-04.md). This describes the model, not the cost of the patch.

### 3.4.6 What Brain Engine does not have

No patch is tested automatically against a real engine build. Placement errors are the dangerous kind: a mask after the top-k pick, or a dial on the wrong head slice, still builds and gives wrong answers without an error, and would show up only in the PC test (ENGINE-MAP.md). The map proposes a short engine test on a tiny mixture-of-experts file (mask, trace rows, dials against mask, card handshake, SCUT off). It is proposed and not built.

Brain Engine has no choice of how the kept experts are weighed when fewer are used. llama.cpp's Qwen3 mixture-of-experts graph scales the chosen experts' weights to add up to 1 (src/models/qwen3moe.cpp, read on 16 November), so patch 0013 at 4 experts uses the weighting that Chen and Yao (2026) found cost 4.65 MMLU points on the same base model, against 0.35 when the four keep their share of the top 16. The project's own test at 4 experts held tools, facts and code level (section 3.4.5), but on far fewer questions and different tasks. The other weighting is not built; it is future work (section 13.6.9).

There are no clean overhead numbers per patch. Only a few patches have any timing, and none was taken in the full study configuration. The dissertation therefore makes no claim about what the patches cost in speed: not measured.

A weekly workflow replays the patches on the newest llama.cpp tag and opens an issue when they apply and build (engine/README.md). It checks that the patches go on, not that they are correct.

## 3.5 The Forge: a rental training pipeline

### 3.5.1 Purpose and shape

A 35-billion-parameter model cannot be cut and healed on a home 16 GB card. Renting by the hour is affordable only if a failed run cannot keep billing, so the Forge is built around cost controls and the training code is the smaller part.

It has a PC side and a pod side. The PC side, `forge.mjs`, shows the caps, asks for a typed yes, rents one card, sends the scripts and lessons, watches the pod every minute, downloads each finished model, and deletes the card. The pod side starts a tiny upload and download door (`pod/bootstrap.py`), then runs `pod/run.sh`, driven by a plan file. The pod also deletes itself 8 minutes before the hours cap, in case the PC side has died (model-lab/forge/README.md).

### 3.5.2 Pod scripts

The pod scripts do these jobs. `teacher.py` records the full model's top-32 next-word log-probabilities at every answer position. `data.py` renders lessons and holds out 5% by id hash. `prune.py`, `keep.py`, `count.py` and `countskills.py` count which experts each skill uses, build a keep list that covers every skill, and cut the model by slicing weight bytes. `reap.py` scores experts by router weight times output size. `heal.py` and `lora.py` train a LoRA on every linear layer and the experts, and train the router itself in float32 at a fifth of the main rate, or leave it frozen. From Build 25 a heal can also record expert picks on held-out lessons before and after (section 4.12.1). `pref.py`, `grpo.py` and `onpolicy.py` add preference pairs (ORPO, DPO, KTO), a reward pass and on-policy teaching, each off unless the plan asks. `merge.py`, `fold.py` and `surgery.py` blend, fold or bake in a tested change. `export.py` and `rebuild.py` write GGUF files and brain cards and rebuild a model from its keep list and adapter. `family.py` separates Qwen from GPT-OSS, and two self-test scripts dry-run everything on tiny models.

### 3.5.3 Data flow

`data.py` renders each lesson with the model's chat template, tools and thinking included, and marks as answer tokens everything between each assistant start and its end token. GPT-OSS needed its own path, since its harmony format ends an answer at an end, call or return token (model-lab/forge/README.md, Build 23).

The teacher pass runs the full model once over every lesson and stores, for each answer position, 32 word ids and their log-probabilities. The heal then needs no copy of the teacher in memory. The loss is 0.7 times the KL divergence from the teacher's top-32 odds plus 0.3 times the cross-entropy on the real next word, on answer tokens only (docs/MAKING-SMALLER-MODELS.md). This follows the classic soft-target idea of Hinton et al. (2015) and the prune-then-distil recipe of Muralidharan et al. (2024). A fixed share of general text (public web text and public chat data) is mixed into the teacher pass, the heal and the expert counts, so the cut model keeps general knowledge (model-lab/forge/README.md).

### 3.5.4 Caps, gates and cost controls

The Forge has five kinds of control. Both **caps** are read from the plan file every minute and count from the rent, also after a restart. **Self-delete** ends every run type: the pod waits for the PC's finished signal or a grace period, then deletes, with a time-cap watchdog behind it. **Pre-flight** runs in code before renting (section 3.6.2). The **sample gate** stops a run with exit code 86 if a small first batch saves too few lessons. **Card health** logs every start-up by card type and data centre; a pod that never answers is deleted and rented again with that type left out, and a type with 2 freezes in 7 days and no good start since goes to the back of the list (model-lab/forge/README.md).

A network volume holds the teacher weights, general text, compiled tools and every adapter, and a card is rented only in a data centre that has one.

### 3.5.5 The teacher-odds cache

A teacher pass over the lesson set can take hours. The first v3 pass took 125 minutes and was lost when the card was deleted (docs/FORGE-JOURNAL.md). The fix was to key the scores. The key is a 16-character hash of the merged lesson file, the tool sets, the teacher, the number of top words, the maximum length and the general-text budget. Scores and tokenised lessons are saved under that key on the volume and the PC, and a later run with the same lessons skips the pass.

The key includes the teacher's adapter hash when the teacher was itself trained, so stock-teacher and trained-teacher scores never mix. A cut model healed toward the wrong odds is pulled toward a brain that no longer exists. Build 16 made the merged lesson file byte-identical whether a set was written on the card or uploaded, so the key is the same either way. Bill reused Bobert's saved odds and skipped about six hours of card time (docs/MAKING-SMALLER-MODELS.md).

### 3.5.6 The failures that shaped it

COSTS.md lists every rental, failures included. At the time of writing it records eleven failed paid attempts, costing $22.40, inside a total of $484.39 and about 105 hours of card time (docs/COSTS.md). Two of the eleven are marked estimated, not yet billed. The failures that changed the design are these.

| Failure | Change made |
|---|---|
| Attempts 1 to 3 (4 Nov): no git on the image, a quantizer that would not run, a teacher server that died and a template that skipped 45% of tool-call lessons | Plain HTTP fetch, background tool builds, in-process teacher scoring. |
| Clock-capped heals (5 Nov): Riker v1 completed 195 of 456 steps, Bill v1 163 of 456 | A full pass or nothing. |
| Attempt 4 (6 Nov): new skill jobs had weight zero and wrote nothing | A job with no weight gets a share of 1. |
| Plan-reader bug (7 Nov): an empty argument ended the run; the full-precision model and 2.5 h of scores went with the pod | Scores cached under a key; a card is rented only where a drive is. |
| Idle card (10 Nov): the PC's window was closed and the card billed about $11 of idle time | Every run type ends with the card deleting itself. |
| False start (9 Nov): a card was taken where the adapter was not; $0.40 lost | A rebuild run never makes a drive. |
| Start-up freezes (14 Nov) | Card health log and re-rent with the type left out. |

One failure deserves a longer note, because it is the same kind of fault the dissertation studies. For several runs, Qwen's linear-attention layers silently used a slow fallback. A `pip install` of the fast kernels reported success, but the compiled module failed to import because it had been built against a different PyTorch, and Transformers quietly fell back. Building against the image's own PyTorch and refusing to start until the kernels import fixed it. Bobert's full pass then took about 10.3 hours instead of about 16 (docs/FORGE-JOURNAL.md). The fault cost time; a comparable fault in lessons costs quality.

### 3.5.7 GPT-OSS as a second family

Build 23 extended the Forge to GPT-OSS for the studies of the 120B and its 38B cut (model-lab/forge/README.md). `family.py` reads `config.json` and picks the model class, router module and stop tokens. The teacher keeps its MXFP4 weights when the card allows, and a student is always unpacked to BF16, since MXFP4 cannot be trained. Lessons use the harmony template, and LoRA is applied per expert in GPT-OSS's own layout. GRPO, fold, surgery and merge are skipped for GPT-OSS. The 38B heal plan exists and is waiting on approval. A read of the heal code on 16 November, prompted by the router rules of section 4.12.1, suggested that the GPT-OSS router (its weight and bias) was not in the heal's low-rate group and would have learned at the main rate, five times faster than the Qwen router. The finding is unproven in our lab, as we have yet to test on a real brain. On the tiny GPT-OSS model the old rule matched none of the eight router tensors and the new rule matches all eight (selftest_gptoss.py). The rule was changed before any GPT-OSS heal ran (Build 25), and a gate stops any heal before training unless the count is right, so the first real heal tests the finding.

### 3.5.8 How the Forge was verified

`pod/selftest_training.py` builds a tiny Qwen-style mixture-of-experts model on a CPU in about a minute, downloads nothing, and runs the teacher, heal, ORPO, DPO, KTO, on-policy, GRPO and merge steps as separate processes. It checks each writes its report and that the merge maths is right. The script says it proves the code runs end to end, not that it helps. `pod/selftest_gptoss.py` does the same for GPT-OSS. Other checks were on made-up data: `keep.py` for each scoring mode, the REAP scorer against a brute-force sum, and a prune then fold on a tiny model (README, Builds 20 and 21). The merged lesson file gave the same bytes from two folders with different names (Build 16). The Python and JavaScript tool judges are checked against one case file (`pod/tool_reward_cases.json`).

Not verified: several builds are marked "untested on a card", and a first paid run of new code is its test. The hook on the real model's expert module for REAP was untested until a run. Whether a folded and healed model beats a dropped and healed one is stated as unknown.

## 3.6 The Lab scripts

### 3.6.1 Overview

The scripts in `model-lab/*.mjs` run on the home PC or against a served model. They write lessons (`write-lessons.mjs`, `calib-prep.mjs`), clean and sort them (`clean-lessons.mjs`, `make-datasets.mjs`, `make-pairs.mjs`), judge answers (`tool-score.mjs`, `tool-judge.mjs`, `experts-test.mjs`, `loop-test.mjs`), probe tool use (`tool-wording.mjs`, `tool-coach.mjs`, `tool-interview.mjs`), look inside (`trace-read.mjs`, `expert-sweep.mjs`, `job-presets.mjs`, `evil-check.mjs`, `evil-sweep.mjs`), and gate or scrub (`smoke-gate.mjs`, `scrub-data.mjs`, `stamp-condition.mjs`).

### 3.6.2 Writing lessons and the pre-flight

`write-lessons.mjs` has the teacher write every lesson as a real Bob turn: Bob's own system prompt and tools, neutral names and a throwaway settings folder, so nothing from anyone's own chats or files goes in. Tool results are played by the teacher and nothing is run. A second pass reviews each lesson, and a failed lesson is retried once with the reviewer's reason shown to the writer. The reject is kept in a separate file as the wrong side of a possible preference pair.

The pre-flight runs in code before any rental. On the failed run lkt-fix3 it counted 211 rows in the ideas file, found 94 written and 117 to go, and checked the room per slot: 32,768 tokens, from a longest first request of about 10,838 tokens plus 16,384 to grow (forge-lkt-fix3-console.log).

### 3.6.3 The sample gate working

On lkt-fix3 the first 10 ideas were written and at least 6 had to be saved. Only 1 of 10 saved: 5 failed review twice, 2 had unreadable reviews, 1 ran out of steps and 1 ran out of room. The run stopped with exit code 86 and the card was deleted after about $0.31 (forge-lkt-fix3-console.log; checked-numbers.md). The gate is blunt. It cannot say whether the writer, the reviewer or the tool shape was at fault. It only says to look before paying more.

`smoke-gate.mjs` is the second gate. It checks whether the teacher odds cover the thinking words, whether enough lessons passed review and every tool-call argument parses, and whether the server can trace a finished lesson. A failure of the last two exits with code 86 (model-lab/smoke-gate.mjs).

### 3.6.4 Judging scripts

`tool-score.mjs` replays held-out lessons turn by turn with the full history, Bob's real system prompt and the tools loaded at that moment. Each assistant turn is one question. A turn is right if it makes the same tool calls with every recorded argument matching, or correctly makes no call. `tool-judge.mjs` holds that rule, and `pod/tool_reward.py` mirrors it for GRPO. Free-text arguments need only overlap by 60% (pod/tool_reward.py). The script states that the original answers came from the full Qwen3.6 itself, so the score measures agreement with the teacher, not truth (model-lab/tool-score.mjs). Chapter 4 returns to this.

`loop-test.mjs` runs the tool quiz through Bob's real turn loop with fake tools, since a bare first answer cannot show what the loop does next.

### 3.6.5 Probing scripts

`tool-wording.mjs` asks the same judged questions with different tool wordings and thinking modes and writes paired gaps against Bob's own wording. `tool-coach.mjs` walks a lesson step by step and, after a miss, gives up to three hints: a nudge, the tool name, then the exact call. `tool-interview.mjs` shows a model its own misses and its own saved thinking and asks why. The explanation is a lead, not proof. All three parse tool calls and never run them, and their output is evidence only, never training data.

### 3.6.6 Looking inside

`evil-check.mjs` is a measure-only check for a cruel direction. It reads the same asks under a cruel persona and under Bob's plain prompt, compares expert and head traces, turns candidates down with live dials, and has the model rate its own answers. It offers no tools. `evil-sweep.mjs` covers experts through dials and single neurons through the live control vector, using random halves in each layer. Each half and its complement are tested, so every unit is in exactly half of the mixes with different partners. A unit's effect is the mean harshness of mixes it was in minus mixes it was not in. The output is a surgery record only (model-lab/evil-sweep.mjs).

### 3.6.7 Cleaning, scrubbing and the never-taught gate

`clean-lessons.mjs` writes a new version of the lesson sets and only reads the old one. It drops lessons that call a tool their own list does not offer and repeated first prompts in the same thinking mode, and it keeps held-out lessons whatever their faults. v3 to v4 reduced 9,059 lessons to 8,992 (model-lab/forge/README.md). This is a different pass from the first cleaning in chapter 4, which took 9,059 to 8,828 (docs/MAKING-SMALLER-MODELS.md).

`scrub-data.mjs` replaces private details on a copy of any data that leaves the PC, then checks again and refuses to finish when anything is left. It was rewritten after a real miss, described in chapter 4.

The never-taught gate, `never-gate.mjs`, checks every user turn of a plan's lessons and preference pairs against the quiz items and the never-taught list. It counts exact copies, test questions inside longer requests and reworded near copies. `forge.mjs` runs it before renting and stops the plan on any match or a missing test file. It is tested on fakes (18 checks) in PR #257, stacked on the lesson kit in PR #254. Both shipped in release 1.5.238 on 15 November, which passed its Windows test (276 of 276) in its lab-PC check. Before that release the only guards were `notForTraining()` and a check in `src/lab-runs.js`. The file was not in the older checkout first read for this chapter; its behaviour is taken from the PR description and the file's header on main.

### 3.6.8 How the Lab scripts were verified

- **A planted cause.** The sweep found a planted cruel expert and a planted cruel neuron on a made-up server. This shows it can find a known cause, not that one exists in a real model.
- **Home-side dry runs.** Every home-side command runs against a stand-in server, with a folder name that has a space in it, before a card is rented. Three benchmark failures in a row came from home-side bugs.
- **A retracted result.** An early steering push seemed to drive hostility. Every strength actually made the model loop one word, often in Chinese, and the old judge rated loops as harsh. The claim was withdrawn, and the judge now counts loops and wrong-language text as broken (riker-28bob-tool-interview.md, section 5).
- **Condition stamps.** Saved answers carry the condition they were made under; an unmarked model is never called stock.

### 3.6.9 Real jobs: do-jobs, the jobs gate and jobs-to-lessons (added 16 November)

The lesson writer of section 3.6.2 has a teacher write each lesson. `do-jobs.mjs` works the other way round: a served brain does a real request through Bob's own loop, with his real tools, and the whole turn is recorded as it ran. Before each job the brain writes a "scene", the files, folders, notice-board lists and memory the request takes for granted, and those are planted for real in a throwaway home that reads as `C:\Users\you`. Every job gets a fresh home. Web search is real: Bob's free search first, then a keyed backup (Tavily) under a monthly cap and a per-run cap. Tools that would act on the real PC (running programs, apps, schedules, e-mail) are not offered, and their Hands are off, so the honest answer is to offer the switch.

`jobs-gate.mjs` reads a finished run and stops the plan, which deletes the pod, when the run is not clean: too few answers in words, a tool shape that does not match, failed searches, or a key in the output. A name or private word in the output can be set to warn instead of stop, because the scrub runs again before anything is kept. `jobs-to-lessons.mjs` turns the runs that an Opus reader marked keep into ordinary lessons, with each turn's own system prompt and tool list, stamped with the brain family and tool shape. It drops Bob's hidden notes to himself, refuses to mix families, runs the scrub and checks again, and writes nothing if anything private is left.

Three things the harness got wrong were found by reading its own runs (section 4.5.5). The combined approval card came back "the user said no". Script files outside a project were refused by Bob's guard. Bob's check that a "saved at" file exists looked for a real C: drive instead of the test home, so every such check failed. All three are fixed: the card now answers yes, code folders are registered as projects, and the test world tells Bob where a named file really is. The fixes came after the 800-job run of section 11.7.5, so that run still carries all three.

The read of the 800 runs marked 47 of them as decided by the harness, not the brain, and they fell into eight kinds. In 32 the scene asked for a file the test home could not make (sound, video, programs, slide decks, Photoshop files, old Word files), or the request named such a file and the scene left it out. In 9 the scene reply was cut off mid-JSON and nothing was planted. 6 hit the "no" card and 6 the script guard above. In 3, Bob's question was answered with a "let me type it" choice, so nothing was typed. In 2, llama-server refused a request that held half an emoji. In 2, a diagram saved as a picture waited for a chat window the test home does not have. In 1, a folder the scene made was not one Bob was allowed to use. Each kind now has a fix. The test home builds small real files of every kind it lacked. A cut-off scene keeps the whole files before the cut and is asked for again. Files a request names are added when no words are needed inside them. Every request is made whole before it is sent, in Bob's own engine as well. The Lab stands in for the chat window and says so in the run record. The folder that holds the scene's folders is allowed.

Two checks keep these from coming back. `harness-faults.mjs` names each kind from a run record alone. do-jobs stops a rental once 3 in 10 runs are decided by the test world, and the jobs gate stops a run past 5%. `jobs-selftest.mjs` runs eight scripted jobs, one for each kind, through Bob's real loop on the Lab PC before any rented brain starts. It passes on the fixed harness and failed all eight on the harness the 800-job run used. A replay of the 47 runs, each with its own saved scene and the very same tool calls its brain made, found no harness fault left in any of them. Eight of those had lost their scene reply, which was never saved, so for those the replay checks only the rest of the run, and the self-test checks the fix itself. A replay checks the world, not the brain: whether the next real run has fewer harness faults is unproven in our lab, as we have yet to test.

## 3.7 Discussion

The instruments were made because the questions demanded them: the mask, dials, experts-per-word and trace patches map one-to-one onto the experiments in chapters 5 to 10. The Forge's cost controls matter as much as its training code, since every costly mistake in section 3.5.6 came from a quiet default or a missing guard. And instruments fail like lesson sets fail: a fast-kernel fallback, a template that skipped 45% of tool lessons and a judge that rated loops as harsh each looked normal from outside. That is the theme of this dissertation and the reason for the gates in chapter 4.

## 3.8 Threats to validity and limits

- **Small stand-ins.** The strongest Brain Engine checks used tiny models, CPU builds or one trial on a 35B model. They show the code does what it claims, not that the instruments are unbiased on a real large model.
- **No automatic engine test.** A patch in the wrong place would be found only by the PC test.
- **Dry runs prove running, not helping.** The self-tests say so themselves, and most Forge builds after build 14 had no card test when the README was written.
- **Overhead not measured.** No clean with-and-without timing exists for the patches the studies use.
- **One builder.** The code was written and checked inside one project, with an AI assistant as a contributor (docs/COSTS.md). No outsider has reviewed it.
- **Judge limits.** The tool judge measures agreement with the teacher, and is blind to a call that is right in a way the teacher did not record.
- **Status.** The never-taught gate shipped in release 1.5.238. The decisive retrain on reviewed lessons has not been run, so no instrument here has yet been used on the lessons the dissertation finally recommends.

## 3.9 Summary

Three layers of instruments were built. Brain Engine adds live masks, dials, experts-per-word and traces to llama.cpp with fourteen patches. The Forge cuts and teaches models on rented cards under caps, with a pre-flight, a sample gate, a teacher-odds cache and a self-delete. The Lab scripts write, judge, clean and probe. Each was verified on a small stand-in, and the chapter lists what is not verified. The costliest lessons of the build were quiet defaults, including a silent slow kernel: with the fast kernels, Bobert's full pass took about 10.3 hours instead of about 16. The rules that came from them are the subject of chapter 4.

## References

- Chen, X., and Yao, H. (2026). Training-Free Halving of Activated Experts in Fine-Grained Mixture-of-Experts Models. arXiv:2609.04575. https://arxiv.org/abs/2609.04575
- Ethayarajh, K., Xu, W., Muennighoff, N., Jurafsky, D., and Kiela, D. (2024). KTO: Model Alignment as Prospect Theoretic Optimization. arXiv:2402.01306. https://arxiv.org/abs/2402.01306
- Hinton, G., Vinyals, O., and Dean, J. (2015). Distilling the Knowledge in a Neural Network. arXiv:1503.02531. https://arxiv.org/abs/1503.02531
- Hong, J., Lee, N., and Thorne, J. (2024). ORPO: Monolithic Preference Optimization without Reference Model. arXiv:2403.07691. https://arxiv.org/abs/2403.07691
- Hu, E. J., Shen, Y., Wallis, P., Allen-Zhu, Z., Li, Y., Wang, S., Wang, L., and Chen, W. (2021). LoRA: Low-Rank Adaptation of Large Language Models. arXiv:2106.09685. https://arxiv.org/abs/2106.09685
- Jiang, A. Q., Sablayrolles, A., Roux, A., et al. (2024). Mixtral of Experts. arXiv:2401.04088. https://arxiv.org/abs/2401.04088
- Kwon, W., Li, Z., Zhuang, S., Sheng, Y., Zheng, L., Yu, C. H., Gonzalez, J. E., Zhang, H., and Stoica, I. (2023). Efficient Memory Management for Large Language Model Serving with PagedAttention. arXiv:2309.06180. https://arxiv.org/abs/2309.06180
- Lasby, M., Lazarevich, I., Sinnadurai, N., Lie, S., Ioannou, Y., and Thangarasa, V. (2025). REAP the Experts: Why Pruning Prevails for One-Shot MoE Compression. arXiv:2510.13999. https://arxiv.org/abs/2510.13999
- llama.cpp project page (ggml-org), MIT licence. https://github.com/ggml-org/llama.cpp
- Muralidharan, S., Sreenivas, S. T., Joshi, R., Chochowski, M., Patwary, M., Shoeybi, M., Catanzaro, B., Kautz, J., and Molchanov, P. (2024). Compact Language Models via Pruning and Knowledge Distillation. arXiv:2407.14679. https://arxiv.org/abs/2407.14679
- OpenAI (2025). gpt-oss-120b and gpt-oss-20b Model Card. arXiv:2508.10925. https://arxiv.org/abs/2508.10925
- PEFT: Parameter-Efficient Fine-Tuning library (Hugging Face). https://github.com/huggingface/peft
- Rafailov, R., Sharma, A., Mitchell, E., Ermon, S., Manning, C. D., and Finn, C. (2023). Direct Preference Optimization: Your Language Model is Secretly a Reward Model. arXiv:2305.18290. https://arxiv.org/abs/2305.18290
- Shao, Z., et al. (2024). DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models (introduces GRPO). arXiv:2402.03300. https://arxiv.org/abs/2402.03300
- Shazeer, N., Mirhoseini, A., Maziarz, K., Davis, A., Le, Q., Hinton, G., and Dean, J. (2017). Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer. arXiv:1701.06538. https://arxiv.org/abs/1701.06538
- TRL: Transformers Reinforcement Learning library (Hugging Face). https://github.com/huggingface/trl
- Yadav, P., Tam, D., Choshen, L., Raffel, C., and Bansal, M. (2023). TIES-Merging: Resolving Interference When Merging Models. arXiv:2306.01708. https://arxiv.org/abs/2306.01708
- Yang, A., et al. (2025). Qwen3 Technical Report. arXiv:2505.09388. https://arxiv.org/abs/2505.09388
- Yu, L., Yu, B., Yu, H., Huang, F., and Li, Y. (2023). Language Models are Super Mario: Absorbing Abilities from Homologous Models as a Free Lunch (DARE). arXiv:2311.03099. https://arxiv.org/abs/2311.03099
- Zou, A., Phan, L., Chen, S., et al. (2023). Representation Engineering: A Top-Down Approach to AI Transparency. arXiv:2310.01405. https://arxiv.org/abs/2310.01405
