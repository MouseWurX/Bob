# cube-fix (round-1 stopped Brain Engine 10 run) summary-so-far (scrubbed, relayed Nov 23 2026)
"4 of 25 loads done", 1 run each.
| Row | Prompt | First word ms | Read t/s | Write t/s | Gap p50/p99/max ms | Peak card MB | Throttled |
|---|---|---|---|---|---|---|---|
| Y0 | start | 3483.1 | 1117.9 | 86 | 11.4/20.4/34.8 | 15143 | 0 |
| Y0 | k32 | 28836.7 | 1138.8 | 76.1 | 12.9/15.3/22.7 | 15155 | 1 |
| U0 | start | 3518.9 | 1106.1 | 78.5 | 12.5/25.3/39.6 | 15138 | 0 |
| U0 | k32 | 27268.4 | 1204.1 | 71 | 13.9/16.6/32 | 15138 | 1 |
| T1 | start | 3406.6 | 1145.4 | 84 | 11.7/19.1/37.2 | 15128 | 0 |
| T1 | k32 | 27080.4 | 1213.1 | 74.5 | 13.1/16.7/29 | 15128 | 1 |
| F4c | start | 1741.5 | 2238.4 | 110.7 | 8.6/29.4/39.5 | 15168 | 0 |
| F4c | k32 | 14809.4 | 2222 | 89.4 | 9.9/25.2/32.7 | 15168 | 1 |

Conditions: card max 48.7-57.8 °C, CPU busy 22-42%, CPU max 64-72.8 °C, free RAM 0.76-1.2 GB (mmap era). k32 runs throttled 1.7-5.7% of samples. F4c: hits/misses 119854/8952, share 0%, 16392.31 MB copied.

## Environment (all folders, scrubbed)
RTX 5070 Ti 16 GB (driver 621.01, 300 W), Windows 11 Home 10.0.26200, Ryzen 7 9800X3D 16 threads, 31,862 MB RAM, Node v24.22.1, brain Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf (22,360,456,160 bytes). Engine sha256: BE10 5cceeb9c…01f3 (be11/be12 folders list their own).
