# bob-tools

A few small helpers taken from Bob, each in one file with no outside packages:

| File | What it does |
|---|---|
| `src/git-look.js` | The read-only git looks (status, changes, history) and how their answers are worded. |
| `src/code-map.js` | The code map: one short line per source file, and the lines around an error. |
| `src/sort-names.js` | Naming rules for "Sort and rename": patterns like `{artist}/{album}/{track} {title}`. |
| `src/token-count.js` | How many characters make one token, learned per brain. The first guess is 3. |
| `src/speed-stats.js` | Speed and memory readings for one reply, and processor load. |
| `src/job-steps.js` | Finds the separate things one request asks for, and checks each was done. |
| `src/index.js` | The front door: everything above from one import. |
| `bin/map.js` | `node bin/map.js <folder>` prints the code map of a folder. |

## Tests

    node test/run.js

Every `test/*.test.js` file is run. Each check prints PASS or FAIL, and the run ends with exit code 1 when any check
fails. `npm test` runs the same thing. Needs Node.js 20 or newer and nothing else.

## House rules

- Comments say in plain English what a thing is for.
- New behaviour gets a check in the matching `test/<file>.test.js`.
- A failing check is fixed in the code, unless the check itself is wrong. Never delete or weaken a check to get a pass.
- No outside packages.
