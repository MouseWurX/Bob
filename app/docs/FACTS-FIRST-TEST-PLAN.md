# Facts first: what a rental should measure

Facts first (`src/facts-first.js`, 16 Nov 2026) is unproven in our lab, as we have yet to test it on a real brain.
The cloud tests (`test/run-facts-first-test.js`) use a scripted brain. They show that the loop does each step:
the hidden memory note, the send-back to search, one answer, the "not checked" note, the read-first send-backs,
the side-by-side spread and the free pages' manners. They can't show whether a real brain answers better.

## Why

In the 800-job Flash-Next read (`bob-wip/tool-lessons/jobs-fix1/read/opus-read.md`), 100 of 800 runs were tagged
`unsupported_claim`, and most of the 61 tagged `other` were a planted file he ignored or wrong facts. Examples were
free-plan limits, author names, causes and dates stated from memory, and asking before looking in Documents.

## The runs

Use the same brain (Qwen3.8-Flash-Next 125B, Qwen shape 4), the same jobs and the same worlds for every arm
(`--scene reuse --scenes <first arm>/scenes.jsonl`). Opus grades every run with the same grader as the 800-job read.

| Arm | Flags | What it shows |
|---|---|---|
| A, before | `--effort high --facts-first off --read-first off` | Magnus as it was |
| B, after | `--effort high` (Facts first `high`, Read first on: Bob's defaults) | Magnus with the fixes |
| C, low before | `--effort low --facts-first off --read-first off` | Minimus as it was |
| D, low with the switch | `--effort low --facts-first all` | the "Every level" setting |

Jobs: the fact-type and file-type jobs from the jobs-fix1 list (questions of fact, "what does my file say", "what's
in my documents about..."), about 150 to 200 of them, plus 50 chat and making jobs as a control that Facts first
must leave alone. Cap searches as usual (`--search-cap`). A Tavily key for the Lab only.

## What to report (arm B against A, and D against C)

1. **Facts stated from memory**: the share of fact jobs tagged `unsupported_claim`. This is the main number.
2. **Wrong facts**: the share whose answer has a fact the sources contradict.
3. **Disagreements said**: in runs where the hidden memory note (the system message "What you wrote from memory")
   and the source differ, the share where the answer says so. The grader reads both.
4. **Unchecked said plainly**: the share of runs with no source read whose answer (or the app's note) says it is
   unchecked.
5. **Ignored a given file / asked before looking**: the shares tagged `other` (planted file ignored) and
   `asked_when_should_act` on file jobs.
6. **Cost**: median time per job, searches per job, free-page searches per job, and steps per job.
7. **Control**: chat and making jobs. Facts first should not fire on these, so `facts_log` should be empty. Report
   any that changed their verdict.
8. **The loop's own count**: from each row's `facts_log`, how often he was sent back to search (`nudged`) and how often
   no source was read (`unchecked`). Many send-backs means the brain ignores the "look it up" note, which would make
   it worth a lesson set later. Lessons only come from clean runs, and surgery data never trains.

Every report says what really ran and what was skipped, and why.

## Go or no-go

Keep it on by default at Magnus and Maximus if (1) drops clearly, (2) doesn't rise, and the control jobs hold their
verdicts. A rise in time per job is expected, and the report gives it as the price. If (1) doesn't drop, the hidden
notes aren't enough for this brain. Say so, and leave the switch for the owner to decide.

## Not covered in the cloud

- The real robots.txt files were read once by hand on 16 Nov 2026: `html.duckduckgo.com` allows everything, and
  `www.mojeek.com` disallows `/search` for every bot. So Bob no longer uses Mojeek's free page, and uses Mojeek only
  through its keyed service. The first real search on the PC should show DuckDuckGo still answering, and the logbook
  should show robots.txt read once a day.
- The waits between free-page searches (5 to 10 seconds) were only timed with a fake clock.
