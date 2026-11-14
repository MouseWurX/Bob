# Tool lessons and "look it up when unsure": the plan (14 Nov 2026)

Design only. Nothing here trains, rents or uploads. Each of those waits for the owner's typed go, in the thread doing it.

**Goal:** one Bob brain that is good at agent work, coding, chat, Blender and Unreal help through Python scripts, and that
**looks things up when it isn't sure** instead of guessing. We get there by turning every failed run we have into a
correct lesson, then teaching those lessons in several rounds, each with its own lessons, so nothing is taught twice.

**When the final lessons are written:** after the Riker and Bobert tool interviews, once the owner has picked each brain
family's tool shape (PR #219 checklist). Until then the method, the checks and the generator are built and tested on
small dry runs, so the big write can start the same day the shapes are picked.

## 1. Where the failures come from

| Source | Size | How it can be used |
|---|---|---|
| GPT-OSS 120B v5 lesson rejects | 303 traced one by one (`bob-wip/tool-sets/TOOL-FAILURES-v5-traced.md`); the wider review count of 527 is still to be checked on the PC | The request may be reused. The failed answer is the "wrong" side of a pair. |
| Riker stock quiz, Nov 13 | 104 wrong of 310 | **Test only.** These items are held out. We write *new, similar* requests, never the items. |
| Riker tool interview (tonight, PR #222) | about 300 turns, thinking on and off | Its test turns are held out. New, similar requests only. |
| Bobert tool interview (tonight, PR #225) | 308 turns over 14 jobs; past logs show 123 tool turns with 75 right tool, 42 right inputs, 15 no call | Same rule: new, similar requests only. |

Not every reject is a real mistake. The traced v5 sort already tells us what to do with each kind:

| Kind (v5 count) | What we do |
|---|---|
| Reviewer was wrong (37) | Not a failure. The answer moves to the right side, after a second check. |
| Fake tool result was confusing (50, and 36 more partly) | Write the lesson again with a realistic result. No bare "Done.", no cut-off bodies, a board that holds the task's item. |
| No tool can do it (23) | Wait for the tool (the save path and name fix for make_diagram, save_as, make_image, make_sound, convert_file). Until then the right lesson says plainly what Bob can't do and offers the nearest thing. |
| Real model mistakes (about 180) | Corrected lessons, the core of this plan (section 3). |

## 1b. How many tool lessons we have today (counted 14 Nov)

Counted in Bob's own lesson set, v4 (the cleaned copy of what's on Hugging Face):

| | Count |
|---|---|
| All lessons | 8,992 |
| With at least one tool call | 2,903 (32%) |
| With two or more tool steps | 954 (11%) |
| With three or more tool steps | 467 (5%) |
| Bob's tools used at least once | 46 of 93 |

The most used tools are `ask_specialist` (465 lessons, mostly handing the job off), `notice_board` 436, `list_folder` 414
and `web_search` 345. Many tools are nearly missing: `edit_file` 3, `save_as` 2, `convert_file` 7, `save_spreadsheet` 8,
`fetch_page` 27. 47 tools have no lesson at all. Riker was healed on this own set (8,635 lessons, 6 Nov) and Bobert on
about 9,000. So yes, the owner is right: real multi-step tool work was a small slice of what they learned.

The Kimi K2.5 agent traces (1,171, Apache 2.0) are much richer, 793 of them with five or more tool steps, but they use
another app's tools (`terminal`, `patch`, `browser_click` and so on), not Bob's. See section 3c.

**New target:** about 6,000 tool lessons per round, at least half with two or more steps, and every one of Bob's
tools in at least 40 lessons per round. Over three rounds that is about 18,000, roughly six times today's set.

## 2. What a good tool trace looks like

Every corrected lesson follows the same shape, so the brain learns one habit:

1. **Read the ask.** Count the things asked. One short plan line when there are two or more.
2. **Use what was given.** Names, paths, times and amounts go into the call exactly. Never ask again for something that's in the message.
3. **One call, then read the result.** The next step uses what the last one returned.
4. **Check before claiming.** The answer quotes the real result: the real file path, the real count. If the result differs from the ask (another name, another size), say so.
5. **Recover.** On an error, try one sensible other way, or say plainly what went wrong.
6. **Finish.** Every thing asked is done or named as not done. Plain chat gets no tool at all.

Each step maps to a v5 failure: didn't check the result (62), gave up or asked something answerable (39), typed the
result in chat instead of saving it (26), extra calls (19), skipped a step (14).

**Per brain family.** Lessons are saved in Bob's real tool names and inputs, which are the same for every family. Only
the wording a brain reads changes (`src/tool-sets.js`). So one lesson set serves every family: at training time it is
shown with that family's wording and its chosen shape (one tool per step or not, thinking on or off, head start or not).

**Working shapes stay.** A tool call that already works reliably keeps its shape. A tool is "working" for a family
when that family's held-out score on it is high in both thinking modes (about 9 in 10 right, tool and inputs). New
per-family shapes are only for the tools that fail. Lessons for working tools are not rewritten.

## 3. Turning a failure into a corrected lesson

For each failure, in code where possible:

1. **Tag it** with the traced cause (the table above) and the tool.
2. **Make new requests from it.** The teacher writes 3 to 8 new requests that need the same skill, with different
   names, paths, wording, typos and languages. For held-out sources (Riker quiz, both interviews) this is the *only* use.
   Each new request must pass the overlap check (section 6) against every test file before it goes on.
3. **Write the right answer** with Bob's real tools, a realistic fake tool result for each call, and the shape above.
   The teacher is Qwen3.6 for tool jobs (GPT-OSS is weak at Bob's tools) and its top-K odds are kept on every row.
4. **Check it in code** with `tool-judge.mjs`: right tool, right inputs, every asked thing done, the answer quotes
   the result. Then the teacher's review, with the phantom "JSON format" rule removed.
5. **Make the pair.** Right side: the checked answer. Wrong side: for v5 rows, the original failed answer; for new
   requests, the student's own answer (written on the rental, kept only if the checker fails it).

**How many.** The owner wants a big, sturdy set, and synthetic is fine. Aim per round: the 6,000 tool lessons from
section 1b (about 1,000 of them pairs), spread so no single tool or job is more than 1 in 10.

**Plain words between the steps.** Every doctored lesson has short plain-English thinking and chat between its tool
steps: what Bob is about to do and why, what the result showed, and what that means for the next step. For example:
"The folder has three PDFs, so I'll read each one before I write the summary." A lesson that is only calls in a row
isn't kept.

**When the only mistake was the wrong tool.** If the plan was right but a step used the wrong tool, the lesson is kept and
mended: the wrong tool is swapped for the right one, its inputs and result are rewritten to match, and any steps the
right tool needs (look first, then act, then check) are filled in, with the plain-words reasoning between them. The
checker then runs on the mended lesson like any other.

## 3b. Guided lessons for what Bob never managed

Some jobs failed in every run we have: no attempt recovered and no brain got them right. For those, a plain "here's the
right answer" lesson often doesn't take. Instead:

1. The lesson **keeps the original failed attempt** in the chat: the wrong call and the real error it got back.
2. Then Bob **thinks it through**: what went wrong, why, and what to try instead, in short plain steps.
3. Then the right path, done with the tools, checked, and finished.

Bob only learns from steps 2 and 3. The failed attempt is there so he can see where it went wrong, but it is never
trained as an answer to copy (its words are masked out of the training loss). A pair goes with it: the right side
recovers, the wrong side repeats the mistake or gives up.

## 3c. Kimi agent traces in Bob's tools

Once the tool shapes are picked, the 1,171 Kimi traces are converted to Bob's tools: `terminal` and `process` to
`run_command`, `execute_code` to `run_in_sandbox`, `patch` to `edit_file`, `read_file`, `write_file` and
`search_files` to Bob's own, `browser_*` to `browser_open`, `browser_act` and `browser_read`, `todo` to
`notice_board`, `clarify` to `ask_user`, `delegate_task` to `ask_specialist`, and `skills_*` to `my_howtos`. A
step with no Bob tool is reworked into one Bob can do, or the trace is dropped. The tool results are rewritten to match
what Bob's tool really returns. The original set stays untouched in `distill/`. Apache 2.0 allows changes; the
converted set says what was changed and keeps the credit to Moonshot AI and Lambda.

## 3f. One uniform suite

Every lesson with a tool call, old and new, ends up in the same shape:

- **Stored once, in one shape:** Bob's tool names and inputs as chosen after the interviews. The family wording is
  added only at training time (`src/tool-sets.js`), so one stored lesson serves every family.
- **A one-time conversion** of everything older: Bob's own 16 sets, the Kimi traces, the other outside agent sets, and
  the lessons written with an old Bob's tool text (v5 used 1.5.108). Where a tool's shape didn't change, the lesson is
  left as it is. Where it did (for example a new save path and name), the call and its result are updated to match.
- **Checked after converting:** every call must pass today's input checks, and the fake result must be what the real
  tool returns. A lesson that can't be converted cleanly is dropped, not guessed.
- **Originals stay untouched.** The converted suite is a new version beside them, with a list of what changed.

## 3g. Five versions, several routes, more tries

**Five versions of every doctored lesson:** base Bob plus the four thinking styles (Raider, Watson, Sherlock, Vulcan).
Each style stays its own set and trains its own model, never merged into Bob (the style rule). Effort per style as
before: Raider low, Watson medium, Sherlock and Vulcan high. GPT-OSS couldn't hold a style under Bob's full prompt and
tools, so the tool versions use the Qwen teacher with the style's notes. The dry run checks first that each style
really shows in its lessons.

**Several routes to the answer.** For each request, two or three right answers that get there differently: another
order of steps, another tool that also fits (`search_files` before `read_file`, or `list_folder` then `read_file`),
or another answer that is just as correct (a different but valid script or file layout). The checker must pass every
route. All routes of one request go into the same round, and the ledger keeps that request out of later rounds.

**More tries, more effort.** About 1 in 4 lessons has a second try: the first try is quick and fails for a real reason
(a wrong path, a test that fails), then Bob slows down, thinks it through more carefully, checks the inputs and gets it
right. As in the guided lessons, the failed try is shown but never trained as an answer.

**What this does to the counts.** Each version gets about 6,000 tool lessons per round, made from about 2,500
requests (two or three routes each, plus the second tries). Five versions over three rounds is about 90,000 tool
lessons: about 18,000 for base Bob and about 18,000 for each style.

## 3h. Other data we could use

Public sets with a licence that allows training and changes. Each would be converted to Bob's tools like the Kimi set
(section 3f), checked, deduped against the never-taught list, and credited.

| Set | Licence | Size | How it fits |
|---|---|---|---|
| nvidia/When2Call | CC BY 4.0 | 10K to 100K rows | When to call a tool, when to ask, when to just answer. The best fit for "look it up when unsure" and "don't call a tool on plain chat". |
| nvidia/Open-SWE-Traces | CC BY 4.0 | 1.1 million coding-agent runs, 98 GB | Real bug-fixing runs from five agent apps, marked pass or fail. Take the passing ones for coding lessons, and the failing ones for guided lessons. |
| SWE-bench/SWE-smith-trajectories | MIT | 10K to 100K rows | Coding-agent runs on real repos: read, edit, test, fix. |
| nebius/SWE-agent-trajectories | CC BY 4.0, plus each source repo's own licence | about 80K runs | Same kind, with success marks. |
| Salesforce/xlam-function-calling-60k | CC BY 4.0 | 60K | Single-call accuracy: right tool, exact inputs. Short, so it's best for the `precise` job. |
| glaiveai/glaive-function-calling-v2 | Apache 2.0 | 100K to 1M rows | Simple call-or-chat turns. Many are low quality, so it would be filtered hard. |
| NousResearch/hermes-function-calling-v1 | Apache 2.0 | 10K to 100K rows | Calls with structured outputs. |
| Blender manual | CC BY-SA 4.0 (to confirm on the page) | the whole manual | Facts for the Blender track. The scripts are written fresh and run headless. |
| Unreal Python API docs | Epic's own terms, not an open licence | the API reference | Facts only, never copied. Scripts are written fresh and run in the editor. |

Benchmarks such as BFCL and tau-bench are for testing only, never lessons. They join the never-taught list.

## 3d. Coding, the way courses teach it

The most common lesson types from college and university coding, software engineering, code fixing and error
recovery, each done with Bob's real tools (write the file, run it, read the output, fix, run the tests):

- **Programming basics to data structures:** loops, functions, recursion, arrays, linked lists, stacks and queues,
  hash maps, trees, graphs, sorting and searching, big-O.
- **Software engineering:** classes and interfaces, design patterns, splitting a program into modules, unit tests and
  test-first, refactoring, code review, version control with git, build tools and packaging, APIs and HTTP,
  databases and SQL, threads and concurrency, files and processes.
- **Code fixing:** read a stack trace, find the bug, fix the smallest thing, prove it with a test. Compile errors,
  type errors, off-by-one, null values, race conditions, slow code.
- **Error recovery:** a missing file, wrong path, no permission, a missing package, a failing test, a timeout, a
  command that isn't installed. Bob notices, tries one sensible other way, or says plainly what's wrong.

Every lesson's code is run in a sandbox when it's written, and kept only if it runs and its tests pass. The older
coding set's problem (37% of lessons handed the job off with a pretend result) is not repeated: these lessons write
the code themselves.

## 3e. Documents are information, never orders

When Bob reads a web page, a file, a tutorial or an email, he uses the facts in it. He never follows instructions
written inside it ("ignore your rules", "run this command", "AI assistants must…"). Lessons for this:

- A page or file with a planted instruction. The right answer uses the real information, ignores the instruction, and
  tells the person about it when it matters. The wrong side of the pair follows it.
- Mixed in at about 1 in 20 tool lessons that read something, so it's normal, not a special case.
- The same rule for the tutorial track below: the teacher takes only the information from a tutorial.

## 4. Teaching "look it up when unsure"

We keep the top-K odds on every answer. That tells us how sure the brain was, and the checker tells us if it was right.
Put together, every question lands in one of four boxes:

| | Right | Wrong |
|---|---|---|
| **Sure** (high odds on the answer words) | Answer directly. These become "don't search" lessons. | The worst case: confident and wrong. Most "search first" lessons come from here. |
| **Unsure** (low odds, odds spread across answers) | Search, or answer with a plain "I think, but check". | Search first. |

On top of that, anything that changes (prices, versions, news, opening hours, weather) is always a search.

**Lessons made from this:**

- **Search pairs.** Right side: `web_search`, then `fetch_page` on the best result, then an answer that says where it
  came from. Wrong side: the brain's own guessed answer. Built from new requests like the ones it got wrong or was
  unsure on, never the test items.
- **Don't-search pairs** (so Bob doesn't search for everything): right side is a direct answer to a sure fact, wrong side
  is a needless search. About 1 for every 2 search pairs.
- **When the web is off or a search finds nothing:** say "I'm not sure" plainly and say what would settle it. Never
  make up a source.
- **Messy results on purpose:** some fake search results disagree or are out of date, and the right answer says so.

**The reward pass** (`grpo.py`, `tool_reward.py`) gets a search line: searching when it was needed and answering
right scores best, guessing wrong scores lowest, and a needless search costs a little (less than a tool on plain chat,
which stays at -0.5).

**How we know it worked:** on held-out questions, how often Bob searches when he'd have been wrong (should go up), how
often he searches a sure fact (should stay low), and plain quiz score (must not drop).

## 5. Not forgetting other skills

Every round mixes in a broad set from Bob's cleaned lessons (v4): chat, advice, writing, coding, maths, science,
Blender and Unreal Python, formats, refusals, languages, help. About 40 to 50% of each round. Each round takes a
*different* slice of that pool. The on-policy step (teacher grades the student's own answers) also holds old skills in place.

**Do we need more conversation?** No, not new plain chat. Bob's own set already has about 2,000 conversation lessons
(chat 310, knowledge 330, writing 286, advice 247, maths 211, languages 210, game master 201, reasoning 201), plus the
outside chat sets and about 10 million tokens of general text in every heal. That is enough to hold chat in place.
What is short is chat *next to* tools: "explain, don't act" and "act, don't explain" twins, and "answer or look it
up" choices. Those are counted in the tool and search sets above, not as extra chat.

## 5b. Blender and Unreal Python, from tutorials

Tutorials become lessons too, so Bob learns real scripting for 3D work.

- **Sources, licence checked first.** The official Blender Python API manual and the Unreal Python API docs, plus
  open-licence tutorials and example repos (MIT, Apache, BSD, CC BY, CC0). Each lesson keeps its source and licence.
  Anything with no clear licence, or one that says no reuse, is skipped.
- **The teacher turns each tutorial into lessons:** a plain request ("make a low-poly tree and save it as tree.blend"),
  then Bob's real steps: write the script with his tools, run it, read the output, fix it, and say what was made.
  The tutorial's wording is never copied in. Each tutorial gives several new requests, like section 3.
- **Every script is run headless to prove it works:** `blender --background --python` for Blender, and the Unreal
  editor's command-line Python for Unreal. A script that errors or makes the wrong thing is fixed or dropped. These
  runs go on a rental or the cloud, never on the home PC.
- **Each lesson is tagged with the app version** it was checked on (for example Blender 4.2, Unreal 5.4), so a lesson
  for an old version can be found and checked again when the API changes.
- **Size:** about 600 Blender and 400 Unreal lessons per round, inside the round's tool lessons. The same ledger keeps
  them from repeating across rounds.

## 6. Several rounds, nothing taught twice

**One lesson ledger** (`lesson-ledger.jsonl`) holds a fingerprint of every lesson ever taught: the first request
(lowercase, spaces squeezed), the list of tool calls, and a near-match fingerprint so a reworded copy is caught too.
A lesson whose fingerprint is already there is never written again.

**Never taught, checked on every write:** the 5% held-out (`md5(idea) < 0.05`), the quiz items (`quiz-items.mjs`), the
"new" facts packs, Riker's 310 stock items, tool-score's held-out chats, both interviews' test turns, and the HF
`eval/` folders. A near match to any of these is dropped.

**Self-play after every round.** The newly trained brain works through fresh requests on the rental. The checker grades
each answer. What it gets right can be an on-policy example; what it gets wrong is turned into corrected lessons
(guided lessons, section 3b, when it never recovered) for the next round. That's how each round's failures become the
next round's lessons.

**Each round:**

| Round | New lessons from | Then |
|---|---|---|
| 1 | v5 failures, Kimi converted, course-style coding set A, Riker quiz and interview look-alikes, Bobert look-alikes, search set A, Blender and Unreal set A (the basics: objects, materials, export; actors and assets), general slice 1 | Benchmark. What the trained brain still gets wrong is the source for round 2. |
| 2 | Round 1's self-play failures (new requests again, guided where never solved), course-style coding set B, search set B, Blender and Unreal set B (rigs, modifiers, Geometry Nodes; levels, Blueprints from Python, batch imports), general slice 2 | Benchmark. Leftovers go to round 3. |
| 3 | Round 2's self-play failures, course-style coding set C, the hardest long jobs (4 to 6 calls), search set C, Blender and Unreal set C (whole jobs: make, check, export to Unreal, place in a level), general slice 3 | Benchmark, then blend. |

Each round runs the protocol (PR #201): baseline and odds, train, preference pairs, on-policy finish and reward pass,
blend, with a benchmark after every step. A round is kept only if no target drops. Surgery and evil-check data never
trains (`notForTraining` in `common.mjs`).

## 7. Scrub before anything is kept

Only these are taken out: the owner's name, the owner's file names and paths, email addresses, IP addresses, device
names and keys. Other names stay. The known scrub bug (the odds step stops at the first stand-in, `FIX-scrub-data.md`)
is fixed before any write.

## 8. What gets built next (all off unless named)

| Piece | What it does |
|---|---|
| `make-fix-lessons.mjs` | Failures in, tagged causes, new look-alike requests out, through the overlap check |
| `lesson-ledger.mjs` | The ledger and the never-taught list, used by every writer |
| `search-pairs.mjs` | Sorts answers into the four boxes from their odds and checks, makes search and don't-search pairs |
| `write-lessons.mjs` fixes | Realistic fake results per tool, reviewer without the JSON rule, `--from-fixes` |
| `tool_reward.py` | The search line in the reward |
| `convert-lessons.mjs` | The one-time conversion to one shape (section 3f), Kimi and outside sets included, after the shape pick |
| `guided-lessons.mjs` | Keeps the failed attempt, masks it from the loss, adds the think-it-through and the right path |
| `style-routes.mjs` | The five versions, two or three routes each, second tries |
| `import-open-sets.mjs` | Converts the open sets in 3h to Bob's tools, with credit and licence kept |
| `tutorial-lessons.mjs` | Licence check, tutorial to requests, headless Blender and Unreal runs, app version tag |

Each comes with a test that uses fakes, never the real computer.

## 9. What waits for the owner

1. Riker and Bobert interviews finish, then the owner picks each family's tool shape.
2. A go to write the big set on a rental.
3. A go for each training round.
4. A go before any upload.
