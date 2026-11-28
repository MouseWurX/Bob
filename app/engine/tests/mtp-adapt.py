#!/usr/bin/env python3
# Lamplight 0162 test: with LLAMA_MTP_ADAPT=1, the MTP guess's length is chosen word by word (keep guess j while the
# chance it is kept pays for checking it). A tiny qwen35moe brain from test-llama-archs gets one MTP block (as in
# ctx-change-mtp.py); its head is random, so its guesses are rarely kept and the rule should guess far shorter than n_max.
# Same words in every case: only how many guesses are checked changes.
#   python3 lamplight/tests/mtp-adapt.py <llama.cpp checkout, built with LLAMA_BUILD_TESTS=ON> [work folder] [bin folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: mtp-adapt.py <llama.cpp checkout, built> [work folder] [bin folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='mtp-adapt-')
BIN = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else os.path.join(SRC, 'build', 'bin')
ARCHS = os.path.join(BIN, 'test-llama-archs')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
import gguf
os.makedirs(WORK, exist_ok=True)

def add_mtp(src, dst):
    r = gguf.GGUFReader(src)
    arch = 'qwen35moe'
    n_layer = int(r.fields[f'{arch}.block_count'].contents())
    n_embd = int(r.fields[f'{arch}.embedding_length'].contents())
    w = gguf.GGUFWriter(dst, arch)
    for k, f in r.fields.items():
        if k.startswith('GGUF.') or k == 'general.architecture':
            continue
        t = f.types[0]
        if k == f'{arch}.block_count':
            w.add_uint32(k, n_layer + 1); continue
        if k == f'{arch}.nextn_predict_layers':
            w.add_uint32(k, 1); continue
        sub = f.types[-1] if t == gguf.GGUFValueType.ARRAY else None
        v = f.contents()
        if sub is not None and len(v) == 0:
            continue
        if sub is not None and k.endswith('recurrent_layers') and len(v) == n_layer:
            v = v + [0]  # the MTP block is a full attention block
        w.add_key_value(k, v, t, sub_type=sub)
    last = f'blk.{n_layer - 1}.'
    def put(name, t):
        w.add_tensor(name, np.array(t.data), raw_shape=list(reversed([int(x) for x in t.shape])), raw_dtype=t.tensor_type)
    for t in r.tensors:
        put(t.name, t)
    for t in r.tensors:  # the MTP block copies the last (full attention) block
        if t.name.startswith(last) and not t.name.endswith(('.scale', '.input_scale')):   # the MTP block takes no scales
            put(f'blk.{n_layer}.' + t.name[len(last):], t)
    rng = np.random.default_rng(7)
    L = f'blk.{n_layer}.nextn.'
    w.add_tensor(L + 'eh_proj.weight', (rng.standard_normal((n_embd, 2 * n_embd)) * 0.05).astype(np.float32))
    w.add_tensor(L + 'enorm.weight', np.ones(n_embd, np.float32))
    w.add_tensor(L + 'hnorm.weight', np.ones(n_embd, np.float32))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

brain = os.path.join(WORK, 'qwen35moe-mtp.gguf')
if not os.path.exists(brain):
    subprocess.check_call([ARCHS, '-a', 'qwen35moe', '-s', '4', '-o', WORK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    add_mtp(os.path.join(WORK, 'qwen35moe-moe.gguf'), brain)

fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(port, env, spec):
    log = os.path.join(WORK, f'server-{port}.txt')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--port', str(port), '-c', '2048', '-np', '1', '-t', '2', *spec],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, **env})
    res = []
    try:
        for _ in range(150):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1); break
            except Exception:
                time.sleep(0.3)
        for i in range(2):
            body = json.dumps({'prompt': ' '.join(f'word{(i * 7 + j) % 40}' for j in range(30)), 'n_predict': 400, 'temperature': 0, 'cache_prompt': False})
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body.encode(), headers={'Content-Type': 'application/json'})
            r = json.load(urllib.request.urlopen(req, timeout=600))
            t = r.get('timings', {})
            res.append({'words': r['content'], 'n': t.get('predicted_n'), 'tps': t.get('predicted_per_second'),
                        'drafts': t.get('draft_n') or 0, 'kept': t.get('draft_n_accepted') or 0})
    finally:
        p.terminate(); p.wait()
    return res, open(log, encoding='utf-8', errors='replace').read()

MTP = ['--spec-type', 'draft-mtp', '--spec-draft-n-max', '8', '--spec-draft-p-min', '0']
plain, _ = serve(50471, {}, ['--spec-type', 'none'])
off, log_off = serve(50472, {}, MTP)
on, log_on = serve(50473, {'LLAMA_MTP_ADAPT': '1', 'LLAMA_MTP_ADAPT_LOG': '1'}, MTP)
check('off: MTP guesses, no 0162 line', off[0]['drafts'] > 50 and 'Lamplight 0162' not in log_off, f"{off[0]['drafts']} guesses")
check('on: it says so', 'Lamplight 0162: guess length chosen word by word, up to 8 guesses' in log_on)
check('on: it still guesses (the first guess is always kept)', on[0]['drafts'] > 20, f"{on[0]['drafts']}")
check('on: rarely kept guesses are cut far shorter than n_max', on[0]['drafts'] < off[0]['drafts'] / 2 and on[1]['drafts'] < off[1]['drafts'] / 2,
      f"{[o['drafts'] for o in on]} vs {[o['drafts'] for o in off]}")
check('on: it learns a round cost and logs it', len(re.findall(r'mtp adapt \d+: round [0-9.]+ \+ [0-9.]+ ms a guess', log_on)) >= 1)
check('the words are the same as without guessing, both ways', all(x['words'] == p['words'] for x, p in zip(off, plain)) and all(x['words'] == p['words'] for x, p in zip(on, plain)))
check('the rule leaves the second reply its own rates (both replies guess)', on[1]['drafts'] > 20)
print(f"info: guesses made/kept off {[(o['drafts'], o['kept']) for o in off]}, on {[(o['drafts'], o['kept']) for o in on]}")
print(f"info: words/s plain {[round(o['tps'] or 0) for o in plain]}, off {[round(o['tps'] or 0) for o in off]}, on {[round(o['tps'] or 0) for o in on]} (a processor stand-in, not a speed result)")
for l in re.findall(r'mtp adapt [^\n]*', log_on)[:3]: print('info:', l)
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
