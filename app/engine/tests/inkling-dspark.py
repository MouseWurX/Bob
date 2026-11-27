#!/usr/bin/env python3
# Brain Engine 0092 test: Inkling 2 DSpark guess-ahead (upstream #32773 on b12359), only for an Inkling 2 brain.
# Tiny random brains, nothing downloaded: test-llama-archs writes an 8-layer inkling2 (and this script loops it, as in
# moe-loops.py), and this script writes a tiny Inkling2 DSpark draft in the layout of Unsloth's dspark-Inkling-2-Mini file
# (dspark_fuse, dspark_hidden_out, per-layer attn_k_ctx/attn_v_ctx, no fc, no lm head). It checks that:
#   - the Inkling drafter is picked for an Inkling target and drafts, with the head on the card's side (one graph per
#     block) and on the host (one small graph per word)
#   - greedy words with guess-ahead are the words without it (the target checks every guess), plain and looped brains
#   - a sampled answer (temperature 0.8, fixed seed) comes back and repeats with the same seed
#   - another brain's DSpark draft still gets the old drafter (no Inkling line), with the words of a run without it
#   python3 engine/tests/inkling-dspark.py <llama.cpp checkout with the patches, built> [work folder]
# The drafts of both Inkling paths were compared by hand with upstream #32773 on Nov 23 2026 (same tiny brains, cloud, CPU):
# the same drafted words at every position. Other DFlash/DSpark drafts drafted the same words before and after 0092.
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: inkling-dspark.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='inkdspark-')
os.makedirs(WORK, exist_ok=True)
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType

fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok

def copy_kv(r, w, rename=None, skip=()):
    for f in r.fields.values():
        if f.name.startswith('GGUF.') or f.name == 'general.architecture' or f.name in skip:
            continue
        name = rename(f.name) if rename else f.name
        t = f.types[0]
        w.add_array(name, f.contents()) if t == GGUFValueType.ARRAY else w.add_key_value(name, f.contents(), t)

# the targets: 8-layer inkling2, the same looped (layers 2 to 5 three times, 16 layer slots), and a dense qwen3
env = {**os.environ, 'TLA_FF': '64', 'TLA_LAYERS': '8', 'TLA_EXPERTS': '32', 'TLA_USED': '4'}
for arch in ('inkling2', 'qwen3'):
    subprocess.run([os.path.join(BIN, 'test-llama-archs'), '-a', arch, '-o', WORK + os.sep], env=env, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
plain, qwen = os.path.join(WORK, 'inkling2-moe.gguf'), os.path.join(WORK, 'qwen3-dense.gguf')
loop = os.path.join(WORK, 'loop.gguf')
r = GGUFReader(plain)
w = GGUFWriter(loop, 'inkling2_loop')
copy_kv(r, w, lambda n: n.replace('inkling2.', 'inkling2_loop.', 1) if n.startswith('inkling2.') else n, ('inkling2.attn_res.block_size',))
w.add_uint32('inkling2_loop.attn_res.block_size', 1)
START, END, RANK = 2, 6, 8
for k, v in (('start', START), ('end', END), ('count', 3), ('gate_rank', RANK)):
    w.add_uint32(f'inkling2_loop.loop.{k}', v)
for t in r.tensors:
    w.add_tensor(t.name, np.array(t.data), raw_dtype=t.tensor_type)
rng = np.random.default_rng(3)
E = int(r.fields['inkling2.embedding_length'].contents())
for il in range(START, END):
    w.add_tensor(f'blk.{il}.loop_msg_query.weight', (rng.standard_normal((4, E)) * 0.1).astype(np.float32))
    for c in ['q', 'k', 'v', 'ffn']:
        w.add_tensor(f'blk.{il}.loop_{c}_ctrl_down.weight', (rng.standard_normal((RANK, 2 * E)) * 0.1).astype(np.float32))
        w.add_tensor(f'blk.{il}.loop_{c}_ctrl_gain.weight', (rng.standard_normal((E, RANK)) * 0.1).astype(np.float32))
        w.add_tensor(f'blk.{il}.loop_{c}_ctrl_forget.weight', (rng.standard_normal((E, RANK)) * 0.1).astype(np.float32))
w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()
VP = int(r.fields['inkling2.vocab_size'].contents()); VU = int(r.fields['inkling2.vocab_size_unpadded'].contents())

def tokenizer(src, w):
    for f in GGUFReader(src).fields.values():
        if f.name.startswith('tokenizer.'):
            t = f.types[0]
            w.add_array(f.name, f.contents()) if t == GGUFValueType.ARRAY else w.add_key_value(f.name, f.contents(), t)
    w.add_uint32('tokenizer.ggml.mask_token_id', 127)

def draft_writer(path, E, L, FF, H, HD, block, taps, src):
    w = GGUFWriter(path, 'dflash'); A = 'dflash.'
    for k, v in (('context_length', 256), ('embedding_length', E), ('block_count', L), ('feed_forward_length', FF),
                 ('attention.head_count', H), ('attention.head_count_kv', H), ('attention.key_length', HD),
                 ('attention.value_length', HD), ('rope.dimension_count', HD), ('block_size', block)):
        w.add_uint32(A + k, v)
    w.add_float32(A + 'attention.layer_norm_rms_epsilon', 1e-5); w.add_float32(A + 'rope.freq_base', 10000.0)
    w.add_array(A + 'target_layers', taps)
    tokenizer(src, w)
    return w

def tensors(w, seed):
    rng = np.random.default_rng(seed)
    def T(name, *ne, s=0.08, ones=False):
        shape = tuple(reversed(ne))
        w.add_tensor(name, np.ones(shape, np.float32) if ones else (rng.standard_normal(shape) * s).astype(np.float32))
    return T

def base_layers(T, L, E, FF, H, HD):
    for i in range(L):
        b = f'blk.{i}.'
        T(b + 'attn_norm.weight', E, ones=True); T(b + 'attn_q.weight', E, H * HD); T(b + 'attn_k.weight', E, H * HD)
        T(b + 'attn_v.weight', E, H * HD); T(b + 'attn_output.weight', H * HD, E)
        T(b + 'attn_q_norm.weight', HD, ones=True); T(b + 'attn_k_norm.weight', HD, ones=True)
        T(b + 'ffn_norm.weight', E, ones=True); T(b + 'ffn_gate.weight', E, FF); T(b + 'ffn_down.weight', FF, E); T(b + 'ffn_up.weight', E, FF)

def ink_draft(path, taps):
    L, FF, H, HD, R = 2, 64, 4, 32, 16
    w = draft_writer(path, E, L, FF, H, HD, 8, taps, plain)
    w.add_uint32('dflash.vocab_size', VP); w.add_uint32('dflash.vocab_size_unpadded', VU)
    w.add_float32('dflash.final_logit_softcapping', 30.0); w.add_bool('dflash.sample_from_anchor', False)
    w.add_uint32('dflash.attention.sliding_window', 32); w.add_array('dflash.attention.sliding_window_pattern', [True] * L)
    T = tensors(w, 7)
    base_layers(T, L, E, FF, H, HD)
    for i in range(L):
        b = f'blk.{i}.'
        T(b + 'dflare_norm.weight', E, ones=True); T(b + 'attn_k_ctx.weight', E, H * HD); T(b + 'attn_v_ctx.weight', E, H * HD)
        T(b + 'attn_k_ctx_norm.weight', HD, ones=True)
    T('output_norm.weight', E, ones=True); T('mask_embd.weight', E); T('dspark_fuse.weight', len(taps), L + 1, s=1.0)
    T('dspark_norm.weight', E, ones=True); T('markov_w1.weight', R, VP); T('joint_proj.weight', 2 * E + 2 * R, 3 * R)
    T('joint_proj.bias', 3 * R); T('dspark_hidden_out.weight', R, E); T('dspark_hidden_out.bias', E)
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

def other_draft(path):  # an ordinary DSpark draft (fc + markov head) for the qwen3 target
    qe = int(GGUFReader(qwen).fields['qwen3.embedding_length'].contents())
    L, FF, H, HD, R = 1, 128, 4, 64, 16
    w = draft_writer(path, qe, L, FF, H, HD, 4, [0, 1], qwen)
    T = tensors(w, 11)
    base_layers(T, L, qe, FF, H, HD)
    T('fc.weight', 2 * qe, qe, s=0.05); T('enc.output_norm.weight', qe, ones=True); T('output_norm.weight', qe, ones=True)
    T('markov_w1.weight', R, 128); T('markov_w2.weight', R, 128, s=0.5)
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

ink_plain, ink_loop, dsp = (os.path.join(WORK, n) for n in ('ink-draft.gguf', 'ink-draft-loop.gguf', 'other-dspark.gguf'))
ink_draft(ink_plain, [2, 5, 8]); ink_draft(ink_loop, [4, 10, 16]); other_draft(dsp)

PROMPTS = ['hello world this is', 'one two three four five six seven eight nine ten eleven twelve']
port = [18700]
def run(tag, model, args, temp=0.0, seed=-1):
    port[0] += 1
    log = os.path.join(WORK, f'{tag}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', model, '-c', '512', '-np', '1', '-t', '2',
                          '--port', str(port[0])] + args, stdout=subprocess.DEVNULL, stderr=open(log, 'w'))
    out = None
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port[0]}/health', timeout=1).read(); break
            except Exception:
                if p.poll() is not None: break
                time.sleep(0.3)
        if p.poll() is None:
            out = []
            for pr in PROMPTS:
                body = {'prompt': pr, 'n_predict': 32, 'temperature': temp, 'seed': seed, 'cache_prompt': False}
                d = json.loads(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port[0]}/completion',
                    json.dumps(body).encode(), {'Content-Type': 'application/json'}), timeout=300).read())
                t = d.get('timings', {})
                out.append((d['content'], t.get('draft_n', 0)))
    finally:
        p.terminate()
        try: p.wait(timeout=30)
        except subprocess.TimeoutExpired: p.kill(); p.wait()
    return out, open(log).read()

words = lambda o: [c for c, _ in o] if o else None
drafted = lambda o: sum(n for _, n in o) if o else 0
SPEC = ['--spec-type', 'draft-dspark', '--spec-draft-n-max', '3']
for name, target, draft in (('plain', plain, ink_plain), ('looped', loop, ink_loop)):
    ref, _ = run(f'{name}-ref', target, [])
    check(f'{name} brain answers without guess-ahead', ref is not None, '')
    for side, extra in (('card side', ['--spec-draft-backend-sampling']), ('host', ['--no-spec-draft-backend-sampling'])):
        out, log = run(f'{name}-{side.replace(" ", "-")}', target, ['-md', draft] + SPEC + extra)
        check(f'{name}, head on the {side}: the Inkling drafter is used', 'Inkling2 DSpark: block_size=8' in log, log[-300:])
        check(f'{name}, head on the {side}: it drafts', drafted(out) > 0, f'{drafted(out)} drafted')
        check(f'{name}, head on the {side}: the same greedy words as without guess-ahead', words(out) == words(ref))
        a, _ = run(f'{name}-{side.replace(" ", "-")}-t1', target, ['-md', draft] + SPEC + extra, 0.8, 5)
        b, _ = run(f'{name}-{side.replace(" ", "-")}-t2', target, ['-md', draft] + SPEC + extra, 0.8, 5)
        check(f'{name}, head on the {side}: a sampled answer drafts and repeats with the same seed',
              a is not None and drafted(a) > 0 and words(a) == words(b))

ref, _ = run('qwen-ref', qwen, [])
out, log = run('qwen-dspark', qwen, ['-md', dsp, '--spec-type', 'draft-dspark', '--spec-draft-n-max', '3'])
check('another brain\'s DSpark draft gets the old drafter', "adding speculative implementation 'draft-dspark'" in log and 'Inkling2' not in log, log[-300:])
check('another brain\'s DSpark draft: it drafts, the same greedy words', drafted(out) > 0 and words(out) == words(ref))

print('all passed' if fails == 0 else f'{fails} failed')
sys.exit(1 if fails else 0)
