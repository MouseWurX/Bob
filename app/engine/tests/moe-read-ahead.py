#!/usr/bin/env python3
# Brain Engine 0071 test: read ahead (LLAMA_MOE_CACHE_READ_AHEAD; on by default since 0075, =0 turns it off) inside the in-place long read (0069).
# The zone becomes two halves taken in turn by a group's layers; while a layer computes, the next one's misses go up into
# the other half on a second stream, and its lookup uploads nothing. Stand-in card (ggml-rpc-server,
# GGML_RPC_TEST_OFFLOAD=1). It checks, over three rounds of two long reads with writing between them, that:
#   - it says it is on, sends experts ahead, and the lookups use them
#   - the same words as in-place reads without it and as without the cache, in line and queued by a thread,
#     at a few cache sizes and with a 2048-token step; a cache too small for two halves reads with one zone as before
#   - on unless =0 (0075), and quiet when unset where it can't run; NOT USED without in-place reads and next to the drive tier, with the same words
#   python3 engine/tests/moe-read-ahead.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-read-ahead.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='readahead-')
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
RPORT = 50331
rpc_bin = os.path.join(BIN, 'ggml-rpc-server') if os.path.exists(os.path.join(BIN, 'ggml-rpc-server')) else os.path.join(BIN, 'rpc-server')
rpc = subprocess.Popen([rpc_bin, '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub='512', b='2048', cache='72', port=50332):
    log = os.path.join(WORK, f'{tag}.log')
    args = [os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', '4',
            '-c', '4096', '-np', '1', '-t', '2', '-b', b, '-ub', ub, '--port', str(port), '-lv', '4', '--no-warmup']
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
        for prompt in (P1, P2, P1, P2, P1, P2):
            body = json.dumps({'prompt': prompt, 'n_predict': 40, 'temperature': 0, 'cache_prompt': False}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            words.append(json.loads(urllib.request.urlopen(req, timeout=300).read())['content'])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
def ra(err):
    m = re.findall(r'read ahead: (\d+) layers sent ahead, (\d+) experts \(([\d.]+) MiB, (\d+) parts from the RAM cache\), (\d+) used, (\d+) groups too small', err)
    return tuple(int(m[-1][k]) for k in (0, 1, 4, 5)) if m else (0, 0, 0, 0)
def ipl(err):
    m = re.findall(r'in-place long reads: (\d+) reads, (\d+) experts read where they sit, (\d+) uploaded', err)
    return tuple(int(x) for x in m[-1]) if m else (0, 0, 0)
RA = {'LLAMA_MOE_CACHE_READ_AHEAD': '1'}
TH = {**RA, 'LLAMA_MOE_CACHE_READ_AHEAD_THREAD': '1'}
ok = lambda w: len(w) == 6 and not any(x.startswith('ERROR') for x in w)
try:
    nocache, _ = serve('nocache', {}, cache='')
    check('without the cache it answers', ok(nocache), f'{nocache}')
    plain, perr = serve('in-place', {'LLAMA_MOE_CACHE_READ_AHEAD': '0'})
    check('=0 turns it off', 'read ahead on' not in perr and ra(perr) == (0, 0, 0, 0), perr[-300:])
    dflt, derr = serve('default', {}, cache='72')
    check('on by default (0075): experts sent ahead, the same words', 'read ahead on' in derr and ra(derr)[0] > 0 and dflt == nocache, f'{ra(derr)} {dflt == nocache}')
    qw, qe = serve('default-no-in-place', {'LLAMA_MOE_CACHE_READ_IN_PLACE': '0'})
    check('unset without in-place reads: steps aside quietly, the same words', 'READ_AHEAD NOT USED' not in qe and qw == nocache, f'{qw == nocache}')
    check('in-place reads alone: the words of no cache', plain == nocache, f'{plain} vs {nocache}')
    info = []
    for tag, env, cache, ub in (('inline', RA, '72', '512'), ('thread', TH, '72', '512'), ('thread-88', TH, '88', '512'),
                                ('thread-ub2048', TH, '72', '2048')):
        w, e = serve(tag, env, cache=cache, ub=ub)
        n, p = ra(e), ipl(e)
        if tag == 'inline':
            check('it says it is on', 'read ahead on' in e, e[-400:])
        check(f'{tag}: experts sent ahead and used, the same words over 3 rounds', n[0] > 0 and n[2] > 0 and w == nocache and ok(w), f'{n} {w == nocache}')
        info.append(f'{tag}: layers/sent/used/single {n}, in place/uploaded {p[1:]}')
    sw, se = serve('thread-56', TH, cache='56')
    check('a cache too small for two halves: one zone, nothing sent ahead, the same words', ra(se)[0] == 0 and ra(se)[3] > 0 and ipl(se)[0] > 0 and sw == nocache, f'{ra(se)} {sw == nocache}')
    nip, ne = serve('no-in-place', {**RA, 'LLAMA_MOE_CACHE_READ_IN_PLACE': '0'})
    check('without in-place reads: NOT USED, the same words', 'READ_AHEAD NOT USED: it needs in-place' in ne and nip == nocache, f'{nip == nocache}')
    D = {**RA, 'LLAMA_MOE_DRIVE': '1', 'LLAMA_MOE_DRIVE_ALL': '1', 'LLAMA_MOE_RAM_CACHE_MIB': '256'}
    dw, de = serve('drive', D)
    check('next to the drive tier: NOT USED, the same words', 'READ_AHEAD NOT USED: not together with the drive tier' in de and dw == nocache, f'{dw == nocache}')
    for line in info: print('info: ' + line)
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
