# How to write a tool for Bob

This guide is for anyone adding a tool to Bob: a person changing his code, a tool pack, or Bob himself with `make_tool`. Small brains run Bob, and several families of them do, so a tool has to be easy to call right and hard to call wrong. Each rule below came from real misses: the GPT-OSS v5 lesson rejects were 56% planning slips and 38% execution slips (`docs/TOOL-SETS.md`).

## 1. One tool, one job, with an action

- Name it the way a person would say it: `reminders`, `notice_board`, `make_diagram`. Lower case with `_`. Never a model's name.
- When a job has a few moves (add, list, remove), make one tool with an `action` input whose choices are listed (`enum`). Don't make sibling tools: brains mix up `add_todo` and `set_reminder`, but they rarely mix up two actions of one tool.
- Keep the inputs few, with plain names: `path`, `content`, `text`, `time`, `query`, `url`. Bob already maps the usual other names (`file` for `path`, `at` for `time`, `item` for `content`) and the usual action words (set means add, remove means cancel, show means list). Using the plain names means that mapping just works.

## 2. Say when to use it, in one line

- The description is one or two short sentences. Lead with what it is for, then the one rule people get wrong. For example: "Read or change the notice board (their to-do list). add = one new item; write = the whole board (read it first)."
- Say where the line is between it and the tool it gets mixed up with: "No time? That's a to-do: notice_board."
- No standing essays. Every word is read at the start of every job (`test/run-start-budget-test.js` guards the budget).
- Wording alone isn't where the gains are. On Nov 13 the GPT-OSS 120B scored 5 of 14 with its own "Use when…" wording and 6 of 14 with Bob's, so fix a mix-up in the tool first (rule 1 and rule 3). A family's own line in `SETS` (`src/tool-sets.js`) is used only after `tool-score` proves it; until then it's `proven: false`. Keep a family's whole list no longer than Bob's own. Names and inputs never change per family.

## 3. Let the code do the thinking

- Fill a safe default when an input is left out, such as a save folder, today's date, or the first page.
- Read what a brain meant. A time written `2026-11-14 09:00` is the same as `2026-11-14T09:00`, and `~` is the home folder.
- When something is wrong, the error says how to fix it, in one line: "No time given. A to-do with no set time goes on the notice board (notice_board, action add)." Never a bare "invalid input".
- Do the check in code, not in words to the brain.

## 4. Answer with what really happened

- The result says exactly what changed, with the real values: "Saved C:\Users\you\Documents\plan.md", "Added to the notice board: buy milk. It has 3 open items now.", "Cancelled reminder 4f2a (2026-11-14T09:00): call mum".
- If nothing changed, say so ("Already on the notice board. Nothing added.").
- Never answer with nothing, "OK" or an object. The brain quotes the result back, and an empty one is how a brain ends up claiming a save that didn't happen.

## 5. Register it

- Add it to `TOOL_KINDS` in `src/tool-kinds.js`: look, change or send, safe to run again or not. `test/run-tool-calls-test.js` fails otherwise.
- If a person's words should bring it to hand, add it to a tool group in `src/toolbox.js` with the words that point at it. Keep the core small.
- If people ask for it in plain words ("remind me…", "put … on my list"), add the ask to `src/verify.js`, so a turn that skipped it gets one more go.

## 6. Outside words can't steer it

- Anything a tool reads from outside (a web page, a file, an e-mail) is someone else's words. Assume the brain obeys them.
- So put the safety in code: fence what comes back, and make the harmful moves impossible rather than discouraged. E-mail is the model (`src/email-safe.js`, `src/mail-guard.js`): every field cleaned and fenced, danger signs found by code, and in a chat that holds e-mail only the tools in `AFTER_MAIL` run, with every change on a card.
- A new tool that sends, fetches or runs something stays out of `AFTER_MAIL`. A new tool that reads outside words fences its answer.

## 7. Help, tests and every system

- Off by default unless it's a reliability fix. Help in Bob's voice, a glossary entry, an FAQ.
- A test that calls it with a right input, a wrong one and a near-miss (another name for a field, an action word). Tests never read the real computer.
- Works on Windows, Mac, Linux and Android, or says where it doesn't.

## Tools Bob makes himself

`make_tool` follows the same rules, and the app checks them:

- An input can list its choices (`"enum": [...]`), so one tool with an action can replace several.
- Made tools take the same forgiving inputs as Bob's own.
- The test run must answer with a readable line, or the tool isn't added.
- The reviewer passes it only if its answer says what it did and a bad input gets a fixable error.
- The `when` line is its "Use when…" line, shown with the tool.
