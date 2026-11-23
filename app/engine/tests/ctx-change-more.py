#!/usr/bin/env python3
# Brain Engine 0017 test: POST /context also changes the reading step (n_batch, n_ubatch), the chat memory type
# (cache_type_k, cache_type_v), the processor share (moe_cache_cpu_share) and the Brain Engine keys read when a context
# is made (engine_keys, for example LLAMA_KV_SPLIT), with the brain kept loaded. Each change must give the words of a
# server started with that setting. A tiny brain runs on a stand-in card on this machine (ggml-rpc-server; build the
# checkout with GGML_RPC=ON), so the chat memory split has a card to use.
#   python3 engine/tests/ctx-change-more.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: ctx-change-more.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='ctxmore-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
# head size 64 so q8_0 chat memory works, and 4,096 cells so the server takes a long prompt (as in kv-split.py)
exec(src[src.index('def make_moe'):src.index("MODEL = ")].replace('HD, FF = 16, 4, 64, 4, 2, 16, 32', 'HD, FF = 16, 4, 64, 4, 2, 64, 32')
     .replace('add_context_length(512)', 'add_context_length(4096)'))
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-hd64-4k.gguf')
if not os.path.exists(brain): make_moe(brain)
PROMPT = ' '.join(f'word{i % 37} x{i % 11}' for i in range(300))  # about 1,440 tokens
RPC = 50260
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPC)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
def serve(port, extra=(), env=None):
    log = os.path.join(WORK, f'srv-{port}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{RPC}', '-ngl', '99', '--port', str(port),
                          '-c', '2048', '-np', '1', '-fa', 'on', '-t', '2', '-lv', '4', *extra],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, **(env or {})})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception: time.sleep(0.1)
    return p, log
def ask(port):
    r = post(port, '/completion', {'prompt': PROMPT, 'n_predict': 40, 'temperature': 0, 'cache_prompt': False})
    return r.get('content', repr(r))
def fresh(extra=(), env=None, port=50261):
    p, _ = serve(port, extra, env)
    try: return ask(port)
    finally: p.terminate(); p.wait(30)
try:
    want = {'base': fresh(), 'ub1024': fresh(('-b', '2048', '-ub', '1024')), 'q8': fresh(('-ctk', 'q8_0', '-ctv', 'q8_0')),
            'split': fresh(env={'LLAMA_KV_SPLIT': '256'})}
    srv, log = serve(50262)
    try:
        check('it answers like a fresh server', ask(50262) == want['base'])
        r = post(50262, '/context', {'n_batch': 2048, 'n_ubatch': 1024})
        check('a new reading step', r.get('n_ubatch') == 1024 and r.get('n_batch') == 2048, f'{r}')
        check('0047: the answer names each card\'s free memory and the MoE cache size', isinstance(r.get('devices'), list) and 'moe_cache_mib' in r and all(d.get('total_mib', 0) >= d.get('free_mib', -1) >= 0 for d in r['devices']), f'{r}')
        check('0047: the log names the free memory after the change', 'context change:' in open(log).read() if r.get('devices') else True)
        check('the new reading step gives the words of a server started with it', ask(50262) == want['ub1024'])
        r = post(50262, '/context', {'n_ubatch': 512, 'cache_type_k': 'q8_0', 'cache_type_v': 'q8_0'})
        check('a new chat memory type', r.get('cache_type_k') == 'q8_0' and r.get('cache_type_v') == 'q8_0', f'{r}')
        check('q8_0 gives the words of a server started with it', ask(50262) == want['q8'])
        r = post(50262, '/context', {'cache_type_k': 'f16', 'cache_type_v': 'f16', 'engine_keys': {'LLAMA_KV_SPLIT': 256}})
        check('a Brain Engine key set', r.get('engine_keys', {}).get('LLAMA_KV_SPLIT') == '256', f'{r}')
        check('the chat memory split gives the words of a server started with it', ask(50262) == want['split'] == want['base'])
        r = post(50262, '/context', {'engine_keys': {'LLAMA_KV_SPLIT': None}})
        check('a Brain Engine key removed', 'LLAMA_KV_SPLIT' not in r.get('engine_keys', {'LLAMA_KV_SPLIT': 1}), f'{r}')
        check('back to the first words', ask(50262) == want['base'])
        r = post(50262, '/context', {'moe_cache_cpu_share': 0.5})
        check('the processor share is taken', r.get('moe_cache_cpu_share') == 0.5, f'{r}')
        before = post(50262, '/context', {'moe_cache_cpu_share': 0})
        for name, body in (('a key that is not a context key', {'engine_keys': {'PATH': '/x'}}),
                           ('a cache type that does not exist', {'cache_type_k': 'q9_9'}),
                           ('a step of 0', {'n_ubatch': 0}),
                           ('a share over 1', {'moe_cache_cpu_share': 2}),
                           ('nothing it knows', {'temperature': 1})):
            r = post(50262, '/context', body)
            check(f'refused: {name}', r.get('http_error') == 400, f'{r}')
        check('the refusals left the settings and the words as they were', ask(50262) == want['base'])
        text = open(log, errors='replace').read()
        check('the brain was kept loaded every time', text.count('brain kept loaded') >= 6 and 'brain loaded again' not in text,
              f"{text.count('brain kept loaded')} kept")
        check('the split came on and went off with the key', text.count('KV split: the first 256') == 1, f"{text.count('KV split: the first 256')}")
    finally:
        srv.terminate(); srv.wait(30)
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
