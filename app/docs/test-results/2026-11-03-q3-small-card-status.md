# Q3 / small-card test (status, 2026-11-03)

**No Q3 or small-card benchmark has been run.**

What exists so far is a catalog check only: the smaller Qwen3.6-35B-A3B **UD-Q3_K_XL** GGUF (16,845,511,648 bytes, sha256 `a832b9689925f1bd335bbe985cdfb06c36bf2cf268f4f8f6eceafa3ceb515617`, pinned to unsloth commit `a483e9e6cbd595906af30beda3187c2663a1118c`) was confirmed against Hugging Face's API: the size and checksum match. The file was not downloaded, so there are no speed, VRAM, RAM or quality numbers for it, and no test on a card smaller than 16 GB.

All published numbers for Qwen3.6-35B-A3B are for the UD-Q4_K_XL file on a replicant matrix (16 GB RTX 5070 Ti, 32 GB DDR5).
