# Harness log: what each run taught, and what changed

MouseWurX, 16 Nov 2026: "we need to be dialing in the harness with the findings from every run." After every rental or
lab run, read why runs failed or were thrown out (harness errors, graders, test worlds, tool lists, the rental itself),
fix what is the harness's fault before the next run, and add a check that would catch it again. Newest first. Each entry
says what ran, what it taught, what changed, and which check now guards it. "Open" means found but not fixed yet.

## 16 Nov 2026: GPT-OSS 45-job trial, the run (A100 80 GB via RunPod v2, about $0.74)
- Ran: 45 of 45 answered, 0 errors, 0 decided by the test world by the checks we had. Read: keep 33, fix 11, discard 1
  (bob-wip/tool-lessons/gptoss-trial/READ.md). The first real rental through RunPod v2: rent, door, run and self-delete
  all worked.
- Taught (harness): a rename job named a folder in quotes ('Old Projects (2020-2021)') and the scene made no such
  folder, so the brain could only ask where it was. The checks only knew file names.
- Changed: `namedFolders` in harness-faults.mjs names quoted folders a request works on (not ones it makes or renames
  to); do-jobs makes a missing one empty in the home folder the request names, else Documents.
- Check: new kind `scene_missing_folder`; self-test job st-dir (9 jobs now); 3 checks in run-jobs-selftest-test.js.
- Open (Bob, not the harness): GPT-OSS's citation markers (【1†L1-L3】) reach the user; research jobs stop after one
  search at Effort low; "forgotten" after the tool said there was nothing to forget.
- Another thread's finding, folded in: the "still waiting for the pod door" lines now say what RunPod reports about
  the pod (status, uptime, ports), so a frozen host can be told from a missing port (an L40S never opened its door).

## 16 Nov 2026: GPT-OSS 45-job trial (waited for a card; nothing rented) (later rented: see above)
- Taught: RunPod retired its rental address (`rest.runpod.io/v1`) while the launcher waited for a card. The name stopped
  resolving, every rent said "fetch failed", and the window retried for about half an hour without saying why.
- Changed: the Forge rents, lists, deletes and edits pods and volumes through RunPod v2 at `api.runpod.io/v2`
  (`forge/runpod-v2.mjs`); the pod's own self-delete and time cap use v2 too. v2 takes one card type per request, so the
  Forge asks for each wanted card in turn.
- Check: Forge pre-flight now asks RunPod for the pod list (read-only) and refuses to rent if the address doesn't
  answer. `test/run-forge-runpod-v2-test.js` (24 checks, a made-up v2 RunPod).
- Proven on one real rental the same day (the GPT-OSS trial above); the serverless and network-volume paths are still unproven in our lab, as we have yet to rent through them.
- Also taught: the distill four-level pod finished its jobs but could not delete itself (its self-delete and the PC's
  delete both used the retired address), so it billed for about 2 h more until it was found in `--status` and deleted
  by hand. Its delete failure was only written to the pod's own watchdog log. The v2 move fixes the cause; open: the
  PC should check `--status` after every rental and say loudly when a finished pod is still listed.

## 16 Nov 2026: findings from other threads (open)
- Maximus did the job itself during planning instead of only planning it. Open: the fix and its check belong to the
  effort work; this log gets the entry when it lands.
- Mail tools missing from the shape-4 tool lists. Open: same.

## 16 Nov 2026: the 800-job real-jobs run (402 keep, 315 fix, 36 discard, 47 harness errors)
- Taught: 47 runs were decided by the test world, not the brain, in 8 kinds: files the scene couldn't make (32), scene
  replies cut mid-JSON (9), OK cards answered "no" (6), scripts outside a project (6), "I'll type it" picks (3), half an
  emoji refused by llama-server (2), diagrams with no window (2), a folder not allowed (1).
- Changed: real small media/program/Office files, cut scene replies salvaged and retried, named files filled in, top
  folders allowed, whole-text requests, a stand-in diagram window, typed picks answered, all six home folders.
- Check: `jobs-selftest.mjs` (8 jobs, about 2 s, before every rental and on --preflight); `harness-faults.mjs` names
  each kind; do-jobs stops a rental when 3 in 10 runs are the world's fault; `jobs-gate --max-world` (5%);
  `jobs-recheck.mjs` replayed all 47: clear (8 lost scenes can't be replayed; the self-test covers that fix).
