#!/usr/bin/env python3
# Brain Engine 0109 test: the brain map's experts in RAM registered with the card (LLAMA_MOE_REGISTER_RAM=1).
# The card is a stand-in on this machine (ggml-rpc-server; build the checkout with GGML_RPC=ON), which has nothing to
# register with, so LLAMA_MOE_REGISTER_RAM_TEST=1 runs the same bookkeeping without the driver, and
# GGML_RPC_TEST_OFFLOAD=1 makes it take big expert products from RAM (op offload) as a real card does. Free RAM is
# pretended (LLAMA_MOE_REGISTER_RAM_TEST_FREE_MIB), never read from this machine. It checks that:
#   - without the test switch the stand-in card says NOT USED and answers as a plain run
#   - with it, the experts are registered (all of them under a big budget) and the words are a plain run's
#   - next to the pinned ring (0057), registered uploads skip the ring, with the same words, with and without the cache
#   - a small budget registers only part (the rest through the ring), with the same words
#   - the budget is at most half of free RAM, and keeps 4096 MiB free
#   - too little free RAM, the drive tier and --load-mode none each say NOT USED and answer as a plain run
#   python3 engine/tests/moe-register-ram.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-register-ram.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='register-')
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
P1 = ' '.join(f'apple{i} river{i % 7}' for i in range(500))
P2 = ' '.join(f'stone{i % 13} cloud{i}' for i in range(450))
RPORT = 50261
rpc_bin = os.path.join(BIN, 'ggml-rpc-server') if os.path.exists(os.path.join(BIN, 'ggml-rpc-server')) else os.path.join(BIN, 'rpc-server')
rpc = subprocess.Popen([rpc_bin, '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub='512', b='2048', cache='24', port=50262, extra=()):
    log = os.path.join(WORK, f'{tag}.log')
    args = [os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', '4',
            '-c', '4096', '-np', '1', '-t', '2', '-b', b, '-ub', ub, '--port', str(port), '-lv', '4', '--no-warmup', *extra]
    if cache: args += ['--moe-cache-mib', cache, '--moe-cache-cpu-share', '0']
    p = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, 'GGML_RPC_TEST_OFFLOAD': '1', **env})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    words = []
    try:
        for prompt in (P1, P2):
            body = json.dumps({'prompt': prompt, 'n_predict': 40, 'temperature': 0, 'cache_prompt': False}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            words.append(json.loads(urllib.request.urlopen(req, timeout=300).read())['content'])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
def ring(err):
    m = re.findall(r'llama_pinned_upload: ([\d.]+) MiB in (\d+) pieces', err)
    return (float(m[-1][0]), int(m[-1][1])) if m else (0.0, 0)
def straight(err):
    m = re.findall(r'llama_pinned_upload: ([\d.]+) MiB went straight up from RAM registered', err)
    return float(m[-1]) if m else 0.0
def registered(err):
    m = re.search(r'llama_ram_register: (\d+) of (\d+) MiB of experts in RAM \((\d+) tensors\) registered', err)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else (0, 0, 0)
FREE = {'LLAMA_MOE_REGISTER_RAM_TEST_FREE_MIB': '65536'}
ON = {'LLAMA_MOE_REGISTER_RAM': '1', 'LLAMA_MOE_REGISTER_RAM_TEST': '1', **FREE}
RING = {'LLAMA_MOE_PINNED_UPLOAD': '1', 'LLAMA_MOE_PINNED_UPLOAD_TEST': '1'}
try:
    plain, _ = serve('plain', {})
    check('a plain run answers', len(plain) == 2 and not any(w.startswith('ERROR') for w in plain), f'{plain}')
    nu, nerr = serve('no-driver', {'LLAMA_MOE_REGISTER_RAM': '1', **FREE})
    check('the stand-in card can\'t register: NOT USED, plain words', "can't register host memory" in nerr and nu == plain, nerr[-300:])
    on, err = serve('on', ON)
    got, total, nt = registered(err)
    check('every expert tensor in RAM is registered under a big budget', nt == 12 and got == total and total > 0, f'{got} of {total} MiB, {nt} tensors')
    check('the same words as a plain run', on == plain, f'{on} vs {plain}')
    rp, rperr = serve('ring', RING)
    ro, roerr = serve('ring-registered', {**RING, **ON})
    check('next to the pinned ring: long reads skip it, the same words', straight(roerr) > 1 and ring(roerr)[1] == 0 and ring(rperr)[1] > 0 and ro == plain == rp,
          f'{straight(roerr)} MiB straight, ring {ring(roerr)} vs {ring(rperr)}')
    pa, paerr = serve('part', {**RING, **ON, 'LLAMA_MOE_REGISTER_RAM_MIB': '20'})
    pg, pt, _ = registered(paerr)
    check('a 20 MiB budget registers part: some straight up, the rest through the ring, the same words',
          pg == 20 and pt > 20 and 'over the RAM budget' in paerr and straight(paerr) > 0 and ring(paerr)[1] > 0 and pa == plain,
          f'{pg} of {pt} MiB, {straight(paerr)} MiB straight, ring {ring(paerr)}')
    kp, kperr = serve('keep', {**ON, 'LLAMA_MOE_REGISTER_RAM_TEST_FREE_MIB': '4112'})
    check('4112 MiB free keeps 4096 for the system: 16 MiB registered', registered(kperr)[0] == 16 and kp == plain, f'{registered(kperr)}')
    hf, hferr = serve('half', {**ON, 'LLAMA_MOE_REGISTER_RAM_TEST_FREE_MIB': '100', 'LLAMA_MOE_REGISTER_RAM_KEEP_MIB': '0'})
    check('at most half of free RAM: 100 MiB free registers 50', registered(hferr)[0] == 50 and hf == plain, f'{registered(hferr)}')
    lo, loerr = serve('low', {**ON, 'LLAMA_MOE_REGISTER_RAM_TEST_FREE_MIB': '3000'})
    check('too little free RAM: NOT USED, plain words', 'NOT USED: no room in its RAM budget' in loerr and lo == plain, loerr[-300:])
    nc_plain, _ = serve('plain-nocache', {}, cache='')
    nc_on, ncerr = serve('registered-nocache', {**RING, **ON}, cache='')
    check('without the MoE cache: straight up, the same words', straight(ncerr) > 1 and nc_on == nc_plain, f'{straight(ncerr)} MiB, {nc_on} vs {nc_plain}')
    dr, drerr = serve('drive', {**ON, 'LLAMA_MOE_DRIVE': '1'})
    check('next to the drive tier: NOT USED', 'NOT USED: not together with the drive tier' in drerr and registered(drerr)[2] == 0, drerr[-300:])
    nm, nmerr = serve('no-map', ON, extra=('--load-mode', 'none'))
    check('--load-mode none: NOT USED, plain words', 'no expert tensor is read through the brain' in nmerr and nm == plain, nmerr[-400:])
    print(f'info: {got} of {total} MiB registered; {straight(roerr)} MiB straight up next to the ring')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
