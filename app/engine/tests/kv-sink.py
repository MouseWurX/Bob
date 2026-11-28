#!/usr/bin/env python3
# Brain Engine 0122 test: the sharp start (LLAMA_KV_SINK), off unless set. Progressive Memory (0039) keeps the chat's
# first tokens again at a sharp type, at slot = position, as its sharpest step, with or without LLAMA_KV_TIERS rings.
# The checks that can see a fault: an f16 sharp start that holds the whole chat must give f16's tokens over a q3_0
# cache; a sharp start of the cache's own type must give the plain cache's tokens; a loaded chat (nothing sharp kept)
# must still answer. Drift on the random brain must not grow. Real numbers come from the PC.
#   python3 engine/tests/kv-sink.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
# It needs llama-completion, llama-perplexity and ggml-rpc-server in <checkout>/build/bin.
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: kv-sink.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='kvsink-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
# head size 64, so the chat memory is rotated and quantized as on a real brain, and 4,096 cells (as kv-tiers.py)
exec(src[src.index('def make_moe'):src.index("MODEL = ")].replace('HD, FF = 16, 4, 64, 4, 2, 16, 32', 'HD, FF = 16, 4, 64, 4, 2, 64, 32')
     .replace('add_context_length(512)', 'add_context_length(4096)'))
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-hd64-4k.gguf')
if not os.path.exists(brain): make_moe(brain)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f: f.write(' '.join(f'word{i % 37} x{i % 11}' for i in range(300)))
text = os.path.join(WORK, 'kld.txt')
with open(text, 'w') as f:
    rng = np.random.default_rng(1)
    f.write(' '.join(f'word{int(a)} x{int(b)}' for a, b in zip(rng.integers(0, 37, 3000), rng.integers(0, 11, 3000))))
PORT = 50243
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def clean_env(sink=None, tiers=None, env=None):
    e = {**os.environ, **(env or {})}
    for k in ('LLAMA_KV_TIERS', 'LLAMA_KV_SINK'): e.pop(k, None)
    if sink: e['LLAMA_KV_SINK'] = sink
    if tiers: e['LLAMA_KV_TIERS'] = tiers
    return e
def run(k, v, sink=None, tiers=None, card=False, extra=(), env=None, n=48):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, *(('--rpc', f'127.0.0.1:{PORT}', '-ngl', '99') if card else ('-ngl', '0')),
                        '-f', prompt, '-n', str(n), '-c', '2048', '-b', '512', '-ub', '512', '-fa', 'on', '-ctk', k, '-ctv', v,
                        '-no-cnv', '--temp', '0', '-t', '2', '-lv', '4', *extra],
                       capture_output=True, text=True, errors='replace', env=clean_env(sink, tiers, env), timeout=600)
    return r.returncode, r.stdout, r.stderr
def kld(kv, sink=None, tiers=None):
    r = subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-fa', 'on', '-t', '2',
                        '-ctk', kv, '-ctv', kv, '--kl-divergence-base', os.path.join(WORK, 'base.kld'), '--kl-divergence'],
                       capture_output=True, text=True, errors='replace', env=clean_env(sink, tiers), timeout=900)
    m = re.search(r'Mean +KLD: +([0-9.]+)', r.stdout + r.stderr)
    return (float(m.group(1)) if m else None), r.stdout + r.stderr
# as in kv-tiers.py: the exact checks turn the rotation off (rotated numbers rounded to f16 differ by a hair, and the
# random brain has near-ties a hair flips); it changes nothing for f16
NOROT = {'LLAMA_ATTN_ROT_DISABLE': '1'}
try:
    code, f16, err = run('f16', 'f16')
    check('f16 answers', code == 0, err[-300:])
    code, q3, err = run('q3_0', 'q3_0')
    check('q3_0 answers, and its tokens differ from f16 (else the checks below see nothing)', code == 0 and q3 != f16, err[-300:])
    # an f16 sharp start bigger than the whole chat (about 700 tokens): every token is read sharp
    code, a, err = run('q3_0', 'q3_0', 'f16:1792', env=NOROT)
    check('the sharp start says what it keeps', 'again at f16 for the first 1792 (the sharp start, LLAMA_KV_SINK)' in err, err[-400:])
    check('reading uses the overlay and writing the merge', 'laid over the cache' in err and 'merged' in err, err[-400:])
    check('an f16 sharp start holding the whole chat gives f16\'s tokens over a q3_0 cache', code == 0 and a == f16, err[-300:])
    code, b, err = run('q3_0', 'q3_0', 'f16:1792', card=True, env=NOROT)
    check('the same on the stand-in card', code == 0 and b == f16, err[-300:])
    # a sharp start of the cache's own type: the merge and the overlay change nothing
    code, c, err = run('q8_0', 'q8_0')
    code2, d, err2 = run('q8_0', 'q8_0', 'q8_0:128')
    check('a q8_0 sharp start over a q8_0 cache gives the plain tokens (the merge is exact)', code2 == 0 and c == d, err2[-300:])
    # with rings: a 128-token sharp start and an f16 ring holding the whole chat still give f16
    code, e1, err = run('q3_0', 'q3_0', 'f16:128', 'f16:1536', env=NOROT)
    check('sharp start + ring: listed sharpest first', 'f16 for the first 128 (the sharp start, LLAMA_KV_SINK), f16 for the newest 1536' in err, err[-400:])
    check('sharp start + an f16 ring holding the whole chat gives f16\'s tokens', code == 0 and e1 == f16, err[-300:])
    # a short sharp start under a chat that runs well past it, with a q8_0 ring: answers, the same on the card
    code, e3, err = run('q3_0', 'q3_0', 'f16:128', 'q8_0:256')
    code2, e4, err2 = run('q3_0', 'q3_0', 'f16:128', 'q8_0:256', card=True)
    check('sharp start 128 + q8_0 ring 256 over q3_0 answers', code == 0 and len(e3) > len(open(prompt).read()), err[-300:])
    check('sharp start + ring: the same tokens on the stand-in card', code2 == 0 and e3 == e4, err2[-300:])
    code, e5, err = run('q3_0', 'q3_0', 'f16:128')
    code2, e6, err2 = run('q3_0', 'q3_0', 'f16:128', card=True)
    check('sharp start alone (no rings) answers, the same on the card', code == 0 and code2 == 0 and e5 == e6, (err + err2)[-300:])
    # a batch bigger than the slack reads the main cache; writing reads the sharp start again
    code, g, err = run('q3_0', 'q3_0', 'f16:1792', env={'LLAMA_KV_TIERS_SLACK': '256'})
    check('a batch bigger than the slack reads the main cache, then writing is sharp again', code == 0 and 'bigger than LLAMA_KV_TIERS_SLACK' in err, err[-400:])
    # a loaded chat: nothing sharp is kept for its start (the overlay lays only the batch's newest token), and it answers
    cache = os.path.join(WORK, 'chat.bin')
    if os.path.exists(cache): os.remove(cache)
    code, h1, err = run('q3_0', 'q3_0', 'f16:128', extra=('--prompt-cache', cache), n=8)
    code2, h2, err2 = run('q3_0', 'q3_0', 'f16:128', extra=('--prompt-cache', cache), n=8)
    check('a saved then loaded chat answers with the sharp start set (nothing sharp for its start)', code == 0 and code2 == 0 and os.path.exists(cache) and len(h2) > 0, (err + err2)[-400:])
    # refusals
    for why, sink, args, want in (('a bad value', 'f16:8', ('-fa', 'on', '-c', '2048'), 'type:tokens, 16 to 4096'),
                                  ('no flash attention', 'f16:128', ('-fa', 'off', '-ctk', 'f16', '-ctv', 'f16', '-c', '2048'), 'it needs flash attention'),
                                  ('two chats', 'f16:128', ('-fa', 'on', '-np', '2', '-c', '4096'), 'one chat at a time'),
                                  ('as big as the context', 'f16:2048', ('-fa', 'on', '-c', '2048'), 'not bigger than the biggest window')):
        r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, '-ngl', '0', '-f', prompt, '-n', '4', '-no-cnv', '--temp', '0', '-t', '2', *args],
                           capture_output=True, text=True, errors='replace', env=clean_env(sink), timeout=600)
        check(f'NOT USED, and says why: {why}', 'LLAMA_KV_SINK=' in r.stderr and 'NOT USED' in r.stderr and want in r.stderr and 'LLAMA_KV_TIERS=' not in r.stderr and r.returncode == 0, r.stderr[-300:])
    # the rotation knob: a bad size is refused and named, the whole head runs
    code, _, err = run('q3_0', 'q3_0', env={'LLAMA_ATTN_ROT_V_NROT': '96'}, n=4)
    check('LLAMA_ATTN_ROT_V_NROT=96 is NOT USED and says why', code == 0 and 'LLAMA_ATTN_ROT_V_NROT=96 NOT USED' in err, err[-300:])
    code, _, err = run('q3_0', 'q3_0', env={'LLAMA_ATTN_ROT_V_NROT': '0', 'LLAMA_ATTN_ROT_K_NROT': '64'}, n=4)
    check('LLAMA_ATTN_ROT_V_NROT=0 (whole head) and K_NROT=64 run', code == 0 and 'NOT USED' not in err, err[-300:])
    hp = subprocess.run([os.path.join(BIN, 'llama-completion'), '--help'], capture_output=True, text=True, errors='replace')
    check('--help names LLAMA_KV_SINK (Bob looks for it)', 'LLAMA_KV_SINK' in hp.stdout + hp.stderr)
    # drift on the random brain: the sharp start must not make q3_0 worse; each 1024-token chunk is its own chat
    subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-fa', 'on', '-t', '2',
                    '-ctk', 'f16', '-ctv', 'f16', '--kl-divergence-base', os.path.join(WORK, 'base.kld')], capture_output=True, timeout=900, env=clean_env())
    k3, _ = kld('q3_0'); ks, out = kld('q3_0', 'f16:128'); k8, _ = kld('q8_0')
    check('drift: q8_0 < q3_0 with a 128-token f16 sharp start <= plain q3_0', None not in (k8, k3, ks) and k8 < ks <= k3, f'{k8} {ks} {k3} {out[-300:]}')
    print(f'drift on the random brain (mean KLD against f16): q8_0 {k8}, q3_0 {k3}, q3_0 + sharp start 128 {ks}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
