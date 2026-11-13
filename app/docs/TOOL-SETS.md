# Tool wording for each brain family

Settings, How Bob works, **Tool wording for each brain family**. It's on by default because it's a reliability fix. Code: `src/tool-sets.js`. Test: `test/run-tool-sets-test.js`.

## What it does

Every brain gets the same tools, with the same names and the same inputs. Only the description a brain reads changes:

| Family | Wording | Added group stays for |
|---|---|---|
| Qwen (Riker, Bill, Bobert, Qwen3.x) and unknown brains | Bob's own wording, unchanged | 3 messages |
| GPT-OSS (unproven: only when named, see below) | Short "Use when…" lines, with one example on the tools it mixes up | 1 message |

Because the names and inputs never change, a lesson written by a GPT-OSS teacher is already in Bob's real tools. It never needs translating back.

A family's whole list is never longer than Bob's own, and the test checks this. The examples are paid for by shorter lines elsewhere, so the start of a job stays inside its budget (`test/run-start-budget-test.js`).

## Logic arguments (in code, with no words added)

These came from the GPT-OSS v5 lesson rejects, sorted by cause on Nov 13. In that sort, planning failures were 56% and execution failures were 38%. The top misses were a skipped to-do (`notice_board`), a wrong tool for a to-do, and wrong save paths.

- `notice_board` takes `action: "add"`, which puts one item under Side quests without rewriting the board. Adding the same item twice adds it once.
- `reminders` with no time is turned down with a pointer to `notice_board` add. Times written as `2026-11-14 09:00`, with seconds, with a trailing `Z`, or as a date and a time apart are read as the local time they mean.
- Action words are mapped to the tool's own: set, create or append mean add; remove or delete mean cancel; show, get or view mean list or read. Fields like `at`, `when` or `due` mean `time`, and `item` or `todo` mean `content`. This runs under "Better tool calling" (`src/loop-help.js`).
- Results say exactly what happened, for example "Cancelled reminder 4f2a (…): call mum" and "Notice board saved: 3 open items."
- A path that starts with `~` means the home folder. A path that isn't full gets an error naming the real home folder.
- At the end of a turn, if the ask was a to-do ("put milk on my list") or a reminder ("remind me to … at 6") and no tool set one, Bob gets one more go (`src/verify.js`).

## Planning: several things in one message (`src/job-steps.js`)

- When one message asks for two or more things, the app reads them from the words. It sends the brain ONE hidden line naming them in order. A question, chat or one thing gets nothing.
- At the end of the turn, if fewer successful tool steps ran than things were asked, the brain gets one more go: do the rest, or say which wasn't done (`src/verify.js`). A question back to the person is left alone.
- This runs under "Better tool calling" (loop help `plan`).

## Tools Bob makes himself (`src/selftools.js`)

- An input can carry `enum` choices (an action like add/list/remove), so one made tool can replace sibling tools.
- Made tools take the same forgiving inputs as Bob's own (`checkArgs`): another name for a field, "5" for 5, "set" for add.
- A test run that answers nothing readable is turned down. The reviewer also checks that the answer says what the tool did and that bad input gets a fixable error.

## Proving a family (needed before a new one goes in)

Run tool-score twice on the same held-out lessons, once with the family's wording and once without, and compare:

```
node model-lab/tool-score.mjs --models "gptoss=...gguf" --tool-set gpt-oss
node model-lab/tool-score.mjs --models "gptoss=...gguf" --tool-set off
```

Keep a family's wording only when right-tool plus right-arguments goes up. Until then the family carries `proven: false` in `SETS` and is used only when named.

**Result, Nov 13 (GPT-OSS 120B, rented H200, quick set, partial: 25 of 74 turns before the brain unloaded):** its own wording got 5 of 14 tool turns right (tool and inputs) and 9 of 10 no-tool turns; Bob's wording got 6 of 14 and 10 of 11. No gain, so GPT-OSS is `proven: false` and every brain gets Bob's wording. A thinking style of "plan, check inputs, quote the result" scored 0 of 8 against 0 of 8 on the 8 hardest v5 misses. The levers that count are in the tools and the loop: action enums, defaults, exact results, routing, and the plan and check steps, which stay on for every brain.

Lesson writing picks the teacher's family by itself once that family is proven. Use `--tool-set off` for Bob's own wording, or `--tool-set gpt-oss` to name an unproven one.

## Making new tools with this in mind

The whole guide is [WRITING-TOOLS.md](WRITING-TOOLS.md). In short:

1. Use one tool with an `action` enum rather than sibling tools that get mixed up.
2. Give safe defaults (a save path when none is given), and check inputs in code with an error that says how to fix it.
3. Return a result that says exactly what happened (the file's real path, how many items changed), so the answer can quote it.
4. Add the tool to `TOOL_KINDS` (`src/tool-kinds.js`). If a family mixes it up, add a short "Use when…" line for that family in `SETS` (`src/tool-sets.js`), keeping the family's list no longer than Bob's own.
