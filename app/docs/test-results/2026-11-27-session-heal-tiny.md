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

## First pilot rental, Qwen3-4B (27 Nov, L40S, $1.29)

Data: `data/2026-11-27-session-heal-pilot1/`. Bob at 462f2c0, Qwen/Qwen3-4B revision 1cfa9a7.

- **Stock imatrix Q4_K_M** (2,497,280,640 bytes): wikitext KLD 0.0467, same top 91.6%. On held-apart sessions: KL 0.040
  (agent 0.026, general 0.044), same top 94.1%. Tool calls on 21 held-apart tool tasks: 21 of 21 well formed, 20 of 21
  the same call as BF16.
- **Sessions:** 1,061 written (701 agent) in 26 min; 157 of 157 single-turn tool tasks answered with a call.
- **Wikitext heal: did not run.** It ran out of the 48 GB card's memory on its first step (4 chunks of 512 tokens with
  gradients at once). So "no healed file" here says nothing about healing.
- **Session heal: made it worse and was rightly not written.** At the old step size (1e-3) the drift on the held-apart
  sessions went 0.040 to 0.118 and plain text 0.043 to 0.127. Each step moved all 26 million scales by about 0.1%, so on a
  brain this close to its full-size self the steps were too big and noisy. Only 157 of the 400 practice sessions were
  agent ones, because the file is sorted by task length and the first 400 were taken.
- **Tool check:** "known tool 0" was a bug in the check: this set writes its tool lists as Python dicts, which the check
  didn't read.

### Fixes for the rerun (all checked on the tiny brain)

- Plain-text healing works one chunk at a time and adds up the gradients, so it fits the card.
- Every heal holds back a slice of its practice set (24 chunks or sessions), checks it every 50 steps and keeps its best
  step. If no step beats the start, nothing is written. The eval set only reports and never picks.
- Default step size 2e-4 (was 1e-3); the rerun tries 1e-4 and 3e-4 for both heals.
- Sessions are shuffled before any limit and weighted by the tokens they score; the kit passes every session.
- The tool check reads tool lists in both formats.

Tiny brain, fixed kit (same budget for both heals, 200 steps): at 2e-4 the session heal was 4% better on held-apart
sessions and 9% worse on plain text than the wikitext heal (wikitext KLD 0.0318 against 0.0292; stock 0.0398).
