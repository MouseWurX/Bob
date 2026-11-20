#!/usr/bin/env python3
# Brain Engine 0042 test: the doorbell (LLAMA_MOE_DOORBELL=1 with --moe-cache-cpu-share above 0). While writing with a
# full cache, the card looks up its slots in a mirror of the slot map and rings; the cache's own thread computes the
# misses on the processor and answers; the card adds the two once a layer. With learning off the words, the cache's
# counts and its trace must be the same as without it. The cache needs a card, so a stand-in card runs on this machine
# (ggml-rpc-server; build the checkout with GGML_RPC=ON). The stand-in can't ring the doorbell itself, so the test uses
# the processor's own ring (LLAMA_MOE_DOORBELL_CPU_RING=1); the card's ring (CUDA kernels) and the speed can only be
# seen on a real NVIDIA card.
#   python3 engine/tests/moe-doorbell.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder] [bin folder of the build before 0042]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-doorbell.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='doorbell-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
OLD = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else None
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('def make_moe'):src.index("MODEL = ")])
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-k2.gguf')
if not os.path.exists(brain): make_moe(brain)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f: f.write(' '.join(f'word{i}' for i in range(250)))
PORT = 50234
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
# the machine's own settings stay out: every run says what it wants
BASE_ENV = {k: v for k, v in os.environ.items() if not k.startswith('LLAMA_MOE_')}
RING = {'LLAMA_MOE_DOORBELL': '1', 'LLAMA_MOE_DOORBELL_CPU_RING': '1'}
def run(env, share='1', trace=None, bin_dir=None):
    e = {**BASE_ENV, 'LLAMA_MOE_CACHE_LOG_EVERY': '1000000', **env}
    if trace: e['LLAMA_MOE_CACHE_TRACE'] = trace
    if bin_dir: e['LD_LIBRARY_PATH'] = bin_dir  # its own libraries, not this build's
    r = subprocess.run([os.path.join(bin_dir or BIN, 'llama-completion'), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--n-cpu-moe', '4',
                        '--moe-cache-mib', '1', '--moe-cache-cpu-share', share, '-f', prompt, '-n', '64', '-c', '2048', '-no-cnv',
                        '--temp', '0', '-t', '2', '-lv', '4'],
                       capture_output=True, text=True, errors='replace', env=e, timeout=300)
    hits = re.findall(r'ubatch <= 8: hits = (\d+), misses = (\d+)', r.stderr)
    bell = re.findall(r'doorbell: (\d+) rings, (\d+) with processor work, (\d+) misses brought in a word later', r.stderr)
    learned = re.findall(r'learned while writing: (\d+) experts', r.stderr)
    return {'code': r.returncode, 'out': r.stdout, 'err': r.stderr,
            'hits': (tuple(map(int, hits[-1])) if hits else None),
            'bell': (tuple(map(int, bell[-1])) if bell else (-1, -1, -1)),
            'learned': (int(learned[-1]) if learned else -1)}
def read(p):
    with open(p, 'rb') as f: return f.read()
try:
    t_off, t_on = os.path.join(WORK, 'off.trace'), os.path.join(WORK, 'on.trace')
    off = run({}, trace=t_off)
    check('the cache answers without the doorbell (share 1)', off['code'] == 0 and off['hits'] is not None, off['err'][-300:])
    if OLD:
        old = run({}, bin_dir=OLD)
        check('off: the same words and counts as the build before 0042', old['code'] == 0 and old['out'] == off['out'] and old['hits'] == off['hits'])
    on = run(RING, trace=t_on)
    check('the doorbell says it is on', 'rings a doorbell while writing' in on['err'], on['err'][-300:])
    rings, rings_cpu, deferred = on['bell']
    check('the layers ring, and the processor answers with misses', rings > 0 and rings_cpu > 0, str(on['bell']))
    check('learning off: the same words as share 1 without it', on['code'] == 0 and on['out'] == off['out'])
    check('learning off: the same hits and misses', on['hits'] == off['hits'], f"{on['hits']} vs {off['hits']}")
    check('learning off: nothing waits for the next word', deferred == 0, str(on['bell']))
    check('the same trace of the picks, byte for byte', read(t_on) == read(t_off), f'{len(read(t_on))} vs {len(read(t_off))} bytes')
    zero = run({'LLAMA_MOE_DOORBELL': '0'})
    check('LLAMA_MOE_DOORBELL=0: the same words and counts as unset, and no doorbell', zero['code'] == 0 and zero['out'] == off['out'] and
          zero['hits'] == off['hits'] and zero['bell'] == (-1, -1, -1) and 'MOE_DOORBELL' not in zero['err'])  # not the bare word: the work folder's name has it
    card = run({'LLAMA_MOE_DOORBELL': '1'})
    check('on a card that can\'t ring it: NOT USED and the old path\'s words', card['code'] == 0 and 'DOORBELL NOT USED' in card['err'] and
          card['out'] == off['out'] and card['hits'] == off['hits'], card['err'][-300:])
    l_off = run({'LLAMA_MOE_CACHE_LEARN': '8'})
    l_on = run({**RING, 'LLAMA_MOE_CACHE_LEARN': '8'})
    check('learning on: experts come in, a word later', l_on['code'] == 0 and l_on['learned'] > 0 and l_on['bell'][2] > 0,
          f"{l_on['learned']} learned, {l_on['bell']}")
    # the stand-in computes the card's and the processor's experts alike, so here even the words stay the same
    check('learning on: the same words on the stand-in card', l_on['out'] == l_off['out'])
    h_off = run({}, share='0.5')
    h_on = run(RING, share='0.5')
    check('share 0.5: misses that would go up go up a word later, same words on the stand-in', h_on['code'] == 0 and h_on['bell'][2] > 0 and
          h_on['out'] == h_off['out'], str(h_on['bell']))
    z_off = run({}, share='0')
    z_on = run(RING, share='0')
    check('share 0: NOT USED and the same words', z_on['code'] == 0 and 'DOORBELL NOT USED' in z_on['err'] and z_on['out'] == z_off['out'])
    t0 = time.time()
    st = run({**RING, 'LLAMA_MOE_DOORBELL_STALL': '1', 'LLAMA_MOE_DOORBELL_TIMEOUT_MS': '300'})
    msg = re.search(r"layer \d+ waited 300 ms for the processor's part of its experts and gave up", st['err'])
    check('a processor that never answers: the card gives up after the timeout with a clear message', st['code'] != 0 and msg is not None and
          time.time() - t0 < 120, st['err'][-400:])
    # the kept picks (the expert trace): with the doorbell the graph keeps its own copy, as for a layer the cache doesn't
    # hold, so the trace matches a run without the cache (the old path with a CPU share gives no trace at all)
    def serve(port, env, cache):
        log = os.path.join(WORK, f'srv-{port}.log')
        extra = ['--moe-cache-mib', '1', '--moe-cache-cpu-share', '1'] if cache else []
        p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--n-cpu-moe', '4',
                              *extra, '--port', str(port), '-c', '2048', '-np', '1', '-t', '2', '-lv', '4'],
                             stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**BASE_ENV, 'LLAMA_MOE_CACHE_LOG_EVERY': '4', **env})
        for _ in range(300):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); return p, log
            except Exception: time.sleep(0.2)
        p.kill(); return None, log
    def traced(port):
        body = {'prompt': ' '.join(f'word{i}' for i in range(40)), 'n_predict': 40, 'temperature': 0, 'cache_prompt': False, 'expert_trace': True}
        r = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        r = json.loads(urllib.request.urlopen(r, timeout=120).read())
        tr = r.get('expert_trace') or {}
        return r.get('content'), [row['e'] for row in tr.get('rows', [])]
    res = {}
    for port, env, cache in ((18460, {}, False), (18461, RING, True)):
        p, log = serve(port, env, cache)
        if p is None:
            res[port] = (None, None, open(log).read()[-300:]); continue
        try:
            traced(port)  # the first answer fills the cache, the second writes with the doorbell
            words, rows = traced(port)
        finally:
            p.kill(); p.wait()
        res[port] = (words, rows, open(log).read())
    (w0, r0, _), (w1, r1, l1) = res[18460], res[18461]
    check('llama-server: the doorbell rings there too', 'rings a doorbell while writing' in (l1 or '') and re.search(r'doorbell: [1-9]\d* rings', l1 or '') is not None, (l1 or '')[-300:])
    check('llama-server: the same words and kept picks (expert trace) as without the cache, token by token', w0 is not None and w1 == w0 and r0 and r1 == r0,
          f'{len(r0 or [])} vs {len(r1 or [])} rows')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
