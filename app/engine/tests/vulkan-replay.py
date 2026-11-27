#!/usr/bin/env python3
# Lamplight 0135 test: MTP replay (0130, LLAMA_RS_REPLAY=1) on Vulkan. Guess-ahead on a hybrid brain (Qwen 3.5 / 3.6)
# rolls the delta-net memory back after a wrong guess; with the replay the engine keeps one state and runs the kept
# tokens again inside the gated delta-net op instead of restoring a snapshot. Vulkan needs our own ggml-vulkan for that
# (the official file doesn't know the replay inputs). A tiny qwen35moe brain from tests/test-llama-archs gets one MTP
# block (as ctx-change-mtp.py does) and writes the same text on the processor and on Vulkan, replay off and on: all four
# must give the same words, MTP must guess (and miss some, so a rollback happens), and nothing may assert.
# In the cloud this runs on software Vulkan (Mesa lavapipe: GGML_VK_VISIBLE_DEVICES=0, set here).
#   python3 engine/tests/vulkan-replay.py <llama.cpp checkout with the patches, built with GGML_VULKAN=ON and LLAMA_BUILD_TESTS=ON> [work folder]
import json, os, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: vulkan-replay.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='vkreplay-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
import gguf
src = open(os.path.join(HERE, 'ctx-change-mtp.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('def add_mtp'):src.index('brain = os.path.join')])
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'qwen35moe-mtp.gguf')
if not os.path.exists(brain):
    subprocess.check_call([os.path.join(BIN, 'test-llama-archs'), '-a', 'qwen35moe', '-s', '4', '-o', WORK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    add_mtp(os.path.join(WORK, 'qwen35moe-moe.gguf'), brain)

fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def post(port, path, body, timeout=600):
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=timeout))

ASKS = [{'prompt': 'hello world one two three', 'n_predict': 48, 'temperature': 0},
        {'prompt': 'the quick brown fox jumps over the lazy dog ' * 6, 'n_predict': 48, 'temperature': 0}]
def run(dev, replay, port):
    env = {**os.environ, 'GGML_VK_VISIBLE_DEVICES': '0'}
    env.pop('LLAMA_RS_REPLAY', None)
    if replay: env['LLAMA_RS_REPLAY'] = '1'
    log = os.path.join(WORK, f'server-{dev}-{int(replay)}.txt')
    args = [os.path.join(BIN, 'llama-server'), '-m', brain, '--port', str(port), '-c', '2048', '-np', '1', '-t', '2',
            '--spec-type', 'draft-mtp', '-b', '256', '-ub', '256', '-fa', 'on', '-lv', '4']
    args += ['-dev', 'none', '-ngl', '0'] if dev == 'cpu' else ['-dev', 'Vulkan0', '-ngl', '99']
    srv = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env=env)
    out = []
    try:
        for _ in range(600):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1); break
            except Exception:
                time.sleep(0.5)
        for a in ASKS:
            out.append(post(port, '/completion', a))
    except Exception as e:
        check(f'{dev} replay {"on" if replay else "off"}: server answered', False, repr(e))
    finally:
        srv.terminate()
        try: srv.wait(20)
        except Exception: srv.kill()
    text = open(log, encoding='utf-8', errors='replace').read().replace('\r\n', '\n')
    check(f'{dev} replay {"on" if replay else "off"}: no GGML_ASSERT or crash', 'GGML_ASSERT' not in text and srv.returncode in (0, -15, 143), 'see ' + log)
    name = f'{dev} replay {"on" if replay else "off"}'
    check(f'{name}: the engine says rs_replay = {str(replay).lower()}', f'rs_replay             = {str(replay).lower()}' in text, 'see ' + log)
    if dev == 'vulkan':
        check(f'{name}: the brain and its delta-net memory are on Vulkan', 'Vulkan0 model buffer size' in text and 'Vulkan0 RS buffer size' in text, 'see ' + log)
    return out, text

res = {}
port = 18850
for dev in ('cpu', 'vulkan'):
    for replay in (False, True):
        res[(dev, replay)] = run(dev, replay, port); port += 1
base = [o.get('content') for o in res[('cpu', False)][0]]
for k, (out, _) in res.items():
    name = f'{k[0]} replay {"on" if k[1] else "off"}'
    check(f'{name}: MTP guessed', len(out) == len(ASKS) and all((o.get('timings', {}).get('draft_n') or 0) > 0 for o in out), str([o.get('timings') for o in out]))
    check(f'{name}: some guesses missed (so the memory rolled back)', any((o.get('timings', {}).get('draft_n_accepted') or 0) < (o.get('timings', {}).get('draft_n') or 0) for o in out), str([o.get('timings') for o in out]))
    check(f'{name}: same words as the processor without replay', [o.get('content') for o in out] == base, str([o.get('content') for o in out]))
print(f'\n{"all passed" if fails == 0 else f"{fails} failed"}')
sys.exit(1 if fails else 0)
