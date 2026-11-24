#!/usr/bin/env python3
# Per-chat engine cache test (Bob's chat places + upstream's RAM prompt cache + Brain Engine 0121's RAM floor), on the
# real llama-server. A chat saved and loaded back must go on with the very same tokens (and odds) as a chat that never
# left the engine, and read only the new part: after a restart, after a switch to another chat (Bob's disk save), and
# through the engine's own RAM cache. A broken file and a file from another memory layout are refused, and the chat is
# read again. 0121: the RAM cache keeps nothing that would push free RAM under the floor, and keeps it with the floor off.
# Two tiny made-up brains: a mixture of experts with attention in every layer, and a Qwen 3.6 shaped one with
# recurrent layers (their state can't be cut back, so this is the case where a wrong restore would show).
#   python3 engine/tests/prompt-cache.py <llama.cpp checkout with the patches, built> [work folder]
# It needs llama-server in <checkout>/build/bin, numpy and the checkout's gguf-py. Real speeds come from the PC.
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: prompt-cache.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='promptcache-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin', 'llama-server.exe' if os.name == 'nt' else 'llama-server')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType

def read(name):
    return open(os.path.join(HERE, name), encoding='utf-8').read().replace('\r\n', '\n')
src = read('experts-per-word.py')
exec(src[src.index('def make_moe'):src.index("MODEL = ")].replace('add_context_length(512)', 'add_context_length(4096)'))
src = read('mask-made.py')
exec(src[src.index('def make_q35'):src.index('os.makedirs(WORK')].replace('add_context_length(512)', 'add_context_length(4096)'))

os.makedirs(WORK, exist_ok=True)
SAVE = os.path.join(WORK, 'places')
os.makedirs(SAVE, exist_ok=True)
brains = {'experts': os.path.join(WORK, 'pc-moe.gguf'), 'qwen3.6': os.path.join(WORK, 'pc-q35.gguf')}
if not os.path.exists(brains['experts']): make_moe(brains['experts'])
if not os.path.exists(brains['qwen3.6']): make_q35(brains['qwen3.6'])
# same shape, other weights: the engine can't tell its saved state from this brain's
other = os.path.join(WORK, 'pc-q35-other.gguf')
if not os.path.exists(other):
    s = read('mask-made.py')
    exec(s[s.index('def make_q35'):s.index('os.makedirs(WORK')].replace('add_context_length(512)', 'add_context_length(4096)').replace('default_rng(3)', 'default_rng(4)').replace('def make_q35', 'def make_q35_other'))
    make_q35_other(other)

fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''), flush=True)
    fails += not ok

PORT = 50311
def start(model, extra=(), env=None, log='srv'):
    lf = open(os.path.join(WORK, f'{log}.log'), 'w')
    p = subprocess.Popen([BIN, '-m', model, '--port', str(PORT), '-c', '4096', '-np', '1', '-t', '2', '--slot-save-path', SAVE, *extra],
                         stdout=subprocess.DEVNULL, stderr=lf, env={**os.environ, **(env or {})})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=1).read(); return p
        except Exception: time.sleep(0.2)
    raise SystemExit('server did not start: ' + open(lf.name).read()[-2000:])
def stop(p):
    p.kill(); p.wait()
def req(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(f'http://127.0.0.1:{PORT}{path}', data=data, headers={'Content-Type': 'application/json'})
    try:
        return json.loads(urllib.request.urlopen(r, timeout=300).read())
    except urllib.error.HTTPError as e:
        try: return {'_status': e.code, **json.loads(e.read())}
        except Exception: return {'_status': e.code}
def gen(prompt, n=48):
    r = req('/completion', {'prompt': prompt, 'n_predict': n, 'temperature': 0, 'n_probs': 3, 'cache_prompt': True, 'return_tokens': True})
    odds = [[round(t['logprob'], 5) for t in x['top_logprobs']] for x in r['completion_probabilities']]
    return {'tokens': r['tokens'], 'odds': odds, 'read': r['timings']['prompt_n']}
def same(a, b):
    return a['tokens'] == b['tokens'] and a['odds'] == b['odds']
def slot(action, name):
    return req(f'/slots/0?action={action}', {'filename': name})

rng = np.random.default_rng(7)
def words(n):  # token ids of plain words, so every brain reads them the same
    return [int(x) for x in rng.integers(300, 20000, n)]
A = words(1500); B = words(1200); Q = words(40)

for name, model in brains.items():
    print(f'--- {name}', flush=True)
    # the reference: chat A, then its next turn, never leaving the engine
    p = start(model, log=f'{name}-ref')
    a1 = gen(A)
    a2_prompt = A + a1['tokens'] + Q
    ref = gen(a2_prompt)
    stop(p)
    check(f'{name}: the next turn reads only the new part when the chat stays', ref['read'] <= len(a1['tokens']) + len(Q) + 1, f"read {ref['read']}")
    # a fresh engine reading the whole thing (for the "read again" cases)
    p = start(model, log=f'{name}-cold')
    cold = gen(a2_prompt)
    stop(p)
    check(f'{name}: a fresh engine reads the whole chat', cold['read'] == len(a2_prompt), f"read {cold['read']}")
    print(f'INFO {name}: a chat read again from the start gives the same tokens as one that stayed: {same(cold, ref)}')

    # 1. saved to disk, engine restarted, loaded back
    p = start(model, log=f'{name}-save')
    gen(A)
    r = slot('save', 'a.bin')
    stop(p)
    check(f'{name}: the chat is saved', r.get('n_saved', 0) > 0 and os.path.getsize(os.path.join(SAVE, 'a.bin')) > 0, json.dumps(r)[:200])
    p = start(model, log=f'{name}-restore')
    r = slot('restore', 'a.bin')
    check(f'{name}: it loads back into a new engine', r.get('n_restored', 0) > 0, json.dumps(r)[:200])
    got = gen(a2_prompt)
    check(f'{name}: after a restart the next turn has the same tokens and odds', same(got, ref))
    check(f'{name}: after a restart only the new part is read', got['read'] == ref['read'], f"read {got['read']} vs {ref['read']}")

    # 2. Bob's switch: A saved, B read, A loaded back
    stop(p)
    p = start(model, log=f'{name}-switch')
    gen(A); slot('save', 'a2.bin'); gen(B); slot('restore', 'a2.bin')
    got = gen(a2_prompt)
    check(f'{name}: switching chats and back gives the same tokens', same(got, ref))
    check(f'{name}: switching back reads only the new part', got['read'] == ref['read'], f"read {got['read']}")
    stop(p)

    # 3. the engine's own RAM cache, no disk
    p = start(model, log=f'{name}-ram')
    gen(A); gen(B)
    got = gen(a2_prompt)
    stop(p)
    check(f'{name}: the RAM cache brings chat A back with the same tokens', same(got, ref))
    check(f'{name}: the RAM cache reads only the new part', got['read'] == ref['read'], f"read {got['read']}")

    # 4. 0121: free RAM pretended under the floor, so the RAM cache keeps nothing and the chat is read again
    p = start(model, env={'LLAMA_PROMPT_CACHE_TEST_AVAIL_MIB': '300'}, log=f'{name}-floor')
    gen(A); gen(B)
    got = gen(a2_prompt)
    stop(p)
    logtxt = open(os.path.join(WORK, f'{name}-floor.log'), errors='replace').read()
    check(f'{name}: 0121 keeps nothing under the RAM floor', 'under the floor' in logtxt and got['read'] == len(a2_prompt), f"read {got['read']}")
    check(f'{name}: 0121 read again gives the fresh engine\'s tokens', same(got, cold))
    # well over the floor: kept as before
    p = start(model, env={'LLAMA_PROMPT_CACHE_TEST_AVAIL_MIB': '100000'}, log=f'{name}-floor-room')
    gen(A); gen(B)
    got = gen(a2_prompt)
    stop(p)
    check(f'{name}: 0121 keeps the chat with room over the floor', same(got, ref) and got['read'] == ref['read'], f"read {got['read']}")
    # floor off: kept even when free RAM looks low
    p = start(model, env={'LLAMA_PROMPT_CACHE_TEST_AVAIL_MIB': '300', 'LLAMA_MOE_RAM_FLOOR_MIB': '0'}, log=f'{name}-floor-off')
    gen(A); gen(B)
    got = gen(a2_prompt)
    stop(p)
    check(f'{name}: 0121 with the floor off keeps it as upstream does', same(got, ref) and got['read'] == ref['read'], f"read {got['read']}")

    # 5. a file cut short (a crash in the middle of a save) is refused; the chat is read again, same as a fresh engine
    full = open(os.path.join(SAVE, 'a.bin'), 'rb').read()
    open(os.path.join(SAVE, 'cut.bin'), 'wb').write(full[:len(full) // 2])
    p = start(model, log=f'{name}-cut')
    r = slot('restore', 'cut.bin')
    check(f'{name}: a file cut short is refused', r.get('_status', 200) >= 400 or r.get('n_restored', 0) == 0, json.dumps(r)[:200])
    got = gen(a2_prompt)
    stop(p)
    check(f'{name}: after a refused file the chat is read whole, with a fresh engine\'s tokens', got['read'] == len(a2_prompt) and same(got, cold), f"read {got['read']}")

    # 6. another chat-memory type (f32 keys) refuses a file saved with f16 keys
    p = start(model, extra=('-ctk', 'f32'), log=f'{name}-f32')
    r = slot('restore', 'a.bin')
    stop(p)
    check(f'{name}: a file from another chat-memory type is refused', r.get('_status', 200) >= 400 or r.get('n_restored', 0) == 0, json.dumps(r)[:200])

# 7. why Bob keys each file: a brain of the same shape with other weights takes the file without a word
p = start(other, log='other')
r = slot('restore', 'a.bin')  # the qwen3.6 brain's file
stop(p)
print(f"INFO a same-shaped brain with other weights takes the file: {r.get('n_restored', 0) > 0} (so Bob's file key must name the brain file and the engine)")

shutil.rmtree(SAVE, ignore_errors=True)
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
