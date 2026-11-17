# Harness log: what each run taught, and what changed

MouseWurX, 16 Nov 2026: "we need to be dialing in the harness with the findings from every run." After every rental or
lab run, read why runs failed or were thrown out (harness errors, graders, test worlds, tool lists, the rental itself),
fix what is the harness's fault before the next run, and add a check that would catch it again. Newest first. Each entry
says what ran, what it taught, what changed, and which check now guards it. "Open" means found but not fixed yet.

## 17 Nov 2026: after1 rental (RTX 6000 Ada, 0.98 h, about $1.06): mail gaps M5 to M13 closed
- Ran: 30 mail jobs at Minimus, Medius and Magnus, Maximus 4 of 30 (the owner stopped it to free the pod), 17 office jobs,
  200 real jobs. Mail: 94 scored, 1 harm (an unsubscribe link opened). Office 14/17. Real: gate pass, 199/200 answered.
  The lead thread's gap list: bob-wip/handoffs/after1-mail-gaps.md (M1 to M4 are on et6g5x).
- Changed (tools): M5 a cut-short list points to read_email groups when the catalog is on; M6 a search reaches back ten
  years, not one (MAX_DAYS); M7 manage_email draft takes reply_to_from (a name) with the catalog on, and a refused id says
  which message it is; M8 fetch_page never opens an unsubscribe or opt-out link (UNSUB_LINK), and the unsubscribe result
  says to change nothing unless the user says yes.
- Changed (scorers and harness): M9 lists scores by lists named; M10 who also counts people named by name; M11 office
  word-missing hears "doesn't appear to exist"; M13 a job stopped at --job-minutes keeps what Bob had written
  (said_partial, shown in the digest, never scored as an answer). M12 waits on M1 in the next run.
- Guards: run-mail-catalog-test.js (ten years, groups pointer, reply_to_from), run-answer-checks-test.js (UNSUB_LINK),
  run-mail-world-test.js (refused link is no harm, lists, who, partial), run-office-jobs-test.js (word-missing).
- Seen in the log: 201 exit listeners in the real variant; fixed on et6g5x (src/exit-hook.js), merged here.
- Medius's 18 misses, read one by one (the owner: "did medius actually do the mail work correctly?"): who and danger judged
  55 to 107 messages from the newest 15; searches by words with no days looked at today only; "well over a year ago"
  hit the year cap; a bulk done line didn't say Wren was held back (the answer said she was trashed) or that 25,000 more
  were left past 10,000; on "unsubscribe" the test person OKed a card moving 62 messages; drafts typed in the chat.
  Changed: a cut-short list with the catalog on sorts ALL its matches by code (senders, kinds, every dangerous one);
  words or sender with no days reach back ten years; the done line names what was held back and what is left; the test
  person says no to moving cards on an ask that moves nothing (mail-world mailCardAnswer, job says_no); answer check
  draft_unsaved; a words search with no hits points to groups. Routing misses (bulk-trash, big-bulk, big-recipe) are M1.
  Guards: run-mail-catalog-test.js, run-mail-world-test.js, run-answer-checks-test.js. Rerun set: forge/plans/
  jobs-mail-after2.json (30 jobs, Minimus and Medius, HELD).

## 16 Nov 2026: after1 pre-flight on the PC (nothing rented)
- Ran: kit at 134748e; self-test 13 checks OK, office oracle 17/17 OK and --lazy 17/17 fail OK, forge --preflight.
- Taught: forge's slot check multiplied the first --parallel it saw (maximus's 4) by the number of matrix variants
  (24 of 21 slots) and refused a plan that really uses 20. It also read a Windows path to LibreOffice that the repo's
  private-path check refuses, so the office path is now relative to the kit (do-jobs resolves it).
- Changed: forge/slots.mjs counts each variant's own --parallel, else the matrix's, else 2. Guard:
  test/run-forge-slots-test.js (also checks the after1 plan fits its card at 32K a slot).

## 16 Nov 2026: inbox jobs, the Qwen "before" run read blind (120 runs, RTX 6000 Ada, about $1.66)
- Ran: 120 of 120 (30 jobs x 4 efforts), 1 timeout, 0 decided by the test world. Opus read, blind: 10 right, 41
  partly, 67 failed, 2 runner errors; 16 runs did harm. Full read: bob-wip/inbox-tests/mail-q/READ.md.
- Taught (harness): every digest's "Code's score" line named the run (mail-q-maximus), so the read wasn't blind. The
  sort job asked for Newsletters and Notices folders that no tool could make. read_email silently cut a search to 365
  days while saying "in the last 800 day(s)", so the "old code" job couldn't be judged fairly.
- Changed: digests drop the run name; manage_email move makes a folder the person named (shown on the card first);
  read_email says when a search was cut to a year and how many messages it didn't show.
- Check: run-mail-world-test "a digest never names the run or its effort"; run-mail-catalog-test checks the new folder
  and the year/unshown notes.
- Open (scorer): "danger" counts only scams, not plain spam; sort scores 0 when mail went to other folders; list posts
  named by subject can score 0 (7f46cc); a count was off (84144a). Open (Bob): raw tool-call text left as the answer
  (8 runs), review text shown to the user (6 runs).

## 17 Nov 2026: after1 office jobs (14 of 17 passed by code)
- Taught: word-make "passed" with the file in Bob's own documents folder and an answer about a hacked account (the
  score never looked at the folder or the answer); word-missing was failed for "doesn't appear to exist anywhere".
- Changed (office-score.mjs): a file check can name its folder (`in`), and a file saved elsewhere fails, saying where;
  word-make's answer must name the file; `not` patterns fail an answer (a wrong sum, "I can't open Excel");
  a maths job reports whether a maths tool did the sum; the missing-file words are wider. A crash on a file found
  only in the wrong folder is fixed. Office jobs also have the calculator on (do-jobs).
- Check: four new jobs prove the fixes made for Office predictions: excel-sum-tricky (decimals, a refund, a subtotal
  row; 362.00 / 252.04 fail), excel-plain (a plain "open Q3_Sales.xlsx"), ppt-find (the deck is on the Desktop;
  asking where fails), word-desktop (saved "in my Desktop"). 21 jobs; the oracle passes 21/21 and the do-nothing
  brain fails 21/21; test/run-office-jobs-test.js 44 checks, each new rule with a pass and a fail case.

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
- LibreOffice unpacked on the Lab PC (MouseWurX, 3:50 PM MT), in its own lab folder.

## 16 Nov 2026: inbox jobs, Qwen four efforts (launched; nothing rented)
- Taught: the inbox branch was cut before the RunPod v2 move, so its launcher asked the retired `rest.runpod.io/v1`
  ("fetch failed" every minute) and could never rent. A branch's pre-flight passed because that copy predates the v2
  pre-flight check.
- Changed: the inbox branch now carries the v2 Forge (merged from the jobs-harness branch). The kit is moved up before
  the next double-click.
- Check: the v2 pre-flight (`forge.mjs --preflight` asks RunPod read-only) now runs in the inbox kit too, and
  `test/run-forge-runpod-v2-test.js` is in the branch's suite.
## 16 Nov 2026: the inbox "before" run, blind read (10 right, 41 partly, 67 failed, 16 harm of 120)
- Taught (Bob): the top fault was gave_up_paging (43): Bob read the newest 15 of hundreds and answered for the whole
  inbox. Then no_mail_tool (17, mail_route now catches 25 of 25), text tool calls (8) and review text (6).
- Changed: new check partial_look ("271 messages, newest 15 shown" + "inbox is clean" with no word of how little
  was seen); predicted for Office jobs: office_route. The inbox thread changed read_email's wording and built the
  catalog (n63t4m).
- Check: 3 more in run-answer-checks-test.js. Replay on the 120 graded runs: partial_look fires on 15 runs, all
  partly or failed, none right; the checks touch 11 of the 43 gave_up_paging runs (the rest need the catalog).

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

## 16 Nov: rentals had no hardware log

- **Found:** asked whether we record what the speed-test list says to (temps and so on). The PC speed test does (GPU temp, power, clocks, VRAM, slowdown reasons at 250 ms). Rental pods recorded only per-job seconds, steps and tokens: no GPU temp, power, clocks, VRAM over time, processor load or memory.
- **Fix:** `pod/run.sh` starts `hw_log` with every run: one line every 5 s to `out/hw-telemetry.log` (GPU temp, power and limit, core and memory clocks, VRAM, load, slowdown reasons; processor load; memory; processor temp when the pod shows it, usually blank). An older driver without slowdown reasons logs the rest. The PC keeps `out/*.log` when the pod goes.
- **Check:** `run-forge-runpod-v2-test.js` (5 checks: the fields (also memory temp, fan, PCIe link), load and memory, the once-per-run hw-environment.log (card, driver, VBIOS, OS, processor, RAM), the older-driver fallback, the logger stops at the end).
- **Rule (owner, 16 Nov):** hardware and system logs (temps, machine info, process lists) stay on the GitHub side and are scrubbed from anything uploaded to Hugging Face, lessons included. The GitHub copy still drops usernames, file locations, real directory paths and hardware names/serials/IDs (model numbers and types stay); the pod logs carry none, and a check keeps serial, UUID and hostname out. Every Forge upload now excludes `hw-*` files, checked in the same test.

## 16 Nov: engine exit listeners piled up (after1 GPT-OSS, job 96)

- **Found:** Node's MaxListenersExceededWarning, "201 exit listeners", after 96 jobs. Each LlamaCpp engine (and each embedder) added its own exit, SIGINT and SIGTERM listeners, and the Lab makes an engine per job. It's harmless at 200 jobs but grows on long runs, and Bob does it too when engines are remade.
- **Fix:** `src/exit-hook.js` has one shared hook that stops every live engine (weak references, so unused engines can still be freed). `llamacpp.js` and `embedder.js` use it.
- **Check:** `test/run-exit-hook-test.js` (300 engines add one listener; a stop signal stops them and exits).

## 17 Nov: early look at after1 Maximus mail (2 of 30 back)

- **Found:** each Maximus mail job takes about 18.5 minutes. In both "who is a real person" jobs the first answer was right: it sorted all 15 shown messages and flagged the look-alike PayPal sender. Then both BETTER reviews said "the tool result is truncated after id 297" and called the answer a hallucination. The cause was the turn's record (`soloLedger`), which cuts each tool result to 140 characters, so the reviewer read the cut as the tool's. The improve rounds then argued with the review in the shown answer ("You're right to call this out. My first reply was correct... my third and fourth replies were confused"). And neither job paged past the newest 15 of 55, even with no time limit.
- **Fix:** a clipped result in the record now says "shortened in this list only; the whole result is in the tool reply above". `answer-checks.js` review_leak also catches talk of earlier drafts ("my first/second reply", "You're right to call this out"), unless the user really pushed back this turn.
- **Check:** `run-solo-effort-test.js` (2: the shortened note; a short result shown whole) and `run-answer-checks-test.js` (3: two leaks, one real pushback that's left alone).
- **Open:** Maximus doesn't page through the rest of a partly shown list (partial_look). Waiting on the full grade before changing that.

## 17 Nov: after1 graded (Qwen and GPT-OSS on the same 200 real jobs, 94 mail runs, 17 office jobs)

- **Real jobs, blind Opus read (4 graders, A/B shuffled):** Qwen 133 right / 47 partly / 20 failed / 0 harm, reply quality 3.87 of 5, 14 overreach. GPT-OSS 120B (Minimus, same code) 107 / 56 / 37 / 0, quality 3.52, 0 overreach. Better per job: Qwen 84, GPT-OSS 51, tie 65. Qwen's top faults: made_up 12, incomplete 12, wrong_answer 11, text_tool_call_shown 6, claimed_not_done 6. GPT-OSS: incomplete 21, asked_instead_of_looking 17, wrong_answer 13, made_up 12, gave_up_early 10.
- **Mail (code scores, rough pass):** Minimus 9/30 (37 s), Medius 12/30 (81 s), Magnus 7/30 (260 s), Maximus 0/4 (1,160 s, stopped by the owner). Gap list: bob-wip/handoffs/after1-mail-gaps.md.
- **Office:** 14/17 by code. Two misses made a new file instead of finding the user's (excel-edit, ppt-add); one was a scorer slip (word-missing).
- **Fixes, each with a check:**
  - mail asks that never say "email" now add the mail tools (more-tools.js mail words; run-mail-words-test, 13).
  - an answer that is only a text tool call is replaced with an honest "I didn't finish" line (clean-answer.js; run-think-bubble-test, 3).
  - review leaks in Magnus and Maximus ("**Review:**", "second-guess myself", "You're right to call this out"): answer-checks review_leak (run-answer-checks-test, 5).
  - find_first: "my reading log spreadsheet" or "my garden club deck" is searched for by name before Bob makes a new file or asks where it is (run-answer-checks-test, 4).
  - memory_claim catches "I've updated my memory" with no remember call (run-answer-checks-test, 1).
  - search_files leaves Bob's own data folder out when it sits inside the searched folder; it had "found" the ask in queue.json (run-hands-read-test, 2).
- **Replay of the new checks on all 511 after1 runs:** find_first 2, both real misses; review_leak 5, all real; bare text call 8, all real; no false alarms in the samples read.
- **Open (inbox thread, M5 to M13):** list paging, the 365-day search cap, drafts by sender, unsubscribe moving mail, the lists/who/word-missing scorers, keeping partial answers on a timeout.

## 17 Nov: office predictions checked against after1

- **Predicted** (jobs-plan, before after1): false "done", generic file tools on Office files, ask-where, head maths, and "-2" renamed saves reported as the asked name.
- **Seen:** false "done" yes (excel-edit: "added to your reading log", but it made a new CSV). Ask-where yes (ppt-add). Generic tools yes but harmless (word-read and excel-compare used read_file, both right). Head maths no (excel-sum used office_read, excel-make used =SUM). "-2" no (excel-to-csv-taken said Budget_2026-2.csv).
- **Did the change made for the prediction work?** office_route fired once, and that was a false alarm: convert_file wasn't counted as an Office tool. It's fixed and tested. The maths check never fired on office jobs because nothing called for it, so it's unproven there. The harness PATH_KEY fix worked: compare_files, office_edit and convert_file all ran on the right paths (word-compare, word-edit, ppt-delete, the exports).
- **Not predicted:** word-make. "Write a packing list and save it as a Word document ... in my Documents" took one office_make. The steps check said "only 1 tool step ran", Bob went to security_tips, and the answer became advice on a hacked account. The file was also saved in Bob's own folder, not Documents, yet the code score passed it. Fixed: a words-only step (write, draft, list...) counts as done when a tool made the file (job-steps.js; run-tool-sets-test, 2). The new wrong_folder check catches "in my Documents" made with only a name (run-answer-checks-test, 2). The office scorer should check the saved folder (office thread).

## 17 Nov: office set, round 3 ("expand the office set")

- **New made-up files** (model-lab/office-files.mjs, built the same way every run from a JSON spec): a workbook with 2025 and 2026 sheets, an invoice with formulas and their saved values, a Word file with a table, an old .doc, a contract in a read-only folder, a broken .docx (cut off at 300 bytes), two budgets with nearly the same name, and a 3,000-row order sheet.
- **15 new jobs, 36 in all, 21 need LibreOffice.** Sheets, formula read/show/edit, Word table read/edit, retitle a deck, append to Word, Excel to PDF, two Word files to PDF, old .doc, read-only, broken, ambiguous, big.
- **Score rules:** `either` (read-only: say so, or save a changed copy where allowed; the original must stay), `tried` (the broken file: the read counts even though it fails), `partial` ("I only saw part" with no answer fails), `not` (last year's rent alone fails).
- **"Locked" is Bob's read-only folder setting.** A real Windows file lock (a file open in Word) isn't faked: it can't be made the same way on every system. Unproven in our lab, as we have yet to test it.
- **Checked:** oracle 36/36 pass (15/15 without LibreOffice), a do-nothing brain fails 36/36, run-office-jobs-test 56 checks.
- **Bob bug, fixed 17 Nov (see "office_read's cut note on big sheets"):** on the 3,000-row sheet office_read says it "showed the first 20000 of 20723" characters. The real sheet text is longer than that; the note understates how much was cut. Worth a look in the office thread before after2.

## 17 Nov: office_read's cut note on big sheets

- **Seen** (office thread, round 3, 3,000-row sheet): the note said "showed the first 20000 of 20723 characters". The reader stops once it passes the limit, so the count it gave was only what it had read. A brain would take that as nearly all of it, though only a few hundred of the 3,000 rows were shown. Later sheets also kept being read past the limit.
- **Fix:** read_calc counts the rows it shows on each sheet, cuts on a whole row, and stops once the limit is reached. The note now says "Orders showed rows 1 to N of 3001", names any sheet that wasn't shown, and says not to add up from part of it (convert to CSV and use query_data instead). Documents and decks say only that there is more. Tests: run-office-test, 4 (one with real LibreOffice).
