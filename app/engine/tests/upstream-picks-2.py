# Lamplight 0126 + 0127 test: upstream llama.cpp's fixes and lossless speed-ups picked onto b12359 (up to b12779).
#   python3 engine/tests/upstream-picks-2.py <llama.cpp checkout with the patches, built> [old checkout, built] [work folder]
# Each checkout needs build/bin with llama-perplexity, llama-completion, llama-server, test-llama-archs and the unit tests
# (cmake -DLLAMA_BUILD_TESTS=ON). Processor only, so it runs in the cloud.
# 1. Upstream's own unit tests that the picks touch (templates, JSON schemas, grammars, the server parts, saved chats).
# 2. With an old tree (the same patches without 0126 and 0127): tiny made-up brains of Bob's families give the same
#    perplexity, the same top odds and the same greedy words on 1 and 4 threads (the processor's matrix product and
#    GET_ROWS changed, the sums must not), and llama-server with tools offered (the whole tool grammar runs, 0104) gives
#    the same words and calls, with and without thinking. Writing speed is printed, not checked (cloud noise).
import json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request

NEW = sys.argv[1] if len(sys.argv) > 1 else None
OLD = sys.argv[2] if len(sys.argv) > 2 else None
if not NEW:
    print('usage: upstream-picks-2.py <new llama.cpp, built> [old llama.cpp, built] [work folder]'); sys.exit(2)
WORK = sys.argv[3] if len(sys.argv) > 3 else tempfile.mkdtemp(prefix='picks2-')
os.makedirs(WORK, exist_ok=True)
npass = nfail = 0

def check(name, ok, extra=''):
    global npass, nfail
    npass, nfail = npass + bool(ok), nfail + (not ok)
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok or not extra else ' -> ' + str(extra)[:400]), flush=True)

def bin_(tree, name):
    return os.path.join(tree, 'build', 'bin', name)

# 1. upstream unit tests (run from the checkout, some read models/ and tests/ files)
for t in ['test-jinja', 'test-json-schema', 'test-json-schema-to-grammar', 'test-grammar-parser', 'test-grammar-integration',
          'test-llama-grammar', 'test-chat', 'test-chat-template', 'test-gguf', 'test-llama-context', 'test-server-component']:
    exe = bin_(NEW, t)
    if not os.path.exists(exe):
        check(t + ' (built)', False, 'missing'); continue
    runs = [[]]
    if t == 'test-llama-context':  # saved chats (#30318): a plain attention brain and a recurrent one (Qwen 3.5 shaped)
        runs = []
        for arch in ('llama', 'qwen35'):
            d = os.path.join(WORK, 'ctx-' + arch); os.makedirs(d, exist_ok=True)
            subprocess.run([bin_(NEW, 'test-llama-archs'), '-a', arch, '-o', d], capture_output=True)
            g = sorted(x for x in os.listdir(d) if x.endswith('.gguf'))
            runs.append(['-m', os.path.join(d, g[0])] if g else ['-m', 'missing-' + arch])
    for extra in runs:
        r = subprocess.run([exe] + extra, cwd=NEW, capture_output=True, text=True, errors='replace', timeout=1800)
        check(t + (' ' + os.path.basename(extra[1]) if extra else ''), r.returncode == 0, (r.stdout + r.stderr).strip().splitlines()[-3:])

if not OLD:
    print(f'{npass} passed, {nfail} failed'); sys.exit(1 if nfail else 0)

# 2a. tiny made-up brains, the same numbers before and after
TEXT = os.path.join(WORK, 'text.txt')
with open(TEXT, 'w') as f:
    f.write(('Bob reads the notes file, then he writes a short list of what to do today. ' * 6 +
             'The quick brown fox jumps over the lazy dog while the engine counts every token it reads. ' * 6) * 8)
ARCHS = ['qwen35moe', 'qwen35', 'qwen3next', 'qwen4exp', 'qwen3moe', 'qwen3', 'llama', 'gemma3']
for arch in ARCHS:
    d = os.path.join(WORK, arch); os.makedirs(d, exist_ok=True)
    r = subprocess.run([bin_(OLD, 'test-llama-archs'), '-a', arch, '-o', d], capture_output=True, text=True, errors='replace')
    ggufs = [os.path.join(d, x) for x in sorted(os.listdir(d)) if x.endswith('.gguf')]
    if not ggufs:
        print(f'SKIP {arch}: no tiny brain ({(r.stderr or r.stdout).strip()[-120:]})'); continue
    brain = ggufs[0]
    for th in ('1', '4'):
        outs = {}
        for tag, tree in (('old', OLD), ('new', NEW)):
            base = os.path.join(WORK, f'{arch}-{th}-{tag}')
            for _ in range(3):  # the async log sometimes loses the last line at exit, on both trees: try again
                p = subprocess.run([bin_(tree, 'llama-perplexity'), '-m', brain, '-f', TEXT, '-c', '256', '-b', '256', '-t', th,
                                    '--kl-divergence-base', base + '.kld'], capture_output=True, text=True, errors='replace', timeout=900)
                ppl = [l[l.index('PPL ='):] for l in (p.stdout + p.stderr).splitlines() if 'Final estimate' in l and 'PPL =' in l]
                if ppl: break
            c = subprocess.run([bin_(tree, 'llama-completion'), '-m', brain, '-p', 'Bob reads the notes file', '-n', '48',
                                '--temp', '0', '-t', th, '-no-cnv', '--no-warmup', '-s', '7'], capture_output=True, text=True, errors='replace', timeout=900)
            outs[tag] = (ppl[-1] if ppl else 'none: ' + (p.stderr or '')[-200:], c.stdout)
        if outs['old'][0].startswith('none'):
            print(f'SKIP {arch} t{th}: perplexity did not run ({outs["old"][0][-120:]})'); continue
        with open(brain, 'rb') as f: scaled = b'ssm_out.scale' in f.read(4 << 20)
        if arch == 'qwen3next' and scaled:
            # #32393 now applies the file's ssm_out scale (the old tree ignored it), so a tiny change is the fix working
            po, pn = float(outs['old'][0].split()[2]), float(outs['new'][0].split()[2])
            check(f'{arch} t{th}: ssm_out scale now applied (#32393), perplexity within 0.01%', abs(po - pn) <= po * 1e-4, f'{po} vs {pn}')
        else:
            check(f'{arch} t{th}: same perplexity', outs['old'][0] == outs['new'][0], f'{outs["old"][0]} vs {outs["new"][0]}')
        # top odds: the new tree against the old one's saved logits, must be exactly 0
        kb = os.path.join(WORK, f'{arch}-{th}-old.kld')
        k = subprocess.run([bin_(NEW, 'llama-perplexity'), '-m', brain, '-f', TEXT, '-c', '256', '-b', '256', '-t', th,
                            '--kl-divergence-base', kb, '--kl-divergence'], capture_output=True, text=True, errors='replace', timeout=900)
        for _ in range(2):
            lines = [l for l in (k.stdout + k.stderr).splitlines() if l.startswith('Mean    KLD') or l.startswith('Same top')]
            if len(lines) >= 2: break
            k = subprocess.run(k.args, capture_output=True, text=True, errors='replace', timeout=900)
        mean = [l for l in lines if l.startswith('Mean    KLD')]
        same = [l for l in lines if l.startswith('Same top')]
        ok = bool(mean) and float(mean[0].split()[2]) == 0.0 and bool(same) and same[0].split()[3].startswith('100.000')
        check(f'{arch} t{th}: same odds (KLD 0, same top token 100%)', ok, lines or (k.stderr or '')[-300:])
        wo, wn = outs['old'][1].strip(), outs['new'][1].strip()
        for _ in range(2):  # stdout can lose its tail at exit (seen on both trees): run both again before calling it different
            if wo == wn: break
            again = lambda tree: subprocess.run([bin_(tree, 'llama-completion'), '-m', brain, '-p', 'Bob reads the notes file', '-n', '48',
                                                 '--temp', '0', '-t', th, '-no-cnv', '--no-warmup', '-s', '7'],
                                                capture_output=True, text=True, errors='replace', timeout=900).stdout.strip()
            wo, wn = again(OLD), again(NEW)
        check(f'{arch} t{th}: same greedy words', wo == wn, (wo[-80:], wn[-80:]))

# 2b. llama-server with tools offered: the same words and calls, writing speed printed.
# The tiny qwen35moe brain gets Qwen 3.5's real vocabulary (llama.cpp's models/ggml-vocab-qwen35.gguf), so the prompt,
# the tool grammar and the parser run on real tokens.
def real_vocab_brain(src_path, out_path, arch='qwen35moe'):
    code = r"""
import sys, numpy as np
sys.path.insert(0, sys.argv[1] + '/gguf-py'); import gguf
src, voc = gguf.GGUFReader(sys.argv[2]), gguf.GGUFReader(sys.argv[1] + '/models/ggml-vocab-qwen35.gguf')
arch = sys.argv[4]; w = gguf.GGUFWriter(sys.argv[3], arch)
n_vocab = len(voc.fields['tokenizer.ggml.tokens'].contents())
def copy(k, f):
    t = f.types[0]; sub = f.types[-1] if t == gguf.GGUFValueType.ARRAY else None; v = f.contents()
    if sub is not None and len(v) == 0: return
    w.add_key_value(k, v, t, sub_type=sub)
for k, f in src.fields.items():
    if k.startswith('GGUF.') or k == 'general.architecture' or k.startswith('tokenizer.'): continue
    if k == f'{arch}.vocab_size': w.add_uint32(k, n_vocab); continue
    if k == f'{arch}.context_length': w.add_uint32(k, 32768); continue
    copy(k, f)
for k, f in voc.fields.items():
    if k.startswith('tokenizer.') and k != 'tokenizer.chat_template': copy(k, f)
n_embd = int(src.fields[f'{arch}.embedding_length'].contents())
rng = np.random.default_rng(11)
for t in src.tensors:
    if t.name in ('token_embd.weight', 'output.weight'):
        w.add_tensor(t.name, (rng.standard_normal((n_vocab, n_embd)) * 0.5).astype(np.float32)); continue
    w.add_tensor(t.name, np.array(t.data), raw_shape=list(reversed([int(x) for x in t.shape])), raw_dtype=t.tensor_type)
w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()
"""
    r = subprocess.run([sys.executable, '-I', '-c', code, NEW, src_path, out_path, arch], capture_output=True, text=True, errors='replace')
    return out_path if r.returncode == 0 and os.path.exists(out_path) else None

brain = None
d = os.path.join(WORK, 'qwen35moe')
if os.path.isdir(d):
    g = [os.path.join(d, x) for x in sorted(os.listdir(d)) if x.endswith('.gguf') and 'real-vocab' not in x]
    brain = real_vocab_brain(g[0], os.path.join(d, 'real-vocab.gguf')) if g else None
TOOLS = [
    {'type': 'function', 'function': {'name': 'read_file', 'description': 'Read a text file on this computer.',
     'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}, 'start_line': {'type': 'integer'}}, 'required': ['path']}}},
    {'type': 'function', 'function': {'name': 'web_search', 'description': 'Search the web.',
     'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}, 'count': {'type': 'integer', 'minimum': 1, 'maximum': 10},
                                                     'fresh': {'type': 'boolean'}}, 'required': ['query']}}},
    {'type': 'function', 'function': {'name': 'set_reminder', 'description': 'Set a reminder.',
     'parameters': {'type': 'object', 'properties': {'when': {'type': 'string'}, 'text': {'type': 'string'},
                                                     'repeat': {'enum': ['none', 'daily', 'weekly']}}, 'required': ['when', 'text']}}},
]
TPL = os.path.join(NEW, 'models', 'templates', 'Qwen3.5-4B.jinja')  # Qwen 3.5 / 3.6's own template

def serve(tree, port):
    args = [bin_(tree, 'llama-server'), '-m', brain, '--port', str(port), '-c', '8192', '-np', '1', '-t', '4', '--jinja']
    if TPL: args += ['--chat-template-file', TPL]
    srv = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(240):
        try: urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=2); break
        except Exception: time.sleep(0.5)
    return srv

def chat(port, body):
    req = urllib.request.Request(f'http://127.0.0.1:{port}/v1/chat/completions', data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req, timeout=900))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code}: {e.read()[:400]!r}')

if brain:
    msgs = [{'role': 'system', 'content': 'You are Bob, a helpful assistant.'},
            {'role': 'user', 'content': 'Read my notes file and set a reminder for the first thing on it.'}]
    cases = [('tools, thinking off', dict(tools=TOOLS, chat_template_kwargs={'enable_thinking': False})),
             ('tools, thinking on', dict(tools=TOOLS)),
             ('tools required', dict(tools=TOOLS, tool_choice='required', chat_template_kwargs={'enable_thinking': False})),
             ('no tools', dict(chat_template_kwargs={'enable_thinking': False}))]
    got = {}
    for tag, tree, port in (('old', OLD, 18961), ('new', NEW, 18962)):
        srv = serve(tree, port)
        try:
            for name, extra in cases:
                d = chat(port, {'messages': msgs, 'temperature': 0, 'seed': 7, 'max_tokens': 300, 'cache_prompt': False, **extra})
                m = d['choices'][0]['message']; t = d.get('timings', {})
                got[(tag, name)] = (m.get('content'), m.get('reasoning_content'),
                                    [(c['function']['name'], c['function']['arguments']) for c in m.get('tool_calls') or []],
                                    t.get('prompt_n'), t.get('predicted_per_second'))
        finally:
            srv.terminate(); srv.wait()
    for name, _ in cases:
        o, n = got[('old', name)], got[('new', name)]
        check(f'server, {name}: same prompt length, words and calls', o[:4] == n[:4], (o[:4], n[:4]))
        print(f'     writing t/s {o[4] or 0:.1f} -> {n[4] or 0:.1f} (cloud, noisy)')
else:
    check('server A/B (tiny qwen35moe brain)', False, 'no brain')

print(f'{npass} passed, {nfail} failed')
sys.exit(1 if nfail else 0)
