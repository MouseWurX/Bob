# Bob-Net: first live run between two replicant matrices (2026-11-04)

**Asking Bob:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5-6000, Windows 11), Bob 1.5.91.
**Lending Bob:** a handheld (AMD Ryzen Z1 Extreme, Radeon 780M, 16 GB shared memory, Windows 11), Bob 1.5.91, quick brain Gemma 4 E2B on the processor, 32K context.
**Link:** Tailscale, direct (not relayed); `tailscale ping` 75 ms, Bob's hello 0.15 to 0.27 s.

This was the first time two real Bobs talked to each other. The point was to find out what breaks, and it did its job: one setup snag per machine, and three bugs in the lending code, all fixed in Bob 1.5.94 and 1.5.97.

## Setup (before any Bob spoke to another)

| Step | What happened | Fixed in |
|---|---|---|
| Door address list | The desktop's "Let my other replicant matrices in" list still held a hand-typed machine name from an early version, so a Bob dialling its 100.x address would have been turned away. Added the Tailscale addresses; needed a restart to take effect. | 1.5.94 listens on Tailscale addresses live, no restart |
| Windows Firewall | No inbound rule for Bob's port, so the handheld's connections timed out while the desktop's own worked. A rule for TCP 7777 from 100.64.0.0/10 only fixed it. | 1.5.94 adds a "Let Tailscale through the firewall" button |
| Reachability | After both fixes, each Bob answered the other's hello with "needs the passcode" (401) in under 0.3 s, both directions. | |

## Borrowed replies (desktop asks the handheld, Low effort, "Borrow when: always")

| Run | What happened | First word | Total |
|---|---|---|---|
| 1 | Borrowed. The handheld loaded Gemma 4 E2B cold and answered "what's 12 times 12? One line." correctly. | 18.9 s | 19.4 s |
| 2 | The desktop gave up at its 12 s first-word limit ("too slow") and answered itself, which meant waking its own 35B brain (27 s). Correct answer. | 25.5 s | 25.6 s |

Run 2 is where the bugs showed:

1. **The handheld kept thinking after the desktop gave up**, and reported "busy" to every Bob for the rest of the test. The lending code waited for the request to close, but in Node 22 that signal never comes once the request body has been read. Fixed in 1.5.97 (it now watches the response).
2. **The handheld never gave its graphics card back after lending.** Its own next job, and a guest job from the desktop, sat on "Waiting for the Brain to finish with the graphics card" for ten minutes while its engine was idle. Fixed in 1.5.97 (the lease is released when the lent reply ends); the waiting line now also names who holds the card.
3. **A desktop-style lender said nothing while loading its brain**, so a cold start always looked "too slow". The phone lender already sent "still loading" signals; from 1.5.97 the desktop app does too, and the asker waits up to 45 s for a first word while those keep coming.

## Whole job (desktop sends a Medium "think" job to the handheld)

The job left the desktop at 0.1 s ("📡 Sent to <handheld>", reason: always) and the handheld took it ("took a think job"). It then queued behind bug 2 and never ran; the desktop showed it as delegated until it was cancelled. Not a verdict on job sending itself, which did its part: pick, send, accept.

## Still to test

Retest of all three paths on 1.5.97 or later, the handheld asking the desktop, and the phone as a lender. Those results go in a later file.
