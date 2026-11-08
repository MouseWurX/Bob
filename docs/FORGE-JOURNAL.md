# The Forge journal

*A lab journal for Bob's own models, kept as the work happens. Newest entry at the bottom. Every number here comes from a file the Forge wrote; the files themselves, with pod ids, addresses and the owner's paths taken out, are in [forge-runs/](forge-runs/). Money is on [What Bob costs to make](COSTS.md), method and results on [Bob's own models](BOBS-OWN-MODELS.md). Rented hardware is named by the card, never by the company it is rented from.*

*Status at the last entry (8 November 2026): 28Bob Riker is home, benchmarked and kept; the first Riker and Bill (v1 and v2) are retired and deleted; 20Bob Bill is not made; the Forge is at build 17, untested on a card since build 14j; the lesson set is 18,118 (half Bob's own, half from other teachers' published sets) and the combined run (lessons, 35Bob Bobert, the odds) started 8 November. Nothing is released.*

## 1. The question

Can one person, with a gaming PC and a few rented card-hours, cut a 35-billion-parameter mixture-of-experts model down to sizes that fit a handheld, a laptop and a phone, and have the small ones still do Bob's job (tool calls, chat, coding, thinking on and off, pictures)? And at what cost, in hours and dollars, honestly counted?

The teacher is [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) (Apache 2.0, Alibaba's Qwen team). The method is expert pruning plus distillation: keep the experts a job actually uses, then retrain the cut model to give the same next-word odds as the full one. The program that does it is the Forge, in [model-lab/forge](../model-lab/forge/). The plan written as a proposal, with milestones and assets in hand, is [PROPOSAL.md](PROPOSAL.md).

## 2. The plan, and the routes it may take

### 2.1 The ladder as it stands

The first ladder (4 November) had nine rungs named by billions of parameters: 24, 18, 12, 10, 8, 6, 5, 4 and 2. After the coverage table was measured (6 November, entry 11 below), the top rungs moved up and the ladder was redrawn. A Bob's name is its size; the nickname is a label and follows the rung, so "Riker" is now the 28-billion Bob.

| Rung | Nickname | Experts kept per layer (of 256) | File at Q4, about | Meant for | State |
|---|---|---|---|---|---|
| 35Bob | Bobert | 256 (no cut; trained on every lesson) | 21 GB | 24 GB cards, or 16 GB with experts in RAM; the teacher of every Bob below | in the making (run started 8 Nov) |
| 28Bob | Riker | 208 | 17.5 GB | a 16 GB card with experts spilling into RAM, or the Q3 file | made 6 Nov, benchmarked and kept 8 Nov |
| 20Bob | Bill | 144 | 12.7 GB | a 16 GB card entirely | not made yet (the 128-expert v1 and v2 were deleted 8 Nov); cut from Bobert, not from Riker |
| 14Bob | Homer | 96 | 9 GB | 8 GB cards and gaming handhelds | planned |
| 10Bob | Milo | 64 | 6.6 GB | small cards, big phones | planned |
| 7Bob | Luke | 40 | 4.6 GB | phones | planned |
| 5Bob | Calvin | 24 | 3.3 GB | phones, the quick brain | planned, kept only if it beats a stock 4B model |
| 2Bob | Bender | 8, then cut in depth and width too | ~1.3 GB | anything, including a Raspberry Pi | stretch goal, last |

Each rung below Riker is cut from the healed Bob above it (step-down ladder), with the keep list built per skill so that every skill keeps about 95% of its routing in every layer (99% for tools, coding and formats). Every Bob ships at Q4 and Q3 and shares the teacher's vision file.

### 2.2 Two lines, and specialists

- **Line A**: healed on Bob's lessons only. **Line B**: Bob's lessons plus coding and software-engineering lessons. Same cuts, different lessons, compared at the end to see which tasks the extra lessons help. Line B is the one being built; line A continues only if the comparison says it is worth it.
- **Specialists** at 8-billion and below, where every expert counts: Cypher (coding), Ponder (deep thinking), Audit (reviewing), Relay (the quick router brain). Each is cut from the general Bob one size up with its own expert count.

### 2.3 Routes not taken yet (ideas, not decisions)

None of these is scheduled or paid for. They are written down so the choice is visible when it comes.

- **Bridget** (working name; "Garfield" was the other candidate): a second family taught by the newer, dense Qwen3.8-27B instead of the mixture-of-experts 3.6. A dense model has no experts to cut, so its Bobs would be made by depth-and-width pruning (the 2Bob method) and would be slower per token on handhelds. Worth it only if 3.8 is clearly the better teacher for Bob's work.
- **Howard** (working name): a Bob healed against a teacher from a different model family, to learn whether a Bob can take another teacher's knowledge without losing Bob's tool habits. A base that was itself distilled from a closed model was advised against.
- **Thoth** (named 8 November; see that day's entry): a Bob cut from one of the community "uncensored" remixes of Qwen3.6-35B-A3B (the "heretic" builds on the naughty list), with the same expert cut and heal as the ladder. Its rungs are named by the cut, 18Thoth, 12Thoth and so on, never "18Bob Thoth". If it is ever made it lives only behind the opt-in naughty-list switch, is never a default brain, is never marked recommended or the quiet pick, carries its remixer's credit on the tag, and keeps the licence of the remix it came from. Two things differ from a Bob heal: the teacher must be the uncensored remix itself (a stock teacher would quietly put the refusals back), and any lesson whose answer is a refusal is dropped from the set first. For the small sizes, teaching a small heretic student (Qwen3.5 9B, 4B or 2B heretic, same vocabulary as the teacher) is likely better than cutting the 35B below about 8B, where the ladder loses half its routing; whether such a student may carry the Thoth name is not decided.
- **Trimmed other models** (for example a mixture-of-experts Gemma trimmed by a quarter): possible with the same tools, but those are not Bobs and would be named plainly, "X trimmed to Y".
- **Expert merging**: the small rungs lose about half of their routing in the worst layer no matter which experts are kept (see the ladder table). Merging rarely-used experts into kept ones, instead of dropping them, is the next lever to try there.

### 2.4 The super-training path (ideas, not decisions)

Everything above heals a Bob once, against Qwen3.6, in one pass. Two ways to go further have been worked out on paper:

1. **Extra rounds on the adapters.** Each healed Bob is kept as an adapter plus keep list, which rebuilds the full-precision Bob from the teacher in minutes. So a Bob can be healed again later, with new lessons or a different teacher's odds, without redoing the cut. The first candidate is a second round for Riker with hard coding lessons.
2. **A much bigger teacher.** The giant Qwen3.8 (2.4 trillion parameters, 95 billion active) cannot be cut into a Bob (its non-expert parts alone are bigger than Riker) and cannot sensibly be run on a rented machine for this project, but it can teach. Three ways, cheapest first: (a) it writes a small set of hard lessons through a hosted API, paid by the word, and a Bob healed with them is raced against one without (the recommended first test, after v3 proves itself); (b) one pass of the giant's odds over the whole lesson set on rented hardware, a far larger spend for an unproven gain; (c) on-policy distillation, where the giant grades the student live, which is out of reach for a one-person project. A middle-sized teacher (Qwen3.8-27B) is the fallback if the giant's lessons do not help. If any of this is bought, the costs page gets the line.

The order agreed on paper: finish v3, benchmark it at home, then the by-the-word test, and only then decide.

## 3. Methods in one place

- **Lessons**: the full model writes Bob's own lessons from Bob's real system prompt and tool list, with neutral names, never anyone's real chats or files. Sets: chat, every tool, thinking on and off, pictures, coding and software engineering, formats, game master, refusals, other languages, and seven "grow on his own" skills (run-and-fix, recover, clarify, notes, new tool, self-check, self-help) plus research and understand. 5% of lessons are held out by id and never trained on. The v3 set (16 folders, 9,059 lessons, 17 MB zipped) is published as a release asset, [lessons-v3](https://github.com/MouseWurX/Bob/releases/tag/lessons-v3), so cloning the repository never downloads it; the public copy has the owner's machine details replaced with neutral stand-ins and is otherwise what the Bobs were trained on.
- **Expert counts**: run a skill's lessons through a model and record which experts each layer picked. The coverage rule turns counts into a keep list.
- **Teacher pass**: the full model, in full precision, records its top-32 next words and their log-probabilities at every answer position of every lesson, plus a general-text sample (public web text and public chat data) so the Bobs keep general knowledge.
- **Heal**: LoRA on every linear layer and on the experts, plus the router, trained to match the teacher's top-32 distribution (weight 0.7) and the real next word (0.3), answer tokens only, one pass; then folded into the weights. The report gives `ce` (how surprised the model is by the teacher's words, lower is better; a loss, not an error rate), `kd` (distance from the teacher) and `teacher_ce` (the teacher's own score, the floor), on held-out lessons and on general text, before and after.
- **Benchmarks at home** (free, on the owner's 16 GB card): experts-per-word test (97 tool phrasings, 20 facts, 6 code tasks), tool score (196 held-out conversations replayed turn by turn, 314 turns), a 13-task coding race, a routing race. All in [forge-runs/benchmarks/](forge-runs/benchmarks/).

## 4. Entries

### 4 November: step 0, free, on the PC

- **Experts-per-word test on the full model** ([report](forge-runs/benchmarks/experts-per-word-full-qwen-2026-11-04.md)): with 8, 6 or 4 experts per word the tool quiz, facts and code held steady (45/97, 20/20, 6/6); 3 hurt (26/97, 4/6); 2 collapsed (1/97, 0/6). Speed 82.7, 92.1, 102.5 tok/s. So cutting looked promising, and Bob's "experts per word" setting gets the range 4 to 8.
- **Lesson writing** on the PC ran at about 60 s a lesson (79 overnight). The same job on a rented H100 served by vLLM wrote 3,753 lessons in 1.03 h, about 1.5 a second with 24 in parallel ([log](forge-runs/2026-11-04-lessons-night/lesson-writer.log)). 3,832 lessons in all, 88 ideas skipped for running out of room.
- **Expert counts** (llama.cpp's importance counter, on the PC): the work is spread wide. Keeping the busiest 48 experts per layer covers 51.5% of picks (32: 39.6%, 16: 24.3%, 8: 14.4%); 90, 95 and 99% coverage need 155, 187 and 227 of 256. Coding's busiest 48 overlap the general top 48 by 80%, deep thinking's by 73%: specialists are worth it at small sizes.
- **Decision**: build the Forge (Node on the PC, Python on the pod) and rent by the hour; nothing is rented until the owner types yes.

### 4 to 5 November, night: three failed attempts

Each one a few minutes of card time and one lesson ([logs](forge-runs/2026-11-05-failed-attempts/)):

1. The machine image had no `git`, so the tool download broke. Fix: fetch with Python's own HTTP, pin llama.cpp to a tag.
2. The prebuilt `llama-quantize` would not run on the image (archive ownership errors, a too-strict exit-code check). Fix: build the llama tools in the background, never fatally; export BF16 only if they fail.
3. The teacher server (vLLM) died during the teacher pass, and the chat template had been skipping 45% of the tool-call lessons. Fix: score the teacher in-process with transformers in BF16 instead of through a server; parse tool-call arguments to dicts. Also learned: downloads are slow in some data centres.

**Lesson**: the first paid run of any new pod-side code is its test. Keep the first run short and cheap, and salvage the pod's logs before deleting it (added to the Forge after attempt 3).

### 5 November: line A, v1 (24Bob Riker, 18Bob Bill), one H100 80 GB

[Watcher logs](forge-runs/2026-11-05-lineA-v1/), [Riker report](forge-runs/2026-11-05-lineA-v1/24Bob-Riker-v1-heal-report.json), [Bill report](forge-runs/2026-11-05-lineA-v1/18Bob-Bill-v1-heal-report.json).

- Teacher pass: 71 min for 3,616 lessons (21 skipped) plus 10M general tokens.
- Riker's first heal crashed at once (LoRA parameters left on the CPU). Restarted on the same pod with a `--restart` command added to the Forge. Then a wrong probe made the grouped matrix multiply fall back to a Python loop at about 10 minutes a step; fixed and restarted again.
- 24Bob Riker v1 (176 experts): 195 of 456 planned steps in 1.75 h, stopped by the clock. Held-out lessons ce 0.383 to 0.355 (teacher 0.325), kd 0.068 to 0.063; general 2.245 to 2.224 (teacher 2.101).
- 18Bob Bill v1 (128 experts, cut from healed Riker): 163 of 456 steps in 1.5 h, stopped by the clock. Lessons ce 0.585 to 0.501, kd 0.287 to 0.197; general 2.324 to 2.308. A half-cut starts much further from the teacher than a quarter-cut.
- Found on the pod: its self-delete got a 403 because the rental service injects its own limited key into every pod (fixed: the Forge passes the owner's key under another name); the pod's watchdog read the host's uptime, not the container's (fixed). The H100's 80 GB was tight (68 GB in use with trimming of long lessons).
- **Benchmarks** ([tool score](forge-runs/benchmarks/tool-score-full-riker-v1-coder30b-2026-11-05.md), [Riker experts test](forge-runs/benchmarks/experts-test-24Bob-Riker-v1-2026-11-05.md), [Bill](forge-runs/benchmarks/tool-score-18Bob-Bill-v1-2026-11-05.md)):

| Model | Right tool | Right arguments | Correctly no tool | Overall | Speed |
|---|---|---|---|---|---|
| full Qwen3.6 | 72/123 | 44/123 | 167/191 | 211/314 (67%) | 84.7 tok/s |
| 24Bob Riker v1 | 58/123 | 39/123 | 167/191 | 206/314 (66%) | 149.9 tok/s |
| 18Bob Bill v1 | 64/123 | 39/123 | 166/191 | 205/314 (65%) | 190.2 tok/s |
| Qwen3-Coder-30B (for scale) | 58/123 | 26/123 | 105/191 | 131/314 (42%) | 82.8 tok/s |

  Experts test: Riker v1 53/97 tools, 20/20 facts, 4/6 code; Bill v1 45/97, 12/20, 0/6. Coding race (13 tasks): Riker v1 thinking 8/13, no-think 6/13, against the full model's 12/13 and 11/13. Routing race 16/17.
- **Readings and decisions**: tool choice survived the cut; coding and, at 18Bob, facts did not. The owner's rules from here: no trimming of long lessons, no clock-capped heals, full passes, a bigger card. A rented network drive to keep the teacher, general text and healed weights between sessions. Two lines (A and B). The healed full-precision weights of v1 were lost with the pod (no drive yet).

### 5 to 6 November: line B, v2 (Riker + Bill), one H200 141 GB, with the drive

[Watcher log](forge-runs/2026-11-05-lineB-v2/forge-watcher.log), [Riker v2 report](forge-runs/2026-11-05-lineB-v2/24Bob-Riker-v2-heal-report.json), [Bill v2 report](forge-runs/2026-11-05-lineB-v2/18Bob-Bill-v2-heal-report.json).

- The full model, served on the card, wrote 717 coding and software-engineering lessons in 16 min (16 in parallel; the idea list ran out at 751).
- Teacher pass: 78 min; 4,315 train and 234 held-out pieces, 24.9M tokens; max length 16,384, nothing trimmed.
- 24Bob Riker v2: full pass, 524 of 524 steps, 4.8 h, 35.5M tokens seen. Lessons ce 0.389 to 0.356, kd 0.073 to 0.060; general 2.245 to 2.220. Coverage of the keep list: 128 experts would keep 89% of its routing, 80: 69%, 48: 50%, 32: 38%.
- 18Bob Bill v2 (cut from healed Riker v2): 524 steps, 4.5 h. Lessons ce 0.586 to 0.487, kd 0.287 to 0.186; general 2.319 to 2.300. Adapters (1.5 GB and 1.1 GB) came home for the first time.
- **Benchmarks** ([tool score](forge-runs/benchmarks/tool-score-riker-v2-bill-v2-2026-11-06.md), [Riker v2 experts test](forge-runs/benchmarks/experts-test-24Bob-Riker-v2-2026-11-06.md), [Bill v2](forge-runs/benchmarks/experts-test-18Bob-Bill-v2-2026-11-06.md), [coding race](forge-runs/benchmarks/coding-race-riker-v2-2026-11-05.log)): tool score Riker v2 206/314 (66%), Bill v2 208/314 (66%); experts test Riker v2 48/97, 20/20, 3/6, Bill v2 45/97, 11/20, 0/6; coding race Riker v2 6/13 thinking and 6/13 not, no better than v1.
- **What went wrong, found the same day**: 37% of the coding lessons taught the model to hand code off to a specialist tool rather than write it, so a full pass of them could not lift coding; and the keep list had been the busiest-overall experts, protecting no skill in particular. Both are written up on [Bob's own models](BOBS-OWN-MODELS.md#what-went-wrong-with-the-first-cut). Decision: re-cut Riker and Bill with a coverage rule and clean lessons (v3), measure what every size keeps first.

### 6 November: the counts-only run, failed once, then done

- First attempt ([logs](forge-runs/2026-11-06-counts-v3-failed-attempt/)): the lesson writer gave the new skill jobs a weight of zero, so they wrote nothing, and the Forge stopped the card to limit the loss. 2,329 improved coding lessons from it were kept after cleaning (hand-off answers removed).
- Second run ([watcher log](forge-runs/2026-11-06-counts-v3/forge-watcher.log)): 2,898 lessons across 14 skill sets written on the card, then every one of 24 skills counted on the full model in one load. Result: [ladder.md](forge-runs/2026-11-06-counts-v3/ladder.md), the kept share per skill at every size, average layer and worst layer.
- **Findings**: 23 of the 24 skills move together (at 208 experts: 97 to 98% average, 92 to 93% in the worst layer; at 144: 87 to 90% / 75 to 77%; at 96: 74 to 77% / 58 to 61%). General knowledge, counted on the outside text, breaks first (208: 90/84; 144: 66/56; 96: 48/38). The worst layer is layer 2 for every skill, an early layer with spread-out routing. The v1 keep lists were within a point of the new rule at the same size, so the v2 coding gap was the lessons, not the cut.
- **Decision**: Riker v3 at 208 experts (28Bob), Bill v3 at 144 (20Bob), with the keep lists built on the PC from these counts; cover 95%, 99% for tools, coding and formats.

### 6 to 7 November: line B, v3, first half (28Bob Riker made, 20Bob Bill not), one H200

[Watcher log](forge-runs/2026-11-06-lineB-v3-riker/forge-watcher.log), [pod log](forge-runs/2026-11-06-lineB-v3-riker/pod-log.txt), [phases](forge-runs/2026-11-06-lineB-v3-riker/pod-status.json), [Riker v3 report](forge-runs/2026-11-06-lineB-v3-riker/28Bob-heal-report.json).

- No H200 was free in the drive's data centre for 25 minutes, so the Forge, as it was then written, took one in another data centre **without the drive**. Everything that follows was therefore on the pod's own disk only.
- Lessons merged: 5,227 extra lessons from 15 sets on top of the base set; 3,450 tool sets.
- Teacher pass: 125 min, 26,628 pieces, 64.0M tokens, 73 GB peak, nothing skipped. The log shows `causal_conv1d_fn` falling back to the slow reference path at every model load (see 7 November).
- 28Bob Riker v3 (208 experts, cut in 5 min): full pass, 929 of 929 steps, 5.9 h, 63.4M tokens, 2,975 tok/s at the end, 105 GB in use. Lessons ce 0.401 to 0.362, kd 0.087 to 0.067 (teacher 0.324); general ce 2.154 to 2.158 (up a hair), kd 0.178 to 0.132. Count 3 min, export to Q4 (17.5 GB) and Q3 (13.9 GB) 24 min, adapter 1.7 GB. All home.
- Then Bill: the skill counts on the healed Riker took 21 min, and the keep-list step died on a shell bug (the plan reader could not see the whole plan inside a rung expression, so the coverage tool got an empty argument). The pod deleted itself as designed. With no drive, the full-precision healed Riker and the teacher's scores (2.5 h of card time) went with it.
- **State**: Riker home, not benchmarked. Bill not made. The healed Riker can be rebuilt from the adapter and keep list when the rebuild script exists.
- **Open question**: the general-text ce rose slightly while kd fell; the heal matched the teacher's distribution better and the raw next word slightly worse on outside text. Watch it on Bill; if it repeats, lower the teacher weight for general text.

### 7 November: Forge build 15, written on paper only (no card until the owner says so)

Fixes from the v3 log, all untested on a card:

1. **The teacher's scores are kept.** The lesson set gets a key (hash of the merged lessons, tool sets, teacher, top-k, max length and general budget). The scores and the tokenised lessons are saved on the network drive under that key and downloaded to the PC as soon as the pass ends, while the first rung heals. A later run with the same lessons finds them on the drive, or the PC uploads them, and skips the pass.
2. **The fast kernels were never used.** In every run so far `pip install causal-conv1d` reported success and transformers still said the kernel was not installed. The likely cause: pip builds it in an isolated environment against a different torch, so the compiled module fails to import, and transformers silently falls back to the slow path. Build 15 builds it against the image's own torch, counts it ready only when it imports, keeps the wheel on the drive per card type, and makes the teacher pass and every heal wait for it (up to 30 minutes). How much faster the heal gets is unknown until a run has it; the next pod log will say.
3. **Renting rules.** A card is only ever taken in a data centre that has one of our network drives; if ours are out of cards, a drive is made where a card is, rather than running without one. After a wait, the next card up (B200 for the H200) is tried too, under the same rules. The old "any data centre, no drive" fallback is off unless the plan turns it on.
4. The plan-reader bug that ended the v3 run (build 14j, same day) and a silently empty "strong skills" list in the counts-only ladder, which had used 95% for every skill.

**Next**: benchmark Riker at home (tool score, experts test, coding race, long-document and 128K needle), then Bill alone from the teacher with the PC-built keep list, when the owner gives the word. Then Homer.

### 8 November: Riker benchmarked at home, kept; v1 and v2 deleted

From this entry on he is just **Riker** (28Bob Riker); "v3" was the name of the run.

- **The bill.** The 6 to 7 November rental came to $51.79 on the statement (the Forge's own tally was $51.26): 9.7 h on an H200, no drive. Nothing was lost beyond Riker's own run and the teacher's scores; the Bill step stopped before it started healing.
- **An honest correction.** The rule says 99% coverage for tools, coding and formats. Riker's keep list was built from the counts-only ladder, whose "strong skills" list was silently empty, so every skill got 95% (the fourth fix in build 15). The ladder table is still the real measurement of what 208 experts keep. Bill's list will use the full rule.
- **Benchmarks** (the owner's PC, Q4, 8 experts per word, the same settings for every model):

| Test | Riker | Riker v2 | Riker v1 | Full Qwen3.6 35B |
|---|---|---|---|---|
| Coding race, 13 tasks, thinking on | 9 | 6 | 8 | 12 |
| Coding race, thinking off | 7 | 6 | 6 | 11 |
| Quick code test | 6/6 | 3/6 | 4/6 | 6/6 |
| Facts | 18/20 | 20/20 | 20/20 | 20/20 |
| Tool score, held-out conversations | 65% | 66% | 66% | 67% |
| Tool phrasing test | 47% | 49% | 55% | 46% |
| Routing race, new 25-job set | 24/25 | older set | older set | |
| Speed | 111 tok/s | 144 | 145 | 83 |

- **Long-document needle test**: one fact at 25, 50 and 75% depth in 8K, 32K, 64K and 128K windows (prompts of about 7.1K, 27.9K, 55.9K and 111.6K tokens). Riker at Q3: 12/12. Full Qwen at Q4: 12/12. A 128K window fits a 16 GB card with partial offload.
- **Reading**: the clean coding lessons worked (best Bob at code so far, level with the full model on the quick test, still below it on the long race). Tools level with v1 and v2. Two short-fact answers lost, to watch on Bill. Long context unharmed, as expected: it lives in the attention layers, which the cut does not touch. Slower than v2 because the bigger file spills further off the card.
- **Speed note for the next run**: the pod lacked working `causal-conv1d` and `flash-linear-attention` kernels, so Qwen3.6's linear-attention layers ran the slow path for the whole teacher pass and heal (build 15, item 2).
- **Decision**: keep Riker. Riker v1, Bill v1, Riker v2 and Bill v2 are retired and their files deleted. Next: one combined run (lessons, 35Bob Bobert, then 20Bob Bill cut from Bobert with the full rule), when the owner gives the word; see the build 17 entry.

### 8 November: lessons from other teachers, a quality pass, the even rule, and build 16

No card. Work on the lesson set and the Forge, all on paper and on the PC.

- **Other teachers' lessons.** Five published answer sets from much bigger models were converted into Bob's lesson format (see [the list on the models page](BOBS-OWN-MODELS.md#lesson-sets-by-others-we-find-interesting)): Kimi K2.5 and GLM-5.1 agent traces (Apache 2.0), and DeepSeek V4 Pro agent, DeepSeek V4 Flash chat and GLM-4.7 answers (no licence stated, so they are used here for training only and are never redistributed). They were first capped so that their answer tokens matched Bob's own; the owner then asked for the two halves to be even **by count**, so the outside sets together now hold 9,059 lessons, the same as Bob's own 9,059, and the set is 18,118.
- **Quality pass, with findings.** Every outside set was checked before it stayed in: does each trace end with a real answer, does it loop on one tool call, does it carry anything that looks like injected instructions, piped installers, secrets or destructive commands.
  - GLM-5.1 agent (758 traces): **dropped**. Only 108 end with an answer; the rest stop mid tool-call, and the tool outputs often do not match the task (a TypeScript repository listing inside a TensorFlow job). Broken, not malicious.
  - Kimi K2.5 agent: 1,171 of 1,207 kept; 36 dropped for never answering or looping on the same command.
  - DeepSeek V4 Pro agent (2,553) and GLM-4.7 (864): kept whole. Every trace ends with an answer, no loops, tidy tool use; the agent traces include noticing and fixing their own bugs.
  - DeepSeek V4 Flash chat: 4,471 of 6,290, a seeded sample, to make the total even.
  - The scan for injected instructions found nothing beyond ordinary Dockerfile lines (`rm -rf /var/lib/apt/lists/*`) and package sites. That proves the absence of planted instructions, not the correctness of the content; the hold-out scores and benchmarks before and after a heal remain the real check, and every heal is an adapter that can be thrown away.
- **Odds for the outside lessons.** In the Forge, every lesson is scored by the one teacher, Qwen3.6-35B, including lessons another model wrote. So a Bob learns Kimi's or DeepSeek's words but copies Qwen's judgement about which words were likely. Three ways to do better were costed and set aside for now: (a) run each author model and record its own odds: each needs an 8-card machine (about $35 to $45 an hour), roughly $60 to $120 per model, and the odds are over a different token alphabet, so they must be translated piece by piece, lossy and not built; (b) ask the hosted versions to re-answer the prompts with their odds switched on (a few dollars per million words, so $20 to $40 for all of them), fill the unseen tail of each distribution with a falling curve, then the same translation problem; (c) the free version: weight the words-as-written more heavily than Qwen's odds for the outside sets (50/50 instead of 70/30), a one-line change to the heal. Order chosen: (c) first, measured on Bill; (b) only if the outside sets prove their worth. Also noted: there is no measured number here for odds versus words-only healing on Bob's own set; published work puts the gap at three to five times the lessons for the same recovery, and a $10 two-way heal of one small Bob would settle it for this set.
- **The nine thin sets.** The "grow on his own" skills (run-and-fix, recover, clarify, new tool, self-check, research, understand), formats and reasoning each have 180 to 280 lessons. The owner asked for about 1,000 each. The writer continues a set in place (it skips ideas already done and drops duplicate prompts), so these grow in the next rental, about 7,000 new lessons in roughly 3 hours of card time.
- **Forge build 16** ([README](../model-lab/forge/README.md)): the merge of extra sets on the pod now tags each set by a hash of its content and merges in tag order, so the merged file, the teacher-score key and the piece ids are identical whether a set was written on the card or uploaded from the PC (without this, lessons written on the card and uploaded later would have missed the score cache). A plan with no rungs is a scores-only run. Everything a run uses or makes is kept on the network drive as well as the PC: lesson set, scores, logs, reports, kernel wheels.
- **Plan for the next two rentals** (the owner's choice, after a costed set of routes): first a lessons-and-odds run (grow the nine sets, then one teacher pass over the whole set, about 9 hours on one H200, no cut, no heal), then Bill v3 healed from those scores with no pass. The same total as one combined run, split so the odds exist first. The network drive for it is 200 GB rather than 100, because it must hold the teacher model, the scores and a healed Bill at once.

### 8 November: Thoth named, on paper only (nothing cut, nothing rented)

The owner named the uncensored route **Thoth** and set how it would be made, if it is made at all. Written down in 2.3 above: a cut of a community heretic remix of Qwen3.6-35B-A3B, healed against that remix (not the stock 35B) on a lesson set scrubbed of refusals, rungs named by the cut (18Thoth, 12Thoth), listed only behind the naughty-list switch, never recommended, remixer credited. For the small end, a distilled small heretic student may beat a deep cut; the name for those is open. The Forge needs no new code for it: the teacher is set per plan file, and the refusal scrub is a short script over the lesson set. It waits behind Bill v3 and the current hold, and it costs about one heal run per size when it comes.

## 5. Running tallies

| | Count |
|---|---|
| Bobs made | 5: Riker v1, Bill v1, Riker v2, Bill v2 (all four retired and deleted 8 Nov), and Riker (28Bob) |
| Bobs that are the current plan | Riker (28Bob), kept; Bobert (35Bob) and Bill (20Bob) next |
| Failed paid attempts | 4 (three on 4 to 5 Nov, one on 6 Nov) plus the stopped Bill step of 6 to 7 Nov |
| Outside lesson sets dropped for quality | 1 of 5 (GLM-5.1 agent traces, 8 Nov) |
| Lessons written | about 9,500 across 17 sets (Bob's own); plus 9,059 taken from other teachers' published sets after a quality pass |
| Card time | on the costs page |

### 8 November, later: Bobert, and publishing from the card (build 17)

- **Decision (the owner):** before Bill is cut, the full teacher is trained on every lesson and kept as a Bob of its own, **35Bob "Bobert"** (no cut, all 256 experts, about 35 B parameters, 3 B active). The order becomes: write lessons, train the teacher, score the odds *with Bobert*, cut Bill from Bobert, heal Bill against Bobert's odds. The odds must come from the trained teacher, or Bill would be healed toward a brain that no longer exists, so the lesson-set key now names the teacher by its adapter.
- **Why:** Bob's habits go into the big brain once and every cut below inherits them; Bobert is also a brain for 24 GB cards. The risk is that a trained teacher's odds lean toward the lessons; the heal's general text is there to soften that.
- **Build 17:** `train_teacher` (plain next-word training, no odds; heal.py with alpha 0), `teacher_model` for later runs, and `publish`: the pod uploads the teacher's odds to Hugging Face as a private dataset, keeps every GGUF on the drive and sends only the quant files named for testing down to the owner's PC; a Bob is uploaded (private, with a generated model card) only in a later run, after his home test, when the owner lists him. The owner's rule: lessons and odds may go up right away, no untested Bob. Bobert gets one full pass over every lesson (the owner's rule from 6 November: a full pass or nothing), about 16 hours on its own; the combined run (lessons, Bobert, export, odds) is estimated at 24 to 26 hours with caps at 30 hours; the drive grows to 300 GB.
- **Bobert's ladder row:** 35Bob, 256 experts, about 21 GB at Q4 and 17 GB at Q3; meant for 24 GB cards, or a 16 GB card with experts in RAM. Benchmarked at home before he is the teacher of anything, like every Bob.
- **Road map after this run (the owner, 8 November):** 1. lessons, Bobert (Q4 and Q3), odds; Bobert tested at home. 2. Bill cut from Bobert and healed, tested at home. 3. With all three in hand, one rental runs the same benchmarks on the big card, so every brain has a home number and a commercial-card number side by side. 4. Docs, then the GitHub and Hugging Face uploads. Lessons and odds may go up (private) right away; no Bob before his tests.

### 8 November, later still: the lessons are public, and the writer stops throwing away cut-off lessons

- **Published:** Bob's lesson sets are on Hugging Face as [MouseWurX/bob-lessons](https://huggingface.co/datasets/MouseWurX/bob-lessons): the 16 own sets (9,059 lessons, CC BY-SA 4.0) and the Kimi K2.5 traces we trained on (1,171, Apache 2.0, credited to their makers). The other outside sets state no licence and are only linked. The owner made the dataset public the same morning; one stray folder name from the owner's machine was found in a listing lesson afterwards and replaced. The teacher's odds go to a private dataset from the card when the pass finishes; the Forge gained `--send-token` so a running card can be handed the Hugging Face token after the fact.
- **Lesson sets this run (kept of 1,000 ideas each):** codefix 854, recover 874, clarify 876, newtool 907, selfcheck 848; research, understand, selfhelp and notes follow. About one idea in ten was dropped because the teacher's turn ran past its word budget (6,000 tokens with thinking, 2,000 without).
- **Build 18 begins (the owner asked):** the writer now tries a cut-off lesson once more instead of dropping it, with thinking off (the thinking is what eats the budget) or, if thinking was already off, with twice the room. Not foolproof: an idea that needs pages of thinking is still dropped after the second try, on purpose, since a lesson that only works with endless thinking is not one Bob should learn. The set summary now counts the skipped and the rescued. It went onto the PC between sets, so the last sets of this run already use it.

### 8 November, a teacher made of GGUF, and a build bug caught early

- **A second kind of teacher.** A teacher that only writes lessons no longer has to be the full research model in its training form. The Forge can now serve any community model that ships as a GGUF (the compact file format a laptop uses to run a model) straight on a rented card, and the lesson writer talks to it the same way. This opens the door to borrowing another model's style, for example a terser way of thinking, for a themed lesson set, with every output still passed through Bob's kept refusals afterwards. The run that uses this is its own separate card, so it never touches whatever else is training.
- **The bug, and why it only showed up now.** Serving a GGUF on the card needs a GPU build of a small server program, compiled on the card at setup. The build step was written for the benchmark feature and had never actually run on a card until now. It failed at the very first stage: the build was told to make everything static, and on a current version of the server's source that combination makes the configuration step refuse to start, complaining about a missing internal target. Nothing was compiled, so the teacher never came up and the run stopped before writing a single lesson. The card had already downloaded the 40 GB teacher by then, so the failed attempt still cost a little; the Forge deleted the card by itself and the total across the tries stayed under three dollars.
- **The fix.** The build now uses the plain, recommended settings instead of forcing the static combination, builds only the one program it needs, and checks that the program actually runs before it says it is ready. The configuration log is also copied somewhere it survives the card being deleted, so if a future build ever fails the reason is in hand without a second attempt. A cold card with no saved drive was also given a longer grace period to come online, since it has to fetch its setup image and the large teacher file before it can answer.
