#!/usr/bin/env python3
"""Expert scoring for the cut, shared by count.py and countskills.py.

Two things are recorded per expert and layer while the model reads the pieces:
  counts  how many times the router picked the expert (what the Forge has always counted).
  mass    the sum, over those picks, of the router's weight for the expert times the size (L2 norm) of what the expert
          wrote. This is the REAP numerator (Router-weighted Expert Activation Pruning, arXiv 2510.13999).
REAP's own score is the average per pick, mass / counts: an expert that is picked rarely but pushes hard scores high,
one that is picked often and barely changes anything scores low. keep.py turns these into a keep list (--by).

Scoring runs each picked expert a second time to measure its output, so the counting pass costs about twice the expert
work. It is off unless asked for (score=True). If the model's expert module is not laid out the way this expects
(one [experts, out, in] tensor each for gate_up_proj and down_proj), scoring switches itself off with one line in the
log and the counts carry on, so a run never dies here.
"""
import torch
import torch.nn.functional as F


class Scorer:
    def __init__(self, layers, E, device, score=False):
        self.E = E
        self.score = bool(score)
        self.counts = [torch.zeros(E, dtype=torch.long, device=device) if hasattr(l.mlp, "gate") else None for l in layers]
        self.mass = [torch.zeros(E, dtype=torch.float64, device=device) if c is not None else None for c in self.counts]
        self.hooks = []
        for i, l in enumerate(layers):
            if self.counts[i] is None: continue
            self.hooks.append(l.mlp.gate.register_forward_hook(self._count(i)))
            if not self.score: continue
            ex = getattr(l.mlp, "experts", None)
            if ex is None or not hasattr(ex, "gate_up_proj") or not hasattr(ex, "down_proj") or not hasattr(ex, "act_fn"):
                self._off("the expert weights are not one tensor per layer"); continue
            self.hooks.append(ex.register_forward_pre_hook(self._measure(i), with_kwargs=True))

    def _off(self, why):
        if self.score: print(f"REAP scoring is off for this run ({why}); counting picks only", flush=True)
        self.score = False

    def _count(self, i):
        def hook(mod, inp, out):
            self.counts[i] += torch.bincount(out[2].reshape(-1), minlength=self.E)
        return hook

    def _measure(self, i):
        def hook(mod, args, kwargs):
            if not self.score: return None
            try:
                hs = args[0] if len(args) > 0 else kwargs.get("hidden_states")
                idx = args[1] if len(args) > 1 else kwargs.get("top_k_index")
                w = args[2] if len(args) > 2 else kwargs.get("top_k_weights")
                add_mass(self.mass[i], mod.gate_up_proj, mod.down_proj, mod.act_fn, hs, idx, w)
            except Exception as e:  # never let the measuring stop a count
                self._off(str(e)[:120])
            return None
        return hook

    def zero(self):
        for c, m in zip(self.counts, self.mass):
            if c is not None: c.zero_(); m.zero_()

    def count_rows(self):
        return [c.tolist() if c is not None else None for c in self.counts]

    def mass_rows(self):
        """None when scoring was off (or switched itself off part way, when the numbers would be partial)."""
        if not self.score: return None
        return [[round(v, 6) for v in m.tolist()] if m is not None else None for m in self.mass]


def add_mass(mass, gate_up_proj, down_proj, act_fn, hidden_states, top_k_index, top_k_weights):
    """mass[e] += sum over the words that picked expert e of (router weight * |expert e's output|)."""
    H = hidden_states.shape[-1]
    hs = hidden_states.reshape(-1, H); T = hs.shape[0]
    idx = top_k_index.reshape(T, -1); k = idx.shape[1]
    flat_e = idx.reshape(-1); flat_w = top_k_weights.reshape(-1).double()
    flat_t = torch.arange(T, device=hs.device).repeat_interleave(k)
    for e in torch.unique(flat_e).tolist():
        sel = (flat_e == e).nonzero(as_tuple=True)[0]
        x = hs[flat_t[sel]]
        g, u = F.linear(x, gate_up_proj[e]).chunk(2, dim=-1)
        y = F.linear(act_fn(g) * u, down_proj[e])
        mass[e] += (y.float().norm(dim=-1).double() * flat_w[sel]).sum()
