# Reading rewritten tool lessons (Opus 5.5)

Every lesson the teacher rewrites is read in full by Opus 5.5 before it is kept. The teacher's own check on the card,
and `audit-lessons.mjs`, are only first filters: their flags are shown to the reader but never decide alone.

The reader never writes or rewrites lesson text. It gives a verdict and a short note. A lesson that needs changes goes
back to the teacher with that note.

## What the reader gets per lesson
- The whole lesson: Bob's system prompt (kept as is, so training matches real use), the request, every step, the
  tool results and the final answer.
- The tool list the lesson was offered (from `toolsets.json`, shape 2 for Qwen), with each tool's inputs.
- The script flags from `audit-lessons.mjs` (tool not offered, inputs it doesn't take, missing required inputs,
  loops, folder leaks, bare or cut-off results, unbacked file names).

## Verdicts
- **keep**: right on every point below.
- **fix**: the idea is good but something below is wrong. The note says what, in one or two lines.
- **discard**: the idea itself is wrong for Bob (no tool can do it, harmful, a near-copy of a test item).

## Check each point
1. **Tool choice.** Bob uses the right tool, or rightly none. Plain chat or a question Bob already knows the answer to
   gets no tool. There are no extra calls, and no shell where a file tool exists.
2. **Inputs.** Names, paths, dates, times and amounts are copied exactly from the request. Every input is one the tool
   really takes.
3. **Reading results.** Each step uses what the last result returned. An error is noticed and dealt with. Bob doesn't
   loop.
4. **Fact check.** Every claim in the final answer must be backed by a tool result or by the request itself. That
   covers file names, counts, numbers, dates, prices, what was saved, and where. Flag each claim that isn't, as
   `unbacked: <the claim>`. Any unbacked claim means **fix**. Facts from Bob's own general knowledge are fine in a
   no-tool answer, but never presented as something a tool returned.
5. **Plain work, no personality.** Bob's personality lives in the app prompt only, like an agent file, and is never
   trained in (the owner, 15 Nov). The answer is plain and about the task. Flag `chatter` when it leans on personality
   instead of the job: jokes, the cat, flourishes, small talk nobody asked for, or long sign-offs. Chatter means
   **fix**. A short friendly line is fine.
6. **Words between steps.** These say the thinking and the next step, not chat.
7. **Honest stand-ins.** Picture, video, music and sound makers, web, email, and system or app tools (open_app,
   run_command, schedule_job, defender_scan and the like) may return stand-ins. A stand-in must not claim what that
   tool can't return. make_diagram and the file, office and notes tools must have run for real.
8. **Privacy.** No real person's name, no folders from the lab PC, no device names, keys or addresses. Only
   `C:\Users\you` appears as a home folder.

## Output, one line per lesson
`{"idea": "<id>", "verdict": "keep|fix|discard", "flags": ["unbacked: ...", "chatter", ...], "note": "<what to change>"}`

Batches of 9, up to 12 batches at once. Every lesson in a set is read. The counts per verdict must add up to the set's
total before anything is kept.
