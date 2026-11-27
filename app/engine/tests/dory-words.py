#!/usr/bin/env python3
# Brain Engine 0126 test: NVIDIA's Dory (looped "latent-recurrent" nGPT, upstream PR #30306), on the processor.
# One thread, because a near-tie between two words on a random brain can flip with the summing order of 4 threads.
# Makes tiny random Dory brains with the checkout's own gguf-py (1, 2 and 4 loops; per_loop and last_loop key/value memory;
# a made-up 128-word vocabulary like test-llama-archs uses), so nothing is downloaded. Checks:
#   - every brain loads and answers greedily (llama-completion), whole prompt in one batch and in 7-token pieces
#   - the loop count changes the words (1 loop vs 2), and the sliding layers' own RoPE base is used (theta_2 changed -> words change)
#   - with a second checkout built (the PR's own head, or the phone engine with android/patches), the same greedy words
#   python3 engine/tests/dory-words.py <llama.cpp checkout with the patches, built> [reference checkout, built] [work folder]
# Nov 27 2026 (cloud, CPU, AVX2): Lamplight b12359 + 0126 and the phone engine (pin 37b0f9c3 + android/patches/0001-dory)
# both gave PR #30306 head 8481bd0's words on 24 of 24 (6 brains x 2 prompts x 2 batch sizes).
import os, subprocess, sys, tempfile, hashlib
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: dory-words.py <checkout, built> [reference, built] [work folder]')
REF = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else ''
WORK = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else tempfile.mkdtemp(prefix='dory-')
os.makedirs(WORK, exist_ok=True)
GGUF_PY = os.path.join(REF or SRC, 'gguf-py')   # the phone engine's patch leaves gguf-py alone, so a reference brings its own
if not os.path.exists(os.path.join(GGUF_PY, 'gguf', 'constants.py')) or 'DORY' not in open(os.path.join(GGUF_PY, 'gguf', 'constants.py')).read():
    GGUF_PY = os.path.join(SRC, 'gguf-py')
sys.path.insert(0, GGUF_PY)
import numpy as np, gguf
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok

def make(path, loops, mode, theta_2=1e4):
    w = gguf.GGUFWriter(path, 'dory')
    E, FF, NH, NK, HD, V = 256, 256, 8, 2, 32, 128
    pattern = '*-S-*-'
    w.add_context_length(4096); w.add_embedding_length(E); w.add_block_count(6); w.add_feed_forward_length(FF)
    w.add_head_count(NH); w.add_head_count_kv(NK); w.add_key_length(HD); w.add_value_length(HD); w.add_rope_dimension_count(HD)
    w.add_rope_freq_base(1e7); w.add_rope_freq_base_2(theta_2); w.add_sliding_window(8); w.add_layer_norm_rms_eps(1e-6)
    w.add_input_layer_count(2); w.add_recurrent_layer_count(2); w.add_output_layer_count(2); w.add_num_loops(loops)
    w.add_layer_pattern(pattern); w.add_recurrent_kv_cache_mode(mode); w.add_rope_profile([1, 1, 2, 1, 1, 1])
    w.add_init_std(0.0177); w.add_alpha_init(0.05); w.add_gate_init(E ** 0.5)
    w.add_string('tokenizer.ggml.model', 'test')
    w.add_array('tokenizer.ggml.tokens', [f'tok_{i}' for i in range(V)])
    w.add_array('tokenizer.ggml.token_type', [1] * V); w.add_array('tokenizer.ggml.scores', [0.0] * V)
    for k in ('add_bos_token', 'add_eos_token', 'add_sep_token', 'add_space_prefix', 'remove_extra_whitespaces', 'clean_spaces'):
        w.add_bool('tokenizer.ggml.' + k, False)
    rng = np.random.default_rng(3)
    m = lambda *shape, s=0.05: (rng.standard_normal(shape) * s).astype(np.float32)
    v = lambda n: (np.abs(rng.standard_normal(n)) * 0.0177 + 0.01).astype(np.float32)
    w.add_tensor('token_embd.weight', m(V, E, s=1.0)); w.add_tensor('output.weight', m(V, E)); w.add_tensor('output_scale.weight', v(V))
    for b in range(6):
        w.add_tensor(f'blk.{b}.residual_alpha.weight', v(E))
        if pattern[b] == '-':
            w.add_tensor(f'blk.{b}.ffn_gate.weight', m(FF, E)); w.add_tensor(f'blk.{b}.ffn_up.weight', m(FF, E)); w.add_tensor(f'blk.{b}.ffn_down.weight', m(E, FF))
            w.add_tensor(f'blk.{b}.ffn_gate_scale.weight', v(FF)); w.add_tensor(f'blk.{b}.ffn_up_scale.weight', v(FF))
        else:
            w.add_tensor(f'blk.{b}.attn_q.weight', m(NH * HD, E)); w.add_tensor(f'blk.{b}.attn_k.weight', m(NK * HD, E)); w.add_tensor(f'blk.{b}.attn_v.weight', m(NK * HD, E))
            w.add_tensor(f'blk.{b}.attn_output.weight', m(E, NH * HD)); w.add_tensor(f'blk.{b}.attn_gate.weight', m(NH * HD, E))
            w.add_tensor(f'blk.{b}.attn_qk_scale.weight', v(NH * HD)); w.add_tensor(f'blk.{b}.attn_gate_scale.weight', v(NH * HD))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

P = ['tok_1 tok_2 tok_3', ' '.join(f'tok_{(i * 7) % 128}' for i in range(40))]
def words(root, f, p, b):
    r = subprocess.run([os.path.join(root, 'build', 'bin', 'llama-completion'), '-m', f, '-p', p, '-n', '48', '--temp', '0', '--seed', '1',
                        '-c', '512', '-b', str(b), '-ub', str(b), '-no-cnv', '--no-warmup', '-t', '1'], capture_output=True, text=True)
    return r.returncode, r.stdout

brains = []
for loops in (1, 2, 4):
    for mode in ('per_loop', 'last_loop'):
        f = os.path.join(WORK, f'dory-{loops}-{mode}.gguf'); make(f, loops, mode); brains.append(f)
same_t2 = os.path.join(WORK, 'dory-2-theta.gguf'); make(same_t2, 2, 'per_loop', theta_2=1e7)
out = {}
for f in brains:
    for i, p in enumerate(P):
        for b in (512, 7):
            rc, txt = words(SRC, f, p, b); out[(f, i, b)] = txt
            check(f'{os.path.basename(f)} prompt {i + 1} batch {b}: answers', rc == 0 and len(txt.strip()) > 0, f'rc {rc}')
check('the loop count changes the words', out[(brains[0], 1, 512)] != out[(brains[2], 1, 512)])
check('the sliding layers use their own RoPE base', words(SRC, same_t2, P[1], 512)[1] != out[(brains[2], 1, 512)])
if REF:
    n = sum(words(REF, f, P[i], b)[1] == out[(f, i, b)] for (f, i, b) in out)
    check(f'same words as the reference build ({n} of {len(out)})', n == len(out))
print('dory-words: ' + ('all passed' if not fails else f'{fails} failed'))
sys.exit(1 if fails else 0)
