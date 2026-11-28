#!/usr/bin/env python3
# Lamplight 0151 test: POST /context changes flash attention, where the chat memory lives (kv_on_card), the guesser and
# the picture reader, and moves whole layers between RAM and a card (card_layers), with the brain kept loaded. Each
# change must give the odds of a server started that way, and moved layers must run on the card. A tiny made-up brain
# runs on a stand-in card on this machine (ggml-rpc-server; build the checkout with GGML_RPC=ON).
# A stand-in card proves the bookkeeping, not speed: speed needs a real card.
#   python3 engine/tests/live-dials.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: live-dials.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='livedials-')
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
import gguf

def make_dense(out, L=8, D=256, H=4, F=512):
    toks = ['<unk>', '<s>', '</s>'] + [f'<0x{i:02X}>' for i in range(256)] + [chr(ord('a') + i % 26) * (1 + i // 26) for i in range(64)]
    w = gguf.GGUFWriter(out, 'llama')
    w.add_name('live-dials-test'); w.add_context_length(2048); w.add_embedding_length(D); w.add_block_count(L)
    w.add_feed_forward_length(F); w.add_head_count(H); w.add_head_count_kv(H); w.add_rope_dimension_count(D // H)
    w.add_layer_norm_rms_eps(1e-5); w.add_file_type(1)
    w.add_tokenizer_model('llama'); w.add_token_list(toks); w.add_token_scores([0.0] * len(toks))
    w.add_token_types([2, 3, 3] + [6] * 256 + [1] * 64); w.add_bos_token_id(1); w.add_eos_token_id(2); w.add_unk_token_id(0)
    rng = np.random.default_rng(0)
    t = lambda name, shape: w.add_tensor(name, (rng.standard_normal(shape) * 0.05).astype(np.float16))
    t('token_embd.weight', (len(toks), D)); w.add_tensor('output_norm.weight', np.ones(D, dtype=np.float32)); t('output.weight', (len(toks), D))
    for i in range(L):
        w.add_tensor(f'blk.{i}.attn_norm.weight', np.ones(D, dtype=np.float32)); w.add_tensor(f'blk.{i}.ffn_norm.weight', np.ones(D, dtype=np.float32))
        for n in ['attn_q', 'attn_k', 'attn_v', 'attn_output']: t(f'blk.{i}.{n}.weight', (D, D))
        t(f'blk.{i}.ffn_gate.weight', (F, D)); t(f'blk.{i}.ffn_up.weight', (F, D)); t(f'blk.{i}.ffn_down.weight', (D, F))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'dense-8.gguf')
if not os.path.exists(brain): make_dense(brain)
RPC = 50270
rpc_log = os.path.join(WORK, 'rpc.log')
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-H', '127.0.0.1', '-p', str(RPC)], stdout=open(rpc_log, 'w'), stderr=subprocess.STDOUT)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def post(port, path, body):
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', json.dumps(body).encode(), {'Content-Type': 'application/json'})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {'http_error': e.code, 'body': e.read().decode(errors='replace')}
def serve(port, ngl, extra=()):
    log = os.path.join(WORK, f'srv-{port}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{RPC}', '-ngl', str(ngl), '--port', str(port),
                          '-c', '1024', '-np', '1', '-t', '2', '--no-repack', *extra], stdout=subprocess.DEVNULL, stderr=open(log, 'w'))
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception: time.sleep(0.1)
    return p, log
def odds(port):
    r = post(port, '/completion', {'prompt': 'aaa bbb ccc ddd eee', 'n_predict': 8, 'temperature': 0, 'cache_prompt': False, 'n_probs': 3})
    return [[round(t['logprob'], 3) for t in p['top_logprobs']] for p in r.get('completion_probabilities', [])] or repr(r)
def close(a, b, tol=2e-3):
    return isinstance(a, list) and isinstance(b, list) and len(a) == len(b) and all(abs(x - y) <= tol for ra, rb in zip(a, b) for x, y in zip(ra, rb))

try:
    # references, each started that way
    ref = {}
    for port, ngl, extra, key in [(8301, 4, ('-fa', 'off'), 'ngl4'), (8302, 99, ('-fa', 'off'), 'ngl99'), (8303, 4, ('-fa', 'on'), 'fa'), (8304, 4, ('-fa', 'off', '-nkvo'), 'nkvo')]:
        p, _ = serve(port, ngl, extra); ref[key] = odds(port); p.terminate(); p.wait()
    p, log = serve(8310, 4, ('-fa', 'off'))
    check('same odds as a fresh server at -ngl 4', close(odds(8310), ref['ngl4']))
    a = post(8310, '/context', {'card_layers': {'layers': []}})
    ram = [r['layer'] for r in a.get('layers_in_ram', [])]
    check('the answer lists the layers in RAM', ram == [0, 1, 2, 3, 4], repr(a)[:300])
    a = post(8310, '/context', {'card_layers': {'layers': ram}})
    check('every RAM layer moved, the brain kept', a.get('brain_kept') is True and len(a.get('card_layers', [])) == 5 and a.get('layers_in_ram') == [], repr(a)[:300])
    check('moved layers: the odds of a server with all layers on the card', close(odds(8310), ref['ngl99']))
    a = post(8310, '/context', {'card_layers': {'layers': []}})
    check('home again: no copy, the -ngl 4 odds back', a.get('card_layers_change', {}).get('mib_up') == 0 and close(odds(8310), ref['ngl4']))
    a = post(8310, '/context', {'card_layers': {'layers': [3, 4, 99]}})
    check('a bad layer moves nothing and says why', 'error' in a.get('card_layers_change', {}) and a.get('card_layers') == [], repr(a)[:300])
    for i in range(20):
        post(8310, '/context', {'card_layers': {'layers': ram}}); post(8310, '/context', {'card_layers': {'layers': []}})
    check('20 round trips: same odds, engine alive', close(odds(8310), ref['ngl4']) and p.poll() is None)
    a = post(8310, '/context', {'flash_attn': 'on'})
    check('flash attention on in place: the -fa on odds, the brain kept', a.get('flash_attn') == 'on' and a.get('brain_kept') is True and close(odds(8310), ref['fa']))
    a = post(8310, '/context', {'flash_attn': 'off', 'kv_on_card': False})
    check('chat memory to RAM in place: the -nkvo odds', a.get('kv_on_card') is False and a.get('brain_kept') is True and close(odds(8310), ref['nkvo']))
    a = post(8310, '/context', {'kv_on_card': True, 'cache_type_v': 'q8_0'})
    check('a squeezed V cache without flash attention is refused before the switch', a.get('http_error') == 400)
    a = post(8310, '/context', {'guesser': False})
    check('guesser off keeps the brain', a.get('guesser') is False and a.get('brain_kept') is True, repr(a)[:300])
    a = post(8310, '/context', {'picture_reader': True})
    check('picture reader asked for on a brain without one: refused', a.get('http_error') == 400)
    # a switch whose new context doesn't fit (here: chat memory far too big) goes back to the old settings with the
    # brain kept, and the layers this request moved go home (v2 canary, Nov 27: it loaded the brain twice and stopped)
    a = post(8310, '/context', {'n_ctx': 20000000, 'card_layers': {'layers': [1, 2, 3, 4]}})
    b = post(8310, '/context', {'card_layers': {'layers': []}})
    check('a switch that does not fit: refused, the brain kept, the engine alive, layers home', a.get('http_error') == 500 and 'layers moved onto the card are home' in a.get('body', '')
          and p.poll() is None and b.get('brain_kept') is True and b.get('card_layers') == [] and b.get('n_ctx') == 1024 and isinstance(odds(8310), list), repr(a)[:200] + repr(b)[:200])
    a = post(8310, '/context', {'card_layers': {'device': 'NoSuchCard', 'layers': [1]}})
    check('an unknown card is refused', a.get('http_error') == 400)
    p.terminate(); p.wait()
    # a separate draft brain with Bob's fit: the guesser goes off and on with the main brain kept (the v4 canary on a
    # real card: the fit wasn't kept with a draft brain, so turning the guesser off loaded the 35B again)
    log = os.path.join(WORK, 'srv-8320.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '-md', brain, '--spec-type', 'draft-simple', '--rpc', f'127.0.0.1:{RPC}',
                          '--fit', 'on', '--port', '8320', '-c', '1024', '-np', '1', '-t', '2', '--no-repack'], stdout=subprocess.DEVNULL, stderr=open(log, 'w'))
    for _ in range(600):
        try:
            if b'ok' in urllib.request.urlopen('http://127.0.0.1:8320/health', timeout=1).read(): break
        except Exception: pass
        time.sleep(0.1)
    res = [post(8320, '/context', {'guesser': g}) for g in (False, True, False, True)]
    check('a draft brain under the fit: the guesser off and on live, the main brain kept each time',
          [(r.get('guesser'), r.get('brain_kept')) for r in res] == [(False, True), (True, True), (False, True), (True, True)], repr(res)[:300])
    p.terminate(); p.wait()
finally:
    rpc.terminate()
print('all passed' if not fails else f'{fails} failed')
sys.exit(1 if fails else 0)
