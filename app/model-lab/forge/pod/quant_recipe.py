#!/usr/bin/env python3
"""Mixed-bit quant recipes for the Flash-Next REAP cuts: predict each file's size before anything runs (24 Nov 2026).

The owner (24 Nov): integrate llamAmpere's tricks, "learn from it", scope properly. llamAmpere's own Flash-Next quants
(MIT, read at tag v0.7.4) keep the bulk at one type and give the small structural tensors more bits; its MTP-head recipe
keeps the hyper-connection and indexer tensors at high precision. Their AI+ types can't be made (no quantizer is published),
so every recipe here uses stock llama.cpp types and llama-quantize --tensor-type, and the files load on any llama.cpp.

  quant_recipe.py --recipe pod/recipes/flashnext-mixed.json --cut bill            dry run on the built-in Flash-Next layout
  quant_recipe.py --recipe ... --cut bill --model cut-blfn.gguf               dry run on a real file's tensor list (header only)
  quant_recipe.py --recipe ... --cut bill --name MX2_S --args                 the llama-quantize options for one recipe
  quant_recipe.py --recipe ... --name MX2_S --ftype-of                         its base type (IQ2_XXS ...); exit 1 if no such recipe
  quant_recipe.py --check FILE.gguf --cut bill --ftype IQ2_XXS                compare the prediction with a made file, tensor by tensor

Type choice copies llama.cpp b12359 (commit b1b770d, the pods' build) src/llama-quant.cpp for this architecture:
tensor_allows_quantization, tensor_get_category, llama_tensor_get_type_impl and tensor_type_fallback. Anything that file does
for other architectures is left out. Sizes are exact for a given type per tensor: rows x (cols / block) x block bytes.
Python standard library only, unless --model or --check reads a GGUF (then gguf-py)."""
import argparse, json, re, sys

# block size, bytes per block (gguf-py GGML_QUANT_SIZES at b12359)
QS = {"f32": (1, 4), "f16": (1, 2), "bf16": (1, 2), "q8_0": (32, 34), "q4_0": (32, 18), "q4_1": (32, 20), "q5_0": (32, 22),
      "q5_1": (32, 24), "iq4_nl": (32, 18), "q2_0": (64, 18), "q2_k": (256, 84), "q3_k": (256, 110), "q4_k": (256, 144),
      "q5_k": (256, 176), "q6_k": (256, 210), "iq2_xxs": (256, 66), "iq2_xs": (256, 74), "iq2_s": (256, 82),
      "iq3_xxs": (256, 98), "iq3_s": (256, 110), "iq1_s": (256, 50), "iq1_m": (256, 56), "iq4_xs": (256, 136)}
FTYPE_DEFAULT = {"IQ1_M": "iq1_m", "IQ2_XXS": "iq2_xxs", "IQ2_XS": "iq2_xs", "IQ2_S": "iq2_xs", "IQ2_M": "iq2_s",
                 "IQ3_XXS": "iq3_xxs", "Q2_K": "q2_k", "Q3_K_M": "q3_k", "IQ4_XS": "iq4_xs", "Q4_K_M": "q4_k", "Q8_0": "q8_0"}
IQ2_GROUP = {"IQ2_XXS", "IQ2_XS", "IQ1_S", "IQ2_S", "IQ2_M", "IQ1_M"}
FALLBACK = {"iq1_s": "iq4_nl", "iq1_m": "iq4_nl", "iq2_xxs": "iq4_nl", "iq2_xs": "iq4_nl", "iq2_s": "iq4_nl", "iq3_xxs": "iq4_nl",
            "iq3_s": "iq4_nl", "iq4_xs": "iq4_nl", "q2_0": "q4_0", "q2_k": "q4_0", "q3_k": "q4_0", "q4_k": "q5_0", "q5_k": "q5_1",
            "q6_k": "q8_0"}

# Flash-Next (qwen4exp) as the pods' Q8_0 source holds it. Every number is from the pod logs (cut-iq2-logs.zip: the
# llama-quantize and cut logs of the Bobert run) or the b12359 loader (src/models/qwen4exp.cpp). Checked by selftest():
# 1224 tensors, 389 f32 + 24 bf16 + 811 q8_0, and the cut's 25,619,005,440 bytes for 102 experts per layer.
FN = dict(layers=48, embd=2560, vocab=248320, hc=4, hc_lr=320, heads=24, head_k=256, kv_heads=2, idx_heads=4, idx_dim=128,
          ssm_state=128, ssm_groups=16, ssm_dt_rank=48, ssm_conv=4, ff_exp=640, ff_shexp=640, ple_dim=160, ple_layers=(1,),
          full_every=4, ple_rows=320_002_000)
# ple_rows is an ESTIMATE: 16 n-gram heads of just over 20.0M rows each (qwen4exp.ple.head_vocab_sizes starts 20000003,
# 20000023, 20000033; the log cuts the list). With it the built-in layout comes to within ~10 MB (0.005%) of the source file
# once its header (~9 MB of vocabulary and merges) is counted; that small gap is not explained yet. --model reads the real
# shapes from a file's header and has no such gap.


def flashnext(n_expert):
    """The tensor list in file order: (name, [ne0, ne1, (ne2)], source type). The [n_embd, hc] norm gammas are stored flat
    ([hc * n_embd]; the loader reshapes them, TENSOR_ALLOW_RESHAPE), so llama-quantize leaves them f32 as 1D tensors."""
    c = FN; E, H = c["embd"], c["hc"] * c["embd"]; key, val = c["ssm_state"] * c["ssm_groups"], c["ssm_state"] * c["ssm_dt_rank"]
    t = [("output.weight", [E, c["vocab"]], "q8_0"), ("output_hc_down.weight", [H, c["hc_lr"]], "q8_0"),
         ("output_hc_up.weight", [c["hc_lr"], H], "q8_0"), ("output_hc_norm.weight", [H], "f32"),
         ("token_embd.weight", [E, c["vocab"]], "q8_0"), ("per_layer_token_embd.weight", [c["ple_dim"], c["ple_rows"]], "q8_0")]
    for il in range(c["layers"]):
        b = f"blk.{il}."
        t += [(b + "hc_attn_norm.weight", [H], "f32"), (b + "hc_attn_up.weight", [c["hc_lr"], H], "q8_0"),
              (b + "hc_attn_down.weight", [H, c["hc_lr"]], "q8_0"), (b + "hc_attn_inject.weight", [H, c["hc"]], "q8_0"),
              (b + "hc_ffn_norm.weight", [H], "f32"), (b + "hc_ffn_up.weight", [c["hc_lr"], H], "q8_0"),
              (b + "hc_ffn_down.weight", [H, c["hc_lr"]], "q8_0"), (b + "hc_ffn_inject.weight", [H, c["hc"]], "q8_0")]
        if (il + 1) % c["full_every"] == 0:   # full attention (QSA) every 4th layer
            q = c["head_k"] * c["heads"]
            t += [(b + "attn_q.weight", [E, 2 * q], "q8_0"), (b + "attn_k.weight", [E, c["head_k"] * c["kv_heads"]], "q8_0"),
                  (b + "attn_v.weight", [E, c["head_k"] * c["kv_heads"]], "q8_0"), (b + "attn_output.weight", [q, E], "q8_0"),
                  (b + "attn_q_norm.weight", [c["head_k"]], "f32"), (b + "attn_k_norm.weight", [c["head_k"]], "f32"),
                  (b + "indexer.q_proj.weight", [E, c["idx_heads"] * c["idx_dim"]], "bf16"),
                  (b + "indexer.k_proj.weight", [E, c["idx_dim"]], "bf16"),
                  (b + "indexer.q_norm.weight", [c["idx_dim"]], "f32"), (b + "indexer.k_norm.weight", [c["idx_dim"]], "f32")]
        else:                                   # linear attention (gated delta net)
            t += [(b + "attn_qkv.weight", [E, 2 * key + val], "q8_0"), (b + "attn_gate.weight", [E, val], "q8_0"),
                  (b + "ssm_conv1d.weight", [c["ssm_conv"], 2 * key + val], "f32"), (b + "ssm_dt.bias", [c["ssm_dt_rank"]], "f32"),
                  (b + "ssm_a", [c["ssm_dt_rank"]], "f32"), (b + "ssm_beta.weight", [E, c["ssm_dt_rank"]], "q8_0"),
                  (b + "ssm_alpha.weight", [E, c["ssm_dt_rank"]], "q8_0"), (b + "ssm_norm.weight", [c["ssm_state"]], "f32"),
                  (b + "ssm_out.weight", [val, E], "q8_0")]
        if il in c["ple_layers"]:
            t += [(b + "ple_key.weight", [E, H], "q8_0"), (b + "ple_value.weight", [E, E], "q8_0")]
            t += [(b + f"ple_norm_{k}.weight", [H], "f32") for k in ("key", "query", "conv")]
            t += [(b + "ple_conv1d.weight", [c["ssm_conv"], H], "f32")]
        t += [(b + "ffn_gate_inp.weight", [E, n_expert], "f32"), (b + "ffn_gate_exps.weight", [E, c["ff_exp"], n_expert], "q8_0"),
              (b + "ffn_up_exps.weight", [E, c["ff_exp"], n_expert], "q8_0"),
              (b + "ffn_down_exps.weight", [c["ff_exp"], E, n_expert], "q8_0"), (b + "ffn_gate_inp_shexp.weight", [E], "f32"),
              (b + "ffn_gate_shexp.weight", [E, c["ff_shexp"]], "q8_0"), (b + "ffn_up_shexp.weight", [E, c["ff_shexp"]], "q8_0"),
              (b + "ffn_down_shexp.weight", [c["ff_shexp"], E], "q8_0")]
    return t


def nbytes(shape, typ):
    blk, size = QS[typ]; rows = 1
    for d in shape[1:]: rows *= d
    if shape[0] % blk: raise ValueError(f"{typ} needs rows divisible by {blk}, got {shape[0]}")
    return rows * (shape[0] // blk) * size


def allows_quant(name, shape):
    if len(shape) < 2 or not name.endswith("weight"): return False
    for s in ("_norm.weight", "ffn_gate_inp.weight", "ssm_conv1d", "indexer.k_proj.weight", "indexer.q_proj.weight"):
        if s in name: return False
    return True


def category(name):
    if name == "output.weight": return "OUTPUT"
    if name in ("token_embd.weight", "per_layer_token_embd.weight"): return "TOKEN_EMBD"
    for k, v in (("attn_qkv.weight", "ATTN_QKV"), ("attn_v.weight", "ATTN_V"), ("attn_k.weight", "ATTN_K"), ("attn_q.weight", "ATTN_Q"),
                 ("attn_output.weight", "ATTN_OUTPUT"), ("ffn_up", "FFN_UP"), ("ffn_gate", "FFN_GATE"), ("attn_gate.weight", "ATTN_GATE"),
                 ("ffn_down", "FFN_DOWN")):
        if k in name: return v
    return "OTHER"


def use_more_bits(i, n): return i < n // 8 or i >= 7 * n // 8 or (i - n // 8) % 3 == 2


def choose(tensors, ftype, rules, n_layer=48):
    """Type per tensor, as llama-quantize b12359 picks it: --tensor-type rules (first match) win, then the ftype mixture,
    then the shape fallback. rules: [(regex, type)]."""
    out, wv, n_wv = [], 0, sum(category(n) in ("ATTN_V", "ATTN_QKV") for n, _, _ in tensors)
    base = FTYPE_DEFAULT[ftype]; pats = [(re.compile(p), ty) for p, ty in rules]
    for name, shape, src in tensors:
        cat = category(name)
        if not allows_quant(name, shape): out.append((name, shape, src, src, "kept")); continue
        new, why = base, "mixture"
        hit = next((ty for p, ty in pats if p.search(name)), None)
        if hit: new, why = hit, "recipe"
        else:
            m = re.match(r"blk\.(\d+)\.", name); il = int(m.group(1)) if m else -1
            if cat == "OUTPUT": new = "q5_k" if ftype in IQ2_GROUP or ftype == "IQ3_XXS" else ("q6_k" if base != "q8_0" else "q8_0")
            elif cat == "TOKEN_EMBD":
                new = {"IQ2_XXS": "q2_k", "IQ2_XS": "q2_k", "IQ1_S": "q2_k", "IQ1_M": "q2_k", "IQ2_S": "iq3_s", "IQ2_M": "iq3_s",
                       "IQ3_XXS": "iq3_s"}.get(ftype, base)
            elif ftype in IQ2_GROUP:
                if cat in ("ATTN_V", "ATTN_QKV"): new = "q4_k"; wv += 1   # n_expert >= 4
                # b12359 counts every "ffn_down" tensor (down experts, shared expert and hc_ffn_down) in file order against a
                # per-layer count; Bill's full IQ2_XXS and IQ2_M logs (24 Nov) show all three in layers 0-2 taking this branch
                elif cat == "FFN_DOWN" and il < 3: new = "iq3_s" if ftype in ("IQ2_S", "IQ2_M") else "q2_k"
                elif cat == "ATTN_OUTPUT" and ftype in ("IQ2_S", "IQ2_M"): new = "iq3_s"
                elif cat == "ATTN_OUTPUT" and ftype in ("IQ1_S", "IQ1_M"): new = "iq2_xxs"
            elif cat in ("ATTN_V", "ATTN_QKV"):
                if ftype == "Q3_K_M": new = "q5_k" if wv < 2 else "q4_k"
                elif ftype == "IQ4_XS": new = "q5_k"           # n_gqa = 12
                elif ftype == "Q4_K_M" and use_more_bits(wv, n_wv): new = "q6_k"
                elif ftype == "IQ3_XXS": new = "q4_k"
                elif ftype == "Q2_K": new = "q4_k"
                wv += 1
            elif cat == "FFN_DOWN":
                if ftype == "Q3_K_M": new = "q5_k" if il < n_layer // 16 else "q4_k"
                elif ftype == "Q4_K_M" and use_more_bits(il, n_layer): new = "q6_k"
                elif ftype == "Q2_K": new = "q3_k"
            elif cat == "ATTN_OUTPUT":
                new = {"Q2_K": "q3_k", "IQ3_XXS": "iq3_s", "Q3_K_M": "q4_k"}.get(ftype, new)
            elif cat == "ATTN_K" and ftype == "IQ3_XXS": new = "iq2_s"
            elif cat == "ATTN_Q" and ftype == "IQ3_XXS": new = "iq2_s"
        blk = QS[new][0]
        if shape[0] % blk:
            fb = FALLBACK.get(new, new); new = fb if shape[0] % QS[fb][0] == 0 else "f16"; why += "+fallback"
        out.append((name, shape, src, new, why))
    return out


GROUPS = [("word table (per_layer_token_embd)", r"^per_layer_token_embd"), ("experts gate+up", r"ffn_(gate|up)_exps"),
          ("experts down", r"ffn_down_exps"), ("shared expert", r"_shexp"), ("router", r"ffn_gate_inp\."),
          ("hyper-connections (hc_*)", r"hc_"), ("full attention", r"attn_(q|k|v|output)\.|attn_._norm|indexer"),
          ("linear attention (attn_qkv/gate, ssm_*)", r"attn_qkv|attn_gate|ssm_"), ("PLE mixer (blk.1.ple_*)", r"\.ple_"),
          ("token_embd + output", r"^(token_embd|output\.)")]


def group(name):
    return next((g for g, p in GROUPS if re.search(p, name)), "other")


def summary(picked):
    tot, by = 0, {}
    for name, shape, _src, typ, _ in picked:
        b = nbytes(shape, typ); tot += b; g = by.setdefault(group(name), {"bytes": 0, "types": {}})
        g["bytes"] += b; g["types"][typ] = g["types"].get(typ, 0) + 1
    return tot, by


def experts_for(cut):
    return {"bobert": 410, "riker": 359, "bill": 308, "full": 512}[cut]


def tensors_from(args):
    if not args.model: return flashnext(experts_for(args.cut))
    import gguf
    r = gguf.GGUFReader(args.model)
    return [(t.name, [int(x) for x in t.shape], t.tensor_type.name.lower()) for t in r.tensors]


def rank_of(recipe, cut):
    ranks = recipe.get("layer_rank", {})
    return ranks.get(cut) or ranks.get("placeholder") or list(range(48))


def rules_of(rc, ftype, rank=None):
    """A recipe's rules as (regex, type) for llama-quantize. 'layers': top:N / bottom:N narrows a rule to N layers of the
    sensitivity rank (most sensitive first)."""
    out = []
    for r in rc.get("rules", []):
        ty = r["type"] if isinstance(r["type"], str) else r["type"].get(ftype)
        if not ty: continue
        pat = r["match"]
        if r.get("layers"):
            side, n = r["layers"].split(":"); n = int(n)
            ls = sorted((rank[:n] if side == "top" else rank[-n:]) if n else [])
            if not ls: continue
            pat = rf"^blk\.({'|'.join(map(str, ls))})\..*(?:{pat})"
        out.append((pat, ty))
    return out


def recipe_rules(recipe, rc, cut):
    rank = rank_of(recipe, cut)
    return rules_of(rc, rc["ftype"], rank) + ([] if rc.get("no_common") else rules_of(recipe.get("common", {}), rc["ftype"], rank))


def selftest():
    """The built-in layout against the pods' numbers. Fails loudly if a shape or type is wrong."""
    full, cut = flashnext(512), flashnext(410)
    counts = {}
    for _, _, s in full: counts[s] = counts.get(s, 0) + 1
    ok = [("1224 tensors", len(full) == 1224), ("389 f32, 24 bf16, 811 q8_0 (llama_model_loader type counts)",
          counts == {"f32": 389, "bf16": 24, "q8_0": 811})]
    removed = sum(nbytes(s, ty) for _, s, ty in full) - sum(nbytes(s, ty) for _, s, ty in cut)
    ok.append(("80% cut removes 25,619,005,440 bytes (cut.json bytes_before - bytes_after)", removed == 25_619_005_440))
    data = sum(nbytes(s, ty) for _, s, ty in full)
    gap = 188_214_008_320 - 9_000_000 - data   # file bytes minus a ~9 MB header (vocabulary, merges, tensor list)
    ok.append((f"source data within 20 MB of the file's 188,214,008,320 bytes less a ~9 MB header (gap {gap / 1e6:+.1f} MB)", abs(gap) < 20e6))
    return ok, data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--recipe"); ap.add_argument("--cut", default="bill", choices=["bobert", "riker", "bill", "full"])
    ap.add_argument("--model"); ap.add_argument("--name", help="one recipe from the file"); ap.add_argument("--args", action="store_true")
    ap.add_argument("--check"); ap.add_argument("--ftype", default="IQ2_XXS"); ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true"); ap.add_argument("--detail", action="store_true")
    ap.add_argument("--ftype-of", action="store_true")
    a = ap.parse_args(); args = a
    if a.selftest:
        ok, data = selftest()
        for n, g in ok: print(("PASS " if g else "FAIL ") + n)
        print(f"built-in source data bytes: {data:,}")
        sys.exit(0 if all(g for _, g in ok) else 1)
    tensors = tensors_from(a)
    if a.check:   # a made file: its real types and byte sizes against what this script would pick with no recipe rules
        import gguf
        r = gguf.GGUFReader(a.check); real = {t.name: (t.tensor_type.name.lower(), int(t.n_bytes)) for t in r.tensors}
        rules = []
        if a.recipe and a.name:
            rec = json.load(open(a.recipe)); rc = next(r for r in rec["recipes"] if r["name"] == a.name); rules = recipe_rules(rec, rc, a.cut)
        picked = choose(tensors, a.ftype, rules); diff = 0
        for name, shape, _s, typ, _w in picked:
            if name not in real: continue   # a split file's other parts hold it
            rt, rb = real[name]
            if rt != typ: diff += 1; print(f"type differs: {name}: predicted {typ}, file {rt}")
        here = [x for x in picked if x[0] in real]; pt, _ = summary(here); rt = sum(b for _, b in real.values())
        print(f"{len(here)} tensors in this file, {diff} type(s) differ; predicted {pt / 1e9:.3f} GB, file {rt / 1e9:.3f} GB")
        sys.exit(1 if diff else 0)
    recipe = json.load(open(a.recipe)); rows = []
    if a.ftype_of:   # run.sh: is this quant name a recipe (not a baseline), and what type does llama-quantize get
        rc = next((r for r in recipe["recipes"] if r["name"] == a.name and not r.get("baseline")), None)
        if not rc: sys.exit(1)
        print(rc["ftype"]); return
    for rc in recipe["recipes"]:
        if a.name and rc["name"] != a.name: continue
        if a.cut not in rc.get("cuts", ["bobert", "riker", "bill"]): continue
        ftype = rc["ftype"]; rules = recipe_rules(recipe, rc, a.cut)
        picked = choose(tensors, ftype, rules)
        if a.args:
            # what llama-quantize is given: the same rules in the same order (first match wins there too)
            for p, ty in rules: print(f"--tensor-type\n{p}={ty}")
            continue
        tot, by = summary(picked)
        hdr = recipe.get("header_bytes", 8_000_000)
        rows.append({"name": rc["name"], "ftype": ftype, "gb": round((tot + hdr) / 1e9, 2), "why": rc.get("why", ""),
                     "groups": {g: {"gb": round(v["bytes"] / 1e9, 3), "types": v["types"]} for g, v in by.items()}})
        if a.detail:
            for name, shape, src, typ, why in picked: print(f"  {name:40s} {str(shape):28s} {src:5s} -> {typ:8s} {why}")
    if a.args: return
    if a.json: print(json.dumps(rows, indent=1)); return
    src = a.model or f"built-in Flash-Next layout, {experts_for(a.cut)} experts per layer"
    print(f"{a.cut}: dry run on {src}")
    for r in rows:
        print(f"\n{r['name']} ({r['ftype']}): {r['gb']} GB   {r['why']}")
        for g, v in sorted(r["groups"].items(), key=lambda kv: -kv[1]["gb"]):
            print(f"   {v['gb']:8.3f} GB  {g:42s} {', '.join(f'{n} {t}' for t, n in v['types'].items())}")


if __name__ == "__main__":
    main()
