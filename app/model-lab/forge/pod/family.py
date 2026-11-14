"""Which brain family a checkpoint is, and the few things that differ between families (14 Nov 2026).

The Forge was written for Qwen3.5/3.6 MoE. GPT-OSS (OpenAI's 20B and 120B, and cuts of them such as the 38B REAP cut)
is the second family. Everything family-specific the pod scripts need is here, so heal.py, teacher.py, count.py,
rebuild.py and export.py stay one script each:

  family(dir)          "qwen" or "gpt-oss", from config.json (model_type, then architectures). Unknown = "qwen" (as before).
  load(dir, dev, ...)  the right model class. GPT-OSS ships its experts in MXFP4; MXFP4 cannot be trained, so a student is
                       always unpacked to BF16 (dequantize). A teacher keeps MXFP4 when the card's kernels allow it
                       (Hopper or newer, triton + kernels installed), else it is unpacked and spread over the card and RAM.
  layers(model)        the decoder layers (Qwen keeps them under model.language_model, GPT-OSS under model).
  router(mlp)          the router module (Qwen: mlp.gate, GPT-OSS: mlp.router). Both return (logits, weights, indices).
  num_experts(cfg)     experts per layer (Qwen: num_experts, GPT-OSS: num_local_experts).
  stop_ids(tok)        the tokens that end an answer (Qwen: <|im_end|>; GPT-OSS harmony: <|return|>, <|call|>, <|end|>).
  clean_saved(dir)     after save_pretrained of an unpacked GPT-OSS: drop the MXFP4 note from config.json, so the GGUF
                       converter reads plain BF16 weights instead of looking for MXFP4 blocks that are not there.
"""
import json, os

QWEN, GPT_OSS = "qwen", "gpt-oss"


def read_config(path):
    try: return json.load(open(os.path.join(path, "config.json")))
    except (OSError, ValueError): return {}


def family(path_or_cfg):
    cfg = path_or_cfg if isinstance(path_or_cfg, dict) else read_config(path_or_cfg)
    mt = str(cfg.get("model_type", "")).lower()
    arch = " ".join(cfg.get("architectures") or []).lower()
    if mt == "gpt_oss" or "gptoss" in arch: return GPT_OSS
    return QWEN


def text_config(cfg):
    return cfg.get("text_config", cfg) if isinstance(cfg, dict) else getattr(cfg, "text_config", cfg)


def num_experts(cfg):
    tc = text_config(cfg)
    get = (lambda k: tc.get(k)) if isinstance(tc, dict) else (lambda k: getattr(tc, k, None))
    return get("num_local_experts") or get("num_experts")


def is_mxfp4(cfg):
    q = (cfg or {}).get("quantization_config") or {}
    return str(q.get("quant_method", "")).lower() == "mxfp4"


def mxfp4_runs(dev):
    """True when transformers can keep GPT-OSS experts in MXFP4 on this card (else it would unpack them itself, onto one card)."""
    try:
        import torch
        from transformers.utils import is_kernels_available, is_triton_available
        if not str(dev).startswith("cuda") or not torch.cuda.is_available(): return False
        return torch.cuda.get_device_capability()[0] >= 9 and is_triton_available("3.4.0") and is_kernels_available()
    except Exception:
        return False


def load(path, dev="cuda", teacher=False, **kw):
    """The model in BF16 (a student, or anything trained), or for a GPT-OSS teacher MXFP4 when the card can run it."""
    import torch
    fam = family(path)
    if fam == QWEN:
        from transformers import Qwen3_5MoeForConditionalGeneration
        return Qwen3_5MoeForConditionalGeneration.from_pretrained(path, dtype=torch.bfloat16, device_map=dev, **kw)
    from transformers import AutoModelForCausalLM
    cfg = read_config(path)
    if not is_mxfp4(cfg):
        return AutoModelForCausalLM.from_pretrained(path, dtype=torch.bfloat16, device_map=dev, **kw)
    from transformers import Mxfp4Config
    if teacher and not mxfp4_runs(dev):
        print("GPT-OSS teacher: this card or its libraries cannot run MXFP4 (needs Hopper or newer, triton and kernels); "
              "unpacking to BF16 across the card and RAM (slow)", flush=True)
        return AutoModelForCausalLM.from_pretrained(path, dtype=torch.bfloat16, device_map="auto", quantization_config=Mxfp4Config(dequantize=True), **kw)
    if teacher:
        try:  # MXFP4 kept: the 120B fits one 80 GB card this way (about 65 GB)
            m = AutoModelForCausalLM.from_pretrained(path, dtype=torch.bfloat16, device_map=dev, quantization_config=Mxfp4Config(dequantize=False), **kw)
            if not getattr(getattr(m, "config", None), "quantization_config", None) or getattr(m.config.quantization_config, "dequantize", False):
                print("GPT-OSS teacher: the card's kernels could not run MXFP4, so it was unpacked to BF16", flush=True)
            else: print("GPT-OSS teacher: MXFP4 kept (card kernels)", flush=True)
            return m
        except Exception as e:
            print(f"GPT-OSS teacher: MXFP4 not usable here ({str(e)[:120]}); unpacking to BF16 across the card and RAM (slow)", flush=True)
            return AutoModelForCausalLM.from_pretrained(path, dtype=torch.bfloat16, device_map="auto", quantization_config=Mxfp4Config(dequantize=True), **kw)
    print("GPT-OSS: MXFP4 experts unpacked to BF16 for training", flush=True)
    return AutoModelForCausalLM.from_pretrained(path, dtype=torch.bfloat16, device_map=dev, quantization_config=Mxfp4Config(dequantize=True), **kw)


def base(model):
    """The decoder stack: Qwen3.5 MoE nests it under language_model (it is a vision model too)."""
    inner = model.model
    return getattr(inner, "language_model", inner)


def layers(model):
    return base(model).layers


def router(mlp):
    return getattr(mlp, "gate", None) if hasattr(mlp, "gate") else getattr(mlp, "router", None)


def stop_ids(tok):
    names = ("<|im_end|>",) if "<|im_end|>" in tok.get_vocab() else ("<|return|>", "<|call|>", "<|end|>")
    ids = {tok.convert_tokens_to_ids(n) for n in names}
    if isinstance(tok.eos_token_id, int): ids.add(tok.eos_token_id)
    return {i for i in ids if isinstance(i, int) and i >= 0 and i != tok.unk_token_id}


def clean_saved(path):
    cp = os.path.join(path, "config.json")
    cfg = read_config(path)
    if family(cfg) != GPT_OSS or "quantization_config" not in cfg: return False
    cfg.pop("quantization_config", None)
    json.dump(cfg, open(cp, "w"), indent=2)
    print("GPT-OSS: saved as plain BF16 (MXFP4 note removed from config.json)", flush=True)
    return True
