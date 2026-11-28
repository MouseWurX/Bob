#!/usr/bin/env python3
"""Heal a squeezed (2-bit, 3-bit...) GGUF brain WITHOUT changing a single stored code.

  heal_scales.py --teacher <full-precision HF dir> --gguf <squeezed.gguf> --calib <neutral text> --out <healed.gguf>
  heal_scales.py --teacher <dir> --gguf <file> --sessions sessions.jsonl --eval-text <neutral text> --out <healed.gguf>
  Options: --steps 400 --hours 2 --lr 1e-3 --ctx 512 --batch 4 --chunks 400 --eval-chunks 40 --topk 64
           --device cuda|cpu --dtype bf16|fp32 --no-norms --heal-embd --seed 1 --report heal-scales-report.json

Idea (credited, not ours): llamAmpere's 8 GB Qwen3.8-27B file (JakeATX, Nov 2026) keeps every quantized code frozen and
tunes only the fp16 scales already in the file plus the norm weights, so the small file's predictions match the
full-precision model on calibration text. The developer reports 12% less drift (KLD 0.0975 -> 0.0857). Scale-only tuning
after quantization is also in the literature (EfficientQAT's end-to-end step tunes only quantization step sizes).
This script does the same on STOCK GGUF types, so the healed file still loads in plain llama.cpp on CUDA, Vulkan, Metal
and the CPU: only scale bytes and norm floats change; sizes, types and every code stay the same.

How:
  1. Each healable tensor is split into fixed parts: W = d * A (+ dmin * B for the K types with a min), one d per block,
     straight from the file. A check proves the split rebuilds the file's own weights before anything is tuned.
  2. The teacher (the original full-precision HF model) reads the calibration text once; its top-K next-token
     probabilities are kept.
  3. Only the block scales and the norm weights learn, to match the teacher (KL on the top-K plus the rest).
  4. New scales are rounded to fp16 and written into a copy of the GGUF. The script re-reads the written file and checks it.

Rules (Bob project): calibration text must be public, neutral text (for example the imatrix text or wikitext), never the
held-out job sets, and never text written by Claude. This adds no personality and no new behaviour: the only target is
the brain's own full-precision self. Measure after with stock llama-perplexity --kl-divergence (commands in the report).

Agent sessions (--sessions, 27 Nov 2026, the owner: "healing on agent sessions is fine"): instead of plain text, heal on
replies the full-size brain wrote itself to public tool, coding and general tasks (agent_sessions.py). Only the tokens the
brain wrote are scored; the task text, tool lists and tool results are read but never scored. Training batches draw
agent sessions and general replies at --agent-share (0.7 = 70:30). The file is kept only if drift drops on the held-apart
sessions and, with --eval-text, does not rise more than --max-text-rise on plain text. Off by default, not in Turbo.

Merged and reordered tensors: with --llama-cpp <checkout> (the one whose converter made the GGUF), every GGUF tensor
is traced back to its HF values by running that converter on stand-in values (gguf_layout.py), so tensors the converter
merges, splits or reorders (Qwen3.5's gated-delta layers) heal too. Without it, only tensors with the same name and
order line up; the rest stay at the HF values in the student, and the report lists them. IQ1_M, MXFP4, NVFP4 and TQ types
are not healable (no plain per-block scale) and stay frozen.
"""
import argparse, json, math, os, random, shutil, sys, time

# With --llama-cpp, read and trace the GGUF with that checkout's own gguf-py (newer brains need its newer tensor names).
_lc = next((sys.argv[i + 1] for i, x in enumerate(sys.argv[:-1]) if x == '--llama-cpp'), None) or \
      next((x.split('=', 1)[1] for x in sys.argv if x.startswith('--llama-cpp=')), None)
if _lc: sys.path.insert(0, os.path.join(os.path.abspath(_lc), 'gguf-py'))
import numpy as np
import torch
import torch.nn.functional as F
import gguf
from gguf import GGUFReader, GGMLQuantizationType as Q, GGML_QUANT_SIZES
from gguf.quants import dequantize

# Byte offsets of the fp16 scale fields inside one block (ggml-common.h). The first is d; a second is dmin / m.
SCALE_OFFSETS = {
    Q.Q4_0: [0], Q.Q5_0: [0], Q.Q8_0: [0], Q.Q4_1: [0, 2], Q.Q5_1: [0, 2],
    Q.Q2_K: [80, 82], Q.Q3_K: [108], Q.Q4_K: [0, 2], Q.Q5_K: [0, 2], Q.Q6_K: [208],
    Q.IQ2_XXS: [0], Q.IQ2_XS: [0], Q.IQ2_S: [0], Q.IQ3_XXS: [0], Q.IQ3_S: [0], Q.IQ1_S: [0],
    Q.IQ4_NL: [0], Q.IQ4_XS: [0],
}
FLOAT_TYPES = (Q.F32, Q.F16, Q.BF16)


def field_str(r, k):
    f = r.fields.get(k)
    return None if f is None else bytes(f.parts[f.data[0]]).decode('utf-8')


def field_int(r, k):
    f = r.fields.get(k)
    return None if f is None else int(f.parts[f.data[0]][0])


def logical_shape(t):
    return tuple(int(x) for x in reversed(t.shape))  # ne is innermost-first; torch/HF order is the reverse


def raw_blocks(t):
    _, ts = GGML_QUANT_SIZES[t.tensor_type]
    return np.ascontiguousarray(np.asarray(t.data, dtype=np.uint8)).reshape(-1, ts)


def split_terms(t):
    """W = sum_k s_k * A_k per block. Returns (terms [(nblocks, bs) f32], scales [(nblocks,) f32], max rebuild error)."""
    qt = t.tensor_type; bs, ts = GGML_QUANT_SIZES[qt]; offs = SCALE_OFFSETS[qt]
    raw = raw_blocks(t)
    full = dequantize(raw.reshape(-1), qt).reshape(-1, bs).astype(np.float32)
    scales = [raw[:, o:o + 2].copy().view(np.float16).reshape(-1).astype(np.float32) for o in offs]
    terms = []
    for k in range(len(offs)):
        probe = raw.copy()
        for j, o in enumerate(offs):
            probe[:, o:o + 2] = np.full((raw.shape[0], 1), 1.0 if j == k else 0.0, dtype=np.float16).view(np.uint8)
        terms.append(dequantize(probe.reshape(-1), qt).reshape(-1, bs).astype(np.float32))
    rebuilt = sum(s[:, None] * a for s, a in zip(scales, terms))
    scale = float(np.abs(full).max()) or 1.0
    return terms, scales, float(np.abs(rebuilt - full).max()) / scale, full


def cosine(a, b):
    a = a.reshape(-1).astype(np.float64); b = b.reshape(-1).astype(np.float64)
    den = math.sqrt(float((a * a).sum()) * float((b * b).sum())) or 1.0
    return float((a * b).sum()) / den


class Healed:
    """One tensor whose block scales learn. Codes (the A/B parts) never change."""
    def __init__(self, name, gname, qtype, shape, terms, scales, dev, dtype):
        bs = GGML_QUANT_SIZES[qtype][0]
        self.name, self.gname, self.qtype, self.shape, self.dtype = name, gname, qtype, shape, dtype
        rows = int(np.prod(shape[:-1])); nb = shape[-1] // bs
        self.view = (rows, nb, bs)
        self.terms = [torch.from_numpy(a).reshape(self.view).to(dev) for a in terms]
        self.s0 = [torch.from_numpy(s).reshape(rows, nb).to(dev) for s in scales]
        self.t = [torch.zeros(rows, nb, device=dev, requires_grad=True) for _ in scales]

    def scales(self):
        return [s0 * (1 + t) for s0, t in zip(self.s0, self.t)]

    def weight(self):
        w = sum(s.unsqueeze(-1) * a for s, a in zip(self.scales(), self.terms))
        return w.reshape(self.shape).to(self.dtype)

    def round_fp16(self):
        """Snap the learned scales to what the file can hold, so eval-after measures the real file."""
        with torch.no_grad():
            out = []
            for s0, t in zip(self.s0, self.t):
                s16 = (s0 * (1 + t)).clamp(-65504, 65504).half()
                nz = s0 != 0
                t.copy_(torch.where(nz, s16.float() / torch.where(nz, s0, torch.ones_like(s0)) - 1, torch.zeros_like(t)))
                out.append(s16)
            return out

    def n_values(self):
        return sum(t.numel() for t in self.t)


class Frozen:
    """A squeezed tensor that can't learn (no plain block scale, or its split check failed): its file values, fixed."""
    def __init__(self, gname, value):
        self.gname, self.value = gname, value

    def weight(self):
        return self.value


class Norm:
    """A norm weight that learns a per-channel factor. mode 'same': file holds the HF value; 'plus1': file holds 1 + HF."""
    def __init__(self, name, gname, base, mode, dev, dtype):
        self.name, self.gname, self.mode, self.dtype = name, gname, mode, dtype
        self.base = torch.from_numpy(base.astype(np.float32)).to(dev)
        self.u = torch.zeros_like(self.base, requires_grad=True)

    def file_value(self):
        return self.base * (1 + self.u)

    def weight(self):
        v = self.file_value()
        return (v - 1 if self.mode == 'plus1' else v).to(self.dtype)

    def n_values(self):
        return self.u.numel()


def chunks_from_text(tok, path, ctx, limit):
    text = open(path, encoding='utf-8').read().replace('\r\n', '\n')
    ids = tok(text, add_special_tokens=False)['input_ids']
    out = [ids[i:i + ctx] for i in range(0, len(ids) - ctx + 1, ctx)]
    return [torch.tensor(c, dtype=torch.long) for c in out[:limit]]


@torch.no_grad()
def teacher_targets(model, chunks, topk, dev, batch):
    out = []
    for i in range(0, len(chunks), batch):
        x = torch.stack(chunks[i:i + batch]).to(dev)
        lp = torch.log_softmax(model(input_ids=x).logits.float(), dim=-1)
        v, ix = lp.topk(topk, dim=-1)
        for j in range(x.shape[0]):
            out.append((ix[j].to(torch.int32).cpu(), v[j].cpu()))
    return out


def kl_topk(student_logits, tid, tlp):
    """KL(teacher || student) over the teacher's top-K plus one 'everything else' bucket. Per position, mean."""
    s = torch.log_softmax(student_logits.float(), dim=-1)
    sk = s.gather(-1, tid.long())
    t = tlp.exp()
    kl = (t * (tlp - sk)).sum(-1)
    t_rest = (1 - t.sum(-1)).clamp_min(1e-9)
    s_rest = (1 - sk.exp().sum(-1)).clamp_min(1e-9)
    kl = kl + t_rest * (t_rest.log() - s_rest.log())
    return kl.mean()


def load_sessions(path, n_train, n_eval, max_len=1024):
    """agent_sessions.py rows: ids (task + reply) and start (first token the brain wrote)."""
    tr, ev = [], []
    for line in open(path, encoding='utf-8'):
        if not line.strip(): continue
        r = json.loads(line)
        ids, start = r['ids'], int(r['start'])
        # A long session is cut after max_len tokens (the end of the reply goes): a 4B brain with gradients on a
        # 2,000-token session ran out of a 48 GB card (28 Nov rerun). Sessions whose task alone is that long are skipped.
        if start > max_len - 16: continue
        ids = ids[:max_len]
        if not (0 < start < len(ids)): continue
        s = {'ids': torch.tensor(ids, dtype=torch.long), 'start': start, 'kind': r.get('kind', 'general')}
        (ev if r.get('split') == 'eval' else tr).append(s)
    # The writer sorts by task length: shuffle (fixed seed) so a limit keeps every kind, not just the shortest tasks.
    rng = random.Random(7); rng.shuffle(tr); rng.shuffle(ev)
    return tr[:n_train], ev[:n_eval]


def session_batch(items, batch, agent_share):
    """Draw a batch with about agent_share agent sessions and the rest general replies."""
    agent = [i for i, s in enumerate(items) if s['kind'] == 'agent']; gen = [i for i, s in enumerate(items) if s['kind'] != 'agent']
    out = []
    for _ in range(batch):
        pool = agent if (agent and (not gen or random.random() < agent_share)) else gen
        out.append(random.choice(pool))
    return out


@torch.no_grad()
def session_targets(model, items, topk, dev):
    """The teacher's top-K at every position whose NEXT token the brain wrote (positions start-1 .. end-2)."""
    out = []
    for s in items:
        x = s['ids'][None].to(dev); keep = len(s['ids']) - s['start'] + 1
        lp = torch.log_softmax(model(input_ids=x, logits_to_keep=keep).logits[0, :-1].float(), dim=-1)
        v, ix = lp.topk(topk, dim=-1)
        out.append((ix.to(torch.int32).cpu(), v.cpu()))
    return out


def session_kl(student, s, tgt, dev):
    keep = len(s['ids']) - s['start'] + 1
    logits = student(s['ids'][None].to(dev), keep)[0, :-1]
    return kl_topk(logits, tgt[0].to(dev), tgt[1].to(dev))


@torch.no_grad()
def eval_sessions(student, items, tgts, dev):
    kl, same, n, by = 0.0, 0, 0, {}
    for s, (tid, tlp) in zip(items, tgts):
        keep = len(s['ids']) - s['start'] + 1
        logits = student(s['ids'][None].to(dev), keep)[0, :-1]
        m = tid.shape[0]; k = kl_topk(logits, tid.to(dev), tlp.to(dev)).item() * m
        kl += k; n += m
        same += int((logits.argmax(-1).cpu() == tid[:, 0].long()).sum())
        b = by.setdefault(s['kind'], [0.0, 0]); b[0] += k; b[1] += m
    return {'kl_topk': kl / n, 'same_top': same / n, 'tokens': n, 'by_kind': {k: v[0] / v[1] for k, v in by.items()}}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--teacher', required=True, help='full-precision HF model dir (the brain the GGUF was made from)')
    ap.add_argument('--gguf', required=True, help='the squeezed GGUF to heal')
    ap.add_argument('--calib', default='', help='public neutral text, never held-out jobs, never Claude-written')
    ap.add_argument('--eval-text', default='', help='separate text for before/after numbers (default: last chunks of --calib)')
    ap.add_argument('--sessions', default='', help='agent_sessions.py output instead of --calib: score only what the brain wrote')
    ap.add_argument('--session-max-len', type=int, default=1024, help='with --sessions: cut sessions after this many tokens')
    ap.add_argument('--agent-share', type=float, default=0.7, help='with --sessions: share of agent sessions in each batch')
    ap.add_argument('--measure', action='store_true', help='only measure the file (no tuning, nothing written): drift on '
                    'the sessions and --eval-text, with the file\'s own norms even when healing moved them')
    ap.add_argument('--max-text-rise', type=float, default=0.02,
                    help='with --sessions and --eval-text: keep only if plain-text drift rises no more than this share')
    ap.add_argument('--out', default='', help='the healed GGUF to write (not with --measure)')
    ap.add_argument('--steps', type=int, default=400); ap.add_argument('--hours', type=float, default=2.0)
    ap.add_argument('--lr', type=float, default=2e-4); ap.add_argument('--norm-lr', type=float, default=2e-4)
    ap.add_argument('--check-every', type=int, default=50, help='measure drift on a held-back slice of the practice set every '
                    'N steps and keep the best step (never worse than the start)')
    ap.add_argument('--check-items', type=int, default=24, help='practice chunks or sessions held back for that check')
    ap.add_argument('--ctx', type=int, default=512); ap.add_argument('--batch', type=int, default=4)
    ap.add_argument('--chunks', type=int, default=400); ap.add_argument('--eval-chunks', type=int, default=40)
    ap.add_argument('--topk', type=int, default=64)
    ap.add_argument('--device', default='cuda' if torch.cuda.is_available() else 'cpu')
    ap.add_argument('--dtype', default='', help='bf16 or fp32 (default bf16 on cuda, fp32 on cpu)')
    ap.add_argument('--no-norms', action='store_true'); ap.add_argument('--heal-embd', action='store_true')
    ap.add_argument('--min-cos', type=float, default=0.6, help='a file tensor must look like its HF tensor this much to line up')
    ap.add_argument('--seed', type=int, default=1); ap.add_argument('--report', default='')
    ap.add_argument('--llama-cpp', default='', help='llama.cpp checkout whose converter made the GGUF: lines up merged and '
                    'reordered tensors (Qwen3.5 gated-delta layers) by running its own conversion on stand-in values')
    ap.add_argument('--keep-mtp', action='store_true', help='with --llama-cpp: the GGUF kept the MTP layers')
    a = ap.parse_args()

    if not a.out and not a.measure: sys.exit('--out is needed (or --measure to only measure)')
    if bool(a.calib) == bool(a.sessions): sys.exit('give --calib (plain text) or --sessions (agent_sessions.py), one of them')
    for f in (a.calib, a.sessions, a.eval_text):
        if f and any(w in os.path.basename(f).lower() for w in ('held-out', 'heldout', 'held_out')):
            sys.exit('refusing: that file looks like a held-out set. Held-out jobs are never used to tune a brain.')
    random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed)
    dev = torch.device(a.device)
    dtype = {'bf16': torch.bfloat16, 'fp32': torch.float32}[a.dtype or ('bf16' if dev.type == 'cuda' else 'fp32')]
    t_start = time.time()

    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(a.teacher)
    model = AutoModelForCausalLM.from_pretrained(a.teacher, dtype=dtype).to(dev).eval()
    for p in model.parameters(): p.requires_grad_(False)

    r = GGUFReader(a.gguf)
    arch_name = field_str(r, 'general.architecture')
    arch = next((k for k, v in gguf.MODEL_ARCH_NAMES.items() if v == arch_name), None)
    if arch is None: sys.exit(f'unknown GGUF architecture {arch_name}')
    tmap = gguf.get_tensor_name_map(arch, field_int(r, f'{arch_name}.block_count'))
    gt = {t.name: t for t in r.tensors}

    healed, frozen, norms, skipped = [], {}, [], []
    params = dict(model.named_parameters())
    sources = {}     # HF param -> 'whole' source (same order) or [(source, gguf_pos, hf_pos)]: how the student builds it
    traced = set()   # GGUF tensors already handled through the converter's layout
    if a.llama_cpp:
        from gguf_layout import trace_layout
        layout = trace_layout(a.llama_cpp, a.teacher, no_mtp=not a.keep_mtp)
        norm = lambda n: n.replace('language_model.', '').removeprefix('model.')
        by_norm = {norm(n): n for n in params}
        for gname, e in layout.items():
            t = gt.get(gname)
            if t is None or t.tensor_type in FLOAT_TYPES: continue
            shape = logical_shape(t)
            if shape != tuple(e['shape']):
                skipped.append({'name': gname, 'why': f'traced shape {tuple(e["shape"])} vs file {shape}'}); continue
            parts = [(e['same'], None, None)] if 'same' in e else e['parts']
            if any(norm(hn) not in by_norm for hn, _, _ in parts):
                skipped.append({'name': gname, 'why': 'its HF tensor is not in the loaded model'}); continue
            hf_in_g = np.zeros(int(np.prod(shape)), np.float32)
            for hn, gpos, hpos in parts:
                hv = params[by_norm[norm(hn)]].detach().float().cpu().numpy().reshape(-1)
                if gpos is None: hf_in_g[:] = hv
                else: hf_in_g[gpos] = hv[hpos]
            healable = t.tensor_type in SCALE_OFFSETS and (a.heal_embd or 'token_embd' not in gname)
            if healable: terms, sc, err, full = split_terms(t)
            else: full = dequantize(np.asarray(t.data), t.tensor_type).astype(np.float32); err = 0.0
            cos = cosine(full, hf_in_g)
            if cos < a.min_cos:
                skipped.append({'name': gname, 'why': f'does not line up with HF through the converter (cosine {cos:.3f})'}); continue
            if healable and err < 1e-3:
                src = Healed(gname, gname, t.tensor_type, shape, terms, sc, dev, dtype); healed.append(src)
            else:
                if healable: skipped.append({'name': gname, 'why': f'scale split check failed (error {err:.2e}); frozen'})
                src = Frozen(gname, torch.from_numpy(full.reshape(shape)).to(dev, dtype)); frozen[gname] = src
            for hn, gpos, hpos in parts:
                pn = by_norm[norm(hn)]
                if gpos is None: sources[pn] = src
                else:
                    lst = sources.setdefault(pn, [])
                    lst.append((src, torch.from_numpy(gpos).to(dev), torch.from_numpy(hpos).to(dev)))
            traced.add(gname)
    for name, p in model.named_parameters():
        if name in sources: continue
        gname = tmap.get_name(name, try_suffixes=('.weight', '.bias'))
        t = gt.get(gname) if gname else None
        if t is None or gname in traced: continue
        shape = logical_shape(t)
        if t.tensor_type in FLOAT_TYPES:
            if a.no_norms or len(shape) != 1 or 'norm' not in gname or shape != tuple(p.shape): continue
            base = np.asarray(t.data, dtype=np.float32).reshape(-1); hf = p.detach().float().cpu().numpy().reshape(-1)
            tol = 1e-2 * max(1.0, float(np.abs(hf).max()))
            mode = 'same' if np.abs(base - hf).max() < tol else 'plus1' if np.abs(base - (hf + 1)).max() < tol else None
            if mode is None and a.measure:   # a healed file's norms moved away from the teacher's: use the file's own
                mode = 'same' if np.abs(base - hf).mean() <= np.abs(base - (hf + 1)).mean() else 'plus1'
            if mode: norms.append(Norm(name, gname, base, mode, dev, dtype))
            else: skipped.append({'name': gname, 'why': 'norm does not line up'})
            continue
        if shape != tuple(p.shape):
            skipped.append({'name': gname, 'why': f'shape {shape} vs HF {tuple(p.shape)}'}); continue
        hfw = p.detach().float().cpu().numpy()
        healable = t.tensor_type in SCALE_OFFSETS and (a.heal_embd or 'token_embd' not in gname)
        if healable:
            terms, scales, err, full = split_terms(t)
        else:
            full = dequantize(np.asarray(t.data), t.tensor_type).astype(np.float32); err = 0.0
        cos = cosine(full, hfw)
        if cos < a.min_cos:
            skipped.append({'name': gname, 'why': f'does not line up with HF (cosine {cos:.3f}); kept HF values'}); continue
        if healable and err < 1e-3:
            src = Healed(name, gname, t.tensor_type, shape, terms, scales, dev, dtype); healed.append(src)
        else:
            if healable: skipped.append({'name': gname, 'why': f'scale split check failed (error {err:.2e}); frozen'})
            src = Frozen(gname, torch.from_numpy(full.reshape(shape)).to(dev, dtype)); frozen[gname] = src
        sources[name] = src
    n_scale = sum(h.n_values() for h in healed); n_norm = sum(n.n_values() for n in norms)
    print(f'healable tensors {len(healed)} ({n_scale:,} scales), norms {len(norms)} ({n_norm:,}), '
          f'frozen squeezed {len(frozen)}, not lined up {len(skipped)}, traced through the converter {len(traced)}', flush=True)
    if not healed: sys.exit('nothing to heal: no tensor lined up with the teacher')

    sess_train, sess_eval, calib, evalc = [], [], [], []
    if a.sessions:
        sess_train, sess_eval = load_sessions(a.sessions, a.chunks, a.eval_chunks, a.session_max_len)
        if not sess_train or not sess_eval: sys.exit('not enough sessions: need some in the train and the eval split')
        if a.eval_text: evalc = chunks_from_text(tok, a.eval_text, a.ctx, a.eval_chunks)
        print(f'teacher reads {len(sess_train)} + {len(sess_eval)} sessions '
              f'({sum(1 for s in sess_train if s["kind"] == "agent")} agent in train), {len(evalc)} text chunks', flush=True)
        tgt_sess_train = session_targets(model, sess_train, a.topk, dev)
        tgt_sess_eval = session_targets(model, sess_eval, a.topk, dev)
    else:
        calib = chunks_from_text(tok, a.calib, a.ctx, a.chunks + (0 if a.eval_text else a.eval_chunks))
        if a.eval_text:
            evalc = chunks_from_text(tok, a.eval_text, a.ctx, a.eval_chunks)
        else:
            evalc, calib = calib[-a.eval_chunks:], calib[:-a.eval_chunks]
        if len(calib) < 1 or len(evalc) < 1: sys.exit('not enough calibration text for --ctx')
        print(f'teacher reads {len(calib)} + {len(evalc)} chunks of {a.ctx} tokens', flush=True)
        tgt_train = teacher_targets(model, calib, a.topk, dev, a.batch)
    tgt_eval = teacher_targets(model, evalc, a.topk, dev, a.batch) if evalc else []
    # A slice of the practice set is held back to pick the best step (the eval set only reports, never picks).
    nc = min(a.check_items, max(0, (len(sess_train) or len(calib)) // 5))
    if sess_train:
        chk, tgt_chk = sess_train[-nc:] if nc else [], tgt_sess_train[-nc:] if nc else []
        if nc: sess_train, tgt_sess_train = sess_train[:-nc], tgt_sess_train[:-nc]
    else:
        chk, tgt_chk = calib[-nc:] if nc else [], tgt_train[-nc:] if nc else []
        if nc: calib, tgt_train = calib[:-nc], tgt_train[:-nc]

    # An HF tensor only partly built from the file keeps the teacher's values for the rest (counted in the report).
    partial = []
    for pn, src in sources.items():
        if isinstance(src, list) and sum(int(hp.numel()) for _, _, hp in src) != params[pn].numel(): partial.append(pn)
    shapes = {pn: tuple(params[pn].shape) for pn in sources}
    # The teacher's own copies of the replaced tensors are no longer needed.
    replaced = (set(sources) - set(partial)) | {n.name for n in norms}
    keep = {pn: params[pn].detach().reshape(-1) for pn in partial}
    for name, p in model.named_parameters():
        if name in replaced: p.data = torch.empty(0, device=dev, dtype=p.dtype)

    from torch.func import functional_call

    def student(x, last=0):
        built, cache = {}, {}
        w = lambda s: cache.setdefault(id(s), s.weight())
        for pn, src in sources.items():
            if not isinstance(src, list): built[pn] = w(src).reshape(shapes[pn]); continue
            flat = keep[pn].clone() if pn in keep else torch.zeros(int(np.prod(shapes[pn])), device=dev, dtype=dtype)
            for s_, gp, hp in src: flat = flat.index_put((hp,), w(s_).reshape(-1)[gp])
            built[pn] = flat.reshape(shapes[pn])
        for n in norms: built[n.name] = n.weight()
        kw = {'input_ids': x}
        if last: kw['logits_to_keep'] = last
        return functional_call(model, built, (), kw).logits

    @torch.no_grad()
    def evaluate():
        if sess_eval:
            r = eval_sessions(student, sess_eval, tgt_sess_eval, dev)
            if evalc: r['text'] = evaluate_text()
            return r
        return evaluate_text()

    @torch.no_grad()
    def evaluate_text():
        kl, same, n = 0.0, 0, 0
        for i in range(0, len(evalc), a.batch):
            x = torch.stack(evalc[i:i + a.batch]).to(dev); logits = student(x)
            for j in range(x.shape[0]):
                tid, tlp = tgt_eval[i + j]
                kl += kl_topk(logits[j], tid.to(dev), tlp.to(dev)).item() * x.shape[1]
                same += int((logits[j].argmax(-1).cpu() == tid[:, 0].long()).sum()); n += x.shape[1]
        return {'kl_topk': kl / n, 'same_top': same / n, 'tokens': n}

    @torch.no_grad()
    def check():
        if not chk: return 0.0
        if sess_train: return eval_sessions(student, chk, tgt_chk, dev)['kl_topk']
        kl, n = 0.0, 0
        for x, (tid, tlp) in zip(chk, tgt_chk):
            lg = student(x[None].to(dev))[0]; kl += kl_topk(lg, tid.to(dev), tlp.to(dev)).item() * len(x); n += len(x)
        return kl / n

    before = evaluate(); print('before', before, flush=True)
    if a.measure:
        path = a.report or os.path.splitext(a.gguf)[0] + '-measure.json'
        json.dump({'gguf': a.gguf, 'sessions': a.sessions, 'eval_text': a.eval_text, 'calib': a.calib, 'drift': before},
                  open(path, 'w'), indent=1)
        print('measured', path); return
    groups = [{'params': [t for h in healed for t in h.t], 'lr': a.lr}]
    if norms: groups.append({'params': [n.u for n in norms], 'lr': a.norm_lr})
    opt = torch.optim.Adam(groups)
    learn = [t for h in healed for t in h.t] + [n.u for n in norms]
    best_kl, best_step, best_state = check(), 0, [t.detach().clone() for t in learn]
    print(f'check slice ({len(chk)} held back): {best_kl:.5f} at the start', flush=True)
    step, deadline = 0, t_start + a.hours * 3600
    while step < a.steps and time.time() < deadline:
        opt.zero_grad()
        if sess_train:   # one session at a time (lengths differ); weighted by the tokens each one scores
            idx = session_batch(sess_train, a.batch, a.agent_share)
            n_tok = sum(len(sess_train[i]['ids']) - sess_train[i]['start'] for i in idx)
            loss = 0.0
            for i in idx:
                w = (len(sess_train[i]['ids']) - sess_train[i]['start']) / n_tok
                l = session_kl(student, sess_train[i], tgt_sess_train[i], dev) * w
                l.backward(); loss += l.detach()
        else:            # one chunk at a time: a 4B brain at 4 x 512 tokens ran out of a 48 GB card (27 Nov pilot)
            idx = random.sample(range(len(calib)), min(a.batch, len(calib)))
            loss = 0.0
            for i in idx:
                lg = student(calib[i][None].to(dev))[0]
                l = kl_topk(lg, tgt_train[i][0].to(dev), tgt_train[i][1].to(dev)) / len(idx)
                l.backward(); loss += l.detach()
        opt.step(); step += 1
        if step % 25 == 0 or step == 1: print(f'step {step} kl {float(loss):.5f} ({time.time()-t_start:.0f}s)', flush=True)
        if chk and (step % a.check_every == 0 or step == a.steps):
            k = check(); better = k < best_kl
            print(f'check at step {step}: {k:.5f}' + (' (best so far)' if better else ''), flush=True)
            if better: best_kl, best_step, best_state = k, step, [t.detach().clone() for t in learn]
    if chk:
        with torch.no_grad():
            for t, b in zip(learn, best_state): t.copy_(b)
        print(f'keeping step {best_step} (check slice {best_kl:.5f})', flush=True)

    s16 = {h.gname: h.round_fp16() for h in healed}
    after = evaluate(); print('after (fp16 scales)', after, flush=True)
    kept = after['kl_topk'] < before['kl_topk']
    if kept and 'text' in after and after['text']['kl_topk'] > before['text']['kl_topk'] * (1 + a.max_text_rise):
        kept = False
        print(f'drift on the sessions dropped but plain-text drift rose more than {a.max_text_rise:.0%}: writing nothing', flush=True)
    elif not kept:
        print('healing did not lower drift on the eval ' + ('sessions' if sess_eval else 'text') + ': writing nothing', flush=True)
    else:
        shutil.copyfile(a.gguf, a.out)
        w = GGUFReader(a.out, 'r+'); wt = {t.name: t for t in w.tensors}
        for h in healed:
            t = wt[h.gname]; _, ts = GGML_QUANT_SIZES[t.tensor_type]
            blocks = np.asarray(t.data).reshape(-1, ts)
            for o, s in zip(SCALE_OFFSETS[t.tensor_type], s16[h.gname]):
                blocks[:, o:o + 2] = s.reshape(-1, 1).cpu().numpy().view(np.uint8)
        for n in norms:
            t = wt[n.gname]; t.data[...] = n.file_value().detach().cpu().numpy().reshape(t.data.shape).astype(t.data.dtype)
        w.data.flush(); del w, wt
        # Re-read the written file: every healed tensor must equal what the student used.
        chk = {t.name: t for t in GGUFReader(a.out).tensors}; worst = 0.0
        for h in healed:
            got = dequantize(np.asarray(chk[h.gname].data), h.qtype).reshape(h.shape)
            want = h.weight().detach().float().cpu().numpy()
            worst = max(worst, float(np.abs(got - want).max()) / (float(np.abs(want).max()) or 1.0))
        print(f'written file check: worst relative difference {worst:.2e}', flush=True)
        if worst > 1e-2: sys.exit('written file does not match the healed scales: do not use it')

    rep = {'when': time.strftime('%Y-%m-%d %H:%M'), 'args': vars(a), 'steps': step, 'best_step': best_step if chk else step, 'seconds': round(time.time() - t_start),
           'healed_tensors': len(healed), 'scales_tuned': n_scale, 'norms_tuned': len(norms), 'norm_values': n_norm,
           'frozen_squeezed_tensors': len(frozen), 'not_lined_up': skipped, 'partly_from_teacher': partial,
           'traced_through_converter': len(traced), 'before': before, 'after': after,
           'written': a.out if kept else None,
           'next': ['llama-perplexity -m <full-precision.gguf> -f <eval text> --kl-divergence-base base.kld',
                    f'llama-perplexity -m {a.gguf} -f <eval text> --kl-divergence-base base.kld --kl-divergence',
                    f'llama-perplexity -m {a.out} -f <eval text> --kl-divergence-base base.kld --kl-divergence',
                    'then the publish gate and the real-jobs run; drift numbers alone never decide']}
    path = a.report or os.path.splitext(a.out)[0] + '-heal-scales-report.json'
    json.dump(rep, open(path, 'w'), indent=1); print('report', path)


if __name__ == '__main__':
    main()
