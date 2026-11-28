#!/usr/bin/env python3
"""A small real Qwen3 in Hugging Face form for dry runs without the internet: a byte-level BPE tokenizer and a 2-4
layer Qwen3 trained for a few minutes on a text file (so its weights have structure, unlike a random brain), saved in
BF16 like the real releases. Dims are multiples of 128 so every linear takes the trellis Hadamard sides.

  tiny_hf.py --text wiki.txt --out dir [--layers 2 --hidden 256 --ffn 512 --steps 300]
28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis")."""
import argparse, json, os

import torch


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--text", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--layers", type=int, default=2); ap.add_argument("--hidden", type=int, default=256)
    ap.add_argument("--ffn", type=int, default=512); ap.add_argument("--vocab", type=int, default=1024)
    ap.add_argument("--steps", type=int, default=300); ap.add_argument("--seed", type=int, default=0); a = ap.parse_args()
    from tokenizers import Tokenizer, models, pre_tokenizers, decoders, trainers
    from transformers import PreTrainedTokenizerFast, Qwen3Config, Qwen3ForCausalLM
    torch.manual_seed(a.seed); os.makedirs(a.out, exist_ok=True)
    tok = Tokenizer(models.BPE()); tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False); tok.decoder = decoders.ByteLevel()
    tok.train([a.text], trainers.BpeTrainer(vocab_size=a.vocab - 2, special_tokens=["<|endoftext|>", "<|im_start|>"], initial_alphabet=pre_tokenizers.ByteLevel.alphabet()))
    ft = PreTrainedTokenizerFast(tokenizer_object=tok, eos_token="<|endoftext|>", bos_token="<|endoftext|>", pad_token="<|endoftext|>")
    ft.save_pretrained(a.out)
    cfg = Qwen3Config(vocab_size=a.vocab, hidden_size=a.hidden, intermediate_size=a.ffn, num_hidden_layers=a.layers,
                      num_attention_heads=a.hidden // 64, num_key_value_heads=max(1, a.hidden // 128), head_dim=64,
                      max_position_embeddings=2048, tie_word_embeddings=False, bos_token_id=0, eos_token_id=0)
    m = Qwen3ForCausalLM(cfg)
    ids = torch.tensor(ft(open(a.text, encoding="utf-8").read())["input_ids"])
    opt = torch.optim.AdamW(m.parameters(), lr=3e-3)
    for s in range(a.steps):
        st = torch.randint(0, len(ids) - 257, (16,)); x = torch.stack([ids[i:i + 257] for i in st])
        loss = m(input_ids=x[:, :-1], labels=x[:, :-1]).loss if False else m(input_ids=x, labels=x).loss
        opt.zero_grad(); loss.backward(); opt.step()
        if s % 50 == 0 or s == a.steps - 1: print(f"step {s} loss {loss.item():.3f}", flush=True)
    m.to(torch.bfloat16).save_pretrained(a.out)
    json.dump({"text": a.text, "steps": a.steps, "final_loss": loss.item()}, open(os.path.join(a.out, "tiny_hf.json"), "w"))


if __name__ == "__main__":
    main()
