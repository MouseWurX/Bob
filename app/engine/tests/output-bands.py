#!/usr/bin/env python3
# Brain Engine 0150 test: the output head in bands (bits by word). A tiny made-up dense brain (qwen3, 2 layers, 256 wide,
# the qwen2 word list from llama.cpp's models/ folder, random weights) is squeezed to q2_k, q4_k, q6_k and q8_0; then
# model-lab/forge/pod/word_bands.py cuts its head into bands. Checks that can see a fault:
#   - bands all of one type give exactly the same odds and words as the plain file of that type (reading many words:
#     the transposed path; writing one word at a time: the one-column path), also on the stand-in card (RPC);
#   - a mixed plan loads, answers, and sits between its cheapest and dearest types in drift;
#   - unband gives back a file that matches the candidate exactly;
#   - wrong files are refused with a clear message (rows missing, a band of the wrong width).
# Drift numbers on a random brain are mechanics only: real numbers come from a rental.
#   python3 engine/tests/output-bands.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
# It needs llama-quantize, llama-perplexity, llama-completion, llama-tokenize and ggml-rpc-server in <checkout>/build/bin.
import json, os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: output-bands.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='bands-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
POD = os.path.normpath(os.path.join(HERE, '..', '..', 'model-lab', 'forge', 'pod'))
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
os.makedirs(WORK, exist_ok=True)
fails = 0


def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''), flush=True)
    fails += not ok


def make_dense(out):
    vocab = GGUFReader(os.path.join(SRC, 'models', 'ggml-vocab-qwen2.gguf'))
    L, D, H, HKV, HD, FF = 2, 256, 4, 2, 64, 512
    w = GGUFWriter(out, 'qwen3')
    w.add_context_length(2048); w.add_embedding_length(D); w.add_block_count(L)
    w.add_feed_forward_length(FF); w.add_head_count(H); w.add_head_count_kv(HKV)
    w.add_key_length(HD); w.add_value_length(HD); w.add_rope_freq_base(10000.0); w.add_layer_norm_rms_eps(1e-6)
    w.add_file_type(0)
    n_vocab = 0
    for f in vocab.fields.values():
        if not f.name.startswith('tokenizer.'): continue
        if f.types[0] == GGUFValueType.ARRAY:
            v = f.contents(); w.add_array(f.name, v)
            if f.name == 'tokenizer.ggml.tokens': n_vocab = len(v)
        else: w.add_key_value(f.name, f.contents(), f.types[0])
    rng = np.random.default_rng(3)
    r = lambda *s, sc=0.06: (rng.standard_normal(s) * sc).astype(np.float32)
    w.add_tensor('token_embd.weight', r(n_vocab, D, sc=0.5))
    w.add_tensor('output_norm.weight', np.ones(D, np.float32))
    w.add_tensor('output.weight', r(n_vocab, D, sc=0.12))
    for i in range(L):
        p = f'blk.{i}.'
        w.add_tensor(p + 'attn_norm.weight', np.ones(D, np.float32))
        w.add_tensor(p + 'attn_q.weight', r(H * HD, D)); w.add_tensor(p + 'attn_k.weight', r(HKV * HD, D))
        w.add_tensor(p + 'attn_v.weight', r(HKV * HD, D)); w.add_tensor(p + 'attn_output.weight', r(D, H * HD))
        w.add_tensor(p + 'attn_q_norm.weight', np.ones(HD, np.float32)); w.add_tensor(p + 'attn_k_norm.weight', np.ones(HD, np.float32))
        w.add_tensor(p + 'ffn_norm.weight', np.ones(D, np.float32))
        w.add_tensor(p + 'ffn_gate.weight', r(FF, D)); w.add_tensor(p + 'ffn_up.weight', r(FF, D)); w.add_tensor(p + 'ffn_down.weight', r(D, FF))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()


def run(*args, ok_codes=(0,)):
    r = subprocess.run([str(a) for a in args], capture_output=True, text=True, errors='replace', timeout=1800)
    if r.returncode not in ok_codes: print(r.stdout[-1500:], r.stderr[-1500:])
    return r


def wb(*args):
    return run(sys.executable, os.path.join(POD, 'word_bands.py'), *args, '--llama-cpp', SRC, ok_codes=(0, 1))


base = os.path.join(WORK, 'dense-f32.gguf')
if not os.path.exists(base): make_dense(base)
text = os.path.join(WORK, 'text.txt')
words = 'the of and to in a is that for it as was with be by on not he this are or his from at which but have an they you were her she there would their we him been has when who will more no if out so said what up its about into than them can only other new some could time these two may then do first any my now such like our over man me even most made after also did many before must through back years where much your way well down should because each just those people how too little state good very make world still own see men work long get here between both life being under never day same another know while last might us great old year off come since against go came right used take three'
rng = np.random.default_rng(5)
with open(text, 'w') as f: f.write(' '.join(rng.choice(words.split(), 6000, p=None)))
prompt = 'the old man said that the people of the world'
cands = {}
for t in ('q2_k', 'q4_k', 'q6_k', 'q8_0'):
    cands[t] = os.path.join(WORK, f'dense-{t}.gguf')
    if not os.path.exists(cands[t]):
        check(f'llama-quantize --pure {t}', run(os.path.join(BIN, 'llama-quantize'), '--pure', base, cands[t], t.upper()).returncode == 0)
cand_args = [x for t in cands for x in ('--cand', cands[t])]

kld_base = os.path.join(WORK, 'base.kld')
PPL = [os.path.join(BIN, 'llama-perplexity'), '-f', text, '-c', '256', '-b', '256', '-t', '2', '--chunks', '12']
if not os.path.exists(kld_base): run(*PPL, '-m', base, '--kl-divergence-base', kld_base)


def kld(model, extra=()):
    r = run(*PPL, '-m', model, '--kl-divergence-base', kld_base, '--kl-divergence', *extra)
    m = re.search(r'Mean\s+KLD:\s+([-0-9.e]+)', r.stdout + r.stderr)
    s = re.search(r'Same top p:\s+([0-9.]+)', r.stdout + r.stderr)
    return (float(m.group(1)) if m else None, float(s.group(1)) if s else None, r)


def words_of(model, extra=()):
    r = run(os.path.join(BIN, 'llama-completion'), '-m', model, '-p', prompt, '-n', '24', '-no-cnv', '--temp', '0',
            '-t', '2', '-ngl', '0', '--seed', '1', *extra)
    return r.stdout, r


# word counts from the text (the same tokenizer as the brain)
counts = os.path.join(WORK, 'counts.json')
tok = run(os.path.join(BIN, 'llama-tokenize'), '-m', base, '-f', text, '--ids', '--log-disable', '--no-bos')
ids = [int(x) for x in re.findall(r'\d+', tok.stdout)]
json.dump({str(k): int(v) for k, v in zip(*np.unique(ids, return_counts=True))}, open(counts, 'w'))
check('word counts made', len(ids) > 1000, f'{len(ids)} tokens')

# 1. every band q4_k: the same as the plain q4_k file
plan_same = os.path.join(WORK, 'plan-q4.json')
r = wb('plan', '--base', base, '--cand', cands['q4_k'], '--counts', counts, '--bands', '16', '--same-as', 'q4_k', '--out', plan_same)
check('plan with one candidate', r.returncode == 0 and os.path.exists(plan_same), r.stderr[-400:])
plan = json.load(open(plan_same))
check('16 bands, every word once', len(plan['bands']) == 16 and sum(b['words'] for b in plan['bands']) == plan['n_vocab'] and
      len({x for b in plan['bands'] for x in b['rows']}) == plan['n_vocab'])
check('the top band holds the most common words (64 words, more of the text than the last band)',
      plan['bands'][0]['words'] == 64 and plan['bands'][0]['text_share'] > plan['bands'][-1]['text_share'],
      str([(b['words'], b['text_share']) for b in plan['bands']]))
banded_q4 = os.path.join(WORK, 'dense-q4_k-bands-q4.gguf')
r = wb('apply', '--gguf', cands['q4_k'], '--plan', plan_same, '--cand', cands['q4_k'], '--out', banded_q4)
check('apply writes and checks every row', r.returncode == 0 and 'every row checked' in r.stdout, r.stderr[-400:])
k_plain = kld(cands['q4_k']); k_band = kld(banded_q4)
r = run(os.path.join(BIN, 'llama-completion'), '-m', banded_q4, '-p', 'x', '-n', '1', '-no-cnv', '-t', '2', '-v')
check('banded file loads and says so (-v)', r.returncode == 0 and 'output head in 16 bands (bits by word)' in r.stderr, r.stderr[-600:])
check('all-q4_k bands: the same drift and top word as plain q4_k (many words at once)',
      k_plain[0] is not None and k_band[0] is not None and abs(k_plain[0] - k_band[0]) < 1e-6 and k_plain[1] == k_band[1],
      f'{k_plain[:2]} vs {k_band[:2]}')
w_plain, _ = words_of(cands['q4_k']); w_band, rb = words_of(banded_q4)
check('all-q4_k bands: the same words, one at a time', w_plain == w_band and len(w_plain) > len(prompt), w_band[-200:] + rb.stderr[-300:])

# 2. on the stand-in card (RPC): bands, positions and the head steps placed off the processor
PORT = 50263
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
try:
    card = ('--rpc', f'127.0.0.1:{PORT}', '-ngl', '99')
    w_card, rc = words_of(banded_q4, card)
    check('all-q4_k bands on the stand-in card: the same words', w_card == w_plain, w_card[-200:] + rc.stderr[-400:])
    k_card = kld(banded_q4, card)
    k_card_plain = kld(cands['q4_k'], card)
    check('all-q4_k bands on the stand-in card: the same drift as plain q4_k there',
          k_card[0] is not None and k_card_plain[0] is not None and abs(k_card[0] - k_card_plain[0]) < 1e-6, f'{k_card[:2]} vs {k_card_plain[:2]}')
finally:
    rpc.terminate()

# 3. a mixed plan the same size as a q4_k head
plan_mix = os.path.join(WORK, 'plan-mix.json')
r = wb('plan', '--base', base, *cand_args, '--counts', counts, '--bands', '16', '--same-as', 'q4_k', '--out', plan_mix)
check('mixed plan', r.returncode == 0, r.stderr[-400:])
pm = json.load(open(plan_mix))
check('mixed plan stays inside the q4_k head size', pm['used_bytes'] <= pm['budget_bytes'], f"{pm['used_bytes']} > {pm['budget_bytes']}")
types = [b['type'] for b in pm['bands']]
check('mixed plan uses more than one type, the top band not the cheapest', len(set(types)) > 1 and types[0] != 'q2_k', str(types))
check('the estimate says the mix beats one q4_k head', pm['estimated_drift'] < pm['same_size_one_type']['estimated_drift'],
      f"{pm['estimated_drift']} vs {pm['same_size_one_type']['estimated_drift']}")
banded_mix = os.path.join(WORK, 'dense-q4_k-bands-mix.gguf')
r = wb('apply', '--gguf', cands['q4_k'], '--plan', plan_mix, *cand_args, '--out', banded_mix)
check('mixed apply', r.returncode == 0 and 'every row checked' in r.stdout, r.stderr[-400:])
k_mix = kld(banded_mix); k_q2 = kld(cands['q2_k']); k_q8 = kld(cands['q8_0'])
print(f'drift (random brain, mechanics only): plain q4_k {k_plain[0]}, banded mix {k_mix[0]}, q2_k {k_q2[0]}, q8_0 {k_q8[0]}')
check('mixed bands load and answer', k_mix[0] is not None and words_of(banded_mix)[1].returncode == 0, k_mix[2].stderr[-400:])
sizes = {p: os.path.getsize(p) for p in (cands['q4_k'], banded_mix)}
check('the banded file is no bigger than the q4_k file (plus the positions and alignment)',
      sizes[banded_mix] <= sizes[cands['q4_k']] + 4 * plan['n_vocab'] + 64 * 1024, str(sizes))

# 4. unband: the q4_k head back, a plain file
stock = os.path.join(WORK, 'dense-unbanded.gguf')
r = wb('unband', '--gguf', banded_mix, '--cand', cands['q4_k'], '--out', stock)
k_stock = kld(stock)
check('unband gives the plain q4_k drift back', r.returncode == 0 and k_stock[0] is not None and abs(k_stock[0] - k_plain[0]) < 1e-6,
      f'{k_stock[:2]} vs {k_plain[:2]}')
check('unbanded file has no bands left', 'bands' not in k_stock[2].stderr and
      not any(t.name.startswith('output.band') for t in GGUFReader(stock).tensors))

# 5. refusals: a band missing (rows do not add up), a band of the wrong width
def edit(src, dst, drop=None, narrow=None):
    rr = GGUFReader(src); w = GGUFWriter(dst, 'qwen3')
    for k, f in rr.fields.items():
        if k.startswith('GGUF.') or k == 'general.architecture': continue
        t = f.types[0]; sub = f.types[-1] if t == GGUFValueType.ARRAY else None
        w.add_key_value(k, f.contents(), t, sub_type=sub)
    for t in rr.tensors:
        if t.name == drop: continue
        shape = list(reversed([int(x) for x in t.shape]))
        if t.name == narrow:
            w.add_tensor(t.name, np.zeros((shape[0], 128), np.float32)); continue
        w.add_tensor(t.name, t.data, raw_dtype=t.tensor_type)
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

last = f'output.band{len(plan["bands"]) - 1}.weight'
bad1 = os.path.join(WORK, 'bad-missing.gguf'); edit(banded_q4, bad1, drop=last)
r = run(os.path.join(BIN, 'llama-completion'), '-m', bad1, '-p', 'x', '-n', '1', '-no-cnv', ok_codes=(0, 1))
check('a band missing is refused, and says why', r.returncode != 0 and 'bands hold' in r.stderr, r.stderr[-300:])
bad2 = os.path.join(WORK, 'bad-narrow.gguf'); edit(banded_q4, bad2, narrow='output.band3.weight')
r = run(os.path.join(BIN, 'llama-completion'), '-m', bad2, '-p', 'x', '-n', '1', '-no-cnv', ok_codes=(0, 1))
check('a band of the wrong width is refused, and says why', r.returncode != 0 and 'wrong shape for a band' in r.stderr, r.stderr[-300:])
r = wb('apply', '--gguf', banded_q4, '--plan', plan_same, '--cand', cands['q4_k'], '--out', os.path.join(WORK, 'x.gguf'))
check('word_bands refuses to band a banded file', r.returncode != 0 and 'already banded' in (r.stdout + r.stderr))

print(f'{fails} failed' if fails else 'all passed')
sys.exit(1 if fails else 0)
