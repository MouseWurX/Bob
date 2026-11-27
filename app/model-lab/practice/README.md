# Practice problems

Problems the Lab may tune on. Never Bob's held-out jobs: those only score a finished result.

- `gsm8k-train-600.jsonl`: 600 problems from the GSM8K **train** split (shuffled, seed 7), as `{"q", "a"}`.
  Source: [openai/grade-school-math](https://github.com/openai/grade-school-math), MIT licence. Used by `loop-sweep.mjs`.
- `math-train-l5-600.jsonl`: 600 level-5 problems from the MATH **train** split (ids `train/...` only, so never MATH-500 or other
  test items) whose answer is a whole number, shuffled with seed 7. Source: [openai/prm800k](https://github.com/openai/prm800k)
  (`prm800k/math_splits/train.jsonl`, MIT licence), which carries MATH (Hendrycks et al., 2021, MIT licence). Mix: number theory 130,
  algebra 110, geometry 102, intermediate algebra 93, counting and probability 83, prealgebra 64, precalculus 18.

Ids used so far from `math-train-l5-600.jsonl` (27 November 2026), so a confirm run can use fresh ones:
- 0 to 209: the hard-maths sweep (try 1 found on 0 to 149 and checked on 150 to 209; try 2 found on 0 to 99 and checked on 100 to 139).
- 210 to 309: set aside for the confirm run (`plans/loop-sweep-qwen35-math-confirm.json`).

`edits/`: dial settings a sweep picked (its `surgery-edits.json`, copied unchanged), kept so a confirm run can read them.
