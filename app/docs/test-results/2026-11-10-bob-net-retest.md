# Bob-Net retest: two replicant matrices, both directions (2026-11-10)

**Desktop Bob:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5-6000, Windows 11), Bob 1.5.193.
**Handheld Bob:** AMD Ryzen Z1 Extreme, Radeon 780M, 16 GB shared memory, Windows 11, Bob 1.5.193, quick brain Qwen3 4B Instruct on the processor, 32K context.
**Link:** Tailscale. Third device (a phone) not tested: it hadn't been updated yet.

A follow-up to [the first live run](2026-11-04-bob-net-first-live-run.md), whose three lending bugs were fixed in 1.5.97.

## Desktop asks the handheld

| Test | Result | First word | Total |
|---|---|---|---|
| Low reply: "what's 12 times 12? One line." | Borrowed from the handheld, correct | 1.0 s | 2.1 s |
| Low reply: "name three colours. One line." | Borrowed from the handheld, correct | 1.1 s | 1.6 s |
| Handheld free afterwards | Yes, within about 5 s of each reply (was stuck "busy" on 1.5.91) | | |
| Medium whole job: a three-line poem | Sent to the handheld, done there, reply came back to the desktop | 10.0 s | 13.4 s |

## Handheld asks the desktop

| Test | Result | Total |
|---|---|---|
| Low reply, "Borrow a brain" found switched off on the handheld | Not borrowed; the handheld answered itself | about 30 s |
| Low reply, "Borrow a brain" switched on | Borrowed; the desktop thought it in 2.8 s, correct | 9.2 s |

Borrowing cut the handheld's quick reply from about 30 s to about 9 s.

## Found

1. **"Borrow a brain" had switched itself off on the handheld** (other Bob-Net settings intact). Under investigation.
2. **A short lend is expensive for a desktop lender.** It loaded a small brain for the 2.8 s lend, let it go, then reloaded its own big quick brain (78 s). The reload should wait until the owner needs it.
3. **A successful borrow writes no logbook line**, only failures do, so the asking Bob's log can't show who answered.
4. **Tasks doesn't record which Bob did a sent job** (the logbook does).

## Still to test

The phone, as both asker and lender, once it's updated.
