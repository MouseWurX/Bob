#!/usr/bin/env python3
# Brain Engine 0030 test: a lookup table read through our own window (LLAMA_TABLE_DIRECT=1, unbuffered I/O) gives the
# same words as the memory map, with a big window, with a tiny one that keeps giving pages back, with the brain read
# whole (--load-mode none) and with two chats at once.
#   python3 engine/tests/table-window.py <llama.cpp checkout with the patches, built with LLAMA_BUILD_TESTS=ON> [work folder]
# The tiny brain is a Qwen3.8-Flash-Next shaped one (qwen4exp: n-gram table, hyper-connections, sparse attention)
# made by llama.cpp's own tests/test-llama-archs, with sparse attention forced on (top_k 64) and a longer context.
import os, subprocess, sys, tempfile
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: table-window.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='tw-')
BIN = os.path.join(SRC, 'build', 'bin')
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'qwen4exp-moe.gguf')
if not os.path.exists(brain):
    subprocess.check_call([os.path.join(BIN, 'test-llama-archs'), '-a', 'qwen4exp', '-o', WORK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    setmeta = os.path.join(SRC, 'gguf-py', 'gguf', 'scripts', 'gguf_set_metadata.py')
    env = {**os.environ, 'PYTHONPATH': os.path.join(SRC, 'gguf-py')}
    for k, v in (('qwen4exp.attention.indexer.top_k', '64'), ('qwen4exp.context_length', '8192')):
        subprocess.check_call([sys.executable, setmeta, '--force', brain, k, v], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f:
    f.write(' '.join(f'word{i}' for i in range(300)))

fails = 0
def run(name, env, extra=()):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, '-f', prompt, '-n', '32', '-c', '2048', '-fa', 'on',
                        '-no-cnv', '--temp', '0', '-t', '2', '--lazy-mode', 'on', '-lv', '4', *extra],
                       capture_output=True, text=True, env={**os.environ, **env}, timeout=300)
    return r.returncode, r.stdout, r.stderr
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok

code, base, _ = run('map', {})
check('the memory map answers', code == 0 and len(base) > 0)
for name, env, extra in (
        ('a big window gives the same words', {'LLAMA_TABLE_DIRECT': '1'}, ()),
        ('a tiny window (pages given back all the time) gives the same words', {'LLAMA_TABLE_DIRECT': '1', 'LLAMA_TABLE_DIRECT_MIB': '0.04'}, ()),
        ('the brain read whole (--load-mode none) gives the same words', {'LLAMA_TABLE_DIRECT': '1', 'LLAMA_TABLE_DIRECT_MIB': '0.04'}, ('--load-mode', 'none')),
        ('a small step (several reads a prompt) gives the same words', {'LLAMA_TABLE_DIRECT': '1', 'LLAMA_TABLE_DIRECT_MIB': '0.04'}, ('-b', '64', '-ub', '16'))):
    code, out, err = run(name, env, extra)
    used = 'read on demand' in err
    check(name, code == 0 and used and out == base, 'not used' if not used else f'exit {code}' if code else 'different words')
    if name.startswith('a tiny'):
        check('the tiny window gave pages back', 'pages given back' in err and ', 0 pages given back' not in err)
code, out, err = run('off', {'LLAMA_TABLE_DIRECT': '0'})
check('LLAMA_TABLE_DIRECT=0 leaves it off', code == 0 and 'read on demand' not in err and out == base)
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
