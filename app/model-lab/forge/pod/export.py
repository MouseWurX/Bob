#!/usr/bin/env python3
"""Turn a Bob (HF safetensors) into GGUF files Bob's llama.cpp can run: BF16 master, then Q4_K_M (and Q8_0 if asked).
  export.py --model <dir> --out <dir> --name 24Bob --llama <llama.cpp dir> [--quants Q4_K_M,Q8_0]
Beside every GGUF it also writes a brain card, <file>.bob.json (28Bob-Q4_K_M.gguf -> 28Bob-Q4_K_M.bob.json): what the brain is,
where it was cut from, how many experts it keeps, what it is for. Bob's catalogue reads the card when the GGUF is added as an own
brain and files it under its jobs. Benchmarks are added to the card on the PC later (bob-card.mjs); the card holds no paths or names.
"""
import argparse, hashlib, json, os, subprocess, sys

def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 24), b""): h.update(b)
    return h.hexdigest()

MTP_KEYS = ("num_nextn_predict_layers", "mtp_num_hidden_layers", "num_mtp_layers", "mtp_num_layers")

def no_ghost_guesser(model):
    """1.5.207 PC check: a cut brain kept "mtp_num_hidden_layers": 1 in its config.json after its guesser (MTP)
    weights were left out, so the GGUF said nextn_predict_layers = 1 with no nextn tensors and Brain Engine 4 stopped
    with "MTP block missing nextn.eh_proj". When the weights don't have it, the config says 0 before converting.
    Returns True when the brain has no guesser weights (newer converters then need --no-mtp, see convert_args)."""
    cp = os.path.join(model, "config.json")
    try: cfg = json.load(open(cp))
    except Exception: return False
    keys = [k for k in MTP_KEYS if isinstance(cfg.get(k), int) and cfg.get(k) > 0]
    sub = cfg.get("text_config") if isinstance(cfg.get("text_config"), dict) else {}
    subkeys = [k for k in MTP_KEYS if isinstance(sub.get(k), int) and sub.get(k) > 0]
    names = []
    idx = os.path.join(model, "model.safetensors.index.json")
    if os.path.exists(idx):
        try: names = list(json.load(open(idx)).get("weight_map", {}).keys())
        except Exception: return False
    else:
        try:
            from safetensors import safe_open
            for f in os.listdir(model):
                if f.endswith(".safetensors"):
                    with safe_open(os.path.join(model, f), "pt") as h: names += list(h.keys())
        except Exception: return False
    if any(("mtp" in n.lower()) or ("nextn" in n.lower()) for n in names): return False
    if not names: return False
    if not keys and not subkeys: return True
    for k in keys: cfg[k] = 0
    for k in subkeys: sub[k] = 0
    json.dump(cfg, open(cp, "w"), indent=2)
    print(f"no guesser (MTP) weights in this brain: set {', '.join(keys + subkeys)} to 0 so the GGUF doesn't claim one", flush=True)
    return True

def convert_args(conv, no_guesser):
    """13 Nov, fact-fix round 1: llama.cpp b12282's Qwen3.5/3.6 converter counts the guesser layers from the mtp.* weights
    when the config says 0, and stops with `assert self.opt_num_mtp_layers != 0` if there are none (a trained full brain
    saved without them). It has --no-mtp for exactly that; older converters don't know the flag, so it's added only when
    the converter's own help lists it."""
    if not no_guesser: return []
    try:
        if "--no-mtp" in open(conv, encoding="utf-8", errors="replace").read(): return ["--no-mtp"]
    except Exception: pass
    return []

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--out", required=True); ap.add_argument("--name", required=True)
    ap.add_argument("--llama", required=True); ap.add_argument("--quants", default="Q4_K_M"); ap.add_argument("--keep-bf16", action="store_true"); ap.add_argument("--nickname", default="")
    ap.add_argument("--merge", action="store_true", help="add to an existing <name>-files.json instead of replacing it (top-up quants)")
    ap.add_argument("--teacher", default="", help="the model it was cut from, as a Hugging Face id (for the brain card)")
    ap.add_argument("--jobs", default="bob,deep,tinker,reviewer,office,ledger,scout", help="catalogue job slots for the brain card")
    ap.add_argument("--what", default="", help="one plain sentence for the brain card")
    ap.add_argument("--pending", action="store_true", help="write <name>-files.json.pending; run.sh renames it once any publishing is done, so the PC does not download files that are going to Hugging Face")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    bf16 = os.path.join(a.out, f"{a.name}-BF16.gguf")
    no_guesser = no_ghost_guesser(a.model)
    conv = os.path.join(a.llama, "convert_hf_to_gguf.py")
    extra = convert_args(conv, no_guesser)
    if extra: print("no guesser (MTP) weights: converting with --no-mtp", flush=True)
    r = subprocess.run([sys.executable, conv, a.model, "--outfile", bf16, "--outtype", "bf16", *extra])
    if r.returncode != 0:
        # the converter was written against an older transformers; retry it in its own small environment
        print("converter failed with the main python; retrying in a separate environment with its pinned libraries", flush=True)
        cv = os.path.join(os.path.dirname(a.out.rstrip("/")), "..", "cv"); cv = os.path.abspath(cv)
        if not os.path.exists(os.path.join(cv, "bin", "python")):
            subprocess.run([sys.executable, "-m", "venv", cv], check=True)
            subprocess.run([os.path.join(cv, "bin", "pip"), "install", "-q", "--index-url", "https://download.pytorch.org/whl/cpu", "torch==2.11.0"], check=True)
            subprocess.run([os.path.join(cv, "bin", "pip"), "install", "-q", "-r", os.path.join(a.llama, "requirements", "requirements-convert_hf_to_gguf.txt")], check=True)
        subprocess.run([os.path.join(cv, "bin", "python"), conv, a.model, "--outfile", bf16, "--outtype", "bf16", *extra], check=True)
    quant = os.path.join(a.llama, "build", "bin", "llama-quantize")
    env = {**os.environ, "LD_LIBRARY_PATH": os.path.dirname(quant) + ":" + os.environ.get("LD_LIBRARY_PATH", "")}
    files = []
    done_fj = os.path.join(a.out, f"{a.name}-files.json"); fj = done_fj + (".pending" if a.pending else "")
    if a.merge and os.path.exists(done_fj): files = json.load(open(done_fj)).get("files", [])
    have = {f["file"] for f in files}
    for q in [q for q in a.quants.split(",") if q and q.lower() != "none"]:
        out = os.path.join(a.out, f"{a.name}-{q}.gguf")
        if os.path.basename(out) in have: print(f"{out}: already made"); continue
        subprocess.run([quant, bf16, out, q], check=True, env=env)
        files.append({"file": os.path.basename(out), "bytes": os.path.getsize(out), "sha256": sha(out)})
        print(f"{out}: {os.path.getsize(out) / 1e9:.2f} GB", flush=True)
    if a.keep_bf16: files.append({"file": os.path.basename(bf16), "bytes": os.path.getsize(bf16), "sha256": sha(bf16)})
    else: os.remove(bf16)
    keep = os.path.join(a.model, "bob-keep.json")
    if os.path.exists(keep):
        import shutil; shutil.copy(keep, os.path.join(a.out, f"{a.name}-keep.json"))
    json.dump({"name": a.name, "nickname": a.nickname, "files": files}, open(fj, "w"), indent=1)
    for f in files:
        if f["file"].endswith(".gguf"): write_card(a, f)

def write_card(a, f):
    """The brain card beside a GGUF. Only facts the pod knows; no paths, hosts or people."""
    import datetime
    cfg = {}
    try: cfg = json.load(open(os.path.join(a.model, "config.json")))
    except Exception: pass
    bob = cfg.get("bob", {})
    total = cfg.get("num_experts") or bob.get("experts_total")
    kept = bob.get("experts_kept") or total   # no "bob" block in the config: nothing was cut (a trained full model)
    # size rule from the ladder (docs/FORGE-JOURNAL.md): about 2 B of shared parts plus about 0.13 B per expert kept in every layer
    params = round(2 + 0.13 * kept) if kept else None
    quant = f["file"].rsplit("-", 1)[-1].replace(".gguf", "")
    by = {"Qwen": "Alibaba"}.get(a.teacher.split("/")[0], a.teacher.split("/")[0]) if a.teacher else ""
    short = a.teacher.split("/")[-1] if a.teacher else ""
    what = a.what or (f"A Bob cut from {short} for Bob's own jobs: tools, coding, exact formats and everyday chat." if a.teacher else None)
    card = {
        "card": 1, "file": f["file"], "bytes": f["bytes"], "sha256": f["sha256"],
        "name": f"{a.name} {a.nickname}".strip() + (f" ({quant})" if quant and quant != a.name else ""),
        "nickname": a.nickname, "family": "Bob", "madeByBob": True,
        "jobs": [j for j in a.jobs.split(",") if j],
        "params": params, "activeParams": 3 if kept else None,
        "vramGB": round(f["bytes"] / 1e9 + 1.5), "ctx": cfg.get("max_position_embeddings"),
        "cutFrom": {"name": short.replace("-", " "), "by": by, "hf": a.teacher} if a.teacher else None,
        "expertsKept": f"{kept} of {total}" if kept and total else None,
        "published": datetime.date.today().isoformat(), "license": "Apache 2.0",
        "what": what,
    }
    card = {k: v for k, v in card.items() if v is not None}
    cf = os.path.join(a.out, f["file"][:-len(".gguf")] + ".bob.json")
    json.dump(card, open(cf, "w"), indent=1)
    print(f"{cf}: brain card written", flush=True)

if __name__ == "__main__":
    main()
