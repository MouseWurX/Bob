# Mail bench: cloud-container

Intel(R) Xeon(R) Processor @ 2.10GHz, 4 threads, 17 GB, linux x64, Node v22.23.4. Flavour gmail. Bob's own email tools; the mail server is a separate local process.

| messages | step | ms | Bob memory (MB, peak) | up (MB) | KB from server | headers | bodies | matched | shown to brain | brain tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| 1000 | newest today | 40 | 86 | 0 | 2 | 8 | 0 | 8 | 8 | 398 |
| 1000 | newest 30 days | 17 | 88 | 0 | 4 | 15 | 0 | 68 | 15 | 639 |
| 1000 | unread 7 days | 11 | 89 | 0 | 4 | 15 | 0 | 15 | 15 | 635 |
| 1000 | search words, 1 year | 6 | 91 | 0 | 0 | 1 | 0 | 1 | 1 | 101 |
| 1000 | search sender, 1 year | 11 | 91 | 0 | 4 | 15 | 0 | 56 | 15 | 553 |
| 1000 | read one | 14 | 91 | 0 | 5 | 15 | 1 | 68 | 0 | 196 |
| 1000 | sort plan scan | 41 | 93 | 0 | 26 | 68 | 0 | 68 | 0 | 15 |
| 1000 | archive 50 | 26 | 99 | 0 | 8 | 30 | 0 | 56 | 0 | 122 |
| 10000 | newest today | 27 | 99 | 0 | 4 | 15 | 0 | 45 | 15 | 652 |
| 10000 | newest 30 days | 15 | 101 | 0 | 7 | 15 | 0 | 632 | 15 | 652 |
| 10000 | unread 7 days | 15 | 101 | 0 | 5 | 15 | 0 | 130 | 15 | 655 |
| 10000 | search words, 1 year | 16 | 101 | 0 | 0 | 1 | 0 | 1 | 1 | 101 |
| 10000 | search sender, 1 year | 25 | 101 | 0 | 7 | 15 | 0 | 520 | 15 | 558 |
| 10000 | read one | 23 | 101 | 0 | 8 | 15 | 1 | 632 | 0 | 154 |
| 10000 | sort plan scan | 46 | 101 | 0 | 41 | 100 | 0 | 632 | 0 | 15 |
| 10000 | archive 50 | 39 | 101 | 0 | 10 | 30 | 0 | 520 | 0 | 123 |
| 30000 | newest today | 49 | 101 | 0 | 5 | 15 | 0 | 116 | 15 | 605 |
| 30000 | newest 30 days | 30 | 101 | 0 | 15 | 15 | 0 | 1845 | 15 | 605 |
| 30000 | unread 7 days | 29 | 101 | 0 | 6 | 15 | 0 | 352 | 15 | 596 |
| 30000 | search words, 1 year | 36 | 101 | 0 | 0 | 1 | 0 | 1 | 1 | 102 |
| 30000 | search sender, 1 year | 44 | 101 | 0 | 13 | 15 | 0 | 1545 | 15 | 563 |
| 30000 | read one | 27 | 101 | 0 | 16 | 15 | 1 | 1845 | 0 | 154 |
| 30000 | sort plan scan | 53 | 101 | 0 | 49 | 100 | 0 | 1845 | 0 | 15 |
| 30000 | archive 50 | 54 | 101 | 0 | 17 | 30 | 0 | 1545 | 0 | 125 |
| 50000 | newest today | 38 | 101 | 0 | 5 | 15 | 0 | 178 | 15 | 596 |
| 50000 | newest 30 days | 32 | 101 | 0 | 22 | 15 | 0 | 3061 | 15 | 597 |
| 50000 | unread 7 days | 26 | 101 | 0 | 8 | 15 | 0 | 610 | 15 | 604 |
| 50000 | search words, 1 year | 59 | 101 | 0 | 0 | 1 | 0 | 1 | 1 | 102 |
| 50000 | search sender, 1 year | 72 | 101 | 0 | 19 | 15 | 0 | 2558 | 15 | 561 |
| 50000 | read one | 55 | 101 | 0 | 23 | 15 | 1 | 3061 | 0 | 154 |
| 50000 | sort plan scan | 79 | 101 | 0 | 56 | 100 | 0 | 3061 | 0 | 15 |
| 50000 | archive 50 | 79 | 101 | 0 | 23 | 30 | 0 | 2558 | 0 | 129 |

Bob's data folder after each size: 1000: 1073 bytes, 10000: 1092 bytes, 30000: 1112 bytes, 50000: 1129 bytes.
