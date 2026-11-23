#!/usr/bin/env python3
# Brain Engine 0036 test: LLAMA_KV_SPLIT=N keeps the first N cells of the chat memory on the card and all of it in RAM.
# A chat that fits in N reads the card's copy; a prompt past N reads the RAM copy on the card; writing past N splits
# attention between the card (cells before N) and the processor (the rest) and merges the two. The test runs a tiny
# brain on a stand-in card on this machine (ggml-rpc-server; build the checkout with GGML_RPC=ON), where the card and
# the processor compute alike, so the words must match the split turned off. On a real card the merged attention can
# differ from one pass in the last bits, so expect close odds there rather than the same words every time.
#   python3 engine/tests/kv-split.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
# It needs llama-completion, llama-server, test-llama-archs and ggml-rpc-server built in <checkout>/build/bin, numpy and gguf-py.
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: kv-split.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='kvsplit-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
# head size 64 instead of 16, so q8_0 and q4_0 chat memory work, and 4,096 cells so the server takes a long prompt
exec(src[src.index('def make_moe'):src.index("MODEL = ")].replace('HD, FF = 16, 4, 64, 4, 2, 16, 32', 'HD, FF = 16, 4, 64, 4, 2, 64, 32')
     .replace('add_context_length(512)', 'add_context_length(4096)'))
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-hd64-4k.gguf')
if not os.path.exists(brain): make_moe(brain)
def prompt(n):
    p = os.path.join(WORK, f'prompt-{n}.txt')
    with open(p, 'w') as f: f.write(' '.join(f'word{i % 37} x{i % 11}' for i in range(n)))
    return p
LONG, SHORT = prompt(300), prompt(40)  # about 1,440 and 190 tokens
PORT = 50236
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def run(env, p=LONG, n='160', extra=()):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '-f', p, '-n', n,
                        '-c', '2048', '-b', '512', '-ub', '512', '-fa', 'on', '-no-cnv', '--temp', '0', '-t', '2', '-lv', '4', *extra],
                       capture_output=True, text=True, errors='replace', env={**os.environ, **env}, timeout=600)
    return r.returncode, r.stdout, r.stderr
ON = {'LLAMA_KV_SPLIT': '256'}
try:
    for kv in ('f16', 'q8_0', 'q4_0'):
        t = ('-ctk', kv, '-ctv', kv)
        code, base, err = run({}, extra=t)
        check(f'{kv}: answers with it off', code == 0, err[-300:])
        code, out, err = run(ON, extra=t)
        check(f'{kv}: it says it is on', 'KV split: the first 256 of 2048 cells' in err, err[-300:])
        check(f'{kv}: a long prompt reads the RAM copy on the card', 'a batch past cell 256 reads the RAM copy' in err)
        check(f'{kv}: writing past it merges the card and the processor', 'writing past cell 256' in err)
        check(f'{kv}: the same words as with it off', code == 0 and out == base)
    # Qwen 3.5 / 3.6's own kind of brain (attention layers between recurrent ones, scaled K and V), made by test-llama-archs
    q35 = os.path.join(WORK, 'q35')
    os.makedirs(q35, exist_ok=True)
    if not os.path.exists(os.path.join(q35, 'qwen35moe-moe.gguf')):
        subprocess.run([os.path.join(BIN, 'test-llama-archs'), '-a', '^qwen35moe$', '-o', q35], capture_output=True, timeout=300)
    hb = os.path.join(q35, 'qwen35moe-moe.gguf')
    for kv in ('f16', 'q8_0'):
        t = ('-ctk', kv, '-ctv', kv)
        def runh(env):
            r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', hb, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '-f', LONG, '-n', '120',
                                '-c', '2048', '-b', '512', '-ub', '512', '-fa', 'on', '-no-cnv', '--temp', '0', '-t', '2', '-lv', '4', *t],
                               capture_output=True, text=True, errors='replace', env={**os.environ, **env}, timeout=600)
            return r.returncode, r.stdout, r.stderr
        code, base, err = runh({})
        code2, out, err = runh(ON)
        check(f'qwen35moe {kv}: the prompt and the writing both go past the split',
              'reads the RAM copy' in err and 'writing past cell 256' in err, err[-300:])
        check(f'qwen35moe {kv}: the same words as with it off', code == 0 and code2 == 0 and out == base)
    # a short prompt fits in the card's copy, then the writing crosses it
    code, base, err = run({}, SHORT, '200')
    code2, out, err = run(ON, SHORT, '200')
    check('short prompt, writing crosses the split: the same words', code == 0 and code2 == 0 and out == base)
    check('short prompt: the merge starts once the writing crosses it', 'writing past cell 256' in err)
    code, out, err = run(ON, SHORT, '20')
    check('a short chat never leaves the card copy', code == 0 and 'writing past cell' not in err and 'reads the RAM copy' not in err)
    for name, env, extra, why in [
        ('flash attention off', ON, ('-fa', 'off'), 'needs flash attention'),
        ('two chats', ON, ('-np', '2'), 'one chat at a time'),
        ('the cache in RAM already', ON, ('-nkvo',), 'in RAM already'),
        ('a context no bigger than the split', {'LLAMA_KV_SPLIT': '4096'}, (), 'not bigger than the split')]:
        code, out, err = run(env, SHORT, '8', extra)
        check(f'{name}: NOT USED, and it still answers', code == 0 and 'NOT USED' in err and why in err, err[-300:])
    # the server: a saved chat restored from disk refreshes the card's copy, and the answers match the split turned off
    import json, urllib.request
    def server(env, port):
        slots = os.path.join(WORK, f'slots-{port}'); os.makedirs(slots, exist_ok=True)
        log = open(os.path.join(WORK, f'srv-{port}.log'), 'w')
        p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--port', str(port),
                              '-c', '2048', '-np', '1', '-fa', 'on', '-t', '2', '--slot-save-path', slots, '-lv', '4'],
                             stdout=subprocess.DEVNULL, stderr=log, env={**os.environ, **env})
        for _ in range(300):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); return p
            except Exception: time.sleep(0.1)
        return p
    def post(port, path, body):
        req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', json.dumps(body).encode(), {'Content-Type': 'application/json'})
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    text = open(LONG).read()
    def chat(port):
        ask = lambda: post(port, '/completion', {'prompt': text, 'n_predict': 40, 'temperature': 0, 'cache_prompt': True})['content']
        first = ask()
        post(port, '/slots/0?action=save', {'filename': 'a.bin'})
        post(port, '/slots/0?action=erase', {})
        # another chat writes over the first cells, so only a refreshed card copy gives the first answer again
        post(port, '/completion', {'prompt': 'other ' * 300, 'n_predict': 8, 'temperature': 0, 'cache_prompt': True})
        post(port, '/slots/0?action=restore', {'filename': 'a.bin'})
        return first, ask()
    answers = {}
    for name, env, port in (('off', {}, 50237), ('on', ON, 50238)):
        srv = server(env, port)
        try:
            answers[name] = chat(port)
        except Exception as e:
            answers[name] = (repr(e), '')
        finally:
            srv.terminate(); srv.wait(30)
    check('server: the same answer as with it off', answers['on'][0] == answers['off'][0] and not answers['on'][0].startswith('<HTTPError'), f"{answers['on'][0][:80]!r} vs {answers['off'][0][:80]!r}")
    check('server: the same answer after the chat is saved, erased and restored', answers['on'][1] == answers['off'][1] == answers['off'][0])
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
