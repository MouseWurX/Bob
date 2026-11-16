# Harness log: what each run taught, and what changed

MouseWurX, 16 Nov 2026: "we need to be dialing in the harness with the findings from every run." After every rental or
lab run, read why runs failed or were thrown out (harness errors, graders, test worlds, tool lists, the rental itself),
fix what is the harness's fault before the next run, and add a check that would catch it again. Newest first. Each entry
says what ran, what it taught, what changed, and which check now guards it. "Open" means found but not fixed yet.

## 16 Nov 2026: office tools never called in ~900 Qwen runs (lab read; nothing rented)
- Taught: across the 800 + 100 runs, office_read, office_edit, office_make, convert_file and compare_files were never
  called. Not the brain: the test Bob had the Office Hand off (do-jobs turns it on only with `--office`, and no plan
  passed it; the Lab PC has no LibreOffice), compare_files was hidden (its More tools switch was off), and even when on,
  compare_files' two paths (`first`, `second`) and office_edit's `save_as` were never moved into the test home, so
  compare_files would have failed every time ("Give the full path to both files"). `read_spreadsheet` is not a Bob
  tool at all (only a name in two check lists).
- Changed: bob-kit PATH_KEY moves `first`, `second` and `save_as`. New office jobs (office-jobs.mjs, 16 jobs: Word,
  Excel, PowerPoint read / convert / edit, make, compare, one missing file) bring their own made-up files, switch
  compare_files on, and keep the files Bob leaves as words (row.office.after). Jobs needing LibreOffice are left out,
  with a pre-flight line, when there is no `--office`. office-score.mjs scores by code.
- Check: harness-faults names office_missing, tool_switched_off, path_not_moved and office_file_missing; the self-test
  gains st-office-plain (always) and st-office (with `--office`); the old PATH_KEY fails st-office-plain with
  path_not_moved. office-oracle.mjs: a scripted brain doing every job the plain way passes 16/16 (8/8 without
  LibreOffice), and a do-nothing brain that says "Done" fails 16/16. test/run-office-jobs-test.js (32 checks).
- Then (the lead): job excel-to-csv-taken and a path check: an answer must name the file really saved ("Budget_2026-2.csv"), not the taken name asked for (Maximus rerun v5-d6-3-r0). The oracle caught its own first answer naming the wrong "(2)" style. 17 jobs.
- LibreOffice unpacked on the Lab PC (Squeak, 3:50 PM MT): lab-office\libreoffice\program\soffice.exe.

## 16 Nov 2026: inbox jobs, Qwen four efforts (launched; nothing rented)
- Taught: the inbox branch was cut before the RunPod v2 move, so its launcher asked the retired `rest.runpod.io/v1`
  ("fetch failed" every minute) and could never rent. A branch's pre-flight passed because that copy predates the v2
  pre-flight check.
- Changed: the inbox branch now carries the v2 Forge (merged from the jobs-harness branch). The kit is moved up before
  the next double-click.
- Check: the v2 pre-flight (`forge.mjs --preflight` asks RunPod read-only) now runs in the inbox kit too, and
  `test/run-forge-runpod-v2-test.js` is in the branch's suite.

## 16 Nov 2026: the Maximus rerun graded (23 of 100 failed, from 43) and the inbox "before" run (120 runs)
- Taught (Bob): Qwen3.6 sometimes writes its tool call as text in its own XML form
  (`<tool_call><function=NAME><parameter=...>`), and the engine took only JSON text calls. So the call never ran, and
  the answer said "Done" (12 of 100 Maximus runs had such steps; 5 of the 9 false_action_claim faults). Self-review
  text also reached the answer (8). Inbox run: 25 of 120 mail jobs ran no mail tool at all. Real mail asks rarely
  say "e-mail" ("Trash everything from Kettle & Crumb"), so the morning's mail_route caught 0 of the 25.
- Changed: llamacpp.js textCalls turns the XML form into real calls (17 of the 20 such steps would run now); new
  checks text_call and review_leak; mail_route reads plain mail asks (trash/archive from a name, "emailed me",
  "draft a reply").
- Check: run-textcalls-test.js (2 more), run-answer-checks-test.js (58). Replay: mail_route catches 25 of 25
  no-mail-tool runs, with 0 firings on the 95 runs that used mail tools and 0 keeps in the 800 Qwen runs. On the
  Maximus rerun, checks or the rescue touch 11 of the 23 failures. Loops (10) and unsupported claims (17) are not
  caught by a check yet: loops belong to the effort loop, unsupported claims to the reviews.
- Harness (inbox thread): nothing was the world's fault; the npc files reach the cloud via the device file tools.

## 16 Nov 2026: the Maximus rerun, first 63 of 100 (a quick read, before the blind grading)
- Taught (Bob's loop): with the planning fixes, raw tool-call blobs and "already done" / "Standing by" answers went
  from 5 to 0. But "I already searched / gave you that above" answers rose from 3 to 6, and the Maximus fallback
  showed its own "Here is what the jobs did:" heading in 4 runs. The checks from the morning caught 1 of these 11.
- Changed: new check `points_back` in answer-checks.js; solo-effort.js shows the step reports with no heading about
  jobs; mail_route leaves "e-mail logs / files / lists" requests alone (a false alarm in this rerun).
- Check: 6 more in run-answer-checks-test.js (49 now); run-solo-effort-test checks for no heading. Replay: points_back
  fires on 8 of 63 rerun answers, and on the 800 Qwen runs 4 fix and 1 keep.

## 16 Nov 2026: the agent loop, from the 800 Qwen runs, the 45 GPT-OSS runs and the live inbox run
- Taught (Bob's loop, not the harness): the most common mistakes were asking where a file was without looking, saying
  something was done or noted when no tool did it, pointing at tool output the user never sees, answers cut off
  mid-list, research answered after one search, sums worked out in his head, and mail jobs answered with file or web
  tools (or no tool). Outliers: he moved his own working folder to make a "new folder", fetch_page got a garbled link,
  GPT-OSS's citation markers reached the user.
- Changed: `src/answer-checks.js` (look_first, said_done, memory_claim, page_claim, unseen, cut_off, one_search, maths,
  mail_route), run from verify.js afterTurn inside the same one more go (off only with Better tool calling off);
  citation markers taken out of shown answers; guardPath refuses Bob's own working folder or one holding it;
  fetch_page refuses or repairs a link that isn't a plain web address.
- Check: `test/run-answer-checks-test.js` (43 checks). Replayed over the 800 Qwen runs: the checks fire on about 27
  fix/discard runs and 10 keep runs (mostly a harmless "look first"); mail_route fires on 0 keeps after narrowing.
  Many read faults are about content quality and can't be caught by a check. Unproven in our lab on live runs, as we
  have yet to test; the inbox thread will rerun its 30 mail jobs on it for an after number.

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

## 16 Nov 2026: Maximus rerun bad_args (8 runs), Bob-side arg hints (Tool shape thread)
- Taught: the brain guessed folders for files the user named (scraper.py, validator.py, data.json were in Documents),
  read a file:// link with fetch_page, copied a script write_file had refused, set one reminder per day with repeats
  off, and used forget_topic for a saved memory then said it wasn't there.
- Changed (no tool names, lists or shapes; TOOL_SHAPES stays 4): a missing path's error says where that name is in
  the folders Bob may read (find-by-name.js, 4 levels, 4,000 entries, hidden/AppData skipped); read_file finds a bare
  name a few folders down; a new file whose name is already used says where the other is; file:// points at read_file;
  the script refusal says nothing was saved; the 2nd one-off reminder with the same words says repeats are off;
  forget_topic says a memory isn't a topic and Bob can't delete one.
- Check: test/run-find-by-name-test.js (33 checks). Not yet re-run on a rental.
