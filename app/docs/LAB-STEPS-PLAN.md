# Lab steps: every advanced method as a step, and the Lab as a professional tool

Design only. Nothing in this document is built yet. It covers two asks:

1. Every advanced method built as a loose script becomes a Lab step. Each step runs on its own, or as part of the
   whole protocol, in the protocol's order.
2. The Lab is checked against professional ML experiment tools (experiment tracking, run comparison, repeatable
   setups, runs that pick up where they stopped, clear logs and charts, cost per run, dataset versions), and the
   gaps are fixed in a set order.

The rules don't change. Heavy steps run on rented cards, never on this computer's card when it's someone's gaming
PC. Every step smoke-tests itself before a paid run and stops the rental if that test fails. Renting, uploading and
deleting need the owner's typed go. Surgery data never trains. Bob stores keys and uses them, but never reads or
shows them. No test makes or types a passcode.

## 1. What exists today

Checked on main at 1.5.225 and on the open stack (#189, #222 with #226 and #227 merged into it, and #225 on top).

### Already a Lab step (main)

| Method | Where in the Lab | Script |
|---|---|---|
| Make it smaller, cut experts, take out senses, test | Make a brain jobs | `src/lab*.js` |
| Refusal habit (find the direction, try it live) | Forge, "Try it first" | `src/lab-home-jobs.js` |
| Clean a lesson set into a new version | Forge, The training protocol | `clean-lessons.mjs` |
| Right-vs-wrong pairs | Forge, The training protocol | `make-pairs.mjs` |
| Live sweep of experts per word and layer dials | Forge, The training protocol | `expert-sweep.mjs` |
| Preference training, on-policy, reward pass, targets, blend, bake surgery | Forge form, "New ways to teach" (plan keys) | `forge/pod/*.py` |
| Watch pages (fNRI recordings) | Look inside, Watch | `src/lab-watch.js` |
| Usage map (which experts each thing uses) | Make a brain, Cut experts | `src/lab-usage.js` |
| Lesson writer | Teach | `write-lessons.mjs` |

### On main, but only a loose script

`scrub-data.mjs` (the 1.5.225 scrub), `tool-judge.mjs`, `tool-score.mjs`, `make-checks.mjs`, `make-probes.mjs`,
`make-datasets.mjs`, `quiz-items.mjs`, `reap-calibrate.mjs`, `reap-pick.mjs`, `reap-lastlayer.mjs`,
`straight-facts.mjs`, `stamp-condition.mjs`, `count-experts.mjs`, `experts-test.mjs`, `forge/fnri-remote.mjs`,
`forge/aifeui-bundle.mjs`.

### Only on the open stack (not on main yet)

| Method | Scripts | PR |
|---|---|---|
| Tool interviews, wording A/B, per-family wording parts | `tool-wording.mjs`, `tool-interview.mjs`, `tool-pick.mjs`, `tool-wish.mjs`, `natural-tools.mjs`, `job-presets.mjs` | #222, #225 |
| Expert maps per target, dials, carry-over to a cut | `trace-read.mjs`, `trace-carryover.mjs` | #189 |
| Evil check | `evil-check.mjs` | #189 stack |
| Vector steering | `evil-steer.mjs` | #226 |
| Expert and neuron sweeps, live control vector (pod patch 0014) | `evil-sweep.mjs` | #227 |
| Smoke gate, live switches, engine checks | `smoke-gate.mjs`, `set-live.mjs`, `engine-live.mjs`, `engine-check.mjs`, `calib-prep.mjs` | #189, #222 |

### Not built anywhere yet

- Patching (swap one layer's or one head's output from a clean run into a changed run, to find where a habit
  lives) and sparse-autoencoder features. Design only so far.
- Lesson doctoring from failures (#228 is the plan, no code).
- Odds sorting for "look it up when unsure" lessons (#228 plan).
- HF staging as a step. Today it's folders made by hand (`hf-stage-*`) and the upload thread.

### A bug found on the way

"Try it first" in `src/lab-home-jobs.js` still passes `--control-vector-scaled FILE SCALE` as two words. The
engine on b12282 wants `FILE:SCALE` (#226 notes this). It gets fixed in the first build slice.

## 2. Against professional ML experiment tools

What tools like MLflow, Weights & Biases and DVC give a person, and where the Lab stands.

| What a professional tool gives | The Lab today | Gap |
|---|---|---|
| One record per run: settings, inputs, outputs, scores | Each job kind keeps its own record shape (`lab-jobs.js`, Forge logs, sweep reports) | No single run record. Results from different steps can't be lined up. |
| Repeatable runs: the exact settings, data and code version saved | Forge plans are saved. Local jobs keep their form, but not the code version or input hashes. | Save settings, input hashes and Bob's version with every run. "Run again" from a past run. |
| Lineage: which brain and which data a result came from | Partly, in names (`fromName`) | Each output names its parents, by hash. A brain's page shows its family tree. |
| Run comparison side by side | Leaderboard and Taste test compare brains, not runs | Pick any two or more runs and see settings and scores side by side, with differences marked. |
| Charts of scores over steps | Text reports and tables | One score chart per pipeline: every step's benchmark, one line per target. |
| Pick up where it stopped | `evil-sweep.mjs` resumes from its log. Most steps start over. | Each step writes a done marker. A pipeline restarts at the first step not done. |
| Cost per run | Estimates before a run (`lab-estimate.js`), costs in docs by hand | Record real card minutes and price per run, from the rental record. Show the total per pipeline. |
| Dataset versions | Lesson sets get v4-style copies via clean, with change lists | Every set gets an id from its content hash, a parent, and a change list. Tags such as "never train" travel with every copy. |
| Clear logs | Last lines of a log, scrubbed | Full log per step, scrubbed, searchable, with the failing line marked. |
| Health checks before spending | Some plans have smoke gates (#222) | Every step has a smoke test, run first. |
| Artifact store | Files in `<data>/lab/...` folders | Same folders, plus one index of every output with its kind, hash and parents. |

## 3. The step design

### One shape for every step

Each step is a small entry in one list, `src/lab-steps.js`. The page, the runner and the pipeline all read it.

```js
{
  id: 'evil-steer',
  name: 'Activation steering',              // short professional name on the card
  plain: 'Pushes the brain along one direction to see what changes.', // the (i) text
  glossary: 'activation-steering',          // the name links here
  stage: 'clean-first',                     // where it sits in the protocol order
  where: 'rented',                          // here | rented | both
  heavy: true,                              // never on this computer's card when Gaming is possible
  takes: ['brain', 'pairs'],                // kinds of input
  makes: ['direction', 'report'],           // kinds of output
  neverTrain: true,                         // every output is tagged, and training steps refuse it
  needsGo: ['rent'],                        // rent | upload | delete | bake
  smoke: { args: ['--gate'], seconds: 120 },// the smoke test, run first, always
  run: { script: 'evil-steer.mjs', args: (form) => [...] }, // fixed template, form values checked first
  help: 'lab-step-evil-steer',              // Help page key
}
```

Rules every step follows:

- **Smoke test first.** The runner always runs the step's smoke form first, on the same card or computer. Exit code
  86 (the code the stack's gates already use) or any failure stops the step. On a rented card it also stops the
  card, by its id only (never the bare kill, which stops every Forge card).
- **Fixed commands.** The form fills set places in a fixed command. Nothing a person types is run as a command.
- **Never-train tag.** Outputs of surgery, steering, sweeps, evil checks and patching carry `neverTrain: true` in
  their index entry and in a `NEVER-TRAIN` file beside them. Every training step refuses an input with that tag.
  They can still be published as study material, on the owner's go.
- **Keys.** A step that needs a key names it (for example `HF_TOKEN`). The runner puts it in the child's
  environment from Bob's key store. The step's record, log and page never hold the key.
- **Off by default.** No step runs unless a person picks it or puts it in a pipeline.

### The step list

In protocol order. "Stage" is the PR #201 order; any step can also run on its own.

| Stage | Name | (i) Plain words | Script | Where |
|---|---|---|---|---|
| 1 Baseline | Baseline eval | Scores the brain as it is. | existing Lab jobs, `tool-score.mjs` | both |
| 1 | Logit capture (top-K) | Saves the teacher's odds for every word. | `write-lessons.mjs --odds` | rented |
| 1 | PII scrub | Removes names, paths and keys from data. | `scrub-data.mjs` | here |
| 1 | Dataset cleaning | Makes a new version without bad lessons. | `clean-lessons.mjs` | here |
| 1 | Preference pairs | Pairs a right answer with a wrong one. | `make-pairs.mjs` | here |
| 1 | Eval and probe sets | Makes held-out checks to score against. | `make-checks.mjs`, `make-probes.mjs` | here |
| 2 Clean first | Harm eval | Asks harmful things and rates the answers. | `evil-check.mjs` | both |
| 2 | Activation steering | Pushes the brain along one direction to see what changes. | `evil-steer.mjs` | rented |
| 2 | Ablation sweep | Turns experts or neurons down to find which cause a habit. | `evil-sweep.mjs` | rented |
| 2 | Activation patching (new) | Swaps one part's output to find where a habit lives. | `patch-trace.mjs` (to write) | rented |
| 2 | SAE features (new) | Splits the brain's signals into readable features. | `sae-train.py`, `sae-read.mjs` (to write) | rented |
| 2 | Abliteration | Removes the reflex to say no, tried live first. | `src/lab-home-jobs.js` | here |
| 3 Analysis | REAP scoring | Rates how much each expert matters. | `reap-calibrate.mjs`, `reap-pick.mjs`, `reap-lastlayer.mjs` | rented |
| 3 | Router trace | Maps which experts each job uses, layer by layer. | `trace-read.mjs` | both |
| 3 | Attribution transfer | Carries an expert map over to a cut brain. | `trace-carryover.mjs` | here |
| 3 | Expert profiling | Counts how often each expert works. | `src/lab-usage.js` | here |
| 3 | Router visualisation | Records a 3D picture of experts at work. | `src/lab-watch.js`, `forge/fnri-remote.mjs` | both |
| 3 | Tool-use coaching | Walks it through lessons, hinting when it picks wrong. | `tool-coach.mjs`, `tool-pick.mjs` | rented |
| 3 | Tool-schema A/B | Tries tool wordings to see which works best. | `tool-wording.mjs`, `natural-tools.mjs` | rented |
| 4 Train | Full fine-tune (SFT) | Teaches the whole brain before any cut. | Forge plan `train_teacher` | rented |
| 4 | LoRA | Teaches a small add-on; chosen layers stay frozen. | `forge/pod/lora.py`, `heal.py` (options to add) | both |
| 4 | Error-driven correction (new) | Turns failed answers into corrected lessons. | `doctor-lessons.mjs` (to write, from #228) | here |
| 4 | Abstention data (new) | Teaches it to look things up when unsure. | `odds-sort.mjs` (to write, from #228) | here |
| 5 Cut | Iterative pruning | Cuts experts one step at a time. | Forge plan, Make a brain | both |
| 6 Heal | Distillation | Teaches a cut brain to act like the full one. | Forge plan `heal` | rented |
| 7 Targets | Multi-objective PO | Trains on several goals, each with its own weight. | Forge plan `targets` | rented |
| 8 Finish | On-policy KD + GRPO | Grades the brain's own answers, then rewards good tool calls. | Forge plan `heal.onpolicy`, `grpo` | rented |
| 9 Blend | Model merging | Mixes two brains' weights. | Forge plan `merge` | rented |
| 10 Live dials | Inference sweep | Tries experts per word and layer strengths live. | `expert-sweep.mjs`, `set-live.mjs` | both |
| 10 | Weight editing | Bakes chosen dials into a copy. | Forge plan `surgery` | rented, on the owner's go |
| 11 Publish | Release staging | Gets files, card and checksums ready to upload. | `hf-stage.mjs` (to write) | here |
| 11 | Publish | Uploads to Hugging Face. | existing HF upload | here, on the owner's typed go |

Naming rule for every step, option and field: a short professional name on the card (jargon is fine), an (i)
beside it with one plain sentence saying what it does, and the name linked to its glossary entry. Descriptions stay
one short sentence.

Every stage ends with the benchmark step on the same fixed sample set, chosen once at stage 1.

### LoRA, and everything it can do

Today `forge/pod/lora.py` (used by `heal.py` and `train_teacher`) puts LoRA on every linear layer, LoRA or full
training or frozen on the experts (`--experts lora|full|frozen`), and keeps the router fully trainable. It can't yet
freeze chosen layers or choose which parts get LoRA. The step adds these options, all in the plan and the form,
all off unless picked:

| Option | (i) Plain words |
|---|---|
| Layer freezing | Chosen layers don't change. |
| Target modules | Picks which parts learn: attention, feed-forward, experts, router. |
| Expert-selective LoRA | Only the experts a job uses learn. |
| Rank / alpha | Sets the add-on's size and strength. |
| Layer-wise rank | Gives bigger add-ons where the work is. |
| rsLoRA | Keeps big add-ons training evenly. |
| LoRA+ | Speeds up learning. |
| DoRA | Learns closer to full training. |
| QLoRA | Holds the brain in 4-bit so it fits a smaller card. |
| LoRA dropout | Helps it learn, not memorise. |
| Adapter export | Saves the add-on on its own. Running it live needs engine patch 0016, still proposed. |
| Multi-adapter | One add-on per job, each scored. |
| Adapter merging | Mixes add-ons with weights. |
| Merge into base | Bakes the add-on into a copy, on the owner's go. |
| Checkpoint resume | Picks up where it stopped. Already there. |

The smoke test trains once through 50 lessons (about a minute) and checks that the frozen layers didn't move and
the brain got better on those lessons. A
fine-tune of about 9B or less in 4-bit fits a 16 GB card at home; anything bigger rents a card. Our own runs stay on
rentals.

### Data refinery: data to its best state (pipeline)

Quality first: fewer clean lessons beat many noisy ones. Every step runs alone or in this order, follows #228's
rules (held-out items are never taught, only new look-alikes), and reports how many lessons it dropped, repaired or
kept, and why.

| Step | (i) Plain words |
|---|---|
| PII scrub | Removes names, paths and keys. |
| Dedupe | Drops exact and near-copies (MinHash), keeping the best one. |
| Contamination audit | Drops lessons too close to the held-out report card, and flags poisoned ones. |
| Shape validation | Checks the format and every tool call against the tool's real shape. |
| Execution check | Runs the code and tool calls in the sandbox; only what works passes. |
| Teacher scoring | The teacher rates each lesson and saves its odds. |
| Quality gate | Sends weak lessons to repair: unsure odds, odds that disagree with the answer, contradictions, rambling, wrong shape, or nothing to check it against. |
| Repair | Doctors a weak lesson (up to 5 tries): reasoning between steps, a wrong tool swapped, missing steps filled. Then it's re-run and re-gated. |
| Coverage check | Checks the balance: every tool at least 40 times, each style, and the share of multi-step jobs. |
| Preference pairs | Pairs each repaired lesson with its original. |
| Version | Saves the set with its hash, parent and change list. |

Repair, not discard: a lesson the gate stops goes to the repair queue, not the bin. It goes back only if the fixed
version passes the gate, and the original is kept only as the wrong half of a preference pair, never as a right
example. Only lessons that can't be repaired are dropped (poisoned, or too close to the held-out report card), each
with its reason logged. The report shows, per step: in, kept, repaired, paired, dropped, and the top reasons.

### The nightly learning loop (pipeline)

Off by default. One saved pipeline that lets Bob learn from his own day, in two layers.

**Fast layer: memory, no training, works the same day.** These parts exist today, each off by default; the loop
switches them on together and feeds them:
- **Fix notes** (`src/tool-learn.js`): when a tool fails and then works, one line on what fixed it rides on that
  tool next time.
- **Fact memory** (`src/recall.js`): facts Bob saves are recalled only when they fit the message.
- **Tool record** (`src/tool-record.js`): every call word for word, the loop's raw material.

**Slow layer: a LoRA add-on, trained at night.** Each night:

| Step | (i) Plain words |
|---|---|
| Collect | Takes the day's tool record. |
| PII scrub | Removes names, paths and keys. |
| Error-driven correction | Turns each failure into a corrected lesson (#228 format). New lessons only, never held-out ones. |
| Data refinery | Runs the new lessons through the refinery above. |
| Replay mix | Adds a slice of older lessons so other skills aren't forgotten. |
| LoRA | Trains a small add-on on a rented card, after its smoke test. |
| Held-out eval | Scores the add-on on the report card against the one in use. |
| Swap | Puts the new add-on in only if it scores better and the owner says go. |

Rules: the rental needs the owner's typed go (once per night, or a standing go with caps the owner types). Nothing
from surgery, steering or sweeps trains. Every add-on is kept, so any night can be rolled back with one press. If a
night's add-on scores worse, it's kept for the record and not used. Until engine patch 0016 (adapter at load) is
built, "swap" means baking the add-on into a new copy of the brain; after it, the add-on loads beside the brain and
turns on or off live.

### Pipelines

A pipeline is a saved list of steps with their settings, `<data>/lab/pipelines/<name>.json`. The page offers:

- **One step.** Pick a step, fill its form, run it.
- **The whole protocol.** All stages in order, with any step ticked off.
- **From a past run.** Copy a run's settings and change what you like.

Local steps run one at a time, like Lab jobs today. Rented steps in a row are packed into one Forge plan, so the card
starts once. The plan's caps (hours and dollars) are typed by the owner and start at $0, as today.

### The run record

Every step run writes `<data>/lab/runs/<run>/run.json`:

```json
{
  "id": "run-...", "step": "evil-steer", "pipeline": "riker-clean-first", "bob": "1.5.226",
  "settings": { "scales": [-10, -5, 5, 10] },
  "inputs": [{ "kind": "brain", "id": "sha256:..." }, { "kind": "pairs", "id": "sha256:..." }],
  "outputs": [{ "kind": "direction", "id": "sha256:...", "neverTrain": true }],
  "smoke": { "ok": true, "seconds": 41 },
  "state": "done", "started": "...", "ended": "...",
  "scores": { "harsh": 0.12, "refuse": 0.4 },
  "cost": { "card": "A40", "minutes": 52, "usd": 0.38, "from": "rental record" }
}
```

The log sits beside it, scrubbed. Bob's data index (`<data>/lab/index.json`) lists every output by hash, kind,
parents and tags. Lesson sets are outputs like any other, so a set's versions and change lists come for free.

## 4. The page

A new **Steps** tab beside Make a brain, and the Forge's "The training protocol" moves into it.

- **Steps**: the step list grouped by stage. Each card shows the step's name (linked to the glossary), an (i) with
  the plain sentence, where it runs, what it takes and makes, and a Run button. Professional also shows the exact
  command.
- **Pipelines**: build, save and run a pipeline. Each row shows its state, its next step and its cost so far.
- **Runs**: every run, newest first, with filters (step, brain, state). Tick two or more to compare: settings and
  scores side by side, differences marked. A chart per pipeline shows each target's score after every stage.
- **Data**: every output, with its family tree, tags and where it's used. A never-train item says so in words.

The (i) is a real button: it shows its sentence on mouse-over, on keyboard focus and on tap, and screen readers read
it as the control's description. Settings stay visible, as Bob's other panels are, and the tab goes in `public/settings-map.js`. Every control has a
label and works by keyboard. Charts have a table view for screen readers. The tab works the same on Windows, Mac and
Linux. The Android app has no Lab of its own, so the phone shows Runs and Data from the computer's Bob to read,
and starting a step stays on the computer.

Help, in Bob's voice, gets one page per step, a glossary entry for each proper name, and FAQs: "Why did my step
stop before it started?" (the smoke test), "Why can't I train on this?" (never-train), "What does a run cost?".

## 5. The plan, in order

Each slice is one release, built through bob-wip, the builder and the PC check.

1. **Land the stack.** #189, #222 (with #226 and #227) and #225 hold most of the scripts. They need to reach main
   before the Lab can call them. Builder merges them as one release, with no Lab changes. Nothing rents.
2. **Foundation.** `src/lab-steps.js` (the step list), the runner with smoke-first and stop-by-id, the run record,
   the data index, never-train tags. The existing three protocol tools move onto it. The "Try it first" vector fix.
   Tests use fakes for the card, the engine and the key store.
3. **Wire every existing script as a step.** All of section 3's rows whose script exists. Each with its smoke form,
   a dry run against the fake engine, and its Help page.
4. **Runs and comparison.** The Runs page, compare, charts, cost per run from the rental record, "run again".
5. **Pipelines.** Save, pack rented steps into one plan, pick up where it stopped.
6. **New methods.** The data refinery (with doctoring and odds sorting from #228), then the nightly learning loop, then HF staging, then
   patching, then SAE features.
   Each gets its own small design first.

What needs the owner: the go on this order, and later the usual typed go for any rental, upload or delete. No
slice rents anything to test itself; dry runs use fakes, and the first real use of a step is a normal approved run.
