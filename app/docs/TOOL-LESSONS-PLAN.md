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

**How many.** The owner wants a big, sturdy set, and synthetic is fine. Aim per round: about 4,000 tool lessons
(about 700 of them pairs), spread so no single tool or job is more than 1 in 10.

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

## 6. Several rounds, nothing taught twice

**One lesson ledger** (`lesson-ledger.jsonl`) holds a fingerprint of every lesson ever taught: the first request
(lowercase, spaces squeezed), the list of tool calls, and a near-match fingerprint so a reworded copy is caught too.
A lesson whose fingerprint is already there is never written again.

**Never taught, checked on every write:** the 5% held-out (`md5(idea) < 0.05`), the quiz items (`quiz-items.mjs`), the
"new" facts packs, Riker's 310 stock items, tool-score's held-out chats, both interviews' test turns, and the HF
`eval/` folders. A near match to any of these is dropped.

**Each round:**

| Round | New lessons from | Then |
|---|---|---|
| 1 | v5 failures, Riker quiz and interview look-alikes, Bobert look-alikes, search set A, general slice 1 | Benchmark. What the trained brain still gets wrong is the source for round 2. |
| 2 | Round 1's leftover failures (new requests again), search set B, general slice 2 | Benchmark. Leftovers go to round 3. |
| 3 | Round 2's leftovers, the hardest long jobs (4 to 6 calls), search set C, general slice 3 | Benchmark, then blend. |

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

Each comes with a test that uses fakes, never the real computer.

## 9. What waits for the owner

1. Riker and Bobert interviews finish, then the owner picks each family's tool shape.
2. A go to write the big set on a rental.
3. A go for each training round.
4. A go before any upload.
