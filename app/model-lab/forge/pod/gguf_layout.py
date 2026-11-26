#!/usr/bin/env python3
"""Where each value of a GGUF tensor came from in the HF checkpoint, found by running llama.cpp's own converter.

  from gguf_layout import trace_layout
  layout = trace_layout('<llama.cpp checkout>', '<HF dir>', no_mtp=True)
  # layout['blk.0.attn_qkv_gate.weight'] = {'shape': (rows, cols), 'parts': [(hf_name, gguf_flat_pos, hf_flat_pos), ...]}
  #   or {'shape': ..., 'same': hf_name} when the tensor is one HF tensor in the same order

Some converters merge, split or reorder tensors on the way to GGUF (Qwen3.5's gated-delta layers merge in_proj_qkv with
in_proj_z, reorder the V heads, merge in_proj_b with in_proj_a and reorder out_proj's columns). Instead of copying those
rules, this feeds the converter's own modify_tensors a stand-in for every HF tensor whose values are its address
(tensor number * 2^32 + flat index, exact in float64) and reads back where each address landed. A tensor the converter
changes by arithmetic (norm + 1, exp(A_log), ...) gives values that are not addresses; it is left out, and the caller
falls back to matching it by name and value. Nothing is written to disk.
"""
import os, sys
import numpy as np
from pathlib import Path

SHIFT = 2 ** 32


def trace_layout(llama_cpp, hf_dir, no_mtp=True, log=print):
    llama_cpp = os.path.abspath(llama_cpp)
    for p in (llama_cpp, os.path.join(llama_cpp, 'gguf-py')):
        if p not in sys.path: sys.path.insert(0, p)
    import torch
    import gguf
    from conversion import ModelBase, ModelType, get_model_architecture, get_model_class

    hf_dir = Path(hf_dir)
    hparams = ModelBase.load_hparams(hf_dir, False)
    cls = get_model_class(get_model_architecture(hparams, ModelType.TEXT), mmproj=False)
    if no_mtp and getattr(cls, 'supports_mtp_export', False): cls.no_mtp = True
    with torch.inference_mode():
        m = cls(hf_dir, gguf.LlamaFileType.ALL_F32, Path(os.devnull), dry_run=True)
        names = list(m.model_tensors.keys())
        shapes = {n: tuple(m.model_tensors[n]().shape) for n in names}
        number = {n: i for i, n in enumerate(names)}
        out = {}
        skipped = []
        for name in names:
            if name.endswith(('.attention.masked_bias', '.attention.bias', '.rotary_emb.inv_freq')): continue
            shp = shapes[name]; n = int(np.prod(shp)) if shp else 1
            if n >= SHIFT: skipped.append(name); continue
            ids = (torch.arange(n, dtype=torch.float64) + float(number[name] * SHIFT)).reshape(shp)
            bid = next((int(p) for p in name.split('.') if p.isdecimal()), None)
            try:
                for new_name, t in m.modify_tensors(ids, name, bid):
                    out[new_name] = t.detach().to(torch.float64).cpu().numpy()
            except Exception as e:  # a tensor the converter refuses on its own (it would stop the real conversion too)
                skipped.append(f'{name}: {type(e).__name__}')
    rev = {i: n for n, i in number.items()}
    layout = {}
    for gname, v in out.items():
        flat = v.reshape(-1)
        if not np.all(np.isfinite(flat)) or not np.all(flat == np.round(flat)) or flat.min() < 0: continue
        flat = flat.astype(np.int64)
        src, idx = flat // SHIFT, flat % SHIFT
        if not all(int(s) in rev for s in np.unique(src)): continue
        if any(idx[src == s].max() >= int(np.prod(shapes[rev[int(s)]] or (1,))) for s in np.unique(src)): continue
        entry = {'shape': tuple(v.shape)}
        us = np.unique(src)
        if len(us) == 1 and np.array_equal(idx, np.arange(flat.size)) and flat.size == int(np.prod(shapes[rev[int(us[0])]] or (1,))):
            entry['same'] = rev[int(us[0])]
        else:
            entry['parts'] = [(rev[int(s)], np.nonzero(src == s)[0], idx[src == s]) for s in us]
        layout[gname] = entry
    log(f'layout: {len(layout)} GGUF tensors traced to the HF checkpoint '
        f'({sum("parts" in e for e in layout.values())} merged or reordered), {len(skipped)} HF tensors skipped')
    return layout
