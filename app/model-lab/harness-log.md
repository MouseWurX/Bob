# Harness log: what each run taught, and what changed

MouseWurX, 16 Nov 2026: "we need to be dialing in the harness with the findings from every run." After every rental or
lab run, read why runs failed or were thrown out (harness errors, graders, test worlds, tool lists, the rental itself),
fix what is the harness's fault before the next run, and add a check that would catch it again. Newest first. Each entry
says what ran, what it taught, what changed, and which check now guards it. "Open" means found but not fixed yet.

## 16 Nov 2026: inbox jobs, Qwen four efforts (launched; nothing rented)
- Taught: the inbox branch was cut before the RunPod v2 move, so its launcher asked the retired `rest.runpod.io/v1`
  ("fetch failed" every minute) and could never rent. A branch's pre-flight passed because that copy predates the v2
  pre-flight check.
- Changed: the inbox branch now carries the v2 Forge (merged from the jobs-harness branch). The kit is moved up before
  the next double-click.
- Check: the v2 pre-flight (`forge.mjs --preflight` asks RunPod read-only) now runs in the inbox kit too, and
  `test/run-forge-runpod-v2-test.js` is in the branch's suite.

## 16 Nov 2026: GPT-OSS 45-job trial (waited for a card; nothing rented)
- Taught: RunPod retired its rental address (`rest.runpod.io/v1`) while the launcher waited for a card. The name stopped
  resolving, every rent said "fetch failed", and the window retried for about half an hour without saying why.
- Changed: the Forge rents, lists, deletes and edits pods and volumes through RunPod v2 at `api.runpod.io/v2`
  (`forge/runpod-v2.mjs`); the pod's own self-delete and time cap use v2 too. v2 takes one card type per request, so the
  Forge asks for each wanted card in turn.
- Check: Forge pre-flight now asks RunPod for the pod list (read-only) and refuses to rent if the address doesn't
  answer. `test/run-forge-runpod-v2-test.js` (24 checks, a made-up v2 RunPod).
- Unproven in our lab on a real rental, as we have yet to rent through it.
- Also taught: the distill four-level pod finished its jobs but could not delete itself (its self-delete and the PC's
  delete both used the retired address), so it billed for about 2 h more until it was found in `--status` and deleted
  by hand. Its delete failure was only written to the pod's own watchdog log. The v2 move fixes the cause; open: the
  PC should check `--status` after every rental and say loudly when a finished pod is still listed.

## 16 Nov 2026: findings from other threads (open)
- Maximus did the job itself during planning instead of only planning it. Open: the fix and its check belong to the
  effort work; this log gets the entry when it lands.
- Mail tools missing from the shape-4 tool lists. Fixed on the inbox branch: jobs-to-lessons builds an inbox run's tool
  list with the mail switches on (Bob's own wording, same shape 4); `test/run-mail-world-test.js` checks it.

## 16 Nov 2026: the 800-job real-jobs run (402 keep, 315 fix, 36 discard, 47 harness errors)
- Taught: 47 runs were decided by the test world, not the brain, in 8 kinds: files the scene couldn't make (32), scene
  replies cut mid-JSON (9), OK cards answered "no" (6), scripts outside a project (6), "I'll type it" picks (3), half an
  emoji refused by llama-server (2), diagrams with no window (2), a folder not allowed (1).
- Changed: real small media/program/Office files, cut scene replies salvaged and retried, named files filled in, top
  folders allowed, whole-text requests, a stand-in diagram window, typed picks answered, all six home folders.
- Check: `jobs-selftest.mjs` (8 jobs, about 2 s, before every rental and on --preflight); `harness-faults.mjs` names
  each kind; do-jobs stops a rental when 3 in 10 runs are the world's fault; `jobs-gate --max-world` (5%);
  `jobs-recheck.mjs` replayed all 47: clear (8 lost scenes can't be replayed; the self-test covers that fix).
