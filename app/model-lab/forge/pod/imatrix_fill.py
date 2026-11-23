#!/usr/bin/env python3
"""Fill the experts an imatrix never saw (Nov 23 2026, Bobert IQ2 fix).

imatrix_fill.py --imatrix imatrix.gguf --out imatrix-filled.gguf
In a GGUF imatrix each expert tensor has <name>.in_sum2 (one row per expert: summed squared inputs) and <name>.counts (words
seen per expert). An expert the calibration text never reached has count 0, and IQ1/IQ2 quantizing refuses it. Here such an
expert gets the average importance of the experts that were seen in the same tensor (in_sum2/counts averaged, count 1), so
every expert can be quantized at the low type. Seen experts and every setting are copied unchanged."""
import argparse
import numpy as np
import gguf

ap = argparse.ArgumentParser(); ap.add_argument("--imatrix", required=True); ap.add_argument("--out", required=True); a = ap.parse_args()
r = gguf.GGUFReader(a.imatrix)
w = gguf.GGUFWriter(a.out, r.fields["general.architecture"].contents() if "general.architecture" in r.fields else "imatrix")
for f in r.fields.values():
    if f.name.startswith("GGUF.") or f.name == "general.architecture": continue
    vt = f.types[0]; st = f.types[-1] if vt == gguf.GGUFValueType.ARRAY else None
    v = f.contents()
    if vt == gguf.GGUFValueType.ARRAY and len(v) == 0: continue
    w.add_key_value(f.name, v, vt, sub_type=st)
data = {t.name: np.array(t.data, dtype=np.float32) for t in r.tensors}
filled_t = filled_e = 0
for n in list(data):
    if not n.endswith(".counts"): continue
    base = n[:-7]; s = base + ".in_sum2"
    if s not in data: continue
    c = data[n].reshape(-1); x = data[s].reshape(c.size, -1)
    seen = c > 0
    if c.size > 1 and seen.any() and (~seen).any():
        mean = (x[seen] / c[seen, None]).mean(axis=0)
        x[~seen] = mean; filled_e += int((~seen).sum()); filled_t += 1
        c = c.copy(); c[~seen] = 1
        data[s] = x.reshape(data[s].shape); data[n] = c.reshape(data[n].shape)
for t in r.tensors: w.add_tensor(t.name, data[t.name])
w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()
print(f"filled {filled_e} unseen expert(s) in {filled_t} tensor(s)")
