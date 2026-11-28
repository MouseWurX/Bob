#!/usr/bin/env python3
# Brain Engine 0069 test: long reads use the cached experts in place (on unless LLAMA_MOE_CACHE_READ_IN_PLACE=0). A batch
# of more than 32 tokens reads through the slot map: hits in their slots, misses uploaded into a zone of the coldest
# slots, whose experts go back before the first written word. Stand-in card (ggml-rpc-server, GGML_RPC_TEST_OFFLOAD=1 so
# it takes big expert products from RAM as a real card does). It checks that:
#   - it is on by default and says so, reads hits in place, uploads misses, puts the zone's experts back
#   - the same words as with it off and as without the cache, over two long prompts with writing between them
#   - the same with the RAM cache (drive tier on, every expert through it) and with bigger steps
#   - the card's working memory for the step is smaller than with it off (no copy of a layer's experts)
#   - =0 turns it off; next to stream ahead it says NOT USED; a cache with fewer slots than a layer has experts reads as before
#   python3 engine/tests/moe-read-in-place.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-read-in-place.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='inplace-')
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
RPORT = 50321
rpc_bin = os.path.join(BIN, 'ggml-rpc-server') if os.path.exists(os.path.join(BIN, 'ggml-rpc-server')) else os.path.join(BIN, 'rpc-server')
rpc = subprocess.Popen([rpc_bin, '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub='512', b='2048', cache='40', port=50322):
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
def ipl(err):
    m = re.findall(r'in-place long reads: (\d+) reads, (\d+) experts read where they sit, (\d+) uploaded \(([\d.]+) MiB\), zone up to (\d+) slots, (\d+) experts put back', err)
    return tuple(int(m[-1][k]) for k in (0, 1, 2, 4, 5)) if m else (0, 0, 0, 0, 0)
def cbuf(err):
    m = re.findall(r'RPC0\[[^\]]*\] compute buffer size = +([\d.]+) MiB', err) or re.findall(r'RPC[^ ]* compute buffer size = +([\d.]+) MiB', err)
    return float(m[-1]) if m else -1.0
OFF = {'LLAMA_MOE_CACHE_READ_IN_PLACE': '0'}
D = {'LLAMA_MOE_DRIVE': '1', 'LLAMA_MOE_DRIVE_ALL': '1', 'LLAMA_MOE_RAM_CACHE_MIB': '256'}
ok = lambda w: len(w) == 2 and not any(x.startswith('ERROR') for x in w)
try:
    nocache, _ = serve('nocache', {}, cache='')
    check('without the cache it answers', ok(nocache), f'{nocache}')
    off, oerr = serve('off', OFF)
    check('=0: off, and says so', 'READ_IN_PLACE=0' in oerr and ipl(oerr)[0] == 0, oerr[-300:])
    check('=0: the same words as without the cache', off == nocache, f'{off} vs {nocache}')
    on, err = serve('on', {})
    n = ipl(err)
    check('on by default and says so', 'use the cached experts in place' in err, err[-400:])
    check('long reads read hits in place and upload misses', n[0] >= 2 and n[1] > 0 and n[2] > 0, f'{n}')
    st = re.search(r"long reads' stops: (\d+) layer stops, the card waited for the host ([\d.]+) ms .*?of ([\d.]+) ms read\), uploads queued in line ([\d.]+) ms", err)
    check('0110: the stop meter counts a stop for each cached layer of each read, inside the read\'s time',
          st is not None and int(st.group(1)) >= n[0] and float(st.group(2)) < float(st.group(3)) and float(st.group(4)) > 0, st.group(0) if st else err[-300:])
    check('the zone\'s experts go back before writing', n[3] > 0 and n[4] > 0, f'{n}')
    check('the same words as with it off and without the cache', on == off == nocache and ok(on), f'{on} vs {off}')
    con, coff = cbuf(err), cbuf(oerr)
    check('the step\'s card working memory is smaller than with it off', 0 < con < coff, f'{con} vs {coff} MiB')
    ram, rerr = serve('on-ram', D)
    check('with the RAM cache: on, the same words', ipl(rerr)[0] >= 2 and ram == nocache, f'{ipl(rerr)} {ram} vs {nocache}')
    big, berr = serve('on-ub2048', {}, ub='2048')
    bo, _ = serve('off-ub2048', OFF, ub='2048')
    check('a 2048-token step: on, the same words as off', ipl(berr)[0] >= 2 and big == bo and ok(big), f'{ipl(berr)} {big} vs {bo}')
    sa, saerr = serve('next-to-ahead', {'LLAMA_MOE_STREAM_AHEAD': '1'})
    check('next to stream ahead: NOT USED, the same words', 'in-place long reads NOT USED' in saerr and ipl(saerr)[0] == 0 and sa == nocache, f'{sa}')
    sm, smerr = serve('small-cache', {}, cache='16')
    check('a cache smaller than a layer reads as before, the same words', ipl(smerr)[0] == 0 and sm == nocache, f'{ipl(smerr)} {sm}')
    print(f'info: reads / in place / uploaded / zone / put back: {n}; step working memory {con} vs {coff} MiB (off)')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
