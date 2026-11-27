#!/usr/bin/env python3
# Brain Engine 0123 test: sealed blocks (LLAMA_KV_BODY), off unless set. Words older than the Progressive rings (0039)
# are sealed 128 at a time into SJ-KVaRN records (JakeATX's sj_kvarn.h, MIT; the method is Huawei's KVarN) and read
# from there. The checks that can see a fault: it seals and reads; once every old word is sealed the main cache's type
# no longer matters (the records stand in for it); the stand-in card gives the processor's tokens; a loaded chat
# answers; more bits drift less; refusals say why. Real numbers come from the PC.
#   python3 engine/tests/kv-body.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
# It needs llama-completion, llama-perplexity and ggml-rpc-server in <checkout>/build/bin.
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: kv-body.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='kvbody-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
# the codec wants heads of 128 (or 256, 512); 4,096 cells
maker = src[src.index('def make_moe'):src.index("MODEL = ")].replace('add_context_length(512)', 'add_context_length(4096)')
exec(maker.replace('HD, FF = 16, 4, 64, 4, 2, 16, 32', 'HD, FF = 16, 4, 64, 4, 2, 128, 32'))
make_128 = make_moe
exec(maker.replace('HD, FF = 16, 4, 64, 4, 2, 16, 32', 'HD, FF = 16, 4, 64, 4, 2, 64, 32'))
make_64 = make_moe
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-hd128-4k.gguf')
brain64 = os.path.join(WORK, 'moe-hd64-4k.gguf')
if not os.path.exists(brain): make_128(brain)
if not os.path.exists(brain64): make_64(brain64)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f: f.write(' '.join(f'word{i % 37} x{i % 11}' for i in range(300)))
text = os.path.join(WORK, 'kld.txt')
with open(text, 'w') as f:
    rng = np.random.default_rng(1)
    f.write(' '.join(f'word{int(a)} x{int(b)}' for a, b in zip(rng.integers(0, 37, 3000), rng.integers(0, 11, 3000))))
PORT = 50244
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
RINGS = {'LLAMA_KV_SINK': 'f16:128', 'LLAMA_KV_TIERS': 'f16:256', 'LLAMA_KV_TIERS_SLACK': '256'}
def clean_env(env=None):
    e = dict(os.environ)
    for k in ('LLAMA_KV_TIERS', 'LLAMA_KV_SINK', 'LLAMA_KV_TIERS_SLACK', 'LLAMA_KV_BODY', 'LLAMA_KV_BODY_ITERS'): e.pop(k, None)
    e.update(env or {})
    return e
def run(kv, env=None, card=False, extra=(), n=48, m=None):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', m or brain, *(('--rpc', f'127.0.0.1:{PORT}', '-ngl', '99') if card else ('-ngl', '0')),
                        '-f', prompt, '-n', str(n), '-c', '2048', '-b', '512', '-ub', '128', '-fa', 'on', '-ctk', kv, '-ctv', kv,
                        '-no-cnv', '--temp', '0', '-t', '2', '-lv', '4', *extra],
                       capture_output=True, text=True, errors='replace', env=clean_env(env), timeout=900)
    return r.returncode, r.stdout, r.stderr
def kld(kv, env=None):
    r = subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-ub', '128', '-fa', 'on', '-t', '2',
                        '-ctk', kv, '-ctv', kv, '--kl-divergence-base', os.path.join(WORK, 'base.kld'), '--kl-divergence'],
                       capture_output=True, text=True, errors='replace', env=clean_env(env), timeout=1800)
    m = re.search(r'Mean +KLD: +([0-9.]+)', r.stdout + r.stderr)
    return (float(m.group(1)) if m else None), r.stdout + r.stderr
try:
    B44 = {**RINGS, 'LLAMA_KV_BODY': '4/4'}
    code, a, err = run('f16', B44)
    check('sealed blocks say what they keep', code == 0 and 'sealed 128 at a time at 4/4 bits (scalar' in err and 'LLAMA_KV_BODY, SJ-KVaRN' in err, err[-400:])
    check('groups are sealed before the batches that follow them', re.search(r'sealed blocks: \d+ groups sealed', err) is not None, err[-400:])
    check('attention reads the records', 'read from their sealed records' in err, err[-400:])
    check('the whole head is turned for the records', 'n_rot_k = 128' in err and 'n_rot_v = 128' in err, err[-400:])
    code2, b, err2 = run('q4_0', B44)
    check('once the old words are sealed, the main cache type no longer changes the tokens (f16 = q4_0 under the records)', code2 == 0 and a == b, err2[-300:])
    code3, c, err3 = run('f16', B44, card=True)
    check('the same tokens on the stand-in card (rings and records there, sealed on the processor)', code3 == 0 and c == a, err3[-300:])
    B33 = {**RINGS, 'LLAMA_KV_BODY': '3/3'}
    code, d, err = run('f16', B33)
    check('3/3 uses trellis codes and answers', code == 0 and '3/3 bits (trellis' in err and len(d) > len(open(prompt).read()), err[-400:])
    cache = os.path.join(WORK, 'chat.bin')
    if os.path.exists(cache): os.remove(cache)
    code, h1, err = run('f16', B44, extra=('--prompt-cache', cache), n=8)
    code2, h2, err2 = run('f16', B44, extra=('--prompt-cache', cache), n=8)
    check('a saved then loaded chat answers (its old words are read from the main cache until sealed again)', code == 0 and code2 == 0 and os.path.exists(cache) and len(h2) > 0, (err + err2)[-400:])
    for why, env, m, want in (('a bad value', {**RINGS, 'LLAMA_KV_BODY': '5/5'}, brain, 'the codec has no such pair'),
                              ('no ring to seal from', {'LLAMA_KV_BODY': '4/4'}, brain, 'it needs a ring to seal from'),
                              ('heads of 64', {**RINGS, 'LLAMA_KV_BODY': '4/4'}, brain64, 'the head size must be 128, 256 or 512')):
        code, _, err = run('f16', env, m=m, n=4)
        check(f'NOT USED, and says why: {why}', code == 0 and 'LLAMA_KV_BODY=' in err and 'NOT USED' in err and want in err, err[-300:])
    hp = subprocess.run([os.path.join(BIN, 'llama-completion'), '--help'], capture_output=True, text=True, errors='replace')
    check('--help names LLAMA_KV_BODY (Bob looks for it)', 'LLAMA_KV_BODY' in hp.stdout + hp.stderr)
    # drift on the random brain: more bits drift less, and nothing comes out exact
    subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-ub', '128', '-fa', 'on', '-t', '2',
                    '-ctk', 'f16', '-ctv', 'f16', '--kl-divergence-base', os.path.join(WORK, 'base.kld')], capture_output=True, timeout=1800, env=clean_env())
    k44, o44 = kld('f16', B44); k32, o32 = kld('f16', {**RINGS, 'LLAMA_KV_BODY': '3/2'}); kr, _ = kld('f16', RINGS)
    check('drift: rings alone (f16) < 4/4 records < 3/2 records', None not in (k44, k32, kr) and kr < k44 < k32, f'{kr} {k44} {k32} {o44[-300:]}')
    print(f'drift on the random brain (mean KLD against f16): f16 rings {kr}, 4/4 records {k44}, 3/2 records {k32}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
