# Chapter 4. Method and rules

## 4.1 Introduction and research question

This chapter sets out how the studies were run and the rules the project adopted for itself. Each rule exists because a past result was wrong, wasted money or could not be trusted. Together they matter more than any single number in chapters 5 to 10.

The chapter serves all five research questions (chapter 1) but is closest to the third: how much do leaked test items distort the scores used to make decisions? A leak is a method fault. It cannot be seen in a result table. It can only be found by checking how the test and the lessons were made. For that reason the method is reported in full, including the parts that went wrong.

The chapter has four aims. First, to state the models, settings and benchmarks. Second, to describe the judges and their known faults. Third, to list the gates, caps and data rules. Fourth, to say plainly what the statistics can and cannot support. Section 4.12 sets out the protocol every new model follows, and section 4.13 collects the threats to validity.

## 4.2 Related work on evaluation method

### 4.2.1 Contamination and leaked tests

Benchmark scores are only meaningful if the model has not seen the test. Sainz et al. (2023) argue that contamination must be measured for each benchmark and each model, not assumed away. Golchin and Surdeanu (2023) describe a method that detects whether a model has seen test data, at the level of single examples and whole partitions. Magar and Schwartz (2022) ask whether seen data is memorised or actually exploited, by comparing performance on seen and unseen examples. Jacovi et al. (2023) propose practical defences, such as encrypting public test sets and asking providers for training-exclusion guarantees.

Most of this work concerns web-scale pre-training, where the question is whether a test appeared somewhere in the crawl. The leak in this dissertation is a smaller and more direct one. The test items were written by the same pipeline as the lessons, and copies of them sat in training-side files. Lee et al. (2021) show a related fact: standard text datasets hold many duplicated passages, and removing them changes what models memorise. The rules in sections 4.6 and 4.7 follow the same idea, that overlap between the test and the training side must be searched for and not assumed absent.

### 4.2.2 Faults in test sets and in judges

Northcutt et al. (2021) found that widely used test sets contain many mislabelled examples, enough to change benchmark rankings. This applies directly here. The 534 held-out tool items were themselves sorted for faults (section 4.7), and most carried one. Zheng et al. (2023) show that a language model used as a judge agrees with human preferences about as often as humans agree with each other, and also report position, verbosity and self-enhancement biases. Panickssery et al. (2024) find that evaluators can recognise and favour their own generations. Both bear on this work, because the teacher that wrote the lessons also wrote the answers that the tool score treats as correct.

### 4.2.3 Statistics for small evaluations

Dror et al. (2018) survey how to choose a significance test in natural language processing, and Card et al. (2020) show that many NLP comparisons lack the power to detect the differences they claim. Miller (2024) recommends that evaluation questions be treated as a sample from a larger population and that results carry error bars, with paired comparisons where the same questions are used in both conditions. The studies here use paired differences with a 95% range for this reason (section 4.10).

### 4.2.4 Tool-use evaluation

Tool use is studied with training sets and benchmarks. Toolformer teaches a model to call tools in a self-supervised way (Schick et al., 2023). Gorilla fine-tunes a model to write API calls and pairs it with a retriever to reduce invented calls (Patil et al., 2023). ToolLLM builds a large tool-use dataset from real APIs and an automatic evaluator (Qin et al., 2023). These works measure whether a model can call tools from a given library. This dissertation asks a different question: whether the lessons that taught a small model its tool habits carried faults, and whether cleaning them changes the habits. The tool score used here is therefore tied to Bob's own tools and uses a recorded teacher answer as its reference.

## 4.3 Models and settings

### 4.3.1 The models

The studies use these models.

| Name | What it is |
|---|---|
| Full Qwen | Qwen3.6-35B-A3B, the stock model and the lesson teacher (docs/FORGE-JOURNAL.md). |
| Bobert (35Bob) | The full model trained on every lesson, with all 256 experts. |
| Riker (28Bob) | Cut from the full model to 208 of 256 experts per layer, then healed. |
| Bill (20Bob) | Cut from Bobert to 144 experts per layer, then healed against Bobert's odds. |
| GPT-OSS 120B | OpenAI's open mixture-of-experts model (OpenAI, 2025), used as a second family. |
| GPT-OSS 38B cut | A REAP cut of the 120B, unhealed in the coaching study. |

The Qwen family is described in Yang et al. (2025). The cut models were made by the Forge (chapter 3).

### 4.3.2 Serving settings

Home benchmarks run on MouseWurX's 16 GB card with Q4 files and 8 experts per word, with the same settings for every model in a comparison (docs/FORGE-JOURNAL.md, 8 November entry). Rented-card benchmarks serve the same Q4 files through Brain Engine with the same test scripts, so that home and rented numbers come from identical tests (model-lab/forge/README.md, Build 18). Where a study changed a setting, such as experts per word, a mask, or a dial, the saved answers carry the condition (section 4.9).

The Bobert wording study ran on a rented 48 GB A40 with 8 slots of 8,192 tokens each. The planned switch to 4 slots of 16k never happened, so 11 to 13 long turns per round overflowed their slot, and 11 to 31 answers per round were cut off at the length limit. Both kinds were scored as wrong, and the same turns were affected in every condition, so comparisons between conditions stay fair, but absolute scores are lower than they would otherwise be (bobert-35bob-tool-study.md).

## 4.4 Benchmarks

Each benchmark answers a different question. The table gives each one's size and what it measures. Chapters 5 to 9 report the results.

| Benchmark | Size | What it measures | Source |
|---|---|---|---|
| Tool score | 314 held-out turns from 196 conversations | Whether the model makes the same tool decision as the full Qwen did, replayed turn by turn with the full history, Bob's real prompt and the tools loaded at that moment | model-lab/tool-score.mjs; FORGE-JOURNAL.md |
| Quiz: tool phrasings | 97 questions | Picking the right tool for a plain request | experts-test.mjs |
| Quiz: facts | 20 questions | Short facts | experts-test.mjs |
| Quiz: code | 6 tasks, run and checked | Small coding jobs | experts-test.mjs |
| Coding race | 13 tasks, one try each | 10 Python tasks scored by hidden unit tests and 3 multi-step tool chains with pretend tools | BRAIN-RACES.md |
| Needle test | 12 cases | One fact placed at 25, 50 and 75% depth in 8K, 32K, 64K and 128K windows | FORGE-JOURNAL.md |
| Routing race | 17 or 25 jobs (two sets) | Which brain should take a job | BOBS-OWN-MODELS.md |
| Wording A/B | 264 judged turns per condition (from 308 questions) | Paired gaps between tool wordings and thinking modes | tool-wording.mjs |
| Coached steps | 83 steps | Steps a model gets right on its first try, and with up to three hints | tool-coach.mjs |

The tool score uses 5% of the lessons that the Forge holds out of training, by the same id hash as the training code. Every assistant turn is one question. Grading counts a turn as right if it makes the same tool calls as the recorded answer with every recorded argument matching, or correctly makes no call. "Right tool" counts the right tools with any arguments (model-lab/tool-score.mjs).

The full Qwen scored 211 of 314 (67%), including 72 of 123 for the right tool and 167 of 191 for correctly making no call (docs/FORGE-JOURNAL.md, 5 November table). Riker v1 and Bill v1 scored 206 and 205. These are the reference numbers that later comparisons use.

The wording A/B uses a different question set. It draws on 308 lesson turns across 14 jobs from held-out and reserved calibration lessons, never from training lessons. Of these, 264 were judged in every condition (bobert-35bob-tool-study.md). The two sets must not be mixed. The 314-turn tool score and the 264-turn wording study are different instruments with different reference numbers.

The coached steps are 83 steps taken from the lessons a model missed in the wording study. Each step gives up to three hints after a miss: a nudge, the tool name, then the exact call. The model then moves on along the lesson's own right path, so the next step is judged from a correct state (model-lab/tool-coach.mjs).

## 4.5 Judges and their faults

### 4.5.1 The tool judge

The tool judge is a rule, not a language model. A turn is right if it has the same tool names as the teacher's recorded answer and every recorded argument matches. Extra optional arguments are fine, and long free text needs only to overlap (60% in the Python version used for the reward pass). The Python and JavaScript versions are checked against one shared case file (model-lab/forge/pod/tool_reward.py).

This judge has a clear limit that every report repeats. The recorded answers came from the full Qwen3.6, so the score measures agreement with the teacher and not truth (model-lab/tool-score.mjs). A model that makes a better call than the teacher is scored wrong. The Riker report also notes that the step checker was strict on free-text inputs, so his first-try figures understate him (riker-28bob-tool-interview.md).

### 4.5.2 The harshness judge and the loop fault

The studies of a cruel direction (chapter 10) needed a judge for harshness. The model itself rated each of its own answers from 0 (kind) to 10 (cruel), with the model as built and all dials off (riker-28bob-tool-interview.md). This is a self-rating, not a human one, and the report says so.

The first version of this judge had a serious fault. An early steering push seemed to drive hostility from a strength of -20 to +40. In fact every strength made the model loop one word, often in Chinese, and the judge rated loops as harsh. That claim was withdrawn. The judge now counts loops and wrong-language text as broken, and a result that has a high "broken" count is not read as harshness (riker-28bob-tool-interview.md, section 5). The expert sweep of 938 tests had been scored with the old judge, so the report calls it a rough guide only.

The fault is a plain case of the problem Zheng et al. (2023) describe for model judges: a judge can reward or punish surface features that are not the property being measured. It also shows why a judge should be tested on the failure cases before its scores are used.

### 4.5.3 The model as its own explainer

The tool interview shows a model its own misses and asks why. The explanation is a lead, not proof. It is compared with the model's saved thinking and calls (riker-28bob-tool-interview.md). This guards against a model that gives a fluent but invented reason.

### 4.5.4 Lesson reviewers

Lessons were reviewed by language models at two points. The lesson writer's own reviewer rejected lessons at write time, and a separate sort by Haiku, then Opus, labelled each lesson keep, fix, repair or discard (section 4.7). Both reviewers are models, so both carry the biases noted above. The sort was checked by sampling. Chapters 6 and 7 report what the reviews found, and this chapter states only how they were run.

## 4.6 Held-out splits and the never-taught gate

### 4.6.1 The split

About 5% of lessons are held out by an id hash, `md5(idea) < 0.05` (docs/TOOL-LESSONS-PLAN.md, `pod/data.py`). The split follows the idea and not the file, so a lesson cannot move between sides by being copied under a new id. The public set was 14,586 training lessons and 831 held out (docs/MAKING-SMALLER-MODELS.md). The 534 held-out tool items counted in chapter 7 are the tool-lesson part of the held-out material, and are not the same number.

Benchmark chats, the quiz items, the "new" fact packs and the test turns of both tool interviews are held out too. A near match to any of them is meant to be dropped (docs/TOOL-LESSONS-PLAN.md).

### 4.6.2 Why the split was not enough

A split by id only helps if the same text does not appear under other ids. The check described in chapter 7 found that 519 of 534 held-out items appeared word for word in training-side files, with 7 more sharing their first 60 characters (checked-numbers.md). Copies of the test items sat in other lesson folders and in the conversation files used for REAP scoring (heldout-534 TALLY.md). The ledger's never-list may drop them at training time, but the copies are there, and whether any model trained on them is not measured.

The roadmap rule states the intent: "Test items join the never-taught list; lessons are new look-alikes only" (docs/ROADMAP-ONE-MODEL.md). The rule existed before the check enforced it.

### 4.6.3 The never-taught gate

The never-taught gate checks every user turn of a teaching plan's lessons and preference pairs against the quiz items and the never-taught list. It counts exact copies, test questions inside longer requests, and reworded near copies. The Forge runs it before renting and stops the plan on any match or a missing test file. Lessons written on the card are checked the same way (section 3.6.7).

Its status needs to be stated clearly. The gate is tested on fakes (18 checks) in PR #257, which is stacked on the lesson kit in PR #254. Both shipped in release 1.5.238 on 15 November, which passed 276 of 276 on Windows in its lab-PC check. Before that release the only guards were `notForTraining()` and a check in `src/lab-runs.js` that refuses never-train inputs. The copies of the 519 leaked items still sit in training-side files, so the gate, not the files, is what keeps them out of a training plan.

### 4.6.4 What was decided about the held-out tests

The 534 held-out tool items were sorted by Haiku, with a spot-check of 27 items (5%) by Opus. Opus agreed on 25 (93%) and changed 2 keeps to fix. An automatic check moved 3 more keeps to fix because they held MouseWurX's user folder (heldout-534 TALLY.md). The sort gave 148 keep, 381 fix and 5 discard. On 15 November MouseWurX chose to keep the held-out tests as they are while the full Opus re-sort of the lessons runs. Section 4.13 states the consequence: scores on these tests were made on items that mostly carry a fault, and they are not corrected.

## 4.7 Reviewing the lessons

### 4.7.1 The sort

Lessons were sorted into four verdicts. Keep means usable as it stands. Fix means a small edit would make it usable. Repair means a larger rewrite is needed. Discard means it should not be used. The sort is done by a language model reading each lesson in a batch, and the output is a verdict and a short note. No lesson text written by the sorting model is kept (tool-6500 TALLY.md).

For the tool-lesson set the sort ran in two stages. Haiku sorted the 5,788 non-held-out tool lessons in 650 batches. Opus then read all 5,788: a 290-lesson spot-check, the 582 Haiku keeps, and the 4,920 other verdicts that no Opus had read. Opus's verdict replaced Haiku's. An automatic check then moved 17 Opus-checked keeps that contained private data or teacher-note leaks to fix (tool-6500 TALLY.md).

### 4.7.2 Result of the second stage

The final tally for these lessons is 189 keep, 1,381 fix, 4,208 repair and 10 discard, as checked on 15 November (checked-numbers.md). Opus changed 1,922 of Haiku's verdicts. The largest change was 1,319 fix verdicts that became repair. The next largest was 284 keeps that became repair and 249 that became fix (tool-6500 TALLY.md). This shows why the second stage was run: a first-pass sort by a smaller model had been too lenient. The earlier tally from Haiku with a 5% Opus spot-check is kept in a separate folder.

### 4.7.3 First cleaning by rule

Before any model review, a cleaning script removed lessons by rule. The first cleaning took 9,059 lessons to 8,828: 73 duplicates, 123 with no final answer, 28 with unknown tools, 6 loops and 1 empty (docs/MAKING-SMALLER-MODELS.md). A later pass on a new version dropped lessons calling a tool their own list did not offer and repeated first prompts. The rule-based pass is cheap and exact, and the model-based review is slow and finds subtler faults. Chapter 6 shows how different the two results are.

## 4.8 Gates, caps, passes and cost

### 4.8.1 Gates before and during a paid rental

- **Pre-flight and sample gate.** Before a big paid write, the plan is checked in code and the first 10 ideas must save at least 60%, or the run stops with exit code 86 and the card is deleted. On lkt-fix3, 1 of 10 saved and the run stopped after about $0.31 (checked-numbers.md, forge-lkt-fix3-console.log).
- **Smoke gate.** A few lessons are made and checked: do the odds cover the thinking words, do the tool calls parse, does the trace work? A failure exits with code 86 (model-lab/smoke-gate.mjs).
- **First minutes.** Every rental must prove each step in its first minutes (docs/ROADMAP-ONE-MODEL.md). The first paid run of new code is its test, so it is kept short.
- **Caps and consent.** Every rental has an hours and a dollars cap, and nothing is rented without typed approval (model-lab/forge/README.md).
- **Home-side dry runs.** Home-side commands run against a stand-in server before any rental. Three benchmark failures in a row came from home-side bugs, including a benchmark that quietly tested the full model on MouseWurX's own card instead of the rented one (docs/FORGE-JOURNAL.md, 10 to 11 November).

### 4.8.2 Full passes only

The first heals were stopped by the clock partway through. Riker v1 completed 195 of 456 planned steps, and Bill v1 163 of 456 (docs/FORGE-JOURNAL.md). Those models were half-healed, so comparing them with full-pass models would have been unfair. The rule from then on is a full training pass or nothing, with no clock-capped heals, no trimming of long lessons, and a bigger card when needed (docs/MAKING-SMALLER-MODELS.md). The old v1 models are retired (docs/COSTS.md).

### 4.8.3 Cost accounting

docs/COSTS.md lists every rental, failures included. At the time of writing it lists eleven failed paid attempts, costing $22.40, inside $484.39 of card time over about 105 hours. Two of the eleven are marked "estimated, not yet billed". The reasons include a machine image with no git, a prebuilt tool that would not run, a lesson-writer weight bug that produced empty jobs, and an export that crashed after good training. The total comes from the rental service's statement, and the lines are rounded.

A project that reports only successes cannot say what its method costs. The cost log is also evidence about method: a pipeline that needs eleven failed attempts is a pipeline whose early results deserve caution.

## 4.9 Data rules

### 4.9.1 Surgery and steering data never trains

The surgery data rule (model-lab/forge/README.md, 13 November 2026) has six points.

1. Anything made under surgery (dials, keep lists, masks, a steering direction, a changed expert count) carries its exact condition and is kept apart.
2. Only stock answers feed lessons and the teacher's odds.
3. Evil-check and fiction-check answers are evidence only, not even the wrong side of a pair.
4. Rejected lessons are for preference pairs only, not for job or expert maps.
5. No style expert maps from sets where the style was not applied.
6. Every cut or dial is a new version, kept only if it passes the held-out checks.

`notForTraining(row)` in `common.mjs` enforces points 1 to 3. The scoring scripts write a `condition` on every saved answer: "stock" or what was changed. A model served elsewhere without a stated condition is left unmarked and never called stock. This protects the studies from a quiet loop in which a changed model writes its own training data.

### 4.9.2 Scrubbing

Anything that leaves the home PC goes through `scrub-data.mjs`, on a copy and never on the raw folder. It replaces private details with stand-ins, checks the result again, and refuses to finish if anything is left. The check is repeated after the scrub and after the upload.

The rule exists because of a real miss. The first public scrub caught the user name only inside one path pattern. A bare name in folder listings and file names got through, and in saved odds a name came out split over two tokens. A stray folder name in one lesson was found only after the set went public (docs/MAKING-SMALLER-MODELS.md, model-lab/scrub-data.mjs). The script now also catches names inside any home-folder pattern, local-network addresses, e-mail addresses, keys, and names spread over odds tokens. The word list lives outside the repository.

This dissertation follows the same rule. It names no person, computer or folder on anyone's machine, and it contains no lesson text, model answers or prompts meant for training.

### 4.9.3 Naming

A name belongs to one model. Model names (Bob, Bobert, Riker, Bill) and job names (coding, recover, clarify) stay separate in plans, keep lists, logs and cards, so that a log never leaves it ambiguous which thing is meant (model-lab/forge/README.md). This is a small rule, but it removes a class of misreading from the records the studies rest on.

### 4.9.4 Tool shapes

Every lesson and every tool test is held to its brain family's working tool shape: shape 4 for Qwen brains and shape 3 for GPT-OSS brains (section 8.10). The rule has four parts.

1. **Same names and inputs for every family.** Only the wording a family reads and the tools left out of its list differ (src/tool-sets.js).
2. **One lesson set per family.** Qwen brains learn only Qwen-shaped lessons and GPT-OSS brains only GPT-OSS-shaped ones. Each lesson carries `family` and `tool_shapes` stamps (model-lab/write-lessons.mjs), the pre-flight refuses a Bob tree of the wrong shape (`--want-shapes`), and the heal skips a lesson stamped for another family (model-lab/forge/pod/data.py).
3. **Newest shape only.** Lessons are written and tools tested on the newest locked shape. A result measured on an older tool list says so and is not compared with a shape-4 result as if it were the same test. The studies of chapter 8 used Bob 1.5.223's tool list, before the shapes were locked.
4. **The call format follows the shape.** A stricter call format may only hold a brain to the exact names, inputs and order in the tool list Bob sends. It may not change the shape, and it stays off until it passes a check against the working shapes.

When a tool's name, inputs or wording change, `TOOL_SHAPES` is raised, the tool record starts a fresh history, and lessons written before the change are converted or dropped, never mixed in unmarked.

## 4.10 Statistics and noise

### 4.10.1 Paired gaps and 95% ranges

When two conditions use the same turns, the comparison is a paired difference with a 95% range. A gap counts as real only if it is larger than its range (bobert-35bob-tool-study.md). The wording tables report, for each condition, the share right and the gap against Bob's own wording. For example, on Bobert with thinking off, 264 judged turns each, the short "Use when" wording scored 0.587 against 0.591 for Bob's wording, a gap of -0.004 plus or minus 0.031. This follows the advice to use paired comparisons with error bars (Miller, 2024) and the caution that small samples have little power (Card et al., 2020).

The study files report the ranges but do not give the formula, so this chapter does not claim a particular method.

### 4.10.2 Quiz noise

A 97-question quiz moves by 3 to 5 between runs of the same model (docs/MAKING-SMALLER-MODELS.md). A small quiz gap is therefore not a result. Decisions rest on the held-out chat turns, and gaps are compared with their ranges.

For the patching and neuron tests, each setting used 6 or 8 asks, and a single 8-ask test swings about plus or minus 2 on the 0 to 10 scale. The "no change" cells at dial 1.0 ranged from 0.5 to 3.88 in one report (riker-28bob-tool-interview.md). With noise of that size, a single extra push is only a hint, and the reports label it so.

### 4.10.3 Sample sizes and single runs

The coached steps are 83 per mode and the judged turns 264 per condition, each run once. Small subsets, such as a job with 11 or 19 turns, give wide ranges. For example, with thinking on, Riker's file jobs rose from 0.368 with Bob's wording to 0.579 with the Use-when plus save-paths wording on 19 turns (+0.211, plus or minus 0.188), barely above its range, and the whole-set gain was +0.042 plus or minus 0.042, at the edge of its range (riker-28bob-tool-interview.md). The studies make no multiple-comparison correction across 14 jobs and many conditions, so a per-job gain should be read as a lead.

## 4.11 Related-systems note on evaluation practice

Public benchmarks for tool use measure model skill on a shared library, and public leaderboards compare models with each other (Patil et al., 2023; Qin et al., 2023). The numbers here are for comparing Bobs with each other on Bob's own tools, on one 16 GB card or a rented card (docs/MAKING-SMALLER-MODELS.md, section 7). They are not comparable with public leaderboards, and the dissertation does not claim they are.

## 4.12 The model-making protocol

The rules above say what may and may not happen. This section sets out the order in which a new model is made: training, cutting and healing. Each step is scored on the same report card before the next starts, every step can be skipped, and nothing is cut, trained, rented or published while it is waiting on approval (docs/ROADMAP-ONE-MODEL.md, stage 4; Help, "What is the training protocol?"). The order is the one the project settled on by 14 November: clean first, train the full model, cut later, so that a cut keeps what training taught.

| Step | What happens | Kept only if |
|---|---|---|
| 1. Baseline | The fresh stock model is scored on the fixed sample set, and its next-word odds are recorded. Earlier Bobs are measured for comparison only; nothing of theirs is used. | (the bar every later step is judged against) |
| 2. Clean-first surgery | A bias or refusal habit is tried live with dials, masks or the control vector, and recorded. It never trains (section 4.9.1). | it helps and hurts no line, and only once approved |
| 3. Analysis | REAP scores, per-skill expert counts and the expert trace, layer by layer. All of it is kept. | (data, not a model) |
| 4. Train the full model | Distillation from the teacher's top-32 odds (weight 0.7) and the real next word (0.3), on answer tokens only, over the audited lessons and about a third general text, one full pass (section 4.8.2). Preference pairs (ORPO in the pass, or DPO or KTO after it) when the plan asks. | it beats the baseline on held-out lessons |
| 5. Stepwise cut | A keep list (coverage rule or REAP) is first tried live with the expert mask, which can be undone exactly, then sliced from the file byte for byte. | each skill keeps its coverage target |
| 6. Heal | The cut model is taught back from the uncut one with the same loss as step 4, as a LoRA on every linear layer (rank 32) and on the experts (rank 8), under the router rules below. | held-out loss falls and no target gets worse |
| 7. Several targets | Each target (tools, restraint, look-it-up and others) is weighted in the mix and measured on its own held-out lessons. | no target is worse than before, within 0.01 of loss |
| 8. On-policy finish and reward pass | The student writes and the teacher scores every word it wrote; then GRPO on tool calls with a checker, 6 tries a chat, a KL guard of 0.02. | the held-out reward is no lower than the heal's |
| 9. Blend | If training forgot something, the trained model is blended back toward its parent (linear, TIES, DARE). | it wins back the lost line without losing another |
| 10. Live dials and final surgery | Experts, neurons or heads turned up or down live, then baked in only after testing. | it helps and hurts nothing, and only once approved |
| 11. Publish | Quantized files, a model card that names the teacher, lessons, costs and protocol, and the benchmark data. | only once approved |

Every training and heal plan also passes the never-taught gate (section 4.6.3) and the gates of section 4.8 before a card is rented.

### 4.12.1 Router rules (added 16 November)

The protocol was read against the Hugging Face MoE training handbook (Tazi, von Werra and Wolf, 2026). The handbook is about pre-training a mixture-of-experts model from scratch on many cards, not about cutting a finished one, so most of it does not apply. Four of its points do, and they became rules for steps 4, 6 and 8 (model-lab/forge/README.md, Build 25):

1. **The router runs in float32, trained or not.** The handbook reports that a BF16 router can tie close scores and change which experts win (section 3.1). The heal already trained the router in float32; a router left untrained now does the same.
2. **The router learns at its own low rate (2e-5 against 1e-4), or is frozen.** A keep list was chosen for the router as it was, so a heal that moves the router can drift from it. Reading the code for this rule suggested that the GPT-OSS router had fallen outside the low-rate group and would have learned five times faster than intended. This finding is unproven in our lab, as we have yet to test on a real brain: a tiny-model self-test with transformers' own GPT-OSS class agrees, but no GPT-OSS heal has run. A gate now stops any heal before training unless every router tensor is in the low-rate group, so the first GPT-OSS heal will confirm or refute it. No reported result changes. Freezing (`router: "frozen"`) is an option, not the default, until a run compares the two.
3. **No load-balance loss in a heal.** The handbook's balancing methods exist so that many cards are kept equally busy (section 3.3). On one card, and on a cut model, a balance loss would push words onto experts the keep list did not choose. The heal's loss has never had one; the rule writes that down.
4. **The routing is recorded before and after.** With `route_report` on, the heal saves, for 40 held-out lessons, the per-layer MaxVio (the busiest expert's load over the mean, minus 1; Wang et al., 2024), the experts never picked, and the share of word-and-layer picks the heal changed. These are the handbook's appendix A.1 measures, used here as a check on drift rather than on speed.

For step 8, the handbook (section 4) reports that the engine writing answers and the trainer can route the same word to different experts. Ma et al. (2025) found this for about 10% of routers on Qwen3-30B-A3B and proposed replaying the recorded picks. In Bob's reward pass the same model writes and learns in one process, so the gap is smaller; the rule is that a reward pass whose answers come from another engine must replay the picks or freeze the router first. Whether any of these rules improves a heal has not been measured. The checks so far are tiny-model self-tests on a CPU (model-lab/forge/pod/selftest_training.py, selftest_gptoss.py), which show the code runs, not that it helps.

## 4.13 Threats to validity and limits

**Leaked tests.** 519 of 534 held-out items appear word for word in training-side files. Scores on these tests may be inflated for any model that trained on those files. The size of the inflation is the subject of chapter 7, and it was not measured in a way that corrects past scores. MouseWurX chose on 15 November to keep the held-out tests as they are while the full Opus re-sort of the lessons runs.

**Faulty tests.** Of the 534 items, 381 were sorted fix and 5 discard, so only 148 were sorted keep. The sort was by Haiku, with 5% checked by Opus, and a model sort carries its own errors. The tests were not repaired.

**Agreement is not truth.** The tool score and the coaching grades measure agreement with the teacher's recorded call. A model that disagrees may be wrong or may be better.

**Judge faults.** The harshness judge is a self-rating by the model under test, and its first version scored loops as harsh. The fixed version is better but has not been checked against human raters.

**Model reviewers.** Lessons were reviewed by language models. The Opus pass changed 1,922 of Haiku's verdicts, which shows the first pass was unreliable. The files read record no independent check of Opus's own verdicts.

**Small samples and single runs.** Most comparisons use one run of 264 turns or 83 steps, with no repeated seeds. A single 8-ask test has noise of about 2 points.

**Different question sets.** The 314-turn tool score and the 264-turn wording study use different questions. Numbers from the two must not be compared directly.

**Truncation.** In the Bobert wording study, 11 to 13 turns overflowed their slot and 11 to 31 answers were cut off. They are scored as wrong in every condition, which keeps comparisons fair but lowers absolute scores.

**Changed rules.** Some rules, such as the test-item gate, were adopted after a first run showed the problem, so earlier results were produced under weaker rules.

**One project.** The rules were written and followed by one project, run by MouseWurX. No one outside has audited them.

**Status of the decisive test.** The decisive retrain on reviewed lessons has not been run. The Opus re-sort of the lessons is running, PR #254 and PR #257 shipped in release 1.5.238, PR #251 (Qwen tool shape 2) and PR #271 (the locked shapes: Qwen shape 4, GPT-OSS shape 3) shipped but are not re-tested on models, and PR #232 (patching and autoencoders) ran on 15 November.

**Still to do.** Run an outside check of the held-out split. Repair the held-out tests after the Opus re-sort, and re-score the models that were chosen on the old tests.

## 4.14 Summary

The studies use a small set of benchmarks: a 314-turn tool score, a quiz, a 13-task coding race, a needle test, a routing race, a 264-turn wording A/B and 83 coached steps. They are graded by a rule that measures agreement with the teacher, and by a self-rating judge whose first version scored loops as harsh. The method relies on rules that came from failures: a split by id that a leak defeated, gates that stop paid runs early, full passes only, a cost log that includes every failed attempt, a surgery rule that keeps changed-model answers out of training, and a scrub that was rebuilt after a name got through. The statistics are paired gaps with 95% ranges, and the chapter says plainly where samples are too small to support more. The main open problem is that the held-out tests carry the faults described in chapter 7 and were kept as they are on 15 November while the full Opus re-sort runs. Chapters 5 to 10 should be read with that in mind.

## References

- Card, D., Henderson, P., Khandelwal, U., Jia, R., Mahowald, K., and Jurafsky, D. (2020). With Little Power Comes Great Responsibility. Proceedings of EMNLP 2020, pages 9263-9274. https://aclanthology.org/2020.emnlp-main.745/
- Dror, R., Baumer, G., Shlomov, S., and Reichart, R. (2018). The Hitchhiker's Guide to Testing Statistical Significance in Natural Language Processing. Proceedings of ACL 2018 (Volume 1: Long Papers), pages 1383-1392. https://aclanthology.org/P18-1128/
- Golchin, S., and Surdeanu, M. (2023). Time Travel in LLMs: Tracing Data Contamination in Large Language Models. arXiv:2308.08493. https://arxiv.org/abs/2308.08493
- Jacovi, A., Caciularu, A., Goldman, O., and Goldberg, Y. (2023). Stop Uploading Test Data in Plain Text: Practical Strategies for Mitigating Data Contamination by Evaluation Benchmarks. arXiv:2305.10160. https://arxiv.org/abs/2305.10160
- Lee, K., Ippolito, D., Nystrom, A., Zhang, C., Eck, D., Callison-Burch, C., and Carlini, N. (2021). Deduplicating Training Data Makes Language Models Better. arXiv:2107.06499 (ACL 2022). https://arxiv.org/abs/2107.06499
- Ma, W., Zhang, H., Zhao, L., Song, Y., Wang, Y., Sui, Z., and Luo, F. (2025). Stabilizing MoE Reinforcement Learning by Aligning Training and Inference Routers. arXiv:2510.11370. https://arxiv.org/abs/2510.11370
- Magar, I., and Schwartz, R. (2022). Data Contamination: From Memorization to Exploitation. arXiv:2203.08242. https://arxiv.org/abs/2203.08242
- Miller, E. (2024). Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations. arXiv:2411.00640. https://arxiv.org/abs/2411.00640
- Northcutt, C. G., Athalye, A., and Mueller, J. (2021). Pervasive Label Errors in Test Sets Destabilize Machine Learning Benchmarks. arXiv:2103.14749 (NeurIPS 2021). https://arxiv.org/abs/2103.14749
- OpenAI (2025). gpt-oss-120b and gpt-oss-20b Model Card. arXiv:2508.10925. https://arxiv.org/abs/2508.10925
- Panickssery, A., Bowman, S. R., and Feng, S. (2024). LLM Evaluators Recognize and Favor Their Own Generations. arXiv:2404.13076. https://arxiv.org/abs/2404.13076
- Patil, S. G., Zhang, T., Wang, X., and Gonzalez, J. E. (2023). Gorilla: Large Language Model Connected with Massive APIs. arXiv:2305.15334. https://arxiv.org/abs/2305.15334
- Qin, Y., Liang, S., Ye, Y., et al. (2023). ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs. arXiv:2307.16789. https://arxiv.org/abs/2307.16789
- Sainz, O., Campos, J. A., Garcia-Ferrero, I., Etxaniz, J., Lopez de Lacalle, O., and Agirre, E. (2023). NLP Evaluation in Trouble: On the Need to Measure LLM Data Contamination for Each Benchmark. arXiv:2310.18018. https://arxiv.org/abs/2310.18018
- Schick, T., Dwivedi-Yu, J., Dessi, R., Raileanu, R., Lomeli, M., Zettlemoyer, L., Cancedda, N., and Scialom, T. (2023). Toolformer: Language Models Can Teach Themselves to Use Tools. arXiv:2302.04761. https://arxiv.org/abs/2302.04761
- Tazi, N., von Werra, L., and Wolf, T. (2026). The Ultimate MoE Training Handbook. Hugging Face, published 5 November 2026. https://huggingface.co/spaces/huggingface/moe-blogpost
- Wang, L., Gao, H., Zhao, C., Sun, X., and Dai, D. (2024). Auxiliary-Loss-Free Load Balancing Strategy for Mixture-of-Experts. arXiv:2408.15664. https://arxiv.org/abs/2408.15664
- Yang, A., et al. (2025). Qwen3 Technical Report. arXiv:2505.09388. https://arxiv.org/abs/2505.09388
- Zheng, L., Chiang, W.-L., Sheng, Y., et al. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. arXiv:2306.05685. https://arxiv.org/abs/2306.05685
