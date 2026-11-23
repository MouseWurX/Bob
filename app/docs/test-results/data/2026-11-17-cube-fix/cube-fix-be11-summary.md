# cube-fix-be11 summary (scrubbed copy, relayed from the test PC Nov 23 2026)
Note: title in the original says Brain Engine 10 because the plan name carried over; the engine folder was be11. 5 rounds.
Full raw files (runs.jsonl etc.) are in cube-fix-public.tgz on the test PC (207,627 bytes, sha256 b25d01625d1c8655aeee16001ed51ff20fcfccc7df9fc0e122e4fcb36707d8ae).

Rows (median, min-max):
| Row | Prompt | Runs | First word ms | Read t/s | Write t/s | Gap p50/p99/max ms | Peak card MB | Throttled |
|---|---|---|---|---|---|---|---|---|
| Y0 | start | 5 | 3365.1 (3226.6-3723.4) | 1156.5 (1045.4-1206.5) | 91.6 (89.2-92.2) | 10.8/19.4/34.8 | 14865 | 0 |
| Y0 | k32 | 5 | 26382.8 (26139.7-27326.2) | 1244.6 (1201.6-1256) | 81.1 (77.8-81.8) | 12.2/14.6/36.6 | 14865 | 0 |
| U0 | start | 5 | 3349.4 (3223.7-3510.3) | 1162 (1108.9-1207.4) | 82.9 (82.6-83) | 11.9/24.3/37.7 | 14867 | 0 |
| U0 | k32 | 5 | 26668.3 (26469.4-27157.7) | 1231.2 (1209-1240.6) | 74.1 (73.2-74.5) | 13.3/15.8/29 | 14867 | 0 |
| T1 | start | 5 | 3309.8 (3217.1-3703.5) | 1178.1 (1052.4-1214.9) | 87.9 (87.6-88.6) | 11.2/18.8/37.8 | 14869 | 0 |
| T1 | k32 | 5 | 26174.6 (25981.6-26448.8) | 1254.7 (1241.5-1263.9) | 77.9 (76.3-78.3) | 12.6/16/31.5 | 14869 | 0 |
| F4c | start | 5 | 2074.6 (1755.7-2542.9) | 1878 (1531.3-2220.9) | 110.1 (109.8-111.2) | 8.8/29.9/42.4 | 14887 | 0 |
| F4c | k32 | 5 | 14114.3 (13956.8-14181.9) | 2330.2 (2319.3-2355.8) | 96.7 (95.5-97.4) | 9.8/18.4/23.9 | 14887 | 0 |
| FT | start | 5 | 2053.2 (1712-2233.8) | 1898.2 (1744.3-2278.1) | 108.1 (105.6-109) | 8.8/31.9/48.8 | 14897 | 0 |
| FT | k32 | 5 | 14214.9 (14094.9-14366.1) | 2313 (2288.8-2333.8) | 95.7 (95.2-96.6) | 9.8/18.5/23.9 | 14899 | 0 |

Conditions: card max 46.8-58.1 °C, lowest core MHz 2865-2887 (T1 k32 dips to 345-397), processor busy 16-44%, CPU max 55-69 °C (HWiNFO; one U0 sample reads 7403, a logging glitch), free RAM 2.8-4.6 GB.
F4c/FT small batches: hits/misses 119854/8952 (0 on the CPU), share 0%, 16392.31 MB copied, every round.

Same answer, the fair writing comparison: start 892c17a2: Y0 91.6, T1 87.9 · k32 7ffd9ac2: Y0 81.1, T1 77.9 · start fc0f0b6e: F4c 110.1, FT 108.1 · k32 c1273808: F4c 96.7, FT 95.7. U0 (fusion off) wrote different answers: start 6c4b812a, k32 c63a8ae7.
