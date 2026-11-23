#!/usr/bin/env python3
# Brain Engine 0059 test: stream ahead (LLAMA_MOE_STREAM_AHEAD=1). On a long read, while one expert weight of a layer
# computes, the layer's other expert weights go up on a second stream into a landing zone (only the picked experts the
# cache doesn't hold), and are copied from there card to card. The card is a stand-in on this machine (ggml-rpc-server;
# build the checkout with GGML_RPC=ON): GGML_RPC_TEST_OFFLOAD=1 makes it take big expert products from RAM as a real card
# does, and the same steps run in line (the thread that queues them runs only with pinned memory). It checks that:
#   - it turns on, sends experts ahead and uses them, with the same words as a plain run
#   - the same with the MoE cache off, next to the pinned ring (0057) and next to borrowed reading (0048)
#   - a 1 MiB landing zone fills (the rest go up as before) with the same words
#   - next to 0019's prefetch it says NOT USED and answers as that run
#   python3 engine/tests/moe-stream-ahead.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-stream-ahead.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='ahead-')
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
RPORT = 50271
rpc_bin = os.path.join(BIN, 'ggml-rpc-server') if os.path.exists(os.path.join(BIN, 'ggml-rpc-server')) else os.path.join(BIN, 'rpc-server')
rpc = subprocess.Popen([rpc_bin, '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub='512', b='2048', cache='24', port=50272):
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
def ahead(err):
    m = re.findall(r'llama_stream_ahead: (\d+) experts \(([\d.]+) MiB\) sent ahead on the second stream, (\d+) used \(([\d.]+) MiB\) in (\d+) layers, (\d+) times the landing zone was full', err)
    return tuple(int(m[-1][k]) for k in (0, 2, 4, 5)) if m else (0, 0, 0, 0)
ON = {'LLAMA_MOE_STREAM_AHEAD': '1'}
ok = lambda w: len(w) == 2 and not any(x.startswith('ERROR') for x in w)
try:
    plain, _ = serve('plain', {})
    check('a plain run answers', ok(plain), f'{plain}')
    on, err = serve('ahead', ON)
    a = ahead(err)
    check('it turns on (queued in line on the stand-in)', 'llama_stream_ahead: on' in err and 'queued in line' in err, err[-400:])
    check('experts are sent ahead and used', a[0] > 0 and a[1] > 0 and a[2] > 0, f'{a}')
    check('the same words as a plain run', on == plain, f'{on} vs {plain}')
    pn, _ = serve('plain-nocache', {}, cache='')
    nc, ncerr = serve('ahead-nocache', ON, cache='')
    check('without the MoE cache: used, the same words', ahead(ncerr)[1] > 0 and nc == pn and ok(nc), f'{ahead(ncerr)} {nc} vs {pn}')
    rg, rgerr = serve('ahead-ring', {**ON, 'LLAMA_MOE_PINNED_UPLOAD': '1', 'LLAMA_MOE_PINNED_UPLOAD_TEST': '1'})
    check('next to the pinned ring (0057), both through plain memory in test mode: used, the same words',
          ahead(rgerr)[1] > 0 and 'llama_stream_ahead ring: long reads upload' in rgerr and rg == plain, f'{ahead(rgerr)} {rg} vs {plain}')
    sm, smerr = serve('ahead-1mib', {**ON, 'LLAMA_MOE_STREAM_AHEAD_MIB': '1'})
    check('a 1 MiB landing zone fills, the rest go up as before, the same words', ahead(smerr)[3] > 0 and ahead(smerr)[1] > 0 and sm == plain, f'{ahead(smerr)} {sm} vs {plain}')
    bw, _ = serve('borrow', {'LLAMA_MOE_CACHE_BORROW': '1'}, ub='64')
    bwa, bwaerr = serve('borrow-ahead', {**ON, 'LLAMA_MOE_CACHE_BORROW': '1'}, ub='64')
    check('next to borrowed reading: used, that run\'s words', ahead(bwaerr)[1] > 0 and bwa == bw and ok(bwa), f'{ahead(bwaerr)} {bwa} vs {bw}')
    pf, _ = serve('prefetch', {'LLAMA_PREFETCH_EXPERTS': '1'})
    pfa, pfaerr = serve('prefetch-ahead', {**ON, 'LLAMA_PREFETCH_EXPERTS': '1'})
    check('next to 0019 it says NOT USED and answers as that run', 'stream ahead NOT USED' in pfaerr and pfa == pf, f'{pfa} vs {pf}')
    print(f'info: sent ahead / used / layers / full: {a}; 1 MiB zone {ahead(smerr)}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
