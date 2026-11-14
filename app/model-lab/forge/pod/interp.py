#!/usr/bin/env python3
"""Riker's inner stream, read and taken apart (14 Nov, the owner: "Research next steps: patching and sparse-autoencoder features").
Runs on the pod before the brain is served. Read only: nothing is written to the brain, nothing trains it.

1. Patching means: llama-act-dump (pod patch 0015) reads the stream after every layer for the labelled asks (the same ask
   with a cruel persona, a kind persona, and Bob's plain prompt). The mean over each ask's own words (after the user marker)
   per layer and group goes to patch-means.json: the PC adds (cruel - kind) at ONE layer at a time with the live control
   vector (0014) to find which layers carry the cruelty.
2. Sparse autoencoders (TopK, Gao et al. 2024) on a few layers, trained on everything in prompts.txt (Bob lessons + the asks):
   each token's stream is rebuilt from at most k of m features. Per layer: how much of the stream they explain, how many
   features never fire, and the features that fire most more under the cruel persona than the kind one, each with its
   decoder direction (for the PC to push), its usual strength, and the text where it fires hardest (plain words to read).
SURGERY RECORD ONLY: never lessons, odds or pairs. The activations stay in --work and are deleted at the end.

python3 interp.py --model <gguf> --act <llama-act-dump> --in <dir with prompts.txt, labels.json> --out <dir> --work <dir>
                  [--sae-layers 10,20,30] [--features 16384] [--k 32] [--epochs 3] [--max-tokens 256] [--top 24]
"""
import argparse, json, os, shutil, subprocess, sys, time
import numpy as np


def run_dump(act, model, prompts, layers, out, max_tokens, extra):
    os.makedirs(out, exist_ok=True)
    cmd = [act, "-m", model, "--act-prompts", prompts, "--act-layers", ",".join(map(str, layers)), "--act-out", out,
           "--act-max", str(max_tokens), "-c", str(max(max_tokens, 512)), "-ngl", "999"] + extra
    t = time.time(); r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"llama-act-dump failed ({r.returncode}): {(r.stderr or r.stdout)[-600:]}")
    info = json.load(open(os.path.join(out, "info.json")))
    print(f"act-dump: {info['prompts']} prompts, {info['tokens']} tokens, {len(layers)} layers in {time.time() - t:.0f}s", flush=True)
    return info


def load_index(d):
    return [json.loads(l) for l in open(os.path.join(d, "index.jsonl"), encoding="utf-8")]


def ask_start(tokens):
    """the first token of the ask's own words: after the last <|im_start|> user marker (the persona's words never count)"""
    for i in range(len(tokens) - 1, 0, -1):
        if tokens[i].strip() == "user" and "<|im_start|>" in tokens[i - 1]:
            return i + 1
    return 0


def layer_rows(d, layer, n_embd):
    return np.memmap(os.path.join(d, f"layer-{layer}.f16"), dtype=np.float16, mode="r").reshape(-1, n_embd)


def group_means(d, info, idx, groups):
    """per layer, per group: the mean stream over the asks' own words"""
    E, offs = info["n_embd"], np.cumsum([0] + [x["n"] for x in idx])
    spans = {p: (offs[i] + ask_start(x["tokens"]), offs[i + 1]) for i, x in enumerate(idx) for p in [x["p"]]}
    out = {}
    for L in info["layers"]:
        a = layer_rows(d, L, E); out[L] = {}
        for g, ps in groups.items():
            rows = [a[s:e].astype(np.float32).mean(0) for p in ps if p in spans for s, e in [spans[p]] if e > s]
            if rows: out[L][g] = np.mean(rows, 0)
    return out


def train_sae(x, m, k, epochs, device, seed=0, log=print):
    import torch
    torch.manual_seed(seed)
    n, d = x.shape
    X = torch.from_numpy(x).to(device)
    mu = X.float().mean(0)
    scale = float(((X.float() - mu) ** 2).sum(1).mean().sqrt()) / (d ** 0.5)  # so a centred row has about unit size per dimension
    W_dec = torch.randn(m, d, device=device); W_dec /= W_dec.norm(dim=1, keepdim=True)
    W_dec = torch.nn.Parameter(W_dec); W_enc = torch.nn.Parameter(W_dec.detach().clone().T.contiguous())
    b_enc = torch.nn.Parameter(torch.zeros(m, device=device)); b_dec = torch.nn.Parameter(torch.zeros(d, device=device))
    opt = torch.optim.Adam([W_enc, W_dec, b_enc, b_dec], lr=2e-4 / max(1.0, (m / 16384) ** 0.5), betas=(0.9, 0.999))
    bs = 4096 if n >= 4096 else max(64, n // 4)
    steps = max(1, epochs * n // bs)
    fired = torch.zeros(m, device=device, dtype=torch.bool)

    def enc(xb):
        pre = torch.relu((xb - b_dec) @ W_enc + b_enc)
        v, i = pre.topk(k, dim=1)
        return v, i

    def dec(v, i):
        return (v.unsqueeze(2) * W_dec[i]).sum(1) + b_dec

    t = time.time()
    for s in range(steps):
        idx = torch.randint(0, n, (bs,), device=device)
        xb = (X[idx].float() - mu) / scale
        v, i = enc(xb)
        loss = ((dec(v, i) - xb) ** 2).sum(1).mean()
        opt.zero_grad(); loss.backward()
        with torch.no_grad():  # keep decoder rows unit length: drop the gradient part along each row
            W_dec.grad -= (W_dec.grad * W_dec).sum(1, keepdim=True) * W_dec
        opt.step()
        with torch.no_grad():
            W_dec /= W_dec.norm(dim=1, keepdim=True)
            if s >= steps // 2: fired[i[v > 0].unique()] = True
        if s % max(1, steps // 5) == 0: log(f"  step {s}/{steps} loss {loss.item():.4f}")
    # how much of the stream it explains, on rows it trained on (a held-out slice would need more tokens than this run reads)
    with torch.no_grad():
        ev = torch.randint(0, n, (min(n, 20000),), device=device)
        xb = (X[ev].float() - mu) / scale; v, i = enc(xb); r = dec(v, i)
        fve = 1 - float(((r - xb) ** 2).sum()) / float(((xb - xb.mean(0)) ** 2).sum())
    return {"W_enc": W_enc.detach(), "W_dec": W_dec.detach(), "b_enc": b_enc.detach(), "b_dec": b_dec.detach(), "mu": mu, "scale": scale,
            "fve": round(fve, 4), "dead": round(1 - float(fired.float().mean()), 4), "steps": steps, "seconds": round(time.time() - t)}


def feature_report(sae, d, info, idx, L, groups, k, top, device):
    import torch
    E, offs = info["n_embd"], np.cumsum([0] + [x["n"] for x in idx])
    a = layer_rows(d, L, E)
    pos = {x["p"]: i for i, x in enumerate(idx)}
    m = sae["W_dec"].shape[0]

    def acts(rows):
        xb = (torch.from_numpy(np.asarray(rows, dtype=np.float32)).to(device) - sae["mu"]) / sae["scale"]
        pre = torch.relu((xb - sae["b_dec"]) @ sae["W_enc"] + sae["b_enc"]); v, i = pre.topk(k, dim=1)
        z = torch.zeros(len(rows), m, device=device); z.scatter_(1, i, v); return z

    def group_mean(ps):
        tot, cnt = torch.zeros(m, device=device), 0
        for p in ps:
            if p not in pos: continue
            j = pos[p]; s, e = offs[j] + ask_start(idx[j]["tokens"]), offs[j + 1]
            if e > s: z = acts(a[s:e]); tot += z.sum(0); cnt += int(e - s)
        return tot / max(cnt, 1), cnt
    cruel, nc = group_mean(groups.get("cruel", [])); kind, nk = group_mean(groups.get("kind", [])); plain, _ = group_mean(groups.get("plain", []))
    gap = cruel - kind
    best = torch.argsort(gap, descending=True)[:top].tolist()
    # where each of them fires hardest in everything read (one pass, chunked)
    hits = {f: [] for f in best}
    bf = torch.tensor(best, device=device)
    for s in range(0, a.shape[0], 8192):
        z = acts(a[s:s + 8192])[:, bf]
        v, r = z.max(0)
        for j, f in enumerate(best):
            hits[f].append((float(v[j]), s + int(r[j])))
    tok_at = lambda row: next(((j, row - offs[j]) for j in range(len(idx)) if offs[j] <= row < offs[j + 1]), (None, None))
    feats = []
    for f in best:
        ctx = []
        for v, row in sorted(hits[f], reverse=True)[:5]:
            j, t = tok_at(row)
            if j is None or v <= 0: continue
            toks = idx[j]["tokens"]; ctx.append({"act": round(v, 3), "text": "".join(toks[max(0, t - 12):t]) + "[[" + toks[t] + "]]" + "".join(toks[t + 1:t + 4])})
        on = float(cruel[f]); feats.append({
            "feature": f, "cruel": round(on, 4), "kind": round(float(kind[f]), 4), "plain": round(float(plain[f]), 4), "gap": round(float(gap[f]), 4),
            # its push in the stream's own units: decoder direction x its usual strength under the cruel persona x the scale
            "strength": round(on * sae["scale"], 4), "decoder": [round(float(x), 5) for x in sae["W_dec"][f].tolist()], "fires_on": ctx})
    return {"layer": L, "cruel_tokens": nc, "kind_tokens": nk, "features": feats}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--act", required=True); ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--work", required=True)
    ap.add_argument("--sae-layers", default="10,20,30"); ap.add_argument("--features", type=int, default=16384); ap.add_argument("--k", type=int, default=32)
    ap.add_argument("--epochs", type=int, default=3); ap.add_argument("--max-tokens", type=int, default=256); ap.add_argument("--top", type=int, default=24)
    ap.add_argument("--device", default=None); ap.add_argument("--extra", default="", help="more llama args for act-dump (e.g. -t 8)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True); os.makedirs(a.work, exist_ok=True)
    import torch
    device = a.device or ("cuda" if torch.cuda.is_available() else "cpu")
    labels = json.load(open(os.path.join(a.inp, "labels.json"), encoding="utf-8"))
    groups = {g: set(v) for g, v in labels["groups"].items()}
    report = {"when": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "surgery_record_only": True, "never_training": True, "device": device, "steps": {}}
    extra = a.extra.split() if a.extra else []
    try:
        # 1. patching means: every layer, only the labelled asks
        lab = os.path.join(a.work, "labelled.txt"); allp = [l.rstrip("\r\n") for l in open(os.path.join(a.inp, "prompts.txt"), encoding="utf-8")]
        keep = sorted(set().union(*[groups[g] for g in ("cruel", "kind", "plain") if g in groups]))
        open(lab, "w", encoding="utf-8").write("\n".join(allp[p] for p in keep) + "\n")
        probe = run_dump(a.act, a.model, lab, [1], os.path.join(a.work, "probe"), 16, extra)  # learn the layer count
        n_layer = probe["n_layer"]
        # 0. smoke, first minutes (the owner's rule): a few prompts at one layer, the means and a tiny autoencoder end to end,
        # so a broken step stops the run (the PC's gate exits 86 on interp.json) before the long dumps and training
        sm = os.path.join(a.work, "smoke-prompts.txt"); open(sm, "w", encoding="utf-8").write("\n".join(allp[p] for p in keep[:12]) + "\n")
        mid = max(1, (n_layer - 1) // 2); ds = os.path.join(a.work, "smoke"); si = run_dump(a.act, a.model, sm, [mid], ds, 32, extra)
        sidx = load_index(ds); sloc = {g: {keep[:12].index(p) for p in ps if p in keep[:12]} for g, ps in groups.items()}
        smeans = group_means(ds, si, sidx, sloc); xs = np.ascontiguousarray(layer_rows(ds, mid, si["n_embd"]))
        ssae = train_sae(xs, 64, 8, 1, device, log=lambda s: None)
        if mid not in smeans or not np.isfinite(ssae["fve"]): raise SystemExit(f"interp smoke failed at layer {mid}: means {sorted(smeans)} fve {ssae['fve']}")
        report["steps"]["smoke"] = {"ok": True, "layer": mid, "tokens": int(xs.shape[0])}; print(f"interp smoke passed: layer {mid}, {xs.shape[0]} tokens", flush=True)
        shutil.rmtree(ds, ignore_errors=True)
        # the last layer keeps only the last word (the engine drops the rest before the output), so it is never read
        d1 = os.path.join(a.work, "all-layers"); info = run_dump(a.act, a.model, lab, list(range(1, n_layer - 1)), d1, a.max_tokens, extra)
        idx = load_index(d1)
        local = {g: {keep.index(p) for p in ps if p in keep} for g, ps in groups.items()}  # prompt numbers in the labelled file
        means = group_means(d1, info, idx, local)
        pm = {str(L): {g: [round(float(x), 5) for x in v] for g, v in gs.items()} for L, gs in means.items()}
        gapn = {str(L): round(float(np.linalg.norm(gs["cruel"] - gs["kind"])), 4) for L, gs in means.items() if "cruel" in gs and "kind" in gs}
        streamn = {str(L): round(float(np.linalg.norm(gs.get("plain", gs.get("kind")))), 4) for L, gs in means.items()}
        json.dump({"n_layer": n_layer, "n_embd": info["n_embd"], "means": pm, "gap_norm": gapn, "stream_norm": streamn}, open(os.path.join(a.out, "patch-means.json"), "w"))
        report["steps"]["patch_means"] = {"ok": len(gapn) >= max(1, n_layer - 3), "layers": len(gapn), "tokens": info["tokens"]}
        shutil.rmtree(d1, ignore_errors=True)
        # 2. sparse autoencoders on a few layers, everything in prompts.txt
        sl = [int(x) for x in a.sae_layers.split(",") if x.strip()]
        sl = [L for L in sl if 1 <= L < n_layer - 1] or [n_layer // 2]
        d2 = os.path.join(a.work, "sae-layers"); info2 = run_dump(a.act, a.model, os.path.join(a.inp, "prompts.txt"), sl, d2, a.max_tokens, extra)
        idx2 = load_index(d2); saes = {}
        for L in sl:
            x = np.ascontiguousarray(layer_rows(d2, L, info2["n_embd"]))
            m = a.features if x.shape[0] >= 4 * a.features else max(64, min(a.features, x.shape[0] // 4))
            print(f"SAE layer {L}: {x.shape[0]} tokens, {m} features, k {a.k}", flush=True)
            sae = train_sae(x, m, min(a.k, m // 2), a.epochs, device, log=lambda s: print(s, flush=True))
            fr = feature_report(sae, d2, info2, idx2, L, groups, min(a.k, m // 2), a.top, device)
            fr.update({"features_total": m, "k": min(a.k, m // 2), "fve": sae["fve"], "dead": sae["dead"], "tokens": int(x.shape[0]), "seconds": sae["seconds"], "scale": round(sae["scale"], 5)})
            json.dump(fr, open(os.path.join(a.out, f"features-{L}.json"), "w"))
            torch.save({k2: (v.half().cpu() if hasattr(v, "half") else v) for k2, v in sae.items() if k2 in ("W_enc", "W_dec", "b_enc", "b_dec", "mu", "scale")}, os.path.join(a.out, f"sae-{L}.pt"))
            saes[L] = {"fve": sae["fve"], "dead": sae["dead"], "features": m, "tokens": int(x.shape[0])}
            del x
        report["steps"]["sae"] = {"ok": all(v["fve"] >= 0.5 for v in saes.values()), "layers": saes}
        shutil.rmtree(d2, ignore_errors=True)
    except SystemExit as e:
        report["error"] = str(e); print(str(e), file=sys.stderr)
    finally:
        shutil.rmtree(a.work, ignore_errors=True)
        json.dump(report, open(os.path.join(a.out, "interp.json"), "w"), indent=1)
    if report.get("error") or not all(s.get("ok") for s in report["steps"].values()):
        print("interp: a step failed or measured badly (see interp.json)"); sys.exit(1)
    print("interp: done", json.dumps(report["steps"]))


if __name__ == "__main__":
    main()
