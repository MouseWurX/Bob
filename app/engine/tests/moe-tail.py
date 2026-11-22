#!/usr/bin/env python3
# Brain Engine 0049 test: the shelf (LLAMA_MOE_CACHE_TAIL=1). The chat memory the chat hasn't reached holds experts
# the MoE cache evicted; misses it holds come back card to card; the chat takes the cells back as it grows. The cache
# needs a card, so a stand-in card runs on this machine (ggml-rpc-server; build with GGML_RPC=ON). It checks that:
#   - it turns on and says how many experts fit; experts go onto the shelf and come back from it
#   - the chat takes cells back as it grows (while reading and while writing) and the shelf forgets what was there
#   - the words are the same as a plain run, over a short read, a longer read and long writing; also with borrowing
#   - it refuses (NOT USED) with two chats at once (-np 2); next to the CPU share and the doorbell it works (0058)
#   python3 engine/tests/moe-tail.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-tail.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='tail-')
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType

def make_moe(out):
    # wide experts, so the cache is big next to the working memory, as on a real brain
    vocab = GGUFReader(os.path.join(SRC, 'models', 'ggml-vocab-qwen2.gguf'))
    E, L, D, H, HKV, HD, FF, used = 32, 4, 256, 4, 2, 64, 512, 4
    w = GGUFWriter(out, 'qwen3moe')
    w.add_context_length(32768); w.add_embedding_length(D); w.add_block_count(L)
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
brain = os.path.join(WORK, 'moe-wide-32k.gguf')
if not os.path.exists(brain): make_moe(brain)
P1 = ' '.join(f'apple{i} river{i % 7}' for i in range(300))
P2 = ' '.join(f'stone{i % 13} cloud{i}' for i in range(900))
RPORT = 50251
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub=64, share='0', np_='1', port=50252):
    log = os.path.join(WORK, f'{tag}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', '4',
                          '--moe-cache-mib', '24', '--moe-cache-cpu-share', share, '-c', '32768', '-np', np_, '-t', '2', '-fa', 'on',
                          '-b', '2048', '-ub', str(ub), '--port', str(port), '-lv', '4', '--no-warmup'],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'),
                         env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '400', **env})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    words = []
    try:
        for prompt, n in ((P1, 40), (P2, 300)):
            body = json.dumps({'prompt': prompt, 'n_predict': n, 'temperature': 0, 'cache_prompt': False, 'ignore_eos': True}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            words.append(json.loads(urllib.request.urlopen(req, timeout=600).read())['content'])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
try:
    tail_env = {'LLAMA_MOE_CACHE_TAIL': '1', 'LLAMA_MOE_CACHE_TAIL_KEEP': '512', 'LLAMA_MOE_CACHE_TAIL_STEP': '512'}
    on, err = serve('tail', tail_env)
    fit = re.findall(r'the shelf: (\d+) experts of', err)
    check('the shelf turns on and says how many experts fit', len(fit) > 0 and int(fit[0]) > 0, err[-600:])
    took = re.findall(r'the chat took cells (\d+) to (\d+) back', err)
    check('the chat takes cells back as it grows', len(took) >= 2, f'{took}')
    check('the chat memory says so too', 'chat memory takes back cells' in err)
    st = re.findall(r'the shelf: (\d+) experts put on it, (\d+) came back from it', err)
    check('experts go onto the shelf and come back from it', len(st) > 0 and int(st[-1][0]) > 0 and int(st[-1][1]) > 0, f'{st}')
    check('both answers came back', len(on) == 2 and not any(w.startswith('ERROR') for w in on), f'{on}')
    plain, _ = serve('plain', {})
    check('the same words as a plain run', on == plain, f'{on} vs {plain}')
    both, berr = serve('tail-borrow', {**tail_env, 'LLAMA_MOE_CACHE_BORROW': '1'})
    plain_big = None
    step = re.findall(r'borrowed reading: reading step (\d+) \(own', berr)
    if step:
        plain_big, _ = serve('plain-big', {}, ub=int(step[-1]))
    check('with borrowed reading too: on, and the words of a plain run at its step', 'the shelf: ' in berr and step and both == plain_big, f'{step} {both} vs {plain_big}')
    _, err2 = serve('tail-np2', tail_env, np_='2')
    check('with -np 2 it says NOT USED', 'LLAMA_MOE_CACHE_TAIL NOT USED' in err2)
    # Brain Engine 0058: next to a processor share, and with the doorbell (the processor's own ring on the stand-in).
    # The shelf moves the same bytes, so the words are those of the same run without it.
    shelf = lambda e: [tuple(map(int, m)) for m in re.findall(r'the shelf: (\d+) experts put on it, (\d+) came back from it', e)]
    sh, err3 = serve('tail-share', tail_env, share='0.5')
    sh_plain, _ = serve('plain-share', {}, share='0.5')
    check('0058: next to the CPU share it is on, used, and the words of a plain run with that share', 'LLAMA_MOE_CACHE_TAIL NOT USED' not in err3 and
          shelf(err3) and shelf(err3)[-1][0] > 0 and sh == sh_plain, f'{shelf(err3)} {sh} vs {sh_plain}')
    ring = {'LLAMA_MOE_DOORBELL': '1', 'LLAMA_MOE_DOORBELL_CPU_RING': '1'}
    db, err4 = serve('tail-share-doorbell', {**tail_env, **ring}, share='0.5')
    db_plain, dperr = serve('doorbell-share', ring, share='0.5')
    rings = re.findall(r'doorbell: (\d+) rings', err4)
    check('0058: with the doorbell too it rings, the shelf is used between words, and the words of the doorbell without the shelf',
          rings and int(rings[-1]) > 0 and shelf(err4) and shelf(err4)[-1][0] > 0 and shelf(err4)[-1][1] > 0 and db == db_plain, f'{rings} {shelf(err4)} {db} vs {db_plain}')
    print(f'info: shelf {fit[:1]}, take-backs {len(took)}, last totals {st[-1:] }')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
