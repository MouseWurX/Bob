# Roadmap: one all-round Bob (14 Nov 2026)

A plan only. Nothing here trains, rents, uploads or changes Bob without the owner's typed go, in the thread doing it.
There's a spending freeze on rentals until 15 Nov, except for runs already approved (tonight's Riker and Bobert card).

**The goal.** One brain that:

- is good at agent work (plans, uses tools, checks results, finishes the job),
- writes and fixes code,
- holds a good conversation,
- **looks things up when it isn't sure** instead of guessing,
- helps with 3D models, games and assets in Blender and Unreal through Python scripts.

**How we get there, in one line.** Learn exactly how today's brains fail with tools (stage 0), pick the tool shape
each brain family handles best (1), build the lesson-making tools and a fixed test set (2), write the lessons (3),
clean the big stock Qwen without cutting it (4), train the full model in three rounds where each round's failures become the next
round's lessons (5 and 6), then blend and cut into smaller versions (7) and publish (8). Steering research runs beside it
the whole way as a microscope, never as training data.

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

One fixed, held-out test set, frozen in stage 2 and run on the stock brain first. Every later step is scored against
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

## Stage 1. Pick each family's tool shape

- **Goal:** each brain family (Qwen, GPT-OSS, and any new family) gets the tool wording and shape it handles best,
  detected from the brain file's chat template, with Bob's own tools and a one-time probe for anything unknown
  (PR #219, ready-made tools study).
- **What gets decided:**
  - per family: the wording parts that won the A/B (`usewhen`, `paths`, `act`, `slash`, `example`, `fewer`, `par`),
    thinking on or off for tool jobs, head start or not, one tool per step or not;
  - whether GPT-OSS gets its ready-made tools (browser, apply_patch, python) beside Bob's own. They switch on only
    after a test shows fewer mistakes. The engine first needs a small fix so GPT-OSS's built-in browser calls aren't
    dropped;
  - the save path and name inputs for make_diagram, save_as, make_image, make_sound and convert_file.
- **Rule:** tool shapes that already work (about 9 in 10 right in both thinking modes) stay as they are.
- **Depends on:** stage 0 results.
- **Measured by:** the tools lines of the report card, per family, before and after. Ships as a reliability fix
  (on by default) only if no family gets worse.
- **Cost:** about $0 to build. One short confirm run of the picked shapes on an A40, about 1 h, under $2.
- **Go point A:** the owner picks the shapes (a short card per family with the numbers).
- **Note:** the tool record archives itself when tool shapes change (`tool-sets.js` shape stamp), so old history is
  kept for lessons and the live record starts fresh.

## Stage 2. Build the lesson tools and freeze the report card

- **Goal:** every piece in TOOL-LESSONS-PLAN section 8 is built, tested with fakes, and proven on a small dry run, so
  the big write can start the day the shapes are picked.
- **Pieces:** `make-fix-lessons.mjs`, `lesson-ledger.mjs` (one ledger, never-taught list), `search-pairs.mjs`,
  `write-lessons.mjs` fixes (realistic fake results, reviewer without the phantom JSON rule), `convert-lessons.mjs`
  (one uniform suite, Kimi's 1,171 traces included), `guided-lessons.mjs` (failed try kept but masked),
  `style-routes.mjs` (five versions, two or three routes, second tries), `import-open-sets.mjs`,
  `tutorial-lessons.mjs` (licence check, headless Blender and Unreal runs, version tag), and the search line in
  `tool_reward.py`.
- **Also:** write and freeze the report card's new sets (coding, Blender, Unreal, injection) and put them on the
  never-taught list before a single lesson is written.
- **Depends on:** stage 1 for the final shapes. Everything else can start now.
- **Measured by:** `npm test` with fakes; a dry run of about 50 lessons per piece, read by hand for shape and honesty;
  the style check (each style really shows in its lessons).
- **Cost:** $0 (built in the cloud, no card). Headless Blender checks run in the cloud on the CPU. Unreal checks need
  an editor: a rented Windows or Linux machine, or the owner's PC only if they say so.
- **Go point:** none to build. Merging a piece into Bob goes through the usual release path.

## Stage 3. Write round 1's lessons (rental)

- **Goal:** round 1's set, per TOOL-LESSONS-PLAN section 6:
  - about **6,000 tool lessons in each of 5 versions** (base Bob plus Raider, Watson, Sherlock and Vulcan), at least
    half with two or more steps, every Bob tool in at least 40 lessons;
  - doctored failures with plain-words reasoning between the steps, wrong-tool fixes, guided lessons for what was
    never solved, second tries;
  - scored right and wrong pairs (about 1,000 per version), search and don't-search pairs (about 2 to 1);
  - course-style coding set A, each lesson's code run and its tests passing;
  - Blender and Unreal set A (about 600 and 400: objects, materials, export; actors and assets), every script run
    headless;
  - the general slice (40 to 50% of the round) from Bob's cleaned v4 set, a different slice each round.
- **Teacher:** stock Qwen3.6-35B-A3B for tool jobs (GPT-OSS is weak at Bob's tools and can't hold a style under
  Bob's full prompt). Every row keeps the teacher's top-K odds.
- **Depends on:** stages 1 and 2.
- **Measured by:** the code checker (`tool-judge.mjs`) passes every kept lesson; the overlap check against every test
  set; counts per tool, job and step length against the targets; a hand-read sample of 100.
- **Cost (rough):** on past runs an H200 at $5.29/h wrote about 1,700 lessons an hour (2,898 in 1.7 h on 6 Nov).
  About 30,000 tool lessons plus pairs and the teacher odds pass is about 18 to 25 h, **about $95 to $135**.
  Cheaper cards are possible but slower; the plan will say which card before the go.
- **Go point B:** a go to write the round 1 set on a rental, with the card, hours and dollar cap on the card.

## Stage 4. Clean the big stock Qwen first (no cut yet)

- **Goal:** a fresh start. Not more training on Riker or Bobert, but the stock Qwen3.6-35B-A3B, measured, studied and
  cleaned first, so nothing old is carried in. Order: **clean first, then train the full model, then cut** (the cut
  comes after training, in stage 7, so the cut keeps what training taught).
- **Steps (protocol, PR #201, benchmark after each):**
  1. baseline and odds on the fixed sample set, with the report card;
  2. clean-first surgery tried **live only** and recorded (it never trains, and nothing is baked without a go);
  3. analysis: REAP lists, experts by layer, per-skill expert counts including the new targets (tools, search,
     Blender, Unreal, coding). These counts guide the later cut.
- **Depends on:** stage 2's report card. Can run before or after stage 3.
- **Measured by:** report card on the stock brain (this is the baseline every later step must beat); expert counts
  saved with the data.
- **Cost (rough):** baseline, odds and counts about 2 to 3 h on an H200, **about $11 to $16**.
- **Go point C:** a go for the rental, and a go before any clean-up is baked in.

## Stage 5. Train round 1

- **Goal:** the first all-round Bob, trained on the full cleaned brain (no cut).
- **Steps (protocol):** heal (teacher odds, distillation) on round 1's lessons and the general slice; preference pass
  (ORPO in the heal, or DPO or KTO after it) on the scored pairs; on-policy finish (the student writes, the teacher
  grades every word); reward pass (`grpo.py`) with the tool rule and the new search line; multi-target guard drops any
  step that makes a target worse.
- **Depends on:** stages 3 and 4.
- **Measured by:** report card after every step; kept only if no line drops against the stock baseline and against
  Riker and Bobert as they are today.
- **Cost (rough):** Bobert's full pass was about 10 h of training and $109 in all for 9,000 lessons. Round 1 is about
  11,000 to 12,000 lessons for base Bob, plus the preference, on-policy and reward passes: about 18 to 24 h on an
  H200, **about $95 to $130** for base Bob.
- **Styles:** each style is its own model, trained after base Bob's round passes. On the same base and lessons each
  is a shorter run. Rough guess **$40 to $60 per style**; whether they train every round or only at the end is the
  owner's call (go point D).
- **Go point D:** a go per training run, with the card and the cap.

## Stage 6. Self-play, then rounds 2 and 3

- **Goal:** each round fixes what the last one still gets wrong, and nothing is taught twice.
- **Each round:** the new brain works through fresh requests on the rental; the checker grades them; what it gets
  right can be on-policy examples, what it gets wrong becomes new look-alike lessons (guided where it never
  recovered). Then write, train and measure as in stages 3 and 5.
  - Round 2: rigs, modifiers, Geometry Nodes; levels, Blueprints from Python, batch imports; coding set B; search set B.
  - Round 3: the hardest long jobs (4 to 6 calls), whole Blender-to-Unreal jobs (make, check, export, place in a
    level); coding set C; search set C.
- **Depends on:** the round before passing.
- **Measured by:** report card; a round is kept only if no line drops.
- **Cost (rough):** about **$150 to $250 per round** for base Bob (self-play, writing and training), plus styles if
  chosen.
- **Go point E:** a go per round.

## Stage 7. Blend, live dials, small versions

- **Goal:** the best mix of the rounds, tuned live, then the cut: smaller Bobs for smaller machines.
- **Steps:** blends (`merge.py`: linear, TIES, DARE) of round checkpoints, kept only if the report card holds;
  live dials (experts per word, expert and head dials, steering directions) tried in the engine and measured on the
  report card. **Nothing is baked into the weights without the owner's go.** Then the cut and the ladder: a coverage cut of the final brain
  that protects every target's experts, then smaller cuts (the Bill, Homer, Milo sizes), each healed on its parent's odds.
- **Depends on:** stage 6, and stage S (below) for which dials are worth trying.
- **Measured by:** report card per blend and per ladder rung; fits-the-PC line for each size.
- **Cost (rough):** blends run on a CPU (cheap); each small version about $50 to $100 (Bill's full run was $96).
- **Go point F:** a go per blend kept, per bake, per small version.

## Stage 8. Publish

- **Goal:** the new Bob, his cards and his lesson sets published, and the study write-ups (interviews, surgery
  attempts) as study material.
- **Steps:** scrub, model cards with credit (Alibaba Apache 2.0, Dennis E. Taylor for the names, not affiliated; Moonshot
  AI and Lambda for the converted Kimi traces; each open set's licence), Hugging Face upload, Bob's catalogue entry,
  costs page and README refreshed.
- **Depends on:** stage 7.
- **Measured by:** the scrub check passes; the card's numbers match the report card.
- **Cost:** about $5 to $10 of card time for the export and upload.
- **Go point G:** a typed go before any upload.

## Stage S (beside everything). Steering research as a microscope

- **Goal:** understand where habits live in the brain, so cuts protect the right parts and live dials can fix a habit
  without retraining.
- **Now:** the cruel-direction steering sweep (PR #226) and the expert and neuron sweep (PR #227) on Riker tonight.
  Next ideas (patching, sparse-autoencoder features) are planned in the steering study thread.
- **Feeds:** stage 4 (which experts to protect), stage 7 (which dials to try), and the study write-ups.
- **Rule:** findings are records. They never become training data. A dial can be used live in the engine; a bake
  needs a go.
- **Cost:** rides other rentals where it can; each extra run is its own go.

## Rough total

| | Rough cost |
|---|---|
| Stages 0 to 2 | about $10 (stage 0 already approved) |
| Stages 3 to 5, round 1, base Bob | about $200 to $280 |
| Rounds 2 and 3, base Bob | about $300 to $500 |
| Four style models | about $160 to $240 per time they're trained |
| Blends, small versions, publish | about $60 to $200 |
| **Base Bob, all three rounds and published** | **about $570 to $990** |

These are guesses from past runs (H200 at $5.29/h). Each go card gives the real card, hours and cap.

## Go points at a glance

| | Go point | When |
|---|---|---|
| A | Pick each family's tool shape | after tonight's interviews |
| B | Write round 1's lessons on a rental | after stage 2's dry runs |
| C | Clean-first rental, then any bake | any time after stage 2 |
| D | Each training run (base Bob, then styles) | after B and C |
| E | Each later round | after the round before passes |
| F | Each blend kept, each bake, the cut size, each small version | after round 3 |
| G | Any upload | before publishing |

## Where the pieces are

- Lesson plan: [TOOL-LESSONS-PLAN.md](TOOL-LESSONS-PLAN.md) (PR #228)
- Tool sets per family: [TOOL-SETS.md](TOOL-SETS.md) (PR #219)
- Training methods: Forge README, Build 22 (PR #201)
- Interviews: PRs #222 and #225
- Steering: PRs #226 and #227
- Costs so far: [COSTS.md](COSTS.md)
