#!/usr/bin/env python3
# Brain Engine 0050 test: the drive tier (LLAMA_MOE_DRIVE=1). Misses whose pages are not in RAM are read unbuffered from
# the brain's file into a staging ring and uploaded from there. The cache needs a card, so a stand-in card runs on this
# machine (ggml-rpc-server; build with GGML_RPC=ON). The brain here is small, so it sits in RAM; LLAMA_MOE_DRIVE_ALL=1
# reads every miss from the drive. It checks that:
#   - it turns on and reads misses from the drive, with the words of a plain run (two reads and writing)
#   - a tiny ring (LLAMA_MOE_DRIVE_MIB=1) waits for the card and still gives the same words
#   - without _ALL the misses found in RAM go up from the map (and the words are the same)
#   - without the memory map (--load-mode none) it says NOT USED
#   - the saved hot set (LLAMA_MOE_CACHE_SAVE): a ranking file stamped with the brain is written while it runs, and a
#     start with it as LLAMA_MOE_CACHE_RANKING fills the cache from it and gives the same words
#   python3 engine/tests/moe-drive.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-drive.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='drive-')
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType

def make_moe(out):
    # wide experts, so the cache is big next to the working memory, as on a real brain
    vocab = GGUFReader(os.path.join(SRC, 'models', 'ggml-vocab-qwen2.gguf'))
    E, L, D, H, HKV, HD, FF, used = 32, 4, 256, 4, 2, 64, 512, 4
    w = GGUFWriter(out, 'qwen3moe')
    w.add_context_length(4096); w.add_embedding_length(D); w.add_block_count(L)
    w.add_feed_forward_length(FF); w.add_head_count(H); w.add_head_count_kv(HKV)
    w.add_key_length(HD); w.add_value_length(HD)
    w.add_rope_freq_base(10000.0); w.add_layer_norm_rms_eps(1e-6)
    w.add_expert_count(E); w.add_expert_used_count(used); w.add_expert_feed_forward_length(FF)
    w.add_file_type(1)
    n_vocab = 0
    for f in vocab.fields.values():
        if not f.name.startswith('tokenizer.'): continue
        t = f.types[0]
        if t == GGUFValueType.ARRAY:
            vals = f.contents(); w.add_array(f.name, vals)
            if f.name == 'tokenizer.ggml.tokens': n_vocab = len(vals)
        else:
            w.add_key_value(f.name, f.contents(), t)
    rng = np.random.default_rng(7)
    def r(*shape, s=0.08, dt=np.float16): return (rng.standard_normal(shape) * s).astype(dt)
    w.add_tensor('token_embd.weight', r(n_vocab, D, s=0.5))
    w.add_tensor('output_norm.weight', np.ones(D, np.float32))
    w.add_tensor('output.weight', r(n_vocab, D, s=0.5))
    for i in range(L):
        p = f'blk.{i}.'
        w.add_tensor(p+'attn_norm.weight', np.ones(D, np.float32))
        w.add_tensor(p+'attn_q.weight', r(H*HD, D)); w.add_tensor(p+'attn_k.weight', r(HKV*HD, D)); w.add_tensor(p+'attn_v.weight', r(HKV*HD, D))
        w.add_tensor(p+'attn_output.weight', r(D, H*HD))
        w.add_tensor(p+'attn_q_norm.weight', np.ones(HD, np.float32)); w.add_tensor(p+'attn_k_norm.weight', np.ones(HD, np.float32))
        w.add_tensor(p+'ffn_norm.weight', np.ones(D, np.float32))
        w.add_tensor(p+'ffn_gate_inp.weight', r(E, D, s=0.6, dt=np.float32))
        w.add_tensor(p+'ffn_gate_exps.weight', r(E, FF, D, s=0.3)); w.add_tensor(p+'ffn_up_exps.weight', r(E, FF, D, s=0.3)); w.add_tensor(p+'ffn_down_exps.weight', r(E, D, FF, s=0.3))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-wide.gguf')
if not os.path.exists(brain): make_moe(brain)
P1 = ' '.join(f'apple{i} river{i % 7}' for i in range(300))
P2 = ' '.join(f'stone{i % 13} cloud{i}' for i in range(400))
RPORT = 50261
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, extra=(), port=50262):
    log = os.path.join(WORK, f'{tag}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', '4',
                          '--moe-cache-mib', '24', '--moe-cache-cpu-share', '0', '-c', '4096', '-np', '1', '-t', '2',
                          '-b', '2048', '-ub', '64', '--port', str(port), '-lv', '4', '--no-warmup', *extra],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'),
                         env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '200', **env})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    words = []
    try:
        for prompt, n in ((P1, 40), (P2, 120)):
            body = json.dumps({'prompt': prompt, 'n_predict': n, 'temperature': 0, 'cache_prompt': False, 'ignore_eos': True}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            words.append(json.loads(urllib.request.urlopen(req, timeout=600).read())['content'])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
def runs(err):
    r = re.findall(r'drive tier: (\d+) runs read from the drive \(([\d.]+) MiB, [\d.]+ MiB/s while reading\), (\d+) misses were in RAM, (\d+) ring waits', err)
    return [tuple(int(float(x)) for x in t) for t in r]
try:
    plain, _ = serve('plain', {})
    check('the plain run answers', len(plain) == 2 and not any(w.startswith('ERROR') for w in plain), f'{plain}')
    on, err = serve('drive-all', {'LLAMA_MOE_DRIVE': '1', 'LLAMA_MOE_DRIVE_ALL': '1'})
    r = runs(err)
    check('the drive tier turns on', 'drive tier on' in err, err[-500:])
    check('misses are read from the drive', len(r) > 0 and r[-1][0] > 0, f'{r}')
    check('the words of a plain run', on == plain, f'{on} vs {plain}')
    tiny, terr = serve('drive-tiny', {'LLAMA_MOE_DRIVE': '1', 'LLAMA_MOE_DRIVE_ALL': '1', 'LLAMA_MOE_DRIVE_MIB': '1', 'LLAMA_MOE_DRIVE_THREADS': '3'})
    rt = runs(terr)
    check('a tiny ring waits for the card and gives the same words', len(rt) > 0 and rt[-1][3] > 0 and tiny == plain, f'{rt} {tiny == plain}')
    ram, rerr = serve('drive-ram', {'LLAMA_MOE_DRIVE': '1'})
    rr = runs(rerr)
    check('without _ALL, misses in RAM go up from the map, same words', len(rr) > 0 and rr[-1][2] > 0 and ram == plain, f'{rr} {ram == plain}')
    _, nerr = serve('drive-nommap', {'LLAMA_MOE_DRIVE': '1'}, extra=('--load-mode', 'none'))
    check('without the memory map (--load-mode none) it says NOT USED', 'LLAMA_MOE_DRIVE NOT USED' in nerr)
    hot = os.path.join(WORK, 'hot-set.txt')
    if os.path.exists(hot): os.remove(hot)
    sv, serr = serve('save', {'LLAMA_MOE_CACHE_SAVE': hot, 'LLAMA_MOE_CACHE_SAVE_EVERY': '50'})
    lines = open(hot).read().replace('\r\n', '\n').split('\n') if os.path.exists(hot) else []
    check('the hot set is saved, stamped with the brain', len(lines) > 2 and lines[0].startswith('bob-moe-ranking 2 ') and 'hot set is saved to' in serr, f'{lines[:2]}')
    rk, rerr2 = serve('ranked', {'LLAMA_MOE_CACHE_RANKING': hot})
    fill = re.findall(r'ranked fill: (\d+) experts', rerr2)
    check('the next start fills the cache from it, same words', len(fill) > 0 and int(fill[0]) > 0 and rk == plain and sv == plain, f'{fill} {rk == plain} {sv == plain}')
    print(f'info: all {r[-1:]}, tiny {rt[-1:]}, ram {rr[-1:]}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
