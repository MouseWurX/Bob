#!/usr/bin/env python3
# Train a tiny Llama on public licence texts (CPU) and save it as an HF folder, for the bits-by-part dry run.
import os, sys, glob, torch, sentencepiece as spm
from transformers import LlamaConfig, LlamaForCausalLM, LlamaTokenizer
out, work = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True); os.makedirs(work, exist_ok=True)
lic = sorted(glob.glob('/usr/share/common-licenses/*'))
evalf = [p for p in lic if os.path.basename(p) in ('GPL-3', 'Apache-2.0')]
trainf = [p for p in lic if p not in evalf and os.path.isfile(p)]
train = '\n'.join(open(p, errors='replace').read() for p in trainf)
evalt = '\n'.join(open(p, errors='replace').read() for p in evalf)
open(os.path.join(work, 'train.txt'), 'w').write(train); open(os.path.join(work, 'eval.txt'), 'w').write(evalt)
spm.SentencePieceTrainer.train(input=os.path.join(work, 'train.txt'), model_prefix=os.path.join(out, 'tokenizer'),
                               vocab_size=2048, model_type='bpe', character_coverage=1.0, bos_id=1, eos_id=2, unk_id=0,
                               pad_id=-1, byte_fallback=True, minloglevel=2)
import json
json.dump({'tokenizer_class':'LlamaTokenizer','bos_token':'<s>','eos_token':'</s>','unk_token':'<unk>','add_bos_token':True,'legacy':False}, open(os.path.join(out,'tokenizer_config.json'),'w'))
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained(out)
tok.save_pretrained(out)
ids = tok(train, add_special_tokens=False)['input_ids']
cfg = LlamaConfig(vocab_size=len(tok), hidden_size=256, intermediate_size=512, num_hidden_layers=4, num_attention_heads=4,
                  num_key_value_heads=2, max_position_embeddings=512, tie_word_embeddings=False, rms_norm_eps=1e-6)
torch.manual_seed(0)
m = LlamaForCausalLM(cfg)
opt = torch.optim.AdamW(m.parameters(), lr=2e-3, weight_decay=0.0)
ctx, bs, steps = 128, 16, int(os.environ.get('STEPS', '500'))
data = torch.tensor(ids)
for s in range(steps):
    ix = torch.randint(0, len(data) - ctx - 1, (bs,))
    x = torch.stack([data[i:i + ctx] for i in ix])
    loss = m(input_ids=x, labels=x).loss
    opt.zero_grad(); loss.backward(); opt.step()
    for g in opt.param_groups: g['lr'] = 2e-3 * min(1.0, (steps - s) / (0.3 * steps))
    if s % 50 == 0 or s == steps - 1: print(f'step {s} loss {loss.item():.3f}', flush=True)
m.save_pretrained(out, safe_serialization=True)
print('saved', out, 'tokens', len(ids))
