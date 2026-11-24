#!/usr/bin/env python3
# Brain Engine 0106 test: the look-ahead 2 and 4 layers deep (LLAMA_MOE_LOOKAHEAD_DEPTH) and HotRod's learned correction
# (LLAMA_MOE_LOOKAHEAD_LEARN). Like 0041 they only move where experts sit, never which are used, so the words must be
# identical to a run without them, with a wrong guess too, inline and on a second stream. A ten-layer tiny brain on a
# stand-in card (ggml-rpc-server; build the checkout with GGML_RPC=ON), with a cache much smaller than its experts.
#   python3 engine/tests/moe-lookahead-deep.py <llama.cpp checkout, built> [work folder] [bin folder of the build before 0106]
# With the third argument, the run without look-ahead must give that build's words too. Speed: only on a real card.
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-lookahead-deep.py <llama.cpp checkout, built> [work folder] [old bin]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='lookahead-deep-')
OLD = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else None
BIN = os.path.join(SRC, 'build', 'bin')
EXE = '.exe' if os.name == 'nt' else ''
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType

def make_deep(out, E=32, L=10, used=4):
    vocab = GGUFReader(os.path.join(SRC, 'models', 'ggml-vocab-qwen2.gguf'))
    D, H, HKV, HD, FF = 64, 4, 2, 16, 32
    w = GGUFWriter(out, 'qwen3moe')
    w.add_context_length(2048); w.add_embedding_length(D); w.add_block_count(L)
    w.add_feed_forward_length(FF); w.add_head_count(H); w.add_head_count_kv(HKV)
    w.add_key_length(HD); w.add_value_length(HD)
    w.add_rope_freq_base(10000.0); w.add_layer_norm_rms_eps(1e-6)
    w.add_expert_count(E); w.add_expert_used_count(used); w.add_expert_feed_forward_length(FF)
    w.add_file_type(0)
    for f in vocab.fields.values():
        if not f.name.startswith('tokenizer.'): continue
        t = f.types[0]
        if t == GGUFValueType.ARRAY: w.add_array(f.name, f.contents())
        else: w.add_key_value(f.name, f.contents(), t)
    n_vocab = len(vocab.fields['tokenizer.ggml.tokens'].contents())
    rng = np.random.default_rng(7)
    def r(*shape, s=0.08): return (rng.standard_normal(shape) * s).astype(np.float32)
    w.add_tensor('token_embd.weight', r(n_vocab, D, s=0.5))
    w.add_tensor('output_norm.weight', np.ones(D, np.float32))
    w.add_tensor('output.weight', r(n_vocab, D, s=0.5))
    # routers that drift slowly from layer to layer, as real ones do, so a guess from layers back means something
    base = r(E, D, s=0.6)
    for i in range(L):
        p = f'blk.{i}.'
        w.add_tensor(p+'attn_norm.weight', np.ones(D, np.float32))
        w.add_tensor(p+'attn_q.weight', r(H*HD, D)); w.add_tensor(p+'attn_k.weight', r(HKV*HD, D)); w.add_tensor(p+'attn_v.weight', r(HKV*HD, D))
        w.add_tensor(p+'attn_output.weight', r(D, H*HD))
        w.add_tensor(p+'attn_q_norm.weight', np.ones(HD, np.float32)); w.add_tensor(p+'attn_k_norm.weight', np.ones(HD, np.float32))
        w.add_tensor(p+'ffn_norm.weight', np.ones(D, np.float32))
        base = (0.85*base + r(E, D, s=0.6*0.53)).astype(np.float32)
        w.add_tensor(p+'ffn_gate_inp.weight', base)
        w.add_tensor(p+'ffn_gate_exps.weight', r(E, FF, D, s=0.3)); w.add_tensor(p+'ffn_up_exps.weight', r(E, FF, D, s=0.3)); w.add_tensor(p+'ffn_down_exps.weight', r(E, D, FF, s=0.3))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-deep.gguf')
if not os.path.exists(brain): make_deep(brain)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f: f.write(' '.join(f'word{i}' for i in range(120)))
PORT = 50236
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server' + EXE), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
N_WORDS = '300'
def run(env, share='0', bin_dir=BIN, n=N_WORDS):
    r = subprocess.run([os.path.join(bin_dir, 'llama-completion' + EXE), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--n-cpu-moe', '10',
                        '--moe-cache-mib', '1', '--moe-cache-cpu-share', share, '-f', prompt, '-n', n, '-c', '2048', '-no-cnv',
                        '--temp', '0', '-t', '2', '-lv', '4'],
                       capture_output=True, text=True, errors='replace', env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '1000000', **env}, timeout=600)
    hits = re.findall(r'ubatch <= 8: hits = (\d+), misses = (\d+)', r.stderr)
    depth = {int(d): (int(u), int(k)) for d, u, k in re.findall(r'looked ahead (\d+) layer\(s\): (\d+) experts uploaded ahead, (\d+) of them used', r.stderr)}
    learn = {int(d): (int(w), float(p), float(l), float(c), int(a), int(b)) for d, w, p, l, c, a, b in
             re.findall(r'learned look-ahead (\d+) layer\(s\): (\d+) words learned from, picks guessed: plain router ([\d.]+)%, learned ([\d.]+)%, on the card ([\d.]+)%; learned leads in (\d+) of (\d+) layers', r.stderr)}
    return r.returncode, r.stdout, r.stderr, (int(hits[-1][0]) if hits else -1), depth, learn
try:
    code, base, err, hits0, _, _ = run({})
    check('the cache answers without looking ahead', code == 0 and hits0 >= 0, err[-400:])
    if OLD:
        code, out, err, _, _, _ = run({}, bin_dir=OLD)
        check('without look-ahead: the words of the build before 0106', code == 0 and out == base, err[-300:])
        code, out, err, _, _, _ = run({'LLAMA_MOE_LOOKAHEAD': '4', 'LLAMA_MOE_LOOKAHEAD_INLINE': '1'}, bin_dir=OLD)
        old_la = (code, out)
    code, out, err, hits1, _, _ = run({'LLAMA_MOE_LOOKAHEAD': '4', 'LLAMA_MOE_LOOKAHEAD_INLINE': '1'})
    # the prompt is a long read (in place since 0069): putting back an expert 0041 sent up that no word had used yet
    # (a CRF of 0) crashed before 0106
    check('one layer ahead (0041) after an in-place long read: no crash, the same words', code == 0 and out == base and 'cached experts in place' in err, err[-300:])
    if OLD:
        check('one layer ahead: the build before 0106 gives the same words, or crashed after the long read (fixed here)', old_la[1] == out or old_la[0] != 0, str(old_la[0]))
    deep = {'LLAMA_MOE_LOOKAHEAD': '4', 'LLAMA_MOE_LOOKAHEAD_DEPTH': '1,2,4'}
    code, out, err, hits2, d2, _ = run({**deep, 'LLAMA_MOE_LOOKAHEAD_INLINE': '1'})
    check('1, 2 and 4 layers ahead says so', 'guesses 1, 2, 4 layer(s) ahead' in err, err[-300:])
    check('1, 2 and 4 layers ahead inline: the same words', code == 0 and out == base, err[-300:])
    check('each depth sends experts up and some are used', all(d in d2 and d2[d][0] > 0 and d2[d][1] > 0 for d in (1, 2, 4)), str(d2))
    check('deeper guesses give more hits than none', hits2 > hits0, f'{hits2} vs {hits0}')
    print(f'      hits: none {hits0}, one ahead {hits1}, 1/2/4 ahead {hits2}; per depth (up, used) {d2}')
    code, out, err, _, d3, _ = run(deep)
    check('1, 2 and 4 layers ahead on a second stream: the same words', code == 0 and out == base, err[-300:])
    # Brain Engine 0108: the deeper guesses send at most LLAMA_MOE_LOOKAHEAD_DEEP_MAX (default 1) a layer, from their surest
    check('0108: deeper guesses say they send at most 1 a layer', 'upload at most 1 expert(s) a layer' in err, err[-300:])
    code, out, err, _, d6, _ = run({**deep, 'LLAMA_MOE_LOOKAHEAD_DEEP_MAX': '4'})
    check('0108: DEEP_MAX=4 (as 0106): the same words, and the deeper guesses send more', code == 0 and out == base and d6[2][0] + d6[4][0] > d3[2][0] + d3[4][0], f'{d6} vs {d3}')
    code, out, err, _, d7, _ = run({**deep, 'LLAMA_MOE_LOOKAHEAD_DEEP_MAX': '0'})
    check('0108: DEEP_MAX=0: the same words, nothing sent for 2 and 4 ahead', code == 0 and out == base and d7.get(2, (0, 0))[0] == 0 and d7.get(4, (0, 0))[0] == 0 and d7[1][0] > 0, str(d7))
    code, out, err, _, _, _ = run({**deep, 'LLAMA_MOE_LOOKAHEAD_DEEP_MAX': '9'})
    check('0108: DEEP_MAX above the look-ahead: NOT USED, the same words', 'LLAMA_MOE_LOOKAHEAD_DEEP_MAX=9 NOT USED' in err and code == 0 and out == base, err[-300:])
    print(f'      per depth (up, used): cap 1 {d3}, cap 4 {d6}')
    code, out, err, _, _, _ = run({**deep, 'LLAMA_MOE_LOOKAHEAD_SCRAMBLE': '1'})
    check('a wrong deep guess still gives the same words', code == 0 and out == base, err[-300:])
    code, out, err, _, _, _ = run({**deep, 'LLAMA_MOE_LOOKAHEAD_DEPTH': '2,4,6'})
    check('2, 4 and 6 (no one-ahead): the same words', code == 0 and out == base, err[-300:])
    code, out, err, _, _, _ = run({**deep, 'LLAMA_MOE_LOOKAHEAD_DEPTH': '1,2,3,4'})
    check('four depths: NOT USED, one ahead as 0041', 'LLAMA_MOE_LOOKAHEAD_DEPTH=1,2,3,4 NOT USED' in err and code == 0 and out == base, err[-300:])
    code, out, err, _, _, _ = run({**deep, 'LLAMA_MOE_LOOKAHEAD_DEPTH': '0'})
    check('depth 0: NOT USED', 'NOT USED' in err and code == 0 and out == base, err[-300:])
    learn = {**deep, 'LLAMA_MOE_LOOKAHEAD_LEARN': '1', 'LLAMA_MOE_LOOKAHEAD_LEARN_MIN': '40'}
    code, out, err, hits4, d4, l4 = run({**learn, 'LLAMA_MOE_LOOKAHEAD_INLINE': '1'})
    check('learning says it is on', 'the look-ahead learns while writing' in err, err[-300:])
    check('learning inline: the same words', code == 0 and out == base, err[-300:])
    check('each depth learns from the words written', all(d in l4 and l4[d][0] > 100 for d in (1, 2, 4)), str(l4))
    check('on the card, the guess is never much worse than the plain router\'s', all(l4[d][3] >= l4[d][1] - 2.0 for d in l4), str(l4))
    print('      learned (words, plain %, learned %, on the card %, leads, layers): ' + str(l4) + f'; hits {hits4}')
    code, out, err, _, _, l5 = run(learn)
    check('learning on a second stream: the same words', code == 0 and out == base, err[-300:])
    code, out, err, _, _, _ = run({**learn, 'LLAMA_MOE_LOOKAHEAD_DEPTH': '1', 'LLAMA_MOE_LOOKAHEAD_RANK': '4'})
    check('learning one layer ahead at rank 4: the same words', code == 0 and out == base and 'rank 4' in err, err[-300:])
    code, out, err, _, _, _ = run({**learn, 'LLAMA_MOE_LOOKAHEAD_SCRAMBLE': '1'})
    check('learning with a wrong guess: the same words', code == 0 and out == base, err[-300:])
    code_s, base_s, err_s, _, _, _ = run({}, share='0.5')
    code, out, err, _, _, _ = run(learn, share='0.5')
    check('with the CPU share 0.5: NOT USED, and the words of share 0.5 without it', 'LLAMA_MOE_LOOKAHEAD NOT USED' in err and code == 0 and code_s == 0 and out == base_s, err[-300:])
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
