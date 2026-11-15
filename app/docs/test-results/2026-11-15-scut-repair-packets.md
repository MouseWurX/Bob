# Do SCUT's repair packets help or hurt? (2026-11-15)

SCUT, Bob's own link between Bobs sharing a brain, sends a spare "repair" packet with each small message: the XOR of a group of up to 8 packets, so any one lost packet of the group is rebuilt at once instead of waiting for a resend. The self-tuning could step that up to one repair for every packet. The question was whether they are worth their cost.

**What ran:** SCUT's own code (`scut.cpp`, built alone), two ends on one cloud machine, with a pretend Wi-Fi between them that delays, loses or holds up packets to order (`app/engine/tests/scut-pretend-wifi.py`, 3 ms each way plus jitter). Each run is 1,200 or 1,500 request-and-answer round trips, twice with different random seeds. 108 runs before the change, 36 after. No real radio and no brain: this measures the link alone.

## Before the change

Round trips a second, messages of about 8 KiB each way (7 packets, the size a spread brain sends per token):

| Link | Repair on (self-tuned) | Repair off | Extra on the air, on / off |
|---|---|---|---|
| No loss | 82.4 | 82.7 | 20% / 3% |
| 0.5% random loss | 82.2 | 77.0 | 18% / 4% |
| 1% random loss | 82.0 | 71.4 | 18% / 4% |
| 2% random loss | 80.7 | 64.0 | 20% / 6% |
| 5% random loss | 76.1 | 46.9 | 63% / 13% |
| 10% random loss | 67.8 | 34.0 | 97% / 25% |
| Loss in bursts of 3 to 8 packets | 42.8 | 42.8 | 100% / 11% |
| Weak 6 GHz (loss, jitter, late packets) | 13.3 | 11.3 | 73% / 8% |
| Packets late, none lost | 25.8 | 27.8 | 42% / 7% |

"Extra on the air" is everything sent beyond the messages themselves: headers, acks, resends and repairs.

With one-packet messages the pattern is the same, and since the repair for one packet is a second copy of it, repair on puts about twice the data on the air at every loss rate (122% extra against 15%). Late packets cost more there: 56.6 round trips a second with repair on against 64.0 off.

- **No loss:** the same speed. The repairs are pure extra data.
- **Random loss:** a clear win, up to twice the speed at 10%, and the slowest 1% of round trips take half as long.
- **Bursts:** no gain. The repair packet is lost with the packets it covers.
- **Late packets:** 7 to 12% slower. More packets means more chances for one to be held up.
- **The self-tuning** stepped up to one repair per packet whenever packets had to be sent again, bursts and late packets included, doubling the data for nothing.

The real run of Nov 12 ([SCUT against plain TCP](2026-11-12-scut-vs-tcp-over-wifi.md)) fits the last two rows: the two Bobs sent 25,654 repair packets and not one rebuilt anything.

## The change (engine patch 0015)

The self-tuning now goes by what the other side reports as rebuilt. More repairs only while they rebuild a fair share of what is lost. When they don't, back to one per 8 within seconds. After 400 in a row that rebuilt nothing, none at all for a while, until packets are being lost again.

| Link | Round trips a second: before / after / repair off | Extra on the air: before / after |
|---|---|---|
| No loss | 82.4 / 82.4 / 82.7 | 20% / 9% |
| 1% random loss | 82.0 / 82.0 / 71.4 | 18% / 21% |
| 5% random loss | 76.1 / 77.2 / 46.9 | 63% / 61% |
| 10% random loss | 67.8 / 68.3 / 34.0 | 97% / 95% |
| Loss in bursts | 42.8 / 42.7 / 42.8 | 100% / 28% |
| Weak 6 GHz | 13.3 / 13.8 / 11.3 | 73% / 21% |
| Packets late, none lost | 25.8 / 27.3 / 27.8 | 42% / 13% |
| One-packet messages, late packets | 56.6 / 62.2 / 64.0 | 130% / 55% |
| One-packet messages, no loss | 104.4 / 103.8 / 104.1 | 122% / 48% |

The win with random loss is kept, and the waste in the other cases is mostly gone. In these short runs (15 to 60 seconds) the first 400 repairs are still sent before they stop, so over a long session the "after" figures for no loss and late packets move closer to "repair off".

## What this does not show

- A test bench, not two real machines on a real radio. The real run is to come.
- Real Wi-Fi mixes these cases from minute to minute. The bench holds one at a time.
- Messages longer than 64 packets never get repair packets, before or after.
