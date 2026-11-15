# One brain over two Bobs on a cable: first try (2026-11-12)

**Borrowing Bob:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5-6000, Windows 11), Bob 1.5.213, on a gigabit network port.
**Lending Bob:** a handheld (AMD Ryzen Z1 Extreme, Radeon 780M, 16 GB shared memory, Windows 11), Bob 1.5.213, graphics card lent, on a USB gigabit network adapter (link up at 1 Gbit/s).
**Link:** both on one gigabit switch with no router on it, so each machine gave itself a 169.254 address. Bob-Net found the cable path by itself. SCUT on, with the handheld's speed cap at 100 Mbit/s (the default then).
**Brain:** Riker, Q4_K_M (17.5 GB), 32K context, `-ub 2048`.

The question: with a cable in place of Wi-Fi, how fast is a brain spread over both machines?

## The answer

**Not measured yet. This run didn't finish.** The cable worked, but the lending Bob dropped out while the brain was still being copied to it, and the borrowing Bob carried on alone, as it should.

| Run | Setup | Load | Writing the answer (three answers) |
|---|---|---|---|
| A | Replicant matrix alone | 12.7 s | 84 / 107 / 89 tokens/s |
| B | Spread over both, by cable | did not finish (see below) | no spread answer |
| B, after the fallback | Replicant matrix alone again | | 74 / 97 / 82 tokens/s |

What happened in B:
- The brain's first copy to the handheld ran at about 13 MB/s, which is about 100 Mbit/s. That was the handheld's SCUT speed cap, not the cable: both ends were up at 1 Gbit/s.
- About 3.5 minutes in, the handheld's part of the engine stopped ("Remote RPC server crashed or returned malformed response"). The handheld's logbook had said "only about 0 GB could be spared" just before. Its shared memory was squeezed, with a video playing on it at the time.
- The replicant matrix noticed, let the handheld go and answered alone (run B, after the fallback). Nothing was lost, and no restart was needed.

## What ran and what didn't

| | Ran? |
|---|---|
| Pairing and finding the cable path (169.254, no router) | Yes |
| Copying the brain over the cable | Yes, part of it, at the 100 Mbit/s cap |
| Falling back to one machine when the lender drops out | Yes |
| A whole answer from a brain spread over the cable | **No**: the lender dropped out first |
| SCUT on the cable at 1000 Mbit/s | **No**: the cap was 100 then |
| SCUT against plain TCP on the cable | **No** |
| A third Bob (a laptop) | **No**: left out because a game started on it |

## Fixed since
- 1.5.214: SCUT's **Auto** speed cap allows 1000 Mbit/s when both ends of the road are a cable, and stays at 100 on Wi-Fi.
- 1.5.214: a lending handheld waits up to 3 seconds for memory before it says how much it can spare. Its card watch gives the card back only when the handheld itself is under 1 GB free.

## Still to do
Run it again with the lender idle (no video) and the Auto cap, then add SCUT against TCP on the cable. For comparison, the same brain spread over Wi-Fi writes about 17.5 tokens a second with SCUT ([the Wi-Fi test](2026-11-12-scut-vs-tcp-over-wifi.md)). A brain that fits on one machine still belongs on one machine.
