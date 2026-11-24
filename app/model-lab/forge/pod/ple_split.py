# 24 Nov 2026 (the owner: "can he reuse the same lookup table?"): writes a GGUF as numbered parts whose LAST part holds only
# the per-layer word table (per_layer_token_embd.weight, the 51B n-gram embedding of Flash-Next, ~29 GB at q4_0). llama.cpp
# b12359 loads the parts as one brain, and with --ple <any table part> it skips a model's own table part, which then need not
# be on disk. So one table file serves every cut and every quant that stores the table the same way (e.g. q4_0 in every file).
# The other tensors go into parts of at most --max-gb each, in their order. Every part but the first has only the split keys
# (and the architecture GGUFWriter always writes). Checked on a tiny file with b12359: the parts load as one brain, a missing
# table part is taken from --ple, and another file's table part works there too. Not yet wired into run.sh (24 Nov, the owner:
# "launch now, split later").
#   python3 ple_split.py --src model.gguf --out-dir up/ [--max-gb 45]
import argparse, os, sys
import gguf

TABLE = 'per_layer_token_embd.weight'


def plan_parts(tensors, max_bytes):
    """Groups of tensor indices: the non-table tensors in order, cut at max_bytes, then the table alone."""
    parts, cur, size, table = [], [], 0, None
    for i, t in enumerate(tensors):
        if t.name == TABLE: table = i; continue
        if cur and size + t.n_bytes > max_bytes: parts.append(cur); cur, size = [], 0
        cur.append(i); size += t.n_bytes
    if cur: parts.append(cur)
    if table is None: return None
    parts.append([table])
    return parts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True); ap.add_argument('--out-dir', required=True)
    ap.add_argument('--max-gb', type=float, default=45)
    # --no-table: write only the parts before the table, for a second brain that loads a table part already on the drive (--ple)
    ap.add_argument('--no-table', action='store_true')
    a = ap.parse_args()
    r = gguf.GGUFReader(a.src)
    parts = plan_parts(r.tensors, int(a.max_gb * 1e9))
    if not parts: print(f'{a.src} has no {TABLE}; nothing to split', file=sys.stderr); sys.exit(2)
    arch = r.fields[gguf.Keys.General.ARCHITECTURE].contents()
    stem = os.path.basename(a.src)[:-len('.gguf')]
    os.makedirs(a.out_dir, exist_ok=True)
    n = len(parts); names = []
    for k, idx in enumerate(parts):
        if a.no_table and k == n - 1: print(f'table part left out (--no-table): load with --ple <a table part>'); break
        path = os.path.join(a.out_dir, f'{stem}-{k + 1:05d}-of-{n:05d}.gguf')
        w = gguf.GGUFWriter(path, arch, endianess=r.endianess)
        if k == 0:
            for f in r.fields.values():
                if f.name == gguf.Keys.General.ARCHITECTURE or f.name.startswith('GGUF.') or f.name.startswith('split.'): continue
                vt = f.types[0]; st = f.types[-1] if vt == gguf.GGUFValueType.ARRAY else None
                w.add_key_value(f.name, f.contents(), vt, sub_type=st)
        w.add_key_value('split.no', k, gguf.GGUFValueType.UINT16)
        w.add_key_value('split.count', n, gguf.GGUFValueType.UINT16)
        w.add_key_value('split.tensors.count', len(r.tensors), gguf.GGUFValueType.INT32)
        for i in idx:
            t = r.tensors[i]; w.add_tensor_info(t.name, t.data.shape, t.data.dtype, t.data.nbytes, t.tensor_type)
        w.write_header_to_file(); w.write_kv_data_to_file(); w.write_ti_data_to_file()
        for i in idx: w.write_tensor_data(r.tensors[i].data, tensor_endianess=r.endianess)
        w.close(); names.append(path)
        print(f'{os.path.basename(path)}: {len(idx)} tensor(s), {os.path.getsize(path)} bytes')
    if not a.no_table: print(f'table part: {os.path.basename(names[-1])}')


if __name__ == '__main__':
    main()
