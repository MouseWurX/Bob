#!/usr/bin/env python3
# Brain Engine 0053 test: drive stand-ins (LLAMA_MOE_STANDIN=drive). While writing, a picked expert that is on the drive
# alone (not in RAM) is played by the best-scored unpicked expert on the card or in RAM, and read into RAM in the
# background; a miss in RAM is copied up as before. The cache needs a card, so a stand-in card runs on this machine
# (ggml-rpc-server; build the checkout with GGML_RPC=ON). It checks that:
#   - with the whole brain in RAM (this small file is), nothing is stood in and the words are a plain run's
#   - with LLAMA_MOE_STANDIN_TEST_NO_RAM=1 (as if no expert were in RAM) it stands in, never for the top pick, reads in
#     the background and says so, and both answers come back
#   - borrowed reading (0048) still turns on next to it
#   - 0054's RAM floor is on with either (0062: or on its own when LLAMA_MOE_RAM_FLOOR_MIB is set), 512 MiB unless set, engages under it (free RAM pretended) without changing
#     the words, and 0 turns it off
#   python3 engine/tests/moe-drive-standin.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-drive-standin.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='drive-standin-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'moe-borrow.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('def make_moe'):src.index('os.makedirs(WORK')])
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-wide.gguf')
if not os.path.exists(brain): make_moe(brain)
P1 = ' '.join(f'apple{i} river{i % 7}' for i in range(200))
P2 = ' '.join(f'stone{i % 13} cloud{i}' for i in range(150))
RPORT = 50251
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub=64, port=50252):
    log = os.path.join(WORK, f'{tag}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', '4',
                          '--moe-cache-mib', '24', '--moe-cache-cpu-share', '0', '-c', '4096', '-np', '1', '-t', '2',
                          '-b', '2048', '-ub', str(ub), '--port', str(port), '-lv', '4', '--no-warmup'],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '200', **env})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    words = []
    try:
        for prompt in (P1, P2):
            body = json.dumps({'prompt': prompt, 'n_predict': 60, 'temperature': 0, 'cache_prompt': False}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            words.append(json.loads(urllib.request.urlopen(req, timeout=300).read())['content'])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
def last(pat, text):
    m = re.findall(pat, text)
    return m[-1] if m else None
DLINE = r'drive stand-ins: (\d+) misses on the drive alone, (\d+) stood in \((\d+) of them by an expert in RAM\), (\d+) background reads done'
try:
    plain, _ = serve('plain', {})
    ram, err = serve('drive-ram', {'LLAMA_MOE_STANDIN': 'drive'})
    check('it turns on and says what it does', 'MoE drive stand-ins ON' in err, err[-400:])
    d = last(DLINE, err)
    check('with the brain in RAM nothing is stood in', d is not None and d[0] == '0' and d[1] == '0', f'{d}')
    check('with the brain in RAM the words are a plain run\'s', ram == plain and len(ram) == 2 and not any(w.startswith('ERROR') for w in ram), f'{ram} vs {plain}')
    off, err = serve('drive-noram', {'LLAMA_MOE_STANDIN': 'drive', 'LLAMA_MOE_STANDIN_TEST_NO_RAM': '1'})
    d = last(DLINE, err)
    check('with nothing in RAM it stands in for misses on the drive', d is not None and int(d[0]) > 0 and int(d[1]) > 0, f'{d}')
    check('and reads them into RAM in the background', d is not None and int(d[3]) > 0, f'{d}')
    most = last(r'most (\d+) in a layer for a word\n', err)
    check('never for the top pick (at most 3 of 4 in a layer)', most is not None and int(most) <= 3, f'{most}')
    check('both answers came back', len(off) == 2 and not any(w.startswith('ERROR') for w in off), f'{off}')
    print(f'info: {d}; words same as plain: {off == plain}')
    bw, err = serve('drive-borrow', {'LLAMA_MOE_STANDIN': 'drive', 'LLAMA_MOE_STANDIN_TEST_NO_RAM': '1', 'LLAMA_MOE_CACHE_BORROW': '1'})
    check('borrowed reading still turns on next to it', 'borrowed reading on' in err and 'LLAMA_MOE_CACHE_BORROW NOT USED' not in err, err[-600:])
    check('and both answers come back', len(bw) == 2 and not any(w.startswith('ERROR') for w in bw), f'{bw}')
    # 0054: the RAM floor, on whenever the drive tier or drive stand-ins are
    check('no RAM floor while neither is on', 'RAM floor' not in serve('plain-again', {})[1])
    low, err = serve('floor-low', {'LLAMA_MOE_STANDIN': 'drive', 'LLAMA_MOE_RAM_FLOOR_TEST_AVAIL_MIB': '100'})
    check('the floor is on with drive stand-ins, 512 MiB by default', 'RAM floor on: when free RAM drops under 512 MiB' in err, err[-400:])
    check('under the floor it engages, gives pages back and says so', re.search(r'RAM floor engaged: 100 MiB free, under 512 MiB: [\d.]+ MiB of expert pages given back', err) is not None, err[-600:])
    eng = last(r'RAM floor 512 MiB: engaged (\d+) times, ([\d.]+) MiB of expert pages given back', err)
    check('the totals count it', eng is not None and int(eng[0]) > 0, f'{eng}')
    check('giving pages back changes no words', low == plain, f'{low} vs {plain}')
    dlow, err = serve('floor-drive', {'LLAMA_MOE_DRIVE': '1', 'LLAMA_MOE_DRIVE_ALL': '1', 'LLAMA_MOE_RAM_FLOOR_MIB': '2048', 'LLAMA_MOE_RAM_FLOOR_TEST_AVAIL_MIB': '1000'})
    check('the floor is on with the drive tier, and takes its setting', 'RAM floor on: when free RAM drops under 2048 MiB' in err and 'RAM floor engaged: 1000 MiB free' in err, err[-600:])
    check('with the drive tier under the floor, the words are a plain run\'s', dlow == plain, f'{dlow} vs {plain}')
    _, err = serve('floor-off', {'LLAMA_MOE_STANDIN': 'drive', 'LLAMA_MOE_RAM_FLOOR_MIB': '0'})
    check('0 turns it off, with a warning', 'RAM floor OFF' in err and 'RAM floor on' not in err)
    # 0062: on its own when asked for, without the drive tier or drive stand-ins
    alone, err = serve('floor-alone', {'LLAMA_MOE_RAM_FLOOR_MIB': '1024', 'LLAMA_MOE_RAM_FLOOR_TEST_AVAIL_MIB': '500'})
    check('asked for on its own, the floor is on and engages, with a plain run\'s words', 'RAM floor on: when free RAM drops under 1024 MiB' in err and 'RAM floor engaged: 500 MiB free' in err and alone == plain, err[-600:])
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
