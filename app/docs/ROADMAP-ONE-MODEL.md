# Roadmap: one all-round Bob, starting with a new Bobert (14 Nov 2026)

A plan only. Nothing here trains, rents, uploads or changes Bob without the owner's typed go, in the thread doing it.
There's a spending freeze on rentals until 15 Nov, except for runs already approved (tonight's Riker and Bobert card).

**The goal.** One brain that:

- is good at agent work (plans, uses tools, checks results, finishes the job),
- writes and fixes code,
- holds a good conversation,
- **looks things up when it isn't sure** instead of guessing,
- helps with 3D models, games and assets in Blender and Unreal through Python scripts.

**First deliverable: a new Bobert.** A fresh start on the stock Qwen3.6-35B-A3B (the same base and size as today's
35Bob Bobert, the full model with no cut), cleaned first, then trained on the new lessons. Today's Bobert was trained
on poisoned data, so **the starting point must be clean**: stock weights downloaded fresh, nothing inherited from
today's Bobert, Riker or Bill (no weights, adapters, merges, keep lists or saved odds), and every old lesson set
audited for the poison before any of it is reused. Everything in part 1 serves
that one brain. Everything else (more rounds, the styles, blends, smaller versions, other brain families, publishing)
waits in part 2 until the new Bobert works.

**Part 1, in one line.** Learn how today's brains fail with tools (stage 0), pick the Qwen tool shape (1), build the
lesson tools and a fixed test set (2), audit the old lessons for poison (2b, a gate), write round 1's lessons for base Bob only (3), clean the stock Qwen (4), train
the full model (5). Done when the new Bobert beats today's Bobert on the report card with no line worse.

## The rules every stage keeps

- **Nothing trains or rents without a go.** Each go point is listed per stage and again in the table at the end.
- **Surgery data never trains.** Cuts, dials, masks, steering directions and evil-check answers are kept as records
  and can be published as study material. They never go into lessons, odds or preference pairs (`notForTraining`).
- **Heavy tests run on rentals, never the home PC.** The home PC only runs small checks, and only when it's free.
- **Every rental proves each step in its first minutes.** Smoke gates exit 86 and the pod deletes itself when a step
  can't run.
- **Held-out tests are never taught.** Test items join the never-taught list; lessons are new look-alikes only.
- **Honest results.** Every report says what really ran, what was skipped and why.
- **Scrub first.** The owner's name, file names and paths, email addresses, IP addresses, device names and keys come
  out before anything is kept or shared.
- **Styles stay separate.** Raider, Watson, Sherlock and Vulcan each train their own model, never merged into Bob.

## How every stage is measured: Bob's report card

One fixed, held-out test set, frozen in stage 2 and run on stock Qwen and today's Bobert first. Every later step is scored against
it. A step is kept only if **no line drops** (within noise, the same rule as the multi-target guard in `pod/targets.py`).

| Line | What it checks | Where it comes from |
|---|---|---|
| Tools, one step | Right tool, right inputs, thinking on and off | tool-score held-out rows, per family wording |
| Tools, many steps | Plans, reads each result, checks before claiming, finishes every asked thing | interview test turns (Riker, Bobert), held out |
| Look it up when unsure | How often he searches when he'd have been wrong (up), how often he searches a sure fact (stays low) | top-K odds x checker, four boxes (TOOL-LESSONS-PLAN section 4) |
| Knowledge quiz | Plain right answers; must not drop when searching goes up | `quiz-items.mjs`, Riker's 310 stock items |
| Coding | Held-out course-style tasks: write, run, fix; pass = the task's tests pass in a sandbox | new set, written once, never taught |
| Blender | Held-out asks; the script runs with `blender --background --python` and the check finds the right objects and files | new set, tagged with the Blender version |
| Unreal | Held-out asks; the script runs in the editor's command-line Python; the check reads the level or assets | new set, tagged with the Unreal version |
| Conversation | Judged side by side against the stock brain on held-out chats (warmth, clarity, honesty) | held-out 5% of lessons |
| Safety | Refusals kept where they should be; planted instructions in pages and files are not followed | refusal probes, injection set |
| Fits the PC | Speed and memory at Q4 and Q3 on a 16 GB card, long context still works | home benchmark, light, only on the owner's go |

Public benchmarks (BFCL, tau-bench and the like) can be added as extra lines. They are test only and join the
never-taught list.

# Part 1. The new Bobert

## Stage 0. Learn how today's brains fail with tools (tonight, approved)

- **Goal:** know, per brain family, which tool shapes work, which fail and why.
- **What runs:** the Riker tool interview (PR #222) and then Bobert's (PR #225) on one rented A40: wording A/B,
  thinking on and off, the "Plan: 1." head start, experts per word 6 to 12, then the interview on 9 tool groups.
  The steering study (PR #226) and the expert and neuron sweep (PR #227) ride the same card.
- **Depends on:** nothing new. Already running.
- **Measured by:** per-family tallies of right tool, right inputs, no call, wrong tool, and what each brain "reaches
  for" (natural tool names and arguments). GPT-OSS's full interview from 13 Nov is the third family.
- **Cost:** already approved, A40 at about $0.59/h, caps $5.50 (Riker plus steering) and $9 in total with Bobert.
- **Go point:** none new.

## Stage 1. Pick the Qwen tool shape

- **Goal:** the tool wording and shape the Qwen family handles best, since the new Bobert is a Qwen. Other families
  (GPT-OSS's ready-made tools, new families) move to part 2.
- **What gets decided:** the wording parts that won the A/B (`usewhen`, `paths`, `act`, `slash`, `example`, `fewer`,
  `par`), thinking on or off for tool jobs, the "Plan: 1." head start or not, one tool per step or not, and the save
  path and name inputs for make_diagram, save_as, make_image, make_sound and convert_file.
- **Rule:** tool shapes that already work (about 9 in 10 right in both thinking modes) stay as they are.
- **Depends on:** stage 0 results for Riker and Bobert.
- **Measured by:** the tools lines of the report card, before and after.
- **Cost:** about $0. One short confirm run on an A40, about 1 h, under $2.
- **Go point A:** the owner picks the Qwen shape (one card with the numbers).
- **Note:** the tool record archives itself when tool shapes change, so old history is kept for lessons.

## Stage 2. Build the lesson tools and freeze the report card

- **Goal:** only the pieces round 1 needs, built, tested with fakes, and proven on a small dry run.
- **Pieces:** `make-fix-lessons.mjs`, `lesson-ledger.mjs` (one ledger, never-taught list), `search-pairs.mjs`,
  `write-lessons.mjs` fixes (realistic fake results, reviewer without the phantom JSON rule), `convert-lessons.mjs`
  (one uniform suite, Kimi's 1,171 traces included), `guided-lessons.mjs` (failed try kept but masked),
  `tutorial-lessons.mjs` (licence check, headless Blender and Unreal runs, version tag), and the search line in
  `tool_reward.py`. Routes and second tries go in `write-lessons`; the five style versions wait for part 2.
- **Also:** write and freeze the report card's new sets (coding, Blender, Unreal, injection) and put them on the
  never-taught list before a single lesson is written.
- **Depends on:** stage 1 for the final shape. Everything else can start now.
- **Measured by:** `npm test` with fakes; a dry run of about 50 lessons per piece, read by hand.
- **Cost:** $0 (built in the cloud, no card). Headless Blender checks run in the cloud on the CPU. Unreal checks need
  an editor: a rented machine, or the owner's PC only if they say so.
- **Go point:** none to build.

## Stage 2b. Poison audit of the old lessons (gate)

- **Goal:** no poisoned lesson reaches the new Bobert. Nothing old is converted, sliced into the general mix or
  turned into pairs until its set passes.
- **What's audited:** every old set that could be reused: Bob's own sets (v3 on Hugging Face and the cleaned v4), the
  PC-only sets (facts-r2, the 538 base set, the outside sets), the Kimi traces, the GPT-OSS v5 lessons and rejects,
  and the saved teacher odds.
- **What counts as poison** (known kinds; the owner can add more):
  - lessons that pretend: a hand-off or a made-up tool result instead of doing the work (37% of the old coding set),
    bare "Done." results, claims of steps that were never called;
  - wrong answers kept as right (the reviewer's phantom "JSON format" rule, teacher mistakes);
  - anything from surgery, dials, steering or evil checks (must be `notForTraining`);
  - test items or near copies (held-out 5%, quiz, Riker's 310, interview turns, `eval/` folders);
  - planted instructions followed as orders, refusals taught where help was right or help where refusal was right;
  - anything the scrub missed;
  - **anything made by or scored by today's Bobert, Riker or Bill** (their answers, odds or reviews), since they carry
    the poison.
- **How:** a checker in code (`audit-lessons.mjs`, tested with fakes) flags each row by kind, then a hand-read sample
  of each set. Each set gets one of three marks: **clean** (usable), **mend** (only flagged rows are rewritten by the
  stock teacher and checked again) or **drop**. Originals are never altered; the audited copy is a new version with
  a list of what changed.
- **Gate:** stage 3 does not start until every set it draws from is marked clean or mended, and the audit report is
  in front of the owner. If a set's poison can't be found reliably, it's dropped, not guessed.
- **Cost:** $0 (cloud CPU). A mend pass, if needed, rides stage 3's card.
- **Go point B0:** the owner reads the audit report and says which sets may be used.

## Stage 3. Write round 1's lessons for base Bob (rental)

- **Goal:** round 1's set, base Bob only (the styles wait for part 2):
  - about **6,000 tool lessons**, at least half with two or more steps, every Bob tool in at least 40 lessons;
  - doctored failures with plain-words reasoning between the steps, wrong-tool fixes, guided lessons for what was
    never solved, two or three routes per request, second tries;
  - about 1,000 scored right and wrong pairs, plus search and don't-search pairs (about 2 to 1);
  - course-style coding set A, each lesson's code run and its tests passing;
  - Blender and Unreal set A (about 600 and 400: objects, materials, export; actors and assets), every script run
    headless;
  - the general slice (40 to 50% of the round) from the sets that passed the audit only.
- **Teacher:** stock Qwen3.6-35B-A3B, the same fresh download. Every row keeps the teacher's top-K odds. No odds or
  reviews from today's Bobert, Riker or Bill.
- **Depends on:** stages 1, 2 and the 2b gate.
- **Measured by:** `tool-judge.mjs` passes every kept lesson; the overlap check against every test set; counts per
  tool, job and step length; a hand-read sample of 100.
- **Cost (rough):** past runs wrote about 1,700 lessons an hour on an H200 at $5.29/h. About 6,000 tool lessons plus
  pairs, routes and the teacher odds pass is about 5 to 8 h, **about $25 to $45**.
- **Go point B:** a go to write the set on a rental, with the card, hours and cap.

## Stage 4. Clean the stock Qwen first (no cut)

- **Goal:** a fresh start, not more training on today's Bobert. The stock Qwen3.6-35B-A3B, measured, studied and
  cleaned first. Order: **clean first, train the full model, cut later** (part 2), so a cut keeps what training taught.
- **Fresh weights:** stock Qwen3.6-35B-A3B downloaded fresh from Alibaba's own repository on the rental, its file
  hashes checked against the published ones and saved with the run. No weights, adapters, merges or keep lists from
  today's Bobert, Riker or Bill are on the card.
- **Steps (protocol, PR #201, benchmark after each):**
  1. baseline and odds on the fixed sample set, with the report card, on stock Qwen. Today's Bobert is only
     **measured** for comparison (the bar to clear); nothing of his is used;
  2. clean-first surgery tried **live only** and recorded (it never trains, and nothing is baked without a go);
  3. analysis: REAP lists, experts by layer, per-skill expert counts including the new targets.
- **Depends on:** stage 2's report card. Can run before, after or on the same rental as stage 3.
- **Measured by:** the report card itself; expert counts saved with the data.
- **Cost (rough):** about 2 to 3 h on an H200, **about $11 to $16** (less if it shares stage 3's card).
- **Go point C:** a go for the rental, and a go before any clean-up is baked in.

## Stage 4b. Layer-freezing trial (before the full training)

- **The question:** can Bobert learn tools without losing what he knows? Two arms, trained on the same small slice
  of round 1 (about 2,000 lessons, tool-heavy plus the new Blender and Unreal facts, always mixed with general
  lessons), from the same fresh, cleaned weights:
  - **(a) Lower layers mostly locked.** LoRA on the upper-middle layers for tool lessons. The lower layers are
    unlocked only gently, at a low learning rate, for new-fact lessons such as the Blender and Unreal APIs. The
    router keeps its own low rate.
  - **(b) Everything trained**, today's way (`heal.py` as it is).
- **Mixed, not alternating.** Both arms mix tool, fact and general lessons in every batch, rather than switching
  between locked and unlocked phases. Phases tend to forget whatever the last phase didn't train.
- **Measured by:** the same held-out report card for both, with a **lost-knowledge line** added: the quiz,
  the knowledge-heavy held-out chats, and how far each arm's next-word odds drift from stock Qwen on general text.
  The winner is the arm with the best tool score and the least loss. It sets how stage 5 trains.
- **Needs building first:** `heal.py` has no per-layer lock yet. It needs a `--lock-below` layer number and a
  per-layer learning rate (tested on the tiny CPU model in `selftest_training.py`). About $0.
- **Cost (rough):** two short runs of about 3 h each on an H200, **about $30 to $40** (both can share stage 4's card).
- **Go point C2:** a go for the trial rental.

## Stage 5. Train the new Bobert

- **Goal:** the new Bobert: the full cleaned 35B from the fresh download, trained on round 1's audited lessons.
- **Steps (protocol):** heal (teacher odds, distillation) on round 1's lessons and the general slice; preference pass
  (ORPO in the heal, or DPO or KTO after it) on the scored pairs; on-policy finish (the student writes, the teacher
  grades every word); reward pass (`grpo.py`) with the tool rule and the search line; the multi-target guard drops
  any step that makes a target worse.
- **Depends on:** stages 3, 4 and the 4b trial (which picks locked or all layers).
- **Measured by:** report card after every step. **Done when** it beats today's Bobert on the tool, look-it-up,
  coding and Blender/Unreal lines with no line worse than stock Qwen or today's Bobert, and runs on the home PC at Q3
  or Q4 (today's Bobert does about 130 words a second at Q3).
- **Cost (rough):** today's Bobert was about 10 h of training and $109 in all for 9,000 lessons. Round 1 is about
  11,000 to 12,000 lessons plus the extra passes: about 18 to 24 h on an H200, **about $95 to $130**.
- **Then:** Q4 and Q3 home, a light home test on the owner's go, and it becomes Bob's default only on the owner's go.
- **Go point D:** a go for the training run, with the card and the cap.

**Part 1 total, rough: about $160 to $230** (plus tonight's approved $9).

# Part 2. After the new Bobert works

In rough order. Each step starts only after the one before it, and each has its own go.

## Stage 6. Rounds 2 and 3 on Bobert

- **Each round:** the new Bobert works through fresh requests on the rental; the checker grades them; what he gets
  right can be on-policy examples, what he gets wrong becomes new look-alike lessons (guided where he never
  recovered). Then write, train and measure as in stages 3 and 5. Nothing is taught twice (the ledger).
  - Round 2: rigs, modifiers, Geometry Nodes; levels, Blueprints from Python, batch imports; coding set B; search set B.
  - Round 3: the hardest long jobs (4 to 6 calls), whole Blender-to-Unreal jobs; coding set C; search set C.
- **Kept** only if no report card line drops. **About $120 to $180 per round.** **Go point E** per round.

## Stage 7. The styles

Raider, Watson, Sherlock and Vulcan, each its own model from the new Bobert, never merged into him. Their lesson
versions are written then (`style-routes.mjs`, the style check first). About $40 to $60 per style. **Go point F.**

## Stage 8. Blends, live dials, the cut and smaller Bobs

Blends of round checkpoints (`merge.py`), live dials tried in the engine (nothing baked without a go), then a
coverage cut of the final Bobert and the ladder (the Bill, Homer, Milo sizes), each healed on his parent's odds.
About $50 to $100 per small version. **Go point G** per blend kept, bake, cut size and small version.

## Stage 9. Other brain families

GPT-OSS's ready-made tools (browser, apply_patch, python, after the engine fix so its browser calls aren't dropped)
and detection for new families, from the ready-made tools study and PR #219. Switched on only after a test shows
fewer mistakes.

## Stage 10. Publish

Scrub, model cards with credit (Alibaba Apache 2.0; Dennis E. Taylor for the names, not affiliated; Moonshot AI and
Lambda for the converted Kimi traces; each open set's licence), Hugging Face upload, catalogue, costs page and
README. About $5 to $10. **Go point H:** a typed go before any upload.

## Stage S (beside everything). Steering research as a microscope

- **Goal:** understand where habits live in the brain, so cuts protect the right parts and live dials can fix a habit
  without retraining.
- **Now:** the cruel-direction steering sweep (PR #226) and the expert and neuron sweep (PR #227) on Riker tonight.
  Next: live patching one layer at a time and sparse-autoencoder features at layers 10, 20 and 30 on Riker
  (draft PR #232, `plans/riker-interp.json`, its own small rental of about 1.5 h with a $1.50 cap). It comes after
  the steering and sweep results and waits on the owner's typed go in the steering thread.
- **Feeds:** stage 4 (what to clean), stage 8 (which dials to try and which experts a cut must protect), and the study write-ups.
- **Rule:** findings are records. They never become training data. A dial can be used live in the engine; a bake
  needs a go.
- **Cost:** rides other rentals where it can; each extra run is its own go.

## Go points at a glance

| | Go point | When |
|---|---|---|
| A | Pick the Qwen tool shape | after tonight's interviews |
| B0 | Which old lesson sets may be used (poison audit report) | after stage 2b |
| B | Write round 1's lessons on a rental | after B0 |
| C | Clean-first rental, then any bake | any time after stage 2 |
| C2 | Layer-freezing trial | after C |
| D | Train the new Bobert; make him the default | after B and C |
| E | Each later round | after the new Bobert works |
| F | Each style model | after the rounds |
| G | Each blend kept, bake, cut size and small version | after the styles |
| H | Any upload | before publishing |

Costs are guesses from past runs (H200 at $5.29/h). Each go card gives the real card, hours and cap.

## Where the pieces are

- Lesson plan: [TOOL-LESSONS-PLAN.md](TOOL-LESSONS-PLAN.md) (PR #228)
- Tool sets per family: [TOOL-SETS.md](TOOL-SETS.md) (PR #219)
- Training methods: Forge README, Build 22 (PR #201)
- Interviews: PRs #222 and #225
- Steering and research: PRs #226, #227 and #232
- Costs so far: [COSTS.md](COSTS.md)
