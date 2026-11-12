# What the cube's Real experts costs (Brain Engine 5)

12 November 2026, on the replicant matrix (see the [index](README.md)). The fNRI cube's **Real experts** switch lights the cube with the experts the brain really picks. To do that, Bob asks Brain Engine for an expert trace. This test measures what the trace costs in word speed.

## How it was run

- **Engine:** Brain Engine 5 (llama.cpp b12282 with Bob's patches 0001-0008), with Bob's usual flags: `--jinja -fa on -ctk q8_0 -ctv q8_0 --fit on -np 1 --cache-reuse 256`.
- **Brains:**
  - Riker (28Bob): a mixture-of-experts brain with 208 experts, 40 layers and 8 experts per word, at `-c 49152`.
  - Qwen3 4B Instruct Q4: no experts, so the cube shows groups of neurons. Run at `-c 32768`.
- **Each run:** 300 words written, `ignore_eos`, temperature 0, no prompt cache. One warm-up first, then 3 runs per mode, taken in turn.
- **Modes:**
  - **Off:** no trace.
  - **After:** `expert_trace`, the picks shown once the answer is done (how Brain Engine 4 works).
  - **Live:** `expert_trace` + `expert_trace_stream`, the picks sent with every word.

## Riker, short prompt

| Mode | Runs (words a second) | Average | Change |
|---|---|---|---|
| Off | 124.0 / 122.3 / 121.7 | 122.7 | none |
| After | 97.8 / 98.8 / 100.9 | 99.2 | -19.2% |
| Live | 100.4 / 101.1 / 100.6 | 100.7 | -17.9% |

The first word came after 92 to 99 ms in every mode.

## Other cases

| Case | Off | Live | Change |
|---|---|---|---|
| Riker, 39,675-word prompt, writing | 99.2 | 82.9 | -16.4% |
| Riker, 39,675-word prompt, reading the prompt (words a second) | 3,052 | 2,990 | -2% |
| Riker, 39,675-word prompt, first word | 13.04 s | 13.31 s | +0.27 s |
| Qwen3 4B, short prompt | 204.5 | 154.0 | -24.7% |
| Right after closing the cube (Riker short, Riker long, Qwen3 4B) | 121.9 / 98.3 / 209.1 | | back to off |

## What it shows

- **The cost is in collecting the picks, not in sending them live.** Live and after cost the same. Brain Engine 5 stops the graphics card after every layer to copy that layer's picks out, which is 40 stops per word on Riker.
- **The live picks really are live.** On a Real experts page, the first piece came with the first word, and there was one piece per word (223 of 223). Each piece held 208 experts, 40 layers, 8 picks per layer.
- **Brain Engine 4 falls back.** It sends no pieces. One full trace arrives just after the last word, and the cube replays it.
- **Long chats don't cost more.** The first live version sent a long prompt's whole trace in one piece (5 MB at 128,000 words). Each piece now carries at most the last 64 words, which is all the cube shows. That was checked on a small test build on a processor: at 32,000 and 128,000 words the live picks were no slower than the trace alone.
- **Our first guess was wrong.** From the processor test build we predicted under 1%. There was no graphics card to wait on there, so it couldn't show the real cost.

## Next

Brain Engine 6 (patch 0010) keeps every layer's picks on the graphics card until the word is done, then copies them all at once, so the card stops once per word instead of 40 times. On a test build the picks were identical, row for row, to Brain Engine 5's. Its speed will be added here once it's been measured on the replicant matrix. Brains without experts still stop at every layer.

Not measured: the laptop (RTX 3060 6 GB), the Legion Go and the Raspberry Pi.
