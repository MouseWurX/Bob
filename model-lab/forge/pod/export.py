#!/usr/bin/env python3
"""Turn a Bob (HF safetensors) into GGUF files Bob's llama.cpp can run: BF16 master, then Q4_K_M (and Q8_0 if asked).
  export.py --model <dir> --out <dir> --name 24Bob --llama <llama.cpp dir> [--quants Q4_K_M,Q8_0]
"""
import argparse, hashlib, json, os, subprocess, sys

def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 24), b""): h.update(b)
    return h.hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--out", required=True); ap.add_argument("--name", required=True)
    ap.add_argument("--llama", required=True); ap.add_argument("--quants", default="Q4_K_M"); ap.add_argument("--keep-bf16", action="store_true"); ap.add_argument("--nickname", default="")
    ap.add_argument("--merge", action="store_true", help="add to an existing <name>-files.json instead of replacing it (top-up quants)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    bf16 = os.path.join(a.out, f"{a.name}-BF16.gguf")
    conv = os.path.join(a.llama, "convert_hf_to_gguf.py")
    r = subprocess.run([sys.executable, conv, a.model, "--outfile", bf16, "--outtype", "bf16"])
    if r.returncode != 0:
        # the converter was written against an older transformers; retry it in its own small environment
        print("converter failed with the main python; retrying in a separate environment with its pinned libraries", flush=True)
        cv = os.path.join(os.path.dirname(a.out.rstrip("/")), "..", "cv"); cv = os.path.abspath(cv)
        if not os.path.exists(os.path.join(cv, "bin", "python")):
            subprocess.run([sys.executable, "-m", "venv", cv], check=True)
            subprocess.run([os.path.join(cv, "bin", "pip"), "install", "-q", "--index-url", "https://download.pytorch.org/whl/cpu", "torch==2.11.0"], check=True)
            subprocess.run([os.path.join(cv, "bin", "pip"), "install", "-q", "-r", os.path.join(a.llama, "requirements", "requirements-convert_hf_to_gguf.txt")], check=True)
        subprocess.run([os.path.join(cv, "bin", "python"), conv, a.model, "--outfile", bf16, "--outtype", "bf16"], check=True)
    quant = os.path.join(a.llama, "build", "bin", "llama-quantize")
    env = {**os.environ, "LD_LIBRARY_PATH": os.path.dirname(quant) + ":" + os.environ.get("LD_LIBRARY_PATH", "")}
    files = []
    fj = os.path.join(a.out, f"{a.name}-files.json")
    if a.merge and os.path.exists(fj): files = json.load(open(fj)).get("files", [])
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

if __name__ == "__main__":
    main()
