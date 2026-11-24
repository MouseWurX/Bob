## Part of the Bob project

This model is part of **Bob**, a personal assistant that runs on your own computer: chat, mail, office files, code,
web lookups and apps, with a local model as its brain and nothing sent out unless you switch it on.
Code, releases and the full lab notes: [github.com/MouseWurX/Bob](https://github.com/MouseWurX/Bob). Bob's lessons and earlier
expert scores are on this account too ([bob-lessons](https://huggingface.co/datasets/MouseWurX/bob-lessons)).

Riker is the middle cut of three: Bobert keeps 80%, Riker 70% and Bill 60% of the experts, all chosen by the same scores. The goal of these cuts is the full Flash-Next's skill on a home computer with a 16 GB graphics card and 32 GB of RAM.

**Why the files are bigger than their names suggest.** Two parts of Flash-Next have rows that aren't a multiple of 256 wide: each
expert's down projection (640) and the 51B n-gram embedding (160). llama.cpp's k- and i-quants need 256-wide rows. In the IQ2 files
the down projections use Q2_0 (2.25 bits in groups of 64, which 640 fits); in the others llama-quantize gives them a 32-wide 4- to
5-bit type. The n-gram embedding can only take a 32-wide type (about 4.5 bits, about 29 GB) in every file. It is looked up a few rows
per word, so with memory mapping on it is read from the drive and needs
no RAM or card memory; the rest of the file is what has to fit.

## How the experts were chosen

1. **Real jobs, not general text.** The full Qwen3.8-Flash-Next (Unsloth UD-Q4_K_XL) did Bob's everyday jobs through Bob's own
   tool loop: sorting and answering mail, making and editing office files, and working in code projects. Only the runs the
   graders passed were kept: 153 clean runs.
2. **A REAP-style score per expert.** Replaying those runs with the expert trace on, each expert was scored by how much it
   actually contributes: the router's weight for it times the size of its output, summed over every word of the clean runs
   (REAP, Lasby et al. 2025: router-weighted expert activation pruning). Pick counts alone ignore how much an expert adds when
   picked, which is why we used the weighted score.
3. **The same number kept in every layer.** In each of the 48 layers the 359 highest-scoring of the 512 experts are kept (70%). The 70% list was made after the per-expert scores had been discarded: it is the 65% list plus, in each layer, the 26 experts of the band between the 65% and 75% lists that were picked most often. In the last layer (47) the trace saw only about 30 experts carry real weight, so the rest of that layer's list is filled in by expert number; the mask runs at the tested levels used the same lists.
   A GGUF holds one expert count, so every layer keeps the same number. The MTP (draft) layer keeps the experts kept most often
   across the other layers. The shared expert and everything outside the experts are untouched.
4. **Judged on jobs it never saw.** Every score below is on Bob's HELD-OUT job sets, which were never used to score experts,
   write lessons or tune anything.

## What the keep levels scored (expert mask, no cut file, no heal)

Before cutting, the same model was run with experts switched off at serve time (a live expert mask in Bob's engine), at each
keep level, on the held-out jobs. Flash-Next UD-Q4_K_XL, 22 Nov 2026, one run per level.

| Experts kept | Office (of 14) | Code repo (of 12) | Web (of 11) | Inbox (finding the right mails) | Harmful actions |
|---|---|---|---|---|---|
| 100% | 13 | 12 | 8 | 85.0% | 0 |
| 90% | 13 | 12 | 9 | 92.7% | 0 |
| 80% | 12 | 12 | 9 | 92.2% | 0 |
| 75% | 13 | 10 | 8 | 90.8% | 1 (trashed a mail that needed a reply) |
| 65% | 13 | 12 | 9 | 79.0% | 0 |
| 60% | 13 | 12 | 8 | 79.6% | 0 |
| 50% | 9 | 11 | 9 | 85.7% | 0 |

**Why 70%:** it sits between the 75% and 65% levels, which scored the same on office, code and web (13, 12 and 9 at 65%). The inbox drops between them (90.8% to 79.0%), and 75% made the one harmful move. 70% itself was not run as a mask, so its scores are unproven in our lab, as we have yet to test; the held-out scores of this file go in Results.

Follow-ups at 80% (the Bobert cut), same held-out jobs, which decided how all three cuts were made:
- Office's own 80% list scored 13 of 14 against 12 for the all-jobs list. A list merged from both fixed one file lookup but
  ran out of time on 3 jobs, so it isn't the one used here.
- Redirecting each switched-off expert's share to its most alike kept expert lost clearly on the inbox (64 of 117 found,
  against 85 for the plain 80% mask and 90 for all experts), so this cut drops experts outright.
- The one office job every level missed (a file lookup) also fails with all experts: the question never says the answer is in
  the person's files, so the model searches the web. That is a prompt gap, not something the cut caused.

## The tools it was tested with

The jobs ran through Bob's real tool loop with Bob's own tools, about 55 in all, offered to the model as function calls:
- **Inbox:** reading, searching, sorting, archiving, trashing and replying to mail, on a made-up mailbox with planted danger mails
  (phishing, unsubscribe traps). Graded on finding the right mails and on harm: any move or delete the person didn't ask for.
- **Office:** making and changing documents, spreadsheets and slides, checked by opening the saved files in LibreOffice.
- **Code repo:** reading files, editing, and running checks in small projects with planted bugs and hidden tests.
- **Web:** searching and reading pages for questions with checkable answers.

**Tool shape.** A "tool shape" is the tool set itself: which tools exist, how they split the work, what inputs they take and
how the call is written. Bob locks one working shape per model family. Qwen models get **shape 4**; every family gets the same
tool names and inputs, so a call runs the same way whichever brain wrote it, and a family's set differs only by leaving out the
tools that pulled it off course and by one-line notes on a pair it confuses. Our study found that rewording tools and turning
thinking on or off moved nothing beyond noise, while the shape of the tool set mattered.

## Where the testing is written up

From the Bob dissertation (in the Bob repo, app/docs/dissertation):
- [REAP levels 100 to 50%, office protect, redirect and this cut](https://github.com/MouseWurX/Bob/blob/main/app/docs/dissertation/ch11-making-clean-lessons.md#reap-levels)
- [How the experts were chosen](https://github.com/MouseWurX/Bob/blob/main/app/docs/dissertation/ch11-making-clean-lessons.md#expert-selection)
- [Flash-Next in Bob, against stock Qwen and at other quants](https://github.com/MouseWurX/Bob/blob/main/app/docs/dissertation/ch11-making-clean-lessons.md#flash-next-in-bob)
- [The tools and the shape it was tested with](https://github.com/MouseWurX/Bob/blob/main/app/docs/dissertation/ch08-study4-tool-shape.md#tool-shapes-tested), [what a tool shape is](https://github.com/MouseWurX/Bob/blob/main/app/docs/dissertation/ch08-study4-tool-shape.md#tool-shapes) and [the tool-shape findings](https://github.com/MouseWurX/Bob/blob/main/app/docs/dissertation/ch08-study4-tool-shape.md#tool-shape-findings)
- [Speed: how it is measured](https://github.com/MouseWurX/Bob/blob/main/app/docs/dissertation/ch04-method-and-rules.md#speed-method) and [the speed table](https://github.com/MouseWurX/Bob/blob/main/app/docs/dissertation/ch04-method-and-rules.md#speed-table)
- [Where the Bob project is going](https://github.com/MouseWurX/Bob/blob/main/app/docs/dissertation/ch13-conclusion.md#direction)

## Test systems

- **Making the cut and the held-out scores:** one rented NVIDIA data-centre card (94 to 96 GB), llama.cpp b12359 with Bob's engine patches.
- **Home tests (speed and jobs, to come):**
  - Desktop: AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB RAM.
  - Laptop: NVIDIA RTX 3060 Laptop 6 GB, 32 GB RAM.
  - Handheld: 16 GB of memory shared by the processor and graphics.
