# Speed test plans

Plans for `model-lab/speed-test.mjs`, following the pre-registered method in
`docs/test-results/2026-11-16-speed-test-method.md`. Places on the test PC (the brain, the engines, the PC test lock,
the stop file, the hot-expert ranking) are never written here: they are given with `--var NAME=value` when the run
starts.

- `night1.json`: reading steps (Question 1), Brain Engine cost (Question 2), each new feature alone and together
  (Addenda 1 and 5), the expert cache at sizes and shares (Addendum 2), and the live trace every N words (Addendum 4).
- `start.json`: Bob's real start (system prompt and tools for the Qwen 3.5/3.6 family, as a throwaway Bob with every
  tool set up sends them) followed by "hi". Made with `model-lab/bob-kit.mjs` on 16 November 2026; its sha256 goes
  in every result.
- `long-text.md`: the text the 16K and 32K prompts are cut from: chapters 1 to 4 of Bob's dissertation as they stood
  on 16 November 2026 (our own published text; the public-domain book named in the method couldn't be fetched from
  the cloud machine, see the method's Addendum 6). The runner cuts it to exactly 16,384 and 32,768 of the brain's own
  tokens and adds one fixed question.
- `calibrate-bigger.json`: the copy cache at 5 and 6 GB, and reading steps 5120 and 6144 with 2 and 4 GB caches, beside
  Y0, F4c and X4c (Addendum 20). Skips a load when the card isn't nearly free, and fails a run that spills card
  memory into RAM.
