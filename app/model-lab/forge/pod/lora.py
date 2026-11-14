"""Small LoRA for the heal step: LoRA on every linear layer in the text model, LoRA (or full training)
on the expert tensors, and a fully trainable router. Written here instead of using peft because the
experts are 3D parameters [experts, out, in], and the expert forward needs a fast grouped matmul.
GPT-OSS (14 Nov 2026): the same parts (attention LoRA, expert LoRA, trainable router with its bias), in GPT-OSS's own
layout, by replacing the MLP's forward (GptOssExpertsLoRA, gpt_oss_mlp_forward)."""
import math, types
import torch, torch.nn as nn, torch.nn.functional as F
import family as FAM

class LinearLoRA(nn.Module):
    def __init__(self, base: nn.Linear, r, alpha, dropout=0.0):
        super().__init__()
        self.base = base
        dev = base.weight.device  # the new weights must live where the model lives (the card), not on the CPU
        self.A = nn.Parameter(torch.empty(r, base.in_features, dtype=torch.float32, device=dev))
        self.B = nn.Parameter(torch.zeros(base.out_features, r, dtype=torch.float32, device=dev))
        nn.init.kaiming_uniform_(self.A, a=math.sqrt(5))
        self.scale = alpha / r; self.drop = nn.Dropout(dropout) if dropout else nn.Identity()
    def forward(self, x):
        y = self.base(x)
        return y + self.scale * F.linear(F.linear(self.drop(x), self.A.to(x.dtype)), self.B.to(x.dtype))
    def merge(self):
        with torch.no_grad():
            self.base.weight += (self.scale * (self.B @ self.A)).to(self.base.weight.dtype)
        return self.base

def _gmm_ok(device="cuda"):
    if not hasattr(torch, "_grouped_mm"): return False
    try:
        dt = torch.bfloat16 if device == "cuda" else torch.float32
        x = torch.randn(64, 32, device=device, dtype=dt, requires_grad=True)
        w = torch.randn(2, 32, 48, device=device, dtype=dt, requires_grad=True)
        offs = torch.tensor([32, 64], device=device, dtype=torch.int32)
        out = torch._grouped_mm(x, w, offs=offs)
        out.backward(torch.randn_like(out))  # a plain .sum() hands the kernel an expanded (stride-0) gradient it rejects; real training never does
        return True
    except Exception as e:
        print(f"grouped matmul not usable ({str(e)[:80]}); using the slow expert loop")
        return False

ALIGN = 16
try:  # gradient checkpointing stops a recompute early by raising this inside the forward: it must never count as a failure
    from torch.utils.checkpoint import _StopRecomputationError as _CkptStop
except Exception:
    class _CkptStop(Exception): pass

def gmm(x, w_t, offs):
    """x [N, in] sorted and padded by expert, w_t [E, in, out], offs int32 cumulative -> [N, out]"""
    return torch._grouped_mm(x, w_t, offs=offs)

class ExpertsLoRA(nn.Module):
    def __init__(self, experts, r, alpha, mode, use_gmm):
        super().__init__()
        E, O2, H = experts.gate_up_proj.shape; I = experts.down_proj.shape[2]
        self.mode = mode; self.use_gmm = use_gmm; self.scale = alpha / r
        if mode == "lora":
            dev = experts.gate_up_proj.device
            self.A_gu = nn.Parameter(torch.empty(E, r, H, dtype=torch.float32, device=dev)); self.B_gu = nn.Parameter(torch.zeros(E, O2, r, dtype=torch.float32, device=dev))
            self.A_d = nn.Parameter(torch.empty(E, r, I, dtype=torch.float32, device=dev)); self.B_d = nn.Parameter(torch.zeros(E, H, r, dtype=torch.float32, device=dev))
            for p in (self.A_gu, self.A_d): nn.init.kaiming_uniform_(p, a=math.sqrt(5))

    def apply(self, x, W, A, B, offs, idx):
        """x rows -> rows @ W^T (+ lora). Grouped: x sorted/padded, offs; loop: idx = expert id for the whole x."""
        if self.use_gmm:
            y = gmm(x, W.transpose(1, 2), offs)
            if A is not None:
                y = y + self.scale * gmm(gmm(x, A.transpose(1, 2).to(x.dtype), offs), B.transpose(1, 2).to(x.dtype), offs)
            return y
        y = F.linear(x, W[idx])
        if A is not None: y = y + self.scale * F.linear(F.linear(x, A[idx].to(x.dtype)), B[idx].to(x.dtype))
        return y

    def forward(self, experts, hidden_states, top_k_index, top_k_weights):
        E = experts.num_experts; T, H = hidden_states.shape; k = top_k_index.shape[1]
        A_gu, B_gu, A_d, B_d = (self.A_gu, self.B_gu, self.A_d, self.B_d) if self.mode == "lora" else (None,) * 4
        out = torch.zeros_like(hidden_states)
        flat_e = top_k_index.reshape(-1); flat_t = torch.arange(T, device=hidden_states.device).repeat_interleave(k); flat_w = top_k_weights.reshape(-1)
        if not self.use_gmm:
            for e in torch.unique(flat_e).tolist():
                sel = (flat_e == e).nonzero(as_tuple=True)[0]
                x = hidden_states[flat_t[sel]]
                g, u = self.apply(x, experts.gate_up_proj, A_gu, B_gu, None, e).chunk(2, dim=-1)
                y = self.apply(experts.act_fn(g) * u, experts.down_proj, A_d, B_d, None, e)
                out.index_add_(0, flat_t[sel], (y * flat_w[sel, None]).to(out.dtype))
            return out
        try:
            return self._grouped(experts, hidden_states, flat_e, flat_t, flat_w, out, A_gu, B_gu, A_d, B_d)
        except _CkptStop:
            raise
        except Exception as e:
            if not torch.is_grad_enabled(): raise
            print(f"grouped matmul failed in use ({str(e)[:100]}); switching to the slow expert loop", flush=True)
            self.use_gmm = False
            return self.forward(experts, hidden_states, top_k_index, top_k_weights)

    def _grouped(self, experts, hidden_states, flat_e, flat_t, flat_w, out, A_gu, B_gu, A_d, B_d):
        E = experts.num_experts; H = hidden_states.shape[1]
        with torch.no_grad():
            order = torch.argsort(flat_e, stable=True)
            e_sorted = flat_e[order]
            counts = torch.bincount(e_sorted, minlength=E)
            padded = (counts + ALIGN - 1) // ALIGN * ALIGN
            offs = torch.cumsum(padded, 0).to(torch.int32)
            start = torch.cumsum(counts, 0) - counts; pstart = offs - padded
            dest = pstart[e_sorted] + (torch.arange(len(order), device=order.device) - start[e_sorted])
            total = int(offs[-1].item())
        xs = hidden_states.new_zeros(total, H)
        xs = xs.index_copy(0, dest, hidden_states[flat_t[order]])
        g, u = self.apply(xs, experts.gate_up_proj, A_gu, B_gu, offs, None).chunk(2, dim=-1)
        y = self.apply(experts.act_fn(g) * u, experts.down_proj, A_d, B_d, offs, None)
        y = y[dest] * flat_w[order, None]
        return out.index_add_(0, flat_t[order], y.to(out.dtype))

    def merge(self, experts):
        if self.mode != "lora": return
        with torch.no_grad():
            experts.gate_up_proj += (self.scale * torch.bmm(self.B_gu, self.A_gu)).to(experts.gate_up_proj.dtype)
            experts.down_proj += (self.scale * torch.bmm(self.B_d, self.A_d)).to(experts.down_proj.dtype)

class GptOssExpertsLoRA(ExpertsLoRA):
    """GPT-OSS experts (14 Nov 2026): weights stored [E, in, out] (gate_up_proj [E, H, 2I], down_proj [E, I, H]) with a bias
    each, gate and up interleaved (even/odd columns), a clamped SwiGLU ((up + 1) * gate * sigmoid(1.702 gate)), and a router
    with a bias that softmaxes only the top-k logits. LoRA per expert: A [E, in, r], B [E, r, out]."""
    def __init__(self, experts, r, alpha, mode, use_gmm):
        nn.Module.__init__(self)
        E, H, O2 = experts.gate_up_proj.shape; I = experts.down_proj.shape[1]
        # the grouped matmul needs 16-byte rows: a rank that is not a multiple of 8 would fail part way through a forward, and a
        # switch to the loop then (under gradient checkpointing) makes the recompute differ from the first pass, so decide now
        self.mode = mode; self.use_gmm = use_gmm and (mode != "lora" or r % 8 == 0); self.scale = alpha / r
        if use_gmm and not self.use_gmm: print(f"expert LoRA rank {r} is not a multiple of 8: using the slow expert loop", flush=True)
        if mode == "lora":
            dev = experts.gate_up_proj.device
            self.A_gu = nn.Parameter(torch.empty(E, H, r, dtype=torch.float32, device=dev)); self.B_gu = nn.Parameter(torch.zeros(E, r, O2, dtype=torch.float32, device=dev))
            self.A_d = nn.Parameter(torch.empty(E, I, r, dtype=torch.float32, device=dev)); self.B_d = nn.Parameter(torch.zeros(E, r, H, dtype=torch.float32, device=dev))
            for p in (self.A_gu, self.A_d): nn.init.kaiming_uniform_(p.transpose(1, 2), a=math.sqrt(5))

    @staticmethod
    def act(ex, gate_up):
        gate, up = gate_up[..., ::2], gate_up[..., 1::2]
        gate = gate.clamp(max=ex.limit); up = up.clamp(min=-ex.limit, max=ex.limit)
        return (up + 1) * (gate * torch.sigmoid(gate * ex.alpha))

    def apply(self, x, W, bias, A, B, offs, idx, row_e=None):
        """x rows -> x @ W + bias (+ lora). W is [E, in, out] already, so no transpose."""
        if self.use_gmm:
            y = gmm(x, W, offs) + bias[row_e].to(x.dtype)
            if A is not None: y = y + self.scale * gmm(gmm(x, A.to(x.dtype), offs), B.to(x.dtype), offs)
            return y
        y = x @ W[idx] + bias[idx].to(x.dtype)
        if A is not None: y = y + self.scale * ((x @ A[idx].to(x.dtype)) @ B[idx].to(x.dtype))
        return y

    def forward(self, ex, hidden_states, top_k_index, top_k_weights):
        T, H = hidden_states.shape; k = top_k_index.shape[1]
        A_gu, B_gu, A_d, B_d = (self.A_gu, self.B_gu, self.A_d, self.B_d) if self.mode == "lora" else (None,) * 4
        out = torch.zeros_like(hidden_states)
        flat_e = top_k_index.reshape(-1); flat_t = torch.arange(T, device=hidden_states.device).repeat_interleave(k); flat_w = top_k_weights.reshape(-1)
        if self.use_gmm:
            try:
                E = ex.gate_up_proj.shape[0]
                with torch.no_grad():
                    order = torch.argsort(flat_e, stable=True); e_sorted = flat_e[order]
                    counts = torch.bincount(e_sorted, minlength=E); padded = (counts + ALIGN - 1) // ALIGN * ALIGN
                    offs = torch.cumsum(padded, 0).to(torch.int32); start = torch.cumsum(counts, 0) - counts; pstart = offs - padded
                    dest = pstart[e_sorted] + (torch.arange(len(order), device=order.device) - start[e_sorted])
                    row_e = torch.repeat_interleave(torch.arange(E, device=order.device), padded)
                xs = hidden_states.new_zeros(int(offs[-1].item()), H).index_copy(0, dest, hidden_states[flat_t[order]])
                h = self.act(ex, self.apply(xs, ex.gate_up_proj, ex.gate_up_proj_bias, A_gu, B_gu, offs, None, row_e))
                y = self.apply(h, ex.down_proj, ex.down_proj_bias, A_d, B_d, offs, None, row_e)[dest] * flat_w[order, None]
                return out.index_add_(0, flat_t[order], y.to(out.dtype))
            except _CkptStop:
                raise
            except Exception as e:  # e.g. a LoRA rank whose rows are not 16-byte aligned: the loop gives the same answer, slower
                print(f"grouped matmul failed in use ({str(e)[:100]}); switching to the slow expert loop", flush=True)
                self.use_gmm = False
        for e in torch.unique(flat_e).tolist():
            sel = (flat_e == e).nonzero(as_tuple=True)[0]
            x = hidden_states[flat_t[sel]]
            h = self.act(ex, self.apply(x, ex.gate_up_proj, ex.gate_up_proj_bias, A_gu, B_gu, None, e))
            y = self.apply(h, ex.down_proj, ex.down_proj_bias, A_d, B_d, None, e)
            out.index_add_(0, flat_t[sel], (y * flat_w[sel, None]).to(out.dtype))
        return out

    def merge(self, experts):
        if self.mode != "lora": return
        with torch.no_grad():
            experts.gate_up_proj += (self.scale * torch.bmm(self.A_gu, self.B_gu)).to(experts.gate_up_proj.dtype)
            experts.down_proj += (self.scale * torch.bmm(self.A_d, self.B_d)).to(experts.down_proj.dtype)

def gpt_oss_mlp_forward(self, hidden_states):
    """GptOssMLP with a trainable float router and the LoRA experts. Returns what the stock MLP returns
    ((out, router scores) in transformers 5.x; the layer keeps the first)."""
    shape = hidden_states.shape
    x = hidden_states.reshape(-1, shape[-1])
    r = self.router
    logits = F.linear(x.float(), r.weight.float(), r.bias.float())
    top_v, top_i = torch.topk(logits, r.top_k, dim=-1)
    w = torch.softmax(top_v, dim=-1).to(x.dtype)
    y = self.experts.lora(self.experts, x, top_i, w).reshape(shape)
    return (y, w) if self._bob_tuple else y

def router_forward(self, hidden_states):
    hidden_states = hidden_states.reshape(-1, self.hidden_dim)
    router_logits = F.linear(hidden_states.float(), self.weight.float())
    router_probs = torch.softmax(router_logits, dtype=torch.float, dim=-1)
    top_v, top_i = torch.topk(router_probs, self.top_k, dim=-1)
    top_v = top_v / top_v.sum(dim=-1, keepdim=True)
    return router_logits, top_v.to(hidden_states.dtype), top_i

def attach(model, r=32, alpha=64, experts="lora", router=True, linear=True, r_experts=8):
    """Freeze everything, then add trainable parts. Returns the list of trainable parameters."""
    for p in model.parameters(): p.requires_grad_(False)
    lm = FAM.base(model)
    use_gmm = _gmm_ok(next(model.parameters()).device.type)
    n = 0
    for layer in lm.layers:
        if linear:
            for mod in (getattr(layer, "self_attn", None), getattr(layer, "linear_attn", None), getattr(layer.mlp, "shared_expert", None), layer.mlp if not hasattr(layer.mlp, "experts") else None):
                if mod is None: continue
                for name, child in list(mod.named_children()):
                    if isinstance(child, nn.Linear) and child.out_features > 1:
                        setattr(mod, name, LinearLoRA(child, r, alpha)); n += 1
        if hasattr(layer.mlp, "router") and hasattr(layer.mlp, "experts"):  # GPT-OSS
            mlp, ex = layer.mlp, layer.mlp.experts
            if experts == "full":
                for p_ in (ex.gate_up_proj, ex.down_proj, ex.gate_up_proj_bias, ex.down_proj_bias): p_.requires_grad_(True)
            ex.lora = GptOssExpertsLoRA(ex, r_experts, alpha * r_experts // r if r else alpha, experts if experts == "lora" else "none", use_gmm)
            mlp._bob_tuple = _returns_tuple(mlp)
            mlp.forward = types.MethodType(gpt_oss_mlp_forward, mlp)
            if router:
                for p_ in (mlp.router.weight, mlp.router.bias): p_.data = p_.data.float(); p_.requires_grad_(True)
        elif hasattr(layer.mlp, "experts"):
            ex = layer.mlp.experts
            if experts in ("lora", "full"):
                ex.lora = ExpertsLoRA(ex, r_experts, alpha * r_experts // r if r else alpha, experts, use_gmm)
                ex.forward = types.MethodType(lambda self, h, i, w: self.lora(self, h, i, w), ex)
                if experts == "full":
                    ex.gate_up_proj.requires_grad_(True); ex.down_proj.requires_grad_(True)
            if router:
                g = layer.mlp.gate
                g.weight.data = g.weight.data.float(); g.weight.requires_grad_(True)
                g.forward = types.MethodType(router_forward, g)
    params = [p for p in model.parameters() if p.requires_grad]
    dev = next(iter(lm.embed_tokens.parameters())).device
    for p in params:
        if p.device != dev: p.data = p.data.to(dev)
    bad = [n for n, p in model.named_parameters() if p.device != dev]
    if bad: raise RuntimeError(f"{len(bad)} weights are not on {dev}, e.g. {bad[0]}")
    print(f"lora: {n} linear layers, experts={experts}, router={'trainable' if router else 'frozen'}, grouped_mm={use_gmm}; "
          f"{sum(p.numel() for p in params) / 1e6:.1f}M trainable of {sum(p.numel() for p in model.parameters()) / 1e9:.2f}B")
    return params

def _returns_tuple(mlp):
    """Ask the stock MLP once, on one word, whether it returns (out, scores) or out alone (it differs between versions)."""
    try:
        p = mlp.router.weight
        with torch.no_grad(): got = mlp(torch.zeros(1, 1, p.shape[1], device=p.device, dtype=mlp.experts.gate_up_proj.dtype))
        return isinstance(got, tuple)
    except Exception:
        return True

def merge_all(model):
    """Fold the LoRA into the weights and put the model back in its plain shape, ready to save."""
    lm = FAM.base(model)
    for layer in lm.layers:
        for mod in (getattr(layer, "self_attn", None), getattr(layer, "linear_attn", None), getattr(layer.mlp, "shared_expert", None), layer.mlp):
            if mod is None: continue
            for name, child in list(mod.named_children()):
                if isinstance(child, LinearLoRA): setattr(mod, name, child.merge())
        if hasattr(layer.mlp, "router") and hasattr(layer.mlp, "experts"):  # GPT-OSS
            ex = layer.mlp.experts
            if hasattr(ex, "lora"): ex.lora.merge(ex); del ex.lora
            if "forward" in layer.mlp.__dict__: del layer.mlp.forward
            dt = lm.embed_tokens.weight.dtype  # back to the model's own type (BF16 on the card)
            for p_ in (layer.mlp.router.weight, layer.mlp.router.bias, ex.gate_up_proj, ex.down_proj, ex.gate_up_proj_bias, ex.down_proj_bias): p_.data = p_.data.to(dt)
        elif hasattr(layer.mlp, "experts"):
            ex = layer.mlp.experts
            if hasattr(ex, "lora"):
                ex.lora.merge(ex); del ex.lora
                if "forward" in ex.__dict__: del ex.forward
            g = layer.mlp.gate
            if "forward" in g.__dict__: del g.forward
            g.weight.data = g.weight.data.to(torch.bfloat16)
    for p in model.parameters(): p.requires_grad_(False)

def trainable_state(model):
    return {k: v.detach().cpu() for k, v in model.named_parameters() if v.requires_grad}

def load_trainable(model, state):
    own = dict(model.named_parameters())
    for k, v in state.items():
        if k in own: own[k].data.copy_(v.to(own[k].device))
