# Speed test results: Cube check: does the trace change the words without ggml_set_output? Y0, G4 (trace, keep_expert_ids on), G2 (trace + mass, keep_expert_ids off) (stock Qwen3.6 35B A3B, 16 GB card)

Median, with min and max in brackets, over the timed runs. Throttled runs are kept and counted. Raw numbers: runs.jsonl.

Prompts: start sha256 9f5e47b673e74641; k32 sha256 f943a92d0eb192b3.

| Row | Prompt | Runs | First word (ms) | Reading (t/s) | Writing (t/s) | Gap p50 / p99 / max (ms) | Kept guesses | Peak card MB | Throttled |
|---|---|---|---|---|---|---|---|---|---|
| Y0 | start | 5 | 3487.6 (3436.2 to 3613) | 1115.9 (1077.4 to 1132.9) | 85.3 (83.4 to 86.4) | 11.5 / 21.6 / 38.6 | - | 15005 (15005 to 15132) | 1 |
| Y0 | k32 | 5 | 27365.8 (26854.2 to 29071.6) | 1199.9 (1129.4 to 1222.8) | 77.1 (75 to 77.8) | 12.8 / 14.9 / 31.2 | - | 15009 (15005 to 15132) | 5 |
| G4 | start | 5 | 3461.4 (3420.1 to 3664.5) | 1125.6 (1063.2 to 1139.3) | 78.8 (75 to 79.4) | 12.5 / 37.6 / 41.9 | - | 15035 (15035 to 15162) | 0 |
| G4 | k32 | 5 | 27270 (27093.9 to 27888.8) | 1204.6 (1177.4 to 1211.9) | 70.2 (68.6 to 71.2) | 14 / 17.2 / 23.4 | - | 15035 (15035 to 15162) | 5 |
| G2 | start | 5 | 5078.3 (5066.9 to 5540.5) | 766.8 (702.8 to 768.6) | 62.6 (61 to 64.3) | 15.6 / 30.7 / 48.9 | - | 15013 (15013 to 15140) | 0 |
| G2 | k32 | 5 | 41202.8 (40857.3 to 44268.5) | 796.5 (741.3 to 803.2) | 58.8 (56.4 to 59.6) | 16.7 / 22 / 28.8 | - | 15013 (15013 to 15140) | 0 |

Conditions during the timed runs (median, with min and max):

| Row | Prompt | Card max °C | Card memory max °C | Card busy max % | Fan max % | Lowest core MHz | Processor busy % | Processor max °C (HWiNFO) | Free RAM MB |
|---|---|---|---|---|---|---|---|---|---|
| Y0 | start | 47.5 (45.1 to 50.5) | - | 79 (76 to 79) | 30 (0 to 30) | 2895 (2887 to 2895) | 39.8 (38.2 to 43.7) | 67.6 (63.9 to 73.4) | 3166 (3138 to 3575) |
| Y0 | k32 | 51.7 (51.1 to 58.5) | - | 83 (82 to 84) | 30 (30 to 100) | 2880 (2872 to 2880) | 23.8 (21.4 to 28) | 71.6 (66.8 to 75.9) | 2841 (2696 to 3590) |
| G4 | start | 48.4 (45 to 52.8) | - | 77 (75 to 80) | 30 (30 to 30) | 2887 (2887 to 2887) | 38.5 (36.5 to 41.4) | 71 (67.5 to 71.6) | 3068 (2842 to 3683) |
| G4 | k32 | 53 (51.5 to 56.9) | - | 83 (82 to 83) | 30 (30 to 30) | 487 (315 to 600) | 22.4 (21.7 to 24.3) | 73.5 (72.5 to 77.4) | 2704 (2111 to 3369) |
| G2 | start | 44.3 (43.8 to 46.3) | - | 63 (61 to 63) | 30 (30 to 30) | 2887 (2842 to 2895) | 37.6 (36.3 to 42.2) | 71.6 (70.9 to 76.1) | 3226 (2915 to 3564) |
| G2 | k32 | 46.5 (46 to 48.9) | - | 62 (61 to 64) | 30 (30 to 30) | 397 (285 to 562) | 21.4 (20.7 to 23.4) | 76.4 (73.1 to 76.5) | 2677 (2362 to 3048) |

Before each load, Windows itself reports no processor temperature here; the per-run figures above come from HWiNFO.

Time the card spent throttled (share of samples, median with min and max; then the writing speed of the least and most throttled run):

| Row | Prompt | Throttled % | Writing t/s, least throttled | Writing t/s, most throttled |
|---|---|---|---|---|
| Y0 | start | 0 (0 to 3.7) | 85.3 | 86.4 |
| Y0 | k32 | 4.8 (3.9 to 7.6) | 76.3 | 77.1 |
| G4 | k32 | 5.1 (4.3 to 6.3) | 69 | 68.6 |

More than one throttled run (to be run again, both sets published, per the method): Y0/k32, G4/k32.
