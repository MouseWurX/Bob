# Replay tapes (reliability item 241)

Each file is one real-shaped turn cut from a saved chat with `tapeFrom()` (src/replay.js): what was asked, every
reply the brain gave (words and tool calls) and every tool result. `test/run-reliability-watch-test.js` feeds them
back through Bob's loop with no brain and no tools, and checks the loop asks as often, runs the same tools and ends
with the same answer. `expect` (optional) says where the loop is meant to differ from the record, for example a
repeat call the loop answers itself.

Add one when a loop change fixes a real turn: "Save as a test" keeps a `tape` with each case in my-tests.jsonl.
Take out names, paths and words that belong to someone first.
