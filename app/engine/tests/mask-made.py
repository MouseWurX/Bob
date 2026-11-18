#!/usr/bin/env python3
# Brain Engine 0025 test: the attention mask made from positions (LLAMA_KQ_MASK_BUILD=1) gives the same odds, bit for
# bit, as the stock table filled on the processor.
#   python3 engine/tests/mask-made.py <llama.cpp checkout with the patches, built> [work folder]
# It needs libllama built in <checkout>/build/bin, a C++ compiler, numpy and the checkout's gguf-py. Two tiny made-up
# brains with random weights: a mixture-of-experts one (every layer sees the whole chat) and a Gemma 2 shaped one
# (every other layer sees only the last 6 words, a sliding window). For each: flash attention on and off, one shared
# cache and one cache per chat, one chat and three chats in one batch, a big step and a small one (several steps per
# prompt), plus a hole in the cache, a copied chat and a context shift (see mask-made.cpp).
import os, subprocess, sys, tempfile
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: mask-made.py <llama.cpp checkout with the patches, built> [work folder]')
WORK = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='mask-')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType

src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('def make_moe'):src.index("MODEL = ")])

def make_swa(out, window=6):
    vocab = GGUFReader(os.path.join(SRC, 'models', 'ggml-vocab-qwen2.gguf'))
    L, D, H, HKV, HD, FF = 4, 64, 4, 2, 16, 96
    w = GGUFWriter(out, 'gemma2')
    w.add_context_length(512); w.add_embedding_length(D); w.add_block_count(L)
    w.add_feed_forward_length(FF); w.add_head_count(H); w.add_head_count_kv(HKV)
    w.add_key_length(HD); w.add_value_length(HD)
    w.add_rope_freq_base(10000.0); w.add_layer_norm_rms_eps(1e-6)
    w.add_sliding_window(window)
    w.add_file_type(0)
    n_vocab = 0
    for f in vocab.fields.values():
        if not f.name.startswith('tokenizer.'): continue
        t = f.types[0]
        if t == GGUFValueType.ARRAY:
            vals = f.contents(); w.add_array(f.name, vals)
            if f.name == 'tokenizer.ggml.tokens': n_vocab = len(vals)
        else:
            w.add_key_value(f.name, f.contents(), t)
    rng = np.random.default_rng(2)
    def r(*shape, s=0.08): return (rng.standard_normal(shape) * s).astype(np.float32)
    w.add_tensor('token_embd.weight', r(n_vocab, D, s=0.5))
    w.add_tensor('output_norm.weight', np.ones(D, np.float32))
    for i in range(L):
        p = f'blk.{i}.'
        for n in ('attn_norm', 'post_attention_norm', 'ffn_norm', 'post_ffw_norm'):
            w.add_tensor(p+n+'.weight', np.ones(D, np.float32))
        w.add_tensor(p+'attn_q.weight', r(H*HD, D)); w.add_tensor(p+'attn_k.weight', r(HKV*HD, D)); w.add_tensor(p+'attn_v.weight', r(HKV*HD, D))
        w.add_tensor(p+'attn_output.weight', r(D, H*HD))
        w.add_tensor(p+'ffn_gate.weight', r(FF, D)); w.add_tensor(p+'ffn_up.weight', r(FF, D)); w.add_tensor(p+'ffn_down.weight', r(D, FF))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

os.makedirs(WORK, exist_ok=True)
brains = {'experts': os.path.join(WORK, 'moe-k2.gguf'), 'window': os.path.join(WORK, 'swa-w6.gguf')}
if not os.path.exists(brains['experts']): make_moe(brains['experts'])
if not os.path.exists(brains['window']):  make_swa(brains['window'])

exe = os.path.join(WORK, 'mask-made.exe' if os.name == 'nt' else 'mask-made')
lib = os.path.join(SRC, 'build', 'bin')
subprocess.check_call(['c++', '-std=c++17', '-O1', os.path.join(HERE, 'mask-made.cpp'), '-o', exe,
                       '-I', os.path.join(SRC, 'include'), '-I', os.path.join(SRC, 'ggml', 'include'),
                       '-L', lib, '-lllama', '-lggml', '-lggml-base', f'-Wl,-rpath,{lib}'])
fails = 0
for name, path in brains.items():
    for fa in (1, 0):
        for kvu in (1, 0):
            for chats in (1, 3):
                for step in (512, 7):
                    r = subprocess.run([exe, path, str(fa), str(kvu), str(chats), str(step), '20'], capture_output=True, text=True)
                    line = (r.stdout.strip().splitlines() or ['FAIL no output: ' + r.stderr[-300:]])[-1]
                    print(f'{name:8} {line}')
                    fails += r.returncode != 0
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
