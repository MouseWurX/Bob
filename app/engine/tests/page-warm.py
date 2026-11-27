#!/usr/bin/env python3
# Brain Engine 0141 test: page warm-up (off unless LLAMA_PAGE_WARM=1). After load, a helper thread reads one byte of each
# page of the mapped brain file that stays in RAM, so the first answer finds the pages mapped. The card is a stand-in
# (ggml-rpc-server; build the checkout with GGML_RPC=ON) with the experts left on the processor (--n-cpu-moe), and
# free RAM is pretended (LLAMA_PAGE_WARM_TEST_AVAIL_MIB), never read from this machine. It checks that:
#   - off by default it says nothing and reads nothing
#   - with LLAMA_PAGE_WARM=1 it says how much it read, and the words are those with it off
#   - the drive tier, --load-mode none and too little free RAM each say NOT USED
#   - the experts on the processor are among what it reads (more MiB with --n-cpu-moe than with all on the card)
#   - a load that ends at once (the engine stopped while it reads) does not crash
#   python3 engine/tests/page-warm.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: page-warm.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='pagewarm-')
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType

def make_moe(out):
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
P2 = ' '.join(f'stone{i % 13} cloud{i}' for i in range(250))
RPORT = 50271
rpc_bin = os.path.join(BIN, 'ggml-rpc-server') if os.path.exists(os.path.join(BIN, 'ggml-rpc-server')) else os.path.join(BIN, 'rpc-server')
rpc = subprocess.Popen([rpc_bin, '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
FREE = {'LLAMA_PAGE_WARM_TEST_AVAIL_MIB': '65536', 'LLAMA_PAGE_WARM': '1'}
def serve(tag, env, cpu_moe='4', port=50272, extra=(), ask=True):
    log = os.path.join(WORK, f'{tag}.log')
    args = [os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', cpu_moe,
            '-c', '2048', '-np', '1', '-t', '2', '--port', str(port), '-lv', '4', '--no-warmup', *extra]
    p = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, **FREE, **env})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    words = []
    if ask:
        try:
            for prompt in (P1, P2):
                body = json.dumps({'prompt': prompt, 'n_predict': 32, 'temperature': 0, 'cache_prompt': False}).encode()
                req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
                words.append(json.loads(urllib.request.urlopen(req, timeout=300).read())['content'])
        except Exception as e:
            words.append(f'ERROR {e}')
    p.terminate()
    try: rc = p.wait(timeout=20)
    except Exception: p.kill(); rc = 'killed'
    return words, open(log, errors='replace').read(), rc
def warmed(err):
    m = re.search(r'page warm-up \(0141\): (\d+) MiB of the brain file mapped', err)
    return int(m.group(1)) if m else -1
try:
    off, offerr, _ = serve('off', {'LLAMA_PAGE_WARM': ''})
    check('off by default: no warm-up, and it answers', '0141' not in offerr and len(off) == 2 and not any(w.startswith('ERROR') for w in off), offerr[-300:])
    on, err, _ = serve('on', {})
    check('with LLAMA_PAGE_WARM=1: it reads the pages and says so', 'reading' in err and warmed(err) > 0, err[-400:])
    check('the same words as with it off', on == off, f'{on} vs {off}')
    _, allerr, _ = serve('all-on-card', {}, cpu_moe='0')
    check('the experts left on the processor are read (more than with all on the card)', warmed(err) > warmed(allerr) >= 0 or (warmed(err) > 0 and 'NOT USED, nothing of the file' in allerr),
          f'{warmed(err)} vs {warmed(allerr)} MiB')
    lo, loerr, _ = serve('low', {'LLAMA_PAGE_WARM_TEST_AVAIL_MIB': '100'})
    check('too little free RAM: NOT USED, same words', "NOT USED, the pages don't fit" in loerr and lo == off, loerr[-300:])
    dr, drerr, _ = serve('drive', {'LLAMA_MOE_DRIVE': '1'})
    check('next to the drive tier: NOT USED', 'NOT USED, the drive tier' in drerr, drerr[-300:])
    nm, nmerr, _ = serve('no-map', {}, extra=('--load-mode', 'none'))
    check('--load-mode none: NOT USED, same words', 'NOT USED, the brain was read into RAM' in nmerr and nm == off, nmerr[-300:])
    _, qerr, rc = serve('quit', {}, ask=False)
    check('stopped right after load: no crash', 'Segmentation' not in qerr and rc in (0, -15, 143), f'rc {rc}')
    print(f'info: {warmed(err)} MiB read with 4 layers of experts on the processor, {warmed(allerr)} with all on the card')
finally:
    rpc.kill()
sys.exit(1 if fails else 0)
