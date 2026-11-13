# SCUT against plain TCP: one brain spread over two Bobs on weak Wi-Fi (2026-11-12)

**Borrowing Bob:** replicant matrix (AMD Ryzen 7 9800X3D, NVIDIA RTX 5070 Ti 16 GB, 32 GB DDR5-6000, Windows 11), Bob 1.5.210.
**Lending Bob:** a handheld (AMD Ryzen Z1 Extreme, Radeon 780M, 16 GB shared memory, Windows 11), Bob 1.5.210, graphics card lent.
**Engine:** Brain Engine 5 on both (llama.cpp b12282 with Bob's patches 0001 to 0008). SCUT sealed (signed and scrambled), self-tuning on, 100 Mbit/s cap.
**Brain:** Riker, Q4_K_M (17.5 GB), spread over both graphics cards with `--fit on`, 32K context.
**Link:** home Wi-Fi only, no cable on either machine. The router is two floors away.

| | Band | Channel | Signal | Link rate |
|---|---|---|---|---|
| Borrowing Bob | 2.4 GHz | 6 | -58 dBm | 143 Mbit/s |
| Lending Bob | 6 GHz | 69 | -75 dBm (weak) | not read |

The question: does SCUT, Bob's own way of sending between Bobs, beat the plain TCP that llama.cpp uses, on a real and not very good home Wi-Fi? Every number below comes from the link log both Bobs write when "Watch the link live" is on (Settings, Bob-Net).

## The answer

**On this Wi-Fi, SCUT is 4 to 5 times as fast as TCP.** Same brain, same split, same prompts, minutes apart.

| Run | Link | Load | Reading the prompt | Writing the answer (three answers) |
|---|---|---|---|---|
| A | SCUT | 28.4 s | 2.8 to 3.1 tokens/s | **17.7 / 17.0 / 17.4 tokens/s** |
| B | TCP | 28.4 s | 0.6 to 1.9 tokens/s | **4.8 / 3.6 / 3.5 tokens/s** |
| C | SCUT, more of the brain on the handheld | 70.3 s | 1.1 to 1.9 tokens/s | 9.8 / 11.9 / 11.5 tokens/s |

For scale: the same brain on the replicant matrix alone writes about 125 tokens a second. Sharing a card over Wi-Fi is for a brain that doesn't fit on one machine. When it fits, Bob keeps it on one.

## What went over the air

Counted from the first connection to the last answer, loading included. "Messages" are the engine's requests to the lent card.

| | A (SCUT) | B (TCP) | C (SCUT) |
|---|---|---|---|
| How long the run took | 2 min 52 s | 6 min 20 s | 6 min 10 s |
| Messages to the lent card | 6,979 | 7,629 | 11,854 |
| Data the borrower sent | 161.0 MiB | 178.0 MiB | 352.6 MiB |
| Data the borrower received | 480.3 MiB | 500.5 MiB | 641.2 MiB |
| Wait for each answer, average | 57.6 ms | 106.5 ms | 79.1 ms |
| One small packet there and back, typical | 4.4 ms | 20.7 ms | 5.7 ms |
| The same, best to worst | 2.9 to 8.7 ms | 3.0 to 193.6 ms | 3.1 to 91.1 ms |
| Time the lent card itself was working | 26 s | 30 s | 35 s |
| Dropped connections | 0 | 0 | 0 |

The handheld's card did about the same work in A and B (26 s and 30 s). The whole difference is the air: over TCP a small packet's round trip was typically 21 ms and at worst 194 ms, over SCUT 4 ms and at worst 9 ms. When Wi-Fi loses a packet, TCP holds back everything behind it until the resend arrives. SCUT sends a spare repair packet with the data and resends on its own short timer, so one lost packet costs a few milliseconds.

## Packet loss, as SCUT saw it

SCUT counts every packet. TCP hides its resends inside the operating system, so run B has no such figures.

| | A: borrower to lender | A: lender to borrower | C: borrower to lender | C: lender to borrower |
|---|---|---|---|---|
| Data packets sent | 145,890 | 420,980 | 316,382 | 562,431 |
| Sent again | 3,662 (2.5%) | 91,463 (21.7%) | 21,956 (6.9%) | 207,282 (36.9%) |
| ... of those, after a timeout | 2,456 | 13,821 | 19,254 | 26,848 |
| Repair packets sent | 10,502 | 15,152 | 26,067 | 26,283 |
| On the air, resends and repairs included | 182.3 MiB | 613.4 MiB | 425.4 MiB | 926.4 MiB |
| Packets with a bad seal | 0 | 0 | 0 | 0 |
| Replayed packets refused | 0 | 0 | 0 | 7 |
| Times the sender slowed its pace | 210 | 1,170 | 508 | 1,796 |
| Self-tuning changes during the run | 9 | 11 | 10 | 21 |

The weak side shows. The handheld, on 6 GHz at -75 dBm, had to send more than one packet in five again to get its answers through, and put 613 MiB on the air to deliver 481 MiB. The other direction, from the 2.4 GHz machine, needed 2.5%. "Sent again" counts every resend, early ones included, so it is an upper bound on real loss. Nothing was lost for good, no seal failed, and the link never dropped.

Run C asked the engine for a smaller context, and `--fit` then put more of the brain on the handheld. More data crossed the weak link per token, loss went up, and the speed fell to about 11 tokens a second. On a weak link, the less the lent card holds, the better.

## Same answers?

With the temperature at 0, runs A and C gave the same text as each other, character for character. Both differ from the answer the replicant matrix gives alone from the 160th character on. So the difference follows how the brain is split over two different graphics cards (their arithmetic differs in the last decimal places), not the link. Run B's temperature-0 answer was not captured: the test script stopped waiting while the engine was still writing it.

## What still costs time

With SCUT the link is no longer the slow part: a round trip is about 4 ms. But the engine made three round trips to the lent card for every token (one to run the work, then separate ones to fetch each result), and the borrower spent about 90% of its time waiting on them.

Brain Engine 6 (patch 0011) asks for those results together with the work, so it is one round trip a token. Measured on a test bench only so far (a tiny brain, two processes, a pretend Wi-Fi with delay and loss, three results a token): 17.7 to 30.0 tokens a second over SCUT, with identical answers. The real run on these two machines will be added here when Engine 6 is on both.

## What this does not show

- One home, one router, two machines, one morning. Other Wi-Fi will differ.
- The borrowing Bob could not see the router's 5 GHz band at all, so the two machines were on different bands.
- No cable was tested. A network cable, or a USB4 cable between two Bobs, should beat all of this.
- SCUT is still experimental and off unless you turn it on.
