# Lamplight 0128-0134 test: the bigger upstream llama.cpp picks (to b12779), most of them behind keys that are off unless set.
#   python3 engine/tests/upstream-picks-3.py <llama.cpp checkout with the patches, built> <old checkout, built> [work folder]
# The old checkout is the same patches without 0126-0134 (or without 0128-0134). Each needs build/bin with llama-server,
# test-llama-archs and test-llama-context. Processor only, so it runs in the cloud.
# 1. Every key off: upstream-picks-2.py must pass (same perplexity, odds, greedy words, server words and calls).
# 2. LLAMA_RS_REPLAY=1 (0130, upstream #31669): guess-ahead with an MTP head on a tiny Qwen 3.5 MoE brain gives the same
#    words with the replay on as the old tree with snapshots, the log says the replay is on, and the delta-net memory is
#    smaller. Saved chats on a recurrent brain still work (test-llama-context) with the replay on.
# 3. Every CPU-side key on (LLAMA_RS_REPLAY, LLAMA_YARN_KEYS): upstream-picks-2.py again. The CUDA and Vulkan keys
#    (GGML_CUDA_FUSE_MROPE, GGML_CUDA_ASYNC_INPUTS, GGML_VK_MIXED_DOT) need a card: they are for a rented card and the home PC.
import json, os, re, subprocess, sys, tempfile, time, urllib.error, urllib.request

NEW, OLD = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 else (None, None)
if not NEW:
    print('usage: upstream-picks-3.py <new llama.cpp, built> <old llama.cpp, built> [work folder]'); sys.exit(2)
WORK = sys.argv[3] if len(sys.argv) > 3 else tempfile.mkdtemp(prefix='picks3-')
os.makedirs(WORK, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
npass = nfail = 0

def check(name, ok, extra=''):
    global npass, nfail
    npass, nfail = npass + bool(ok), nfail + (not ok)
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok or not extra else ' -> ' + str(extra)[:400]), flush=True)

def bin_(tree, name):
    return os.path.join(tree, 'build', 'bin', name)

def picks2(tag, env):
    r = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'upstream-picks-2.py'), NEW, OLD, os.path.join(WORK, 'p2-' + tag)],
                       capture_output=True, text=True, errors='replace', env={**os.environ, **env}, timeout=5400)
    last = (r.stdout.strip().splitlines() or ['no output'])[-1]
    fails = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
    check(f'upstream-picks-2.py with {tag}: {last}', r.returncode == 0, fails[:3])

# 1. every key off
picks2('every key off', {})

# 2. the replay
d = os.path.join(WORK, 'mtp'); os.makedirs(d, exist_ok=True)
subprocess.run([bin_(OLD, 'test-llama-archs'), '-a', 'qwen35moe', '-o', d], capture_output=True)
src = [os.path.join(d, x) for x in sorted(os.listdir(d)) if x.endswith('.gguf') and x != 'mtp.gguf']
brain = os.path.join(d, 'mtp.gguf')
if src:
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'tiny-mtp-brain.py'), NEW, src[0], brain], capture_output=True)
check('tiny Qwen 3.5 MoE brain with an MTP head made', os.path.exists(brain))
TPL = os.path.join(NEW, 'models', 'templates', 'Qwen3.5-4B.jinja')
TOOLS = [{'type': 'function', 'function': {'name': 'read_file', 'description': 'Read a text file on this computer.',
          'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}}, 'required': ['path']}}},
         {'type': 'function', 'function': {'name': 'set_reminder', 'description': 'Set a reminder.',
          'parameters': {'type': 'object', 'properties': {'when': {'type': 'string'}, 'text': {'type': 'string'}}, 'required': ['when', 'text']}}}]

def mtp_run(tree, env, port):
    log = os.path.join(WORK, f'mtp-{port}.log')
    srv = subprocess.Popen([bin_(tree, 'llama-server'), '-m', brain, '--port', str(port), '-c', '8192', '-np', '1', '-t', '4',
                            '--jinja', '--chat-template-file', TPL, '--spec-type', 'draft-mtp', '-v'],
                           stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, **env})
    out = []
    try:
        for _ in range(240):
            try: urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=2); break
            except Exception: time.sleep(0.5)
        msgs = [{'role': 'user', 'content': 'Read my notes file and set a reminder for the first thing on it.'}]
        for extra in (dict(tools=TOOLS, chat_template_kwargs={'enable_thinking': False}), dict(tools=TOOLS),
                      dict(chat_template_kwargs={'enable_thinking': False})):
            req = urllib.request.Request(f'http://127.0.0.1:{port}/v1/chat/completions', headers={'Content-Type': 'application/json'},
                                         data=json.dumps({'messages': msgs, 'temperature': 0, 'seed': 7, 'max_tokens': 300,
                                                          'cache_prompt': False, **extra}).encode())
            m = json.load(urllib.request.urlopen(req, timeout=900))
            t = m.get('timings', {})
            c = m['choices'][0]['message']
            out.append((c.get('content'), c.get('reasoning_content'), json.dumps(c.get('tool_calls')), t.get('draft_n')))
    finally:
        srv.terminate(); srv.wait()
    text = open(log, errors='replace').read()
    return out, text

if os.path.exists(brain):
    old, _ = mtp_run(OLD, {}, 18981)
    off, log_off = mtp_run(NEW, {}, 18982)
    on, log_on = mtp_run(NEW, {'LLAMA_RS_REPLAY': '1'}, 18983)
    check('MTP guess-ahead, replay off: same words, calls and drafts as the old tree', old == off, (old, off))
    check('MTP guess-ahead, LLAMA_RS_REPLAY=1: same words, calls and drafts as the old tree (snapshots)', old == on, (old, on))
    check('the log says the replay is on with the key, off without', 'rs_replay             = true' in log_on and
          'rs_replay             = true' not in log_off)
    size = lambda t: [float(x) for x in re.findall(r'llama_memory_recurrent: size =\s+([0-9.]+) MiB', t)]
    s_off, s_on = size(log_off), size(log_on)
    check('the delta-net memory is smaller with the replay', bool(s_off) and bool(s_on) and s_on[0] < s_off[0], (s_off, s_on))
    if s_off and s_on:
        print(f'     delta-net memory {s_off[0]:.2f} -> {s_on[0]:.2f} MiB (tiny brain, 3 guesses kept)')
    d2 = os.path.join(WORK, 'ctx'); os.makedirs(d2, exist_ok=True)
    subprocess.run([bin_(NEW, 'test-llama-archs'), '-a', 'qwen35', '-o', d2], capture_output=True)
    g = [os.path.join(d2, x) for x in sorted(os.listdir(d2)) if x.endswith('.gguf')]
    if g:
        r = subprocess.run([bin_(NEW, 'test-llama-context'), '-m', g[0]], cwd=NEW, capture_output=True, text=True, errors='replace',
                           env={**os.environ, 'LLAMA_RS_REPLAY': '1'}, timeout=1800)
        check('saved chats on a recurrent brain with LLAMA_RS_REPLAY=1 (test-llama-context)', r.returncode == 0,
              (r.stdout + r.stderr).strip().splitlines()[-3:])

# 3. every CPU-side key on
picks2('LLAMA_RS_REPLAY=1 LLAMA_YARN_KEYS=1', {'LLAMA_RS_REPLAY': '1', 'LLAMA_YARN_KEYS': '1'})

print(f'{npass} passed, {nfail} failed')
sys.exit(1 if nfail else 0)
