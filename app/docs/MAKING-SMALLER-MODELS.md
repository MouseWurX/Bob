# Making smaller brains from bigger ones: what we've learned

*Everything this project has learned, so far, about cutting a big model down and teaching it back. Each point says what to do and why, with the number that taught us. The full story is in [Bob's own models](BOBS-OWN-MODELS.md), the day-by-day record in [the Forge journal](FORGE-JOURNAL.md), and every dollar in [What Bob costs to make](COSTS.md). Last updated 12 November 2026.*

The short version:

1. Fix the big brain first, then cut. Every smaller brain inherits what the big one knows and does.
2. Cut gently, by what each skill needs, and score experts by what they actually do (REAP), not only by how often they are picked.
3. Below about half the experts, a cut alone is not enough. It needs a heal (teaching it back) as well.
4. Heal against the odds of the teacher you actually have now, on clean lessons, and judge on lessons it never saw.
5. Fit the brain to the device's real memory, and test it there.
6. Test every new step on a cheap card or at home first, and cap every rental in hours and dollars.

## Questioning the plan paid off

Nearly every lesson below came from the owner asking "why are we doing it this way?" and the plan changing. Each time:

| The owner asked | What we changed | What we learned |
|---|---|---|
| Why stop a heal when the clock runs out? | A full pass or nothing, on a bigger card | The clock-capped Bobs were half-healed. Full passes are the baseline now. |
| Why trim long lessons to fit the card? | No trimming, H200 instead of H100 | The card should fit the lessons, not the other way round. |
| Why didn't the coding lessons help? | Read the lessons themselves | 37% taught the brain to hand code off. Clean lessons took Riker from 6 to 9 of 13. |
| Why use small models to teach a big one? | Teachers only the same size or bigger | A student can't learn more than its teacher knows. |
| Why not teach the full model first? | Bobert, then every cut from him | His habits carry down, and the odds must come from him, not from stock Qwen. |
| Why throw away lessons that ran out of room? | One retry with thinking off or twice the room | About one lesson in ten came back. |
| Why upload before removing duplicates? | A cleaning pass before every upload | 231 bad lessons in the first public sets. |
| Why cut at all, if we can just tune? | REAP calibration on the uncut models | An uncut model loses almost nothing down to half its experts. An already-cut one collapses. |
| Why fix facts after the cut? | Fix the full brain first, then cut | The heal copies the teacher's odds, wrong facts included. |
| Why refuse to load from an estimate? | Try the load, step down only on a real out-of-memory | The estimates were often wrong. |

So keep asking. A pivot that costs a day usually saves a rental.

## 1. Before you cut: fix the big brain

- **Teach the big brain first.** Bob's habits went into the full model once (35Bob Bobert, trained on every lesson), and every smaller Bob is cut from him. That way each cut inherits the habits instead of learning them again.
- **Fix facts before the cut, not after.** A heal copies the teacher's odds (70% of its pull). If the teacher has wrong or slanted facts, the smaller brain learns them too. So fix the full brain first, check it with new held-out questions, and only then cut. If a fact lesson must go into a heal from an unfixed teacher, train it on the written words only, without the teacher's odds.
- **Don't teach a big brain with a smaller one.** Lessons and odds come from teachers the same size or bigger.

## 2. Cutting: which experts to keep

A mixture-of-experts model has many small networks ("experts") per layer, and a router picks a few for each word. Cutting means keeping only some of them.

- **Cut by what each skill needs, not the busiest overall.** Count which experts each job uses (chat, tools, coding, facts, maths, planning and so on), keep enough in every layer to cover 95% of each job's routing (99% for tools, coding and exact formats), and keep the union. The first cut kept the busiest overall, and nothing stopped a small skill from losing its experts.
- **Check the keep list before you pay to heal it.** The check is free. One early run reused an old keep list unchecked and could not have lifted coding.
- **Experts follow word patterns, not topics.** Any job's top 96 experts cover another job's routing about as well as that job's own top 96 (72 to 76%). So there is no clean "coding experts" set, and loading only a job's experts saves little. Let the router choose.
- **General knowledge breaks first.** At 208 of 256 experts a typical skill keeps 97 to 98% of its routing, but knowledge outside Bob's own work keeps 90%. At 128 it keeps 60%. A smaller Bob stays good at being Bob and gets vaguer about the wide world.
- **The worst layer sets the limit.** Layer 2 was the worst for every skill. Under about 85% kept in the worst layer, the skill feels the cut.
- **Healing can't grow back a removed expert.** It trains the experts that are left. Whatever the cut drops is gone, so cut gently and let the size decide what a brain is for.
- **Step down the ladder.** Cut each rung from the healed rung above it, not straight from the top. Small steps lose less, and every rung is a usable brain.
- **Long context survives a cut.** It lives in the attention layers, which an expert cut doesn't touch. Riker found one fact in 128K tokens 12 times out of 12, the same as the full model.

### Score by what experts do: REAP

- **Counting picks isn't enough.** How often an expert is picked misses how much it changes the answer. REAP scores each expert by its router weight times the size of its output, and it ranks better. A community 48-expert cut of GPT-OSS 120B made by pick counts alone fell apart.
- **Calibrate on the model's own work.** Score on lessons plus general text, and include the model's own answers. Score on the training lessons and judge on held-out ones.
- **Try a keep list before you slice.** Switching experts off in place (setting their router bias very low) lets you test a keep list and undo it exactly. A mask saves no memory by itself, so slice the file once the list is right.

### How far a cut can go with no heal

REAP trims on 12 November, with experts switched off and no retraining, scored on 314 held-out chat turns:

| Brain | All experts | 75% kept | 50% kept | 35% kept |
|---|---|---|---|---|
| GPT-OSS 120B (uncut) | 204 | 204 | 196 | |
| 35Bob Bobert (uncut, 256) | 204 | 204 | 198 | 145 |
| 28Bob Riker (already cut to 208) | 210 | 204 | 163 | 72 |

- **An uncut model has slack.** Bobert and GPT-OSS 120B lose almost nothing down to half their experts.
- **A model that was already cut has much less.** Riker is already a cut, and he collapses at half, mostly by calling tools when he shouldn't.
- **Below about half the experts, cut and heal.** That's why the smaller rungs (Homer at about 9 GB, Milo at about 6.6 GB) are planned as a cut plus a heal, never a trim alone.

## 3. Healing: teaching it back

- **Learn the teacher's odds, not only its words.** The heal trains the cut brain to match the teacher's top-32 next-word odds (weight 0.7) and the real next word (0.3), on answer tokens only. Published work puts words-only teaching at three to five times the lessons for the same recovery.
- **Use the teacher you actually have now.** Stock Qwen and trained Bobert share the same word list (token table), but Bobert's trained weights give different odds. Bill was healed against Bobert's odds, not stock Qwen's. Otherwise he'd be pulled toward a brain that no longer exists. The lesson set's key names the teacher by its adapter, so old odds can't be reused by mistake.
- **Re-score answers from other families. Don't translate their odds.** GPT-OSS, Kimi or DeepSeek use a different word list, so their odds don't map onto Qwen's. Keep their answers as text and have our own teacher score them.
- **Save the odds and reuse them.** A teacher pass costs hours. Bill reused Bobert's saved odds and skipped about six hours and $30. Saved answers and odds also feed later training.
- **Do a full pass or nothing.** The first heals were stopped by the clock partway through and came out half-healed. Every heal since is one full pass.
- **Mix in general text.** About a third of the heal is public web and chat text, so the brain keeps general knowledge. Watch it: Riker's general-text score held level, and Bill's improved slightly.
- **Know what a heal can't do.** Bill (144 of 256) is the best of the three at tool decisions (68%) but dropped to 12 of 20 facts and 1 of 6 code tasks. A heal on the same lessons can't bring those back. The fix is a gentler cut or lessons that teach facts and code.
- **Get the fast kernels working.** Qwen3.6's linear-attention layers ran the slow fallback for several runs without saying so. With the real kernels built against the image's own PyTorch, Bobert's pass took 10.3 hours instead of about 16.

## 4. Lessons: what the brain learns from

- **Lessons teach habits, good and bad.** 37% of the first coding lessons handed the job to a coding tool with a pretend result, so the brain learned to hand off code instead of writing it. Coding didn't move after a full heal. Clean coding lessons lifted Riker from 6 to 9 of 13 on the coding race.
- **Check every lesson set before it goes in.** Drop lessons that never reach an answer, loop on one tool call, call a tool that doesn't exist, or are empty or duplicated. Cleaning Bob's first 16 sets took them from 9,059 to 8,828 lessons (73 duplicates, 123 with no final answer, 28 unknown tools, 6 loops, 1 empty). One outside set (GLM-5.1 agent traces) was dropped whole, because most traces stopped mid tool-call.
- **Keep a held-out split and never train on it.** About 5% of lessons are held out by id. Benchmark chats are held out too. Today the public set is 14,586 training lessons and 831 held out.
- **Retry a lesson that ran out of room.** Try once more with thinking off, or with twice the room. Drop it after that, because a lesson that only works with endless thinking isn't one to learn.
- **Write lessons from the real system prompt and tool list**, with neutral names, never anyone's real chats or files.
- **Balance outside lessons with your own.** Lessons from other teachers' published sets were capped to match Bob's own by count (9,059 each).

### Scrub before anything goes public

- **Scrub the public copy only.** Replace user folders, home and private network addresses, e-mail addresses and names with neutral stand-ins. The raw folder is never changed.
- **Check again after the scrub, and again after the upload.** A stray folder name in one lesson got through the first scrub and was found only after the set went public. A recheck gate now runs after every scrub.
- **Publish lessons as a living dataset.** [MouseWurX/bob-lessons](https://huggingface.co/datasets/MouseWurX/bob-lessons) grows as runs add lessons. Each set has its own training and held-out files. Results from each run (graded answers, the right ones, and preference pairs) go in their own files. The REAP scores get their own dataset per model, not mixed into the lessons.

### Thinking styles you can switch on

- **Tag a style, don't blend it away.** "Famous style" lessons put a switch on the system line, such as "Think: Sherlock", so one brain learns several ways of thinking and the user picks one. Untagged lessons keep the brain's normal style.
- **Think on tool turns too.** Write the thinking style into turns that call a tool, not only into chat answers, so the style holds while the brain is working.
- **Keep empty thinking out of the answer mask.** An empty think box isn't something to learn.

These sets (four styles, 400 lessons each) are being written now. Their results will be added here.

## 5. Calibration and fitting the device

- **Tune experts per word after the cut.** On the full model, 8, 6 and 4 experts per word held quality, 3 hurt and 2 collapsed. On Riker, 12 was best: 68% held-out against 65% at 8, about 7% slower. Re-tune after every cut.
- **Expect noise in small quizzes.** A 97-question quiz moves by 3 to 5 between runs. Trust held-out chats for decisions.
- **Fit the real memory, then test on the device.** A handheld with 16 GB of shared memory has much less than 16 GB free for a brain. Bill at 12.7 GB doesn't fit, so the handheld's rung is about 9 GB. On shared-memory graphics, try the load and step down only on a real out-of-memory error. Estimates were often wrong in both directions.
- **Pin the hot experts on the card.** For a brain bigger than the card, a fixed split (some layers' experts in RAM) beat a cache that swaps experts. The swapping cache made generation about three times slower.
- **Quantize with an importance matrix made on the cut file** from the same lessons plus general text. It matters most at Q3 and below. (Planned for the export, not yet in it.)
- **Keep the multi-token prediction head if you want speed later.** The training tools drop it, so it needs re-fitting after the heal. (Planned.)

## 6. Renting cards and spending

- **Cap every rental in hours and dollars.** The card deletes itself at the cap, and again when the run ends. Once a card sat idle for two hours after its job (about $11) because the home side's window was closed.
- **Nothing is rented without the owner's yes.** Every paid step is checked in.
- **The first paid run of new code is its test.** Keep it short. Before any rental, run every home-side command against a stand-in server, using a folder name with a space in it. Three benchmark failures in a row came from home-side bugs.
- **Keep a network drive where the card is.** A run without one lost the full-precision healed Riker and 2.5 hours of teacher scores when the card deleted itself. Now a card is rented only where a drive is.
- **Pick the card by memory first, then by price for the job:**
  - Heals of a 35B model need more than 80 GB. An H100 80 GB ran at 68 GB used and had to trim long lessons. An H200 141 GB holds the teacher and the heal without trimming. It's the default, at about $5.29 an hour.
  - A B200 costs about $7.99 an hour, about 1.5 times an H200. It's only worth it if it runs the job at least 1.5 times faster, so it's tried only after no H200 is free.
  - Benchmarks and REAP scoring need much less: an A40 at about $0.59 an hour for the Bobs, and an A100 80 GB at about $1.79 for GPT-OSS 120B. Each run cost a dollar or two.
- **Record every dollar, failures included**, on [What Bob costs to make](COSTS.md).

## 7. Naming and honesty

- A brain cut from Bob's own family is a Bob, named by its size (28Bob, 20Bob). Anything trimmed from another family is named plainly, for example "GPT-OSS 120B trimmed to 60B".
- Publish each brain's coverage table, heal numbers and benchmarks with it, including what got worse.
- Numbers here are from this project's own tests on one 16 GB card or a rented card. They're for comparing Bobs with each other, not with public leaderboards.

## Credits

Expert pruning follows Cerebras' REAP work; depth-and-width pruning plans follow NVIDIA's Minitron. The Bobs are made from Qwen3.6-35B-A3B by Alibaba Cloud's Qwen team (Apache 2.0).
