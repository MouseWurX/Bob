# Bill GSQ rerun, 27 Nov 2026 (one RTX PRO 6000, $16.14, ended at the 6 h cap)

Plan: `forge/plans/gsq-bill.json`, run from commit c20f3845 (before the CUDA-overwrite fix in 957e70ca).
All three files are 51.93 GB, scored against Bill's own Q8_0 cut on wikitext-2 test.

| file | down experts rounded by | mean KLD | same top | gate |
|---|---|---|---|---|
| MX2_S | stock llama-quantize | 1.00 | 63.7% | (base) |
| MG2_S | GPTQ, searched scales | 0.590 | 72.5% | passed |
| MQ2_S | GSQ on 33 of 48 tensors, GPTQ on the other 15 (GSQ ran out of its 150 min) | 0.595 | 72.7% | passed |

What this shows:
- Rounding only the q2_0 down experts better, at the same size to the byte, cuts Bill's KLD by 41% and lifts same-top by
  about 9 points. This is the first measured win on Bill from the GSQ work.
- GSQ gave nothing over GPTQ here (0.595 vs 0.590, a tie within noise), unlike the 1.7B pilot (16% better). Two reasons it
  may have been held back: only 33 of 48 tensors got it, and x_dump ran on the processor (the bug fixed in 957e70ca) so it
  recorded 53 of 128 chunks, about 700 input rows per expert instead of 2048. Unproven in our lab which one matters.

Measured times (from the coordinator's console notes): GPTQ about 24 min for all 48 down tensors; GSQ 150 min for 33 tensors
(about 4.5 min each, so all 48 would need about 3.6 h on this card). x_dump stopped at its 30 min soft limit.

Lost: the pod deleted itself 8 min before the time cap (run.sh's watchdog), so the PC's log salvage at the cap found no pod.
gsq-MG2_S.log, x_dump.log and the files were lost; nothing was uploaded. Fixed after this run: the PC now keeps the pod's
logs every 30 min and once more 15 min before either cap.

Fix plan:
- Use GPTQ (MG2_S) as the way to make Bill's 2-bit files: same size, 41% less KLD, 24 min.
- GSQ on Bill only if a short canary rental with the CUDA fix and full 128 chunks shows it beating GPTQ; otherwise drop it
  for Bill (3.6 h of card time for no gain).
