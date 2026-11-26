# Makes a tiny Qwen 3.5 MoE brain with an MTP head, for guess-ahead tests (Lamplight 0130, upstream-picks-3.py).
# test-llama-archs' tiny qwen35moe brain gets Qwen 3.5's real vocabulary (llama.cpp's models/ggml-vocab-qwen35.gguf) and
# one MTP block (a copy of its last full-attention block plus random nextn weights, so almost every guess is thrown away
# and every step rolls the delta-net state back).
#   python3 -I engine/tests/tiny-mtp-brain.py <llama.cpp checkout> <tiny qwen35moe gguf> <out gguf>
import sys
import numpy as np
sys.path.insert(0, sys.argv[1] + '/gguf-py')
import gguf

ARCH = 'qwen35moe'
src, voc = gguf.GGUFReader(sys.argv[2]), gguf.GGUFReader(sys.argv[1] + '/models/ggml-vocab-qwen35.gguf')
n_vocab = len(voc.fields['tokenizer.ggml.tokens'].contents())
n_layer = int(src.fields[f'{ARCH}.block_count'].contents())
n_embd = int(src.fields[f'{ARCH}.embedding_length'].contents())
w = gguf.GGUFWriter(sys.argv[3], ARCH)

def copy(k, f, v=None):
    t = f.types[0]
    sub = f.types[-1] if t == gguf.GGUFValueType.ARRAY else None
    v = f.contents() if v is None else v
    if sub is not None and len(v) == 0:
        return
    w.add_key_value(k, v, t, sub_type=sub)

for k, f in src.fields.items():
    if k.startswith('GGUF.') or k == 'general.architecture' or k.startswith('tokenizer.'):
        continue
    if k == f'{ARCH}.vocab_size': w.add_uint32(k, n_vocab); continue
    if k == f'{ARCH}.context_length': w.add_uint32(k, 32768); continue
    if k == f'{ARCH}.block_count': w.add_uint32(k, n_layer + 1); continue
    if k == f'{ARCH}.nextn_predict_layers': w.add_uint32(k, 1); continue
    v = f.contents()
    if f.types[0] == gguf.GGUFValueType.ARRAY and k.endswith('recurrent_layers') and len(v) == n_layer:
        copy(k, f, v + [0]); continue  # the MTP block is a full attention block
    copy(k, f)
if f'{ARCH}.nextn_predict_layers' not in src.fields:
    w.add_uint32(f'{ARCH}.nextn_predict_layers', 1)
for k, f in voc.fields.items():
    if k.startswith('tokenizer.') and k != 'tokenizer.chat_template':
        copy(k, f)

rng = np.random.default_rng(11)
def put(name, t):
    w.add_tensor(name, np.array(t.data), raw_shape=list(reversed([int(x) for x in t.shape])), raw_dtype=t.tensor_type)
for t in src.tensors:
    if t.name in ('token_embd.weight', 'output.weight'):
        w.add_tensor(t.name, (rng.standard_normal((n_vocab, n_embd)) * 0.5).astype(np.float32)); continue
    put(t.name, t)
last = f'blk.{n_layer - 1}.'
for t in src.tensors:
    if t.name.startswith(last):
        put(f'blk.{n_layer}.' + t.name[len(last):], t)
rng = np.random.default_rng(7)
L = f'blk.{n_layer}.nextn.'
w.add_tensor(L + 'eh_proj.weight', (rng.standard_normal((n_embd, 2 * n_embd)) * 0.05).astype(np.float32))
w.add_tensor(L + 'enorm.weight', np.ones(n_embd, np.float32))
w.add_tensor(L + 'hnorm.weight', np.ones(n_embd, np.float32))
w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()
