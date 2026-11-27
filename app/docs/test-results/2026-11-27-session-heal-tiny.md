# Agent-session healing on a tiny brain (27 Nov 2026)

Cloud check of `model-lab/forge/pod/agent_sessions.py`, `heal_scales.py --sessions` and the pilot kit
`heal-agent-pilot.sh`. The owner, 27 Nov: "I think healing on agent sessions is fine". The idea follows Nari's healing on
agent sessions. **Tiny test brain only. Unproven in our lab on a real brain, as we have yet to test one.**

## Setup

- **Brain:** the same tiny trained Llama as the bits-by-word check (3.4M weights, trained on the public licence texts),
  with a plain chat layout added so it can be given tasks.
- **Tasks (dry run only):** 400 sentences from the calibration-side licence texts, labelled like the real kinds (tool
  call, answer from a tool result, code, general). On the pod the tasks come from hermes-function-calling-v1, MBPP and
  dolly-15k instead. One task was on a stand-in never-taught list and was dropped, as it should be.
- **Sessions:** the full-size brain wrote 300 replies with its own sampling, 210 agent and 90 general (70:30), 160 new
  tokens at most; about 1 in 10 held apart for checking.
- **Healing:** stock imatrix Q4_K_M, 200 steps each. TEXT = plain healing on the licence text (PR #352). SESSION =
  `--sessions`, scoring only the tokens the brain wrote, kept only if drift drops on the held-apart sessions and plain
  text drift rises no more than 2%.
- **Scored:** stock `llama-perplexity --kl-divergence` on the eval licences (GPL-3, Apache-2.0) against the f32 file, and
  `heal_scales.py --measure` on the held-apart sessions and the eval text.

## Results (all files 2,194,688 bytes)

| File | Plain-text KLD (llama-perplexity) | Held-apart sessions KL | agent | general | Eval text KL |
|---|---:|---:|---:|---:|---:|
| stock Q4_K_M | 0.0398 | 0.0230 | 0.0236 | 0.0212 | 0.0268 |
| plain-text healed | **0.0284** | 0.0186 | 0.0189 | 0.0178 | **0.0187** |
| session healed | 0.0324 | **0.0173** | **0.0178** | **0.0160** | 0.0214 |

Both heals cut drift. Session healing matched the brain's own sessions 7% better than plain-text healing and plain text
14% worse: each heal is best on what it practised. Which matters more for Bob is the pilot's question, judged on Bob's
real jobs, not on these numbers. The tool-call check ran but this tiny brain never writes a tool call, so it says
nothing here.

Numbers and logs: `data/2026-11-27-session-heal/`.

## Checks

- Only the brain's own words are scored: the teacher's targets and the student's logits are both taken from the first
  reply token on (`logits_to_keep`), the task text and tool results are read but not scored.
- `--measure` gives the same drift as the heal's own after-check (0.01864 both), using the file's own healed norms.
- Plain `--calib` healing is unchanged; a file named held-out is refused; with both or neither of `--calib` and
  `--sessions` the script stops.

## Limits

- Licence sentences are not agent tasks and a tiny brain's replies are noise: this checks the mechanics only.
- The pilot (`model-lab/forge/pod/heal-agent-pilot.sh`, Qwen3-4B) measures wikitext KLD, drift on held-apart public
  sessions and tool calls against BF16. Bob's held-out jobs on the winner come after, and the trick stays off by default
  and out of Turbo until that shows a gain.
